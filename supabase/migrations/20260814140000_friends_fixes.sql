-- ============================================================
-- Friends: close two holes found in review of 20260814120000.
--
--   1. The "one relationship per pair" rule was only half
--      enforced. unique (requester_id, addressee_id) covers ONE
--      direction; the reverse was checked by an unlocked SELECT
--      in send_friend_request(), so two classmates pressing Send
--      at the same moment could both pass the check and insert
--      mirror rows. The result is a person appearing twice on the
--      friends list, and simultaneously as an incoming AND an
--      outgoing request.
--
--   2. `revoke execute ... from anon` does not remove the
--      implicit grant to PUBLIC, which anon is a member of — so
--      that block restricted nobody. The four RPCs were still
--      safe (each checks auth.uid() / is_student_caller()
--      internally), but the two helpers have no such guard and
--      were reachable unauthenticated.
-- ============================================================

-- ── 1. One row per unordered pair ───────────────────────────

-- Index expressions must be immutable. LEAST/GREATEST over uuid is, but
-- wrapping them in explicitly IMMUTABLE functions states it rather than
-- relying on the planner agreeing — and gives the index a stable name to
-- be built on.
create or replace function public.friend_pair_low(a uuid, b uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$ select least(a, b) $$;

create or replace function public.friend_pair_high(a uuid, b uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$ select greatest(a, b) $$;

-- If this fails with a duplicate-key error, a mirror pair already slipped
-- through; find it with
--   select public.friend_pair_low(requester_id, addressee_id) lo,
--          public.friend_pair_high(requester_id, addressee_id) hi,
--          count(*), array_agg(id)
--   from public.friendships group by 1, 2 having count(*) > 1;
-- and delete the newer row of each pair before re-running.
create unique index if not exists friendships_pair_idx
  on public.friendships (
    public.friend_pair_low(requester_id, addressee_id),
    public.friend_pair_high(requester_id, addressee_id)
  );

-- Recreated only to add the unique_violation handler on the final insert.
-- Everything above it is unchanged from 20260814120000.
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
    update public.friendships
    set requester_id = _me,
        addressee_id = _target.id,
        status       = 'pending',
        created_at   = now(),
        responded_at = null
    where id = _existing.id;

    return query select _target.id, _name, 'pending'::text;
    return;
  end if;

  -- ON CONFLICT DO NOTHING rather than an exception block, because it covers
  -- BOTH unique constraints (the same-direction one and the unordered-pair
  -- index) without naming either, and because the alternative kept
  -- reintroducing a bare `status` in a WHERE clause — which collides with this
  -- function's OUT parameter of the same name and raises 42702, "column
  -- reference is ambiguous". There is no bare column reference left below.
  insert into public.friendships (requester_id, addressee_id)
  values (_me, _target.id)
  on conflict do nothing
  returning id into _row_id;

  if _row_id is null then
    -- The other person's mirror request landed between the SELECT above and
    -- this insert. That is the "they asked first" case arriving a few
    -- milliseconds late, so treat it the same way instead of failing: both
    -- sides pressed Send, which is agreement by any reading.
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

-- ── 2. Real grants ──────────────────────────────────────────
--
-- anon inherits EXECUTE through PUBLIC, so revoking from anon alone is a
-- no-op. Revoke from PUBLIC (which is what actually holds the grant) and
-- hand EXECUTE back to authenticated explicitly.
--
-- generate_friend_code() is granted too, even though nothing signed-in
-- calls it directly: it is the DEFAULT on profiles.friend_code, and a
-- default is evaluated as whatever role runs the INSERT. Today that is
-- always handle_new_user() (SECURITY DEFINER, so the owner), but a bare
-- revoke here would turn any future authenticated insert path into a
-- broken signup, which is not a trade worth making for a random-string
-- generator.

revoke execute on function public.generate_friend_code()                   from public, anon;
revoke execute on function public.normalize_friend_code(text)              from public, anon;
revoke execute on function public.is_student_caller()                      from public, anon;
revoke execute on function public.friend_pair_low(uuid, uuid)              from public, anon;
revoke execute on function public.friend_pair_high(uuid, uuid)             from public, anon;
revoke execute on function public.send_friend_request(text)                from public, anon;
revoke execute on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.my_friends()                             from public, anon;
revoke execute on function public.my_friend_requests()                     from public, anon;

grant execute on function public.generate_friend_code()                   to authenticated;
grant execute on function public.normalize_friend_code(text)              to authenticated;
grant execute on function public.is_student_caller()                      to authenticated;
grant execute on function public.friend_pair_low(uuid, uuid)              to authenticated;
grant execute on function public.friend_pair_high(uuid, uuid)             to authenticated;
grant execute on function public.send_friend_request(text)                to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.my_friends()                             to authenticated;
grant execute on function public.my_friend_requests()                     to authenticated;
