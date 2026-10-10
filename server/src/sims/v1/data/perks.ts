/**
 * Hero progression data: attributes, perk trees, active abilities and auras.
 * Everything a perk does is described here; src/sim/stats.ts folds perks into
 * combat stats and src/sim/battle.ts implements the abilities and auras.
 */
import type { StatMods } from './items';

// ---------------------------------------------------------------- attributes

export type AttrId = 'str' | 'agi' | 'end' | 'wil';
export const ATTR_IDS: AttrId[] = ['str', 'agi', 'end', 'wil'];
export type Attrs = Record<AttrId, number>;

/** An attribute at ATTR_BASE has no effect; every point above or below shifts derived stats. */
export const ATTR_BASE = 5;
export const ATTR_MAX = 15;
export const POINTS_PER_LEVEL = 2;
/** Levels at which a hero earns a perk point. */
export const PERK_LEVELS = [2, 4, 6, 8, 10];

export const ATTRS: Record<AttrId, { name: string; short: string; desc: string }> = {
  str: { name: 'Strength', short: 'STR', desc: '+melee damage, +HP, +charge impact' },
  agi: { name: 'Agility', short: 'AGI', desc: '+speed, +accuracy, faster blows, +missile damage' },
  end: { name: 'Endurance', short: 'END', desc: '+HP, +stamina, more likely to survive a mortal blow' },
  wil: { name: 'Will', short: 'WIL', desc: '+morale, steadier, wider auras and shouts, faster cooldowns' },
};

/** Per point above ATTR_BASE (negative below). Applied in computeStats. */
export const ATTR_EFFECT = {
  strDmg: 0.35,
  strHp: 1,
  strCharge: 0.02,
  agiSpeed: 0.015,
  agiAccuracy: 0.012,
  agiTempo: 0.015, // attack and shot time shrink by this fraction per point
  agiRanged: 0.25,
  endHp: 3,
  endStamina: 5,
  endKo: 0.03,
  wilMorale: 3,
  wilSteady: 0.03, // morale damage taken shrinks by this fraction per point
  wilRadius: 0.12, // aura / shout radius in field units per point
  wilCooldown: 0.025, // ability cooldowns shrink by this fraction per point
};

/** Chance that a hero struck down is only knocked out (wounded) rather than killed. */
export const KO_BASE = 0.4;
/** Will at or above this unlocks Rally Cry without the perk. */
export const RALLY_WILL = 9;

export function defaultAttrs(): Attrs {
  return { str: ATTR_BASE, agi: ATTR_BASE, end: ATTR_BASE, wil: ATTR_BASE };
}

// ---------------------------------------------------------------- abilities

export type AbilityId = 'bash' | 'volley' | 'berserk' | 'rally';
export const ABILITY_IDS: AbilityId[] = ['bash', 'volley', 'berserk', 'rally'];

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** Short HUD label. */
  short: string;
  desc: string;
  /** Icon key in src/art/icons.ts. */
  icon: string;
  /** Seconds. */
  cooldown: number;
  /** Effect colour (particles, floating icon). */
  color: number;
  /**
   * When a whole group is selected: 'all' = every ready holder uses it,
   * 'one' = only the best-placed holder (shouts and volleys do not stack).
   */
  groupMode: 'all' | 'one';
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  bash: {
    id: 'bash', name: 'Shield Bash', short: 'Bash', icon: 'bash', cooldown: 12, color: 0xf6ecd8, groupMode: 'all',
    desc: 'Slam the shield into the man in front: stunned 1.5 s, then dazed (no block, +20% damage taken) for 2 s.',
  },
  volley: {
    id: 'volley', name: 'Volley', short: 'Volley', icon: 'volley', cooldown: 20, color: 0x9ad0e8, groupMode: 'one',
    desc: 'Every missile-man within 6 paces looses two free shots at once: +30% damage, tighter aim.',
  },
  berserk: {
    id: 'berserk', name: 'Berserk', short: 'Bersrk', icon: 'berserk', cooldown: 40, color: 0xe04030, groupMode: 'all',
    desc: '8 s of fury: +50% damage, faster, terrifying blows, no rout; but blocks and armour suffer. Winded after.',
  },
  rally: {
    id: 'rally', name: 'Rally Cry', short: 'Rally', icon: 'rally', cooldown: 45, color: 0xe0b860, groupMode: 'one',
    desc: 'Restores morale to every ally within 4 paces and turns routing men back to the fight.',
  },
};

