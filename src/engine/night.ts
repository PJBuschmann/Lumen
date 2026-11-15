/**
 * Night layer: the lamp guides passing ships; each safe passage earns Light.
 */
import { NIGHT } from '../content/night';
import type { NightUpgradeDef, NightUpgradeId } from '../content/night';
import { ENGINE } from '../content/engine';
import { D, Decimal, ONE, geometricAfford, geometricCost, powLevel } from './decimal';
import type { GameState } from './types';

export function nightUpgradeDef(id: NightUpgradeId): NightUpgradeDef {
  return NIGHT.upgrades[id];
}

/** Highest level this upgrade can reach (Infinity when unlimited). */
export function nightUpgradeMaxLevel(id: NightUpgradeId): number {
  const def = nightUpgradeDef(id);
  if (def.effect.kind === 'guide') {
    const needed = Math.ceil((1 - NIGHT.baseGuideChance) / def.effect.perLevel - 1e-9);
    return def.maxLevel === null ? needed : Math.min(def.maxLevel, needed);
  }
  return def.maxLevel === null ? Infinity : def.maxLevel;
}

/** Light cost of buying `count` levels starting from `level`. */
export function nightUpgradeCost(id: NightUpgradeId, level: number, count: number = 1): Decimal {
  const def = nightUpgradeDef(id);
  return geometricCost(D(def.baseCost), def.costRatio, level, count);
}

/** How many levels `budget` Light can buy, respecting the level cap. */
export function nightUpgradeAffordable(id: NightUpgradeId, level: number, budget: Decimal): number {
  const def = nightUpgradeDef(id);
  const room = nightUpgradeMaxLevel(id) - level;
  if (room <= 0) return 0;
  const cap = Number.isFinite(room) ? room : Number.MAX_SAFE_INTEGER;
  return geometricAfford(budget, D(def.baseCost), def.costRatio, level, cap);
}

/** Multiplier to Light per ship contributed by an upgrade at a level. */
export function nightUpgradeMultiplier(id: NightUpgradeId, level: number): Decimal {
  const effect = nightUpgradeDef(id).effect;
  switch (effect.kind) {
    case 'flame':
      return powLevel(effect.milestoneMult, Math.floor(level / effect.milestoneEvery)).mul(1 + level);
    case 'mult':
      return powLevel(effect.perLevel, level);
    case 'guide':
      return ONE;
  }
}

/** Chance that a passing ship is caught by the beam, before weather and other modifiers. */
export function baseGuideChance(rotationLevel: number): number {
  const effect = nightUpgradeDef('rotation').effect;
  const perLevel = effect.kind === 'guide' ? effect.perLevel : 0;
  return Math.min(1, NIGHT.baseGuideChance + perLevel * rotationLevel);
}

/** Seconds between heartbeats for a night of the given age. */
export function beatInterval(runTime: number): number {
  const { baseInterval, stretchAfter, maxInterval } = ENGINE.heartbeat;
  if (runTime < stretchAfter * 2) return baseInterval;
  const doublings = Math.floor(Math.log2(runTime / stretchAfter));
  return Math.min(maxInterval, baseInterval * Math.pow(2, doublings));
}

/**
 * Buy up to `count` levels of a Night upgrade with the Light on hand.
 * Returns the number of levels actually bought. Mutates the state.
 */
export function buyNightUpgrade(
  state: GameState,
  id: NightUpgradeId,
  count: number | 'max',
): number {
  const night = state.night;
  const level = night.upgrades[id];
  const affordable = nightUpgradeAffordable(id, level, night.light);
  const wanted = count === 'max' ? affordable : Math.min(affordable, Math.max(0, Math.floor(count)));
  if (wanted <= 0) return 0;
  const cost = nightUpgradeCost(id, level, wanted);
  if (cost.gt(night.light)) return 0;
  night.light = night.light.sub(cost);
  night.upgrades[id] = level + wanted;
  state.derived = null;
  return wanted;
}
