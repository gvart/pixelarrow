import { itemDef, itemMods, SLOTS, type StatMods, type WeaponKind, type ShieldKind } from '../data/items';
import { TRAITS } from '../data/traits';
import { BASE, type Hero } from '../data/units';

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
}

export function collectMods(hero: Hero): StatMods[] {
  const mods: StatMods[] = [];
  for (const slot of SLOTS) {
    const it = hero.equip[slot];
    if (it) mods.push(itemMods(it));
  }
  for (const t of hero.traits) mods.push(TRAITS[t].mods);
  return mods;
}

export function computeStats(hero: Hero): CombatStats {
  const lvl = hero.level;
  const weapon = hero.equip.weapon ? itemDef(hero.equip.weapon.def) : undefined;
  const shieldItem = hero.equip.shield;
  const shieldDef = shieldItem ? itemDef(shieldItem.def) : undefined;
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
  };

  let speedMod = 0;
  for (const slot of SLOTS) {
    const it = hero.equip[slot];
    if (!it) continue;
    if (slot === 'shield' && !shieldUsable) continue;
    const m = itemMods(it);
    // Weapon defines reach / timing absolutely; everything else is additive.
    if (slot === 'weapon') {
      if (m.reach !== undefined) s.reach = m.reach;
      if (m.atkTime !== undefined) s.atkTime = m.atkTime;
      if (m.shotTime !== undefined) s.shotTime = m.shotTime;
    }
    s.dmg += m.dmg ?? 0;
    addCommon(s, m);
    speedMod += m.speed ?? 0;
  }
  for (const t of hero.traits) {
    const def = TRAITS[t];
    addCommon(s, def.mods);
    if (def.mods.dmg) s.dmg += def.mods.dmg;
    speedMod += def.mods.speed ?? 0;
    if (def.moraleLoss) s.moraleLoss *= def.moraleLoss;
  }
  if (s.rangedDmg > 0) s.rangedDmg += (lvl - 1) * 0.3;
  s.speed = BASE.speed * (1 + speedMod);
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
}

/** Rough combat power of a hero, used to scale the bot's army. */
export function heroPower(hero: Hero): number {
  const s = computeStats(hero);
  const melee = (s.dmg / s.atkTime) * (1 + (s.reach - 1) * 0.35);
  const ranged = s.range > 0 ? (s.rangedDmg * Math.min(s.ammo, 12)) / 12 : 0;
  const ehp = s.maxHp * (1 + s.armor / 12) / (1 - s.block * 0.8);
  return Math.sqrt(ehp * (melee + ranged * 0.8 + 1)) * (0.7 + s.morale / 160);
}
