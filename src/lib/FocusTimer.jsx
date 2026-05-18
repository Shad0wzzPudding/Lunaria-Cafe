import { useEffect, useState } from 'react';

export default function FocusTimer({ durationMinutes = 25, onComplete }) {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [running, secondsLeft, onComplete]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-4xl font-mono tabular-nums">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={() => setRunning((prev) => !prev)}
        className="rounded-lg bg-violet-600 px-4 py-2 text-white"
      >
        {running ? 'Pause' : 'Start'}
      </button>
    </div>
  );
}
