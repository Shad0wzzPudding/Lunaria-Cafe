import { getChaosStage } from '@/lib/ai/aiIntegration';
import { pushPopup } from '@/lib/gameState/feedbackHelpers';
import { FURNITURE_CATALOG } from '@/lib/cafe/furnitureCatalog.js';
import { PET_CATALOG } from '@/lib/cafe/petCatalog.js';
import { WARNING_DURATION_MS, CLEAR_CONDITION_MS } from './constants';
import { initialState } from './initialState';
import { calcSessionTotals, calcNewStreak, getDateString, getTodayIndex, getWeekStart } from './gameHelpers';

const REP_PENALTY_INTERVAL_MS = 1500;
const USER_ABSENT_GRACE_MS    = 2000;
const EMPTY_PHONES = [];

export function gameReducer(state, action) {
  switch (action.type) {

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'SET_FOCUS_VIEW_MODE':
      return { ...state, settings: { ...state.settings, focusViewMode: action.payload } };

    case 'ADD_COINS':
      return { ...state, coins: state.coins + action.payload };

    case 'ADD_REPUTATION':
      return { ...state, reputation: state.reputation + action.payload };

    case 'DEBUG_SET_ATTENTION_SCORE': {
      const score = Math.max(0, Math.min(100, action.payload));
      return { ...state, attention: { ...state.attention, score, chaosLevel: getChaosStage(score).level, debugAttentionLock: true } };
    }

    case 'DEBUG_UNLOCK_ATTENTION':
      return { ...state, attention: { ...state.attention, debugAttentionLock: false } };

    case 'DEBUG_SET_STAT': {
      const { key, value } = action.payload;
      const v = Math.max(0, Math.round(Number(value) || 0));
      if (key === 'totalFocusSeconds') {
        return {
          ...state,
          stats: {
            ...state.stats,
            totalFocusSeconds: v,
            totalFocusMinutes: Math.floor(v / 60),
            totalMinutes: Math.floor(v / 60),
          },
        };
      }
      if (key === 'periodFocusSeconds') {
        return { ...state, stats: { ...state.stats, periodFocusSeconds: v } };
      }
      if (key === 'currentStreak') {
        return {
          ...state,
          stats: {
            ...state.stats,
            currentStreak: v,
            bestStreak: Math.max(state.stats.bestStreak, v),
          },
        };
      }
      return { ...state, stats: { ...state.stats, [key]: v } };
    }

    case 'DEBUG_SET_TODAY_SECONDS': {
      const secs = Math.max(0, Math.round(action.payload));
      const weeklyData = [...state.stats.weeklyData];
      const dateStr = state.ui.debugDate ?? state.stats.todayDate ?? getDateString();
      const dayIndex = (new Date(dateStr).getDay() + 6) % 7;
      weeklyData[dayIndex] = secs;
      return {
        ...state,
        stats: {
          ...state.stats,
          todaySeconds: secs,
          todayMinutes: Math.floor(secs / 60),
          weeklyData,
        },
      };
    }

    case 'SET_STATS_MODE': {
      const mode = action.payload === 'lifetime' ? 'lifetime' : 'period';
      return { ...state, stats: { ...state.stats, statsMode: mode } };
    }

    case 'SET_RESET_PERIOD': {
      const period = action.payload === 'weekly' ? 'weekly' : 'daily';
      return { ...state, stats: { ...state.stats, resetPeriod: period } };
    }

    case 'DEBUG_SET_DATE': {
      const newDate = action.payload;
      const prevDate = state.ui.debugDate ?? state.stats.todayDate ?? getDateString();
      const newWeekStart = getWeekStart(newDate);
      const prevWeekStart = getWeekStart(prevDate);
      const resetPeriod = state.stats.resetPeriod ?? 'daily';

      const weekChanged = newWeekStart !== prevWeekStart;
      const dayChanged  = newDate !== prevDate;
      const shouldResetToday = resetPeriod === 'weekly' ? weekChanged : dayChanged;

      const weeklyData = weekChanged ? [0, 0, 0, 0, 0, 0, 0] : [...state.stats.weeklyData];

      return {
        ...state,
        ui: { ...state.ui, debugDate: newDate },
        stats: {
          ...state.stats,
          todaySeconds:         shouldResetToday ? 0 : state.stats.todaySeconds,
          todayMinutes:         shouldResetToday ? 0 : state.stats.todayMinutes,
          periodSessions:       shouldResetToday ? 0 : state.stats.periodSessions,
          periodFocusSeconds:   shouldResetToday ? 0 : state.stats.periodFocusSeconds,
          periodCoinsEarned:    shouldResetToday ? 0 : state.stats.periodCoinsEarned,
          periodCustomersTotal: shouldResetToday ? 0 : state.stats.periodCustomersTotal,
          periodChaosEvents:    shouldResetToday ? 0 : state.stats.periodChaosEvents,
          weeklyData,
        },
      };
    }

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
          repPenaltyLastAt: null,
        },
        attention: { ...state.attention, chaosEvents: [], userAbsentSince: null, debugAttentionLock: false },
      };

    case 'PAUSE_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'paused' } };

    case 'RESUME_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'active' } };

    case 'RESET_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'idle', elapsed: 0 } };

    case 'END_FOCUS': {
      if (state.focus.status !== 'active' && state.focus.status !== 'paused' && state.focus.status !== 'distracted') return state;

      const { sessionMins, extraMins, weeklyData } = calcSessionTotals(state, false, state.ui.debugDate);
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
          reputationGain: state.reputation - (state.focus.reputationAtStart ?? state.reputation),
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
          periodSessions:     state.stats.periodSessions     + (sessionMins > 0 ? 1 : 0),
          periodFocusSeconds: state.stats.periodFocusSeconds + state.focus.elapsed,
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
        const dateStr = state.ui.debugDate ?? getDateString();
        weeklyData[(new Date(dateStr).getDay() + 6) % 7] += 60;
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
      const { sessionMins, extraMins, weeklyData } = calcSessionTotals(state, true, state.ui.debugDate);
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
          reputationGain:  state.reputation - (state.focus.reputationAtStart ?? state.reputation),
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
          periodSessions:        state.stats.periodSessions        + 1,
          periodFocusSeconds:    state.stats.periodFocusSeconds    + state.focus.elapsed,
          periodCustomersTotal:  state.stats.periodCustomersTotal  + servedCount,
          periodChaosEvents:     state.stats.periodChaosEvents     + sessionChaos,
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
      const locked    = state.attention.debugAttentionLock;
      const score     = locked ? state.attention.score : (action.payload.attention_score ?? state.attention.score);
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

      let { phoneWarningStart, phoneFreeSince, gazeFocusedSince, userAbsentSince } = state.attention;
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

      if (action.payload.user_present) {
        userAbsentSince = null;
      } else if (!userAbsentSince) {
        userAbsentSince = now;
      }

      const userAbsentLongEnough = !action.payload.user_present
        && userAbsentSince !== null
        && now - userAbsentSince >= USER_ABSENT_GRACE_MS;

      const canPenalise = (action.payload.phone_detected || userAbsentLongEnough)
        && state.focus.status === 'active'
        && score <= 75
        && (state.focus.repPenaltyLastAt === null || now - state.focus.repPenaltyLastAt >= REP_PENALTY_INTERVAL_MS);
      const reputation = canPenalise
        ? Math.max(0, state.reputation - 1)
        : state.reputation;

      return {
        ...state,
        reputation,
        focus: {
          ...state.focus,
          status: newFocusStatus,
          repPenaltyLastAt: canPenalise ? now : state.focus.repPenaltyLastAt,
        },
        attention: {
          ...state.attention,
          score,
          chaosLevel:     chaos.level,
          phoneDetected:  action.payload.phone_detected  ?? state.attention.phoneDetected,
          userPresent:    action.payload.user_present    ?? state.attention.userPresent,
          warningMessage: action.payload.warning_message ?? '',
          phones:         action.payload.phones?.length ? action.payload.phones : EMPTY_PHONES,
          source:         action.payload.source          ?? state.attention.source,
          chaosEvents:    nextEvents.slice(-10),
          phoneWarningStart,
          phoneFreeSince,
          gazeFocusedSince,
          userAbsentSince,
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
        stats: { ...state.stats, chaosEvents: state.stats.chaosEvents + 1, periodChaosEvents: state.stats.periodChaosEvents + 1 },
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
      const { item, price } = action.payload;
      if (state.coins < price) {
        return { ...state, ui: pushPopup(state, `❌ Not enough coins! Need ${price} coins.`, 0) };
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
       ui: pushPopup(state, {
      icon: 'furniture',
      message: `Furniture placed`,
      amount: -price,
    }),
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
    // ── Pet Shop ─────────────────────────────────────────────────────────────

    case 'BUY_PET': {
      const { petType } = action.payload;
      const pet = PET_CATALOG[petType];
      if (!pet) return state;
      if (state.coins < pet.price) {
        return { ...state, ui: pushPopup(state, `❌ Not enough coins! Need ${pet.price} coins.`, 0) };
      }
      const npcId = `${pet.npcType}-${Date.now()}`;
      const newNpc = {
        id: npcId,
        x: 100 + Math.random() * 500,
        y: 100 + Math.random() * 300,
        mood: pet.mood,
      };
      const npcKey = pet.npcType === 'rabbit' ? 'rabbits' : 'cats';
      return {
        ...state,
        coins: state.coins - pet.price,
        pets: {
          ...state.pets,
          owned: [...(state.pets?.owned ?? []), { id: npcId, type: petType, acquiredAt: Date.now() }],
        },
        npcs: {
          ...state.npcs,
          [npcKey]: [...state.npcs[npcKey], newNpc],
        },
        ui: pushPopup(state, { icon: 'coins', message: `${pet.name} joined your cafe!`, amount: -pet.price }),
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
      const baseCoins = customer ? 8 + Math.floor(Math.random() * 7) : 0;
      const coinsGain = state.attention.chaosLevel >= 3 ? 0
        : state.attention.chaosLevel >= 1 ? Math.floor(baseCoins * 0.5)
        : baseCoins;
      const repGain   = customer && state.attention.chaosLevel < 2 ? 1 : 0;
      const emoji     = customer?.emoji ?? '☕';

      let next = {
        ...state,
        npcs:       { ...state.npcs, customers: remaining },
        cafe:       { ...state.cafe, currentCustomers: remaining.length },
        coins:      state.coins + coinsGain,
        reputation: Math.min(100, state.reputation + repGain),
        stats: {
          ...state.stats,
          customersTotal:       state.stats.customersTotal       + 1,
          coinsEarned:          state.stats.coinsEarned          + coinsGain,
          periodCustomersTotal: state.stats.periodCustomersTotal + 1,
          periodCoinsEarned:    state.stats.periodCoinsEarned    + coinsGain,
        },
      };
      const isZen = state.settings.focusViewMode === 'zen';
      if (customer && !isZen) {
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

    case 'UPDATE_CAT':
      return {
        ...state,
        npcs: {
          ...state.npcs,
          cats: state.npcs.cats.map((c) =>
            c.id === action.payload.id ? { ...c, ...action.payload } : c
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

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    // ── Meta ─────────────────────────────────────────────────────────────────

    case 'HYDRATE':
      return { ...action.payload, ui: initialState.ui };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
