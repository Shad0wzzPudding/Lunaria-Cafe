/**
 * Browser-native AI attention tracking using MediaPipe Face Landmarker
 * and TensorFlow.js COCO-SSD for phone detection.
 *
 * Runs entirely in the browser — no Python server needed.
 * Features decoupled inference/rendering loops for high performance,
 * EMA bounding box smoothing, and a native Canvas HUD.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let cocoModel = null;
let videoStream = null;
let videoElement = null;
let canvasElement = null;
let overlayContainer = null;

let renderFrameId = null;
let inferenceTimeoutId = null;

// --- Config ---
const FPS_INFERENCE = 15; // Inference runs at 15 FPS to prevent UI lag
const GAZE_THRESHOLD = 0.55;
const PHONE_CONFIDENCE = 0.55; // Was 0.45, makes detection stricter
const PHONE_CLASS = 'cell phone';
const NO_FACE_GRACE_MS = 3000;
const PHONE_GRACE_MS = 500; // Was 1000
const LANDMARK_MATCH_THRESHOLD = 0.6; // 60% of landmarks must match

// --- State Variables ---
let lastFaceSeenAt = Date.now();
let lastPhoneSeenAt = 0;
let focusScore = 0;
let currentAttentionScore = 85;
const SCORE_GAIN = 0.5;
const SCORE_PENALTY = 1.0;
const SCORE_TICK_MS = 200;
let lastScoreTick = Date.now();

// User facial landmark cache for stricter presence detection
let cachedUserLandmarks = null;
let landmarkCacheTimestamp = 0;
const LANDMARK_CACHE_DURATION_MS = 5000;

// HUD State
let trackerState = {
  isPhoneDetected: false,
  isUserFocused: false,
  warningMessage: '',
  phoneBboxes: [],
  sessionStart: 0,
};

let smoothedBBoxes = []; // For EMA box smoothing

let _onEvent = null;
let _onStatusChange = null;
let _status = 'idle'; // idle | loading | active | error

// --- Utility Functions ---

function setStatus(status, detail = '') {
  _status = status;
  if (_onStatusChange) _onStatusChange({ status, detail });
}

export function getBrowserAIStatus() {
  return _status;
}

export function isBrowserAISupported() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/**
 * Exponential Moving Average for Bounding Boxes
 * Smooths out the jitter common in COCO-SSD
 */
function smoothBoxes(newBoxes, alpha = 0.4) {
  if (smoothedBBoxes.length !== newBoxes.length) {
    smoothedBBoxes = newBoxes; // Hard reset if object count changes
    return newBoxes;
  }
  for (let i = 0; i < newBoxes.length; i++) {
    smoothedBBoxes[i] = {
      x1: smoothedBBoxes[i].x1 * (1 - alpha) + newBoxes[i].x1 * alpha,
      y1: smoothedBBoxes[i].y1 * (1 - alpha) + newBoxes[i].y1 * alpha,
      w: smoothedBBoxes[i].w * (1 - alpha) + newBoxes[i].w * alpha,
      h: smoothedBBoxes[i].h * (1 - alpha) + newBoxes[i].h * alpha,
      conf: newBoxes[i].conf
    };
  }
  return smoothedBBoxes;
}

// --- Model Loading ---

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
  await import('@tensorflow/tfjs-backend-webgl'); // Force WebGL for speed
  const tf = await import('@tensorflow/tfjs-core');
  await tf.setBackend('webgl');
  cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  return cocoModel;
}

async function getWebcamStream() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

// --- Detection Logic ---

function checkGazeFocused(blendshapes) {
  if (!blendshapes || blendshapes.length === 0) return true;
  const categories = blendshapes[0].categories;
  const gazeKeys = ['eyeLookInLeft', 'eyeLookOutRight', 'eyeLookOutLeft', 'eyeLookInRight'];
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
      phones.push({ x1, y1, w, h, conf: pred.score });
    }
  }
  return phones;
}

