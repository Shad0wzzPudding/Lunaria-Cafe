import { createContext } from 'react';

// Shared so useLiveRound lives in its own module (react-refresh friendly).
export const LiveRoundContext = createContext(null);
