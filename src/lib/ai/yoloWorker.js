import * as ort from 'onnxruntime-web';

// บังคับให้โหลด WASM จาก CDN ป้องกันปัญหาตอน Deploy ลง Vercel
// Pin to the installed package version, exactly as MediaPipe is pinned in
// browserAI: an unversioned jsdelivr path serves @latest, and WASM binaries
// newer than the JS that drives them will break inference in production on a
// day nobody touched this repo.
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';

// ONNX inference session, initialised once on 'init' message
let session = null;
const PHONE_CLASS_ID = 67; // Class 67 คือ โทรศัพท์ใน COCO

// Minimum confidence for a detection the model has already labelled "cell
// phone". YOLO26 runs end-to-end: it picks the winning class itself and hands
// back one row per surviving detection. The upside is simplicity; the downside
// is that when yolo26n (the nano model) is wrong about a phone-ish prop — a
// watch, a milk carton — it emits `cell phone` outright, and there is no
// losing-class score to compare against (the old argmax scan that caught a
// carton scoring `bottle` 0.85 / `cell phone` 0.50 is impossible with this
// output). So this threshold is the ONLY thing between a mislabelled prop and a
// false penalty, and it only helps when the model is LOW-confidence about the
// mistake.
//
// History: 0.40 originally; 0.60 when watches and cartons were registering;
// back to 0.45 when real phones were missed at 0.60; up to 0.60 again once
// the SOFT tier existed. That last step is what makes 0.60 safe now: this
// threshold no longer decides IF a phone is detected, only HOW FAST. Above
// it = the instant path (2 frames, ~1.6s), so it demands high certainty;
// below it, [SOFT_CONF_FLOOR..here) still detects via the persistence path
// (4 consecutive shape-approved frames, ~3.2s). A confirmed hit drops the
// focus score and starts the 30s danger clock, so the instant path staying
// strict is deliberate. The camera overlay prints the live confidence.
//
// ── VERSION SWITCH (three dials: here, SOFT_CONF_FLOOR, NEAR_MISS_FLOOR) ──
// V1 "More sorting, less detect" — narrow amber band, looser red:
//      red > 45% · Phone? 30–45% · near-miss 20–30%
// V2 "Easier detect, less sorting" — CHOSEN after live testing (wide amber
//      band, strict red):
//      red > 60% · Phone? 25–60% · near-miss 12–25%
// To switch versions, swap the commented/active line at ALL THREE dials so
// the bands stay coherent, then hard-refresh — the worker doesn't hot-swap.
// const CONF_THRESHOLD = 0.45; // V1 (More sorting, less detect)
const CONF_THRESHOLD = 0.60;    // V2 (Easier detect, less sorting — in use)