function cacheUserLandmarks(landmarks) {
  if (!landmarks || landmarks.length === 0) return;
  const keyLandmarks = [];
  for (const landmark of landmarks) {
    keyLandmarks.push({ x: landmark.x, y: landmark.y, z: landmark.z });
  }
  cachedUserLandmarks = keyLandmarks;
  landmarkCacheTimestamp = Date.now();
}

function verifyUserPresence(currentLandmarks) {
  if (!currentLandmarks || currentLandmarks.length === 0) return false;
  if (!cachedUserLandmarks || Date.now() - landmarkCacheTimestamp > LANDMARK_CACHE_DURATION_MS) {
    cacheUserLandmarks(currentLandmarks);
    return true;
  }
  let matchCount = 0;
  const totalLandmarks = Math.min(currentLandmarks.length, cachedUserLandmarks.length);
  for (let i = 0; i < totalLandmarks; i++) {
    const current = currentLandmarks[i];
    const cached = cachedUserLandmarks[i];
    const distance = Math.sqrt(
      Math.pow(current.x - cached.x, 2) + Math.pow(current.y - cached.y, 2) + Math.pow(current.z - cached.z, 2)
    );
    if (distance < 0.1) matchCount++;
  }
  return (matchCount / totalLandmarks) >= LANDMARK_MATCH_THRESHOLD;
}

function processDetections(faceResult, phonePredictions) {
  const now = Date.now();

  const hasFace = faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0;
  const isGazeFocused = hasFace ? checkGazeFocused(faceResult.faceBlendshapes) : true;
  
  // Phone detection with temporal debounce
  const rawPhones = detectPhones(phonePredictions);
  if (rawPhones.length > 0) {
    lastPhoneSeenAt = now;
    trackerState.isPhoneDetected = true;
  } else if (now - lastPhoneSeenAt > PHONE_GRACE_MS) {
    trackerState.isPhoneDetected = false;
  }
  
  trackerState.phoneBboxes = smoothBoxes(rawPhones, 0.4);
  const isVerifiedUser = hasFace ? verifyUserPresence(faceResult.faceLandmarks[0]) : false;

  if (isVerifiedUser) lastFaceSeenAt = now;

  const faceAbsentMs = now - lastFaceSeenAt;
  const noFaceWarning = !isVerifiedUser && faceAbsentMs >= NO_FACE_GRACE_MS;

  if (trackerState.isPhoneDetected) {
    trackerState.isUserFocused = false;
    trackerState.warningMessage = '⚠ DISTRACTION DETECTED - PUT YOUR PHONE AWAY!';
  } else if (!isGazeFocused && isVerifiedUser) {
    trackerState.isUserFocused = false;
    trackerState.warningMessage = '👀 GAZE DISTRACTED - LOOK AT THE SCREEN!';
  } else if (noFaceWarning) {
    trackerState.isUserFocused = false;
    trackerState.warningMessage = '👀 USER NOT FOCUSED - COME BACK!';
  } else {
    trackerState.isUserFocused = isVerifiedUser;
    trackerState.warningMessage = '';
  }

  // Gamification Scoring
  if (now - lastScoreTick >= SCORE_TICK_MS) {
    lastScoreTick = now;
    if (trackerState.isUserFocused) {
      focusScore = Math.min(focusScore + SCORE_GAIN, 9999);
    } else if (trackerState.isPhoneDetected || !isGazeFocused) {
      focusScore = Math.max(focusScore - SCORE_PENALTY, 0);
    }
  }

  // Visual attention score smoothing (0-100)
  let targetScore = 85;
  if (trackerState.isPhoneDetected) {
    targetScore = 22;
  } else if (!hasFace && noFaceWarning) {
    targetScore = 38;
  } else if (!isGazeFocused) {
    targetScore = 52;
  } else if (trackerState.isUserFocused) {
    const bonus = Math.min(30, Math.log1p(focusScore) * 4);
    targetScore = Math.min(100, 70 + bonus);
  }

  const scoreDiff = targetScore - currentAttentionScore;
  const maxChange = 2.0; 
  if (Math.abs(scoreDiff) <= maxChange) {
    currentAttentionScore = targetScore;
  } else {
    currentAttentionScore += Math.sign(scoreDiff) * maxChange;
  }
  currentAttentionScore = Math.max(0, Math.min(100, currentAttentionScore));

  return {
    phone_detected: trackerState.isPhoneDetected,
    attention_score: Math.round(currentAttentionScore),
    user_present: isVerifiedUser,
    timestamp: now,
    warning_message: trackerState.warningMessage,
    tracker_score: focusScore,
    source: 'browser',
  };
}

