import { supabase } from '@/lib/supabase';
import { initialState } from './initialState';
import { getDateString, getWeekStart, daysBetween } from './gameHelpers';

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeWeeklyData(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return fallback.map((defaultValue, index) =>
    normalizeNonNegativeNumber(source[index], defaultValue)
  );
}

function normalizeJournal(value, fallback) {
  const journal = value && typeof value === 'object' ? value : {};
  const fallbackTodos = Array.isArray(fallback.todos) ? fallback.todos : [];
  const sourceTodos = Array.isArray(journal.todos) ? journal.todos : fallbackTodos;

  return {
    noteHeader: typeof journal.noteHeader === 'string' ? journal.noteHeader : fallback.noteHeader,
    note: typeof journal.note === 'string' ? journal.note : fallback.note,
    todoHeader: typeof journal.todoHeader === 'string' ? journal.todoHeader : fallback.todoHeader,
    todos: sourceTodos
      .filter((todo) => todo && typeof todo === 'object')
      .map((todo, index) => ({
        id: String(todo.id ?? `loaded-todo-${index}`),
        text: typeof todo.text === 'string' ? todo.text : '',
        completed: Boolean(todo.completed),
        createdAt: normalizeNonNegativeNumber(todo.createdAt, 0),
      }))
      .filter((todo) => todo.text.trim().length > 0),
  };
}

/** Fields we persist (skip volatile in-session state). */
export function serializeGameState(state) {
  const today = getDateString();
  const stats = state.stats ?? {};

  return {
    coins: state.coins,
    reputation: state.reputation,
    cafe: {
      ...state.cafe,
      currentCustomers: 0,
      decorateMode: false,
    },
    audio: state.audio,
    settings: state.settings,
    journal: normalizeJournal(state.journal, initialState.journal),
    stats: {
      ...stats,
      dailyGoal: normalizePositiveNumber(stats.dailyGoal, 60),
      todayDate: stats.todayDate ?? (stats.todaySeconds > 0 ? today : null),
      weeklyDataUnit: 'seconds',
      weekStartDate: stats.weekStartDate ?? getWeekStart(today),
    },
    npcs: {
      rabbits: state.npcs.rabbits,
      cats: state.npcs.cats,
      major: state.npcs.major,
      customers: [],
    },
    pets: {
      owned: state.pets?.owned ?? [],
    },
    boosts: {
      starterPackClaimed: Boolean(state.boosts?.starterPackClaimed),
      focusTickets: normalizeNonNegativeNumber(state.boosts?.focusTickets, 0),
    },
  };
}

