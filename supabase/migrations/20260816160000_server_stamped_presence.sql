-- ============================================================
-- The presence heartbeat is stamped by the SERVER, not the client
--
-- round_participants.updated_at doubles as the presence
-- heartbeat: hasGoneQuiet() in scoring.js decides someone has
-- drifted out of a session when it falls more than
-- PARTICIPANT_STALE_MS (90s) behind, and that judgement drives
-- the "went quiet" attendance verdict and (since the is_paused
-- fix) the live paused chip.
--
-- The client was writing that column itself —
-- `updated_at: new Date().toISOString()` — so the comparison put
-- the STUDENT's clock on one side and the READER's on the other.
-- Two consequences:
--
--   1. A device a couple of minutes slow reads as gone quiet
--      while it is reporting every 5 seconds, losing its pause
--      chip and being marked absent on the instructor's board.
--      A device running fast stays "present" long after it stops.
--   2. It was forgeable. Nothing stopped a client sending an
--      updated_at hours in the future and never reading as
--      absent — on a surface a teacher may use for participation.
--
-- A trigger takes the column away from the client entirely. The
-- default on the table only covers INSERT, and only when no value
-- is supplied; forcing it on INSERT and UPDATE means every row's
-- heartbeat comes from ONE clock — the server's — whatever the
-- client sends.
--
-- HALF THE PROBLEM, and worth being precise about. This fixes the
-- WRITE side: every student's stamp is now comparable with every
-- other's, and none of them is forgeable. The READ side still
-- compares those stamps against Date.now() in whoever's browser
-- is looking (scoring.js, hasGoneQuiet), so a reader with a badly
-- wrong clock still misjudges — the difference is that it now
-- misjudges the whole room uniformly instead of penalising the
-- students whose devices happen to drift. Closing that needs a
-- server-supplied reference time on the read path; see the debug
-- backlog.
-- ============================================================

create or replace function public.stamp_round_participant_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Deliberately unconditional: this OVERRIDES whatever the client sent
  -- rather than filling in a missing value.
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists round_participants_stamp_updated_at on public.round_participants;

create trigger round_participants_stamp_updated_at
  before insert or update on public.round_participants
  for each row
  execute function public.stamp_round_participant_updated_at();
