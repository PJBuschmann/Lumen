/**
 * Dawn layer balance data (prestige 1): reset the night's Light into Glimmer.
 *
 * Levers (see BALANCE.md):
 *  - `threshold` times the first Dawn.
 *  - `glimmerExponent` (gamma) and the Night snowball exponent K = 1/(1-A) are chosen so that
 *    K * gamma is about 1: Glimmer earned per minute is then roughly the same for short and
 *    long nights, which keeps idle and active play close together.
 *  - `longNight` rewards patient nights so that idle and active play stay close together.
 *  - `multExponent` (beta) plus the Radiance upgrade's efficiency set how strongly Glimmer
 *    feeds back into Light. Keep K * gamma * beta_total well below 1 or the loop runs away.
 */
import type { NightUpgradeId } from './night';

export type DawnUpgradeId = 'radiance' | 'seaLanes' | 'embers' | 'vigil';

export type DawnUpgradeEffect =
  /** Multiplies Light per ship by perLevel^level. */
  | { kind: 'lightMult'; perLevel: number }
  /** Adds perLevel (as a fraction) to ship traffic per level. */
  | { kind: 'traffic'; perLevel: number }
  /** Each night begins with base * growth^(level-1) Light. */
  | { kind: 'startLight'; base: number; growth: number }
  /** Adds perLevel to the exponent of the long-night bonus. */
  | { kind: 'vigil'; perLevel: number };

export interface DawnUpgradeDef {
  id: DawnUpgradeId;
  name: string;
  description: string;
  /** Cost of the first level, in Glimmer. */
  baseCost: number;
  costRatio: number;
  maxLevel: number | null;
  /** Kept when a higher layer resets Dawn. */
  permanent: boolean;
  effect: DawnUpgradeEffect;
}

export const DAWN_UPGRADE_ORDER: readonly DawnUpgradeId[] = ['seaLanes', 'embers', 'vigil', 'radiance'];

export const DAWN = {
  /** Light earned in one night before the first Glimmer can be gathered. */
  threshold: 1e7,
  /** Glimmer gathered by a Dawn at exactly the threshold. */
  glimmerCoef: 5,
  /** Glimmer = coef * (runLight / threshold) ^ glimmerExponent. */
  glimmerExponent: 0.25,
  /** Permanent Light multiplier = (1 + total Glimmer) ^ multExponent. */
  multExponent: 0.25,
  /**
   * A long night makes a brighter dawn: Glimmer is multiplied by
   * (1 + hours of night / refHours) ^ power, counting at most capHours.
   * This is what makes time away worth as much as rapid resets.
   */
  longNight: { refHours: 1, power: 1.5, capHours: 24 },
  /** Night upgrades the apprentice keeper tends from the first Dawn onward. */
  apprenticeTends: ['wick', 'oil', 'rotation', 'lens'] as readonly NightUpgradeId[],
  upgrades: {
    radiance: {
      id: 'radiance',
      name: 'Radiance',
      description: 'The memory of every sunrise lingers in the glass. x2 Light per level.',
      baseCost: 12,
      costRatio: 1000,
      maxLevel: null,
      permanent: false,
      effect: { kind: 'lightMult', perLevel: 2 },
    },
    seaLanes: {
      id: 'seaLanes',
      name: 'Sea lanes',
      description: 'Word travels: more captains choose your stretch of coast. +20% ships per level.',
      baseCost: 4,
      costRatio: 3,
      maxLevel: 5,
      permanent: false,
      effect: { kind: 'traffic', perLevel: 0.2 },
    },
    embers: {
      id: 'embers',
      name: 'Banked embers',
      description: 'Each new night begins with a little Light already glowing.',
      baseCost: 2,
      costRatio: 3,
      maxLevel: 6,
      permanent: false,
      effect: { kind: 'startLight', base: 100, growth: 8 },
    },
    vigil: {
      id: 'vigil',
      name: 'Long vigil',
      description: 'You learn to love the small hours. Long nights brighten the dawn even more.',
      baseCost: 8,
      costRatio: 6,
      maxLevel: 5,
      permanent: false,
      effect: { kind: 'vigil', perLevel: 0.1 },
    },
  } satisfies Record<DawnUpgradeId, DawnUpgradeDef> as Record<DawnUpgradeId, DawnUpgradeDef>,
} as const;
