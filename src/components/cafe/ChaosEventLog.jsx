import { useGame } from '@/lib/gameState.jsx';
import { AnimatePresence, motion } from 'framer-motion';

export default function ChaosEventLog() {
  const { state } = useGame();
  const events = state.attention.chaosEvents;

  if (!events.length) return null;

  return (
    <motion.div className="absolute top-3 right-3 z-20 w-64 space-y-2 pointer-events-none">
      <AnimatePresence>
        {events.slice(-4).map((event, i) => (
          <motion.div
            key={`${event.timestamp}-${i}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg bg-card/90 border border-border/40 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-sm"
          >
            {event.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
