import { useEffect, useState } from 'react';
import { WARNING_DURATION_MS } from '@/lib/gameState/constants';

export const DANGER_SECONDS = WARNING_DURATION_MS / 1000;

// Remaining whole seconds on the shared 30s danger clock
// (attention.phoneWarningStart). Both warning banners read this so the
// countdown carries over seamlessly when one banner replaces the other.
// Tracks whenever the clock exists — even while the banner using it is
// hidden — so the first visible frame always shows the true remaining time.
export function useDangerCountdown(startTimestamp) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Adjust-during-render: a NEW clock starts at the full duration; a
  // cleared clock reads 0. A carried-over clock (same timestamp) keeps
  // its current value and the interval below keeps it accurate.
  const [prevStart, setPrevStart] = useState(startTimestamp);
  if (prevStart !== startTimestamp) {
    setPrevStart(startTimestamp);
    setRemainingSeconds(startTimestamp ? DANGER_SECONDS : 0);
  }

  useEffect(() => {
    if (!startTimestamp) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, WARNING_DURATION_MS - (Date.now() - startTimestamp));
      setRemainingSeconds(Math.ceil(remaining / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [startTimestamp]);

  return remainingSeconds;
}
