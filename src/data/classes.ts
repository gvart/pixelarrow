/**
 * Unit classes (data-driven). One hero is one soldier; his class is set when
 * he is recruited (or generated) and decides:
 *
 *  - his role on the field and the gear he is raised with (kit by tier),
 *  - a few class traits on top of gear (`mods`, `moraleLoss`, `routAt`),
 *  - whether he rides: `mount` is a CLASS PROPERTY, not an item. A Companion
 *    is a horseman with whatever lance and helmet he carries; gear never turns
 *    a footman into a rider. MOUNTS below holds what the animal adds (speed,
 *    HP, charge, footprint, turning and braking),
 *  - his own five-perk tree (`tree`, tier 0..4 at levels 2/4/6/8/10),
 *  - his attributes at recruitment and how bots develop him (`attrs`, `growth`),
 *  - how he is drawn (`art`: cloak, trousers, bare chest, tunic colours).
 *
 * Animals (`kind: 'animal'`) are classes too, without gear or perks: wolves,
 * boars and bears for the neutral defenders of forests and hills. Their
 * combat numbers come from `beast`. Other code refers to classes only by id
 * (`ClassId`), so world / online neutral-defender tables can list e.g.
 * `{ cls: 'wolf', count: 6 }` and build armies with `makeHero`/`beastPack`.
 *
 * Old saves and setups have no class: `classOfHero` derives one from the
 * hero's old archetype and gear; a battle setup without class fields plays
 * exactly as before (the sim only reads the derived CombatStats).
 */
import type { StatMods } from './items';
import { registerClassTree, type Attrs, type AttrId, type PerkId } from './perks';
import type { Culture } from './names';
import { MYTHS, MYTH_IDS, type MythId } from './beasts';

export type ClassId =
  | 'militia'
  | 'hoplite' | 'thureophoros' | 'celt_sword' | 'rhomphaia'
  | 'archer' | 'slinger' | 'javelineer' | 'horse_archer'
  | 'peltast' | 'falx' | 'gallic' | 'fanatic'
  | 'companion' | 'thessalian' | 'chariot' | 'royal_guard' | 'sacred_band'
  | 'wolf' | 'boar' | 'bear'
  | MythId;

export type ClassRole = 'levy' | 'heavy' | 'ranged' | 'light' | 'cavalry' | 'elite' | 'beast';
export type MountId = 'horse' | 'chariot';
/** Animals and mythical beasts (src/data/beasts.ts). */
export type BeastId = 'wolf' | 'boar' | 'bear' | MythId;

export const ROLE_LABEL: Record<ClassRole, string> = {
  levy: 'Levy',
  heavy: 'Heavy infantry',
  ranged: 'Ranged',
  light: 'Light / shock',
  cavalry: 'Cavalry',
  elite: 'Elite',
  beast: 'Beast',
};

/** Kit options per tier (index 0..2): item ids, one picked per slot. */
type Kit = Partial<Record<'weapon' | 'shield' | 'helmet' | 'armor', string[][]>>;

export interface MountDef {
  id: MountId;
  /** Walk speed multiplier over a man on foot (gear and agility count for less). */
  speed: number;
  /** Top speed when charging, as a multiple of the walk speed. */
  gallop: number;
  hp: number;
  stamina: number;
  chargeBonus: number;
  /** Body radius in field units (a man is 0.3). */
  radius: number;
  /** Acceleration and braking (field units / s^2): a horse cannot stop at once. */
  accel: number;
  brake: number;
  /** Turn rate (lerp per second) standing still and at the gallop. */
  turnSlow: number;
  turnFast: number;
  /** Scythe damage per pass at full speed (chariots). */
  scythe: number;
}

export const MOUNTS: Record<MountId, MountDef> = {
  horse: { id: 'horse', speed: 1.55, gallop: 1.95, hp: 14, stamina: 30, chargeBonus: 0.7, radius: 0.48, accel: 3.2, brake: 4.5, turnSlow: 4, turnFast: 1.4, scythe: 0 },
  chariot: { id: 'chariot', speed: 1.6, gallop: 2.1, hp: 34, stamina: 40, chargeBonus: 1.0, radius: 0.72, accel: 2.4, brake: 3.2, turnSlow: 2.4, turnFast: 0.8, scythe: 11 },
};

