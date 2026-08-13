import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Radio, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import RoundLeaderboard from './RoundLeaderboard';

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

async function fetchActiveRound(roomId) {
  const { data, error } = await supabase
    .from('class_rounds')
    .select('id, title, started_at, duration_seconds, ends_at, allow_boosts')
    .eq('classroom_id', roomId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Instructor Start/End control + the realtime round board. */
export default function InstructorRoundControl({ roomId }) {
  const queryClient = useQueryClient();
  const queryKey = ['class-round', roomId];
  const [timed, setTimed] = useState(true);
  const [minutes, setMinutes] = useState(25);
  // Optional name for this session — what history and the students' join
  // toast will call it. Blank is fine; history falls back to the date.
  const [title, setTitle] = useState('');
  // Whether students' focus boosts (ticket ×1.15 and future modifiers)
  // apply during this session. Decided at start; shown while live.
  const [allowBoosts, setAllowBoosts] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const { data: round, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchActiveRound(roomId),
  });

  // Tick once a second while a round is live, to drive the timer.
  useEffect(() => {
    if (!round) return undefined;
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
    // Restart only when the round identity changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  const elapsedSec = round ? Math.max(0, Math.floor((now - new Date(round.started_at).getTime()) / 1000)) : 0;
  const totalSec = round?.duration_seconds ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`class-round-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_rounds',
          filter: `classroom_id=eq.${roomId}`,
        },
        () => invalidate(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const durationSeconds = timed ? Math.max(1, Math.round(minutes)) * 60 : null;
      const { error } = await supabase.rpc('start_round', {
        _classroom_id: roomId,
        _duration_seconds: durationSeconds,
        _allow_boosts: allowBoosts,
        _title: title.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Clear the name so the next session doesn't silently inherit it.
      setTitle('');
      invalidate();
      // The history tab lists live rounds too — keep it in step.
      queryClient.invalidateQueries({ queryKey: ['class-round-history', roomId] });
    },
  });

  const endMutation = useMutation({
    mutationFn: async (roundId) => {
      const { error } = await supabase.rpc('end_round', { _round_id: roundId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      // The session just became history — refresh the tab that shows it.
      queryClient.invalidateQueries({ queryKey: ['class-round-history', roomId] });
    },
  });

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${round ? 'text-emerald-500' : 'text-muted-foreground'}`} />
          <span className="text-sm font-medium text-foreground">
            {/* Name the running session if it has one — with several a week,
                "Live session running" doesn't say which. */}
            {round ? round.title?.trim() || 'Live session running' : 'Live session'}
          </span>
          {round && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {round.ends_at
                ? `${formatClock(Math.min(elapsedSec, totalSec))} / ${formatClock(totalSec)}`
                : formatClock(elapsedSec)}
            </span>
          )}
          {/* Boost policy chip, both states — pre-toggle rounds have no
              column (undefined), which means allowed. */}
          {round && (
            round.allow_boosts === false ? (
              <span
                className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600"
                title="Students' focus boosts don't apply in this session"
              >
                boosts off
              </span>
            ) : (
              <span
                className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-600"
                title="Students' focus boosts apply in this session"
              >
                boosts on
              </span>
            )
          )}
        </div>

        {isLoading ? null : round ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            disabled={endMutation.isPending}
            onClick={() => endMutation.mutate(round.id)}
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            {endMutation.isPending ? 'Ending…' : 'End session'}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Optional session name. Blank is valid — history labels an
                unnamed session by its start time. */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="Session name (optional)"
              aria-label="Session name"
              className="w-44 rounded-md border border-border/40 bg-background px-2.5 py-1 text-xs"
              style={{ fontFamily: "'Inter Variable', sans-serif" }}
            />
            {/* Timed vs open-ended */}
            <div className="flex rounded-md border border-border/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setTimed(true)}
                className={`px-2.5 py-1 text-xs ${timed ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Timed
              </button>
              <button
                type="button"
                onClick={() => setTimed(false)}
                className={`px-2.5 py-1 text-xs ${!timed ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Open
              </button>
            </div>
            {/* Per-session boost policy — spending is irreversible for the
                student, so the choice is locked in at start. */}
            <button
              type="button"
              onClick={() => setAllowBoosts((v) => !v)}
              title="Whether students' focus boost potions (×1.15 score) apply in this session"
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                allowBoosts
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                  : 'border-border/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              Boosts {allowBoosts ? 'on' : 'off'}
            </button>
            {timed && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="w-14 rounded-md border border-border/40 bg-background px-2 py-1 text-xs"
                  style={{ fontFamily: "'Inter Variable', sans-serif" }}
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            )}
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={startMutation.isPending || (timed && !(minutes > 0))}
              onClick={() => startMutation.mutate()}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              {startMutation.isPending ? 'Starting…' : 'Start session'}
            </Button>
          </div>
        )}
      </div>

      {round && (
        <RoundLeaderboard
          roundId={round.id}
          /* Planned length for a timed round; for an open-ended one the
             session so far is the only meaningful denominator. */
          roundSeconds={round.duration_seconds ?? elapsedSec}
        />
      )}
    </div>
  );
}
