/**
 * The wider layers as the bots see them: a purse, income waiting to be banked by a
 * prestige, and a list of structure purchases. One description per layer keeps the
 * bot brain free of layer-specific code.
 */
import {
  canAscend,
  canSurvey,
  canTurnTide,
  coastAutomated,
  coastOptions,
  getDerived,
  log10p1,
  starOptions,
  starsAutomated,
  tideOptions,
  tidesAutomated,
} from '../../src/engine';
import type { Action, Decimal, GameState, StructureOption } from '../../src/engine';

export interface UpperLayer {
  id: 'coast' | 'tides' | 'stars';
  /** The player still has to work this layer by hand. */
  manual(state: GameState): boolean;
  purse(state: GameState): Decimal;
  pending(state: GameState): Decimal;
  /** Income per second into `pending`. */
  income(state: GameState): Decimal;
  options(state: GameState): StructureOption[];
  bank: Action;
  canBank(state: GameState): boolean;
  /**
   * How far the current run is from where a bank would stop costing anything, in [0, 1].
   * 1 means "this run has already caught up with the record that drives this layer's income".
   */
  recovered(state: GameState): number;
}

export const UPPER_LAYERS: readonly UpperLayer[] = [
  {
    id: 'stars',
    manual: (s) => s.stars.revealed && !starsAutomated(s),
    purse: (s) => s.stars.stardust,
    pending: (s) => s.stars.pending,
    income: (s) => getDerived(s).stardustPerSecond,
    options: starOptions,
    bank: { type: 'ascend' },
    canBank: canAscend,
    // Stardust income depends on the shape of the tides, which a reset never touches.
    recovered: () => 1,
  },
  {
    id: 'tides',
    manual: (s) => s.tides.revealed && !tidesAutomated(s),
    purse: (s) => s.tides.tide,
    pending: (s) => s.tides.pending,
    income: (s) => getDerived(s).tidePerSecond,
    options: tideOptions,
    bank: { type: 'turnTide' },
    canBank: canTurnTide,
    // Tide income depends on the coastline, which a reset never touches.
    recovered: () => 1,
  },
  {
    id: 'coast',
    manual: (s) => s.coast.revealed && !coastAutomated(s),
    purse: (s) => s.coast.stone,
    pending: (s) => s.coast.pending,
    income: (s) => getDerived(s).stonePerSecond,
    options: coastOptions,
    bank: { type: 'survey' },
    canBank: canSurvey,
    // Stone income follows the Glimmer record; a run that has not caught up cannot raise it.
    recovered: (s) => (s.coast.record > 0 ? Math.min(1, log10p1(s.dawn.glimmerTotal) / s.coast.record) : 1),
  },
];
