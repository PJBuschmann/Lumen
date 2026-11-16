/**
 * Constellations layer (prestige 4): zoom out once more, from the sea to the sky.
 * Lighthouses become stars on a skill-tree map, guiding ships between worlds.
 */
import { STARS, STAR_COUNT } from '../content/stars';
import type { StarDef, StarEffect, StarKindDef } from '../content/stars';
import { bestAffordableOption } from './coast';
import { resetDawn } from './dawn';
import { D, Decimal, ZERO } from './decimal';
import { getStructure, invalidateStructure } from './derive';
import { pushEvent, reachMilestone } from './events';
import { collectTide, tideBasePower } from './tides';
import type { GameState, StarEffects, StructureOption } from './types';

const INDEX_BY_ID = new Map<string, number>(STARS.stars.map((star, index) => [star.id, index]));
const LINKS: readonly (readonly number[])[] = STARS.stars.map((star) =>
  star.links.map((id) => {
    const index = INDEX_BY_ID.get(id);
    if (index === undefined) throw new Error(`Star ${star.id} links to unknown star ${id}`);
    return index;
  }),
);
const POLARIS = INDEX_BY_ID.get('polaris') ?? 0;
const MEMBERS = new Map<string, number[]>();
STARS.stars.forEach((star, index) => {
  if (star.constellation === null) return;
  const list = MEMBERS.get(star.constellation) ?? [];
  list.push(index);
  MEMBERS.set(star.constellation, list);
});

export function starDef(index: number): StarDef {
  return STARS.stars[index];
}

export function starKindDef(index: number): StarKindDef {
  return STARS.kinds[STARS.stars[index].kind];
}

export function starIndex(id: string): number {
  return INDEX_BY_ID.get(id) ?? -1;
}

export function starLinks(index: number): readonly number[] {
  return LINKS[index] ?? [];
}

export function polarisIndex(): number {
  return POLARIS;
}

export function starMaxLevel(index: number): number {
  const max = starKindDef(index).maxLevel;
  return max === null ? Infinity : max;
}

/** Stars of a constellation, as indices. */
export function constellationStars(id: string): readonly number[] {
  return MEMBERS.get(id) ?? [];
}

export function constellationComplete(levels: readonly number[], id: string): boolean {
  const members = MEMBERS.get(id);
  if (!members) return false;
  for (const index of members) if (levels[index] <= 0) return false;
  return true;
}

export function completedConstellations(levels: readonly number[]): string[] {
  return STARS.constellations.filter((c) => constellationComplete(levels, c.id)).map((c) => c.id);
}

/** Stars lit so far, not counting Polaris (which is lit for free). */
export function starsLit(levels: readonly number[]): number {
  let lit = 0;
  for (let i = 0; i < levels.length; i++) if (levels[i] > 0 && i !== POLARIS) lit += 1;
  return lit;
}

/** Whether the star map charts itself (after the first Aurora challenge is completed). */
export function starsAutomated(state: GameState): boolean {
  for (const id in state.aurora.completions) {
    if (state.aurora.completions[id as keyof typeof state.aurora.completions] > 0) return true;
  }
  return false;
}

function effectOf(index: number): StarEffect {
  const star = STARS.stars[index];
  return star.kind === 'keystone' ? star.keystoneEffect ?? {} : STARS.kinds[star.kind].effect;
}

