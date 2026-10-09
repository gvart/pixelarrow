import { itemDef, itemMods, SLOTS, type StatMods, type WeaponKind, type ShieldKind } from '../data/items';
import { itemPower, type ItemPower } from '../data/affixes';
import { classGearBlocker, shortfall } from '../data/gearRules';
import { activeBonuses, type SetSpecial } from '../data/sets';
import { TRAITS } from '../data/traits';
import { BASE, type Hero } from '../data/units';
import { isMythId } from '../data/beasts';
import { CLASSES, MOUNTS, classOfHero, type BeastId, type ClassDef, type MountId } from '../data/classes';
import {
  ABILITY_RULES, ATTR_BASE, ATTR_EFFECT, KO_BASE, PERKS, RALLY_WILL, defaultAttrs,
  type AbilityId, type AuraId,
} from '../data/perks';

/** Fully derived stats used by the battle simulation. */
export interface CombatStats {
  maxHp: number;
  dmg: number;
  reach: number;
  atkTime: number;
  rangedDmg: number;
  range: number;
  ammo: number;
  shotTime: number;
  accuracy: number;
  block: number;
  blockPierce: number;
  armor: number;
  morale: number;
  stamina: number;
  speed: number;
  chargeBonus: number;
  moraleShock: number;
  moraleLoss: number;
  xpBonus: number;
  weapon: WeaponKind | 'none';
  shield: ShieldKind | 'none';
  canShieldWall: boolean;
  role: 'melee' | 'ranged' | 'hybrid';
  /** Active abilities (from perks, or Will for Rally Cry). */
  abilities: AbilityId[];
  /** Auras this hero projects. */
  auras: AuraId[];
  /** Chance a mortal blow only knocks him out. */
  koChance: number;
  /** Will attribute (scales shout and aura radius). */
  will: number;
  /** Ability cooldown multiplier (Will). */
  cdMult: number;
  /** Kills restore morale and stamina. */
  bloodlust: boolean;
  // ---- optional fields (unit classes). Missing = a man on foot with the old rules.
  /** Unit class id (drawing, bot tactics). */
  cls?: string;
  /** Rides a horse or a chariot (src/data/classes.ts MOUNTS). */
  mount?: MountId;
  /** An animal (no gear, no formation, pack behaviour). */
  kind?: 'animal';
  beast?: BeastId;
  /** Body radius in field units (0.3 for a man). */
  radius?: number;
  /** Routs below this fraction of max morale (default RULES.routFraction). */
  routAt?: number;
  /** Extra damage fraction against routing men. */
  pursuit?: number;
  /** Extra scythe damage fraction (chariots). */
  scythe?: number;
  /** Missiles: fraction of the target's armour ignored. */
  armorPierce?: number;
  /** A mythical beast or a part of one (src/data/beasts.ts MythId): src/sim/myth.ts runs it. */
  boss?: string;
  /** Item powers the hero carries (best grade per power, src/data/affixes.ts). */
  powers?: ItemPower[];
  /** Special effects of complete-enough item sets (src/data/sets.ts). */
  setSpecials?: SetSpecial[];
  /** Fraction of missile damage the wearer shrugs off (the Nemean lion pelt). */
  missileWard?: number;
  /** Accuracy enemy missiles lose against the wearer (the Helm of Hades). */
  shroud?: number;
}

/** Radius bonus from Will for auras and shouts. */
export function willRadius(s: { will: number }): number {
  return (s.will - ATTR_BASE) * ATTR_EFFECT.wilRadius;
}

/** Shout radius for Rally Cry. */
export function rallyRadius(s: { will: number }): number {
  return ABILITY_RULES.rallyRadius + willRadius(s);
}

export function collectMods(hero: Hero): StatMods[] {
  const mods: StatMods[] = [];
  for (const slot of SLOTS) {
    const it = hero.equip[slot];
    if (it) mods.push(itemMods(it, hero.attrs));
  }
  for (const t of hero.traits) mods.push(TRAITS[t].mods);
  return mods;
}

