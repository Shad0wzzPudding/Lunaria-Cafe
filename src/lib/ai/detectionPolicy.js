/**
 * Single source of truth for phone-detection tuning and frame geometry.
 *
 * Both halves of the pipeline import from here: yoloWorker.js consumes the
 * confidence bands and shape gate, browserAI.js consumes the persistence
 * windows and the crop mapping. These used to be scattered constants across
 * two files whose calibration silently depended on each other — the crop
 * mapping alone was computed in three places, and it had already broken
 * twice (stretch, then letterbox) before landing on center-crop.
 */

// ── Frame geometry ─────────────────────────────────────────────────────────
// The model's input tensor is square; the (typically 4:3) webcam frame is
// CENTER-CROPPED into it — the middle square at full resolution, no
// distortion, no padding. Full width and full resolution can't both fit in
// one square tensor; resolution won: the letterbox attempt shrank content
// ~25% and collapsed a held phone to 38% confidence. Cost: the outer strips
// of the frame (left/right on a landscape camera) are a phone-detector blind
// zone — the debug panel's "Show phone-detector zone" toggle draws it.
export const TENSOR_SIZE = 640;

// The one mapping between real-frame pixels and tensor pixels. Draw side
// (browserAI: crop the video into the tensor canvas), unmap side (yoloWorker:
// detections back to real-frame coords), and the debug-zone overlay must all
// use THIS — never re-derive it locally.
export function cropRect(srcW, srcH) {
  const side = Math.min(srcW, srcH);
  return {
    side,                            // crop square edge, in source px
    x: (srcW - side) / 2,            // crop origin in the source frame
    y: (srcH - side) / 2,
    scale: TENSOR_SIZE / side,       // source px -> tensor px
  };
}

// ── Tuning presets ─────────────────────────────────────────────────────────
// Confidence bands (which tier a detection lands in) and persistence windows
// (how many consecutive frames each tier needs to confirm) are ONE policy —
// the soft band exists specifically to be confirmed by softConfirmFrames.
// Tune them together, always.
//
// Band semantics (see yoloWorker.postprocess):
//   conf > bypassConf                    red box, ANY shape (~1.6s to count)
//   conf > hardConf, phone-shaped        red box                (~1.6s)
//   conf >= softConf, phone-shaped       amber "Phone?" box     (~3.2s, persistence)
//   conf >= nearMissConf                 amber NEAR MISS text   (never counts)
//   below                                ignored
//
// The shape gate (minArea/minAspect/maxAspect, in TRUE frame proportions) is
// what keeps a mislabelled wristwatch out of both counting tiers; a UHT
// carton is genuinely phone-shaped and can only be screened by confidence —
// or, ultimately, by a model whose vocabulary includes it.

export const POLICY_V1 = {
  name: 'V1 — More sorting, less detect',
  hardConf: 0.45,
  softConf: 0.30,
  nearMissConf: 0.20,
  bypassConf: 0.80,
  minArea: 0.02,
  minAspect: 1.2,
  maxAspect: 3.2,
  confirmFrames: 2,
  softConfirmFrames: 4,
  releaseFrames: 2,
};

export const POLICY_V2 = {
  name: 'V2 — Easier detect, less sorting',
  hardConf: 0.60,   // red demands high certainty (it punishes in ~1.6s)
  softConf: 0.25,   // wide amber band holds the whole in-use pose range
  nearMissConf: 0.12,
  bypassConf: 0.80, // camera-corner sneak: trust the model outright
  minArea: 0.02,    // fraction of the frame; below = watch, not a held phone
  minAspect: 1.2,   // loose on purpose — axis-aligned boxes square out under hand tilt
  maxAspect: 3.2,   // beyond this it's a sliver/edge, not a phone
  confirmFrames: 2,     // hard hits to confirm (~1.6s at the 800ms cadence)
  softConfirmFrames: 4, // soft frames to confirm (~3.2s) — persistence is the
                        // discriminator: real phone use lasts minutes, misread
                        // props flicker
  releaseFrames: 2,     // empty frames to release a confirmation
};

// ── THE VERSION SWITCH ─────────────────────────────────────────────────────
// One line. V2 chosen after live testing 2026-07-15.
export const POLICY = POLICY_V2;
