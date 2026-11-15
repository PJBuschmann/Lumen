import type { Action, Decimal, GameState } from '../../src/engine';

/** One thing a bot could spend on right now. */
export interface Option {
  action: Action;
  /** Which purse pays for it. */
  currency: 'light' | 'glimmer' | 'stone' | 'tide' | 'stardust';
  cost: Decimal;
  affordable: boolean;
  /**
   * Benefit in orders of magnitude of Light production (log10 of the multiplier it adds).
   * Convenience upgrades get a small nominal value.
   */
  gain: number;
  /** Stable label for logs. */
  label: string;
}

export type ChoiceRule = 'roi' | 'cheapest';
export type PrestigeRule = 'double' | 'optimal';
export type SessionRule = 'always' | 'offlineHeavy';

export interface Policy {
  name: string;
  description: string;
  choice: ChoiceRule;
  prestige: PrestigeRule;
  sessions: SessionRule;
}

export interface Bot {
  policy: Policy;
  /** The action to take now, or null to let time pass. */
  decide(state: GameState): Action | null;
  /** Seconds to let pass before looking again (the runner clamps it). */
  patience(state: GameState): number;
}
