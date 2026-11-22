// Shared constants, seeded random and small helpers for SOLMARINA.
export const WORLD = {
  pitch: 52,          // block (40) + road (12)
  blocks: 8,          // blocks per side
  roadHalf: 6,        // half road width
  blockHalf: 20,      // half block size
  beachZ: 250,        // sand starts here (south edge)
  seaZ: 300,          // water plane starts here
  cityHalf: 234,      // outer road centre line
};

export const COLOURS = {
  asphalt: 0x2e3138,
  sidewalk: 0x9a938a,
  curb: 0x6f6a62,
  sand: 0xe8d29a,
  sea: 0x1e7fa8,
  grass: 0x5f9e52,
  building: [0xd8c9a8, 0xc9b18c, 0xb8c4cc, 0xe0a878, 0x9fb8a8, 0xd8b8c8, 0xa8b8d8, 0xe8e0d0],
  glass: [0x7fb8d8, 0x9fd0e8, 0x6fa8c8],
  car: [0xd83a2e, 0x2e6fd8, 0xf2c230, 0x30c878, 0xe8e8e8, 0x222222, 0x8a5fd0, 0xff7a2e],
  taxi: 0xf2c230,
  police: 0x1a1a2e,
  palm: 0x3f8f4f,
  trunk: 0x7a5a38,
};

/** Deterministic RNG (mulberry32). Same seed -> same city, traffic and shots. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Shortest signed angle difference, in radians. */
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
/** Road centre lines (x and z), 9 lines each. */
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= WORLD.blocks; i++) lines.push(-WORLD.cityHalf + i * WORLD.pitch);
  return lines;
}
/** Pick a random element with the given rng. */
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
