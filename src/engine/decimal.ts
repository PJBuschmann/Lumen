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

/** Sum of a geometric series of `count` prices that starts at `first`. */
export function geometricSum(first: Decimal, ratio: number, count: number): Decimal {
  if (count <= 0) return ZERO;
  if (count === 1) return first;
  // Small series fit in a native number; huge ones need a Decimal power.
  if (count * Math.log10(ratio) < 290) return first.mul((Math.pow(ratio, count) - 1) / (ratio - 1));
  return first.mul(powLevel(ratio, count).sub(1)).div(ratio - 1);
}

/**
 * Geometric price series: the item at `owned` costs base * ratio^owned.
 * Returns the price of buying `count` items starting from `owned`.
 */
export function geometricCost(base: Decimal, ratio: number, owned: number, count: number): Decimal {
  if (count <= 0) return ZERO;
  return geometricSum(base.mul(powLevel(ratio, owned)), ratio, count);
}

/**
 * Largest count of items affordable when the next one costs `first` and each costs
 * `ratio` times the one before. Verified against the exact sum so floating error can
 * never overspend.
 */
export function geometricAffordFrom(
  budget: Decimal,
  first: Decimal,
  ratio: number,
  cap: number = Number.MAX_SAFE_INTEGER,
): number {
  if (cap <= 0 || budget.lt(first)) return 0;
  // n = floor(log_ratio(budget * (ratio - 1) / first + 1))
  const quotient = budget.div(first);
  const raw =
    quotient.exponent < 290
      ? Math.floor(Math.log(quotient.toNumber() * (ratio - 1) + 1) / Math.log(ratio))
      : Math.floor((quotient.log10() + Math.log10(ratio - 1)) / Math.log10(ratio));
  let n = Math.max(1, Math.min(raw, cap));
  while (n > 1 && geometricSum(first, ratio, n).gt(budget)) n -= 1;
  while (n < cap && geometricSum(first, ratio, n + 1).lte(budget)) n += 1;
  return n;
}

/** Largest count of items affordable from a geometric price series starting at `owned`. */
export function geometricAfford(
  budget: Decimal,
  base: Decimal,
  ratio: number,
  owned: number,
  cap: number = Number.MAX_SAFE_INTEGER,
): number {
  if (cap <= 0) return 0;
  return geometricAffordFrom(budget, base.mul(powLevel(ratio, owned)), ratio, cap);
}

/** Polynomial price: base * (owned + 1)^power. Used by the upper layers. */
export function polyCost(base: Decimal, power: number, owned: number): Decimal {
  return base.mul(Math.pow(owned + 1, power));
}
