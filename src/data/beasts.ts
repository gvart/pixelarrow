/**
 * Mythical beasts and world bosses (docs/DESIGN_V2.md "Mythical beasts"),
 * data-driven, all in this one file: combat numbers, footprints, signature
 * mechanics, terror auras, counters and the lair / raid tables the online
 * mode and the offline encounters build armies from.
 *
 * In battle every beast is an ordinary SimUnit of the bot side whose
 * CombatStats carry `boss: MythId` (src/sim/stats.ts derives it from the
 * class); src/sim/myth.ts runs the mechanics. Many-bodied beasts are several
 * units: the hydra is a body plus heads (each a separate hit target), the
 * kraken a body plus arms, harpies a flock. A setup without any `boss` field
 * plays exactly as before.
 *
 * The class ids (src/data/classes.ts) are the MythIds below; heroes of these
 * classes are built with `mythHeroes`.
 */
import type { Hero } from './units';

export type MythId =
  | 'hydra' | 'hydra_head'
  | 'cyclops'
  | 'harpy'
  | 'nemean_lion'
  | 'minotaur'
  | 'chimera'
  | 'kraken' | 'kraken_arm'
  | 'titan';

/** What a beast battle is fought against: a lair beast or a world boss (with its parts). */
export type EncounterId = 'hydra' | 'cyclops' | 'harpies' | 'nemean_lion' | 'minotaur' | 'chimera' | 'kraken' | 'titan';
export const LAIR_BEASTS: EncounterId[] = ['hydra', 'cyclops', 'harpies', 'nemean_lion', 'minotaur', 'chimera'];
export const WORLD_BOSSES: EncounterId[] = ['kraken', 'titan'];
export const ENCOUNTER_IDS: EncounterId[] = [...LAIR_BEASTS, ...WORLD_BOSSES];

/** Signature mechanic numbers (all optional; each beast uses its own). Times in seconds, distances in paces. */
export interface MythSpecial {
  // hydra / kraken: parts regrow
  /** A wounded head/arm not hit for this long heals (per second, fraction of max HP). */
  healDelay?: number;
  healRate?: number;
  /** A severed head regrows after this long unless the body is struck first (cauterized). */
  regrow?: number;
  /** Head/arm anchor: distance in front of the body and lateral spread. */
  neck?: number;
  spread?: number;
  // missiles (cyclops boulders, titan)
  hurlCd?: number;
  hurlMin?: number;
  hurlMax?: number;
  hurlDmg?: number;
  hurlRadius?: number;
  /** Knockback at the centre of a boulder impact (paces). */
  hurlShove?: number;
  hurlShock?: number;
  /** Boulders per throw (the titan hurls two). */
  hurlCount?: number;
  // stomp (cyclops, titan)
  stompCd?: number;
  stompRadius?: number;
  stompDmg?: number;
  /** Enemies within the stomp radius before it stamps. */
  stompMin?: number;
  // harpies
  diveCd?: number;
  diveSpeed?: number;
  strikeTime?: number;
  /** Missile damage multiplier while diving / on the ground; while circling they cannot be hit. */
  diveMissile?: number;
  // lion
  pounceCd?: number;
  pounceRange?: number;
  pounceDmg?: number;
  // minotaur
  chargeCd?: number;
  chargeSpeed?: number;
  chargeDmg?: number;
  chargeMin?: number;
  chargeMax?: number;
  // enrage (minotaur, titan)
  enrageAt?: number;
  enrageTempo?: number;
  enrageDmg?: number;
  enrageSpeed?: number;
  // chimera
  breathCd?: number;
  breathRange?: number;
  /** Cone half-width as a dot product threshold (0.5 = 60 degrees each way). */
  breathCone?: number;
  breathDmg?: number;
  burnDps?: number;
  burnTime?: number;
  goatCd?: number;
  goatTime?: number;
  goatDmg?: number;
  tailCd?: number;
  tailDmg?: number;
  // kraken arms: grab
  grabCd?: number;
  // titan: quake
  quakeCd?: number;
  quakeRadius?: number;
}

