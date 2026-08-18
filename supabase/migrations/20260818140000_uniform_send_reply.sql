-- ============================================================
-- Make every send answer the same way.
--
-- 20260818120000 let a declined sender ask again, and in doing
-- so reopened the two-click oracle 4699a44/fc53023 had closed —
-- from the other side. Measured:
--
--   request ignored, send again  -> ERROR "already sent"
--   request declined, send again -> ok (pending)
--
-- So two clicks separated "they have not answered" from "they
-- turned me down". The cooldown did not merely fail to close the
-- privacy gap, it widened it, and the widening came from the
-- retry itself: being ALLOWED to ask again is observable when an
-- outstanding request is not.
--
-- Those two can only match if neither errors, so nothing here
-- errors any more. A repeat send while a request is outstanding,
-- and a send inside a decline cooldown, both return 'pending'
-- and write nothing — the same answer a genuine new request
-- gets. There is no reply left to compare.
--
-- The cost is the honest one: a player re-sending to someone who
-- simply has not answered no longer gets told "you have already
-- sent them a request". They are told it is on its way, which is
-- true — it is sitting in that person's list.
--
-- What is still NOT closed: a real pending request appears in
-- the sender's Sent list and a swallowed one does not. Closing
-- that needs the synthetic row, considered and declined.
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
        -- Already outstanding. Answer as if it had just been sent, and write
        -- nothing: this reply has to be IDENTICAL to the one a blocked sender
        -- gets below, or the pair of them is an oracle. See the header.
        return query select _target.id, _name, 'pending'::text;
        return;
      end if;

      -- They asked first. Answering with a request of your own accepts theirs.
      -- With the lock above, the racing sender now reliably lands HERE rather
      -- than in the ON CONFLICT branch.
      update public.friendships
      set status = 'accepted', responded_at = now(), decline_count = 0
      where id = _existing.id;

      return query select _target.id, _name, 'accepted'::text;
      return;
    end if;

    -- status = 'declined'. Which side declined decides what happens next.
    -- coalesce covers any row the 20260816220000 backfill could not reach:
    -- only the addressee has ever been able to decline.
    _decliner := coalesce(_existing.declined_by, _existing.addressee_id);

    if _decliner = _target.id
       and _existing.decline_count >= 2
       and _existing.responded_at > now() - interval '7 days' then
      -- They turned this caller down at least twice, recently. Answer exactly
      -- as the "already outstanding" branch above does — same value, no error
      -- — because those two replies are what a sender would compare.
      --
      -- Still writes nothing, so request_seen_at stays put and the recipient
      -- is never re-notified. That was, and remains, the point.
      --
      -- Below the threshold, or once the seven days have passed, control falls
      -- through to the reopen below and the request goes out for real.
      return query select _target.id, _name, 'pending'::text;
      return;
    end if;

    -- Either the caller is the one who declined and is now reaching out, or
    -- the cooldown does not apply. Rewriting the direction matters: leaving
    -- the old one in place would file their request as a repeat of the one
    -- already turned down. The seen stamps clear with it — a reopened request
    -- is a new one, and its eventual acceptance has to be able to produce a
    -- letter.
    --
    -- decline_count is deliberately NOT reset here. It is the memory of how
    -- much friction this pair has had, and clearing it on every reopen would
    -- hand an unlimited supply of "first tries" to anyone willing to send
    -- twice. Only an accepted friendship clears it.
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
    set status = 'accepted', responded_at = now(), decline_count = 0
    where id = _row_id;

    return query select _target.id, _name, 'accepted'::text;
    return;
  end if;

  return query select _target.id, _name, 'pending'::text;
end;
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
grant  execute on function public.send_friend_request(text) to authenticated;
