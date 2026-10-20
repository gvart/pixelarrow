/**
 * Per-class combat numbers for the war sim, derived once per class from the battle game's
 * data (src/data/classes.ts kits, src/sim/stats.ts computeStats): a level-1 soldier in the
 * first tier-1 kit option of every slot, common gear, no traits or perks. Field units of the
 * battle sim map 1:1 to tiles. Unknown class ids fall back to militia.
 *
 * M5b (docs/WAR.md "Into the live sim"): `warStatsOf(person)` bakes a persistent soldier the same way from his own hero
 * (level, attributes, gear), adds his P skills and honours, and clamps the result against the class baseline (the fresh
 * soldier above, `warStats(cls)`) so a max soldier stays within the power curve; F skills and item powers become at most
 * MAX_FLAGS bits of `flags`.
 */
import { CLASSES, isClassId, type ClassId } from '../../data/classes';
import { BASE, type Equipment, type Hero } from '../../data/units';
import type { Rarity } from '../../data/items';
import { itemPower } from '../../data/affixes';
import type { MissileKind, WarPerson } from '../types';
import { computeStats, type CombatStats } from '../../sim/stats';
import { mobKindOf, MOBS } from './mobs';
import { F, MAX_FLAGS, SKILLS } from './skills';
import { woundedShare } from './soldiers';

export interface WarStats {
  maxHp: number;
  dmg: number; // melee, before armour
  reach: number; // tiles
  atkTicks: number;
  rangedDmg: number;
  range: number; // tiles, 0 = no missiles
  ammo: number;
  shotTicks: number;
  shotSpeed: number; // tiles/s
  missile: MissileKind;
  accuracy: number;
  armor: number;
  block: number;
  ap: number; // armour pierce of missiles, 0..1
  speed: number; // multiplier over a man on foot
  knock?: number; // tiles a landed blow throws the target back (mobs.ts: boar)
  /** M5b: share of the target's block his blows and missiles ignore (computeStats blockPierce, Shield Breaker). */
  bp: number;
  /** M5b: share of falls that leave him wounded rather than dead (END, docs/WAR.md "Lifecycle"). */
  ws: number;
  /** M5b: F skill and item power bits (./skills.ts F), at most MAX_FLAGS set. */
  flags: number;
}

/** The power cap of a baked soldier against the fresh soldier of his class (docs/WAR.md "Clamp"). */
export const CLAMP = { hp: 1.4, dmg: 1.4, armor: 4, block: 0.1, accuracy: 0.12, atk: 0.85, speed: 1.1 };

const cache = new Map<string, WarStats>();
const COMMON: Rarity = 'common';
const classId = (cls: string): ClassId => (isClassId(cls) ? cls : 'militia');
const ticks = (sec: number) => Math.max(1, Math.round(sec * 10));

export function warStats(cls: string): WarStats {
  let s = cache.get(cls);
  if (s) return s;
  const mob = mobKindOf(cls);
  if (mob) {
    // fauna and bandits (./mobs.ts, class mob_<kind>): their base class scaled; beasts carry no missiles
    const m = MOBS[mob], b = warStats(m.base), beast = mob !== 'bandit';
    s = {
      ...b, maxHp: Math.round(b.maxHp * m.hp), dmg: b.dmg * m.dmg, speed: m.speed, armor: m.armor ?? b.armor, block: m.block ?? b.block,
      reach: m.reach ?? b.reach, atkTicks: m.atk ? Math.max(1, Math.round(m.atk * 10)) : b.atkTicks,
      ...(beast ? { range: 0, ammo: 0, rangedDmg: 0 } : {}), ...(m.knock ? { knock: m.knock } : {}),
    };
    cache.set(cls, s);
    return s;
  }
  const h = freshHero(cls);
  s = bake(computeStats(h), h.attrs.end);
  cache.set(cls, s);
  return s;
}

function bake(c: CombatStats, end: number): WarStats {
  return {
    maxHp: c.maxHp, dmg: c.dmg, reach: c.reach, atkTicks: ticks(c.atkTime),
    rangedDmg: c.rangedDmg, range: c.ammo > 0 ? c.range : 0, ammo: c.ammo, shotTicks: ticks(c.shotTime),
    shotSpeed: c.weapon === 'sling' ? 16 : c.weapon === 'javelins' ? 12 : 20,
    missile: c.weapon === 'sling' ? 'stone' : c.weapon === 'javelins' ? 'javelin' : 'arrow',
    accuracy: c.accuracy, armor: c.armor, block: c.block, ap: c.armorPierce ?? 0, speed: c.speed / BASE.speed,
    bp: c.blockPierce, ws: woundedShare(end), flags: 0,
  };
}

