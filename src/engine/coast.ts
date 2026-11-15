/**
 * Coastline layer (prestige 2): zoom out from one lamp to a whole shore.
 * Survey the coast for Stone, build lighthouses on a grid; neighbouring beams overlap.
 */
import { COAST } from '../content/coast';
import type { TerrainId } from '../content/coast';
import { D, Decimal, ZERO } from './decimal';
import { resetDawn } from './dawn';
import { pushEvent, reachMilestone } from './events';
import type { GameState, StructureOption } from './types';

export interface CoastTile {
  /** Position in CoastState.levels. */
  index: number;
  x: number;
  y: number;
  terrain: TerrainId;
  /** Indices of the tiles directly up, down, left and right. */
  neighbors: number[];
}

const TERRAIN_BY_CHAR: Record<string, TerrainId> = { '.': 'shore', '^': 'headland', '*': 'reef' };

function parseMap(): CoastTile[] {
  const tiles: CoastTile[] = [];
  const at = new Map<string, number>();
  COAST.map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const terrain = TERRAIN_BY_CHAR[ch];
      if (!terrain) return;
      at.set(`${x},${y}`, tiles.length);
      tiles.push({ index: tiles.length, x, y, terrain, neighbors: [] });
    });
  });
  for (const tile of tiles) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const other = at.get(`${tile.x + dx},${tile.y + dy}`);
      if (other !== undefined) tile.neighbors.push(other);
    }
  }
  return tiles;
}

const TILES: readonly CoastTile[] = parseMap();

/** The buildable tiles of the shore, in a fixed order. */
export function coastTiles(): readonly CoastTile[] {
  return TILES;
}

export function coastMapSize(): { width: number; height: number } {
  return { width: COAST.map[0].length, height: COAST.map.length };
}

/** Whether Dawn is tended automatically (after the first Survey). */
export function dawnAutomated(state: GameState): boolean {
  return state.coast.surveys > 0;
}

/** Whether the coastline builds itself (after the tide is first turned). */
export function coastAutomated(state: GameState): boolean {
  return state.tides.turns > 0;
}

export function lighthousesBuilt(levels: readonly number[]): number {
  let built = 0;
  for (const level of levels) if (level > 0) built += 1;
  return built;
}

/** Orders of magnitude of Light from one lighthouse on its own. */
function ownPower(tile: CoastTile, level: number): number {
  return COAST.lighthouse.powerPerLevel * COAST.terrain[tile.terrain].power * level;
}

/**
 * Orders of magnitude of Light from the whole coastline: each lighthouse's own power plus,
 * for every pair of neighbours, a synergy for each level they both have.
 */
export function coastPower(levels: readonly number[]): number {
  let power = 0;
  for (const tile of TILES) {
    const level = levels[tile.index];
    if (level <= 0) continue;
    power += ownPower(tile, level);
    for (const n of tile.neighbors) {
      if (n > tile.index) power += COAST.lighthouse.synergyPerPair * Math.min(level, levels[n]);
    }
  }
  return power;
}

/** Stone to build the next lighthouse, on the given terrain, when `built` already stand. */
export function lighthouseBuildCost(built: number, terrain: TerrainId): Decimal {
  const { base, offset, power } = COAST.lighthouse.build;
  return D(base * Math.pow(built + offset, power) * COAST.terrain[terrain].cost);
}

/** Stone to raise a lighthouse from `level` to the next. */
export function lighthouseLevelCost(level: number, terrain: TerrainId): Decimal {
  const { base, offset, power } = COAST.lighthouse.level;
  return D(base * Math.pow(level + offset, power) * COAST.terrain[terrain].cost);
}

/** Stone surveyed per second for a given Glimmer record, before multipliers. */
export function baseSurveyRate(record: number): number {
  const reach = Math.max(0, record - COAST.surveyOffset);
  return COAST.surveyRate * Math.pow(reach, COAST.surveyPower);
}

/** OoM of Light gained by building on (level 0) or raising (level > 0) a tile. */
export function lighthouseGain(levels: readonly number[], tile: CoastTile): number {
  const level = levels[tile.index];
  let gain = COAST.lighthouse.powerPerLevel * COAST.terrain[tile.terrain].power;
  for (const n of tile.neighbors) {
    if (levels[n] > level) gain += COAST.lighthouse.synergyPerPair;
  }
  return gain;
}

