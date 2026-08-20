-- ============================================================
-- The decline tally becomes PER DIRECTION.
--
-- decline_count was one number per PAIR, incremented whenever
-- either side declined. The cooldown gate, though, asked a
-- per-direction question — whether the person being asked has
-- turned THIS caller down twice — and read a per-pair answer,
-- which is a different number entirely. Those disagree the
-- moment both people have declined once:
--
--   Bob asks Alice, Alice declines        -> count 1
--   Alice asks Bob (other direction, ok)  -> count stays 1
--   Bob declines her                      -> count 2
--   Alice asks again -> BLOCKED for 7 days
--
-- That was Alice's SECOND ask and Bob had refused her ONCE, while
-- the 20260818120000 header promises "asks 1 and 2 land normally,
-- ask 3 refused". Chosen fix: count per direction, so the number
-- the gate reads is the number the gate means.
--
-- HOW THE DIRECTION IS KEYED. The row rewrites requester_id and
-- addressee_id whenever the other person reaches out, so those
-- columns cannot anchor a tally that has to outlive the flip.
-- The unordered pair can: friend_pair_low/_high already exist for
-- the advisory lock, and give each member a stable side. So
-- low_declined_count is "times the low-uuid member, AS SENDER,
-- was turned down", and it stays put across any number of flips.
--
-- WHAT THIS DELIBERATELY KEEPS:
--
--   * Not reset on reopen. Still the whole point — clearing the
--     tally when the direction flips would hand out unlimited
--     "first tries" to anyone willing to send twice. Per-direction
--     counting removes the NEED for a reset rather than adding
--     one: Alice's tally was never touched by Bob's declines to
--     begin with.
--   * Accepting zeroes BOTH sides. Two people who are now friends
--     should not carry friction from before, in either direction,
--     in case they unfriend and one asks again.
--   * The uniform reply. The blocked branch still returns exactly
--     what the "already outstanding" branch returns and still
--     writes nothing the recipient can observe. That pair of
--     replies being identical is the privacy property; only the
--     CONDITION for reaching it changes here.
--
-- decline_count is intentionally NOT dropped. Nothing reads or
-- writes it after this, but migrations here are applied by hand,
-- and dropping it would make re-applying 20260818160000 fail
-- outright — the rollback path would be broken by the fix. It is
-- left as dead weight on purpose; the backfill below copies what
-- it knew into the new columns.
-- ============================================================

alter table public.friendships
  add column if not exists low_declined_count  integer not null default 0,
  add column if not exists high_declined_count integer not null default 0,
  add column if not exists low_declined_at     timestamptz,
  add column if not exists high_declined_at    timestamptz;

-- ── Backfill ────────────────────────────────────────────────
--
-- The declined SENDER is whoever is not declined_by. coalesce covers rows the
-- 20260816220000 backfill could not reach: only an addressee has ever been
-- able to decline, so the addressee is the safe assumption.
--
-- The whole old per-pair count goes to that one direction. It over-counts a
-- pair who declined each other — exactly the case this migration exists to
-- fix — but the alternative is inventing a split that was never recorded, and
-- over-counting fails safe: it can delay an ask, never wrongly allow one.
-- Guarded on the new counters still being 0 so re-applying this file cannot
-- double-count.

update public.friendships f
set low_declined_count = f.decline_count,
    low_declined_at    = f.responded_at
where f.status = 'declined'
  and f.decline_count > 0
  and f.low_declined_count = 0
  and public.friend_pair_low(f.requester_id, f.addressee_id)
      <> coalesce(f.declined_by, f.addressee_id);

update public.friendships f
set high_declined_count = f.decline_count,
    high_declined_at    = f.responded_at
where f.status = 'declined'
  and f.decline_count > 0
  and f.high_declined_count = 0
  and public.friend_pair_high(f.requester_id, f.addressee_id)
      <> coalesce(f.declined_by, f.addressee_id);

-- ── Count the decline against the SENDER who was refused ────

