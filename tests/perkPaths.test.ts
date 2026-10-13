/**
 * AB-01: perk paths (design/gdd/abilities.md R1, R6, R7, F3). Each class's
 * linear five-perk chain became five tiers of two options [A, B]; A is the old
 * chain, so every perk an existing hero holds is an A pick and nothing is lost.
 */
import { describe, expect, it } from 'vitest';
import {
  PERKS, PERK_LEVELS, RETRAIN_COST, heroPaths, heroTree, perkBlocker, perkPath, perkTier, retrainCost, retrainPerks,
  type PerkId,
} from '../src/data/perks';
import { CLASSES, SOLDIER_CLASSES, type ClassId } from '../src/data/classes';
import { autoDevelop, makeHero, setBotLevel } from '../src/game/heroes';
import { WIN_GOLD } from '../src/game/campaign';
import { developHero } from '../src/duel/rules';
import { migrate } from '../src/game/save';
import { computeStats } from '../src/sim/stats';
import { Rng } from '../src/sim/rng';
import type { Hero } from '../src/data/units';

const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });
const V6_SAVE = Object.entries(FIXTURES).find(([f]) => f.includes('/v6-'))![1];

/**
 * The linear trees before AB-01 (src/data/classes.ts at v5 4dea4d3): the
 * migration table. Tier i of the old chain is option A of tier i.
 */
const OLD_TREES: Partial<Record<ClassId, PerkId[]>> = {
  militia: ['drilled', 'shield_bash', 'phalangite', 'rally_cry', 'unbreakable'],
  hoplite: ['shield_drill', 'shield_bash', 'phalangite', 'steady_presence', 'unbreakable'],
  thureophoros: ['shield_drill', 'shield_bash', 'iron_discipline', 'rally_cry', 'warlord'],
  celt_sword: ['brawler', 'shield_bash', 'bloodlust', 'rally_cry', 'warlord'],
  rhomphaia: ['shield_breaker', 'berserk', 'reaping_blow', 'bloodlust', 'warlord'],
  archer: ['longshot', 'volley', 'deep_quiver', 'eagle_eye', 'skirmish_master'],
  slinger: ['lead_bullets', 'volley', 'deep_quiver', 'eagle_eye', 'skirmish_master'],
  javelineer: ['fleet', 'volley', 'deep_quiver', 'eagle_eye', 'skirmish_master'],
  horse_archer: ['horsemanship', 'volley', 'parthian_shot', 'eagle_eye', 'skirmish_master'],
  peltast: ['fleet', 'volley', 'brawler', 'rally_cry', 'skirmish_master'],
  falx: ['brawler', 'berserk', 'shield_breaker', 'bloodlust', 'warlord'],
  gallic: ['brawler', 'berserk', 'bloodlust', 'rally_cry', 'warlord'],
  fanatic: ['zealot', 'berserk', 'bloodlust', 'rally_cry', 'unbreakable'],
  companion: ['horsemanship', 'lance_charge', 'ride_down', 'rally_cry', 'warlord'],
  thessalian: ['horsemanship', 'volley', 'ride_down', 'lance_charge', 'skirmish_master'],
  chariot: ['horsemanship', 'lance_charge', 'scythe_master', 'ride_down', 'warlord'],
  royal_guard: ['shield_drill', 'shield_bash', 'iron_discipline', 'steady_presence', 'warlord'],
  sacred_band: ['shield_drill', 'shield_bash', 'phalangite', 'rally_cry', 'unbreakable'],
};

/** The signature active each family's tier-2 B is (abilities.md R1 table). */
const SIGNATURE: Partial<Record<ClassId, PerkId>> = {
  militia: 'push', hoplite: 'push', thureophoros: 'push',
  royal_guard: 'bond', sacred_band: 'bond',
  celt_sword: 'warcry', gallic: 'warcry', fanatic: 'warcry',
  falx: 'sunder', rhomphaia: 'sunder',
  archer: 'aimed', slinger: 'aimed', javelineer: 'aimed', peltast: 'aimed', horse_archer: 'aimed',
  companion: 'recharge', thessalian: 'recharge',
  chariot: 'scythe',
};

