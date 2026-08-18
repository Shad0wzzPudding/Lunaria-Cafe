-- ============================================================
-- A decline stops meaning "never" and starts meaning "not now".
--
-- Until now a decline held FOREVER: send_friend_request()
-- refused the declined sender until the decliner happened to
-- reach out themselves. In a classroom that is too sharp. One
-- mis-tap on Decline silently locked a classmate out for good,
-- and because the refusal is deliberately silent, neither of
-- them could ever find out why.
--
-- The rule now, chosen by the user:
--
--   asks 1 and 2 -> land normally, even straight after a decline
--   ask 3        -> refused until 7 days after the SECOND decline
--
-- So two asks reach the recipient and the third one waits. That
-- forgives a mis-tap and a genuine second ask, while the
-- cooldown only bites on actual persistence — and it lapses on
-- its own rather than needing anybody to intervene. Each further
-- decline re-arms the seven days.
--
-- ATTEMPTS during the window are inert: the refusal only raises,
-- so nothing is written and the clock is never pushed back. A
-- version where trying again reset the timer would let a
-- persistent sender lock themselves out permanently without ever
-- being told why, which is the very thing this removes.
--
-- The count is PER PAIR, not per direction. The row rewrites its
-- own direction whenever the other person reaches out, so a
-- per-direction tally would have to survive that flip, and the
-- thing being measured is really "how much friction has there
-- been between these two" rather than a score against one of
-- them.
--
-- What this does NOT do, stated plainly: it does not close the
-- remaining privacy gap. Inside the seven days a first send
-- still errors where a send to a stranger succeeds, so a
-- determined sender can still infer a recent decline. It makes
-- what they can learn temporary rather than permanent, which is
-- the more useful half.
-- ============================================================

alter table public.friendships
  add column if not exists decline_count integer not null default 0;

-- Existing declined rows count as ONE decline, so the pairs currently blocked
-- forever get their retry back rather than starting at the threshold. Under
-- the new rule one decline has always meant "you may ask again".
update public.friendships
set decline_count = 1
where status = 'declined' and decline_count = 0;

-- ── Count the declines ──────────────────────────────────────

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
      declined_by = case when _accept then null else auth.uid() end,
      -- Accepting wipes the history: two people who are now friends should not
      -- carry a cooldown from before, in case they ever unfriend and one of
      -- them asks again.
      decline_count = case when _accept then 0 else _req.decline_count + 1 end
  where id = _req.id;
end;
$$;

-- ── Refuse only while the cooldown is live ──────────────────

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
      -- They turned this caller down at least twice, recently. Answer with
      -- the SAME message they would get if their original request were still
      -- outstanding — which is all they have ever been told. Identical text to
      -- the 'pending' branch above, deliberately: any difference here is the
      -- oracle.
      --
      -- Still writes nothing, so request_seen_at stays put and the recipient
      -- is never re-notified. That was, and remains, the point.
      --
      -- Below the threshold, or once the seven days have passed, control falls
      -- through to the reopen below and the request goes out for real.
      raise exception 'You have already sent them a request';
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
revoke execute on function public.respond_to_friend_request(uuid, boolean) from public, anon;
grant  execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
