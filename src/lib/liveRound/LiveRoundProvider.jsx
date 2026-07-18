import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
import { LiveRoundContext } from './liveRoundContext';
import { BOOST_LABEL, BOOST_WINDOW_LABEL } from '@/lib/gameState/constants';

const REPORT_INTERVAL = 5000; // ms — throttle live progress writes
const OPEN_ENDED_SECONDS = 24 * 3600; // focus.duration for an untimed round
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function fetchActiveRounds() {
  const { data, error } = await supabase.rpc('active_round_for_me');
  if (error) throw error;
  return data ?? [];
}

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
  const accumulatedRef = useRef({ focus: 0, coins: 0, rep: 0 });
  const avgRef = useRef({ sum: 0, count: 0 });
  const begunRoundIdRef = useRef(null); // guards double-begin
  const leftRoundIdRef = useRef(null); // a round the student opted out of
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
  const beginParticipation = useCallback(
    async (round) => {
      if (!userId || !round) return;
      begunRoundIdRef.current = round.round_id;
      leftRoundIdRef.current = null; // (re)joining clears any prior opt-out

      const { data: existing } = await supabase
        .from('round_participants')
        .select('focus_seconds, coins, rep, avg_focus')
        .eq('round_id', round.round_id)
        .eq('student_id', userId)
        .maybeSingle();

      accumulatedRef.current = {
        focus: num(existing?.focus_seconds),
        coins: num(existing?.coins),
        rep: num(existing?.rep),
      };
      baselineRef.current = {
        focus: num(stateRef.current.stats?.totalFocusSeconds),
        coins: num(stateRef.current.coins),
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
          focus_seconds: accumulatedRef.current.focus,
          coins: accumulatedRef.current.coins,
          rep: accumulatedRef.current.rep,
          avg_focus: existing?.avg_focus ?? null,
          updated_at: new Date().toISOString(),
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
        spentTicket =
          !resuming && boostsAllowed && num(stateRef.current.boosts?.focusTickets) > 0;
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
      // Already in a (different) live session → must leave that one first.
      if (begunRoundIdRef.current && begunRoundIdRef.current !== round.round_id) {
        toast.error("You're already in a live session — leave it first.");
        return;
      }
      const go = async () => {
        try {
          const spentTicket = await beginParticipation(round);
          toast.success(`Joined ${round.classroom_name}'s live session!`, {
            description: spentTicket
              ? `A focus boost ticket was used — ${BOOST_LABEL} for the ${BOOST_WINDOW_LABEL}.`
              : undefined,
          });
        } catch (err) {
          toast.error(err.message || 'Could not join the session.');
        }
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
              go();
            },
          },
        });
        return;
      }
      await go();
    },
    [beginParticipation, dispatch],
  );

  // Opt out entirely: end the focus, drop from the board, don't auto-rejoin.
  const leave = useCallback(async () => {
    const round = currentRound;
    if (round) leftRoundIdRef.current = round.round_id; // don't auto-rejoin
    if (stateRef.current.focus.roundControlled) dispatch({ type: 'END_FOCUS' });
    setCurrentRound(null);
    begunRoundIdRef.current = null;
    if (round && userId) {
      await supabase
        .from('round_participants')
        .delete()
        .eq('round_id', round.round_id)
        .eq('student_id', userId);
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
    // Defer the clear so it isn't a synchronous setState within the effect.
    const t = setTimeout(() => {
      toast(`${endedName}'s session has ended.`);
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
      toast(`${round.classroom_name} started a live session!`, {
        duration: 10000,
        description: !hasTickets
          ? undefined
          : roundAllowsBoosts
            ? `Joining will use a focus boost ticket (${BOOST_LABEL}, ${BOOST_WINDOW_LABEL}).`
            : 'Boosts are disabled for this session — no ticket will be used.',
        action: { label: 'Join', onClick: () => join(round) },
      });
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
      // Once the session is no longer teacher-controlled (completed / left /
      // teacher-ended) the metrics are final — stop writing, so a reset
      // sessionRep or later coin-spend can't corrupt the frozen board row.
      if (!st.focus?.roundControlled) return;
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
      const avg =
        avgRef.current.count > 0
          ? Math.round(avgRef.current.sum / avgRef.current.count)
          : null;

      await supabase
        .from('round_participants')
        .update({
          focus_seconds: focus,
          coins,
          rep,
          avg_focus: avg,
          updated_at: new Date().toISOString(),
        })
        .eq('round_id', roundId)
        .eq('student_id', userId);
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
