import { createContext, useContext, useReducer, useCallback, useEffect, useState, useRef } from 'react';
import { getChaosStage } from '@/lib/aiIntegration';
import { loadPlayerSave, savePlayerSave, mergeLoadedSave } from '@/lib/saveService';
import { pushPopup } from '@/lib/feedbackHelpers';
import { FURNITURE_CATALOG } from '@/lib/furnitureCatalog';

export const initialState = {
  phase: 'menu',
  lastSession: null,
  coins: 0,
  reputation: 0,
  cafe: {
    name: 'Lunaria Cafe',
    currentCustomers: 0,
    maxCustomers: 8,
    timeOfDay: 'day',
    bgMode: 'immersive', // 'immersive' | 'reallife' | 'freestyle'
    decorateMode: false,
    decorateTool: 'place',
    placeFurnitureType: 'plant_big',
    placeFurnitureRotation: 0,
    pendingFurniture: null,
    furniture: [
  { id: 'built-counter',   type: 'bar_counter1',      x: 36.68463611859838, y: 158.72509960159363, w: 160,  h: 70 },
  { id: 'built-counter2',   type: 'bar_counter2',      x: 204.23180592991912, y: 159.72111553784862, w: 160,  h: 70 },
  { id: 'built-fireplace',   type: 'fireplace',      x: 494.5283018867924, y: 110.89641434262947, w: 100,  h: 80 },
  { id: 'built-bookcase',   type: 'bookcase_small',      x: 616.2398921832884, y: 100.91633466135457, w: 70,  h: 90 },
  { id: 'built-plant',   type: 'plant_big',      x: 576.388140161725 , y: 422.70916334661354 , w: 40 ,  h: 50 },
  { id: 'built-plant',   type: 'plant_big',      x: 599.3261455525607, y: 423.7051792828685, w: 40,  h: 50 },
  { id: 'built-plant2',   type: 'plant_big',      x: 97.68194070080862, y: 415.7370517928287, w: 40,  h: 50 },
  { id: 'built-plant3',   type: 'plant_big',      x: 127.6010781671159, y: 415.7370517928287, w: 40,  h: 50 },
  { id: 'built-table_round',   type: 'table_round',      x: 311.03773584905656, y: 285.1792828685259, w: 90,  h: 90 },
  { id: 'built-table_square_plant',   type: 'table_square_plant',      x: 517.4932614555256, y: 231.41434262948206, w: 80,  h: 80 },
  { id: 'built-chair2',   type: 'chair2',      x: 589.3530997304582, y: 251.90239043824704, w: 40,  h: 45 },
  { id: 'built-chair2_2',   type: 'chair2',      x: 468.6792452830189, y: 256.88247011952194, w: 40,  h: 45 },
  { id: 'built-chair2_3',   type: 'chair2',      x: 267.2237196765499, y: 308.6752988047809, w: 40,  h: 45 },
  { id: 'built-chair2_4',   type: 'chair2',      x: 393.8814016172507, y: 305.68725099601596, w: 40,  h: 45 },
  { id: 'built-chair2_5',   type: 'chair2',      x: 41.832884097035034, y: 217.0418326693227, w: 40,  h: 45 },
  { id: 'built-chair2_6',   type: 'chair2',      x: 87.70889487870619, y: 215.04980079681275, w: 40,  h: 45 },
  { id: 'built-chair2_7',   type: 'chair2',      x: 180.45822102425876, y: 306.6832669322709, w: 40,  h: 45 },
  { id: 'built-chair2_8',   type: 'chair2',      x: 64.77088948787062, y: 309.67131474103587, w: 40,  h: 45 },
  { id: 'built-table_square',   type: 'table_square',      x: 99.62264150943395, y: 277.23107569721117, w: 80,  h: 80 },
  { id: 'built-red_carpet',   type: 'red_carpet',      x: 310.99730458221023, y: 395.7768924302789, w: 120,  h: 70 },
  { id: 'built-painting',   type: 'painting',      x: 604.299191374663, y: 50, w: 50,  h: 40 },
  { id: 'built-barrel',   type: 'barrel',      x: 677.6212938005391, y: 341.5438247011952, w: 35,  h: 45 },
  { id: 'built-barrel2',   type: 'barrel',      x: 676.6239892183288, y: 305.68725099601596, w: 35,  h: 45 },
  { id: 'built-barrel3',   type: 'barrel',      x: 672.6347708894879, y: 275.80677290836655, w: 35,  h: 45 },
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
    phoneWarningStart: null,
    phoneFreeSince: null,
    gazeFocusedSince: null,
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
        lastSession: {
        durationMinutes: sessionMins,
        coinsEarned: coinsEarned,
        coinsReduced: 0,
        reputationGain: repGain,
        attentionScore: Math.round(state.attention.score),
        distractions: state.attention.chaosEvents.length,
        },
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
          phase: 'management',
          lastSession: {
            durationMinutes: sessionMins,
            coinsEarned: coinsEarned,
            coinsReduced: 0,
            reputationGain: repGain,
            attentionScore: Math.round(state.attention.score),
            distractions: sessionChaos,
          },
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
      const now = Date.now();
      const WARNING_DURATION_MS = 60000; // 1 minute
      const CLEAR_CONDITION_MS = 2000; // 2 seconds of continuous good behavior

      if (chaos.level > prevLevel && chaos.level > 0 && action.payload.phone_detected) {
        nextEvents.push({
          message: action.payload.warning_message || `Chaos level: ${chaos.name}`,
          timestamp: Date.now(),
        });
      }

      // Phone warning logic with strict clearing conditions
      let phoneWarningStart = state.attention.phoneWarningStart;
      let phoneFreeSince = state.attention.phoneFreeSince;
      let gazeFocusedSince = state.attention.gazeFocusedSince;
      let newFocusStatus = state.focus.status;

      // Check if user is looking at screen (no gaze distraction warning)
      const isGazeFocused = !action.payload.warning_message?.includes('GAZE DISTRACTED');

      if (action.payload.phone_detected) {
        // Phone detected - start warning immediately
        if (!phoneWarningStart) {
          phoneWarningStart = now;
        }
        // Reset clearing conditions
        phoneFreeSince = null;
        gazeFocusedSince = null;
        // Only set to distracted after 1 minute of continuous phone detection
        if (now - phoneWarningStart >= WARNING_DURATION_MS) {
          newFocusStatus = 'distracted';
        }
      } else {
        // No phone detected - track phone-free duration
        if (!phoneFreeSince) {
          phoneFreeSince = now;
        }
        
        // Track gaze-focused duration
        if (isGazeFocused) {
          if (!gazeFocusedSince) {
            gazeFocusedSince = now;
          }
        } else {
          gazeFocusedSince = null;
        }

        // Strict clearing: both conditions must be met for 2 seconds
        const phoneFreeDuration = phoneFreeSince ? now - phoneFreeSince : 0;
        const gazeFocusedDuration = gazeFocusedSince ? now - gazeFocusedSince : 0;

        if (phoneFreeDuration >= CLEAR_CONDITION_MS && gazeFocusedDuration >= CLEAR_CONDITION_MS) {
          // Both conditions met - clear warning
          phoneWarningStart = null;
          phoneFreeSince = null;
          gazeFocusedSince = null;
          if (state.focus.status === 'distracted') {
            newFocusStatus = 'active';
          }
        }
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
          phoneWarningStart,
          phoneFreeSince,
          gazeFocusedSince,
        },
        focus: {
          ...state.focus,
          status: newFocusStatus,
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
          placeFurnitureRotation: 0,
          pendingFurniture: null,
    pendingFurniture: null,
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

    case 'SET_PLACE_ROTATION':
      return {
        ...state,
        cafe: { ...state.cafe, placeFurnitureRotation: action.payload },
      };

    case 'SET_PENDING_FURNITURE': {
      const pf = action.payload;
      if (!pf) return { ...state, cafe: { ...state.cafe, pendingFurniture: null } };
      // Always store the catalog base dimensions (rotation=0) so we can derive
      // correct w/h for any rotation without cumulative drift.
      const baseW = pf.baseW ?? pf.w;
      const baseH = pf.baseH ?? pf.h;
      return {
        ...state,
        cafe: { ...state.cafe, pendingFurniture: { ...pf, baseW, baseH } },
      };
    }

   case 'ROTATE_PENDING_FURNITURE': {
  const pf = state.cafe.pendingFurniture;
  if (!pf) return state;

  const newRotation =
    ((pf.rotation ?? 0) + action.payload + 360) % 360;

  return {
    ...state,
    cafe: {
      ...state.cafe,
      pendingFurniture: {
        ...pf,
        rotation: newRotation,
      },
    },
  };
}

    case 'CONFIRM_PENDING_FURNITURE': {
  const pf = state.cafe.pendingFurniture;
  if (!pf) return state;

  return {
    ...state,
    cafe: {
      ...state.cafe,

      pendingFurniture: null,

      furniture: [
        ...state.cafe.furniture,

        {
          id: pf.id,
          type: pf.type,

          x: pf.x,
          y: pf.y,

          // Keep ORIGINAL dimensions only
          // Rotation is handled visually in canvas rendering
          w: pf.baseW ?? pf.w,
          h: pf.baseH ?? pf.h,

          rotation: pf.rotation ?? 0,
        },
      ],
    },
  };
}

    case 'BUY_AND_PLACE_FURNITURE': {
  const { item, price } = action.payload;
  if (state.coins < price) {
    return {
      ...state,
      ui: pushPopup(state, `❌ Not enough coins! Need ${price} coins.`, 0),
    };
  }
  return {
    ...state,
    coins: state.coins - price,
    cafe: {
      ...state.cafe,
      pendingFurniture: null,
      furniture: [
        ...state.cafe.furniture,
        {
          ...item,
          id: item.id ?? `furn-${Date.now()}`,
        },
      ],
    },
    ui: pushPopup(state, `🛋️ Placed! -${price} coins`, -price),
  };
}

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
  if (!target) return state;
  const refund = Math.floor((FURNITURE_CATALOG[target.type]?.price ?? 0) * 0.5);
  return {
    ...state,
    coins: state.coins + refund,
    cafe: {
      ...state.cafe,
      furniture: state.cafe.furniture.filter((f) => f.id !== action.payload),
    },
    ui: refund > 0
      ? pushPopup(state, `🪙 Sold for ${refund} coins`, refund)
      : state.ui,
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
    
    case 'CLEAR_SESSION_SUMMARY':
      return { ...state, lastSession: null };

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

    case 'SET_BG_MODE':
  return {
    ...state,
    cafe: { ...state.cafe, bgMode: action.payload },
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
