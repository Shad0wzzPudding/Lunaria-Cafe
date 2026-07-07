-- ============================================================
-- Per-classroom leaderboard
--
-- A student-facing sibling to get_classroom_stats(). Where that
-- one is instructor-only and detailed, this returns the small
-- ranking subset that EVERY member of a room (and its instructor)
-- may see about EVERY other member.
--
-- Privacy: exposes display_name + the four ranking metrics only.
-- No email, no journal, nothing else from save_data. The Overall
-- composite is computed client-side from these numbers, so the
-- weighting can be tuned without a new migration.
-- ============================================================

create or replace function public.get_classroom_leaderboard(_classroom_id uuid)
returns table (
  student_id         uuid,
  display_name       text,
  reputation         numeric,
  coins              numeric,
  total_focus_seconds numeric,
  last_focus_score   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Only people who belong to the room may read its board.
  if not (
    public.is_classroom_member(_classroom_id)
    or public.is_classroom_instructor(_classroom_id)
  ) then
    raise exception 'Not a member of this classroom';
  end if;

  return query
  select
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)),
    coalesce((ps.save_data ->> 'reputation')::numeric, 0),
    coalesce((ps.save_data ->> 'coins')::numeric, 0),
    coalesce((ps.save_data -> 'stats' ->> 'totalFocusSeconds')::numeric, 0),
    -- Null until the member finishes a session after this feature ships;
    -- the client treats null as "no score yet".
    (ps.save_data -> 'stats' ->> 'lastFocusScore')::numeric
  from public.classroom_members cm
  join public.profiles p on p.id = cm.student_id
  left join public.player_saves ps on ps.user_id = cm.student_id
  where cm.classroom_id = _classroom_id;
end;
$$;

-- Signed-in members only.
revoke execute on function public.get_classroom_leaderboard(uuid) from anon;
