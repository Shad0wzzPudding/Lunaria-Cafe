// The wasm-only build on purpose. The default entry pulls the JSEP
// (WebGPU/WebNN) runtime — 25MB vs 12MB — and we only ever run
// executionProviders: ['wasm'], so that half was downloaded and compiled for
// nothing. WASM compile is CPU-bound, so the saving shows up worst-machine-first.
import * as ort from 'onnxruntime-web/wasm';
import { POLICY, cropRect, TENSOR_SIZE } from './detectionPolicy.js';

// บังคับให้โหลด WASM จาก CDN ป้องกันปัญหาตอน Deploy ลง Vercel
// Pin to the installed package version, exactly as MediaPipe is pinned in
// browserAI: an unversioned jsdelivr path serves @latest, and WASM binaries
// newer than the JS that drives them will break inference in production on a
// day nobody touched this repo.
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';

// ONNX inference session, initialised once on 'init' message
let session = null;
const PHONE_CLASS_ID = 67; // Class 67 คือ โทรศัพท์ใน COCO

// All tuning lives in detectionPolicy.js (single source shared with the main
// thread — the confidence bands here and the persistence windows there are
// one calibration).
//
// Why these bands exist at all: YOLO26 runs end-to-end — it picks the winning
// class itself, so when yolo26n is wrong about a phone-ish prop (a watch, a
// UHT carton; neither is in its COCO vocabulary) it emits `cell phone`
// outright, and there is no losing-class score to compare against (the old
// argmax scan is impossible with this output). Confidence and shape are the
// only screens we have, and a confidently-wrong prop (>= bypassConf) is
// unfixable by filtering — that's the cue for a vocabulary-aware model.
// Same names as detectionPolicy.js on purpose — one vocabulary, so grepping a
// field name from either file finds both the tuning and its use.
const {
  hardConf,     // above: red box (shape-gated), counts in ~1.6s
  bypassConf,   // above: trust the model, any shape
  minArea,
  minAspect,
  maxAspect,
} = POLICY;

// Mutable so the debug panel can lower the detection floors (see the 'config'
// message). softConf is the lowest COUNTING bar — a phone-shaped hit at/above it
// is detected (amber "Phone?"). nearMissConf is the diagnostics floor below it
// (near-miss text; below = noise). They must stay ordered nearMiss < soft.
// Default to the policy values.
let softConf = POLICY.softConf;
let nearMissConf = POLICY.nearMissConf;

// Geometry gate — a second screen for props the model mislabels as a phone:
//   - too small in frame   -> a wristwatch (small and roughly square)
//   - too square           -> a watch face or a cube-ish object
//   - impossibly elongated -> a sliver or frame edge, never a phone
//
// Honest limits: this RELIABLY kills the small-and-square family — the watch,
// and a hand cupped at the ear, whose box is near 1:1. A UHT carton is a
// genuine tall rectangle — front-on it is as elongated as a phone or more —
// so geometry barely helps there; the carton's defence is confidence
// alone. All three bounds are judged in TRUE frame proportions (detections
// are unmapped from the crop first — never judge shape in distorted tensor
// space; that bug rejected upright and landscape phones alike). The aspect
// floor is deliberately permissive: axis-aligned boxes square out under a
// natural hand tilt. The gate is TIERED: lukewarm detections must be
// phone-shaped, high-confidence ones pass on the model's word alone (keeps
// the camera-corner sneak, whose small squarish box is geometrically
// identical to a watch).
//
// Master switch: off = shape filtering disabled, only confidence screens.
// Mutable so the debug panel can flip it (see the 'config' message); the
// default lives in detectionPolicy.js with the bounds it governs, and is
// currently OFF.
let geometryGateEnabled = POLICY.geometryGate;

async function initModel() {
  try {
    session = await ort.InferenceSession.create(self.location.origin + '/models/yolo26n.onnx', {
      executionProviders: ['wasm']
    });
    postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    console.error("YOLO Init Error:", err);
    postMessage({ type: 'status', status: 'error', error: err.message });
  }
}

