import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_LIST, MOUNTS, SOLDIER_CLASSES, classOfHero, type ClassId } from '../src/data/classes';
import { ITEMS } from '../src/data/items';
import { PERKS, PERK_LEVELS, perkBlocker } from '../src/data/perks';
import { TERRAIN, type TerrainKind } from '../src/data/terrain';
import { armySpec } from '../src/game/armySpec';
import { makeHero, setBotLevel } from '../src/game/heroes';
import { computeStats } from '../src/sim/stats';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import type { Hero } from '../src/data/units';
import type { TerrainGrid } from '../src/sim/terrain';
import type { BattleSetup, Side } from '../src/sim/types';
import { runCavalryFrontal, runClassDuel } from '../src/dev/classBalance';

function hero(cls: ClassId, level = 3, seed = 1): Hero {
  const h = makeHero(new Rng(seed), { nextId: seed * 100 }, CLASSES[cls].cultures[0] ?? 'greek', cls, 1, 2);
  setBotLevel(h, level);
  return h;
}

/** One unit per side, no bots, placed by hand, battle started. */
function pair(a: Hero, b: Hero, terrain?: TerrainGrid, seed = 5): Battle {
  const bt = new Battle({ seed, armies: [armySpec([a], false), armySpec([b], false)], timeLimit: 600, terrain });
  bt.startBattle();
  return bt;
}

function grid(kind: TerrainKind): TerrainGrid {
  return { w: 24, h: 36, cells: TERRAIN[kind].code.repeat(24 * 36), height: '0'.repeat(24 * 36) };
}

describe('unit classes (data)', () => {
  it('every soldier class has gear that exists, a five-perk tree of real perks, and a cost', () => {
    for (const c of CLASS_LIST) {
      expect(c.cost).toBeGreaterThan(0);
      for (const tiers of Object.values(c.kit)) for (const opts of tiers ?? []) for (const id of opts) if (id) expect(ITEMS[id], `${c.id}: ${id}`).toBeTruthy();
      if (c.kind === 'animal') {
        expect(c.beastStats).toBeTruthy();
        expect(c.tree).toHaveLength(0);
        continue;
      }
      expect(c.tree).toHaveLength(5);
      expect(new Set(c.tree).size).toBe(5);
      for (const p of c.tree) expect(PERKS[p], `${c.id}: ${p}`).toBeTruthy();
    }
    expect(SOLDIER_CLASSES.length).toBe(18);
  });

  it('each class is raised with its own kit, stats and silhouette', () => {
    const hop = computeStats(hero('hoplite'));
    expect(hop.weapon).toBe('spear');
    expect(hop.canShieldWall).toBe(true);
    expect(hop.mount).toBeUndefined();
    const comp = computeStats(hero('companion'));
    expect(comp.mount).toBe('horse');
    expect(comp.radius).toBe(MOUNTS.horse.radius);
    expect(comp.speed).toBeGreaterThan(hop.speed * 1.6);
    expect(comp.canShieldWall).toBe(false);
    const ha = computeStats(hero('horse_archer'));
    expect(ha.mount).toBe('horse');
    expect(ha.role).toBe('ranged');
    expect(computeStats(hero('chariot')).mount).toBe('chariot');
    const rh = computeStats(hero('rhomphaia'));
    expect(rh.shield).toBe('none');
    expect(rh.blockPierce).toBeGreaterThan(0.1);
    const wolf = computeStats(hero('wolf'));
    expect(wolf.kind).toBe('animal');
    expect(wolf.shield).toBe('none');
    expect(computeStats(hero('bear')).radius).toBeGreaterThan(0.45);
    expect(computeStats(hero('archer')).range).toBeGreaterThan(computeStats(hero('javelineer')).range);
  });

  it('old heroes get a class from their archetype and gear', () => {
    expect(classOfHero({ arch: 'hoplite' })).toBe('hoplite');
    expect(classOfHero({ arch: 'swordsman', culture: 'celtic' })).toBe('celt_sword');
    expect(classOfHero({ arch: 'swordsman', culture: 'greek' })).toBe('thureophoros');
    expect(classOfHero({ arch: 'raw' })).toBe('militia');
    expect(classOfHero({ arch: 'animal:bear' })).toBe('bear');
    expect(classOfHero({})).toBe('militia');
  });

  it('perks follow the class tree', () => {
    const h = { level: 10, perks: [] as never[], cls: 'companion' };
    expect(perkBlocker(h, 'horsemanship')).toBeNull();
    expect(perkBlocker(h, 'lance_charge')).toMatch(/Horsemanship/);
    expect(perkBlocker(h, 'shield_drill')).toBe('Another class');
    expect(perkBlocker({ level: 3, perks: [], cls: 'hoplite' }, 'shield_drill')).toBeNull();
    expect(PERK_LEVELS).toHaveLength(5);
    // bots walk down their own tree
    const c = hero('companion', 10);
    expect(c.perks).toEqual(CLASSES.companion.tree);
  });
});

