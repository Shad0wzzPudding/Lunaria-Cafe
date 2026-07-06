import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sounds } from '@/lib/sounds';
import { useDangerCountdown, DANGER_SECONDS } from './useDangerCountdown';

const SCORE_THRESHOLD = 25;

export default function LowScoreWarning() {
  const { state } = useGame();
  const { score, phoneDetected, phoneWarningStart } = state.attention;
  const { sfxVolume, masterVolume, sfxPhoneWarning } = state.audio;
  const [dismissed, setDismissed] = useState(false);
  const soundPlayedRef = useRef(false);
  const remainingSeconds = useDangerCountdown(phoneWarningStart);

  const isActive = state.focus.status === 'active';
  const isLow = score <= SCORE_THRESHOLD;
  // Critical: score bottomed out — the shared danger clock (phoneWarningStart)
  // is counting down to session failure and this banner shows the countdown.
  const isCritical = score <= 0;
  // Mirror PhoneWarning's exact render condition so exactly one banner owns
  // the slot at any moment (including the final expiry frames). The shared
  // clock means the countdown carries over between the two banners. Once the
  // score bottoms out, the critical countdown takes over the slot — the phone
  // banner steps aside — so we stop yielding to it here.
  const phoneBannerUp = Boolean(phoneDetected && phoneWarningStart && remainingSeconds > 0 && !isCritical);
  // Paused sessions freeze detection, so no warning while paused.
  const shouldShow = isActive && isLow && !phoneBannerUp;
  // X only dismisses the soft variant; the critical countdown can't be closed.
  const visible = shouldShow && (isCritical || !dismissed);

  // Re-arm the dismiss when the warning condition goes away.
  const [prevShow, setPrevShow] = useState(shouldShow);
  if (prevShow !== shouldShow) {
    setPrevShow(shouldShow);
    if (!shouldShow) setDismissed(false);
  }

  useEffect(() => {
    if (shouldShow) {
      if (!soundPlayedRef.current) {
        Sounds.phoneWarning(sfxVolume, masterVolume, sfxPhoneWarning);
        soundPlayedRef.current = true;
      }
    } else {
      soundPlayedRef.current = false;
    }
  }, [shouldShow, sfxVolume, masterVolume, sfxPhoneWarning]);

  const message = isCritical
    ? 'The cafe is falling apart! Refocus now or the session fails!'
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
          <div
            className={`backdrop-blur-md border-2 rounded-xl p-4 shadow-2xl ${
              isCritical
                ? 'bg-gradient-to-r from-red-500/25 to-orange-500/25 border-red-400/60'
                : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-400/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <AlertTriangle
                  className={`w-6 h-6 animate-pulse ${isCritical ? 'text-red-400' : 'text-amber-400'}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-display text-sm font-semibold mb-1 ${isCritical ? 'text-red-100' : 'text-amber-100'}`}>
                  Cafe in Danger!
                </h3>
                <p className={`font-body text-xs ${isCritical ? 'text-red-200/80 mb-2' : 'text-amber-200/80'}`}>
                  {message}
                </p>
                {isCritical && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${(remainingSeconds / DANGER_SECONDS) * 100}%` }}
                        transition={{ duration: 1 }}
                        className="h-full bg-gradient-to-r from-red-400 to-orange-400"
                      />
                    </div>
                    <span className="font-mono text-xs text-red-100 tabular-nums">
                      {remainingSeconds}s
                    </span>
                  </div>
                )}
              </div>
              {!isCritical && (
                <button
                  onClick={() => setDismissed(true)}
                  className="flex-shrink-0 p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="w-4 h-4 text-amber-200/60" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
