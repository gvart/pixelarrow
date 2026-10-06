/** Hero and item factories (campaign layer, deterministic given an Rng). */
import { itemDef, type Item, type ItemPaint, type Rarity, type Slot } from '../data/items';
import { NAMES, freeName, type Culture } from '../data/names';
import { POSITIVE_TRAITS, type TraitId } from '../data/traits';
import { MAX_LEVEL, TUNIC_COLORS, xpToNext, type Hero, type Look } from '../data/units';
import {
  ATTR_IDS, ATTR_MAX, POINTS_PER_LEVEL, perkBlocker, perkSlots, treePerks,
  type AttrId, type Attrs, type TreeId,
} from '../data/perks';
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

export type Archetype = 'hoplite' | 'swordsman' | 'axeman' | 'peltast' | 'slinger' | 'archer' | 'raw';

/** Starting attributes by archetype (sum 20; 5 is neutral). */
const ARCH_ATTRS: Record<Archetype, Attrs> = {
  hoplite: { str: 5, agi: 4, end: 6, wil: 5 },
  swordsman: { str: 6, agi: 5, end: 5, wil: 4 },
  axeman: { str: 7, agi: 4, end: 5, wil: 4 },
  peltast: { str: 4, agi: 6, end: 5, wil: 5 },
  slinger: { str: 4, agi: 7, end: 4, wil: 5 },
  archer: { str: 4, agi: 7, end: 4, wil: 5 },
  raw: { str: 5, agi: 5, end: 5, wil: 5 },
};

/** Where an archetype spends its level-up points (cycled), and which perk tree it follows. */
const ARCH_GROWTH: Record<Archetype, { order: AttrId[]; tree: TreeId }> = {
  hoplite: { order: ['end', 'str', 'wil', 'end', 'str', 'agi'], tree: 'hoplite' },
  swordsman: { order: ['str', 'agi', 'end', 'str', 'wil', 'agi'], tree: 'warrior' },
  axeman: { order: ['str', 'end', 'str', 'agi', 'wil', 'str'], tree: 'warrior' },
  peltast: { order: ['agi', 'end', 'str', 'agi', 'wil', 'end'], tree: 'skirmisher' },
  slinger: { order: ['agi', 'wil', 'agi', 'end', 'agi', 'str'], tree: 'skirmisher' },
  archer: { order: ['agi', 'wil', 'agi', 'end', 'agi', 'str'], tree: 'skirmisher' },
  raw: { order: ['end', 'str', 'agi', 'wil'], tree: 'hoplite' },
};

function asArchetype(a: string | undefined): Archetype {
  return a && a in ARCH_ATTRS ? (a as Archetype) : 'raw';
}

/** Rolled starting attributes: the archetype's spread with a little personal variation. */
export function rollAttrs(rng: Rng, arch: Archetype): Attrs {
  const a = { ...ARCH_ATTRS[arch] };
  for (let i = 0; i < 2; i++) {
    const up = rng.pick(ATTR_IDS);
    const down = rng.pick(ATTR_IDS);
    if (up === down || a[down] <= 3 || a[up] >= 8) continue;
    a[up]++;
    a[down]--;
  }
  return a;
}

/** Spend unspent points and free perk slots the way the hero's archetype would. */
export function autoDevelop(h: Hero): void {
  const g = ARCH_GROWTH[asArchetype(h.arch)];
  let i = ATTR_IDS.reduce((acc, k) => acc + h.attrs[k], 0);
  let guard = 0;
  while (h.points > 0 && guard++ < 200) {
    const k = g.order[i++ % g.order.length];
    if (h.attrs[k] >= ATTR_MAX) continue;
    h.attrs[k]++;
    h.points--;
  }
  pickPerks(h, g.tree);
}

function pickPerks(h: Hero, tree: TreeId): void {
  const trees: TreeId[] = [tree, ...(['hoplite', 'skirmisher', 'warrior'] as TreeId[]).filter((t) => t !== tree)];
  while (h.perks.length < perkSlots(h.level)) {
    let took = false;
    for (const t of trees) {
      const next = treePerks(t).find((p) => !h.perks.includes(p.id));
      if (next && perkBlocker(h, next.id) === null) {
        h.perks.push(next.id);
        took = true;
        break;
      }
    }
    if (!took) break;
  }
}

/** Bot heroes: attributes and perks follow from archetype and level alone. */
export function setBotLevel(h: Hero, level: number): void {
  h.level = Math.max(1, Math.min(MAX_LEVEL, level));
  h.attrs = { ...ARCH_ATTRS[asArchetype(h.arch)] };
  h.points = (h.level - 1) * POINTS_PER_LEVEL;
  h.perks = [];
  autoDevelop(h);
}

