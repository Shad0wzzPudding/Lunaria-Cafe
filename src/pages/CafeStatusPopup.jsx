import { useEffect, useRef, useState } from 'react';
import { Coins, Heart, Users, Sparkles } from 'lucide-react';
import { getChaosStage, getAIConfig, chaosGaugeFill } from '@/lib/ai/aiIntegration';
import { applyThemeSettings } from '@/lib/theme/themeDeriver';

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

function useIsFullscreen() {
  const [full, setFull] = useState(
    () => !!document.fullscreenElement || window.innerWidth >= screen.availWidth - 50
  );
  useEffect(() => {
    const update = () =>
      setFull(!!document.fullscreenElement || window.innerWidth >= screen.availWidth - 50);
    document.addEventListener('fullscreenchange', update);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return full;
}

export default function CafeStatusPopup() {
  const [data, setData] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(false);
  const { aiMode } = getAIConfig();
  const showCamera = aiMode === 'browser';
  const isFullscreen = useIsFullscreen();

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

  // Sync theme from main window so popup matches the current palette.
  useEffect(() => {
    if (!data?.themeMode) return;
    applyThemeSettings(
      {
        mode: data.themeMode,
        dayHex: data.dayHex,
        nightHex: data.nightHex,
        dayShadeHex: data.dayShadeHex,
        nightShadeHex: data.nightShadeHex,
      },
      data.timeOfDay ?? 'day'
    );
  }, [data?.themeMode, data?.dayHex, data?.nightHex, data?.dayShadeHex, data?.nightShadeHex, data?.timeOfDay]);

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

  const chaos    = data ? getChaosStage(data.attentionScore ?? 100) : null;
  // Match the main-tab gauge: performance mode keeps the stage-stepped fill,
  // otherwise the bar fills smoothly as the focus score drops.
  const chaosFill = data
    ? (data.performanceMode
        ? (data.chaosLevel ?? 0) / 3
        : chaosGaugeFill(data.attentionScore ?? 100))
    : 0;
  const phone    = data?.phoneDetected ?? false;
  const present  = data?.userPresent ?? true;
  const focused  = !phone && present && (data?.attentionScore ?? 100) >= 65;
  const badgeLabel = phone ? ' DISTRACTED ' : focused ? ' FOCUSED ' : ' NOT FOCUSED ';
  const badgeBg    = phone ? 'rgba(200,0,0,0.9)' : focused ? 'rgba(34,139,34,0.9)' : 'rgba(0,140,255,0.9)';

  const stats = data
    ? [
        { icon: Coins,    value: data.coins ?? 0,                                   color: '#f0c674' },
        { icon: Heart,    value: `${data.reputation ?? 0}%`,                        color: '#f0a0b8' },
        { icon: Users,    value: `${data.customers ?? 0}/${data.maxCustomers ?? 8}`,color: '#9ec8e8' },
        { icon: Sparkles, value: data.attentionScore ?? 100,                        color: chaos.color },
      ]
    : [];

  return (
    <div className="dark h-screen bg-background text-foreground flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/30 bg-card/40 backdrop-blur-sm">
        <span className="font-pixel text-xs text-primary">The cafe is still going!</span>
        {data && (
          <span className="font-pixel text-xs text-muted-foreground tabular-nums">
            {formatElapsed(data.elapsed ?? 0)}
          </span>
        )}
      </div>

      {/* Camera feed — or spacer when camera is off */}
      {!showCamera && <div className="flex-1" />}
      {showCamera && (
        <div className="relative bg-black w-full flex-1 min-h-0 overflow-hidden">
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

          {/* AI status overlays */}
          {data && (
            <>
              {/* Focus badge + score — top right */}
              <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 pointer-events-none">
                <div className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
                  style={{ background: badgeBg, fontFamily: '"Segoe UI", sans-serif' }}>
                  {badgeLabel}
                </div>
                <div className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
                  style={{ background: 'rgba(20,20,20,0.85)', fontFamily: '"Segoe UI", sans-serif' }}>
                  FS: {data.attentionScore ?? 100}
                </div>
              </div>

              {/* Phone bounding boxes */}
              {(data.phones ?? []).map((box, i) => {
                const mirroredLeft = (1 - box.x1 - box.w) * 100;
                return (
                  <div key={i} className="absolute pointer-events-none"
                    style={{
                      left:   `${mirroredLeft}%`,
                      top:    `${box.y1 * 100}%`,
                      width:  `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                      border: '2px solid rgb(255,0,0)',
                      zIndex: 25,
                    }}>
                    <span className="absolute -top-5 left-0 px-1 text-[10px] font-bold text-white"
                      style={{ background: 'rgba(200,0,0,0.85)', fontFamily: '"Segoe UI", sans-serif', whiteSpace: 'nowrap' }}>
                      Phone {Math.round(box.conf * 100)}%
                    </span>
                  </div>
                );
              })}

              {/* Warning — center. While paused, always show the pause
                  notice instead of (stale) distraction warnings. */}
              {(data.status === 'paused' || data.warningMessage) && (
                <div className="absolute inset-x-0 z-20 flex items-center justify-center pointer-events-none"
                  style={{ top: '50%', transform: 'translateY(-50%)' }}>
                  <div className="w-full py-2 text-center text-[13px] font-bold pointer-events-none"
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      color: data.status === 'paused' ? 'rgb(130,200,255)' : 'rgb(255,60,60)',
                      fontFamily: '"Segoe UI", sans-serif',
                    }}>
                    {data.status === 'paused'
                      ? 'AI paused — no score is being reduced!'
                      : data.warningMessage}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Chaos gauge overlay */}
          <div className={`absolute top-0 left-0 z-10 ${isFullscreen ? 'w-[22%]' : 'w-[45%]'} -translate-x-[5%] -translate-y-[22%] select-none pointer-events-none`}>
            <div className="relative w-full" style={{ clipPath: 'inset(0 14% 0 0)' }}>
              <div
                className="absolute overflow-hidden rounded-sm"
                style={{ left: '33%', top: '41.5%', width: '50%', height: '18%' }}
              >
                <div
                  className="h-full w-full rounded-sm"
                  style={{
                    backgroundColor: '#876ade',
                    transform: `scaleX(${chaosFill})`,
                    transformOrigin: 'left',
                    transition: 'transform 0.6s ease-out',
                  }}
                />
              </div>
              <img
                src="/assets/UI/Chaos_gauge.png"
                alt=""
                draggable={false}
                className="relative w-full"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {!data ? (
        <div className="shrink-0 flex items-center justify-center py-3">
          <span className="font-pixel text-[10px] text-muted-foreground animate-pulse">
            Connecting...
          </span>
        </div>
      ) : (
        <div className="shrink-0 flex flex-wrap justify-center gap-2 px-3 py-2">
          {stats.map((s, i) => (
            <StatPill key={i} icon={s.icon} value={s.value} color={s.color} />
          ))}
        </div>
      )}
    </div>
  );
}
