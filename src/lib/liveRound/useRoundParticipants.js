import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { scoreRoundEntries } from '@/lib/leaderboard/scoring';

async function fetchParticipants(roundId) {
  const { data, error } = await supabase
    .from('round_participants')
    .select('student_id, display_name, focus_seconds, coins, rep, avg_focus')
    .eq('round_id', roundId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Live-scored participants for one round. Fetches once, then keeps
 * the list fresh via a Realtime subscription filtered to this round.
 * Used by BOTH the instructor board and the student cafe overlay, so
 * it depends only on supabase + react-query (no game state).
 */
export function useRoundParticipants(roundId) {
  const queryClient = useQueryClient();
  const queryKey = ['round-participants', roundId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchParticipants(roundId),
    enabled: !!roundId,
  });

  useEffect(() => {
    if (!roundId || !supabase) return;

    const channel = supabase
      .channel(`round-participants-${roundId}`)
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
  }, [roundId, queryClient]);

  return {
    entries: scoreRoundEntries(data ?? []),
    isLoading,
    error,
  };
}
