import { useEffect, useState } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { Button } from '@/components/ui/button';

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FocusTimer({ compact = false }) {
  const { state, dispatch } = useGame();
  const { status, elapsed, duration, roundControlled, endsAt } = state.focus;

  // Per-second tick that drives elapsed / scoring — only while active.
  useEffect(() => {
    if (status !== 'active') return;
    const id = setInterval(() => dispatch({ type: 'TICK_FOCUS' }), 1000);
    return () => clearInterval(id);
  }, [status, dispatch]);

  // A live round owns its own end (the provider completes it at ends_at,
  // even through pauses), so the local elapsed-based auto-complete is only
  // for normal solo sessions.
  useEffect(() => {
    if (!roundControlled && status === 'active' && elapsed >= duration) {
      dispatch({ type: 'COMPLETE_FOCUS' });
    }
  }, [elapsed, duration, status, roundControlled, dispatch]);

  // Wall-clock tick so a round countdown keeps moving even while paused.
  // (Kept in state — reading Date.now() during render isn't allowed.)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!roundControlled || !endsAt) return;
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0); // refresh promptly without a sync setState
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, [roundControlled, endsAt]);

  const roundRemaining = (endsAt - now) / 1000;

  // What the clock shows.
  let label;
  if (roundControlled && endsAt) {
    label = `${formatTime(roundRemaining)} left`;
  } else if (roundControlled) {
    label = `${formatTime(elapsed)} · live`;
  } else {
    label = `${formatTime(elapsed)} / ${formatTime(duration)}`;
  }

  if (compact) {
    return (
      <span className="font-mono text-sm tabular-nums text-foreground px-2 py-1 rounded-md bg-secondary/50 border border-border/30">
        {label}
        {status === 'paused' ? (
          <span className="ml-2 text-sky-400 text-xs">paused</span>
        ) : status === 'distracted' ? (
          <span className="ml-2 text-amber-400 text-xs">distracted</span>
        ) : null}
      </span>
    );
  }

  return (
    <section className="flex flex-col items-center gap-3">
      <span className="text-3xl font-mono tabular-nums">
        {roundControlled && endsAt ? formatTime(roundRemaining) : formatTime(elapsed)}
      </span>
      <span className="text-xs text-muted-foreground">
        {roundControlled ? (endsAt ? 'left in session' : 'live session') : `of ${formatTime(duration)}`}
      </span>
      {/* A live round is teacher-controlled: only pause/resume is offered. */}
      <span className="flex gap-2">
        {!roundControlled && (status === 'idle' || status === 'completed') && (
          <Button size="sm" onClick={() => dispatch({ type: 'START_FOCUS' })}>
            Start
          </Button>
        )}
        {status === 'active' && (
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'PAUSE_FOCUS' })}>
            Pause
          </Button>
        )}
        {status === 'paused' && (
          <Button size="sm" onClick={() => dispatch({ type: 'RESUME_FOCUS' })}>
            Resume
          </Button>
        )}
      </span>
    </section>
  );
}
