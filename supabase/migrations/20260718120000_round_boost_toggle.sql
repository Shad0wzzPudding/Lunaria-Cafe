-- ============================================================
-- Per-round boost toggle
--
-- Instructors choose at start time whether students' focus
-- boosts (and future score modifiers) apply during the live
-- session. Default ON — matches pre-toggle behavior. When off,
-- joining students spend no ticket and get no ×1.15.
-- ============================================================

alter table public.class_rounds
  add column if not exists allow_boosts boolean not null default true;

-- start_round gains the toggle. Drop the old 2-arg version so
-- there's no overload ambiguity.
drop function if exists public.start_round(uuid, integer);

create function public.start_round(
  _classroom_id uuid,
  _duration_seconds integer default null,
  _allow_boosts boolean default true
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

  insert into public.class_rounds (classroom_id, instructor_id, duration_seconds, ends_at, allow_boosts)
  values (
    _classroom_id,
    auth.uid(),
    _duration_seconds,
    case
      when _duration_seconds is not null and _duration_seconds > 0
        then now() + make_interval(secs => _duration_seconds)
      else null
    end,
    coalesce(_allow_boosts, true)
  )
  returning * into _round;

  return _round;
end;
$$;

revoke execute on function public.start_round(uuid, integer, boolean) from anon;

-- active_round_for_me now also reports the toggle so the student
-- client knows whether joining spends a ticket. Return columns
-- change → drop before recreation.
drop function if exists public.active_round_for_me();

create function public.active_round_for_me()
returns table (
  round_id         uuid,
  classroom_id     uuid,
  classroom_name   text,
  started_at       timestamptz,
  duration_seconds integer,
  ends_at          timestamptz,
  allow_boosts     boolean,
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
    r.allow_boosts,
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
