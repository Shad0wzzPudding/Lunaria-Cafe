-- ============================================================
-- A finished study room stops being everybody's business
--
-- can_access_round()'s study branch tested only the relationship,
-- never the room's status:
--
--   r.host_id = auth.uid()
--   or is_accepted_friend(r.host_id)
--   or <was a participant>
--
-- So every accepted friend of the host could read that room's
-- round_participants rows for ever — including friends added
-- long after the room ended, who were never in it. Someone's
-- focus time, coins, reputation, average focus score and
-- distraction count from a session last month stayed readable by
-- whoever the host befriended this week.
--
-- The privacy notice says what you share in a room belongs to
-- that session. This makes that true:
--
--   * the host keeps their own room, live or finished;
--   * anyone who actually took part keeps that room, so an
--     unfriending cannot blank the board mid-session and their
--     own history stays visible to them;
--   * everyone else — friends of the host who were not in it —
--     can see it only WHILE IT IS RUNNING, which is exactly the
--     window in which they might join.
--
-- can_join_round() is untouched: it already requires
-- status = 'active', and joining a finished room was never
-- possible.
-- ============================================================

create or replace function public.can_access_round(_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_rounds r
    where r.id = _round_id
      and case r.owner_kind
            when 'classroom' then
              public.is_classroom_member(r.classroom_id)
              or public.is_classroom_instructor(r.classroom_id)
            when 'study' then
              -- Your own room, live or finished.
              r.host_id = auth.uid()
              -- A room you actually took part in. Deliberately not gated on
              -- left_at: having been there is what earns the view, and an
              -- unfriending must not blank the board out from under someone
              -- mid-session.
              or exists (
                select 1 from public.round_participants rp
                where rp.round_id = r.id and rp.student_id = auth.uid()
              )
              -- A friend's room you are not in: only while it is running.
              or (r.status = 'active' and public.is_accepted_friend(r.host_id))
            else false
          end
  )
$$;

revoke execute on function public.can_access_round(uuid) from public, anon;
grant  execute on function public.can_access_round(uuid) to authenticated;
