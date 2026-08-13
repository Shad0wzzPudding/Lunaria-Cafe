-- ============================================================
-- Classroom visibility + join codes + invitations, and
-- partial round participation.
--
-- Four related changes:
--
--   1. A student who left a live session was DELETED from
--      round_participants, taking their focus time and reputation
--      with them. They now stay on the board, marked as not having
--      finished.
--   2. Classrooms are public or private. Private rooms are hidden
--      from the browse list but remain joinable.
--   3. Every classroom gets a short human-typeable code, so a
--      private room can be joined with code + PIN (Google
--      Classroom style) without ever appearing in a list.
--   4. Instructors invite students, who accept or decline. The
--      old add_student_by_email enrolled people silently; consent
--      is now explicit.
-- ============================================================

-- ── 1. Partial participation ────────────────────────────────
-- Null = still in (or finished in) the session. Set when the
-- student opts out. Note leave no longer deletes the row, so the
-- numbers they earned before leaving survive into history.
alter table public.round_participants
  add column if not exists left_at timestamptz;

-- `joined` must mean "currently in", not "has ever been in" —
-- otherwise leaving no longer clears it (the row used to be
-- deleted) and the client's auto-resume would drag a student who
-- deliberately left straight back into the session on next load.
create or replace function public.active_round_for_me()
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
      where rp.round_id = r.id
        and rp.student_id = auth.uid()
        and rp.left_at is null
    )
  from public.class_rounds r
  join public.classrooms c on c.id = r.classroom_id
  where r.status = 'active'
    and public.is_classroom_member(r.classroom_id)
  order by r.started_at desc
$$;

revoke execute on function public.active_round_for_me() from anon;

-- ── 2. Visibility + join code ───────────────────────────────

-- Unambiguous alphabet: no O/0 or I/1, because these get read off
-- a projector and typed by hand.
create or replace function public.generate_class_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  _alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _code text;
  _i integer;
begin
  loop
    _code := '';
    for _i in 1..6 loop
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::integer, 1);
    end loop;
    exit when not exists (
      select 1 from public.classrooms where class_code = _code
    );
  end loop;
  return _code;
end;
$$;

alter table public.classrooms
  add column if not exists is_public boolean not null default true,
  add column if not exists class_code text;

-- Backfill before the not-null / unique constraints land.
update public.classrooms
set class_code = public.generate_class_code()
where class_code is null;

create unique index if not exists classrooms_class_code_idx
  on public.classrooms (class_code);

alter table public.classrooms alter column class_code set not null;
alter table public.classrooms alter column class_code set default public.generate_class_code();

-- Student directory: public rooms, plus any private room the
-- caller already belongs to (so it still shows under "Enrolled").
-- Return columns change → drop before recreation.
drop function if exists public.list_classrooms();

