import { describe, expect, it } from 'vitest';
import {
  D,
  advanceInPlace,
  applyAction,
  applyOffline,
  baseGuideChance,
  beatInterval,
  cloneState,
  createInitialState,
  getDerived,
  nightUpgradeAffordable,
  nightUpgradeCost,
  nightUpgradeMaxLevel,
  nightUpgradeMultiplier,
  tick,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { NIGHT } from '../../src/content/night';
import { ENGINE } from '../../src/content/engine';

function rich(light: string | number = '1e12'): GameState {
  const state = createInitialState(7);
  state.night.light = D(light);
  return state;
}

describe('night formulas', () => {
  it('prices upgrades geometrically', () => {
    const def = NIGHT.upgrades.wick;
    expect(nightUpgradeCost('wick', 0).toNumber()).toBeCloseTo(def.baseCost, 9);
    expect(nightUpgradeCost('wick', 10).toNumber()).toBeCloseTo(def.baseCost * def.costRatio ** 10, 6);
    expect(nightUpgradeCost('wick', 0, 2).toNumber()).toBeCloseTo(def.baseCost * (1 + def.costRatio), 6);
  });

  it('wick adds flame and doubles at milestones', () => {
    expect(nightUpgradeMultiplier('wick', 0).toNumber()).toBe(1);
    expect(nightUpgradeMultiplier('wick', 4).toNumber()).toBe(5);
    expect(nightUpgradeMultiplier('wick', 24).toNumber()).toBe(25);
    expect(nightUpgradeMultiplier('wick', 25).toNumber()).toBe(52);
    expect(nightUpgradeMultiplier('wick', 50).toNumber()).toBe(51 * 4);
  });

  it('oil and lens multiply, rotation does not', () => {
    expect(nightUpgradeMultiplier('oil', 2).toNumber()).toBeCloseTo(2.25, 9);
    expect(nightUpgradeMultiplier('lens', 3).toNumber()).toBeCloseTo(8, 9);
    expect(nightUpgradeMultiplier('rotation', 5).toNumber()).toBe(1);
  });

  it('rotation raises guide chance up to a certain passage', () => {
    expect(baseGuideChance(0)).toBeCloseTo(NIGHT.baseGuideChance, 12);
    expect(baseGuideChance(nightUpgradeMaxLevel('rotation'))).toBe(1);
    expect(baseGuideChance(999)).toBe(1);
    expect(nightUpgradeMaxLevel('wick')).toBe(Infinity);
    expect(nightUpgradeAffordable('rotation', nightUpgradeMaxLevel('rotation'), D('1e99'))).toBe(0);
  });

  it('derives light per second from upgrades', () => {
    const state = rich();
    state.night.upgrades.wick = 4;
    state.night.upgrades.oil = 1;
    state.night.upgrades.lens = 1;
    const d = getDerived(state);
    expect(d.lightPerShip.toNumber()).toBeCloseTo(5 * 1.5 * 2, 9);
    expect(d.lightPerSecond.toNumber()).toBeCloseTo(
      15 * NIGHT.baseShipsPerSecond * NIGHT.baseGuideChance,
      9,
    );
  });

  it('heartbeat interval stretches with the age of the night', () => {
    expect(beatInterval(0)).toBe(1);
    expect(beatInterval(63)).toBe(1);
    expect(beatInterval(64)).toBe(2);
    expect(beatInterval(128)).toBe(4);
    expect(beatInterval(1e9)).toBe(ENGINE.heartbeat.maxInterval);
    for (const t of [70, 200, 900, 5000]) {
      expect(beatInterval(t) / t).toBeLessThanOrEqual(1 / 32);
    }
  });
});

describe('buying night upgrades', () => {
  it('spends light and raises the level', () => {
    const state = createInitialState(1);
    const next = applyAction(state, { type: 'buyNightUpgrade', id: 'wick' });
    expect(next).not.toBe(state);
    expect(next.night.upgrades.wick).toBe(1);
    expect(next.night.light.toNumber()).toBeCloseTo(0, 9);
    expect(next.stats.purchases).toBe(1);
    expect(next.stats.milestones.firstUpgrade).toBe(0);
    expect(next.events.some((e) => e.type === 'purchase')).toBe(true);
    // The input was not mutated.
    expect(state.night.upgrades.wick).toBe(0);
    expect(state.night.light.toNumber()).toBe(NIGHT.startingLight);
  });

  it('returns the same state when unaffordable or invalid', () => {
    const state = createInitialState(1);
    expect(applyAction(state, { type: 'buyNightUpgrade', id: 'lens' })).toBe(state);
    expect(applyAction(state, { type: 'buyNightUpgrade', id: 'wick', count: 0 })).toBe(state);
    expect(applyAction(state, { type: 'buyNightUpgrade', id: 'nope' as 'wick' })).toBe(state);
    expect(applyAction(state, { type: 'unknown' } as never)).toBe(state);
  });

  it('buys in bulk and to the max', () => {
    const state = rich('1e6');
    const five = applyAction(state, { type: 'buyNightUpgrade', id: 'wick', count: 5 });
    expect(five.night.upgrades.wick).toBe(5);
    expect(five.night.light.toNumber()).toBeCloseTo(1e6 - nightUpgradeCost('wick', 0, 5).toNumber(), 3);
    const max = applyAction(state, { type: 'buyNightUpgrade', id: 'wick', count: 'max' });
    const level = max.night.upgrades.wick;
    expect(level).toBeGreaterThan(50);
    expect(max.night.light.gte(0)).toBe(true);
    expect(nightUpgradeCost('wick', level).gt(max.night.light)).toBe(true);
    const maxRot = applyAction(state, { type: 'buyNightUpgrade', id: 'rotation', count: 'max' });
    expect(maxRot.night.upgrades.rotation).toBe(nightUpgradeMaxLevel('rotation'));
  });
});

describe('ticking', () => {
  it('is pure', () => {
    const state = createInitialState(3);
    const before = JSON.stringify({ ...state, derived: null });
    const next = tick(state, 30);
    expect(next).not.toBe(state);
    expect(JSON.stringify({ ...state, derived: null })).toBe(before);
    expect(next.time).toBeCloseTo(30, 9);
  });

  it('ignores zero, negative and non-finite dt', () => {
    const state = createInitialState(3);
    for (const dt of [0, -5, NaN, Infinity]) {
      const next = tick(state, dt);
      expect(next.time).toBe(0);
      expect(next.night.light.toNumber()).toBe(NIGHT.startingLight);
    }
  });

  it('counts ships by elapsed time, guided by the guide chance', () => {
    const state = createInitialState(3);
    const next = tick(state, 1000);
    const ships = next.stats.shipsGuided + next.stats.shipsMissed;
    expect(ships).toBe(Math.floor(1000 * NIGHT.baseShipsPerSecond));
    expect(next.stats.shipsGuided).toBe(Math.floor(ships * NIGHT.baseGuideChance));
    expect(next.night.light.toNumber()).toBeCloseTo(
      NIGHT.startingLight + next.stats.shipsGuided * NIGHT.baseLightPerShip,
      6,
    );
    expect(next.night.runLight.toNumber()).toBeCloseTo(next.stats.shipsGuided, 6);
    expect(next.stats.totalLight.eq(next.night.runLight)).toBe(true);
    expect(next.stats.bestRunLight.eq(next.night.runLight)).toBe(true);
    expect(next.stats.milestones.firstShip).toBeGreaterThan(0);
  });

  it('gives the same result however time is sliced', () => {
    const base = rich('1e9');
    base.night.upgrades.wick = 30;
    base.night.upgrades.rotation = 3;
    base.derived = null;

    const oneLeap = cloneState(base);
    advanceInPlace(oneLeap, 7200);

    const frames = cloneState(base);
    for (let i = 0; i < 7200 * 20; i++) advanceInPlace(frames, 0.05);

    let ragged = cloneState(base);
    let left = 7200;
    let k = 0;
    while (left > 1e-9) {
      const dt = Math.min(left, 0.013 + ((k++ * 7919) % 97) * 0.37);
      ragged = tick(ragged, dt);
      left -= dt;
    }

    for (const other of [frames, ragged]) {
      expect(other.time).toBeCloseTo(oneLeap.time, 5);
      expect(Math.abs(other.stats.shipsGuided - oneLeap.stats.shipsGuided)).toBeLessThanOrEqual(1);
      const ratio = other.night.light.div(oneLeap.night.light).toNumber();
      expect(ratio).toBeGreaterThan(0.999);
      expect(ratio).toBeLessThan(1.001);
      expect(other.night.nextBeat).toBeCloseTo(oneLeap.night.nextBeat, 6);
    }
  });

  it('emits ship events for the UI but caps them', () => {
    const state = createInitialState(3);
    const small = tick(state, 2.5);
    const ships = small.events.filter((e) => e.type === 'ship');
    expect(ships.length).toBeGreaterThanOrEqual(1);
    const big = tick(state, 600);
    expect(big.events.length).toBeLessThanOrEqual(ENGINE.maxEventsPerTick);
  });

  it('events are transient: cloning drops them', () => {
    const state = tick(createInitialState(3), 5);
    expect(state.events.length).toBeGreaterThan(0);
    expect(cloneState(state).events).toEqual([]);
  });
});

describe('offline progress', () => {
  it('matches online progress', () => {
    const base = rich('1e6');
    base.night.upgrades.wick = 12;
    base.derived = null;
    const seconds = 3 * 3600;

    let online = cloneState(base);
    for (let i = 0; i < seconds * 10; i++) online = tick(online, 0.1);
    const { state: offline, summary } = applyOffline(base, seconds);

    const ratio = offline.stats.totalLight.div(online.stats.totalLight).toNumber();
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    expect(summary.appliedSeconds).toBe(seconds);
    expect(summary.capped).toBe(false);
    expect(summary.lightEarned.eq(offline.stats.totalLight)).toBe(true);
    expect(summary.shipsGuided).toBe(offline.stats.shipsGuided);
    expect(offline.stats.offlineTime).toBe(seconds);
  });

  it('is capped at 24 hours', () => {
    const base = createInitialState(5);
    const { state, summary } = applyOffline(base, 5 * 86400);
    expect(summary.capped).toBe(true);
    expect(summary.appliedSeconds).toBe(ENGINE.offline.maxSeconds);
    expect(summary.elapsedSeconds).toBe(5 * 86400);
    expect(state.time).toBeCloseTo(ENGINE.offline.maxSeconds, 3);
  });

  it('treats bad elapsed values as zero', () => {
    const base = createInitialState(5);
    for (const elapsed of [NaN, -100, Infinity]) {
      const { state, summary } = applyOffline(base, elapsed);
      expect(summary.appliedSeconds).toBe(0);
      expect(state.time).toBe(0);
    }
  });
});