describe('cavalry in the simulation', () => {
  it('a horse builds speed, cannot stop at once, and hits harder the faster it goes', () => {
    const hits: number[] = [];
    for (const runUp of [3, 14]) {
      const bt = pair(hero('companion', 3, 2), hero('militia', 3, 3));
      const r = bt.units[0];
      const m = bt.units[1];
      r.x = 12;
      r.y = 10 + runUp;
      r.fx = 0;
      r.fy = -1;
      m.x = 12;
      m.y = 10;
      m.fy = 1;
      m.stats.block = 0;
      bt.issue(0, { kind: 'order', group: r.group, order: 'charge' });
      let dmg = 0;
      for (let i = 0; i < 4 * TICK_RATE && dmg === 0; i++) {
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === 'hit' && e.unit === m.id) dmg = e.dmg;
      }
      hits.push(dmg);
    }
    expect(hits[0]).toBeGreaterThan(0);
    expect(hits[1]).toBeGreaterThan(hits[0] * 1.15);

    // stopping: a galloping horse told to halt keeps going for a while
    const bt = pair(hero('companion', 3, 2), hero('militia', 3, 3));
    const r = bt.units[0];
    bt.units[1].x = 2;
    bt.units[1].y = 2;
    r.x = 12;
    r.y = 33;
    bt.issue(0, { kind: 'form', group: r.group, cx: 12, cy: 4, fx: 0, fy: -1, frontage: 1 });
    for (let i = 0; i < 3 * TICK_RATE; i++) bt.step();
    const speed = r.spd;
    expect(speed).toBeGreaterThan(3);
    const y0 = r.y;
    bt.issue(0, { kind: 'form', group: r.group, cx: 12, cy: y0, fx: 0, fy: -1, frontage: 1 });
    bt.step();
    expect(r.spd).toBeGreaterThan(speed * 0.8);
    for (let i = 0; i < TICK_RATE; i++) bt.step();
    expect(y0 - r.y).toBeGreaterThan(0.3); // overran the spot
  });

  it('riders charging braced hoplites head on are broken; hoplites win', () => {
    let won = 0;
    for (let i = 0; i < 6; i++) won += runCavalryFrontal(12000 + i).hoplitesWon ? 1 : 0;
    expect(won).toBeGreaterThanOrEqual(5);
  });

  it('a charge on the flank or rear is devastating', () => {
    const dmgFrom = (fromRear: boolean) => {
      let total = 0;
      for (let s = 0; s < 6; s++) {
        const bt = pair(hero('companion', 3, 2), hero('hoplite', 3, 3), undefined, 20 + s);
        const r = bt.units[0];
        const t = bt.units[1];
        t.x = 12;
        t.y = 12;
        t.fx = 0;
        t.fy = fromRear ? -1 : 1;
        r.x = 12;
        r.y = 24;
        r.fy = -1;
        r.spd = 6;
        bt.issue(0, { kind: 'order', group: r.group, order: 'charge' });
        for (let i = 0; i < 4 * TICK_RATE; i++) {
          // he is busy with someone else: he does not turn to face the horse
          t.fx = 0;
          t.fy = fromRear ? -1 : 1;
          bt.step();
          for (const e of bt.drainEvents()) if (e.type === 'hit' && e.unit === t.id) total += e.dmg;
        }
      }
      return total;
    };
    expect(dmgFrom(true)).toBeGreaterThan(dmgFrom(false) * 1.5);
  });

  it('horse archers shoot on the move', () => {
    const bt = pair(hero('horse_archer', 3, 2), hero('hoplite', 3, 3));
    const r = bt.units[0];
    bt.units[1].x = 12;
    bt.units[1].y = 6;
    r.x = 4;
    r.y = 14;
    bt.issue(0, { kind: 'form', group: r.group, cx: 20, cy: 14, fx: 1, fy: 0, frontage: 1 });
    let shotsMoving = 0;
    for (let i = 0; i < 4 * TICK_RATE; i++) {
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === 'shot' && e.unit === r.id && r.spd > 1) shotsMoving++;
    }
    expect(shotsMoving).toBeGreaterThan(0);
  });

  it('chariots are fast on open ground and wreck in forest and rough ground', () => {
    const drive = (kind: TerrainKind) => {
      const bt = pair(hero('chariot', 3, 2), hero('militia', 3, 3), grid(kind));
      const c = bt.units[0];
      bt.units[1].x = 2;
      bt.units[1].y = 1;
      c.x = 12;
      c.y = 33;
      bt.issue(0, { kind: 'form', group: c.group, cx: 12, cy: 3, fx: 0, fy: -1, frontage: 1 });
      bt.issue(0, { kind: 'order', group: c.group, order: 'charge' });
      for (let i = 0; i < 4 * TICK_RATE; i++) bt.step();
      return { dist: 33 - c.y, lost: c.stats.maxHp - c.hp };
    };
    const open = drive('open');
    const forest = drive('forest');
    const rough = drive('rough');
    expect(open.lost).toBe(0);
    expect(forest.lost).toBeGreaterThan(5);
    expect(rough.lost).toBeGreaterThan(3);
    expect(open.dist).toBeGreaterThan(forest.dist * 2);
  });
});

