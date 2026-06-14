import ProgressBar from '@/components/ui/ProgressBar.jsx';

export default function DailyGoalTracker({ current = 0, goal = 60, unit = 'min' }) {
  const goalProgress = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-muted-foreground font-body">Today's Goal</span>
        <span className="font-pixel text-sm text-primary">{current}/{goal} {unit}</span>
      </div>
      
      <ProgressBar
        value={current}
        max={goal}
        heightClassName="h-3"
        trackClassName="bg-secondary"
        fillClassName="bg-gradient-to-r from-primary to-accent duration-500"
      />

      <div className="text-right mt-1 text-xs text-muted-foreground">{goalProgress}%</div>
    </div>
  );
}