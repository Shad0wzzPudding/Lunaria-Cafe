import { useEffect, useRef } from 'react';
import { Coins, Armchair } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { playCoinChime } from '@/lib/audio/cafeAudioEngine';

export default function GameFeedback() {
  const { state, dispatch } = useGame();
  const { popups } = state.ui;
  const playedRef = useRef(new Set());
  const timersRef = useRef(new Map());

  useEffect(() => {
    popups.forEach((popup) => {
      if (popup.coins && !playedRef.current.has(popup.id)) {
        playedRef.current.add(popup.id);
        if (state.audio.sfxCoinChime) playCoinChime(state.audio.sfxVolume, state.audio.masterVolume);
      }
    });
  }, [popups, state.audio.sfxVolume, state.audio.masterVolume]);

  useEffect(() => {
    const timers = timersRef.current;

    popups.forEach((popup) => {
      if (!timers.has(popup.id)) {
        timers.set(popup.id, setTimeout(() => {
          dispatch({ type: 'DISMISS_UI_POPUP', payload: popup.id });
          timers.delete(popup.id);
        }, 3200));
      }
    });

    const activeIds = new Set(popups.map((popup) => popup.id));
    timers.forEach((timer, id) => {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    });
  }, [popups, dispatch]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

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

              {popup.icon === 'furniture' && (
                <Armchair className="h-4 w-4 text-amber-300 shrink-0" />
              )}

              <p className="font-body text-sm text-foreground">
                {popup.message}
              </p>
            </div>
              {popup.amount !== undefined || popup.coins !== undefined ? (
              <p className="font-pixel text-xs text-amber-300 mt-0.5">
                {((popup.amount ?? popup.coins) > 0) ? '+' : ''}
                {popup.amount ?? popup.coins} coins
              </p>
            ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </>
  );
}
