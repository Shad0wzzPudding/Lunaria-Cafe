// In-memory store used for all theme/AI config reads-writes.
// Theme persists via game state → Supabase (logged-in) or is lost on tab close (guest).
const _mem = {};

export const guestStorage = {
  getItem:    (key)      => _mem[key] ?? null,
  setItem:    (key, val) => { _mem[key] = val; },
  removeItem: (key)      => { delete _mem[key]; },
  clear:      ()         => { Object.keys(_mem).forEach(k => delete _mem[k]); },
};
