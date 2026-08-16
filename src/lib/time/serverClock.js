import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * The difference between this browser's clock and the server's.
 *
 * Presence is judged by comparing round_participants.updated_at — stamped
 * server-side since 20260816160000 — against "now". Taking that "now" from
 * the reader's device means a laptop three minutes fast marks a whole class
 * absent while they are reporting every five seconds. This puts both sides of
 * that comparison on the server's clock.
 *
 * Module-level rather than React state on purpose: several components score
 * the same rows, and they must all agree. Starts at zero, so before the first
 * sync everything behaves exactly as it did — a wrong offset would be worse
 * than none.
 */
let offsetMs = 0;
let syncing = null;

/** Roughly how far apart the two clocks are, for diagnostics. */
export function serverClockOffsetMs() {
  return offsetMs;
}

/** The server's wall clock, in local epoch terms. */
export function serverNow() {
  return Date.now() + offsetMs;
}

/**
 * Measure the offset. Concurrent callers share one in-flight request.
 *
 * The round trip is halved out: the server generated its answer somewhere
 * between the two local readings, and the midpoint is the best single guess.
 * Precision hardly matters — this is checked against a 90-second staleness
 * threshold — but it costs one subtraction to not be sloppy about it.
 */
export function syncServerClock() {
  if (!supabase) return Promise.resolve(false);
  if (syncing) return syncing;

  syncing = (async () => {
    try {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc('server_now');
      const t1 = Date.now();
      if (error) throw error;

      // `new Date(null)` is epoch 0, which is finite — so a null payload would
      // sail through the check below, set the offset to roughly -Date.now(),
      // and make serverNow() return 1970 for the life of the page. Nothing
      // would ever look stale again and presence detection would be silently
      // dead. Check the payload itself, not just the parsed result.
      if (typeof data !== 'string' || !data) return false;
      const serverMs = new Date(data).getTime();
      if (!Number.isFinite(serverMs) || serverMs <= 0) return false;

      offsetMs = serverMs - (t0 + (t1 - t0) / 2);
      return true;
    } catch (err) {
      // Leave the offset alone. Falling back to the device clock is the old
      // behaviour, which is imperfect but not worse than a guess.
      console.error('[clock] could not sync with the server:', err);
      return false;
    } finally {
      syncing = null;
    }
  })();

  return syncing;
}

/**
 * Keep the offset fresh for as long as something is reading it.
 *
 * Re-syncs when the tab comes back: a laptop that slept, or a clock the OS
 * corrected while we were away, would otherwise carry a stale offset into a
 * live session.
 */
export function useServerClock() {
  // The offset lives in a module variable, which no component watches — so
  // without this the first paint would score against the raw device clock and
  // only self-correct on the next row change. A board with no incoming events
  // is exactly the case the fix targets, so it cannot wait for one.
  const [, setSyncedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      syncServerClock().then((ok) => {
        if (ok && !cancelled) setSyncedAt(Date.now());
      });
    };
    run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
