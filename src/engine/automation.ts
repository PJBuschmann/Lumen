/**
 * Automation: everything the game does for the player. It runs on the heartbeat only.
 */
import { NIGHT_UPGRADE_ORDER } from '../content/night';
import type { NightUpgradeId } from '../content/night';
import { apprenticeSkills } from './dawn';
import { buyNightUpgrade } from './night';
import { pushEvent } from './events';
import type { GameState } from './types';

/** Most expensive price ratio first, so cheap wick levels only use what is left over. */
const APPRENTICE_ORDER: readonly NightUpgradeId[] = ['lens', 'oil', 'rotation', 'wick'];

/** The apprentice keeper buys every Night upgrade they have been taught. */
export function runApprentice(state: GameState): number {
  const skills = apprenticeSkills(state);
  if (skills.length === 0) return 0;
  let bought = 0;
  for (const id of APPRENTICE_ORDER) {
    if (!skills.includes(id)) continue;
    const count = buyNightUpgrade(state, id, 'max');
    if (count > 0) {
      bought += count;
      pushEvent(state, { type: 'purchase', layer: 'night', id, count, auto: true });
    }
  }
  return bought;
}

/** Everything automated, in order from the widest layer down to the lamp. */
export function runAutomation(state: GameState): void {
  const bought = runApprentice(state);
  state.stats.autoPurchases += bought;
}

export { NIGHT_UPGRADE_ORDER };
