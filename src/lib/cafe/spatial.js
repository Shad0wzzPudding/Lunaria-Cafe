import { FURNITURE_CATALOG } from '@/lib/cafe/furnitureCatalog.js';

export const CAFE_W = 740;
export const CAFE_H = 500;

// Each zone is a rectangle { x, y, w, h }.
// A point is walkable if it falls inside ANY zone (union).
export const WALKABLE_ZONES = [
  { x: 37,  y: 152, w: 668, h: 233 }, // main floor
  { x: 103, y: 385, w: 534, h:  48 }, // lower floor strip (rug area)
];

export function isInsideWalkableZone(x, y) {
  return WALKABLE_ZONES.some(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

function isFurnitureSolid(furniture) {
  return FURNITURE_CATALOG[furniture.type]?.solid ?? true;
}

export function collidesWithFurniture(x, y, radius, furniture) {
  for (const f of furniture) {

    // Skip non-solid furniture
    if (!isFurnitureSolid(f)) {
      continue;
    }

    const rotated = (f.rotation ?? 0) % 180 !== 0;

    const fw = rotated ? f.h : f.w;
    const fh = rotated ? f.w : f.h;

    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;

    const left = cx - fw / 2;
    const top = cy - fh / 2;

    if (
      x + radius > left &&
      x - radius < left + fw &&
      y + radius > top &&
      y - radius < top + fh
    ) {
      return true;
    }
  }

  return false;
}

export function randomWalkablePoint() {
  const zone = WALKABLE_ZONES[Math.floor(Math.random() * WALKABLE_ZONES.length)];
  return { x: zone.x + Math.random() * zone.w, y: zone.y + Math.random() * zone.h };
}

// Search outward from (x, y) in expanding rings until a valid spot is found.
// Returns { x, y } of the nearest open position, or null if none found within range.
export function findNearestValidSpot(x, y, radius, furniture) {
  for (let dist = 10; dist <= 200; dist += 10) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const cx = x + Math.cos(angle) * dist;
      const cy = y + Math.sin(angle) * dist;
      if (isInsideWalkableZone(cx, cy) && !collidesWithFurniture(cx, cy, radius, furniture)) {
        return { x: cx, y: cy };
      }
    }
  }
  return null;
}

// Find a random open spot inside the walkable zone that's clear of furniture.
// Tries random points first, then falls back to a deterministic ring search
// seeded from (seedX, seedY). Returns null if no valid spot exists at all —
// callers must handle that case rather than placing an unvalidated fallback.
export function findRandomOpenSpot(seedX, seedY, radius, furniture, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const { x, y } = randomWalkablePoint();
    if (!collidesWithFurniture(x, y, radius, furniture)) return { x, y };
  }
  return findNearestValidSpot(seedX, seedY, radius, furniture);
}
