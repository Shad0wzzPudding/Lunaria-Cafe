import { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { Trophy, Crown, GripVertical, Eye } from 'lucide-react';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { useAuth } from '@/auth/useAuth';
import { useGame } from '@/lib/gameState/useGame';
import { BOOST_LABEL, BOOST_WINDOW_SECONDS } from '@/lib/gameState/constants';
import { useRoundParticipants } from '@/lib/liveRound/useRoundParticipants';
import { rankRoundByMode, formatRoundValue } from '@/lib/leaderboard/scoring';
import CafePeekOverlay from '@/components/friends/CafePeekOverlay';
import { AnimatePresence } from 'framer-motion';

const MEDAL = ['text-amber-400', 'text-slate-300', 'text-amber-700'];

function Row({ entry, isMe, onPeek }) {
  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1 ${isMe ? 'bg-primary/20' : ''}`}>
      <span className="flex w-4 shrink-0 justify-center">
        {entry.rank <= 3 ? (
          <Crown className={`h-3.5 w-3.5 ${MEDAL[entry.rank - 1]}`} />
        ) : (
          <span className="text-[10px] font-semibold text-white/60 tabular-nums">{entry.rank}</span>
        )}
      </span>
      {/* The overlay is only w-52, so names truncate early — hover reveals. */}
      <span className="min-w-0 flex-1 truncate text-[11px] text-white/90" title={entry.displayName}>
        {entry.displayName}
        {isMe && <span className="ml-1 text-[9px] text-white/60">(you)</span>}
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-white tabular-nums">
        {formatRoundValue(entry, 'overall')}
      </span>
      {/* Only for other people, and only in a study room — a classroom round
          does not make classmates into visitors. A refusal (their cafe is
          closed, or they left the room) surfaces inside the overlay rather
          than hiding the button, so the reason is readable. */}
      {!isMe && onPeek && (
        <button
          type="button"
          onClick={() => onPeek(entry)}
          title={`Look in on ${entry.displayName}'s cafe`}
          aria-label={`Look in on ${entry.displayName}'s cafe`}
          className="shrink-0 text-white/40 transition-colors hover:text-white"
        >
          <Eye className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Compact, draggable floating live-round board for the student's cafe.
 * Shows the top 3 plus the student's own rank (if outside the top 3).
 * The X hides it (participation + reporting continue); it reappears
 * when the student joins again or a new round starts.
 */
export default function RoundOverlay() {
  const { currentRound } = useLiveRound();
  const { user } = useAuth();
  const { state } = useGame();
  // Badge only while the boost is actually amplifying (inside its window).
  const boostActive =
    (state.focus.boostActive ?? false) &&
    state.focus.roundControlled &&
    state.focus.elapsed < BOOST_WINDOW_SECONDS;
  const { entries } = useRoundParticipants(currentRound?.round_id);
  // react-draggable needs a nodeRef under React 19 (findDOMNode is gone).
  const nodeRef = useRef(null);
  const [peek, setPeek] = useState(null);

  // This component hides by returning null rather than unmounting, so `peek`
  // outlives the round it was opened from. Without this, a peek left open when
  // a room ended would reappear over a completely unrelated later round —
  // still showing whoever was clicked in the old one.
  const roundId = currentRound?.round_id ?? null;
  const [peekRoundId, setPeekRoundId] = useState(roundId);
  if (peekRoundId !== roundId) {
    setPeekRoundId(roundId);
    if (peek) setPeek(null);
  }

  if (!currentRound) return null;

  // Peeking is a study-room affordance: it rests on shares_active_study_room(),
  // which is deliberately study-only.
  const canPeek = currentRound.owner_kind === 'study';
  const ranked = rankRoundByMode(entries, 'overall');
  const me = ranked.find((e) => e.studentId === user?.id);
  const top = ranked.slice(0, 3);
  const showMeSeparately = me && me.rank > 3;

  return (
    <>
    <AnimatePresence>
      {peek && (
        <CafePeekOverlay
          friendId={peek.studentId}
          name={peek.displayName}
          onClose={() => setPeek(null)}
        />
      )}
    </AnimatePresence>
    <Draggable nodeRef={nodeRef} handle=".ro-drag" bounds="body">
      <div
        ref={nodeRef}
        className="fixed left-3 top-16 z-30 w-52 rounded-xl border border-white/15 bg-black/55 p-2.5 backdrop-blur-md shadow-lg"
      >
        <div className="ro-drag mb-1.5 flex cursor-move items-center gap-1.5" title="Drag to move">
          <GripVertical className="h-3.5 w-3.5 text-white/30" />
          <Trophy className="h-3.5 w-3.5 text-amber-300" />
          {/* The session name is the more specific label when there is one;
              the classroom stays reachable on hover, since the board is only
              w-52 and two lines of header would crowd the ranking out. */}
          <span
            className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white"
            title={
              currentRound.title?.trim()
                ? `${currentRound.title.trim()} — ${currentRound.scope_name}`
                : currentRound.scope_name
            }
          >
            {currentRound.title?.trim() || currentRound.scope_name}
          </span>
        </div>

        {/* Boost counts on this board (instructor can disable it per session). */}
        {boostActive && (
          <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1">
            <img src="/assets/Potion_green.png" alt="" className="h-4 w-auto select-none" draggable={false} />
            <span className="text-[9px] leading-snug text-emerald-200">
              Focus boost active — {BOOST_LABEL}
            </span>
          </div>
        )}

        {ranked.length === 0 ? (
          <p className="px-2 py-2 text-[10px] text-white/60">Waiting for players…</p>
        ) : (
          <div className="space-y-0.5">
            {top.map((entry) => (
              <Row
                key={entry.studentId}
                entry={entry}
                isMe={entry.studentId === user?.id}
                onPeek={canPeek ? setPeek : undefined}
              />
            ))}
            {showMeSeparately && (
              <>
                <div className="my-1 border-t border-white/10" />
                <Row entry={me} isMe />
              </>
            )}
          </div>
        )}

      </div>
    </Draggable>
    </>
  );
}