// --- Background Inference Loop (15 FPS) ---
async function runInference() {
  if (_status !== 'active' || !videoElement || videoElement.readyState < 2) {
    inferenceTimeoutId = setTimeout(runInference, 100);
    return;
  }

  try {
    const now = performance.now();
    const faceResult = faceLandmarker.detectForVideo(videoElement, now);

    let phonePredictions = [];
    if (cocoModel) {
      try {
        phonePredictions = await cocoModel.detect(videoElement);
      } catch {
        // Silently continue if phone detection fails for one frame
      }
    }

    const event = processDetections(faceResult, phonePredictions);
    if (_onEvent) _onEvent(event);
  } catch (err) {
    console.warn('[BrowserAI] Inference error:', err.message);
  }

  // Throttle AI loop safely
  inferenceTimeoutId = setTimeout(runInference, 1000 / FPS_INFERENCE);
}

// --- 60 FPS Render Loop & HUD ---
function drawTextWithBg(ctx, text, x, y, bgRgba, textRgba, fontSize = 18) {
  ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width;
  const h = fontSize;
  ctx.fillStyle = bgRgba;
  ctx.fillRect(x - 8, y - h - 8, w + 16, h + 16);
  ctx.fillStyle = textRgba;
  ctx.fillText(text, x, y);
}

function renderLoop() {
  if (_status !== 'active' || !canvasElement || !videoElement) return;

  const ctx = canvasElement.getContext('2d');
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (canvasElement.width !== width) {
    canvasElement.width = width;
    canvasElement.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  // 1. Focus Score HUD
  drawTextWithBg(ctx, `Focus Score: ${Math.round(focusScore)}`, 20, 40, 'rgba(20,20,20,0.85)', '#fff');
  
  // 2. Session Timer HUD
  const sessionSeconds = Math.floor((Date.now() - trackerState.sessionStart) / 1000);
  const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
  const secs = String(sessionSeconds % 60).padStart(2, '0');
  drawTextWithBg(ctx, `Session: ${mins}:${secs}`, 20, 80, 'rgba(20,20,20,0.85)', '#fff');

  // 3. Status Badge HUD
  let badgeText, badgeColor;
  if (trackerState.isUserFocused) {
    badgeText = " FOCUSED ";
    badgeColor = 'rgba(34, 139, 34, 0.9)'; // Green
  } else if (trackerState.isPhoneDetected) {
    badgeText = " DISTRACTED ";
    badgeColor = 'rgba(200, 0, 0, 0.9)'; // Red
  } else {
    badgeText = " NOT FOCUSED ";
    badgeColor = 'rgba(0, 140, 255, 0.9)'; // Orange/Blue
  }
  ctx.font = `bold 18px "Segoe UI", sans-serif`;
  const badgeWidth = ctx.measureText(badgeText).width;
  drawTextWithBg(ctx, badgeText, width - badgeWidth - 30, 40, badgeColor, '#fff');

  // 4. Warning Banner
  if (trackerState.warningMessage) {
    ctx.font = `bold 26px "Segoe UI", sans-serif`;
    const warnWidth = ctx.measureText(trackerState.warningMessage).width;
    const cx = (width - warnWidth) / 2;
    const cy = height / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, cy - 40, width, 60);
    ctx.fillStyle = 'rgb(255, 60, 60)';
    ctx.fillText(trackerState.warningMessage, cx, cy);
  }

  // 5. Bounding Boxes
  trackerState.phoneBboxes.forEach(box => {
    ctx.strokeStyle = 'rgb(255, 0, 0)';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x1, box.y1, box.w, box.h);
    drawTextWithBg(ctx, `Phone ${Math.round(box.conf * 100)}%`, box.x1, box.y1 - 10, 'rgba(200,0,0,0.85)', '#fff', 14);
  });

  renderFrameId = requestAnimationFrame(renderLoop);
}

