/**
 * Number and time formatting. Pure, so the UI and the simulator report share it.
 * These functions never return "NaN" or "Infinity".
 */
import { Decimal } from './decimal';
import type { DecimalSource } from './decimal';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
/** Largest exponent written with a suffix; beyond it we switch to scientific notation. */
const MAX_SUFFIX_EXPONENT = SUFFIXES.length * 3 - 1;

function toDecimal(value: DecimalSource): Decimal | null {
  try {
    const d = value instanceof Decimal ? value : new Decimal(value);
    if (!Number.isFinite(d.mantissa) || !Number.isFinite(d.exponent)) return null;
    return d;
  } catch {
    return null;
  }
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Three significant digits for a value in [1, 1000). */
function threeSig(value: number): string {
  if (value >= 100) return trimZeros(value.toFixed(0));
  if (value >= 10) return trimZeros(value.toFixed(1));
  return trimZeros(value.toFixed(2));
}

function formatExponent(exponent: number): string {
  if (exponent < 1e6) return String(exponent);
  // Exponents themselves can get long: 1.23e1.5e6
  const e = Math.floor(Math.log10(exponent));
  return `${trimZeros((exponent / Math.pow(10, e)).toFixed(2))}e${e}`;
}

/**
 * Format a quantity for display: 12.5, 1.23K, 45.6M ... 1.23e45, 4.56e1234.
 * Invalid input (NaN, Infinity) renders as "0".
 */
export function formatNumber(value: DecimalSource, options: { integer?: boolean } = {}): string {
  const d = toDecimal(value);
  if (d === null) return '0';
  if (d.lt(0)) return `-${formatNumber(d.neg(), options)}`;
  if (d.eq(0)) return '0';

  if (d.exponent < 3) {
    const n = d.toNumber();
    if (options.integer) return String(Math.floor(n + 1e-9));
    if (n < 0.001) return '0';
    if (n < 1) return trimZeros(n.toFixed(3));
    if (n < 100) return trimZeros(n.toFixed(Number.isInteger(n) ? 0 : n < 10 ? 2 : 1));
    return String(Math.floor(n + 1e-9));
  }

  let mantissa = d.mantissa;
  let exponent = d.exponent;

  if (exponent <= MAX_SUFFIX_EXPONENT) {
    const tier = Math.floor(exponent / 3);
    let scaled = mantissa * Math.pow(10, exponent - tier * 3);
    // Rounding can push 999.9 up to 1000: roll over to the next suffix.
    if (Number(threeSig(scaled)) >= 1000) {
      scaled /= 1000;
      if (tier + 1 < SUFFIXES.length) return `${threeSig(scaled)}${SUFFIXES[tier + 1]}`;
      return `${trimZeros(scaled.toFixed(2))}e${(tier + 1) * 3}`;
    }
    return `${threeSig(scaled)}${SUFFIXES[tier]}`;
  }

  let text = mantissa.toFixed(2);
  if (Number(text) >= 10) {
    mantissa /= 10;
    exponent += 1;
    text = mantissa.toFixed(2);
  }
  return `${trimZeros(text)}e${formatExponent(exponent)}`;
}

/** A multiplier such as x1.5 or x2.3e12. */
export function formatMultiplier(value: DecimalSource): string {
  return `x${formatNumber(value)}`;
}

/** A percentage from a 0..1 fraction: 0.555 -> "55.5%". */
export function formatPercent(fraction: number, decimals: number = 0): string {
  if (!Number.isFinite(fraction)) return '0%';
  return `${trimZeros((fraction * 100).toFixed(decimals))}%`;
}

/** Durations: 45s, 12m 5s, 3h 20m, 2d 4h. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m}m` : `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`;
}
