import { supabase } from '@/lib/supabase';

/** Fields we persist (skip volatile in-session state). */
export function serializeGameState(state) {
  return {
    coins: state.coins,
    reputation: state.reputation,
    cafe: {
      ...state.cafe,
      currentCustomers: 0,
      decorateMode: false,
    },
    audio: state.audio,
    stats: state.stats,
    npcs: {
      rabbits: state.npcs.rabbits,
      major: state.npcs.major,
      customers: [],
    },
  };
}

export function mergeLoadedSave(loaded, initialState) {
  if (!loaded || typeof loaded !== 'object') return null;

    const today = new Date().toISOString().split('T')[0]; // "2026-05-25"
  const loadedStats = loaded.stats ?? {};

  // ── Daily reset ──────────────────────────────────────────────
  const todayMinutes =
    loadedStats.lastSessionDate === today
      ? (loadedStats.todayMinutes ?? 0)
      : 0; // new day → reset

  // ── Weekly reset ─────────────────────────────────────────────
  const getWeekStart = (dateStr) => {
    const d = new Date(dateStr);
    const diff = (d.getDay() + 6) % 7; // days since Monday
    d.setDate(d.getDate() - diff);
    return d.toISOString().split('T')[0];
  };
  const currentWeekStart = getWeekStart(today);
  const weeklyData =
    loadedStats.weekStartDate === currentWeekStart
      ? (loadedStats.weeklyData ?? initialState.stats.weeklyData)
      : [0, 0, 0, 0, 0, 0, 0]; // new week → reset

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
    stats: {...initialState.stats, ...loadedStats,
      todayMinutes,          // ← overwrite with reset-aware value
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