// Geometry gate — a second screen for props the model mislabels as a phone.
// yolo26n only knows COCO's 80 classes; a wristwatch and a UHT carton are not
// among them, so it forces them into the nearest class it does know and often
// lands on `cell phone`. Confidence alone can't always separate them, so also
// reject detections whose SHAPE can't be a phone held up to the camera:
//   - too small in frame   -> a wristwatch (small and roughly square)
//   - too square           -> a watch face or a cube-ish object
//   - impossibly elongated -> a sliver or frame edge, never a phone
//
// Honest limits: this RELIABLY kills the watch (small + square). A UHT carton
// is a genuine tall rectangle — front-on it is as elongated as a phone or more —
// so geometry barely helps there; the carton's defence stays CONF_THRESHOLD and,
// ultimately, a model whose vocabulary actually includes it.
//
// All three are measured in TRUE frame proportions (the frame is center-
// cropped into the tensor and detections are unmapped before these run —
// never judge shape in stretched tensor space; that bug rejected upright and
// landscape phones alike). Area is a fraction of the real frame; aspect is
// the real box.
//
// The aspect floor is deliberately permissive (1.2, not 1.4): bounding boxes
// are axis-aligned, so a phone held at a natural hand tilt reads much squarer
// than the phone itself (a 2.2:1 phone at ~30° reads ~1.2). The watch doesn't
// need the floor — it dies on PHONE_MIN_AREA.
const PHONE_MIN_AREA = 0.02;   // w*h as fraction of the frame; below = watch, not a held phone
const PHONE_MIN_ASPECT = 1.2;  // max(w,h)/min(w,h); loose on purpose — tilt squares the box
const PHONE_MAX_ASPECT = 3.2;  // beyond this it's a sliver/edge, not a phone
// Master switch for the gate below. Off = shape filtering disabled; only
// CONF_THRESHOLD screens detections. Flip to true to re-enable.
const GEOMETRY_GATE_ENABLED = true;
// The gate is TIERED on confidence, because live testing showed a hard
// conflict: a phone sneaking into frame camera-corner-first makes a SMALL,
// SQUARISH box — the same geometric signature as a wristwatch. A plain shape
// gate cannot keep one and reject the other. So the gate only judges shape
// when the model is merely lukewarm about the detection:
//   conf >= GEOMETRY_BYPASS_CONF -> trust the model, any shape (keeps the
//                                   partial/camera-corner phone catch)
//   CONF_THRESHOLD..bypass       -> must LOOK like a phone (this band is
//                                   where the mislabelled watch lives)
// If a watch still registers, read its confidence off the overlay: above the
// bypass means yolo26n is confidently wrong and no filter fixes it — that is
// the cue to move to a model whose vocabulary includes "watch".
const GEOMETRY_BYPASS_CONF = 0.80;

