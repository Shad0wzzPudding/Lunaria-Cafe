-- ============================================================
-- class_rounds is readable by its participants, not just by a
-- classroom's members
--
-- The original SELECT policy was written when a round could only
-- belong to a classroom:
--
--   using (is_classroom_member(classroom_id)
--          or is_classroom_instructor(classroom_id))
--
-- A study room has a NULL classroom_id, so both tests fail and
-- the row is invisible. Two consequences, one obvious and one
-- not:
--
--   1. Direct selects on class_rounds skip study rooms.
--   2. **Realtime delivers no events for them.** postgres_changes
--      enforces RLS to decide who receives a change, as the
--      original migration's own comment notes. So a host opened a
--      room, the row was created, and their client never heard
--      about it — the panel sat on the "open a room" form while
--      the room was already running. Their friends could see it,
--      because active_round_for_me() is SECURITY DEFINER and
--      bypasses the policy entirely.
--
-- can_access_round() already answers this question for both kinds
-- of round, and round_participants' policies already delegate to
-- it. This brings class_rounds into line.
--
-- Not a widening for classrooms: can_access_round()'s classroom
-- branch is member-or-instructor, exactly the replaced predicate.
-- It is SECURITY DEFINER, so it reads class_rounds as the owner
-- and cannot recurse back into this policy.
-- ============================================================

drop policy if exists "members read rounds" on public.class_rounds;

create policy "participants read rounds"
  on public.class_rounds for select
  using (public.can_access_round(id));