/** Ability tuning, used by the simulation. */
export const ABILITY_RULES = {
  bashRange: 1.25,
  bashStun: 30, // ticks
  /** After a bash the man is dazed: he cannot block and takes extra damage. */
  bashDaze: 40,
  dazeDamage: 1.2,
  bashDamage: 3,
  bashMorale: 6,
  volleyRadius: 6,
  volleyShots: 2,
  volleyDamage: 1.3,
  volleyAccuracy: 0.1,
  berserkTicks: 160,
  berserkDamage: 1.5,
  berserkTempo: 0.75,
  berserkBlock: 0.6,
  berserkArmor: 2,
  berserkShock: 0.5,
  berserkWinded: 15,
  rallyRadius: 4,
  rallyMorale: 0.35, // fraction of max morale restored
};

// ---------------------------------------------------------------- auras

export type AuraId = 'steady' | 'eagle' | 'warlord';
export const AURA_IDS: AuraId[] = ['steady', 'eagle', 'warlord'];

export interface AuraDef {
  id: AuraId;
  name: string;
  desc: string;
  /** Field units (+ Will bonus). */
  radius: number;
  color: number;
  /** Bit in SimUnit.aura. */
  bit: number;
}

export const AURAS: Record<AuraId, AuraDef> = {
  steady: { id: 'steady', name: 'Steady Presence', desc: 'Allies within 3.5 paces take 20% less morale damage and recover morale even in the fight.', radius: 3.5, color: 0xe8c860, bit: 1 },
  eagle: { id: 'eagle', name: 'Eagle Eye', desc: 'Allies within 5 paces aim better and their missiles hit 15% harder.', radius: 5, color: 0x70d0b0, bit: 2 },
  warlord: { id: 'warlord', name: 'Warlord', desc: 'Allies within 3 paces strike 12% harder in melee.', radius: 3, color: 0xe86048, bit: 4 },
};

export const AURA_RULES = {
  steadyMoraleLoss: 0.8,
  steadyRegen: 1.0, // morale per second, even when engaged
  eagleAccuracy: 0.12,
  eagleDamage: 1.15,
  warlordDamage: 1.12,
};

// ---------------------------------------------------------------- perks

/**
 * Perk categories. Before unit classes there were three shared trees (the
 * first three); every class now has its own five-perk tree (CLASSES[id].tree
 * in src/data/classes.ts) drawn from the perks below. The category only
 * colours a perk and orders the legacy trees.
 */
export type TreeId = 'hoplite' | 'skirmisher' | 'warrior' | 'rider';
/** The three legacy trees (heroes without a class still follow them). */
export const TREE_IDS: TreeId[] = ['hoplite', 'skirmisher', 'warrior'];
export const TREES: Record<TreeId, { name: string; desc: string; color: number }> = {
  hoplite: { name: 'Hoplite', desc: 'Shield wall and spear', color: 0x4a6b8a },
  skirmisher: { name: 'Skirmisher', desc: 'Missiles and speed', color: 0x5f7a45 },
  warrior: { name: 'Warrior', desc: 'Shock and fury', color: 0x9a3b2f },
  rider: { name: 'Rider', desc: 'Horse and charge', color: 0x8a6a3a },
};

export type PerkId =
  | 'shield_drill' | 'shield_bash' | 'phalangite' | 'steady_presence' | 'unbreakable'
  | 'fleet' | 'volley' | 'deep_quiver' | 'eagle_eye' | 'skirmish_master'
  | 'brawler' | 'berserk' | 'bloodlust' | 'rally_cry' | 'warlord'
  // class perks (only in class trees)
  | 'drilled' | 'iron_discipline' | 'shield_breaker' | 'reaping_blow' | 'longshot' | 'lead_bullets'
  | 'zealot' | 'horsemanship' | 'parthian_shot' | 'lance_charge' | 'ride_down' | 'scythe_master';

