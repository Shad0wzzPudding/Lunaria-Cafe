import { useEffect } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { unlockCafeAudio, updateCafeAudio } from '@/lib/cafeAudioEngine';

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
}

export { playCoinChime } from '@/lib/cafeAudioEngine';