/** The class definition of a hero (derived for heroes from before classes). */
export function heroClass(hero: Hero): ClassDef {
  return CLASSES[classOfHero({ cls: hero.cls, arch: hero.arch, culture: hero.culture, weaponDef: hero.equip.weapon?.def })];
}

/** An animal's stats: from its class numbers and level, no gear. */
function beastStats(hero: Hero, cls: ClassDef): CombatStats {
  const b = cls.beastStats!;
  const k = 1 + 0.08 * (hero.level - 1);
  const s: CombatStats = {
    maxHp: Math.round(b.hp * k),
    dmg: b.dmg * k,
    reach: b.reach,
    atkTime: b.atkTime,
    rangedDmg: 0,
    range: 0,
    ammo: 0,
    shotTime: 2,
    accuracy: 0.6,
    block: 0,
    blockPierce: 0.1,
    armor: b.armor,
    morale: Math.round(b.morale * (1 + 0.04 * (hero.level - 1))),
    stamina: 120,
    speed: BASE.speed * b.speed,
    chargeBonus: b.chargeBonus,
    moraleShock: b.moraleShock,
    moraleLoss: 1,
    xpBonus: 0,
    weapon: 'none',
    shield: 'none',
    canShieldWall: false,
    role: 'melee',
    abilities: [],
    auras: [],
    koChance: 0,
    will: ATTR_BASE,
    cdMult: 1,
    bloodlust: false,
    cls: cls.id,
    kind: 'animal',
    beast: cls.beast,
    radius: b.radius,
    routAt: b.routAt,
  };
  if (isMythId(cls.beast)) s.boss = cls.beast;
  return s;
}

