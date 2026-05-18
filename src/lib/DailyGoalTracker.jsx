import ProgressBar from './ProgressBar.jsx';

export default function DailyGoalTracker({ current = 0, goal = 60, unit = 'min' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-medium text-white/80">Daily Focus Goal</h3>
      <ProgressBar value={current} max={goal} />
      <p className="mt-2 text-xs text-white/50">
        {current} / {goal} {unit}
      </p>
    </div>
  );
}
