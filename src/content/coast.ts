/**
 * Coastline layer balance data (prestige 2): survey the shore, build lighthouses on a grid.
 *
 * Levers (see BALANCE.md):
 *  - `revealGlimmer` is the gate that times the first Coastline.
 *  - Stone is surveyed at `surveyRate * (record - surveyOffset) ^ surveyPower` per second, where
 *    "record" is the highest log10(Glimmer) ever held. Costs grow as a polynomial of the same
 *    power, so lighthouses keep arriving at a steady pace instead of hitting a wall.
 *  - `powerPerLevel` / `synergyPerPair` are orders of magnitude of Light per lighthouse level
 *    and per pair of neighbouring beams. They set how many OoM a day of coast-building is worth.
 */

export type TerrainId = 'shore' | 'headland' | 'reef';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  description: string;
  /** Multiplies the power of a lighthouse built here. */
  power: number;
  /** Multiplies the Stone cost of building and raising it. */
  cost: number;
}

export const COAST = {
  /** Glimmer gathered in one run that brings the coastline into view. */
  revealGlimmer: 1340,
  /** Stone per second = surveyRate * max(0, record - surveyOffset) ^ surveyPower. */
  surveyRate: 0.0107,
  surveyOffset: 1.5,
  surveyPower: 2,
  /** Once Dawn is tended for you, this share of a Dawn's Glimmer arrives every second. */
  passiveDawnShare: 0.01,
  /**
   * The shore, north at the top. '~' open sea, '.' shore, '^' headland, '*' reef.
   * Lighthouses on tiles that touch (up, down, left, right) overlap their beams.
   */
  map: [
    '~~^..~~',
    '~..*.^~',
    '^.~~..~',
    '~..*..^',
    '~~^..~~',
  ],
  terrain: {
    shore: {
      id: 'shore',
      name: 'Shore',
      description: 'Level ground by the water. An honest place for a light.',
      power: 1,
      cost: 1,
    },
    headland: {
      id: 'headland',
      name: 'Headland',
      description: 'High ground: the beam carries further. x1.5 power, x2 cost.',
      power: 1.5,
      cost: 2,
    },
    reef: {
      id: 'reef',
      name: 'Reef',
      description: 'Where ships need a light most. x2 power, x4 cost.',
      power: 2,
      cost: 4,
    },
  } satisfies Record<TerrainId, TerrainDef> as Record<TerrainId, TerrainDef>,
  lighthouse: {
    /** Orders of magnitude of Light per level (before terrain). */
    powerPerLevel: 0.0125,
    /** Extra OoM for each pair of neighbouring lighthouses, per level they share. */
    synergyPerPair: 0.005,
    /** Stone to build lighthouse number n (0-based): base * (n + offset) ^ power * terrain cost. */
    build: { base: 1.3, offset: 2, power: 0.5 },
    /** Stone to raise a lighthouse from level l: base * (l + offset) ^ power * terrain cost. */
    level: { base: 1.5, offset: 1.2, power: 2 },
  },
  /** Most lighthouse purchases the automatic builder makes in one heartbeat. */
  autoBuildPerBeat: 25,
} as const;
