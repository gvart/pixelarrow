import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/data/classes';
import { ITEM_LIST, itemDef } from '../src/data/items';
import { CLASS_GEAR, armorWeight, classGearBlocker, classesFor, gearPenalty, requirements, shieldType, shortfall, weaponFamily } from '../src/data/gearRules';

describe('class gear limits', () => {
  it('every class may use every item of its own starting kit', () => {
    for (const c of Object.values(CLASSES)) {
      for (const tiers of Object.values(c.kit)) {
        for (const ids of tiers ?? []) for (const id of ids) {
          if (!id) continue;
          expect(classGearBlocker(c.id, itemDef(id)), `${c.id} ${id}`).toBeNull();
        }
      }
    }
  });

  it('every weapon, shield and armour has a family, type or weight, and some class can use it', () => {
    for (const d of ITEM_LIST) {
      if (d.slot === 'weapon') expect(weaponFamily(d), d.id).not.toBeNull();
      if (d.slot === 'shield') expect(shieldType(d), d.id).not.toBeNull();
      if (d.slot === 'armor') expect(armorWeight(d), d.id).not.toBeNull();
      expect(classesFor(d).length, d.id).toBeGreaterThan(0);
    }
  });

  it('limits weapons, shields and armour but not helmets and trinkets', () => {
    expect(classGearBlocker('archer', itemDef('dory'))).toBe('weapon');
    expect(classGearBlocker('hoplite', itemDef('pelte'))).toBe('shield');
    expect(classGearBlocker('slinger', itemDef('cuirass'))).toBe('armor');
    expect(classGearBlocker('slinger', itemDef('corinthian'))).toBeNull();
    expect(classGearBlocker('companion', itemDef('hoplon'))).toBeNull();
    expect(classGearBlocker('wolf', itemDef('owl_amulet'))).toBe('none');
    expect(Object.keys(CLASS_GEAR)).toContain('sacred_band');
  });
});

describe('attribute requirements', () => {
  it('grow with tier and rarity', () => {
    expect(requirements('dory', 'common')).toEqual([]);
    expect(requirements('sauroter_dory', 'legendary')).toEqual([{ attr: 'str', n: 12 }]);
    expect(requirements('cuirass', 'common')).toEqual([{ attr: 'end', n: 9 }, { attr: 'str', n: 6 }]);
    expect(requirements('owl_amulet', 'legendary')).toEqual([]);
    expect(requirements('xiphos', 'epic')).toEqual([{ attr: 'agi', n: 7 }]);
  });

  it('turn missing points into a capped penalty', () => {
    const a = { str: 9, agi: 5, end: 5, wil: 5 };
    expect(shortfall(a, 'sauroter_dory', 'legendary')).toBe(3);
    expect(gearPenalty(3)).toBeCloseTo(0.3);
    expect(gearPenalty(12)).toBe(0.7);
    expect(shortfall(undefined, 'sauroter_dory', 'legendary')).toBe(0);
  });
});

describe('class limits in play', () => {
  it('generated, tutorial and duel-starter armies only carry gear their class may use', async () => {
    const { tutorialBattle } = await import('../src/game/tutorial');
    const { standardArmy } = await import('../src/game/heroes');
    const { starterDuelRoster } = await import('../src/duel/rules');
    const { equipBlocker } = await import('../src/game/gear');
    const { Rng } = await import('../src/sim/rng');
    const t = tutorialBattle();
    const heroes = [...t.heroes, ...t.enemyHeroes, ...standardArmy(new Rng(3), { nextId: 1 }), ...starterDuelRoster(5, { nextId: 1 }, 'd_')];
    for (const h of heroes) {
      if (CLASSES[h.cls as keyof typeof CLASSES]?.kind === 'animal') continue;
      for (const it of Object.values(h.equip)) if (it) expect(equipBlocker(h, it), `${h.cls} ${it.def}`).toBeNull();
    }
  });

  it('the sim ignores gear the class may not use', async () => {
    const { computeStats } = await import('../src/sim/stats');
    const { makeHero } = await import('../src/game/heroes');
    const { Rng } = await import('../src/sim/rng');
    const h = makeHero(new Rng(2), { nextId: 1 }, 'greek', 'hoplite' as never, 3, 1);
    const without = { ...h, equip: { ...h.equip } };
    delete without.equip.weapon;
    h.equip.weapon = { uid: 'b', def: 'bow', rarity: 'common', cond: 100 };
    const s = computeStats(h);
    expect(s.weapon).toBe('none');
    expect(s.range).toBe(computeStats(without).range);
    expect(s.dmg).toBeCloseTo(computeStats(without).dmg);
  });

  it('save v4 -> v5 moves gear the class may not use to the stash', async () => {
    const { Campaign } = await import('../src/game/campaign');
    const { migrate } = await import('../src/game/save');
    const c = Campaign.fresh(4);
    const raw = JSON.parse(JSON.stringify(c.data));
    raw.v = 4;
    const h = raw.heroes.find((x: { cls: string }) => x.cls === 'hoplite');
    h.equip.weapon = { uid: 'old-bow', def: 'bow', rarity: 'rare', cond: 90 };
    const out = migrate(raw)!;
    expect(out.heroes.find((x) => x.id === h.id)!.equip.weapon).toBeUndefined();
    expect(out.stash.some((i) => i.uid === 'old-bow')).toBe(true);
    expect(out.gearMoved).toEqual([h.name]);
  });
});
