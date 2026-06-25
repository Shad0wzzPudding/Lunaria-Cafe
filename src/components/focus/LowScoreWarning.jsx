import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sounds } from '@/lib/sounds';

const SCORE_THRESHOLD = 25;

export default function LowScoreWarning() {
  const { state } = useGame();
  const { score, phoneDetected, phoneWarningStart } = state.attention;
  const { sfxVolume, masterVolume, sfxPhoneWarning } = state.audio;
  const [visible, setVisible] = useState(false);
  const soundPlayedRef = useRef(false);

  const isLow = score <= SCORE_THRESHOLD;

  useEffect(() => {
    // Don't show if PhoneWarning is already up
    if (isLow && !phoneWarningStart) {
      setVisible(true);
      if (!soundPlayedRef.current) {
        Sounds.phoneWarning(sfxVolume, masterVolume, sfxPhoneWarning);
        soundPlayedRef.current = true;
      }
    } else {
      setVisible(false);
      soundPlayedRef.current = false;
    }
  }, [isLow, phoneWarningStart, sfxVolume, masterVolume, sfxPhoneWarning]);

  const message = phoneDetected
    ? 'The cafe is going to be full of mess, put your phone down!'
    : 'The cafe is going to be full of mess, come back to the screen!';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="low-score-warning"
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
                  Cafe in Danger!
                </h3>
                <p className="font-body text-xs text-amber-200/80">
                  {message}
                </p>
              </div>
              <button
                onClick={() => setVisible(false)}
                className="flex-shrink-0 p-1 hover:bg-white/10 rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-amber-200/60" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
