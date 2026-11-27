// SPDX-License-Identifier: MIT
// Deterministic Mulberry32 PRNG and math utilities for seeded runs and screenshots.

export function createRng(seed) {
  let state = (Math.floor(Number(seed)) >>> 0) || 1740;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pickWeighted(rng, list) {
  let total = 0;
  for (const item of list) total += item.weight;
  let roll = rng() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAngleRad(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function radToHeadingDeg(yawRad) {
  const deg = ((yawRad * 180) / Math.PI) % 360;
  return (deg + 360) % 360;
}

export function formatHeading(deg) {
  const n = Math.round(((deg % 360) + 360) % 360) % 360;
  return String(n).padStart(3, '0');
}
