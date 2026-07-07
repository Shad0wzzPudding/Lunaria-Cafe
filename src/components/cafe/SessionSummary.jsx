import { useGame } from '@/lib/gameState/useGame';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Coins, Heart, Sparkles, AlertTriangle, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFocusPanelStyle, getThemeHex, tintTowardTheme } from '@/lib/theme/themeDeriver';

// Semantic variant colors for up / no-change / down. In Immersive mode they're
// tinted toward the active theme hue; otherwise they use their plain values.
const VARIANT_BASE = { up: '#16a34a', down: '#f87171', neutral: '#9ca3af' };
function variantColor(kind, immersive, themeHex) {
  if (kind === 'neutral' && !immersive) return 'var(--muted-foreground)';
  const base = VARIANT_BASE[kind];
  return immersive && themeHex ? tintTowardTheme(base, themeHex) : base;
}

const IS_PHONE = /iPhone|Android.*Mobile/i.test(navigator.userAgent);

const DONE_MESSAGES = [
  "Great work today! ☆",
  "The cafe is proud of you!",
  "Another session done~",
  "You're on a roll! Keep it up!",
  "The customers loved your energy!",
  "One step closer to your goals!",
  "Rest well, you earned it!",
  "Wonderful focus today!",
  "You make this cafe shine!",
  "See you next session~ ♪",
];

const FAIL_MESSAGES = [
  "It's okay! Try again~",
  "Don't worry, tomorrow is new!",
  "The cafe still loves you!",
  "Rest up and come back stronger!",
  "Even heroes take breaks...",
  "A stumble is not a fall!",
];

