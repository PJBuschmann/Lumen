/**
 * Aurora layer (endgame): challenge runs with modifier rules, each granting a large
 * permanent multiplier. There is no way to fail one.
 */
import { AURORA, CHALLENGE_ORDER } from '../content/aurora';
import type { ChallengeDef, ChallengeId, ChallengeRules } from '../content/aurora';
import { resetDawn } from './dawn';
import { invalidateStructure } from './derive';
import { pushEvent, reachMilestone } from './events';
import { collectStardust } from './stars';
import type { GameState } from './types';

const NO_RULES: ChallengeRules = {};

export function challengeDef(id: ChallengeId): ChallengeDef {
  return AURORA.challenges[id];
}

/** Rules in force right now (empty outside a challenge). */
export function activeRules(state: GameState): ChallengeRules {
  const active = state.aurora.active;
  return active === null ? NO_RULES : AURORA.challenges[active].rules;
}

export function challengeTier(state: GameState, id: ChallengeId): number {
  return state.aurora.completions[id] ?? 0;
}

export function challengeMaxTier(id: ChallengeId): number {
  return AURORA.challenges[id].goals.length;
}

/** log10 of the Light the next tier of a challenge asks for, or null when all are done. */
export function challengeGoal(state: GameState, id: ChallengeId): number | null {
  const tier = challengeTier(state, id);
  const goals = AURORA.challenges[id].goals;
  return tier < goals.length ? goals[tier] : null;
}

export function totalCompletions(state: GameState): number {
  let total = 0;
  for (const id of CHALLENGE_ORDER) total += state.aurora.completions[id] ?? 0;
  return total;
}

/** Orders of magnitude of Light granted permanently by completed challenge tiers. */
export function auroraPower(state: GameState): number {
  let power = 0;
  for (const id of CHALLENGE_ORDER) power += (state.aurora.completions[id] ?? 0) * AURORA.challenges[id].reward;
  return power;
}

export function canEnterChallenge(state: GameState, id: ChallengeId): boolean {
  return (
    state.aurora.unlocked &&
    state.aurora.active === null &&
    CHALLENGE_ORDER.includes(id) &&
    challengeTier(state, id) < challengeMaxTier(id)
  );
}

/** Begin a challenge: a fresh night under its rule. */
export function enterChallenge(state: GameState, id: ChallengeId): boolean {
  if (!canEnterChallenge(state, id)) return false;
  state.aurora.active = id;
  resetDawn(state);
  pushEvent(state, { type: 'challengeStart', id });
  return true;
}

/** Step out of a challenge. Nothing is lost; a fresh night begins under normal rules. */
export function leaveChallenge(state: GameState): boolean {
  const active = state.aurora.active;
  if (active === null) return false;
  state.aurora.active = null;
  resetDawn(state);
  pushEvent(state, { type: 'challengeLeave', id: active });
  return true;
}

/** On the heartbeat: has the active challenge's goal been reached? */
export function checkChallenge(state: GameState): boolean {
  const active = state.aurora.active;
  if (active === null) return false;
  const goal = challengeGoal(state, active);
  if (goal === null) {
    state.aurora.active = null;
    state.derived = null;
    return false;
  }
  if (state.night.runLight.lte(0) || state.night.runLight.log10() < goal) return false;
  const tier = challengeTier(state, active) + 1;
  state.aurora.completions[active] = tier;
  state.aurora.active = null;
  invalidateStructure(state);
  // From the first completion on the star map charts itself: nothing gathered is left waiting.
  collectStardust(state);
  resetDawn(state);
  reachMilestone(state, 'firstChallenge');
  pushEvent(state, { type: 'challengeComplete', id: active, tier });
  return true;
}