// SOFT evidence floor. A phone actually being USED — tilted in the hand,
// foreshortened, half-covered by a thumb — chronically scores well under
// CONF_THRESHOLD (live-diagnosed at ~38-44%, with dips lower), while a phone
// posed for the camera clears it easily. Rather than lowering the threshold
// into noise, detections in [SOFT_CONF_FLOOR, CONF_THRESHOLD) that ALSO pass
// the shape gate are reported as `soft` candidates; the main thread confirms
// a phone only when they persist for several consecutive frames. Persistence
// is the discriminator: real phone use lasts minutes, misread props flicker.
// Shape-checking soft candidates is what keeps the watch from re-entering
// through this lower door. Floor lowered 0.30 -> 0.25 in the same pass that
// raised CONF_THRESHOLD: the soft band [0.25..0.60) is now the PRIMARY
// detection route, wide enough to hold the whole in-use pose range.
//
// VERSION SWITCH — keep in sync with CONF_THRESHOLD above.
// const SOFT_CONF_FLOOR = 0.30; // V1 (More sorting, less detect — "Phone?" from 30%)
const SOFT_CONF_FLOOR = 0.25;    // V2 (Easier detect, less sorting — in use, from 25%)

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
  const numPixels = 640 * 640;
  
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

  return new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function postprocess(output, videoW = 640, videoH = 640) {
  const data = output.data;
  // The main thread CENTER-CROPS the (typically 4:3) frame to its middle
  // square and scales that to 640 — full resolution, no distortion (see the
  // history comment in browserAI's runProcessFrame). Recompute that mapping
  // here (it's deterministic from the source size) to translate detections
  // from tensor pixels back into REAL-frame coordinates before any geometry
  // is judged. For a square source this degrades to the identity mapping.
  const side = Math.min(videoW, videoH);
  const cropScale = 640 / side;
  const cropX = (videoW - side) / 2;
  const cropY = (videoH - side) / 2;
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
  // ever draws.) Tiers:
  //   hard (best) -> conf above CONF_THRESHOLD and shape-approved: counts as a
  //                  detection on its own.
  //   soft        -> conf in [SOFT_CONF_FLOOR, CONF_THRESHOLD) and STILL
  //                  shape-approved: no detection alone, but the main thread
  //                  confirms a phone when these persist across frames (the
  //                  in-use pose scores chronically just under the bar).
  //   rejected    -> diagnostics only; drawn as the amber near-miss readout so
  //                  a failing filter is visible and tunable, not invisible.
  let best = null;
  let soft = null;
  let rejected = null;
  // VERSION SWITCH — keep in sync with CONF_THRESHOLD at the top of the file.
  // const NEAR_MISS_FLOOR = 0.20; // V1 (More sorting, less detect — diagnostics from 20%)
  const NEAR_MISS_FLOOR = 0.12;    // V2 (Easier detect, less sorting — in use; below this is noise)
  const noteRejection = (conf, reason, extra) => {
    if (conf < NEAR_MISS_FLOOR) return;
    if (rejected && conf <= rejected.conf) return;
    rejected = { conf, reason: extra ? `${reason} ${extra}` : reason };
  };

  for (let i = 0; i < numDets; i++) {
    const o = i * 6;

    // Cheap tests first: most of the 300 rows are padding with conf 0.
    const conf = data[o + 4];
    if (Math.round(data[o + 5]) !== PHONE_CLASS_ID) continue;
    if (conf < NEAR_MISS_FLOOR) continue;

    // Undo the crop: tensor px -> real-frame px. Corners can sit slightly
    // outside the tensor (the model happily returns x1 = -4) — clamp to the
    // real frame.
    const x1px = clamp(data[o] / cropScale + cropX, 0, videoW);
    const y1px = clamp(data[o + 1] / cropScale + cropY, 0, videoH);
    const x2px = clamp(data[o + 2] / cropScale + cropX, 0, videoW);
    const y2px = clamp(data[o + 3] / cropScale + cropY, 0, videoH);
    const wpx = x2px - x1px;
    const hpx = y2px - y1px;
    if (wpx <= 0 || hpx <= 0) continue; // fully off-frame after clamping

    // Shape gate, judged in real-frame pixels where aspect and area are true.
    // Evaluated for BOTH tiers — a soft candidate that skipped the shape check
    // would let the watch back in through the lower door. High-confidence
    // detections still bypass it (camera-corner sneak).
    if (GEOMETRY_GATE_ENABLED && conf < GEOMETRY_BYPASS_CONF) {
      const aspect = Math.max(wpx, hpx) / Math.min(wpx, hpx);
      if ((wpx * hpx) / (videoW * videoH) < PHONE_MIN_AREA) {
        noteRejection(conf, 'area', ((wpx * hpx) / (videoW * videoH)).toFixed(3));
        continue;
      }
      if (aspect < PHONE_MIN_ASPECT || aspect > PHONE_MAX_ASPECT) {
        noteRejection(conf, 'aspect', aspect.toFixed(2));
        continue;
      }
    }

    // Normalised 0.0-1.0 fractions of the real frame, so the overlay can just
    // multiply by the on-screen video size (unchanged contract).
    const box = { x1: x1px / videoW, y1: y1px / videoH, w: wpx / videoW, h: hpx / videoH, conf };
    if (conf > CONF_THRESHOLD) {
      if (!best || conf > best.conf) best = box;
    } else if (conf >= SOFT_CONF_FLOOR) {
      if (!soft || conf > soft.conf) soft = box;
    } else {
      noteRejection(conf, 'conf');
    }
  }

  // Each tier only reports when no stronger tier explains the frame.
  return {
    phones: best ? [best] : [],
    soft: best ? null : soft,
    rejected: best || soft ? null : rejected,
  };
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

  if (type === 'detect') {
    // Always reply with a result (even empty / on error) so the main thread's
    // in-flight guard clears — otherwise phone detection wedges for the session.
    if (!session) {
      postMessage({ type: 'result', phones: [] });
      return;
    }
    try {
      const tensor = preprocess(payload.imageData);
      const results = await session.run({ images: tensor });
      const outputTensor = results[session.outputNames[0]];
      const out = postprocess(outputTensor, payload.videoW, payload.videoH);
      postMessage({ type: 'result', phones: out.phones, soft: out.soft, rejected: out.rejected });
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
      postMessage({ type: 'result', phones: [] });
    }
  }
}