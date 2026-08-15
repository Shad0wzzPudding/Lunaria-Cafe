import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import CafeCanvas from '@/components/cafe/CafeCanvas';
import { VisitProvider } from '@/lib/gameState/VisitProvider';
import { useCafeSnapshot } from '@/lib/friends/cafeSnapshot';
import { fmtLastSeen } from '@/lib/friends/format';

/**
 * A look at a room-mate's cafe WITHOUT leaving your own session.
 *
 * This is an overlay rather than a phase change, and that is the whole point:
 * routing to the visit page unmounts CafeView, which owns the focus timers and
 * the AI camera — so peeking would end the peeker's own study session, during
 * the one activity the room exists for.
 *
 * Renders over the cafe, inside a VisitProvider, so the canvas below keeps its
 * own state untouched and nothing here can reach the visitor's save.
 */
export default function CafePeekOverlay({ friendId, name, onClose }) {
  const { data, isLoading, error } = useCafeSnapshot(friendId);

  // Escape closes it, like any modal over a game view.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${name}'s cafe`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl rounded-xl border border-white/15 bg-black/60 p-3 shadow-lg">
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-sm text-white">
              {data?.cafe_name ?? `${name}'s cafe`}
            </p>
            <p className="truncate text-[11px] text-white/60">
              {name}
              {data?.saved_at ? ` · from their latest save, ${fmtLastSeen(data.saved_at)}` : ''}
            </p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-white/60 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading && (
          <p className="py-16 text-center text-xs text-white/60">Peeking in on {name}…</p>
        )}
        {/* The RPC's messages are written for a player to read — "Their cafe is
            closed to visitors right now" — so they are shown as they come. */}
        {error && (
          <p className="py-16 text-center text-xs text-amber-300">{error.message}</p>
        )}

        {data && (
          <VisitProvider snapshot={data.snapshot}>
            <div className="flex justify-center">
              <CafeCanvas />
            </div>
          </VisitProvider>
        )}
      </div>
    </motion.div>
  );
}