/** Combat numbers of an animal at level 1 (+8% per level above). */
export interface BeastDef {
  hp: number;
  dmg: number;
  atkTime: number;
  reach: number;
  armor: number;
  morale: number;
  /** Speed multiplier over a man (2 field units / s walking). */
  speed: number;
  chargeBonus: number;
  moraleShock: number;
  radius: number;
  /** Rout below this fraction of max morale (animals bolt earlier than men). */
  routAt: number;
  /** Pack hunters circle to a flank before they bite. */
  pack: boolean;
}

export interface ClassArt {
  /** Tunic colour keys (src/art/palette.ts) the class wears. */
  tunics?: string[];
  /** A cloak in this palette key (crimson for Spartans...). */
  cloak?: string;
  /** Trousers (Celts, Thracians, Scythians). */
  trousers?: string;
  /** Bare chested (warband, fanatics). */
  bare?: boolean;
  /** Animals: coat palette key. */
  coat?: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Up to 6 letters for tags and tight lists. */
  short: string;
  role: ClassRole;
  /** One line: what the class is for. */
  desc: string;
  mount?: MountId;
  kind?: 'animal';
  beast?: BeastId;
  beastStats?: BeastDef;
  /** Class traits added on top of gear. */
  mods: StatMods;
  moraleLoss?: number;
  /** Rout threshold override (fraction of max morale). */
  routAt?: number;
  attrs: Attrs;
  growth: AttrId[];
  tree: PerkId[];
  kit: Kit;
  /** Cultures whose towns recruit the class (empty: never recruited). */
  cultures: Culture[];
  /** Recruitment price before level and gear, and the cost used by equal-cost balance matchups. */
  cost: number;
  /** Default battle group: 0 phalanx, 1 skirmish, 2 reserve, 3 flank. */
  group: number;
  /** Power multiplier for army strength estimates (charge, speed the formula misses). */
  power?: number;
  art: ClassArt;
}

const A = (str: number, agi: number, end: number, wil: number): Attrs => ({ str, agi, end, wil });