function PixelBubble({ message }) {
  return (
    <motion.div
      className="fixed z-50 pointer-events-none select-none"
      style={{ bottom: 'min(356px, 51vh)', left: '316px' }}
      initial={{ opacity: 0, scale: 0.7, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 8 }}
      transition={{ duration: 0.25, ease: 'easeOut', delay: 0.5 }}
    >
      <div className="relative">
        {/* Bubble body */}
        <div
          className="font-pixel text-[13px] leading-snug text-[#2a2040] bg-[#fef9f0] max-w-[192px]"
          style={{
            border: '4px solid #2a2040',
            padding: '10px 14px',
            imageRendering: 'pixelated',
          }}
        >
          {message}
        </div>

        {/* Pixel tail — points left toward Lulys */}
        <div className="absolute" style={{ left: '-11px', top: '50%', transform: 'translateY(-50%)' }}>
          {/* outer step */}
          <div style={{ width: '4px', height: '22px', background: '#2a2040', position: 'absolute', left: '0', top: '50%', transform: 'translateY(-50%)' }} />
          {/* inner step */}
          <div style={{ width: '4px', height: '14px', background: '#2a2040', position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)' }} />
          {/* fill (matches bubble bg) */}
          <div style={{ width: '4px', height: '7px', background: '#fef9f0', position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)', marginTop: '4px' }} />
        </div>
      </div>
    </motion.div>
  );
}

export default function SessionSummary() {
  const { state, dispatch } = useGame();
  const [shake, setShake] = useState(false);
  const [hint, setHint] = useState(false);
  const s = state.lastSession;
  const isFail = s?.endReason === 'distracted';
  // Streak is earned only when the timer runs out (endReason 'completed').
  // A manually stopped or failed session counts, but earns no streak.
  const noStreak = s ? s.endReason !== 'completed' : false;

  // Semantic-color variants (Reputation + Streak) follow the theme in Immersive.
  const immersive = state.cafe?.bgMode === 'immersive';
  const themeHex  = immersive ? getThemeHex(state.cafe?.timeOfDay ?? 'day') : null;

  const streakBefore = s?.streakBefore ?? 0;
  const streakAfter  = s?.streakAfter ?? streakBefore;
  const streakDelta  = streakAfter - streakBefore;
  const streakKind   = streakDelta > 0 ? 'up' : streakDelta < 0 ? 'down' : 'neutral';
  const streakDeltaStr = streakDelta > 0 ? `+${streakDelta}` : streakDelta < 0 ? `${streakDelta}` : '±0';
  const repGain  = s?.reputationGain ?? 0;
  const repKind  = repGain > 0 ? 'up' : repGain < 0 ? 'down' : 'neutral';

  // Message varies per session but is derived purely (render must stay
  // side-effect free): the session's own numbers seed the pick.
  const message = useMemo(() => {
    if (!s) return '';
    const pool = isFail ? FAIL_MESSAGES : DONE_MESSAGES;
    const seed =
      (s.durationSeconds ?? 0) * 7 +
      (s.coinsEarned ?? 0) * 13 +
      (s.attentionScore ?? 0) * 3 +
      (s.distractions ?? 0);
    return pool[seed % pool.length];
  }, [s, isFail]);
  const characterImg = isFail
    ? '/assets/Character/lulys_finish(fail).png'
    : '/assets/Character/Lulys_finish(done).png';

  const handleBackdropClick = () => {
    setShake(true);
    setHint(true);
    setTimeout(() => setShake(false), 500);
    setTimeout(() => setHint(false), 2500);
  };

  function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <AnimatePresence>
      {s && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Character art + speech bubble — hidden on phones */}
          {!IS_PHONE && (
            <>
              <motion.img
                src={characterImg}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="fixed bottom-0 left-0 z-50 h-[min(489px,70vh)] w-auto object-contain drop-shadow-xl pointer-events-none select-none"
                style={{ imageRendering: 'pixelated' }}
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
              />
              <PixelBubble message={message} />

              {/* A little P.S. Lulys left when the cafe lost reputation */}
              {repGain < 0 && (
                <motion.div
                  className="fixed z-50 pointer-events-none select-none"
                  style={{ bottom: '28px', left: '300px', maxWidth: '320px' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut', delay: 0.9 } }}
                  exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                >
                  <p
                    className="font-body text-[12px] italic leading-snug text-rose-200/90"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
                  >
                    P.S. The customers felt a little uneasy this visit — hoping for a calmer one next time.
                    <span className="block mt-0.5 not-italic text-rose-300/80 text-right">— Lulys ☕</span>
                  </p>
                </motion.div>
              )}
            </>
          )}

          {/* Modal wrapper */}
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 gap-3"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={handleBackdropClick}
          >
          {/* Hint message */}
          <AnimatePresence>
            {hint && (
              <motion.div
                className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-4 py-2"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <p className="text-xs text-amber-400 font-body text-center">
                  Press "Back to Cafe" to proceed!
                </p>
              </motion.div>
            )}
          </AnimatePresence>

            {/* Card + side notes. The wrapper keeps the card's width so the
                card stays screen-centred; the notes float beside it (absolute)
                without shifting the summary. */}
            <div className="relative w-full max-w-xs">
            {/* Card — everything inside here */}
            <motion.div
              className="w-full rounded-2xl border border-violet-500/30 bg-card/95 backdrop-blur-md p-6 space-y-5 shadow-2xl"
              style={getFocusPanelStyle()}
              animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Title */}
              <div className="text-center space-y-1">
                <h2 className="font-pixel text-base text-white">Closing Time!</h2>
                <p className="text-xs text-muted-foreground font-body">
                  Here's how your cafe went
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={<Clock className="w-3.5 h-3.5 text-blue-400" />}
                  label="Focused" value={formatDuration(s.durationSeconds)} color="text-white" />

                <StatCard icon={<Sparkles className="w-3.5 h-3.5 text-emerald-300" />}
                  label="Focus Score" value={s.attentionScore} color="text-emerald-300" />

                <StatCard icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
                  label="Coins Earned" value={`+${s.coinsEarned}`} color="text-amber-300" />

                <StatCard icon={<Heart className="w-3.5 h-3.5 text-rose-300" />}
                  label="Reputation"
                  value={s.reputationGain > 0 ? `+${s.reputationGain}%` : `${s.reputationGain}%`}
                  colorStyle={variantColor(repKind, immersive, themeHex)} />

                <StatCard icon={<Flame className="w-3.5 h-3.5 text-amber-400" />}
                  label="Streak"
                  value={`${streakAfter}d (${streakDeltaStr})`}
                  colorStyle={variantColor(streakKind, immersive, themeHex)} />

                <StatCard icon={<AlertTriangle className="w-3.5 h-3.5 text-orange-400" />}
                  label="Distractions" value={s.distractions}
                  color={s.distractions > 0 ? "text-orange-400" : "text-muted-foreground"} />
              </div>

              {/* Button */}
              <Button
                className="w-full font-pixel text-xs"
                onClick={() => dispatch({ type: 'CLEAR_SESSION_SUMMARY' })}
              >
                Back to Cafe
              </Button>
            </motion.div>

            {/* After-session notes — beside the card, each in its own box */}
            {(s.diligenceRep >= 1 || noStreak) && (
              <div
                className="absolute left-full top-0 ml-3 w-56 space-y-2"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="font-pixel text-xs text-white/90 px-1">After-Session notes~</h3>
                {s.diligenceRep >= 1 && (
                  <div className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-3 py-2">
                    <p className="font-body text-[11px] text-rose-200 leading-snug">
                      You earned {s.sessionRep} session rep — +{s.diligenceRep} Rep added to your lifetime for your diligence! 🌟
                    </p>
                  </div>
                )}
                {noStreak && (
                  <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2">
                    <p className="font-body text-[11px] text-amber-300 leading-snug">
                      No streak for this one — the session ended before the timer finished.
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatCard({ icon, label, value, color, colorStyle }) {
  return (
    <div className="rounded-lg bg-black/30 p-3 flex flex-col items-center gap-1">
      {icon}
      <span
        className={`font-pixel text-sm ${colorStyle ? '' : (color ?? '')}`}
        style={colorStyle ? { color: colorStyle } : undefined}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[10px] font-body">{label}</span>
    </div>
  );
}