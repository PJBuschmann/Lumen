import { describe, expect, it } from 'vitest';
import {
  D,
  advanceInPlace,
  applyAction,
  averageTraffic,
  basePullRate,
  canTurnTide,
  cloneState,
  coastAutomated,
  coastPower,
  coastTiles,
  createInitialState,
  getDerived,
  lingerCost,
  moonCycleDuration,
  moonPhase,
  phaseDuration,
  swellCost,
  swellTotal,
  tideBasePower,
  tideOptions,
  tidePowerAt,
  tick,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { COAST } from '../../src/content/coast';
import { NIGHT } from '../../src/content/night';
import { PHASE_COUNT, TIDES } from '../../src/content/tides';

/** A keeper with a modest coastline who can just read the tides. */
function atTides(): GameState {
  const state = createInitialState(53);
  state.dawn.dawns = 30;
  state.dawn.glimmerTotal = D(1e6);
  state.coast.revealed = true;
  state.coast.surveys = 40;
  state.coast.record = 6;
  state.coast.levels = coastTiles().map((t) => (t.index % 2 === 0 ? 4 : 3));
  state.coast.stoneTotal = D(TIDES.revealStone * 1.01);
  return tick(state, 2); // a heartbeat reveals the tides and starts the moon
}

function withTide(state: GameState, tide: number): GameState {
  const next = cloneState(state);
  next.tides.tide = D(tide);
  return next;
}

describe('the moon', () => {
  it('has eight phases that balance traffic against glow', () => {
    expect(PHASE_COUNT).toBe(8);
    expect(new Set(TIDES.phases.map((p) => p.id)).size).toBe(8);
    expect(moonPhase(0).id).toBe('new');
    expect(moonPhase(8).id).toBe('new');
    expect(moonPhase(-1).id).toBe(moonPhase(7).id);
    const full = TIDES.phases.find((p) => p.id === 'full')!;
    const dark = TIDES.phases.find((p) => p.id === 'new')!;
    expect(full.traffic).toBeGreaterThan(dark.traffic);
    expect(dark.glow).toBeGreaterThan(full.glow);
  });

  it('Linger stretches a phase and shifts the average traffic', () => {
    const none = new Array<number>(PHASE_COUNT).fill(0);
    expect(phaseDuration(none, 3)).toBe(TIDES.phaseSeconds);
    expect(moonCycleDuration(none)).toBe(TIDES.phaseSeconds * PHASE_COUNT);
    const plain = averageTraffic(none);
    const busy = none.slice();
    busy[4] = 2; // full moon
    expect(phaseDuration(busy, 4)).toBeCloseTo(TIDES.phaseSeconds * (1 + 2 * TIDES.linger.step), 9);
    expect(averageTraffic(busy)).toBeGreaterThan(plain);
    const quiet = none.slice();
    quiet[0] = 2; // new moon
    expect(averageTraffic(quiet)).toBeLessThan(plain);
  });

  it('Swell adds power always, and again while its phase is in the sky', () => {
    const swell = new Array<number>(PHASE_COUNT).fill(0);
    swell[2] = 5;
    swell[6] = 1;
    expect(swellTotal(swell)).toBe(6);
    expect(tideBasePower(swell)).toBeCloseTo(6 * TIDES.swell.powerPerLevel, 12);
    expect(tidePowerAt(swell, 0)).toBeCloseTo(6 * TIDES.swell.powerPerLevel, 12);
    expect(tidePowerAt(swell, 2)).toBeCloseTo((6 + 5 * TIDES.swell.resonance) * TIDES.swell.powerPerLevel, 12);
  });

  it('prices Swell polynomially and Linger geometrically', () => {
    expect(swellCost(1).gt(swellCost(0))).toBe(true);
    expect(swellCost(3).toNumber()).toBeCloseTo(
      TIDES.swell.cost.base * (3 + TIDES.swell.cost.offset) ** TIDES.swell.cost.power,
      9,
    );
    expect(lingerCost(2).toNumber()).toBeCloseTo(TIDES.linger.cost.base * TIDES.linger.cost.ratio ** 2, 6);
  });

  it('draws Tide by coast power and traffic', () => {
    expect(basePullRate(0, 0)).toBe(0);
    expect(basePullRate(10, 4)).toBeCloseTo(
      TIDES.pullRate * (10 - TIDES.pullOffset) ** TIDES.pullPower * TIDES.phases[4].traffic,
      12,
    );
    expect(basePullRate(10, 4)).toBeGreaterThan(basePullRate(10, 0));
  });
});

describe('tides layer', () => {
  it('stays unread until enough Stone has been surveyed', () => {
    const state = createInitialState(2);
    state.coast.revealed = true;
    state.coast.stoneTotal = D(TIDES.revealStone * 0.5);
    const next = tick(state, 60);
    expect(next.tides.revealed).toBe(false);
    expect(getDerived(next).tidePerSecond.toNumber()).toBe(0);
    expect(getDerived(next).parts.glow).toBe(1);
    expect(tideOptions(next)).toEqual([]);
    expect(applyAction(next, { type: 'turnTide' })).toBe(next);
    expect(applyAction(next, { type: 'swellPhase', phase: 0 })).toBe(next);
    expect(applyAction(next, { type: 'lingerPhase', phase: 0 })).toBe(next);
  });

  it('is revealed by a purchase that crosses the gate, too', () => {
    const state = createInitialState(2);
    state.coast.revealed = true;
    state.coast.stone = D(1e6);
    state.coast.stoneTotal = D(TIDES.revealStone);
    const next = applyAction(state, { type: 'buildLighthouse', tile: 0 });
    expect(next.tides.revealed).toBe(true);
    expect(next.events.some((e) => e.type === 'reveal' && e.layer === 'tides')).toBe(true);
  });

  it('starts the moon at the new moon and applies the phase to the night', () => {
    const state = atTides();
    expect(state.tides.revealed).toBe(true);
    expect(state.tides.phase).toBe(0);
    // Revealed on the first heartbeat (t = 1 s), so the first phase ends one phase later.
    expect(state.tides.phaseEndsAt).toBeCloseTo(1 + TIDES.phaseSeconds, 6);
    const d = getDerived(state);
    expect(d.parts.glow).toBe(TIDES.phases[0].glow);
    expect(d.shipsPerSecond).toBeCloseTo(NIGHT.baseShipsPerSecond * TIDES.phases[0].traffic, 12);
    expect(d.tidePerSecond.toNumber()).toBeCloseTo(basePullRate(coastPower(state.coast.levels), 0), 12);
  });

  it('moves through the phases on schedule however time is sliced', () => {
    const base = atTides();
    const leap = cloneState(base);
    advanceInPlace(leap, TIDES.phaseSeconds * 11.5);
    let frames = cloneState(base);
    for (let i = 0; i < TIDES.phaseSeconds * 11.5 * 10; i++) frames = tick(frames, 0.1);
    expect(leap.tides.phase).toBe(frames.tides.phase);
    expect(leap.tides.phase).toBe(11 % PHASE_COUNT);
    expect(leap.tides.phaseEndsAt).toBeCloseTo(frames.tides.phaseEndsAt, 6);
    const ratio = leap.tides.pending.div(frames.tides.pending).toNumber();
    expect(ratio).toBeGreaterThan(0.999);
    expect(ratio).toBeLessThan(1.001);
  });

  it('announces each new phase', () => {
    const state = atTides();
    const next = tick(state, TIDES.phaseSeconds);
    expect(next.events.some((e) => e.type === 'phase' && e.phase === 1)).toBe(true);
  });

  it('turning the tide claims the Tide and hands the coastline to the builders', () => {
    let state = tick(atTides(), 1200);
    expect(canTurnTide(state)).toBe(true);
    expect(coastAutomated(state)).toBe(false);
    const pending = state.tides.pending;
    const levels = state.coast.levels.slice();
    const swell = state.tides.swell.slice();

    state = applyAction(state, { type: 'turnTide' });
    expect(state.tides.tide.toNumber()).toBeCloseTo(pending.toNumber(), 9);
    expect(state.tides.tideTotal.toNumber()).toBeCloseTo(pending.toNumber(), 9);
    expect(state.tides.pending.toNumber()).toBe(0);
    expect(state.tides.turns).toBe(1);
    expect(state.coast.levels).toEqual(levels);
    expect(state.tides.swell).toEqual(swell);
    expect(state.dawn.glimmerTotal.toNumber()).toBe(0);
    expect(state.stats.milestones.firstTides).toBeDefined();
    expect(coastAutomated(state)).toBe(true);
    expect(applyAction(state, { type: 'survey' })).toBe(state); // nothing left to do by hand

    // From now on Stone arrives on its own and is spent on lighthouses.
    const later = tick(state, 1800);
    expect(later.coast.pending.toNumber()).toBe(0);
    expect(later.coast.stoneTotal.gt(state.coast.stoneTotal)).toBe(true);
    expect(coastPower(later.coast.levels)).toBeGreaterThan(coastPower(levels));
    expect(later.stats.autoPurchases).toBeGreaterThan(state.stats.autoPurchases);
    expect(later.stats.purchases).toBe(state.stats.purchases);
  });

  it('reshapes the cycle with Swell and Linger', () => {
    const start = withTide(atTides(), 1e6);
    const swollen = applyAction(start, { type: 'swellPhase', phase: 0, count: 3 });
    expect(swollen.tides.swell[0]).toBe(3);
    expect(getDerived(swollen).tidePower).toBeCloseTo(tidePowerAt(swollen.tides.swell, 0), 12);
    expect(getDerived(swollen).lightPerShip.gt(getDerived(start).lightPerShip)).toBe(true);

    const endsAt = swollen.tides.phaseEndsAt;
    const lingered = applyAction(swollen, { type: 'lingerPhase', phase: 0 });
    expect(lingered.tides.linger[0]).toBe(1);
    expect(lingered.tides.phaseEndsAt).toBeCloseTo(endsAt + TIDES.phaseSeconds * TIDES.linger.step, 9);
    const other = applyAction(lingered, { type: 'lingerPhase', phase: 5 });
    expect(other.tides.phaseEndsAt).toBe(lingered.tides.phaseEndsAt);

    let maxed = lingered;
    for (let i = 0; i < 10; i++) maxed = applyAction(maxed, { type: 'lingerPhase', phase: 0 });
    expect(maxed.tides.linger[0]).toBe(TIDES.linger.maxLevel);

    expect(applyAction(start, { type: 'swellPhase', phase: 99 })).toBe(start);
    expect(applyAction(start, { type: 'swellPhase', phase: 1.5 })).toBe(start);
    expect(applyAction(start, { type: 'lingerPhase', phase: -1 })).toBe(start);
    const poor = withTide(atTides(), 0);
    expect(applyAction(poor, { type: 'swellPhase', phase: 0 })).toBe(poor);
    expect(applyAction(poor, { type: 'lingerPhase', phase: 0 })).toBe(poor);
  });

  it('values lingering busy phases and never quiet ones', () => {
    const state = withTide(atTides(), 1e9);
    const options = tideOptions(state);
    expect(options.filter((o) => o.action.type === 'swellPhase').length).toBe(PHASE_COUNT);
    const linger = (phase: number) =>
      options.find((o) => o.action.type === 'lingerPhase' && o.action.phase === phase)!;
    expect(linger(4).gain).toBeGreaterThan(0); // full moon
    expect(linger(0).gain).toBe(0); // new moon
    let maxed = state;
    for (let i = 0; i < TIDES.linger.maxLevel; i++) maxed = applyAction(maxed, { type: 'lingerPhase', phase: 4 });
    expect(tideOptions(maxed).some((o) => o.action.type === 'lingerPhase' && o.action.phase === 4)).toBe(false);
  });

  it('a fully automated coastline plays the same online and offline (within 5%)', () => {
    let base = tick(atTides(), 1200);
    base = applyAction(base, { type: 'turnTide' });
    const seconds = 2 * 3600;

    const offline = cloneState(base);
    advanceInPlace(offline, seconds);
    let online = cloneState(base);
    for (let i = 0; i < seconds * 10; i++) online = tick(online, 0.1);

    const near = (a: number, b: number) => {
      expect(a / b).toBeGreaterThan(0.95);
      expect(a / b).toBeLessThan(1.05);
    };
    near(offline.stats.totalLight.log10(), online.stats.totalLight.log10());
    near(offline.coast.stoneTotal.toNumber(), online.coast.stoneTotal.toNumber());
    near(offline.tides.pending.toNumber(), online.tides.pending.toNumber());
    near(coastPower(offline.coast.levels), coastPower(online.coast.levels));
    expect(offline.tides.phase).toBe(online.tides.phase);
    expect(offline.coast.record).toBeCloseTo(online.coast.record, 1);
    expect(COAST.autoBuildPerBeat).toBeGreaterThan(0);
  });
});
