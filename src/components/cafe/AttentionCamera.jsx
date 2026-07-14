import { useEffect, useRef, useState } from 'react';
import { getAIConfig } from '@/lib/ai/aiIntegration';
import { getBrowserAIStream, getBrowserAIStatus } from '@/lib/ai/browserAI';
import Draggable from 'react-draggable';

// How long to wait for browserAI to hand over its stream before giving up.
// Model load + camera permission can take a while on a cold start.
const ATTACH_TIMEOUT_MS = 30000;
const ATTACH_POLL_MS = 200;

export default function AttentionCamera() {
  const { aiMode } = getAIConfig();
  const videoRef = useRef(null);

  // 👇 เพิ่ม nodeRef ตรงนี้เพื่อแก้ปัญหา findDOMNode ของ React 18
  const draggableRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  // Mirrors isReady for the poll loop, which is a closure created once per
  // effect run and would otherwise capture isReady's stale first value.
  const isReadyRef = useRef(false);

  const showCamera = aiMode === 'browser';

  useEffect(() => {
    if (!showCamera) return;

    let cancelled = false;
    let timer = null;
    const deadline = Date.now() + ATTACH_TIMEOUT_MS;
    const videoEl = videoRef.current; // always mounted while showCamera

    // Show the stream browserAI already opened. This panel used to call
    // getUserMedia itself, which lit up a second camera stream at a different
    // resolution — so the preview under the overlay was not the video the model
    // actually scored, and #ai-canvas (sized from the model's video) drew its
    // phone boxes against the wrong dimensions. One stream, one set of pixels.
    // Keep polling for the lifetime of the panel rather than stopping at the
    // first successful attach: stopBrowserAI() stops the tracks and opens a
    // fresh stream on the next session, and a one-shot attach would leave this
    // <video> holding the dead one — a frozen preview that never recovers. The
    // poll is a getter and an identity compare; it re-attaches on a swap.
    const attach = () => {
      if (cancelled) return;

      const stream = getBrowserAIStream();

      if (!stream || !videoEl) {
        // Only a never-attached camera is an error worth showing. Once it has
        // worked, a momentarily absent stream just means the AI is restarting.
        if (!isReadyRef.current) {
          if (getBrowserAIStatus() === 'error') {
            setError('Camera unavailable');
            return;
          }
          if (Date.now() > deadline) {
            setError('Camera did not start');
            return;
          }
        }
        timer = setTimeout(attach, ATTACH_POLL_MS);
        return;
      }

      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        videoEl.play().catch(() => {});
      }
      setError(null);
      setIsReady(true);
      isReadyRef.current = true;
      timer = setTimeout(attach, ATTACH_POLL_MS);
    };

    attach();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Detach only — browserAI owns this stream and is still scoring with it.
      // Stopping the tracks here would kill AI tracking every time the panel
      // unmounts (it does: CafeView drops it whenever a popup opens).
      if (videoEl) videoEl.srcObject = null;
    };
  }, [showCamera]);

  if (!showCamera) return null;

  return (
    // 👇 ใส่ nodeRef={draggableRef} ตรงนี้
    <Draggable bounds="parent" nodeRef={draggableRef}>
      <aside ref={draggableRef} className="absolute bottom-3 left-3 z-50 w-64 min-w-[200px] resize overflow-auto cursor-move rounded-lg border border-border/50 bg-black/60 shadow-lg pb-1">
        <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel pointer-events-none">
          AI Camera <span className="text-emerald-400">(Browser)</span>
        </p>

        <div className="relative pointer-events-none">
          {/* No fixed aspect box: the video lays out at the stream's own aspect
              ratio, so its rendered size matches its intrinsic size exactly and
              the absolutely-positioned canvas maps 1:1 onto it. An aspect-video
              + object-cover wrapper cropped a 4:3 stream and knocked every
              phone box out of alignment with the face underneath. */}
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="block w-full h-auto"
            style={{ transform: 'scaleX(-1)', display: isReady ? 'block' : 'none' }}
          />

          <canvas
            id="ai-canvas"
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />
        </div>

        {!isReady && (
          <div className="flex aspect-video items-center justify-center bg-black/80 pointer-events-none">
            {error
              ? <span className="text-[10px] text-red-400 text-center px-2">{error}</span>
              : <span className="text-[10px] text-muted-foreground">Loading...</span>
            }
          </div>
        )}
      </aside>
    </Draggable>
  );
}
