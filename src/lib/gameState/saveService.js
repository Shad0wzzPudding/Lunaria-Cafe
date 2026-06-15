import { supabase } from '@/lib/supabase';

function getDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

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
    stats: {
      ...stats,
      dailyGoal: normalizePositiveNumber(stats.dailyGoal, 60),
      todayDate: stats.todayDate ?? (stats.todaySeconds > 0 ? today : null),
      weeklyDataUnit: 'seconds',
      weekStartDate: stats.weekStartDate ?? getWeekStart(today),
    },
    npcs: {
      rabbits: state.npcs.rabbits,
      major: state.npcs.major,
      customers: [],
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

  // ── Daily reset ──────────────────────────────────────────────
  const loadedTodayDate = loadedStats.todayDate ?? loadedStats.lastSessionDate;
  const isToday = loadedTodayDate === today;
  const todayMinutes = isToday ? normalizeNonNegativeNumber(loadedStats.todayMinutes) : 0;
  const todaySeconds = isToday
    ? normalizeNonNegativeNumber(
        loadedStats.todaySeconds,
        normalizeNonNegativeNumber(loadedStats.todayMinutes) * 60
      )
    : 0;

  // ── Weekly reset ─────────────────────────────────────────────
  const currentWeekStart = getWeekStart(today);
  const isSameWeek = loadedStats.weekStartDate === currentWeekStart;

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
      ...loaded.cafe,
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
    stats: {
      ...initialState.stats,
      ...loadedStats,
      dailyGoal,
      todayMinutes,          // ← overwrite with reset-aware value
      todaySeconds,          // ← overwrite with reset-aware value
      weeklyData,            // ← overwrite with reset-aware value
      weekStartDate: currentWeekStart, // ← persist so next load can compare
    },
    npcs: {
      ...initialState.npcs,
      customers: [],
      rabbits:
        loaded.npcs?.rabbits?.length > 0
          ? loaded.npcs.rabbits
          : initialState.npcs.rabbits,
      major:
        loaded.npcs?.major?.length > 0
          ? loaded.npcs.major
          : initialState.npcs.major,
    },
    phase: 'menu',
    focus: { ...initialState.focus },
    attention: { ...initialState.attention },
    ui: { ...initialState.ui },
  };
}

export async function loadPlayerSave(userId) {
  const { data, error } = await supabase
    .from('player_saves')
    .select('save_data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.save_data ?? null;
}

export async function savePlayerSave(userId, state) {
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
