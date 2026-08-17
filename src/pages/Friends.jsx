import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
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
import {
  ArrowLeft, UserPlus, Users, Copy, Check, MailOpen, Send, UserMinus, Hash, Coffee,
} from 'lucide-react';
import { PANEL_BRIGHT_BG } from '@/lib/theme/themeDeriver';
import { ROOM_GRID } from '@/lib/ui/cardGrid';
import { fmtLastSeen } from '@/lib/friends/format';
import { formatAccountCode, normalizeAccountCode } from '@/lib/account/accountCode';
import { FRIEND_NOTICES_KEY } from '@/lib/friends/notices';
import SentLetterFlight from '@/components/friends/SentLetterFlight';
import ArrivedFriendLetter from '@/components/friends/ArrivedFriendLetter';
import StudyRoomPanel from '@/components/friends/StudyRoomPanel';
import { AnimatePresence, motion } from 'framer-motion';
import { PIXEL_CORNERS } from '@/components/letter/pixelBox';
import { Sounds } from '@/lib/sounds';

// The online flag is derived from a 30s heartbeat, so a page left open goes
// stale within a minute. Refetching on this cadence keeps the dots honest
// without a realtime channel for what is a decorative detail.
const PRESENCE_REFETCH_MS = 45_000;

async function fetchFriends() {
  const { data, error } = await supabase.rpc('my_friends');
  if (error) throw error;
  return data ?? [];
}

async function fetchRequests() {
  const { data, error } = await supabase.rpc('my_friend_requests');
  if (error) throw error;
  return data ?? [];
}

/** Your own code, with a copy button that only confirms on a real success. */
function MyAccountCode({ code }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    // navigator.clipboard is undefined on insecure origins — which includes
    // this app served over plain http on a classroom LAN. Optional chaining
    // would resolve quietly and still flash the tick, claiming a copy that
    // never happened. (Same reasoning as the instructor's class-code button.)
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(code);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-semibold tracking-[0.2em] text-foreground select-all">
          {formatAccountCode(code)}
        </span>
        <button
          type="button"
          onClick={copy}
          title="Copy your account code"
          aria-label="Copy your account code"
          className="text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {failed && (
        <p className="text-[10px] text-amber-500">
          Couldn't copy automatically — select the code above by hand.
          (Copying needs a secure connection; this page is served over plain http.)
        </p>
      )}
    </div>
  );
}

function PresenceDot({ online }) {
  return (
    <span
      aria-hidden
      className={`h-2 w-2 shrink-0 rounded-full ${
        online ? 'bg-emerald-400 shadow-[0_0_6px_1px] shadow-emerald-400/60' : 'bg-muted-foreground/30'
      }`}
    />
  );
}

