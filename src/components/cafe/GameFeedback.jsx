import { useEffect, useRef } from 'react';
import { Coins } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { playCoinChime } from '@/lib/audio/cafeAudioEngine';

export default function GameFeedback() {
  const { state, dispatch } = useGame();
  const { popups } = state.ui;
  const playedRef = useRef(new Set());

  useEffect(() => {
    popups.forEach((popup) => {
      if (popup.coins && !playedRef.current.has(popup.id)) {
        playedRef.current.add(popup.id);
        playCoinChime(state.audio.sfxVolume, state.audio.masterVolume);
      }
    });
  }, [popups, state.audio.sfxVolume, state.audio.masterVolume]);

  useEffect(() => {
    if (!popups.length) return undefined;
    const timers = popups.map((popup) =>
      setTimeout(() => {
        dispatch({ type: 'DISMISS_UI_POPUP', payload: popup.id });
      }, 3200),
    );
    return () => timers.forEach(clearTimeout);
  }, [popups, dispatch]);

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-20 z-40 flex max-w-xs flex-col gap-2">
        <AnimatePresence>
          {popups.map((popup) => (
            <motion.div
              key={popup.id}
              initial={{ opacity: 0, x: -24, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -12, scale: 0.95 }}
              className="rounded-lg border border-amber-500/30 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            >
              <div className="flex items-center gap-2">
              {popup.icon === 'coins' && (
                <Coins className="h-4 w-4 text-amber-300 shrink-0" />
              )}

              <p className="font-body text-sm text-foreground">
                {popup.message}
              </p>
            </div>
              {popup.coins ? (
                <p className="font-pixel text-xs text-amber-300 mt-0.5">+{popup.coins} coins</p>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </>
  );
}
