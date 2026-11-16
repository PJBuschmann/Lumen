/**
 * Runs one bot through one game, headlessly, on the real engine.
 * Wall-clock time and "active" (at the keyboard) time are tracked separately so that
 * offline-heavy players can be compared fairly with always-present ones.
 */
import { ENGINE } from '../src/content/engine';
import { PACING } from '../src/content/pacing';
import {
  MILESTONE_IDS,
  advanceInPlace,
  applyActionInPlace,
  createInitialState,
  getDerived,
  isFiniteDecimal,
  log10p1,
  rngNext,
  totalCompletions,
} from '../src/engine';
import type { GameState, MilestoneId } from '../src/engine';
import { createBot } from './bots/brain';
import { POLICIES } from './bots/policies';
import type { PolicyName } from './bots/policies';

export interface RunConfig {
  policy: PolicyName;
  seed: number;
  /** Wall-clock seconds to simulate at most. */
  horizonSeconds: number;
  /** Stop early once this milestone has been reached. */
  stopAfter?: MilestoneId;
  /** Extra seconds to keep playing after `stopAfter`. */
  tailSeconds?: number;
  /** Purchase gaps are only recorded until this milestone (the endgame beyond it is unpaced). */
  gapsUntil?: MilestoneId;
}

export interface Sample {
  /** Wall-clock seconds. */
  t: number;
  /** log10 of lifetime Light. */
  light: number;
  /** log10 of Light per second. */
  rate: number;
  /** log10(1 + x) of each prestige currency's running total. */
  glimmer: number;
  stone: number;
  tide: number;
  stardust: number;
  /** Orders of magnitude of Light contributed by each wider layer. */
  coastPower: number;
  tidePower: number;
  starPower: number;
  auroraPower: number;
}

/** Upper edges (seconds) of the purchase-gap histogram buckets. */
export const GAP_BUCKETS = [5, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 2700, 3600, 7200, Infinity];

export interface RunResult {
  policy: PolicyName;
  seed: number;
  /** Wall-clock seconds at which each milestone was first reached. */
  milestones: Partial<Record<MilestoneId, number>>;
  /** Active (in-session) seconds at which each milestone was first reached. */
  activeMilestones: Partial<Record<MilestoneId, number>>;
  purchases: number;
  /** Purchases made by the time each milestone was reached. */
  purchasesAt: Partial<Record<MilestoneId, number>>;
  /** Count of gaps between consecutive purchases, by GAP_BUCKETS, in active seconds. */
  gapHistogram: number[];
  /** Longest active stretch without a purchase, and when (wall-clock) it ended. */
  maxGap: number;
  maxGapAt: number;
  /** Longest gap after the first Dawn (the opening minutes are judged separately). */
  samples: Sample[];
  sessions: number;
  wallSeconds: number;
  activeSeconds: number;
  /** log10 of lifetime Light at the end. */
  finalLightLog: number;
  /** Aurora challenge tiers completed by the end. */
  challengeTiers: number;
  /** True if any currency ever became NaN/Infinity. */
  numericFailure: boolean;
  computeMs: number;
}

interface Window {
  inSession: boolean;
  /** Wall-clock second at which this window (session or absence) ends. */
  endsAt: number;
}

/** Is the offline-heavy player at the keyboard at `wall`, and until when? */
export function offlineWindow(wall: number, jitter: (day: number, slot: number) => number): Window {
  const { sessionStartHours, sessionMinutes, firstSessionMinutes } = PACING.offlineSchedule;
  const day = Math.floor(wall / 86400);
  // Look at yesterday's last session through tomorrow's first.
  let nextStart = Infinity;
  for (let d = day - 1; d <= day + 1; d++) {
    for (let slot = 0; slot < sessionStartHours.length; slot++) {
      if (d < 0) continue;
      // The very first session starts at t = 0 exactly.
      const first = d === 0 && slot === 0;
      const start = first ? 0 : d * 86400 + sessionStartHours[slot] * 3600 + jitter(d, slot);
      const length = (first ? firstSessionMinutes : sessionMinutes) * 60;
      if (wall >= start && wall < start + length) return { inSession: true, endsAt: start + length };
      if (start > wall && start < nextStart) nextStart = start;
    }
  }
  return { inSession: false, endsAt: nextStart };
}

function checkNumbers(state: GameState): boolean {
  return (
    isFiniteDecimal(state.night.light) &&
    isFiniteDecimal(state.night.runLight) &&
    isFiniteDecimal(state.stats.totalLight) &&
    isFiniteDecimal(state.dawn.glimmer) &&
    isFiniteDecimal(state.dawn.glimmerTotal) &&
    isFiniteDecimal(state.coast.stone) &&
    isFiniteDecimal(state.coast.stoneTotal) &&
    isFiniteDecimal(state.coast.pending) &&
    isFiniteDecimal(state.tides.tide) &&
    isFiniteDecimal(state.tides.tideTotal) &&
    isFiniteDecimal(state.tides.pending) &&
    isFiniteDecimal(state.stars.stardust) &&
    isFiniteDecimal(state.stars.stardustTotal) &&
    isFiniteDecimal(state.stars.pending) &&
    Number.isFinite(state.coast.record) &&
    Number.isFinite(state.time)
  );
}

