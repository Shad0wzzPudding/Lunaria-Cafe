import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Keeps ONE running instance of the game per account.
 *
 * Why: a player's save is a single row that GameProvider autosaves every 30s
 * and again on beforeunload. Two instances signed into the same account each
 * hold their own divergent state and write over each other — coins and
 * reputation go backwards, furniture placement races. So the rule is
 * one account · one device · one tab.
 *
 * Three layers, because none of them covers the others:
 *
 *   1. TAB LOCK (BroadcastChannel) — same browser, instant. Applies to guests
 *      too: their save clobbers exactly the same way.
 *   2. DEVICE CLAIM (active_sessions + heartbeat RPCs) — other devices, ~30s.
 *      Students only; instructors may legitimately drive two screens.
 *   3. TOKEN REVOCATION (signOut scope:'others') — real enforcement. It kills
 *      the other device's REFRESH token, but its existing access token stays
 *      valid until it expires, so on its own it is not prompt. That is exactly
 *      why layer 2 exists: fast detection, backed by slow-but-unbypassable
 *      revocation.
 *
 * Status values:
 *   checking    – deciding; render nothing game-ish yet
 *   active      – this instance owns the lock
 *   conflict    – another tab in this browser owns it (offer to take over)
 *   taken-over  – another tab took it from us
 *   displaced   – another device claimed the account
 */

const TAB_CHANNEL = 'lunaria-tab-lock'; // distinct from 'cafe-status' (the pop-out)
const TAB_LOCK_NAME = 'lunaria-active-tab';
const DEVICE_KEY = 'lunaria-device-id';
const RETRY_MS = 120;        // re-request cadence while taking over
// Generous, because the holder now flushes its save before releasing: the wait
// covers a save round-trip, not just message latency. We keep retrying rather
// than assuming a fixed delay, so this is only the give-up point for a wedged tab.
const RELEASE_WAIT_MS = 6000;
const HEARTBEAT_MS = 30_000;

// Fresh per page load, so two tabs never share one. (Duplicating a tab copies
// sessionStorage in some browsers, which is why this is NOT stored there.)
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked: fall back to a per-tab id. Worst case the
    // device lock is a little stricter than intended, never looser.
    return TAB_ID;
  }
}

// Web Locks decides tab ownership; BroadcastChannel only carries the "stand
// down" signal for a takeover.
//
// It was ping/pong over BroadcastChannel first, and that was RACY: the second
// tab waited a fixed window for a reply, but during page load its own main
// thread is busy evaluating modules, so the timer could fire before it
// processed an answer that had already arrived — leaving BOTH tabs active,
// i.e. failing open in exactly the case this exists to prevent. Web Locks with
// `ifAvailable` answers immediately and definitively, with no timing window,
// and the lock is dropped automatically if the tab crashes.
const SUPPORTS_TAB_LOCK =
  typeof BroadcastChannel !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.locks?.request === 'function';

