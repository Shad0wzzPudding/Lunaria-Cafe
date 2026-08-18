-- ============================================================
-- Close the last channel: the sender's Sent list.
--
-- Since 20260818140000 every send REPLIES identically, so the
-- RPC itself gives nothing away. The list did not follow.
-- my_friend_requests() returns only status='pending', and a
-- silently refused send writes no such row — so:
--
--   send to a stranger     -> appears under Sent
--   send inside a cooldown -> Sent stays empty
--
-- which answers the same question the reply no longer does.
--
-- The fix is to keep telling the sender the same story the
-- refusal already tells them: their request went out and nobody
-- has answered. A declined row IS that request, from their side,
-- so it is listed as an outgoing pending one. Nothing synthetic
-- has to be invented and no attempt has to be recorded — the row
-- already exists, with the right person and the right date on it.
--
-- Only the DECLINED SENDER sees it. To the decliner the request
-- is answered and gone, which is what they already see today.
--
-- Withdraw is the part that needs care. The button issues a
-- DELETE, and deleting a declined row is how the block is lifted
-- (20260816240000 restricts that to the decliner). So a declined
-- sender withdrawing must NOT delete: it marks the row withdrawn,
-- which hides it from their Sent list and leaves the block alone.
-- Sending again clears the mark, so the entry comes back exactly
-- as a real re-send would.
-- ============================================================

alter table public.friendships
  add column if not exists requester_withdrew_at timestamptz;

-- ── The list ────────────────────────────────────────────────

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
  where (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and (
      f.status = 'pending'
      -- A request this caller sent that was declined. They were never told,
      -- so from where they stand it is still outstanding, and it belongs in
      -- Sent alongside the genuine ones. Excluded once they withdraw it.
      or (
        f.status = 'declined'
        and f.requester_id = auth.uid()
        and coalesce(f.declined_by, f.addressee_id) <> auth.uid()
        and f.requester_withdrew_at is null
      )
    )
  order by f.created_at desc;
end;
$$;

-- ── Withdraw / unfriend, without lifting a block ────────────

create or replace function public.withdraw_or_remove_friendship(_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _f public.friendships;
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  select * into _f
  from public.friendships
  where id = _id
    and (requester_id = auth.uid() or addressee_id = auth.uid());

  if not found then
    raise exception 'Not found';
  end if;

  -- The declined sender withdrawing what they believe is an outstanding
  -- request. Deleting the row is exactly how a block is lifted, so it is
  -- marked instead: gone from their list, still in force.
  if _f.status = 'declined'
     and auth.uid() <> coalesce(_f.declined_by, _f.addressee_id) then
    update public.friendships
    set requester_withdrew_at = now()
    where id = _id;
    return;
  end if;

  -- Everything else keeps the behaviour the DELETE policy already allowed:
  -- unfriending, cancelling a request you really sent, and the decliner
  -- clearing a row they turned down.
  delete from public.friendships where id = _id;
end;
$$;

revoke execute on function public.withdraw_or_remove_friendship(uuid) from public, anon;
grant  execute on function public.withdraw_or_remove_friendship(uuid) to authenticated;
revoke execute on function public.my_friend_requests() from public, anon;
grant  execute on function public.my_friend_requests() to authenticated;

-- ── Sending again un-withdraws ──────────────────────────────

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
      -- request_seen_at is untouched, so the recipient is never re-notified.
      -- That was, and remains, the point.
      --
      -- The ONE thing this writes is clearing requester_withdrew_at, so a
      -- sender who withdrew their (swallowed) request and then sends again
      -- sees it return to Sent — exactly as a real re-send would. It touches
      -- nothing the recipient can observe.
      --
      -- Below the threshold, or once the seven days have passed, control falls
      -- through to the reopen below and the request goes out for real.
      update public.friendships
      set requester_withdrew_at = null
      where id = _existing.id and requester_withdrew_at is not null;

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
        declined_by     = null,
        requester_withdrew_at = null
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
