import { useEffect, useState, useMemo } from 'react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import { getThemeMode, getThemeHex, getGlassGradient, brightenHex } from '@/lib/theme/themeDeriver';

const LOADING_MESSAGES = [
  'Brewing the perfect cup...',
  'Waking up the staff...',
  'Arranging the furniture...',
  'Lighting the candles...',
  'Opening the cafe doors...',
];

const SPARKLE_COUNT = 28;

function SparkleParticle({ x, y, delay, size, rotation, colors }) {
  return (
    <motion.div
      className="absolute pointer-events-none select-none font-bold"
      style={{ left: `${x}%`, top: `${y}%`, fontSize: size, color: 'transparent' }}
      initial={{ opacity: 0, scale: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale:   [0, 1.4, 1, 0],
        rotate:  [0, rotation],
        color: colors,
      }}
      transition={{ duration: 0.75, delay, ease: 'easeOut' }}
    >
      ✦
    </motion.div>
  );
}

export default function CafeLoadingScreen() {
  const { state, dispatch } = useGame();
  const [msgIndex, setMsgIndex]   = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const isImmersive = getThemeMode() === 'custom';
  const timeOfDay   = state.cafe?.timeOfDay ?? 'day';
  const primaryHex  = getThemeHex(timeOfDay) ?? (timeOfDay === 'day' ? '#e2ae60' : '#7d5fde');
  // Immersive: stars and progress take a brightened main-theme color
  // (the pale/white sparkle tints stay); Focus keeps the violet set.
  const sparkleColors = isImmersive
    ? [brightenHex(primaryHex, 0.28), brightenHex(primaryHex, 0.18), '#ddd6fe', '#ede9fe']
    : ['#c4b5fd', '#a78bfa', '#ddd6fe', '#ede9fe'];
  const progressBg = isImmersive
    ? `linear-gradient(90deg, ${brightenHex(primaryHex, 0.12)}, ${brightenHex(primaryHex, 0.28)})`
    : 'linear-gradient(90deg, #7c3aed, #a78bfa)';

  const sparkles = useMemo(() =>
    Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
      id: i,
      x:        Math.random() * 100,
      y:        Math.random() * 100,
      delay:    Math.random() * 0.4,
      size:     `${10 + Math.random() * 18}px`,
      rotation: (Math.random() - 0.5) * 180,
    })), []);

  // Cycle loading messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  // Trigger exit animation 800ms before transitioning
  useEffect(() => {
    const exitTimer = setTimeout(() => setIsExiting(true), 1700);
    const phaseTimer = setTimeout(() => {
      dispatch({ type: 'SET_PHASE', payload: 'management' });
    }, 2500);
    return () => { clearTimeout(exitTimer); clearTimeout(phaseTimer); };
  }, [dispatch]);

  return (
    <motion.div
      className="min-h-screen flex flex-col items-center justify-center bg-background dark relative overflow-hidden"
      style={
        getThemeMode() === 'custom'
          ? { background: getGlassGradient(state.cafe?.timeOfDay ?? 'day') }
          : undefined
      }
      animate={isExiting ? { opacity: 0 } : { opacity: 1 }}
      transition={isExiting ? { duration: 0.6, delay: 0.3, ease: 'easeIn' } : {}}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/3 w-64 h-64 rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      {/* Violet shimmer bloom on exit */}
      <AnimatePresence>
        {isExiting && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-20"
            style={{ background: 'radial-gradient(ellipse at center, #7c3aed22 0%, #a78bfa11 50%, transparent 80%)' }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0.6], scale: [0.6, 1.4, 2] }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Sparkle particles on exit */}
      <AnimatePresence>
        {isExiting && sparkles.map((s) => (
          <SparkleParticle key={s.id} {...s} colors={sparkleColors} />
        ))}
      </AnimatePresence>

      {/* Main content */}
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
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }}
            >
              ~
            </motion.div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-48 h-1.5 rounded-full bg-border/40 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: progressBg }}
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
    </motion.div>
  );
}
