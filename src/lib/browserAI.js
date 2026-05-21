/**
 * Browser-native AI attention tracking using MediaPipe Face Landmarker
 * and TensorFlow.js COCO-SSD for phone detection.
 *
 * Runs entirely in the browser — no Python server needed.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let cocoModel = null;
let videoStream = null;
let videoElement = null;
let animFrameId = null;
let lastProcessTime = 0;

const PROCESS_INTERVAL_MS = 800; // Increased from 500ms to reduce CPU load
const GAZE_THRESHOLD = 0.55;
const PHONE_CONFIDENCE = 0.45;
const PHONE_CLASS = 'cell phone';
const NO_FACE_GRACE_MS = 3000;

let lastFaceSeenAt = Date.now();
let focusScore = 0;
let currentAttentionScore = 85;
const SCORE_GAIN = 0.5;
const SCORE_PENALTY = 1.0;
const SCORE_TICK_MS = 200;
let lastScoreTick = Date.now();

let _onEvent = null;
let _onStatusChange = null;
let _status = 'idle'; // idle | loading | active | error

function setStatus(status, detail = '') {
  _status = status;
  if (_onStatusChange) _onStatusChange({ status, detail });
}

export function getBrowserAIStatus() {
  return _status;
}

async function loadFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    numFaces: 1,
  });

  return faceLandmarker;
}

async function loadCocoSSD() {
  if (cocoModel) return cocoModel;

  const cocoSsd = await import('@tensorflow-models/coco-ssd');
  await import('@tensorflow/tfjs');
  cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

  return cocoModel;
}

async function getWebcamStream() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
    audio: false,
  });
}

function checkGazeFocused(blendshapes) {
  if (!blendshapes || blendshapes.length === 0) return true;

  const categories = blendshapes[0].categories;
  const gazeKeys = [
    'eyeLookInLeft',
    'eyeLookOutRight',
    'eyeLookOutLeft',
    'eyeLookInRight',
  ];

  for (const cat of categories) {
    if (gazeKeys.includes(cat.categoryName) && cat.score > GAZE_THRESHOLD) {
      return false;
    }
  }
  return true;
}

function detectPhones(predictions) {
  const phones = [];
  for (const pred of predictions) {
    if (pred.class === PHONE_CLASS && pred.score >= PHONE_CONFIDENCE) {
      const [x1, y1, w, h] = pred.bbox;
      phones.push({
        x1,
        y1,
        x2: x1 + w,
        y2: y1 + h,
        conf: pred.score,
      });
    }
  }
  return phones;
}

function processDetections(faceResult, phonePredictions) {
  const now = Date.now();

  const hasFace = faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0;
  const isGazeFocused = hasFace ? checkGazeFocused(faceResult.faceBlendshapes) : true;
  const phoneBboxes = detectPhones(phonePredictions);
  const isPhoneDetected = phoneBboxes.length > 0;

  if (hasFace) lastFaceSeenAt = now;

  const faceAbsentMs = now - lastFaceSeenAt;
  const noFaceWarning = !hasFace && faceAbsentMs >= NO_FACE_GRACE_MS;

  let isUserFocused;
  let warningMessage;

  if (isPhoneDetected) {
    isUserFocused = false;
    warningMessage = 'DISTRACTION DETECTED - PUT YOUR PHONE AWAY!';
  } else if (!isGazeFocused && hasFace) {
    isUserFocused = false;
    warningMessage = 'GAZE DISTRACTED - LOOK AT THE SCREEN!';
  } else if (noFaceWarning) {
    isUserFocused = false;
    warningMessage = 'USER NOT FOCUSED - COME BACK!';
  } else {
    isUserFocused = hasFace;
    warningMessage = '';
  }

  if (now - lastScoreTick >= SCORE_TICK_MS) {
    lastScoreTick = now;
    if (isUserFocused) {
      focusScore = Math.min(focusScore + SCORE_GAIN, 9999);
    } else if (isPhoneDetected || !isGazeFocused) {
      focusScore = Math.max(focusScore - SCORE_PENALTY, 0);
    }
  }

  // Gradual score changes instead of preset patterns
  let targetScore = 85;
  if (isPhoneDetected) {
    targetScore = 22;
  } else if (!hasFace && noFaceWarning) {
    targetScore = 38;
  } else if (!isGazeFocused) {
    targetScore = 52;
  } else if (isUserFocused) {
    const bonus = Math.min(30, Math.log1p(focusScore) * 4);
    targetScore = Math.min(100, 70 + bonus);
  }

  // Gradually move current score toward target
  const scoreDiff = targetScore - currentAttentionScore;
  const maxChange = 2.0; // Maximum change per tick
  if (Math.abs(scoreDiff) <= maxChange) {
    currentAttentionScore = targetScore;
  } else {
    currentAttentionScore += Math.sign(scoreDiff) * maxChange;
  }
  currentAttentionScore = Math.max(0, Math.min(100, currentAttentionScore));

  return {
    phone_detected: isPhoneDetected,
    attention_score: Math.round(currentAttentionScore),
    user_present: hasFace,
    timestamp: now,
    warning_message: warningMessage,
    tracker_score: focusScore,
    source: 'browser',
  };
}

async function processFrame() {
  if (!videoElement || videoElement.readyState < 2) return;

  const now = performance.now();
  if (now - lastProcessTime < PROCESS_INTERVAL_MS) {
    animFrameId = requestAnimationFrame(processFrame);
    return;
  }
  lastProcessTime = now;

  try {
    const faceResult = faceLandmarker.detectForVideo(videoElement, now);

    let phonePredictions = [];
    if (cocoModel) {
      try {
        phonePredictions = await cocoModel.detect(videoElement);
      } catch {
        // phone detection is optional — silently continue
      }
    }

    const event = processDetections(faceResult, phonePredictions);
    if (_onEvent) _onEvent(event);
  } catch (err) {
    console.warn('[BrowserAI] Frame processing error:', err.message);
  }

  animFrameId = requestAnimationFrame(processFrame);
}

/**
 * Start browser-native AI tracking.
 * @param {Object} opts
 * @param {Function} opts.onEvent — called with attention event objects
 * @param {Function} opts.onStatusChange — called with { status, detail }
 * @param {HTMLVideoElement} [opts.video] — optional video element to reuse
 * @returns {Promise<HTMLVideoElement>} the video element being used
 */
