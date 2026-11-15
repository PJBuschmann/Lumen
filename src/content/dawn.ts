/**
 * Dawn layer balance data (prestige 1): reset the night's Light into Glimmer.
 *
 * Levers (see BALANCE.md):
 *  - `threshold` times the first Dawn.
 *  - `glimmerExponent` (gamma) and the Night snowball exponent K = 1/(1-A) are chosen so that
 *    K * gamma is about 1: Glimmer earned per minute is then roughly the same for short and
 *    long nights, which keeps idle and active play close together.
 *  - `multExponent` (beta) plus the Radiance upgrade's efficiency set how strongly Glimmer
 *    feeds back into Light. Keep K * gamma * beta_total well below 1 or the loop runs away.
 */
import type { NightUpgradeId } from './night';

export type DawnUpgradeId = 'apprentice' | 'radiance' | 'seaLanes' | 'embers';

export type DawnUpgradeEffect =
  /** Each level teaches the apprentice keeper to buy one more Night upgrade. */
  | { kind: 'apprentice'; teaches: readonly NightUpgradeId[] }
  /** Multiplies Light per ship by perLevel^level. */
  | { kind: 'lightMult'; perLevel: number }
  /** Adds perLevel (as a fraction) to ship traffic per level. */
  | { kind: 'traffic'; perLevel: number }
  /** Each night begins with base * growth^(level-1) Light. */
  | { kind: 'startLight'; base: number; growth: number };

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

export const DAWN_UPGRADE_ORDER: readonly DawnUpgradeId[] = ['apprentice', 'radiance', 'seaLanes', 'embers'];

export const DAWN = {
  /** Light earned in one night before the first Glimmer can be gathered. */
  threshold: 1e7,
  /** Glimmer gathered by a Dawn at exactly the threshold. */
  glimmerCoef: 5,
  /** Glimmer = coef * (runLight / threshold) ^ glimmerExponent. */
  glimmerExponent: 0.25,
  /** Permanent Light multiplier = (1 + total Glimmer) ^ multExponent. */
  multExponent: 0.25,
  /** The first Dawn brings an apprentice who already knows how to trim the wick. */
  freeApprenticeLevels: 1,
  upgrades: {
    apprentice: {
      id: 'apprentice',
      name: 'Apprentice keeper',
      description: 'Your apprentice learns to tend one more part of the lamp on their own.',
      baseCost: 3,
      costRatio: 4,
      maxLevel: 4,
      permanent: true,
      effect: { kind: 'apprentice', teaches: ['wick', 'oil', 'rotation', 'lens'] },
    },
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
  } satisfies Record<DawnUpgradeId, DawnUpgradeDef> as Record<DawnUpgradeId, DawnUpgradeDef>,
} as const;
