import { getChaosStage } from '@/lib/ai/aiIntegration';
import { pushPopup } from '@/lib/gameState/feedbackHelpers';
import { FURNITURE_CATALOG } from '@/lib/cafe/furnitureCatalog.js';
import { WARNING_DURATION_MS, CLEAR_CONDITION_MS } from './constants';
import { initialState } from './initialState';
import { calcSessionTotals, calcNewStreak, getDateString } from './gameHelpers';

export function gameReducer(state, action) {
  switch (action.type) {

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'ADD_COINS':
      return { ...state, coins: state.coins + action.payload };

    case 'ADD_REPUTATION':
      return { ...state, reputation: state.reputation + action.payload };

    case 'SET_DAILY_GOAL': {
      const dailyGoal = Number(action.payload);
      if (!Number.isFinite(dailyGoal) || dailyGoal <= 0) return state;

      return {
        ...state,
        stats: {
          ...state.stats,
          dailyGoal: Math.round(dailyGoal),
        },
      };
    }

    // ── Focus ────────────────────────────────────────────────────────────────

    case 'START_FOCUS':
      return {
        ...state,
        focus: {
          ...state.focus,
          status: 'active',
          elapsed: 0,
          coinsAtStart: state.coins,
          reputationAtStart: state.reputation,
        },
        attention: { ...state.attention, chaosEvents: [] },
      };

    case 'PAUSE_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'paused' } };

    case 'RESUME_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'active' } };

    case 'RESET_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'idle', elapsed: 0 } };

    case 'END_FOCUS': {
      if (state.focus.status !== 'active' && state.focus.status !== 'paused' && state.focus.status !== 'distracted') return state;

      const { sessionMins, extraMins, weeklyData } = calcSessionTotals(state, false);
      const coinsEarned = Math.max(0, state.coins - (state.focus.coinsAtStart ?? state.coins));
      const newStreak   = sessionMins > 0
        ? calcNewStreak(state.stats.currentStreak, state.stats.lastSessionDate)
        : state.stats.currentStreak;

      return {
        ...state,
        phase: 'management',
        lastSession: {
          durationSeconds: state.focus.elapsed,
          durationMinutes: sessionMins,
          coinsEarned,
          reputationGain: Math.max(0, state.reputation - (state.focus.reputationAtStart ?? state.reputation)),
          attentionScore:  Math.round(state.attention.score),
          distractions:    state.attention.chaosEvents.length,
          endReason: state.focus.status === 'distracted' ? 'distracted' : 'manual',
        },
        focus: { ...state.focus, status: 'idle', elapsed: 0 },
        stats: {
          ...state.stats,
          totalSessions:     state.stats.totalSessions + (sessionMins > 0 ? 1 : 0),
          totalFocusSeconds: state.stats.totalFocusSeconds + state.focus.elapsed,
          totalMinutes:      state.stats.totalMinutes      + extraMins,
          totalFocusMinutes: state.stats.totalFocusMinutes + extraMins,
          todayMinutes:      state.stats.todayMinutes      + extraMins,
          todaySeconds:      state.stats.todaySeconds      + state.focus.elapsed,
          todayDate:         state.focus.elapsed > 0 ? getDateString() : state.stats.todayDate,
          weeklyData,
          currentStreak:   newStreak,
          lastSessionDate: sessionMins > 0 ? getDateString() : state.stats.lastSessionDate,
        },
        npcs: { ...state.npcs, customers: [] },
        cafe: { ...state.cafe, currentCustomers: 0 },
      };
    }

    case 'TICK_FOCUS': {
      if (state.focus.status !== 'active') return state;

      const nextElapsed = state.focus.elapsed + 1;
      const base = {
        ...state,
        focus: { ...state.focus, elapsed: nextElapsed },
        cafe:  { ...state.cafe,  currentCustomers: state.npcs.customers.length },
      };

      if (nextElapsed > 0 && nextElapsed % 60 === 0) {
        const weeklyData = [...state.stats.weeklyData];
        weeklyData[(new Date().getDay() + 6) % 7] += 60;
        return {
          ...base,
          stats: {
            ...state.stats,
            totalMinutes:      state.stats.totalMinutes      + 1,
            totalFocusMinutes: state.stats.totalFocusMinutes + 1,
            todayMinutes:      state.stats.todayMinutes      + 1,
            todayDate:         getDateString(),
            weeklyData,
          },
        };
      }
      return base;
    }

    case 'COMPLETE_FOCUS': {
      const { sessionMins, extraMins, weeklyData } = calcSessionTotals(state, true);
      const coinsEarned  = Math.max(0, state.coins - (state.focus.coinsAtStart ?? state.coins));
      const servedCount  = state.npcs.customers.length;
      const sessionChaos = state.attention.chaosEvents.length;
      const newStreak    = calcNewStreak(state.stats.currentStreak, state.stats.lastSessionDate);

      return {
        ...state,
        phase: 'management',
        lastSession: {
          durationSeconds: state.focus.elapsed,
          durationMinutes: sessionMins,
          coinsEarned,
          reputationGain:  0,
          attentionScore:  Math.round(state.attention.score),
          distractions:    sessionChaos,
        },
        focus: { ...state.focus, status: 'completed' },
        stats: {
          ...state.stats,
          totalSessions:     state.stats.totalSessions + 1,
          totalFocusSeconds: state.stats.totalFocusSeconds + state.focus.elapsed,
          totalMinutes:      state.stats.totalMinutes      + extraMins,
          totalFocusMinutes: state.stats.totalFocusMinutes + extraMins,
          todayMinutes:      state.stats.todayMinutes      + extraMins,
          todaySeconds:      state.stats.todaySeconds      + state.focus.elapsed,
          todayDate:         state.focus.elapsed > 0 ? getDateString() : state.stats.todayDate,
          weeklyData,
          customersTotal: state.stats.customersTotal + servedCount,
          chaosEvents:    state.stats.chaosEvents    + sessionChaos,
          currentStreak:  newStreak,
          bestStreak:     Math.max(state.stats.bestStreak, newStreak),
          lastSessionDate: getDateString(),
        },
        npcs: { ...state.npcs, customers: [] },
        cafe: { ...state.cafe, currentCustomers: 0 },
      };
    }

    // ── AI / Attention ───────────────────────────────────────────────────────

    case 'PROCESS_AI_EVENT': {
      const score     = action.payload.attention_score ?? state.attention.score;
      const chaos     = getChaosStage(score);
      const prevLevel = state.attention.chaosLevel;
      const now       = Date.now();

      const nextEvents = [...state.attention.chaosEvents];
      if (chaos.level > prevLevel && chaos.level > 0 && action.payload.phone_detected) {
        nextEvents.push({
          message:   action.payload.warning_message || `Chaos level: ${chaos.name}`,
          timestamp: now,
        });
      }

      let { phoneWarningStart, phoneFreeSince, gazeFocusedSince } = state.attention;
      let newFocusStatus = state.focus.status;

      const isGazeFocused = !action.payload.warning_message?.includes('GAZE DISTRACTED');

      if (action.payload.phone_detected) {
        if (!phoneWarningStart) phoneWarningStart = now;
        phoneFreeSince   = null;
        gazeFocusedSince = null;
        if (now - phoneWarningStart >= WARNING_DURATION_MS) {
          newFocusStatus = 'distracted';
        }
      } else {
        if (!phoneFreeSince) phoneFreeSince = now;
        if (isGazeFocused) {
          if (!gazeFocusedSince) gazeFocusedSince = now;
        } else {
          gazeFocusedSince = null;
        }

        const phoneFreeDuration = now - phoneFreeSince;
        const gazeFocusDuration = gazeFocusedSince ? now - gazeFocusedSince : 0;

        if (phoneFreeDuration >= CLEAR_CONDITION_MS && gazeFocusDuration >= CLEAR_CONDITION_MS) {
          phoneWarningStart = null;
          phoneFreeSince    = null;
          gazeFocusedSince  = null;
          if (state.focus.status === 'distracted') newFocusStatus = 'active';
        }
      }

      return {
        ...state,
        attention: {
          ...state.attention,
          score,
          chaosLevel:     chaos.level,
          phoneDetected:  action.payload.phone_detected  ?? state.attention.phoneDetected,
          userPresent:    action.payload.user_present    ?? state.attention.userPresent,
          warningMessage: action.payload.warning_message ?? '',
          source:         action.payload.source          ?? state.attention.source,
          chaosEvents:    nextEvents.slice(-10),
          phoneWarningStart,
          phoneFreeSince,
          gazeFocusedSince,
        },
        focus: { ...state.focus, status: newFocusStatus },
      };
    }

    case 'ADD_CHAOS_EVENT':
      return {
        ...state,
        attention: {
          ...state.attention,
          chaosEvents: [...state.attention.chaosEvents.slice(-9), action.payload],
        },
        stats: { ...state.stats, chaosEvents: state.stats.chaosEvents + 1 },
      };

    // ── Journal ──────────────────────────────────────────────────────────────

    case 'SET_JOURNAL_NOTE_HEADER':
      return {
        ...state,
        journal: {
          ...(state.journal ?? initialState.journal),
          noteHeader: String(action.payload ?? ''),
        },
      };

    case 'SET_JOURNAL_NOTE':
      return {
        ...state,
        journal: {
          ...(state.journal ?? initialState.journal),
          note: String(action.payload ?? ''),
        },
      };

    case 'SET_TODO_HEADER':
      return {
        ...state,
        journal: {
          ...(state.journal ?? initialState.journal),
          todoHeader: String(action.payload ?? ''),
        },
      };

    case 'ADD_TODO': {
      const text = typeof action.payload === 'string'
        ? action.payload.trim()
        : String(action.payload?.text ?? '').trim();
      if (!text) return state;

      const journal = state.journal ?? initialState.journal;
      return {
        ...state,
        journal: {
          ...journal,
          todos: [
            ...journal.todos,
            {
              id: action.payload?.id ?? `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              text,
              completed: false,
              createdAt: action.payload?.createdAt ?? Date.now(),
            },
          ],
        },
      };
    }

    case 'TOGGLE_TODO': {
      const journal = state.journal ?? initialState.journal;
      return {
        ...state,
        journal: {
          ...journal,
          todos: journal.todos.map((todo) =>
            todo.id === action.payload
              ? { ...todo, completed: !todo.completed }
              : todo
          ),
        },
      };
    }

    case 'REMOVE_TODO': {
      const journal = state.journal ?? initialState.journal;
      return {
        ...state,
        journal: {
          ...journal,
          todos: journal.todos.filter((todo) => todo.id !== action.payload),
        },
      };
    }

    // ── Decoration ───────────────────────────────────────────────────────────

    case 'SET_DECORATE_MODE':
      return {
        ...state,
        cafe: {
          ...state.cafe,
          decorateMode:           action.payload,
          decorateTool:           'place',
          placeFurnitureRotation: 0,
          pendingFurniture:       null,
        },
      };

    case 'SET_DECORATE_TOOL':
      return { ...state, cafe: { ...state.cafe, decorateTool: action.payload } };

    case 'SET_PLACE_FURNITURE':
      return { ...state, cafe: { ...state.cafe, placeFurnitureType: action.payload, decorateTool: 'place' } };

    case 'SET_PLACE_ROTATION':
      return { ...state, cafe: { ...state.cafe, placeFurnitureRotation: action.payload } };

    case 'SET_PENDING_FURNITURE': {
      const pf = action.payload;
      if (!pf) return { ...state, cafe: { ...state.cafe, pendingFurniture: null } };
      const baseW = pf.baseW ?? pf.w;
      const baseH = pf.baseH ?? pf.h;
      return { ...state, cafe: { ...state.cafe, pendingFurniture: { ...pf, baseW, baseH } } };
    }

    case 'ROTATE_PENDING_FURNITURE': {
      const pf = state.cafe.pendingFurniture;
      if (!pf) return state;
      const newRotation = ((pf.rotation ?? 0) + action.payload + 360) % 360;
      return { ...state, cafe: { ...state.cafe, pendingFurniture: { ...pf, rotation: newRotation } } };
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
              id:       pf.id,
              type:     pf.type,
              x:        pf.x,
              y:        pf.y,
              w:        pf.baseW ?? pf.w,
              h:        pf.baseH ?? pf.h,
              rotation: pf.rotation ?? 0,
            },
          ],
        },
      };
    }

  case 'BUY_AND_PLACE_FURNITURE': {
  const { item } = action.payload;

  const price = action.payload.price ?? item.price ?? 0;

  if (state.coins < price) {
    return {
      ...state,
      ui: pushPopup(
        state,
        `❌ Not enough coins! Need ${price} coins.`,
        0
      )
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
        { ...item, id: item.id ?? `furn-${Date.now()}` },
      ],
    },
    ui: pushPopup(
      state,
      {
        icon: 'furniture',
        message: 'Furniture placed',
      },
      -price
    ),
  };
}

    case 'ADD_FURNITURE':
      return {
        ...state,
        cafe: {
          ...state.cafe,
          furniture: [
            ...state.cafe.furniture,
            { ...action.payload, id: action.payload.id ?? `furn-${Date.now()}` },
          ],
        },
      };

    case 'REMOVE_FURNITURE': {
  const target = state.cafe.furniture.find((f) => f.id === action.payload);
  if (!target) return state;

  const refund = Math.floor(
    (FURNITURE_CATALOG[target.type]?.price ?? 0) * 0.5
  );

  return {
    ...state,
    coins: state.coins + refund,
    cafe: {
      ...state.cafe,
      furniture: state.cafe.furniture.filter(
        (f) => f.id !== action.payload
      ),
    },
    ui:
      refund > 0
        ? pushPopup(state, {
            icon: 'coins',
            message: `Furniture sold`,
            amount: refund,
          })
        : state.ui,
  };
}
    // ── UI ───────────────────────────────────────────────────────────────────

    case 'DISMISS_UI_POPUP':
      return { ...state, ui: { ...state.ui, popups: state.ui.popups.filter((p) => p.id !== action.payload) } };

    case 'CLEAR_COIN_FLOAT':
      return { ...state, ui: { ...state.ui, coinFloat: null } };

    case 'CLEAR_SESSION_SUMMARY':
      return { ...state, lastSession: null };

    // ── NPCs ─────────────────────────────────────────────────────────────────

    case 'ADD_CUSTOMER':
      return {
        ...state,
        npcs: { ...state.npcs, customers: [...state.npcs.customers, action.payload] },
        cafe: { ...state.cafe, currentCustomers: state.npcs.customers.length + 1 },
      };

    case 'SERVE_CUSTOMER':
    case 'REMOVE_CUSTOMER': {
      const customer  = state.npcs.customers.find((c) => c.id === action.payload);
      const remaining = state.npcs.customers.filter((c) => c.id !== action.payload);
      const coinsGain = customer ? 8 + Math.floor(Math.random() * 7) : 0;
      const repGain   = customer ? 2 : 0;
      const emoji     = customer?.emoji ?? '☕';

      let next = {
        ...state,
        npcs:       { ...state.npcs, customers: remaining },
        cafe:       { ...state.cafe, currentCustomers: remaining.length },
        coins:      state.coins + coinsGain,
        reputation: Math.min(100, state.reputation + repGain),
        stats: {
          ...state.stats,
          customersTotal: state.stats.customersTotal + 1,
          coinsEarned:    state.stats.coinsEarned    + coinsGain,
        },
      };
      if (customer) {
        next = { ...next, ui: pushPopup(next, `${emoji} Customer served!`, coinsGain) };
      }
      return next;
    }

    case 'UPDATE_RABBIT':
      return {
        ...state,
        npcs: {
          ...state.npcs,
          rabbits: state.npcs.rabbits.map((r) =>
            r.id === action.payload.id ? { ...r, ...action.payload } : r
          ),
        },
      };

    // ── Audio / Cafe meta ────────────────────────────────────────────────────

    case 'SET_AUDIO':
      return { ...state, audio: { ...state.audio, ...action.payload } };

    case 'SET_TIME_OF_DAY':
      return { ...state, cafe: { ...state.cafe, timeOfDay: action.payload } };

    case 'SET_BG_MODE':
      return { ...state, cafe: { ...state.cafe, bgMode: action.payload } };

    // ── Meta ─────────────────────────────────────────────────────────────────

    case 'HYDRATE':
      return { ...action.payload, ui: initialState.ui };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