export async function startBrowserAI({ onEvent, onStatusChange, video } = {}) {
  _onEvent = onEvent;
  _onStatusChange = onStatusChange;

  if (animFrameId) {
    return videoElement;
  }

  setStatus('loading', 'Loading AI models...');

  try {
    const [, , stream] = await Promise.all([
      loadFaceLandmarker(),
      loadCocoSSD().catch((err) => {
        console.warn('[BrowserAI] COCO-SSD failed to load, phone detection disabled:', err.message);
        return null;
      }),
      getWebcamStream(),
    ]);

    videoStream = stream;

    if (video) {
      videoElement = video;
    } else {
      videoElement = document.createElement('video');
    }
    videoElement.srcObject = stream;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('autoplay', '');
    videoElement.muted = true;
    await videoElement.play();

    focusScore = 0;
    lastFaceSeenAt = Date.now();
    lastScoreTick = Date.now();
    lastProcessTime = 0;

    setStatus('active', 'Browser AI running');
    animFrameId = requestAnimationFrame(processFrame);

    return videoElement;
  } catch (err) {
    const detail =
      err.name === 'NotAllowedError'
        ? 'Camera permission denied'
        : err.name === 'NotFoundError'
          ? 'No camera found'
          : err.message;
    setStatus('error', detail);
    throw err;
  }
}

export function stopBrowserAI() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop());
    videoStream = null;
  }

  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }

  _onEvent = null;
  focusScore = 0;
  currentAttentionScore = 85;
  setStatus('idle');
}

export function isBrowserAISupported() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}
