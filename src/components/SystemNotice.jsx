import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';

/**
 * A thin banner for trouble the player needs to know about while playing.
 *
 * Save failures were only ever shown on the Settings page, which is somewhere
 * a player has no reason to open — so a save that had stopped working looked
 * exactly like one that was working. Auth trouble was console-only.
 *
 * Deliberately not a toast: these conditions persist, and a notice that
 * disappears after four seconds is how you end up believing your progress is
 * being saved when it is not.
 */
export default function SystemNotice() {
  const { saveError, saveNow } = useGame();
  const { authError } = useAuth();
  const [dismissed, setDismissed] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const message = saveError
    ? `Your progress isn't being saved right now — ${saveError}`
    : authError;

  // Save trouble is NOT dismissible. Per-message dismissal looked reasonable
  // until you follow it through: the error string is stable, so waving away a
  // failing save hides every LATER failure with the same cause too, and the
  // player spends the session believing their progress is safe. That is the
  // exact belief this banner exists to prevent, so the only way to clear it is
  // for a save to actually succeed. Auth notices are informational — nothing
  // is being lost while they show — so those stay dismissible.
  const dismissible = !saveError;
  if (!message || (dismissible && dismissed === message)) return null;

  const retry = async () => {
    setRetrying(true);
    await saveNow();
    setRetrying(false);
  };

  return (
    // A live region, because this banner appears on a timer — up to 30s after
    // saving starts failing — with no interaction to reveal it. Without one, a
    // screen-reader user is never told, and plays on believing their progress
    // is safe.
    //
    // Role and liveness move together: `alert` (implicitly assertive) for a
    // save failure, where progress is being lost right now, and `status`
    // (implicitly polite) for informational auth notices. Pairing them the
    // other way — status + assertive — is legal but idiomatically odd, and
    // `alert` is what the instructor notice already uses for its error line.
    <div
      role={saveError ? 'alert' : 'status'}
      aria-live={saveError ? 'assertive' : 'polite'}
      className="pointer-events-none fixed inset-x-0 top-0 z-[150] flex justify-center p-2"
    >
      <div className="pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-lg border border-amber-500/50 bg-amber-950/90 px-3 py-2 shadow-lg backdrop-blur-sm">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
        <p className="font-body text-[12px] leading-relaxed text-amber-100">{message}</p>
        {saveError && (
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="shrink-0 font-pixel text-[10px] text-amber-300 underline underline-offset-2 hover:text-amber-100 disabled:opacity-50"
          >
            {retrying ? 'Saving…' : 'Retry'}
          </button>
        )}
        {dismissible && (
          <button
            type="button"
            onClick={() => setDismissed(message)}
            aria-label="Dismiss"
            className="shrink-0 text-amber-400/70 hover:text-amber-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