// --- Lifecycle Exports ---

export async function startBrowserAI({ onEvent, onStatusChange, video } = {}) {
  _onEvent = onEvent;
  _onStatusChange = onStatusChange;

  if (_status === 'loading' || _status === 'active') return overlayContainer || videoElement;

  setStatus('loading', 'Waking up neural engines...');

  try {
    const [, , stream] = await Promise.all([
      loadFaceLandmarker(),
      loadCocoSSD().catch((err) => {
        console.warn('[BrowserAI] COCO-SSD failed to load:', err.message);
        return null;
      }),
      getWebcamStream(),
    ]);

    videoStream = stream;

    // Build the DOM Overlay Container
    overlayContainer = document.createElement('div');
    overlayContainer.style.position = 'relative';
    overlayContainer.style.display = 'inline-block';
    overlayContainer.style.width = '100%';
    overlayContainer.style.maxWidth = '1280px';
    overlayContainer.style.borderRadius = '12px';
    overlayContainer.style.overflow = 'hidden';
    overlayContainer.style.backgroundColor = '#000';

    if (video) {
      videoElement = video;
    } else {
      videoElement = document.createElement('video');
    }
    
    videoElement.srcObject = stream;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('autoplay', '');
    videoElement.muted = true;
    videoElement.style.transform = 'scaleX(-1)'; // Mirror for natural feel
    videoElement.style.width = '100%';
    videoElement.style.display = 'block';

    canvasElement = document.createElement('canvas');
    canvasElement.style.position = 'absolute';
    canvasElement.style.top = '0';
    canvasElement.style.left = '0';
    canvasElement.style.width = '100%';
    canvasElement.style.height = '100%';
    canvasElement.style.transform = 'scaleX(-1)'; // Match video mirror

    overlayContainer.appendChild(videoElement);
    overlayContainer.appendChild(canvasElement);

    await videoElement.play();

    // Reset State
    focusScore = 0;
    currentAttentionScore = 85;
    lastFaceSeenAt = Date.now();
    lastPhoneSeenAt = 0;
    lastScoreTick = Date.now();
    trackerState.sessionStart = Date.now();
    smoothedBBoxes = [];

    setStatus('active', 'Browser AI running smoothly');
    
    // Start Dual Loops
    runInference();
    renderLoop();

    return overlayContainer;

  } catch (err) {
    const detail =
      err.name === 'NotAllowedError' ? 'Camera permission denied'
      : err.name === 'NotFoundError' ? 'No camera found'
      : err.message;
    setStatus('error', detail);
    throw err;
  }
}

export function stopBrowserAI() {
  if (inferenceTimeoutId) {
    clearTimeout(inferenceTimeoutId);
    inferenceTimeoutId = null;
  }
  if (renderFrameId) {
    cancelAnimationFrame(renderFrameId);
    renderFrameId = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop());
    videoStream = null;
  }
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }
  if (overlayContainer && overlayContainer.parentNode) {
    overlayContainer.parentNode.removeChild(overlayContainer);
  }
  overlayContainer = null;
  canvasElement = null;

  _onEvent = null;
  focusScore = 0;
  currentAttentionScore = 85;
  cachedUserLandmarks = null;
  landmarkCacheTimestamp = 0;
  setStatus('idle');
}
