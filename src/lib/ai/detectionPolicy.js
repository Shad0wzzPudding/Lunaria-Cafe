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
//   conf >= nearMissConf, phone-shaped   amber NEAR MISS text; sustained ~2s
//                                        it escalates to a counting soft hit
//   conf >= nearMissConf, wrong shape    amber NEAR MISS text only, never counts
//   below                                ignored
//
// The shape gate (minArea/minAspect/maxAspect, in TRUE frame proportions) is
// what keeps a mislabelled wristwatch out of both counting tiers; a UHT
// carton is genuinely phone-shaped and can only be screened by confidence —
// or, ultimately, by a model whose vocabulary includes it.

// ── Removed: V1 — "More sorting, less detect" (harder to detect, more accurate).
// Kept here for reference. It demanded more evidence (higher soft/near-miss
// floors, a wider bypass) so it missed real phones more often but let fewer
// props through. Superseded by V2 after live testing; V2 is the only shipping
// policy now.
//
// export const POLICY_V1 = {
//   name: 'V1 — More sorting, less detect',
//   hardConf: 0.45,
//   softConf: 0.30,
//   nearMissConf: 0.20,
//   bypassConf: 0.80,
//   minArea: 0.02,
//   minAspect: 1.2,
//   maxAspect: 3.2,
//   confirmFrames: 2,
//   softConfirmFrames: 4,
//   releaseFrames: 2,
// };

export const POLICY_V2 = {
  name: 'V2 — Easier detect, less sorting',
  hardConf: 0.60,   // red demands high certainty (it punishes in ~1.6s)
  softConf: 0.20,   // wide amber band holds the whole in-use pose range
                    // (0.25 -> 0.20: raise the chance a weakly-scored phone
                    // counts; persistence + shape gate still screen props)
  nearMissConf: 0.12, // Back to the original 0.12 after a 0.08 -> 0.05
                      // excursion — the lower floors only added chatter.
                      // This gates the NEAR MISS text only, never what counts.
  bypassConf: 0.60, // (0.80 -> 0.60, V2 ONLY — V1 keeps 0.80.) Equal to
                    // hardConf, so in V2 every detection above the red bar is
                    // trusted outright and the shape gate only screens the
                    // amber band: live testing showed real phones (tilted or
                    // far) being shape-rejected at 60-70%. The trade: a prop
                    // the model CONFIDENTLY misreads above 60% — a watch
                    // rated as a phone — now counts too; if that shows up,
                    // raise this back toward 0.70-0.80 or move to a model
                    // whose vocabulary includes the prop.
  minArea: 0.02,    // fraction of the frame; below = watch, not a held phone
  minAspect: 1.2,   // loose on purpose — axis-aligned boxes square out under hand tilt
  maxAspect: 3.2,   // beyond this it's a sliver/edge, not a phone
  // Master switch for the three bounds above. Back ON (2026-08-12) after live
  // testing with the 10% floor genuinely applied for the first time: a hand
  // cupped at the ear scored 33% with a near-square box, and a water bottle
  // came through as a tall sliver. Both are rejected on shape; neither is
  // touchable by confidence, since 33% clears even the un-lowered 0.20 floor.
  //
  // It was OFF from 2026-08-09 on the reasoning that catching real phones beat
  // rejecting props — but during that window the gate could not actually
  // reject anything that sat still, because near-miss escalation promoted
  // shape rejections into counting soft hits ~2s later. Fixing that (see
  // rejectedBy in yoloWorker) is what makes this switch mean something.
  //
  // The gate only ever screened the amber band (bypassConf and up pass on the
  // model's word alone). KNOWN COST: in-use phones score ~38-44%, i.e. inside
  // the screened band, so a phone tilted enough to square its axis-aligned box
  // below minAspect is now missed outright rather than escalating. If real
  // phones start slipping, loosen minAspect before turning this back off.
  geometryGate: true,
  confirmFrames: 2,     // hard hits to confirm (~1.6s at the 800ms cadence)
  softConfirmFrames: 3, // soft frames to confirm (~2.4s). Was 4 (~3.2s);
                        // 3 keeps one extra frame of flicker protection over
                        // the hard path — a two-frame misread of a prop still
                        // costs nothing, while a real in-use phone confirms
                        // noticeably faster than the original 4.
  releaseFrames: 2,     // empty frames to release a confirmation
};

// ── Coherence check ────────────────────────────────────────────────────────
// The whole tier design assumes nearMiss < soft < hard <= bypass. That used
// to live only in comments, and two of these relationships are load-bearing
// in non-obvious ways: hard <= bypass is what scopes the shape gate — a
// future tune that raises hardConf without bypassConf would create a band of
// SHAPE-UNCHECKED soft candidates, silently reopening the watch false
// positive the gate exists to prevent. Fail at module load, in dev, loudly —
// not as mysteriously wrong detection in play. (Runs in both the worker and
// the main thread; a worker-side throw surfaces via the offline banner.)
for (const p of [POLICY_V2]) {
  const ordered =
    p.nearMissConf < p.softConf &&
    p.softConf < p.hardConf &&
    p.hardConf <= p.bypassConf;
  const framesSane =
    p.confirmFrames >= 1 && p.softConfirmFrames >= 1 && p.releaseFrames >= 1;
  if (!ordered || !framesSane) {
    throw new Error(
      `Detection policy "${p.name}" is incoherent: requires ` +
      `nearMissConf(${p.nearMissConf}) < softConf(${p.softConf}) < ` +
      `hardConf(${p.hardConf}) <= bypassConf(${p.bypassConf}) and all ` +
      `frame counts >= 1.`
    );
  }
}

// ── THE VERSION SWITCH ─────────────────────────────────────────────────────
// One line. V2 chosen after live testing 2026-07-15.
export const POLICY = POLICY_V2;
