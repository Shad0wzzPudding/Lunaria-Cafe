import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import EnvelopeFace from '@/components/letter/EnvelopeFace';

/**
 * The request leaving: an envelope rises into view, hangs for a beat, then
 * sails off the top of the screen.
 *
 * Purely a flourish — the request is already committed by the time this mounts,
 * so nothing waits on it and nothing breaks if the player navigates away
 * mid-flight. `pointer-events-none` is load-bearing for that: the whole thing
 * covers the screen, and the Friends page underneath has to stay clickable.
 */
const FLIGHT_MS = 2200;

export default function SentLetterFlight({ toName, onDone }) {
  // Held in a ref so the timer is armed ONCE, on mount. Depending on `onDone`
  // directly restarted the countdown on every parent render — and the parent
  // re-renders often (the friends list refetches on a 45s interval, and the
  // send itself invalidates three queries) — which left the overlay mounted
  // past its own animation. The next send then re-rendered a component that
  // had already played, so the second letter never flew.
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), FLIGHT_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ y: 60, opacity: 0, scale: 0.9 }}
        animate={{
          // Three stops: rise into view, hold, then leave past the top edge.
          y: [60, 0, 0, -900],
          opacity: [0, 1, 1, 0],
          scale: [0.9, 1, 1, 0.72],
          rotate: [0, 0, -2, -9],
        }}
        transition={{
          duration: FLIGHT_MS / 1000,
          times: [0, 0.22, 0.55, 1],
          ease: ['easeOut', 'linear', 'easeIn'],
        }}
      >
        <EnvelopeFace
          to={`To: ${toName}`}
          from="From: you"
          seal="💌"
          sealColors={{ border: '#7a3b57', fill: '#d9738f' }}
          width="min(22rem, 76vw)"
        />
        <p className="font-pixel text-xs text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          Your letter is on its way…
        </p>
      </motion.div>
    </div>
  );
}
