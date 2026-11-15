/**
 * Tides layer (prestige 3): zoom out again, from a shore to the sea itself.
 * The moon cycles ship traffic and multipliers; Tide is spent to reshape the cycle.
 */
import { PHASE_COUNT, TIDES } from '../content/tides';
import type { MoonPhaseDef } from '../content/tides';
import { D, Decimal, ZERO, powLevel } from './decimal';
import { bestAffordableOption, collectSurvey } from './coast';
import { resetDawn } from './dawn';
import { pushEvent, reachMilestone } from './events';
import type { GameState, StructureOption } from './types';

export function moonPhase(index: number): MoonPhaseDef {
  return TIDES.phases[((index % PHASE_COUNT) + PHASE_COUNT) % PHASE_COUNT];
}

/** Whether the tides reshape themselves (after the first Ascension). Set by the stars layer. */
export function tidesAutomated(_state: GameState): boolean {
  return false;
}

/** Seconds a phase lasts, including its Linger levels. */
export function phaseDuration(linger: readonly number[], phase: number): number {
  return TIDES.phaseSeconds * (1 + TIDES.linger.step * linger[phase]);
}

export function moonCycleDuration(linger: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < PHASE_COUNT; i++) total += phaseDuration(linger, i);
  return total;
}

/** Time-weighted average traffic multiplier over a whole moon. */
export function averageTraffic(linger: readonly number[]): number {
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < PHASE_COUNT; i++) {
    const d = phaseDuration(linger, i);
    weighted += d * TIDES.phases[i].traffic;
    total += d;
  }
  return weighted / total;
}

export function swellTotal(swell: readonly number[]): number {
  let total = 0;
  for (const level of swell) total += level;
  return total;
}

/** Orders of magnitude of Light from Swell that apply at all times. */
export function tideBasePower(swell: readonly number[]): number {
  return TIDES.swell.powerPerLevel * swellTotal(swell);
}

/** Orders of magnitude of Light from the tides while `phase` is in the sky. */
export function tidePowerAt(swell: readonly number[], phase: number): number {
  return TIDES.swell.powerPerLevel * (swellTotal(swell) + TIDES.swell.resonance * swell[phase]);
}

export function swellCost(level: number): Decimal {
  const { base, offset, power } = TIDES.swell.cost;
  return D(base * Math.pow(level + offset, power));
}

export function lingerCost(level: number): Decimal {
  return D(TIDES.linger.cost.base).mul(powLevel(TIDES.linger.cost.ratio, level));
}

/** Tide drawn per second for a given coast power and phase, before multipliers. */
export function basePullRate(coastPower: number, phase: number): number {
  const reach = Math.max(0, coastPower - TIDES.pullOffset);
  return TIDES.pullRate * Math.pow(reach, TIDES.pullPower) * TIDES.phases[phase].traffic;
}

/** Every reshaping purchase available, with cost and estimated benefit. */
export function tideOptions(state: GameState): StructureOption[] {
  const tides = state.tides;
  if (!tides.revealed) return [];
  const options: StructureOption[] = [];
  const cycle = moonCycleDuration(tides.linger);
  const traffic = averageTraffic(tides.linger);
  const base = tideBasePower(tides.swell);
  for (let phase = 0; phase < PHASE_COUNT; phase++) {
    const share = phaseDuration(tides.linger, phase) / cycle;
    options.push({
      action: { type: 'swellPhase', phase, count: 1 },
      cost: swellCost(tides.swell[phase]),
      gain: TIDES.swell.powerPerLevel * (1 + TIDES.swell.resonance * share),
      label: `tides.swell.${phase}`,
    });
    const level = tides.linger[phase];
    if (level < TIDES.linger.maxLevel) {
      const longer = tides.linger.slice();
      longer[phase] = level + 1;
      // More Tide per second, valued as the Swell it will eventually buy (cubic costs -> 1/3).
      const ratio = averageTraffic(longer) / traffic;
      options.push({
        action: { type: 'lingerPhase', phase },
        cost: lingerCost(level),
        gain: ratio > 1 ? ((base + 0.5) * Math.log(ratio)) / (TIDES.swell.cost.power + 1) : 0,
        label: `tides.linger.${phase}`,
      });
    }
  }
  return options;
}

