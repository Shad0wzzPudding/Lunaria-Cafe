-- ============================================================
-- Two gaps in the study-room scope, from review
--
-- 1. can_join_round()'s study branch had no participant escape
--    hatch, where can_access_round() does. Being unfriended
--    mid-session therefore left reads working and every progress
--    UPDATE silently rejected — the WITH CHECK on "student
--    updates own participation" calls can_join_round — freezing
--    that student's focus time, coins and reputation on the board
--    for the rest of the room while everything still LOOKED fine
--    to them.
--
-- 2. Nothing retires a timed study room when its clock runs out.
--    A classroom round has the same shape, but a teacher is there
--    to press End; a host can simply close the tab. The room then
--    stays 'active' for ever: friends keep getting join toasts,
--    joining lands them in a session with no time left (the
--    client's `remaining > 0` guard skips START_FOCUS, so nothing
--    starts), and the host cannot open another because of the
--    one-open-room index.
--
--    Handled without a scheduler: expired rooms are filtered out
--    of discovery, and retired for real the next time their host
--    opens one. Classroom rounds are deliberately left alone —
--    that behaviour is long-standing and a teacher's board is
--    meant to stay up after the clock stops.
-- ============================================================

-- ── 1. Let a participant keep reporting ─────────────────────

create or replace function public.can_join_round(_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_rounds r
    where r.id = _round_id
      and r.status = 'active'
      and case r.owner_kind
            when 'classroom' then public.is_classroom_member(r.classroom_id)
            when 'study' then
              r.host_id = auth.uid()
              or public.is_accepted_friend(r.host_id)
              -- Already in the room. Mirrors can_access_round(): losing a
              -- friendship mid-session must not silently freeze someone's
              -- progress, and it should not be able to eject them either.
              -- The room ends soon enough on its own.
              or exists (
                select 1 from public.round_participants rp
                where rp.round_id = r.id
                  and rp.student_id = auth.uid()
                  and rp.left_at is null
              )
            else false
          end
  )
$$;

-- ── 2. Retire expired study rooms ───────────────────────────

-- Idempotent and safe to call from anywhere: only ever touches the CALLER's
-- own study rooms, and only ones whose clock has already run out.
create or replace function public.retire_my_expired_study_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  update public.class_rounds
  set status = 'ended',
      -- Stamped with when the clock actually stopped, not when someone
      -- noticed, so the history reads honestly.
      ended_at = ends_at
  where host_id = auth.uid()
    and owner_kind = 'study'
    and status = 'active'
    and ends_at is not null
    and ends_at <= now();

  get diagnostics _n = row_count;
  return _n;
end;
$$;

create or replace function public.start_study_room(
  _duration_seconds integer default null,
  _allow_boosts     boolean default true,
  _title            text default null
)
returns public.class_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  _room public.class_rounds;
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can open a study room';
  end if;

  if _duration_seconds is not null and _duration_seconds <= 0 then
    raise exception 'A session length must be more than zero';
  end if;

  if char_length(coalesce(trim(_title), '')) > 60 then
    raise exception 'A room name must be 60 characters or fewer';
  end if;

  -- Clear out anything of the caller's that has already run its course, so a
  -- finished room cannot block the next one behind the one-open-room index.
  perform public.retire_my_expired_study_rooms();

  select * into _room
  from public.class_rounds
  where host_id = auth.uid() and owner_kind = 'study' and status = 'active'
  limit 1;

  -- Idempotent, exactly as start_round is: a second Open click returns the
  -- room already running rather than renaming a session in progress.
  if found then
    return _room;
  end if;

  insert into public.class_rounds (
    owner_kind, host_id, duration_seconds, ends_at, allow_boosts, title
  )
  values (
    'study',
    auth.uid(),
    _duration_seconds,
    case
      when _duration_seconds is not null and _duration_seconds > 0
        then now() + make_interval(secs => _duration_seconds)
      else null
    end,
    coalesce(_allow_boosts, true),
    nullif(trim(_title), '')
  )
  returning * into _room;

  return _room;
end;
$$;

-- Discovery skips study rooms whose clock has run out, so nobody is offered a
-- room they would land in with no time left. The row may still say 'active'
-- until its host next opens one; this is the read-side half of that.
drop function if exists public.active_round_for_me();

create function public.active_round_for_me()
returns table (
  round_id         uuid,
  owner_kind       text,
  classroom_id     uuid,
  host_id          uuid,
  scope_name       text,
  title            text,
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
    r.id, r.owner_kind, r.classroom_id, null::uuid, c.name, r.title,
    r.started_at, r.duration_seconds, r.ends_at, r.allow_boosts,
    exists (
      select 1 from public.round_participants rp
      where rp.round_id = r.id
        and rp.student_id = auth.uid()
        and rp.left_at is null
    )
  from public.class_rounds r
  join public.classrooms c on c.id = r.classroom_id
  where r.status = 'active'
    and r.owner_kind = 'classroom'
    and public.is_classroom_member(r.classroom_id)
    -- Classroom rounds are NOT filtered on ends_at: a teacher's board stays
    -- up after the clock stops, and has since timed rounds shipped.

  union all

  select
    r.id, r.owner_kind, null::uuid, r.host_id,
    coalesce(p.display_name, split_part(p.email, '@', 1)), r.title,
    r.started_at, r.duration_seconds, r.ends_at, r.allow_boosts,
    exists (
      select 1 from public.round_participants rp
      where rp.round_id = r.id
        and rp.student_id = auth.uid()
        and rp.left_at is null
    )
  from public.class_rounds r
  join public.profiles p on p.id = r.host_id
  where r.status = 'active'
    and r.owner_kind = 'study'
    and (r.ends_at is null or r.ends_at > now())
    and (r.host_id = auth.uid() or public.is_accepted_friend(r.host_id))

  -- By position: ORDER BY in a UNION cannot see the output column names.
  order by 7 desc
$$;

revoke execute on function public.retire_my_expired_study_rooms()          from public, anon;
revoke execute on function public.start_study_room(integer, boolean, text) from public, anon;
revoke execute on function public.active_round_for_me()                    from public, anon;

grant execute on function public.retire_my_expired_study_rooms()           to authenticated;
grant execute on function public.start_study_room(integer, boolean, text)  to authenticated;
grant execute on function public.active_round_for_me()                     to authenticated;