create function public.list_classrooms()
returns table (
  id              uuid,
  name            text,
  instructor_name text,
  member_count    bigint,
  is_member       boolean,
  is_public       boolean,
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
    public.is_classroom_member(c.id),
    c.is_public,
    c.created_at
  from public.classrooms c
  join public.profiles p on p.id = c.instructor_id
  where auth.uid() is not null
    -- A private room is invisible unless you're already in it.
    and (c.is_public or public.is_classroom_member(c.id))
  order by c.created_at desc
$$;

revoke execute on function public.list_classrooms() from anon;

-- Join by code + PIN. The only way into a private room besides an
-- invitation, and it works for public rooms too so there is one
-- join path rather than two.
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
  update public.classroom_invites
  set status = 'accepted', responded_at = now()
  where classroom_id = _room.id
    and student_id = auth.uid()
    and status = 'pending';

  return query select _room.id, _room.name;
end;
$$;

revoke execute on function public.join_classroom_by_code(text, text) from anon;

-- ── 3. Invitations ──────────────────────────────────────────

create table if not exists public.classroom_invites (
  id           uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  invited_by   uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  -- One live invitation per student per room; re-inviting reopens
  -- the same row rather than stacking duplicates.
  unique (classroom_id, student_id)
);

create index if not exists classroom_invites_student_idx
  on public.classroom_invites (student_id) where status = 'pending';

alter table public.classroom_invites enable row level security;

drop policy if exists "student reads own invites" on public.classroom_invites;
create policy "student reads own invites"
  on public.classroom_invites for select
  using (student_id = auth.uid());

drop policy if exists "instructor reads room invites" on public.classroom_invites;
create policy "instructor reads room invites"
  on public.classroom_invites for select
  using (public.is_classroom_instructor(classroom_id));

drop policy if exists "instructor withdraws invites" on public.classroom_invites;
create policy "instructor withdraws invites"
  on public.classroom_invites for delete
  using (public.is_classroom_instructor(classroom_id));

-- Writes go through the RPCs below (SECURITY DEFINER), so there is
-- no insert/update policy.

-- Instructor invites by email. Replaces add_student_by_email in the
-- UI: that one enrolled the student with no say in the matter.
create or replace function public.invite_student_by_email(_classroom_id uuid, _email text)
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

  -- is_classroom_member() tests the CALLER, so it can't answer this —
  -- check the invited student's membership directly.
  if exists (
    select 1 from public.classroom_members
    where classroom_id = _classroom_id and student_id = _student_id
  ) then
    raise exception 'That student is already in this classroom';
  end if;

  insert into public.classroom_invites (classroom_id, student_id, invited_by)
  values (_classroom_id, _student_id, auth.uid())
  on conflict (classroom_id, student_id) do update
    set status = 'pending',
        invited_by = auth.uid(),
        created_at = now(),
        responded_at = null;
end;
$$;

revoke execute on function public.invite_student_by_email(uuid, text) from anon;

-- The instructor's side: who hasn't replied yet.
--
-- This has to be an RPC rather than a select with an embedded profiles
-- join, because "instructor reads member profiles" only covers students
-- already in classroom_members — an INVITED student isn't one yet, so
-- the join would silently return null for every row. SECURITY DEFINER
-- here, rather than widening the profiles policy, keeps the exposure to
-- exactly the invitees of your own classroom.
create or replace function public.classroom_pending_invites(_classroom_id uuid)
returns table (
  invite_id    uuid,
  student_id   uuid,
  display_name text,
  email        text,
  created_at   timestamptz
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
    i.id,
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    p.email,
    i.created_at
  from public.classroom_invites i
  join public.profiles p on p.id = i.student_id
  where i.classroom_id = _classroom_id
    and i.status = 'pending'
  order by i.created_at desc;
end;
$$;

revoke execute on function public.classroom_pending_invites(uuid) from anon;

-- The student's pending invitations, with enough context to decide.
create or replace function public.my_invites()
returns table (
  invite_id       uuid,
  classroom_id    uuid,
  classroom_name  text,
  instructor_name text,
  is_public       boolean,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    c.id,
    c.name,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    c.is_public,
    i.created_at
  from public.classroom_invites i
  join public.classrooms c on c.id = i.classroom_id
  join public.profiles p on p.id = c.instructor_id
  where i.student_id = auth.uid()
    and i.status = 'pending'
  order by i.created_at desc
$$;

revoke execute on function public.my_invites() from anon;

-- Accept (enrolls, no PIN needed — the instructor asked for them)
-- or decline.
create or replace function public.respond_to_invite(_invite_id uuid, _accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _invite public.classroom_invites;
begin
  select * into _invite
  from public.classroom_invites
  where id = _invite_id and student_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'Invitation not found';
  end if;

  if _accept then
    insert into public.classroom_members (classroom_id, student_id)
    values (_invite.classroom_id, auth.uid())
    on conflict do nothing;
  end if;

  update public.classroom_invites
  set status = case when _accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = _invite_id;
end;
$$;

revoke execute on function public.respond_to_invite(uuid, boolean) from anon;
