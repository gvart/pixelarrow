/**
 * Per-class combat numbers for the war sim, derived once per class from the battle game's
 * data (src/data/classes.ts kits, src/sim/stats.ts computeStats): a level-1 soldier in the
 * first tier-1 kit option of every slot, common gear, no traits or perks. Field units of the
 * battle sim map 1:1 to tiles. Unknown class ids fall back to militia.
 */
import { CLASSES, isClassId, type ClassId } from '../../data/classes';
import { BASE, type Equipment } from '../../data/units';
import type { Rarity } from '../../data/items';
import type { MissileKind } from '../types';
import { computeStats } from '../../sim/stats';

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
}

const cache = new Map<string, WarStats>();
const COMMON: Rarity = 'common';

export function warStats(cls: string): WarStats {
  let s = cache.get(cls);
  if (s) return s;
  const id: ClassId = isClassId(cls) ? cls : 'militia';
  const def = CLASSES[id];
  const equip: Equipment = {};
  for (const slot of ['weapon', 'shield', 'helmet', 'armor'] as const) {
    const item = def.kit[slot]?.[0]?.find((x) => x);
    if (item) equip[slot] = { uid: `war-${id}-${slot}`, def: item, rarity: COMMON, cond: 100 };
  }
  const c = computeStats({
    id: `war-${id}`, name: def.name, culture: def.cultures[0] ?? 'greek', level: 1, xp: 0, traits: [],
    look: { skin: 0, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' }, equip, kills: 0, battles: 0,
    group: def.group, attrs: def.attrs, points: 0, perks: [], wound: 0, cls: id,
  });
  const ticks = (sec: number) => Math.max(1, Math.round(sec * 10));
  s = {
    maxHp: c.maxHp, dmg: c.dmg, reach: c.reach, atkTicks: ticks(c.atkTime),
    rangedDmg: c.rangedDmg, range: c.ammo > 0 ? c.range : 0, ammo: c.ammo, shotTicks: ticks(c.shotTime),
    shotSpeed: c.weapon === 'sling' ? 16 : c.weapon === 'javelins' ? 12 : 20,
    missile: c.weapon === 'sling' ? 'stone' : c.weapon === 'javelins' ? 'javelin' : 'arrow',
    accuracy: c.accuracy, armor: c.armor, block: c.block, ap: c.armorPierce ?? 0, speed: c.speed / BASE.speed,
  };
  cache.set(cls, s);
  return s;
}
