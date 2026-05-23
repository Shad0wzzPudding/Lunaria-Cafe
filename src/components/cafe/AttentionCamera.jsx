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
  if (!isBrowserMode || !videoRef.current) return;

  let cancelled = false;

  const startDisplayCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: false 
      });
      
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      localStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (!cancelled) {
        setIsReady(true);
        setError(null);
      }
    } catch (err) {
      if (!cancelled) setError('Camera permission denied');
    }
  };

  startDisplayCamera();

  return () => {
    cancelled = true;
    // Stop display stream on unmount
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
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
  
        {/* ห่อกล้องและ Canvas ไว้ด้วยกัน */}
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full aspect-video object-cover"
            style={{ transform: 'scaleX(-1)', display: isReady ? 'block' : 'none' }}
          />
          
          {/* 👇 นี่คือจุดเปลี่ยนชีวิต! ใส่ Canvas ทับวิดีโอเอาไว้ */}
          <canvas
            id="ai-canvas"
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            
          />
        </div>
  
        {!isReady && (
          // ... (โค้ด overlay Loading ตอนกล้องยังไม่มา ปล่อยไว้เหมือนเดิมครับ)
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