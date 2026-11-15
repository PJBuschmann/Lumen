/**
 * Everything a player could buy right now, with its cost and its benefit expressed in
 * orders of magnitude of Light production. Bots only differ in how they choose from this.
 */
import { DAWN_UPGRADE_ORDER } from '../../src/content/dawn';
import { NIGHT_UPGRADE_ORDER } from '../../src/content/night';
import {
  apprenticeSkills,
  baseGuideChance,
  dawnUpgradeCost,
  dawnUpgradeDef,
  dawnUpgradeMaxLevel,
  nightUpgradeCost,
  nightUpgradeMaxLevel,
  nightUpgradeMultiplier,
  seaLanesTraffic,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import type { Option } from './types';

/** Nominal value (in OoM) of upgrades whose benefit is convenience rather than a multiplier. */
const CONVENIENCE = { apprentice: 0.35, embers: 0.04 };

export function nightOptions(state: GameState): Option[] {
  const options: Option[] = [];
  const tended = apprenticeSkills(state);
  const light = state.night.light;
  for (const id of NIGHT_UPGRADE_ORDER) {
    if (tended.includes(id)) continue; // the apprentice has this one
    const level = state.night.upgrades[id];
    if (level >= nightUpgradeMaxLevel(id)) continue;
    const cost = nightUpgradeCost(id, level);
    const gain =
      id === 'rotation'
        ? Math.log10(baseGuideChance(level + 1) / baseGuideChance(level))
        : nightUpgradeMultiplier(id, level + 1).div(nightUpgradeMultiplier(id, level)).log10();
    options.push({
      action: { type: 'buyNightUpgrade', id, count: 1 },
      currency: 'light',
      cost,
      affordable: cost.lte(light),
      gain,
      label: `night.${id}`,
    });
  }
  return options;
}

export function dawnOptions(state: GameState): Option[] {
  if (state.dawn.dawns <= 0) return [];
  const options: Option[] = [];
  const glimmer = state.dawn.glimmer;
  for (const id of DAWN_UPGRADE_ORDER) {
    const level = state.dawn.upgrades[id];
    if (level >= dawnUpgradeMaxLevel(id)) continue;
    const def = dawnUpgradeDef(id);
    const cost = dawnUpgradeCost(id, level);
    let gain: number;
    switch (def.effect.kind) {
      case 'lightMult':
        gain = Math.log10(def.effect.perLevel);
        break;
      case 'traffic':
        gain = Math.log10(seaLanesTraffic(level + 1) / seaLanesTraffic(level));
        break;
      case 'apprentice':
        gain = CONVENIENCE.apprentice;
        break;
      case 'startLight':
        gain = CONVENIENCE.embers;
        break;
    }
    options.push({
      action: { type: 'buyDawnUpgrade', id, count: 1 },
      currency: 'glimmer',
      cost,
      affordable: cost.lte(glimmer),
      gain,
      label: `dawn.${id}`,
    });
  }
  return options;
}
