import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  SCHEMA_VERSION,
  apprenticeSkills,
  loadFromJson,
  migrateSave,
  saveToJson,
  tick,
} from '../../src/engine';

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

describe('save migrations', () => {
  it('has a migration for every schema version below the current one', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(typeof MIGRATIONS[v]).toBe('function');
    expect(MIGRATIONS[SCHEMA_VERSION]).toBeUndefined();
  });

  it('migrates a real schema-1 save (Night only) and keeps all progress', () => {
    const result = loadFromJson(fixture('save-v1.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(1);
    expect(result.savedAt).toBe(1763250000000);
    const state = result.state;
    expect(state.schema).toBe(SCHEMA_VERSION);
    expect(state.seed).toBe(4242);
    expect(state.time).toBeCloseTo(1817.25, 6);
    expect(state.night.upgrades).toEqual({ wick: 68, oil: 5, lens: 0, rotation: 10 });
    expect(state.night.light.toNumber()).toBeCloseTo(58968.1966, 3);
    expect(state.night.runLight.toNumber()).toBe(603946);
    expect(state.stats.shipsGuided).toBe(709);
    expect(state.stats.purchases).toBe(53);
    expect(state.stats.milestones.firstShip).toBe(4);
    // New in schema 2: Dawn starts untouched.
    expect(state.dawn.dawns).toBe(0);
    expect(state.dawn.glimmer.toNumber()).toBe(0);
    expect(state.dawn.upgrades).toEqual({ radiance: 0, seaLanes: 0, embers: 0, vigil: 0 });
    expect(state.stats.autoPurchases).toBe(0);
  });

  it('a migrated save keeps playing and saves at the current schema', () => {
    const result = loadFromJson(fixture('save-v1.json'));
    if (!result.ok) throw new Error(result.error);
    const next = tick(result.state, 600);
    expect(next.night.runLight.gt(result.state.night.runLight)).toBe(true);
    const again = loadFromJson(saveToJson(next, 5));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.migratedFrom).toBe(SCHEMA_VERSION);
  });

  it('migrates a real schema-2 save (Night + Dawn) and keeps all progress', () => {
    const result = loadFromJson(fixture('save-v2.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(2);
    const state = result.state;
    expect(state.schema).toBe(SCHEMA_VERSION);
    expect(state.seed).toBe(777);
    expect(state.night.upgrades).toEqual({ wick: 68, oil: 5, lens: 1, rotation: 6 });
    expect(state.dawn.dawns).toBe(22);
    expect(state.dawn.glimmerTotal.toNumber()).toBeCloseTo(121.1364, 3);
    // The apprentice no longer needs lessons: the one bought lesson (3 Glimmer) is handed back.
    expect(state.dawn.upgrades).toEqual({ radiance: 1, seaLanes: 3, embers: 3, vigil: 0 });
    expect(state.dawn.glimmer.toNumber()).toBeCloseTo(19.1364 + 3, 3);
    expect(apprenticeSkills(state).length).toBe(4);
    expect(state.stats.autoPurchases).toBe(2072);
    expect(state.stats.milestones.firstDawn).toBe(1480);
    // New in schema 3: the coastline and the tides are still out of sight.
    expect(state.coast.revealed).toBe(false);
    expect(state.coast.levels.every((level) => level === 0)).toBe(true);
    expect(state.coast.levels.length).toBeGreaterThan(0);
    expect(state.tides.revealed).toBe(false);
    expect(state.tides.swell.length).toBe(8);
    // And the game carries on.
    const next = tick(result.state, 300);
    expect(next.stats.totalLight.gt(state.stats.totalLight)).toBe(true);
  });

  it('migrates a real schema-3 save (through the Tides) and keeps all progress', () => {
    const result = loadFromJson(fixture('save-v3.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(3);
    const state = result.state;
    expect(state.schema).toBe(SCHEMA_VERSION);
    expect(state.seed).toBe(90210);
    expect(state.night.upgrades.wick).toBe(3997);
    expect(state.night.runLight.log10()).toBeCloseTo(244.39, 1);
    expect(state.dawn.upgrades).toEqual({ radiance: 20, seaLanes: 5, embers: 6, vigil: 5 });
    expect(state.coast.surveys).toBe(190);
    expect(state.coast.levels.slice(0, 4)).toEqual([26, 37, 37, 37]);
    expect(state.coast.record).toBeCloseTo(60.6896, 3);
    expect(state.tides.turns).toBe(192);
    expect(state.tides.swell).toEqual([25, 25, 25, 26, 26, 26, 25, 24]);
    expect(state.tides.linger).toEqual([0, 0, 0, 2, 3, 2, 0, 0]);
    expect(state.tides.phase).toBe(2);
    expect(state.stats.milestones.firstTides).toBeCloseTo(86847.1, 0);
    // New in schema 4: the stars and the aurora are still beyond the horizon.
    expect(state.stars.revealed).toBe(false);
    expect(state.stars.levels.every((level) => level === 0)).toBe(true);
    expect(state.aurora.unlocked).toBe(false);
    expect(state.aurora.active).toBeNull();
    expect(Object.values(state.aurora.completions).every((tier) => tier === 0)).toBe(true);
    // And the game carries on, moon and all. (Balance has changed since this save was made,
    // so we check that ships keep coming rather than comparing Light with the old economy.)
    const next = tick(result.state, 600);
    expect(next.stats.shipsGuided).toBeGreaterThan(state.stats.shipsGuided);
    expect(next.coast.stoneTotal.gt(state.coast.stoneTotal)).toBe(true);
    expect(next.tides.phaseEndsAt).toBeGreaterThan(state.tides.phaseEndsAt);
  });

  it('migrateSave steps one version at a time and fails loudly on a gap', () => {
    const migrated = migrateSave({ schema: 1, savedAt: 0, game: {} });
    expect(migrated.schema).toBe(SCHEMA_VERSION);
    expect(() => migrateSave({ schema: -3, savedAt: 0, game: {} })).toThrow(/No migration/);
  });

  it('does not mutate the save it migrates', () => {
    const raw = JSON.parse(fixture('save-v1.json'));
    const before = JSON.stringify(raw);
    migrateSave(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
