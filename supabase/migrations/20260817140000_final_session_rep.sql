-- ============================================================
-- Let the FINAL session rep land after the round has ended.
--
-- 7993400 added a write of lastSession.sessionRep to
-- round_participants.rep at session end, so the -3 fail penalty
-- reaches the leaderboard, history and CSV instead of only the
-- student's result screen. On the path that matters most it is
-- rejected:
--
--   PATCH round_participants (while active) -> 200
--   PATCH round_participants (after ended)  -> 403  42501
--
-- because "student updates own participation" carries
--
--   with check (student_id = auth.uid() and can_join_round(round_id))
--
-- and can_join_round() requires class_rounds.status = 'active'.
-- When the INSTRUCTOR ends a round, the client only learns the
-- session is over BECAUSE the round stopped being active — so by
-- the time END_FOCUS fires and the final rep is written, the
-- policy already forbids it. The failure is silent: it is
-- console.error'd, and the client marks the session reported, so
-- it never retries. Verified against the live database.
--
-- The student-leaves path was unaffected (leave_round only sets
-- left_at, leaving status 'active'), which is why this survived a
-- browser check that watched requests rather than responses.
--
-- A narrow SECURITY DEFINER RPC is the fix rather than widening
-- the policy: the policy guards EVERY column, and relaxing it for
-- ended rounds would also let focus_seconds, coins and
-- distractions be rewritten long afterwards. This touches rep and
-- nothing else, and only for a row the caller already owns.
--
-- No new trust is granted. The value is client-computed either
-- way — the report loop has always written exactly this number
-- while the round was live. All that changes is WHEN it may land.
-- ============================================================

create or replace function public.report_final_session_rep(_round_id uuid, _rep integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

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