create or replace function public.respond_to_friend_request(_request_id uuid, _accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _req    public.friendships;
  _is_low boolean;
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

  -- The person being refused is the one who ASKED. Which side of the pair
  -- they sit on is what decides which tally moves.
  _is_low := _req.requester_id
             = public.friend_pair_low(_req.requester_id, _req.addressee_id);

  update public.friendships
  set status       = case when _accept then 'accepted' else 'declined' end,
      responded_at = now(),
      -- Cleared on accept so a later decline cannot be judged against a
      -- decision that was already reversed.
      declined_by  = case when _accept then null else auth.uid() end,

      -- Accept wipes BOTH directions; a decline touches only the refused
      -- sender's side and leaves the other exactly as it was.
      low_declined_count = case
        when _accept then 0
        when _is_low then _req.low_declined_count + 1
        else _req.low_declined_count end,
      low_declined_at = case
        when _accept then null
        when _is_low then now()
        else _req.low_declined_at end,

      high_declined_count = case
        when _accept then 0
        when not _is_low then _req.high_declined_count + 1
        else _req.high_declined_count end,
      high_declined_at = case
        when _accept then null
        when not _is_low then now()
        else _req.high_declined_at end
  where id = _req.id;
end;
$$;

-- ── Gate on the caller's OWN tally ──────────────────────────

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
  _me           uuid := auth.uid();
  _target       public.profiles;
  _existing     public.friendships;
  _norm         text := public.normalize_account_code(_code);
  _name         text;
  _row_id       uuid;
  _my_declines  integer;
  _my_last      timestamptz;
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
        -- gets below, or the pair of them is an oracle.
        return query select _target.id, _name, 'pending'::text;
        return;
      end if;

      -- They asked first. Answering with a request of your own accepts theirs.
      -- With the lock above, the racing sender now reliably lands HERE rather
      -- than in the ON CONFLICT branch.
      update public.friendships
      set status = 'accepted', responded_at = now(),
          low_declined_count = 0, high_declined_count = 0,
          low_declined_at = null, high_declined_at = null
      where id = _existing.id;

      return query select _target.id, _name, 'accepted'::text;
      return;
    end if;

    -- status = 'declined'. Read MY OWN side of the tally: how many times have
    -- I been turned down by them, and when was the last one. Who declined
    -- most recently no longer enters into it — the old gate needed
    -- declined_by = the target to stop a per-pair number being applied to the
    -- wrong person, and a per-direction number cannot be applied to the wrong
    -- person in the first place.
    if _me = public.friend_pair_low(_me, _target.id) then
      _my_declines := _existing.low_declined_count;
      _my_last     := _existing.low_declined_at;
    else
      _my_declines := _existing.high_declined_count;
      _my_last     := _existing.high_declined_at;
    end if;

    if _my_declines >= 2
       and _my_last is not null
       and _my_last > now() - interval '7 days' then
      -- They turned THIS caller down at least twice, recently. Answer exactly
      -- as the "already outstanding" branch above does — same value, no error
      -- — because those two replies are what a sender would compare.
      --
      -- request_seen_at is untouched, so the recipient is never re-notified.
      --
      -- The ONE thing this writes is clearing requester_withdrew_at, so a
      -- sender who withdrew their (swallowed) request and then sends again
      -- sees it return to Sent — exactly as a real re-send would. It touches
      -- nothing the recipient can observe.
      update public.friendships
      set requester_withdrew_at = null
      where id = _existing.id and requester_withdrew_at is not null;

      return query select _target.id, _name, 'pending'::text;
      return;
    end if;

    -- Below the threshold, or the seven days have passed, or they have never
    -- refused this caller at all. Rewriting the direction matters: leaving the
    -- old one in place would file their request as a repeat of the one already
    -- turned down. The seen stamps clear with it — a reopened request is a new
    -- one, and its eventual acceptance has to be able to produce a letter.
    --
    -- The tallies are deliberately untouched. They are per direction now, so
    -- the flip cannot misattribute them, and clearing them here would hand an
    -- unlimited supply of "first tries" to anyone willing to send twice. Only
    -- an accepted friendship clears them.
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
    -- Should be unreachable — the advisory lock means any competing row is
    -- committed and visible to the SELECT above. Kept as a backstop: if the
    -- row still cannot be found it belongs to a transaction this one cannot
    -- see, so there is nothing to accept and nothing to claim.
    select f.id into _row_id
    from public.friendships f
    where (f.requester_id = _me and f.addressee_id = _target.id)
       or (f.requester_id = _target.id and f.addressee_id = _me);

    if _row_id is null then
      return query select _target.id, _name, 'pending'::text;
      return;
    end if;

    update public.friendships
    set status = 'accepted', responded_at = now(),
        low_declined_count = 0, high_declined_count = 0,
        low_declined_at = null, high_declined_at = null
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