/** Every lighthouse purchase available, with cost and benefit. */
export function coastOptions(state: GameState): StructureOption[] {
  if (!state.coast.revealed) return [];
  const levels = state.coast.levels;
  const built = lighthousesBuilt(levels);
  const options: StructureOption[] = [];
  for (const tile of TILES) {
    const level = levels[tile.index];
    options.push({
      action: level > 0 ? { type: 'raiseLighthouse', tile: tile.index, count: 1 } : { type: 'buildLighthouse', tile: tile.index },
      cost: level > 0 ? lighthouseLevelCost(level, tile.terrain) : lighthouseBuildCost(built, tile.terrain),
      gain: lighthouseGain(levels, tile),
      label: `coast.${level > 0 ? 'raise' : 'build'}.${tile.index}`,
    });
  }
  return options;
}

/** The affordable option with the most benefit per unit of cost (ties: first listed). */
export function bestAffordableOption(options: readonly StructureOption[], budget: Decimal): StructureOption | null {
  let best: StructureOption | null = null;
  let bestScore = -Infinity;
  for (const option of options) {
    if (option.gain <= 0 || option.cost.gt(budget)) continue;
    const score = Math.log10(option.gain) - option.cost.log10();
    if (score > bestScore + 1e-12) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

/** The option with the most benefit per cost, affordable or not. */
export function bestOption(options: readonly StructureOption[]): StructureOption | null {
  let best: StructureOption | null = null;
  let bestScore = -Infinity;
  for (const option of options) {
    if (option.gain <= 0) continue;
    const score = Math.log10(option.gain) - option.cost.log10();
    if (score > bestScore + 1e-12) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

export function buildLighthouse(state: GameState, tileIndex: number): boolean {
  const coast = state.coast;
  const tile = TILES[tileIndex];
  if (!coast.revealed || !tile || coast.levels[tileIndex] > 0) return false;
  const cost = lighthouseBuildCost(lighthousesBuilt(coast.levels), tile.terrain);
  if (cost.gt(coast.stone)) return false;
  coast.stone = coast.stone.sub(cost);
  coast.levels[tileIndex] = 1;
  state.derived = null;
  return true;
}

/** Raise a lighthouse by up to `count` levels. Returns the levels gained. */
export function raiseLighthouse(state: GameState, tileIndex: number, count: number): number {
  const coast = state.coast;
  const tile = TILES[tileIndex];
  if (!coast.revealed || !tile || coast.levels[tileIndex] <= 0) return 0;
  let gained = 0;
  const wanted = Math.max(0, Math.floor(count));
  while (gained < wanted) {
    const cost = lighthouseLevelCost(coast.levels[tileIndex], tile.terrain);
    if (cost.gt(coast.stone)) break;
    coast.stone = coast.stone.sub(cost);
    coast.levels[tileIndex] += 1;
    gained += 1;
  }
  if (gained > 0) state.derived = null;
  return gained;
}

/** Whether there is surveyed Stone waiting to be brought home. */
export function canSurvey(state: GameState): boolean {
  return state.coast.revealed && !coastAutomated(state) && state.coast.pending.gte(1);
}

/** Survey the coast: bank the pending Stone; Night and Dawn begin again. */
export function performSurvey(state: GameState): boolean {
  if (!canSurvey(state)) return false;
  const coast = state.coast;
  const gained = coast.pending;
  coast.stone = coast.stone.add(gained);
  coast.stoneTotal = coast.stoneTotal.add(gained);
  coast.pending = ZERO;
  coast.surveys += 1;
  resetDawn(state);
  reachMilestone(state, 'firstCoast');
  pushEvent(state, { type: 'survey', stone: gained });
  return true;
}

/** Bring any waiting Stone home without a reset (used when the coastline becomes automatic). */
export function collectSurvey(state: GameState): void {
  const coast = state.coast;
  if (coast.pending.lte(0)) return;
  coast.stone = coast.stone.add(coast.pending);
  coast.stoneTotal = coast.stoneTotal.add(coast.pending);
  coast.pending = ZERO;
}

/** The automatic builder: spends Stone on the best-value lighthouse work it can afford. */
export function runAutoBuilder(state: GameState): number {
  if (!coastAutomated(state)) return 0;
  let bought = 0;
  while (bought < COAST.autoBuildPerBeat) {
    const pick = bestAffordableOption(coastOptions(state), state.coast.stone);
    if (!pick) break;
    const action = pick.action;
    const ok =
      action.type === 'buildLighthouse'
        ? buildLighthouse(state, action.tile)
        : action.type === 'raiseLighthouse'
          ? raiseLighthouse(state, action.tile, 1) > 0
          : false;
    if (!ok) break;
    bought += 1;
  }
  if (bought > 0) pushEvent(state, { type: 'purchase', layer: 'coast', id: 'lighthouse', count: bought, auto: true });
  return bought;
}
