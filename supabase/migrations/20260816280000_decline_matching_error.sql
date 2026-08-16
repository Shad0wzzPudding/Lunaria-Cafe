-- ============================================================
-- Close the repeat-send oracle on a decline.
--
-- 20260816220000 refuses a declined sender by returning
-- 'pending' and writing nothing. That is silent in isolation
-- but loud in comparison, because a NORMAL target behaves
-- differently on the second attempt:
--
--   send twice to anyone else  -> 2nd raises
--                                 'You have already sent them a request'
--                                 (their row is 'pending')
--   send twice to a blocker    -> 'pending' both times, no error ever,
--                                 because nothing is ever written
--
-- Two clicks on any account code therefore answered "did this
-- person decline me?" with certainty, no second account needed.
-- Verified against the live database.
--
-- The fix is to tell the sender exactly what they would be told
-- if their original request were still outstanding — which, as
-- far as they have ever been informed, it is. They sent one, and
-- nothing came back. So this is not a new fiction; it is the
-- same one, kept consistent under a second look.
-- ============================================================

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
    -- coalesce covers any row the 20260816220000 backfill could not reach:
    -- only the addressee has ever been able to decline.
    _decliner := coalesce(_existing.declined_by, _existing.addressee_id);

    if _decliner = _target.id then
      -- They turned this caller down. Answer with the SAME message they would
      -- get if their original request were still outstanding — which is all
      -- they have ever been told. Identical text to the 'pending' branch
      -- above, deliberately: any difference here is the oracle.
      --
      -- Still writes nothing, so request_seen_at stays put and the recipient
      -- is never re-notified. That was, and remains, the point.
      raise exception 'You have already sent them a request';
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
