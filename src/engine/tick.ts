/**
 * The simulation loop.
 *
 * Time advances in segments that end at the next scheduled event (heartbeat, timers).
 * Within a segment every rate is constant, so a segment can be integrated exactly in O(1)
 * no matter how long it is. Ships are counted with fractional accumulators, so the number
 * of ships (and the Light they earn) depends only on elapsed time, never on frame size.
 */
import { ENGINE } from '../content/engine';
import { runAutomation } from './automation';
import { getDerived } from './derive';
import { pushEvent, reachMilestone } from './events';
import { beatInterval } from './night';
import { cloneState } from './state';
import type { Derived, GameState, OfflineSummary } from './types';

const EPS = 1e-9;

/** Seconds until the next scheduled event. */
function timeToNextEvent(state: GameState): number {
  return Math.max(0, state.night.nextBeat - state.night.runTime);
}

/** Integrate one constant-rate segment. */
function integrate(state: GameState, d: Derived, step: number, emit: boolean): void {
  const night = state.night;
  state.time += step;
  night.runTime += step;
  state.stats.playTime += step;

  const acc = night.shipAcc + d.shipsPerSecond * step;
  const arrived = Math.floor(acc);
  night.shipAcc = acc - arrived;
  if (arrived <= 0) return;

  const guideAcc = night.guideAcc + arrived * d.guideChance;
  const guided = Math.min(arrived, Math.floor(guideAcc + EPS));
  night.guideAcc = Math.max(0, guideAcc - guided);
  const missed = arrived - guided;

  if (guided > 0) {
    const earned = d.lightPerShip.mul(guided);
    night.light = night.light.add(earned);
    night.runLight = night.runLight.add(earned);
    state.stats.totalLight = state.stats.totalLight.add(earned);
    if (night.runLight.gt(state.stats.bestRunLight)) state.stats.bestRunLight = night.runLight;
    reachMilestone(state, 'firstShip');
  }
  night.shipsGuided += guided;
  night.shipsMissed += missed;
  const firstIndex = state.stats.shipsGuided + state.stats.shipsMissed;
  state.stats.shipsGuided += guided;
  state.stats.shipsMissed += missed;

  if (emit) {
    // Only the last few ships of a step become visible events.
    const shown = Math.min(arrived, 3);
    for (let i = arrived - shown; i < arrived; i++) {
      pushEvent(state, {
        type: 'ship',
        guided: i < guided,
        index: firstIndex + i,
        value: d.lightPerShip,
      });
    }
  }
}

/** The automation heartbeat. Automation and passive flows act here and only here. */
function heartbeat(state: GameState): void {
  const night = state.night;
  night.runTime = night.nextBeat;
  night.lastBeat = night.nextBeat;
  night.nextBeat = night.lastBeat + beatInterval(night.lastBeat);
  runAutomation(state);
  state.derived = null;
}

function fireDueEvents(state: GameState): void {
  if (state.night.nextBeat - state.night.runTime <= EPS) heartbeat(state);
}

/**
 * Advance the simulation in place. Used directly by the simulator; the UI goes through tick().
 */
export function advanceInPlace(state: GameState, dt: number, emit: boolean = false): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  let remaining = dt;
  let guard = 0;
  while (remaining > EPS && guard++ < ENGINE.maxStepsPerAdvance) {
    const untilEvent = timeToNextEvent(state);
    if (untilEvent <= EPS) {
      fireDueEvents(state);
      continue;
    }
    const step = Math.min(remaining, untilEvent);
    integrate(state, getDerived(state), step, emit);
    remaining -= step;
    if (untilEvent - step <= EPS) fireDueEvents(state);
  }
}

/** Pure tick: returns a new state advanced by dt seconds. */
export function tick(state: GameState, dt: number): GameState {
  const next = cloneState(state);
  advanceInPlace(next, dt, true);
  return next;
}

/**
 * Offline catch-up. Runs the very same simulation as online play, capped at 24 hours,
 * and reports what happened while the keeper was away.
 */
export function applyOffline(
  state: GameState,
  elapsedSeconds: number,
): { state: GameState; summary: OfflineSummary } {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const applied = Math.min(elapsed, ENGINE.offline.maxSeconds);
  const next = cloneState(state);
  const lightBefore = next.stats.totalLight;
  const guidedBefore = next.stats.shipsGuided;
  const missedBefore = next.stats.shipsMissed;
  const glimmerBefore = next.dawn.glimmerTotal;
  const autoBefore = next.stats.autoPurchases;
  advanceInPlace(next, applied, false);
  next.stats.offlineTime += applied;
  return {
    state: next,
    summary: {
      elapsedSeconds: elapsed,
      appliedSeconds: applied,
      capped: elapsed > applied,
      lightEarned: next.stats.totalLight.sub(lightBefore),
      shipsGuided: next.stats.shipsGuided - guidedBefore,
      shipsMissed: next.stats.shipsMissed - missedBefore,
      // A higher reset can lower the running total; never report a negative gain.
      glimmerEarned: next.dawn.glimmerTotal.sub(glimmerBefore).max(0),
      autoPurchases: next.stats.autoPurchases - autoBefore,
    },
  };
}
