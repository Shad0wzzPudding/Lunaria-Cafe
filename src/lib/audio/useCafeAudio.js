import { useEffect } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { updateCafeAudio, stopCafeAudio } from './cafeAudioEngine';

export function useCafeAudio() {
  const { state } = useGame();
  const { audio } = state;

  // Note: unlocking on the first gesture is handled at the module level in
  // cafeAudioEngine, so the login click itself counts (this hook only mounts
  // after login, which is why unlocking here missed that first gesture).

  useEffect(() => {
    updateCafeAudio(audio, state.phase);
  }, [audio, state.phase]);

  // The engine's music/ambience are module singletons that outlive this hook.
  // When the game tree unmounts (logout → back to the login page), stop them —
  // otherwise the cafe keeps playing over the login screen.
  useEffect(() => stopCafeAudio, []);
}

export { playCoinChime } from './cafeAudioEngine';
