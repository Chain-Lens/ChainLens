/**
 * Pure ranking utilities: seeded PRNG + weighted-random shuffle. Extracted
 * from market.routes.ts so the listings search service can compose them
 * without dragging Express or Prisma along — keeps the ranker testable in
 * isolation and reusable from other endpoints (e.g. detail recommendations).
 */

/** FNV-1a 32-bit hash — cheap deterministic seed bootstrapping. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — small, seeded PRNG. Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(seed: string | undefined): () => number {
  if (!seed) return Math.random;
  return mulberry32(hashSeed(seed));
}

/**
 * Efraimidis-Spirakis weighted shuffle without replacement.
 * key_i = -ln(U_i) / w_i, sort ascending → items in weighted-random order.
 * Equivalent to "repeatedly sample from the distribution, remove picked
 * item, sample again", but O(n log n) instead of O(n²).
 */
export function weightedShuffle<T>(
  items: readonly T[],
  weights: readonly number[],
  rng: () => number,
): T[] {
  const keyed = items.map((item, i) => {
    const u = rng() || Number.EPSILON;
    const w = Math.max(weights[i] ?? 0, 1e-9);
    return { item, key: -Math.log(u) / w };
  });
  keyed.sort((a, b) => a.key - b.key);
  return keyed.map((k) => k.item);
}
