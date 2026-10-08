/** Hero and item factories (campaign layer, deterministic given an Rng). */
import { itemDef, type Item, type ItemPaint, type Rarity } from '../data/items';
import { NAMES, freeName, type Culture } from '../data/names';
import { POSITIVE_TRAITS, type TraitId } from '../data/traits';
import { MAX_LEVEL, TUNIC_COLORS, xpToNext, type Hero, type Look } from '../data/units';
import {
  ATTR_IDS, ATTR_MAX, POINTS_PER_LEVEL, heroTree, perkBlocker, perkSlots,
  type AttrId, type Attrs,
} from '../data/perks';
import { CLASSES, LEGACY_ARCH, classOfHero, isClassId, type ClassDef, type ClassId } from '../data/classes';
import { Rng } from '../sim/rng';

export interface IdSource {
  nextId: number;
}

export function newId(ids: IdSource, prefix: string): string {
  return `${prefix}${(ids.nextId++).toString(36)}`;
}

export const EMBLEMS = ['lambda', 'owl', 'horse', 'trident', 'sunwheel', 'lion', 'eye', 'scorpion', 'boar', 'crescent', 'club', 'star'] as const;
export type Emblem = (typeof EMBLEMS)[number];

const CULTURE_EMBLEMS: Record<Culture, Emblem[]> = {
  greek: ['lambda', 'owl', 'trident', 'club', 'star', 'scorpion', 'lion'],
  phoenician: ['crescent', 'eye', 'horse', 'sunwheel', 'lion', 'trident'],
  celtic: ['boar', 'sunwheel', 'horse', 'eye', 'crescent'],
};

const FIELD_INK: [string, string[]][] = [
  ['bronze', ['ink', 'red']],
  ['cream', ['ink', 'red']],
  ['red', ['ink', 'cream']],
  ['ink', ['cream', 'red', 'bronze']],
  ['blue', ['cream', 'bronze']],
];

export function shieldPaint(rng: Rng, culture: Culture, emblem?: Emblem, field?: string): ItemPaint {
  const fi = field ? FIELD_INK.find(([f]) => f === field) ?? rng.pick(FIELD_INK) : rng.pick(FIELD_INK);
  return { emblem: emblem ?? rng.pick(CULTURE_EMBLEMS[culture]), field: fi[0], ink: rng.pick(fi[1]) };
}

export function crestPaint(rng: Rng): ItemPaint {
  return { field: rng.pick(['red', 'ink', 'cream', 'red']) };
}

export function makeItem(rng: Rng, ids: IdSource, defId: string, rarity: Rarity = 'common', cond = 100, culture: Culture = 'greek', paint?: ItemPaint): Item {
  const def = itemDef(defId);
  const item: Item = { uid: newId(ids, 'i'), def: defId, rarity, cond: Math.round(cond) };
  if (paint) item.paint = paint;
  else if (def.slot === 'shield') item.paint = shieldPaint(rng, culture);
  else if (def.slot === 'helmet' && (defId === 'corinthian' || defId === 'chalcidian' || defId === 'montefortino')) item.paint = crestPaint(rng);
  return item;
}

export function randomLook(rng: Rng, culture: Culture): Look {
  const skinW: [number, number][] =
    culture === 'celtic' ? [[0, 5], [1, 3], [2, 1]] : culture === 'phoenician' ? [[1, 2], [2, 4], [3, 3]] : [[0, 1], [1, 4], [2, 3], [3, 1]];
  const hairW: [number, number][] = culture === 'celtic' ? [[1, 2], [2, 3], [3, 4]] : [[0, 5], [1, 4], [2, 1]];
  const tunics = culture === 'celtic' ? ['tunicGreen', 'tunicOchre', 'tunicRed', 'tunicBlue'] : culture === 'phoenician' ? ['tunicRed', 'tunicWhite', 'tunicOchre'] : [...TUNIC_COLORS];
  return {
    skin: rng.weighted(skinW),
    hair: rng.weighted(hairW),
    hairStyle: rng.weighted([[0, 5], [1, culture === 'celtic' ? 5 : 2], [2, 1]]),
    beard: rng.weighted([[0, 3], [1, 3], [2, culture === 'celtic' ? 1 : 3]]),
    tunic: rng.pick(tunics),
  };
}

/**
 * What a hero is raised as: a unit class (src/data/classes.ts), or one of the
 * archetype names from before classes (mapped through LEGACY_ARCH).
 */
export type Archetype = ClassId | 'swordsman' | 'axeman' | 'raw';

