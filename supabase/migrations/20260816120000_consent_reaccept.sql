-- ============================================================
-- Let an instructor accept the notice AGAIN
--
-- accept_nsc_notice() was written when consent was asked exactly
-- once, and its coalesce() deliberately kept the first
-- acceptance: "re-running it must not rewrite the timestamp, so
-- the column stays an honest record of when the instructor
-- actually accepted."
--
-- That is no longer sufficient. The notice is now versioned — a
-- change to what leaves a player's device re-opens the gate — and
-- the gate asks "did they accept the notice AS IT STANDS", which
-- it answers by comparing nsc_consent_at against the version
-- date. With coalesce() in place, an instructor shown the updated
-- notice would accept it, keep their old timestamp, and be shown
-- it again forever.
--
-- Both facts are worth keeping, so both are kept:
--   nsc_consent_first_at — when they first ever accepted, which
--     is what the original comment was protecting.
--   nsc_consent_at       — when they last accepted, which is what
--     decides whether they have agreed to the current notice.
-- ============================================================

alter table public.profiles
  add column if not exists nsc_consent_first_at timestamptz;

-- Existing rows: their single timestamp is by definition also their first.
update public.profiles
set nsc_consent_first_at = nsc_consent_at
where nsc_consent_at is not null and nsc_consent_first_at is null;

create or replace function public.accept_nsc_notice()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  stamped timestamptz;
begin
  update public.profiles
     set nsc_consent_first_at = coalesce(nsc_consent_first_at, now()),
         -- Always now(): this is the one the gate reads, and it must move
         -- forward when a NEW version of the notice is accepted.
         nsc_consent_at = now()
   where id = auth.uid()
  returning nsc_consent_at into stamped;

  -- No row updated → no profile for this token. Surface it rather
  -- than returning null, which the client would read as "not yet
  -- accepted" and loop the notice forever.
  if stamped is null then
    raise exception 'No profile for the current user';
  end if;

  return stamped;
end;
$$;

revoke execute on function public.accept_nsc_notice() from public, anon;
grant  execute on function public.accept_nsc_notice() to authenticated;
