/**
 * The soldier roster (src/war/sim/roster.ts): autoSpend, makePerson for every soldier and civilian class (and an unknown
 * one) at levels, kit tiers, rarities, given skills and names; the level-up offers and their picks (levelOffers,
 * applyOffer), spendLevel and its refusals, promotion (promotesTo, promoteBlocker, promotePerson), grantXp, and a
 * scripted roster: recruits, adds, fight reports (heroes back, deeds, scars, states), updates, removals, promotions,
 * with all(), fit() and the states read after every op.
 */
import { Rng } from '../../sim/rng';
import { CIV_CLASSES, CLASSES } from '../../data/classes';
import { ATTR_IDS } from '../../data/perks';
import type { Hero } from '../../data/units';
import type { Rarity } from '../../data/items';
import type { FightReport, PersonResult, WarPerson, WarSkillId } from '../../war/types';
import {
  applyOffer, autoSpend, createRoster, DEFAULT_PICKS, ELITE_KIT, ELITES, grantXp, levelOffers, makePerson, PROMOTE, promoteBlocker,
  promotePerson, promotesTo, spendLevel, type PersonOpts,
} from '../../war/sim/roster';
import { SKILLS } from '../../war/sim/skills';

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const SKILL_IDS = Object.keys(SKILLS) as WarSkillId[];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const vectors = () => {
  const r = new Rng(5150);
  const classes = [...Object.keys(CLASSES), ...Object.keys(CIV_CLASSES), 'nope'];

  // makePerson over the options
  const made: unknown[] = [];
  for (const cls of classes) for (let k = 0; k < 8; k++) {
    const o: PersonOpts = {};
    if (k) o.level = [0, 1, 2, 3, 5, 7, 10, 13][r.int(0, 7)];
    if (r.chance(0.6)) o.tier = r.int(0, 4);
    if (r.chance(0.5)) o.rarity = r.pick(RARITIES);
    if (r.chance(0.4)) o.skills = Array.from({ length: r.int(0, 4) }, () => r.pick(SKILL_IDS));
    if (r.chance(0.3)) o.name = `Name ${k}`;
    const id = `p${made.length}`;
    made.push([id, cls, clone(o), makePerson(id, cls, o)]);
  }

  // autoSpend on heroes with points, some attributes near ATTR_MAX
  const spent: unknown[] = [];
  for (const cls of classes) for (let k = 0; k < 3; k++) {
    const h = makePerson(`a${spent.length}`, cls).hero;
    const hero: Hero = { ...h, points: r.int(0, 40), attrs: { ...h.attrs } };
    if (k === 2) for (const a of ATTR_IDS) hero.attrs[a] = r.int(10, 15);
    spent.push([clone(hero), autoSpend(hero)]);
  }

  // level-up offers, each offer taken, and spendLevel
  const offers: unknown[] = [];
  const spends: unknown[] = [];
  for (let k = 0; k < 160; k++) {
    const cls = r.pick(classes), level = r.int(1, 10), p0 = makePerson(`o${k}-${'x'.repeat(k % 5)}`, cls, { level });
    const p: WarPerson = { ...p0, hero: { ...p0.hero, points: r.chance(0.3) ? 0 : r.int(0, 6), attrs: { ...p0.hero.attrs } } };
    if (r.chance(0.4)) p.skills = Array.from({ length: r.int(0, 3) }, () => r.pick(SKILL_IDS));
    else if (r.chance(0.2)) delete (p as { skills?: unknown }).skills;
    if (r.chance(0.2)) p.hero.attrs[r.pick(ATTR_IDS)] = 15;
    if (r.chance(0.1)) delete p.hero.cls;
    const os = levelOffers(p);
    const an = r.int(-1, 9), sk = r.pick(SKILL_IDS);
    offers.push([clone(p), os, os.map((o) => applyOffer(p, o)), [an, applyOffer(p, { kind: 'attr', attr: 'str', n: an })], [sk, applyOffer(p, { kind: 'skill', skill: sk })]]);
    const attrs: Partial<Record<(typeof ATTR_IDS)[number], number>> = {};
    for (const a of ATTR_IDS) if (r.chance(0.4)) attrs[a] = r.int(-1, 5);
    const skill = r.chance(0.5) ? r.pick(SKILL_IDS) : undefined;
    spends.push([clone(p), attrs, skill ?? null, spendLevel(p, attrs, skill)]);
  }

  // promotion
  const promotes = classes.map((c) => [c, promotesTo(c)]);
  const promotable = classes.filter((c) => promotesTo(c).length);
  const blockers: unknown[] = [];
  for (let k = 0; k < 80; k++) {
    const cls = r.chance(0.5) ? r.pick(promotable) : r.pick(classes), p = makePerson(`b${k}`, cls, { level: r.int(1, 10), skills: Array.from({ length: 2 }, () => r.pick(SKILL_IDS)) });
    if (r.chance(0.5)) p.honours = Array.from({ length: r.int(0, 2) }, (_, i) => ({ name: `H${i}`, stat: 'dmg' as const }));
    const opts = promotesTo(p.hero.cls ?? ''), to = opts.length && r.chance(0.6) ? r.pick(opts) : r.chance(0.6) ? r.pick(ELITES) : r.pick(classes);
    if (r.chance(0.5)) p.hero.level = Math.max(p.hero.level, PROMOTE.level);
    const why = promoteBlocker(p, to);
    blockers.push([clone(p), to, why, why ? null : promotePerson(p, to as (typeof ELITES)[number])]);
  }
  const xps = Array.from({ length: 40 }, (_, k) => {
    const p = makePerson(`x${k}`, r.pick(classes), { level: r.int(1, 10) }), xp = r.int(0, 900);
    return [clone(p), xp, grantXp(p, xp)];
  });

  // a scripted roster
  const rosters = Array.from({ length: 6 }, () => {
    const ro = createRoster(), steps: unknown[] = [];
    const ids = () => ro.all().map((p) => p.id);
    const pickId = () => { const a = ids(); return a.length && r.chance(0.9) ? a[r.int(0, a.length - 1)] : 'ghost'; };
    for (let k = 0; k < 60; k++) {
      const op = r.next();
      let input: unknown[], out: unknown = null;
      if (op < 0.25) {
        const cls = r.chance(0.4) ? r.pick(promotable) : r.pick(classes), n = r.int(0, 3), o: PersonOpts | undefined = r.chance(0.5) ? { level: r.int(1, 8), tier: r.int(0, 2) } : undefined;
        input = ['recruit', r.pick(['sq', 'a', 'b']), cls, n, o ?? null];
        out = ro.recruit(input[1] as string, cls, n, o);
      } else if (op < 0.32) {
        const p = makePerson(r.chance(0.3) ? pickId() : `added-${k}`, r.pick(classes), { level: r.int(1, 5) });
        input = ['add', clone(p)];
        ro.add(p);
      } else if (op < 0.55) {
        const persons: PersonResult[] = [];
        for (let i = 0, n = r.int(1, 4); i < n; i++) {
          const pid = pickId(), base = ro.get(pid)?.hero ?? makePerson(pid, 'militia').hero;
          const hero = grantXp({ id: pid, hero: base }, r.int(0, 200)).hero;
          const deeds = r.chance(0.5) ? Array.from({ length: r.int(0, 3) }, () => { const d = r.pick(['firstBlood', 'gate', 'last', 'slayer:x', 'a', 'b', 'c', 'd', 'e']); return { id: d, name: d.toUpperCase() }; }) : undefined;
          persons.push({ pid, owner: 'p:1', team: 0, state: r.pick(['fit', 'fit', 'wounded', 'captive', 'dead']), xp: 0, kills: 0, dmg: 0, levelUps: 0, hero,
            ...(deeds ? { deeds } : {}), ...(r.chance(0.3) ? { scar: true as const } : {}) });
        }
        const rep: FightReport = { tick: k, persons, loot: {} };
        input = ['apply', clone(rep)];
        ro.apply(rep);
      } else if (op < 0.65) {
        const id = pickId(), p = ro.get(id) ?? makePerson(id, 'militia');
        const q = grantXp(p, r.int(0, 300));
        input = ['update', clone(q)];
        ro.update(q);
      } else if (op < 0.72) {
        input = ['remove', pickId()];
        ro.remove(input[1] as string);
      } else if (op < 0.85) {
        const id = pickId(), p = ro.get(id);
        if (p && r.chance(0.6)) ro.update({ ...p, hero: { ...p.hero, level: Math.max(p.hero.level, PROMOTE.level) }, honours: [{ name: 'H', stat: 'hp' }] });
        const opts = promotesTo(ro.get(id)?.hero.cls ?? ''), to = opts.length && r.chance(0.6) ? r.pick(opts) : r.chance(0.7) ? r.pick(ELITES) : r.pick(classes);
        input = ['promote', id, to, ro.get(id) ? clone(ro.get(id)) : null];
        out = ro.promote(id, to);
      } else {
        input = ['state', pickId()];
        out = ro.state(input[1] as string);
      }
      steps.push({ input, out, all: clone(ro.all()), fit: ro.fit().map((p) => p.id), states: ids().map((id) => ro.state(id)) });
    }
    return steps;
  });

  return { consts: { DEFAULT_PICKS, PROMOTE, ELITE_KIT, ELITES }, made, spent, offers, spends, promotes, blockers, xps, rosters };
};
