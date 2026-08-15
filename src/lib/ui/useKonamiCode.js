import { useEffect, useRef } from 'react';

/**
 * The cheat sequence, shared so the debug panel and the save-failure bypass
 * are literally the same code rather than two lists that could drift.
 */
export const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a', 'Enter',
];

/**
 * Calls `onUnlock` when the sequence is typed. `onKey` fires for each accepted
 * keystroke, for feedback.
 *
 * Progress is held in a ref, not state: a re-render per keypress would be
 * pointless, and the settings-page version already works this way.
 */
export function useKonamiCode(onUnlock, { enabled = true, onKey } = {}) {
  const seqRef = useRef([]);
  const unlockRef = useRef(onUnlock);
  const keyRef = useRef(onKey);
  useEffect(() => { unlockRef.current = onUnlock; keyRef.current = onKey; });

  useEffect(() => {
    if (!enabled) { seqRef.current = []; return undefined; }

    const handle = (e) => {
      const expected = KONAMI[seqRef.current.length];
      if (e.key === expected) {
        seqRef.current = [...seqRef.current, e.key];
        keyRef.current?.(e.key);
        if (seqRef.current.length === KONAMI.length) {
          seqRef.current = [];
          unlockRef.current?.();
        }
      } else if (e.key === KONAMI[0]) {
        // A wrong key restarts, but a fresh first key starts a new attempt —
        // otherwise a fumbled run needs a deliberate pause to recover.
        seqRef.current = [e.key];
        keyRef.current?.(e.key);
      } else {
        seqRef.current = [];
      }
    };

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [enabled]);
}
