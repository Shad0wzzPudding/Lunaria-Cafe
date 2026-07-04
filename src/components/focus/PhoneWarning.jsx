import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sounds } from '@/lib/sounds';

const WARNING_DURATION_MS = 30000; // 30 seconds

export default function PhoneWarning() {
  const { state, dispatch } = useGame();
  const { phoneWarningStart, phoneDetected } = state.attention;
  const { sfxVolume, masterVolume } = state.audio;
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const soundPlayedRef = useRef(false);

  // Reset the countdown at the start of each warning (adjust-during-render).
  const [prevStart, setPrevStart] = useState(phoneWarningStart);
  if (prevStart !== phoneWarningStart) {
    setPrevStart(phoneWarningStart);
    setRemainingSeconds(phoneWarningStart ? WARNING_DURATION_MS / 1000 : 0);
  }

  useEffect(() => {
    if (!phoneWarningStart || !phoneDetected) {
      soundPlayedRef.current = false;
      return;
    }

    // Play warning sound when warning starts
    if (!soundPlayedRef.current) {
      Sounds.phoneWarning(sfxVolume, masterVolume, state.audio.sfxPhoneWarning);
      soundPlayedRef.current = true;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - phoneWarningStart;
      const remaining = Math.max(0, WARNING_DURATION_MS - elapsed);
      setRemainingSeconds(Math.ceil(remaining / 1000));
    }, 100);

    return () => clearInterval(interval);
  }, [phoneWarningStart, phoneDetected, sfxVolume, masterVolume, state.audio.sfxPhoneWarning]);

  const handleDismiss = () => {
    dispatch({ 
      type: 'PROCESS_AI_EVENT', 
      payload: { 
        phone_detected: false, 
        attention_score: state.attention.score,
        user_present: state.attention.userPresent,
        timestamp: Date.now(),
        source: state.attention.source
      } 
    });
  };

  if (!phoneWarningStart || !phoneDetected || remainingSeconds === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
      >
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-md border-2 border-amber-400/50 rounded-xl p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-sm font-semibold text-amber-100 mb-1">
                Phone Detected!
              </h3>
              <p className="font-body text-xs text-amber-200/80 mb-2">
                Please put your phone away to continue your focus session.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${(remainingSeconds / 30) * 100}%` }}
                    transition={{ duration: 1 }}
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-400"
                  />
                </div>
                <span className="font-mono text-xs text-amber-100 tabular-nums">
                  {remainingSeconds}s
                </span>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 hover:bg-white/10 rounded-md transition-colors"
            >
              <X className="w-4 h-4 text-amber-200/60" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