function FriendCard({ friend, onRemove, removePending, onVisit }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PresenceDot online={friend.is_online} />
            {/* Long names truncate to keep the card tidy, so hover reveals the rest. */}
            <p className="font-display text-sm text-foreground truncate" title={friend.display_name}>
              {friend.display_name}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {friend.is_online ? 'in the cafe now' : `last seen ${fmtLastSeen(friend.last_active)}`}
          </p>
        </div>
      </div>

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-muted-foreground">Remove this friend?</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            disabled={removePending}
            onClick={() => onRemove(friend.friendship_id)}
          >
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {/* cafe_open already folds in "and they have a save", so the button
              only appears when there is actually a room to walk into. */}
          {friend.cafe_open ? (
            <Button size="sm" className="h-7 text-xs" onClick={() => onVisit(friend)}>
              <Coffee className="mr-1 h-3 w-3" />
              Visit cafe
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground/50">Cafe closed</span>
          )}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            <UserMinus className="h-3 w-3" />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

export default function Friends() {
  const { state, dispatch } = useGame();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [addError, setAddError] = useState('');
  // Who the flying envelope is addressed to; null when nothing is in flight.
  const [sentTo, setSentTo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  // Lulyssia is on stage until the player waves her off. Per visit, not
  // persisted: she is a greeter, so she should greet again next time.
  const [lulysHere, setLulysHere] = useState(true);

  // Her voice line, timed to the entrance.
  //
  // Gated on the same lg breakpoint that decides whether she is rendered at
  // all: `hidden lg:block` keeps her in the DOM on a narrow window, so without
  // this check a phone would hear her greet from behind a display:none — a
  // voice with nobody on stage.
  //
  // Runs once on mount, deliberately not when lulysHere flips: sending her
  // away should be quiet, and re-greeting on the way out would be the opposite
  // of the point.
  useEffect(() => {
    if (!window.matchMedia?.('(min-width: 1024px)').matches) return;
    const a = state.audio ?? {};
    Sounds.lulysPresenting(a.sfxVolume, a.masterVolume, a.sfxSlideIn ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: friends, isLoading, error } = useQuery({
    queryKey: ['friends'],
    queryFn: fetchFriends,
    refetchInterval: PRESENCE_REFETCH_MS,
  });

  const { data: requests, error: requestsError } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: fetchRequests,
  });

  const incoming = (requests ?? []).filter((r) => r.direction === 'incoming');
  const outgoing = (requests ?? []).filter((r) => r.direction === 'outgoing');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    queryClient.invalidateQueries({ queryKey: FRIEND_NOTICES_KEY });
  };

  // Accepted replies the player hasn't been shown. Fetched once per VISIT:
  // a letter dropping in mid-visit would interrupt whatever they came to do,
  // but every fresh entry to the page has to ask the server again.
  //
  // gcTime 0 is what makes that true. This page unmounts whenever the player
  // goes back to the menu, and react-query keeps a cached answer for gcTime
  // (5 min by default) after the last observer leaves — so a return visit
  // inside that window was being handed the PREVIOUS visit's empty list and
  // never refetching. A reply that arrived in between produced no letter until
  // the cache aged out, which is what made it look intermittent.
  const { data: unseenResults } = useQuery({
    queryKey: ['friend-results-unseen'],
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('my_unseen_friend_results');
      if (err) throw err;
      return data ?? [];
    },
  });

  // Derived, not copied into state: a local mirror would need an effect to
  // stay in step with the query, and setState-in-effect cascades a render.
  // `dismissed` takes the letter down the instant it's closed, without waiting
  // for the round-trip that marks it seen.
  const letter = dismissed ? null : unseenResults;

  const dismissLetter = async () => {
    setDismissed(true);
    // Only the batch that was actually on screen. Stamping every unseen result
    // would silently consume any acceptance that landed while the letter was
    // open — its letter and its bubble count both lost, with nothing to show
    // a notification had gone missing.
    const { error: err } = await supabase.rpc('mark_friend_results_seen', {
      _ids: (letter ?? []).map((r) => r.friendship_id),
    });
    // A failure here is invisible by nature: the letter simply arrives again
    // next visit, looking like the intermittency bug rather than a server
    // error. Say so in the console at least — it is the difference between
    // "this is broken" and "this one call failed".
    if (err) {
      console.error('[friends] could not mark results seen:', err);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['friend-results-unseen'] });
    queryClient.invalidateQueries({ queryKey: FRIEND_NOTICES_KEY });
  };

  // Seeing the page is what stops the menu nagging about incoming requests.
  // The cards themselves stay until they're actually answered.
  // The ids currently rendered, as a stable string so the effect fires when the
  // SET of visible requests changes rather than on every refetch of the same
  // ones. Only these get stamped: a request arriving after this fetch has not
  // been shown to anybody yet, and must still be able to raise the bubble.
  const incomingIdsKey = incoming.map((r) => r.request_id).sort().join(',');
  useEffect(() => {
    if (!incomingIdsKey) return;
    let cancelled = false;
    supabase.rpc('mark_friend_requests_seen', {
      _ids: incomingIdsKey.split(','),
    }).then(({ error: err }) => {
      if (cancelled) return;
      // Same reasoning as dismissLetter: a silent failure here just leaves the
      // menu bubble nagging forever with no clue why.
      if (err) {
        console.error('[friends] could not mark requests seen:', err);
        return;
      }
      queryClient.invalidateQueries({ queryKey: FRIEND_NOTICES_KEY });
    });
    return () => { cancelled = true; };
  }, [incomingIdsKey, queryClient]);

  const addMutation = useMutation({
    mutationFn: async (code) => {
      const { data, error: err } = await supabase.rpc('send_friend_request', { _code: code });
      if (err) throw err;
      // The RPC returns a one-row table, so unwrap it for the message.
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (result) => {
      setCodeInput('');
      setAddError('');
      setAddOpen(false);
      // Sending to someone who had already asked YOU completes the friendship
      // outright, so the confirmation has to say which of the two happened —
      // and an "on its way" envelope would be a lie for that case, since
      // nothing is in flight and there is no reply to wait for.
      if (result?.status === 'accepted') {
        toast.success(`You and ${result.display_name} are now friends!`);
      } else {
        setSentTo(result?.display_name ?? 'them');
      }
      refresh();
    },
    onError: (err) => setAddError(err.message || 'Could not send the request.'),
  });

  const respondMutation = useMutation({
    mutationFn: async ({ requestId, accept }) => {
      const { error: err } = await supabase.rpc('respond_to_friend_request', {
        _request_id: requestId,
        _accept: accept,
      });
      if (err) throw err;
    },
    onSuccess: refresh,
    onError: (err) => toast.error(err.message || 'Could not answer that request.'),
  });

  // Unfriending, withdrawing a request you sent, and clearing one you declined
  // are all this same row delete — the RLS policy lets either party do it.
  const removeMutation = useMutation({
    mutationFn: async (rowId) => {
      const { error: err } = await supabase.from('friendships').delete().eq('id', rowId);
      if (err) throw err;
    },
    onSuccess: refresh,
    onError: (err) => toast.error(err.message || 'Could not remove that.'),
  });

  // The filter box only appears once the list is long enough to need it. That
  // gate has to drive the FILTERING too, not just the rendering: `search`
  // outlives the unmounted input, so a student who filters 7 friends down and
  // then removes one would otherwise be left with a permanently filtered list
  // and no box to clear it with.
  const showSearch = (friends?.length ?? 0) > 6;

  const visibleFriends = useMemo(() => {
    const list = friends ?? [];
    const q = showSearch ? search.trim().toLowerCase() : '';
    if (!q) return list;
    return list.filter((f) => (f.display_name ?? '').toLowerCase().includes(q));
  }, [friends, search, showSearch]);

  const onlineCount = (friends ?? []).filter((f) => f.is_online).length;

  return (
    <div className="relative min-h-screen bg-background">
      {/* Lulys slides in from the right to present the page, and stays on TOP
          of it (z-20 over the content's z-10) rather than behind.
          That makes her a real obstacle rather than a backdrop, so she has to
          come with a way out: clicking her slides her back off to the right.
          Which in turn makes her a CONTROL, not decoration — hence a real
          <button> with a label, reachable by keyboard, instead of the
          aria-hidden image this was when it sat harmlessly behind everything.
          FIXED, so she stays put while the list scrolls instead of sliding
          away from the hand she is presenting with.
          Hidden below lg: on a narrow window she has no room of her own and
          would land squarely on the list. */}
      <AnimatePresence>
        {lulysHere && (
      <motion.div
        className="pointer-events-none fixed bottom-0 right-0 z-20 hidden select-none lg:block"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: '0%', opacity: 1 }}
        exit={{ x: '100%', opacity: 0, transition: { duration: 0.45, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 55, damping: 14, delay: 0.1 }}
      >
        <button
          type="button"
          onClick={() => setLulysHere(false)}
          // pointer-events-auto only HERE: the wrapper stays transparent to
          // clicks so the bubble above her never eats one meant for a card.
          className="pointer-events-auto block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          aria-label="Lulyssia is presenting your friends. Click to send her away."
        >
          <img
            src="/assets/Character/lulys_presenting.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-[50vh] w-auto"
          />
        </button>

        {/* Her line, in the same pixel bubble the welcome letter and the
            friends plaque use — same gesture, so it reads as the game
            speaking rather than a second design.
            Positioned against HER, not the screen: it rides the same slide-in
            and keeps its aim if her size changes. It fades in after she has
            arrived, so she is not talking before she is on stage.
            Not aria-hidden, unlike the art: it is the one part of this with
            something to say, and it costs a screen reader nothing to hear it. */}
        <motion.div
          // Above her head and inside her own column, not beside her. Both
          // matter: the page's cards sit at z-10 and she is at z-0, so a
          // bubble reaching left into the grid would be COVERED by the next
          // row of friends — the one element here with something to say is
          // the one that must never be behind anything. Percentages of her
          // box rather than fixed offsets, so it keeps its aim at any height.
          className="absolute right-[13%] top-[-8%] whitespace-nowrap"
          style={{ clipPath: PIXEL_CORNERS('6px') }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.75 }}
        >
          {/* Purple-white rather than the letter's brown-and-cream: this is
              LULYSSIA speaking, not the cafe's stationery, and she wears the
              app's purple. Same pixel box, different voice. */}
          <span
            className="block"
            style={{ clipPath: PIXEL_CORNERS('6px'), background: '#6b46b2', padding: '3px' }}
          >
            <span
              className="block px-3 py-1.5 text-center font-pixel"
              style={{ clipPath: PIXEL_CORNERS('6px'), background: '#f3ecff', color: '#4a2d7f' }}
            >
              <span className="block text-[11px]">{'Here is your list of friends<3'}</span>
              {/* The clue. Without it, an obstacle you can dismiss is just an
                  obstacle — nobody clicks a character to make her leave unless
                  told. Dimmer and smaller so it reads as an aside rather than
                  a second announcement. */}
              <span className="mt-1 block text-[9px] opacity-70">
                (click me and I&apos;ll step aside)
              </span>
            </span>
          </span>

          {/* Tail centred on the bubble's underside, pointing straight down
              at her hat. */}
          <span
            aria-hidden
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px h-0 w-0"
            style={{
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '8px solid #6b46b2',
            }}
          />
        </motion.div>
      </motion.div>
        )}
      </AnimatePresence>

      <header
        className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-border/30"
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
        <h1 className="font-display text-lg text-foreground">Friends</h1>

        <div className="flex-1" />
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            // Reset on close, or reopening shows a stale error from last time.
            if (!open) {
              setAddError('');
              setCodeInput('');
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="Add a friend"
              aria-label="Add a friend"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <UserPlus className="w-5 h-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-xl text-foreground">Add a friend</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Swap account codes with a classmate. They'll get a request to accept
                before either of you appears on the other's list.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-6">
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 font-display text-sm text-foreground">
                  <Hash className="h-4 w-4 text-primary" /> Your account code
                </h3>
                {profile?.account_code ? (
                  <MyAccountCode code={profile.account_code} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Your code isn't loaded yet — reload the page once you're back online.
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 font-display text-sm text-foreground">
                  <UserPlus className="h-4 w-4 text-primary" /> Add by account code
                </h3>
                <form
                  className="flex flex-wrap items-start gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAddError('');
                    addMutation.mutate(normalizeAccountCode(codeInput));
                  }}
                >
                  <input
                    type="text"
                    placeholder="Account code"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    // 8 characters plus room for the dash people copy along with it.
                    maxLength={12}
                    className="w-44 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm uppercase tracking-widest"
                    required
                  />
                  <Button type="submit" size="sm" className="h-8 text-xs" disabled={addMutation.isPending}>
                    {addMutation.isPending ? 'Sending…' : 'Send request'}
                  </Button>
                </form>
                {addError && <p className="text-xs text-amber-400">{addError}</p>}
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="relative z-10 max-w-5xl p-6 space-y-8">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-10">Loading friends…</p>}
        {error && (
          <p className="text-sm text-amber-400 text-center py-10">
            Could not load your friends: {error.message}
          </p>
        )}

        {!isLoading && !error && (
          <>
            {/* A failed request fetch would otherwise be indistinguishable from
                "nobody has added you" — the sections below simply don't render.
                Someone waiting on an answer deserves better than silence. */}
            {requestsError && (
              <p className="text-xs text-amber-400">
                Could not check for friend requests: {requestsError.message}
              </p>
            )}

            {/* Above the lists: a room is the thing you act on now, where the
                lists are people you already know about. */}
            <StudyRoomPanel />

            {/* Requests next — the only other thing waiting on the player. */}
            {incoming.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-base text-foreground flex items-center gap-2">
                  <MailOpen className="w-4 h-4 text-primary" /> Friend requests
                </h2>
                <div className={ROOM_GRID}>
                  {incoming.map((req) => (
                    <div
                      key={req.request_id}
                      className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3"
                    >
                      <p className="font-display text-sm text-foreground truncate" title={req.display_name}>
                        {req.display_name}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 flex-1 text-xs"
                          disabled={respondMutation.isPending}
                          onClick={() => respondMutation.mutate({ requestId: req.request_id, accept: true })}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={respondMutation.isPending}
                          onClick={() => respondMutation.mutate({ requestId: req.request_id, accept: false })}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {outgoing.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-base text-foreground flex items-center gap-2">
                  <Send className="w-4 h-4 text-muted-foreground" /> Sent
                </h2>
                <div className={ROOM_GRID}>
                  {outgoing.map((req) => (
                    <div
                      key={req.request_id}
                      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-sm text-foreground truncate" title={req.display_name}>
                          {req.display_name}
                        </p>
                        <p className="text-xs text-muted-foreground">waiting for them to accept</p>
                      </div>
                      <button
                        type="button"
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(req.request_id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:opacity-50"
                      >
                        <UserMinus className="h-3 w-3" />
                        Withdraw
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-base text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Your friends
                  {(friends?.length ?? 0) > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {friends.length} · {onlineCount} online
                    </span>
                  )}
                </h2>
                {showSearch && (
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search friends…"
                    className="w-56"
                  />
                )}
              </div>

              {(friends?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No friends yet — use the + button above to share your account code
                  with a classmate, or add theirs.
                </p>
              ) : visibleFriends.length === 0 ? (
                <p className="text-xs text-muted-foreground">No friends match "{search}".</p>
              ) : (
                <div className={ROOM_GRID}>
                  {visibleFriends.map((friend) => (
                    <FriendCard
                      key={friend.friendship_id}
                      friend={friend}
                      onRemove={removeMutation.mutate}
                      removePending={removeMutation.isPending}
                      onVisit={(f) =>
                        dispatch({
                          type: 'VISIT_CAFE',
                          payload: { id: f.friend_id, name: f.display_name },
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Both letters live outside the scrolling column so neither is affected by the page's
          scroll position — they are fixed to the viewport, not to the list. */}
      <AnimatePresence>
        {sentTo && (
          <SentLetterFlight key="sent" toName={sentTo} onDone={() => setSentTo(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {letter?.length > 0 && (
          <ArrivedFriendLetter key="arrived" results={letter} onDismiss={dismissLetter} />
        )}
      </AnimatePresence>
    </div>
  );
}
