/**
 * Browser-native AI attention tracking using MediaPipe Face Landmarker
 * and YOLO26 ONNX (via Web Worker) for phone detection.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { POLICY, cropRect, TENSOR_SIZE } from './detectionPolicy.js';

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

// The worker's verdict for the latest frame — ONE tagged value, so the tiers
// are mutually exclusive by construction (they used to be three parallel
// nullable variables coordinated by comments):
//   { tier: 'hard',     box }           red box; counts on its own
//   { tier: 'soft',     box }           amber "Phone?" box (the in-use pose
//                                       lives here); counts via persistence
//   { tier: 'rejected', conf, reason }  near-miss diagnostics; never counts
//   { tier: null }                      nothing phone-like this frame
let latestDetection = { tier: null };

// Shade the parts of the frame the phone detector cannot see. The detector
// runs on the CENTER-CROPPED square of the camera (full resolution beats
// full coverage — see runProcessFrame), so the outer strips of a 4:3 frame
// are a genuine blind zone; without this view, a phone near the edges looks
// like "detection is broken". ON by default so players can see where
// detection actually works; the debug tool can still toggle it off.
// Survives session stop on purpose — it's a viewer preference, not session state.
let debugShowDetectionZone = true;

export function setDetectionZoneVisible(visible) {
  debugShowDetectionZone = !!visible;
}

export function isDetectionZoneVisible() {
  return debugShowDetectionZone;
}

// Drops the worker's phone-detection floor (softConf — the lowest bar a
// phone-shaped hit must clear to count) to 10%, so faint phones register. The
// near-miss floor is pushed just below it to keep the tiers ordered. ON by
// default; the debug panel can turn it off to restore the normal V2 floors.
// (Shape gate still screens the band.)
const LOW_CONF_SOFT = 0.10;     // counting floor when enabled
const LOW_CONF_NEARMISS = 0.05; // near-miss floor, kept below softConf
let lowConfFloorEnabled = true;

// The worker's shape screen (area + aspect bounds). OFF by default, per
// POLICY.geometryGate — the debug panel can turn it back on. It is the filter
// that reliably rejects a mislabelled watch, so with it off a watch can count;
// that is the accepted trade for catching more real phones.
let geometryGateEnabled = POLICY.geometryGate;

// Always posted WHOLE. The worker reads an absent floor as "restore the policy
// default", so a message carrying only one knob would silently undo the other
// — sending a partial config to flip the shape gate would reset the 10% floor.
//
// The fields go inside `payload`, matching the 'detect' message. They used to
// sit at the top level while the worker read them from `payload`, so every
// config message resolved to undefined and quietly restored policy defaults:
// the 10% floor never applied from the day it was added, and neither did the
// shape-gate toggle. One envelope, one convention — don't flatten this again.
function detectionConfigMessage() {
  return {
    type: 'config',
    payload: {
      softConf:     lowConfFloorEnabled ? LOW_CONF_SOFT : null,
      nearMissConf: lowConfFloorEnabled ? LOW_CONF_NEARMISS : null,
      geometryGate: geometryGateEnabled,
    },
  };
}

export function setLowConfFloor(enabled) {
  lowConfFloorEnabled = !!enabled;
  yoloWorker?.postMessage(detectionConfigMessage());
}

export function isLowConfFloor() {
  return lowConfFloorEnabled;
}

export function setGeometryGate(enabled) {
  geometryGateEnabled = !!enabled;
  yoloWorker?.postMessage(detectionConfigMessage());
}

export function isGeometryGate() {
  return geometryGateEnabled;
}
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
// Note this only defends against FLICKER, not against a steady false positive.
// If yolo26n mislabels a stationary prop (a watch, a milk carton) as `cell
// phone` above the counting floors, it clears these frame streaks exactly like
// a real phone would — the only screens for that are the confidence bands and
// shape gate in yoloWorker (see detectionPolicy.js), and only while the model
// stays low-confidence about the mistake.
// The frame counts live in detectionPolicy.js next to the confidence bands
// they calibrate against — one policy, one file. Soft persistence exists
// because a phone actually being USED (tilted, foreshortened, thumb over it)
// scores chronically under the hard threshold; ~3.2s of consecutive soft
// frames confirm it, long enough that a prop misread for a frame or two
// never triggers.
const PHONE_CONFIRM_FRAMES = POLICY.confirmFrames;
const PHONE_RELEASE_FRAMES = POLICY.releaseFrames;
const PHONE_SOFT_CONFIRM_FRAMES = POLICY.softConfirmFrames;
// Streaks only advance on fresh results, so if results stop arriving entirely
// (stalled inference, a wedged worker) a confirmed phone would otherwise never
// clear: the score keeps draining and the 30s danger clock runs the session to
// failure with no way out. Detections normally arrive every 800ms (2000ms when
// hidden), so silence this long means the pipeline is broken, not that the user
// is still holding a phone — give them the benefit of the doubt.
const PHONE_STALE_MS = 5000;
// Detections are only fresh when the worker replies; the loop re-reads the same
// latestDetection value in between. Counting those repeats would let ONE
// inference confirm a phone all by itself, so the streaks only advance on a
// new result.
let phoneResultSeq = 0;    // bumped by the worker's onmessage
let phoneSeenSeq = -1;     // last result this state machine consumed
let phoneLastResultAt = 0; // when that result arrived
let phoneHitStreak = 0;
let phoneSoftStreak = 0;
let phoneMissStreak = 0;
let phoneConfirmed = false;

// A near-miss (rejected) that persists this long is promoted to a soft "Phone?"
// — a "familiar object" the AI keeps almost-detecting, so it starts counting via
// the normal soft persistence instead of being ignored forever.
const NEAR_MISS_ESCALATE_MS = 2000;
// Drop-outs shorter than this are bridged, so a flickering / intermittent
// near-miss still accumulates toward the escalation instead of resetting on one
// gap. Deliberately longer than the escalation window: a phone that only
// registers in occasional frames should still get there.
const NEAR_MISS_GRACE_MS = 5000;
// How long an EMPTY frame may still be treated as a soft hit after the object
// was last actually seen. Much tighter than the accumulation grace above, and
// for a different job: the grace decides how long the escalation WINDOW keeps
// accumulating, this decides how long we may pretend "nothing on screen" is
// still the object. ~2 frames at the 800ms cadence, so a brief dropout is
// covered but a genuine absence is not.
const NEAR_MISS_BRIDGE_MS = 1600;
let nearMissStart = 0;
let nearMissLastAt = 0;

function confirmPhone(rawHit, softHit, now) {
  // Nothing new to judge — the loop is re-reading the same latestDetection.
  if (phoneSeenSeq === phoneResultSeq) {
    if (phoneConfirmed && phoneLastResultAt && now - phoneLastResultAt > PHONE_STALE_MS) {
      phoneHitStreak = 0;
      phoneSoftStreak = 0;
      phoneMissStreak = 0;
      phoneConfirmed = false;
    }
    return phoneConfirmed;
  }
  phoneSeenSeq = phoneResultSeq;

  if (rawHit) {
    // A hard hit advances BOTH streaks: a run like hard,soft,soft,hard is
    // continuous phone evidence and must confirm via the soft path even
    // though neither tier alone strings together its full count.
    phoneMissStreak = 0;
    phoneHitStreak += 1;
    phoneSoftStreak += 1;
    if (phoneHitStreak >= PHONE_CONFIRM_FRAMES) phoneConfirmed = true;
  } else if (softHit) {
    // Supporting evidence: sustains an existing confirmation (in-use phones
    // hover under the hard bar for minutes) and accumulates toward a soft
    // confirmation — but deliberately does NOT reset the hard streak, so
    // hard,soft,hard still confirms on the second hard hit.
    phoneMissStreak = 0;
    phoneSoftStreak += 1;
  } else {
    phoneHitStreak = 0;
    phoneSoftStreak = 0;
    phoneMissStreak += 1;
    if (phoneMissStreak >= PHONE_RELEASE_FRAMES) phoneConfirmed = false;
  }
  if (phoneSoftStreak >= PHONE_SOFT_CONFIRM_FRAMES) phoneConfirmed = true;
  return phoneConfirmed;
}

let _onEvent = null;
let _onStatusChange = null;
let _status = 'idle';

function setStatus(status, detail = '') {
  _status = status;
  // phoneReady rides the existing status push rather than a third listener
  // channel (see the KNOWN DUPLICATION note in aiIntegration.js): the camera
  // panel needs to know when the YOLO model is actually live, not just when
  // the session started.
  if (_onStatusChange) _onStatusChange({ status, detail, phoneReady: isYoloReady });
}

export function getBrowserAIStatus() {
  // Poll-readers get the same picture push-subscribers do: a session that is
  // running but has lost phone detection reports 'degraded', not a clean
  // 'active'. _status itself stays 'active' internally — it gates the render
  // loop and the visibility handler, which must keep running while degraded.
  return _status === 'active' && yoloError ? 'degraded' : _status;
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

// Shared by session stop AND failed startup — a failed start used to leave the
// worker (with its loaded ONNX/WASM runtime) orphaned for the tab's life,
// because the only stopBrowserAI caller is gated behind a flag that a failed
// start never sets.
function teardownYoloWorker() {
  if (!yoloWorker) return;
  // Detach the handlers BEFORE terminating: a message task already queued on
  // the event loop can still fire after terminate(), and a late error would
  // push a phantom 'degraded' status into a session that no longer exists.
  yoloWorker.onmessage = null;
  yoloWorker.onerror = null;
  yoloWorker.terminate(); // ปิด Worker เมื่อหยุดใช้งาน
  yoloWorker = null;
  isYoloReady = false;
  yoloError = null;
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
      const firstReady = !isYoloReady;
      isYoloReady = true;
      if (firstReady && !yoloError && _onStatusChange) {
        // Phone detection just came live — re-announce the current status so the
        // camera panel can drop its "Loading model" state. Without this the
        // panel would wait for some unrelated later status push.
        _onStatusChange({ status: _status, detail: '', phoneReady: true });
      }
      if (yoloError) {
        // RECOVERY must be announced, not just recorded: reportYoloError pushed
        // 'degraded' to the app-wide status (settings shows its detail text
        // verbatim), so clearing yoloError silently would fix the on-camera
        // banner while settings kept saying "Phone detection offline" for the
        // rest of the session.
        yoloError = null;
        if (_onStatusChange) _onStatusChange({ status: 'active', detail: 'Browser AI running', phoneReady: true });
      }
    }
    if (e.data.type === 'status' && e.data.status === 'error') {
      // Deliberately does NOT clear isYoloReady. If the model failed to load it
      // was never set; if inference failed mid-session, clearing it would stop
      // us ever sending another frame — turning one bad frame into a permanently
      // dead detector. Keep feeding the worker; it recovers if the fault passes.
      reportYoloError(e.data.error);
    }
    if (e.data.type === 'result') {
      const det = e.data.detection ?? { tier: null };
      const now = Date.now();
      if (det.tier === 'rejected') {
        // Start the window, or restart it only after a lapse longer than the
        // grace period — a brief flicker keeps the accumulated time.
        if (nearMissStart === 0 || now - nearMissLastAt > NEAR_MISS_GRACE_MS) {
          nearMissStart = now;
        }
        nearMissLastAt = now;
      } else if (det.tier === 'soft' || det.tier === 'hard') {
        // Tier went UP to a real detection — the same object, seen better. Keep
        // an existing window running (and refresh the grace) instead of clearing
        // it. A phone that flickers between near-miss and a real hit would
        // otherwise lose its progress on every good frame: confirmPhone's streak
        // already dies on each near-miss frame, so if the escalation window
        // restarted too, an oscillating phone could never confirm by either
        // route. Deliberately does NOT start a window — a clean detection counts
        // on its own (hard in ~1.6s, soft via persistence) and needs no
        // familiar-object path.
        if (nearMissStart !== 0) nearMissLastAt = now;
      } else {
        // A gap frame (tier null): tolerate it during the grace period so an
        // intermittent near-miss keeps accumulating; drop the window once the
        // gap exceeds it.
        if (nearMissStart !== 0 && now - nearMissLastAt > NEAR_MISS_GRACE_MS) {
          nearMissStart = 0;
        }
      }

      // Once the window reaches the threshold, treat a near-miss as a counting
      // soft "Phone?" (familiar object), so confirmPhone's persistence advances
      // and the phone warning fires like a real soft detection. Genuine
      // hard/soft detections pass through unchanged.
      //
      // Empty frames are bridged the same way, but only to cover a brief
      // dropout: they must be within NEAR_MISS_BRIDGE_MS of the last real
      // sighting, and only while the phone isn't already confirmed.
      //
      // Both conditions are load-bearing. Without the time bound, bridging
      // resumes the instant a confirmation RELEASES (phoneConfirmed flips back
      // to false), and three empty frames re-confirm a phone that isn't there —
      // the warning flickers on/off for the whole grace instead of clearing.
      // Without the confirmed check, empty frames keep phoneMissStreak at zero
      // and release never starts at all (the ~6.6s tail after putting the phone
      // down). A near-miss still promotes after confirmation: something
      // phone-like is visibly there, so the warning should hold.
      const windowOpen =
        nearMissStart !== 0 && now - nearMissStart >= NEAR_MISS_ESCALATE_MS;
      const canBridgeGap =
        !phoneConfirmed && now - nearMissLastAt <= NEAR_MISS_BRIDGE_MS;
      const escalated =
        windowOpen &&
        (det.tier === 'rejected' || (det.tier === null && canBridgeGap));
      latestDetection = escalated
        ? { tier: 'soft', escalated: true, conf: det.conf, reason: det.reason }
        : det;
      phoneResultSeq += 1; // a genuinely new detection for confirmPhone to judge
      phoneLastResultAt = Date.now();
      isProcessingYolo = false; // reply received — send the next frame
    }
  };

  yoloWorker.postMessage({ type: 'init' });
  // Carry the current debug overrides into the fresh worker. Sent
  // unconditionally now: a worker respawned mid-session starts from the policy
  // defaults, so skipping this when the floor happens to be off would leave a
  // toggled shape gate behind with it.
  yoloWorker.postMessage(detectionConfigMessage());
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

function processDetections(faceResult, detection) {
  const now = Date.now();
  const isPhoneDetected = confirmPhone(detection.tier === 'hard', detection.tier === 'soft', now);

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
    // External event shape unchanged: hard detections as a box array.
    phones: detection.tier === 'hard' ? [detection.box] : [],
    // Tier diagnostics for the pop-out window, which can't read the module-local
    // latestDetection the main camera draws from (soft "Phone?" box, near-miss
    // text, and the escalated "familiar object" state).
    detection: {
      tier: detection.tier ?? null,
      box: (detection.tier === 'soft' && detection.box) ? detection.box : null,
      escalated: !!detection.escalated,
      nearMissReason: detection.tier === 'rejected' ? detection.reason : null,
      nearMissConf:   detection.tier === 'rejected' ? detection.conf   : null,
    },
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
      // CENTER-CROP the frame into the square tensor. Third iteration of this
      // mapping, each fixing the last's failure — don't regress it:
      //   1. stretch (0,0,640,640): distorted the image; the geometry gate
      //      judged warped aspect ratios and rejected normal phone poses.
      //   2. letterbox: fixed distortion but shrank the content ~25% to make
      //      room for padding — small-object confidence collapsed (a held
      //      phone read 38%, under the 0.45 threshold; live-diagnosed via the
      //      near-miss readout).
      //   3. center-crop (this): the middle square at full resolution — no
      //      distortion, no padding, the phone as large as the tensor allows.
      //      Cost: the outer ~12% on the left/right of a 4:3 frame is not seen
      //      by the phone detector (face tracking reads the raw video and is
      //      unaffected). A phone entering from the side edge triggers slightly
      //      later; a phone in front of the player is what actually matters.
      const vw = videoElement.videoWidth;
      const vh = videoElement.videoHeight;
      const crop = cropRect(vw, vh); // the ONE mapping — shared with the worker's unmap
      workerCanvasCtx.drawImage(videoElement, crop.x, crop.y, crop.side, crop.side, 0, 0, TENSOR_SIZE, TENSOR_SIZE);
      const imageData = workerCanvasCtx.getImageData(0, 0, TENSOR_SIZE, TENSOR_SIZE);
      // videoW/H let the worker undo the crop and return boxes as fractions
      // of the REAL frame, so the overlay math stays unchanged.
      yoloWorker.postMessage({ type: 'detect', payload: { imageData, videoW: vw, videoH: vh } });
    }
    const event = processDetections(faceResult, latestDetection);
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

// The preview <video> is CSS-mirrored (scaleX(-1)); the canvas is not, so a
// box must flip its X to land on what the player sees. ONE copy of the mirror
// math, shared by the red (hard) and amber (soft) boxes — two hand-synced
// copies of this formula is how boxes end up on opposite sides of the frame.
function drawDetectionBox(ctx, box, width, height, { color, bg, label, dashed }) {
  const w = box.w * width;
  const h = box.h * height;
  const x = width - box.x1 * width - w; // horizontal flip
  const y = box.y1 * height;
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 2 : 3;
  if (dashed) ctx.setLineDash([8, 5]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  drawTextWithBg(ctx, label, x, y - 10, bg, '#fff', 12);
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

  // --- โซนที่ AI มองเห็น (เปิดจาก Debug Panel) ---
  // Canvas pixels equal video pixels here (the canvas is sized from the
  // stream above), so the crop math from runProcessFrame maps 1:1. Drawn
  // first so boxes and text stay on top. The centered crop is symmetric,
  // which is also why the mirrored preview needs no special handling.
  if (debugShowDetectionZone) {
    // Same cropRect the pipeline actually uses — the zone can't lie.
    const crop = cropRect(width, height);
    ctx.fillStyle = 'rgba(255, 70, 70, 0.14)';
    if (crop.x > 0) {
      ctx.fillRect(0, 0, crop.x, height);
      ctx.fillRect(width - crop.x, 0, crop.x, height);
    }
    if (crop.y > 0) {
      ctx.fillRect(0, 0, width, crop.y);
      ctx.fillRect(0, height - crop.y, width, crop.y);
    }
    ctx.strokeStyle = 'rgba(255, 120, 120, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(crop.x, crop.y, crop.side, crop.side);
    ctx.setLineDash([]);
    const zoneMsg = 'PHONE AI SEES INSIDE THIS BOX';
    ctx.font = `bold 10px "Segoe UI", sans-serif`;
    const zoneW = ctx.measureText(zoneMsg).width;
    drawTextWithBg(ctx, zoneMsg, crop.x + (crop.side - zoneW) / 2, crop.y + 16, 'rgba(120,40,40,0.8)', '#ffd7d7', 10);
  }

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

  // --- กรอบตรวจจับ: แดง = นับแล้ว, เหลือง = รอยืนยัน, ข้อความ = ปัดตก ---
  // ONE tagged detection per frame (latestDetection), so the tiers cannot
  // draw over each other by construction — no cross-guards needed.
  if (latestDetection.tier === 'hard') {
    drawDetectionBox(ctx, latestDetection.box, width, height, {
      color: 'rgb(255, 0, 0)', bg: 'rgba(200,0,0,0.85)', dashed: false,
      label: `Phone ${Math.round(latestDetection.box.conf * 100)}%`,
    });
  } else if (latestDetection.tier === 'soft' && latestDetection.box) {
    // Shape-approved but under the hard bar — the in-use pose lives here. The
    // player sees the AI tracking it while the persistence counter runs.
    drawDetectionBox(ctx, latestDetection.box, width, height, {
      color: 'rgb(255, 190, 0)', bg: 'rgba(180,140,0,0.85)', dashed: true,
      label: `Phone? ${Math.round(latestDetection.box.conf * 100)}%`,
    });
  } else if (latestDetection.tier === 'rejected') {
    // NEAR MISS: which filter rejected it and at what confidence, so a phone
    // that "stopped detecting" is diagnosable from the overlay:
    //   conf   -> under the soft floor: raise the phone, improve light
    //   aspect -> the held angle squares the box: lower minAspect
    //   area   -> too small in frame: phone too far away, or lower minArea
    const msg = `NEAR MISS: ${latestDetection.reason} @ ${Math.round(latestDetection.conf * 100)}%`;
    drawTextWithBg(ctx, msg, 10, height - 10, 'rgba(180,140,0,0.85)', '#fff', 11);
  }

  // A sustained near-miss promoted to a counting soft "Phone?" — box-less (the
  // rejection carried no box), so it's surfaced as its own amber diagnostic.
  if (latestDetection.escalated) {
    drawTextWithBg(ctx, 'Familiar object detected', 10, height - 10, 'rgba(180,140,0,0.85)', '#fff', 11);
  }

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

  // Kick both loads off in parallel, but keep a handle on the stream promise:
  // Promise.all abandons its siblings on first rejection, so if the landmarker
  // fails while getUserMedia later succeeds, the granted stream would leak —
  // camera light on, no session, no way to stop it.
  const streamPromise = getWebcamStream();
  try {
    initYoloWorker(); // เริ่ม YOLO

    const [, stream] = await Promise.all([
      loadFaceLandmarker(),
      streamPromise,
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
    hiddenCanvas.width = TENSOR_SIZE;
    hiddenCanvas.height = TENSOR_SIZE;
    workerCanvasCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

    focusScore = 0;
    lastFaceSeenAt = Date.now();
    lastScoreTick = Date.now();
    lastProcessTime = 0;

    setStatus('active', 'Browser AI running');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animFrameId = requestAnimationFrame(processFrame);
    renderFrameId = requestAnimationFrame(renderLoop);

    // The camera is genuinely rolling — tell subscribers (the AttentionCamera
    // panel appears at exactly this moment, however long the models took).
    notifyStreamListeners();

    return videoElement;
  } catch (err) {
    // A failed start must leave NOTHING captured or running, whichever line
    // failed. Null videoStream FIRST: the old guard compared the promised
    // stream against videoStream and skipped release when the failure happened
    // after the assignment (a play() rejection) — the stream compared equal to
    // itself, the camera stayed captured with no release path, and the stale
    // videoStream leaked into subscribeBrowserAIStream's catch-up callback.
    // With videoStream nulled, the promise guard below is universally correct
    // (stopping already-stopped tracks is a harmless no-op).
    videoStream = null;
    notifyStreamListeners(); // a panel holding the stale stream lets go
    streamPromise.then((s) => {
      if (s !== videoStream) s.getTracks().forEach((t) => t.stop());
    }).catch(() => {});
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement = null;
    }
    // And the worker: it was created (and told to load the model) before the
    // failing awaits, and no other cleanup path is reachable from here.
    teardownYoloWorker();
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
    notifyStreamListeners(); // the panel hides itself the moment the stream dies
  }
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }
  teardownYoloWorker();

  _onEvent = null;
  focusScore = 0;
  currentAttentionScore = ATTN_START;
  scoreFrozen = false;
  latestDetection = { tier: null };
  nearMissStart = 0;
  nearMissLastAt = 0;
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
  phoneSoftStreak = 0;
  phoneMissStreak = 0;
  phoneConfirmed = false;
  // Reset the in-flight guard: if the session stopped while a frame was mid-
  // inference the worker's reply never arrives, so leaving this true would
  // wedge phone detection for the whole next session.
  isProcessingYolo = false;
  lastProcessTime = 0;
  setStatus('idle');
  // Cleared AFTER the 'idle' notification so subscribers hear the teardown —
  // and so nothing later (a stray async callback) can talk to a session that
  // has ended. Set fresh by the next startBrowserAI.
  _onStatusChange = null;
}

// ── The one live camera stream ─────────────────────────────────────────────
// AttentionCamera reuses this for its preview rather than calling getUserMedia
// a second time: two streams meant the pixels the player watched were not the
// pixels the model judged. Consumers SUBSCRIBE rather than poll — the callback
// fires immediately with the current stream (null when the camera is down),
// again when a session's camera actually starts rolling, and again on stop.
// This is what lets the panel exist exactly when the AI is live: no loading
// placeholder to get stuck, no give-up deadline, no 200ms timer.
//
// KNOWN DUPLICATION (deliberate): this is the same subscribe pattern as
// statusListeners/onConnectionStatus in aiIntegration.js — Set of callbacks,
// replay-on-subscribe, unsubscribe closure. Two copies is below the bar for
// an abstraction; if you're about to write a THIRD, stop and extract a shared
// makeListenerChannel() helper instead, and fold both of these into it.
const streamListeners = new Set();

function notifyStreamListeners() {
  streamListeners.forEach((cb) => cb(videoStream));
}

export function subscribeBrowserAIStream(callback) {
  streamListeners.add(callback);
  callback(videoStream); // late subscribers catch up instantly
  return () => streamListeners.delete(callback);
}

export function isBrowserAISupported() {
  return !!(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}