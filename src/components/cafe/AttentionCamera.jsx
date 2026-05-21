import { useEffect, useRef, useState } from 'react';
import { getAIConfig, getStreamUrl, getBrowserVideoElement, getBrowserAIStatus } from '@/lib/aiIntegration';

export default function AttentionCamera() {
  const { aiMode, useLiveAI } = getAIConfig();
  const videoRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const streamSetRef = useRef(false);
  const localStreamRef = useRef(null); // 👈 direct webcam fallback

  const showCamera = aiMode === 'browser' || aiMode === 'live' || useLiveAI;
  const isBrowserMode = aiMode === 'browser';

  useEffect(() => {
    if (!isBrowserMode || !videoRef.current) {
      setIsReady(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const tryBrowserAI = () => {
  const browserVideo = getBrowserVideoElement();
  const status = getBrowserAIStatus();

  if (status === 'active' && browserVideo?.srcObject) {
    // ← Only reassign if not already playing the same stream
    const alreadyPlaying = streamSetRef.current && 
                           videoRef.current.srcObject === browserVideo.srcObject &&
                           !videoRef.current.paused;
    if (!alreadyPlaying) {
      videoRef.current.srcObject = browserVideo.srcObject;
      videoRef.current.play().then(() => {
        if (!cancelled) { setIsReady(true); setError(null); }
      }).catch(() => {});
      streamSetRef.current = true;
    }
    return true;
  }
  return false;
};

    // 👇 fallback: request webcam directly if browserAI not ready
    const tryDirectWebcam = async () => {
      if (streamSetRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        streamSetRef.current = true;
        setIsReady(true);
        setError(null);
      } catch (err) {
        if (!cancelled) setError('Camera permission denied');
      }
    };

    // Try browserAI first, fall back to direct webcam
    if (!tryBrowserAI()) {
      tryDirectWebcam();
    }

    const interval = setInterval(() => {
    if (!cancelled) {
    const success = tryBrowserAI();
    if (success) clearInterval(interval); // ← stop polling once stream is live
  }
}, 500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      streamSetRef.current = false;
      // Stop direct webcam stream on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [isBrowserMode]);

  if (!showCamera) return null;

if (isBrowserMode) {
  return (
    <aside className="absolute bottom-3 left-3 z-20 w-40 overflow-hidden rounded-lg border border-border/50 bg-black/60 shadow-lg">
      <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel">
        AI Camera <span className="text-emerald-400">(Browser)</span>
      </p>

      {/* Always render video so videoRef.current is available to useEffect */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className="w-full aspect-video object-cover"
        style={{ transform: 'scaleX(-1)', display: isReady ? 'block' : 'none' }}
      />

      {/* Overlay shown while not ready */}
      {!isReady && (
        <div className="flex aspect-video items-center justify-center bg-black/80">
          {error
            ? <span className="text-[10px] text-red-400 text-center px-2">{error}</span>
            : <span className="text-[10px] text-muted-foreground">Loading...</span>
          }
        </div>
      )}
    </aside>
  );
}

  // live mode — Python server stream
  return (
    <aside className="absolute bottom-3 left-3 z-20 w-40 overflow-hidden rounded-lg border border-border/50 bg-black/60 shadow-lg">
      <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel">AI Camera</p>
      <img src={getStreamUrl()} alt="Focus tracker camera" className="w-full aspect-video object-cover" />
    </aside>
  );
}