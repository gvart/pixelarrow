/**
 * A local, in-memory soldier roster for the sandbox and tests (M5b), until the server keeps persons (M5e, D1
 * war_persons): makes persons (class, level, kit tier and rarity, skills), hands fit ones out for spawnSquad and takes
 * fight reports back (M5d).
 */
import { ATTR_IDS, ATTR_MAX, POINTS_PER_LEVEL, type AttrId } from '../../data/perks';
import { CLASSES, isClassId } from '../../data/classes';
import { MAX_LEVEL, type Hero } from '../../data/units';
import type { Rarity } from '../../data/items';
import type { FightReport, PersonResult, WarPerson, WarSkillId } from '../types';
import { freshHero, kitItem } from './classes';
import { FAMILY_OF, legalSkills, SKILL_LEVELS, SKILL_POOL, type Family } from './skills';
import { gainXp } from './soldiers';

/** Skills a person takes when none are given: the squad active first (level 3), then the family's best passive (level 7). */
export const DEFAULT_PICKS: Record<Family, WarSkillId[]> = {
  line: ['shieldWall', 'shieldDrill'],
  shock: ['berserk', 'brawler'],
  missile: ['volley', 'eagleEye'],
  rider: ['wheel', 'horsemanship'],
};

export interface PersonOpts {
  level?: number;
  /** Kit tier index 0..2 (tier 1..3) and rarity of every piece. */
  tier?: number;
  rarity?: Rarity;
  skills?: WarSkillId[];
  name?: string;
}

/** Spends the hero's unspent points on his class's two strongest attributes in turn (then the rest), up to ATTR_MAX. */
export function autoSpend(hero: Hero): Hero {
  const h: Hero = { ...hero, attrs: { ...hero.attrs } };
  const base = CLASSES[isClassId(h.cls ?? '') ? (h.cls as keyof typeof CLASSES) : 'militia'].attrs;
  const order: AttrId[] = [...ATTR_IDS].sort((a, b) => base[b] - base[a]);
  for (let i = 0; h.points > 0; i++) {
    const a = [order[i % 2], ...order].find((id) => h.attrs[id] < ATTR_MAX);
    if (!a) break;
    h.attrs[a]++;
    h.points--;
  }
  return h;
}

/** A person of class cls (unknown: militia) at `level`, in kit tier `tier` of `rarity`, points spent, skills legal for his level. */
export function makePerson(id: string, cls: string, o: PersonOpts = {}): WarPerson {
  const level = Math.max(1, Math.min(MAX_LEVEL, o.level ?? 1));
  let hero = freshHero(cls, id);
  hero = { ...hero, name: o.name ?? hero.name, level, points: (level - 1) * POINTS_PER_LEVEL, equip: { ...hero.equip } };
  const tier = o.tier ?? 0, rarity = o.rarity ?? 'common';
  if (tier > 0 || rarity !== 'common')
    for (const slot of ['weapon', 'shield', 'helmet', 'armor'] as const) {
      const def = kitItem(hero.cls!, slot, tier);
      if (def) hero.equip[slot] = { uid: `${id}-${slot}`, def, rarity, cond: 100 };
    }
  hero = autoSpend(hero);
  const fam = FAMILY_OF[hero.cls as keyof typeof FAMILY_OF];
  const skills = legalSkills(hero.cls!, level, o.skills ?? (fam ? DEFAULT_PICKS[fam] : []));
  return { id, hero, skills };
}

export interface Roster {
  add(p: WarPerson): void;
  get(id: string): WarPerson | undefined;
  all(): WarPerson[];
  /** n new persons of a class (ids `${prefix}-k`), added to the roster. */
  recruit(prefix: string, cls: string, n: number, o?: PersonOpts): WarPerson[];
  /** M5d: write a fight back (heroes after XP and level-ups, state). */
  apply(r: FightReport): void;
  /** fit (default), wounded, captive or dead. */
  state(id: string): PersonResult['state'];
  /** Fit persons, for the next spawn. */
  fit(): WarPerson[];
  /** M5g: replace a person's record (a level-up choice, dev XP); unknown ids are ignored. */
  update(p: WarPerson): void;
}

export function createRoster(): Roster {
  const persons = new Map<string, WarPerson>();
  const states = new Map<string, PersonResult['state']>();
  return {
    add: (p) => void persons.set(p.id, p),
    get: (id) => persons.get(id),
    all: () => [...persons.values()],
    recruit(prefix, cls, n, o) {
      const out: WarPerson[] = [];
      for (let k = 0; k < n; k++) {
        const p = makePerson(`${prefix}-${persons.size}`, cls, o);
        persons.set(p.id, p);
        out.push(p);
      }
      return out;
    },
    apply(r) {
      for (const x of r.persons) {
        const p = persons.get(x.pid);
        if (!p) continue;
        persons.set(x.pid, { ...p, hero: x.hero });
        states.set(x.pid, x.state);
      }
    },
    state: (id) => states.get(id) ?? 'fit',
    fit: () => [...persons.values()].filter((p) => (states.get(p.id) ?? 'fit') === 'fit'),
    update: (p) => void (persons.has(p.id) && persons.set(p.id, p)),
  };
}

// --- M5g level-up choice (docs/WAR.md "UI touchpoints": at levels 3 and 7 a choice of 2 skills; +2 attribute points a level) ---

/** One pick a pending level-up offers: a skill for an open slot, or the level's points into one attribute. */
export type LevelOffer = { kind: 'skill'; skill: WarSkillId } | { kind: 'attr'; attr: AttrId; n: number };

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * What a person may pick now: an open skill slot first (two skills of his family pool he does not hold, the pair fixed
 * by his id and the slot), else his unspent points into one attribute below ATTR_MAX. Empty: nothing pending.
 */
export function levelOffers(p: WarPerson): LevelOffer[] {
  const h = p.hero, cls = h.cls ?? 'militia', fam = FAMILY_OF[cls as keyof typeof FAMILY_OF];
  const held = legalSkills(cls, h.level, p.skills ?? []);
  const slots = SKILL_LEVELS.filter((l) => h.level >= l).length;
  if (fam && held.length < slots) {
    const pool = SKILL_POOL[fam].filter((id) => !held.includes(id));
    const k = hash(p.id + held.length) % Math.max(1, pool.length);
    const pick = [...pool.slice(k), ...pool.slice(0, k)].slice(0, 2);
    if (pick.length) return pick.map((skill) => ({ kind: 'skill', skill }));
  }
  if (h.points <= 0) return [];
  const n = Math.min(h.points, POINTS_PER_LEVEL);
  return ATTR_IDS.filter((a) => h.attrs[a] < ATTR_MAX).map((attr) => ({ kind: 'attr', attr, n }));
}

/** The person after taking offer o (a skill into his next slot, or points into an attribute up to ATTR_MAX). */
export function applyOffer(p: WarPerson, o: LevelOffer): WarPerson {
  const h = p.hero, cls = h.cls ?? 'militia';
  if (o.kind === 'skill') return { ...p, skills: legalSkills(cls, h.level, [...legalSkills(cls, h.level, p.skills ?? []), o.skill]) };
  const add = Math.max(0, Math.min(o.n, h.points, ATTR_MAX - h.attrs[o.attr]));
  return { ...p, hero: { ...h, attrs: { ...h.attrs, [o.attr]: h.attrs[o.attr] + add }, points: h.points - add } };
}

/** Dev and tests: the person with xp added and levelled up as a fight would (./soldiers.ts gainXp). */
export function grantXp(p: WarPerson, xp: number): WarPerson {
  return { ...p, hero: gainXp(p.hero, xp).hero };
}
