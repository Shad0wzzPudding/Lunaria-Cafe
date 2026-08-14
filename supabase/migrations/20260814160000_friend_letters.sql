-- ============================================================
-- Friend letters: what the player has not seen yet
--
-- The friends feature grows two pieces of ceremony, both built
-- on the welcome letter's envelope:
--
--   * a bubble on the main menu when something is waiting, and
--   * a letter that slides down on the Friends page when a
--     request you SENT has been accepted.
--
-- Both need to fire once and then stop, which the existing
-- columns cannot express: `status` says what happened, not
-- whether the person it happened to has looked at it yet. Two
-- timestamps carry that, one per side of the row.
--
-- Only ACCEPTANCES come back. A decline still leaves silently —
-- the sender's pending list simply empties — so there is
-- deliberately no "declined result" to mark seen. Read
-- respond_to_friend_request() in 20260814120000 alongside this.
-- ============================================================

alter table public.friendships
  -- Stamped when the REQUESTER has seen that their request was accepted.
  add column if not exists result_seen_at  timestamptz,
  -- Stamped when the ADDRESSEE has seen that a request is waiting for them.
  -- Separate from responding: seeing it stops the nagging, answering it
  -- clears the card.
  add column if not exists request_seen_at timestamptz;

-- Everything already accepted predates the letters. Backfilling as "seen"
-- stops the first load after this migration dumping a pile of letters for
-- friendships made days ago.
update public.friendships
set result_seen_at = coalesce(responded_at, created_at)
where status = 'accepted' and result_seen_at is null;

update public.friendships
set request_seen_at = created_at
where status <> 'pending' and request_seen_at is null;

-- Partial indexes: both lookups below ask only for the unseen rows, which
-- are a vanishing fraction of the table.
create index if not exists friendships_unseen_result_idx
  on public.friendships (requester_id)
  where status = 'accepted' and result_seen_at is null;

create index if not exists friendships_unseen_request_idx
  on public.friendships (addressee_id)
  where status = 'pending' and request_seen_at is null;

-- ── Counts for the menu bubble ──────────────────────────────
--
-- One cheap call, because the main menu renders on every return to it and
-- must not pay for the two full list queries the Friends page runs.
create or replace function public.my_friend_notices()
returns table (
  new_requests integer,
  new_results  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Deliberately NOT an exception for non-students: the menu asks this on
  -- every visit, and an instructor or a role-less account should get a quiet
  -- zero rather than an error the menu has to special-case.
  if not public.is_student_caller() then
    return query select 0, 0;
    return;
  end if;

  return query
  select
    (select count(*)::integer from public.friendships f
      where f.addressee_id = auth.uid()
        and f.status = 'pending'
        and f.request_seen_at is null),
    (select count(*)::integer from public.friendships f
      where f.requester_id = auth.uid()
        and f.status = 'accepted'
        and f.result_seen_at is null);
end;
$$;

-- ── The letters themselves ──────────────────────────────────
--
-- Requests you sent that have been accepted and not yet shown. Ordered
-- oldest first so a backlog is read in the order it arrived.
create or replace function public.my_unseen_friend_results()
returns table (
  friendship_id uuid,
  friend_id     uuid,
  display_name  text,
  accepted_at   timestamptz
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
  select f.id, p.id,
         coalesce(p.display_name, split_part(p.email, '@', 1)),
         f.responded_at
  from public.friendships f
  join public.profiles p on p.id = f.addressee_id
  where f.requester_id = auth.uid()
    and f.status = 'accepted'
    and f.result_seen_at is null
  order by f.responded_at;
end;
$$;

-- ── Marking things seen ─────────────────────────────────────
--
-- Both are all-or-nothing rather than per-row: the client shows the whole
-- batch at once, so there is no state in which half of it has been read.
-- Idempotent, and each only ever touches the caller's own side of the row.

create or replace function public.mark_friend_results_seen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  update public.friendships f
  set result_seen_at = now()
  where f.requester_id = auth.uid()
    and f.status = 'accepted'
    and f.result_seen_at is null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

create or replace function public.mark_friend_requests_seen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can have friends';
  end if;

  update public.friendships f
  set request_seen_at = now()
  where f.addressee_id = auth.uid()
    and f.status = 'pending'
    and f.request_seen_at is null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Signed-in students only. `revoke ... from anon` alone would be a no-op —
-- anon holds EXECUTE through PUBLIC, so PUBLIC is what has to be revoked,
-- and authenticated then needs it handed back explicitly.
revoke execute on function public.my_friend_notices()          from public, anon;
revoke execute on function public.my_unseen_friend_results()   from public, anon;
revoke execute on function public.mark_friend_results_seen()   from public, anon;
revoke execute on function public.mark_friend_requests_seen()  from public, anon;

grant execute on function public.my_friend_notices()           to authenticated;
grant execute on function public.my_unseen_friend_results()    to authenticated;
grant execute on function public.mark_friend_results_seen()    to authenticated;
grant execute on function public.mark_friend_requests_seen()   to authenticated;