function bot(cls: ClassId, level: number, seed = 3): Hero {
  const h = makeHero(new Rng(seed), { nextId: 1 }, 'greek', cls, 1, 2);
  setBotLevel(h, level);
  return h;
}

describe('class paths (R1)', () => {
  it('every soldier class has 5 tiers of 2 options, 10 distinct known perks', () => {
    for (const id of SOLDIER_CLASSES) {
      const tree = CLASSES[id].tree;
      expect(tree, id).toHaveLength(5);
      for (const tier of tree) expect(tier, id).toHaveLength(2);
      const all = tree.flat();
      expect(new Set(all).size, `${id}: ${all.join(',')}`).toBe(10);
      for (const p of all) expect(PERKS[p], `${id}: ${p}`).toBeTruthy();
    }
  });

  it('option A of every tier is the old linear perk (the migration table)', () => {
    for (const id of SOLDIER_CLASSES) {
      expect(CLASSES[id].tree.map((t) => t[0]), id).toEqual(OLD_TREES[id]);
      expect(heroTree({ cls: id }), id).toEqual(OLD_TREES[id]);
    }
  });

  it('tier 2 B is the family signature active and the GDD B ids are used', () => {
    for (const id of SOLDIER_CLASSES) expect(CLASSES[id].tree[1][1], id).toBe(SIGNATURE[id]);
    expect(CLASSES.hoplite.tree.map((t) => t[1])).toEqual(['drilled', 'push', 'iron_discipline', 'standard_bearer', 'warlord']);
    expect(CLASSES.chariot.tree.map((t) => t[1])).toEqual(['fleet', 'scythe', 'reaping_blow', 'rally_cry', 'skirmish_master']);
  });

  it('animals have no paths', () => {
    expect(CLASSES.wolf.tree).toEqual([]);
    expect(heroPaths({ cls: 'wolf' })).toEqual([]);
  });
});

describe('perkBlocker (shared by campaign, duel client and duel server)', () => {
  it('accepts A or B at a tier, and refuses a second pick in that tier', () => {
    const h = { level: 4, perks: [] as PerkId[], cls: 'hoplite' };
    expect(perkBlocker(h, 'shield_drill')).toBeNull();
    expect(perkBlocker(h, 'drilled')).toBeNull();
    h.perks.push('drilled');
    expect(perkBlocker(h, 'shield_drill')).toBe('Path chosen');
    expect(perkBlocker(h, 'drilled')).toBe('Known');
  });

  it('the next tier needs any perk of the previous tier', () => {
    expect(perkBlocker({ level: 4, perks: ['drilled'], cls: 'hoplite' }, 'shield_bash')).toBeNull();
    expect(perkBlocker({ level: 4, perks: ['shield_drill'], cls: 'hoplite' }, 'push')).toBeNull();
    expect(perkBlocker({ level: 4, perks: [], cls: 'hoplite' }, 'push')).toMatch(/^Needs (Shield Drill|Drilled)/);
    expect(perkBlocker({ level: 2, perks: ['drilled'], cls: 'hoplite' }, 'push')).toBe(`Needs Lv ${PERK_LEVELS[1]}`);
    expect(perkBlocker({ level: 6, perks: ['drilled', 'push'], cls: 'hoplite' }, 'iron_discipline')).toBeNull();
  });

  it('a path chosen is the most lasting reason, before level or points', () => {
    expect(perkBlocker({ level: 4, perks: ['drilled', 'push'], cls: 'hoplite' }, 'shield_bash')).toBe('Path chosen');
    expect(perkBlocker({ level: 4, perks: ['shield_drill'], cls: 'hoplite' }, 'drilled')).toBe('Path chosen');
  });

  it('a perk of another class is refused; heroes without a class keep the legacy linear trees', () => {
    expect(perkBlocker({ level: 4, perks: [], cls: 'hoplite' }, 'fleet')).toBe('Another class');
    expect(perkBlocker({ level: 4, perks: ['shield_drill'] }, 'shield_bash')).toBeNull();
    expect(perkBlocker({ level: 4, perks: [] }, 'shield_bash')).toMatch(/Shield Drill/);
    // three legacy tier-0 perks stay possible for a classless hero (nothing he had is refused)
    expect(perkBlocker({ level: 6, perks: ['shield_drill', 'fleet'] }, 'brawler')).toBeNull();
  });

  it('perkTier / perkPath say where a perk sits and which option a hero took', () => {
    const h = { perks: ['shield_drill', 'push'] as PerkId[], cls: 'hoplite' };
    expect(perkTier(h, 'push')).toBe(1);
    expect(perkTier(h, 'fleet')).toBe(-1);
    expect(perkPath(h, 0)).toBe('A');
    expect(perkPath(h, 1)).toBe('B');
    expect(perkPath(h, 2)).toBeNull();
  });
});

