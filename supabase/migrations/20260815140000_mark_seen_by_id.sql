-- ============================================================
-- Mark seen only what was actually shown
--
-- mark_friend_results_seen() and mark_friend_requests_seen()
-- stamped EVERY unseen row for the caller. The client, though,
-- only ever displays the batch it fetched when the page opened.
-- Anything that arrived between that fetch and the stamp — a
-- classmate accepting while the letter was on screen, a request
-- landing while the page sat open — was marked read without ever
-- being rendered.
--
-- The loss is silent and permanent: `result_seen_at` is set, so
-- the letter never arrives, `my_friend_notices()` never counts
-- it, and nothing anywhere says a notification went missing.
--
-- Both now take the ids the client actually put on screen. The
-- caller-ownership predicates are unchanged, so this narrows what
-- a call can touch and never widens it: passing somebody else's
-- friendship id still stamps nothing.
--
-- The zero-argument versions are dropped rather than kept. A
-- leftover "stamp everything" entry point is exactly the kind of
-- thing that gets called by mistake later.
-- ============================================================

drop function if exists public.mark_friend_results_seen();
drop function if exists public.mark_friend_requests_seen();

create or replace function public.mark_friend_results_seen(_ids uuid[])
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

  if _ids is null or cardinality(_ids) = 0 then
    return 0;
  end if;

  update public.friendships f
  set result_seen_at = now()
  where f.id = any(_ids)
    and f.requester_id = auth.uid()
    and f.status = 'accepted'
    and f.result_seen_at is null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

create or replace function public.mark_friend_requests_seen(_ids uuid[])
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

  if _ids is null or cardinality(_ids) = 0 then
    return 0;
  end if;

  update public.friendships f
  set request_seen_at = now()
  where f.id = any(_ids)
    and f.addressee_id = auth.uid()
    and f.status = 'pending'
    and f.request_seen_at is null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke execute on function public.mark_friend_results_seen(uuid[])  from public, anon;
revoke execute on function public.mark_friend_requests_seen(uuid[]) from public, anon;

grant execute on function public.mark_friend_results_seen(uuid[])  to authenticated;
grant execute on function public.mark_friend_requests_seen(uuid[]) to authenticated;
