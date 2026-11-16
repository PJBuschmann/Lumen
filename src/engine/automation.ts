/**
 * Automation: everything the game does for the player. It runs on the heartbeat only.
 *
 * Each layer, once established, tends the layer below it:
 *   Dawn       -> the apprentice buys Night upgrades
 *   Coastline  -> Dawn's Glimmer flows in on its own and Dawn upgrades are bought
 *   Tides      -> surveyed Stone arrives on its own and lighthouses are built
 *   Stars      -> drawn Tide arrives on its own and the cycle is reshaped
 *   Aurora     -> Stardust arrives on its own and stars are charted
 */
import { AURORA } from '../content/aurora';
import { COAST } from '../content/coast';
import { DAWN_UPGRADE_ORDER } from '../content/dawn';
import type { NightUpgradeId } from '../content/night';
import { STARS } from '../content/stars';
import { TIDES } from '../content/tides';
import { checkChallenge } from './aurora';
import { coastAutomated, dawnAutomated, runAutoBuilder } from './coast';
import { apprenticeSkills, buyDawnUpgrade, dawnGain } from './dawn';
import { log10p1 } from './decimal';
import { getDerived } from './derive';
import { pushEvent, reachMilestone } from './events';
import { buyNightUpgrade, nightUpgradeLocked } from './night';
import { openStarMap, runAutoStars } from './stars';
import { runAutoTides, startMoon } from './tides';
import type { GameState } from './types';

/** Most expensive price ratio first, so cheap wick levels only use what is left over. */
const APPRENTICE_ORDER: readonly NightUpgradeId[] = ['lens', 'oil', 'rotation', 'wick'];

/** The apprentice keeper buys every Night upgrade they have been taught. */
export function runApprentice(state: GameState): number {
  const skills = apprenticeSkills(state);
  if (skills.length === 0) return 0;
  let bought = 0;
  for (const id of APPRENTICE_ORDER) {
    if (!skills.includes(id) || nightUpgradeLocked(state, id)) continue;
    const count = buyNightUpgrade(state, id, 'max');
    if (count > 0) {
      bought += count;
      pushEvent(state, { type: 'purchase', layer: 'night', id, count, auto: true });
    }
  }
  return bought;
}

/**
 * Dawn tended by the harbour: a share of the Glimmer a Dawn would gather arrives every
 * second without resetting the night, and Dawn upgrades are bought as they become affordable.
 */
export function runAutoDawn(state: GameState, elapsed: number): number {
  if (!dawnAutomated(state)) return 0;
  const gain = dawnGain(state);
  if (gain.gt(0)) {
    const flow = gain.mul(getDerived(state).passiveDawnShare * elapsed);
    state.dawn.glimmer = state.dawn.glimmer.add(flow);
    state.dawn.glimmerTotal = state.dawn.glimmerTotal.add(flow);
    state.derived = null;
  }
  let bought = 0;
  for (const id of DAWN_UPGRADE_ORDER) {
    const count = buyDawnUpgrade(state, id, 'max');
    if (count > 0) {
      bought += count;
      pushEvent(state, { type: 'purchase', layer: 'dawn', id, count, auto: true });
    }
  }
  return bought;
}

/** Bring layers into view when their gate is reached. */
export function checkReveals(state: GameState): void {
  const coast = state.coast;
  if (!coast.revealed && state.dawn.glimmerTotal.gte(COAST.revealGlimmer)) {
    coast.revealed = true;
    state.derived = null;
    pushEvent(state, { type: 'reveal', layer: 'coast' });
  }
  const tides = state.tides;
  if (!tides.revealed && coast.stoneTotal.gte(TIDES.revealStone)) {
    tides.revealed = true;
    startMoon(state);
    pushEvent(state, { type: 'reveal', layer: 'tides' });
  }
  const stars = state.stars;
  if (!stars.revealed && tides.tideTotal.gte(STARS.revealTide)) {
    openStarMap(state);
    pushEvent(state, { type: 'reveal', layer: 'stars' });
  }
  const aurora = state.aurora;
  if (!aurora.unlocked && stars.stardustTotal.gte(AURORA.unlockStardust)) {
    aurora.unlocked = true;
    state.derived = null;
    reachMilestone(state, 'auroraUnlocked');
    pushEvent(state, { type: 'reveal', layer: 'aurora' });
  }
}

/** Keep the records that drive passive income. Only ever rise. */
export function updateRecords(state: GameState): void {
  const glimmerLog = log10p1(state.dawn.glimmerTotal);
  if (glimmerLog > state.coast.record) {
    state.coast.record = glimmerLog;
    state.derived = null;
  }
}

/**
 * One heartbeat of automation, from the widest layer down to the lamp.
 * `elapsed` is the number of seconds since the previous heartbeat.
 */
export function runHeartbeat(state: GameState, elapsed: number): void {
  let bought = 0;
  bought += runAutoStars(state);
  bought += runAutoTides(state);
  bought += runAutoBuilder(state);
  bought += runAutoDawn(state, elapsed);
  bought += runApprentice(state);
  state.stats.autoPurchases += bought;
  updateRecords(state);
  checkReveals(state);
  checkChallenge(state);
  // Each step above invalidates the caches it affects; a quiet beat keeps them.
}

export { coastAutomated, dawnAutomated };
