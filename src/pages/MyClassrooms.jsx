import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import SearchInput from '@/components/ui/SearchInput';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Users, KeyRound, LogOut, GraduationCap, Trophy, Radio, Hash, MailOpen, Lock, Plus } from 'lucide-react';
import { PANEL_BRIGHT_BG, getThemeMode } from '@/lib/theme/themeDeriver';
import { ROOM_GRID } from '@/lib/ui/cardGrid';

async function fetchClassrooms() {
  const { data, error } = await supabase.rpc('list_classrooms');
  if (error) throw error;
  return data ?? [];
}


function RoomCard({ room, children }) {
  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* Long names are truncated to keep the card tidy, so hovering
                has to be able to reveal the rest. */}
            <p className="font-display text-sm text-foreground truncate" title={room.name}>
              {room.name}
            </p>
            {/* Only ever seen on an enrolled room — private rooms are
                filtered out of the browse list server-side. */}
            {room.is_public === false && (
              <Lock className="w-3 h-3 shrink-0 text-amber-500" aria-label="Private classroom" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate" title={room.instructor_name}>
            by {room.instructor_name}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Users className="w-3.5 h-3.5" />
          {room.member_count}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function MyClassrooms() {
  const { dispatch } = useGame();
  const { user } = useAuth();
  const { activeRounds, currentRound, join } = useLiveRound();
  const queryClient = useQueryClient();

  // Map classroom_id → live round, so each enrolled card can offer "Join".
  const roundByRoom = new Map((activeRounds ?? []).map((r) => [r.classroom_id, r]));

  const [joiningId, setJoiningId] = useState(null);
  const [pin, setPin] = useState('');
  const [joinError, setJoinError] = useState('');
  const [leavingId, setLeavingId] = useState(null);
  const [search, setSearch] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [codePin, setCodePin] = useState('');
  const [codeMsg, setCodeMsg] = useState(null); // { ok, text }
  const [joinOpen, setJoinOpen] = useState(false);

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ['classrooms'],
    queryFn: fetchClassrooms,
  });

  const { data: invites } = useQuery({
    queryKey: ['my-invites'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_invites');
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['classrooms'] });
    queryClient.invalidateQueries({ queryKey: ['my-invites'] });
  };

  const respondMutation = useMutation({
    mutationFn: async ({ inviteId, accept }) => {
      const { error } = await supabase.rpc('respond_to_invite', {
        _invite_id: inviteId,
        _accept: accept,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const codeMutation = useMutation({
    mutationFn: async ({ code, pin }) => {
      const { data, error } = await supabase.rpc('join_classroom_by_code', {
        _code: code,
        _pin: pin,
      });
      if (error) throw error;
      // The RPC returns a one-row table, so unwrap it for the message.
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (room) => {
      // Close the dialog and confirm outside it — the new room is now on the
      // page behind, which is the real confirmation.
      setJoinCode('');
      setCodePin('');
      setCodeMsg(null);
      setJoinOpen(false);
      toast.success(`Joined ${room?.classroom_name ?? 'the classroom'}!`);
      refresh();
    },
    onError: (err) => setCodeMsg({ ok: false, text: err.message || 'Could not join.' }),
  });

  const joinMutation = useMutation({
    mutationFn: async ({ classroomId, pin }) => {
      const { error } = await supabase.rpc('join_classroom', {
        _classroom_id: classroomId,
        _pin: pin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setJoiningId(null);
      setPin('');
      setJoinError('');
      setJoinOpen(false);
      toast.success('Joined the classroom!');
      refresh();
    },
    onError: (err) => setJoinError(err.message || 'Could not join.'),
  });

  const leaveMutation = useMutation({
    mutationFn: async (classroomId) => {
      const { error } = await supabase
        .from('classroom_members')
        .delete()
        .eq('classroom_id', classroomId)
        .eq('student_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setLeavingId(null);
      refresh();
    },
  });

  // Search filters the AVAILABLE list only — the enrolled list is short by
  // nature, while list_classrooms() returns every room in the database, so
  // that's the one that becomes unbrowsable.
  const enrolled = (rooms ?? []).filter((r) => r.is_member);
  const available = useMemo(() => {
    const list = (rooms ?? []).filter((r) => !r.is_member);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      `${r.name} ${r.instructor_name ?? ''}`.toLowerCase().includes(q),
    );
  }, [rooms, search]);
  const availableTotal = (rooms ?? []).filter((r) => !r.is_member).length;

  // 'classic' is the focus theme and the default. Read at render like
  // getFocusPanelStyle does — the mode only changes from Settings, which
  // remounts this page on the way back.
  const isFocusTheme = getThemeMode() !== 'custom';

  const startJoin = (roomId) => {
    setJoiningId(roomId);
    setPin('');
    setJoinError('');
  };

  return (
    // No bg-background here: the backdrop below is what fills the page now, and
    // an opaque root would simply cover it.
    <div className="relative min-h-screen">
      {/* The cafe, behind everything.
          FIXED rather than absolute so the room stays put while the list
          scrolls — an absolute image would only cover the first viewport and
          then scroll away, leaving bare background under a long list.
          The scrim is what keeps text readable. Heaviest at the top, which is
          where the header and the first row of cards land; lightest across the
          middle, where the room's empty floor shows through and there is
          usually nothing to read; heavy again at the bottom, over the busy
          counter. Verified with a ten-room grid: cards crossing the light band
          still read, because they carry their own bg-card/60 and blur.
          Tokens rather than black, so it follows the active theme instead of
          forcing a dark page under a light one. */}
      <div className="fixed inset-0 z-0" aria-hidden="true">
        <img
          src="/assets/Backdrop/cafe_interior.webp"
          alt=""
          className="w-full h-full object-cover object-center select-none"
          draggable={false}
        />
        {/* The two branches veil the art from OPPOSITE ends, which is the
            whole reason they cannot share numbers.

            Focus washes toward WHITE, flat. Its --background is a near-black
            purple, so every token-based scrim darkened the room — the long way
            round through 90/70/95, 70/40/80, 40/12/50 and 60/30/70 was really
            an argument about how much shadow was tolerable, when what the page
            wanted was light. White lifts the art instead of dimming it.

            Flat rather than a gradient, and that turned out to be the source
            of the "hazy" look rather than the colour: a scrim that varies down
            the page reads as fog drifting over the art, where an even one
            simply reads as light. A single opacity is also honest about what
            it does — nothing here needs more cover at the top than the bottom,
            since every heading and card carries its own background.

            Immersive stays on --background, because there it IS the light
            tone: the same values give a warm sepia wash rather than a shadow,
            and it keeps its gradient.

            White has one cost, and it is paid next to this: the section
            headings are light text with nothing behind them, so a pale
            backdrop erases them. They carry their own bg-card/70 pill now,
            which is why the scrim is free to go this bright.

            Both strings are written out in full rather than composed, so
            Tailwind's scanner can see the class names. */}
        <div
          className={
            isFocusTheme
              ? 'absolute inset-0 bg-white/55'
              : 'absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background/95'
          }
        />
      </div>

      {/* Everything else rides above it. Explicit z-10 against the backdrop's
          z-0 rather than a negative z-index, which would sit behind the app
          shell's own background in some stacking contexts. */}
      <div className="relative z-10">
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-border/30"
        style={{ background: PANEL_BRIGHT_BG }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'menu' })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">My Classrooms</h1>

        {/* Joining lives behind this, so the page itself is only the rooms
            you're actually in. mr-auto on the title would fight the gap, so
            the spacer does the pushing. */}
        <div className="flex-1" />
        <Dialog
          open={joinOpen}
          onOpenChange={(open) => {
            setJoinOpen(open);
            // Reset on close, or reopening shows a stale "Wrong PIN" from
            // last time and whichever room's PIN form was left expanded.
            if (!open) {
              setCodeMsg(null);
              setJoiningId(null);
              setJoinError('');
              setSearch('');
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="Join a classroom"
              aria-label="Join a classroom"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-xl text-foreground">Join a classroom</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Enter a class code from your instructor, or pick a listed room below.
                Private classrooms never appear in the list — they need a code or an invitation.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-6">
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 font-display text-sm text-foreground">
                  <Hash className="h-4 w-4 text-primary" /> Join with a class code
                </h3>
                <form
                  className="flex flex-wrap items-start gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCodeMsg(null);
                    codeMutation.mutate({ code: joinCode.trim(), pin: codePin.trim() });
                  }}
                >
                  <input
                    type="text"
                    placeholder="Class code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={12}
                    className="w-36 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm uppercase tracking-widest"
                    required
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="PIN"
                    value={codePin}
                    onChange={(e) => setCodePin(e.target.value)}
                    maxLength={6}
                    className="w-24 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm tracking-widest"
                    required
                  />
                  <Button type="submit" size="sm" className="h-8 text-xs" disabled={codeMutation.isPending}>
                    {codeMutation.isPending ? 'Joining…' : 'Join'}
                  </Button>
                </form>
                {codeMsg && (
                  <p className={`text-xs ${codeMsg.ok ? 'text-emerald-500' : 'text-amber-400'}`}>{codeMsg.text}</p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 font-display text-sm text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" /> Available rooms
                </h3>

                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search rooms by name or instructor…"
                />

                {availableTotal === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No other public classrooms right now. Private rooms don't appear here — use a class code above.
                  </p>
                ) : available.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No rooms match "{search}".</p>
                ) : (
                  <div className={ROOM_GRID}>
                    {available.map((room) => (
                      <RoomCard key={room.id} room={room}>
                        {joiningId === room.id ? (
                          <form
                            className="space-y-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              joinMutation.mutate({ classroomId: room.id, pin: pin.trim() });
                            }}
                          >
                            <div className="flex gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="6-digit PIN"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                maxLength={6}
                                className="flex-1 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm tracking-widest"
                                autoFocus
                                required
                              />
                              <Button type="submit" size="sm" className="h-8 text-xs" disabled={joinMutation.isPending}>
                                {joinMutation.isPending ? 'Joining…' : 'Join'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setJoiningId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                            {joinError && <p className="text-xs text-amber-400">{joinError}</p>}
                          </form>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => startJoin(room.id)}
                          >
                            <KeyRound className="mr-1 h-3 w-3" />
                            Join with PIN
                          </Button>
                        )}
                      </RoomCard>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {/* Left-aligned and wide, rather than a narrow centred column: the
          cards lay out into the space instead of stacking in a ribbon down
          the middle of a big screen. */}
      <div className="max-w-5xl p-6 space-y-8">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-10">Loading classrooms…</p>
        )}
        {error && (
          <p className="text-sm text-amber-400 text-center py-10">
            Could not load classrooms: {error.message}
          </p>
        )}

        {!isLoading && !error && (
          <>
            {/* Invitations first — they're the only thing here that's
                waiting on the student to act. */}
            {(invites?.length ?? 0) > 0 && (
              <section className="space-y-3">
                {/* The pill is not decoration: this is light text sitting
                    directly on the backdrop, and the white scrim above is
                    bright enough to erase it. Carrying its own background
                    means the heading reads whatever the art is doing behind. */}
                <h2 className="font-display text-base text-foreground flex w-fit items-center gap-2 rounded-lg bg-card/70 px-2.5 py-1 backdrop-blur-sm">
                  <MailOpen className="w-4 h-4 text-primary" /> Invitations
                </h2>
                <div className={ROOM_GRID}>
                  {invites.map((inv) => (
                    // Lit, not loud. bg-primary/5 alone was a 5% tint with no
                    // blur, so against the backdrop an invitation read FAINTER
                    // than the enrolled rooms below it — backwards, since this
                    // is the only card waiting on the student. It now sits on
                    // the same card base as the others (so it stays legible
                    // over the art) with a primary wash and a soft ring over
                    // the top: same family, visibly picked out. No animation —
                    // this waits for them, it shouldn't nag.
                    <div
                      key={inv.invite_id}
                      className="rounded-xl border border-primary/50 bg-card/60 bg-gradient-to-br from-primary/15 to-transparent backdrop-blur-sm ring-1 ring-primary/25 shadow-lg shadow-primary/10 p-4 space-y-3"
                    >
                      <div className="min-w-0">
                        <p
                          className="font-display text-sm text-foreground truncate"
                          title={inv.classroom_name}
                        >
                          {inv.classroom_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={inv.instructor_name}>
                          invited by {inv.instructor_name}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 flex-1 text-xs"
                          disabled={respondMutation.isPending}
                          onClick={() => respondMutation.mutate({ inviteId: inv.invite_id, accept: true })}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={respondMutation.isPending}
                          onClick={() => respondMutation.mutate({ inviteId: inv.invite_id, accept: false })}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              {/* Same reason as the Invitations heading above. */}
              <h2 className="font-display text-base text-foreground flex w-fit items-center gap-2 rounded-lg bg-card/70 px-2.5 py-1 backdrop-blur-sm">
                <GraduationCap className="w-4 h-4 text-primary" /> Enrolled
              </h2>
              {enrolled.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  You're not in any classroom yet — use the + button above to join with a class code, or ask your instructor to invite you.
                </p>
              ) : (
                <div className={ROOM_GRID}>
                {enrolled.map((room) => (
                  <RoomCard key={room.id} room={room}>
                    {leavingId === room.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex-1">Leave this classroom?</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setLeavingId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={leaveMutation.isPending}
                          onClick={() => leaveMutation.mutate(room.id)}
                        >
                          Leave
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const liveRound = roundByRoom.get(room.id);
                          if (!liveRound) return null;
                          const inThis =
                            liveRound.joined || currentRound?.round_id === liveRound.round_id;
                          // Already in a different session → can't join this one.
                          const inOther = currentRound && currentRound.round_id !== liveRound.round_id;
                          // Named sessions say their name, so a student can
                          // tell which class activity they're joining.
                          const sessionName = liveRound.title?.trim();
                          return (
                            <Button
                              size="sm"
                              variant={inThis ? 'outline' : 'default'}
                              className="h-8 w-full text-xs"
                              disabled={inThis || inOther}
                              onClick={() => join(liveRound)}
                              title={sessionName || undefined}
                            >
                              <Radio className="w-3 h-3 mr-1 shrink-0" />
                              <span className="truncate">
                                {inThis
                                  ? sessionName ? `In "${sessionName}"` : 'In live session'
                                  : inOther
                                    ? 'In another session'
                                    : sessionName ? `Join "${sessionName}"` : 'Join live session'}
                              </span>
                            </Button>
                          );
                        })()}
                        <div className="flex items-center justify-between gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              dispatch({
                                type: 'VIEW_LEADERBOARD',
                                payload: { id: room.id, name: room.name },
                              })
                            }
                          >
                            <Trophy className="w-3 h-3 mr-1" />
                            Leaderboard
                          </Button>
                          <button
                            type="button"
                            onClick={() => setLeavingId(room.id)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          >
                            <LogOut className="w-3 h-3" />
                            Leave
                          </button>
                        </div>
                      </div>
                    )}
                  </RoomCard>
                ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
