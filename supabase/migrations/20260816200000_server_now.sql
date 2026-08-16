-- ============================================================
-- What time does the SERVER think it is?
--
-- 20260816160000 made round_participants.updated_at server-
-- stamped, so every student's presence heartbeat now comes from
-- one clock. The read side never did: hasGoneQuiet() in
-- scoring.js compares those stamps against Date.now() in
-- whoever's browser is looking, so an instructor three minutes
-- fast tags the whole class absent while they are reporting
-- every five seconds.
--
-- The client cannot read the HTTP Date header to work this out —
-- `Date` is not a CORS-safelisted response header, so
-- Response.headers.get('date') is null in a browser unless the
-- origin opts in. A response BODY is always readable, so the
-- time comes back as one.
--
-- Deliberately trivial and side-effect free. It reveals nothing:
-- the wall clock is not a secret, and the caller already knows
-- roughly what it is.
-- ============================================================

create or replace function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now()
$$;

revoke execute on function public.server_now() from public, anon;
grant  execute on function public.server_now() to authenticated;