export interface PerkDef {
  id: PerkId;
  tree: TreeId;
  /** 0..4: a perk needs the previous tier of its tree and level >= PERK_LEVELS[tier]. */
  tier: number;
  name: string;
  desc: string;
  mods?: StatMods;
  /** Multiplier on morale damage taken. */
  moraleLoss?: number;
  /** Extra knock-out (survival) chance. */
  ko?: number;
  /** Multiplier on ammunition. */
  ammoMult?: number;
  ability?: AbilityId;
  aura?: AuraId;
  /** Special hooks implemented in the simulation. */
  bloodlust?: boolean;
  /** Extra damage fraction against routing men (riding down the beaten). */
  pursuit?: number;
  /** Extra scythe damage fraction (chariots). */
  scythe?: number;
  /** Only found in class trees (not part of the three legacy trees). */
  classOnly?: boolean;
}

const perkList: PerkDef[] = [
  // Hoplite
  { id: 'shield_drill', tree: 'hoplite', tier: 0, name: 'Shield Drill', desc: '+6% block, +1 armour.', mods: { block: 0.06, armor: 1 } },
  { id: 'shield_bash', tree: 'hoplite', tier: 1, name: 'Shield Bash', desc: 'Ability: stun the enemy in front (needs a shield).', ability: 'bash' },
  { id: 'phalangite', tree: 'hoplite', tier: 2, name: 'Phalangite', desc: '+0.15 reach, +0.15 charge brace, +1 damage.', mods: { reach: 0.15, chargeBonus: 0.15, dmg: 1 } },
  { id: 'steady_presence', tree: 'hoplite', tier: 3, name: 'Steady Presence', desc: 'Aura: nearby allies hold their nerve.', aura: 'steady' },
  { id: 'unbreakable', tree: 'hoplite', tier: 4, name: 'Unbreakable', desc: '+10 HP, 40% less morale damage, +10% survival.', mods: { hp: 10 }, moraleLoss: 0.6, ko: 0.1 },
  // Skirmisher
  { id: 'fleet', tree: 'skirmisher', tier: 0, name: 'Fleet-footed', desc: '+8% speed, +10 stamina.', mods: { speed: 0.08, stamina: 10 } },
  { id: 'volley', tree: 'skirmisher', tier: 1, name: 'Volley', desc: 'Ability: nearby missile-men loose together.', ability: 'volley' },
  { id: 'deep_quiver', tree: 'skirmisher', tier: 2, name: 'Deep Quiver', desc: '+40% ammunition, +6% accuracy, +1 range.', mods: { accuracy: 0.06, range: 1 }, ammoMult: 1.4 },
  { id: 'eagle_eye', tree: 'skirmisher', tier: 3, name: 'Eagle Eye', desc: 'Aura: nearby allies shoot straighter and harder.', aura: 'eagle' },
  { id: 'skirmish_master', tree: 'skirmisher', tier: 4, name: 'Skirmish Master', desc: '+2 missile damage, +6% speed, +10% survival.', mods: { rangedDmg: 2, speed: 0.06 }, ko: 0.1 },
  // Warrior
  { id: 'brawler', tree: 'warrior', tier: 0, name: 'Brawler', desc: '+1.2 melee damage, +0.1 morale shock.', mods: { dmg: 1.2, moraleShock: 0.1 } },
  { id: 'berserk', tree: 'warrior', tier: 1, name: 'Berserk', desc: 'Ability: a short battle fury.', ability: 'berserk' },
  { id: 'bloodlust', tree: 'warrior', tier: 2, name: 'Bloodlust', desc: 'Each kill restores 8 morale and 10 stamina. +6 HP.', mods: { hp: 6 }, bloodlust: true },
  { id: 'rally_cry', tree: 'warrior', tier: 3, name: 'Rally Cry', desc: 'Ability: a shout that steadies and rallies.', ability: 'rally' },
  { id: 'warlord', tree: 'warrior', tier: 4, name: 'Warlord', desc: 'Aura: nearby allies strike harder.', aura: 'warlord' },
  // Class perks (their tier is the usual one; the class tree decides the order)
  { id: 'drilled', tree: 'hoplite', tier: 0, classOnly: true, name: 'Drilled', desc: '+5 morale, +4% block.', mods: { morale: 5, block: 0.04 } },
  { id: 'iron_discipline', tree: 'hoplite', tier: 2, classOnly: true, name: 'Iron Discipline', desc: '+6 morale, 20% less morale damage.', mods: { morale: 6 }, moraleLoss: 0.8 },
  { id: 'shield_breaker', tree: 'warrior', tier: 0, classOnly: true, name: 'Shield Breaker', desc: '+10% shield pierce, +1 damage.', mods: { blockPierce: 0.1, dmg: 1 } },
  { id: 'reaping_blow', tree: 'warrior', tier: 2, classOnly: true, name: 'Reaping Blow', desc: '+2.5 damage, +0.15 morale shock.', mods: { dmg: 2.5, moraleShock: 0.15 } },
  { id: 'longshot', tree: 'skirmisher', tier: 0, classOnly: true, name: 'Longshot', desc: '+1.5 range, +4% accuracy.', mods: { range: 1.5, accuracy: 0.04 } },
  { id: 'lead_bullets', tree: 'skirmisher', tier: 0, classOnly: true, name: 'Lead Bullets', desc: '+1.5 missile damage.', mods: { rangedDmg: 1.5 } },
  { id: 'zealot', tree: 'warrior', tier: 0, classOnly: true, name: 'Zealot', desc: '+5 morale, 30% less morale damage.', mods: { morale: 5 }, moraleLoss: 0.7 },
  { id: 'horsemanship', tree: 'rider', tier: 0, classOnly: true, name: 'Horsemanship', desc: '+6% speed, +10 stamina, +6 HP.', mods: { speed: 0.06, stamina: 10, hp: 6 } },
  { id: 'parthian_shot', tree: 'rider', tier: 2, classOnly: true, name: 'Parthian Shot', desc: '+8% accuracy, +25% arrows.', mods: { accuracy: 0.08 }, ammoMult: 1.25 },
  { id: 'lance_charge', tree: 'rider', tier: 1, classOnly: true, name: 'Lance Charge', desc: '+0.3 charge impact, +1.5 damage.', mods: { chargeBonus: 0.3, dmg: 1.5 } },
  { id: 'ride_down', tree: 'rider', tier: 2, classOnly: true, name: 'Ride Down', desc: '+50% damage to routing men, +0.2 morale shock.', mods: { moraleShock: 0.2 }, pursuit: 0.5 },
  { id: 'scythe_master', tree: 'rider', tier: 2, classOnly: true, name: 'Scythe Master', desc: 'Scythed wheels cut 40% deeper.', scythe: 0.4 },
];

