-- ============================================================
-- Reset display name to default
--
-- Companion to update_display_name: lets a student clear their
-- custom name (set display_name back to NULL), so the app falls
-- back to the email-derived name again. Same student-only gate.
-- ============================================================

create or replace function public.reset_display_name()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_student
  ) then
    raise exception 'Only students can change their display name';
  end if;

  update public.profiles
    set display_name = null
    where id = auth.uid();
end;
$$;

revoke execute on function public.reset_display_name() from anon;