export function toClass(a: string | undefined): ClassId {
  if (isClassId(a)) return a;
  return LEGACY_ARCH[a ?? 'raw'] ?? 'militia';
}

function heroCls(h: Hero): ClassDef {
  return CLASSES[classOfHero({ cls: h.cls, arch: h.arch, culture: h.culture, weaponDef: h.equip.weapon?.def })];
}

/** Rolled starting attributes: the class spread with a little personal variation. */
export function rollAttrs(rng: Rng, arch: Archetype): Attrs {
  const a = { ...CLASSES[toClass(arch)].attrs };
  for (let i = 0; i < 2; i++) {
    const up = rng.pick(ATTR_IDS);
    const down = rng.pick(ATTR_IDS);
    if (up === down || a[down] <= 3 || a[up] >= 8) continue;
    a[up]++;
    a[down]--;
  }
  return a;
}

/** Spend unspent points and free perk slots the way the hero's class would. */
export function autoDevelop(h: Hero): void {
  const c = heroCls(h);
  const order: AttrId[] = c.growth.length ? c.growth : ['end', 'str', 'agi', 'wil'];
  let i = ATTR_IDS.reduce((acc, k) => acc + h.attrs[k], 0);
  let guard = 0;
  while (h.points > 0 && guard++ < 200) {
    const k = order[i++ % order.length];
    if (h.attrs[k] >= ATTR_MAX) continue;
    h.attrs[k]++;
    h.points--;
  }
  pickPerks(h);
}

/** Take the next perks down the hero's class tree. */
function pickPerks(h: Hero): void {
  const cls = heroCls(h).id;
  for (const id of heroTree({ cls })) {
    if (h.perks.length >= perkSlots(h.level)) break;
    if (perkBlocker({ level: h.level, perks: h.perks, cls }, id) === null) h.perks.push(id);
  }
}

/** Bot heroes: attributes and perks follow from class and level alone. */
export function setBotLevel(h: Hero, level: number): void {
  h.level = Math.max(1, Math.min(MAX_LEVEL, level));
  h.attrs = { ...heroCls(h).attrs };
  h.points = (h.level - 1) * POINTS_PER_LEVEL;
  h.perks = [];
  autoDevelop(h);
}

export function rollRarity(rng: Rng, tier: number): Rarity {
  const t = Math.max(1, Math.min(3, tier));
  const table: [Rarity, number][][] = [
    [['common', 85], ['uncommon', 14], ['rare', 1]],
    [['common', 55], ['uncommon', 35], ['rare', 9], ['epic', 1]],
    [['common', 30], ['uncommon', 40], ['rare', 25], ['epic', 5]],
  ];
  return rng.weighted(table[t - 1]);
}

/** Loot of mythical beasts and world bosses: the only regular source of Legendary gear. */
export function rollBeastRarity(rng: Rng): Rarity {
  return rng.weighted<Rarity>([['rare', 50], ['epic', 35], ['legendary', 15]]);
}

/**
 * Create a hero of a class (or legacy archetype). `roster` lists heroes
 * already in the same army: the new hero's name will differ from all of
 * theirs. `group` defaults to the class's battle group.
 */
