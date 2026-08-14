/**
 * The account code: an account's public handle, readable off a screen and
 * typeable, unlike the account uuid.
 *
 * Lives under account/ rather than friends/ because the code identifies the
 * ACCOUNT. Friends is only the first feature to use it — anything later that
 * needs one player to name another should reach for this, not reach into the
 * friends system.
 */

/**
 * Codes are stored as 8 unbroken characters but read by a human, so they're
 * printed in two groups. Anything of another length passes through unchanged
 * rather than being grouped at a wrong boundary.
 */
export function formatAccountCode(code) {
  const c = (code ?? '').trim();
  if (c.length !== 8) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Strip the grouping (and anything else typed by hand) back to the stored form. */
export function normalizeAccountCode(code) {
  return (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
