import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * A friend's cafe, as of their last save.
 *
 * Shared by the full-page visit and the in-session peek so both fetch the same
 * way. `gcTime: 0` matters: this page/overlay unmounts on every exit, and a
 * cached answer would otherwise be served for the default 5 minutes, showing a
 * stale room on the next look. (Same trap that made the arriving friend letter
 * intermittent.)
 */
export function useCafeSnapshot(friendId) {
  return useQuery({
    queryKey: ['visit-cafe', friendId],
    enabled: Boolean(friendId),
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('visit_friend_cafe', {
        _friend_id: friendId,
      });
      if (error) throw error;
      // The RPC returns a one-row table.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('That cafe could not be found.');
      return row;
    },
  });
}
