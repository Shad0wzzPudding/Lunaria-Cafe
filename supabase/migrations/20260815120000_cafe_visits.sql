-- ============================================================
-- Visiting a friend's cafe
--
-- A visit is a SNAPSHOT, not a shared world: the visitor is
-- handed the decoration half of the host's save and draws it on
-- their own machine. No realtime, no server-side simulation, and
-- the host does not need to be online.
--
-- Two gates, both server-side:
--   1. an ACCEPTED friendship, in either direction, and
--   2. the host has visits switched on.
-- Closed means closed — friends included. The setting says
-- exactly what it does.
--
-- Privacy: the snapshot is built with jsonb_build_object naming
-- every key it exposes. A whitelist cannot leak a key somebody
-- adds to save_data next month; a blacklist that deletes
-- `journal` can. Nothing here returns coins, reputation, stats,
-- settings, audio or the journal.
-- ============================================================

-- ── 1. The setting ──────────────────────────────────────────
--
-- Defaults to true: friendship already took consent from both sides, and a
-- cafe nobody can enter is a poor first impression of the feature. Turning it
-- off is one switch in Settings.
alter table public.profiles
  add column if not exists cafe_open_to_friends boolean not null default true;

-- The only sanctioned write path, same shape as update_display_name: the broad
-- "update own profile" policy was dropped long ago precisely so a client cannot
-- reach other columns (is_instructor among them) from the browser console.
create or replace function public.set_cafe_visibility(_open boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts have a cafe';
  end if;

  update public.profiles
  set cafe_open_to_friends = coalesce(_open, true)
  where id = auth.uid();

  return coalesce(_open, true);
end;
$$;

-- ── 2. Are we friends? ──────────────────────────────────────
--
-- The relationship is undirected, so this asks about the pair rather than
-- about a requester and an addressee. SECURITY DEFINER so it can see the row
-- regardless of which side the caller sits on.
create or replace function public.is_accepted_friend(_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = _other)
        or (f.requester_id = _other and f.addressee_id = auth.uid()))
  )
$$;

-- ── 3. The snapshot ─────────────────────────────────────────

create or replace function public.visit_friend_cafe(_friend_id uuid)
returns table (
  host_id      uuid,
  display_name text,
  cafe_name    text,
  snapshot     jsonb,
  saved_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _host public.profiles;
  _save public.player_saves;
begin
  if not public.is_student_caller() then
    raise exception 'Only student accounts can visit cafes';
  end if;

  select * into _host from public.profiles where id = _friend_id;
  if not found or not _host.is_student then
    raise exception 'No cafe there';
  end if;

  if _friend_id = auth.uid() then
    raise exception 'That is your own cafe';
  end if;

  if not public.is_accepted_friend(_friend_id) then
    raise exception 'You can only visit friends';
  end if;

  -- Checked AFTER friendship on purpose: someone who is not your friend learns
  -- only "you can only visit friends", never whether your cafe is open.
  if not _host.cafe_open_to_friends then
    raise exception 'Their cafe is closed to visitors right now';
  end if;

  select * into _save from public.player_saves where user_id = _friend_id;
  if not found then
    raise exception 'They have not opened their cafe yet';
  end if;

  return query
  select
    _host.id,
    coalesce(_host.display_name, split_part(_host.email, '@', 1)),
    coalesce(_save.save_data -> 'cafe' ->> 'name', 'Lunaria Cafe'),
    jsonb_build_object(
      -- Decoration only. Note what is NOT here: coins, reputation, stats,
      -- journal, settings, audio, boosts.
      'cafe', jsonb_build_object(
        'name',       _save.save_data -> 'cafe' -> 'name',
        'furniture',  coalesce(_save.save_data -> 'cafe' -> 'furniture', '[]'::jsonb),
        'bgMode',     _save.save_data -> 'cafe' -> 'bgMode',
        'timeOfDay',  _save.save_data -> 'cafe' -> 'timeOfDay',
        'upgrades',   coalesce(_save.save_data -> 'cafe' -> 'upgrades', '[]'::jsonb)
      ),
      -- The wandering residents. `customers` is deliberately absent: it is
      -- saved as [] anyway, so a visited cafe has pets and staff but no crowd.
      'npcs', jsonb_build_object(
        'rabbits', coalesce(_save.save_data -> 'npcs' -> 'rabbits', '[]'::jsonb),
        'cats',    coalesce(_save.save_data -> 'npcs' -> 'cats',    '[]'::jsonb),
        'major',   coalesce(_save.save_data -> 'npcs' -> 'major',   '[]'::jsonb)
      ),
      'pets', jsonb_build_object(
        'owned', coalesce(_save.save_data -> 'pets' -> 'owned', '[]'::jsonb)
      )
    ),
    _save.updated_at;
end;
$$;

-- ── 4. Tell the friends list who is open ────────────────────
--
-- Return columns change → drop before recreation. Adds cafe_open so a friend
-- card can show a Visit button that is actually going to work, rather than
-- offering one that errors.
drop function if exists public.my_friends();

create function public.my_friends()
returns table (
  friendship_id uuid,
  friend_id     uuid,
  display_name  text,
  friends_since timestamptz,
  last_active   timestamptz,
  is_online     boolean,
  cafe_open     boolean
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
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    f.responded_at,
    greatest(s.last_seen_at, ps.updated_at),
    coalesce(s.last_seen_at > now() - interval '90 seconds', false),
    -- A friend with no save has nothing to show, so the button stays hidden
    -- for them too rather than offering a visit that raises.
    p.cafe_open_to_friends and ps.user_id is not null
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  left join public.active_sessions s on s.user_id = p.id
  left join public.player_saves ps   on ps.user_id = p.id
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by coalesce(s.last_seen_at > now() - interval '90 seconds', false) desc,
           greatest(s.last_seen_at, ps.updated_at) desc nulls last;
end;
$$;

-- Signed-in students only. `revoke … from anon` alone is a no-op — anon holds
-- EXECUTE through PUBLIC, so PUBLIC is what has to be revoked.
revoke execute on function public.set_cafe_visibility(boolean) from public, anon;
revoke execute on function public.is_accepted_friend(uuid)     from public, anon;
revoke execute on function public.visit_friend_cafe(uuid)      from public, anon;
revoke execute on function public.my_friends()                 from public, anon;

grant execute on function public.set_cafe_visibility(boolean)  to authenticated;
grant execute on function public.is_accepted_friend(uuid)      to authenticated;
grant execute on function public.visit_friend_cafe(uuid)       to authenticated;
grant execute on function public.my_friends()                  to authenticated;
