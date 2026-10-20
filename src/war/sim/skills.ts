/**
 * War skills (docs/WAR.md "Classes", W-37): a family pool of four per class family. P (passive) skills are baked into
 * the unit's WarStats (./classes.ts warStatsOf), F skills set a bit of `flags` that hit resolution reads, and the A skill
 * is the squad active: one per squad, from its best-ranked man who holds one, with a cooldown and a short buff (one
 * damage-dealt and one damage-taken multiplier on the squad). Rider skills are stubs until the war sim has mounts.
 */
import type { ClassId } from '../../data/classes';
import type { WarSkillId } from '../types';

export type Family = 'line' | 'shock' | 'missile' | 'rider';

export const FAMILY_OF: Partial<Record<ClassId, Family>> = {
  militia: 'line', hoplite: 'line', thureophoros: 'line', royal_guard: 'line', sacred_band: 'line',
  celt_sword: 'shock', falx: 'shock', rhomphaia: 'shock', gallic: 'shock', fanatic: 'shock',
  archer: 'missile', slinger: 'missile', javelineer: 'missile', peltast: 'missile',
  companion: 'rider', thessalian: 'rider', horse_archer: 'rider', chariot: 'rider',
};

/** Per-unit flag bits (at most MAX_FLAGS set): read only in hit resolution (./index.ts strike, shoot, land). */
export const F = { holdFast: 1, finisher: 2, fireArcher: 4, lanceCharge: 8, rideDown: 16 } as const;
export const MAX_FLAGS = 3;
/** What the flags do. */
export const FLAG_FX = {
  /** holdFast: block x this while the squad holds. */
  holdBlock: 1.3,
  /** finisher: damage x this against a man below `finishHp` of his max HP. */
  finishDmg: 1.3,
  finishHp: 0.4,
  /** fireArcher: lit brazier reach x this, pitch per fire arrow x this. */
  fireReach: 2,
  firePitch: 0.5,
};

export interface SkillDef {
  family: Family;
  kind: 'P' | 'F' | 'A';
  /** P: baked stat changes (block and accuracy add, ammo multiplies). */
  dmg?: number; reach?: number; armor?: number; block?: number; accuracy?: number; range?: number; ammo?: number;
  /** P: share of the target's block ignored. */
  bp?: number;
  flag?: number;
}

export const SKILLS: Record<WarSkillId, SkillDef> = {
  shieldDrill: { family: 'line', kind: 'P', block: 0.06, armor: 1 },
  phalangite: { family: 'line', kind: 'P', reach: 0.15, dmg: 1 },
  holdFast: { family: 'line', kind: 'F', flag: F.holdFast },
  shieldWall: { family: 'line', kind: 'A' },
  brawler: { family: 'shock', kind: 'P', dmg: 1.2 },
  shieldBreaker: { family: 'shock', kind: 'P', bp: 0.1 },
  finisher: { family: 'shock', kind: 'F', flag: F.finisher },
  berserk: { family: 'shock', kind: 'A' },
  deepQuiver: { family: 'missile', kind: 'P', ammo: 1.4, range: 1 },
  eagleEye: { family: 'missile', kind: 'P', accuracy: 0.06 },
  fireArcher: { family: 'missile', kind: 'F', flag: F.fireArcher },
  volley: { family: 'missile', kind: 'A' },
  horsemanship: { family: 'rider', kind: 'P' },
  lanceCharge: { family: 'rider', kind: 'F', flag: F.lanceCharge },
  rideDown: { family: 'rider', kind: 'F', flag: F.rideDown },
  wheel: { family: 'rider', kind: 'A' },
};

export const SKILL_POOL: Record<Family, WarSkillId[]> = { line: [], shock: [], missile: [], rider: [] };
for (const [id, d] of Object.entries(SKILLS) as [WarSkillId, SkillDef][]) SKILL_POOL[d.family].push(id);

/** Skill slots open at these levels (docs/WAR.md "Record": 2 slots, levels 3 and 7). */
export const SKILL_LEVELS = [3, 7];

/** The squad actives: damage dealt and taken multipliers while the buff lasts. Rider's wheel waits for mounts. */
export const ACTIVES: Partial<Record<WarSkillId, { out: number; in: number }>> = {
  shieldWall: { out: 1, in: 0.5 },
  berserk: { out: 1.4, in: 1.2 },
  volley: { out: 1.5, in: 1 },
};
/** Cooldown in ticks (60 s), 2.5% shorter per WIL point of the leader above 5; buff in ticks (8 s). */
export const ACTIVE = { cooldown: 600, perWil: 0.025, buff: 80 };

export function activeCooldown(wil: number): number {
  return Math.round(ACTIVE.cooldown * Math.max(0.5, 1 - ACTIVE.perWil * Math.max(0, wil - 5)));
}

/** Skills a person may hold at `level` from `picked`: of his family, in open slots, one each. */
export function legalSkills(cls: string, level: number, picked: readonly WarSkillId[] = []): WarSkillId[] {
  const fam = FAMILY_OF[cls as ClassId];
  const slots = SKILL_LEVELS.filter((l) => level >= l).length;
  const out: WarSkillId[] = [];
  for (const id of picked) if (fam && SKILLS[id]?.family === fam && !out.includes(id) && out.length < slots) out.push(id);
  return out;
}
