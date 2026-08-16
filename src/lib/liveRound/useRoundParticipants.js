import { useEffect, useId } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { scoreRoundEntries } from '@/lib/leaderboard/scoring';
import { serverNow, useServerClock } from '@/lib/time/serverClock';

async function fetchParticipants(roundId) {
  const { data, error } = await supabase
    .from('round_participants')
    // left_at + updated_at drive the "didn't finish" tag (see
    // scoreRoundEntries) — one marks an explicit leave, the other
    // catches a student who simply stopped reporting.
    .select('student_id, display_name, joined_at, focus_seconds, coins, rep, avg_focus, distractions, left_at, left_count, absent_seconds, paused_seconds, is_paused, updated_at')
    .eq('round_id', roundId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Live-scored participants for one round. Fetches once, then keeps
 * the list fresh via a Realtime subscription filtered to this round.
 * Used by BOTH the instructor board and the student cafe overlay, so
 * it depends only on supabase + react-query (no game state).
 *
 * Nothing here filters on round status, which is why the same hook
 * serves round HISTORY unchanged: an ended round's participant rows
 * survive with their final numbers. Pass `{ live: false }` there —
 * an ended round receives no further changes, so the subscription
 * would be a channel held open for events that can never arrive.
 * Defaults to true so live callers read as before.
 */
export function useRoundParticipants(
  roundId,
  { live = true, endedAt = null, roundSeconds = null } = {},
) {
  const queryClient = useQueryClient();
  // Presence is judged against the SERVER's clock, because that is what
  // stamped the rows. Without this the reader's device decides who has gone
  // quiet, and a badly-set one condemns everybody.
  useServerClock();
  // Per-instance suffix. Two components can legitimately watch the SAME
  // round at once — the instructor's live board and the history row for
  // that still-running session — and supabase.channel() hands back the
  // EXISTING channel for a repeated topic. Calling .on() on a channel that
  // has already subscribed throws "cannot add postgres_changes callbacks
  // after subscribe()", which crashed the page. Distinct topics, distinct
  // channels. Colons are stripped because the topic is itself namespaced
  // with one (`realtime:<topic>`).
  const instanceId = useId().replace(/:/g, '');
  const queryKey = ['round-participants', roundId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchParticipants(roundId),
    enabled: !!roundId,
  });

  useEffect(() => {
    if (!roundId || !supabase || !live) return;

    const channel = supabase
      .channel(`round-participants-${roundId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_participants',
          filter: `round_id=eq.${roundId}`,
        },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // queryKey is derived from roundId; listing roundId is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, queryClient, live, instanceId]);

  return {
    entries: scoreRoundEntries(data ?? [], endedAt, roundSeconds, serverNow()),
    isLoading,
    error,
  };
}
