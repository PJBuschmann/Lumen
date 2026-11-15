/**
 * Persistence: versioned save schema, migrations, and export/import as a string.
 *
 * A save is a plain JSON object { schema, savedAt, game }. Decimals are stored as strings.
 * Loading never trusts the input: every field is validated and falls back to a default,
 * so a damaged or hand-edited save can at worst lose the damaged field.
 */
import { NIGHT_UPGRADE_ORDER } from '../content/night';
import { parseDecimal } from './decimal';
import type { Decimal } from './decimal';
import { createInitialState } from './state';
import { MILESTONE_IDS, SCHEMA_VERSION } from './types';
import type { GameState } from './types';

export interface SaveFile {
  schema: number;
  /** Wall-clock milliseconds when the save was written (supplied by the caller). */
  savedAt: number;
  game: Record<string, unknown>;
}

export type LoadResult =
  | { ok: true; state: GameState; savedAt: number; migratedFrom: number }
  | { ok: false; error: string };

const EXPORT_PREFIX = 'LUMEN';

/* ------------------------------------------------------------------ */
/* Serialise                                                           */
/* ------------------------------------------------------------------ */

function dec(value: Decimal): string {
  return value.toString();
}

/** Milestones in canonical order, so equal states always serialise to equal text. */
function serializeMilestones(milestones: GameState['stats']['milestones']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of MILESTONE_IDS) {
    const at = milestones[id];
    if (at !== undefined) out[id] = at;
  }
  return out;
}