describe('duel and war validation (developHero, the server /develop route)', () => {
  it('takes B, refuses a second pick in a tier, and refuses A and B in one request', () => {
    const h = bot('hoplite', 4);
    h.perks = [];
    const ok = developHero(h, {}, ['drilled', 'push']);
    expect(ok).not.toBeTypeOf('string');
    expect((ok as Hero).perks).toEqual(['drilled', 'push']);
    expect(developHero(ok as Hero, {}, ['shield_drill'])).toBe('bad_perk');
    expect(developHero(h, {}, ['drilled', 'shield_drill'])).toBe('bad_perk');
  });

  it('an old D1 duel hero (linear perks) is all A and can keep developing', () => {
    // a stored duel_heroes.data row from before AB-01: a level-6 archer down the old chain
    const stored = JSON.parse(JSON.stringify({ ...bot('archer', 6), perks: ['longshot', 'volley', 'deep_quiver'] })) as Hero;
    for (let t = 0; t < 3; t++) expect(perkPath(stored, t)).toBe('A');
    for (const p of stored.perks) expect(perkBlocker(stored, p)).toBe('Known');
    stored.level = 8;
    const out = developHero(stored, {}, ['steady_presence']);
    expect((out as Hero).perks).toEqual(['longshot', 'volley', 'deep_quiver', 'steady_presence']);
  });
});

describe('perks in a save', () => {
  it('B ids survive a save round trip (the v6 validation keeps every known perk)', () => {
    const raw = JSON.parse(V6_SAVE) as { heroes: Hero[] };
    raw.heroes[0].level = 8;
    raw.heroes[0].perks = ['drilled', 'push', 'iron_discipline', 'standard_bearer'];
    expect(migrate(raw)!.heroes[0].perks).toEqual(['drilled', 'push', 'iron_discipline', 'standard_bearer']);
  });
});

describe('autoDevelop (R6): deterministic, no RNG', () => {
  it('walks one option per tier and fills every slot', () => {
    for (const id of SOLDIER_CLASSES) {
      const h = bot(id, 10);
      expect(h.perks, id).toHaveLength(5);
      h.perks.forEach((p, t) => expect(CLASSES[id].tree[t], id).toContain(p));
    }
  });

  it('takes path A, the signature actives included (V5-056: bots keep the pre-AB-02 chain for now)', () => {
    expect(PERKS.push.ability).toBe('push');
    expect(bot('hoplite', 10).perks).toEqual(OLD_TREES.hoplite);
    expect(bot('companion', 10).perks).toEqual(OLD_TREES.companion);
  });

  it('takes standard_bearer only when it carries the standard and the army has none', () => {
    expect(PERKS.push.ability).toBe('push');
    const std = PERKS.standard_bearer;
    try {
      // a stand-in for AB-03 wiring the standard
      std.standard = true;
      const first = bot('hoplite', 10);
      expect(first.perks).toEqual(['shield_drill', 'shield_bash', 'phalangite', 'standard_bearer', 'unbreakable']);
      const second = bot('hoplite', 10);
      second.perks = [];
      autoDevelop(second, { standard: true });
      expect(second.perks).toEqual(['shield_drill', 'shield_bash', 'phalangite', 'steady_presence', 'unbreakable']);
      // makeHero reads the roster: the second bearer-capable hero of an army takes A
      const rng = new Rng(9);
      const ids = { nextId: 1 };
      const a = makeHero(rng, ids, 'greek', 'hoplite', 8, 2);
      const b = makeHero(rng, ids, 'greek', 'hoplite', 8, 2, undefined, [a]);
      expect(a.perks).toContain('standard_bearer');
      expect(b.perks).not.toContain('standard_bearer');
    } finally {
      delete std.standard;
    }
  });

  it('is a pure function of class and level', () => {
    expect(bot('falx', 10, 1).perks).toEqual(bot('falx', 10, 99).perks);
  });
});

