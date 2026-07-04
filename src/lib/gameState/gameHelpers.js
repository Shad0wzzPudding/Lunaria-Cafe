/** Returns today's date as a YYYY-MM-DD string. */
export function getDateString() {
  return new Date().toISOString().split('T')[0];
}

/** Returns the Monday of the week containing dateStr as a YYYY-MM-DD string. */
export function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split('T')[0];
}

/**
 * Calculates the new streak value based on the last session date.
 * - Same day  → streak unchanged
 * - Yesterday → streak + 1
 * - Gap > 1   → reset to 1
 * - No prior  → start at 1
 */
export function calcNewStreak(currentStreak, lastSessionDate) {
  const today = getDateString();
  if (lastSessionDate === today) return currentStreak;

  if (lastSessionDate) {
    const diffDays = Math.round(
      (new Date(today) - new Date(lastSessionDate)) / (1000 * 60 * 60 * 24)
    );
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