/** Everything the lit stars change, summed up. */
export function starEffects(levels: readonly number[]): StarEffects {
  let beaconLevels = 0;
  let beaconMult = 1;
  let constellationMult = 1;
  let stone = 0;
  let tide = 0;
  let dust = 0;
  let traffic = 0;
  const fx: StarEffects = {
    lightPower: 0,
    stoneMult: 1,
    tideMult: 1,
    dustMult: 1,
    glimmerLog: 0,
    trafficMult: 1,
    synergyMult: 1,
    resonance: 0,
    passiveDawnMult: 1,
    vigil: 0,
    swellMult: 1,
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const level = levels[i];
    if (level <= 0) continue;
    const effect = effectOf(i);
    if (effect.lightPower) beaconLevels += level;
    if (effect.stone) stone += effect.stone * level;
    if (effect.tide) tide += effect.tide * level;
    if (effect.dust) dust += effect.dust * level;
    if (effect.traffic) traffic += effect.traffic * level;
    if (effect.glimmerLog) fx.glimmerLog += effect.glimmerLog * level;
    if (effect.resonance) fx.resonance += effect.resonance;
    if (effect.vigil) fx.vigil += effect.vigil;
    if (effect.beaconMult) beaconMult *= effect.beaconMult;
    if (effect.synergyMult) fx.synergyMult *= effect.synergyMult;
    if (effect.passiveDawnMult) fx.passiveDawnMult *= effect.passiveDawnMult;
    if (effect.swellMult) fx.swellMult *= effect.swellMult;
    if (effect.constellationMult) constellationMult *= effect.constellationMult;
  }
  fx.stoneMult = 1 + stone;
  fx.tideMult = 1 + tide;
  fx.dustMult = 1 + dust;
  fx.trafficMult = 1 + traffic;
  const beaconPower = STARS.kinds.beacon.effect.lightPower ?? 0;
  let completed = 0;
  for (const c of STARS.constellations) if (constellationComplete(levels, c.id)) completed += 1;
  fx.lightPower =
    beaconLevels * beaconPower * beaconMult +
    (levels[POLARIS] > 0 ? STARS.polarisPower : 0) +
    completed * STARS.constellationBonus * constellationMult;
  return fx;
}

/** An unlit star can be lit when it touches a lit one. */
export function canReachStar(levels: readonly number[], index: number): boolean {
  if (index < 0 || index >= STAR_COUNT) return false;
  if (levels[index] > 0) return true;
  for (const n of LINKS[index]) if (levels[n] > 0) return true;
  return false;
}

/** Stardust to light the star (if unlit) or brighten it by one level. */
export function starCost(levels: readonly number[], index: number): Decimal {
  return starCostWith(levels, index, starsLit(levels));
}

function starCostWith(levels: readonly number[], index: number, lit: number): Decimal {
  const kind = starKindDef(index);
  const level = levels[index];
  if (level <= 0) {
    const { base, offset, power } = STARS.light;
    return D(base * Math.pow(lit + offset, power) * kind.cost);
  }
  const { base, offset, power } = STARS.brighten;
  return D(base * Math.pow(level + offset, power) * kind.cost);
}

/** Stardust drifting in per second for a given tide power, before multipliers. */
export function baseDriftRate(tidePower: number): number {
  const reach = Math.max(0, tidePower - STARS.driftOffset);
  return STARS.driftRate * Math.pow(reach, STARS.driftPower);
}

/** Value (in OoM of Light) of an income multiplier that grows a polynomial-cost structure. */
function incomeValue(structurePower: number, ratio: number): number {
  return ratio > 1 ? ((structurePower + 0.5) * Math.log(ratio)) / 3 : 0;
}

/** Shared numbers for valuing star purchases; built once per options list. */
interface GainContext {
  levels: readonly number[];
  coastPower: number;
  tidePower: number;
  starPower: number;
  beaconLevels: number;
  beaconScale: number;
  completed: number;
  /** Unlit stars remaining per constellation. */
  unlit: Map<string, number>;
  stoneMult: number;
  tideMult: number;
  dustMult: number;
  trafficMult: number;
}

