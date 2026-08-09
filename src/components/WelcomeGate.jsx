import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import LicenseEnvelope from '@/components/LicenseEnvelope';
import { useGame } from '@/lib/gameState/useGame';

/**
 * The welcome letter, presented as the door into the cafe — and the app behind
 * it, held shut until the letter is passed.
 *
 * The gate shows whenever the save carries no NSC acknowledgement, which covers
 * both cases the letter has to serve: a brand-new player (the flag starts false
 * and is written once they agree) and every guest session (guest saves live in
 * memory, so the flag is back to false on each visit).
 *
 * Mounted inside GameProvider, which holds its children until the save has
 * loaded — so the gate never flashes at a returning player who already agreed.
 */
export default function WelcomeGate({ children }) {
  const { state } = useGame();

  // Decided once, at mount. Reading the flag live would tear the envelope down
  // the instant consent is dispatched — taking the starter-pack reveal, which
  // plays *after* agreeing, with it. Only the envelope's own onClose ends it.
  const [gated, setGated] = useState(() => !state.settings?.nscConsentAccepted);

  return (
    <>
      {/* `inert` is what actually closes the app off. A backdrop only stops the
          mouse: everything behind it keeps its place in the tab order, and a
          keyboard user could tab to "Open Cafe", press Enter, and land in the
          cafe with the unagreed letter still floating on top. `display: contents`
          keeps the wrapper out of the layout — CafeView positions against
          <main>, and a real box here would change what it resolves against. */}
      <div inert={gated} style={{ display: 'contents' }}>
        {children}
      </div>

      <AnimatePresence>
        {gated && <LicenseEnvelope gate onClose={() => setGated(false)} />}
      </AnimatePresence>
    </>
  );
}
