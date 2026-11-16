import { describe, expect, it } from 'vitest';
import {
  D,
  applyAction,
  baseDriftRate,
  canAscend,
  canReachStar,
  cloneState,
  completedConstellations,
  constellationComplete,
  constellationStars,
  createInitialState,
  getDerived,
  polarisIndex,
  starCost,
  starDef,
  starEffects,
  starGain,
  starIndex,
  starLinks,
  starMaxLevel,
  starOptions,
  starsAutomated,
  starsLit,
  swellTotal,
  tick,
  tideBasePower,
  tidesAutomated,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { STARS, STAR_COUNT } from '../../src/content/stars';

/** A keeper whose tides are strong enough to open the star map. */
function atStars(): GameState {
  const state = createInitialState(71);
  state.dawn.dawns = 50;
  state.coast.revealed = true;
  state.coast.surveys = 80;
  state.coast.record = 40;
  state.coast.levels = state.coast.levels.map(() => 30);
  state.tides.revealed = true;
  state.tides.turns = 120;
  state.tides.phaseEndsAt = 90;
  state.tides.swell = state.tides.swell.map(() => 40);
  state.tides.tideTotal = D(STARS.revealTide * 1.01);
  return tick(state, 2); // a heartbeat opens the map
}

function withDust(state: GameState, dust: number): GameState {
  const next = cloneState(state);
  next.stars.stardust = D(dust);
  return next;
}

describe('the star map', () => {
  it('is a connected tree of constellations around Polaris', () => {
    expect(STAR_COUNT).toBe(1 + STARS.constellations.length * 7);
    expect(new Set(STARS.stars.map((s) => s.id)).size).toBe(STAR_COUNT);
    expect(starIndex('polaris')).toBe(polarisIndex());
    expect(starIndex('no-such-star')).toBe(-1);

    // Links are two-way and never point at the star itself.
    for (let i = 0; i < STAR_COUNT; i++) {
      for (const n of starLinks(i)) {
        expect(n).not.toBe(i);
        expect(starLinks(n)).toContain(i);
      }
    }
    // Every star can be reached from Polaris.
    const seen = new Set<number>([polarisIndex()]);
    const queue = [polarisIndex()];
    while (queue.length) {
      for (const n of starLinks(queue.pop()!)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(STAR_COUNT);
  });

  it('gives every constellation seven stars and exactly one keystone', () => {
    for (const c of STARS.constellations) {
      const members = constellationStars(c.id);
      expect(members.length).toBe(7);
      expect(members.filter((i) => starDef(i).kind === 'keystone').length).toBe(1);
      expect(members.filter((i) => starDef(i).kind === 'beacon').length).toBe(4);
    }
    expect(constellationStars('nope')).toEqual([]);
  });

  it('keeps stars apart enough to tap', () => {
    let closest = Infinity;
    for (let i = 0; i < STAR_COUNT; i++) {
      for (let j = i + 1; j < STAR_COUNT; j++) {
        const a = starDef(i);
        const b = starDef(j);
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    expect(closest).toBeGreaterThan(40);
    for (const star of STARS.stars) {
      expect(Math.abs(star.x)).toBeLessThan(1000);
      expect(Math.abs(star.y)).toBeLessThan(1000);
    }
  });

  it('sums the effects of lit stars', () => {
    const none = new Array<number>(STAR_COUNT).fill(0);
    const neutral = starEffects(none);
    expect(neutral).toEqual({
      lightPower: 0,
      stoneMult: 1,
      tideMult: 1,
      dustMult: 1,
      glimmerLog: 0,
      trafficMult: 1,
      synergyMult: 1,
      resonance: 0,
      passiveDawnMult: 1,
      vigil: 0,
      swellMult: 1,
    });

    const beacon = STARS.kinds.beacon.effect.lightPower!;
    const levels = none.slice();
    levels[polarisIndex()] = 1;
    expect(starEffects(levels).lightPower).toBeCloseTo(STARS.polarisPower + beacon, 12);

    // The Anchor: two beacons, a quarry star, and its keystone (lighthouse synergy).
    levels[starIndex('anchor-1')] = 3;
    levels[starIndex('anchor-2')] = 2;
    levels[starIndex('anchor-3')] = 5; // quarry
    levels[starIndex('anchor-7')] = 1; // Harbor Bell
    const fx = starEffects(levels);
    expect(fx.lightPower).toBeCloseTo(STARS.polarisPower + 6 * beacon, 12);
    expect(fx.stoneMult).toBeCloseTo(1 + 5 * STARS.kinds.quarry.effect.stone!, 12);
    expect(fx.synergyMult).toBeCloseTo(1.5, 12);
  });

  it('rewards a completed constellation', () => {
    const levels = new Array<number>(STAR_COUNT).fill(0);
    levels[polarisIndex()] = 1;
    const members = constellationStars('lantern');
    for (const i of members.slice(0, -1)) levels[i] = 1;
    expect(constellationComplete(levels, 'lantern')).toBe(false);
    expect(completedConstellations(levels)).toEqual([]);
    const before = starEffects(levels).lightPower;
    levels[members[members.length - 1]] = 1; // the keystone: Bright Heart (+25% beacons)
    expect(constellationComplete(levels, 'lantern')).toBe(true);
    expect(completedConstellations(levels)).toEqual(['lantern']);
    const beacon = STARS.kinds.beacon.effect.lightPower!;
    const expected = STARS.polarisPower + 5 * beacon * 1.25 + STARS.constellationBonus;
    expect(starEffects(levels).lightPower).toBeCloseTo(expected, 12);
    expect(starEffects(levels).lightPower).toBeGreaterThan(before + STARS.constellationBonus);
    expect(constellationComplete(levels, 'nope')).toBe(false);
  });

  it('prices lighting by stars lit and brightening by level', () => {
    const levels = new Array<number>(STAR_COUNT).fill(0);
    levels[polarisIndex()] = 1;
    const a = starIndex('lantern-1');
    const first = starCost(levels, a);
    levels[starIndex('anchor-1')] = 1;
    expect(starCost(levels, a).gt(first)).toBe(true); // one more star is lit
    levels[a] = 1;
    const brighten1 = starCost(levels, a);
    levels[a] = 4;
    expect(starCost(levels, a).gt(brighten1)).toBe(true);
    // Specials and keystones cost more than beacons.
    const fresh = new Array<number>(STAR_COUNT).fill(0);
    expect(starCost(fresh, starIndex('lantern-7')).toNumber()).toBeCloseTo(
      starCost(fresh, starIndex('lantern-1')).toNumber() * STARS.kinds.keystone.cost,
      6,
    );
    expect(starMaxLevel(starIndex('lantern-7'))).toBe(1);
    expect(starMaxLevel(starIndex('lantern-1'))).toBe(Infinity);
  });

  it('drifts Stardust in by tide power', () => {
    expect(baseDriftRate(0)).toBe(0);
    expect(baseDriftRate(10)).toBeCloseTo(STARS.driftRate * (10 - STARS.driftOffset) ** STARS.driftPower, 12);
  });
});

describe('constellations layer', () => {
  it('stays closed until enough Tide has been drawn', () => {
    const state = createInitialState(3);
    state.tides.revealed = true;
    state.tides.phaseEndsAt = 90;
    state.tides.tideTotal = D(STARS.revealTide * 0.5);
    const next = tick(state, 30);
    expect(next.stars.revealed).toBe(false);
    expect(getDerived(next).stardustPerSecond.toNumber()).toBe(0);
    expect(starOptions(next)).toEqual([]);
    expect(applyAction(next, { type: 'ascend' })).toBe(next);
    expect(applyAction(next, { type: 'lightStar', star: polarisIndex() })).toBe(next);
  });

  it('opens with Polaris shining and Stardust drifting in', () => {
    const state = atStars();
    expect(state.stars.revealed).toBe(true);
    expect(state.stars.levels[polarisIndex()]).toBe(1);
    expect(starsLit(state.stars.levels)).toBe(0);
    const d = getDerived(state);
    expect(d.starPower).toBeCloseTo(starEffects(state.stars.levels).lightPower, 12);
    expect(d.stardustPerSecond.toNumber()).toBeCloseTo(baseDriftRate(tideBasePower(state.tides.swell)), 9);
    const later = tick(state, 600);
    expect(later.stars.pending.toNumber()).toBeGreaterThan(d.stardustPerSecond.toNumber() * 590);
    expect(later.stars.stardust.toNumber()).toBe(0);
  });

  it('only lights stars that touch a lit one', () => {
    const state = withDust(atStars(), 1e12);
    const far = starIndex('keeper-3');
    const near = starIndex('lantern-1');
    expect(canReachStar(state.stars.levels, far)).toBe(false);
    expect(canReachStar(state.stars.levels, near)).toBe(true);
    expect(canReachStar(state.stars.levels, -1)).toBe(false);
    expect(applyAction(state, { type: 'lightStar', star: far })).toBe(state);
    expect(applyAction(state, { type: 'lightStar', star: 9999 })).toBe(state);
    expect(applyAction(state, { type: 'lightStar', star: 1.5 })).toBe(state);

    const lit = applyAction(state, { type: 'lightStar', star: near });
    expect(lit.stars.levels[near]).toBe(1);
    expect(starsLit(lit.stars.levels)).toBe(1);
    expect(lit.stars.stardust.toNumber()).toBeCloseTo(1e12 - starCost(state.stars.levels, near).toNumber(), 0);
    expect(getDerived(lit).starPower).toBeGreaterThan(getDerived(state).starPower);
    expect(lit.stats.purchases).toBe(state.stats.purchases + 1);

    // Options only list reachable stars, and each has a positive value.
    const options = starOptions(lit);
    const offered = new Set(options.map((o) => (o.action.type === 'lightStar' ? o.action.star : -1)));
    expect(offered.has(far)).toBe(false);
    expect(offered.has(starIndex('lantern-2'))).toBe(true);
    expect(options.every((o) => o.cost.gt(0) && o.gain >= 0)).toBe(true);
    expect(starGain(lit, near)).toBeCloseTo(STARS.kinds.beacon.effect.lightPower!, 9);
  });

  it('brightens in bulk, respects level caps, and never overspends', () => {
    let state = withDust(atStars(), 1e15);
    const a = starIndex('lantern-1');
    state = applyAction(state, { type: 'lightStar', star: a, count: 5 });
    expect(state.stars.levels[a]).toBe(5);
    // Walk to the keystone and try to brighten it twice.
    for (const id of ['lantern-2', 'lantern-3', 'lantern-7']) {
      state = applyAction(state, { type: 'lightStar', star: starIndex(id), count: 3 });
    }
    expect(state.stars.levels[starIndex('lantern-7')]).toBe(1);
    expect(applyAction(state, { type: 'lightStar', star: starIndex('lantern-7') })).toBe(state);
    expect(starOptions(state).some((o) => o.label.endsWith('lantern-7'))).toBe(false);

    const poor = withDust(atStars(), 1);
    expect(applyAction(poor, { type: 'lightStar', star: a })).toBe(poor);
    const some = withDust(atStars(), starCost(poor.stars.levels, a).toNumber() * 1.5);
    const bought = applyAction(some, { type: 'lightStar', star: a, count: 50 });
    expect(bought.stars.levels[a]).toBe(1);
    expect(bought.stars.stardust.gte(0)).toBe(true);
  });

  it('announces a completed constellation', () => {
    let state = withDust(atStars(), 1e18);
    const ids = ['lantern-1', 'lantern-2', 'lantern-3', 'lantern-4', 'lantern-5', 'lantern-6'];
    for (const id of ids) state = applyAction(state, { type: 'lightStar', star: starIndex(id) });
    expect(state.events.some((e) => e.type === 'constellation')).toBe(false);
    state = applyAction(state, { type: 'lightStar', star: starIndex('lantern-7') });
    expect(state.events.some((e) => e.type === 'constellation' && e.id === 'lantern')).toBe(true);
  });

  it('an Ascension claims Stardust and hands the tides to the stars', () => {
    let state = tick(atStars(), 3600);
    expect(canAscend(state)).toBe(true);
    expect(tidesAutomated(state)).toBe(false);
    const pending = state.stars.pending;
    const tideWaiting = state.tides.pending;
    expect(tideWaiting.gt(0)).toBe(true);
    const swell = swellTotal(state.tides.swell);

    state = applyAction(state, { type: 'ascend' });
    expect(state.stars.stardust.toNumber()).toBeCloseTo(pending.toNumber(), 6);
    expect(state.stars.pending.toNumber()).toBe(0);
    expect(state.stars.ascensions).toBe(1);
    expect(state.stats.milestones.firstStar).toBeDefined();
    expect(state.events.some((e) => e.type === 'ascend')).toBe(true);
    expect(state.night.runTime).toBe(0);
    expect(state.dawn.glimmerTotal.toNumber()).toBe(0);
    // Nothing structural is lost.
    expect(swellTotal(state.tides.swell)).toBe(swell);
    expect(state.stars.levels[polarisIndex()]).toBe(1);
    // The tides now tend themselves: waiting Tide was collected, and is spent automatically.
    expect(tidesAutomated(state)).toBe(true);
    expect(state.tides.pending.toNumber()).toBe(0);
    expect(state.tides.tide.gte(tideWaiting)).toBe(true);
    expect(applyAction(state, { type: 'turnTide' })).toBe(state);

    const later = tick(state, 3600);
    expect(later.tides.pending.toNumber()).toBe(0);
    expect(swellTotal(later.tides.swell)).toBeGreaterThan(swell);
    expect(later.stats.purchases).toBe(state.stats.purchases);
    expect(starsAutomated(later)).toBe(false);
  });
});
