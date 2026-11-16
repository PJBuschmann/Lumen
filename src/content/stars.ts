/**
 * Constellations layer balance data (prestige 4): lighthouses become stars on a map,
 * guiding ships between worlds.
 *
 * The map is a skill tree: Polaris at the centre, four inner constellations around it and
 * eight outer ones beyond. A star can only be lit next to a star that is already lit.
 * Lighting every star of a constellation completes it for a bonus.
 *
 * Levers (see BALANCE.md):
 *  - `revealTide` is the gate that times the first Constellation.
 *  - Stardust drifts in at `driftRate * (tide power - driftOffset) ^ driftPower` per second.
 *  - `beaconPower` is the OoM of Light per beacon level; star costs are polynomials.
 */

export type StarKind = 'beacon' | 'quarry' | 'current' | 'dust' | 'ember' | 'lane' | 'keystone';

/** What one level of a star does. Fractions add up as (1 + sum); the rest are noted. */
export interface StarEffect {
  /** Orders of magnitude of Light. */
  lightPower?: number;
  /** +fraction of Stone income. */
  stone?: number;
  /** +fraction of Tide income. */
  tide?: number;
  /** +fraction of Stardust income. */
  dust?: number;
  /** Orders of magnitude of Glimmer gain. */
  glimmerLog?: number;
  /** +fraction of ship traffic. */
  traffic?: number;
  /** Keystones: multiplies the power of every beacon star. */
  beaconMult?: number;
  /** Keystones: multiplies lighthouse neighbour synergy. */
  synergyMult?: number;
  /** Keystones: added to the Swell resonance of the phase in the sky. */
  resonance?: number;
  /** Keystones: multiplies the share of Dawn that flows in each second. */
  passiveDawnMult?: number;
  /** Keystones: added to the long-night exponent. */
  vigil?: number;
  /** Keystones: multiplies the power of every Swell level. */
  swellMult?: number;
  /** Keystones: multiplies constellation completion bonuses. */
  constellationMult?: number;
}

export interface StarKindDef {
  kind: StarKind;
  label: string;
  description: string;
  maxLevel: number | null;
  /** Multiplies the Stardust cost of this star. */
  cost: number;
  effect: StarEffect;
}

export interface ConstellationDef {
  id: string;
  name: string;
  story: string;
  /** Kinds of its two "special" stars. */
  specials: [StarKind, StarKind];
  keystone: { name: string; description: string; effect: StarEffect };
}

export interface StarDef {
  id: string;
  name: string;
  /** null for Polaris. */
  constellation: string | null;
  kind: StarKind;
  /** Map position, roughly within -1000..1000 on both axes. */
  x: number;
  y: number;
  /** Ids of linked stars (links are two-way). */
  links: string[];
  /** Keystones only. */
  keystoneEffect?: StarEffect;
  description: string;
}

const KINDS: Record<StarKind, StarKindDef> = {
  beacon: {
    kind: 'beacon',
    label: 'Beacon star',
    description: 'A steady light between worlds. Adds orders of magnitude of Light per level.',
    maxLevel: null,
    cost: 1,
    effect: { lightPower: 0.03 },
  },
  quarry: {
    kind: 'quarry',
    label: 'Quarry star',
    description: 'Its pull loosens the cliffs. +2% Stone per level.',
    maxLevel: 10,
    cost: 2,
    effect: { stone: 0.02 },
  },
  current: {
    kind: 'current',
    label: 'Current star',
    description: 'It tugs at the sea. +2% Tide per level.',
    maxLevel: 10,
    cost: 2,
    effect: { tide: 0.02 },
  },
  dust: {
    kind: 'dust',
    label: 'Dust star',
    description: 'It sheds as it burns. +2% Stardust per level.',
    maxLevel: 10,
    cost: 2,
    effect: { dust: 0.02 },
  },
  ember: {
    kind: 'ember',
    label: 'Ember star',
    description: 'A dawn that never quite ends. x2 Glimmer per level.',
    maxLevel: 10,
    cost: 2,
    effect: { glimmerLog: Math.log10(2) },
  },
  lane: {
    kind: 'lane',
    label: 'Lane star',
    description: 'Captains steer by it. +10% ships per level.',
    maxLevel: 10,
    cost: 2,
    effect: { traffic: 0.1 },
  },
  keystone: {
    kind: 'keystone',
    label: 'Keystone',
    description: 'The heart of its constellation. Lit once.',
    maxLevel: 1,
    cost: 12,
    effect: {},
  },
};

