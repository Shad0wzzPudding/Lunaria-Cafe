-- ============================================================
-- Guard report_final_session_rep(), and stop it forging presence.
--
-- 20260817140000 fixed a real bug — the final rep write was
-- rejected 403/42501 once the instructor ended the round — but
-- its own comment was wrong on two counts.
--
-- 1. "No new trust is granted; only WHEN it may land changes."
--    WHEN was the guard. The RLS policy's can_join_round() meant
--    a student could only ever write rep to a round that was
--    still ACTIVE. The bare SECURITY DEFINER version could write
--    any round they ever joined, forever, from devtools — and
--    round_participants.rep feeds the live board, the session
--    history, the CSV export and the 0.20-weighted ranking. So
--    it is bounded here: the round must still be active, or have
--    ended within the grace window. That covers the case it
--    exists for (the session ends BECAUSE the round ended, a
--    round trip earlier) and nothing else.
--
-- 2. It rides the presence trigger. round_participants_stamp_
--    updated_at sets updated_at := now() unconditionally, and
--    updated_at IS the presence heartbeat behind hasGoneQuiet().
--    On the instructor-end path this write previously FAILED, so
--    nothing was disturbed; now that it succeeds it refreshes the
--    heartbeat after ended_at, flipping a student who drifted off
--    near the end from "went quiet" to "full" on the teacher's
--    board. The final tally must not be able to launder
--    attendance.
--
--    The trigger keeps overriding the client everywhere else. It
--    now honours one narrow opt-out, set with SET LOCAL inside
--    this function only, so it lasts exactly one transaction and
--    no client can ask for it.
-- ============================================================

-- Rep may land shortly after the round ends: the client learns the session is
-- over from the round leaving the active list, so the write is always a moment
-- behind. Minutes, not hours — long enough for a slow network, far too short
-- to edit last week's leaderboard.
create or replace function public.stamp_round_participant_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Deliberately unconditional: this OVERRIDES whatever the client sent
  -- rather than filling in a missing value.
  --
  -- The single exception is the final-rep write, which must not touch the
  -- presence heartbeat. Set with SET LOCAL in report_final_session_rep(), so
  -- it cannot leak past that transaction and cannot be requested by a client.
  if coalesce(current_setting('lunaria.keep_presence_stamp', true), '') = 'on' then
    return new;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.report_final_session_rep(_round_id uuid, _rep integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Still live, or only just finished. Anything older is not a session ending;
  -- it is someone editing history.
  select exists (
    select 1 from public.class_rounds r
    where r.id = _round_id
      and (r.status = 'active' or r.ended_at > now() - interval '15 minutes')
  ) into _ok;

  if not _ok then
    raise exception 'That round is no longer accepting results';
  end if;

  -- Leave updated_at alone: this is a score, not a sign of life.
  perform set_config('lunaria.keep_presence_stamp', 'on', true);

  -- Only ever the caller's own row, and only one that already exists: this
  -- cannot enrol anyone, or touch another student's tally.
  update public.round_participants
  set rep = _rep
  where round_id = _round_id
    and student_id = auth.uid();
end;
$$;

revoke execute on function public.report_final_session_rep(uuid, integer) from public, anon;
grant  execute on function public.report_final_session_rep(uuid, integer) to authenticated;
