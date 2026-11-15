/**
 * Derived values: everything computed from state that the tick loop holds constant
 * between events. Inputs must only change at events (heartbeats, purchases, timers),
 * never continuously, or offline and online progress would drift apart.
 */
import { NIGHT } from '../content/night';
import { D } from './decimal';
import { baseGuideChance, nightUpgradeMultiplier } from './night';
import type { Derived, GameState } from './types';

export function computeDerived(state: GameState): Derived {
  const up = state.night.upgrades;
  const wick = nightUpgradeMultiplier('wick', up.wick);
  const oil = nightUpgradeMultiplier('oil', up.oil);
  const lens = nightUpgradeMultiplier('lens', up.lens);

  const shipsPerSecond = NIGHT.baseShipsPerSecond;
  const guideChance = baseGuideChance(up.rotation);
  const lightPerShip = D(NIGHT.baseLightPerShip).mul(wick).mul(oil).mul(lens);
  const lightPerSecond = lightPerShip.mul(shipsPerSecond * guideChance);

  return {
    shipsPerSecond,
    guideChance,
    lightPerShip,
    lightPerSecond,
    parts: { wick, oil, lens },
  };
}

/** Cached derived values for a state. */
export function getDerived(state: GameState): Derived {
  if (state.derived === null) state.derived = computeDerived(state);
  return state.derived;
}