export function computeStats(hero: Hero): CombatStats {
  const cls = heroClass(hero);
  if (cls.kind === 'animal' && cls.beastStats) return beastStats(hero, cls);
  const lvl = hero.level;
  // gear the class may not use is as good as not worn (docs/ITEMS.md "Class limits")
  const usable = (slot: 'weapon' | 'shield') => {
    const it = hero.equip[slot];
    return it && !classGearBlocker(cls.id, itemDef(it.def)) ? itemDef(it.def) : undefined;
  };
  const weapon = usable('weapon');
  const shieldDef = usable('shield');
  const shieldUsable = !!shieldDef && !weapon?.twoHanded;

  const s: CombatStats = {
    maxHp: BASE.hp + BASE.hpPerLevel * (lvl - 1),
    dmg: BASE.dmg + BASE.dmgPerLevel * (lvl - 1),
    reach: BASE.reach,
    atkTime: BASE.atkTime,
    rangedDmg: 0,
    range: 0,
    ammo: 0,
    shotTime: 2,
    accuracy: BASE.accuracy + BASE.accuracyPerLevel * (lvl - 1),
    block: 0,
    blockPierce: 0,
    armor: 0,
    morale: BASE.morale + BASE.moralePerLevel * (lvl - 1),
    stamina: BASE.stamina,
    speed: BASE.speed,
    chargeBonus: 0,
    moraleShock: 0,
    moraleLoss: 1,
    xpBonus: 0,
    weapon: (weapon?.weaponKind ?? 'none') as WeaponKind | 'none',
    shield: shieldUsable ? (shieldDef!.shieldKind as ShieldKind) : 'none',
    canShieldWall: shieldUsable && !!shieldDef!.shieldWall,
    role: 'melee',
    abilities: [],
    auras: [],
    koChance: KO_BASE,
    will: ATTR_BASE,
    cdMult: 1,
    bloodlust: false,
  };

  let speedMod = 0;
  let atkSpeed = 0;
  const setCount = new Map<string, number>();
  const powers = new Map<string, ItemPower>();
  for (const slot of SLOTS) {
    const it = hero.equip[slot];
    if (!it) continue;
    // gear the hero's class may not use does nothing (docs/ITEMS.md "Class limits")
    if (classGearBlocker(cls.id, itemDef(it.def))) continue;
    // a set piece counts, and a power works, only while its requirements are met
    const met = shortfall(hero.attrs, it.def, it.rarity) === 0;
    const set = itemDef(it.def).set;
    if (set && met) setCount.set(set, (setCount.get(set) ?? 0) + 1);
    if (slot === 'shield' && !shieldUsable) continue;
    const m = itemMods(it, hero.attrs);
    atkSpeed += m.atkSpeed ?? 0;
    const pow = met ? itemPower(it) : null;
    if (pow && (powers.get(pow.id)?.grade ?? -1) < pow.grade) powers.set(pow.id, pow);
    // a named item's extra works like its power: only while its requirements are met
    const def = itemDef(it.def);
    if (met && def.missileWard) s.missileWard = Math.max(s.missileWard ?? 0, def.missileWard);
    if (met && def.shroud) s.shroud = Math.max(s.shroud ?? 0, def.shroud);
    // Weapon defines reach / timing absolutely; everything else is additive.
    if (slot === 'weapon') {
      if (m.reach !== undefined) s.reach = m.reach;
      if (m.atkTime !== undefined) s.atkTime = m.atkTime;
      if (m.shotTime !== undefined) s.shotTime = m.shotTime;
    }
    s.dmg += m.dmg ?? 0;
    addCommon(s, m);
    speedMod += m.speed ?? 0;
    if (slot === 'weapon' && m.armorPierce) s.armorPierce = m.armorPierce;
  }
  // set bonuses: stat lines add like gear, special lines run in the battle
  const specials: SetSpecial[] = [];
  for (const [set, n] of setCount) {
    for (const b of activeBonuses(set, n)) {
      if (b.special) specials.push(b.special);
      if (!b.mods) continue;
      addCommon(s, b.mods);
      s.dmg += b.mods.dmg ?? 0;
      speedMod += b.mods.speed ?? 0;
      atkSpeed += b.mods.atkSpeed ?? 0;
    }
  }
  if (specials.length) s.setSpecials = specials;
  if (powers.size) s.powers = [...powers.values()];
  for (const t of hero.traits) {
    const def = TRAITS[t];
    addCommon(s, def.mods);
    if (def.mods.dmg) s.dmg += def.mods.dmg;
    speedMod += def.mods.speed ?? 0;
    if (def.moraleLoss) s.moraleLoss *= def.moraleLoss;
  }
  // Class traits: like a trait, on top of the gear.
  addCommon(s, cls.mods);
  s.dmg += cls.mods.dmg ?? 0;
  speedMod += cls.mods.speed ?? 0;
  if (cls.moraleLoss) s.moraleLoss *= cls.moraleLoss;
  s.cls = cls.id;
  if (cls.routAt !== undefined) s.routAt = cls.routAt;
  let pursuit = 0;
  let scythe = 0;
  // Perks: stat mods like traits, plus abilities, auras and hooks.
  let ammoMult = 1;
  for (const id of hero.perks ?? []) {
    const p = PERKS[id];
    if (!p) continue;
    if (p.mods) {
      addCommon(s, p.mods);
      s.dmg += p.mods.dmg ?? 0;
      s.reach += p.mods.reach ?? 0;
      speedMod += p.mods.speed ?? 0;
    }
    if (p.moraleLoss) s.moraleLoss *= p.moraleLoss;
    if (p.ko) s.koChance += p.ko;
    if (p.ammoMult) ammoMult *= p.ammoMult;
    if (p.ability && !s.abilities.includes(p.ability)) s.abilities.push(p.ability);
    if (p.aura && !s.auras.includes(p.aura)) s.auras.push(p.aura);
    if (p.bloodlust) s.bloodlust = true;
    if (p.pursuit) pursuit += p.pursuit;
    if (p.scythe) scythe += p.scythe;
  }
  if (pursuit) s.pursuit = pursuit;
  if (scythe) s.scythe = scythe;
  // Attributes: each point away from ATTR_BASE shifts the derived stats.
  const a = hero.attrs ?? defaultAttrs();
  const E = ATTR_EFFECT;
  const str = a.str - ATTR_BASE;
  const agi = a.agi - ATTR_BASE;
  const end = a.end - ATTR_BASE;
  const wil = a.wil - ATTR_BASE;
  s.dmg += str * E.strDmg;
  s.maxHp += str * E.strHp + end * E.endHp;
  s.chargeBonus += str * E.strCharge;
  speedMod += agi * E.agiSpeed;
  s.accuracy += agi * E.agiAccuracy;
  const tempo = Math.max(0.6, 1 - agi * E.agiTempo);
  s.atkTime *= tempo / (1 + atkSpeed);
  s.shotTime *= tempo;
  s.stamina += end * E.endStamina;
  s.koChance += end * E.endKo;
  s.morale += wil * E.wilMorale;
  s.moraleLoss *= Math.max(0.5, 1 - wil * E.wilSteady);
  s.will = a.wil;
  s.cdMult = Math.max(0.6, 1 - wil * E.wilCooldown);
  if (a.wil >= RALLY_WILL && !s.abilities.includes('rally')) s.abilities.push('rally');
  if (s.ammo > 0) s.ammo = Math.round(s.ammo * ammoMult);

  if (s.rangedDmg > 0) s.rangedDmg += (lvl - 1) * 0.3 + agi * E.agiRanged;
  // Abilities that need gear: a bash needs a shield.
  if (s.shield === 'none') s.abilities = s.abilities.filter((x) => x !== 'bash');
  s.koChance = Math.max(0, Math.min(0.85, s.koChance));
  s.speed = BASE.speed * (1 + speedMod);
  if (cls.mount) {
    // The animal carries him: its speed, wind and weight; his gear and legs count for less.
    const m = MOUNTS[cls.mount];
    s.mount = m.id;
    s.radius = m.radius;
    s.maxHp += m.hp;
    s.stamina += m.stamina;
    s.chargeBonus += m.chargeBonus;
    s.speed = BASE.speed * m.speed * (1 + speedMod * 0.35);
    s.canShieldWall = false;
    s.abilities = s.abilities.filter((x) => x !== 'bash');
  }
  s.block = Math.min(0.8, s.block);
  s.accuracy = Math.max(0.2, Math.min(0.95, s.accuracy));
  s.role = s.range > 0 ? (s.weapon === 'javelins' ? 'hybrid' : 'ranged') : 'melee';
  s.maxHp = Math.round(s.maxHp);
  return s;
}

