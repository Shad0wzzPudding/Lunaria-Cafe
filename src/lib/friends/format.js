/**
 * Presentation helpers for the Friends page.
 *
 * Kept out of the page component because the friend code is shown in two
 * places on it (your own, and echoed back in errors) and will be shown in
 * more once friends unlock anything.
 */

/**
 * Friend codes are stored as 8 unbroken characters but read by a human off
 * a screen, so they're printed in two groups. Anything shorter or longer is
 * passed through unchanged rather than grouped at a wrong boundary.
 */
export function formatFriendCode(code) {
  const c = (code ?? '').trim();
  if (c.length !== 8) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Strip the grouping (and anything else typed by hand) back to the stored form. */
export function normalizeFriendCode(code) {
  return (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "Last active" at the granularity people actually care about for a friend.
 * The instructor roster's version prints a date only, which is right for a
 * gradebook and useless for "are they around right now" — hence a second one
 * rather than a shared helper pulled in two directions.
 */
export function fmtLastSeen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';

  // Clock skew between the browser and the database can make a fresh
  // timestamp land slightly in the future; that should read as "now",
  // not as a negative age.
  const delta = Math.max(0, Date.now() - d.getTime());

  if (delta < 2 * MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} min ago`;
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  if (delta < 7 * DAY) {
    const days = Math.floor(delta / DAY);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
