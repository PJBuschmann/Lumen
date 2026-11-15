/**
 * The bot brain. One implementation, four personalities (see policies.ts):
 * how it picks purchases, when it prestiges, and when it is at the keyboard.
 */
import { DAWN } from '../../src/content/dawn';
import {
  apprenticeSkills,
  bestAffordableOption,
  bestOption,
  canDawn,
  dawnAutomated,
  dawnGain,
  getDerived,
  longNightPower,
} from '../../src/engine';
import type { Action, GameState, StructureOption } from '../../src/engine';
import { UPPER_LAYERS } from './layers';
import type { UpperLayer } from './layers';
import { dawnOptions, nightOptions } from './options';
import type { Bot, Option, Policy } from './types';

/** Longest a bot sits on its hands while there are Night upgrades to buy by hand. */
const MAX_PATIENCE_BUSY = 20;
/** ...and once the lamp tends itself. */
const MAX_PATIENCE_IDLE = 60;
const MIN_PATIENCE = 0.25;
/** A bot never prestiges a wider layer more often than this (seconds). */
const MIN_RUN = { double: 90, optimal: 45 } as const;
/** A night this long is greeted even if the Glimmer would not double. */
const LONG_NIGHT = 18 * 60;
/** How long the patient bot waits for a run to catch up with its record before banking anyway. */
const CATCH_UP_LIMIT = 15 * 60;

/** Cheapest affordable option. */
function pickCheapest<T extends { cost: Option['cost']; affordable?: boolean }>(options: T[], budget?: Option['cost']): T | null {
  let best: T | null = null;
  for (const option of options) {
    const affordable = budget ? option.cost.lte(budget) : option.affordable;
    if (!affordable) continue;
    if (best === null || option.cost.lt(best.cost)) best = option;
  }
  return best;
}

/** Most orders of magnitude per unit of currency, affordable ones only. */
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
  /** Should the bot greet the dawn now? (Only while Dawn is still done by hand.) */
  function wantsDawn(state: GameState): boolean {
    if (dawnAutomated(state) || !canDawn(state)) return false;
    const gain = dawnGain(state);
    const total = state.dawn.glimmerTotal;
    if (state.dawn.dawns === 0) return true; // the first dawn is the tutorial moment
    if (policy.prestige === 'double') {
      // "When it would double" - or, on a long night, once it is clearly worth having.
      return gain.gte(total) || (state.night.runTime >= LONG_NIGHT && gain.gte(total.mul(0.2)));
    }
    // 'optimal': maximise the long-run growth rate of total Glimmer. Banking at night-age T
    // multiplies the total by (1 + gain/total); the average log-growth ln(1 + gain/total) / T
    // peaks when  growth * T * gain / (total + gain) = ln(1 + gain / total).
    const runLight = state.night.runLight;
    const rate = getDerived(state).lightPerSecond;
    if (rate.lte(0) || total.lte(0)) return true;
    // Relative growth of the gain: Light still pouring in, plus the long-night bonus ripening.
    const nightHours = state.night.runTime / 3600;
    const ripening =
      nightHours < DAWN.longNight.capHours
        ? longNightPower(state.dawn.upgrades.vigil) / ((DAWN.longNight.refHours + nightHours) * 3600)
        : 0;
    const growth = DAWN.glimmerExponent * rate.div(runLight).toNumber() + ripening;
    const ratio = gain.div(total).toNumber();
    return Math.log1p(ratio) >= (growth * state.night.runTime * ratio) / (1 + ratio);
  }

  /** The structure purchase this bot is saving for on a wider layer. */
  function target(state: GameState, layer: UpperLayer): StructureOption | null {
    const options = layer.options(state);
    if (policy.choice === 'cheapest') {
      let cheapest: StructureOption | null = null;
      for (const option of options) {
        if (option.gain <= 0) continue;
        if (cheapest === null || option.cost.lt(cheapest.cost)) cheapest = option;
      }
      return cheapest;
    }
    return bestOption(options);
  }

  /** Spend from a wider layer's purse, if anything worthwhile is affordable. */
  function spend(state: GameState, layer: UpperLayer): Action | null {
    const options = layer.options(state);
    const purse = layer.purse(state);
    if (policy.choice === 'cheapest') {
      const pick = pickCheapest(options.filter((o) => o.gain > 0), purse);
      return pick ? pick.action : null;
    }
    const pick = bestAffordableOption(options, purse);
    return pick ? pick.action : null;
  }

  /** Should the bot prestige this wider layer now? */
  function wantsBank(state: GameState, layer: UpperLayer): boolean {
    if (!layer.canBank(state)) return false;
    const goal = target(state, layer);
    if (!goal) return false;
    // Only prestige when it pays for the next purchase.
    if (layer.purse(state).add(layer.pending(state)).lt(goal.cost)) return false;
    const runTime = state.night.runTime;
    if (runTime < MIN_RUN[policy.prestige]) return false;
    if (policy.prestige === 'optimal') return true;
    // 'double': be patient; let the run catch up with its record first (within reason).
    return layer.recovered(state) >= 1 || runTime >= CATCH_UP_LIMIT;
  }

  function nightChoice(state: GameState): Option | null {
    const options = nightOptions(state);
    if (options.length === 0) return null;
    return policy.choice === 'cheapest' ? pickCheapest(options) : pickNightRoi(state, options);
  }

  return {
    policy,
    decide(state: GameState): Action | null {
      // Widest layer first: spend, then consider a prestige.
      for (const layer of UPPER_LAYERS) {
        if (!layer.manual(state)) continue;
        const purchase = spend(state, layer);
        if (purchase) return purchase;
        if (wantsBank(state, layer)) return layer.bank;
      }

      if (wantsDawn(state)) return { type: 'dawn' };

      if (!dawnAutomated(state)) {
        const dawn = dawnOptions(state);
        const dawnPick = policy.choice === 'cheapest' ? pickCheapest(dawn) : pickBestValue(dawn);
        if (dawnPick) return dawnPick.action;
      }

      const night = nightChoice(state);
      if (night && night.affordable) return night.action;
      return null;
    },

    patience(state: GameState): number {
      const lampTendsItself = apprenticeSkills(state).length > 0;
      const cap = lampTendsItself ? MAX_PATIENCE_IDLE : MAX_PATIENCE_BUSY;
      let wait = cap;

      // Waiting on a Night upgrade.
      const rate = getDerived(state).lightPerSecond;
      let night = nightChoice(state);
      if (night === null && policy.choice === 'cheapest') {
        for (const option of nightOptions(state)) {
          if (night === null || option.cost.lt(night.cost)) night = option;
        }
      }
      if (night && !night.affordable && rate.gt(0)) {
        wait = Math.min(wait, night.cost.sub(state.night.light).div(rate).toNumber());
      }

      // Waiting on a wider layer's income to cover its next purchase.
      for (const layer of UPPER_LAYERS) {
        if (!layer.manual(state)) continue;
        const goal = target(state, layer);
        const income = layer.income(state);
        if (!goal || income.lte(0)) continue;
        const shortfall = goal.cost.sub(layer.purse(state)).sub(layer.pending(state));
        if (shortfall.gt(0)) wait = Math.min(wait, shortfall.div(income).toNumber());
        else wait = Math.min(wait, Math.max(1, MIN_RUN[policy.prestige] - state.night.runTime));
      }

      if (!Number.isFinite(wait)) wait = cap;
      return Math.min(cap, Math.max(MIN_PATIENCE, wait));
    },
  };
}
