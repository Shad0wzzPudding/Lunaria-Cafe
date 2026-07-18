// =============================================================================
// CafeStatusOverlay — reserved for Option B: Document Picture-in-Picture API
// =============================================================================
//
// WHAT THIS IS:
//   This component renders the "cafe check-in" UI (header, live camera feed,
//   stat pills). It was originally used as an in-page overlay but is currently
//   NOT mounted anywhere — we went with Option A (window.open popup) instead.
//
// OPTION B — Document Picture-in-Picture:
//   The Document PiP API lets you pop any HTML/React content into a small
//   floating window that stays ON TOP of all other apps — even when you switch
//   to VS Code, Notion, etc. Unlike window.open(), it never gets buried.
//
//   To implement it, you would do something like:
//
//     const pipWindow = await window.documentPictureInPicture.requestWindow({
//       width: 380,
//       height: 460,
//     });
//     // Copy stylesheets so Tailwind works inside the PiP window
//     [...document.styleSheets].forEach(sheet => {
//       try { pipWindow.document.adoptedStyleSheets = [...document.adoptedStyleSheets]; }
//       catch {}
//     });
//     // Render this component into the PiP window via a React portal
//     ReactDOM.createPortal(<CafeStatusOverlay state={state} onClose={...} />, pipWindow.document.body);
//
// LIMITATIONS (why we haven't done this yet):
//   - Chrome 116+ only. Firefox and Safari do not support it at all.
//   - Requires a direct user gesture to open (button click inside the page).
//   - The window closes automatically when the user navigates away.
//   - Styling needs manual stylesheet copying — Tailwind classes won't work
//     out of the box inside the PiP window without extra setup.
//
// HOW TO SWITCH FROM OPTION A TO OPTION B:
//   1. In CafeView.jsx, replace openStatusPopup() with a documentPiP call.
//   2. Use a React portal to render this component into the PiP window.
//   3. Remove CafeStatusPopup.jsx and the window.name detection in App.jsx.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Coins, Heart, Users, Sparkles } from 'lucide-react';
import { getAIConfig, getChaosStage, formatFocusScore } from '@/lib/ai/aiIntegration';

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

export default function CafeStatusOverlay({ state, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(false);
  const { aiMode } = getAIConfig();
  const showCamera = aiMode === 'browser';
  const chaos = getChaosStage(state.attention.score ?? 100);

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

  const stats = [
    { icon: Coins,    value: state.coins ?? 0,                                                      color: '#f0c674' },
    { icon: Heart,    value: `${state.reputation ?? 0}%`,                                           color: '#f0a0b8' },
    { icon: Users,    value: `${state.cafe.currentCustomers ?? 0}/${state.cafe.maxCustomers ?? 8}`, color: '#9ec8e8' },
    { icon: Sparkles, value: formatFocusScore(state.attention.score ?? 100),                         color: chaos.color },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <motion.div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md overflow-hidden"
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -30, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <span className="font-pixel text-xs text-primary">The cafe is still going!</span>
          <div className="flex items-center gap-3">
            <span className="font-pixel text-xs text-muted-foreground tabular-nums">
              {formatElapsed(state.focus.elapsed ?? 0)}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Camera */}
        {showCamera && (
          <div className="relative bg-black aspect-video w-full">
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
        <div className="flex flex-wrap justify-center gap-2 px-4 py-3">
          {stats.map((s, i) => (
            <StatPill key={i} icon={s.icon} value={s.value} color={s.color} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
