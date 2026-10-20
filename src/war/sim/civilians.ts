/**
 * Civilians in the war sim (M5f, docs/WAR.md "Soldiers" W-38): six non-combat classes (src/data/classes.ts CIV_CLASSES,
 * ids `civ_<job>`), live units on the region cap inside a 10% quota. They never pick a target, take half the armour, and
 * a civilian squad flees when a foe comes within CIV.fleeR: to the nearest own camp, fort, outpost or storehouse the foe
 * is not at, else straight away; once nothing is near for CIV.calm ticks it takes up the order it dropped.
 *
 * Loops (the batch of each is per man, CIV.every ticks at a time; a man's `work` multiplier is his level and tool):
 *   cook       at an own store building (civWork): food (+ salt) of its store network -> rations; own squads near a working cook eat (one
 *              ration a man) and are fed for COOK.fedTicks: COOK.inn of the damage they take, physician heal x COOK.heal
 *   smith      at a store: copper + tin -> bronze; with no ore, he mends the most worn item of the men near his forge
 *   merchant   no batch (M6a: the sell-surplus stub is gone; he runs a stall, drives carts, brokers in M6)
 *   physician  at a camp or fort: the hurt of his team within PHYSICIAN.r of it heal; anywhere: a man falling within
 *              PHYSICIAN.r of him is wounded rather than killed PHYSICIAN.near more often
 *   engineer   on a build order (sites, repairs) or a siege engine: ENGINEER.build x labour
 *   forager    on a gather order: FORAGER.gather x the soldier's yield
 * Every finished batch is a job: XP.job to the man (reported by endFight like objective XP).
 */
import { CIV_CLASSES, CIV_TOOLS, isCivClass, type CivClassId } from '../../data/classes';
import { RARITIES, type Item } from '../../data/items';
import type { Hero } from '../../data/units';
import type { WarPerson } from '../types';
import { toolMods } from '../../data/recipes';
import { FALL } from './soldiers';

export type CivJob = 'cook' | 'smith' | 'merchant' | 'engineer' | 'physician' | 'forager';
/** Work clip a civilian at his building plays (UnitSnap.work). */
export type CivClip = 'cook' | 'forge' | 'trade' | 'heal';

/** Live units a region holds (W-06); civilians take at most CIV.quota of it, split evenly between the teams present. */
export const REGION_CAP = 600;
export const CIV = {
  quota: 0.1,
  /** A foe this near (tiles) sends a civilian squad running; this far off counts as gone. */
  fleeR: 10, calmR: 14,
  /** Ticks with no foe within calmR before it goes back to work. */
  calm: 30,
  /** Pace while fleeing (over the march pace). */
  fleeSpeed: 1.3,
  /** With no refuge to run to: this far straight away from the foe. */
  away: 16,
  /** Ticks between job batches (the loop runs this often; a batch counts its seconds). */
  every: 10,
  /** A man this near his building's footprint is at work there. */
  at: 2.2,
  /** Combat: share of the militia's blow and armour a civilian has (no missiles, no block). */
  dmg: 0.3, armor: 0.5, hp: 0.8,
};
export const CIV_QUOTA = Math.floor(REGION_CAP * CIV.quota);

export const COOK = { batch: 10, food: 4, salt: 1, rations: 4, saltBonus: 0.5, feedR: 12, fedTicks: 6000, inn: 1 / 1.05, heal: 1.25 };
export const SMITH = { batch: 15, copper: 1, tin: 1, bronze: 2, repairR: 8, repair: 10 };
export const ENGINEER = { build: 1.5 };
export const FORAGER = { gather: 2 };
/** heal: share of max HP per second (r: round his camp or fort, and round him on the field); near: added wounded share (docs/WAR.md "Fall"). */
export const PHYSICIAN = { r: 6, surgeonR: 10, heal: 0.01, near: FALL.physician };
/** M5h node effects on gathering and building (docs/WAR.md "Trees"). */
export const FORAGE = { woodsman: 1.25, prospector: 1.25, pitchman: 2, masterBuilder: 1.25 };
/** M5h Hunter: hides a beast's kill within r tiles brings. */
export const HUNT = { r: 15, hides: 1 };
/** M5h remedies: a bandage adds `bandage` to a falling man's wounded share; squads near a physician at work refill to SQUAD_MAX; theriac lasts `theriac` ticks. */
export const REMEDY = { bandage: 0.05, feedR: 12, theriac: 18000 };
/** M5h venom (mob flag): a bite holds `ticks`; falling with it takes `share` off the wounded share. */
export const VENOM = { ticks: 200, share: 0.2 };

/** A falling man's wounded share: his own (END), + a physician near, + a bandage (x2: Battle Dresser), - venom; within 0..FALL.cap. */
export function fallShare(ws: number, physician: boolean, bandages: number, venom: boolean): number {
  return Math.max(0, Math.min(FALL.cap, ws + (physician ? PHYSICIAN.near : 0) + REMEDY.bandage * bandages - (venom ? VENOM.share : 0)));
}
/** XP per job (docs/WAR.md "Record": meal batch, bar, trade, site, patient). */
export const CIV_XP = 1;
/** Work speed: +3% per level above 1, +10% per tool tier above 1, +5% per rarity step; x(1 + Deft) of a crafted tool. */
export const WORK = { perLevel: 0.03, perTier: 0.1, perRarity: 0.05 };

export const civJob = (cls: string): CivJob | null => (isCivClass(cls) ? (cls.slice(4) as CivJob) : null);
export const CLIP: Partial<Record<CivJob, CivClip>> = { cook: 'cook', smith: 'forge', merchant: 'trade', physician: 'heal' };
/** Jobs done standing at a building (civWork order); the engineer and forager work on build and gather orders. */
export const AT_BUILDING: readonly CivJob[] = ['cook', 'smith', 'merchant', 'physician'];

/** A civilian's work multiplier from his level and the tool in his weapon slot. */
export function workRate(hero: Hero): number {
  const tool = hero.equip.weapon, def = tool ? CIV_TOOLS[tool.def] : undefined;
  const tier = def?.tier ?? 1, rar = tool ? Math.max(0, RARITIES.indexOf(tool.rarity)) : 0;
  return (1 + WORK.perLevel * (hero.level - 1)) * (1 + WORK.perTier * (tier - 1) + WORK.perRarity * rar) * (1 + toolMods(tool).deft); // M5h: Deft
}

/** The fresh civilian of a class: level 1, its attributes, the tier-1 tool (common). */
export function freshCivilian(cls: CivClassId, id = `war-${cls}`): Hero {
  const def = CIV_CLASSES[cls];
  return {
    id, name: def.name, culture: 'greek', level: 1, xp: 0, traits: [],
    look: { skin: 0, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' }, equip: { weapon: { uid: `${id}-tool`, def: def.tools[0], rarity: 'common', cond: 100 } },
    kills: 0, battles: 0, group: 0, attrs: { ...def.attrs }, points: 0, perks: [], wound: 0, cls,
  };
}

/** The most worn item of a person (undefined: all whole). */
export function wornest(p: WarPerson): [string, Item] | undefined {
  let best: [string, Item] | undefined;
  for (const [slot, it] of Object.entries(p.hero.equip)) if (it && it.cond < 100 && (!best || it.cond < best[1].cond)) best = [slot, it];
  return best;
}
