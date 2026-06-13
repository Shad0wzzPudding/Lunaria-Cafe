/** Returns today's date as a YYYY-MM-DD string. */
export function getDateString() {
  return new Date().toISOString().split('T')[0];
}

/** Returns the Monday-based index (0 = Mon … 6 = Sun) for today. */
export function getTodayIndex() {
  return (new Date().getDay() + 6) % 7;
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
 * Shared calculation for END_FOCUS and COMPLETE_FOCUS.
 *
 * @param {object} state       - Current game state
 * @param {boolean} requireMin1 - If true, session always counts as at least 1 min (COMPLETE_FOCUS).
 *                                If false, only counts if elapsed >= 30s (END_FOCUS).
 * @returns {{ sessionMins: number, extraMins: number, weeklyData: number[] }}
 */
export function calcSessionTotals(state, requireMin1 = false) {
  const tickedMins  = Math.floor(state.focus.elapsed / 60);
  const sessionMins = requireMin1
    ? Math.max(1, Math.ceil(state.focus.elapsed / 60))
    : Math.max(state.focus.elapsed >= 30 ? 1 : 0, Math.ceil(state.focus.elapsed / 60));
  const extraMins   = Math.max(0, sessionMins - tickedMins);

  const weeklyData = [...state.stats.weeklyData];
  if (extraMins > 0) weeklyData[getTodayIndex()] += extraMins;

  return { sessionMins, extraMins, weeklyData };
}
