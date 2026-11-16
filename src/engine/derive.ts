/**
 * Derived values: everything computed from state that the tick loop holds constant
 * between events. Inputs must only change at events (heartbeats, purchases, timers),
 * never continuously, or offline and online progress would drift apart.
 *
 * Two caches live on the state:
 *  - `structure`: values that depend only on permanent structures. Rebuilt when one is bought.
 *  - `derived`: per-night rates. Rebuilt whenever anything they read changes.
 * Code that changes a structure calls invalidateStructure(); everything else sets
 * state.derived = null.
 */
import { COAST } from '../content/coast';
import { NIGHT } from '../content/night';
import { activeRules, auroraPower } from './aurora';
import { baseSurveyRate, coastPower } from './coast';
import { glimmerMultiplier, longNightPower, radianceMultiplier, seaLanesTraffic } from './dawn';
import { D, ONE, ZERO, pow10 } from './decimal';
import { baseGuideChance, nightUpgradeMultiplier } from './night';
import { baseDriftRate, starEffects } from './stars';
import { basePullRate, moonPhase, tideBasePower, tidePowerAt } from './tides';
import type { Derived, GameState, Structure } from './types';

export function computeStructure(state: GameState): Structure {
  const stars = starEffects(state.stars.levels);
  return {
    stars,
    coastPower: coastPower(state.coast.levels, stars.synergyMult),
    coastPowerAlone: coastPower(state.coast.levels, 0),
    tideBasePower: tideBasePower(state.tides.swell) * stars.swellMult,
    auroraPower: auroraPower(state),
    cheapest: { coast: null, tides: null, stars: null },
    options: { coast: null, tides: null, stars: null },
  };
}

/** Cached structure values for a state. */
export function getStructure(state: GameState): Structure {
  if (state.structure === null) state.structure = computeStructure(state);
  return state.structure;
}

/** Call after any change to lighthouses, Swell/Linger, stars or challenge completions. */
export function invalidateStructure(state: GameState): void {
  state.structure = null;
  state.derived = null;
}

export function computeDerived(state: GameState): Derived {
  const rules = activeRules(state);
  const structure = getStructure(state);
  const stars = structure.stars;

  const up = state.night.upgrades;
  const wick = nightUpgradeMultiplier('wick', up.wick);
  const oil = nightUpgradeMultiplier('oil', up.oil);
  const lens = nightUpgradeMultiplier('lens', up.lens);
  const glimmer = rules.noGlimmer ? ONE : glimmerMultiplier(state.dawn.glimmerTotal);
  const radiance = rules.noGlimmer ? ONE : radianceMultiplier(state.dawn.upgrades.radiance);

  // The wider layers: each contributes orders of magnitude of Light.
  // Structure powers drive the income of the layer above and ignore challenge rules,
  // so a challenge never slows the rest of the game down.
  const coast = (rules.noSynergy ? structure.coastPowerAlone : structure.coastPower) * (rules.coastPowerMult ?? 1);

  const tidesOn = state.tides.revealed;
  const phaseIndex = rules.lockPhase ?? state.tides.phase;
  const phase = moonPhase(phaseIndex);
  const tide = tidesOn
    ? tidePowerAt(state.tides.swell, phaseIndex, stars.resonance) * stars.swellMult * (rules.tidePowerMult ?? 1)
    : 0;
  const glow = tidesOn ? phase.glow : 1;

  const starPower = stars.lightPower * (rules.starPowerMult ?? 1);
  const aurora = structure.auroraPower;

  const traffic =
    seaLanesTraffic(state.dawn.upgrades.seaLanes) *
    (tidesOn ? phase.traffic : 1) *
    stars.trafficMult *
    (rules.trafficMult ?? 1);
  const shipsPerSecond = NIGHT.baseShipsPerSecond * traffic;
  const guideChance = Math.min(1, baseGuideChance(up.rotation) * (rules.guideMult ?? 1));

  let lightPerShip = D(NIGHT.baseLightPerShip)
    .mul(wick)
    .mul(oil)
    .mul(lens)
    .mul(glimmer)
    .mul(radiance)
    .mul(widerLayers(coast + tide + starPower + aurora))
    .mul(glow);
  if (rules.lightPower !== undefined && lightPerShip.gt(1)) lightPerShip = lightPerShip.pow(rules.lightPower);
  const lightPerSecond = lightPerShip.mul(shipsPerSecond * guideChance);

  const stonePerSecond = state.coast.revealed ? D(baseSurveyRate(state.coast.record) * stars.stoneMult) : ZERO;
  const tidePerSecond = tidesOn
    ? D(basePullRate(structure.coastPower, state.tides.phase) * stars.tideMult)
    : ZERO;
  const stardustPerSecond = state.stars.revealed
    ? D(baseDriftRate(structure.tideBasePower) * stars.dustMult)
    : ZERO;

  return {
    shipsPerSecond,
    guideChance,
    lightPerShip,
    lightPerSecond,
    glimmerGainMult: stars.glimmerLog > 0 ? pow10(stars.glimmerLog) : ONE,
    coastPower: coast,
    tidePower: tide,
    starPower,
    auroraPower: aurora,
    stonePerSecond,
    tidePerSecond,
    stardustPerSecond,
    passiveDawnShare: COAST.passiveDawnShare * stars.passiveDawnMult,
    longNightPower: longNightPower(state.dawn.upgrades.vigil) + stars.vigil,
    stars,
    rules,
    parts: { wick, oil, lens, glimmer, radiance, traffic, glow },
  };
}

/** 10^power for the wider layers' combined power (last answer remembered). */
function widerLayers(power: number) {
  if (power !== widerMemo.power) {
    widerMemo.power = power;
    widerMemo.value = pow10(power);
  }
  return widerMemo.value;
}

const widerMemo = { power: 0, value: ONE };

/** Cached derived values for a state. */
export function getDerived(state: GameState): Derived {
  if (state.derived === null) state.derived = computeDerived(state);
  return state.derived;
}
