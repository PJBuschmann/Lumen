/**
 * The bot brain. One implementation, four personalities (see policies.ts):
 * how it picks purchases, when it prestiges, and when it is at the keyboard.
 */
import { DAWN } from '../../src/content/dawn';
import { canDawn, dawnGain, getDerived } from '../../src/engine';
import type { Action, GameState } from '../../src/engine';
import { dawnOptions, nightOptions } from './options';
import type { Bot, Option, Policy } from './types';

/** Longest a bot will sit on its hands before looking at the game again. */
const MAX_PATIENCE = 20;
const MIN_PATIENCE = 0.25;

/** Cheapest affordable option. */
function pickCheapest(options: Option[]): Option | null {
  let best: Option | null = null;
  for (const option of options) {
    if (!option.affordable) continue;
    if (best === null || option.cost.lt(best.cost)) best = option;
  }
  return best;
}

/**
 * Best value for money among options paid from a slowly filling purse:
 * most orders of magnitude per unit of currency, affordable ones only.
 */
function pickBestValue(options: Option[]): Option | null {
  let best: Option | null = null;
  let bestScore = -Infinity;
  for (const option of options) {
    if (!option.affordable || option.gain <= 0) continue;
    const score = Math.log10(option.gain) - option.cost.log10();
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

/**
 * Night purchases compete for a purse that refills every second, so the classic
 * "time to afford + time to pay back" score applies. May return an unaffordable option:
 * the bot then waits for it instead of spending on something worse.
 */
function pickNightRoi(state: GameState, options: Option[]): Option | null {
  const rate = getDerived(state).lightPerSecond;
  if (rate.lte(0)) return pickCheapest(options);
  let best: Option | null = null;
  let bestScore = Infinity;
  for (const option of options) {
    if (option.gain <= 0) continue;
    const shortfall = option.cost.sub(state.night.light).max(0);
    const wait = shortfall.div(rate).toNumber();
    const payback = option.cost.div(rate.mul(Math.pow(10, option.gain) - 1)).toNumber();
    const score = wait + payback;
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

export function createBot(policy: Policy): Bot {
  /** Should the bot greet the dawn now? */
  function wantsDawn(state: GameState): boolean {
    if (!canDawn(state)) return false;
    const gain = dawnGain(state);
    const total = state.dawn.glimmerTotal;
    if (state.dawn.dawns === 0) return true; // the first dawn is the tutorial moment
    if (policy.prestige === 'double') return gain.gte(total);
    // 'optimal': stop when Glimmer per second for this night has peaked, i.e. when the
    // relative growth of the gain falls below 1 / (time already spent on the night).
    const runLight = state.night.runLight;
    const rate = getDerived(state).lightPerSecond;
    if (rate.lte(0)) return true;
    const growth = DAWN.glimmerExponent * rate.div(runLight).toNumber();
    const worthIt = gain.gte(total.mul(0.25));
    return worthIt && growth * state.night.runTime < 1;
  }

  function nightChoice(state: GameState): Option | null {
    const options = nightOptions(state);
    if (options.length === 0) return null;
    return policy.choice === 'cheapest' ? pickCheapest(options) : pickNightRoi(state, options);
  }

  return {
    policy,
    decide(state: GameState): Action | null {
      if (wantsDawn(state)) return { type: 'dawn' };

      const dawn = dawnOptions(state);
      const dawnPick = policy.choice === 'cheapest' ? pickCheapest(dawn) : pickBestValue(dawn);
      if (dawnPick) return dawnPick.action;

      const night = nightChoice(state);
      if (night && night.affordable) return night.action;
      return null;
    },

    patience(state: GameState): number {
      const rate = getDerived(state).lightPerSecond;
      const night = nightChoice(state);
      let wait = MAX_PATIENCE;
      if (night && !night.affordable && rate.gt(0)) {
        wait = night.cost.sub(state.night.light).div(rate).toNumber();
      } else if (night === null && policy.choice === 'cheapest') {
        // Nothing affordable: wait for the cheapest Night upgrade.
        let cheapest: Option | null = null;
        for (const option of nightOptions(state)) {
          if (cheapest === null || option.cost.lt(cheapest.cost)) cheapest = option;
        }
        if (cheapest && rate.gt(0)) wait = cheapest.cost.sub(state.night.light).div(rate).toNumber();
      }
      if (!Number.isFinite(wait)) wait = MAX_PATIENCE;
      return Math.min(MAX_PATIENCE, Math.max(MIN_PATIENCE, wait));
    },
  };
}
