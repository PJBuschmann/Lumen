/**
 * Night layer: the lamp guides passing ships; each safe passage earns Light.
 */
import { AURORA } from '../content/aurora';
import { ENGINE } from '../content/engine';
import { NIGHT } from '../content/night';
import type { NightUpgradeDef, NightUpgradeId } from '../content/night';
import { D, Decimal, ONE, geometricAffordFrom, geometricCost, geometricSum, powLevel } from './decimal';
import { createNightState } from './state';
import type { GameState, NightState } from './types';

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

/**
 * The price of the next level is asked for constantly (every heartbeat, every UI frame),
 * so the last answer per upgrade is remembered. Pure: same inputs, same outputs.
 */
const COST_MEMO: Record<NightUpgradeId, { level: number; cost: Decimal }> = {
  wick: { level: -1, cost: ONE },
  oil: { level: -1, cost: ONE },
  lens: { level: -1, cost: ONE },
  rotation: { level: -1, cost: ONE },
};

const MULT_MEMO: Record<NightUpgradeId, { level: number; value: Decimal }> = {
  wick: { level: -1, value: ONE },
  oil: { level: -1, value: ONE },
  lens: { level: -1, value: ONE },
  rotation: { level: -1, value: ONE },
};

/** Light cost of buying `count` levels starting from `level`. */
export function nightUpgradeCost(id: NightUpgradeId, level: number, count: number = 1): Decimal {
  const def = nightUpgradeDef(id);
  if (count !== 1) return geometricSum(nightUpgradeCost(id, level), def.costRatio, count);
  const memo = COST_MEMO[id];
  if (memo.level !== level) {
    memo.cost = geometricCost(D(def.baseCost), def.costRatio, level, 1);
    memo.level = level;
  }
  return memo.cost;
}

/** How many levels `budget` Light can buy, respecting the level cap. */
export function nightUpgradeAffordable(id: NightUpgradeId, level: number, budget: Decimal): number {
  const room = nightUpgradeMaxLevel(id) - level;
  if (room <= 0) return 0;
  const cap = Number.isFinite(room) ? room : Number.MAX_SAFE_INTEGER;
  return geometricAffordFrom(budget, nightUpgradeCost(id, level), nightUpgradeDef(id).costRatio, cap);
}

/** Multiplier to Light per ship contributed by an upgrade at a level. */
export function nightUpgradeMultiplier(id: NightUpgradeId, level: number): Decimal {
  const memo = MULT_MEMO[id];
  if (memo.level === level) return memo.value;
  const effect = nightUpgradeDef(id).effect;
  let value: Decimal;
  switch (effect.kind) {
    case 'flame':
      value = powLevel(effect.milestoneMult, Math.floor(level / effect.milestoneEvery)).mul(1 + level);
      break;
    case 'mult':
      value = powLevel(effect.perLevel, level);
      break;
    case 'guide':
      value = ONE;
      break;
  }
  memo.value = value;
  memo.level = level;
  return value;
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

/** Whether the active Aurora challenge forbids this upgrade. */
export function nightUpgradeLocked(state: GameState, id: NightUpgradeId): boolean {
  const active = state.aurora.active;
  if (active === null) return false;
  const locked = AURORA.challenges[active].rules.disabledNightUpgrades;
  return locked !== undefined && locked.includes(id);
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
  if (nightUpgradeLocked(state, id)) return 0;
  const night = state.night;
  const level = night.upgrades[id];
  // Cheap rejection first: on most heartbeats nothing is affordable.
  if (night.light.lt(nightUpgradeCost(id, level))) return 0;
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

/** Fractions of a ship (arriving, guided) carried by the night right now. */
export function shipFractions(night: NightState): { shipAcc: number; guideAcc: number } {
  const span = night.runTime - night.segStart;
  if (night.segRate < 0 || span <= 0) return { shipAcc: night.shipAcc, guideAcc: night.guideAcc };
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return {
    shipAcc: clamp(night.shipAcc + night.segRate * span - night.segArrived),
    guideAcc: clamp(night.guideAcc + night.segArrived * night.segGuide - night.segGuided),
  };
}

/** Close the running ship segment at the current night age and begin a new one. */
export function anchorShips(night: NightState, rate: number, guide: number): void {
  const fractions = shipFractions(night);
  night.shipAcc = fractions.shipAcc;
  night.guideAcc = fractions.guideAcc;
  night.segStart = night.runTime;
  night.segArrived = 0;
  night.segGuided = 0;
  night.segRate = rate;
  night.segGuide = guide;
}

/**
 * Begin a new night. Light and Night upgrades reset; the fractions of a ship carry over,
 * so a ship that was about to arrive still does.
 */
export function resetNight(state: GameState, startLight: Decimal): void {
  const fractions = shipFractions(state.night);
  const fresh = createNightState();
  fresh.light = startLight;
  fresh.shipAcc = fractions.shipAcc;
  fresh.guideAcc = fractions.guideAcc;
  state.night = fresh;
  state.derived = null;
}
