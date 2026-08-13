import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
import { LiveRoundContext } from './liveRoundContext';
import { BOOST_LABEL, BOOST_WINDOW_LABEL } from '@/lib/gameState/constants';

const REPORT_INTERVAL = 5000; // ms — throttle live progress writes
// Presence-only heartbeat, used once a student's metrics are final. Much rarer
// than REPORT_INTERVAL on purpose: round_participants is in the Realtime
// publication, so EVERY write fans out to the instructor board and to every
// student's overlay, each of which refetches the whole participant list. A
// finished class idling until the teacher presses End would otherwise beat out
// a storm of writes that carry no new information. Must stay comfortably under
// PARTICIPANT_STALE_MS (90s) in scoring.js, or a present student reads as gone.
const HEARTBEAT_INTERVAL = 30000;
const OPEN_ENDED_SECONDS = 24 * 3600; // focus.duration for an untimed round
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function fetchActiveRounds() {
  const { data, error } = await supabase.rpc('active_round_for_me');
  if (error) throw error;
  return data ?? [];
}

// Sessions may be named. A student in several classes otherwise gets a
// run of identical "live session" toasts with nothing to tell them apart.
const titleOf = (round) => round?.title?.trim() || '';

/**
 * Student-side live-round engine. Mounts inside GameProvider (needs
 * game state to compute round-scoped deltas) and:
 *   • discovers live rounds in the student's classrooms (+ Realtime),
 *   • pops a global "join" toast for un-joined rounds on any page,
 *   • once joined, reports focus_seconds / coins / avg_focus accrued
 *     DURING the round every few seconds,
 *   • drives the cafe overlay via `currentRound`.
 */
