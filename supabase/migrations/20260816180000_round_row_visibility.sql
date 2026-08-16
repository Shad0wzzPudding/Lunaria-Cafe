-- ============================================================
-- Seeing that a room EXISTS is not the same as seeing its board
--
-- 20260815180000 pointed the class_rounds SELECT policy at
-- can_access_round(), and 20260816140000 then narrowed that
-- function's friend branch to `status = 'active'` so a finished
-- room's participant rows stop being readable by every later
-- friend of the host. That second change was right for the BOARD
-- and wrong for the ROW:
--
--   Realtime decides who receives a change by re-checking the
--   SELECT policy against the new row. When a room ends, a
--   non-participant friend loses the policy — and with it the
--   very UPDATE event that says "this room is over". That
--   channel is the only thing that invalidates
--   ['active-round-for-me'] (no interval, no refetch on focus),
--   so their Study rooms panel would go on offering a dead room,
--   and Join would fail against a round that is no longer active.
--
-- The two questions are genuinely different:
--
--   class_rounds       — session metadata: who is hosting, what
--                        it is called, when it started and ended.
--                        Nothing personal. Friends of the host
--                        may see this whatever its status, which
--                        is what keeps their list truthful.
--   round_participants — focus time, coins, reputation, average
--                        focus, distractions. Personal. Stays on
--                        can_access_round(), unchanged.
--
-- So class_rounds gets its own predicate rather than borrowing
-- one written for the board.
-- ============================================================

create or replace function public.can_see_round_row(_round_id uuid)
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
              -- Deliberately NOT gated on status: a friend has to keep
              -- receiving the row to learn that the room has ended.
              r.host_id = auth.uid()
              or public.is_accepted_friend(r.host_id)
              or exists (
                select 1 from public.round_participants rp
                where rp.round_id = r.id and rp.student_id = auth.uid()
              )
            else false
          end
  )
$$;

drop policy if exists "participants read rounds" on public.class_rounds;

create policy "participants read rounds"
  on public.class_rounds for select
  using (public.can_see_round_row(id));

revoke execute on function public.can_see_round_row(uuid) from public, anon;
grant  execute on function public.can_see_round_row(uuid) to authenticated;
