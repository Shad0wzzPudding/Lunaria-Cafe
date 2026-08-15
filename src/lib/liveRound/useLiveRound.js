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
      // Must mirror the provider's value exactly. StudyRoomPanel calls
      // refreshActive() unconditionally, so an omission here is a crash the
      // moment anything renders outside the provider — today only App.jsx's
      // wrapping keeps that from happening.
      refreshActive: () => {},
    }
  );
}
