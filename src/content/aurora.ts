/**
 * Aurora layer balance data (endgame): challenge runs. Each one begins a fresh night under
 * a rule that bends the game, and asks for a target amount of Light within that night.
 * There is no way to fail: leaving a challenge costs nothing, and everything outside the
 * night carries on as usual.
 *
 * Levers (see BALANCE.md):
 *  - `unlockStardust` is the gate that times the Aurora.
 *  - Each completed tier grants `reward` orders of magnitude of Light, permanently.
 *  - `goals` are log10 of the Light a single night must earn, one per tier. They are set
 *    against what a player who has just unlocked the Aurora can reach in each challenge
 *    (measure it with `npx tsx sim/challenges.ts`): the first tier at about 90% of that,
 *    later tiers at about 1.15x, 1.45x, 1.85x and 2.4x.
 */
import type { NightUpgradeId } from './night';

export type ChallengeId =
  | 'bareGlass'
  | 'fogbound'
  | 'darkMoon'
  | 'lonelyShore'
  | 'shortWick'
  | 'noDawn'
  | 'emptyLanes'
  | 'starless';

export interface ChallengeRules {
  /** Night upgrades that cannot be bought (by you or the apprentice). */
  disabledNightUpgrades?: readonly NightUpgradeId[];
  /** Light per ship is raised to this power (below 1 dims everything). */
  lightPower?: number;
  /** Multiplies the chance to guide a ship. */
  guideMult?: number;
  /** Multiplies ship traffic. */
  trafficMult?: number;
  /** The moon is held at this phase. */
  lockPhase?: number;
  /** Multiplies the coastline's power; `noSynergy` also removes neighbour bonuses. */
  coastPowerMult?: number;
  noSynergy?: boolean;
  /** Multiplies the tides' power. */
  tidePowerMult?: number;
  /** Multiplies the stars' power. */
  starPowerMult?: number;
  /** Glimmer and Radiance give no multiplier. */
  noGlimmer?: boolean;
  /** The weather is held to fog for the whole challenge. */
  fog?: boolean;
}

export interface ChallengeDef {
  id: ChallengeId;
  name: string;
  /** The rule, in the player's words. */
  rule: string;
  flavor: string;
  rules: ChallengeRules;
  /** log10 of the Light one night must earn, per tier. */
  goals: readonly number[];
  /** Orders of magnitude of Light granted permanently per completed tier. */
  reward: number;
}

export const CHALLENGE_ORDER: readonly ChallengeId[] = [
  'bareGlass',
  'fogbound',
  'darkMoon',
  'lonelyShore',
  'shortWick',
  'noDawn',
  'emptyLanes',
  'starless',
];

export const AURORA = {
  /** Stardust gathered in total before the aurora answers. */
  unlockStardust: 4.9e6,
  challenges: {
    bareGlass: {
      id: 'bareGlass',
      name: 'Bare Glass',
      rule: 'No lens upgrades.',
      flavor: 'The prisms are packed in straw for the season. Light the lamp anyway.',
      rules: { disabledNightUpgrades: ['lens'] },
      goals: [560, 720, 900, 1150, 1500],
      reward: 1.5,
    },
    fogbound: {
      id: 'fogbound',
      name: 'Fogbound',
      rule: 'Permanent fog: one ship in four finds the beam, and all Light is dimmed.',
      flavor: 'You cannot see the end of the gallery rail. Somewhere out there, bells.',
      rules: { fog: true, guideMult: 0.25, lightPower: 0.85 },
      goals: [740, 940, 1190, 1520, 1970],
      reward: 1.5,
    },
    darkMoon: {
      id: 'darkMoon',
      name: 'Dark of the Moon',
      rule: 'The moon stays new, and the tides give half their power.',
      flavor: 'No silver on the water tonight, or any night, until you say so.',
      rules: { lockPhase: 0, tidePowerMult: 0.5 },
      goals: [1420, 1810, 2290, 2920, 3790],
      reward: 1.5,
    },
    lonelyShore: {
      id: 'lonelyShore',
      name: 'Lonely Shore',
      rule: 'Lighthouses do not share their beams, and the coastline gives 60% of its power.',
      flavor: 'Each keeper tends their own light and does not look along the coast.',
      rules: { noSynergy: true, coastPowerMult: 0.6 },
      goals: [990, 1270, 1600, 2040, 2640],
      reward: 1.5,
    },
    shortWick: {
      id: 'shortWick',
      name: 'Short Wick',
      rule: 'No wick upgrades.',
      flavor: 'The chandlery sent the wrong crate. One wick, trimmed to a stub.',
      rules: { disabledNightUpgrades: ['wick'] },
      goals: [685, 875, 1100, 1410, 1830],
      reward: 2,
    },
    noDawn: {
      id: 'noDawn',
      name: 'The Long Night',
      rule: 'Glimmer and Radiance give no multiplier.',
      flavor: 'A night with no memory of morning in it.',
      rules: { noGlimmer: true },
      goals: [990, 1270, 1600, 2040, 2640],
      reward: 2,
    },
    emptyLanes: {
      id: 'emptyLanes',
      name: 'Empty Lanes',
      rule: 'One ship in ten sails, and there is no oil to upgrade.',
      flavor: 'The fleet is wintering somewhere warm. The few who come, come slowly.',
      rules: { trafficMult: 0.1, disabledNightUpgrades: ['oil'] },
      goals: [580, 740, 930, 1190, 1540],
      reward: 2,
    },
    starless: {
      id: 'starless',
      name: 'Starless',
      rule: 'The stars give no power.',
      flavor: 'Cloud from horizon to horizon. Only what you built by hand still shines.',
      rules: { starPowerMult: 0 },
      goals: [1270, 1620, 2040, 2610, 3380],
      reward: 2.5,
    },
  } satisfies Record<ChallengeId, ChallengeDef> as Record<ChallengeId, ChallengeDef>,
} as const;