const CONSTELLATIONS: readonly ConstellationDef[] = [
  // Inner ring
  {
    id: 'lantern',
    name: 'The Lantern',
    story: 'The first shape every keeper learns: a lamp held up against the dark.',
    specials: ['ember', 'lane'],
    keystone: { name: 'Bright Heart', description: 'Every beacon star shines 25% stronger.', effect: { beaconMult: 1.25 } },
  },
  {
    id: 'anchor',
    name: 'The Anchor',
    story: 'It never rises far above the horizon. Sailors say it holds the sea in place.',
    specials: ['quarry', 'current'],
    keystone: { name: 'Harbor Bell', description: 'Neighbouring lighthouses share 50% more.', effect: { synergyMult: 1.5 } },
  },
  {
    id: 'gull',
    name: 'The Gull',
    story: 'Two wings and a tail. Where it points, there is always a ship.',
    specials: ['lane', 'dust'],
    keystone: { name: 'Trade Winds', description: '+50% ships on every sea.', effect: { traffic: 0.5 } },
  },
  {
    id: 'bell',
    name: 'The Bell',
    story: 'On still nights you can almost hear it.',
    specials: ['current', 'ember'],
    keystone: { name: 'Spring Tide', description: 'The phase in the sky counts its Swell once more.', effect: { resonance: 1 } },
  },
  // Outer ring
  {
    id: 'keeper',
    name: 'The Keeper',
    story: 'A figure with one arm raised. Nobody agrees who it was.',
    specials: ['dust', 'quarry'],
    keystone: { name: 'Second Lamp', description: 'Dawn flows in three times as fast.', effect: { passiveDawnMult: 3 } },
  },
  {
    id: 'whale',
    name: 'The Whale',
    story: 'It takes all winter to cross the sky, and is in no hurry.',
    specials: ['current', 'lane'],
    keystone: { name: 'Deep Current', description: '+20% Tide.', effect: { tide: 0.2 } },
  },
  {
    id: 'compass',
    name: 'The Compass',
    story: 'Four stars and a wandering fifth that never quite settles on north.',
    specials: ['dust', 'ember'],
    keystone: { name: 'True North', description: 'Completed constellations give 50% more.', effect: { constellationMult: 1.5 } },
  },
  {
    id: 'kettle',
    name: 'The Kettle',
    story: 'Named on a cold night by someone who wanted to be indoors.',
    specials: ['quarry', 'lane'],
    keystone: { name: 'Warm Stone', description: '+20% Stone.', effect: { stone: 0.2 } },
  },
  {
    id: 'moth',
    name: 'The Moth',
    story: 'It circles the Lantern all year and never arrives.',
    specials: ['ember', 'dust'],
    keystone: { name: 'Vigil Star', description: 'Long nights brighten the dawn far more.', effect: { vigil: 0.5 } },
  },
  {
    id: 'tide',
    name: 'The Tide',
    story: 'A long low curve of stars, like a wave that has not broken yet.',
    specials: ['current', 'quarry'],
    keystone: { name: 'Flood Tide', description: 'Every Swell level is worth 25% more.', effect: { swellMult: 1.25 } },
  },
  {
    id: 'wick',
    name: 'The Wick',
    story: 'One bright star above a thin straight line. Trim it and it burns clean.',
    specials: ['ember', 'current'],
    keystone: { name: 'Everflame', description: 'A thousand times the Glimmer.', effect: { glimmerLog: 3 } },
  },
  {
    id: 'harbor',
    name: 'The Harbor',
    story: 'A ring with a gap in it. Every ship in the sky seems to be heading there.',
    specials: ['quarry', 'dust'],
    keystone: { name: 'Stardust Veil', description: '+20% Stardust.', effect: { dust: 0.2 } },
  },
];

/**
 * Star shapes: seven points and the links between them. Point 0 is where the constellation
 * joins the rest of the map; point 6 is its keystone.
 */
const SHAPES: readonly { points: readonly [number, number][]; links: readonly [number, number][] }[] = [
  // A lantern: handle, frame, flame at the centre.
  { points: [[0, 95], [-55, 30], [55, 30], [-45, -55], [45, -55], [0, -110], [0, -15]], links: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 6], [2, 6]] },
  // A hook: a long shank that curls.
  { points: [[0, 110], [-10, 40], [-5, -30], [35, -85], [90, -75], [105, -20], [45, -15]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [2, 6]] },
  // Wings: a body with two swept arms.
  { points: [[0, 100], [0, 25], [-70, -15], [70, -15], [-125, -70], [125, -70], [0, -60]], links: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [1, 6]] },
  // A bowl: a curve with a star resting in it.
  { points: [[-110, -10], [-70, 55], [-10, 85], [55, 60], [100, 0], [50, -65], [0, 5]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [3, 6]] },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const INNER = 4;
