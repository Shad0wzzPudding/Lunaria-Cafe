import { useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { GameContext } from './gameContext';
import { loadPlayerSave, savePlayerSave, savePlayerSaveOnExit, mergeLoadedSave } from './saveService';
import { gameReducer } from './gameReducer';
import { initialState } from './initialState';
import { AUTO_SAVE_INTERVAL } from './constants';
import { useKonamiCode } from '@/lib/ui/useKonamiCode';
import { applyThemeSettings } from '@/lib/theme/themeDeriver';
import { setAIConfig } from '@/lib/ai/aiIntegration';
import { useAuth } from '@/auth/useAuth';

/**
 * Shown INSTEAD of the game when the save could not be loaded.
 *
 * Rendering it in place of the children is the protection, not the wording:
 * the game tree never mounts, so nothing can dispatch into a blank state and
 * no write path exists to overwrite the save that is still sitting safely in
 * the database.
 */
function SaveLoadFailure({ message, onRetry, onSignOut, onBypass }) {
  // The same cheat sequence that opens the debug panel. No Enter ×3 preamble
  // here — that exists to stop the settings page reacting to ordinary typing,
  // and there is nothing to type on this screen.
  const [asking, setAsking] = useState(false);
  useKonamiCode(() => setAsking(true), { enabled: !asking });

  if (asking) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-amber-500/50 bg-card/60 p-6 space-y-4">
          <h1 className="font-pixel text-sm text-amber-300">Open without your save?</h1>
          <div className="font-body text-sm text-muted-foreground leading-relaxed space-y-2">
            <p>
              This lets you into the app while the server is unreachable, so the rest
              of it can be shown or tested.
            </p>
            <p className="text-amber-300/90">
              You will be looking at an EMPTY cafe, not yours — and nothing you do will
              be saved. Your real save stays untouched in the database, which is the
              whole point: saving is switched off so an empty cafe cannot overwrite it.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button type="button" onClick={onBypass}
              className="rounded-md border border-amber-500/50 bg-amber-500/15 px-4 py-2 font-pixel text-xs text-amber-200 hover:bg-amber-500/25 transition-colors">
              Open anyway — nothing will be saved
            </button>
            <button type="button" onClick={() => setAsking(false)}
              className="rounded-md border border-border/40 px-4 py-2 font-pixel text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-card/60 p-6 text-center space-y-4">
        <p className="text-4xl select-none" aria-hidden="true">☕</p>
        <h1 className="font-pixel text-sm text-foreground">Couldn&apos;t reach your cafe</h1>
        <p className="font-body text-sm text-muted-foreground leading-relaxed">
          Your save couldn&apos;t be loaded, so the cafe is staying closed for now —
          opening it empty would risk writing over what&apos;s there. Nothing has been
          changed. Check your connection and try again.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <button type="button" onClick={onRetry}
            className="rounded-md border border-primary/40 bg-primary/15 px-4 py-2 font-pixel text-xs text-primary hover:bg-primary/25 transition-colors">
            Try again
          </button>
          <button type="button" onClick={onSignOut}
            className="rounded-md border border-border/40 px-4 py-2 font-pixel text-xs text-muted-foreground hover:text-foreground transition-colors">
            Log out
          </button>
        </div>
        <details className="text-left">
          <summary className="cursor-pointer font-pixel text-[10px] text-muted-foreground/60 hover:text-muted-foreground">
            Technical details
          </summary>
          <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground/70">{message}</p>
        </details>
      </div>
    </div>
  );
}

