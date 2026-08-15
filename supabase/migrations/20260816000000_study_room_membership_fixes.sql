-- ============================================================
-- Two ways a study room could turn on the people inside it
--
-- 1. active_round_for_me()'s study branch tested friendship and
--    the clock, with no escape hatch for someone already in the
--    room — the very hatch 20260815200000 added to
--    can_join_round() and can_access_round(). So the room could
--    vanish from a participant's own discovery list mid-session,
--    and the client reads "my round is no longer listed" as "the
--    round ended": END_FOCUS, session marked failed, no streak.
--    Two ways to trigger it, both bad:
--      * the host unfriends you while you are studying;
--      * the clock runs out, because the expiry filter applied to
--        participants too. A student focusing when the timer
--        expired would be ejected rather than completing — and
--        the COMPLETE_FOCUS clock only fires for 'active' and
--        'paused', so anyone in the 'distracted' state at that
--        moment took a failed session for a room they sat all the
--        way through.
--
--    Fixed by making participation its own reason to keep seeing
--    the room. Non-participants still never see an expired room,
--    so nobody is offered a dead one to join.
--
-- 2. shares_active_study_room() granted peeking on the strength
--    of an active row and a null left_at. Neither expires by
--    itself: retire_my_expired_study_rooms() only touches rooms
--    with an ends_at, and left_at is only set by an explicit
--    Leave. So an OPEN-ENDED room whose host simply closed the
--    tab stayed 'active' for ever, and everyone who was ever in
--    it kept permanent read access to each other's cafes — people
--    who were never friends. Now both sides must have reported
--    recently, so the grant lapses on its own.
-- ============================================================

-- ── 1. Being in the room is reason enough to see it ─────────

drop function if exists public.active_round_for_me();

create function public.active_round_for_me()
returns table (
  round_id         uuid,
  owner_kind       text,
  classroom_id     uuid,
  host_id          uuid,
  scope_name       text,
  title            text,
  started_at       timestamptz,
  duration_seconds integer,
  ends_at          timestamptz,
  allow_boosts     boolean,
  joined           boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.owner_kind, r.classroom_id, null::uuid, c.name, r.title,
    r.started_at, r.duration_seconds, r.ends_at, r.allow_boosts,
    exists (
      select 1 from public.round_participants rp
      where rp.round_id = r.id and rp.student_id = auth.uid() and rp.left_at is null
    )
  from public.class_rounds r
  join public.classrooms c on c.id = r.classroom_id
  where r.status = 'active'
    and r.owner_kind = 'classroom'
    and public.is_classroom_member(r.classroom_id)
    -- Classroom rounds are NOT filtered on ends_at: a teacher's board stays
    -- up after the clock stops, and has since timed rounds shipped.

  union all

  select
    r.id, r.owner_kind, null::uuid, r.host_id,
    coalesce(p.display_name, split_part(p.email, '@', 1)), r.title,
    r.started_at, r.duration_seconds, r.ends_at, r.allow_boosts,
    exists (
      select 1 from public.round_participants rp
      where rp.round_id = r.id and rp.student_id = auth.uid() and rp.left_at is null
    )
  from public.class_rounds r
  join public.profiles p on p.id = r.host_id
  where r.status = 'active'
    and r.owner_kind = 'study'
    and (
      -- Already in it. Keeps the room listed until you actually leave, so
      -- neither an unfriending nor the clock expiring can pull currentRound
      -- out from under a running session and have it read as "ended".
      exists (
        select 1 from public.round_participants rp
        where rp.round_id = r.id and rp.student_id = auth.uid() and rp.left_at is null
      )
      -- Not in it: only offered rooms that are still open AND still yours to
      -- join, so nobody is invited into a room with no time left.
      or ((r.ends_at is null or r.ends_at > now())
          and (r.host_id = auth.uid() or public.is_accepted_friend(r.host_id)))
    )

  -- By position: ORDER BY in a UNION cannot see the output column names.
  order by 7 desc
$$;

-- ── 2. Peeking lapses when someone stops studying ───────────

-- Progress is written every 5s while in a session, and a presence-only
-- heartbeat every 30s after the metrics settle (REPORT_INTERVAL /
-- HEARTBEAT_INTERVAL in LiveRoundProvider). Two minutes is therefore
-- generous for "still actually here", and comfortably above the 90s
-- PARTICIPANT_STALE_MS the board already uses to call someone gone.
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
    join public.round_participants me   on me.round_id = r.id
    join public.round_participants them on them.round_id = r.id
    where r.owner_kind = 'study'
      and r.status = 'active'
      and (r.ends_at is null or r.ends_at > now())
      and me.student_id = auth.uid()
      and me.left_at is null
      and them.student_id = _other
      and them.left_at is null
      -- Both must still be reporting. Without this an open-ended room whose
      -- host closed the tab never goes inactive and no left_at is ever set,
      -- so the grant would outlive the session for ever.
      and me.updated_at   > now() - interval '2 minutes'
      and them.updated_at > now() - interval '2 minutes'
  )
$$;

revoke execute on function public.active_round_for_me()          from public, anon;
revoke execute on function public.shares_active_study_room(uuid) from public, anon;

grant execute on function public.active_round_for_me()           to authenticated;
grant execute on function public.shares_active_study_room(uuid)  to authenticated;