export interface MythDef {
  id: MythId;
  name: string;
  desc: string;
  /** Part of a bigger beast (a hydra head, a kraken arm): its body. */
  partOf?: MythId;
  /** Body radius in paces (a man is 0.3). */
  radius: number;
  /** Level-1 numbers (+8% HP and damage per level above, like animals). */
  hp: number;
  dmg: number;
  atkTime: number;
  reach: number;
  armor: number;
  morale: number;
  /** Speed multiplier over a man (2 paces / s walking). 0 = rooted (the kraken). */
  speed: number;
  /** Damage taken from arrows, javelins and sling stones (the lion: 0). */
  missile: number;
  /** Men within terrorRadius lose this much morale per second (less with Will, Steady Presence). */
  terror: number;
  terrorRadius: number;
  /** Shove weight against men (0 = immovable). */
  weight: number;
  /** Flies (harpies): no collisions while airborne. */
  flies?: boolean;
  sp: MythSpecial;
  /** Height of the drawn figure in pixels (tags, damage numbers, touch). */
  tall: number;
}

const D = (d: MythDef): MythDef => d;

export const MYTHS: Record<MythId, MythDef> = {
  hydra: D({
    id: 'hydra', name: 'Lernaean Hydra', desc: 'A swamp serpent of many heads. A severed head grows back unless the body is struck at once.',
    radius: 1.15, hp: 380, dmg: 18, atkTime: 2.2, reach: 0.5, armor: 4, morale: 400, speed: 0.42, missile: 0.3,
    terror: 0.39, terrorRadius: 4.5, weight: 0.02, tall: 46,
    sp: { regrow: 6, neck: 1.55, spread: 1.15, healDelay: 5, healRate: 0.1 },
  }),
  hydra_head: D({
    id: 'hydra_head', name: 'Hydra head', desc: 'Strikes on a long neck. Finish it fast, then strike the body.', partOf: 'hydra',
    radius: 0.42, hp: 72, dmg: 13, atkTime: 1.7, reach: 1.35, armor: 2, morale: 400, speed: 0, missile: 0.5,
    terror: 0.0, terrorRadius: 0, weight: 0, tall: 66,
    sp: {},
  }),
  cyclops: D({
    id: 'cyclops', name: 'Cyclops', desc: 'A one-eyed giant. Hurls boulders that scatter tight ranks and stamps on those who crowd him.',
    radius: 0.85, hp: 800, dmg: 38, atkTime: 1.9, reach: 1.25, armor: 3, morale: 400, speed: 0.62, missile: 1,
    terror: 0.35, terrorRadius: 4, weight: 0.03, tall: 60,
    sp: { hurlCd: 8, hurlMin: 4, hurlMax: 15, hurlDmg: 30, hurlRadius: 1.9, hurlShove: 1.4, hurlShock: 14, hurlCount: 1, stompCd: 7, stompRadius: 2.1, stompDmg: 16, stompMin: 3 },
  }),
  harpy: D({
    id: 'harpy', name: 'Harpy', desc: 'Winged and shrieking: dives on archers and the rear, over the front line. Easy prey for massed missiles while it dives.',
    radius: 0.34, hp: 75, dmg: 11, atkTime: 0.9, reach: 0.7, armor: 0, morale: 70, speed: 1.7, missile: 1,
    terror: 0.17, terrorRadius: 2.2, weight: 0.6, flies: true, tall: 26,
    sp: { diveCd: 5.5, diveSpeed: 9, strikeTime: 2.4, diveMissile: 1.7 },
  }),
  nemean_lion: D({
    id: 'nemean_lion', name: 'Nemean Lion', desc: 'Its golden hide turns every arrow, javelin and stone. Pounces on men standing alone. Fight it with blades.',
    radius: 0.62, hp: 640, dmg: 32, atkTime: 1.15, reach: 0.95, armor: 4, morale: 400, speed: 1.35, missile: 0,
    terror: 0.32, terrorRadius: 3.5, weight: 0.08, tall: 34,
    sp: { pounceCd: 6.5, pounceRange: 7, pounceDmg: 2.0 },
  }),
  minotaur: D({
    id: 'minotaur', name: 'Minotaur', desc: 'Bull-headed and huge: charges straight through lines. Braced spears stop the charge. Enraged when wounded.',
    radius: 0.58, hp: 540, dmg: 34, atkTime: 1.5, reach: 1.15, armor: 5, morale: 400, speed: 0.9, missile: 1,
    terror: 0.32, terrorRadius: 3.5, weight: 0.06, tall: 46,
    sp: { chargeCd: 9, chargeSpeed: 3.4, chargeDmg: 22, chargeMin: 3.5, chargeMax: 12, enrageAt: 0.35, enrageTempo: 1.5, enrageDmg: 1.25, enrageSpeed: 1.3 },
  }),
  chimera: D({
    id: 'chimera', name: 'Chimera', desc: 'Lion, goat and serpent. Breathes fire in a cone, the goat head bleats it to fury, the serpent tail strikes at flankers.',
    radius: 0.85, hp: 490, dmg: 22, atkTime: 1.4, reach: 1.1, armor: 3, morale: 400, speed: 0.85, missile: 1,
    terror: 0.35, terrorRadius: 4, weight: 0.04, tall: 44,
    sp: { breathCd: 9, breathRange: 4.6, breathCone: 0.55, breathDmg: 9, burnDps: 2.6, burnTime: 3, goatCd: 15, goatTime: 6, goatDmg: 1.3, tailCd: 2.2, tailDmg: 18 },
  }),
  kraken: D({
    id: 'kraken', name: 'Kraken', desc: 'A world boss from the deep: rooted at the shore, its arms sweep the beach. Cut the arms, then the head.',
    radius: 1.9, hp: 9000, dmg: 0, atkTime: 3, reach: 0.4, armor: 6, morale: 1000, speed: 0, missile: 0.7,
    terror: 0.42, terrorRadius: 6, weight: 0, tall: 70,
    sp: { regrow: 18, neck: 3.3, spread: 2.7, healDelay: 8, healRate: 0.05 },
  }),
  kraken_arm: D({
    id: 'kraken_arm', name: 'Kraken arm', desc: 'A sucker-lined arm that slams and drags men into the surf.', partOf: 'kraken',
    radius: 0.5, hp: 260, dmg: 30, atkTime: 2.1, reach: 1.7, armor: 3, morale: 1000, speed: 0, missile: 0.8,
    terror: 0.0, terrorRadius: 0, weight: 0, tall: 48,
    sp: { grabCd: 7 },
  }),
  titan: D({
    id: 'titan', name: 'Titan', desc: 'A world boss: a giant of the old gods. Hurls boulders two at a time, shakes the earth, rages when wounded.',
    radius: 1.35, hp: 12000, dmg: 55, atkTime: 2.2, reach: 1.6, armor: 6, morale: 1000, speed: 0.55, missile: 0.9,
    terror: 0.45, terrorRadius: 6, weight: 0.01, tall: 80,
    sp: { hurlCd: 9, hurlMin: 4, hurlMax: 16, hurlDmg: 34, hurlRadius: 2.0, hurlShove: 1.6, hurlShock: 16, hurlCount: 2, stompCd: 6, stompRadius: 2.6, stompDmg: 20, stompMin: 3, quakeCd: 22, quakeRadius: 8, enrageAt: 0.3, enrageTempo: 1.35, enrageDmg: 1.2, enrageSpeed: 1.2 },
  }),
};