function addCommon(s: CombatStats, m: StatMods): void {
  s.maxHp += m.hp ?? 0;
  s.rangedDmg += m.rangedDmg ?? 0;
  s.range += m.range ?? 0;
  s.ammo += m.ammo ?? 0;
  s.accuracy += m.accuracy ?? 0;
  s.block += m.block ?? 0;
  s.blockPierce += m.blockPierce ?? 0;
  s.armor += m.armor ?? 0;
  s.morale += m.morale ?? 0;
  s.stamina += m.stamina ?? 0;
  s.chargeBonus += m.chargeBonus ?? 0;
  s.moraleShock += m.moraleShock ?? 0;
  s.xpBonus += m.xpBonus ?? 0;
  s.koChance += m.koChance ?? 0;
  if (m.steady) s.moraleLoss *= Math.max(0.3, 1 - m.steady);
}

/** Rough combat power of a hero, used to scale the bot's army. */
export function heroPower(hero: Hero): number {
  const s = computeStats(hero);
  const melee = (s.dmg / s.atkTime) * (1 + (s.reach - 1) * 0.35);
  const ranged = s.range > 0 ? (s.rangedDmg * Math.min(s.ammo, 12)) / 12 : 0;
  const ehp = s.maxHp * (1 + s.armor / 12) / (1 - s.block * 0.8);
  // Abilities and auras are worth a little on paper (tuned with `npm run balance`).
  const extra = 1 + 0.04 * s.abilities.length + 0.05 * s.auras.length;
  return Math.sqrt(ehp * (melee + ranged * 0.8 + 1)) * (0.7 + s.morale / 160) * extra * (heroClass(hero).power ?? 1);
}
