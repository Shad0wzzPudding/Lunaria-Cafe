import { useState } from 'react';
import { Trophy, Clock, Target, Coins, Crown, Star } from 'lucide-react';
import { useRoundParticipants } from '@/lib/liveRound/useRoundParticipants';
import {
  ROUND_MODES,
  rankByMode,
  formatRoundValue,
  formatDuration,
} from '@/lib/leaderboard/scoring';

const MODE_ICON = { overall: Trophy, time: Clock, focus: Target, reputation: Star, coins: Coins };
const MEDAL = ['text-amber-400', 'text-slate-300', 'text-amber-700'];

function RankBadge({ rank }) {
  if (rank <= 3) return <Crown className={`h-4 w-4 ${MEDAL[rank - 1]}`} aria-hidden />;
  return <span className="text-xs font-semibold text-muted-foreground tabular-nums">{rank}</span>;
}

/** Full realtime round board — used on the instructor side. */
export default function RoundLeaderboard({ roundId, currentUserId }) {
  const [mode, setMode] = useState('overall');
  const { entries, isLoading, error } = useRoundParticipants(roundId);
  const ranked = rankByMode(entries, mode);
  const ModeIcon = MODE_ICON[mode] ?? Trophy;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {ROUND_MODES.map((m) => {
          const Icon = MODE_ICON[m.key];
          const active = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card/60 text-muted-foreground hover:text-foreground border border-border/40'
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {m.label}
            </button>
          );
        })}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>}
      {error && <p className="text-sm text-amber-500 text-center py-8">{error.message}</p>}

      {!isLoading && !error && ranked.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
          Waiting for students to join…
        </div>
      )}

      {ranked.length > 0 && (
        <ol className="space-y-2">
          {ranked.map((entry) => {
            const isMe = entry.studentId === currentUserId;
            return (
              <li
                key={entry.studentId}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  isMe ? 'border-primary/60 bg-primary/10' : 'border-border/30 bg-card/60'
                }`}
              >
                <div className="flex w-6 shrink-0 items-center justify-center">
                  <RankBadge rank={entry.rank} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{entry.displayName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(entry.focus_seconds)}</span>
                    <span className="flex items-center gap-1"><Target className="h-3 w-3" />{entry.avg_focus === null ? '—' : entry.avg_focus}</span>
                    <span className="flex items-center gap-1"><Star className="h-3 w-3" />{entry.rep > 0 ? '+' : ''}{entry.rep}</span>
                    <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{entry.coins}</span>
                  </div>
                </div>
                <p className="flex shrink-0 items-center gap-1 text-base font-semibold text-foreground tabular-nums">
                  <ModeIcon className="h-4 w-4 text-primary" />
                  {formatRoundValue(entry, mode)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
