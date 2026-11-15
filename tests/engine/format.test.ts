import { describe, expect, it } from 'vitest';
import {
  D,
  Decimal,
  formatDuration,
  formatMultiplier,
  formatNumber,
  formatPercent,
  rngNext,
} from '../../src/engine';

describe('formatNumber', () => {
  it('formats small numbers plainly', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(5)).toBe('5');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(1.234)).toBe('1.23');
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(0.0001)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(999.6)).toBe('999');
    expect(formatNumber(12.7, { integer: true })).toBe('12');
  });

  it('uses suffixes then scientific notation', () => {
    expect(formatNumber(1000)).toBe('1K');
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(45_600_000)).toBe('45.6M');
    expect(formatNumber(D('9.99e11'))).toBe('999B');
    expect(formatNumber(D('9.999e11'))).toBe('1T');
    expect(formatNumber(D('1e33'))).toBe('1Dc');
    expect(formatNumber(D('9.999e35'))).toBe('1e36');
    expect(formatNumber(D('1.5e36'))).toBe('1.5e36');
    expect(formatNumber(D('4.567e1234'))).toBe('4.57e1234');
    expect(formatNumber(D('9.999e1234'))).toBe('1e1235');
    expect(formatNumber(D('1e2500000'))).toBe('1e2.5e6');
  });

  it('handles negatives', () => {
    expect(formatNumber(-1234)).toBe('-1.23K');
  });

  it('never renders NaN or Infinity', () => {
    const bad = [NaN, Infinity, -Infinity, new Decimal(NaN), 'garbage'];
    for (const value of bad) {
      const text = formatNumber(value as number);
      expect(text).not.toMatch(/NaN|Infinity|undefined/);
    }
    let seed = 99;
    for (let i = 0; i < 5000; i++) {
      const a = rngNext(seed);
      const b = rngNext(a.next);
      seed = b.next;
      const value = Decimal.pow10(a.value * 4000 - 5).mul(1 + b.value * 9);
      const text = formatNumber(value);
      expect(text).not.toMatch(/NaN|Infinity|undefined/);
      expect(text.length).toBeLessThan(14);
    }
  });
});

describe('other formatters', () => {
  it('formats multipliers, percents and durations', () => {
    expect(formatMultiplier(1.5)).toBe('x1.5');
    expect(formatPercent(0.555, 1)).toBe('55.5%');
    expect(formatPercent(NaN)).toBe('0%');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3h 20m');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2d 4h');
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(-1)).toBe('0s');
    expect(formatDuration(NaN)).toBe('0s');
  });
});