/** Kit item of `slot` at tier index `tier` (0..2; an empty tier falls back to the one below): its first option. */
export function kitItem(cls: string, slot: 'weapon' | 'shield' | 'helmet' | 'armor', tier = 0): string | undefined {
  const k = CLASSES[classId(cls)].kit[slot];
  for (let t = Math.min(tier, (k?.length ?? 1) - 1); t >= 0; t--) {
    const item = k?.[t]?.find((x) => x);
    if (item) return item;
  }
  return undefined;
}

/** The fresh soldier of a class: level 1, the class's attributes, the first tier-1 kit option of every slot, common. */
export function freshHero(cls: string, id = `war-${classId(cls)}`): Hero {
  const cid = classId(cls);
  const def = CLASSES[cid];
  const equip: Equipment = {};
  for (const slot of ['weapon', 'shield', 'helmet', 'armor'] as const) {
    const item = def.kit[slot]?.[0]?.find((x) => x);
    if (item) equip[slot] = { uid: `war-${cid}-${slot}`, def: item, rarity: COMMON, cond: 100 };
  }
  return {
    id, name: def.name, culture: def.cultures[0] ?? 'greek', level: 1, xp: 0, traits: [],
    look: { skin: 0, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' }, equip, kills: 0, battles: 0,
    group: def.group, attrs: { ...def.attrs }, points: 0, perks: [], wound: 0, cls: cid,
  };
}

/** Item powers that work as war flags. */
const POWER_FLAGS: Partial<Record<string, number>> = { executioner: F.finisher };

/**
 * Bake a person (M5b): computeStats of his hero, P skills and honours on top, clamped against warStats(class) (HP, damage,
 * armour, block, accuracy, attack and shot time, speed); flags from F skills, then item powers, at most MAX_FLAGS.
 * About 20 us: at spawn and level-up only.
 */
export function warStatsOf(p: WarPerson | Hero): WarStats {
  const person: WarPerson = 'hero' in p ? p : { id: p.id, hero: p };
  const hero = person.hero;
  const cls = classId(hero.cls ?? '');
  const b = warStats(cls);
  const s = bake(computeStats({ ...hero, cls, perks: [] }), hero.attrs.end);
  if (b.range === 0) (s.range = 0), (s.ammo = 0), (s.rangedDmg = 0); // a class without missiles fights without them
  let flags = 0, nf = 0;
  const flag = (f: number) => {
    if (nf < MAX_FLAGS && !(flags & f)) (flags |= f), nf++;
  };
  for (const id of person.skills ?? []) {
    const k = SKILLS[id];
    if (!k) continue;
    if (k.kind === 'F' && k.flag) flag(k.flag);
    if (k.kind !== 'P') continue;
    s.dmg += k.dmg ?? 0;
    s.reach += k.reach ?? 0;
    s.armor += k.armor ?? 0;
    s.block += k.block ?? 0;
    s.accuracy += k.accuracy ?? 0;
    s.bp += k.bp ?? 0;
    if (s.range > 0) {
      s.range += k.range ?? 0;
      s.ammo = Math.round(s.ammo * (k.ammo ?? 1));
    }
  }
  for (const it of Object.values(hero.equip)) {
    const pow = it ? itemPower(it) : null;
    const f = pow ? POWER_FLAGS[pow.id] : undefined;
    if (f) flag(f);
  }
  for (const h of person.honours?.slice(0, 3) ?? []) {
    if (h.stat === 'hp') s.maxHp *= 1.02;
    else if (h.stat === 'dmg') (s.dmg *= 1.02), (s.rangedDmg *= 1.02);
    else if (h.stat === 'armor') s.armor *= 1.02;
    else if (h.stat === 'block') s.block *= 1.02;
    else s.accuracy *= 1.02;
  }
  s.maxHp = Math.round(Math.min(s.maxHp, b.maxHp * CLAMP.hp));
  s.dmg = Math.min(s.dmg, b.dmg * CLAMP.dmg);
  s.rangedDmg = Math.min(s.rangedDmg, b.rangedDmg * CLAMP.dmg);
  s.armor = Math.min(s.armor, b.armor + CLAMP.armor);
  s.block = Math.min(s.block, b.block + CLAMP.block);
  s.accuracy = Math.min(s.accuracy, b.accuracy + CLAMP.accuracy);
  s.atkTicks = Math.max(s.atkTicks, Math.round(b.atkTicks * CLAMP.atk));
  s.shotTicks = Math.max(s.shotTicks, Math.round(b.shotTicks * CLAMP.atk));
  s.speed = Math.min(s.speed, b.speed * CLAMP.speed);
  s.flags = flags;
  return s;
}
