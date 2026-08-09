-- ============================================================
-- Instructor NSC acknowledgement
--
-- Players record their acknowledgement in their save (one jsonb
-- blob per student), but instructors never mount the game and so
-- have no save to write to. Their consent lives on the profile
-- instead: per account, follows them to any device, asked once.
--
-- accept_nsc_notice() is SECURITY DEFINER because the broad
-- "update own profile" policy was dropped in 20260721220000 —
-- RPCs are the only sanctioned write path to profiles from the
-- client, and this one touches nsc_consent_at and nothing else.
--
-- coalesce() keeps the FIRST acceptance: re-running it must not
-- rewrite the timestamp, so the column stays an honest record of
-- when the instructor actually accepted.
-- ============================================================

alter table public.profiles
  add column if not exists nsc_consent_at timestamptz;

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
     set nsc_consent_at = coalesce(nsc_consent_at, now())
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

revoke execute on function public.accept_nsc_notice() from anon;
