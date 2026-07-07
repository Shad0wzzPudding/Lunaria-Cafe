-- ============================================================
-- Leave session: a student may remove their own participation.
-- (The insert/update policies existed, but without a delete policy
-- RLS silently blocked "Leave session", so the client re-joined.)
-- ============================================================

create policy "student deletes own participation"
  on public.round_participants for delete
  using (student_id = auth.uid());
