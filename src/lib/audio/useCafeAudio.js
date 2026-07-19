import { useEffect } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { unlockCafeAudio, updateCafeAudio, stopCafeAudio } from './cafeAudioEngine';

export function useCafeAudio() {
  const { state } = useGame();
  const { audio } = state;

  useEffect(() => {
    const unlock = () => unlockCafeAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    updateCafeAudio(audio, state.phase);
  }, [audio, state.phase]);

  // The engine's music/ambience are module singletons that outlive this hook.
  // When the game tree unmounts (logout → back to the login page), stop them —
  // otherwise the cafe keeps playing over the login screen.
  useEffect(() => stopCafeAudio, []);
}

export { playCoinChime } from './cafeAudioEngine';