const INNER_RADIUS = 300;
const OUTER_RADIUS = 660;

function buildStars(): StarDef[] {
  const stars: StarDef[] = [
    {
      id: 'polaris',
      name: 'Polaris',
      constellation: null,
      kind: 'beacon',
      x: 0,
      y: 0,
      links: [],
      description: 'The star that does not move. Every chart begins here.',
    },
  ];
  const link = (a: string, b: string) => {
    const sa = stars.find((s) => s.id === a);
    const sb = stars.find((s) => s.id === b);
    if (!sa || !sb) throw new Error(`Star map link to unknown star: ${a} - ${b}`);
    if (!sa.links.includes(b)) sa.links.push(b);
    if (!sb.links.includes(a)) sb.links.push(a);
  };

  CONSTELLATIONS.forEach((constellation, index) => {
    const inner = index < INNER;
    const slot = inner ? index : index - INNER;
    const count = inner ? INNER : CONSTELLATIONS.length - INNER;
    const angle = (slot / count) * Math.PI * 2 + (inner ? Math.PI / 4 : Math.PI / 8);
    const radius = inner ? INNER_RADIUS : OUTER_RADIUS;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    const shape = SHAPES[index % SHAPES.length];
    // Turn each shape so its joining point faces the centre of the map.
    const turn = angle - Math.PI / 2;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const scale = inner ? 0.9 : 1.15;

    shape.points.forEach(([px, py], i) => {
      const kind: StarKind = i === 6 ? 'keystone' : i === 2 ? constellation.specials[0] : i === 4 ? constellation.specials[1] : 'beacon';
      stars.push({
        id: `${constellation.id}-${i + 1}`,
        name: i === 6 ? constellation.keystone.name : `${constellation.name.replace('The ', '')} ${ROMAN[i]}`,
        constellation: constellation.id,
        kind,
        x: Math.round(cx + (px * cos - py * sin) * scale),
        y: Math.round(cy + (px * sin + py * cos) * scale),
        links: [],
        keystoneEffect: i === 6 ? constellation.keystone.effect : undefined,
        description: i === 6 ? constellation.keystone.description : KINDS[kind].description,
      });
    });
    for (const [a, b] of shape.links) link(`${constellation.id}-${a + 1}`, `${constellation.id}-${b + 1}`);
  });

  // Inner constellations hang from Polaris; each outer one hangs from the inner one before it.
  CONSTELLATIONS.forEach((constellation, index) => {
    if (index < INNER) {
      link('polaris', `${constellation.id}-1`);
    } else {
      const parent = CONSTELLATIONS[Math.floor((index - INNER) / 2)];
      link(`${parent.id}-${index % 2 === 0 ? 4 : 5}`, `${constellation.id}-1`);
    }
  });
  // A ring of bridges between neighbouring outer constellations, so there is more than one road.
  for (let i = INNER; i < CONSTELLATIONS.length; i++) {
    const next = INNER + ((i - INNER + 1) % (CONSTELLATIONS.length - INNER));
    link(`${CONSTELLATIONS[i].id}-6`, `${CONSTELLATIONS[next].id}-2`);
  }
  return stars;
}

export const STARS = {
  /** Tide drawn in total before the stars can be charted. */
  revealTide: 6.6e6,
  /** Stardust per second = driftRate * max(0, tide power - driftOffset) ^ driftPower. */
  driftRate: 0.0065,
  driftOffset: 0,
  driftPower: 2,
  /** OoM of Light for each completed constellation. */
  constellationBonus: 0.5,
  /** OoM of Light Polaris gives on its own, the moment the map opens. */
  polarisPower: 0.25,
  /** Stardust to light star number n (0-based, Polaris excluded): base * (n + offset) ^ power * kind cost. */
  light: { base: 2, offset: 12, power: 2 },
  /** Stardust to brighten a star from level l: base * (l + offset) ^ power * kind cost. */
  brighten: { base: 2, offset: 12, power: 2 },
  /** Most star purchases the automatic charting makes in one heartbeat. */
  autoChartPerBeat: 25,
  kinds: KINDS,
  constellations: CONSTELLATIONS,
  stars: buildStars() as readonly StarDef[],
} as const;

export const STAR_COUNT = STARS.stars.length;
