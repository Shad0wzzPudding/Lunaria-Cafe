-- ============================================================
-- Make declining a friend request mean something.
--
-- Today a declined sender can re-file the instant they are
-- turned down, and because the reopen path clears
-- request_seen_at, the repeat also re-notifies the recipient
-- with a fresh letter. So "decline" only removed the request,
-- not the ability to send it again — someone could be pestered
-- indefinitely and the decline offered no defence at all.
--
-- The blocker was that `status = 'declined'` is SYMMETRIC: the
-- row records that a decline happened but not who did it, so
-- send_friend_request() could not tell the person who was
-- turned down from the person who did the turning down. Those
-- two must behave differently — the first is a repeat, the
-- second is someone changing their mind, which is legitimate
-- and is exactly what the existing reopen branch is for.
--
-- declined_by supplies the missing half.
-- ============================================================

alter table public.friendships
  add column if not exists declined_by uuid references public.profiles (id) on delete set null;

-- Existing declined rows: respond_to_friend_request() has always required
-- `addressee_id = auth.uid()`, so the addressee is the only party who can
-- have declined. That makes the backfill exact rather than a guess.
update public.friendships
set declined_by = addressee_id
where status = 'declined' and declined_by is null;

-- ── Record who declined ─────────────────────────────────────

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
      responded_at = now(),
      -- Cleared on accept so a later decline cannot be judged against a
      -- decision that was already reversed.
      declined_by = case when _accept then null else auth.uid() end
  where id = _req.id;
end;
$$;

-- ── Refuse the repeat, allow the change of heart ────────────

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
  _me        uuid := auth.uid();
  _target    public.profiles;
  _existing  public.friendships;
  _norm      text := public.normalize_account_code(_code);
  _name      text;
  _row_id    uuid;
  _decliner  uuid;
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

  -- Serialise everything below per PAIR. Keyed on the unordered pair so both
  -- directions take the same lock, and transaction-scoped so it releases on
  -- commit whatever happens. Two strangers sending at the same moment never
  -- contend; only the two people actually racing each other do.
  perform pg_advisory_xact_lock(
    hashtextextended(
      public.friend_pair_low(_me, _target.id)::text
        || public.friend_pair_high(_me, _target.id)::text,
      0
    )
  );

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
      -- With the lock above, the racing sender now reliably lands HERE rather
      -- than in the ON CONFLICT branch.
      update public.friendships
      set status = 'accepted', responded_at = now()
      where id = _existing.id;

      return query select _target.id, _name, 'accepted'::text;
      return;
    end if;

    -- status = 'declined'. Which side declined decides what happens next.
    -- coalesce covers any row the backfill above could not reach: only the
    -- addressee has ever been able to decline.
    _decliner := coalesce(_existing.declined_by, _existing.addressee_id);

    if _decliner = _target.id then
      -- They turned this caller down. Refuse — but SILENTLY, reporting the
      -- same 'pending' a real send returns and writing nothing at all.
      --
      -- Telling the sender would leak the decline, which the product
      -- deliberately keeps private, and would also hand them a probe: send,
      -- read the error, learn exactly who has blocked you. Nothing is written,
      -- so request_seen_at stays put and the recipient is not re-notified,
      -- which is the whole point.
      return query select _target.id, _name, 'pending'::text;
      return;
    end if;

    -- The caller is the one who declined, and is now reaching out. Rewriting
    -- the direction matters: leaving the old one in place would file their
    -- request as a repeat of the one they already turned down. The seen stamps
    -- clear with it — a reopened request is a new one, and its eventual
    -- acceptance has to be able to produce a letter.
    --
    -- This is also the only route back from a block, which is what makes the
    -- refusal above safe to leave in place indefinitely: the decliner can
    -- always restore the connection by sending a request of their own.
    update public.friendships
    set requester_id    = _me,
        addressee_id    = _target.id,
        status          = 'pending',
        created_at      = now(),
        responded_at    = null,
        result_seen_at  = null,
        request_seen_at = null,
        declined_by     = null
    where id = _existing.id;

    return query select _target.id, _name, 'pending'::text;
    return;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (_me, _target.id)
  on conflict do nothing
  returning id into _row_id;

  if _row_id is null then
    -- Should now be unreachable — the advisory lock means any competing row is
    -- committed and visible to the SELECT above. Kept as a backstop, and made
    -- honest: if the row still cannot be found, it belongs to a transaction
    -- this one cannot see, so there is nothing to accept and nothing to claim.
    select f.id into _row_id
    from public.friendships f
    where (f.requester_id = _me and f.addressee_id = _target.id)
       or (f.requester_id = _target.id and f.addressee_id = _me);

    if _row_id is null then
      return query select _target.id, _name, 'pending'::text;
      return;
    end if;

    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = _row_id;

    return query select _target.id, _name, 'accepted'::text;
    return;
  end if;

  return query select _target.id, _name, 'pending'::text;
end;
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
grant  execute on function public.send_friend_request(text) to authenticated;
revoke execute on function public.respond_to_friend_request(uuid, boolean) from public, anon;
grant  execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