export function mergeLoadedSave(loaded, initialState) {
  if (!loaded || typeof loaded !== 'object') return null;

  const today = getDateString();
  const loadedStats = loaded.stats ?? {};
  const dailyGoal = normalizePositiveNumber(
    loadedStats.dailyGoal,
    initialState.stats.dailyGoal
  );

  // ── Daily / weekly reset ─────────────────────────────────────
  const resetPeriod = loadedStats.resetPeriod ?? 'daily';
  const loadedTodayDate = loadedStats.todayDate ?? loadedStats.lastSessionDate;
  const isToday = loadedTodayDate === today;
  const currentWeekStart = getWeekStart(today);
  const isSameWeek = loadedStats.weekStartDate === currentWeekStart;

  const keepTodayProgress = resetPeriod === 'weekly' ? isSameWeek : isToday;
  const todayMinutes = keepTodayProgress ? normalizeNonNegativeNumber(loadedStats.todayMinutes) : 0;
  const todaySeconds = keepTodayProgress
    ? normalizeNonNegativeNumber(
        loadedStats.todaySeconds,
        normalizeNonNegativeNumber(loadedStats.todayMinutes) * 60
      )
    : 0;
  const periodSessions       = keepTodayProgress ? normalizeNonNegativeNumber(loadedStats.periodSessions)       : 0;
  const periodFocusSeconds   = keepTodayProgress ? normalizeNonNegativeNumber(loadedStats.periodFocusSeconds)   : 0;
  const periodCoinsEarned    = keepTodayProgress ? normalizeNonNegativeNumber(loadedStats.periodCoinsEarned)    : 0;
  const periodCustomersTotal = keepTodayProgress ? normalizeNonNegativeNumber(loadedStats.periodCustomersTotal) : 0;
  const periodChaosEvents    = keepTodayProgress ? normalizeNonNegativeNumber(loadedStats.periodChaosEvents)    : 0;

  // ── Streak lapse check ────────────────────────────────────────
  // A streak stays alive only if the last session was today or yesterday.
  // A gap of 2+ days means it lapsed while the app was closed → reset to 0.
  // (With no recorded date we can't tell, so we leave the loaded value as-is.)
  const lastSessionDate = loadedStats.lastSessionDate ?? null;
  const loadedStreak = normalizeNonNegativeNumber(loadedStats.currentStreak);
  const streakLapsed = lastSessionDate ? daysBetween(today, lastSessionDate) >= 2 : false;
  const currentStreak = streakLapsed ? 0 : loadedStreak;
  // Preserve the just-lost run so the UI can show it struck through. If we
  // already lapsed on an earlier load (loadedStreak is 0), keep the value we
  // stored then rather than overwriting it with 0.
  const lapsedStreak = streakLapsed
    ? (loadedStreak > 0 ? loadedStreak : normalizeNonNegativeNumber(loadedStats.lapsedStreak))
    : 0;

  // ── Legacy cafe keys ──────────────────────────────────────────
  // Keys the game has stopped writing, dropped on the way IN. `save_data` is
  // one schemaless blob, so anything an old build stored would otherwise be
  // spread into live state here and written straight back out by the next
  // autosave — which makes a database scrub impossible to land while any
  // client still holds a pre-scrub save in memory.
  //   maxCustomers — seats derive from cafe.upgrades (maxCustomersFor) now
  //   fullNotice   — a "cafe is full" flag that existed for one afternoon
  const loadedCafe = { ...(loaded.cafe ?? {}) };
  delete loadedCafe.maxCustomers;
  delete loadedCafe.fullNotice;

  // ── Weekly chart reset ────────────────────────────────────────
  let weeklyData;
  if (!isSameWeek) {
    // New week — reset entirely
    weeklyData = [0, 0, 0, 0, 0, 0, 0];
  } else if (loadedStats.weeklyDataUnit === 'seconds') {
    // Same week, current format — normalize values only
    weeklyData = normalizeWeeklyData(loadedStats.weeklyData, initialState.stats.weeklyData);
  } else {
    // Same week, old format (minutes) — convert to seconds
    weeklyData = normalizeWeeklyData(loadedStats.weeklyData, initialState.stats.weeklyData)
      .map(mins => mins * 60);
  }

  return {
    ...initialState,
    coins: loaded.coins ?? initialState.coins,
    reputation: loaded.reputation ?? initialState.reputation,
    cafe: {
      ...initialState.cafe,
      ...loadedCafe,
      furniture:
        loaded.cafe?.furniture?.length > 0
          ? loaded.cafe.furniture.map((f, i) => ({
              ...f,
              id: f.id ?? `legacy-${i}`,
            }))
          : initialState.cafe.furniture,
      decorateTool: 'place',
      currentCustomers: 0,
      decorateMode: false,
    },
    audio: { ...initialState.audio, ...loaded.audio },
    settings: { ...initialState.settings, ...loaded.settings },
    boosts: {
      starterPackClaimed: Boolean(loaded.boosts?.starterPackClaimed),
      focusTickets: normalizeNonNegativeNumber(loaded.boosts?.focusTickets, 0),
    },
    journal: normalizeJournal(loaded.journal, initialState.journal),
    stats: {
      ...initialState.stats,
      ...loadedStats,
      currentStreak,
      lapsedStreak,
      dailyGoal,
      todayMinutes,
      todaySeconds,
      periodSessions,
      periodFocusSeconds,
      periodCoinsEarned,
      periodCustomersTotal,
      periodChaosEvents,
      weeklyData,
      weekStartDate: currentWeekStart,
    },
    npcs: {
      ...initialState.npcs,
      customers: [],
      rabbits:
        loaded.npcs?.rabbits?.length > 0
          ? loaded.npcs.rabbits
          : initialState.npcs.rabbits,
      cats:
        loaded.npcs?.cats?.length > 0
          ? loaded.npcs.cats
          : initialState.npcs.cats,
      major:
        loaded.npcs?.major?.length > 0
          ? loaded.npcs.major
          : initialState.npcs.major,
    },
    pets: {
      owned: Array.isArray(loaded.pets?.owned)
        ? loaded.pets.owned.filter((p) => p && typeof p.type === 'string')
        : initialState.pets.owned,
    },
    phase: 'menu',
    focus: { ...initialState.focus },
    attention: { ...initialState.attention },
    ui: { ...initialState.ui },
  };
}

export async function loadPlayerSave(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('player_saves')
    .select('save_data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.save_data ?? null;
}

export async function savePlayerSave(userId, state) {
  if (!supabase) return;
  const save_data = serializeGameState(state);
  const { error } = await supabase.from('player_saves').upsert(
    {
      user_id: userId,
      save_data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}
