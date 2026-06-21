import { useEffect, useRef, useState } from 'react';
import { Coins, Heart, Users, Sparkles } from 'lucide-react';
import { getChaosStage, getAIConfig } from '@/lib/ai/aiIntegration';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatPill({ icon: Icon, value, color }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-black/30 px-3 py-1.5">
      <Icon size={13} strokeWidth={2} style={{ color }} />
      <span className="font-pixel text-xs text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export default function CafeStatusPopup() {
  const [data, setData] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(false);
  const { aiMode } = getAIConfig();
  const showCamera = aiMode === 'browser';

  useEffect(() => {
    const channel = new BroadcastChannel('cafe-status');
    channel.onmessage = (e) => setData(e.data);
    return () => channel.close();
  }, []);

  // Auto-close when session ends
  useEffect(() => {
    if (data?.status && data.status !== 'active' && data.status !== 'paused') {
      window.close();
    }
  }, [data?.status]);

  useEffect(() => {
    if (!showCamera) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!cancelled) setCamReady(true);
      } catch {
        if (!cancelled) setCamError(true);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [showCamera]);

  const chaos = data ? getChaosStage(data.attentionScore ?? 100) : null;

  const stats = data
    ? [
        { icon: Coins,    value: data.coins ?? 0,                                   color: '#f0c674' },
        { icon: Heart,    value: `${data.reputation ?? 0}%`,                        color: '#f0a0b8' },
        { icon: Users,    value: `${data.customers ?? 0}/${data.maxCustomers ?? 8}`,color: '#9ec8e8' },
        { icon: Sparkles, value: data.attentionScore ?? 100,                        color: chaos.color },
      ]
    : [];

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-sm">
        <span className="font-pixel text-xs text-primary">The cafe is still going!</span>
        {data && (
          <span className="font-pixel text-xs text-muted-foreground tabular-nums">
            {formatElapsed(data.elapsed ?? 0)}
          </span>
        )}
      </div>

      {/* Camera feed */}
      {showCamera && (
        <div className="relative bg-black w-full" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)', display: camReady ? 'block' : 'none' }}
          />
          {!camReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-pixel text-[10px] text-muted-foreground">
                {camError ? 'Camera unavailable' : 'Starting camera...'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {!data ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-pixel text-[10px] text-muted-foreground animate-pulse">
            Connecting...
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2 px-4 py-4">
          {stats.map((s, i) => (
            <StatPill key={i} icon={s.icon} value={s.value} color={s.color} />
          ))}
        </div>
      )}
    </div>
  );
}