const defs: ClassDef[] = [
  // ------------------------------------------------------------- levy
  {
    id: 'militia', name: 'Militia', short: 'Levy', role: 'levy', cost: 60, group: 0,
    desc: 'Farmers with spears and clubs. Cheap, brittle, many.',
    mods: { morale: -6 }, attrs: A(5, 5, 5, 5), growth: ['end', 'str', 'agi', 'wil'],
    tree: ['drilled', 'shield_bash', 'phalangite', 'rally_cry', 'unbreakable'],
    kit: { weapon: [['dory', 'club', 'javelins', 'sling'], ['dory', 'longche'], ['longche']], shield: [['', 'thureos'], ['thureos'], ['thureos']], helmet: [[], ['cap'], ['pilos']] },
    cultures: ['greek', 'phoenician', 'celtic'], art: { tunics: ['tunicWhite', 'tunicOchre', 'tunicGreen'] },
  },
  // ------------------------------------------------------------- heavy infantry
  {
    id: 'hoplite', name: 'Spartan hoplite', short: 'Hoplt', role: 'heavy', cost: 100, group: 0,
    desc: 'Dory and aspis. The wall: braces against charges, holds the line.',
    mods: { morale: 8, block: 0.03 }, attrs: A(5, 4, 6, 5), growth: ['end', 'str', 'wil', 'end', 'str', 'agi'],
    tree: ['shield_drill', 'shield_bash', 'phalangite', 'steady_presence', 'unbreakable'],
    kit: {
      weapon: [['dory'], ['dory', 'bronze_dory'], ['bronze_dory']], shield: [['hoplon'], ['hoplon'], ['hoplon', 'aspis']],
      helmet: [['pilos', 'corinthian'], ['corinthian', 'chalcidian'], ['corinthian']], armor: [['linothorax'], ['linothorax', 'cuirass'], ['cuirass']],
    },
    cultures: ['greek'], art: { tunics: ['tunicRed'], cloak: 'cloakRed' },
  },
  {
    id: 'thureophoros', name: 'Thureophoros', short: 'Thuro', role: 'heavy', cost: 85, group: 0,
    desc: 'Oval thureos and sword. Quicker than hoplites, good in broken ground.',
    mods: { speed: 0.05, stamina: 10 }, attrs: A(6, 5, 5, 4), growth: ['str', 'agi', 'end', 'str', 'wil', 'agi'],
    tree: ['shield_drill', 'shield_bash', 'iron_discipline', 'rally_cry', 'warlord'],
    kit: {
      weapon: [['xiphos', 'longche'], ['kopis', 'longche'], ['kopis', 'falcata']], shield: [['thureos'], ['thureos'], ['thureos', 'celtic_shield']],
      helmet: [['pilos', 'montefortino'], ['montefortino', 'chalcidian'], ['chalcidian']], armor: [['leather'], ['linothorax'], ['linothorax', 'scale']],
    },
    cultures: ['greek', 'phoenician'], art: { tunics: ['tunicBlue', 'tunicWhite', 'tunicOchre'] },
  },
  {
    id: 'celt_sword', name: 'Celtic swordsman', short: 'Celt', role: 'heavy', cost: 80, group: 0,
    desc: 'Long sword, tall shield and mail. A hard first rush.',
    mods: { chargeBonus: 0.25, moraleShock: 0.15, morale: -2 }, attrs: A(6, 5, 5, 4), growth: ['str', 'agi', 'end', 'str', 'wil', 'agi'],
    tree: ['brawler', 'shield_bash', 'bloodlust', 'rally_cry', 'warlord'],
    kit: {
      weapon: [['longsword'], ['longsword'], ['longsword', 'falcata']], shield: [['thureos'], ['celtic_shield'], ['celtic_shield']],
      helmet: [['', 'montefortino'], ['montefortino'], ['montefortino']], armor: [['', 'leather'], ['mail', 'leather'], ['mail']],
    },
    cultures: ['celtic'], art: { tunics: ['tunicGreen', 'tunicOchre', 'tunicRed'], trousers: 'checkGreen' },
  },
  {
    id: 'rhomphaia', name: 'Thracian rhomphaia', short: 'Rhomph', role: 'heavy', cost: 85, group: 0,
    desc: 'Two-handed long blade: cuts through shield walls, no shield of his own.',
    mods: { hp: 4, moraleShock: 0.1 }, attrs: A(7, 4, 5, 4), growth: ['str', 'end', 'str', 'agi', 'wil', 'str'],
    tree: ['shield_breaker', 'berserk', 'reaping_blow', 'bloodlust', 'warlord'],
    kit: { weapon: [['rhomphaia'], ['rhomphaia'], ['rhomphaia']], helmet: [['thracian'], ['thracian'], ['thracian']], armor: [['leather'], ['linothorax', 'scale'], ['scale']] },
    cultures: ['greek'], art: { tunics: ['tunicOchre', 'tunicRed'], trousers: 'trouserBrown', cloak: 'cloakBrown' },
  },
  // ------------------------------------------------------------- ranged
  {
    id: 'archer', name: 'Cretan archer', short: 'Archr', role: 'ranged', cost: 50, group: 1,
    desc: 'The longest bow: bleeds slow heavy infantry from afar.',
    mods: { accuracy: 0.06, range: 1 }, attrs: A(4, 7, 4, 5), growth: ['agi', 'wil', 'agi', 'end', 'agi', 'str'],
    tree: ['longshot', 'volley', 'deep_quiver', 'eagle_eye', 'skirmish_master'],
    kit: { weapon: [['bow'], ['cretan_bow'], ['cretan_bow']], helmet: [[], ['cap'], ['pilos']], armor: [[], ['leather'], ['leather']] },
    cultures: ['greek', 'phoenician'], art: { tunics: ['tunicWhite', 'tunicOchre'] },
  },
  {
    id: 'slinger', name: 'Rhodian slinger', short: 'Sling', role: 'ranged', cost: 50, group: 1,
    desc: 'Lead bullets at long range; plenty of them.',
    mods: { accuracy: 0.04 }, attrs: A(4, 7, 4, 5), growth: ['agi', 'wil', 'agi', 'end', 'agi', 'str'],
    tree: ['lead_bullets', 'volley', 'deep_quiver', 'eagle_eye', 'skirmish_master'],
    kit: { weapon: [['sling'], ['rhodian_sling', 'balearic_sling'], ['rhodian_sling']], helmet: [[], [], ['cap']] },
    cultures: ['greek', 'phoenician', 'celtic'], art: { tunics: ['tunicWhite', 'tunicBlue', 'tunicOchre'] },
  },
  {
    id: 'javelineer', name: 'Peltast javelineer', short: 'Javln', role: 'ranged', cost: 45, group: 1,
    desc: 'A bundle of heavy javelins and a pelte: short range, hard hits.',
    mods: { speed: 0.06, ammo: 1 }, attrs: A(4, 6, 5, 5), growth: ['agi', 'end', 'str', 'agi', 'wil', 'end'],
    tree: ['fleet', 'volley', 'deep_quiver', 'eagle_eye', 'skirmish_master'],
    kit: { weapon: [['javelins'], ['javelins', 'saunion'], ['saunion']], shield: [['pelte'], ['pelte'], ['pelte']], helmet: [[], ['cap'], ['thracian']], armor: [[], [], ['leather']] },
    cultures: ['greek', 'phoenician', 'celtic'], art: { tunics: ['tunicOchre', 'tunicGreen', 'tunicWhite'] },
  },
  {
    id: 'horse_archer', name: 'Scythian horse archer', short: 'HArch', role: 'ranged', cost: 75, group: 1, mount: 'horse', power: 1.25,
    desc: 'Shoots from the saddle on the move; never lets the enemy close.',
    mods: { accuracy: -0.04, hp: -4 }, attrs: A(4, 7, 5, 4), growth: ['agi', 'end', 'agi', 'wil', 'agi', 'str'],
    tree: ['horsemanship', 'volley', 'parthian_shot', 'eagle_eye', 'skirmish_master'],
    kit: { weapon: [['scythian_bow'], ['scythian_bow'], ['scythian_bow']], helmet: [['scythian_hood'], ['scythian_hood'], ['scythian_hood']], armor: [[], ['leather'], ['leather', 'scale']] },
    cultures: ['phoenician', 'celtic'], art: { tunics: ['tunicRed', 'tunicOchre', 'tunicGreen'], trousers: 'checkRed' },
  },
  // ------------------------------------------------------------- light / shock
  {
    id: 'peltast', name: 'Peltast', short: 'Pelt', role: 'light', cost: 65, group: 3,
    desc: 'Fast spear-and-pelte skirmisher: runs down archers, throws a pair.',
    mods: { speed: 0.12, stamina: 10 }, attrs: A(5, 6, 5, 4), growth: ['agi', 'str', 'end', 'agi', 'wil', 'str'],
    tree: ['fleet', 'volley', 'brawler', 'rally_cry', 'skirmish_master'],
    kit: { weapon: [['javelins', 'longche'], ['saunion', 'longche'], ['saunion']], shield: [['pelte'], ['pelte'], ['pelte', 'thureos']], helmet: [[], ['thracian', 'cap'], ['thracian']], armor: [[], ['leather'], ['leather']] },
    cultures: ['greek', 'celtic'], art: { tunics: ['tunicOchre', 'tunicRed', 'tunicBlue'], cloak: 'cloakBrown' },
  },
  {
    id: 'falx', name: 'Thracian falx', short: 'Falx', role: 'light', cost: 75, group: 3,
    desc: 'Sickle-blade shock trooper: hooks shields aside, light and quick.',
    mods: { chargeBonus: 0.15, speed: 0.05 }, attrs: A(6, 6, 4, 4), growth: ['str', 'agi', 'str', 'end', 'wil', 'agi'],
    tree: ['brawler', 'berserk', 'shield_breaker', 'bloodlust', 'warlord'],
    kit: { weapon: [['falx'], ['falx'], ['falx']], helmet: [['thracian', ''], ['thracian'], ['thracian']], armor: [[], ['leather'], ['leather']] },
    cultures: ['greek', 'celtic'], art: { tunics: ['tunicRed', 'tunicOchre'], trousers: 'trouserBrown', cloak: 'cloakBrown' },
  },
  {
    id: 'gallic', name: 'Gallic warband', short: 'Gaul', role: 'light', cost: 70, group: 3,
    desc: 'Bare-chested rush with axe or sword: terrifying, but tires and breaks.',
    mods: { chargeBonus: 0.45, moraleShock: 0.25, morale: -4, stamina: -10, speed: 0.06 }, moraleLoss: 1.1,
    attrs: A(7, 5, 4, 4), growth: ['str', 'agi', 'str', 'end', 'wil', 'str'],
    tree: ['brawler', 'berserk', 'bloodlust', 'rally_cry', 'warlord'],
    kit: { weapon: [['axe', 'longsword', 'club'], ['axe', 'longsword'], ['longsword']], shield: [['thureos'], ['celtic_shield'], ['celtic_shield']], helmet: [[], [], ['montefortino']] },
    cultures: ['celtic'], art: { bare: true, trousers: 'checkGreen' },
  },
  {
    id: 'fanatic', name: 'Fanatic', short: 'Fanat', role: 'light', cost: 70, group: 3,
    desc: 'Cultist who does not break. Little armour, no fear.',
    mods: { hp: -4, morale: 10, speed: 0.06, chargeBonus: 0.2 }, moraleLoss: 0.65, routAt: 0.15,
    attrs: A(6, 5, 4, 6), growth: ['str', 'wil', 'agi', 'str', 'end', 'wil'],
    tree: ['zealot', 'berserk', 'bloodlust', 'rally_cry', 'unbreakable'],
    kit: { weapon: [['club', 'axe', 'xiphos'], ['axe', 'kopis'], ['kopis']], shield: [['', 'buckler'], ['buckler'], ['buckler']] },
    cultures: [], art: { bare: true, tunics: ['tunicWhite'], cloak: 'cloakBlack' },
  },
  // ------------------------------------------------------------- cavalry and elites
  {
    id: 'companion', name: 'Companion cavalry', short: 'Compn', role: 'cavalry', cost: 160, group: 3, mount: 'horse', power: 1.45,
    desc: 'Lance and horse: shatters flanks and rears, rides down the routing. Never charge braced spears head on.',
    mods: { morale: 8 }, attrs: A(6, 5, 5, 5), growth: ['str', 'wil', 'end', 'agi', 'str', 'end'],
    tree: ['horsemanship', 'lance_charge', 'ride_down', 'rally_cry', 'warlord'],
    kit: { weapon: [['xyston'], ['xyston'], ['xyston']], helmet: [['boeotian'], ['boeotian'], ['boeotian']], armor: [['linothorax'], ['linothorax', 'cuirass'], ['cuirass']] },
    cultures: ['greek'], art: { tunics: ['tunicOchre', 'tunicRed'], cloak: 'cloakPurple' },
  },
  {
    id: 'thessalian', name: 'Thessalian horse', short: 'Thess', role: 'cavalry', cost: 115, group: 3, mount: 'horse', power: 1.35,
    desc: 'Fast light horse: javelins, then the chase. Screens and pursues.',
    mods: { speed: 0.08 }, attrs: A(5, 6, 5, 4), growth: ['agi', 'str', 'end', 'agi', 'wil', 'str'],
    tree: ['horsemanship', 'volley', 'ride_down', 'lance_charge', 'skirmish_master'],
    kit: { weapon: [['javelins'], ['javelins', 'saunion'], ['saunion']], shield: [['buckler'], ['buckler'], ['buckler']], helmet: [['boeotian', 'pilos'], ['boeotian'], ['boeotian']], armor: [[], ['leather'], ['linothorax']] },
    cultures: ['greek', 'phoenician'], art: { tunics: ['tunicBlue', 'tunicWhite'], cloak: 'cloakBlue' },
  },
  {
    id: 'chariot', name: 'Scythed chariot', short: 'Chart', role: 'cavalry', cost: 260, group: 3, mount: 'chariot', power: 1.5,
    desc: 'Two horses and scythed wheels: cuts through loose ranks on open ground; wrecks in woods and stones.',
    mods: { armor: 1, morale: 18 }, moraleLoss: 0.8, attrs: A(5, 6, 5, 4), growth: ['agi', 'str', 'end', 'wil', 'agi', 'str'],
    tree: ['horsemanship', 'lance_charge', 'scythe_master', 'ride_down', 'warlord'],
    kit: { weapon: [['kopis'], ['kopis'], ['falcata']], helmet: [['pilos'], ['montefortino'], ['chalcidian']], armor: [['leather'], ['linothorax'], ['scale']] },
    cultures: ['phoenician'], art: { tunics: ['tunicRed', 'tunicOchre'] },
  },
  {
    id: 'royal_guard', name: 'Royal guard', short: 'Guard', role: 'elite', cost: 130, group: 0,
    desc: 'Picked men with silver shields: the best armour and nerve in the line.',
    mods: { hp: 8, morale: 12, block: 0.03 }, attrs: A(6, 5, 6, 6), growth: ['end', 'str', 'wil', 'str', 'end', 'agi'],
    tree: ['shield_drill', 'shield_bash', 'iron_discipline', 'steady_presence', 'warlord'],
    kit: { weapon: [['bronze_dory'], ['bronze_dory'], ['bronze_dory']], shield: [['argyraspis'], ['argyraspis'], ['argyraspis']], helmet: [['attic'], ['attic'], ['attic']], armor: [['cuirass'], ['cuirass'], ['cuirass']] },
    cultures: ['greek'], art: { tunics: ['tunicRed'], cloak: 'cloakPurple' },
  },
  {
    id: 'sacred_band', name: 'Sacred Band', short: 'Sacrd', role: 'elite', cost: 125, group: 0,
    desc: 'Three hundred pairs sworn to each other: they hold when others run.',
    mods: { hp: 4, morale: 18 }, moraleLoss: 0.7, attrs: A(6, 5, 5, 7), growth: ['wil', 'str', 'end', 'wil', 'agi', 'str'],
    tree: ['shield_drill', 'shield_bash', 'phalangite', 'rally_cry', 'unbreakable'],
    kit: { weapon: [['bronze_dory'], ['bronze_dory'], ['bronze_dory']], shield: [['aspis'], ['aspis'], ['aspis']], helmet: [['corinthian'], ['corinthian'], ['corinthian']], armor: [['linothorax'], ['cuirass'], ['cuirass']] },
    cultures: ['greek'], art: { tunics: ['tunicWhite'], cloak: 'cloakBlue' },
  },
  // ------------------------------------------------------------- animals (neutral defenders)
  {
    id: 'wolf', name: 'Wolf', short: 'Wolf', role: 'beast', cost: 50, group: 0, kind: 'animal', beast: 'wolf',
    desc: 'Hunts in packs: circles to a flank and bites the stragglers. Bolts when hurt.',
    beastStats: { hp: 30, dmg: 8, atkTime: 0.9, reach: 0.65, armor: 0, morale: 52, speed: 1.55, chargeBonus: 0.3, moraleShock: 0.1, radius: 0.3, routAt: 0.33, pack: true },
    mods: {}, attrs: A(5, 7, 5, 4), growth: [], tree: [], kit: {}, cultures: [], art: { coat: 'wolf' },
  },
  {
    id: 'boar', name: 'Wild boar', short: 'Boar', role: 'beast', cost: 100, group: 0, kind: 'animal', beast: 'boar',
    desc: 'Charges straight in, tusks low. Thick hide; stubborn.',
    beastStats: { hp: 70, dmg: 15, atkTime: 1.2, reach: 0.7, armor: 3, morale: 60, speed: 1.3, chargeBonus: 0.9, moraleShock: 0.25, radius: 0.36, routAt: 0.3, pack: false },
    mods: {}, attrs: A(7, 5, 6, 5), growth: [], tree: [], kit: {}, cultures: [], art: { coat: 'boar' },
  },
  {
    id: 'bear', name: 'Brown bear', short: 'Bear', role: 'beast', cost: 250, group: 0, kind: 'animal', beast: 'bear',
    desc: 'Huge and terrifying: each swipe can fell a man. Slow to anger, slow to run.',
    beastStats: { hp: 150, dmg: 32, atkTime: 1.3, reach: 0.9, armor: 4, morale: 80, speed: 1.05, chargeBonus: 0.5, moraleShock: 0.7, radius: 0.55, routAt: 0.25, pack: false },
    mods: {}, attrs: A(9, 4, 8, 6), growth: [], tree: [], kit: {}, cultures: [], art: { coat: 'bear' },
  },
  // ------------------------------------------------------------- mythical beasts (src/data/beasts.ts)
  ...MYTH_IDS.map((id): ClassDef => {
    const m = MYTHS[id];
    return {
      id, name: m.name, short: m.name.slice(0, 6), role: 'beast', cost: 1000, group: 0, kind: 'animal', beast: id, desc: m.desc,
      beastStats: { hp: m.hp, dmg: m.dmg, atkTime: m.atkTime, reach: m.reach, armor: m.armor, morale: m.morale, speed: m.speed, chargeBonus: 0.5, moraleShock: 0, radius: Math.min(1.95, m.radius), routAt: id === 'harpy' ? 0.3 : 0, pack: false },
      mods: {}, attrs: A(9, 5, 9, 9), growth: [], tree: [], kit: {}, cultures: [], art: { coat: id },
    };
  }),
];

