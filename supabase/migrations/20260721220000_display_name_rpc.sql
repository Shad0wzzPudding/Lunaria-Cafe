-- ============================================================
-- Self-service display name
--
-- Lets a student rename their own account. Two parts:
--
--   1. Drop the broad "update own profile" policy. It allowed a
--      signed-in user to UPDATE any column of their own row —
--      including is_instructor — i.e. self-promotion to instructor
--      straight from the browser console. Nothing in the app wrote
--      to profiles directly, so no client flow relied on it.
--
--   2. Add update_display_name(): a SECURITY DEFINER RPC that writes
--      ONLY display_name, ONLY for accounts holding the student role,
--      with trim + length validation. This is the single sanctioned
--      write path to profiles from the client.
-- ============================================================

drop policy if exists "update own profile" on public.profiles;

create or replace function public.update_display_name(new_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
begin
  cleaned := nullif(trim(new_name), '');

  if cleaned is null then
    raise exception 'Display name cannot be empty';
  end if;

  if char_length(cleaned) > 24 then
    raise exception 'Display name must be 24 characters or fewer';
  end if;

  -- Role gate: students only (a dual-role account qualifies via is_student).
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_student
  ) then
    raise exception 'Only students can change their display name';
  end if;

  update public.profiles
    set display_name = cleaned
    where id = auth.uid();

  return cleaned;
end;
$$;

revoke execute on function public.update_display_name(text) from anon;
