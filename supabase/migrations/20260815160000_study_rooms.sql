-- ============================================================
-- Study rooms: a live session hosted by a student, for friends
--
-- Same machinery as a teacher's live round — the same table, the
-- same participants, the same scoring and attendance — with a
-- different answer to one question: who is allowed in.
--
--   classroom round → is_classroom_member()
--   study room      → is_accepted_friend(host)
--
-- A second table would have duplicated attendance, partial
-- participation and the pause accounting, which is exactly where
-- the subtle bugs bred the first time. So class_rounds gains a
-- SCOPE instead, guarded by a check constraint that makes the
-- invariant impossible to break.
--
-- Reputation is deliberately NOT diverted for study rooms. A
-- class round holds earnings out of lifetime reputation and
-- reports them to the round instead; a study room is an ordinary
-- focus session that happens to have a scoreboard over it, so it
-- pays out exactly as studying alone does. That split lives in
-- the client reducer (roundControlled vs roundScored); nothing
-- here depends on it.
-- ============================================================

-- ── 1. The scope ────────────────────────────────────────────

alter table public.class_rounds
  add column if not exists owner_kind text not null default 'classroom'
    check (owner_kind in ('classroom', 'study')),
  add column if not exists host_id uuid references public.profiles (id) on delete cascade;

-- Both become conditional on the scope, so the check below can enforce them
-- per kind rather than the column enforcing them for everyone. Every existing
-- row keeps its values; `instructor_id` is only ever written, never read as a
-- gate, so relaxing it changes no behaviour.
alter table public.class_rounds alter column classroom_id  drop not null;
alter table public.class_rounds alter column instructor_id drop not null;

-- Exactly one scope, fully populated, with no cross-contamination. Existing
-- rows default to 'classroom' and already satisfy the classroom branch.
alter table public.class_rounds drop constraint if exists class_rounds_scope_ck;
alter table public.class_rounds add constraint class_rounds_scope_ck check (
  (    owner_kind = 'classroom'
   and classroom_id  is not null
   and instructor_id is not null
   and host_id       is null)
  or
  (    owner_kind = 'study'
   and host_id       is not null
   and classroom_id  is null
   and instructor_id is null)
);

-- The existing class_rounds_one_active index is on (classroom_id) WHERE
-- status='active'. Study rows have a NULL classroom_id and NULLs never collide
-- in a unique index, so that index keeps meaning "one live round per
-- classroom" and simply ignores them. Study rooms get the matching rule of
-- their own: one open room per host.
create unique index if not exists class_rounds_one_active_study
  on public.class_rounds (host_id)
  where status = 'active' and owner_kind = 'study';

create index if not exists class_rounds_host_idx
  on public.class_rounds (host_id) where owner_kind = 'study';

-- ── 2. The gates ────────────────────────────────────────────
--
-- The ONLY place the two kinds of session differ. Everything downstream —
-- round_participants RLS, leave_round, rejoin_round, the progress upsert —
-- already keys on round_id alone and needs no change.

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
      and case r.owner_kind
            when 'classroom' then
              public.is_classroom_member(r.classroom_id)
              or public.is_classroom_instructor(r.classroom_id)
            when 'study' then
              r.host_id = auth.uid()
              or public.is_accepted_friend(r.host_id)
              -- Someone already in the room keeps their view even if the
              -- friendship ends mid-session: being unfriended should not
              -- blank the board out from under them.
              or exists (
                select 1 from public.round_participants rp
                where rp.round_id = r.id and rp.student_id = auth.uid()
              )
            else false
          end
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
      and case r.owner_kind
            when 'classroom' then public.is_classroom_member(r.classroom_id)
            when 'study'     then r.host_id = auth.uid()
                                  or public.is_accepted_friend(r.host_id)
            else false
          end
  )
$$;

-- ── 3. Opening and closing a room ───────────────────────────

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

create or replace function public.end_study_room(_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.class_rounds
  set status = 'ended', ended_at = now()
  where id = _round_id
    and owner_kind = 'study'
    and host_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Not your study room';
  end if;
end;
$$;

-- ── 4. Discovery ────────────────────────────────────────────
--
-- One list for both kinds, so the client's existing discovery, realtime
-- subscription, join flow and auto-resume all carry over untouched.
--
-- `classroom_name` becomes `scope_name` — the classroom's name, or the host's
-- display name — because the column now describes two different things.
-- Return columns change, so this must be dropped before recreation.

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

  union all

  -- Rooms you host, and rooms your friends are hosting. Surfacing friends'
  -- open rooms here (rather than in a list of their own) is what lets the
  -- existing "someone started a session" toast and Join button work for study
  -- rooms with no new client plumbing.
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
    and (r.host_id = auth.uid() or public.is_accepted_friend(r.host_id))

  -- By position: ORDER BY in a UNION cannot see the output column names.
  order by 7 desc
$$;

-- Signed-in students only. `revoke … from anon` alone is a no-op — anon holds
-- EXECUTE through PUBLIC, so PUBLIC is what has to be revoked.
revoke execute on function public.start_study_room(integer, boolean, text) from public, anon;
revoke execute on function public.end_study_room(uuid)                     from public, anon;
revoke execute on function public.active_round_for_me()                    from public, anon;

grant execute on function public.start_study_room(integer, boolean, text)  to authenticated;
grant execute on function public.end_study_room(uuid)                      to authenticated;
grant execute on function public.active_round_for_me()                     to authenticated;
