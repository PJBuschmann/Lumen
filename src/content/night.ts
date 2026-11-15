/**
 * Night layer balance data. The lamp guides passing ships; each safe passage earns Light.
 *
 * Levers (see BALANCE.md):
 *  - Each repeatable upgrade has an "efficiency exponent" alpha = ln(effect) / ln(costRatio).
 *    The sum of alphas (A) sets how fast a night snowballs: Light grows like t^(1/(1-A)).
 *  - `dawnThreshold` (content/dawn.ts) is the gate that times the first Dawn.
 */

export type NightUpgradeId = 'wick' | 'oil' | 'lens' | 'rotation';

export type NightUpgradeEffect =
  /** Additive flame per level, doubled at every milestone: (1 + level) * milestoneMult^floor(level / every). */
  | { kind: 'flame'; milestoneEvery: number; milestoneMult: number }
  /** Pure multiplier: perLevel^level. */
  | { kind: 'mult'; perLevel: number }
  /** Guide chance: +perLevel per level, on top of the base chance. */
  | { kind: 'guide'; perLevel: number };

export interface NightUpgradeDef {
  id: NightUpgradeId;
  name: string;
  description: string;
  /** Cost of the first level, in Light. */
  baseCost: number;
  /** Each level costs this many times the previous one. */
  costRatio: number;
  /** null = unlimited. */
  maxLevel: number | null;
  effect: NightUpgradeEffect;
}

export const NIGHT_UPGRADE_ORDER: readonly NightUpgradeId[] = ['wick', 'oil', 'lens', 'rotation'];

export const NIGHT = {
  /** Light in the keeper's pocket on a brand new night. */
  startingLight: 5,
  /** Ships passing the headland per second before any traffic bonus. */
  baseShipsPerSecond: 0.5,
  /** Light earned by one safely guided ship before multipliers. */
  baseLightPerShip: 1,
  /** Chance a passing ship is caught by the beam before rotation upgrades. */
  baseGuideChance: 0.5,
  upgrades: {
    wick: {
      id: 'wick',
      name: 'Wick',
      description: 'A longer, cleaner wick. Each trim adds flame; every 25th doubles it.',
      baseCost: 5,
      costRatio: 1.15,
      maxLevel: null,
      effect: { kind: 'flame', milestoneEvery: 25, milestoneMult: 2 },
    },
    oil: {
      id: 'oil',
      name: 'Oil',
      description: 'Finer lamp oil burns brighter. x1.5 Light per level.',
      baseCost: 60,
      costRatio: 4.5,
      maxLevel: null,
      effect: { kind: 'mult', perLevel: 1.5 },
    },
    lens: {
      id: 'lens',
      name: 'Lens',
      description: 'Polished prisms throw the beam further. x2 Light per level.',
      baseCost: 400,
      costRatio: 11.5,
      maxLevel: null,
      effect: { kind: 'mult', perLevel: 2 },
    },
    rotation: {
      id: 'rotation',
      name: 'Rotation',
      description: 'A smoother clockwork sweep. +5% chance to guide each passing ship.',
      baseCost: 30,
      costRatio: 2.2,
      maxLevel: 10,
      effect: { kind: 'guide', perLevel: 0.05 },
    },
  } satisfies Record<NightUpgradeId, NightUpgradeDef> as Record<NightUpgradeId, NightUpgradeDef>,
} as const;
