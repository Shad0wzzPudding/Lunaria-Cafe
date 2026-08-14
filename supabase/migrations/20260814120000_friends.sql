-- ============================================================
-- Friends (students only)
--
-- Students add each other by a short FRIEND CODE printed on their
-- own Friends page. The code is the account's public handle: it
-- can be read off a screen and typed, unlike the account uuid.
--
-- Adding is a REQUEST, not an act — the same consent stance as
-- classroom_invites, which replaced the old silent enrolment.
-- Nothing about an account is exposed to the sender until the
-- recipient accepts.
--
-- Role gate: every RPC here requires the CALLER to hold the
-- student role, and only student accounts can be looked up by
-- code. Instructor-only accounts still get a friend_code (the
-- column is on profiles, which is one table for both roles) but
-- it is inert — nothing can be done with it in either direction.
--
-- What friends currently see of each other: display name, when
-- they were last active, and whether they are online right now.
-- Deliberately no coins, reputation or focus stats yet — that is
-- a later decision, and this migration should not pre-commit the
-- exposure surface.
-- ============================================================

-- ── 1. Friend codes ─────────────────────────────────────────

-- EIGHT characters, where a class code is six. Same unambiguous
-- alphabet (no O/0, I/1 — these get read aloud and retyped), but
-- a different length on purpose: the two codes otherwise look
-- identical, and a student holding both would have no way to tell
-- which box a given code belongs in.
create or replace function public.generate_friend_code()
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
    for _i in 1..8 loop
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::integer, 1);
    end loop;
    exit when not exists (
      select 1 from public.profiles where friend_code = _code
    );
  end loop;
  return _code;
end;
$$;

alter table public.profiles
  add column if not exists friend_code text;

-- Backfill before the not-null / unique constraints land.
update public.profiles
set friend_code = public.generate_friend_code()
where friend_code is null;

create unique index if not exists profiles_friend_code_idx
  on public.profiles (friend_code);

alter table public.profiles alter column friend_code set not null;
alter table public.profiles alter column friend_code set default public.generate_friend_code();

-- handle_new_user() inserts profiles without naming friend_code, so
-- the default above covers every account created from here on. No
-- trigger change is needed.

-- How a typed code is matched: case-insensitive, and separators
-- thrown away, because the UI prints it grouped (ABCD-EFGH) and
-- people type back what they see.
create or replace function public.normalize_friend_code(_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ── 2. Friendships ──────────────────────────────────────────
--
-- ONE row per relationship, holding both the pending request and
-- the accepted friendship. A separate requests table would mean
-- two places to check before answering "are these two friends",
-- and two places for them to disagree.
--
-- The row is directional (who asked whom) but the RELATIONSHIP is
-- not, so every lookup below has to consider both directions. The
-- unique constraint can only cover one of them; send_friend_request()
-- checks the reverse explicitly.

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

-- Every list reads both directions. The unique (requester_id, addressee_id)
-- constraint already indexes the requester side by its leading column, so
-- only the addressee side needs one of its own.
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- Read the rows you are part of. The lists themselves come from the
-- RPCs below (they need to join profiles, which RLS does not permit
-- for a stranger); this policy exists so the client can inspect its
-- own edges, and because the delete policy reads better beside it.
drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships"
  on public.friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Either party may delete the row, which is unfriending, cancelling
-- a request you sent, and clearing one you declined — all the same
-- operation on the same row, so it is one policy rather than three
-- RPCs. (Mirrors "student leaves classroom".)
drop policy if exists "either party removes friendship" on public.friendships;
create policy "either party removes friendship"
  on public.friendships for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Inserts and updates go only through the SECURITY DEFINER RPCs
-- below, so no insert/update policy is defined. Without that, a
-- client could write status = 'accepted' on a request nobody agreed to.

-- ── 3. Role gate ────────────────────────────────────────────

-- Deliberately takes no argument. An is_student_account(uuid) would let any
-- signed-in client probe whether a given uuid is a student account; this can
-- only answer for the caller, which is the only question the RPCs below ask.
create or replace function public.is_student_caller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_student
  )
$$;

-- ── 4. RPCs ─────────────────────────────────────────────────

