// ============================================================
// Leaderboard scoring
//
// The RPC hands us raw per-member numbers; the ranking maths lives
// here so weights can be tuned without touching the database.
//
// Each metric becomes a 0-100 sub-score:
//   • focus  — last session's attention score is ALREADY 0-100, so
//              it's used as-is (an absolute measure of that session).
//   • rep / time / coins — no natural ceiling, so they're scored as
//              a percentage of the room's current best.
// Overall is the weighted blend below.
// ============================================================

export const WEIGHTS = {
  focus: 0.35,
  reputation: 0.30,
  time: 0.20,
  coins: 0.15,
};

export const MODES = [
  { key: 'overall',    label: 'Overall',      metric: 'overall' },
  { key: 'reputation', label: 'Reputation',   metric: 'reputation' },
  { key: 'focus',      label: 'Focus',        metric: 'last_focus_score' },
  { key: 'time',       label: 'Opening Time', metric: 'total_focus_seconds' },
  { key: 'coins',      label: 'Coins',        metric: 'coins' },
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Turn raw RPC rows into scored, sortable entries.
 * Returns entries carrying the raw metrics, each 0-100 sub-score,
 * and the blended `overall`. Does NOT sort — callers rank per mode.
 */
export function scoreEntries(rows) {
  const list = Array.isArray(rows) ? rows : [];

  const maxRep = Math.max(0, ...list.map((r) => num(r.reputation)));
  const maxCoins = Math.max(0, ...list.map((r) => num(r.coins)));
  const maxTime = Math.max(0, ...list.map((r) => num(r.total_focus_seconds)));

  const pct = (value, max) => (max > 0 ? (num(value) / max) * 100 : 0);

  return list.map((r) => {
    // last_focus_score is null until the member finishes a session.
    const hasFocus = r.last_focus_score !== null && r.last_focus_score !== undefined;
    const focusSub = hasFocus ? Math.min(100, Math.max(0, num(r.last_focus_score))) : 0;

    const overall =
      WEIGHTS.focus * focusSub +
      WEIGHTS.reputation * pct(r.reputation, maxRep) +
      WEIGHTS.time * pct(r.total_focus_seconds, maxTime) +
      WEIGHTS.coins * pct(r.coins, maxCoins);

    return {
      studentId: r.student_id,
      displayName: r.display_name || 'Unknown',
      reputation: num(r.reputation),
      coins: num(r.coins),
      total_focus_seconds: num(r.total_focus_seconds),
      last_focus_score: hasFocus ? num(r.last_focus_score) : null,
      overall: Math.round(overall * 10) / 10,
    };
  });
}

/** Sort scored entries for one mode, best first, and stamp each rank. */
export function rankByMode(entries, modeKey) {
  const mode = MODES.find((m) => m.key === modeKey) ?? MODES[0];
  const sorted = [...entries].sort((a, b) => {
    const av = mode.metric === 'overall' ? a.overall : num(a[mode.metric]);
    const bv = mode.metric === 'overall' ? b.overall : num(b[mode.metric]);
    if (bv !== av) return bv - av;
    return b.overall - a.overall; // stable-ish tiebreak on the composite
  });
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

/** The headline value shown for a given mode. */
export function formatModeValue(entry, modeKey) {
  switch (modeKey) {
    case 'overall':
      return `${entry.overall}`;
    case 'reputation':
      return `${entry.reputation}`;
    case 'coins':
      return `${entry.coins}`;
    case 'focus':
      return entry.last_focus_score === null ? '—' : `${entry.last_focus_score}`;
    case 'time':
      return formatDuration(entry.total_focus_seconds);
    default:
      return '';
  }
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(num(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ============================================================
// Live-round scoring
//
// A round ranks only what a student does DURING the round. Metrics
// come from round_participants (focus_seconds, coins, avg_focus).
//
// Scoring is ABSOLUTE and UNCAPPED: each sub-score depends only on the
// student's own metrics (measured against fixed targets), NOT on the
// room's best. So a paused player's Overall never drops just because
// others pull ahead — and with no ceiling, more effort always means a
// higher number, so top performers separate instead of tying at 100.
// Overall is an open-ended points total (not 0-100).
// ============================================================

export const ROUND_WEIGHTS = {
  focus_seconds: 0.35,
  avg_focus: 0.30,
  rep: 0.20,
  coins: 0.15,
};

// Fixed reference points: each yields 100 points per unit target, then
// keeps climbing past it (uncapped).
const FOCUS_TARGET_SECONDS = 25 * 60; // 25 min focused → 100 points
const COIN_TARGET = 100; // 100 coins → 100 points
const REP_TARGET = 10; // +10 reputation this session → 100 points

export const ROUND_MODES = [
  { key: 'overall',    label: 'Overall',    metric: 'overall' },
  { key: 'time',       label: 'Focus Time', metric: 'focus_seconds' },
  { key: 'focus',      label: 'Avg Focus',  metric: 'avg_focus' },
  { key: 'reputation', label: 'Reputation', metric: 'rep' },
  { key: 'coins',      label: 'Coins',      metric: 'coins' },
];

/** Turn raw round_participants rows into scored, sortable entries. */
export function scoreRoundEntries(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const nonNeg = (v) => Math.max(0, v);

  return list.map((r) => {
    const hasFocus = r.avg_focus !== null && r.avg_focus !== undefined;
    // avg_focus is naturally 0-100; focus-time and coins are uncapped so
    // there's no ceiling to tie at.
    const avgSub = hasFocus ? Math.min(100, nonNeg(num(r.avg_focus))) : 0;
    const focusSub = nonNeg((num(r.focus_seconds) / FOCUS_TARGET_SECONDS) * 100);
    const coinSub = nonNeg((num(r.coins) / COIN_TARGET) * 100);
    // Rep can be earned or lost during a round; losses just give 0 here.
    const repSub = nonNeg((num(r.rep) / REP_TARGET) * 100);

    const overall =
      ROUND_WEIGHTS.focus_seconds * focusSub +
      ROUND_WEIGHTS.avg_focus * avgSub +
      ROUND_WEIGHTS.rep * repSub +
      ROUND_WEIGHTS.coins * coinSub;

    return {
      studentId: r.student_id,
      displayName: r.display_name || 'Unknown',
      focus_seconds: num(r.focus_seconds),
      coins: num(r.coins),
      rep: num(r.rep),
      avg_focus: hasFocus ? num(r.avg_focus) : null,
      overall: Math.round(overall * 10) / 10,
    };
  });
}

/** The headline value shown for a given round mode. */
export function formatRoundValue(entry, modeKey) {
  switch (modeKey) {
    case 'overall':
      return `${entry.overall}`;
    case 'time':
      return formatDuration(entry.focus_seconds);
    case 'focus':
      return entry.avg_focus === null ? '—' : `${entry.avg_focus}`;
    case 'reputation':
      return `${entry.rep > 0 ? '+' : ''}${entry.rep}`;
    case 'coins':
      return `${entry.coins}`;
    default:
      return '';
  }
}
