import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sounds } from '@/lib/sounds';

/**
 * The starter-pack reward celebration.
 *
 * Extracted from LicenseEnvelope so the debug tool's "gift" can play the same
 * animation instead of granting the pack silently — a reward that shows up
 * only as two numbers changing is impossible to eyeball while testing.
 *
 * Positioning is the caller's job via `className`: inside the letter it sits
 * `absolute inset-0` over the envelope; standalone it needs to be `fixed`
 * with its own backdrop. Everything within is positioned against that box, so
 * it composes either way.
 */
// Twinkles looping behind a reward. Fixed layout constants (not random per
// render) so re-renders don't teleport the sparkles mid-loop.
const SPARKLES = [
  { left: '-12%', top: '8%',  size: 16, delay: 0.0, char: '✦' },
  { left: '88%',  top: '2%',  size: 12, delay: 0.5, char: '✧' },
  { left: '100%', top: '55%', size: 15, delay: 0.9, char: '✦' },
  { left: '-6%',  top: '70%', size: 11, delay: 1.3, char: '✧' },
  { left: '45%',  top: '-14%', size: 13, delay: 0.7, char: '✦' },
  { left: '20%',  top: '96%', size: 10, delay: 1.6, char: '✧' },
];

function RewardCard({ img, alt, label, glow, delay, floatDelay }) {
  return (
    <motion.div
      className="relative flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.3, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 15, delay }}
    >
      {/* Pulsing glow behind the item */}
      <motion.div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ width: '9rem', height: '9rem', background: glow }}
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.9, 1.1, 0.9] }}
        transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut', delay: floatDelay }}
      />
      {/* Looping sparkles */}
      {SPARKLES.map((s) => (
        <motion.span
          key={`${s.left}-${s.top}`}
          aria-hidden="true"
          className="absolute select-none"
          style={{ left: s.left, top: s.top, fontSize: s.size, color: '#fde68a', textShadow: '0 0 6px rgba(253,230,138,0.9)' }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.4], rotate: [0, 45, 90] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut', delay: floatDelay + s.delay }}
        >
          {s.char}
        </motion.span>
      ))}
      {/* The item itself, gently bobbing */}
      <motion.img
        src={img}
        alt={alt}
        draggable={false}
        className="relative h-32 w-auto select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
        animate={{ y: [0, -7, 0] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: floatDelay }}
      />
      <p className="relative mt-2 font-pixel text-sm text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
        {label}
      </p>
    </motion.div>
  );
}

export default function StarterPackReveal({ audio, onDone, className = 'absolute inset-0 z-10' }) {
  // The celebratory session-complete chime as the rewards pop in — a bigger
  // moment than a coin ping. Gated on its own SFX toggle (`?? true` for saves
  // predating the toggle).
  useEffect(() => {
    Sounds.sessionFinishDone(audio.sfxVolume, audio.masterVolume, audio.sfxSessionFinishDone ?? true);
  }, [audio.sfxVolume, audio.masterVolume, audio.sfxSessionFinishDone]);

  // Reached from the gate, this screen is the only thing not inert — so a
  // mouse-only dismiss strands a keyboard player here with nothing focusable
  // on the page. It takes focus on mount and answers the dismiss keys.
  const surfaceRef = useRef(null);
  useEffect(() => { surfaceRef.current?.focus(); }, []);

  return (
    <motion.div
      ref={surfaceRef}
      role="button"
      tabIndex={0}
      aria-label="Collect the starter pack and continue"
      className={`cursor-pointer overflow-hidden focus:outline-none ${className}`}
      onClick={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          onDone();
        }
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Headline + rewards, floating above Lulys */}
      <div className="absolute left-1/2 top-[10vh] -translate-x-1/2 flex flex-col items-center">
        <motion.h2
          className="font-pixel text-xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] mb-1"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          Starter pack received!
        </motion.h2>
        <motion.p
          className="font-pixel text-[11px] text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.45 }}
        >
          A little something from the cafe~
        </motion.p>
        <div className="flex items-end gap-12 mt-[3vh]">
          <RewardCard
            img="/assets/Potion_green.png"
            alt="Focus boost potions"
            label="×3 Focus Boosts"
            glow="radial-gradient(circle, rgba(110,231,183,0.55), transparent 70%)"
            delay={0.55}
            floatDelay={0.2}
          />
          <RewardCard
            img="/assets/coins.png"
            alt="Coins"
            label="+500 Coins"
            glow="radial-gradient(circle, rgba(251,191,36,0.55), transparent 70%)"
            delay={0.75}
            floatDelay={0.8}
          />
        </div>
      </div>

      {/* Lulys springs up from the bottom edge, arms raised */}
      <motion.img
        src="/assets/Character/lulys_jump_footer.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute bottom-[5vh] left-1/2 h-[46vh] w-auto select-none pointer-events-none"
        style={{ x: '-50%' }}
        initial={{ y: '105%' }}
        animate={{ y: ['105%', '-4%', '2%', 0] }}
        transition={{ duration: 0.85, times: [0, 0.55, 0.8, 1], ease: 'easeOut', delay: 0.15 }}
      />

      {/* Glass pill stays steady; only the text inside pulses. */}
      <motion.div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 pointer-events-none select-none whitespace-nowrap"
        style={{
          background: 'linear-gradient(135deg, rgba(125,95,222,0.40), rgba(125,95,222,0.16))',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 0 0 1px rgba(167,139,250,0.35), inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 16px rgba(0,0,0,0.35)',
        }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.4 }}
      >
        <motion.span
          className="font-pixel text-[11px] text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 1.6 }}
        >
          — press anywhere to continue —
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