export function useSessionLock({ userId, isStudent, onBeforeRelease }) {
  const [status, setStatus] = useState(SUPPORTS_TAB_LOCK ? 'checking' : 'active');
  const [handingOver, setHandingOver] = useState(false);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Read through a ref: the flush is registered by GameProvider after this hook
  // runs, and its identity changes, but the takeover handler is set up once.
  const beforeReleaseRef = useRef(onBeforeRelease);
  useEffect(() => { beforeReleaseRef.current = onBeforeRelease; }, [onBeforeRelease]);

  const channelRef = useRef(null);
  const releaseLockRef = useRef(null); // resolves the held lock's promise
  const acquireRef = useRef(null);

  // ── Layer 1: tab lock ──────────────────────────────────────────────
  useEffect(() => {
    if (!SUPPORTS_TAB_LOCK) return undefined; // already started 'active'

    const channel = new BroadcastChannel(TAB_CHANNEL);
    channelRef.current = channel;
    let cancelled = false;

    // Ask for the lock. `ifAvailable` resolves the callback immediately with
    // null when another tab holds it — no waiting, no window to race.
    const acquire = () =>
      navigator.locks.request(TAB_LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (cancelled) return undefined;
        if (!lock) {
          setStatus('conflict');
          return undefined; // released at once; the holder keeps it
        }
        setStatus('active');
        // Hold the lock for as long as we're the active tab: the lock lives
        // until THIS promise settles, and the browser drops it for us if the
        // tab is closed or crashes (no stale lock to time out).
        return new Promise((resolve) => { releaseLockRef.current = resolve; });
      });
    acquireRef.current = acquire;

    channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.tabId === TAB_ID) return;
      // Another tab is taking over. Flush our save FIRST, then drop the lock —
      // the incoming tab can only acquire it after the write has landed, and it
      // then mounts fresh and loads that save, so a handover loses nothing.
      // Capture the flush before setStatus, because going inactive unmounts
      // GameProvider and clears the registration.
      if (msg.type === 'takeover' && statusRef.current === 'active') {
        const flush = beforeReleaseRef.current;
        (async () => {
          try {
            await flush?.();
          } catch {
            // A failed save must not strand the handover — the other tab is
            // already waiting on this lock.
          }
          setStatus('taken-over');
          releaseLockRef.current?.();
          releaseLockRef.current = null;
        })();
      }
    };

    acquire();

    return () => {
      cancelled = true;
      releaseLockRef.current?.();
      releaseLockRef.current = null;
      channel.close();
      channelRef.current = null;
    };
  }, []);

  /** Second tab chose "use this tab": ask the holder to stand down, then take it. */
  const takeOver = useCallback(() => {
    const channel = channelRef.current;
    const acquire = acquireRef.current;
    if (!channel || !acquire) { setStatus('active'); return; }

    setHandingOver(true);
    channel.postMessage({ type: 'takeover', tabId: TAB_ID });

    // Retry until the holder actually drops the lock, rather than assuming a
    // fixed delay is enough — it is now saving first, so the wait is variable.
    // Give up after RELEASE_WAIT_MS in case the other tab is wedged; the
    // browser will already have freed the lock if it simply died.
    //
    // Deliberately does NOT await acquire(): on success its callback returns a
    // promise that stays pending for as long as we hold the lock, so awaiting
    // it would park here forever and never clear handingOver. Fire it off and
    // let the NEXT tick observe the resulting status instead.
    const deadline = Date.now() + RELEASE_WAIT_MS;
    const tick = () => {
      if (statusRef.current === 'active') { setHandingOver(false); return; }
      if (Date.now() >= deadline) { setHandingOver(false); return; }
      acquire();
      setTimeout(tick, RETRY_MS);
    };
    setTimeout(tick, RETRY_MS);
  }, []);

  // ── Layers 2 + 3: device claim, revocation, heartbeat ──────────────
  useEffect(() => {
    if (status !== 'active') return undefined;
    if (!supabase || !userId || !isStudent) return undefined;

    const deviceId = getDeviceId();
    let cancelled = false;

    (async () => {
      const { error } = await supabase.rpc('claim_device_session', { p_device_id: deviceId });
      if (cancelled || error) return;
      // Layer 3. Revokes every OTHER session's refresh token; the docs are
      // explicit that no sign-out event fires on the current session, so this
      // does not log US out.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
    })();

    const interval = setInterval(async () => {
      const { data, error } = await supabase.rpc('heartbeat_device_session', {
        p_device_id: deviceId,
      });
      if (cancelled) return;
      // A failed request is NOT a displacement. Treating a network hiccup as
      // one would sign students out mid-session on flaky wifi; only an explicit
      // false from the RPC means someone else holds the claim.
      if (error || data == null) return;
      if (data === false) setStatus('displaced');
    }, HEARTBEAT_MS);

    return () => { cancelled = true; clearInterval(interval); };
  }, [status, userId, isStudent]);

  /**
   * Leave the displaced state after the user has dealt with it (signed out in
   * order to log back in here). Without this the notice is a dead end: nothing
   * else ever sets 'active' again, so signing back in lands straight back on
   * the notice and only a manual reload escapes.
   *
   * Safe to go straight to active: displacement never released the TAB lock —
   * that happens only on takeover or unmount — so this instance still
   * legitimately owns it, and the claim effect re-claims the device on the way.
   */
  const clearDisplaced = useCallback(() => {
    if (statusRef.current === 'displaced') setStatus('active');
  }, []);

  /** Drop the claim on explicit logout so the next login is instant. */
  const releaseDevice = useCallback(async () => {
    if (!supabase || !userId || !isStudent) return;
    try {
      await supabase.rpc('release_device_session', { p_device_id: getDeviceId() });
    } catch {
      // Best-effort: a stale claim is harmless under last-wins.
    }
  }, [userId, isStudent]);

  return { status, handingOver, takeOver, releaseDevice, clearDisplaced };
}
