import { NIGHT } from '../content/night';
import { ENGINE } from '../content/engine';
import { D, ZERO } from './decimal';
import { deriveSeed } from './rng';
import { SCHEMA_VERSION } from './types';
import type { DawnState, GameState, NightState, StatsState } from './types';

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
    upgrades: { apprentice: 0, radiance: 0, seaLanes: 0, embers: 0 },
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
    stats: { ...state.stats, milestones: { ...state.stats.milestones } },
    events: [],
    derived: state.derived,
  };
}