export const MYTH_IDS = Object.keys(MYTHS) as MythId[];

export function isMythId(v: unknown): v is MythId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MYTHS, v);
}

// ------------------------------------------------------------------ encounters

export interface EncounterDef {
  id: EncounterId;
  /** The body (killing it ends the fight); for a flock, the flock member. */
  body: MythId;
  /** Parts (heads, arms) or flock members beyond the first. */
  parts?: { id: MythId; count: number };
  /** Flock: this many bodies, no single leader. */
  flock?: number;
  /** Level of the beast at hex tier 1..5 (lairs) / of the world boss. */
  levels: [number, number, number, number, number];
  /** What a level-appropriate army brings: heroes and their level at the base tier. */
  armySize: number;
  /** Mechanic hints (i18n keys myth.<id>.hint<n>) and recommended counters (myth.<id>.counter). */
  hints: number;
  /** Which hex types its lair favours (online placement). */
  terrain: ('hills' | 'forest' | 'ruins' | 'mine' | 'plains' | 'farmland' | 'water')[];
  /** Map colour of the lair prop and HP bar accents. */
  color: number;
  /** World boss: segment length in seconds (each clan attack is one segment). */
  segment?: number;
}

export const ENCOUNTERS: Record<EncounterId, EncounterDef> = {
  hydra: { id: 'hydra', body: 'hydra', parts: { id: 'hydra_head', count: 5 }, levels: [3, 4, 5, 6, 8], armySize: 12, hints: 3, terrain: ['forest', 'plains', 'farmland'], color: 0x3a6a66 },
  cyclops: { id: 'cyclops', body: 'cyclops', levels: [3, 4, 5, 6, 8], armySize: 12, hints: 3, terrain: ['hills', 'mine'], color: 0x8a6a4a },
  harpies: { id: 'harpies', body: 'harpy', flock: 6, levels: [2, 3, 4, 5, 7], armySize: 10, hints: 3, terrain: ['hills', 'ruins'], color: 0x6a5a7a },
  nemean_lion: { id: 'nemean_lion', body: 'nemean_lion', levels: [3, 4, 5, 6, 8], armySize: 10, hints: 3, terrain: ['hills', 'plains'], color: 0xc8962e },
  minotaur: { id: 'minotaur', body: 'minotaur', levels: [3, 4, 5, 6, 8], armySize: 10, hints: 3, terrain: ['ruins', 'mine'], color: 0x7a3a2c },
  chimera: { id: 'chimera', body: 'chimera', levels: [3, 4, 5, 6, 8], armySize: 12, hints: 3, terrain: ['ruins', 'hills', 'forest'], color: 0xb84a24 },
  kraken: { id: 'kraken', body: 'kraken', parts: { id: 'kraken_arm', count: 6 }, levels: [8, 8, 8, 8, 8], armySize: 20, hints: 3, terrain: ['water'], color: 0x2e5a6a, segment: 120 },
  titan: { id: 'titan', body: 'titan', levels: [9, 9, 9, 9, 9], armySize: 20, hints: 3, terrain: ['hills'], color: 0x7a7468, segment: 120 },
};

