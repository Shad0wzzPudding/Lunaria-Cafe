import { useEffect } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { Button } from '@/components/ui/button';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function FocusTimer({ compact = false }) {
  const { state, dispatch } = useGame();
  const { status, elapsed, duration } = state.focus;

  useEffect(() => {
    if (status !== 'active') return;
    const id = setInterval(() => dispatch({ type: 'TICK_FOCUS' }), 1000);
    return () => clearInterval(id);
  }, [status, dispatch]);

  useEffect(() => {
    if (status === 'active' && elapsed >= duration) {
      dispatch({ type: 'COMPLETE_FOCUS' });
    }
  }, [elapsed, duration, status, dispatch]);

  if (compact) {
    return (
      <span className="font-mono text-sm tabular-nums text-foreground px-2 py-1 rounded-md bg-secondary/50 border border-border/30">
        {formatTime(elapsed)} / {formatTime(duration)}
        {status === 'distracted' ? (
          <span className="ml-2 text-amber-400 text-xs">distracted</span>
        ) : null}
      </span>
    );
  }

  return (
    <section className="flex flex-col items-center gap-3">
      <span className="text-3xl font-mono tabular-nums">{formatTime(elapsed)}</span>
      <span className="text-xs text-muted-foreground">of {formatTime(duration)}</span>
      <span className="flex gap-2">
        {(status === 'idle' || status === 'completed') && (
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
          <Button size="sm" onClick={() => dispatch({ type: 'START_FOCUS' })}>
            Resume
          </Button>
        )}
      </span>
    </section>
  );
}
