-- ============================================================
-- Paused time during a round
--
-- A student can sit out most of a session without ever pressing
-- Leave and without going quiet: pausing keeps the participation
-- row alive and the heartbeat ticking, so attendance read "full"
-- for someone who was paused for the majority of the class.
--
-- Sampled by the client's report loop (every REPORT_INTERVAL while
-- focus.status === 'paused'), so it is accurate to within one
-- reporting tick — precise enough for a "more than half the
-- session" test, which is all it is used for.
-- ============================================================

alter table public.round_participants
  add column if not exists paused_seconds integer not null default 0;

alter table public.round_participants
  drop constraint if exists round_participants_paused_nonneg;

alter table public.round_participants
  add constraint round_participants_paused_nonneg
  check (paused_seconds >= 0);