export const PERKS: Record<PerkId, PerkDef> = Object.fromEntries(perkList.map((p) => [p.id, p])) as Record<PerkId, PerkDef>;
export const PERK_LIST: readonly PerkDef[] = perkList;

/** A legacy tree (heroes without a class): its five perks in tier order. */
export function treePerks(tree: TreeId): PerkDef[] {
  return perkList.filter((p) => p.tree === tree && !p.classOnly).sort((a, b) => a.tier - b.tier);
}

/**
 * Class trees are registered by src/data/classes.ts (kept out of this module
 * to avoid an import cycle): class id -> five perk ids, tier 0..4.
 */
const classTrees = new Map<string, readonly PerkId[]>();
export function registerClassTree(cls: string, tree: readonly PerkId[]): void {
  classTrees.set(cls, tree);
}

/** The perk tree a hero follows: his class tree, or the perk's legacy tree. */
export function heroTree(h: { cls?: string }, id?: PerkId): readonly PerkId[] {
  const t = h.cls ? classTrees.get(h.cls) : undefined;
  if (t) return t;
  const p = id ? PERKS[id] : undefined;
  return p ? treePerks(p.tree).map((q) => q.id) : [];
}

/** Perk points a hero of this level has earned in total. */
export function perkSlots(level: number): number {
  return PERK_LEVELS.filter((l) => l <= level).length;
}

/** Why a hero cannot take a perk, or null if he can. */
export function perkBlocker(h: { level: number; perks: readonly PerkId[]; cls?: string }, id: PerkId): string | null {
  if (h.perks.includes(id)) return 'Known';
  const tree = heroTree(h, id);
  const tier = tree.indexOf(id);
  if (tier < 0) return 'Another class';
  // the most lasting reason first: a perk of a later level says when it opens, not that no point is free today
  if (h.level < PERK_LEVELS[tier]) return `Needs Lv ${PERK_LEVELS[tier]}`;
  if (tier > 0 && !h.perks.includes(tree[tier - 1])) return `Needs ${PERKS[tree[tier - 1]].name}`;
  if (h.perks.length >= perkSlots(h.level)) return 'No perk point';
  return null;
}
