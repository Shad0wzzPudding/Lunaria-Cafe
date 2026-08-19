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


function RoomCard({ room, children, surface }) {
  return (
    <div className={`${surface} backdrop-blur-sm rounded-xl border p-4 space-y-3`}>
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

  // Bare status text needs its own backing. Everything else on this page is a
  // card; these paragraphs sit straight on the backdrop, and the glass only
  // blurs the cafe rather than covering it, so light muted text on top of it
  // is barely there. The empty state in particular is what EVERY new student
  // sees before they have joined anything.
  const ON_BACKDROP_TEXT = 'rounded-lg bg-card/70 px-3 py-2 backdrop-blur-sm';

  // Both themes now. A 40%-transparent card stands on cafe art and stops
  // reading as a panel, so it has to be solid enough to be one.
  //
  // Immersive used to be exempt, and the exemption was real at the time: a
  // tinted wash sat between the art and the cards and did half their work.
  // Removing that wash for the glass pane removed the reason, and left the
  // invitation subtitle — muted foreground, the lowest-contrast text here —
  // sitting almost directly on the cafe. Card weight and backdrop treatment
  // were never independent; the wash was just hiding that they were not.
  //
  // The worry about heavier cards flattening a palette the player chose does
  // not really apply: bg-card IS their colour, and this only asks for more of
  // it. What would flatten the palette is a card so thin that the cafe behind
  // shows through it, which is what /60 had become.
  const CARD_SURFACE = 'bg-card/85 border-border/40';
  // Invitations take the background but keep their own primary border, which
  // is what marks them out from an enrolled room.
  const CARD_BG = 'bg-card/85';

  // The one thing still worth branching on, and for a palette reason rather
  // than a contrast one. Focus derives everything from #6b46b2, so the heading
  // icons were already "purple" — just quietly so, a thin glyph against a card
  // the same family of colour. The chip is what makes it read as purple rather
  // than merely be it. Immersive is left alone: its palette is the player's
  // own, and stamping a primary-coloured badge into it would fight whatever
  // they picked. Defined once so the two headings cannot drift apart.
  const HEADING_ICON_CHIP = isFocusTheme
    ? 'inline-flex items-center justify-center rounded-md bg-primary/25 p-1 ring-1 ring-primary/40'
    : 'inline-flex items-center justify-center';

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
          still read, because they carry their own card background and blur.
          Tokens rather than black, so it follows the active theme instead of
          forcing a dark page under a light one. */}
      <div className="fixed inset-0 z-0" aria-hidden="true">
        {/* A single pixel of blur: enough to take the edge off, not enough to
            stop it being the cafe. This is PIXEL art, so it softens far faster
            than a photograph would — 2px already smears the jar labels and the
            menu board, which is why this is 1 and not "a small blur".
            scale-105 hides the transparent fringe a blur leaves at the edges
            of the element. */}
        <img
          src="/assets/Backdrop/cafe_interior.webp"
          alt=""
          className="w-full h-full object-cover object-center select-none blur-[1px] scale-105"
          draggable={false}
        />
        {/* Focus puts GLASS over the art; Immersive keeps its tinted wash.

            It had one for a while and went a long way round: token-based
            washes (90/70/95, 70/40/80, 60/30/70) read as muddy rather than
            dark, because --background is a near-black PURPLE and tinted
            whatever it covered; white lifted the room but hazed it; flat white
            was clean but drained it; flat black dimmed it honestly. All of
            them were doing the same job — protecting content that could not
            protect itself.

            That job is now done by the content. The cards carry bg-card/85,
            the section headings carry their own pill, and the status
            paragraphs carry one too. With nothing left needing cover, a scrim
            is just a filter over the artwork, so it is gone.

            Immersive keeps its gradient. There --background is a LIGHT warm
            tone, so the same idea gives a sepia wash rather than a shadow, and
            it reads as part of that theme rather than as protection. */}
        {/* One glass pane, both themes.

            backdrop-blur is what makes it glass rather than paint: it blurs
            the CAFE instead of covering it, so the room stays underneath and
            the content in front gains a surface to sit on. That is a physical
            effect, not a palette one, which is why it works for both themes
            where the old tinted washes could not — Focus's --background is a
            near-black purple and Immersive's is a light warm tone, so the same
            overlay darkened one and washed the other.

            THIN on purpose — 3px, not the 8 or 12 that read as "proper"
            frosted glass. The effect works by destroying what is behind it, so
            the more convincing the glass, the less of the cafe survives; 8px
            left colour and light, 12px left shapes. At 3 the cup, the book,
            the bell and the Welcome sign all still read.

            The white is a GRADIENT, brighter at the top, not a flat fill. Real
            glass catches more light along one edge, and a single opacity read
            as a sheet of fog — the same complaint the flat white scrim earned
            before it. */}
        <div className="absolute inset-0 backdrop-blur-[3px] bg-gradient-to-b from-white/28 via-white/10 to-white/18" />
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
                      <RoomCard key={room.id} room={room} surface={CARD_SURFACE}>
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
          <p className={`mx-auto w-fit text-sm text-muted-foreground ${ON_BACKDROP_TEXT}`}>
            Loading classrooms…
          </p>
        )}
        {error && (
          <p className={`mx-auto w-fit text-sm text-amber-400 ${ON_BACKDROP_TEXT}`}>
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
                  <span className={HEADING_ICON_CHIP}>
                    <MailOpen className="w-4 h-4 text-primary" />
                  </span>
                  Invitations
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
                      className={`rounded-xl border border-primary/50 ${CARD_BG} bg-gradient-to-br from-primary/15 to-transparent backdrop-blur-sm ring-1 ring-primary/25 shadow-lg shadow-primary/10 p-4 space-y-3`}
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
                <span className={HEADING_ICON_CHIP}>
                  <GraduationCap className="w-4 h-4 text-primary" />
                </span>
                Enrolled
              </h2>
              {enrolled.length === 0 ? (
                <p className={`w-fit text-xs text-muted-foreground ${ON_BACKDROP_TEXT}`}>
                  You're not in any classroom yet — use the + button above to join with a class code, or ask your instructor to invite you.
                </p>
              ) : (
                <div className={ROOM_GRID}>
                {enrolled.map((room) => (
                  <RoomCard key={room.id} room={room} surface={CARD_SURFACE}>
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
