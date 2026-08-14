-- ============================================================
-- friend_code → account_code
--
-- The code identifies the ACCOUNT, not the friendship. Friends
-- was simply the first feature to need it; naming it after that
-- one use would make every later account-level feature that
-- shares it read as if it were borrowing something from the
-- friends system.
--
-- Renames rather than recreates, so the column keeps its data,
-- its unique index, and its DEFAULT — and the functions keep
-- their grants. Only the bodies have to be rewritten, because a
-- function body is stored as text and a column rename does not
-- reach inside it.
-- ============================================================

-- ── 1. The column ───────────────────────────────────────────

-- Guarded so the whole file can be re-pasted safely. ALTER … RENAME has no
-- IF EXISTS for columns or functions, and an unguarded re-run would abort the
-- script partway through — which is exactly how a half-applied migration
-- happens.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'friend_code'
  ) then
    alter table public.profiles rename column friend_code to account_code;
  end if;
end $$;

alter index if exists public.profiles_friend_code_idx rename to profiles_account_code_idx;

-- ── 2. The helpers ──────────────────────────────────────────
--
-- ALTER … RENAME first, then CREATE OR REPLACE the body. Renaming keeps the
-- pg_proc OID, which is what profiles.account_code's DEFAULT actually points
-- at — dropping and recreating would leave the default referring to a function
-- that no longer exists, and break every signup.

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'generate_friend_code'
  ) then
    alter function public.generate_friend_code() rename to generate_account_code;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'normalize_friend_code'
  ) then
    alter function public.normalize_friend_code(text) rename to normalize_account_code;
  end if;
end $$;

-- Same generator, now looking at the renamed column. EIGHT characters, where a
-- class code is six, from the same unambiguous alphabet (no O/0, I/1): the
-- differing length is the only thing telling a student which box a code
-- belongs in.
create or replace function public.generate_account_code()
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
      select 1 from public.profiles where account_code = _code
    );
  end loop;
  return _code;
end;
$$;

-- How a typed code is matched: case-insensitive, separators discarded,
-- because the UI prints it grouped (ABCD-EFGH) and people type back what
-- they see.
create or replace function public.normalize_account_code(_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ── 3. The one RPC that reads the column ────────────────────
--
-- Unchanged from 20260814140000 apart from the column and helper names, and
-- the two error messages that said "friend code" to the player.

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
  _norm     text := public.normalize_account_code(_code);
  _name     text;
  _row_id   uuid;
begin
  if _me is null then
    raise exception 'Not signed in';
  end if;

  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  if _norm = '' then
    raise exception 'Enter an account code';
  end if;

  select * into _target from public.profiles where account_code = _norm;

  -- One message for "no such code" and for "that code belongs to an
  -- instructor": distinguishing them would turn this into an oracle for
  -- probing which codes exist and what kind of account they are.
  if not found or not _target.is_student then
    raise exception 'No student account has that code';
  end if;

  if _target.id = _me then
    raise exception 'That is your own account code';
  end if;

  _name := coalesce(_target.display_name, split_part(_target.email, '@', 1));

  select * into _existing
  from public.friendships
  where (requester_id = _me and addressee_id = _target.id)
     or (requester_id = _target.id and addressee_id = _me);

  if found then
    if _existing.status = 'accepted' then
      raise exception 'You are already friends with %', _name;
    end if;

    if _existing.status = 'pending' then
      if _existing.requester_id = _me then
        raise exception 'You have already sent them a request';
      end if;

      -- They asked first. Answering with a request of your own accepts theirs.
      update public.friendships
      set status = 'accepted', responded_at = now()
      where id = _existing.id;

      return query select _target.id, _name, 'accepted'::text;
      return;
    end if;

    -- status = 'declined'. Reopen it as a fresh request FROM THE CALLER —
    -- rewriting the direction matters, because the decliner may be the one
    -- reaching out now, and leaving the old direction in place would file
    -- their request as a repeat of the one they already turned down.
    -- result_seen_at clears with it: a reopened request is a new one, and its
    -- eventual acceptance has to be able to produce a letter.
    update public.friendships
    set requester_id   = _me,
        addressee_id   = _target.id,
        status         = 'pending',
        created_at     = now(),
        responded_at   = null,
        result_seen_at = null,
        request_seen_at = null
    where id = _existing.id;

    return query select _target.id, _name, 'pending'::text;
    return;
  end if;

  -- ON CONFLICT DO NOTHING rather than an exception block, because it covers
  -- BOTH unique constraints (the same-direction one and the unordered-pair
  -- index) without naming either, and because the alternative kept
  -- reintroducing a bare `status` in a WHERE clause — which collides with this
  -- function's OUT parameter of the same name and raises 42702.
  insert into public.friendships (requester_id, addressee_id)
  values (_me, _target.id)
  on conflict do nothing
  returning id into _row_id;

  if _row_id is null then
    -- The other person's mirror request landed between the SELECT above and
    -- this insert. Both sides pressed Send, which is agreement by any reading.
    select f.id into _row_id
    from public.friendships f
    where (f.requester_id = _me and f.addressee_id = _target.id)
       or (f.requester_id = _target.id and f.addressee_id = _me);

    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = _row_id;

    return query select _target.id, _name, 'accepted'::text;
    return;
  end if;

  return query select _target.id, _name, 'pending'::text;
end;
$$;

-- ── 4. Grants ───────────────────────────────────────────────
--
-- ALTER FUNCTION … RENAME carries the existing ACLs across, so these are a
-- restatement rather than a repair — but the old names are gone, and a reader
-- checking who can execute what should find the answer under the new ones.
-- `revoke … from anon` alone would be a no-op: anon holds EXECUTE through
-- PUBLIC, so PUBLIC is what has to be revoked.
revoke execute on function public.generate_account_code()   from public, anon;
revoke execute on function public.normalize_account_code(text) from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;

grant execute on function public.generate_account_code()    to authenticated;
grant execute on function public.normalize_account_code(text) to authenticated;
grant execute on function public.send_friend_request(text)  to authenticated;
