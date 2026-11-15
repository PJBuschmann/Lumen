/**
 * Big-number helpers. Every currency in Lumen is a break_infinity Decimal from day one;
 * native numbers are only used for levels, seconds, probabilities and log10 exponents.
 */
import Decimal from 'break_infinity.js';
import type { DecimalSource } from 'break_infinity.js';

export { Decimal };
export type { DecimalSource };

export const ZERO: Decimal = new Decimal(0);
export const ONE: Decimal = new Decimal(1);

export function D(value: DecimalSource): Decimal {
  return new Decimal(value);
}

/** True when the Decimal holds a real, finite value. */
export function isFiniteDecimal(value: Decimal): boolean {
  return Number.isFinite(value.mantissa) && Number.isFinite(value.exponent);
}

/** log10(1 + x), never negative and never -Infinity. Safe for zero balances. */
export function log10p1(value: Decimal): number {
  if (value.lte(0)) return 0;
  // For tiny values 1+x keeps the precision that matters; for huge ones the +1 is noise.
  return value.exponent > 15 ? value.log10() : Math.log10(1 + value.toNumber());
}

/** log10(x) clamped to 0 for x <= 1. */
export function log10Floor0(value: Decimal): number {
  if (value.lte(1)) return 0;
  return value.log10();
}

/** 10^exponent as a Decimal, tolerating fractional and large exponents. */
export function pow10(exponent: number): Decimal {
  if (!Number.isFinite(exponent)) return exponent > 0 ? D('1e9000000000000000') : ZERO;
  return Decimal.pow10(exponent);
}

/** base^level for a native base, as a Decimal (levels can be in the tens of thousands). */
export function powLevel(base: number, level: number): Decimal {
  if (level <= 0) return ONE;
  return Decimal.pow10(level * Math.log10(base));
}

/** Replace NaN/Infinity with zero. Used at the edges (loading saves). */
export function sanitize(value: Decimal): Decimal {
  if (!isFiniteDecimal(value) || value.lt(0)) return ZERO;
  return value;
}

/** Parse a Decimal from a save string; anything unparsable becomes zero. */
export function parseDecimal(raw: unknown): Decimal {
  if (raw instanceof Decimal) return sanitize(raw);
  if (typeof raw === 'number') return Number.isFinite(raw) ? sanitize(new Decimal(raw)) : ZERO;
  if (typeof raw === 'string' && raw.length > 0 && raw.length < 64) {
    try {
      return sanitize(new Decimal(raw));
    } catch {
      return ZERO;
    }
  }
  return ZERO;
}

/**
 * Geometric price series: the item at `owned` costs base * ratio^owned.
 * Returns the price of buying `count` items starting from `owned`.
 */
export function geometricCost(base: Decimal, ratio: number, owned: number, count: number): Decimal {
  if (count <= 0) return ZERO;
  const first = base.mul(powLevel(ratio, owned));
  if (count === 1) return first;
  // first * (ratio^count - 1) / (ratio - 1)
  return first.mul(powLevel(ratio, count).sub(1)).div(ratio - 1);
}

/**
 * Largest count of items affordable from a geometric price series.
 * Verified against the exact cost so floating error can never overspend.
 */
export function geometricAfford(
  budget: Decimal,
  base: Decimal,
  ratio: number,
  owned: number,
  cap: number = Number.MAX_SAFE_INTEGER,
): number {
  if (cap <= 0) return 0;
  const first = base.mul(powLevel(ratio, owned));
  if (budget.lt(first)) return 0;
  // n = floor(log_ratio(budget * (ratio - 1) / first + 1))
  const raw = Math.floor(budget.mul(ratio - 1).div(first).add(1).log10() / Math.log10(ratio));
  let n = Math.max(1, Math.min(raw, cap));
  while (n > 1 && geometricCost(base, ratio, owned, n).gt(budget)) n -= 1;
  while (n < cap && geometricCost(base, ratio, owned, n + 1).lte(budget)) n += 1;
  return n;
}

/** Polynomial price: base * (owned + 1)^power. Used by the upper layers. */
export function polyCost(base: Decimal, power: number, owned: number): Decimal {
  return base.mul(Math.pow(owned + 1, power));
}
