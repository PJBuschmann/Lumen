import { describe, expect, it } from 'vitest';
import {
  D,
  SCHEMA_VERSION,
  applyAction,
  checksum,
  createInitialState,
  exportSave,
  importSave,
  loadFromJson,
  loadSave,
  saveToJson,
  serializeState,
  tick,
} from '../../src/engine';
import type { GameState } from '../../src/engine';

function played(): GameState {
  let state = createInitialState(21);
  state = applyAction(state, { type: 'buyNightUpgrade', id: 'wick' });
  state = tick(state, 400);
  state = applyAction(state, { type: 'buyNightUpgrade', id: 'wick', count: 'max' });
  state = tick(state, 123.4);
  return state;
}

function comparable(state: GameState): string {
  return JSON.stringify(serializeState(state, 0));
}

describe('save and load', () => {
  it('round-trips through JSON', () => {
    const state = played();
    const result = loadFromJson(saveToJson(state, 1700000000000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedAt).toBe(1700000000000);
    expect(result.migratedFrom).toBe(SCHEMA_VERSION);
    expect(comparable(result.state)).toBe(comparable(state));
  });

  it('a loaded game continues exactly like the original', () => {
    const state = played();
    const result = loadFromJson(saveToJson(state, 1));
    if (!result.ok) throw new Error(result.error);
    expect(comparable(tick(result.state, 500))).toBe(comparable(tick(state, 500)));
  });

  it('keeps very large numbers', () => {
    const state = createInitialState(2);
    state.night.light = D('1.2345e1234');
    state.stats.totalLight = D('9.9e4321');
    const result = loadFromJson(saveToJson(state, 1));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.night.light.log10()).toBeCloseTo(1234.0915, 3);
    expect(result.state.stats.totalLight.exponent).toBe(4321);
  });

  it('round-trips through an export string', () => {
    const state = played();
    const text = exportSave(state, 5);
    expect(text.startsWith('LUMEN.')).toBe(true);
    const result = importSave(`  ${text}\n`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(comparable(result.state)).toBe(comparable(state));
  });

  it('rejects damaged or foreign export strings', () => {
    const text = exportSave(played(), 5);
    const [prefix, payload, sum] = text.split('.');
    expect(importSave('hello world').ok).toBe(false);
    expect(importSave(`${prefix}.${payload.slice(0, -4)}AAAA.${sum}`).ok).toBe(false);
    expect(importSave(`${prefix}.${payload}.00000000`).ok).toBe(false);
    expect(importSave(`OTHER.${payload}.${sum}`).ok).toBe(false);
    const junk = 'bm90IGpzb24=';
    expect(importSave(`${prefix}.${junk}.${checksum(junk)}`).ok).toBe(false);
    const notBase64 = '%%%';
    expect(importSave(`${prefix}.${notBase64}.${checksum(notBase64)}`).ok).toBe(false);
  });

  it('rejects malformed saves with a reason', () => {
    expect(loadSave(null).ok).toBe(false);
    expect(loadSave([]).ok).toBe(false);
    expect(loadSave({}).ok).toBe(false);
    expect(loadSave({ schema: 0, game: {} }).ok).toBe(false);
    expect(loadSave({ schema: 1.5, game: {} }).ok).toBe(false);
    expect(loadSave({ schema: 1 }).ok).toBe(false);
    expect(loadFromJson('{not json').ok).toBe(false);
    const future = loadSave({ schema: SCHEMA_VERSION + 1, game: {} });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/newer/);
  });

  it('repairs corrupted fields instead of failing', () => {
    const save = serializeState(played(), 1);
    const night = save.game.night as Record<string, unknown>;
    night.light = 'NaN';
    night.runLight = null;
    night.shipAcc = 55;
    night.nextBeat = -10;
    night.upgrades = { wick: -4, oil: 'lots', lens: Infinity };
    (save.game.stats as Record<string, unknown>).milestones = { firstShip: 'soon', bogus: 3 };
    save.game.rng = { weather: -1, log: 1.5 };
    save.game.time = NaN;

    const result = loadSave(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;
    expect(state.night.light.toNumber()).toBe(0);
    expect(state.night.runLight.toNumber()).toBe(0);
    expect(state.night.shipAcc).toBeLessThanOrEqual(1);
    expect(state.night.nextBeat).toBeGreaterThan(state.night.runTime);
    expect(state.night.upgrades).toEqual({ wick: 0, oil: 0, lens: 0, rotation: 0 });
    expect(state.stats.milestones.firstShip).toBeUndefined();
    expect(state.time).toBe(0);
    // And the repaired game still runs.
    const next = tick(state, 100);
    expect(next.night.light.gt(0)).toBe(true);
  });

  it('a minimal save body loads as a fresh game', () => {
    const result = loadSave({ schema: 1, savedAt: 9, game: {} });
    expect(result.ok).toBe(true);
    if (result.ok) expect(comparable(result.state)).toBe(comparable(createInitialState(1)));
  });
});
