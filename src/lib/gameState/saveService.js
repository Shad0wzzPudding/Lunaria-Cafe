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

/**
 * The dedupe key: save CONTENT only, never a timestamp.
 *
 * `npcs` is excluded because CafeCanvas wanders the rabbits and cats on a
 * timer, re-dispatching their x/y every few seconds. Including them meant the
 * fingerprint never repeated while the cafe was open, so the alt-tab de-dupe
 * never fired there and ten tab switches wrote ten full jsonb upserts. Their
 * positions still get SAVED — they simply do not, on their own, justify a
 * write when nothing else about the cafe changed.
 */
function fingerprintOf(userId, save_data) {
  const rest = { ...(save_data ?? {}) };
  delete rest.npcs;
  return JSON.stringify({ user_id: userId, save_data: rest });
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
  // Record what was just written, rather than resetting to the "nothing sent
  // yet" sentinel. Setting null meant the 30s autosave wiped the fingerprint
  // every interval, so the very next tab switch re-POSTed an identical payload
  // — the de-dupe almost never fired in practice.
  lastSentFingerprint = fingerprintOf(userId, save_data);
}

// ── Saving while the page is going away ─────────────────────────────────
//
// savePlayerSave() cannot do this job. It goes through supabase-js, which
// issues an ordinary fetch, and the browser CANCELS in-flight requests when a
// document tears down — `beforeunload` never awaits a promise. So the old
// unload handler was racing teardown and usually losing: coins, reputation and
// focus time went backwards on a quick reload, and the welcome letter kept
// reappearing because its acknowledgement never landed.
//
// `keepalive: true` is the fix the platform provides: such a request is
// explicitly permitted to outlive the document. It cannot go through
// supabase-js, so the REST call is built by hand.

const REST_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The access token has to be readable SYNCHRONOUSLY at unload time, and
// supabase.auth.getSession() is async — awaiting it during teardown is exactly
// the race being fixed. So it is mirrored here as the session changes.
let accessToken = null;
// Bumped by every authoritative update. An async read that resolves after a
// newer one has landed is discarded rather than overwriting it — otherwise a
// TOKEN_REFRESHED arriving mid-flight could be clobbered by the older
// snapshot, and the next exit save would 401 with a stale JWT.
let tokenEpoch = 0;
if (supabase) {
  const adopt = (session) => {
    tokenEpoch += 1;
    accessToken = session?.access_token ?? null;
  };
  supabase.auth.getSession().then(({ data }) => adopt(data?.session));
  supabase.auth.onAuthStateChange((_event, session) => adopt(session));

  // supabase-js pauses auto-refresh while a tab is hidden, so a long-
  // backgrounded tab can hold an expired JWT. Re-reading on the way back
  // means the NEXT hide sends a valid one. It cannot help a tab that is
  // hidden, expires and is then closed without ever being looked at again —
  // nothing can, without a valid token — but it closes the common case.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const epochAtCall = tokenEpoch;
    supabase.auth.getSession().then(({ data }) => {
      if (tokenEpoch !== epochAtCall) return; // something fresher already won
      adopt(data?.session);
    });
  });
}

// Skips a write when nothing has changed since the last one. visibilitychange
// fires on every tab switch, and without this a player alt-tabbing repeatedly
// would post an identical row each time.
//
// Compares the SAVE CONTENT only. An earlier version fingerprinted the whole
// request body, which carries a fresh `updated_at` on every call — so no two
// were ever equal, the check never fired, and closing a page sent two full
// copies (visibilitychange then pagehide) against the shared keepalive quota.
let lastSentFingerprint = null;

/** Body limit for keepalive requests, per fetch spec. */
const KEEPALIVE_MAX_BYTES = 64 * 1024;

/**
 * Best-effort save that survives the page closing. Returns a string describing
 * what happened, for tests and logging — never throws, because every caller is
 * a teardown handler with nowhere to report to.
 */
export function savePlayerSaveOnExit(userId, state) {
  if (!supabase || !REST_URL || !ANON_KEY) return 'no-backend';
  if (!userId || !accessToken) return 'no-session';

  const save_data = serializeGameState(state);
  const fingerprint = fingerprintOf(userId, save_data);
  if (fingerprint === lastSentFingerprint) return 'unchanged';

  const body = JSON.stringify({
    user_id: userId,
    save_data,
    updated_at: new Date().toISOString(),
  });

  // Over the cap the browser rejects the request outright, and at unload there
  // is no second chance — so say so loudly rather than losing it silently. The
  // 30s autosave is the safety net for a save this large.
  // BYTES, not characters. String.length counts UTF-16 code units, so a
  // journal in Thai, Japanese or emoji measures far short of its encoded size:
  // 30k Thai characters is 90KB. Measuring in characters would sail past this
  // check and let the browser reject the request instead.
  const byteLength = new TextEncoder().encode(body).length;
  // Over the cap, keepalive is not an option — so fall back to an ORDINARY
  // fetch rather than giving up. On a tab-hide the page lives on and that
  // request completes normally; only on a real close is it likely to be
  // cancelled. Strictly better than dropping the save, which is what an
  // earlier version did on the false comfort that "the autosave will get it" —
  // there is no future autosave when the page is closing.
  const oversized = byteLength > KEEPALIVE_MAX_BYTES;
  if (oversized) {
    console.error(
      `[save] exit save is ${byteLength} bytes, over the ${KEEPALIVE_MAX_BYTES} keepalive limit — sending without keepalive, which may not survive a page close.`,
    );
  }

  try {
    // Assume success so the pagehide that follows a visibilitychange does not
    // send a second copy; any failure below puts it back.
    lastSentFingerprint = fingerprint;

    fetch(`${REST_URL}/rest/v1/player_saves`, {
      method: 'POST',
      keepalive: !oversized,
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        // Same upsert semantics as the supabase-js call above.
        Prefer: 'resolution=merge-duplicates',
      },
      body,
    })
      .then((res) => {
        // An HTTP error RESOLVES the promise — .catch alone never sees a 401 or
        // a 413. Without this a stale mirrored token (say, after the machine
        // slept) would drop the save silently, and the retry on the next hide
        // would de-dupe to 'unchanged' and drop it again.
        if (!res.ok) {
          lastSentFingerprint = null;
          console.error(`[save] exit save rejected with HTTP ${res.status}.`);
        }
      })
      .catch(() => {
        lastSentFingerprint = null;
      });

    return oversized ? 'sent-unreliable' : 'sent';
  } catch {
    lastSentFingerprint = null;
    return 'failed';
  }
}