export function runBot(config: RunConfig): RunResult {
  return runBotWithState(config).result;
}

/** Like runBot, but also hands back the final game state (for tools that keep playing it). */
export function runBotWithState(config: RunConfig): { result: RunResult; state: GameState } {
  const started = performance.now();
  const policy = POLICIES[config.policy];
  const bot = createBot(policy);
  const state = createInitialState(config.seed);

  // The runner has its own randomness (human variation); it never touches the game's streams.
  let humanSeed = (config.seed * 2654435761) >>> 0;
  const rand = () => {
    const draw = rngNext(humanSeed);
    humanSeed = draw.next;
    return draw.value;
  };
  /** Seconds a person takes between taps. */
  const reaction = 0.5 + rand() * 0.5;
  /** How punctual the offline-heavy player is, per session (seconds, stable per day/slot). */
  const lateness = new Map<number, number>();
  const jitter = (day: number, slot: number) => {
    const key = day * 8 + slot;
    let value = lateness.get(key);
    if (value === undefined) {
      value = (rand() - 0.5) * 20 * 60;
      lateness.set(key, value);
    }
    return value;
  };

  const result: RunResult = {
    policy: config.policy,
    seed: config.seed,
    milestones: {},
    activeMilestones: {},
    purchases: 0,
    purchasesAt: {},
    gapHistogram: GAP_BUCKETS.map(() => 0),
    maxGap: 0,
    maxGapAt: 0,
    samples: [],
    sessions: policy.sessions === 'always' ? 1 : 0,
    wallSeconds: 0,
    activeSeconds: 0,
    finalLightLog: 0,
    challengeTiers: 0,
    numericFailure: false,
    computeMs: 0,
  };

  let wall = 0;
  let active = 0;
  let lastPurchaseActive = 0;
  let nextSample = 30;
  let stopAt = config.horizonSeconds;
  let wasInSession = false;

  const recordGap = (gap: number) => {
    if (config.gapsUntil !== undefined && result.milestones[config.gapsUntil] !== undefined) return;
    for (let i = 0; i < GAP_BUCKETS.length; i++) {
      if (gap <= GAP_BUCKETS[i]) {
        result.gapHistogram[i] += 1;
        break;
      }
    }
    if (gap > result.maxGap) {
      result.maxGap = gap;
      result.maxGapAt = wall;
    }
  };

  const observe = () => {
    for (const id of MILESTONE_IDS) {
      if (result.milestones[id] === undefined && state.stats.milestones[id] !== undefined) {
        result.milestones[id] = wall;
        result.activeMilestones[id] = active;
        result.purchasesAt[id] = result.purchases;
        if (id === config.stopAfter) stopAt = Math.min(stopAt, wall + (config.tailSeconds ?? 0));
      }
    }
    if (wall >= nextSample) {
      result.samples.push({
        t: wall,
        light: log10p1(state.stats.totalLight),
        rate: log10p1(getDerived(state).lightPerSecond),
        glimmer: log10p1(state.dawn.glimmerTotal),
        stone: log10p1(state.coast.stoneTotal),
        tide: log10p1(state.tides.tideTotal),
        stardust: log10p1(state.stars.stardustTotal),
        coastPower: getDerived(state).coastPower,
        tidePower: getDerived(state).tidePower,
        starPower: getDerived(state).starPower,
        auroraPower: getDerived(state).auroraPower,
      });
      nextSample = Math.max(nextSample + 30, nextSample * 1.03);
      if (!checkNumbers(state)) result.numericFailure = true;
    }
  };

  let guard = 0;
  while (wall < stopAt && guard++ < 200_000_000) {
    const window: Window =
      policy.sessions === 'always'
        ? { inSession: true, endsAt: Infinity }
        : offlineWindow(wall, jitter);

    if (!window.inSession) {
      // Away: the engine's own offline simulation, capped like the real game.
      const away = Math.min(window.endsAt, stopAt) - wall;
      advanceInPlace(state, Math.min(away, ENGINE.offline.maxSeconds));
      wall += away;
      wasInSession = false;
      observe();
      continue;
    }
    if (!wasInSession) {
      wasInSession = true;
      if (policy.sessions !== 'always') result.sessions += 1;
    }

    const action = bot.decide(state);
    let dt: number;
    if (action !== null && applyActionInPlace(state, action)) {
      state.events.length = 0;
      result.purchases += 1;
      recordGap(active - lastPurchaseActive);
      lastPurchaseActive = active;
      dt = reaction;
    } else {
      dt = Math.max(0.05, bot.patience(state));
    }
    dt = Math.min(dt, window.endsAt - wall, stopAt - wall);
    if (dt > 0) {
      advanceInPlace(state, dt);
      wall += dt;
      active += dt;
    }
    observe();
  }

  recordGap(active - lastPurchaseActive);
  result.wallSeconds = wall;
  result.activeSeconds = active;
  result.finalLightLog = log10p1(state.stats.totalLight);
  result.challengeTiers = totalCompletions(state);
  if (!checkNumbers(state)) result.numericFailure = true;
  result.computeMs = performance.now() - started;
  return { result, state };
}
