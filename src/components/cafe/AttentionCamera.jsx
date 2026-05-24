import { useEffect, useRef, useState } from 'react';
import { getAIConfig, getStreamUrl, getBrowserVideoElement, getBrowserAIStatus } from '@/lib/aiIntegration';
import Draggable from 'react-draggable';

export default function AttentionCamera() {
  const { aiMode, useLiveAI } = getAIConfig();
  const videoRef = useRef(null);
  
  // 👇 เพิ่ม nodeRef ตรงนี้เพื่อแก้ปัญหา findDOMNode ของ React 18
  const draggableRef = useRef(null); 
  
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const streamSetRef = useRef(false);
  const localStreamRef = useRef(null); 

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
      // 👇 ใส่ nodeRef={draggableRef} ตรงนี้
      <Draggable bounds="parent" nodeRef={draggableRef}>
        {/* 👇 และใส่ ref={draggableRef} ตรงนี้ให้มันเชื่อมกัน */}
        <aside ref={draggableRef} className="absolute bottom-3 left-3 z-50 w-64 min-w-[200px] resize overflow-auto cursor-move rounded-lg border border-border/50 bg-black/60 shadow-lg pb-1">
          <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel pointer-events-none">
            AI Camera <span className="text-emerald-400">(Browser)</span>
          </p>
    
          <div className="relative pointer-events-none">
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="w-full aspect-video object-cover"
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

  // live mode — Python server stream
  return (
    <Draggable bounds="parent" nodeRef={draggableRef}>
      <aside ref={draggableRef} className="absolute bottom-3 left-3 z-50 w-64 min-w-[200px] resize overflow-auto cursor-move rounded-lg border border-border/50 bg-black/60 shadow-lg pb-1">
        <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel pointer-events-none">AI Camera</p>
        <img src={getStreamUrl()} alt="Focus tracker camera" className="w-full aspect-video object-cover pointer-events-none" />
      </aside>
    </Draggable>
  );
}