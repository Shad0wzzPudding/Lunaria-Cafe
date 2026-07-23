-- ============================================================
-- One active session per account (students only)
--
-- A player's save is ONE row that the client autosaves every 30s
-- (AUTO_SAVE_INTERVAL) and again on beforeunload. Two instances signed
-- into the same account therefore clobber each other — coins and
-- reputation go backwards, furniture placement races. This table is the
-- cross-device half of the fix; the same-browser (second tab) half is
-- handled client-side over BroadcastChannel, which needs no server.
--
-- ONE row per user, so "one active device" is enforced by the PRIMARY
-- KEY rather than by application logic — there can never be two rows to
-- disagree with each other.
--
-- Writes go only through the RPCs below (same pattern as
-- update_display_name) so a client cannot forge or steal a claim.
-- Instructors are deliberately exempt: a teacher may legitimately drive
-- a projector and a laptop at the same time.
-- ============================================================

create table if not exists public.active_sessions (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  device_id    text not null,
  last_seen_at timestamptz not null default now()
);

alter table public.active_sessions enable row level security;

-- Read your own row. Diagnostics only — the client drives everything
-- through the RPCs, which is why there is no insert/update/delete policy.
drop policy if exists "read own session" on public.active_sessions;
create policy "read own session"
  on public.active_sessions for select
  using (user_id = auth.uid());

-- Is the caller subject to the one-device rule? Students are; instructors
-- are exempt. Kept as its own function so all three RPCs agree.
create or replace function public.is_device_locked_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_student
  );
$$;

-- Claim the account for this device. LAST LOGIN WINS: an existing claim is
-- overwritten, never refused, so a crashed tab or a closed laptop can never
-- lock someone out of their own account. Returns the winning device_id.
create or replace function public.claim_device_session(p_device_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Instructors: no row is written, and the caller is told it holds the
  -- claim, so the client's lock logic no-ops for them.
  if not public.is_device_locked_role() then
    return p_device_id;
  end if;

  insert into public.active_sessions (user_id, device_id, last_seen_at)
  values (auth.uid(), p_device_id, now())
  on conflict (user_id) do update
    set device_id    = excluded.device_id,
        last_seen_at = now();

  return p_device_id;
end;
$$;

-- Am I still the active device? false = displaced by another device.
--
-- This returns false ONLY for a real displacement. The client must treat a
-- network/RPC error as "unknown" and retry — never as a displacement — or a
-- flaky connection would sign students out mid-session.
create or replace function public.heartbeat_device_session(p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  holder text;
begin
  if auth.uid() is null then
    return false;
  end if;
  if not public.is_device_locked_role() then
    return true; -- instructors are never displaced
  end if;

  select device_id into holder
  from public.active_sessions
  where user_id = auth.uid();

  -- No claim on record (first heartbeat, or a previous release): take it,
  -- so a missing row can't strand a legitimately-running session.
  if holder is null then
    insert into public.active_sessions (user_id, device_id, last_seen_at)
    values (auth.uid(), p_device_id, now())
    on conflict (user_id) do update
      set device_id    = excluded.device_id,
          last_seen_at = now();
    return true;
  end if;

  if holder <> p_device_id then
    return false; -- someone else holds it
  end if;

  update public.active_sessions
    set last_seen_at = now()
    where user_id = auth.uid();

  return true;
end;
$$;

-- Release on explicit logout so the next login claims instantly instead of
-- waiting for the old claim to be overwritten.
create or replace function public.release_device_session(p_device_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  delete from public.active_sessions
  where user_id = auth.uid()
    and device_id = p_device_id;
end;
$$;

revoke execute on function public.is_device_locked_role()          from anon;
revoke execute on function public.claim_device_session(text)       from anon;
revoke execute on function public.heartbeat_device_session(text)   from anon;
revoke execute on function public.release_device_session(text)     from anon;
