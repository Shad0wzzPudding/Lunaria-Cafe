import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Trophy, Star, Coins, Clock, Target, Crown } from 'lucide-react';
import {
  MODES,
  scoreEntries,
  rankByMode,
  formatModeValue,
  formatDuration,
} from '@/lib/leaderboard/scoring';

async function fetchLeaderboard(roomId) {
  const { data, error } = await supabase.rpc('get_classroom_leaderboard', {
    _classroom_id: roomId,
  });
  if (error) throw error;
  return data ?? [];
}

const MODE_ICON = {
  overall: Trophy,
  reputation: Star,
  focus: Target,
  time: Clock,
  coins: Coins,
};

const MEDAL = ['text-amber-400', 'text-slate-300', 'text-amber-700'];

function RankBadge({ rank }) {
  if (rank <= 3) {
    return <Crown className={`h-4 w-4 ${MEDAL[rank - 1]}`} aria-hidden />;
  }
  return <span className="text-xs font-semibold text-muted-foreground tabular-nums">{rank}</span>;
}

/** Small secondary metrics shown under each row. */
function MetricPills({ entry }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{entry.reputation}</span>
      <span className="flex items-center gap-1"><Target className="h-3 w-3" />{entry.last_focus_score === null ? '—' : entry.last_focus_score}</span>
      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(entry.total_focus_seconds)}</span>
      <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{entry.coins}</span>
    </div>
  );
}

/**
 * Reusable classroom leaderboard.
 * Self-contained (no game state) so it renders in both the dark
 * student UI and the light instructor UI via semantic tokens.
 */
export default function Leaderboard({ roomId, roomName, currentUserId }) {
  const [mode, setMode] = useState('overall');

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['classroom-leaderboard', roomId],
    queryFn: () => fetchLeaderboard(roomId),
    enabled: !!roomId,
  });

  const ranked = useMemo(() => rankByMode(scoreEntries(rows ?? []), mode), [rows, mode]);

  const ModeIcon = MODE_ICON[mode] ?? Trophy;

  return (
    <div className="space-y-5">
      {roomName && (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground/90 font-medium">{roomName}</span> — best of the best
        </p>
      )}

      {/* Mode selector */}
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => {
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

      {isLoading && <p className="text-sm text-muted-foreground text-center py-10">Loading rankings…</p>}
      {error && (
        <p className="text-sm text-amber-500 text-center py-10">Could not load leaderboard: {error.message}</p>
      )}

      {!isLoading && !error && ranked.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">
          No one to rank yet — play a session to get on the board.
        </div>
      )}

      {!isLoading && !error && ranked.length > 0 && (
        <ol className="space-y-2">
          {ranked.map((entry) => {
            const isMe = entry.studentId === currentUserId;
            return (
              <li
                key={entry.studentId}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  isMe
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border/30 bg-card/60'
                }`}
              >
                <div className="flex w-6 shrink-0 items-center justify-center">
                  <RankBadge rank={entry.rank} />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground"
                    title={entry.displayName}
                  >
                    {entry.displayName}
                    {isMe && <span className="text-[10px] font-normal text-primary">(you)</span>}
                  </p>
                  <MetricPills entry={entry} />
                </div>

                <div className="shrink-0 text-right">
                  <p className="flex items-center justify-end gap-1 text-base font-semibold text-foreground tabular-nums">
                    <ModeIcon className="h-4 w-4 text-primary" />
                    {formatModeValue(entry, mode)}
                  </p>
                  {mode !== 'overall' && (
                    <p className="text-[10px] text-muted-foreground">overall {entry.overall}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
