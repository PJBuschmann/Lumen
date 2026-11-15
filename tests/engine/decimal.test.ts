import { describe, expect, it } from 'vitest';
import {
  D,
  Decimal,
  ZERO,
  geometricAfford,
  geometricCost,
  isFiniteDecimal,
  log10Floor0,
  log10p1,
  parseDecimal,
  polyCost,
  pow10,
  powLevel,
  sanitize,
} from '../../src/engine';
import { hash01, rngNext } from '../../src/engine';

describe('decimal helpers', () => {
  it('log10p1 is safe at zero and accurate at scale', () => {
    expect(log10p1(ZERO)).toBe(0);
    expect(log10p1(D(-5))).toBe(0);
    expect(log10p1(D(9))).toBeCloseTo(1, 12);
    expect(log10p1(D('1e500'))).toBeCloseTo(500, 9);
  });

  it('log10Floor0 never goes negative', () => {
    expect(log10Floor0(D(0.5))).toBe(0);
    expect(log10Floor0(D(1000))).toBeCloseTo(3, 12);
  });

  it('pow10 and powLevel handle huge and fractional exponents', () => {
    expect(pow10(1234.5).log10()).toBeCloseTo(1234.5, 9);
    expect(pow10(0).toNumber()).toBe(1);
    expect(isFiniteDecimal(pow10(Infinity))).toBe(true);
    expect(pow10(-Infinity).toNumber()).toBe(0);
    expect(powLevel(1.15, 0).toNumber()).toBe(1);
    expect(powLevel(2, 10).toNumber()).toBeCloseTo(1024, 6);
    expect(powLevel(1.15, 20000).log10()).toBeCloseTo(20000 * Math.log10(1.15), 6);
  });

  it('sanitize and parseDecimal reject NaN, Infinity, negatives and junk', () => {
    expect(sanitize(new Decimal(NaN)).toNumber()).toBe(0);
    expect(sanitize(D(-3)).toNumber()).toBe(0);
    expect(parseDecimal('1.5e300').log10()).toBeCloseTo(300.176, 3);
    expect(parseDecimal('not a number').toNumber()).toBe(0);
    expect(parseDecimal(undefined).toNumber()).toBe(0);
    expect(parseDecimal(Infinity).toNumber()).toBe(0);
    expect(parseDecimal(42).toNumber()).toBe(42);
    expect(parseDecimal(D(7)).toNumber()).toBe(7);
    expect(parseDecimal('x'.repeat(100)).toNumber()).toBe(0);
  });

  it('geometricCost sums a price series', () => {
    expect(geometricCost(D(10), 2, 0, 1).toNumber()).toBe(10);
    expect(geometricCost(D(10), 2, 0, 3).toNumber()).toBeCloseTo(70, 9);
    expect(geometricCost(D(10), 2, 3, 2).toNumber()).toBeCloseTo(80 + 160, 9);
    expect(geometricCost(D(10), 2, 0, 0).toNumber()).toBe(0);
  });

  it('geometricAfford never overspends and never underbuys (randomised)', () => {
    let seed = 12345;
    const rand = () => {
      const draw = rngNext(seed);
      seed = draw.next;
      return draw.value;
    };
    for (let i = 0; i < 2000; i++) {
      const ratio = 1.05 + rand() * 12;
      const owned = Math.floor(rand() * 3000);
      const base = D(1 + rand() * 500);
      const budget = geometricCost(base, ratio, owned, 1).mul(Math.pow(10, rand() * 12 - 2));
      const n = geometricAfford(budget, base, ratio, owned);
      if (n > 0) expect(geometricCost(base, ratio, owned, n).lte(budget)).toBe(true);
      expect(geometricCost(base, ratio, owned, n + 1).gt(budget)).toBe(true);
    }
  });

  it('geometricAfford respects caps and exact budgets', () => {
    expect(geometricAfford(D(70), D(10), 2, 0)).toBe(3);
    expect(geometricAfford(D(69.999), D(10), 2, 0)).toBe(2);
    expect(geometricAfford(D('1e100'), D(10), 2, 0, 5)).toBe(5);
    expect(geometricAfford(D(5), D(10), 2, 0)).toBe(0);
    expect(geometricAfford(D(500), D(10), 2, 0, 0)).toBe(0);
  });

  it('polyCost grows polynomially', () => {
    expect(polyCost(D(10), 2, 0).toNumber()).toBe(10);
    expect(polyCost(D(10), 2, 3).toNumber()).toBe(160);
  });
});

describe('rng', () => {
  it('is deterministic and uniform enough', () => {
    let a = 42;
    let b = 42;
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const da = rngNext(a);
      const db = rngNext(b);
      expect(da.value).toBe(db.value);
      expect(da.value).toBeGreaterThanOrEqual(0);
      expect(da.value).toBeLessThan(1);
      a = da.next;
      b = db.next;
      sum += da.value;
    }
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
  });

  it('hash01 is stateless and in range', () => {
    expect(hash01(7, 3)).toBe(hash01(7, 3));
    expect(hash01(7, 3)).not.toBe(hash01(7, 4));
    for (let i = 0; i < 1000; i++) {
      const v = hash01(99, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
