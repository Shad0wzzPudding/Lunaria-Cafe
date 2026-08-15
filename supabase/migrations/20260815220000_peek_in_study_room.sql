-- ============================================================
-- Peeking at a cafe from inside a study room
--
-- A study room's members are friends of the HOST, not of each
-- other, so visit_friend_cafe()'s friendship gate would let you
-- look at one person in a room of four and refuse the rest —
-- arbitrary from the inside, where everyone is visibly sitting in
-- the same session.
--
-- Sharing an ACTIVE study room is therefore accepted alongside
-- friendship. It is a narrow widening on purpose:
--
--   * both parties must be currently IN the room (left_at null),
--     so it lapses the moment either leaves,
--   * the room must still be active,
--   * study rooms only — a classroom round does not make
--     classmates into visitors,
--   * and cafe_open_to_friends is still checked afterwards, so
--     anyone can opt out of being looked at without leaving.
-- ============================================================

create or replace function public.shares_active_study_room(_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_rounds r
    join public.round_participants me    on me.round_id = r.id
    join public.round_participants them  on them.round_id = r.id
    where r.owner_kind = 'study'
      and r.status = 'active'
      -- A room past its clock is finished in every way that matters, even
      -- though the row is only retired lazily; it must not keep granting
      -- access. Same test active_round_for_me() uses.
      and (r.ends_at is null or r.ends_at > now())
      and me.student_id = auth.uid()
      and me.left_at is null
      and them.student_id = _other
      and them.left_at is null
  )
$$;

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

  if not (public.is_accepted_friend(_friend_id)
          or public.shares_active_study_room(_friend_id)) then
    raise exception 'You can only visit friends';
  end if;

  -- Still checked AFTER the relationship test, so someone with no connection
  -- learns only "you can only visit friends" and never whether a cafe is open.
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
      'cafe', jsonb_build_object(
        'name',       _save.save_data -> 'cafe' -> 'name',
        'furniture',  coalesce(_save.save_data -> 'cafe' -> 'furniture', '[]'::jsonb),
        'bgMode',     _save.save_data -> 'cafe' -> 'bgMode',
        'timeOfDay',  _save.save_data -> 'cafe' -> 'timeOfDay',
        'upgrades',   coalesce(_save.save_data -> 'cafe' -> 'upgrades', '[]'::jsonb)
      ),
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

revoke execute on function public.shares_active_study_room(uuid) from public, anon;
revoke execute on function public.visit_friend_cafe(uuid)        from public, anon;

grant execute on function public.shares_active_study_room(uuid)  to authenticated;
grant execute on function public.visit_friend_cafe(uuid)         to authenticated;
