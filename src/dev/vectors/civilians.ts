/**
 * Civilian vectors (src/war/sim/civilians.ts) for the Godot port: civJob, CLIP and AT_BUILDING per class, workRate and
 * toolMods over levels, tool tiers, rarities and affixes (malformed ones too), freshCivilian per class, wornest over
 * equip sets in different key orders, fallShare, and the numbers the sim reads.
 */
import {
  AT_BUILDING, CIV, CIV_QUOTA, CIV_XP, civJob, CLIP, COOK, ENGINEER, FORAGE, FORAGER, fallShare, freshCivilian, HUNT, PHYSICIAN, REGION_CAP, REMEDY, SMITH,
  VENOM, WORK, workRate, wornest, type CivJob,
} from '../../war/sim/civilians';
import { CIV_CLASSES, CIV_TOOLS, CLASSES } from '../../data/classes';
import { RARITIES, type Item } from '../../data/items';
import { toolMods } from '../../data/recipes';
import { Rng } from '../../sim/rng';
import type { Hero } from '../../data/units';
import type { WarPerson } from '../../war/types';

const item = (def: string, rarity: string, cond = 100, aff?: string): Item => ({ uid: `u-${def}`, def, rarity, cond, ...(aff !== undefined ? { aff } : {}) }) as Item;

export const vectors = () => {
  const r = new Rng(2024);
  const classes = [...Object.keys(CIV_CLASSES), ...Object.keys(CLASSES).slice(0, 4), 'civ_', 'civ_baker', 'mob_wolf', ''];
  const jobs: (CivJob | string)[] = ['cook', 'smith', 'merchant', 'engineer', 'physician', 'forager', 'baker', ''];
  const affs = [undefined, '', 'deft:1', 'deft:2', 'deft:3,bountiful:1', 'bountiful:2', 'deft', 'deft:', 'deft:x', 'deft: 2 ', 'swift:1,deft:1', 'deft:1:9', 'deft:0.5'];
  const tools = [undefined, ...Object.keys(CIV_TOOLS), 'bronze_sword', 'nothing'];
  const rates: unknown[] = [];
  for (const t of tools) for (const level of [1, 2, 7, 20]) {
    const rarity = [...RARITIES, 'mythic'][r.int(0, RARITIES.length)], aff = affs[r.int(0, affs.length - 1)];
    const tool = t === undefined ? undefined : item(t, rarity, 100, aff);
    const hero = { level, equip: tool ? { weapon: tool } : {} } as unknown as Hero;
    rates.push([level, tool ?? null, workRate(hero)]);
  }
  const mods = affs.map((aff) => { const t = aff === undefined ? undefined : item('ladle', 'common', 100, aff); return [t ?? null, toolMods(t).deft, toolMods(t).bountiful]; });
  const fresh = [...Object.keys(CIV_CLASSES).map((c) => [c, null, freshCivilian(c as keyof typeof CIV_CLASSES)]), ['civ_cook', 'p-7', freshCivilian('civ_cook', 'p-7')]];
  const slots = ['weapon', 'armor', 'helmet', 'shield', 'boots'];
  const worn = Array.from({ length: 60 }, (_, i) => {
    const order = r.shuffle([...slots]).slice(0, r.int(0, slots.length));
    const equip: [string, Item | null][] = order.map((s) => [s, r.chance(0.2) ? null : item(`${s}_x`, 'common', i < 6 ? 100 : [100, 50, 40, 99.5, 12, 40][r.int(0, 5)])]);
    const p = { hero: { equip: Object.fromEntries(equip.map(([s, it]) => [s, it ?? undefined])) } } as unknown as WarPerson;
    return [equip, wornest(p) ?? null];
  });
  const falls = Array.from({ length: 60 }, () => {
    const a = [r.range(-0.2, 0.9), r.chance(0.5), r.int(0, 3), r.chance(0.3)] as const;
    return [...a, fallShare(a[0], a[1], a[2], a[3])];
  });
  const consts = [REGION_CAP, CIV.quota, CIV.fleeR, CIV.calmR, CIV.calm, CIV.fleeSpeed, CIV.away, CIV.every, CIV.at, CIV.dmg, CIV.armor, CIV.hp, CIV_QUOTA,
    COOK.batch, COOK.food, COOK.salt, COOK.rations, COOK.saltBonus, COOK.feedR, COOK.fedTicks, COOK.inn, COOK.heal,
    SMITH.batch, SMITH.copper, SMITH.tin, SMITH.bronze, SMITH.repairR, SMITH.repair, ENGINEER.build, FORAGER.gather,
    PHYSICIAN.r, PHYSICIAN.surgeonR, PHYSICIAN.heal, PHYSICIAN.near, FORAGE.woodsman, FORAGE.prospector, FORAGE.pitchman, FORAGE.masterBuilder,
    HUNT.r, HUNT.hides, REMEDY.bandage, REMEDY.feedR, REMEDY.theriac, VENOM.ticks, VENOM.share, CIV_XP, WORK.perLevel, WORK.perTier, WORK.perRarity,
    CIV.fleeSpeed, 1];
  return {
    jobs: classes.map((c) => [c, civJob(c)]),
    clips: jobs.map((j) => [j, CLIP[j as CivJob] ?? null, AT_BUILDING.includes(j as CivJob)]),
    rates, mods, fresh, worn, falls, consts,
  };
};
