import { useEffect, useRef, useState } from 'react';
import { getAIConfig, getStreamUrl, getBrowserVideoElement, getBrowserAIStatus } from '@/lib/aiIntegration';

export default function AttentionCamera() {
  const { aiMode, useLiveAI } = getAIConfig();
  const videoRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const streamSetRef = useRef(false);

  const showCamera = aiMode === 'browser' || aiMode === 'live' || useLiveAI;
  const isBrowserMode = aiMode === 'browser';

  useEffect(() => {
    if (!isBrowserMode || !videoRef.current) {
      streamSetRef.current = false;
      setIsReady(false);
      setError(null);
      return;
    }

    const checkBrowserVideo = () => {
      const browserVideo = getBrowserVideoElement();
      const status = getBrowserAIStatus();
      
      if (status === 'error') {
        setError('Camera error');
        setIsReady(false);
        return;
      }

      if (browserVideo && browserVideo.srcObject && status === 'active') {
        // Only set srcObject once to avoid permission spam on iOS
        if (!streamSetRef.current || videoRef.current.srcObject !== browserVideo.srcObject) {
          videoRef.current.srcObject = browserVideo.srcObject;
          videoRef.current.play()
            .then(() => {
              setIsReady(true);
              setError(null);
            })
            .catch((err) => {
              console.error('Video play error:', err);
              setError('Failed to play video');
              setIsReady(false);
            });
          streamSetRef.current = true;
        } else if (videoRef.current.readyState >= 2) {
          // Video is ready to play
          setIsReady(true);
          setError(null);
        }
      } else if (status === 'loading') {
        setIsReady(false);
        setError(null);
      } else {
        setIsReady(false);
        setError('Camera not ready');
      }
    };

    checkBrowserVideo();
    const interval = setInterval(checkBrowserVideo, 500);

    return () => {
      clearInterval(interval);
      streamSetRef.current = false;
    };
  }, [isBrowserMode]);

  if (!showCamera) return null;

  if (isBrowserMode) {
    return (
      <aside className="absolute bottom-3 left-3 z-20 w-40 overflow-hidden rounded-lg border border-border/50 bg-black/60 shadow-lg">
        <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel">
          AI Camera <span className="text-emerald-400">(Browser)</span>
        </p>
        {!isReady ? (
          <div className="flex aspect-video items-center justify-center bg-black/80">
            {error ? (
              <span className="text-[10px] text-red-400 text-center px-2">{error}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Loading...</span>
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-video object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}
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