describe('animals', () => {
  it('beasts bolt when hurt and never rally', () => {
    const bt = pair(hero('wolf', 3, 2), hero('hoplite', 3, 3));
    const w = bt.units[0];
    bt.units[1].x = 2;
    bt.units[1].y = 2;
    w.morale = w.stats.morale * 0.3;
    bt.step();
    expect(w.state).toBe('routing');
    w.morale = w.stats.morale;
    for (let i = 0; i < 3 * TICK_RATE; i++) bt.step();
    expect(w.state === 'routing' || w.state === 'fled').toBe(true);
  });

  it('a wolf pack goes for the flanks of a lone man', () => {
    const rng = new Rng(4);
    const ids = { nextId: 1 };
    const wolves: Hero[] = [];
    for (let i = 0; i < 4; i++) wolves.push(makeHero(rng, ids, 'greek', 'wolf', 3, 1, 0, wolves));
    const man = makeHero(rng, ids, 'greek', 'hoplite', 3, 1, 0);
    const bt = new Battle({ seed: 4, armies: [armySpec(wolves, true), armySpec([man], false)], timeLimit: 120 });
    bt.startBattle();
    const m = bt.units.find((u) => u.side === 1)!;
    m.x = 12;
    m.y = 20;
    m.fx = 0;
    m.fy = 1;
    let front = 0;
    let other = 0;
    for (let i = 0; i < 40 * TICK_RATE && bt.phase === 'battle'; i++) {
      m.fx = 0;
      m.fy = 1;
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === 'hit' && e.unit === m.id) (e.dir === 'front' ? front++ : other++);
    }
    expect(front + other).toBeGreaterThan(3);
    expect(other).toBeGreaterThan(front);
  });

  it('animals vs militia at equal cost: beasts are a fair fight', () => {
    // two budgets, so rounding the head count does not decide it
    let s = 0;
    for (const budget of [600, 900]) for (let i = 0; i < 6; i++) s += 1 - runClassDuel(13000 + i, 'militia', 'wolf', budget).score;
    expect(s).toBeGreaterThan(2);
    expect(s).toBeLessThan(10);
  });
});

describe('determinism with riders and beasts', () => {
  const setup = (): BattleSetup => {
    const rng = new Rng(77);
    const ids = { nextId: 1 };
    const a: Hero[] = [];
    for (const c of ['hoplite', 'hoplite', 'hoplite', 'archer', 'companion', 'horse_archer', 'chariot'] as ClassId[]) a.push(makeHero(rng, ids, 'greek', c, 3, 2, undefined, a));
    const b: Hero[] = [];
    for (const c of ['wolf', 'wolf', 'boar', 'bear', 'thessalian', 'peltast', 'gallic'] as ClassId[]) b.push(makeHero(rng, ids, 'celtic', c, 3, 2, undefined, b));
    return { seed: 77, armies: [armySpec(a, true), armySpec(b, true)] };
  };
  it('the same setup gives the same battle, and a JSON round trip (the server) too', () => {
    const run = (s: BattleSetup) => {
      const bt = new Battle(s);
      bt.startBattle();
      for (let i = 0; i < 20 * 200 && bt.phase !== 'ended'; i++) bt.step();
      return `${bt.tick}:${bt.winner}:${bt.hash()}`;
    };
    const s = setup();
    const a = run(s);
    expect(run(setup())).toBe(a);
    expect(run(JSON.parse(JSON.stringify(setup())))).toBe(a);
  });

  it('a setup with an unknown mount (a newer client) plays as a man on foot', () => {
    const s = setup();
    (s.armies[0].units[4].stats as { mount?: string }).mount = 'elephant';
    const bt = new Battle(s);
    expect(bt.units[4].stats.mount).toBeUndefined();
    const side: Side = 0;
    expect(bt.units[4].side).toBe(side);
  });
});
