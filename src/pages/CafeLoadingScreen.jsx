import { useEffect, useState } from 'react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { motion, AnimatePresence } from 'framer-motion';

const LOADING_MESSAGES = [
  'Brewing the perfect cup...',
  'Waking up the staff...',
  'Arranging the furniture...',
  'Lighting the candles...',
  'Opening the cafe doors...',
];

export default function CafeLoadingScreen() {
  const { state, dispatch } = useGame();
  const [msgIndex, setMsgIndex] = useState(0);

  // Cycle through loading messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // Auto-transition to management after 2.5s
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_PHASE', payload: 'management' });
    }, 2500);
    return () => clearTimeout(timer);
  }, [dispatch]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background dark relative overflow-hidden">

      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/3 w-64 h-64 rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      <motion.div
        className="flex flex-col items-center gap-6 z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* Cafe name */}
        <div className="text-center">
          <h1 className="font-display text-3xl text-foreground mb-1">
            {state.cafe?.name ?? 'Lunaria Cafe'}
          </h1>
          <p className="font-pixel text-xs text-muted-foreground">✨ A magical place to focus ✨</p>
        </div>

        {/* Animated coffee cup */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <motion.div
            className="text-6xl select-none"
            animate={{ rotate: [0, -8, 8, -4, 4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            ☕
          </motion.div>

          {/* Steam puffs */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute text-sm select-none"
              style={{ left: `${28 + i * 14}%`, top: '-10%' }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.7, 0], y: -24 }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                delay: i * 0.4,
                ease: 'easeOut',
              }}
            >
              ~
            </motion.div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-48 h-1.5 rounded-full bg-border/40 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 2.3, ease: 'easeInOut' }}
          />
        </div>

        {/* Cycling loading message */}
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIndex}
            className="font-pixel text-xs text-muted-foreground"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
          >
            {LOADING_MESSAGES[msgIndex]}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
