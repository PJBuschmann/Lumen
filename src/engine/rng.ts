/**
 * Seeded, stateless-API random numbers. Each stream is a single uint32 that lives in
 * the game state, so the whole engine stays deterministic and serialisable.
 *
 * Streams are kept separate (weather, log, bottles, ...) so that consuming one never
 * shifts another: cosmetic draws cannot change gameplay outcomes.
 */

export interface RngDraw {
  /** Uniform value in [0, 1). */
  value: number;
  /** The stream state to store back. */
  next: number;
}

/** mulberry32: small, fast, good enough statistical quality for game events. */
export function rngNext(state: number): RngDraw {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** Derive an independent stream seed from a base seed and a label. */
export function deriveSeed(seed: number, label: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stateless hash to [0, 1): same inputs, same output, no stream consumed. */
export function hash01(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Integer in [0, n). */
export function pickIndex(value: number, n: number): number {
  return Math.min(n - 1, Math.floor(value * n));
}

/** Index chosen with the given non-negative weights. */
export function pickWeighted(value: number, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let roll = value * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}
