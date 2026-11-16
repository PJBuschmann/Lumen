/**
 * Dawn layer (prestige 1): the night's Light becomes Glimmer, a permanent multiplier,
 * and an apprentice keeper learns to tend the lamp.
 */
import { DAWN, DAWN_UPGRADE_ORDER } from '../content/dawn';
import type { DawnUpgradeDef, DawnUpgradeId } from '../content/dawn';
import type { NightUpgradeId } from '../content/night';
import { D, Decimal, ONE, ZERO, geometricAfford, geometricCost, powLevel } from './decimal';
import { getDerived } from './derive';
import { resetNight } from './night';
import { pushEvent, reachMilestone } from './events';
import type { GameState } from './types';

export function dawnUpgradeDef(id: DawnUpgradeId): DawnUpgradeDef {
  return DAWN.upgrades[id];
}

export function dawnUpgradeMaxLevel(id: DawnUpgradeId): number {
  const max = dawnUpgradeDef(id).maxLevel;
  return max === null ? Infinity : max;
}

export function dawnUpgradeCost(id: DawnUpgradeId, level: number, count: number = 1): Decimal {
  const def = dawnUpgradeDef(id);
  return geometricCost(D(def.baseCost), def.costRatio, level, count);
}

export function dawnUpgradeAffordable(id: DawnUpgradeId, level: number, budget: Decimal): number {
  const def = dawnUpgradeDef(id);
  const room = dawnUpgradeMaxLevel(id) - level;
  if (room <= 0) return 0;
  const cap = Number.isFinite(room) ? room : Number.MAX_SAFE_INTEGER;
  return geometricAfford(budget, D(def.baseCost), def.costRatio, level, cap);
}

/** Permanent Light multiplier from Glimmer gathered so far. */
export function glimmerMultiplier(glimmerTotal: Decimal): Decimal {
  if (glimmerTotal.lte(0)) return ONE;
  return glimmerTotal.add(1).pow(DAWN.multExponent);
}

export function radianceMultiplier(level: number): Decimal {
  if (level === radianceMemo.level) return radianceMemo.value;
  const effect = dawnUpgradeDef('radiance').effect;
  radianceMemo.level = level;
  radianceMemo.value = effect.kind === 'lightMult' ? powLevel(effect.perLevel, level) : ONE;
  return radianceMemo.value;
}

const radianceMemo = { level: -1, value: ONE };

/** Ship traffic multiplier from Sea lanes. */
export function seaLanesTraffic(level: number): number {
  const effect = dawnUpgradeDef('seaLanes').effect;
  return effect.kind === 'traffic' ? 1 + effect.perLevel * level : 1;
}

/** Light a new night begins with. */
export function startingLight(state: GameState): Decimal {
  const level = state.dawn.upgrades.embers;
  const effect = dawnUpgradeDef('embers').effect;
  if (level <= 0 || effect.kind !== 'startLight') return ZERO;
  return D(effect.base).mul(powLevel(effect.growth, level - 1));
}

/** Night upgrades the apprentice keeper tends. The apprentice arrives with the first Dawn. */
export function apprenticeSkills(state: GameState): readonly NightUpgradeId[] {
  return state.dawn.dawns > 0 ? DAWN.apprenticeTends : NO_SKILLS;
}

const NO_SKILLS: readonly NightUpgradeId[] = [];

/** Exponent of the long-night bonus, including Long vigil levels. */
export function longNightPower(vigilLevel: number): number {
  const effect = dawnUpgradeDef('vigil').effect;
  return DAWN.longNight.power + (effect.kind === 'vigil' ? effect.perLevel * vigilLevel : 0);
}

/**
 * A long night makes a brighter dawn: the multiplier for a night of `runTime` seconds,
 * given the bonus exponent (see longNightPower; star keystones can add to it).
 */
export function longNightBonus(runTime: number, power: number): number {
  const { refHours, capHours } = DAWN.longNight;
  const hours = Math.min(Math.max(0, runTime), capHours * 3600) / 3600;
  return Math.pow(1 + hours / refHours, power);
}

/** Glimmer a Dawn would gather right now (zero below the threshold). */
export function dawnGain(state: GameState): Decimal {
  const runLight = state.night.runLight;
  if (runLight.lt(DAWN.threshold)) return ZERO;
  const d = getDerived(state);
  return runLight
    .div(DAWN.threshold)
    .pow(DAWN.glimmerExponent)
    .mul(DAWN.glimmerCoef * longNightBonus(state.night.runTime, d.longNightPower))
    .mul(d.glimmerGainMult);
}

/** Whether the player can greet the dawn by hand right now. */
export function canDawn(state: GameState): boolean {
  return dawnGain(state).gt(0);
}

/** Greet the dawn: gather Glimmer and begin a new night. Mutates the state. */
export function performDawn(state: GameState, auto: boolean): boolean {
  const gain = dawnGain(state);
  if (gain.lte(0)) return false;
  const dawn = state.dawn;
  dawn.glimmer = dawn.glimmer.add(gain);
  dawn.glimmerTotal = dawn.glimmerTotal.add(gain);
  dawn.dawns += 1;
  resetNight(state, startingLight(state));
  reachMilestone(state, 'firstDawn');
  pushEvent(state, { type: 'dawn', glimmer: gain, auto });
  return true;
}

/** Buy Dawn upgrade levels with Glimmer. Returns the number bought. Mutates the state. */
export function buyDawnUpgrade(state: GameState, id: DawnUpgradeId, count: number | 'max'): number {
  const dawn = state.dawn;
  if (dawn.dawns <= 0) return 0;
  const level = dawn.upgrades[id];
  if (level >= dawnUpgradeMaxLevel(id)) return 0;
  const affordable = dawnUpgradeAffordable(id, level, dawn.glimmer);
  const wanted = count === 'max' ? affordable : Math.min(affordable, Math.max(0, Math.floor(count)));
  if (wanted <= 0) return 0;
  const cost = dawnUpgradeCost(id, level, wanted);
  if (cost.gt(dawn.glimmer)) return 0;
  dawn.glimmer = dawn.glimmer.sub(cost);
  dawn.upgrades[id] = level + wanted;
  state.derived = null;
  return wanted;
}

/** Reset Dawn progress (used by higher layers). Permanent upgrades are kept. */
export function resetDawn(state: GameState): void {
  const dawn = state.dawn;
  dawn.glimmer = ZERO;
  dawn.glimmerTotal = ZERO;
  for (const id of DAWN_UPGRADE_ORDER) {
    if (!dawnUpgradeDef(id).permanent) dawn.upgrades[id] = 0;
  }
  state.derived = null;
  resetNight(state, startingLight(state));
}
