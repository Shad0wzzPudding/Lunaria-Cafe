-- ============================================================
-- Round-scoped distraction count
--
-- attention.sessionDistractions already exists client-side and
-- drives the "Distractions" figure on the session summary — but
-- it never left the player's own machine, so an instructor could
-- see that a student focused for 25 minutes without seeing that
-- the AI camera pulled them up eleven times getting there.
--
-- Collected exactly like focus_seconds / coins / rep: the count
-- accrued DURING the round, not the student's lifetime total.
-- (The lifetime equivalent is stats.chaosEvents, already visible
-- to instructors through get_classroom_stats.)
-- ============================================================

alter table public.round_participants
  add column if not exists distractions integer not null default 0;

-- A negative count is meaningless — it would render as "-3 distractions"
-- on the board and skew the per-session class total. The client clamps for
-- display too; this stops it reaching the table in the first place.
alter table public.round_participants
  drop constraint if exists round_participants_distractions_nonneg;

alter table public.round_participants
  add constraint round_participants_distractions_nonneg
  check (distractions >= 0);

-- Roll the new column into the history summary alongside the other
-- per-round aggregates. Return columns change, so the function has
-- to be dropped before recreation.
drop function if exists public.list_class_rounds(uuid);

create function public.list_class_rounds(_classroom_id uuid)
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
  avg_focus           numeric,
  total_distractions  bigint
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
    round(avg(rp.avg_focus), 1),
    coalesce(sum(rp.distractions), 0)
  from public.class_rounds r
  left join public.round_participants rp on rp.round_id = r.id
  where r.classroom_id = _classroom_id
  group by r.id
  order by r.started_at desc;
end;
$$;

revoke execute on function public.list_class_rounds(uuid) from anon;
