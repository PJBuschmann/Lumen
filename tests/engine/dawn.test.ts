import { describe, expect, it } from 'vitest';
import {
  D,
  advanceInPlace,
  applyAction,
  apprenticeSkills,
  canDawn,
  cloneState,
  createInitialState,
  dawnGain,
  dawnUpgradeAffordable,
  dawnUpgradeCost,
  dawnUpgradeMaxLevel,
  getDerived,
  glimmerMultiplier,
  longNightBonus,
  longNightPower,
  radianceMultiplier,
  resetDawn,
  seaLanesTraffic,
  startingLight,
  tick,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { DAWN } from '../../src/content/dawn';
import { NIGHT } from '../../src/content/night';

function readyForDawn(mult = 16): GameState {
  const state = createInitialState(11);
  state.night.runLight = D(DAWN.threshold).mul(mult);
  state.night.light = D(1234);
  state.night.upgrades.wick = 40;
  state.derived = null;
  return state;
}

describe('dawn', () => {
  it('is unavailable below the threshold', () => {
    const state = createInitialState(1);
    state.night.runLight = D(DAWN.threshold).mul(0.99);
    expect(canDawn(state)).toBe(false);
    expect(dawnGain(state).toNumber()).toBe(0);
    expect(applyAction(state, { type: 'dawn' })).toBe(state);
  });

  it('gathers Glimmer by the power law and resets the night', () => {
    const state = readyForDawn(16);
    const expected = DAWN.glimmerCoef * 16 ** DAWN.glimmerExponent;
    expect(dawnGain(state).toNumber()).toBeCloseTo(expected, 9);

    const next = applyAction(state, { type: 'dawn' });
    expect(next.dawn.glimmer.toNumber()).toBeCloseTo(expected, 9);
    expect(next.dawn.glimmerTotal.toNumber()).toBeCloseTo(expected, 9);
    expect(next.dawn.dawns).toBe(1);
    expect(next.night.upgrades.wick).toBe(0);
    expect(next.night.runLight.toNumber()).toBe(0);
    expect(next.night.light.toNumber()).toBe(0);
    expect(next.night.runTime).toBe(0);
    expect(next.stats.milestones.firstDawn).toBe(0);
    expect(next.events.some((e) => e.type === 'dawn')).toBe(true);
    // Lifetime stats are never lost.
    expect(next.stats.totalLight.eq(state.stats.totalLight)).toBe(true);
    // The first dawn brings the apprentice, who tends the whole lamp.
    expect(apprenticeSkills(state)).toEqual([]);
    expect(apprenticeSkills(next)).toEqual(DAWN.apprenticeTends);
  });

  it('Glimmer multiplies Light permanently', () => {
    expect(glimmerMultiplier(D(0)).toNumber()).toBe(1);
    expect(glimmerMultiplier(D(15)).toNumber()).toBeCloseTo(16 ** DAWN.multExponent, 9);
    const before = getDerived(readyForDawn()).lightPerShip;
    const after = applyAction(readyForDawn(), { type: 'dawn' });
    const perShip = getDerived(after).lightPerShip;
    expect(perShip.toNumber()).toBeCloseTo(glimmerMultiplier(after.dawn.glimmerTotal).toNumber(), 9);
    expect(before.gt(perShip)).toBe(true); // upgrades were reset, the multiplier stays
  });

  it('sells upgrades for Glimmer only after the first dawn', () => {
    const fresh = createInitialState(1);
    fresh.dawn.glimmer = D(1000);
    expect(applyAction(fresh, { type: 'buyDawnUpgrade', id: 'seaLanes' })).toBe(fresh);

    let state = applyAction(readyForDawn(1e8), { type: 'dawn' });
    const glimmer = state.dawn.glimmer;
    state = applyAction(state, { type: 'buyDawnUpgrade', id: 'seaLanes' });
    expect(state.dawn.upgrades.seaLanes).toBe(1);
    expect(state.dawn.glimmer.toNumber()).toBeCloseTo(
      glimmer.sub(dawnUpgradeCost('seaLanes', 0)).toNumber(),
      9,
    );
    // Spending Glimmer does not reduce the permanent multiplier.
    expect(state.dawn.glimmerTotal.eq(glimmer)).toBe(true);
    expect(getDerived(state).shipsPerSecond).toBeCloseTo(NIGHT.baseShipsPerSecond * seaLanesTraffic(1), 12);
    expect(applyAction(state, { type: 'buyDawnUpgrade', id: 'bogus' as 'embers' })).toBe(state);
    expect(applyAction(state, { type: 'buyDawnUpgrade', id: 'radiance', count: 0 })).toBe(state);
  });

  it('respects level caps and prices', () => {
    expect(dawnUpgradeMaxLevel('radiance')).toBe(Infinity);
    expect(dawnUpgradeMaxLevel('vigil')).toBe(DAWN.upgrades.vigil.maxLevel);
    expect(dawnUpgradeAffordable('vigil', DAWN.upgrades.vigil.maxLevel!, D('1e50'))).toBe(0);
    expect(dawnUpgradeAffordable('seaLanes', 0, D('1e50'))).toBe(DAWN.upgrades.seaLanes.maxLevel);
    expect(radianceMultiplier(3).toNumber()).toBeCloseTo(8, 9);
    expect(dawnUpgradeCost('radiance', 1).toNumber()).toBeCloseTo(
      DAWN.upgrades.radiance.baseCost * DAWN.upgrades.radiance.costRatio,
      6,
    );
  });

  it('banked embers start the next night with Light', () => {
    let state = applyAction(readyForDawn(1e8), { type: 'dawn' });
    expect(startingLight(state).toNumber()).toBe(0);
    state = applyAction(state, { type: 'buyDawnUpgrade', id: 'embers', count: 2 });
    expect(startingLight(state).toNumber()).toBeCloseTo(800, 9);
    state.night.runLight = D(DAWN.threshold);
    const next = applyAction(state, { type: 'dawn' });
    expect(next.night.light.toNumber()).toBeCloseTo(800, 9);
  });

  it('a long night makes a brighter dawn', () => {
    expect(longNightBonus(0, 0)).toBe(1);
    const { refHours, power, capHours } = DAWN.longNight;
    expect(longNightBonus(3600 * refHours, 0)).toBeCloseTo(2 ** power, 9);
    expect(longNightBonus(3600 * 4, 0)).toBeGreaterThan(longNightBonus(3600, 0));
    // Capped: a week away is worth as much as the cap.
    expect(longNightBonus(7 * 86400, 0)).toBeCloseTo(longNightBonus(capHours * 3600, 0), 9);
    expect(longNightBonus(-5, 0)).toBe(1);
    // Long vigil raises the exponent.
    expect(longNightPower(2)).toBeCloseTo(power + 0.2, 12);
    expect(longNightBonus(3600 * 4, 3)).toBeGreaterThan(longNightBonus(3600 * 4, 0));

    const quick = readyForDawn(16);
    const patient = readyForDawn(16);
    patient.night.runTime = 3 * 3600;
    expect(dawnGain(patient).toNumber()).toBeCloseTo(dawnGain(quick).toNumber() * longNightBonus(3 * 3600, 0), 6);
  });

  it('resetDawn clears Glimmer and its upgrades but the apprentice stays', () => {
    let state = applyAction(readyForDawn(1e12), { type: 'dawn' });
    state = applyAction(state, { type: 'buyDawnUpgrade', id: 'seaLanes', count: 2 });
    state = applyAction(state, { type: 'buyDawnUpgrade', id: 'vigil', count: 1 });
    expect(state.dawn.upgrades.seaLanes).toBe(2);
    const copy = cloneState(state);
    resetDawn(copy);
    expect(copy.dawn.upgrades).toEqual({ radiance: 0, seaLanes: 0, embers: 0, vigil: 0 });
    expect(copy.dawn.glimmer.toNumber()).toBe(0);
    expect(copy.dawn.glimmerTotal.toNumber()).toBe(0);
    expect(copy.dawn.dawns).toBe(state.dawn.dawns);
    expect(apprenticeSkills(copy).length).toBe(4);
    expect(copy.night.runTime).toBe(0);
  });
});

describe('apprentice keeper', () => {
  function withApprentice(): GameState {
    const state = createInitialState(9);
    state.dawn.dawns = 1;
    return state;
  }

  it('does nothing before the first dawn', () => {
    const state = createInitialState(9);
    state.night.light = D(1e6);
    const next = tick(state, 30);
    expect(next.night.upgrades.wick).toBe(0);
    expect(next.stats.autoPurchases).toBe(0);
  });

  it('tends the whole lamp and never overspends', () => {
    const state = withApprentice();
    state.night.light = D(1e9);
    const next = tick(state, 5);
    expect(next.night.upgrades.wick).toBeGreaterThan(20);
    expect(next.night.upgrades.oil).toBeGreaterThan(0);
    expect(next.night.upgrades.lens).toBeGreaterThan(0);
    expect(next.night.upgrades.rotation).toBeGreaterThan(0);
    expect(next.night.light.gte(0)).toBe(true);
    const levels = Object.values(next.night.upgrades).reduce((a, b) => a + b, 0);
    expect(next.stats.autoPurchases).toBe(levels);
    // Automation is not counted as a player purchase.
    expect(next.stats.purchases).toBe(0);
    expect(next.events.some((e) => e.type === 'purchase' && e.auto)).toBe(true);
  });

  it('plays the same online and offline (within 5%)', () => {
    const base = withApprentice();
    base.dawn.glimmerTotal = D(40);
    const seconds = 2 * 3600;

    const offline = cloneState(base);
    advanceInPlace(offline, seconds);

    let online = cloneState(base);
    for (let i = 0; i < seconds * 20; i++) online = tick(online, 0.05);

    const ratio = offline.night.runLight.div(online.night.runLight).toNumber();
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    expect(offline.night.upgrades).toEqual(online.night.upgrades);
    expect(offline.night.runLight.gt(DAWN.threshold)).toBe(true);
  });
});
