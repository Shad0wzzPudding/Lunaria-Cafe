/**
 * Cafe upgrades — permanent, one-off purchases bought with coins once the
 * cafe's reputation is high enough. Everything an upgrade changes is derived
 * from the owned list (`state.cafe.upgrades`), never stored alongside it, so a
 * save can't drift out of step with what the player actually owns.
 */

// Seats the cafe opens with. Capacity is still bounded by what a customer can
// physically find (a free sittable piece of furniture, else an open spot to
// stand in) — this is the ceiling, not a promise.
export const BASE_MAX_CUSTOMERS = 6;

// How long a customer stays, in seconds of session time. Each arrival draws
// its own stay from this range, so the cafe doesn't empty in visible waves —
// and the customer leaves when THEIR time is up, not on a shared dice roll.
// Whether they leave *served* is still decided by the chaos level then.
export const DWELL_MIN_SECONDS = 45;
export const DWELL_MAX_SECONDS = 120;

// Skilled Barista takes a quarter off each stay (was half — user retuned it
// on 2026-08-11 after playing with the halved version).
export const BARISTA_DWELL_FACTOR = 0.75;

// Share of arrivals that are VIPs once the VIP Corner is built, and what they
// pay relative to a normal customer.
export const VIP_ARRIVAL_CHANCE = 1 / 3;
export const VIP_PAY_MULTIPLIER = 2;

export const CAFE_UPGRADES = [
  { id: 'extra_seating',   icon: '🪑', name: 'Extra Seating',   desc: 'Adds 2 more seats for customers.',      repReq: 30, cost: 200  },
  { id: 'skilled_barista', icon: '🧙', name: 'Skilled Barista', desc: 'Customers are served 25% faster.',           repReq: 50, cost: 500  },
  { id: 'vip_corner',      icon: '🌙', name: 'VIP Corner',      desc: '1 in 3 customers is a VIP who pays double.', repReq: 70, cost: 800  },
  { id: 'cafe_expansion',  icon: '🏰', name: 'Cafe Expansion',  desc: "Doubles your cafe's capacity.",          repReq: 90, cost: 1500 },
];

export const UPGRADE_BY_ID = Object.fromEntries(CAFE_UPGRADES.map((u) => [u.id, u]));

/** Tolerates the missing key on saves written before upgrades existed. */
export function hasUpgrade(upgrades, id) {
  return Array.isArray(upgrades) && upgrades.includes(id);
}

/** Seats, after the additive upgrade and then the doubling one. */
export function maxCustomersFor(upgrades) {
  let max = BASE_MAX_CUSTOMERS;
  if (hasUpgrade(upgrades, 'extra_seating')) max += 2;
  if (hasUpgrade(upgrades, 'cafe_expansion')) max *= 2;
  return max;
}

/** The stay range in force, as [min, max] seconds. */
export function dwellRangeFor(upgrades) {
  const factor = hasUpgrade(upgrades, 'skilled_barista') ? BARISTA_DWELL_FACTOR : 1;
  return [DWELL_MIN_SECONDS * factor, DWELL_MAX_SECONDS * factor];
}

/** One customer's stay, drawn at arrival. Rounded to whole seconds of session time. */
export function dwellSecondsFor(upgrades, random = Math.random) {
  const [min, max] = dwellRangeFor(upgrades);
  return Math.round(min + random() * (max - min));
}

export function vipChanceFor(upgrades) {
  return hasUpgrade(upgrades, 'vip_corner') ? VIP_ARRIVAL_CHANCE : 0;
}