/** Item choices per culture/archetype/tier. Each entry: [slot, candidate def ids by tier]. */
const KITS: Record<Culture, Partial<Record<Archetype, Partial<Record<Slot, string[][]>>>>> = {
  greek: {
    hoplite: { weapon: [['dory'], ['dory', 'bronze_dory'], ['bronze_dory']], shield: [['hoplon'], ['hoplon'], ['hoplon', 'aspis']], helmet: [['cap', 'pilos'], ['pilos', 'chalcidian'], ['chalcidian', 'corinthian']], armor: [['leather', 'linothorax'], ['linothorax'], ['linothorax', 'cuirass']] },
    swordsman: { weapon: [['xiphos'], ['xiphos', 'kopis'], ['kopis']], shield: [['thureos'], ['hoplon', 'thureos'], ['hoplon']], helmet: [['pilos'], ['chalcidian'], ['corinthian']], armor: [['leather'], ['linothorax'], ['cuirass']] },
    peltast: { weapon: [['javelins'], ['javelins'], ['saunion']], shield: [['buckler'], ['buckler', 'thureos'], ['thureos']], helmet: [[], ['cap', 'pilos'], ['pilos']], armor: [[], ['leather'], ['leather']] },
    slinger: { weapon: [['sling'], ['sling'], ['balearic_sling']], helmet: [[], [], ['cap']] },
    archer: { weapon: [['bow'], ['bow'], ['bow']], helmet: [[], ['cap'], ['pilos']], armor: [[], [], ['leather']] },
  },
  phoenician: {
    hoplite: { weapon: [['dory'], ['dory', 'bronze_dory'], ['bronze_dory']], shield: [['thureos', 'hoplon'], ['hoplon'], ['aspis', 'hoplon']], helmet: [['pilos'], ['montefortino', 'pilos'], ['chalcidian']], armor: [['linothorax'], ['linothorax', 'scale'], ['scale']] },
    swordsman: { weapon: [['kopis', 'xiphos'], ['kopis', 'falcata'], ['falcata']], shield: [['thureos'], ['thureos'], ['celtic_shield']], helmet: [['cap'], ['montefortino'], ['montefortino']], armor: [['leather'], ['linothorax'], ['scale', 'mail']] },
    peltast: { weapon: [['javelins'], ['javelins', 'saunion'], ['saunion']], shield: [['buckler'], ['thureos'], ['thureos']], helmet: [[], ['cap'], ['montefortino']], armor: [[], ['leather'], ['leather']] },
    slinger: { weapon: [['sling'], ['balearic_sling'], ['balearic_sling']], helmet: [[], [], ['cap']] },
    archer: { weapon: [['bow'], ['bow'], ['bow']], helmet: [[], ['cap'], ['cap']], armor: [[], ['leather'], ['linothorax']] },
  },
  celtic: {
    hoplite: { weapon: [['dory'], ['dory'], ['bronze_dory']], shield: [['thureos'], ['celtic_shield'], ['celtic_shield']], helmet: [[], ['montefortino'], ['montefortino']], armor: [[], ['leather'], ['mail']] },
    swordsman: { weapon: [['longsword', 'xiphos'], ['longsword'], ['longsword', 'falcata']], shield: [['thureos'], ['celtic_shield'], ['celtic_shield']], helmet: [['cap'], ['montefortino'], ['montefortino']], armor: [[], ['leather', 'mail'], ['mail']] },
    axeman: { weapon: [['axe', 'club'], ['axe'], ['axe']], shield: [['buckler', 'thureos'], ['thureos'], ['celtic_shield']], helmet: [[], ['cap'], ['montefortino']], armor: [[], ['leather'], ['mail']] },
    peltast: { weapon: [['javelins'], ['saunion'], ['saunion']], shield: [['thureos'], ['celtic_shield'], ['celtic_shield']], helmet: [[], [], ['montefortino']], armor: [[], [], ['leather']] },
    slinger: { weapon: [['sling'], ['sling'], ['balearic_sling']] },
    archer: { weapon: [['bow'], ['bow'], ['bow']] },
  },
};

export function rollRarity(rng: Rng, tier: number): Rarity {
  const t = Math.max(1, Math.min(3, tier));
  const table: [Rarity, number][][] = [
    [['common', 85], ['fine', 14], ['rare', 1]],
    [['common', 55], ['fine', 35], ['rare', 9], ['heroic', 1]],
    [['common', 30], ['fine', 40], ['rare', 25], ['heroic', 5]],
  ];
  return rng.weighted(table[t - 1]);
}

/**
 * Create a hero. `roster` lists heroes already in the same army: the new hero's
 * name will differ from all of theirs.
 */
export function makeHero(rng: Rng, ids: IdSource, culture: Culture, archetype: Archetype, level: number, tier: number, group = 0, roster: readonly { name: string }[] = []): Hero {
  const name = freeName(culture, rng.int(0, NAMES[culture].length - 1), new Set(roster.map((h) => h.name)));
  const traits: TraitId[] = [];
  const tCount = archetype === 'raw' ? (rng.chance(0.5) ? 1 : 0) : rng.chance(0.35) ? 2 : 1;
  while (traits.length < tCount) {
    const t = rng.chance(0.12) ? 'skittish' : rng.pick(POSITIVE_TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }
  const hero: Hero = {
    id: newId(ids, 'h'),
    name,
    culture,
    level: Math.max(1, Math.min(MAX_LEVEL, level)),
    xp: 0,
    traits,
    look: randomLook(rng, culture),
    equip: {},
    kills: 0,
    battles: 0,
    group,
    attrs: rollAttrs(rng, archetype),
    points: 0,
    perks: [],
    wound: 0,
    arch: archetype,
  };
  hero.points = (hero.level - 1) * POINTS_PER_LEVEL;
  if (hero.level > 1) autoDevelop(hero);
  const t = Math.max(1, Math.min(3, tier));
  if (archetype === 'raw') {
    hero.equip.weapon = makeItem(rng, ids, rng.pick(['dory', 'club', 'javelins', 'sling']), 'common', rng.range(45, 80), culture);
    if (hero.equip.weapon.def === 'dory' && rng.chance(0.5)) hero.equip.shield = makeItem(rng, ids, 'thureos', 'common', rng.range(40, 70), culture);
    return hero;
  }
  const kit = KITS[culture][archetype] ?? KITS[culture].hoplite!;
  for (const slot of ['weapon', 'shield', 'helmet', 'armor'] as Slot[]) {
    const options = kit[slot]?.[t - 1];
    if (!options || options.length === 0) continue;
    const defId = rng.pick(options);
    hero.equip[slot] = makeItem(rng, ids, defId, rollRarity(rng, t), rng.range(55, 100), culture);
  }
  if (t >= 2 && rng.chance(0.15 * t)) {
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