export function serializeState(state: GameState, savedAt: number): SaveFile {
  const n = state.night;
  const st = state.stats;
  return {
    schema: SCHEMA_VERSION,
    savedAt,
    game: {
      seed: state.seed,
      rng: { ...state.rng },
      time: state.time,
      night: {
        light: dec(n.light),
        runLight: dec(n.runLight),
        upgrades: { ...n.upgrades },
        shipAcc: n.shipAcc,
        guideAcc: n.guideAcc,
        runTime: n.runTime,
        lastBeat: n.lastBeat,
        nextBeat: n.nextBeat,
        shipsGuided: n.shipsGuided,
        shipsMissed: n.shipsMissed,
      },
      stats: {
        totalLight: dec(st.totalLight),
        bestRunLight: dec(st.bestRunLight),
        shipsGuided: st.shipsGuided,
        shipsMissed: st.shipsMissed,
        purchases: st.purchases,
        playTime: st.playTime,
        offlineTime: st.offlineTime,
        milestones: serializeMilestones(st.milestones),
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Migrations                                                          */
/* ------------------------------------------------------------------ */

type RawSave = { schema: number; savedAt: number; game: Record<string, unknown> };

/**
 * MIGRATIONS[n] upgrades a save from schema n to schema n + 1.
 * Never edit an old migration; append a new one.
 */
export const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {};

export function migrateSave(save: RawSave): RawSave {
  let current = save;
  let guard = 0;
  while (current.schema < SCHEMA_VERSION && guard++ < 1000) {
    const step = MIGRATIONS[current.schema];
    if (!step) throw new Error(`No migration from save schema ${current.schema}`);
    const next = step(current);
    current = { ...next, schema: current.schema + 1 };
  }
  return current;
}

/* ------------------------------------------------------------------ */
/* Deserialise (validating)                                            */
/* ------------------------------------------------------------------ */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readNumber(raw: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

export function readInt(raw: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.floor(readNumber(raw, fallback, min, max));
}

export function readUint32(raw: unknown, fallback: number): number {
  return readInt(raw, fallback, 0, 0xffffffff) >>> 0;
}

/** Build a valid GameState from an (already migrated) raw save body. */
export function hydrateState(game: Record<string, unknown>): GameState {
  const state = createInitialState(readUint32(game.seed, 1));
  state.time = readNumber(game.time, 0, 0);

  if (isRecord(game.rng)) {
    state.rng.weather = readUint32(game.rng.weather, state.rng.weather);
    state.rng.log = readUint32(game.rng.log, state.rng.log);
    state.rng.bottle = readUint32(game.rng.bottle, state.rng.bottle);
  }

  if (isRecord(game.night)) {
    const raw = game.night;
    const n = state.night;
    n.light = parseDecimal(raw.light);
    n.runLight = parseDecimal(raw.runLight);
    if (isRecord(raw.upgrades)) {
      for (const id of NIGHT_UPGRADE_ORDER) n.upgrades[id] = readInt(raw.upgrades[id], 0);
    }
    n.shipAcc = readNumber(raw.shipAcc, 0, 0, 1);
    n.guideAcc = readNumber(raw.guideAcc, 0, 0, 1);
    n.runTime = readNumber(raw.runTime, 0, 0);
    n.lastBeat = readNumber(raw.lastBeat, 0, 0, n.runTime);
    n.nextBeat = readNumber(raw.nextBeat, n.nextBeat, 0);
    // A beat can never be scheduled in the past or absurdly far ahead.
    if (n.nextBeat < n.runTime || n.nextBeat > n.runTime + 3600) n.nextBeat = n.runTime + 1;
    n.shipsGuided = readInt(raw.shipsGuided, 0);
    n.shipsMissed = readInt(raw.shipsMissed, 0);
  }

  if (isRecord(game.stats)) {
    const raw = game.stats;
    const st = state.stats;
    st.totalLight = parseDecimal(raw.totalLight);
    st.bestRunLight = parseDecimal(raw.bestRunLight);
    st.shipsGuided = readInt(raw.shipsGuided, 0);
    st.shipsMissed = readInt(raw.shipsMissed, 0);
    st.purchases = readInt(raw.purchases, 0);
    st.playTime = readNumber(raw.playTime, 0, 0);
    st.offlineTime = readNumber(raw.offlineTime, 0, 0);
    if (isRecord(raw.milestones)) {
      for (const id of MILESTONE_IDS) {
        const at = raw.milestones[id];
        if (typeof at === 'number' && Number.isFinite(at) && at >= 0) st.milestones[id] = at;
      }
    }
  }
  return state;
}

/** Load a parsed save object: migrate, validate, hydrate. */
export function loadSave(raw: unknown): LoadResult {
  try {
    if (!isRecord(raw)) return { ok: false, error: 'Save is not an object' };
    const schema = raw.schema;
    if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) {
      return { ok: false, error: 'Save has no valid schema version' };
    }
    if (schema > SCHEMA_VERSION) {
      return { ok: false, error: `Save is from a newer version of Lumen (schema ${schema})` };
    }
    if (!isRecord(raw.game)) return { ok: false, error: 'Save has no game data' };
    const migrated = migrateSave({
      schema,
      savedAt: readNumber(raw.savedAt, 0, 0),
      game: raw.game,
    });
    return {
      ok: true,
      state: hydrateState(migrated.game),
      savedAt: migrated.savedAt,
      migratedFrom: schema,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown save error' };
  }
}

/* ------------------------------------------------------------------ */
/* Strings: storage and export/import                                  */
/* ------------------------------------------------------------------ */

/** FNV-1a over a string, as 8 hex chars. Catches truncated or mistyped exports. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Compact JSON for device storage. */
export function saveToJson(state: GameState, savedAt: number): string {
  return JSON.stringify(serializeState(state, savedAt));
}

export function loadFromJson(json: string): LoadResult {
  try {
    return loadSave(JSON.parse(json));
  } catch {
    return { ok: false, error: 'Save is not valid JSON' };
  }
}

/** A copy-pasteable export string: LUMEN.<base64 json>.<checksum> */
export function exportSave(state: GameState, savedAt: number): string {
  const payload = toBase64(saveToJson(state, savedAt));
  return `${EXPORT_PREFIX}.${payload}.${checksum(payload)}`;
}

export function importSave(text: string): LoadResult {
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== EXPORT_PREFIX) {
    return { ok: false, error: 'That does not look like a Lumen save string' };
  }
  const [, payload, sum] = parts;
  if (checksum(payload) !== sum) {
    return { ok: false, error: 'Save string is damaged (checksum mismatch)' };
  }
  try {
    return loadFromJson(fromBase64(payload));
  } catch {
    return { ok: false, error: 'Save string could not be decoded' };
  }
}