export const CLASSES: Record<ClassId, ClassDef> = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<ClassId, ClassDef>;
export const CLASS_LIST: readonly ClassDef[] = defs;
export const CLASS_IDS: ClassId[] = defs.map((d) => d.id);
/** Classes a player can field (not animals). */
export const SOLDIER_CLASSES: ClassId[] = defs.filter((d) => d.kind !== 'animal').map((d) => d.id);
export const BEAST_CLASSES: ClassId[] = defs.filter((d) => d.kind === 'animal').map((d) => d.id);

for (const d of defs) registerClassTree(d.id, d.tree);

export function isClassId(id: unknown): id is ClassId {
  return typeof id === 'string' && id in CLASSES;
}

/** The archetypes heroes had before classes, and the class each became. */
export const LEGACY_ARCH: Record<string, ClassId> = {
  raw: 'militia',
  hoplite: 'hoplite',
  swordsman: 'thureophoros',
  axeman: 'gallic',
  peltast: 'javelineer',
  slinger: 'slinger',
  archer: 'archer',
};

/**
 * The class of a hero: his own, or (old saves) one derived from his old
 * archetype, his culture and his weapon.
 */
export function classOfHero(h: { cls?: string; arch?: string; culture?: string; weaponDef?: string }): ClassId {
  if (isClassId(h.cls)) return h.cls;
  if (isClassId(h.arch)) return h.arch;
  if (h.arch?.startsWith('animal:') && isClassId(h.arch.slice(7))) return h.arch.slice(7) as ClassId;
  const a = h.arch ?? 'raw';
  if (a === 'swordsman' && h.culture === 'celtic') return 'celt_sword';
  if (a === 'peltast' && h.weaponDef && !['javelins', 'saunion'].includes(h.weaponDef)) return 'peltast';
  return LEGACY_ARCH[a] ?? 'militia';
}

/** Recruit pool of a town by its culture (weights). */
export function townClasses(culture: Culture): [ClassId, number][] {
  const out: [ClassId, number][] = [];
  for (const d of defs) {
    if (!d.cultures.includes(culture)) continue;
    const w = d.role === 'cavalry' || d.role === 'elite' ? 1 : d.role === 'heavy' ? 4 : d.role === 'levy' ? 2 : 3;
    out.push([d.id, w]);
  }
  return out;
}
