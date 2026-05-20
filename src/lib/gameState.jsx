import { createContext, useContext, useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { getChaosStage } from '@/lib/aiIntegration';
import { loadPlayerSave, savePlayerSave, mergeLoadedSave } from '@/lib/saveService';
import { pushPopup } from '@/lib/feedbackHelpers';

export const initialState = {
  phase: 'menu',
  coins: 0,
  reputation: 0,
  cafe: {
    name: 'Lunaria Cafe',
    currentCustomers: 0,
    maxCustomers: 8,
    timeOfDay: 'night',
    decorateMode: false,
    decorateTool: 'place',
    placeFurnitureType: 'plant',
    furniture: [
  { id: 'built-counter',   type: 'bar_counter1',       x: 30,  y: 75,  w: 160, h: 70 },
  { id: 'built-counter2',  type: 'bar_counter2',        x: 210, y: 75,  w: 160, h: 70 },
  { id: 'built-fireplace', type: 'fireplace',           x: 320, y: 60,  w: 100, h: 80 },
  { id: 'built-bookcase',  type: 'bookcase_small',      x: 630, y: 65,  w: 70,  h: 90 },
  { id: 'built-table-1',   type: 'table_square',        x: 80,  y: 210, w: 80,  h: 80 },
  { id: 'built-chair-1',   type: 'chair_blue',          x: 65,  y: 270, w: 40,  h: 45 },
  { id: 'built-chair-2',   type: 'chair_red',           x: 145, y: 270, w: 40,  h: 45 },
  { id: 'built-table-2',   type: 'table_round',         x: 290, y: 250, w: 90,  h: 90 },
  { id: 'built-chair-3',   type: 'chair_blue',          x: 275, y: 315, w: 40,  h: 45 },
  { id: 'built-chair-4',   type: 'chair_red',           x: 365, y: 315, w: 40,  h: 45 },
  { id: 'built-table-3',   type: 'table_square',        x: 490, y: 210, w: 80,  h: 80 },
  { id: 'built-chair-5',   type: 'chair_blue',          x: 475, y: 270, w: 40,  h: 45 },
  { id: 'built-chair-6',   type: 'chair_red',           x: 555, y: 270, w: 40,  h: 45 },
  { id: 'built-sofa',      type: 'sofa_blue',           x: 80,  y: 370, w: 110, h: 60 },
  { id: 'built-carpet',    type: 'red_carpet',          x: 270, y: 365, w: 120, h: 70 },
  { id: 'built-plant',     type: 'plant_big',           x: 660, y: 360, w: 40,  h: 50 },
],
  },
  focus: {
    status: 'idle',
    elapsed: 0,
    duration: 25 * 60,
    mode: 'pomodoro',
  },
  attention: {
    score: 85,
    chaosLevel: 0,
    phoneDetected: false,
    userPresent: true,
    chaosEvents: [],
    warningMessage: '',
    source: 'offline',
  },
  npcs: {
    customers: [],
    rabbits: [
    { id: 'rabbit-1', x: 200, y: 350, mood: 'happy' },
    { id: 'rabbit-2', x: 500, y: 400, mood: 'sleepy' },
  ],
    major: [
      { id: 'npc-1', name: 'Mira', emoji: '🦊', role: 'Regular', personality: 'Cheerful and curious', schedule: 'Every evening', favoriteOrder: 'Moon Latte' },
    { id: 'npc-2', name: 'Theo', emoji: '🧙', role: 'Scholar', personality: 'Quiet and studious', schedule: 'Late nights', favoriteOrder: 'Dark Brew' },
    { id: 'npc-3', name: 'Luna', emoji: '🌙', role: 'Dreamer', personality: 'Whimsical and soft', schedule: 'Weekends', favoriteOrder: 'Starberry Tea' },
    ],
  },
  audio: {
    masterVolume: 0.8,
    musicVolume: 0.6,
    ambienceVolume: 0.5,
    sfxVolume: 0.7,
    rainEnabled: true,
    fireplaceEnabled: false,
    chatterEnabled: true,
  },
  stats: {
    totalSessions: 0,
    totalMinutes: 0,
    bestStreak: 0,
    totalFocusMinutes: 0,
    coinsEarned: 0,
    customersTotal: 0,
    currentStreak: 0,
    chaosEvents: 0,
    todayMinutes: 0,
    dailyGoal: 60,
    weeklyData: [0, 0, 0, 0, 0, 0, 0],
  },
  ui: {
    popups: [],
    coinFloat: null,
  },
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'ADD_COINS':
      return { ...state, coins: state.coins + action.payload };

    case 'ADD_REPUTATION':
      return { ...state, reputation: state.reputation + action.payload };

    case 'START_FOCUS':
      return {
        ...state,
        focus: {
          ...state.focus,
          status: 'active',
          elapsed: 0,
        },
        attention: {
          ...state.attention,
          chaosEvents: [],
        },
      };

    case 'PAUSE_FOCUS':
      return {
        ...state,
        focus: { ...state.focus, status: 'paused' },
      };

    case 'RESUME_FOCUS':
      return {
        ...state,
        focus: { ...state.focus, status: 'active' },
      };

    case 'END_FOCUS': {
      if (state.focus.status !== 'active' && state.focus.status !== 'paused') {
        return state;
      }
      const tickedMins = Math.floor(state.focus.elapsed / 60);
      const sessionMins = Math.max(state.focus.elapsed >= 30 ? 1 : 0, Math.ceil(state.focus.elapsed / 60));
      const extraMins = Math.max(0, sessionMins - tickedMins);
      const weeklyData = [...state.stats.weeklyData];
      const todayIdx = (new Date().getDay() + 6) % 7;
      if (extraMins > 0) weeklyData[todayIdx] += extraMins;
      const coinsEarned =
        sessionMins > 0
          ? Math.max(1, Math.floor(sessionMins * 2 * (state.attention.score / 100)))
          : 0;
      const repGain = sessionMins > 0 ? Math.min(3, Math.floor(sessionMins / 2)) : 0;
      let next = {
        ...state,
        phase: 'management',
        focus: { ...state.focus, status: 'idle', elapsed: 0 },
        coins: state.coins + coinsEarned,
        reputation: Math.min(100, state.reputation + repGain),
        stats: {
          ...state.stats,
          totalSessions: state.stats.totalSessions + (sessionMins > 0 ? 1 : 0),
          totalMinutes: state.stats.totalMinutes + extraMins,
          totalFocusMinutes: state.stats.totalFocusMinutes + extraMins,
          todayMinutes: state.stats.todayMinutes + extraMins,
          weeklyData,
          coinsEarned: state.stats.coinsEarned + coinsEarned,
          currentStreak: sessionMins > 0 ? state.stats.currentStreak + 1 : state.stats.currentStreak,
        },
      };
      if (coinsEarned > 0) {
        next = {
          ...next,
          ui: pushPopup(
            next,
            `Focus ended · +${coinsEarned} coins`,
            coinsEarned,
          ),
        };
      }
      return next;
    }

    case 'TICK_FOCUS': {
      if (state.focus.status !== 'active') return state;
      const nextElapsed = state.focus.elapsed + 1;
      const base = {
        ...state,
        focus: { ...state.focus, elapsed: nextElapsed },
        cafe: {
          ...state.cafe,
          currentCustomers: state.npcs.customers.length,
        },
      };
      if (nextElapsed > 0 && nextElapsed % 60 === 0) {
        const weeklyData = [...state.stats.weeklyData];
        const todayIdx = (new Date().getDay() + 6) % 7;
        weeklyData[todayIdx] += 1;
        return {
          ...base,
          stats: {
            ...state.stats,
            totalMinutes: state.stats.totalMinutes + 1,
            totalFocusMinutes: state.stats.totalFocusMinutes + 1,
            todayMinutes: state.stats.todayMinutes + 1,
            weeklyData,
          },
        };
      }
      return base;
    }

    case 'COMPLETE_FOCUS': {
      const tickedMins = Math.floor(state.focus.elapsed / 60);
      const sessionMins = Math.max(1, Math.ceil(state.focus.elapsed / 60));
      const extraMins = Math.max(0, sessionMins - tickedMins);
      const weeklyData = [...state.stats.weeklyData];
      const todayIdx = (new Date().getDay() + 6) % 7;
      if (extraMins > 0) {
        weeklyData[todayIdx] += extraMins;
      }
      const coinsEarned = Math.max(1, Math.floor(sessionMins * 2 * (state.attention.score / 100)));
      const repGain = Math.min(5, Math.floor(sessionMins / 2));
      const sessionChaos = state.attention.chaosEvents.length;
      const servedCount = state.npcs.customers.length;
      let next = {
        ...state,
        focus: { ...state.focus, status: 'completed' },
        coins: state.coins + coinsEarned,
        reputation: Math.min(100, state.reputation + repGain),
        stats: {
          ...state.stats,
          totalSessions: state.stats.totalSessions + 1,
          totalMinutes: state.stats.totalMinutes + extraMins,
          totalFocusMinutes: state.stats.totalFocusMinutes + extraMins,
          todayMinutes: state.stats.todayMinutes + extraMins,
          weeklyData,
          coinsEarned: state.stats.coinsEarned + coinsEarned,
          customersTotal: state.stats.customersTotal + servedCount,
          chaosEvents: state.stats.chaosEvents + sessionChaos,
          currentStreak: state.stats.currentStreak + 1,
          bestStreak: Math.max(state.stats.bestStreak, state.stats.currentStreak + 1),
        },
        ui: pushPopup(
          state,
          `Session complete! +${coinsEarned} coins · reputation +${repGain}%`,
          coinsEarned,
        ),
      };
      return next;
    }

    case 'RESET_FOCUS':
      return {
        ...state,
        focus: {
          ...state.focus,
          status: 'idle',
          elapsed: 0,
        },
      };

    case 'PROCESS_AI_EVENT': {
      const score = action.payload.attention_score ?? state.attention.score;
      const chaos = getChaosStage(score);
      const prevLevel = state.attention.chaosLevel;
      const nextEvents = [...state.attention.chaosEvents];

      if (chaos.level > prevLevel && chaos.level > 0 && action.payload.phone_detected) {
        nextEvents.push({
          message: action.payload.warning_message || `Chaos level: ${chaos.name}`,
          timestamp: Date.now(),
        });
      }

      return {
        ...state,
        attention: {
          ...state.attention,
          score,
          chaosLevel: chaos.level,
          phoneDetected: action.payload.phone_detected ?? state.attention.phoneDetected,
          userPresent: action.payload.user_present ?? state.attention.userPresent,
          warningMessage: action.payload.warning_message ?? '',
          source: action.payload.source ?? state.attention.source,
          chaosEvents: nextEvents.slice(-10),
        },
        focus: {
          ...state.focus,
          status:
            action.payload.phone_detected && state.focus.status === 'active'
              ? 'distracted'
              : state.focus.status === 'distracted' && !action.payload.phone_detected
                ? 'active'
                : state.focus.status,
        },
      };
    }

    case 'ADD_CHAOS_EVENT':
      return {
        ...state,
        attention: {
          ...state.attention,
          chaosEvents: [...state.attention.chaosEvents.slice(-9), action.payload],
        },
        stats: {
          ...state.stats,
          chaosEvents: state.stats.chaosEvents + 1,
        },
      };

    case 'SET_DECORATE_MODE':
      return {
        ...state,
        cafe: {
          ...state.cafe,
          decorateMode: action.payload,
          decorateTool: 'place',
        },
      };

    case 'SET_DECORATE_TOOL':
      return {
        ...state,
        cafe: { ...state.cafe, decorateTool: action.payload },
      };

    case 'SET_PLACE_FURNITURE':
      return {
        ...state,
        cafe: { ...state.cafe, placeFurnitureType: action.payload, decorateTool: 'place' },
      };

    case 'ADD_FURNITURE':
      return {
        ...state,
        cafe: {
          ...state.cafe,
          furniture: [
            ...state.cafe.furniture,
            {
              ...action.payload,
              id: action.payload.id ?? `furn-${Date.now()}`,
            },
          ],
        },
      };

    case 'REMOVE_FURNITURE': {
  const target = state.cafe.furniture.find((f) => f.id === action.payload);
  if (!target || target.id === 'built-counter') return state; // only protect main counter
  return {
    ...state,
    cafe: {
      ...state.cafe,
      furniture: state.cafe.furniture.filter((f) => f.id !== action.payload),
    },
  };
}

    case 'DISMISS_UI_POPUP':
      return {
        ...state,
        ui: {
          ...state.ui,
          popups: state.ui.popups.filter((p) => p.id !== action.payload),
        },
      };

    case 'CLEAR_COIN_FLOAT':
      return {
        ...state,
        ui: { ...state.ui, coinFloat: null },
      };

    case 'ADD_CUSTOMER':
      return {
        ...state,
        npcs: {
          ...state.npcs,
          customers: [...state.npcs.customers, action.payload],
        },
        cafe: {
          ...state.cafe,
          currentCustomers: state.npcs.customers.length + 1,
        },
      };

    case 'SERVE_CUSTOMER':
    case 'REMOVE_CUSTOMER': {
      const customer = state.npcs.customers.find((c) => c.id === action.payload);
      const remaining = state.npcs.customers.filter((c) => c.id !== action.payload);
      const coinsGain = customer ? 8 + Math.floor(Math.random() * 7) : 0;
      const repGain = customer ? 2 : 0;
      const emoji = customer?.emoji ?? '☕';
      let next = {
        ...state,
        npcs: { ...state.npcs, customers: remaining },
        cafe: { ...state.cafe, currentCustomers: remaining.length },
        coins: state.coins + coinsGain,
        reputation: Math.min(100, state.reputation + repGain),
        stats: {
          ...state.stats,
          customersTotal: state.stats.customersTotal + 1,
          coinsEarned: state.stats.coinsEarned + coinsGain,
        },
      };
      if (customer) {
        next = {
          ...next,
          ui: pushPopup(next, `${emoji} Customer served!`, coinsGain),
        };
      }
      return next;
    }

    case 'SET_AUDIO':
      return {
        ...state,
        audio: { ...state.audio, ...action.payload },
      };

    case 'HYDRATE':
      return { ...action.payload, ui: initialState.ui };

    case 'RESET':
      return initialState;

    case 'UPDATE_RABBIT': {
      return {
        ...state,
        npcs: {
          ...state.npcs,
          rabbits: state.npcs.rabbits.map(r =>
            r.id === action.payload.id ? { ...r, ...action.payload } : r
          ),
        },
      };
    }
    case 'SET_TIME_OF_DAY':
    return {
    ...state,
    cafe: { ...state.cafe, timeOfDay: action.payload },
    };

    default:
      return state;
  }
}

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
    }, 30_000);

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
