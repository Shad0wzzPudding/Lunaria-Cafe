import { useState } from 'react';
import { Trophy, Clock, Target, Coins, Crown, Star, ZapOff, PauseCircle } from 'lucide-react';
import { useRoundParticipants } from '@/lib/liveRound/useRoundParticipants';
import {
  ROUND_MODES,
  rankRoundByMode,
  formatRoundValue,
  formatDuration,
} from '@/lib/leaderboard/scoring';

const MODE_ICON = { overall: Trophy, time: Clock, focus: Target, reputation: Star, coins: Coins };

// Spelled out on hover — the chip itself has room for a word, not a sentence.
const ATTENDANCE_HINT = {
  full: 'Present for the whole session',
  'left early': 'Left the session and did not come back',
  'went quiet': 'Stopped reporting before the session ended',
  rejoined: 'Left at least once during the session, then came back',
  'paused >50%': 'Paused for more than half the session',
};
const MEDAL = ['text-amber-400', 'text-slate-300', 'text-amber-700'];

function RankBadge({ rank }) {
  if (rank <= 3) return <Crown className={`h-4 w-4 ${MEDAL[rank - 1]}`} aria-hidden />;
  return <span className="text-xs font-semibold text-muted-foreground tabular-nums">{rank}</span>;
}

/**
 * Full round board — the live instructor view, and (with live={false})
 * the final standings of an ended round in the history tab. The flag is
 * forwarded rather than assumed, so history doesn't silently re-open a
 * realtime channel the caller asked not to have.
 */
export default function RoundLeaderboard({ roundId, currentUserId, live = true, endedAt = null, roundSeconds = null }) {
  const [mode, setMode] = useState('overall');
  const { entries, isLoading, error } = useRoundParticipants(roundId, { live, endedAt, roundSeconds });
  const ranked = rankRoundByMode(entries, mode);
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
          {/* An ended round is never going to fill up, so don't tell the
              instructor to keep waiting for it. */}
          {live ? 'Waiting for students to join…' : 'Nobody joined this session.'}
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
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-foreground" title={entry.displayName}>
                      {entry.displayName}
                    </p>
                    {/* Live state, not a verdict: says a student is sitting
                        paused RIGHT NOW. Only while the round is running —
                        on an ended session is_paused is just whatever the
                        last tick wrote, and attendance answers it properly. */}
                    {live && entry.isPaused && (
                      <span
                        className="flex shrink-0 items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] text-sky-500"
                        title="This student has their focus session paused right now"
                      >
                        <PauseCircle className="h-2.5 w-2.5" />
                        paused
                      </span>
                    )}
                    {/* Every student gets an attendance chip, not just the
                        ones who fell short. A missing chip is ambiguous — it
                        could mean "attended fully" or "this row predates the
                        tracking" — whereas an explicit "full" is an answer.
                        Green for full, amber for everything else; they still
                        rank on what they earned either way. */}
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${
                        entry.partial
                          ? 'bg-amber-500/15 text-amber-600'
                          : 'bg-emerald-500/15 text-emerald-600'
                      }`}
                      title={ATTENDANCE_HINT[entry.attendance] ?? ''}
                    >
                      {entry.attendance}
                      {entry.attendance === 'rejoined' && entry.leftCount > 1
                        ? ` ${entry.leftCount}×`
                        : ''}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(entry.focus_seconds)}</span>
                    <span className="flex items-center gap-1"><Target className="h-3 w-3" />{entry.avg_focus === null ? '—' : entry.avg_focus}</span>
                    <span className="flex items-center gap-1"><Star className="h-3 w-3" />{entry.rep > 0 ? '+' : ''}{entry.rep}</span>
                    <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{entry.coins}</span>
                    {/* Amber once it's non-zero — a count of 0 shouldn't read
                        as a warning, but any distraction should stand out.
                        Reported only; it doesn't affect Overall. */}
                    <span
                      className={`flex items-center gap-1 ${entry.distractions > 0 ? 'text-orange-400' : ''}`}
                      title={`${entry.distractions} distraction${entry.distractions === 1 ? '' : 's'} this session`}
                    >
                      <ZapOff className="h-3 w-3" />{entry.distractions}
                    </span>
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
