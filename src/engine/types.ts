/**
 * Core engine types. The engine is pure and UI-free: state in, state out.
 */
import type { Decimal } from './decimal';
import type { NightUpgradeId } from '../content/night';

/** Current save schema version. Bump when the persisted shape changes; add a migration. */
export const SCHEMA_VERSION = 1;

/** Milestones in canonical order (also the order they are saved in). */
export const MILESTONE_IDS = ['firstShip', 'firstUpgrade'] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

export interface RngState {
  /** Gameplay-affecting stream: weather. */
  weather: number;
  /** Ship's log vignettes. */
  log: number;
  /** Bottled messages. */
  bottle: number;
}

export interface NightState {
  /** Spendable Light. */
  light: Decimal;
  /** Light earned since this night began (never reduced by spending). */
  runLight: Decimal;
  upgrades: Record<NightUpgradeId, number>;
  /** Fractional ship arrivals carried between steps. */
  shipAcc: number;
  /** Fractional guided ships carried between steps. */
  guideAcc: number;
  /** Seconds since this night began. */
  runTime: number;
  /** runTime of the previous heartbeat. */
  lastBeat: number;
  /** runTime at which the next heartbeat fires. */
  nextBeat: number;
  shipsGuided: number;
  shipsMissed: number;
}

export interface StatsState {
  /** Light earned across the whole save. */
  totalLight: Decimal;
  /** Highest runLight ever reached in a single night. */
  bestRunLight: Decimal;
  shipsGuided: number;
  shipsMissed: number;
  /** Purchases made by the player (not by automation). */
  purchases: number;
  /** Seconds simulated in total (online and offline). */
  playTime: number;
  /** Seconds of that which were offline catch-up. */
  offlineTime: number;
  /** Game time (seconds) at which each milestone was first reached. */
  milestones: Partial<Record<MilestoneId, number>>;
}

/** Values derived from state. They only change at events (beats, purchases, weather...). */
export interface Derived {
  shipsPerSecond: number;
  guideChance: number;
  lightPerShip: Decimal;
  /** Expected Light per second: shipsPerSecond * guideChance * lightPerShip. */
  lightPerSecond: Decimal;
  /** Multiplier breakdown for the UI. */
  parts: {
    wick: Decimal;
    oil: Decimal;
    lens: Decimal;
  };
}

/** Transient, UI-facing notifications produced by the latest tick/action. Never saved. */
export type GameEvent =
  | { type: 'ship'; guided: boolean; index: number; value: Decimal }
  | { type: 'purchase'; layer: 'night'; id: string; count: number; auto: boolean }
  | { type: 'milestone'; id: MilestoneId };

export interface GameState {
  schema: number;
  seed: number;
  rng: RngState;
  /** Total simulated seconds. */
  time: number;
  night: NightState;
  stats: StatsState;
  /** Transient: events from the most recent tick/action. */
  events: GameEvent[];
  /** Transient: cached derived values; null when stale. */
  derived: Derived | null;
}

export type Action = { type: 'buyNightUpgrade'; id: NightUpgradeId; count?: number | 'max' };

export interface OfflineSummary {
  /** Seconds the player was away. */
  elapsedSeconds: number;
  /** Seconds actually simulated (after the cap). */
  appliedSeconds: number;
  capped: boolean;
  lightEarned: Decimal;
  shipsGuided: number;
  shipsMissed: number;
}
