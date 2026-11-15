import { describe, expect, it } from 'vitest';
import {
  D,
  advanceInPlace,
  applyAction,
  apprenticeSkills,
  baseSurveyRate,
  bestAffordableOption,
  bestOption,
  canSurvey,
  cloneState,
  coastAutomated,
  coastMapSize,
  coastOptions,
  coastPower,
  coastTiles,
  createInitialState,
  dawnAutomated,
  getDerived,
  lighthouseBuildCost,
  lighthouseGain,
  lighthouseLevelCost,
  lighthousesBuilt,
  tick,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { COAST } from '../../src/content/coast';
import { DAWN } from '../../src/content/dawn';

/** A keeper who has just seen the coastline come into view. */
function atCoast(): GameState {
  const state = createInitialState(31);
  state.dawn.dawns = 12;
  state.dawn.glimmerTotal = D(COAST.revealGlimmer * 2);
  state.dawn.glimmer = D(50);
  return tick(state, 2); // a heartbeat reveals the coast and sets the record
}

function withStone(state: GameState, stone: number): GameState {
  const next = cloneState(state);
  next.coast.stone = D(stone);
  return next;
}

describe('the shore', () => {
  const tiles = coastTiles();

  it('is parsed from the map with symmetric neighbours', () => {
    const buildable = COAST.map.join('').replace(/~/g, '').length;
    expect(tiles.length).toBe(buildable);
    expect(coastMapSize()).toEqual({ width: COAST.map[0].length, height: COAST.map.length });
    for (const row of COAST.map) expect(row.length).toBe(COAST.map[0].length);
    for (const tile of tiles) {
      expect(tile.index).toBe(tiles.indexOf(tile));
      for (const n of tile.neighbors) {
        expect(tiles[n].neighbors).toContain(tile.index);
        expect(Math.abs(tiles[n].x - tile.x) + Math.abs(tiles[n].y - tile.y)).toBe(1);
      }
    }
    expect(new Set(tiles.map((t) => t.terrain))).toEqual(new Set(['shore', 'headland', 'reef']));
    // Every tile can touch another, so synergies are always possible.
    expect(tiles.every((t) => t.neighbors.length > 0)).toBe(true);
  });

  it('powers each lighthouse by level and terrain', () => {
    const levels = new Array<number>(tiles.length).fill(0);
    expect(coastPower(levels)).toBe(0);
    const shore = tiles.find((t) => t.terrain === 'shore')!;
    const reef = tiles.find((t) => t.terrain === 'reef')!;
    levels[shore.index] = 3;
    expect(coastPower(levels)).toBeCloseTo(3 * COAST.lighthouse.powerPerLevel, 12);
    levels[shore.index] = 0;
    levels[reef.index] = 2;
    expect(coastPower(levels)).toBeCloseTo(2 * COAST.lighthouse.powerPerLevel * COAST.terrain.reef.power, 12);
  });

  it('adds synergy for every level two neighbours share', () => {
    const levels = new Array<number>(tiles.length).fill(0);
    const a = tiles.find((t) => t.terrain === 'shore' && t.neighbors.some((n) => tiles[n].terrain === 'shore'))!;
    const b = tiles[a.neighbors.find((n) => tiles[n].terrain === 'shore')!];
    levels[a.index] = 5;
    levels[b.index] = 2;
    const alone = 7 * COAST.lighthouse.powerPerLevel;
    expect(coastPower(levels)).toBeCloseTo(alone + 2 * COAST.lighthouse.synergyPerPair, 12);
    // Raising the lower one shares another level; raising the higher one does not.
    expect(lighthouseGain(levels, b)).toBeCloseTo(COAST.lighthouse.powerPerLevel + COAST.lighthouse.synergyPerPair, 12);
    expect(lighthouseGain(levels, a)).toBeCloseTo(COAST.lighthouse.powerPerLevel, 12);
    levels[b.index] = 3;
    expect(coastPower(levels)).toBeCloseTo(8 * COAST.lighthouse.powerPerLevel + 3 * COAST.lighthouse.synergyPerPair, 12);
  });

  it('prices building and raising by count, level and terrain', () => {
    expect(lighthouseBuildCost(1, 'shore').gt(lighthouseBuildCost(0, 'shore'))).toBe(true);
    expect(lighthouseBuildCost(0, 'reef').toNumber()).toBeCloseTo(
      lighthouseBuildCost(0, 'shore').toNumber() * COAST.terrain.reef.cost,
      9,
    );
    expect(lighthouseLevelCost(5, 'shore').gt(lighthouseLevelCost(4, 'shore'))).toBe(true);
    expect(lighthouseLevelCost(3, 'headland').toNumber()).toBeCloseTo(
      lighthouseLevelCost(3, 'shore').toNumber() * COAST.terrain.headland.cost,
      9,
    );
  });

  it('surveys faster the higher the Glimmer record', () => {
    expect(baseSurveyRate(0)).toBe(0);
    expect(baseSurveyRate(COAST.surveyOffset)).toBe(0);
    expect(baseSurveyRate(10)).toBeGreaterThan(baseSurveyRate(5));
    expect(baseSurveyRate(COAST.surveyOffset + 2)).toBeCloseTo(COAST.surveyRate * 2 ** COAST.surveyPower, 12);
  });
});

describe('coastline layer', () => {
  it('stays out of sight until enough Glimmer is gathered', () => {
    const state = createInitialState(1);
    state.dawn.dawns = 3;
    state.dawn.glimmerTotal = D(COAST.revealGlimmer * 0.9);
    const next = tick(state, 30);
    expect(next.coast.revealed).toBe(false);
    expect(next.coast.pending.toNumber()).toBe(0);
    expect(getDerived(next).stonePerSecond.toNumber()).toBe(0);
    expect(coastOptions(next)).toEqual([]);
    expect(applyAction(next, { type: 'survey' })).toBe(next);
    expect(applyAction(next, { type: 'buildLighthouse', tile: 0 })).toBe(next);
  });

  it('comes into view at the gate and starts surveying Stone', () => {
    const state = atCoast();
    expect(state.coast.revealed).toBe(true);
    expect(state.coast.record).toBeCloseTo(Math.log10(1 + COAST.revealGlimmer * 2), 6);
    const rate = getDerived(state).stonePerSecond.toNumber();
    expect(rate).toBeCloseTo(baseSurveyRate(state.coast.record), 12);
    const later = tick(state, 600);
    expect(later.coast.pending.toNumber()).toBeGreaterThan(rate * 590);
    expect(later.coast.stone.toNumber()).toBe(0); // not banked yet
    expect(dawnAutomated(later)).toBe(false);
  });

  it('a Survey banks the Stone, begins a new night, and keeps the lighthouses', () => {
    let state = withStone(atCoast(), 500);
    state = applyAction(state, { type: 'buildLighthouse', tile: 2 });
    state = tick(state, 900);
    expect(canSurvey(state)).toBe(true);
    const pending = state.coast.pending;
    const stone = state.coast.stone;
    const record = state.coast.record;

    const next = applyAction(state, { type: 'survey' });
    expect(next.coast.stone.toNumber()).toBeCloseTo(stone.add(pending).toNumber(), 9);
    expect(next.coast.stoneTotal.toNumber()).toBeCloseTo(pending.toNumber(), 9);
    expect(next.coast.pending.toNumber()).toBe(0);
    expect(next.coast.surveys).toBe(1);
    expect(next.coast.levels[2]).toBe(1);
    expect(next.coast.record).toBe(record);
    expect(next.dawn.glimmerTotal.toNumber()).toBe(0);
    expect(apprenticeSkills(next).length).toBe(4); // the apprentice stays
    expect(next.night.runTime).toBe(0);
    expect(next.stats.milestones.firstCoast).toBeDefined();
    expect(next.events.some((e) => e.type === 'survey')).toBe(true);
    // Nothing to bank straight after.
    expect(applyAction(next, { type: 'survey' })).toBe(next);
  });

  it('builds and raises lighthouses for Stone', () => {
    const start = withStone(atCoast(), 1e6);
    const tile = coastTiles()[4];
    const built = applyAction(start, { type: 'buildLighthouse', tile: 4 });
    expect(built.coast.levels[4]).toBe(1);
    expect(built.coast.stone.toNumber()).toBeCloseTo(1e6 - lighthouseBuildCost(0, tile.terrain).toNumber(), 6);
    expect(lighthousesBuilt(built.coast.levels)).toBe(1);
    expect(applyAction(built, { type: 'buildLighthouse', tile: 4 })).toBe(built); // already there
    expect(applyAction(built, { type: 'raiseLighthouse', tile: 5 })).toBe(built); // nothing to raise
    expect(applyAction(built, { type: 'buildLighthouse', tile: 999 })).toBe(built);

    const raised = applyAction(built, { type: 'raiseLighthouse', tile: 4, count: 3 });
    expect(raised.coast.levels[4]).toBe(4);
    expect(raised.stats.purchases).toBe(built.stats.purchases + 1);
    expect(getDerived(raised).coastPower).toBeCloseTo(coastPower(raised.coast.levels), 12);
    expect(getDerived(raised).lightPerShip.gt(getDerived(built).lightPerShip)).toBe(true);

    const poor = withStone(atCoast(), 0.01);
    expect(applyAction(poor, { type: 'buildLighthouse', tile: 0 })).toBe(poor);
  });

  it('offers options and picks the best value', () => {
    const state = withStone(atCoast(), 1e6);
    const options = coastOptions(state);
    expect(options.length).toBe(coastTiles().length);
    expect(options.every((o) => o.gain > 0 && o.cost.gt(0))).toBe(true);
    const best = bestAffordableOption(options, state.coast.stone)!;
    for (const o of options) {
      expect(best.gain / best.cost.toNumber()).toBeGreaterThanOrEqual(o.gain / o.cost.toNumber() - 1e-12);
    }
    expect(bestAffordableOption(options, D(0))).toBeNull();
    expect(bestOption(options)).toBe(best);
    expect(bestOption([])).toBeNull();
  });

  it('after the first Survey, the harbour tends the dawn', () => {
    let state = tick(atCoast(), 600);
    state = applyAction(state, { type: 'survey' });
    expect(dawnAutomated(state)).toBe(true);
    // Give the new night a strong start so the threshold is crossed quickly.
    state.night.light = D('1e30');
    state.derived = null;
    const later = tick(state, 900);
    expect(later.night.runLight.gt(DAWN.threshold)).toBe(true);
    expect(later.dawn.glimmerTotal.gt(0)).toBe(true);
    expect(later.dawn.dawns).toBe(state.dawn.dawns); // no reset happened
    expect(later.night.runTime).toBeCloseTo(900, 6);
    expect(later.dawn.upgrades.seaLanes).toBeGreaterThan(0); // bought automatically
    // Greeting the dawn by hand is no longer a thing.
    expect(applyAction(later, { type: 'dawn' })).toBe(later);
    expect(coastAutomated(later)).toBe(false);
  });

  it('the Glimmer record only ever rises', () => {
    let state = tick(atCoast(), 600);
    const record = state.coast.record;
    state = applyAction(state, { type: 'survey' });
    const later = tick(state, 300);
    expect(later.coast.record).toBe(record);
    expect(getDerived(later).stonePerSecond.toNumber()).toBeCloseTo(baseSurveyRate(record), 12);
  });

  it('surveys the same Stone online and offline', () => {
    const base = tick(atCoast(), 5);
    const offline = cloneState(base);
    advanceInPlace(offline, 3600);
    let online = cloneState(base);
    for (let i = 0; i < 3600 * 10; i++) online = tick(online, 0.1);
    const ratio = offline.coast.pending.div(online.coast.pending).toNumber();
    expect(ratio).toBeGreaterThan(0.999);
    expect(ratio).toBeLessThan(1.001);
  });
});