export function LiveRoundProvider({ children }) {
  const { state, dispatch } = useGame();
  const { user, profile, isGuest } = useAuth();
  const queryClient = useQueryClient();
  const userId = isGuest ? null : user?.id;

  const displayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Student';

  // Latest game state / identity, read by the interval without restarting it.
  const stateRef = useRef(state);
  const nameRef = useRef(displayName);
  useEffect(() => {
    stateRef.current = state;
    nameRef.current = displayName;
  });

  const [currentRound, setCurrentRound] = useState(null);
  // Overlay visibility is separate from participation: hiding the board
  // (the X) must NOT clear currentRound, or auto-resume would immediately
  // re-show it. Reporting + the menu indicator keep running while hidden.
  const [overlayVisible, setOverlayVisible] = useState(true);

  // Per-participation accumulators.
  const baselineRef = useRef({ focus: 0, coins: 0, rep: 0 });
  const accumulatedRef = useRef({ focus: 0, coins: 0, rep: 0, distractions: 0, paused: 0 });
  // Paused time observed THIS participation, sampled by the report loop.
  // Separate from accumulatedRef (which holds the DB baseline) so a rejoin
  // adds to the stored total instead of replacing it.
  const pausedRef = useRef(0);
  const avgRef = useRef({ sum: 0, count: 0 });
  const begunRoundIdRef = useRef(null); // guards double-begin
  const leftRoundIdRef = useRef(null); // a round the student opted out of
  const lastHeartbeatRef = useRef(0); // throttles the presence-only write
  const reportFailedRef = useRef(false); // so a rejected write is logged once
  const toastedRef = useRef(new Set()); // round ids we've already prompted

  const { data: activeRounds = [] } = useQuery({
    queryKey: ['active-round-for-me'],
    queryFn: fetchActiveRounds,
    enabled: !!userId,
  });

  const refreshActive = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['active-round-for-me'] }),
    [queryClient],
  );

  // ── Realtime: any round change → re-check what's live for me ──
  useEffect(() => {
    if (!userId || !supabase) return;
    const channel = supabase
      .channel('class-rounds-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'class_rounds' },
        () => refreshActive(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshActive]);

  // ── Begin (or resume) participating in a round ───────────────
  // `useBoostOnResume`: the student's answer to the rejoin prompt. null means
  // "not asked" (a fresh join, or an automatic resume) and leaves the existing
  // behaviour alone.
  const beginParticipation = useCallback(
    async (round, useBoostOnResume = null) => {
      if (!userId || !round) return;
      begunRoundIdRef.current = round.round_id;
      leftRoundIdRef.current = null; // (re)joining clears any prior opt-out

      const { data: existing } = await supabase
        .from('round_participants')
        .select('focus_seconds, coins, rep, avg_focus, distractions, paused_seconds, left_at')
        .eq('round_id', round.round_id)
        .eq('student_id', userId)
        .maybeSingle();

      // Coming back from a Leave: bank how long they were away and clear the
      // "out now" flag, server-side and atomically. Deliberately BEFORE the
      // upsert below — and the upsert no longer touches left_at, so the two
      // can't race to own the same field. left_count is never reset: it is
      // the record that they went, and the whole point is that it survives
      // the return (a rejoin used to erase the absence entirely).
      if (existing?.left_at) {
        const { error: rejoinError } = await supabase.rpc('rejoin_round', {
          _round_id: round.round_id,
        });
        if (rejoinError) {
          begunRoundIdRef.current = null;
          throw rejoinError;
        }
      }

      // What this student had already banked in this round, if anything.
      const prior = {
        focus: num(existing?.focus_seconds),
        coins: num(existing?.coins),
        rep: num(existing?.rep),
        distractions: num(existing?.distractions),
        paused: num(existing?.paused_seconds),
      };

      // The prior progress is handed to START_FOCUS so the student's own HUD
      // resumes where it left off, and the accumulators below are zeroed to
      // match. Both halves are required: seeding the HUD without zeroing here
      // would count everything twice (accumulated + a sessionRep that already
      // contains it), and zeroing without seeding would silently discard it.
      //
      // focus/coins move their BASELINE back instead, because those are
      // deltas against lifetime counters rather than session counters —
      // shifting the baseline makes the delta open at the prior value.
      accumulatedRef.current = { focus: 0, coins: 0, rep: 0, distractions: 0, paused: prior.paused };
      pausedRef.current = 0;
      baselineRef.current = {
        focus: num(stateRef.current.stats?.totalFocusSeconds) - prior.focus,
        coins: num(stateRef.current.coins) - prior.coins,
        rep: num(stateRef.current.reputation),
      };
      avgRef.current =
        existing?.avg_focus != null
          ? { sum: num(existing.avg_focus), count: 1 }
          : { sum: 0, count: 0 };

      const { error } = await supabase.from('round_participants').upsert(
        {
          round_id: round.round_id,
          student_id: userId,
          display_name: nameRef.current,
          focus_seconds: prior.focus,
          coins: prior.coins,
          rep: prior.rep,
          distractions: prior.distractions,
          paused_seconds: prior.paused,
          avg_focus: existing?.avg_focus ?? null,
          updated_at: new Date().toISOString(),
          // left_at is owned by leave_round / rejoin_round above — writing it
          // here too would let this upsert silently undo an absence record.
        },
        { onConflict: 'round_id,student_id' },
      );
      if (error) {
        begunRoundIdRef.current = null;
        throw error;
      }

      setCurrentRound(round);
      setOverlayVisible(true);
      refreshActive();

      // Teacher-controlled focus: drop the student straight into a focus
      // session for the REMAINING time (timed) or open-ended, wherever they
      // were in the app. A timed round already past its end just shows the
      // board (no focus to start).
      // An existing participants row means this is a RESUME (reload/auto-
      // rejoin), not a fresh join — the resuming flag stops START_FOCUS from
      // charging a second focus-boost ticket for the same participation.
      const resuming = !!existing;
      // Instructor's per-session toggle; rows/RPCs from before the toggle
      // existed have no column → treated as allowed (pre-toggle behavior).
      const boostsAllowed = round.allow_boosts ?? true;
      const endsAtMs = round.ends_at ? new Date(round.ends_at).getTime() : null;
      const remaining = endsAtMs ? Math.round((endsAtMs - Date.now()) / 1000) : null;
      let spentTicket = false;
      if (remaining === null || remaining > 0) {
        // Mirrors the reducer's useBoost exactly — it drives the toast copy,
        // so a divergence would tell the student the wrong thing about a
        // resource they can't get back.
        spentTicket =
          boostsAllowed &&
          num(stateRef.current.boosts?.focusTickets) > 0 &&
          (!resuming || useBoostOnResume === true);
        if (!stateRef.current.settings?.focusViewMode) {
          dispatch({ type: 'SET_FOCUS_VIEW_MODE', payload: 'game' });
        }
        dispatch({ type: 'SET_PHASE', payload: 'focus' });
        dispatch({
          type: 'START_FOCUS',
          payload: {
            durationSeconds: remaining ?? OPEN_ENDED_SECONDS,
            roundControlled: true,
            endsAt: endsAtMs,
            resuming,
            boostsAllowed,
            useBoostOnResume: useBoostOnResume === true,
            // Round-scoped counters resume rather than restarting at zero.
            resume: {
              sessionRep: prior.rep,
              coins: prior.coins,
              distractions: prior.distractions,
            },
          },
        });
      }
      return spentTicket;
    },
    [userId, refreshActive, dispatch],
  );

  const hideOverlay = useCallback(() => setOverlayVisible(false), []);

  const join = useCallback(
    async (round) => {
      // Already in THIS session → say so and stop. Falling through would run
      // beginParticipation again, which dispatches a fresh START_FOCUS and so
      // restarts the focus timer mid-session, and would pop the rejoin boost
      // prompt for a session they never actually left.
      //
      // Reachable from more than the obvious button: the global "started a
      // live session!" toast keeps its Join action alive for 10s, so joining
      // from My Classrooms and then clicking that toast lands here. Guarding
      // in join() covers every entry point rather than each UI separately.
      //
      // Safe for genuine rejoins: leave() clears both currentRound and
      // begunRoundIdRef, so someone who actually left is not blocked.
      if (
        currentRound?.round_id === round.round_id ||
        begunRoundIdRef.current === round.round_id
      ) {
        toast("You're already in this live session.");
        return;
      }

      // Already in a DIFFERENT live session → must leave that one first.
      if (begunRoundIdRef.current && begunRoundIdRef.current !== round.round_id) {
        toast.error("You're already in a live session — leave it first.");
        return;
      }
      const go = async (useBoostOnResume = null) => {
        try {
          const spentTicket = await beginParticipation(round, useBoostOnResume);
          const name = titleOf(round);
          toast.success(
            name
              ? `Joined "${name}" in ${round.classroom_name}!`
              : `Joined ${round.classroom_name}'s live session!`,
            {
              description: spentTicket
                ? `A boost potion was used — ${BOOST_LABEL} for the ${BOOST_WINDOW_LABEL}.`
                : undefined,
            },
          );
        } catch (err) {
          toast.error(err.message || 'Could not join the session.');
        }
      };
      // Rejoining a session they were already in: the first potion's boost
      // window expired long ago, so offer a fresh one rather than silently
      // giving them nothing. Only asked when there is a real choice to make —
      // they hold a potion and the instructor allows boosts this session.
      // A fresh join keeps its existing automatic spend (no prompt), and an
      // automatic resume never reaches here at all.
      const askBoostThenGo = async () => {
        const hasTickets = num(stateRef.current.boosts?.focusTickets) > 0;
        const boostsAllowed = round.allow_boosts ?? true;
        if (!hasTickets || !boostsAllowed) return go(null);

        const { data: prior } = await supabase
          .from('round_participants')
          .select('student_id')
          .eq('round_id', round.round_id)
          .eq('student_id', userId)
          .maybeSingle();
        if (!prior) return go(null); // fresh join — spends automatically

        // Answer once. Clicking an action also DISMISSES the toast, which
        // fires onDismiss too — without this guard "Use one" would join
        // twice, and the second pass would spend a second potion.
        let answered = false;
        const answer = (choice) => {
          if (answered) return;
          answered = true;
          go(choice);
        };

        toast('Use a boost potion for the rest of this session?', {
          duration: 15000,
          description: `${BOOST_LABEL} for the ${BOOST_WINDOW_LABEL}. Your earlier potion's boost has already run out.`,
          action: { label: 'Use one', onClick: () => answer(true) },
          cancel: { label: 'No thanks', onClick: () => answer(false) },
          // Ignoring the prompt must still join — never strand someone outside
          // the session because they didn't answer.
          onAutoClose: () => answer(false),
          onDismiss: () => answer(false),
        });
      };

      // Joining must happen from management, not mid-focus. If they're in a
      // (non-round) focus session, confirm stopping it first.
      const f = stateRef.current.focus;
      const busy =
        !f.roundControlled &&
        (f.status === 'active' || f.status === 'paused' || f.status === 'distracted');
      if (busy) {
        toast('Joining will stop your current focus session.', {
          duration: 12000,
          action: {
            label: 'Stop & join',
            onClick: () => {
              dispatch({ type: 'END_FOCUS' });
              askBoostThenGo();
            },
          },
        });
        return;
      }
      await askBoostThenGo();
    },
    [beginParticipation, dispatch, userId, currentRound],
  );

  // Opt out: end the focus, come off the board, don't auto-rejoin.
  //
  // This used to DELETE the participant row, which erased everything the
  // student had earned in the session — their focus time, coins and
  // reputation vanished from the live board, from history and from the
  // export, as though they were never there. Now the row survives with
  // left_at set: they still count, tagged as not having finished.
  // (`joined` in active_round_for_me keys off left_at is null, so leaving
  // still takes them off the board and out of auto-resume.)
  const leave = useCallback(async () => {
    const round = currentRound;
    if (round) leftRoundIdRef.current = round.round_id; // don't auto-rejoin
    if (stateRef.current.focus.roundControlled) dispatch({ type: 'END_FOCUS' });
    setCurrentRound(null);
    begunRoundIdRef.current = null;
    if (round && userId) {
      // Via RPC so the departure is stamped with the DATABASE clock and
      // left_count increments atomically — a client-side read-modify-write
      // could lose a count, and this feeds an attendance record.
      await supabase.rpc('leave_round', { _round_id: round.round_id });
      refreshActive();
    }
  }, [currentRound, userId, dispatch, refreshActive]);

  // ── Auto-resume a round we're already a participant of ───────
  useEffect(() => {
    if (!userId || currentRound) return;
    const mine = activeRounds.find(
      (r) => r.joined && r.round_id !== leftRoundIdRef.current,
    );
    if (mine && begunRoundIdRef.current !== mine.round_id) {
      beginParticipation(mine).catch(() => {});
    }
  }, [activeRounds, currentRound, userId, beginParticipation]);

  // ── Detect the round I'm in ending ───────────────────────────
  useEffect(() => {
    if (!currentRound) return undefined;
    if (activeRounds.some((r) => r.round_id === currentRound.round_id)) return undefined;
    const endedName = currentRound.classroom_name;
    const endedTitle = titleOf(currentRound);
    // Defer the clear so it isn't a synchronous setState within the effect.
    const t = setTimeout(() => {
      toast(endedTitle ? `"${endedTitle}" has ended.` : `${endedName}'s session has ended.`);
      // Teacher ended it → stop the student's teacher-controlled focus.
      if (stateRef.current.focus.roundControlled) dispatch({ type: 'END_FOCUS' });
      setCurrentRound(null);
      begunRoundIdRef.current = null;
    }, 0);
    return () => clearTimeout(t);
  }, [activeRounds, currentRound, dispatch]);

  // ── Complete a timed round when its clock runs out (survives pause) ──
  useEffect(() => {
    if (!currentRound) return undefined;
    const id = setInterval(() => {
      const f = stateRef.current.focus;
      if (
        f.roundControlled &&
        f.endsAt &&
        Date.now() >= f.endsAt &&
        (f.status === 'active' || f.status === 'paused')
      ) {
        dispatch({ type: 'COMPLETE_FOCUS' });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [currentRound, dispatch]);

  // ── Global "join" toast for un-joined live rounds ────────────
  useEffect(() => {
    // While already in a session, don't prompt to join any other round.
    if (!userId || currentRound) return;
    for (const round of activeRounds) {
      if (round.joined || toastedRef.current.has(round.round_id)) continue;
      toastedRef.current.add(round.round_id);
      // The spend is irreversible, so it's announced BEFORE the click —
      // unless the instructor disabled boosts for this session.
      const hasTickets = num(stateRef.current.boosts?.focusTickets) > 0;
      const roundAllowsBoosts = round.allow_boosts ?? true;
      const startedTitle = titleOf(round);
      toast(
        startedTitle
          ? `${round.classroom_name} started "${startedTitle}"!`
          : `${round.classroom_name} started a live session!`,
        {
          duration: 10000,
          description: !hasTickets
            ? undefined
            : roundAllowsBoosts
              ? `Joining will use a boost potion (${BOOST_LABEL}, ${BOOST_WINDOW_LABEL}).`
              : 'Boosts are disabled for this session — no boost potion will be used.',
          action: { label: 'Join', onClick: () => join(round) },
        },
      );
    }
    // Forget rounds that are no longer live so a future one re-prompts.
    const liveIds = new Set(activeRounds.map((r) => r.round_id));
    for (const id of toastedRef.current) {
      if (!liveIds.has(id)) toastedRef.current.delete(id);
    }
  }, [activeRounds, userId, join, currentRound]);

  // ── Report round-scoped progress on an interval ──────────────
  useEffect(() => {
    if (!currentRound || !userId || !supabase) return;
    const roundId = currentRound.round_id;

    const report = async () => {
      const st = stateRef.current;
      // Once the session is no longer teacher-controlled the METRICS are
      // final — stop writing those, so a reset sessionRep or a later
      // coin-spend can't corrupt the frozen board row.
      //
      // But keep touching updated_at, because that column doubles as the
      // presence heartbeat behind the "went quiet" tag. roundControlled
      // flips false the moment a student COMPLETES their focus (see the
      // completion branch in gameReducer), so returning outright here
      // marked everyone who finished properly as having drifted off —
      // any time the instructor didn't press End within the staleness
      // window. This interval only runs while currentRound is set, i.e.
      // while the student is genuinely still in a live round: leaving or
      // the teacher ending it tears it down, so the heartbeat can't
      // outlive real presence.
      if (!st.focus?.roundControlled) {
        const now = Date.now();
        if (now - lastHeartbeatRef.current < HEARTBEAT_INTERVAL) return;
        lastHeartbeatRef.current = now;
        await supabase
          .from('round_participants')
          .update({ updated_at: new Date().toISOString() })
          .eq('round_id', roundId)
          .eq('student_id', userId);
        return;
      }
      if (st.focus?.status === 'active') {
        // Boosted score — the board credits the boost (the instructor can
        // disable it per session), consistent with the rep gate and summary.
        avgRef.current.sum += num(st.attention?.score);
        avgRef.current.count += 1;
      }
      const focus =
        accumulatedRef.current.focus +
        Math.max(0, num(st.stats?.totalFocusSeconds) - baselineRef.current.focus);
      const coins =
        accumulatedRef.current.coins +
        Math.max(0, num(st.coins) - baselineRef.current.coins);
      // Session rep is held on focus.sessionRep (lifetime stays frozen during
      // a live session); it can go up OR down, so keep the signed value.
      const rep = accumulatedRef.current.rep + num(st.focus?.sessionRep);
      // attention.sessionDistractions resets with each focus session (see
      // START_FOCUS in gameReducer), exactly like focus.sessionRep — so the
      // same accumulate-plus-current pattern gives the round-scoped total
      // across a student who focuses more than once in one round.
      const distractions =
        accumulatedRef.current.distractions + num(st.attention?.sessionDistractions);
      // PAUSE_FOCUS leaves roundControlled true, so this loop keeps running
      // while paused — sample it. One tick's worth per tick; the only thing
      // it feeds is a "more than half the session" test, so tick-level
      // resolution is ample.
      if (st.focus?.status === 'paused') {
        pausedRef.current += REPORT_INTERVAL / 1000;
      }
      const pausedSeconds = accumulatedRef.current.paused + pausedRef.current;
      const avg =
        avgRef.current.count > 0
          ? Math.round(avgRef.current.sum / avgRef.current.count)
          : null;

      const { error: reportError } = await supabase
        .from('round_participants')
        .update({
          focus_seconds: focus,
          coins,
          rep,
          distractions,
          paused_seconds: pausedSeconds,
          avg_focus: avg,
          updated_at: new Date().toISOString(),
        })
        .eq('round_id', roundId)
        .eq('student_id', userId);

      // Say something ONCE if the write is being rejected. Silently swallowing
      // this is how a whole session's metrics can quietly stay at zero — a
      // missing column after a migration wasn't applied, or an RLS change,
      // looks identical to "the student did nothing" on the instructor's
      // board. Once, not every tick, or a broken session floods the console.
      if (reportError && !reportFailedRef.current) {
        reportFailedRef.current = true;
        console.error('[live-round] progress write rejected — metrics will not update:', reportError);
      }
    };

    const id = setInterval(() => report().catch(() => {}), REPORT_INTERVAL);
    return () => clearInterval(id);
  }, [currentRound, userId]);

  const value = useMemo(
    () => ({ activeRounds, currentRound, overlayVisible, join, leave, hideOverlay }),
    [activeRounds, currentRound, overlayVisible, join, leave, hideOverlay],
  );

  return <LiveRoundContext.Provider value={value}>{children}</LiveRoundContext.Provider>;
}
