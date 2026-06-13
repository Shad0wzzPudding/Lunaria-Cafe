import { createContext, useContext, useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { loadPlayerSave, savePlayerSave, mergeLoadedSave } from '@/lib/saveService';
import { gameReducer } from './gameReducer';
import { initialState } from './initialState';
import { AUTO_SAVE_INTERVAL } from './constants';

const GameContext = createContext(null);

export function GameProvider({ children, userId }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [ready, setReady] = useState(!userId);
  const [saveError, setSaveError] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const processAIEvent = useCallback((event) => {
    dispatch({ type: 'PROCESS_AI_EVENT', payload: event });
  }, []);

  const saveNow = useCallback(async () => {
    if (!userId) return;
    try {
      await savePlayerSave(userId, stateRef.current);
      setSaveError(null);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveError(err.message ?? 'Save failed');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    loadPlayerSave(userId)
      .then((data) => {
        if (cancelled) return;
        const hydrated = mergeLoadedSave(data, initialState);
        if (hydrated) {
          dispatch({ type: 'HYDRATE', payload: hydrated });
        }
      })
      .catch((err) => {
        console.error('Load save failed:', err);
        if (!cancelled) setSaveError(err.message ?? 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !ready) return;

    const interval = setInterval(() => {
      savePlayerSave(userId, stateRef.current).catch((err) => {
        console.error('Auto-save failed:', err);
        setSaveError(err.message ?? 'Auto-save failed');
      });
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [userId, ready]);

  useEffect(() => {
    if (!userId || !ready) return;

    const handleBeforeUnload = () => {
      savePlayerSave(userId, stateRef.current).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [userId, ready]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground font-body">Loading your cafe…</p>
      </div>
    );
  }

  return (
    <GameContext.Provider value={{ state, dispatch, processAIEvent, saveNow, saveError }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}