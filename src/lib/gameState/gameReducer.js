import { getChaosStage, generateChaosEvent } from '@/lib/ai/aiIntegration';
import { pushPopup } from '@/lib/gameState/feedbackHelpers';
import { FURNITURE_CATALOG } from '@/lib/cafe/furnitureCatalog.js';
import { PET_CATALOG } from '@/lib/cafe/petCatalog.js';
import { WARNING_DURATION_MS, CLEAR_CONDITION_MS } from './constants';
import { initialState } from './initialState';
import { calcSessionMins, calcNewStreak, getDateString, getWeekStart } from './gameHelpers';

const REP_PENALTY_INTERVAL_MS = 1500;
const USER_ABSENT_GRACE_MS    = 2000;
// No-face absences shorter than this don't count as a distraction —
// face detection flickers too easily for a raw edge trigger.
const ABSENCE_DISTRACTION_GRACE_MS = 5000;
// After an absence, the face must stay in frame this long to count as
// "back" — a one-frame detection blip doesn't end the absence.
const PRESENCE_RETURN_GRACE_MS = 3000;
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
        attention: { ...state.attention, chaosEvents: [], sessionDistractions: 0, absenceCounted: false, userAbsentSince: null, userPresentSince: null, debugAttentionLock: false },
      };

    case 'PAUSE_FOCUS':
      // Clear the danger clock and detection timers — otherwise a running
      // 30s countdown would instantly expire on resume (wall-clock based),
      // and stale absence/phone-free windows would misfire.
      return {
        ...state,
        focus: { ...state.focus, status: 'paused' },
        attention: {
          ...state.attention,
          phoneWarningStart: null,
          phoneFreeSince: null,
          gazeFocusedSince: null,
          userAbsentSince: null,
          userPresentSince: null,
        },
      };

    case 'RESUME_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'active' } };

    case 'RESET_FOCUS':
      return { ...state, focus: { ...state.focus, status: 'idle', elapsed: 0 } };

    case 'END_FOCUS': {
      if (state.focus.status !== 'active' && state.focus.status !== 'paused' && state.focus.status !== 'distracted') return state;

      // Focus time, distractions, customers, and coins all accumulate live
      // (TICK_FOCUS / PROCESS_AI_EVENT / SERVE_CUSTOMER) — a manually ended or
      // failed session records the session count but earns NO streak: only
      // COMPLETE_FOCUS (the timer reaching its limit) advances the streak.
      const sessionMins = calcSessionMins(state.focus.elapsed, false);
      const coinsEarned = Math.max(0, state.coins - (state.focus.coinsAtStart ?? state.coins));
      const failed      = state.focus.status === 'distracted';
      // A failed session always costs 3 reputation, whatever the chaos stage.
      const reputation  = failed ? Math.max(0, state.reputation - 3) : state.reputation;

      return {
        ...state,
        phase: 'management',
        reputation,
        lastSession: {
          durationSeconds: state.focus.elapsed,
          durationMinutes: sessionMins,
          coinsEarned,
          reputationGain: reputation - (state.focus.reputationAtStart ?? reputation),
          attentionScore:  Math.round(state.attention.score),
          distractions:    state.attention.sessionDistractions,
          endReason: failed ? 'distracted' : 'manual',
          // Streak never changes on a manual/failed end — before === after.
          streakBefore: state.stats.currentStreak,
          streakAfter:  state.stats.currentStreak,
        },
        focus: { ...state.focus, status: 'idle', elapsed: 0 },
        stats: {
          ...state.stats,
          // Session counts toward totals, but streak fields are left untouched —
          // the streak only advances on a timer-completed session.
          totalSessions:   state.stats.totalSessions  + (sessionMins > 0 ? 1 : 0),
          periodSessions:  state.stats.periodSessions + (sessionMins > 0 ? 1 : 0),
        },
        npcs: { ...state.npcs, customers: [] },
        cafe: { ...state.cafe, currentCustomers: 0 },
      };
    }

    case 'TICK_FOCUS': {
      if (state.focus.status !== 'active') return state;

      // All focus-time stats accumulate per tick so autosaves mid-session
      // capture real progress; session end adds nothing on top.
      const nextElapsed = state.focus.elapsed + 1;
      const today = getDateString();
      const dateStr = state.ui.debugDate ?? today;
      const weeklyData = [...state.stats.weeklyData];
      weeklyData[(new Date(dateStr).getDay() + 6) % 7] += 1;
      const minuteCrossed = nextElapsed % 60 === 0;

      return {
        ...state,
        focus: { ...state.focus, elapsed: nextElapsed },
        cafe:  { ...state.cafe,  currentCustomers: state.npcs.customers.length },
        stats: {
          ...state.stats,
          totalFocusSeconds:  state.stats.totalFocusSeconds  + 1,
          todaySeconds:       state.stats.todaySeconds       + 1,
          periodFocusSeconds: state.stats.periodFocusSeconds + 1,
          todayDate:          today,
          weeklyData,
          ...(minuteCrossed
            ? {
                totalMinutes:      state.stats.totalMinutes      + 1,
                totalFocusMinutes: state.stats.totalFocusMinutes + 1,
                todayMinutes:      state.stats.todayMinutes      + 1,
              }
            : {}),
        },
      };
    }

    case 'COMPLETE_FOCUS': {
      // Focus time, distractions, customers, and coins all accumulate live
      // (TICK_FOCUS / PROCESS_AI_EVENT / SERVE_CUSTOMER) — completion only
      // records the session itself and the streak. Customers still in the
      // cafe are NOT counted: only served customers ever reach the stats.
      const sessionMins = calcSessionMins(state.focus.elapsed, true);
      const coinsEarned = Math.max(0, state.coins - (state.focus.coinsAtStart ?? state.coins));
      const today       = state.ui.debugDate ?? getDateString();
      const newStreak   = calcNewStreak(state.stats.currentStreak, state.stats.lastSessionDate, today);

      return {
        ...state,
        phase: 'management',
        lastSession: {
          durationSeconds: state.focus.elapsed,
          durationMinutes: sessionMins,
          coinsEarned,
          reputationGain:  state.reputation - (state.focus.reputationAtStart ?? state.reputation),
          attentionScore:  Math.round(state.attention.score),
          distractions:    state.attention.sessionDistractions,
          endReason:       'completed',
          streakBefore:    state.stats.currentStreak,
          streakAfter:     newStreak,
        },
        focus: { ...state.focus, status: 'completed' },
        stats: {
          ...state.stats,
          totalSessions:   state.stats.totalSessions  + 1,
          periodSessions:  state.stats.periodSessions + 1,
          currentStreak:   newStreak,
          bestStreak:      Math.max(state.stats.bestStreak, newStreak),
          lapsedStreak:    0,
          lastSessionDate: today,
        },
        npcs: { ...state.npcs, customers: [] },
        cafe: { ...state.cafe, currentCustomers: 0 },
      };
    }

    // ── AI / Attention ───────────────────────────────────────────────────────

    case 'PROCESS_AI_EVENT': {
      // Paused sessions are frozen: the camera keeps running (so resume has
      // no model-restart cost) but its events are ignored entirely — no
      // score changes, no danger clock, no distraction counting.
      if (state.focus.status === 'paused') return state;

      const locked    = state.attention.debugAttentionLock;
      const score     = locked ? state.attention.score : (action.payload.attention_score ?? state.attention.score);
      const chaos     = getChaosStage(score);
      const prevLevel = state.attention.chaosLevel;
      const now       = Date.now();

      const nextEvents = [...state.attention.chaosEvents];
      // Emit one flavour message whenever a new (higher) chaos stage is first
      // entered — regardless of whether a phone triggered it.
      if (chaos.level > prevLevel && chaos.level > 0) {
        nextEvents.push({
          message:   generateChaosEvent(chaos.level),
          timestamp: now,
        });
      }

      let { phoneWarningStart, phoneFreeSince, gazeFocusedSince, userAbsentSince, userPresentSince } = state.attention;
      let newFocusStatus = state.focus.status;

      const isGazeFocused = !action.payload.warning_message?.includes('GAZE DISTRACTED');

      // Edge-triggered distraction counting: +1 the moment a distraction
      // STARTS (phone appears, gaze drifts off, or the face stays out of
      // the camera past the grace period) — not per AI event, which stream
      // several times a second. The general "USER NOT FOCUSED" warning state
      // deliberately does NOT count on its own; only these concrete
      // transitions do. Counted live into the chaos stats so mid-session
      // autosaves carry them.
      let newDistractions = 0;
      let absenceCounted = state.attention.absenceCounted; // cleared below once the absence officially ends
      if (state.focus.status === 'active') {
        if (action.payload.phone_detected && !state.attention.phoneDetected) newDistractions += 1;
        if (!isGazeFocused && !state.attention.warningMessage?.includes('GAZE DISTRACTED')) newDistractions += 1;
        const absentFor =
          action.payload.user_present === false && state.attention.userAbsentSince !== null
            ? now - state.attention.userAbsentSince
            : 0;
        if (absentFor >= ABSENCE_DISTRACTION_GRACE_MS && !absenceCounted) {
          newDistractions += 1;
          absenceCounted = true; // once per continuous absence
        }
      }

      // phoneWarningStart is the shared 30s danger clock: it starts when a
      // phone is detected OR the focus score bottoms out at 0, keeps running
      // (without resetting) while either condition holds — so the countdown
      // carries over between the phone banner and the score-0 danger banner —
      // and fails the session when it expires with a condition still active.
      const scoreZero = score <= 0;

      if (action.payload.phone_detected) {
        if (!phoneWarningStart) phoneWarningStart = now;
        phoneFreeSince   = null;
        gazeFocusedSince = null;
      } else {
        if (!phoneFreeSince) phoneFreeSince = now;
        if (isGazeFocused) {
          if (!gazeFocusedSince) gazeFocusedSince = now;
        } else {
          gazeFocusedSince = null;
        }

        const phoneFreeDuration = now - phoneFreeSince;
        const gazeFocusDuration = gazeFocusedSince ? now - gazeFocusedSince : 0;

        if (phoneFreeDuration >= CLEAR_CONDITION_MS && gazeFocusDuration >= CLEAR_CONDITION_MS && !scoreZero) {
          phoneWarningStart = null;
          phoneFreeSince    = null;
          gazeFocusedSince  = null;
          if (state.focus.status === 'distracted') newFocusStatus = 'active';
        }
      }

      // Score 0 starts (or keeps) the danger clock even with no phone in sight.
      if (scoreZero && !phoneWarningStart) phoneWarningStart = now;

      if (
        phoneWarningStart &&
        (action.payload.phone_detected || scoreZero) &&
        now - phoneWarningStart >= WARNING_DURATION_MS
      ) {
        newFocusStatus = 'distracted';
      }

      // Presence tracking with a return grace: after an absence, the face
      // must stay in frame PRESENCE_RETURN_GRACE_MS before the user counts
      // as "back" — a one-frame detection blip doesn't end the absence.
      if (action.payload.user_present) {
        if (!userPresentSince) userPresentSince = now;
        if (userAbsentSince !== null && now - userPresentSince >= PRESENCE_RETURN_GRACE_MS) {
          userAbsentSince = null;
        }
      } else {
        userPresentSince = null;
        if (!userAbsentSince) userAbsentSince = now;
      }
      if (userAbsentSince === null) absenceCounted = false;

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
        stats: newDistractions > 0
          ? {
              ...state.stats,
              chaosEvents:       state.stats.chaosEvents       + newDistractions,
              periodChaosEvents: state.stats.periodChaosEvents + newDistractions,
            }
          : state.stats,
        focus: {
          ...state.focus,
          status: newFocusStatus,
          repPenaltyLastAt: canPenalise ? now : state.focus.repPenaltyLastAt,
        },
        attention: {
          ...state.attention,
          score,
          sessionDistractions: state.attention.sessionDistractions + newDistractions,
          absenceCounted,
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
          userPresentSince,
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
      return {
        ...state,
        cafe: {
          ...state.cafe,
          decorateTool: action.payload,
          // Switching to Remove aborts any in-progress placement (the pending
          // furniture being positioned/rotated).
          ...(action.payload === 'remove'
            ? { pendingFurniture: null, placeFurnitureRotation: 0 }
            : {}),
        },
      };

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
        return { ...state, ui: pushPopup(state, { icon: 'coins', message: '❌ Not enough coins!', shortfall: price - state.coins }) };
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
        return { ...state, ui: pushPopup(state, { icon: 'coins', message: '❌ Not enough coins!', shortfall: pet.price - state.coins }) };
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

    case 'CUSTOMER_TURNED_AWAY':
      return { ...state, ui: pushPopup(state, '😕 The cafe was too cluttered, so a customer left.', 0) };

    case 'SERVE_CUSTOMER':
    case 'REMOVE_CUSTOMER': {
      const customer  = state.npcs.customers.find((c) => c.id === action.payload);
      const remaining = state.npcs.customers.filter((c) => c.id !== action.payload);
      const baseCoins = customer ? 8 + Math.floor(Math.random() * 7) : 0;
      const coinsGain = state.attention.chaosLevel >= 3 ? 0
        : state.attention.chaosLevel >= 2 ? Math.floor(baseCoins * 0.25)  // stage 2: −75%
        : state.attention.chaosLevel >= 1 ? Math.floor(baseCoins * 0.5)   // stage 1: −50%
        : baseCoins;
      // Reputation is earned only while highly focused and calm (score ≥ 85,
      // chaos < 2). From stage 2 up you can't earn it, and an unhappy customer
      // may even take 1 back (more likely the more chaotic it is). Session-fail
      // rep loss is handled separately in END_FOCUS.
      let repGain = 0;
      if (customer) {
        if (state.attention.chaosLevel < 2 && state.attention.score >= 85) {
          repGain = 1;
        } else if (state.attention.chaosLevel >= 2) {
          const takeBackChance = state.attention.chaosLevel >= 3 ? 0.7 : 0.4;
          if (Math.random() < takeBackChance) repGain = -1;
        }
      }
      const emoji     = customer?.emoji ?? '☕';

      let next = {
        ...state,
        npcs:       { ...state.npcs, customers: remaining },
        cafe:       { ...state.cafe, currentCustomers: remaining.length },
        coins:      state.coins + coinsGain,
        reputation: Math.max(0, Math.min(100, state.reputation + repGain)),
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
        // Always carry an explicit amount (even 0 at high chaos) so the coin
        // line shows "+0 coins" rather than being hidden.
        next = { ...next, ui: pushPopup(next, { message: `${emoji} Customer served!`, amount: coinsGain }) };
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
      if (state.cafe?.timeOfDay === action.payload) return state;
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
