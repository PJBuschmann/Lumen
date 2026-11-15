/**
 * Derived values: everything computed from state that the tick loop holds constant
 * between events. Inputs must only change at events (heartbeats, purchases, timers),
 * never continuously, or offline and online progress would drift apart.
 */
import { NIGHT } from '../content/night';
import { baseSurveyRate, coastPower } from './coast';
import { glimmerMultiplier, radianceMultiplier, seaLanesTraffic } from './dawn';
import { D, ONE, ZERO, pow10 } from './decimal';
import { baseGuideChance, nightUpgradeMultiplier } from './night';
import { basePullRate, moonPhase, tidePowerAt } from './tides';
import type { Derived, GameState } from './types';

export function computeDerived(state: GameState): Derived {
  const up = state.night.upgrades;
  const wick = nightUpgradeMultiplier('wick', up.wick);
  const oil = nightUpgradeMultiplier('oil', up.oil);
  const lens = nightUpgradeMultiplier('lens', up.lens);
  const glimmer = glimmerMultiplier(state.dawn.glimmerTotal);
  const radiance = radianceMultiplier(state.dawn.upgrades.radiance);

  // The wider layers: each contributes orders of magnitude of Light.
  const coast = coastPower(state.coast.levels);
  const tidesOn = state.tides.revealed;
  const phase = moonPhase(state.tides.phase);
  const tide = tidesOn ? tidePowerAt(state.tides.swell, state.tides.phase) : 0;
  const glow = tidesOn ? phase.glow : 1;
  const traffic = seaLanesTraffic(state.dawn.upgrades.seaLanes) * (tidesOn ? phase.traffic : 1);

  const shipsPerSecond = NIGHT.baseShipsPerSecond * traffic;
  const guideChance = baseGuideChance(up.rotation);
  const lightPerShip = D(NIGHT.baseLightPerShip)
    .mul(wick)
    .mul(oil)
    .mul(lens)
    .mul(glimmer)
    .mul(radiance)
    .mul(pow10(coast + tide))
    .mul(glow);
  const lightPerSecond = lightPerShip.mul(shipsPerSecond * guideChance);

  const stonePerSecond = state.coast.revealed ? D(baseSurveyRate(state.coast.record)) : ZERO;
  const tidePerSecond = tidesOn ? D(basePullRate(coast, state.tides.phase)) : ZERO;

  return {
    shipsPerSecond,
    guideChance,
    lightPerShip,
    lightPerSecond,
    glimmerGainMult: ONE,
    coastPower: coast,
    tidePower: tide,
    stonePerSecond,
    tidePerSecond,
    parts: { wick, oil, lens, glimmer, radiance, traffic, glow },
  };
}

/** Cached derived values for a state. */
export function getDerived(state: GameState): Derived {
  if (state.derived === null) state.derived = computeDerived(state);
  return state.derived;
}
