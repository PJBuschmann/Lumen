/**
 * Tides layer balance data (prestige 3): the moon cycles ship traffic and multipliers;
 * Tide is spent to reshape the cycle.
 *
 * Levers (see BALANCE.md):
 *  - `revealStone` is the gate that times the first Tides.
 *  - Tide is drawn at `pullRate * (coast power - pullOffset) ^ pullPower * traffic` per second.
 *  - Each Swell level adds `powerPerLevel` OoM of Light at all times, and `resonance` times
 *    that again while its own phase is in the sky.
 *  - Linger stretches a phase. Stretching busy phases raises the average Tide income.
 */

export interface MoonPhaseDef {
  id: string;
  name: string;
  /** Multiplies ships per second (and Tide drawn) while this phase is in the sky. */
  traffic: number;
  /** Multiplies Light per ship while this phase is in the sky. */
  glow: number;
  flavor: string;
}

export const TIDES = {
  /** Stone surveyed in total before the tides can be read. */
  revealStone: 42000,
  /** Seconds each phase lasts before any Linger. Eight phases make one moon. */
  phaseSeconds: 90,
  phases: [
    { id: 'new', name: 'New moon', traffic: 0.6, glow: 2.0, flavor: 'The darkest nights. Few sail, and every beam is precious.' },
    { id: 'waxingCrescent', name: 'Waxing crescent', traffic: 0.8, glow: 1.5, flavor: 'A sliver of silver. The lanes begin to fill.' },
    { id: 'firstQuarter', name: 'First quarter', traffic: 1.0, glow: 1.0, flavor: 'Neap tide. The sea holds still and even.' },
    { id: 'waxingGibbous', name: 'Waxing gibbous', traffic: 1.3, glow: 0.8, flavor: 'Bright water, busy water.' },
    { id: 'full', name: 'Full moon', traffic: 1.6, glow: 0.6, flavor: 'Spring tide. The whole fleet is out under a second lamp.' },
    { id: 'waningGibbous', name: 'Waning gibbous', traffic: 1.3, glow: 0.8, flavor: 'The crowd thins, unhurried.' },
    { id: 'lastQuarter', name: 'Last quarter', traffic: 1.0, glow: 1.0, flavor: 'Neap tide again. A breath between swells.' },
    { id: 'waningCrescent', name: 'Waning crescent', traffic: 0.8, glow: 1.5, flavor: 'The night deepens toward the dark of the moon.' },
  ] satisfies readonly MoonPhaseDef[] as readonly MoonPhaseDef[],
  /** Tide per second = pullRate * max(0, coast power - pullOffset) ^ pullPower * phase traffic. */
  pullRate: 0.004,
  pullOffset: 0,
  pullPower: 2,
  swell: {
    /** Orders of magnitude of Light per Swell level, at all times. */
    powerPerLevel: 0.04,
    /** Extra multiple of a phase's own Swell that applies while that phase is in the sky. */
    resonance: 1,
    /** Tide to raise a phase's Swell from level s: base * (s + offset) ^ power. */
    cost: { base: 2, offset: 2, power: 2 },
  },
  linger: {
    /** Each level lengthens the phase by this fraction of the base duration. */
    step: 0.5,
    maxLevel: 4,
    /** Tide for Linger level l on a phase: base * ratio ^ l. */
    cost: { base: 40, ratio: 5 },
  },
  /** Most reshaping purchases the automatic tide-reader makes in one heartbeat. */
  autoShapePerBeat: 25,
} as const;

export const PHASE_COUNT = TIDES.phases.length;
