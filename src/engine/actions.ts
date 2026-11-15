/**
 * Player actions. applyAction is pure: it returns a new state, or the same state
 * object when the action is invalid or unaffordable (nothing is ever lost by a bad tap).
 */
import { NIGHT_UPGRADE_ORDER } from '../content/night';
import { buyNightUpgrade } from './night';
import { cloneState } from './state';
import { pushEvent, reachMilestone } from './tick';
import type { Action, GameState } from './types';

/** Apply an action in place. Returns true when the state changed. */
export function applyActionInPlace(state: GameState, action: Action): boolean {
  switch (action.type) {
    case 'buyNightUpgrade': {
      if (!NIGHT_UPGRADE_ORDER.includes(action.id)) return false;
      const bought = buyNightUpgrade(state, action.id, action.count ?? 1);
      if (bought <= 0) return false;
      state.stats.purchases += 1;
      reachMilestone(state, 'firstUpgrade');
      pushEvent(state, { type: 'purchase', layer: 'night', id: action.id, count: bought, auto: false });
      return true;
    }
    default:
      return false;
  }
}

export function applyAction(state: GameState, action: Action): GameState {
  const next = cloneState(state);
  return applyActionInPlace(next, action) ? next : state;
}
