import { createContext, useContext, useReducer, useCallback } from 'react';
import { getChaosStage } from '@/lib/aiIntegration';

const initialState = {
  phase: 'menu',
  coins: 0,
  reputation: 0,
  cafe: {
    name: 'Lunaria Cafe',
    currentCustomers: 0,
    maxCustomers: 8,
    furniture: [
      { type: 'counter',    x: 50,  y: 80,  w: 160, h: 50 },
    { type: 'brewing',    x: 230, y: 85,  w: 50,  h: 45 },
    { type: 'table',      x: 100, y: 220, w: 80,  h: 50 },
    { type: 'table',      x: 300, y: 280, w: 80,  h: 50 },
    { type: 'table',      x: 500, y: 220, w: 80,  h: 50 },
    { type: 'shelf',      x: 620, y: 70,  w: 80,  h: 100 },
    { type: 'plant',      x: 30,  y: 380, w: 32,  h: 32 },
    { type: 'window',     x: 200, y: 5,   w: 80,  h: 45 },
    { type: 'window',     x: 460, y: 5,   w: 80,  h: 45 },
    { type: 'fireplace',  x: 340, y: 60,  w: 60,  h: 50 },
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

    case 'TICK_FOCUS':
      if (state.focus.status !== 'active') return state;
      return {
        ...state,
        focus: { ...state.focus, elapsed: state.focus.elapsed + 1 },
        cafe: {
          ...state.cafe,
          currentCustomers: state.npcs.customers.length,
        },
      };

    case 'COMPLETE_FOCUS': {
      const mins = Math.floor(state.focus.elapsed / 60);
      const coinsEarned = Math.max(1, Math.floor(mins * 2 * (state.attention.score / 100)));
      return {
        ...state,
        focus: { ...state.focus, status: 'completed' },
        coins: state.coins + coinsEarned,
        stats: {
          ...state.stats,
          totalSessions: state.stats.totalSessions + 1,
          totalMinutes: state.stats.totalMinutes + mins,
        },
      };
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

    case 'REMOVE_CUSTOMER':
      return {
        ...state,
        npcs: {
          ...state.npcs,
          customers: state.npcs.customers.filter((c) => c.id !== action.payload),
        },
        cafe: {
          ...state.cafe,
          currentCustomers: Math.max(
            0,
            state.npcs.customers.filter((c) => c.id !== action.payload).length,
          ),
        },
      };

    case 'SET_AUDIO':
      return {
        ...state,
        audio: { ...state.audio, ...action.payload },
      };

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
    
    default:
      return state;
  }
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const processAIEvent = useCallback((event) => {
    dispatch({ type: 'PROCESS_AI_EVENT', payload: event });
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch, processAIEvent }}>
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
