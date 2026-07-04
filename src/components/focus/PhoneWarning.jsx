import { useEffect, useRef } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sounds } from '@/lib/sounds';
import { useDangerCountdown, DANGER_SECONDS } from './useDangerCountdown';

export default function PhoneWarning() {
  const { state } = useGame();
  const { phoneWarningStart, phoneDetected } = state.attention;
  const { sfxVolume, masterVolume } = state.audio;
  const remainingSeconds = useDangerCountdown(phoneWarningStart);
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    if (!phoneWarningStart || !phoneDetected) {
      soundPlayedRef.current = false;
      return;
    }
    // Play warning sound once per warning
    if (!soundPlayedRef.current) {
      Sounds.phoneWarning(sfxVolume, masterVolume, state.audio.sfxPhoneWarning);
      soundPlayedRef.current = true;
    }
  }, [phoneWarningStart, phoneDetected, sfxVolume, masterVolume, state.audio.sfxPhoneWarning]);

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
                    animate={{ width: `${(remainingSeconds / DANGER_SECONDS) * 100}%` }}
                    transition={{ duration: 1 }}
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-400"
                  />
                </div>
                <span className="font-mono text-xs text-amber-100 tabular-nums">
                  {remainingSeconds}s
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
