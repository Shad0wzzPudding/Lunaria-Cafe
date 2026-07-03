-- ============================================================
-- Hardening: only accounts with the instructor flag may create
-- classrooms. The original "for all" policy only checked
-- ownership, so any signed-in student could insert a room via
-- the raw API (the UI never offered it).
-- ============================================================

create or replace function public.is_instructor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_instructor
  )
$$;

revoke execute on function public.is_instructor() from anon;

drop policy "instructor manages own classrooms" on public.classrooms;

create policy "instructor reads own classrooms"
  on public.classrooms for select
  using (instructor_id = auth.uid());

create policy "instructor creates classrooms"
  on public.classrooms for insert
  with check (instructor_id = auth.uid() and public.is_instructor());

create policy "instructor updates own classrooms"
  on public.classrooms for update
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

create policy "instructor deletes own classrooms"
  on public.classrooms for delete
  using (instructor_id = auth.uid());
