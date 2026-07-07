import { useContext } from 'react';
import { LiveRoundContext } from './liveRoundContext';

/**
 * Live-round state for the student side. Returns a no-op-ish shape
 * ({ activeRounds: [], currentRound: null, join, leave }) when no
 * provider is mounted (e.g. guests), so callers can use it freely.
 */
export function useLiveRound() {
  return (
    useContext(LiveRoundContext) ?? {
      activeRounds: [],
      currentRound: null,
      overlayVisible: true,
      join: async () => {},
      leave: () => {},
      hideOverlay: () => {},
    }
  );
}
