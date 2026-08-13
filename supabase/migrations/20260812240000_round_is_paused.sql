-- ============================================================
-- "Paused right now" on the live board
--
-- paused_seconds is cumulative, so a snapshot of it cannot answer
-- whether a student is paused AT THIS MOMENT — the instructor
-- could see that someone had paused a lot without seeing that
-- they are sitting paused while the class works.
--
-- Written every reporting tick alongside the other live metrics.
-- Only meaningful while a round is running: history judges
-- attendance from paused_seconds instead, so a value left behind
-- by the last tick of a finished session is never read.
-- ============================================================

alter table public.round_participants
  add column if not exists is_paused boolean not null default false;

-- Leaving clears it too. Without this a student who paused and then
-- left would sit on the board as "paused" rather than "left early",
-- because the report loop stops the moment they go.
create or replace function public.leave_round(_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.round_participants
  set left_at = now(),
      left_count = left_count + 1,
      is_paused = false
  where round_id = _round_id
    and student_id = auth.uid()
    and left_at is null;
end;
$$;

revoke execute on function public.leave_round(uuid) from anon;
