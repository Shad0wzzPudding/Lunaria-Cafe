-- ============================================================
-- "Join by code" has never worked.
--
--   POST /rest/v1/rpc/join_classroom_by_code
--   -> 400  42702  column reference "classroom_id" is ambiguous
--
-- and because the exception aborts the whole function, the
-- student is not enrolled at all — the INSERT above it is rolled
-- back with everything else. Reproduced on a clean classroom:
-- joining by code failed and left no member row, while joining
-- the same classroom from the public list returned 204 and did.
-- That difference is presumably why it went unnoticed: the list
-- path works, so classrooms fill up anyway.
--
-- The cause is the same trap as 20260814120000: the function
-- declares
--
--   returns table (classroom_id uuid, classroom_name text)
--
-- so `classroom_id` is an OUT PARAMETER for the whole body, and
-- this line cannot tell it from the column of the same name:
--
--   where classroom_id = _room.id
--
-- An alias fixes it without touching the signature. Renaming the
-- OUT params would also work, but the client reads
-- `data[0].classroom_name` for its success toast
-- (MyClassrooms.jsx), so the shape has to stay.
-- ============================================================

create or replace function public.join_classroom_by_code(_code text, _pin text)
returns table (classroom_id uuid, classroom_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _room public.classrooms;
  -- Tolerate how people actually type a code off a slide.
  _norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_student
  ) then
    raise exception 'Only student accounts can join classrooms';
  end if;

  select * into _room from public.classrooms where class_code = _norm;

  if not found then
    raise exception 'No classroom with that code';
  end if;

  if _room.join_pin <> trim(coalesce(_pin, '')) then
    raise exception 'Wrong PIN';
  end if;

  insert into public.classroom_members (classroom_id, student_id)
  values (_room.id, auth.uid())
  on conflict do nothing;

  -- Joining by code satisfies any invitation that was outstanding.
  -- Aliased, and every column qualified through it: an unqualified
  -- `classroom_id` here is the OUT parameter, not this table's column, and
  -- that is what made the whole call fail.
  update public.classroom_invites as ci
  set status = 'accepted', responded_at = now()
  where ci.classroom_id = _room.id
    and ci.student_id = auth.uid()
    and ci.status = 'pending';

  return query select _room.id, _room.name;
end;
$$;

revoke execute on function public.join_classroom_by_code(text, text) from public, anon;
grant  execute on function public.join_classroom_by_code(text, text) to authenticated;
