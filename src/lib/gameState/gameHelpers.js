/** Returns a date as a YYYY-MM-DD string in the user's LOCAL timezone. */
export function getDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string as a local-midnight Date (avoids UTC parsing). */
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole-day difference between two YYYY-MM-DD strings (a − b). */
export function daysBetween(a, b) {
  return Math.round((parseLocalDate(a) - parseLocalDate(b)) / 86400000);
}

/**
 * If the day/week has rolled over since these stats were last dated, returns a
 * patch resetting the period counters (per resetPeriod) + normalizing the date
 * fields; otherwise null. Shared by TICK_FOCUS (mid-session midnight crossing)
 * and CHECK_DATE_RESET so both behave identically.
 * @param {object} stats
 * @param {string} now  current date YYYY-MM-DD (debug-aware)
 */
export function periodRolloverPatch(stats, now) {
  const nowWeek     = getWeekStart(now);
  const dayChanged  = stats.todayDate     != null && stats.todayDate     !== now;
  const weekChanged = stats.weekStartDate != null && stats.weekStartDate !== nowWeek;
  if (!dayChanged && !weekChanged) return null;

  const resetPeriodStats = (stats.resetPeriod ?? 'daily') === 'weekly' ? weekChanged : dayChanged;
  return {
    todayDate:     dayChanged  ? now     : stats.todayDate,
    weekStartDate: weekChanged ? nowWeek : stats.weekStartDate,
    ...(weekChanged ? { weeklyData: [0, 0, 0, 0, 0, 0, 0] } : {}),
    ...(resetPeriodStats ? {
      todaySeconds:         0,
      todayMinutes:         0,
      periodSessions:       0,
      periodFocusSeconds:   0,
      periodCoinsEarned:    0,
      periodCustomersTotal: 0,
      periodChaosEvents:    0,
    } : {}),
  };
}

/** Returns the Monday of the week containing dateStr as a YYYY-MM-DD string. */
export function getWeekStart(dateStr) {
  const d = parseLocalDate(dateStr);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return getDateString(d);
}

/**
 * Calculates the new streak value based on the last session date.
 * - Same day  → streak unchanged
 * - Yesterday → streak + 1
 * - Gap > 1   → reset to 1
 * - No prior  → start at 1
 *
 * `today` defaults to the real local date but can be overridden (e.g. the
 * debug date simulator) so streak progression stays testable.
 *
 * Caveats (inherent to any local-date streak, not defects — see also the
 * login lapse check in saveService.mergeLoadedSave):
 * 1. Timezone travel / crossing the date line can shift the user's local
 *    "today" by a day, so a streak may gain or lose a day around the trip.
 * 2. Manually changing the device clock will fool the check; we trust the
 *    local system date and have no fixed server clock to verify against.
 */
export function calcNewStreak(currentStreak, lastSessionDate, today = getDateString()) {
  if (lastSessionDate === today) return currentStreak;

  if (lastSessionDate) {
    const diffDays = daysBetween(today, lastSessionDate);
    if (diffDays === 1) return currentStreak + 1;
    if (diffDays > 1)  return 1;
  }

  return 1;
}

/**
 * Whole-minute credit for a finished session — used for session counting
 * and streaks. Focus-time stats themselves accumulate live in TICK_FOCUS.
 *
 * @param {number} elapsed     - Session length in seconds
 * @param {boolean} requireMin1 - If true, session always counts as at least 1 min (COMPLETE_FOCUS).
 *                                If false, only counts if elapsed >= 30s (END_FOCUS).
 */
export function calcSessionMins(elapsed, requireMin1 = false) {
  return requireMin1
    ? Math.max(1, Math.ceil(elapsed / 60))
    : elapsed >= 30
      ? Math.ceil(elapsed / 60)
      : 0;
}
