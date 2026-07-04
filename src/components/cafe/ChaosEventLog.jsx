import { useState, useEffect } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { AnimatePresence, motion } from 'framer-motion';

export default function ChaosEventLog() {
  const { state } = useGame();
  const events = state.attention.chaosEvents;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const visible = events.filter(e => now - e.timestamp < 10000).slice(-4);

  if (!visible.length) return null;

  return (
    <motion.div className="absolute top-20 right-3 z-20 w-64 space-y-2 pointer-events-none">
      <AnimatePresence>
        {visible.map((event, i) => (
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
