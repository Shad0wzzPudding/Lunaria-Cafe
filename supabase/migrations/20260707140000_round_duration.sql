-- ============================================================
-- Round duration (teacher-controlled synchronized focus)
--
-- A round can now be timed (duration_seconds set → ends_at
-- computed) or open-ended (both null → runs until the teacher
-- ends it). Students focus for the REMAINING time so a class
-- finishes together.
-- ============================================================

alter table public.class_rounds
  add column if not exists duration_seconds integer,
  add column if not exists ends_at timestamptz;

-- start_round gains an optional duration. Drop the old 1-arg
-- version so there's no overload ambiguity.
drop function if exists public.start_round(uuid);

create or replace function public.start_round(
  _classroom_id uuid,
  _duration_seconds integer default null
)
returns public.class_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  _round public.class_rounds;
begin
  if not public.is_classroom_instructor(_classroom_id) then
    raise exception 'Not your classroom';
  end if;

  select * into _round
  from public.class_rounds
  where classroom_id = _classroom_id and status = 'active'
  limit 1;

  if found then
    return _round;  -- idempotent: one live round per classroom
  end if;

  insert into public.class_rounds (classroom_id, instructor_id, duration_seconds, ends_at)
  values (
    _classroom_id,
    auth.uid(),
    _duration_seconds,
    case
      when _duration_seconds is not null and _duration_seconds > 0
        then now() + make_interval(secs => _duration_seconds)
      else null
    end
  )
  returning * into _round;

  return _round;
end;
$$;

revoke execute on function public.start_round(uuid, integer) from anon;

-- active_round_for_me now also reports the round's timing so the
-- student client knows how long to focus. Its return columns change,
-- so it must be dropped before recreation (can't CREATE OR REPLACE a
-- new return type).
drop function if exists public.active_round_for_me();

create function public.active_round_for_me()
returns table (
  round_id         uuid,
  classroom_id     uuid,
  classroom_name   text,
  started_at       timestamptz,
  duration_seconds integer,
  ends_at          timestamptz,
  joined           boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.classroom_id,
    c.name,
    r.started_at,
    r.duration_seconds,
    r.ends_at,
    exists (
      select 1 from public.round_participants rp
      where rp.round_id = r.id and rp.student_id = auth.uid()
    )
  from public.class_rounds r
  join public.classrooms c on c.id = r.classroom_id
  where r.status = 'active'
    and public.is_classroom_member(r.classroom_id)
  order by r.started_at desc
$$;

revoke execute on function public.active_round_for_me() from anon;
