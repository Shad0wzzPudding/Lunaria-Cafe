/**
 * Browser-native AI attention tracking using MediaPipe Face Landmarker
 * and TensorFlow.js COCO-SSD for phone detection.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let cocoModel = null;
let videoStream = null;
let videoElement = null;
let canvasElement = null; // Added for drawing
let animFrameId = null;
let renderFrameId = null; // Added for drawing loop
let lastProcessTime = 0;

const PROCESS_INTERVAL_MS = 800;
const GAZE_THRESHOLD = 0.55;
const PHONE_CONFIDENCE = 0.45;
const PHONE_CLASS = 'cell phone';
const NO_FACE_GRACE_MS = 3000;
const LANDMARK_MATCH_THRESHOLD = 0.6;

let lastFaceSeenAt = Date.now();
let focusScore = 0;
let currentAttentionScore = 85;
const SCORE_GAIN = 0.5;
const SCORE_PENALTY = 1.0;
const SCORE_TICK_MS = 200;
let lastScoreTick = Date.now();

let cachedUserLandmarks = null;
let landmarkCacheTimestamp = 0;
const LANDMARK_CACHE_DURATION_MS = 5000;

// Added states to pass data to the Canvas Renderer
let latestPhones = [];
let latestWarning = '';
let isUserFocusedGlobal = true;

let _onEvent = null;
let _onStatusChange = null;
let _status = 'idle';

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
      phones.push({ x1, y1, x2: x1 + w, y2: y1 + h, w, h, conf: pred.score });
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
  const matchRatio = matchCount / totalLandmarks;
  return matchRatio >= LANDMARK_MATCH_THRESHOLD;
}

function processDetections(faceResult, phonePredictions) {
  const now = Date.now();

  const hasFace = faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0;
  const isGazeFocused = hasFace ? checkGazeFocused(faceResult.faceBlendshapes) : true;
  const phoneBboxes = detectPhones(phonePredictions);
  const isPhoneDetected = phoneBboxes.length > 0;

  // Save for Canvas Rendering
  latestPhones = phoneBboxes;

  const isVerifiedUser = hasFace ? verifyUserPresence(faceResult.faceLandmarks[0]) : false;
  if (isVerifiedUser) lastFaceSeenAt = now;

  const faceAbsentMs = now - lastFaceSeenAt;
  const noFaceWarning = !isVerifiedUser && faceAbsentMs >= NO_FACE_GRACE_MS;

  let isUserFocused;
  let warningMessage;

  if (isPhoneDetected) {
    isUserFocused = false;
    warningMessage = 'DISTRACTION DETECTED - PUT YOUR PHONE AWAY!';
  } else if (!isGazeFocused && isVerifiedUser) {
    isUserFocused = false;
    warningMessage = 'GAZE DISTRACTED - LOOK AT THE SCREEN!';
  } else if (noFaceWarning) {
    isUserFocused = false;
    warningMessage = 'USER NOT FOCUSED - COME BACK!';
  } else {
    isUserFocused = isVerifiedUser;
    warningMessage = '';
  }

  // Save for Canvas Rendering
  latestWarning = warningMessage;
  isUserFocusedGlobal = isUserFocused;

  if (now - lastScoreTick >= SCORE_TICK_MS) {
    lastScoreTick = now;
    if (isUserFocused) {
      focusScore = Math.min(focusScore + SCORE_GAIN, 9999);
    } else if (isPhoneDetected || !isGazeFocused) {
      focusScore = Math.max(focusScore - SCORE_PENALTY, 0);
    }
  }

  let targetScore = 85;
  if (isPhoneDetected) targetScore = 22;
  else if (!hasFace && noFaceWarning) targetScore = 38;
  else if (!isGazeFocused) targetScore = 52;
  else if (isUserFocused) {
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
    phone_detected: isPhoneDetected,
    attention_score: Math.round(currentAttentionScore),
    user_present: isVerifiedUser,
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
      } catch {}
    }

    const event = processDetections(faceResult, phonePredictions);
    if (_onEvent) _onEvent(event);
  } catch (err) {
    console.warn('[BrowserAI] Frame processing error:', err.message);
  }

  animFrameId = requestAnimationFrame(processFrame);
}

// ---------------------------------------------------------------------
// CANVAS DRAWING LOGIC (Adds the YOLO visuals)
// ---------------------------------------------------------------------
function drawTextWithBg(ctx, text, x, y, bgRgba, textRgba, fontSize = 14) {
  ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width;
  const h = fontSize;
  ctx.fillStyle = bgRgba;
  ctx.fillRect(x - 4, y - h - 4, w + 8, h + 8);
  ctx.fillStyle = textRgba;
  ctx.fillText(text, x, y);
}

function renderLoop() {
  if (_status !== 'active' || !canvasElement || !videoElement) return;

  const ctx = canvasElement.getContext('2d');
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  // Keep canvas exactly the same size as the video
  if (canvasElement.width !== width) {
    canvasElement.width = width;
    canvasElement.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  // 1. Draw Focus Score
  drawTextWithBg(ctx, `Focus Score: ${Math.round(focusScore)}`, 10, 25, 'rgba(20,20,20,0.85)', '#fff');

  // 2. Draw Status Badge
  let badgeText, badgeColor;
  if (isUserFocusedGlobal) {
    badgeText = " FOCUSED ";
    badgeColor = 'rgba(34, 139, 34, 0.9)';
  } else if (latestPhones.length > 0) {
    badgeText = " DISTRACTED ";
    badgeColor = 'rgba(200, 0, 0, 0.9)';
  } else {
    badgeText = " NOT FOCUSED ";
    badgeColor = 'rgba(0, 140, 255, 0.9)';
  }
  ctx.font = `bold 14px "Segoe UI", sans-serif`;
  const badgeWidth = ctx.measureText(badgeText).width;
  drawTextWithBg(ctx, badgeText, width - badgeWidth - 20, 25, badgeColor, '#fff');

  // 3. Draw Bounding Boxes (Red boxes around phone)
  latestPhones.forEach(box => {
    ctx.strokeStyle = 'rgb(255, 0, 0)';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x1, box.y1, box.w, box.h);
    drawTextWithBg(ctx, `Phone ${Math.round(box.conf * 100)}%`, box.x1, box.y1 - 10, 'rgba(200,0,0,0.85)', '#fff', 12);
  });

  // 4. Draw Warning Banner
  if (latestWarning) {
    ctx.font = `bold 16px "Segoe UI", sans-serif`;
    const warnWidth = ctx.measureText(latestWarning).width;
    const cx = (width - warnWidth) / 2;
    const cy = height / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, cy - 25, width, 40);
    ctx.fillStyle = 'rgb(255, 60, 60)';
    ctx.fillText(latestWarning, cx, cy);
  }

  renderFrameId = requestAnimationFrame(renderLoop);
}
// ---------------------------------------------------------------------

export async function startBrowserAI({ onEvent, onStatusChange, video } = {}) {
  _onEvent = onEvent;
  _onStatusChange = onStatusChange;

  if (animFrameId) return videoElement;

  setStatus('loading', 'Loading AI models...');

  try {
    const [, , stream] = await Promise.all([
      loadFaceLandmarker(),
      loadCocoSSD().catch((err) => null),
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

    // Setup Canvas Overlay inside the React DOM
    if (!canvasElement && videoElement.parentElement) {
      videoElement.parentElement.style.position = 'relative'; // Ensure parent can hold absolute canvas
      canvasElement = document.createElement('canvas');
      canvasElement.style.position = 'absolute';
      canvasElement.style.top = '0';
      canvasElement.style.left = '0';
      canvasElement.style.width = '100%';
      canvasElement.style.height = '100%';
      canvasElement.style.pointerEvents = 'none'; // So you can still click the video if needed
      videoElement.parentElement.appendChild(canvasElement);
    }

    focusScore = 0;
    lastFaceSeenAt = Date.now();
    lastScoreTick = Date.now();
    lastProcessTime = 0;

    setStatus('active', 'Browser AI running');
    
    animFrameId = requestAnimationFrame(processFrame);
    renderFrameId = requestAnimationFrame(renderLoop); // Start drawing!

    return videoElement;
  } catch (err) {
    setStatus('error', err.message);
    throw err;
  }
}

export function stopBrowserAI() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (renderFrameId) {
    cancelAnimationFrame(renderFrameId);
    renderFrameId = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop());
    videoStream = null;
  }
  if (canvasElement && canvasElement.parentNode) {
    canvasElement.parentNode.removeChild(canvasElement);
    canvasElement = null;
  }
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }

  _onEvent = null;
  focusScore = 0;
  currentAttentionScore = 85;
  cachedUserLandmarks = null;
  landmarkCacheTimestamp = 0;
  setStatus('idle');
}

export function isBrowserAISupported() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}
