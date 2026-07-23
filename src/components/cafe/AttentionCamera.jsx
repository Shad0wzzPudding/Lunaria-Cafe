import { useEffect, useRef, useState } from 'react';
import { getAIConfig, onConnectionStatus } from '@/lib/ai/aiIntegration';
import { subscribeBrowserAIStream } from '@/lib/ai/browserAI';
import Draggable from 'react-draggable';

/**
 * The AI camera preview panel.
 *
 * Shows the live camera ONLY once the AI is fully up: the stream is rolling AND
 * the YOLO model is loaded (phoneReady on the connection-status channel). Until
 * then it shows a "Loading model" card, because the stream arrives first and a
 * camera that looks fully working while phone detection is silently inactive is
 * worse than saying so.
 *
 * This is NOT the old "Loading..." placeholder, which had a 200ms poll and a 30s
 * give-up deadline and could leave the panel stuck on an error forever after a
 * merely-slow model download. There is no poll and no deadline here: the loading
 * card resolves on a real push, and a genuine startup failure renders the error
 * card instead. `modelReady` is latched so a mid-session 'degraded' (phone
 * detection dying) can't hide an otherwise-working camera — the on-canvas
 * "PHONE DETECTION OFFLINE" banner covers that case.
 *
 * The stream is browserAI's own (never a second getUserMedia — two streams
 * meant the pixels the player watched were not the pixels the model judged).
 * This panel only borrows it: cleanup detaches, never stops tracks.
 */
export default function AttentionCamera() {
  const { aiMode } = getAIConfig();
  const videoRef = useRef(null);

  // 👇 nodeRef เพื่อแก้ปัญหา findDOMNode ของ React 18
  const draggableRef = useRef(null);

  const [stream, setStream] = useState(null);
  // True while the AI failed to START (denied permission, model-load error).
  // The panel-shows-only-when-live design is silent about WHY there's no
  // panel, and the other surfaces don't cover it mid-session: the HUD
  // collapses 'error' into an icon and settings is unreachable during focus.
  // So the panel slot itself says it.
  const [aiFailed, setAiFailed] = useState(false);
  // True once the YOLO model has finished loading this session. LATCHED on
  // purpose: if phone detection dies mid-session ('degraded'), the camera must
  // keep showing — face/gaze still work and the on-canvas "PHONE DETECTION
  // OFFLINE" banner covers it. Reverting to the loading card would hide a
  // working camera. Resets naturally on unmount (the panel unmounts between
  // sessions), so a new session starts unlatched.
  const [modelReady, setModelReady] = useState(false);

  const showCamera = aiMode === 'browser';

  // Push-based: fires immediately with the current stream (covers mounting
  // after the AI already started, e.g. closing a popup mid-session), again
  // when a session's camera starts rolling — however long the model download
  // took — and with null on stop, which unrenders the panel.
  useEffect(() => {
    if (!showCamera) return;
    return subscribeBrowserAIStream(setStream);
  }, [showCamera]);

  useEffect(() => {
    if (!showCamera) return;
    return onConnectionStatus(({ status, phoneReady }) => {
      setAiFailed(status === 'error');
      if (phoneReady) setModelReady(true); // latch; never flipped back
    });
  }, [showCamera]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    // Autoplay of a muted playsinline video is reliable; a rejection here is
    // a transient AbortError from a rapid stream swap — the next subscription
    // callback re-runs this effect, so log rather than surface.
    el.play().catch((err) => console.warn('[AttentionCamera] preview play failed:', err.message));
    return () => { el.srcObject = null; }; // detach only — browserAI owns the stream
  }, [stream]);

  if (!showCamera) return null;

  // Startup failed: a persistent card in the slot the camera would occupy —
  // the one place the player actually looks for it.
  if (!stream && aiFailed) {
    return (
      <aside className="absolute bottom-3 left-3 z-50 w-64 rounded-lg border border-red-500/50 bg-black/70 shadow-lg p-3">
        <p className="text-[10px] font-pixel text-red-400">Camera unavailable</p>
        <p className="mt-1 text-[10px] font-body text-muted-foreground">
          The AI camera could not start. Check the browser's camera permission,
          then end and restart the focus session.
        </p>
      </aside>
    );
  }

  // Still starting up: the camera stream and the YOLO model load in parallel,
  // and the model finishes LAST. Say so instead of showing a camera that looks
  // fully working while phone detection is silently inactive.
  //
  // Unlike the placeholder this replaced, there is no poll and no give-up
  // deadline: it resolves on a real push (phoneReady) and a genuine failure
  // falls through to the error card above — so it can't get stuck showing an
  // error for a merely-slow model download.
  if (!stream || !modelReady) {
    return (
      <aside className="absolute bottom-3 left-3 z-50 w-64 rounded-lg border border-border/50 bg-black/70 shadow-lg p-3">
        <p className="text-[10px] font-pixel text-muted-foreground">
          AI Camera <span className="text-amber-400">(Loading model)</span>
        </p>
        <p className="mt-1 text-[10px] font-body text-muted-foreground">
          Loading the phone-detection model — the camera starts once it's ready.
        </p>
      </aside>
    );
  }

  return (
    // 👇 nodeRef + ref เชื่อม Draggable กับ DOM node
    <Draggable bounds="parent" nodeRef={draggableRef}>
      <aside ref={draggableRef} className="absolute bottom-3 left-3 z-50 w-64 min-w-[200px] resize overflow-auto cursor-move rounded-lg border border-border/50 bg-black/60 shadow-lg pb-1">
        <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel pointer-events-none">
          AI Camera <span className="text-emerald-400">(Browser)</span>
        </p>

        <div className="relative pointer-events-none">
          {/* No fixed aspect box: the video lays out at the stream's own aspect
              ratio, so its rendered size matches its intrinsic size and the
              absolutely-positioned canvas maps 1:1 onto it. An aspect-video +
              object-cover wrapper crops the stream and knocks every overlay
              box out of alignment. */}
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="block w-full h-auto"
            style={{ transform: 'scaleX(-1)' }}
          />

          <canvas
            id="ai-canvas"
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        </div>
      </aside>
    </Draggable>
  );
}
