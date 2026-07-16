import { useEffect, useRef, useState } from 'react';
import { getAIConfig, onConnectionStatus } from '@/lib/ai/aiIntegration';
import { subscribeBrowserAIStream } from '@/lib/ai/browserAI';
import Draggable from 'react-draggable';

/**
 * The AI camera preview panel.
 *
 * Appears ONLY while the AI is actually live: it subscribes to browserAI's
 * camera stream and renders nothing until the models are loaded and the
 * camera is rolling — then pops in fully working. This replaces the old
 * "Loading..." placeholder + 200ms poll + 30s give-up deadline, all three of
 * which had failure modes (a slow model download left the panel stuck on an
 * error forever; a ready-flag that never reset suppressed error UI for the
 * rest of the mount). There is no loading state to get stuck in: the panel's
 * existence IS the ready signal. Load/error status still surfaces through
 * the HUD and settings via the connection-status channel.
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
    return onConnectionStatus(({ status }) => setAiFailed(status === 'error'));
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

  // Loading (or not in a session yet): no panel at all — it appears when live.
  if (!stream) return null;

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
