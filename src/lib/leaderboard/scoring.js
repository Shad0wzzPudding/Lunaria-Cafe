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
// Shared ranker. The mode TABLE is a parameter because the classroom
// and round leaderboards use the same mode KEYS ('time', 'focus',
// 'reputation') for different underlying fields — classroom entries
// carry total_focus_seconds/last_focus_score/reputation, round entries
// carry focus_seconds/avg_focus/rep. Resolving a round mode against
// MODES therefore reads undefined for every student, scores them all 0,
// and silently falls through to the Overall tiebreak. Keep the two
// resolvers separate.
function rankBy(modes, entries, modeKey) {
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const sorted = [...entries].sort((a, b) => {
    const av = mode.metric === 'overall' ? a.overall : num(a[mode.metric]);
    const bv = mode.metric === 'overall' ? b.overall : num(b[mode.metric]);
    if (bv !== av) return bv - av;
    return b.overall - a.overall; // stable-ish tiebreak on the composite
  });
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function rankByMode(entries, modeKey) {
  return rankBy(MODES, entries, modeKey);
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
// come from round_participants (focus_seconds, coins, avg_focus, rep,
// distractions).
//
// Scoring is ABSOLUTE and UNCAPPED: each sub-score depends only on the
// student's own metrics (measured against fixed targets), NOT on the
// room's best. So a paused player's Overall never drops just because
// others pull ahead — and with no ceiling, more effort always means a
// higher number, so top performers separate instead of tying at 100.
// Overall is an open-ended points total (not 0-100).
//
// Distractions are carried on each entry and shown on the board, but do
// NOT enter the score — they are reported to the instructor, not charged
// to the student.
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
  // Deliberately NOT a mode: rankBy sorts descending and the board crowns
  // ranks 1-3, so a Distractions tab would put a gold crown on the most
  // distracted student. It's shown as a per-row metric instead.
];

// How stale a participant's last report may be before we treat them as
// having drifted out of the session. Progress is written every 5s, so
// this is generous — a backgrounded tab or a slow write must not tag
// someone who is still sitting there.
const PARTICIPANT_STALE_MS = 90_000;

// Pausing keeps the participation row alive and the heartbeat ticking, so a
// student can sit out most of a class without ever pressing Leave or going
// quiet. Past this share of the session, being paused is treated as not
// having attended.
const PAUSE_LEAVE_FRACTION = 0.5;

/** Has this student stopped reporting for longer than we tolerate? */
function hasGoneQuiet(row, referenceMs) {
  if (!referenceMs) return false;
  const last = new Date(row.updated_at ?? 0).getTime();
  if (!Number.isFinite(last) || last === 0) return false;
  return referenceMs - last > PARTICIPANT_STALE_MS;
}

/**
 * How long this student was actually IN the session: from when they joined
 * to the reference point, less any time they were away after leaving.
 *
 * Used as the denominator for the pause rule so it is judged per student
 * rather than against the whole round — someone who joins at minute 20 of a
 * 25-minute session and pauses 4 minutes has paused most of THEIR session,
 * even though it is a small share of everyone else's.
 *
 * Falls back to the round length when joined_at is missing or the maths
 * comes out non-positive, so the rule still has a denominator rather than
 * silently switching itself off.
 */
function participationSeconds(row, referenceMs, roundSeconds) {
  const joinedMs = row.joined_at ? new Date(row.joined_at).getTime() : NaN;
  if (Number.isFinite(joinedMs) && referenceMs && referenceMs > joinedMs) {
    // Paused time still counts as being present — only a Leave removes it.
    const window =
      Math.round((referenceMs - joinedMs) / 1000) - Math.max(0, num(row.absent_seconds));
    if (window > 0) return window;
  }
  return num(roundSeconds) > 0 ? num(roundSeconds) : null;
}

/**
 * How this student attended the session. One of:
 *   'full'       — present throughout
 *   'left early' — pressed Leave and never came back
 *   'went quiet' — stopped reporting before the end (closed the app)
 *   'paused >50%'— paused for more than half of THEIR time in it
 *   'rejoined'   — left at least once but returned
 *
 * Order matters: it reports the WORST outcome, so a student who rejoined
 * and then vanished reads as 'went quiet', not 'rejoined'.
 *
 * left_count is what makes 'rejoined' possible at all. left_at answers
 * "are they out right now" and gets cleared on return — using it alone
 * meant a rejoin erased the absence and the student reported as 'full'.
 */
export function attendanceOf(row, referenceMs, roundSeconds = null) {
  if (row.left_at) return 'left early';
  if (hasGoneQuiet(row, referenceMs)) return 'went quiet';
  const window = participationSeconds(row, referenceMs, roundSeconds);
  if (num(window) > 0 && num(row.paused_seconds) > num(window) * PAUSE_LEAVE_FRACTION) {
    return 'paused >50%';
  }
  if (num(row.left_count) > 0) return 'rejoined';
  return 'full';
}

/**
 * Turn raw round_participants rows into scored, sortable entries.
 *
 * `endedAt` is the round's end time (null while it's still running) —
 * needed to judge who stopped reporting before the finish.
 */
/**
 * `nowMs` is the reference point for a LIVE round — what "now" means when
 * deciding who has gone quiet and how long each student has been in. It is a
 * parameter rather than a call to Date.now() here because the rows carry
 * SERVER timestamps: comparing them against the reader's device clock let a
 * badly-set laptop mark a whole class absent. Callers pass serverNow();
 * Date.now() remains the default so anything scoring an ended round, or a
 * test, behaves as before.
 */
export function scoreRoundEntries(rows, endedAt = null, roundSeconds = null, nowMs = null) {
  const list = Array.isArray(rows) ? rows : [];
  const nonNeg = (v) => Math.max(0, v);
  const referenceMs = endedAt
    ? new Date(endedAt).getTime()
    : (Number.isFinite(nowMs) ? nowMs : Date.now());

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

    const attendance = attendanceOf(r, referenceMs, roundSeconds);

    return {
      studentId: r.student_id,
      displayName: r.display_name || 'Unknown',
      focus_seconds: num(r.focus_seconds),
      coins: num(r.coins),
      rep: num(r.rep),
      // Reported alongside the ranking metrics but deliberately NOT part of
      // `overall` — the count is context for the instructor, not a penalty
      // applied to the student's score. nonNeg only so a corrupt row can't
      // display a negative count.
      distractions: nonNeg(num(r.distractions)),
      avg_focus: hasFocus ? num(r.avg_focus) : null,
      overall: Math.round(overall * 10) / 10,
      // Deliberately does NOT affect the score. A student who fell short of
      // full attendance keeps exactly what they earned and ranks on it; this
      // is context for the instructor, not a penalty applied behind their
      // back.
      attendance,
      partial: attendance !== 'full',
      leftAt: r.left_at ?? null,
      leftCount: nonNeg(num(r.left_count)),
      absentSeconds: nonNeg(num(r.absent_seconds)),
      pausedSeconds: nonNeg(num(r.paused_seconds)),
      // Live-only: history judges attendance from pausedSeconds instead, so a
      // value left over from a finished session's last tick is never shown.
      //
      // Gated on the student still REPORTING. `is_paused` is written by the
      // report loop and cleared only by that loop or leave_round(), so a
      // student who pauses and then closes the tab does neither — the flag
      // stays true for the rest of the session and the instructor's board
      // shows them "paused right now" indefinitely, while the very same row
      // is simultaneously tagged "went quiet". "Paused" is a claim about the
      // present moment, and it can only be true if we have heard from them.
      //
      // Fixed here rather than at the chip so every consumer of isPaused gets
      // the honest value, not just the one that happened to be wrong.
      isPaused: !!r.is_paused && !hasGoneQuiet(r, referenceMs),
      // When they came into the session. Already on the table since the
      // original class_rounds migration — it just was never surfaced.
      joinedAt: r.joined_at ?? null,
      // The denominator behind the attendance verdict, exported so the
      // judgement can be checked rather than taken on trust.
      participationSeconds: nonNeg(num(participationSeconds(r, referenceMs, roundSeconds))),
    };
  });
}

/**
 * Rank round entries. Must be used instead of rankByMode for anything
 * reading round_participants — see the note on rankBy above.
 */
export function rankRoundByMode(entries, modeKey) {
  return rankBy(ROUND_MODES, entries, modeKey);
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