function gainContext(state: GameState): GainContext {
  const levels = state.stars.levels;
  const structure = getStructure(state);
  const fx = structure.stars;
  let beaconLevels = 0;
  let beaconScale = 1;
  const unlit = new Map<string, number>();
  for (let i = 0; i < STAR_COUNT; i++) {
    const effect = effectOf(i);
    const level = levels[i];
    if (level > 0) {
      if (effect.lightPower) beaconLevels += level;
      if (effect.beaconMult) beaconScale *= effect.beaconMult;
    } else {
      const constellation = STARS.stars[i].constellation;
      if (constellation !== null) unlit.set(constellation, (unlit.get(constellation) ?? 0) + 1);
    }
  }
  let completed = 0;
  for (const c of STARS.constellations) if (!unlit.has(c.id)) completed += 1;
  return {
    levels,
    coastPower: structure.coastPower,
    tidePower: structure.tideBasePower,
    starPower: fx.lightPower,
    beaconLevels,
    beaconScale,
    completed,
    unlit,
    stoneMult: fx.stoneMult,
    tideMult: fx.tideMult,
    dustMult: fx.dustMult,
    trafficMult: fx.trafficMult,
  };
}

function gainWith(ctx: GainContext, index: number): number {
  const level = ctx.levels[index];
  const star = STARS.stars[index];
  const effect = effectOf(index);
  const beaconPower = STARS.kinds.beacon.effect.lightPower ?? 0;
  let gain = 0;

  if (effect.lightPower) gain += effect.lightPower * ctx.beaconScale;
  if (effect.stone) gain += incomeValue(ctx.coastPower, (ctx.stoneMult + effect.stone) / ctx.stoneMult);
  if (effect.tide) gain += incomeValue(ctx.tidePower, (ctx.tideMult + effect.tide) / ctx.tideMult);
  if (effect.dust) gain += incomeValue(ctx.starPower, (ctx.dustMult + effect.dust) / ctx.dustMult);
  if (effect.traffic) gain += Math.log10((ctx.trafficMult + effect.traffic) / ctx.trafficMult) / 6;
  if (effect.glimmerLog) gain += effect.glimmerLog * 0.25;
  if (effect.resonance) gain += (ctx.tidePower / 8) * effect.resonance;
  if (effect.vigil) gain += 0.1;
  if (effect.beaconMult) gain += (effect.beaconMult - 1) * ctx.beaconLevels * beaconPower;
  if (effect.synergyMult) gain += (effect.synergyMult - 1) * ctx.coastPower * 0.3;
  if (effect.passiveDawnMult) gain += Math.log10(effect.passiveDawnMult) * 0.25;
  if (effect.swellMult) gain += (effect.swellMult - 1) * ctx.tidePower;
  if (effect.constellationMult) gain += (effect.constellationMult - 1) * ctx.completed * STARS.constellationBonus;

  // Lighting the last star of a constellation completes it.
  if (level <= 0 && star.constellation !== null && ctx.unlit.get(star.constellation) === 1) {
    gain += STARS.constellationBonus;
  }
  return gain;
}

/** Estimated benefit, in OoM of Light, of the next level of a star. */
export function starGain(state: GameState, index: number): number {
  return gainWith(gainContext(state), index);
}

/** Every star purchase available right now, with cost and estimated benefit. Do not mutate. */
export function starOptions(state: GameState): StructureOption[] {
  if (!state.stars.revealed) return [];
  const structure = getStructure(state);
  if (structure.options.stars === null) structure.options.stars = buildStarOptions(state);
  return structure.options.stars;
}

function buildStarOptions(state: GameState): StructureOption[] {
  const levels = state.stars.levels;
  const ctx = gainContext(state);
  const lit = starsLit(levels);
  const options: StructureOption[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const level = levels[i];
    if (level >= starMaxLevel(i)) continue;
    if (level <= 0 && !canReachStar(levels, i)) continue;
    options.push({
      action: { type: 'lightStar', star: i, count: 1 },
      cost: starCostWith(levels, i, lit),
      gain: gainWith(ctx, i),
      label: `stars.${level > 0 ? 'brighten' : 'light'}.${STARS.stars[i].id}`,
    });
  }
  return options;
}

