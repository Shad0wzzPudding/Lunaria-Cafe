import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar.jsx';
import { useGame } from '@/lib/gameState/GameProvider.jsx';

function CircleProgress({ pct, size = 48, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, pct / 100));
  const done = pct >= 100;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          stroke={done ? '#4ade80' : 'rgba(74,222,128,0.3)'}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {done
          ? <Check className="w-4 h-4 text-green-400" strokeWidth={2.5} />
          : <span className="font-pixel text-[9px] text-muted-foreground">{pct}%</span>
        }
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export default function DailyGoalTracker({ current = 0, goal = 3600 }) {
  const { dispatch } = useGame();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(0);

  const goalProgress = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

  const startEdit = () => {
    setHours(Math.floor(goal / 3600));
    setMins(Math.floor((goal % 3600) / 60));
    setEditing(true);
  };

  const confirm = () => {
    const totalMins = (Number(hours) || 0) * 60 + (Number(mins) || 0);
    if (totalMins > 0) dispatch({ type: 'SET_DAILY_GOAL', payload: totalMins });
    setEditing(false);
  };

  const totalMins = (Number(hours) || 0) * 60 + (Number(mins) || 0);

  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2.5">
          <CircleProgress pct={goalProgress} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-body">Today's Goal</span>
            {!editing && (
              <button
                onClick={startEdit}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Edit goal"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="number" min="0" max="23"
              value={hours}
              onChange={e => setHours(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
              className="w-12 rounded border border-border/40 bg-secondary/30 px-1 py-0.5 text-center font-pixel text-xs text-foreground"
            />
            <span className="font-pixel text-xs text-muted-foreground">h</span>
            <input
              type="number" min="0" max="59"
              value={mins}
              onChange={e => setMins(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
              className="w-12 rounded border border-border/40 bg-secondary/30 px-1 py-0.5 text-center font-pixel text-xs text-foreground"
            />
            <span className="font-pixel text-xs text-muted-foreground">m</span>
            <button
              onClick={confirm}
              disabled={totalMins === 0}
              className="ml-1 text-green-400 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Save"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="font-pixel text-sm text-primary">
            {formatTime(current)} / {formatTime(goal)}
          </span>
        )}
      </div>

      <ProgressBar
        value={current}
        max={goal}
        heightClassName="h-3"
        trackClassName="bg-secondary"
        fillClassName="bg-green-400/30 duration-500"
      />

    </div>
  );
}