export function makeHero(rng: Rng, ids: IdSource, culture: Culture, archetype: Archetype, level: number, tier: number, group?: number, roster: readonly { name: string }[] = []): Hero {
  const clsId = toClass(archetype);
  const cls = CLASSES[clsId];
  const beast = cls.kind === 'animal';
  const taken = new Set(roster.map((h) => h.name));
  let name: string;
  if (beast) {
    name = cls.name;
    for (let k = 2; taken.has(name); k++) name = `${cls.name} ${k}`;
  } else name = freeName(culture, rng.int(0, NAMES[culture].length - 1), taken);
  const traits: TraitId[] = [];
  const tCount = beast ? 0 : clsId === 'militia' ? (rng.chance(0.5) ? 1 : 0) : rng.chance(0.35) ? 2 : 1;
  while (traits.length < tCount) {
    const t = rng.chance(0.12) ? 'skittish' : rng.pick(POSITIVE_TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }
  const look = randomLook(rng, culture);
  if (cls.art.tunics?.length) look.tunic = rng.pick(cls.art.tunics);
  const hero: Hero = {
    id: newId(ids, 'h'),
    name,
    culture,
    level: Math.max(1, Math.min(MAX_LEVEL, level)),
    xp: 0,
    traits,
    look,
    equip: {},
    kills: 0,
    battles: 0,
    group: group ?? cls.group,
    attrs: rollAttrs(rng, clsId),
    points: 0,
    perks: [],
    wound: 0,
    cls: clsId,
  };
  hero.points = (hero.level - 1) * POINTS_PER_LEVEL;
  if (hero.level > 1) autoDevelop(hero);
  if (beast) return hero;
  const t = Math.max(1, Math.min(3, tier));
  const levy = clsId === 'militia';
  for (const slot of ['weapon', 'shield', 'helmet', 'armor'] as const) {
    const options = cls.kit[slot]?.[t - 1];
    if (!options || options.length === 0) continue;
    const defId = rng.pick(options);
    if (!defId) continue;
    // a shield only with a one-handed weapon
    if (slot === 'shield' && hero.equip.weapon && itemDef(hero.equip.weapon.def).twoHanded) continue;
    hero.equip[slot] = makeItem(rng, ids, defId, levy ? 'common' : rollRarity(rng, t), levy ? rng.range(45, 80) : rng.range(55, 100), culture);
  }
  if (!levy && t >= 2 && rng.chance(0.15 * t)) {
    hero.equip.trinket = makeItem(rng, ids, rng.pick(['owl_amulet', 'herakles_knot', 'scarab', 'laurel', 'tanit_eye', 'boar_tusk']), rollRarity(rng, t - 1), 100, culture);
  }
  return hero;
}

/** Grant XP; returns number of levels gained. May grant a new trait at levels 3, 5 and 8. */
export function grantXp(hero: Hero, xp: number, rng: Rng): number {
  hero.xp += Math.round(xp);
  let gained = 0;
  while (hero.level < MAX_LEVEL && hero.xp >= xpToNext(hero.level)) {
    hero.xp -= xpToNext(hero.level);
    hero.level++;
    hero.points = (hero.points ?? 0) + POINTS_PER_LEVEL;
    gained++;
    if ([3, 5, 8].includes(hero.level)) {
      const i = hero.traits.indexOf('skittish');
      if (i >= 0) hero.traits[i] = 'steady';
      else if (hero.traits.length < 2) {
        const options = POSITIVE_TRAITS.filter((t) => !hero.traits.includes(t));
        if (options.length) hero.traits.push(rng.pick(options));
      }
    }
  }
  if (hero.level >= MAX_LEVEL) hero.xp = Math.min(hero.xp, xpToNext(hero.level));
  return gained;
}

/**
 * The ten-man army of the first milestone: six hoplites, a swordsman, two
 * peltasts and a slinger. Used as the balance harness's reference army and for
 * skirmish tests; a new campaign starts with `starterParty` instead.
 */
export function standardArmy(rng: Rng, ids: IdSource): Hero[] {
  const heroes: Hero[] = [];
  for (let i = 0; i < 6; i++) heroes.push(makeHero(rng, ids, 'greek', 'hoplite', 1, 1, 0, heroes));
  heroes.push(makeHero(rng, ids, 'greek', 'swordsman', 1, 1, 0, heroes));
  for (let i = 0; i < 2; i++) heroes.push(makeHero(rng, ids, 'greek', 'peltast', 1, 1, 1, heroes));
  heroes.push(makeHero(rng, ids, 'phoenician', 'slinger', 1, 1, 1, heroes));
  paintPhalanx(rng, heroes);
  heroes[0].traits = ['veteran'];
  heroes[0].level = 2;
  heroes[0].points = 2;
  return heroes;
}

/** A new campaign: a veteran hoplite, a young hoplite and a peltast. */
export function starterParty(rng: Rng, ids: IdSource): Hero[] {
  const heroes: Hero[] = [];
  heroes.push(makeHero(rng, ids, 'greek', 'hoplite', 1, 1, 0, heroes));
  heroes.push(makeHero(rng, ids, 'greek', 'hoplite', 1, 1, 0, heroes));
  heroes.push(makeHero(rng, ids, 'greek', 'peltast', 1, 1, 1, heroes));
  paintPhalanx(rng, heroes);
  heroes[0].traits = ['veteran'];
  heroes[0].level = 2;
  heroes[0].points = 2;
  return heroes;
}

/** Give the phalanx a shared emblem: the lambda of the old city. */
function paintPhalanx(rng: Rng, heroes: Hero[]): void {
  const field = rng.pick(['bronze', 'cream', 'red']);
  for (const h of heroes) {
    if (h.equip.shield && itemDef(h.equip.shield.def).shieldKind === 'hoplon') {
      h.equip.shield.paint = shieldPaint(rng, 'greek', rng.chance(0.7) ? 'lambda' : undefined, field);
    }
  }
}
