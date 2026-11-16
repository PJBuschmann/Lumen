/**
 * Core engine types. The engine is pure and UI-free: state in, state out.
 */
import type { Decimal } from './decimal';
import type { NightUpgradeId } from '../content/night';
import type { ChallengeId, ChallengeRules } from '../content/aurora';
import type { DawnUpgradeId } from '../content/dawn';

/** Current save schema version. Bump when the persisted shape changes; add a migration. */
export const SCHEMA_VERSION = 4;

/** Milestones in canonical order (also the order they are saved in). */
export const MILESTONE_IDS = [
  'firstShip',
  'firstUpgrade',
  'firstDawn',
  'firstCoast',
  'firstTides',
  'firstStar',
  'auroraUnlocked',
  'firstChallenge',
] as const;
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
  /**
   * Ships are counted from elapsed time, not frame by frame: within a "segment" (a stretch
   * of constant traffic and guide chance) the ships arrived so far are
   * floor(shipAcc + segRate * (runTime - segStart)). That makes the count independent of
   * how time is sliced. shipAcc / guideAcc are the fractions carried into the segment.
   */
  shipAcc: number;
  guideAcc: number;
  /** runTime at which the current segment began. */
  segStart: number;
  /** Ships arrived / guided so far in the current segment. */
  segArrived: number;
  segGuided: number;
  /** Traffic and guide chance in force for the current segment (-1 = not started). */
  segRate: number;
  segGuide: number;
  /** Seconds since this night began. */
  runTime: number;
  /** runTime of the previous heartbeat. */
  lastBeat: number;
  /** runTime at which the next heartbeat fires. */
  nextBeat: number;
  shipsGuided: number;
  shipsMissed: number;
}

export interface DawnState {
  /** Spendable Glimmer. */
  glimmer: Decimal;
  /** Glimmer gathered since the last higher reset; drives the permanent Light multiplier. */
  glimmerTotal: Decimal;
  /** Dawns greeted across the whole save. */
  dawns: number;
  upgrades: Record<DawnUpgradeId, number>;
}

export interface CoastState {
  /** The coastline has come into view (Stone starts being surveyed). */
  revealed: boolean;
  /** Spendable Stone. */
  stone: Decimal;
  stoneTotal: Decimal;
  /** Stone surveyed but not yet brought home by a Survey. */
  pending: Decimal;
  /** Surveys made. After the first, Dawn is tended automatically. */
  surveys: number;
  /** Lighthouse level per buildable tile (0 = empty), in coastTiles() order. */
  levels: number[];
  /** Highest log10(1 + Glimmer gathered in a run) ever held. Drives Stone income. */
  record: number;
}

export interface TidesState {
  /** The tides can be read (the moon starts to matter, Tide starts being drawn). */
  revealed: boolean;
  /** Spendable Tide. */
  tide: Decimal;
  tideTotal: Decimal;
  /** Tide drawn but not yet claimed by turning the tide. */
  pending: Decimal;
  /** Times the tide was turned. After the first, the coastline builds itself. */
  turns: number;
  /** Index of the moon phase in the sky. */
  phase: number;
  /** Game time at which the current phase ends. */
  phaseEndsAt: number;
  /** Swell level per phase. */
  swell: number[];
  /** Linger level per phase. */
  linger: number[];
}

export interface StarsState {
  /** The star map is open (Stardust starts drifting in). */
  revealed: boolean;
  /** Spendable Stardust. */
  stardust: Decimal;
  stardustTotal: Decimal;
  /** Stardust gathered but not yet claimed by an Ascension. */
  pending: Decimal;
  /** Ascensions made. After the first, the tides reshape themselves. */
  ascensions: number;
  /** Level per star (0 = unlit), in STARS.stars order. */
  levels: number[];
}

export interface AuroraState {
  unlocked: boolean;
  /** The challenge being attempted, if any. */
  active: ChallengeId | null;
  /** Tiers completed per challenge. After the first completion, the stars chart themselves. */
  completions: Record<ChallengeId, number>;
}

/** Everything the star map changes elsewhere in the game, summed over lit stars. */
export interface StarEffects {
  /** Orders of magnitude of Light from beacons, Polaris and completed constellations. */
  lightPower: number;
  stoneMult: number;
  tideMult: number;
  dustMult: number;
  /** Orders of magnitude of Glimmer gain. */
  glimmerLog: number;
  trafficMult: number;
  synergyMult: number;
  /** Added to the Swell resonance. */
  resonance: number;
  passiveDawnMult: number;
  /** Added to the long-night exponent. */
  vigil: number;
  swellMult: number;
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
  /** Upgrade levels bought by automation. */
  autoPurchases: number;
  /** Seconds simulated in total (online and offline). */
  playTime: number;
  /** Seconds of that which were offline catch-up. */
  offlineTime: number;
  /** Game time (seconds) at which each milestone was first reached. */
  milestones: Partial<Record<MilestoneId, number>>;
}

/**
 * Values derived from the permanent structures (lighthouses, tides, stars, challenges).
 * They change only when a structure is bought, so they are cached separately from the
 * per-night values and survive heartbeats.
 */
export interface Structure {
  stars: StarEffects;
  /** Coastline power with star synergy applied (drives Tide income). */
  coastPower: number;
  /** Coastline power without any neighbour synergy (used by a challenge rule). */
  coastPowerAlone: number;
  /** Tide power that applies in every phase, with star multipliers (drives Stardust income). */
  tideBasePower: number;
  auroraPower: number;
  /** Cheapest purchase on each wider layer; lets automation skip work it cannot afford. */
  cheapest: { coast: Decimal | null; tides: Decimal | null; stars: Decimal | null };
  /** Purchase lists per wider layer, built on demand; they only depend on structures. */
  options: { coast: StructureOption[] | null; tides: StructureOption[] | null; stars: StructureOption[] | null };
}

