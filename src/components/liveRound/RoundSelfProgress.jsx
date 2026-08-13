import { Clock, Star, ZapOff } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { useRoundParticipants } from '@/lib/liveRound/useRoundParticipants';
import { formatDuration } from '@/lib/leaderboard/scoring';

/**
 * The student's OWN accumulated progress in the live round, pinned in the
 * cafe footer.
 *
 * Deliberately separate from RoundOverlay. That board is a leaderboard —
 * it's draggable, dismissable, and about everyone else. This is the one
 * piece of round information a student needs kept in front of them, and it
 * must survive hiding the leaderboard.
 *
 * The numbers come from round_participants, NOT from live game state, and
 * that distinction is the whole point: rejoining a session restarts the
 * focus timer at zero, so without this the student sees no evidence that
 * the time they banked before leaving still counts. Only the instructor
 * could see it.
 */
export default function RoundSelfProgress() {
  const { currentRound } = useLiveRound();
  const { user } = useAuth();
  // Shares the ['round-participants', roundId] cache with the leaderboard,
  // so this costs a subscription rather than a second round-trip.
  const { entries } = useRoundParticipants(currentRound?.round_id);

  if (!currentRound) return null;
  const me = entries.find((e) => e.studentId === user?.id);
  if (!me) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/80">Your session</span>
      <span className="flex items-center gap-1" title="Total focused time this session">
        <Clock className="h-3 w-3" />
        {formatDuration(me.focus_seconds)}
      </span>
      <span className="flex items-center gap-1" title="Reputation earned this session">
        <Star className="h-3 w-3" />
        {me.rep > 0 ? '+' : ''}{me.rep}
      </span>
      <span
        className={`flex items-center gap-1 ${me.distractions > 0 ? 'text-orange-400' : ''}`}
        title="Times you were flagged as distracted this session"
      >
        <ZapOff className="h-3 w-3" />
        {me.distractions}
      </span>
      {me.leftCount > 0 && (
        <span
          className="text-amber-500"
          title={`Your progress from before you left is included. Away for ${formatDuration(me.absentSeconds)}.`}
        >
          incl. before you left
        </span>
      )}
    </div>
  );
}
