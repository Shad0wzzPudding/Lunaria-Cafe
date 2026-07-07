-- ============================================================
-- Live rounds (Kahoot-style class sessions)
--
-- An instructor "starts a round" for a classroom; members join and
-- their live round-scoped progress (focus time, coins, avg focus —
-- all accrued DURING the round) is broadcast over Supabase Realtime
-- to the instructor's board and to each student's cafe overlay.
--
-- Named "round" (not "session") on purpose: "session" already means
-- the pomodoro focus session in the game.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table public.class_rounds (
  id            uuid primary key default gen_random_uuid(),
  classroom_id  uuid not null references public.classrooms (id) on delete cascade,
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'active' check (status in ('active', 'ended')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create index class_rounds_classroom_idx on public.class_rounds (classroom_id);
-- At most one live round per classroom at a time.
create unique index class_rounds_one_active
  on public.class_rounds (classroom_id)
  where status = 'active';

create table public.round_participants (
  round_id      uuid not null references public.class_rounds (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  display_name  text,
  focus_seconds numeric not null default 0,
  coins         numeric not null default 0,
  avg_focus     numeric,          -- 0-100, null until the first focus sample
  joined_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (round_id, student_id)
);

create index round_participants_round_idx on public.round_participants (round_id);

alter table public.class_rounds enable row level security;
alter table public.round_participants enable row level security;

-- ── SECURITY DEFINER helpers (avoid RLS recursion in policies) ─

create or replace function public.can_access_round(_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_rounds r
    where r.id = _round_id
      and (public.is_classroom_member(r.classroom_id)
           or public.is_classroom_instructor(r.classroom_id))
  )
$$;

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
      and public.is_classroom_member(r.classroom_id)
  )
$$;

-- ── RLS policies ────────────────────────────────────────────
-- Reads: any member or instructor of the round's classroom (also
-- what Realtime uses to decide who receives change events).
-- Writes to class_rounds go only through the RPCs below
-- (SECURITY DEFINER), so no direct write policy is defined.

create policy "members read rounds"
  on public.class_rounds for select
  using (
    public.is_classroom_member(classroom_id)
    or public.is_classroom_instructor(classroom_id)
  );

create policy "members read participants"
  on public.round_participants for select
  using (public.can_access_round(round_id));

-- A student manages only their own participant row, and only while
-- the round is live and they belong to its classroom.
create policy "student inserts own participation"
  on public.round_participants for insert
  with check (student_id = auth.uid() and public.can_join_round(round_id));

create policy "student updates own participation"
  on public.round_participants for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and public.can_join_round(round_id));

-- ── RPCs ────────────────────────────────────────────────────

-- Instructor starts (or re-fetches the already-live) round.
create or replace function public.start_round(_classroom_id uuid)
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

  insert into public.class_rounds (classroom_id, instructor_id)
  values (_classroom_id, auth.uid())
  returning * into _round;

  return _round;
end;
$$;

-- Instructor ends a live round.
create or replace function public.end_round(_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.class_rounds r
    where r.id = _round_id and public.is_classroom_instructor(r.classroom_id)
  ) then
    raise exception 'Not your round';
  end if;

  update public.class_rounds
  set status = 'ended', ended_at = now()
  where id = _round_id and status = 'active';
end;
$$;

-- Student-facing: live rounds across the caller's classrooms, plus
-- whether they've already joined each. Powers the global join toast
-- and the "Join live session" buttons on the classrooms page.
create or replace function public.active_round_for_me()
returns table (
  round_id       uuid,
  classroom_id   uuid,
  classroom_name text,
  started_at     timestamptz,
  joined         boolean
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

revoke execute on function public.start_round(uuid) from anon;
revoke execute on function public.end_round(uuid) from anon;
revoke execute on function public.active_round_for_me() from anon;

-- ── Realtime ────────────────────────────────────────────────
alter publication supabase_realtime add table public.class_rounds;
alter publication supabase_realtime add table public.round_participants;