function preprocess(imageData) {
  const { data } = imageData; // flat RGBA 640x640
  const numPixels = TENSOR_SIZE * TENSOR_SIZE;

  // สร้าง Float32Array ขนาด Batch=1, Channels=3, H=640, W=640
  const tensorData = new Float32Array(1 * 3 * numPixels);

  // กำหนด Offset สำหรับแต่ละช่องสีแบบ explicit
  const offsetR = 0;
  const offsetG = 1 * numPixels;
  const offsetB = 2 * numPixels;

  // วนลูปแกะทีละ Pixel
  for (let i = 0; i < numPixels; i++) {
    const pixelIdx = i * 4; // ตำแหน่ง RGBA ใน ImageData

    // Normalize จาก 0-255 เป็น 0.0-1.0
    const r = data[pixelIdx] / 255.0;
    const g = data[pixelIdx + 1] / 255.0;
    const b = data[pixelIdx + 2] / 255.0;

    // บรรจุลงในโครงสร้าง [Batch, Channels, Height, Width]
    tensorData[offsetR + i] = r; // Red channel plane
    tensorData[offsetG + i] = g; // Green channel plane
    tensorData[offsetB + i] = b; // Blue channel plane
    // Alpha channel data[pixelIdx+3] โดนทิ้งไป
  }

  return new ort.Tensor('float32', tensorData, [1, 3, TENSOR_SIZE, TENSOR_SIZE]);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Returns ONE tagged detection — the mutually-exclusive tiers are structural,
// not documented-by-comment (consumers branch on `tier` instead of juggling
// three parallel nullable values):
//   { tier: 'hard',     box }            counts on its own (red box)
//   { tier: 'soft',     box }            counts via persistence (amber box)
//   { tier: 'rejected', conf, reason, rejectedBy }
//                                        near-miss text; only rejectedBy
//                                        'conf' is eligible for escalation
//   { tier: null }                       nothing phone-like this frame
function postprocess(output, videoW = TENSOR_SIZE, videoH = TENSOR_SIZE) {
  const data = output.data;
  // Undo the center-crop the main thread drew (same cropRect — the ONE
  // mapping in detectionPolicy.js) so detections land in REAL-frame
  // coordinates before any geometry is judged. For a square source this
  // degrades to the identity mapping.
  const crop = cropRect(videoW, videoH);
  // YOLO26 exports end-to-end (NMS-free): [1, numDetections, 6], where every
  // row is [x1, y1, x2, y2, conf, classId] — corners in INPUT-PIXEL space
  // (0-640), not the cxcywh + one-row-per-class grid YOLOv8 produced. Fed a
  // YOLOv8 tensor the maths below would stay in bounds and quietly read
  // nonsense, so assert the layout: a model swap must fail loudly, not
  // silently start hallucinating phones.
  const dims = output.dims ?? [];
  if (dims.length !== 3 || dims[2] !== 6) {
    throw new Error(`Unexpected YOLO output layout [${dims}] — expected [1, numDetections, 6]`);
  }
  const numDets = dims[1];

  // Rows arrive sorted by confidence, but don't lean on that — scan them all
  // and keep the single best candidate per tier. (One box is all the game
  // ever draws.)
  let best = null;
  let soft = null;
  // `by` is the machine-readable cause, kept separate from the human `reason`
  // string (which carries the measured value for the debug overlay). The main
  // thread branches on it: only a 'conf' rejection — the model saw a phone
  // SHAPE but scored it faintly — may be escalated into a counting detection.
  // A shape rejection is the gate's positive verdict that this is not a phone,
  // and escalating that would launder the very object the gate exists to kill.
  //
  // TWO slots, not one, precisely because the cause carries that weight: a
  // single slot ranked by confidence alone would let a higher-scoring shape
  // rejection MASK a genuine conf near-miss in the same frame — a hand at the
  // ear rejected on aspect at 33% hiding a faint real phone at 15%, which
  // would then never escalate. Rank within each cause, report the escalatable
  // one first.
  let rejected = null;      // best 'conf' near-miss — the only escalatable kind
  let shapeRejected = null; // best 'area'/'aspect'  — diagnostics only
  const noteRejection = (conf, by, extra) => {
    const slot = by === 'conf' ? rejected : shapeRejected;
    if (slot && conf <= slot.conf) return;
    const record = { conf, by, reason: extra ? `${by} ${extra}` : by };
    if (by === 'conf') rejected = record;
    else shapeRejected = record;
  };

  for (let i = 0; i < numDets; i++) {
    const o = i * 6;

    // Cheap tests first: most of the 300 rows are padding with conf 0.
    const conf = data[o + 4];
    if (Math.round(data[o + 5]) !== PHONE_CLASS_ID) continue;
    if (conf < nearMissConf) continue;

    // Undo the crop: tensor px -> real-frame px. Corners can sit slightly
    // outside the tensor (the model happily returns x1 = -4) — clamp to the
    // real frame.
    const x1px = clamp(data[o] / crop.scale + crop.x, 0, videoW);
    const y1px = clamp(data[o + 1] / crop.scale + crop.y, 0, videoH);
    const x2px = clamp(data[o + 2] / crop.scale + crop.x, 0, videoW);
    const y2px = clamp(data[o + 3] / crop.scale + crop.y, 0, videoH);
    const wpx = x2px - x1px;
    const hpx = y2px - y1px;
    if (wpx <= 0 || hpx <= 0) continue; // fully off-frame after clamping

    // Shape gate, judged in real-frame pixels where aspect and area are true.
    // Evaluated for BOTH counting tiers — a soft candidate that skipped the
    // shape check would let the watch back in through the lower door.
    if (geometryGateEnabled && conf < bypassConf) {
      const aspect = Math.max(wpx, hpx) / Math.min(wpx, hpx);
      if ((wpx * hpx) / (videoW * videoH) < minArea) {
        noteRejection(conf, 'area', ((wpx * hpx) / (videoW * videoH)).toFixed(3));
        continue;
      }
      if (aspect < minAspect || aspect > maxAspect) {
        noteRejection(conf, 'aspect', aspect.toFixed(2));
        continue;
      }
    }

    // Normalised 0.0-1.0 fractions of the real frame, so the overlay can just
    // multiply by the on-screen video size (unchanged contract).
    const box = { x1: x1px / videoW, y1: y1px / videoH, w: wpx / videoW, h: hpx / videoH, conf };
    if (conf > hardConf) {
      if (!best || conf > best.conf) best = box;
    } else if (conf >= softConf) {
      if (!soft || conf > soft.conf) soft = box;
    } else {
      noteRejection(conf, 'conf');
    }
  }

  // Strongest tier wins; weaker tiers only report when nothing above them
  // explains the frame.
  if (best) return { tier: 'hard', box: best };
  if (soft) return { tier: 'soft', box: soft };
  // Escalatable first: reporting a shape rejection in its place would suppress
  // an escalation that is legitimately building.
  const report = rejected ?? shapeRejected;
  if (report) return { tier: 'rejected', conf: report.conf, reason: report.reason, rejectedBy: report.by };
  return { tier: null };
}

// An empty result is indistinguishable from "no phone in frame", so a failing
// inference would otherwise score the player as focused forever while only
// whispering to the console — the same silent failure a missing model file
// caused. Report it once (it repeats every frame) so the main thread can warn.
let inferenceFailed = false;

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === 'init') {
    await initModel();
  }

  if (type === 'config') {
    // The shape gate carries no ordering invariant, so it is applied before
    // the floors and survives a rejected floor override — "reject the whole
    // override" below means the soft/nearMiss PAIR, which must move together.
    if (payload?.geometryGate != null) {
      geometryGateEnabled = !!payload.geometryGate;
    }
    // Debug overrides for the detection floors; null restores policy defaults.
    const nextSoft = (payload?.softConf     != null) ? payload.softConf     : POLICY.softConf;
    const nextNear = (payload?.nearMissConf != null) ? payload.nearMissConf : POLICY.nearMissConf;
    // Same ordering invariant the static policies are checked against (see
    // detectionPolicy.js) — applied here too, or an override could silently
    // create a band of shape-unchecked candidates and reopen the watch false
    // positive. Reject the whole override rather than half-apply it.
    if (!(nextNear < nextSoft && nextSoft < hardConf)) {
      console.warn('[yolo] ignoring incoherent detection-floor override', { nextSoft, nextNear, hardConf });
      return;
    }
    softConf = nextSoft;
    nearMissConf = nextNear;
    return;
  }

  if (type === 'detect') {
    // Always reply with a result (even empty / on error) so the main thread's
    // in-flight guard clears — otherwise phone detection wedges for the session.
    if (!session) {
      postMessage({ type: 'result', detection: { tier: null } });
      return;
    }
    try {
      const tensor = preprocess(payload.imageData);
      const results = await session.run({ images: tensor });
      const outputTensor = results[session.outputNames[0]];
      postMessage({ type: 'result', detection: postprocess(outputTensor, payload.videoW, payload.videoH) });
      // Recovered: say so, or the main thread leaves "PHONE DETECTION OFFLINE"
      // on the camera for the rest of the session while detection quietly works
      // again. It has to be said explicitly — a plain result cannot mean
      // "healthy", because a failed model load posts empty results too (see the
      // !session branch above), and treating those as recovery would erase the
      // one banner that must never disappear.
      if (inferenceFailed) {
        inferenceFailed = false;
        postMessage({ type: 'status', status: 'ready' });
      }
    } catch (err) {
      console.error("Inference Error:", err);
      if (!inferenceFailed) {
        inferenceFailed = true;
        postMessage({ type: 'status', status: 'error', error: err.message });
      }
      postMessage({ type: 'result', detection: { tier: null } });
    }
  }
}
