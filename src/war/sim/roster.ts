/**
 * A local, in-memory soldier roster for the sandbox and tests (M5b), until the server keeps persons (M5e, D1
 * war_persons): makes persons (class, level, kit tier and rarity, skills), hands fit ones out for spawnSquad.
 */
import { ATTR_IDS, ATTR_MAX, POINTS_PER_LEVEL, type AttrId } from '../../data/perks';
import { CLASSES, isClassId } from '../../data/classes';
import { MAX_LEVEL, type Hero } from '../../data/units';
import type { Rarity } from '../../data/items';
import type { WarPerson, WarSkillId } from '../types';
import { freshHero, kitItem } from './classes';
import { FAMILY_OF, legalSkills, type Family } from './skills';

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
}

export function createRoster(): Roster {
  const persons = new Map<string, WarPerson>();
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
  };
}
