import { useRef } from 'react';
import Draggable from 'react-draggable';
import { Trophy, Crown, GripVertical } from 'lucide-react';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { useAuth } from '@/auth/useAuth';
import { useGame } from '@/lib/gameState/useGame';
import { useRoundParticipants } from '@/lib/liveRound/useRoundParticipants';
import { rankByMode, formatRoundValue } from '@/lib/leaderboard/scoring';

const MEDAL = ['text-amber-400', 'text-slate-300', 'text-amber-700'];

function Row({ entry, isMe }) {
  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1 ${isMe ? 'bg-primary/20' : ''}`}>
      <span className="flex w-4 shrink-0 justify-center">
        {entry.rank <= 3 ? (
          <Crown className={`h-3.5 w-3.5 ${MEDAL[entry.rank - 1]}`} />
        ) : (
          <span className="text-[10px] font-semibold text-white/60 tabular-nums">{entry.rank}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-white/90">
        {entry.displayName}
        {isMe && <span className="ml-1 text-[9px] text-white/60">(you)</span>}
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-white tabular-nums">
        {formatRoundValue(entry, 'overall')}
      </span>
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
  const boostActive = (state.focus.boostActive ?? false) && state.focus.roundControlled;
  const { entries } = useRoundParticipants(currentRound?.round_id);
  // react-draggable needs a nodeRef under React 19 (findDOMNode is gone).
  const nodeRef = useRef(null);

  if (!currentRound) return null;

  const ranked = rankByMode(entries, 'overall');
  const me = ranked.find((e) => e.studentId === user?.id);
  const top = ranked.slice(0, 3);
  const showMeSeparately = me && me.rank > 3;

  return (
    <Draggable nodeRef={nodeRef} handle=".ro-drag" bounds="body">
      <div
        ref={nodeRef}
        className="fixed left-3 top-16 z-30 w-52 rounded-xl border border-white/15 bg-black/55 p-2.5 backdrop-blur-md shadow-lg"
      >
        <div className="ro-drag mb-1.5 flex cursor-move items-center gap-1.5" title="Drag to move">
          <GripVertical className="h-3.5 w-3.5 text-white/30" />
          <Trophy className="h-3.5 w-3.5 text-amber-300" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">
            {currentRound.classroom_name}
          </span>
        </div>

        {/* The board shows RAW scores; the boost only pampers the cafe. */}
        {boostActive && (
          <div className="mb-1.5 flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1">
            <img src="/assets/Potion_green.png" alt="" className="h-4 w-auto select-none" draggable={false} />
            <span className="text-[9px] leading-snug text-emerald-200">
              Focus boost ×1.15 — cafe only, board shows real focus
            </span>
          </div>
        )}

        {ranked.length === 0 ? (
          <p className="px-2 py-2 text-[10px] text-white/60">Waiting for players…</p>
        ) : (
          <div className="space-y-0.5">
            {top.map((entry) => (
              <Row key={entry.studentId} entry={entry} isMe={entry.studentId === user?.id} />
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
  );
}
