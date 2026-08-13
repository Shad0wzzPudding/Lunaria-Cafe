-- ============================================================
-- Named sessions + round history
--
-- Two gaps closed together, because one is useless without the
-- other:
--
--   1. Rounds had no name, so two sessions in the same week were
--      indistinguishable once they were over.
--   2. Ended rounds were unreachable. Nothing in the app ever
--      queried a round that wasn't 'active', so the moment a
--      session ended its results vanished from the instructor's
--      view — even though every round_participants row survives
--      with its final focus seconds, coins, rep and avg focus.
--
-- NOTE what this migration does NOT need: any new RLS. The
-- existing "members read rounds" / "members read participants"
-- policies gate on classroom membership alone and never filter on
-- status, so ended rounds are already readable by exactly the
-- right people. list_class_rounds() below is a convenience
-- aggregate over data the caller can already select, and it
-- repeats that same membership test rather than widening it.
-- ============================================================

-- ── Title ───────────────────────────────────────────────────
-- Nullable: an unnamed session stays valid and renders with a
-- date-derived fallback in the UI. Same optional treatment as
-- duration_seconds.
alter table public.class_rounds
  add column if not exists title text;

alter table public.class_rounds
  drop constraint if exists class_rounds_title_len;

alter table public.class_rounds
  add constraint class_rounds_title_len
  check (title is null or char_length(trim(title)) between 1 and 60);

-- ── start_round gains a title ───────────────────────────────
-- Drop the old 3-arg version so there's no overload ambiguity —
-- the same dance round_duration and round_boost_toggle each did.
drop function if exists public.start_round(uuid, integer, boolean);

create function public.start_round(
  _classroom_id     uuid,
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
    -- Idempotent: one live round per classroom. Deliberately does
    -- NOT retitle the running round — a second Start click should
    -- be a no-op, not a silent rename of a session in progress.
    return _round;
  end if;

  insert into public.class_rounds (
    classroom_id, instructor_id, duration_seconds, ends_at, allow_boosts, title
  )
  values (
    _classroom_id,
    auth.uid(),
    _duration_seconds,
    case
      when _duration_seconds is not null and _duration_seconds > 0
        then now() + make_interval(secs => _duration_seconds)
      else null
    end,
    coalesce(_allow_boosts, true),
    -- Blank input means "unnamed", not a zero-length title that
    -- would trip the length check above.
    nullif(trim(_title), '')
  )
  returning * into _round;

  return _round;
end;
$$;

revoke execute on function public.start_round(uuid, integer, boolean, text) from anon;

-- ── active_round_for_me reports the title ───────────────────
-- Return columns change → must be dropped before recreation
-- (can't CREATE OR REPLACE a new return type). Lets the student's
-- join toast and cafe overlay name the session they're joining.
drop function if exists public.active_round_for_me();

create function public.active_round_for_me()
returns table (
  round_id         uuid,
  classroom_id     uuid,
  classroom_name   text,
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
    r.id,
    r.classroom_id,
    c.name,
    r.title,
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

-- ── Round history ───────────────────────────────────────────
-- Every round of a classroom, live and ended, newest first, with
-- the roll-up each history card shows. Per-participant detail
-- needs no RPC — round_participants is already selectable by the
-- same people (see the header note), so the existing
-- useRoundParticipants hook works unchanged on an ended round.
--
-- Membership test mirrors the "members read rounds" policy
-- exactly: instructors AND members. Students seeing their own
-- class's past sessions is the same exposure the per-classroom
-- leaderboard already grants.
create or replace function public.list_class_rounds(_classroom_id uuid)
returns table (
  round_id            uuid,
  title               text,
  status              text,
  started_at          timestamptz,
  ended_at            timestamptz,
  duration_seconds    integer,
  allow_boosts        boolean,
  participant_count   bigint,
  total_focus_seconds numeric,
  avg_focus           numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_classroom_instructor(_classroom_id)
          or public.is_classroom_member(_classroom_id)) then
    raise exception 'Not your classroom';
  end if;

  return query
  select
    r.id,
    r.title,
    r.status,
    r.started_at,
    r.ended_at,
    r.duration_seconds,
    r.allow_boosts,
    count(rp.student_id),
    -- coalesce so a round nobody joined reports 0, not null.
    coalesce(sum(rp.focus_seconds), 0),
    -- avg() already ignores nulls (avg_focus is null until a
    -- student's first focus sample), so a round with no samples
    -- stays null rather than becoming a misleading 0.
    round(avg(rp.avg_focus), 1)
  from public.class_rounds r
  left join public.round_participants rp on rp.round_id = r.id
  where r.classroom_id = _classroom_id
  group by r.id
  order by r.started_at desc;
end;
$$;

revoke execute on function public.list_class_rounds(uuid) from anon;
