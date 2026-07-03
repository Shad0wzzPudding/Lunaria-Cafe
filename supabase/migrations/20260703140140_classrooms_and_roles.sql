-- ============================================================
-- Roles (Student / Instructor) + Classrooms
--
-- One auth account (email) can hold BOTH roles at once
-- (prototype decision), so roles are two flags on the profile
-- rather than a single `role` column.
--
-- Privacy rule: instructors never read player_saves directly.
-- The only door into student data is get_classroom_stats(),
-- which returns the stats subset and excludes the journal.
-- ============================================================

-- ── 1. Profiles ─────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  display_name  text,
  is_student    boolean not null default true,
  is_instructor boolean not null default false,
  created_at    timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

-- Instructor signups must present this code (sent as
-- raw_user_meta_data.instructor_code by the client). The client
-- shows the code on the signup form — prototype only — but the
-- actual gate lives here, server-side.
create or replace function public.instructor_secret_code()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'LUNARIA-TEACH'
$$;

-- Auto-create a profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, is_student, is_instructor)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((new.raw_user_meta_data ->> 'is_student')::boolean, true),
    coalesce(
      (new.raw_user_meta_data ->> 'is_instructor')::boolean
        and (new.raw_user_meta_data ->> 'instructor_code') = public.instructor_secret_code(),
      false
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that existed before this migration.
insert into public.profiles (id, email, display_name)
select id, email, split_part(email, '@', 1)
from auth.users
on conflict (id) do nothing;

-- ── 2. Classrooms ───────────────────────────────────────────

create table public.classrooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(trim(name)) between 1 and 60),
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  join_pin      text not null default lpad(floor(random() * 1000000)::text, 6, '0'),
  created_at    timestamptz not null default now()
);

create index classrooms_instructor_idx on public.classrooms (instructor_id);

alter table public.classrooms enable row level security;

create table public.classroom_members (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (classroom_id, student_id)
);

create index classroom_members_student_idx on public.classroom_members (student_id);

alter table public.classroom_members enable row level security;

-- ── 3. RLS helper functions ─────────────────────────────────
-- SECURITY DEFINER so policy subqueries bypass RLS on the
-- tables they inspect — otherwise classrooms and
-- classroom_members policies would recurse into each other.

create or replace function public.is_classroom_instructor(_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classrooms
    where id = _classroom_id and instructor_id = auth.uid()
  )
$$;

create or replace function public.is_classroom_member(_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classroom_members
    where classroom_id = _classroom_id and student_id = auth.uid()
  )
$$;

-- ── 4. RLS policies ─────────────────────────────────────────

-- profiles: read your own…
create policy "read own profile"
  on public.profiles for select
  using (id = auth.uid());

-- …and instructors read profiles of students in their classrooms.
create policy "instructor reads member profiles"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.classroom_members cm
      where cm.student_id = profiles.id
        and public.is_classroom_instructor(cm.classroom_id)
    )
  );

create policy "update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- classrooms: instructors manage their own rooms.
-- Students never select this table (it holds join_pin);
-- they browse via list_classrooms() below.
create policy "instructor manages own classrooms"
  on public.classrooms for all
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

-- classroom_members: students see their own memberships,
-- instructors see (and manage) their rooms' rosters.
create policy "student reads own memberships"
  on public.classroom_members for select
  using (student_id = auth.uid());

create policy "instructor reads roster"
  on public.classroom_members for select
  using (public.is_classroom_instructor(classroom_id));

create policy "instructor removes members"
  on public.classroom_members for delete
  using (public.is_classroom_instructor(classroom_id));

create policy "student leaves classroom"
  on public.classroom_members for delete
  using (student_id = auth.uid());

-- Inserts happen only through join_classroom() / add_student_by_email()
-- (SECURITY DEFINER), so no insert policy is defined.

-- ── 5. RPCs ─────────────────────────────────────────────────

-- Student-facing directory: every room, WITHOUT the pin.
create or replace function public.list_classrooms()
returns table (
  id              uuid,
  name            text,
  instructor_name text,
  member_count    bigint,
  is_member       boolean,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    (select count(*) from public.classroom_members cm where cm.classroom_id = c.id),
    exists (
      select 1 from public.classroom_members cm
      where cm.classroom_id = c.id and cm.student_id = auth.uid()
    ),
    c.created_at
  from public.classrooms c
  join public.profiles p on p.id = c.instructor_id
  where auth.uid() is not null
  order by c.created_at desc
$$;

-- Student self-enrolls with the room PIN.
create or replace function public.join_classroom(_classroom_id uuid, _pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_student
  ) then
    raise exception 'Only student accounts can join classrooms';
  end if;

  if not exists (
    select 1 from public.classrooms
    where id = _classroom_id and join_pin = trim(_pin)
  ) then
    raise exception 'Wrong PIN';
  end if;

  insert into public.classroom_members (classroom_id, student_id)
  values (_classroom_id, auth.uid())
  on conflict do nothing;
end;
$$;

-- Instructor invites a student by email (direct enrollment).
create or replace function public.add_student_by_email(_classroom_id uuid, _email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _student_id uuid;
begin
  if not public.is_classroom_instructor(_classroom_id) then
    raise exception 'Not your classroom';
  end if;

  select id into _student_id
  from public.profiles
  where lower(email) = lower(trim(_email)) and is_student;

  if _student_id is null then
    raise exception 'No student account found with that email';
  end if;

  insert into public.classroom_members (classroom_id, student_id)
  values (_classroom_id, _student_id)
  on conflict do nothing;
end;
$$;

-- Instructor's stats view over one classroom.
-- Returns ONLY the stats subset of each student's save —
-- save_data.journal (private notes/todos) never leaves the db.
create or replace function public.get_classroom_stats(_classroom_id uuid)
returns table (
  student_id   uuid,
  display_name text,
  email        text,
  stats        jsonb,
  coins        numeric,
  reputation   numeric,
  last_active  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_classroom_instructor(_classroom_id) then
    raise exception 'Not your classroom';
  end if;

  return query
  select
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    p.email,
    ps.save_data -> 'stats',
    (ps.save_data ->> 'coins')::numeric,
    (ps.save_data ->> 'reputation')::numeric,
    ps.updated_at
  from public.classroom_members cm
  join public.profiles p on p.id = cm.student_id
  left join public.player_saves ps on ps.user_id = cm.student_id
  where cm.classroom_id = _classroom_id
  order by cm.added_at;
end;
$$;

-- Instructor regenerates a room's PIN.
create or replace function public.regenerate_pin(_classroom_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _new_pin text := lpad(floor(random() * 1000000)::text, 6, '0');
begin
  if not public.is_classroom_instructor(_classroom_id) then
    raise exception 'Not your classroom';
  end if;

  update public.classrooms set join_pin = _new_pin where id = _classroom_id;
  return _new_pin;
end;
$$;

-- Lock the RPCs to signed-in users.
revoke execute on function public.list_classrooms() from anon;
revoke execute on function public.join_classroom(uuid, text) from anon;
revoke execute on function public.add_student_by_email(uuid, text) from anon;
revoke execute on function public.get_classroom_stats(uuid) from anon;
revoke execute on function public.regenerate_pin(uuid) from anon;