/** Cost of the cheapest star purchase on offer. */
export function cheapestStarCost(state: GameState): Decimal {
  const structure = getStructure(state);
  if (structure.cheapest.stars === null) {
    const levels = state.stars.levels;
    const lit = starsLit(levels);
    let min: Decimal | null = null;
    for (let i = 0; i < STAR_COUNT; i++) {
      const level = levels[i];
      if (level >= starMaxLevel(i)) continue;
      if (level <= 0 && !canReachStar(levels, i)) continue;
      const cost = starCostWith(levels, i, lit);
      if (min === null || cost.lt(min)) min = cost;
    }
    structure.cheapest.stars = min ?? ZERO;
  }
  return structure.cheapest.stars;
}

/** Light an unlit star, or brighten a lit one by up to `count` levels. Returns levels gained. */
export function lightStar(state: GameState, index: number, count: number): number {
  const stars = state.stars;
  if (!stars.revealed || !Number.isInteger(index) || index < 0 || index >= STAR_COUNT) return 0;
  if (!canReachStar(stars.levels, index)) return 0;
  const wanted = Math.max(0, Math.floor(count));
  const max = starMaxLevel(index);
  let gained = 0;
  while (gained < wanted && stars.levels[index] < max) {
    const cost = starCost(stars.levels, index);
    if (cost.gt(stars.stardust)) break;
    const star = STARS.stars[index];
    const wasComplete = star.constellation !== null && constellationComplete(stars.levels, star.constellation);
    stars.stardust = stars.stardust.sub(cost);
    stars.levels[index] += 1;
    gained += 1;
    if (star.constellation !== null && !wasComplete && constellationComplete(stars.levels, star.constellation)) {
      pushEvent(state, { type: 'constellation', id: star.constellation });
    }
  }
  if (gained > 0) invalidateStructure(state);
  return gained;
}

/** Open the star map: Polaris is already shining. */
export function openStarMap(state: GameState): void {
  state.stars.revealed = true;
  if (state.stars.levels[POLARIS] <= 0) state.stars.levels[POLARIS] = 1;
  invalidateStructure(state);
}

export function canAscend(state: GameState): boolean {
  return state.stars.revealed && !starsAutomated(state) && state.stars.pending.gte(1);
}

/** Ascend: claim the gathered Stardust; Night and Dawn begin again. */
export function performAscend(state: GameState): boolean {
  if (!canAscend(state)) return false;
  const stars = state.stars;
  const gained = stars.pending;
  stars.stardust = stars.stardust.add(gained);
  stars.stardustTotal = stars.stardustTotal.add(gained);
  stars.pending = ZERO;
  stars.ascensions += 1;
  // From the first Ascension on the tides reshape themselves: nothing drawn is left waiting.
  collectTide(state);
  resetDawn(state);
  reachMilestone(state, 'firstStar');
  pushEvent(state, { type: 'ascend', stardust: gained });
  return true;
}

/** Claim any waiting Stardust without a reset (used when the star map becomes automatic). */
export function collectStardust(state: GameState): void {
  const stars = state.stars;
  if (stars.pending.lte(0)) return;
  stars.stardust = stars.stardust.add(stars.pending);
  stars.stardustTotal = stars.stardustTotal.add(stars.pending);
  stars.pending = ZERO;
}

/** Automatic charting: spends Stardust on the best-value star it can afford. */
export function runAutoStars(state: GameState): number {
  if (!starsAutomated(state)) return 0;
  let bought = 0;
  while (bought < STARS.autoChartPerBeat) {
    if (state.stars.stardust.lt(cheapestStarCost(state))) break;
    const pick = bestAffordableOption(starOptions(state), state.stars.stardust);
    if (!pick || pick.action.type !== 'lightStar') break;
    if (lightStar(state, pick.action.star, 1) <= 0) break;
    bought += 1;
  }
  if (bought > 0) pushEvent(state, { type: 'purchase', layer: 'stars', id: 'star', count: bought, auto: true });
  return bought;
}
