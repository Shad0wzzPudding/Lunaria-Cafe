import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/useAuth';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { useGame } from '@/lib/gameState/useGame';
import { Button } from '@/components/ui/button';
import { Play, Radio, Square, Users } from 'lucide-react';

/**
 * Defined at module scope, not inside StudyRoomPanel: a component created
 * during render is a new type on every render, so React unmounts and remounts
 * the whole card each time — losing focus and restarting animations.
 */
function RoomCard({ room, mine, joined, blocked, onJoin, onEnd, ending }) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        mine ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-card/60'
      }`}
    >
      <div className="min-w-0">
        <p className="font-display text-sm text-foreground truncate" title={room.title || undefined}>
          {room.title?.trim() || (mine ? 'Your study room' : `${room.scope_name}'s room`)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {mine ? 'you are hosting' : `hosted by ${room.scope_name}`}
          {room.ends_at ? ' · timed' : ' · open-ended'}
          {room.allow_boosts ? '' : ' · no boosts'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant={joined ? 'outline' : 'default'}
          className="h-7 text-xs"
          disabled={joined || blocked}
          onClick={() => onJoin(room)}
        >
          <Radio className="mr-1 h-3 w-3 shrink-0" />
          {joined ? 'Studying here' : blocked ? 'In another session' : 'Join'}
        </Button>

        {mine && (
          <button
            type="button"
            disabled={ending}
            onClick={() => onEnd(room.round_id)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-destructive disabled:opacity-50"
          >
            <Square className="h-3 w-3" />
            Close room
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Open a study room, or walk into a friend's.
 *
 * A study room IS a live round — the same table, participants, scoring and
 * attendance a teacher's session uses, differing only in who may enter. So
 * this component starts and ends rooms, and hands joining straight to the
 * existing `join()` from LiveRoundProvider rather than reimplementing it.
 *
 * Rooms arrive through `activeRounds`, which already carries both kinds and is
 * kept live by the provider's realtime subscription on class_rounds. There is
 * no separate fetch here and nothing to refresh by hand.
 */
export default function StudyRoomPanel() {
  const { user } = useAuth();
  const { saveDisabled } = useGame();
  const { activeRounds, currentRound, join, refreshActive } = useLiveRound();
  const [minutes, setMinutes] = useState(25);
  const [timed, setTimed] = useState(true);
  const [allowBoosts, setAllowBoosts] = useState(true);
  const [title, setTitle] = useState('');

  const rooms = (activeRounds ?? []).filter((r) => r.owner_kind === 'study');
  const myRoom = rooms.find((r) => r.host_id === user?.id) ?? null;
  const friendRooms = rooms.filter((r) => r.host_id !== user?.id);

  const startMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('start_study_room', {
        _duration_seconds: timed ? Math.max(1, Math.round(minutes)) * 60 : null,
        _allow_boosts: allowBoosts,
        _title: title.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setTitle('');
      // Realtime normally delivers this, but it is the ONLY refresh path for
      // activeRounds — pull it forward so a dropped websocket cannot leave the
      // host looking at the open form with a room already running.
      refreshActive();
      toast.success('Your study room is open. Friends can join now.');
    },
    onError: (err) => toast.error(err.message || 'Could not open the room.'),
  });

  const endMutation = useMutation({
    mutationFn: async (roundId) => {
      const { error } = await supabase.rpc('end_study_room', { _round_id: roundId });
      if (error) throw error;
    },
    onSuccess: () => { refreshActive(); toast.success('Study room closed.'); },
    onError: (err) => toast.error(err.message || 'Could not close the room.'),
  });

  const inThisRoom = (room) =>
    room.joined || currentRound?.round_id === room.round_id;
  // Already studying elsewhere — the provider refuses a second session, so the
  // button says why instead of offering a click that will be rejected.
  const inAnother = (room) => currentRound && currentRound.round_id !== room.round_id;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-display text-base text-foreground">
        <Users className="h-4 w-4 text-primary" /> Study rooms
      </h2>

      {myRoom && (
        <RoomCard
          room={myRoom}
          mine
          joined={inThisRoom(myRoom)}
          blocked={inAnother(myRoom)}
          onJoin={join}
          onEnd={endMutation.mutate}
          ending={endMutation.isPending}
        />
      )}
      {friendRooms.map((room) => (
        <RoomCard
          key={room.round_id}
          room={room}
          mine={false}
          joined={inThisRoom(room)}
          blocked={inAnother(room)}
          onJoin={join}
        />
      ))}

      {/* Opening a room in an offline preview would notify friends of a room
          the host can never enter — beginParticipation refuses a blank state,
          host included. Say why rather than offering a broken button. */}
      {!myRoom && saveDisabled && (
        <p className="rounded-xl border border-border/30 bg-card/40 p-4 text-xs text-muted-foreground">
          Study rooms need your save. They'll be available once your cafe loads.
        </p>
      )}

      {/* One open room per host is enforced by a unique index, so the opening
          form is simply absent while yours is running. */}
      {!myRoom && !saveDisabled && (
        <div className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Study alongside your friends — everyone runs their own cafe, and the room
            keeps a shared board of who's focusing.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Room name (optional)"
              maxLength={60}
              className="w-48 rounded-md border border-border/40 bg-background px-2.5 py-1 text-xs"
              style={{ fontFamily: "'Inter Variable', sans-serif" }}
            />
            <button
              type="button"
              onClick={() => setTimed((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                timed
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {timed ? 'Timed' : 'Open-ended'}
            </button>
            {timed && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="w-14 rounded-md border border-border/40 bg-background px-2 py-1 text-xs"
                  style={{ fontFamily: "'Inter Variable', sans-serif" }}
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            )}
            {/* Spending a potion is irreversible for the student, so the policy
                is fixed at open time — same rule as a teacher's session. */}
            <button
              type="button"
              onClick={() => setAllowBoosts((v) => !v)}
              title="Whether focus boost potions (×1.15 score) apply in this room"
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                allowBoosts
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                  : 'border-border/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              Boosts {allowBoosts ? 'on' : 'off'}
            </button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={startMutation.isPending || (timed && !(minutes > 0))}
              onClick={() => startMutation.mutate()}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {startMutation.isPending ? 'Opening…' : 'Open a room'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