export function GameProvider({ children, userId, onBeforeSignOut, flushRef }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [ready, setReady] = useState(!userId);
  const [saveError, setSaveError] = useState(null);
  // A load failure is NOT a save failure and must not be treated as one. Every
  // write path is gated on this being null, because the danger is not the
  // failed read — it is the blank state that follows it being written back.
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Admin escape hatch from the save-failure screen (Konami). See below.
  const [bypassed, setBypassed] = useState(false);
  // True whenever the save could not be loaded — including while bypassed,
  // because the bypass never clears loadError. Exposed so other providers can
  // refuse to write too; the player's save is not the only thing writable.
  const saveDisabled = Boolean(loadError);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const processAIEvent = useCallback((event) => {
    dispatch({ type: 'PROCESS_AI_EVENT', payload: event });
  }, []);

  const saveNow = useCallback(async () => {
    // Refuse to write when the load failed — the in-memory state is the blank
    // initialState, and persisting it is exactly the data loss this guards.
    if (!userId || loadError) return false;
    try {
      await savePlayerSave(userId, stateRef.current);
      setSaveError(null);
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError(err.message ?? 'Save failed');
      return false;
    }
  }, [userId, loadError]);

  // Flush the save before ending the session — the one logout path
  // shared by every page with a logout button.
  const { signOut } = useAuth();
  const logout = useCallback(async () => {
    try {
      await saveNow();
    } finally {
      // Drop the device claim while we still have a session — the RPC keys off
      // auth.uid(), so it can only run BEFORE signOut. Best-effort: under
      // last-wins a stale claim is harmless, it just delays nothing.
      try { await onBeforeSignOut?.(); } catch { /* not worth blocking logout */ }
      await signOut();
    }
  }, [saveNow, signOut, onBeforeSignOut]);

  // Expose a save to the session lock, which lives above this provider: when
  // another tab takes over it flushes through this BEFORE releasing the lock,
  // so the handover doesn't drop up to an autosave interval of progress.
  // Cleared on unmount so a departed instance can never be asked to write.
  useEffect(() => {
    if (!flushRef) return undefined;
    flushRef.current = saveNow;
    return () => { flushRef.current = null; };
  }, [flushRef, saveNow]);

  // Adjust-during-render: a userId change (guest → account) restarts loading.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setReady(!userId);
  }

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    loadPlayerSave(userId)
      .then((data) => {
        if (cancelled) return;
        const hydrated = mergeLoadedSave(data, initialState);
        if (hydrated) {
          dispatch({ type: 'HYDRATE', payload: hydrated });
          // Catch any day/week rollover that happened since the save was written
          // and normalize the stored date fields.
          dispatch({ type: 'CHECK_DATE_RESET' });
          if (hydrated.settings?.theme) {
            applyThemeSettings(hydrated.settings.theme, hydrated.cafe?.timeOfDay ?? 'day');
          }
          if (hydrated.settings?.aiMode) {
            setAIConfig({ aiMode: hydrated.settings.aiMode });
          }
        }
      })
      .catch((err) => {
        console.error('Load save failed:', err);
        // Deliberately does NOT fall back to defaults and carry on. The old
        // behaviour mounted the game on initialState and the 30s autosave then
        // wrote that blank cafe over a save that was merely unreachable.
        if (!cancelled) setLoadError(err.message ?? 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, loadAttempt]);

  const retryLoad = useCallback(() => {
    // Clears the bypass as well: a successful reload must take the banner down
    // and re-enable saving, not leave a read-only session running over a save
    // that is now perfectly loadable.
    setBypassed(false);
    setLoadError(null);
    setReady(false);
    setLoadAttempt((n) => n + 1);
  }, []);

  // Reset period stats when the day/week rolls over while the app stays open
  // (the load-time reset only fires on refresh). Runs on refocus and once a
  // minute; works for guests too since it operates on in-memory state.
  useEffect(() => {
    const check = () => dispatch({ type: 'CHECK_DATE_RESET' });
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const id = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      clearInterval(id);
    };
  }, [dispatch]);

  // Both write paths below are gated on loadError as well as ready: the game
  // tree is not mounted in that state, but these two fire on timers and page
  // teardown, not on anything the player does, so they would still run.
  useEffect(() => {
    if (!userId || !ready || loadError) return;

    const interval = setInterval(() => {
      savePlayerSave(userId, stateRef.current)
        // Clear on success, or one dropped save leaves a warning on screen for
        // the rest of the session while everything is in fact being saved.
        .then(() => setSaveError(null))
        .catch((err) => {
          console.error('Auto-save failed:', err);
          setSaveError(err.message ?? 'Auto-save failed');
        });
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [userId, ready, loadError]);

  // Persist a spent boost potion immediately.
  //
  // Tickets are consumed at session START and never refunded, so losing the
  // decrement hands back a resource the player already used. Waiting for the
  // 30s autosave is not safe enough: the unload save below is an async request
  // with no keepalive, and browsers routinely kill it, so joining a session and
  // reloading inside the autosave window silently restores the potion — which
  // reads as "potions never run out" across a run of short tests.
  //
  // Deliberately uses `state` from this render, NOT stateRef: that ref is
  // assigned in an effect (see above), so anything firing closer to the
  // dispatch would persist the pre-spend value and write the old count back.
  const prevTicketsRef = useRef(null);
  useEffect(() => {
    const tickets = state.boosts?.focusTickets ?? 0;
    const previous = prevTicketsRef.current;
    prevTicketsRef.current = tickets;
    if (!userId || !ready || loadError) return;
    // Only a DECREASE — a grant (starter pack) can wait for the autosave.
    if (previous === null || tickets >= previous) return;
    savePlayerSave(userId, state).catch((err) => {
      console.error('Boost-spend save failed:', err);
    });
  }, [state, userId, ready, loadError]);

  // Saving on the way out. Two changes from what was here before, and both
  // were needed — either alone still loses saves:
  //
  //   1. savePlayerSaveOnExit uses a keepalive fetch. The old handler called
  //      savePlayerSave, which goes through supabase-js and so issues an
  //      ordinary fetch; the browser cancels those when the document tears
  //      down, and beforeunload does not await promises. It was racing
  //      teardown and usually losing.
  //
  //   2. `visibilitychange` → hidden is the event that actually fires.
  //      beforeunload is skipped entirely when a mobile browser discards a
  //      backgrounded tab, and is unreliable on iOS in general, so a phone
  //      user could lose a whole session. pagehide covers the desktop
  //      close/navigate case including bfcache.
  //
  // Hidden is not the same as closing — a tab switch fires it too — so this
  // runs often by design, and savePlayerSaveOnExit skips writes when nothing
  // has changed.
  useEffect(() => {
    if (!userId || !ready || loadError) return;

    const flushOnExit = () => {
      savePlayerSaveOnExit(userId, stateRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushOnExit);
    };
  }, [userId, ready, loadError]);

  // `bypassed` renders the game DESPITE loadError, and deliberately does not
  // clear it: every write path above is gated on loadError, so leaving it set
  // is what makes the bypass read-only. Clearing it instead would re-create
  // exactly the data loss the guard exists to prevent — a blank cafe autosaved
  // over a real save that was merely unreachable.
  if (loadError && !bypassed) {
    return (
      <SaveLoadFailure
        message={loadError}
        onRetry={retryLoad}
        onBypass={() => setBypassed(true)}
        // signOut directly, NOT logout() — logout flushes the save first, which
        // is the one thing that must never happen from this screen.
        onSignOut={async () => {
          try { await onBeforeSignOut?.(); } catch { /* best effort */ }
          await signOut();
        }}
      />
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground font-body">Loading your cafe…</p>
      </div>
    );
  }

  return (
    <GameContext.Provider
      value={{ state, dispatch, processAIEvent, saveNow, saveError, logout, saveDisabled }}
    >
      {/* Impossible to forget you are in this mode. Without a permanent marker
          somebody plays for an hour in a session that was never going to be
          written and loses the lot — which would be a worse outcome than the
          error screen they bypassed. */}
      {saveDisabled && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500/90 px-3 py-1 text-center font-pixel text-[10px] text-amber-950"
        >
          <span>Offline preview — this is not your cafe, and nothing here is being saved.</span>
          <button
            type="button"
            onClick={retryLoad}
            className="underline underline-offset-2 hover:opacity-80"
          >
            Try loading again
          </button>
        </div>
      )}
      {children}
    </GameContext.Provider>
  );
}