describe('retrain (R7, F3)', () => {
  it('costs RETRAIN_COST x tier: 40..200 gold', () => {
    expect(RETRAIN_COST).toBe(40);
    expect([1, 2, 3, 4, 5].map(retrainCost)).toEqual([40, 80, 120, 160, 200]);
  });

  it('EC-03: stays a forgiveness price, not a wall (kept at 40 x tier)', () => {
    // the GDD knob range for RETRAIN_COST (abilities.md, Tuning Knobs)
    expect(RETRAIN_COST).toBeGreaterThanOrEqual(20);
    expect(RETRAIN_COST).toBeLessThanOrEqual(80);
    // tier 1 opens at level 2, after about 1.5 battles: one plain win (20 + WIN_GOLD, no kills) pays for it
    expect(retrainCost(1)).toBeLessThanOrEqual(20 + WIN_GOLD);
    // tier 5 opens at level 10, deep in tier 3: one win's pay (213 g, FINAL.md section 8) covers it
    expect(retrainCost(PERK_LEVELS.length)).toBeLessThanOrEqual(213);
  });

  it('swaps one tier to its other option and keeps every other perk in place', () => {
    const h = { perks: ['shield_drill', 'shield_bash', 'phalangite'] as PerkId[], cls: 'hoplite' };
    expect(retrainPerks(h, 1)).toEqual(['shield_drill', 'push', 'phalangite']);
    expect(retrainPerks(h, 0)).toEqual(['drilled', 'shield_bash', 'phalangite']);
    expect(retrainPerks(h, 3)).toBeNull(); // nothing chosen at tier 4 yet
    expect(retrainPerks({ perks: ['shield_drill'] }, 0)).toBeNull(); // a classless hero has no paths
  });
});

describe('B passives in stats (AC 3)', () => {
  it('every passive B changes the holder\'s combat stats', () => {
    for (const id of SOLDIER_CLASSES) {
      const h = bot(id, 1);
      const base = JSON.stringify(computeStats(h));
      for (const [, b] of CLASSES[id].tree) {
        const p = PERKS[b];
        if (!p.mods && !p.moraleLoss && !p.ko && !p.ammoMult && !p.aura && !p.ability && !p.bloodlust && !p.pursuit && !p.scythe) continue;
        expect(JSON.stringify(computeStats({ ...h, perks: [b] })), `${id} ${b}`).not.toBe(base);
      }
    }
  });

  it('a missile perk gives no range to a man without a missile weapon', () => {
    const h = bot('peltast', 1);
    h.equip.weapon = { uid: 'w', def: 'longche', rarity: 'common', cond: 100 };
    const s = computeStats({ ...h, perks: ['longshot'] });
    expect(s.range).toBe(0);
    expect(s.role).toBe('melee');
    // with javelins the same perk reaches further
    h.equip.weapon = { uid: 'w', def: 'javelins', rarity: 'common', cond: 100 };
    expect(computeStats({ ...h, perks: ['longshot'] }).range).toBeGreaterThan(computeStats(h).range);
  });
});