/** Raise a phase's Swell by up to `count` levels. Returns the levels gained. */
export function buySwell(state: GameState, phase: number, count: number): number {
  const tides = state.tides;
  if (!tides.revealed || !Number.isInteger(phase) || phase < 0 || phase >= PHASE_COUNT) return 0;
  let gained = 0;
  const wanted = Math.max(0, Math.floor(count));
  while (gained < wanted) {
    const cost = swellCost(tides.swell[phase]);
    if (cost.gt(tides.tide)) break;
    tides.tide = tides.tide.sub(cost);
    tides.swell[phase] += 1;
    gained += 1;
  }
  if (gained > 0) state.derived = null;
  return gained;
}

export function buyLinger(state: GameState, phase: number): boolean {
  const tides = state.tides;
  if (!tides.revealed || !Number.isInteger(phase) || phase < 0 || phase >= PHASE_COUNT) return false;
  const level = tides.linger[phase];
  if (level >= TIDES.linger.maxLevel) return false;
  const cost = lingerCost(level);
  if (cost.gt(tides.tide)) return false;
  tides.tide = tides.tide.sub(cost);
  tides.linger[phase] = level + 1;
  // The phase in the sky lasts longer straight away.
  if (tides.phase === phase) tides.phaseEndsAt += TIDES.phaseSeconds * TIDES.linger.step;
  state.derived = null;
  return true;
}

export function canTurnTide(state: GameState): boolean {
  return state.tides.revealed && !tidesAutomated(state) && state.tides.pending.gte(1);
}

/** Turn the tide: claim the drawn Tide; Night and Dawn begin again. */
export function performTurn(state: GameState): boolean {
  if (!canTurnTide(state)) return false;
  const tides = state.tides;
  const gained = tides.pending;
  tides.tide = tides.tide.add(gained);
  tides.tideTotal = tides.tideTotal.add(gained);
  tides.pending = ZERO;
  tides.turns += 1;
  // From the first turn on the coastline tends itself: nothing surveyed is left waiting.
  collectSurvey(state);
  resetDawn(state);
  reachMilestone(state, 'firstTides');
  pushEvent(state, { type: 'turn', tide: gained });
  return true;
}

/** Start the moon's clock when the tides are first revealed. */
export function startMoon(state: GameState): void {
  state.tides.phase = 0;
  state.tides.phaseEndsAt = state.time + phaseDuration(state.tides.linger, 0);
  state.derived = null;
}

/** The phase in the sky ends; the next begins. */
export function advancePhase(state: GameState): void {
  const tides = state.tides;
  tides.phase = (tides.phase + 1) % PHASE_COUNT;
  tides.phaseEndsAt += phaseDuration(tides.linger, tides.phase);
  state.derived = null;
  pushEvent(state, { type: 'phase', phase: tides.phase });
}

/** The automatic tide-reader: spends Tide on the best-value reshaping it can afford. */
export function runAutoTides(state: GameState): number {
  if (!tidesAutomated(state)) return 0;
  let bought = 0;
  while (bought < TIDES.autoShapePerBeat) {
    const pick = bestAffordableOption(tideOptions(state), state.tides.tide);
    if (!pick) break;
    const action = pick.action;
    const ok =
      action.type === 'swellPhase'
        ? buySwell(state, action.phase, 1) > 0
        : action.type === 'lingerPhase'
          ? buyLinger(state, action.phase)
          : false;
    if (!ok) break;
    bought += 1;
  }
  if (bought > 0) pushEvent(state, { type: 'purchase', layer: 'tides', id: 'reshape', count: bought, auto: true });
  return bought;
}
