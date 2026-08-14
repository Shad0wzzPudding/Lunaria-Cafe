import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** How often the menu re-asks whether anything is waiting. */
const NOTICES_REFETCH_MS = 60_000;

export const FRIEND_NOTICES_KEY = ['friend-notices'];

/**
 * Counts behind the main-menu bubble: requests you haven't looked at, and
 * accepted replies you haven't been shown.
 *
 * One RPC rather than reusing the Friends page's two list queries — the menu
 * renders on every return to it, and should not pay for two full joins to
 * decide whether to draw one line of text.
 */
export function useFriendNotices(enabled) {
  const { data } = useQuery({
    queryKey: FRIEND_NOTICES_KEY,
    enabled: Boolean(enabled) && Boolean(supabase),
    refetchInterval: NOTICES_REFETCH_MS,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('my_friend_notices');
      if (error) throw error;
      // The RPC returns a one-row table.
      return (Array.isArray(rows) ? rows[0] : rows) ?? null;
    },
  });

  return {
    newRequests: data?.new_requests ?? 0,
    newResults: data?.new_results ?? 0,
  };
}

/** The one line the bubble says, given what's waiting. Null = say nothing. */
export function noticeMessage(newRequests, newResults) {
  if (newResults > 0 && newRequests > 0) return 'Letters are waiting for you!';
  if (newResults > 0) {
    return newResults === 1
      ? 'A reply to your letter has arrived!'
      : 'Replies to your letters have arrived!';
  }
  if (newRequests > 0) {
    return newRequests === 1
      ? 'Someone would like to be your friend!'
      : `${newRequests} friend requests are waiting!`;
  }
  return null;
}
