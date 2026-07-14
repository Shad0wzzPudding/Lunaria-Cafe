/**
 * Browser-native AI attention tracking using MediaPipe Face Landmarker
 * and YOLO26 ONNX (via Web Worker) for phone detection.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let videoStream = null;
let videoElement = null;
let animFrameId = null;
let renderFrameId = null;
let visibilityIntervalId = null;
let lastProcessTime = 0;

// Worker variables
let yoloWorker = null;
let isYoloReady = false;
let isProcessingYolo = false;
let workerCanvasCtx = null;
// Set when the worker fails to load the ONNX model. Phone detection is then
// dead for the whole session while face/gaze tracking carries on perfectly —
// the exact failure that hid a missing model file for two commits, because the
// session still reported 'active' and the overlay still said FOCUSED. Kept
// SEPARATE from _status on purpose: _status !== 'active' halts the render loop
// and the visibility handler, so flipping it to 'error' here would blank the
// overlay instead of warning on it.
let yoloError = null;

const PROCESS_INTERVAL_MS = 800;
const GAZE_THRESHOLD = 0.55;
const NO_FACE_GRACE_MS = 3000;

let lastFaceSeenAt = Date.now();
let focusScore = 0;
const ATTN_START = 70;
let currentAttentionScore = ATTN_START;
// While frozen (game paused) detection keeps running — camera and models
// stay warm for an instant resume — but the score accumulators hold still.
let scoreFrozen = false;
const SCORE_GAIN = 0.5;
const SCORE_PENALTY = 1.0;
const SCORE_TICK_MS = 200;
// Per-200ms-tick attention rates. Drops are gentle; the gain slows sharply as
// the score nears 100 so a perfect 100 takes ~5 min of unbroken focus.
const ATTN_DROP_PHONE  = 0.4;
const ATTN_DROP_NOFACE = 0.25;
const ATTN_DROP_GAZE   = 0.12;
const ATTN_BASE_GAIN   = 0.18;
let lastScoreTick = Date.now();

export function setBrowserAIScoreFrozen(frozen) {
  scoreFrozen = frozen;
  // Skip the elapsed-pause window on unfreeze so the next score tick
  // doesn't apply a burst of accumulated time.
  if (!frozen) lastScoreTick = Date.now();
}

let latestPhones = []; // รับข้อมูลจาก Worker
let latestWarning = '';
let isUserFocusedGlobal = true;

// A confirmed phone drops the focus score and starts the shared 30s danger
// clock, so one noisy frame must not be able to trigger it: the phone has to be
// seen in PHONE_CONFIRM_FRAMES detections in a row, and once counted it survives
// PHONE_RELEASE_FRAMES misses before it clears (so a single dropped detection
// mid-scroll doesn't flicker the penalty off and on).
//
// Counted in FRAMES, not milliseconds. Detections only arrive every
// PROCESS_INTERVAL_MS (800ms), and every 2000ms while the tab is hidden, so any
// wall-clock window below that is either meaningless or silently means something
// different in the two modes — an earlier ms-based version of this had a 700ms
// release that could never survive a single 800ms frame gap.
//
// Note this only defends against FLICKER. A false positive that sits still in
// frame (headphones on the desk) is caught in yoloWorker, not here: YOLO26
// decides the winning class itself, so a box the model calls `headphones` never
// reaches us as a phone, and CONF_THRESHOLD screens what is left.
const PHONE_CONFIRM_FRAMES = 2;
const PHONE_RELEASE_FRAMES = 2;
// Streaks only advance on fresh results, so if results stop arriving entirely
// (stalled inference, a wedged worker) a confirmed phone would otherwise never
// clear: the score keeps draining and the 30s danger clock runs the session to
// failure with no way out. Detections normally arrive every 800ms (2000ms when
// hidden), so silence this long means the pipeline is broken, not that the user
// is still holding a phone — give them the benefit of the doubt.
const PHONE_STALE_MS = 5000;
// Detections are only fresh when the worker replies; the loop re-reads the same
// latestPhones buffer in between. Counting those repeats would let ONE inference
// confirm a phone all by itself, so the streaks only advance on a new result.
let phoneResultSeq = 0;    // bumped by the worker's onmessage
let phoneSeenSeq = -1;     // last result this state machine consumed
let phoneLastResultAt = 0; // when that result arrived
let phoneHitStreak = 0;
let phoneMissStreak = 0;
let phoneConfirmed = false;

function confirmPhone(rawHit, now) {
  // Nothing new to judge — the loop is re-reading the same latestPhones buffer.
  if (phoneSeenSeq === phoneResultSeq) {
    if (phoneConfirmed && phoneLastResultAt && now - phoneLastResultAt > PHONE_STALE_MS) {
      phoneHitStreak = 0;
      phoneMissStreak = 0;
      phoneConfirmed = false;
    }
    return phoneConfirmed;
  }
  phoneSeenSeq = phoneResultSeq;

  if (rawHit) {
    phoneMissStreak = 0;
    phoneHitStreak += 1;
    if (phoneHitStreak >= PHONE_CONFIRM_FRAMES) phoneConfirmed = true;
  } else {
    phoneHitStreak = 0;
    phoneMissStreak += 1;
    if (phoneMissStreak >= PHONE_RELEASE_FRAMES) phoneConfirmed = false;
  }
  return phoneConfirmed;
}

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

// โหลด MediaPipe
async function loadFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  // Pin to the installed package version — @latest can drift out of sync with
  // the JS API and break the landmarker in production.
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
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

function reportYoloError(message) {
  yoloError = message || 'unknown error';
  console.error('[BrowserAI] Phone detection unavailable:', yoloError);
  // 'degraded', not 'error': the session is still usefully running, so don't
  // tear it down — just make sure the failure is impossible to miss (settings
  // shows the detail, renderLoop paints a banner on the camera).
  if (_onStatusChange) {
    _onStatusChange({ status: 'degraded', detail: `Phone detection offline — ${yoloError}` });
  }
}

function initYoloWorker() {
  if (yoloWorker) return; // guard against creating overlapping workers
  yoloWorker = new Worker(new URL('./yoloWorker.js', import.meta.url), { type: 'module' });
  isProcessingYolo = false; // fresh worker — nothing in flight yet

  // A worker that fails to load or throws at top level never sends a single
  // message, so the onmessage handler below could not report it: without this,
  // that failure mode is still completely silent.
  yoloWorker.onerror = (err) => reportYoloError(err.message || 'worker failed to load');

  yoloWorker.onmessage = (e) => {
    if (e.data.type === 'status' && e.data.status === 'ready') {
      isYoloReady = true;
      yoloError = null;
    }
    if (e.data.type === 'status' && e.data.status === 'error') {
      // Deliberately does NOT clear isYoloReady. If the model failed to load it
      // was never set; if inference failed mid-session, clearing it would stop
      // us ever sending another frame — turning one bad frame into a permanently
      // dead detector. Keep feeding the worker; it recovers if the fault passes.
      reportYoloError(e.data.error);
    }
    if (e.data.type === 'result') {
      latestPhones = e.data.phones;
      phoneResultSeq += 1; // a genuinely new detection for confirmPhone to judge
      phoneLastResultAt = Date.now();
      isProcessingYolo = false; // reply received — send the next frame
    }
  };

  yoloWorker.postMessage({ type: 'init' });
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

// Presence is exactly "MediaPipe found a face this frame".
//
// This used to compare the current landmarks against a snapshot of the player
// taken up to 5s earlier and call them ABSENT if 40% of the points had moved —
// which is motion detection wearing a presence detector's name. It could never
// have verified identity (there is no enrolment step; the snapshot was simply
// re-taken from whoever was in frame every 5s), and it punished the player for
// moving: lean back, turn your head or stretch, and you were marked absent
// while sitting right there, which after the 3s grace window fired a false
// "USER NOT FOCUSED - COME BACK!" and drained the attention score. It then
// healed itself on the next cache refresh, so it surfaced as random unfair
// penalties nobody could reproduce rather than as an obvious failure.
function isUserPresent(faceResult) {
  return !!(faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0);
}

function processDetections(faceResult, phones) {
  const now = Date.now();
  const isPhoneDetected = confirmPhone(phones.length > 0, now);

  const hasFace = isUserPresent(faceResult);
  const isGazeFocused = hasFace ? checkGazeFocused(faceResult.faceBlendshapes) : true;

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

  latestWarning = warningMessage;
  isUserFocusedGlobal = isUserFocused;

  if (!scoreFrozen) {
    // Both scores advance on the same fixed 200ms tick so the rate is consistent
    // regardless of the (variable) inference frame rate. `ticks` catches up on
    // elapsed real time — capped so a long hidden gap can't dump a huge drop —
    // making the decay per-second rather than per-frame.
    const ticks = Math.min(Math.floor((now - lastScoreTick) / SCORE_TICK_MS), 15);
    if (ticks > 0) {
      lastScoreTick = now;

      if (isUserFocused) {
        focusScore = Math.min(focusScore + SCORE_GAIN * ticks, 9999);
      } else if (isPhoneDetected || !isGazeFocused || noFaceWarning) {
        // noFaceWarning belongs here: walking away used to match NEITHER branch
        // (no face means no phone and gaze defaults to focused), so the focus
        // score simply froze while the attention score fell. Leaving the desk
        // was the one distraction that cost you nothing on the overlay.
        focusScore = Math.max(focusScore - SCORE_PENALTY * ticks, 0);
      }

      if (isPhoneDetected) {
        currentAttentionScore -= ATTN_DROP_PHONE * ticks;
      } else if (noFaceWarning) {
        currentAttentionScore -= ATTN_DROP_NOFACE * ticks;
      } else if (!isGazeFocused) {
        currentAttentionScore -= ATTN_DROP_GAZE * ticks;
      } else if (isUserFocused) {
        // Normal gain up to 75, then a steepening slowdown toward 100: the last
        // stretch (95→100) crawls, so a perfect score is a long-focus reward.
        const dimFactor = currentAttentionScore <= 75
          ? 1
          : Math.max(0.035, ((100 - currentAttentionScore) / 25) ** 2);
        currentAttentionScore += ATTN_BASE_GAIN * dimFactor * ticks;
      }
      currentAttentionScore = Math.max(0, Math.min(100, currentAttentionScore));
    }
  }

  return {
    phone_detected: isPhoneDetected,
    attention_score: Math.round(currentAttentionScore),
    user_present: hasFace,
    timestamp: now,
    warning_message: warningMessage,
    tracker_score: focusScore,
    phones: latestPhones,
    source: 'browser',
  };
}

async function runProcessFrame() {
  if (!videoElement || videoElement.readyState < 2) return;
  try {
    const now = performance.now();
    const faceResult = faceLandmarker.detectForVideo(videoElement, now);
    if (isYoloReady && !isProcessingYolo && workerCanvasCtx) {
      isProcessingYolo = true;
      workerCanvasCtx.drawImage(videoElement, 0, 0, 640, 640);
      const imageData = workerCanvasCtx.getImageData(0, 0, 640, 640);
      yoloWorker.postMessage({ type: 'detect', payload: { imageData } });
    }
    const event = processDetections(faceResult, latestPhones);
    if (_onEvent) _onEvent(event);
  } catch (err) {
    console.warn('[BrowserAI] Frame processing error:', err.message);
  }
}

async function processFrame() {
  if (!videoElement || videoElement.readyState < 2) {
    animFrameId = requestAnimationFrame(processFrame);
    return;
  }
  const now = performance.now();
  if (now - lastProcessTime < PROCESS_INTERVAL_MS) {
    animFrameId = requestAnimationFrame(processFrame);
    return;
  }
  lastProcessTime = now;
  await runProcessFrame();
  animFrameId = requestAnimationFrame(processFrame);
}

function handleVisibilityChange() {
  if (_status !== 'active') return;
  if (document.visibilityState === 'hidden') {
    if (animFrameId)  { cancelAnimationFrame(animFrameId);  animFrameId  = null; }
    if (renderFrameId){ cancelAnimationFrame(renderFrameId); renderFrameId = null; }
    if (!visibilityIntervalId) {
      visibilityIntervalId = setInterval(() => { runProcessFrame(); }, 2000);
    }
  } else {
    if (visibilityIntervalId) { clearInterval(visibilityIntervalId); visibilityIntervalId = null; }
    if (!animFrameId)   animFrameId   = requestAnimationFrame(processFrame);
    if (!renderFrameId) renderFrameId = requestAnimationFrame(renderLoop);
  }
}

// ---------------------------------------------------------------------
// CANVAS DRAWING LOGIC 
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
  // 1. ดึง Canvas ตัวปัจจุบันที่อยู่บนหน้าจอจริงๆ (หาใหม่ทุกเฟรม)
  const currentCanvas = document.getElementById('ai-canvas');

  // ถ้ายังไม่พร้อม ให้ข้ามเฟรมนี้ไปก่อน (อย่า return ทิ้ง ไม่งั้นมันจะหยุดวาดถาวร)
  if (_status !== 'active' || !currentCanvas || !videoElement) {
    renderFrameId = requestAnimationFrame(renderLoop);
    return;
  }

  const ctx = currentCanvas.getContext('2d');
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  // ปรับขนาดแผ่นใสให้พอดีกับกล้อง
  if (currentCanvas.width !== width) {
    currentCanvas.width = width;
    currentCanvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  // --- วาดข้อความ Focus Score ---
  drawTextWithBg(ctx, `Focus Score: ${Math.round(focusScore)}`, 10, 25, 'rgba(20,20,20,0.85)', '#fff');

  // --- วาด Badge สถานะ ---
  let badgeText, badgeColor;
  if (scoreFrozen) {
    badgeText = " PAUSED ";
    badgeColor = 'rgba(120, 120, 140, 0.9)';
  } else if (isUserFocusedGlobal) {
    badgeText = " FOCUSED ";
    badgeColor = 'rgba(34, 139, 34, 0.9)';
  } else if (phoneConfirmed) {
    // The confirmed state, not the raw box — otherwise the badge accuses the
    // user on a single unconfirmed frame that costs them nothing. (The boxes
    // below still draw raw hits with their score, which is what you tune against.)
    badgeText = " DISTRACTED ";
    badgeColor = 'rgba(200, 0, 0, 0.9)';
  } else {
    badgeText = " NOT FOCUSED ";
    badgeColor = 'rgba(0, 140, 255, 0.9)';
  }
  ctx.font = `bold 14px "Segoe UI", sans-serif`;
  const badgeWidth = ctx.measureText(badgeText).width;
  drawTextWithBg(ctx, badgeText, width - badgeWidth - 20, 25, badgeColor, '#fff');

  // --- วาดกรอบแดงโทรศัพท์ ---
// ใน browserAI.js -> ฟังก์ชัน renderLoop
  latestPhones.forEach(box => {
  // 1. คำนวณความกว้างและพิกัดดิบก่อน
  const realW = box.w * width; // Box width (pixel)
  const realH = box.h * height; // Box height (pixel)
  const rawX = box.x1 * width; // Left edge from un-mirrored AI (pixel)
  const realY = box.y1 * height; // Top edge from AI (pixel - แกนนี้ถูกอยู่แล้ว)

  // 2. 👇 วิชามาร "พลิกด้านซ้ายขวา (Horizontal Flip)"
  // พิกัดด้านซ้ายใหม่ (mirroredX) = (ความกว้าง Canvas ทั้งหมด) - (พิกัดด้านซ้ายดิบ) - (ความกว้างของกล่อง)
  const mirroredX = width - rawX - realW;

  // 3. วาดกล่องแดงด้วยพิกัดใหม่ (mirroredX)
  ctx.strokeStyle = 'rgb(255, 0, 0)';
  ctx.lineWidth = 3;
  ctx.strokeRect(mirroredX, realY, realW, realH);
  
  // 4. วาดข้อความให้ตรงกับพิกัด mirroredX ด้วยครับ
  drawTextWithBg(ctx, `Phone ${Math.round(box.conf * 100)}%`, mirroredX, realY - 10, 'rgba(200,0,0,0.85)', '#fff', 12);
});

  // --- วาด Warning ใหญ่กลางจอ ---
  // While the game is paused, the warning slot always shows the pause
  // notice instead of live distraction warnings (no score is changing).
  const warningToShow = scoreFrozen
    ? 'AI paused — no score is being reduced!'
    : latestWarning;
  if (warningToShow) {
    ctx.font = `bold 16px "Segoe UI", sans-serif`;
    const warnWidth = ctx.measureText(warningToShow).width;
    const cx = (width - warnWidth) / 2;
    const cy = height / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, cy - 25, width, 40);
    ctx.fillStyle = scoreFrozen ? 'rgb(130, 200, 255)' : 'rgb(255, 60, 60)';
    ctx.fillText(warningToShow, cx, cy);
  }

  // --- แถบเตือนเมื่อ AI ตรวจจับโทรศัพท์ไม่ได้ ---
  // Phone detection is down but face tracking still works, so nothing else on
  // screen would look wrong. Say so plainly instead of quietly scoring the
  // player as focused while they hold a phone.
  if (yoloError) {
    ctx.font = `bold 11px "Segoe UI", sans-serif`;
    const msg = 'PHONE DETECTION OFFLINE';
    const msgWidth = ctx.measureText(msg).width;
    drawTextWithBg(ctx, msg, (width - msgWidth) / 2, height - 10, 'rgba(200,120,0,0.9)', '#fff', 11);
  }

  // เรียกตัวเองเพื่อวาดเฟรมถัดไป (ห้ามลืมบรรทัดนี้!)
  renderFrameId = requestAnimationFrame(renderLoop);
}

// ---------------------------------------------------------------------

export async function startBrowserAI({ onEvent, onStatusChange, video } = {}) {
  // แก้ไขตรงนี้: ถ้ามัน active อยู่แล้ว ให้รีเทิร์นตัวเดิมออกไปเลย!
  if (_status === 'active') return videoElement; 
  

  _onEvent = onEvent;
  _onStatusChange = onStatusChange;

  if (animFrameId) return videoElement;

  setStatus('loading', 'Loading AI models...');

  try {
    initYoloWorker(); // เริ่ม YOLO

    const [, stream] = await Promise.all([
      loadFaceLandmarker(),
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

    // สร้าง Offscreen Canvas ลับไว้ส่งให้ Worker
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = 640;
    hiddenCanvas.height = 640;
    workerCanvasCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

    focusScore = 0;
    lastFaceSeenAt = Date.now();
    lastScoreTick = Date.now();
    lastProcessTime = 0;

    setStatus('active', 'Browser AI running');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animFrameId = requestAnimationFrame(processFrame);
    renderFrameId = requestAnimationFrame(renderLoop);

    return videoElement;
  } catch (err) {
    setStatus('error', err.message);
    throw err;
  }
}

export function stopBrowserAI() {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (visibilityIntervalId) { clearInterval(visibilityIntervalId); visibilityIntervalId = null; }
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
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }
  if (yoloWorker) {
    yoloWorker.terminate(); // ปิด Worker เมื่อหยุดใช้งาน
    yoloWorker = null;
    isYoloReady = false;
    yoloError = null;
  }

  _onEvent = null;
  focusScore = 0;
  currentAttentionScore = ATTN_START;
  scoreFrozen = false;
  latestPhones = [];
  // The overlay reads these directly and starts drawing before the first
  // detection of the next session lands, so a warning left over from the last
  // one ("PUT YOUR PHONE AWAY!") would flash onto a camera showing an empty desk.
  latestWarning = '';
  isUserFocusedGlobal = true;
  lastFaceSeenAt = Date.now();
  // Clear the confirmation streaks too, or a phone held at the end of one
  // session stays "confirmed" into the start of the next.
  phoneResultSeq = 0;
  phoneSeenSeq = -1;
  phoneLastResultAt = 0;
  phoneHitStreak = 0;
  phoneMissStreak = 0;
  phoneConfirmed = false;
  // Reset the in-flight guard: if the session stopped while a frame was mid-
  // inference the worker's reply never arrives, so leaving this true would
  // wedge phone detection for the whole next session.
  isProcessingYolo = false;
  lastProcessTime = 0;
  setStatus('idle');
}

// The one live camera stream. AttentionCamera reuses this for its preview
// rather than calling getUserMedia a second time: two streams meant the pixels
// the player watched were not the pixels the model judged, and the overlay's
// box coordinates were scaled against the wrong video's dimensions.
export function getBrowserAIStream() {
  return videoStream;
}

export function isBrowserAISupported() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}