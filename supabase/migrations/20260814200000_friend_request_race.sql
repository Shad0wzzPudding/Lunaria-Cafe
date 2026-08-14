-- ============================================================
-- Stop the simultaneous-send race lying about its outcome
--
-- send_friend_request() handled the race by letting the unique
-- pair index reject the losing insert, then recovering:
--
--   insert … on conflict do nothing returning id into _row_id;
--   if _row_id is null then
--     select f.id into _row_id from friendships f where <pair>;
--     update friendships set status='accepted' where id=_row_id;
--     return 'accepted';
--
-- The recovery cannot see what it needs to. ON CONFLICT DO
-- NOTHING deliberately does NOT wait on a concurrent uncommitted
-- insert — it just declines to insert — and under READ COMMITTED
-- the following SELECT cannot see that uncommitted row either.
-- So _row_id stays NULL, `update … where id = NULL` matches no
-- rows, and the function still reports 'accepted'. The player is
-- told "you are now friends" over a row that is still pending.
--
-- Fixed by serialising the pair instead of racing it: a
-- transaction-scoped advisory lock keyed on the unordered pair,
-- taken before the existence check. The second sender now waits,
-- then finds the first request committed and takes the ordinary
-- "they asked first" path — the same outcome, arrived at by
-- reading committed data rather than guessing at invisible data.
--
-- The ON CONFLICT branch stays as a backstop, but no longer
-- claims success it cannot verify.
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

    -- status = 'declined'. Reopen it as a fresh request FROM THE CALLER —
    -- rewriting the direction matters, because the decliner may be the one
    -- reaching out now, and leaving the old direction in place would file
    -- their request as a repeat of the one they already turned down.
    -- The seen stamps clear with it: a reopened request is a new one, and its
    -- eventual acceptance has to be able to produce a letter.
    update public.friendships
    set requester_id    = _me,
        addressee_id    = _target.id,
        status          = 'pending',
        created_at      = now(),
        responded_at    = null,
        result_seen_at  = null,
        request_seen_at = null
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
