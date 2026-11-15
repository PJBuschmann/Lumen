import { NIGHT } from '../content/night';
import { ENGINE } from '../content/engine';
import { D, ZERO } from './decimal';
import { deriveSeed } from './rng';
import { SCHEMA_VERSION } from './types';
import { COAST } from '../content/coast';
import { PHASE_COUNT } from '../content/tides';
import type { CoastState, DawnState, GameState, NightState, StatsState, TidesState } from './types';

export function createNightState(): NightState {
  return {
    light: D(NIGHT.startingLight),
    runLight: ZERO,
    upgrades: { wick: 0, oil: 0, lens: 0, rotation: 0 },
    shipAcc: 0,
    guideAcc: 0,
    runTime: 0,
    lastBeat: 0,
    nextBeat: ENGINE.heartbeat.baseInterval,
    shipsGuided: 0,
    shipsMissed: 0,
  };
}

export function createDawnState(): DawnState {
  return {
    glimmer: ZERO,
    glimmerTotal: ZERO,
    dawns: 0,
    upgrades: { radiance: 0, seaLanes: 0, embers: 0, vigil: 0 },
  };
}

/** Number of buildable tiles on the coast map. */
export function coastTileCount(): number {
  let count = 0;
  for (const row of COAST.map) for (const ch of row) if (ch !== '~') count += 1;
  return count;
}

export function createCoastState(): CoastState {
  return {
    revealed: false,
    stone: ZERO,
    stoneTotal: ZERO,
    pending: ZERO,
    surveys: 0,
    levels: new Array<number>(coastTileCount()).fill(0),
    record: 0,
  };
}

export function createTidesState(): TidesState {
  return {
    revealed: false,
    tide: ZERO,
    tideTotal: ZERO,
    pending: ZERO,
    turns: 0,
    phase: 0,
    phaseEndsAt: 0,
    swell: new Array<number>(PHASE_COUNT).fill(0),
    linger: new Array<number>(PHASE_COUNT).fill(0),
  };
}

export function createStatsState(): StatsState {
  return {
    totalLight: ZERO,
    bestRunLight: ZERO,
    shipsGuided: 0,
    shipsMissed: 0,
    purchases: 0,
    autoPurchases: 0,
    playTime: 0,
    offlineTime: 0,
    milestones: {},
  };
}

/** A brand new game. The same seed always produces the same game. */
export function createInitialState(seed: number = 1): GameState {
  const s = seed >>> 0;
  return {
    schema: SCHEMA_VERSION,
    seed: s,
    rng: {
      weather: deriveSeed(s, 'weather'),
      log: deriveSeed(s, 'log'),
      bottle: deriveSeed(s, 'bottle'),
    },
    time: 0,
    night: createNightState(),
    dawn: createDawnState(),
    coast: createCoastState(),
    tides: createTidesState(),
    stats: createStatsState(),
    events: [],
    derived: null,
  };
}

/**
 * Structural copy. Decimals are immutable, so they are shared; everything mutable is copied.
 * The derived cache is immutable once built, so sharing it is safe too.
 */
export function cloneState(state: GameState): GameState {
  return {
    schema: state.schema,
    seed: state.seed,
    rng: { ...state.rng },
    time: state.time,
    night: { ...state.night, upgrades: { ...state.night.upgrades } },
    dawn: { ...state.dawn, upgrades: { ...state.dawn.upgrades } },
    coast: { ...state.coast, levels: state.coast.levels.slice() },
    tides: { ...state.tides, swell: state.tides.swell.slice(), linger: state.tides.linger.slice() },
    stats: { ...state.stats, milestones: { ...state.stats.milestones } },
    events: [],
    derived: state.derived,
  };
}