/** Values derived from state. They only change at events (beats, purchases, weather...). */
export interface Derived {
  shipsPerSecond: number;
  guideChance: number;
  lightPerShip: Decimal;
  /** Expected Light per second: shipsPerSecond * guideChance * lightPerShip. */
  lightPerSecond: Decimal;
  /** Multiplier applied to Glimmer gathered at Dawn. */
  glimmerGainMult: Decimal;
  /** Orders of magnitude of Light from the coastline's lighthouses. */
  coastPower: number;
  /** Orders of magnitude of Light from the tides right now (includes the phase in the sky). */
  tidePower: number;
  /** Orders of magnitude of Light from the star map. */
  starPower: number;
  /** Orders of magnitude of Light from completed Aurora challenges. */
  auroraPower: number;
  /** Stone surveyed per second. */
  stonePerSecond: Decimal;
  /** Tide drawn per second right now. */
  tidePerSecond: Decimal;
  /** Stardust drifting in per second. */
  stardustPerSecond: Decimal;
  /** Share of a Dawn's Glimmer that flows in per second once Dawn is automated. */
  passiveDawnShare: number;
  /** Exponent of the long-night bonus. */
  longNightPower: number;
  /** Star map effects in force. */
  stars: StarEffects;
  /** Rules of the active Aurora challenge (empty when none). */
  rules: ChallengeRules;
  /** Multiplier breakdown for the UI. */
  parts: {
    wick: Decimal;
    oil: Decimal;
    lens: Decimal;
    /** (1 + total Glimmer) ^ beta. */
    glimmer: Decimal;
    radiance: Decimal;
    /** Ship traffic multiplier from all sources. */
    traffic: number;
    /** Light-per-ship multiplier of the moon phase in the sky. */
    glow: number;
  };
}

export type LayerId = 'night' | 'dawn' | 'coast' | 'tides' | 'stars' | 'aurora';

/** Transient, UI-facing notifications produced by the latest tick/action. Never saved. */
export type GameEvent =
  | { type: 'ship'; guided: boolean; index: number; value: Decimal }
  | { type: 'purchase'; layer: LayerId; id: string; count: number; auto: boolean }
  | { type: 'dawn'; glimmer: Decimal; auto: boolean }
  | { type: 'reveal'; layer: LayerId }
  | { type: 'survey'; stone: Decimal }
  | { type: 'turn'; tide: Decimal }
  | { type: 'phase'; phase: number }
  | { type: 'ascend'; stardust: Decimal }
  | { type: 'constellation'; id: string }
  | { type: 'challengeStart'; id: ChallengeId }
  | { type: 'challengeComplete'; id: ChallengeId; tier: number }
  | { type: 'challengeLeave'; id: ChallengeId }
  | { type: 'milestone'; id: MilestoneId };

export interface GameState {
  schema: number;
  seed: number;
  rng: RngState;
  /** Total simulated seconds. */
  time: number;
  night: NightState;
  dawn: DawnState;
  coast: CoastState;
  tides: TidesState;
  stars: StarsState;
  aurora: AuroraState;
  stats: StatsState;
  /** Transient: events from the most recent tick/action. */
  events: GameEvent[];
  /** Transient: when true, cosmetic events are not recorded (offline catch-up, simulator). */
  quiet: boolean;
  /** Transient: cached derived values; null when stale. */
  derived: Derived | null;
  /** Transient: cached structure values; null when stale. */
  structure: Structure | null;
}

export type Action =
  | { type: 'buyNightUpgrade'; id: NightUpgradeId; count?: number | 'max' }
  /** Greet the dawn: reset the night, gather Glimmer. */
  | { type: 'dawn' }
  | { type: 'buyDawnUpgrade'; id: DawnUpgradeId; count?: number | 'max' }
  /** Survey the coast: bring surveyed Stone home; Night and Dawn begin again. */
  | { type: 'survey' }
  | { type: 'buildLighthouse'; tile: number }
  | { type: 'raiseLighthouse'; tile: number; count?: number }
  /** Turn the tide: claim drawn Tide; Night and Dawn begin again. */
  | { type: 'turnTide' }
  | { type: 'swellPhase'; phase: number; count?: number }
  | { type: 'lingerPhase'; phase: number }
  /** Ascend: claim gathered Stardust; Night and Dawn begin again. */
  | { type: 'ascend' }
  /** Light an unlit star (it must touch a lit one) or brighten a lit one. */
  | { type: 'lightStar'; star: number; count?: number }
  | { type: 'enterChallenge'; id: ChallengeId }
  | { type: 'leaveChallenge' };

/** A purchasable structure step, with its benefit in orders of magnitude of Light. */
export interface StructureOption {
  action: Action;
  cost: Decimal;
  /** Benefit in OoM of Light (or an equivalent estimate for income upgrades). */
  gain: number;
  label: string;
}

export interface OfflineSummary {
  /** Seconds the player was away. */
  elapsedSeconds: number;
  /** Seconds actually simulated (after the cap). */
  appliedSeconds: number;
  capped: boolean;
  lightEarned: Decimal;
  shipsGuided: number;
  shipsMissed: number;
  glimmerEarned: Decimal;
  stoneEarned: Decimal;
  tideEarned: Decimal;
  stardustEarned: Decimal;
  /** Upgrade levels bought by automation while away. */
  autoPurchases: number;
}
