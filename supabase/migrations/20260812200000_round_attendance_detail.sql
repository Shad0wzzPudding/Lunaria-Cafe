-- ============================================================
-- Attendance detail: surviving a rejoin
--
-- left_at answered "is this student out RIGHT NOW" — correct for
-- the live board (it's what stops auto-resume dragging someone
-- back into a session they deliberately left), but wrong for an
-- attendance record. Rejoining set left_at back to null, which
-- erased the only trace that the student had ever gone, and the
-- CSV then reported them as "full".
--
-- Two columns that a rejoin does NOT clear:
--   left_count    — how many times they left
--   absent_seconds— how long they were away, in total
--
-- Both are written server-side (see the RPCs) so the elapsed time
-- comes from the database clock rather than the student's.
-- ============================================================

alter table public.round_participants
  add column if not exists left_count integer not null default 0,
  add column if not exists absent_seconds integer not null default 0;

alter table public.round_participants
  drop constraint if exists round_participants_attendance_nonneg;

alter table public.round_participants
  add constraint round_participants_attendance_nonneg
  check (left_count >= 0 and absent_seconds >= 0);

-- Leaving: stamp the departure and count it. Atomic increment, so
-- it can't be lost the way a client-side read-modify-write could.
--
-- `left_at is null` guards against double-counting: pressing Leave
-- twice, or a retry, must not inflate the count or restart the
-- clock on an absence already in progress.
create or replace function public.leave_round(_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.round_participants
  set left_at = now(),
      left_count = left_count + 1
  where round_id = _round_id
    and student_id = auth.uid()
    and left_at is null;
end;
$$;

revoke execute on function public.leave_round(uuid) from anon;

-- Rejoining: bank the elapsed absence, then clear the "out now"
-- flag. left_count is deliberately NOT reset — it is the record
-- that the student was away, and it has to outlive the return.
create or replace function public.rejoin_round(_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.round_participants
  set absent_seconds =
        absent_seconds
        + greatest(0, extract(epoch from (now() - left_at))::integer),
      left_at = null
  where round_id = _round_id
    and student_id = auth.uid()
    and left_at is not null;
end;
$$;

revoke execute on function public.rejoin_round(uuid) from anon;