/** Level of a lair beast on a hex of this tier (1..5). */
export function lairLevel(enc: EncounterId, tier: number): number {
  return ENCOUNTERS[enc].levels[Math.max(1, Math.min(5, tier)) - 1];
}

/** The beast heroes of an encounter at a level: ids are `<prefix><mythId><n>` (deterministic, no RNG). */
export function mythHeroes(enc: EncounterId, level: number, prefix = 'm'): Hero[] {
  const e = ENCOUNTERS[enc];
  const out: Hero[] = [];
  const mk = (id: MythId, n: number, name: string): Hero => ({
    id: `${prefix}${id}${n}`,
    name,
    culture: 'greek',
    level: Math.max(1, Math.min(12, Math.round(level))),
    xp: 0,
    traits: [],
    look: { skin: 0, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' },
    equip: {},
    kills: 0,
    battles: 0,
    group: 0,
    attrs: { str: 9, agi: 5, end: 9, wil: 9 },
    points: 0,
    perks: [],
    wound: 0,
    cls: id,
  });
  const flock = e.flock ?? 1;
  for (let i = 0; i < flock; i++) out.push(mk(e.body, i + 1, flock > 1 ? `${MYTHS[e.body].name} ${i + 1}` : MYTHS[e.body].name));
  if (e.parts) for (let i = 0; i < e.parts.count; i++) out.push(mk(e.parts.id, i + 1, `${MYTHS[e.parts.id].name} ${i + 1}`));
  return out;
}

/** Which encounter a set of heroes is (the first beast among them), or null. */
export function encounterOf(heroes: readonly Pick<Hero, 'cls'>[]): EncounterId | null {
  for (const h of heroes) {
    switch (h.cls) {
      case 'hydra':
      case 'hydra_head':
        return 'hydra';
      case 'harpy':
        return 'harpies';
      case 'kraken':
      case 'kraken_arm':
        return 'kraken';
      default:
        if (h.cls && (ENCOUNTER_IDS as string[]).includes(h.cls)) return h.cls as EncounterId;
    }
  }
  return null;
}

/** The cosmetic trophy (an entitlement product id) for slaying a beast or world boss. */
export function trophyId(enc: EncounterId): string {
  return `trophy_${enc}`;
}

// ------------------------------------------------------------------ the sim's rules

export const MYTH_RULES = {
  /** Terror is resisted by Will: each point above 5 takes this fraction off (floor 0.3). */
  terrorWill: 0.09,
  /** Steady Presence halves the terror of beasts. */
  terrorSteady: 0.5,
  /** Morale shock of a beast's blows on the men around the victim. */
  blowShock: 1,
  /** Morale damage of a beast's blow per point of damage, relative to a man's (pain, not panic: terror does the rest). */
  blowMorale: 0.6,
  /** A braced spear wall stops a minotaur charge: stun (ticks) and the counter-thrust. */
  braceStun: 44,
  braceCounter: 2.6,
};

// ------------------------------------------------------------------ the war horn (a battle consumable)

export const HORN_RULES = {
  /** Morale restored to every man (fraction of his max), routing men rally at least to this. */
  morale: 0.4,
  rallyTo: 0.75,
  stamina: 15,
};
