import { useEffect, useRef } from 'react';
import { getAIConfig, getStreamUrl, getBrowserVideoElement } from '@/lib/aiIntegration';

export default function AttentionCamera() {
  const { aiMode, useLiveAI } = getAIConfig();
  const videoRef = useRef(null);

  const showCamera = aiMode === 'browser' || aiMode === 'live' || useLiveAI;
  const isBrowserMode = aiMode === 'browser';

  useEffect(() => {
    if (!isBrowserMode || !videoRef.current) return;

    const browserVideo = getBrowserVideoElement();
    if (browserVideo && browserVideo.srcObject) {
      videoRef.current.srcObject = browserVideo.srcObject;
      videoRef.current.play().catch(() => {});
    }
  }, [isBrowserMode]);

  if (!showCamera) return null;

  if (isBrowserMode) {
    return (
      <aside className="absolute bottom-3 left-3 z-20 w-40 overflow-hidden rounded-lg border border-border/50 bg-black/60 shadow-lg">
        <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel">
          AI Camera <span className="text-emerald-400">(Browser)</span>
        </p>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video object-cover mirror"
          style={{ transform: 'scaleX(-1)' }}
        />
      </aside>
    );
  }

  const streamUrl = getStreamUrl();

  return (
    <aside className="absolute bottom-3 left-3 z-20 w-40 overflow-hidden rounded-lg border border-border/50 bg-black/60 shadow-lg">
      <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel">AI Camera</p>
      <img
        src={streamUrl}
        alt="Focus tracker camera"
        className="w-full aspect-video object-cover"
      />
    </aside>
  );
}
