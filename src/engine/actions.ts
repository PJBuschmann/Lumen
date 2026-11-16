/**
 * Player actions. applyAction is pure: it returns a new state, or the same state
 * object when the action is invalid or unaffordable (nothing is ever lost by a bad tap).
 */
import { DAWN_UPGRADE_ORDER } from '../content/dawn';
import { NIGHT_UPGRADE_ORDER } from '../content/night';
import { enterChallenge, leaveChallenge } from './aurora';
import { checkReveals, updateRecords } from './automation';
import { buildLighthouse, dawnAutomated, performSurvey, raiseLighthouse } from './coast';
import { buyDawnUpgrade, canDawn, performDawn } from './dawn';
import { lightStar, performAscend } from './stars';
import { buyLinger, buySwell, performTurn } from './tides';
import { pushEvent, reachMilestone } from './events';
import { buyNightUpgrade } from './night';
import { cloneState } from './state';
import type { Action, GameState } from './types';

/** Apply an action in place. Returns true when the state changed. */
export function applyActionInPlace(state: GameState, action: Action): boolean {
  if (!performAction(state, action)) return false;
  // A purchase can cross a gate (for example the Stone total that reveals the tides).
  checkReveals(state);
  return true;
}

function performAction(state: GameState, action: Action): boolean {
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
    case 'dawn': {
      // Once the harbour tends the dawn, Glimmer flows in on its own.
      if (dawnAutomated(state) || !canDawn(state)) return false;
      if (!performDawn(state, false)) return false;
      state.stats.purchases += 1;
      return true;
    }
    case 'buyDawnUpgrade': {
      if (!DAWN_UPGRADE_ORDER.includes(action.id)) return false;
      const bought = buyDawnUpgrade(state, action.id, action.count ?? 1);
      if (bought <= 0) return false;
      state.stats.purchases += 1;
      pushEvent(state, { type: 'purchase', layer: 'dawn', id: action.id, count: bought, auto: false });
      return true;
    }
    case 'survey': {
      updateRecords(state);
      if (!performSurvey(state)) return false;
      state.stats.purchases += 1;
      return true;
    }
    case 'buildLighthouse': {
      if (!buildLighthouse(state, action.tile)) return false;
      state.stats.purchases += 1;
      pushEvent(state, { type: 'purchase', layer: 'coast', id: 'build', count: 1, auto: false });
      return true;
    }
    case 'raiseLighthouse': {
      const gained = raiseLighthouse(state, action.tile, action.count ?? 1);
      if (gained <= 0) return false;
      state.stats.purchases += 1;
      pushEvent(state, { type: 'purchase', layer: 'coast', id: 'raise', count: gained, auto: false });
      return true;
    }
    case 'turnTide': {
      updateRecords(state);
      if (!performTurn(state)) return false;
      state.stats.purchases += 1;
      return true;
    }
    case 'swellPhase': {
      const gained = buySwell(state, action.phase, action.count ?? 1);
      if (gained <= 0) return false;
      state.stats.purchases += 1;
      pushEvent(state, { type: 'purchase', layer: 'tides', id: 'swell', count: gained, auto: false });
      return true;
    }
    case 'lingerPhase': {
      if (!buyLinger(state, action.phase)) return false;
      state.stats.purchases += 1;
      pushEvent(state, { type: 'purchase', layer: 'tides', id: 'linger', count: 1, auto: false });
      return true;
    }
    case 'ascend': {
      updateRecords(state);
      if (!performAscend(state)) return false;
      state.stats.purchases += 1;
      return true;
    }
    case 'lightStar': {
      const gained = lightStar(state, action.star, action.count ?? 1);
      if (gained <= 0) return false;
      state.stats.purchases += 1;
      pushEvent(state, { type: 'purchase', layer: 'stars', id: 'star', count: gained, auto: false });
      return true;
    }
    case 'enterChallenge': {
      updateRecords(state);
      if (!enterChallenge(state, action.id)) return false;
      state.stats.purchases += 1;
      return true;
    }
    case 'leaveChallenge':
      return leaveChallenge(state);
    default:
      return false;
  }
}

export function applyAction(state: GameState, action: Action): GameState {
  const next = cloneState(state);
  return applyActionInPlace(next, action) ? next : state;
}