-- Send a friend request by code.
--
-- Returns the resulting state so the client can say the right thing:
-- 'pending' → request sent, 'accepted' → you are now friends (which
-- happens when they had already asked you — answering with a request
-- of your own is an acceptance, and making them find the original
-- invitation to click Accept on would be silly).
create or replace function public.send_friend_request(_code text)
returns table (
  friend_id    uuid,
  display_name text,
  status       text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _me       uuid := auth.uid();
  _target   public.profiles;
  _existing public.friendships;
  _norm     text := public.normalize_friend_code(_code);
begin
  if _me is null then
    raise exception 'Not signed in';
  end if;

  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  if _norm = '' then
    raise exception 'Enter a friend code';
  end if;

  select * into _target from public.profiles where friend_code = _norm;

  -- One message for "no such code" and for "that code belongs to an
  -- instructor": distinguishing them would turn this into an oracle for
  -- probing which codes exist and what kind of account they are.
  if not found or not _target.is_student then
    raise exception 'No student account has that friend code';
  end if;

  if _target.id = _me then
    raise exception 'That is your own friend code';
  end if;

  select * into _existing
  from public.friendships
  where (requester_id = _me and addressee_id = _target.id)
     or (requester_id = _target.id and addressee_id = _me);

  if found then
    if _existing.status = 'accepted' then
      raise exception 'You are already friends with %',
        coalesce(_target.display_name, split_part(_target.email, '@', 1));
    end if;

    if _existing.status = 'pending' then
      if _existing.requester_id = _me then
        raise exception 'You have already sent them a request';
      end if;

      -- They asked first. Answering with a request of your own accepts theirs.
      update public.friendships
      set status = 'accepted', responded_at = now()
      where id = _existing.id;

      return query
      select _target.id,
             coalesce(_target.display_name, split_part(_target.email, '@', 1)),
             'accepted'::text;
      return;
    end if;

    -- status = 'declined'. Reopen it as a fresh request FROM THE CALLER —
    -- rewriting the direction matters, because the decliner may be the one
    -- reaching out now, and leaving the old direction in place would file
    -- their request as a repeat of the one they already turned down.
    update public.friendships
    set requester_id = _me,
        addressee_id = _target.id,
        status       = 'pending',
        created_at   = now(),
        responded_at = null
    where id = _existing.id;

    return query
    select _target.id,
           coalesce(_target.display_name, split_part(_target.email, '@', 1)),
           'pending'::text;
    return;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (_me, _target.id);

  return query
  select _target.id,
         coalesce(_target.display_name, split_part(_target.email, '@', 1)),
         'pending'::text;
end;
$$;

-- Accept or decline a request addressed to you.
--
-- A decline keeps the row (status 'declined') rather than deleting it,
-- so the sender's pending list simply empties instead of announcing the
-- rejection. Either party can delete the row afterwards.
create or replace function public.respond_to_friend_request(_request_id uuid, _accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _req public.friendships;
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  select * into _req
  from public.friendships
  where id = _request_id
    and addressee_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Friend request not found';
  end if;

  update public.friendships
  set status = case when _accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = _req.id;
end;
$$;

-- Your accepted friends.
--
-- "Online" reads the device-lock heartbeat, which students already
-- write every 30s (HEARTBEAT_MS in useSessionLock) and which is
-- deleted on an explicit logout. Three missed beats is the cutoff, so
-- a slow network doesn't blink someone offline.
--
-- "Last active" takes the later of that heartbeat and the save's
-- updated_at: the heartbeat row is gone after a clean logout, and the
-- save timestamp survives, so neither alone tells the whole story.
create or replace function public.my_friends()
returns table (
  friendship_id uuid,
  friend_id     uuid,
  display_name  text,
  friends_since timestamptz,
  last_active   timestamptz,
  is_online     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  return query
  select
    f.id,
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    f.responded_at,
    greatest(s.last_seen_at, ps.updated_at),
    coalesce(s.last_seen_at > now() - interval '90 seconds', false)
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join public.active_sessions s on s.user_id = p.id
  left join public.player_saves ps   on ps.user_id = p.id
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by coalesce(s.last_seen_at > now() - interval '90 seconds', false) desc,
           greatest(s.last_seen_at, ps.updated_at) desc nulls last;
end;
$$;

-- Pending requests in both directions: the ones waiting on you, and
-- the ones you are waiting on. Outgoing are included so a sender can
-- see the request landed and withdraw it.
create or replace function public.my_friend_requests()
returns table (
  request_id   uuid,
  direction    text,
  profile_id   uuid,
  display_name text,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  return query
  select
    f.id,
    -- Cast explicitly: bare literals come out as `unknown`, and RETURN QUERY
    -- type-checks against the declared table, which would reject them.
    (case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end)::text,
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'pending'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.created_at desc;
end;
$$;

-- Signed-in students only.
revoke execute on function public.generate_friend_code()                   from anon;
revoke execute on function public.normalize_friend_code(text)              from anon;
revoke execute on function public.is_student_caller()                      from anon;
revoke execute on function public.send_friend_request(text)                from anon;
revoke execute on function public.respond_to_friend_request(uuid, boolean) from anon;
revoke execute on function public.my_friends()                             from anon;
revoke execute on function public.my_friend_requests()                     from anon;
