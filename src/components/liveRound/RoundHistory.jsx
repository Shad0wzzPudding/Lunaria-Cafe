import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Clock, Download, Radio, Target, Users, ZapOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import SearchInput from '@/components/ui/SearchInput';
import RoundLeaderboard from './RoundLeaderboard';
import { useRoundParticipants } from '@/lib/liveRound/useRoundParticipants';
import { rankRoundByMode, formatDuration } from '@/lib/leaderboard/scoring';
import { toCsv, downloadCsv, slugify, fileDateStamp } from '@/lib/export/csv';

async function fetchRounds(roomId) {
  const { data, error } = await supabase.rpc('list_class_rounds', { _classroom_id: roomId });
  if (error) throw error;
  return data ?? [];
}

/** "12 Aug 2026, 2:30 PM" — also the text the search box matches on. */
function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * An untitled session still needs something to be called. Falling back
 * to its start time keeps every row distinguishable, which is the whole
 * point of the title.
 */
function sessionLabel(round) {
  return round.title?.trim() || `Session — ${formatWhen(round.started_at)}`;
}

/** Elapsed wall-clock of a finished round, independent of its planned duration. */
function actualSeconds(round) {
  if (!round.ended_at) return null;
  const ms = new Date(round.ended_at).getTime() - new Date(round.started_at).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

/**
 * The denominator for "paused for more than half the session".
 *
 * ACTUAL elapsed time, not the planned duration. An instructor who sets a
 * 25-minute round and ends it after 5 is common, and measuring against the
 * plan made a student who paused 4 of those 5 minutes — 80% of the real
 * session — look like 16%, so the rule never fired and they read as "full".
 *
 * Falls back to duration_seconds only if started_at is unusable, and never
 * returns null for a round that has begun: a null denominator disables the
 * rule silently, which is the failure mode this whole function exists to
 * avoid. A live round measures against how long it has run so far.
 */
function roundDurationSeconds(round) {
  const startMs = new Date(round.started_at).getTime();
  const endMs = round.ended_at ? new Date(round.ended_at).getTime() : Date.now();
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    return Math.max(0, Math.round((endMs - startMs) / 1000));
  }
  return num(round.duration_seconds) > 0 ? num(round.duration_seconds) : null;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Clock time for the export — the date is already in the filename. */
function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Export button for one session's final standings.
 *
 * Lives in its own component so the participant fetch is scoped to the
 * expanded row. It shares the ['round-participants', roundId] query key
 * with the RoundLeaderboard rendered beside it, so react-query serves
 * both from one request.
 */
function SessionExportButton({ round, classroomName }) {
  const { entries, isLoading } = useRoundParticipants(round.round_id, {
    live: false,
    endedAt: round.ended_at,
    roundSeconds: roundDurationSeconds(round),
  });

  const handleExport = () => {
    // Ranked by Overall, matching the board's default view.
    const ranked = rankRoundByMode(entries, 'overall');
    const csv = toCsv(
      [
        { key: 'rank', label: 'Rank' },
        { key: 'displayName', label: 'Student' },
        { key: (r) => formatTimestamp(r.joinedAt), label: 'Joined at' },
        { key: (r) => r.focus_seconds, label: 'Focus seconds' },
        { key: (r) => formatDuration(r.focus_seconds), label: 'Focus time' },
        { key: (r) => (r.avg_focus === null ? '' : r.avg_focus), label: 'Avg focus' },
        { key: 'rep', label: 'Reputation' },
        { key: 'coins', label: 'Coins' },
        { key: 'distractions', label: 'Distractions' },
        { key: 'overall', label: 'Overall' },
        // Attendance matters for marking, so the category is accompanied by
        // the detail behind it — "rejoined" alone can't distinguish a 20s
        // reconnect from a 15-minute disappearance.
        { key: 'attendance', label: 'Attendance' },
        { key: 'leftCount', label: 'Times left' },
        { key: (r) => formatDuration(r.absentSeconds), label: 'Time away' },
        { key: (r) => formatDuration(r.pausedSeconds), label: 'Paused time' },
        { key: (r) => formatDuration(r.participationSeconds), label: 'Time in session' },
      ],
      ranked,
    );
    downloadCsv(
      `${slugify(classroomName, 'classroom')}-${slugify(sessionLabel(round), 'session')}-${fileDateStamp()}.csv`,
      csv,
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={isLoading || entries.length === 0}
      onClick={handleExport}
    >
      <Download className="mr-1 h-3.5 w-3.5" />
      Export CSV
    </Button>
  );
}

function SessionCard({ round, classroomName, expanded, onToggle }) {
  const live = round.status === 'active';
  const elapsed = actualSeconds(round);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const label = sessionLabel(round);

  return (
    <li className="rounded-xl border border-border/30 bg-card/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Truncated to fit the card — hover reveals the full name. */}
            <p className="truncate text-sm font-medium text-foreground" title={label}>
              {label}
            </p>
            {live && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-600">
                <Radio className="h-3 w-3" />
                live
              </span>
            )}
            {round.allow_boosts === false && (
              <span
                className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600"
                title="Students' focus boosts didn't apply in this session"
              >
                boosts off
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{formatWhen(round.started_at)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1" title="Students who joined">
              <Users className="h-3 w-3" />
              {round.participant_count}
            </span>
            <span className="flex items-center gap-1" title="Total focus time across the class">
              <Clock className="h-3 w-3" />
              {formatDuration(round.total_focus_seconds)}
            </span>
            <span className="flex items-center gap-1" title="Class average focus score">
              <Target className="h-3 w-3" />
              {round.avg_focus === null ? '—' : round.avg_focus}
            </span>
            <span
              className={round.total_distractions > 0 ? 'flex items-center gap-1 text-orange-400' : 'flex items-center gap-1'}
              title="Distractions across the whole class"
            >
              <ZapOff className="h-3 w-3" />
              {round.total_distractions ?? 0}
            </span>
            {elapsed !== null && <span title="How long the session ran">ran {formatDuration(elapsed)}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border/30 p-4">
          <div className="flex justify-end">
            <SessionExportButton round={round} classroomName={classroomName} />
          </div>
          {/* live={false} for a finished round: no further changes can
              arrive, so there's nothing for a realtime channel to carry. */}
          <RoundLeaderboard
            roundId={round.round_id}
            live={live}
            endedAt={round.ended_at}
            roundSeconds={roundDurationSeconds(round)}
          />
        </div>
      )}
    </li>
  );
}

/** Past and current sessions for one classroom, searchable, with per-session export. */
export default function RoundHistory({ roomId, classroomName }) {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data: rounds, isLoading, error } = useQuery({
    // Deliberately NOT ['class-rounds', roomId] — InstructorRoundControl
    // owns ['class-round', roomId] for the single live round, and two keys
    // one character apart is a typo waiting to invalidate the wrong cache.
    queryKey: ['class-round-history', roomId],
    queryFn: () => fetchRounds(roomId),
  });

  const filtered = useMemo(() => {
    const list = rounds ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    // Match the label the user can actually see, so searching for a date
    // works on untitled sessions too.
    return list.filter((r) =>
      `${sessionLabel(r)} ${formatWhen(r.started_at)}`.toLowerCase().includes(q),
    );
  }, [rounds, search]);

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading sessions…</p>;
  if (error) return <p className="py-8 text-center text-sm text-amber-500">{error.message}</p>;

  return (
    <div className="space-y-4">
      {(rounds?.length ?? 0) > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search sessions by name or date…"
        />
      )}

      {(rounds?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
          No sessions yet. Start one from the Students tab and it'll be recorded here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
          No sessions match "{search}".
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((round) => (
            <SessionCard
              key={round.round_id}
              round={round}
              classroomName={classroomName}
              expanded={openId === round.round_id}
              onToggle={() => setOpenId((id) => (id === round.round_id ? null : round.round_id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
