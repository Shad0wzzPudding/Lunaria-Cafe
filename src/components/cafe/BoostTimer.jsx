import { useGame } from '@/lib/gameState/useGame';
import { BOOST_WINDOW_SECONDS } from '@/lib/gameState/constants';

// m:ss remaining. ceil so the last second reads 0:01, not 0:00, before it hides.
function formatRemaining(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Live boost-window indicator: the green potion asset with the remaining
 * m:ss overlaid on top. Renders only while a focus boost is actually
 * amplifying (active + inside the window). No own interval — focus.elapsed
 * ticks via TICK_FOCUS each second, so this re-renders with it and freezes
 * naturally while the session is paused (the window is elapsed-based).
 * Meant to be dropped into a `relative` wrapper around the session button.
 */
export default function BoostTimer() {
  const { state } = useGame();
  const { boostActive, elapsed, status } = state.focus;
  const inSession = status === 'active' || status === 'paused' || status === 'distracted';
  const remaining = BOOST_WINDOW_SECONDS - (elapsed ?? 0);

  if (!boostActive || !inSession || remaining <= 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-6 -translate-x-1/2 select-none">
      <div className="relative flex items-center justify-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]">
        <img
          src="/assets/Potion_green.png"
          alt="Focus boost active"
          className="h-11 w-auto"
          draggable={false}
        />
        {/* Countdown sits ON TOP of the potion, centered, always legible. */}
        <span
          className="absolute inset-0 flex items-center justify-center font-pixel text-[10px] tabular-nums text-white"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95)' }}
        >
          {formatRemaining(remaining)}
        </span>
      </div>
    </div>
  );
}
