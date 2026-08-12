import { Sprout, Coffee, Sparkles, Moon, Star, Crown } from 'lucide-react';

/**
 * Reputation tiers — the cafe's fame, and the one thing reputation changes
 * moment to moment: how often customers walk in.
 *
 * `arrivalChance` is the raw probability per cafe tick (4s) that a customer
 * arrives, held per tier rather than derived from a base × multiplier: the
 * ladder is tuned in absolute steps, so this is the number that gets edited.
 * It steps at the tier boundary rather than climbing smoothly, so crossing one
 * is something the player can feel (and the tier row can name).
 *
 * Tuning history (all 2026-08-11, user's calls): started flat at 0.30 for
 * every tier; became a 0.30→0.60 ladder in 0.06 steps; came down twice by
 * 0.05; then the top five tiers were set by hand to the values below, which
 * leaves the ladder at a flat 0.05 per tier.
 */
export const REPUTATION_TIERS = [
  { min: 0,   max: 19,  name: 'Newcomer',  icon: Sprout,   color: '#9ca3af', arrivalChance: 0.20 },
  { min: 20,  max: 39,  name: 'Local Gem', icon: Coffee,   color: '#7ec8a0', arrivalChance: 0.25 },
  { min: 40,  max: 59,  name: 'Popular',   icon: Sparkles, color: '#6bb3d4', arrivalChance: 0.30 },
  { min: 60,  max: 79,  name: 'Renowned',  icon: Moon,     color: '#cc7ada', arrivalChance: 0.35 },
  { min: 80,  max: 99,  name: 'Legendary', icon: Star,     color: '#f0c674', arrivalChance: 0.40 },
  { min: 100, max: 100, name: 'Mythic',    icon: Crown,    color: '#f472b6', arrivalChance: 0.45 },
];

/** What a brand-new cafe rolls — the reference the tier bonuses are shown against. */
export const BASE_ARRIVAL_CHANCE = REPUTATION_TIERS[0].arrivalChance;

export function getCurrentTier(rep) {
  for (let i = REPUTATION_TIERS.length - 1; i >= 0; i--) {
    if (rep >= REPUTATION_TIERS[i].min) return REPUTATION_TIERS[i];
  }
  return REPUTATION_TIERS[0];
}

/**
 * The arrival roll for a given reputation. Clamped to [0, 1] so a future
 * tuning pass can't make the roll meaningless, and junk input (null, negative)
 * falls back to the starting tier rather than breaking the spawn loop.
 */
export function arrivalChanceFor(rep) {
  const chance = getCurrentTier(Math.max(0, rep ?? 0)).arrivalChance;
  return Math.min(1, Math.max(0, chance));
}

/** How much busier this tier is than a brand-new cafe (Newcomer = 1). */
export function arrivalMultiplierFor(tier) {
  return tier.arrivalChance / BASE_ARRIVAL_CHANCE;
}

/** "×1.5" — for surfaces that show what the current tier is worth. */
export function formatArrivalMultiplier(mult) {
  return `×${mult.toFixed(1)}`;
}
