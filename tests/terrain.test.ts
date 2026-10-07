import { describe, expect, it } from 'vitest';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { armySpec } from '../src/game/armySpec';
import { makeHero, setBotLevel } from '../src/game/heroes';
import { TERRAIN, TERRAIN_LIST, type TerrainKind } from '../src/data/terrain';
import { Terrain, flatGrid, type TerrainGrid } from '../src/sim/terrain';
import { SITE_BASES, generateBattlefield, randomSite, siteAt, type BattleSite } from '../src/world/battlefield';
import { generateMap, T } from '../src/world/map';
import { hillGrid, runTerrainMirror } from '../src/dev/balance';
import type { Hero } from '../src/data/units';
import type { BattleSetup, Side } from '../src/sim/types';
import { standardSetup } from './helpers';

const W = 24;
const H = 36;

/** A grid of one terrain kind with optional per-cell overrides. */
function grid(fill: TerrainKind = 'open', paint?: ((x: number, y: number) => TerrainKind | null) | null, height?: (x: number, y: number) => number): TerrainGrid {
  let cells = '';
  let hs = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      cells += TERRAIN[paint?.(x, y) ?? fill].code;
      hs += String(height ? height(x, y) : 0);
    }
  }
  return { w: W, h: H, cells, height: hs };
}

function hero(rng: Rng, ids: { nextId: number }, arch: 'hoplite' | 'swordsman' | 'slinger', level = 3, group = 0): Hero {
  const h = makeHero(rng, ids, 'greek', arch, 1, 1, group);
  setBotLevel(h, level);
  return h;
}

/** One man per side, no bots, battle started; side 1 stands far away unless placed. */
function pair(terrain: TerrainGrid | undefined, seed = 3, arch: 'hoplite' | 'swordsman' | 'slinger' = 'swordsman'): Battle {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const b = new Battle({ seed, armies: [armySpec([hero(rng, ids, arch)], false), armySpec([hero(rng, ids, 'hoplite')], false)], timeLimit: 600, terrain });
  b.startBattle();
  return b;
}

/** Walk unit 0 toward (x, y) for `seconds` and return how far it got. */
function walk(b: Battle, x: number, y: number, seconds: number, from = { x: 12, y: 30 }): number {
  const u = b.units[0];
  u.x = from.x;
  u.y = from.y;
  b.units[1].x = 2;
  b.units[1].y = 1;
  b.issue(0, { kind: 'form', group: u.group, cx: x, cy: y, fx: 0, fy: -1, frontage: 1 });
  for (let i = 0; i < seconds * TICK_RATE; i++) b.step();
  return Math.sqrt((u.x - from.x) ** 2 + (u.y - from.y) ** 2);
}

describe('terrain data and grid', () => {
  it('every kind has a unique code; open ground is neutral', () => {
    const codes = new Set(TERRAIN_LIST.map((d) => d.code));
    expect(codes.size).toBe(TERRAIN_LIST.length);
    const o = TERRAIN.open;
    expect([o.speed, o.cover, o.scatter, o.blockMult, o.braceMult]).toEqual([1, 0, 0, 1, 1]);
    expect(o.blocked || o.noWall).toBe(false);
  });

  it('decodes cells, heights, the ford and the river rows', () => {
    const g = grid('open', (x, y) => (y === 17 ? (x >= 10 && x < 13 ? 'ford' : 'water') : null), (_x, y) => (y < 5 ? 2 : 0));
    const t = new Terrain(g, W, H);
    expect(t.at(1.5, 17.5).kind).toBe('water');
    expect(t.at(11.5, 17.2).kind).toBe('ford');
    expect(t.heightAt(3, 2)).toBe(2);
    expect(t.heightAt(3, 20)).toBe(0);
    expect(t.ford!.x).toBeCloseTo(11.5);
    expect(t.riverBetween(10, 25)).toBe(true);
    expect(t.riverBetween(20, 30)).toBe(false);
  });
});

describe('terrain effects in the simulation', () => {
  it('forest, scrub, rough ground and water slow men down', () => {
    const open = walk(pair(undefined), 12, 10, 4);
    const dist = (k: TerrainKind) => walk(pair(grid(k)), 12, 10, 4);
    expect(dist('forest')).toBeLessThan(open * 0.75);
    expect(dist('water')).toBeLessThan(dist('forest'));
    expect(dist('ford')).toBeLessThan(open * 0.7);
    expect(dist('rough')).toBeLessThan(open);
    expect(dist('scrub')).toBeLessThan(open);
  });

  it('climbing is slower and more tiring than walking on the flat', () => {
    const flat = pair(undefined);
    const up = pair(grid('open', null, (_x, y) => Math.max(0, Math.min(3, Math.floor(29.5 - y)))));
    const dFlat = walk(flat, 12, 10, 2.5, { x: 12, y: 30.5 });
    const dUp = walk(up, 12, 10, 2.5, { x: 12, y: 30.5 });
    expect(dUp).toBeLessThan(dFlat * 0.85);
    expect(up.units[0].stamina).toBeLessThan(flat.units[0].stamina);
  });

  it('rocks and the sea are impassable: men go around and never stand in them', () => {
    // A rock wall across the field with a gap on the left.
    const b = pair(grid('open', (x, y) => (y === 20 && x >= 4 ? 'rocks' : null)));
    let inside = 0;
    const u = b.units[0];
    u.x = 12;
    u.y = 26;
    b.units[1].x = 22;
    b.units[1].y = 1;
    b.issue(0, { kind: 'form', group: u.group, cx: 12, cy: 14, fx: 0, fy: -1, frontage: 1 });
    for (let i = 0; i < 40 * TICK_RATE; i++) {
      b.step();
      if (b.terrain!.blocked(u.x, u.y)) inside++;
    }
    expect(inside).toBe(0);
    // A slot placed on a rock is moved to free ground.
    const s = b.slotPos(u);
    expect(b.terrain!.blocked(s.x, s.y)).toBe(false);
  });

  it('forest breaks up formations', () => {
    const rng = new Rng(4);
    const ids = { nextId: 1 };
    const men = Array.from({ length: 6 }, () => hero(rng, ids, 'hoplite'));
    const slotsOn = (terrain?: TerrainGrid) => {
      const b = new Battle({ seed: 4, armies: [armySpec(men, false), armySpec([hero(rng, ids, 'hoplite')], false)], terrain });
      b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 28, fx: 0, fy: -1, frontage: 6 });
      return b.groupSlots(0);
    };
    const open = slotsOn();
    const wood = slotsOn(grid('forest'));
    // in the open the front rank is a straight line; in the wood it is ragged
    expect(new Set(open.map((p) => p.y.toFixed(3))).size).toBe(1);
    expect(new Set(wood.map((p) => p.y.toFixed(3))).size).toBeGreaterThan(3);
  });

  it('no shield wall while wading; trees and water spoil the block', () => {
    const mk = (k: TerrainKind) => {
      const b = pair(grid(k), 5, 'hoplite');
      b.issue(0, { kind: 'shieldwall', group: 0, on: true });
      return b.blockChance(b.units[0], 'front', 0, false);
    };
    const open = mk('open');
    expect(mk('water')).toBeLessThan(open * 0.6);
    expect(mk('ford')).toBeLessThan(open * 0.75);
    expect(mk('forest')).toBeLessThan(open);
  });

  it('woods give cover against missiles', () => {
    const hits = (k: TerrainKind) => {
      let n = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const rng = new Rng(seed);
        const ids = { nextId: 1 };
        const shooters = Array.from({ length: 3 }, () => hero(rng, ids, 'slinger', 3, 1));
        const target = Array.from({ length: 4 }, () => hero(rng, ids, 'swordsman'));
        // only the target's ground differs: the shooters stand on open ground
        const b = new Battle({ seed, armies: [armySpec(shooters, false), armySpec(target, false)], terrain: grid('open', (_x, y) => (y < 18 ? k : null)), timeLimit: 600 });
        b.startBattle();
        b.issue(1, { kind: 'form', group: 4, cx: 12, cy: 12, fx: 0, fy: 1, frontage: 4 });
        b.issue(0, { kind: 'form', group: 1, cx: 12, cy: 20, fx: 0, fy: -1, frontage: 3 });
        for (const u of b.units) {
          const p = b.slotPos(u);
          u.x = p.x;
          u.y = p.y;
        }
        for (let i = 0; i < 20 * TICK_RATE; i++) {
          b.step();
          for (const e of b.drainEvents()) if (e.type === 'hit' && e.ranged) n++;
        }
      }
      return n;
    };
    const open = hits('open');
    expect(open).toBeGreaterThan(20);
    expect(hits('forest')).toBeLessThan(open * 0.8);
  });

  it('blows from higher ground hit harder than blows from below', () => {
    const damage = (attackerHigh: boolean) => {
      let dealt = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const rng = new Rng(seed);
        const ids = { nextId: 1 };
        const a = Array.from({ length: 3 }, () => hero(rng, ids, 'swordsman'));
        const d = Array.from({ length: 3 }, () => hero(rng, ids, 'swordsman'));
        // side 0 stands at y > 18; height 2 on its half if attackerHigh, else on side 1's half
        const terrain = grid('open', null, (_x, y) => ((y >= 18) === attackerHigh ? 2 : 0));
        const b = new Battle({ seed, armies: [armySpec(a, false), armySpec(d, false)], terrain, timeLimit: 600 });
        b.startBattle();
        b.issue(0, { kind: 'form', group: 0, cx: 12, cy: 18.6, fx: 0, fy: -1, frontage: 3 });
        b.issue(1, { kind: 'form', group: 4, cx: 12, cy: 17.4, fx: 0, fy: 1, frontage: 3 });
        for (const u of b.units) {
          const p = b.slotPos(u);
          u.x = p.x;
          u.y = p.y;
          u.fy = u.side === 0 ? -1 : 1;
          u.fx = 0;
        }
        for (let i = 0; i < 8 * TICK_RATE && b.phase === 'battle'; i++) b.step();
        dealt += b.units.filter((u) => u.side === 0).reduce((s, u) => s + u.dmgDealt, 0);
      }
      return dealt;
    };
    expect(damage(true)).toBeGreaterThan(damage(false) * 1.25);
  });

  it('shooting downhill reaches further', () => {
    const b = pair(grid('open', null, (_x, y) => (y > 20 ? 2 : 0)), 3, 'slinger');
    const s = b.units[0];
    const t = b.units[1];
    s.y = 24;
    t.y = 10;
    expect(b.rangeBonus(s, t)).toBeGreaterThan(1);
    expect(b.rangeBonus(t, s)).toBe(0);
  });
});

describe('determinism with terrain', () => {
  const setupWith = (terrain: TerrainGrid | undefined, seed = 321): BattleSetup => ({ ...standardSetup(seed, false).setup, terrain });

  it('a battle on generated terrain replays exactly from its setup and order log', () => {
    const site: BattleSite = { base: 'hills', river: true, coast: true, rocky: true, woods: 0.3 };
    const terrain = generateBattlefield(77, site);
    const setup = setupWith(terrain);
    const pristine = JSON.parse(JSON.stringify(setup)) as BattleSetup;
    const a = new Battle(setup);
    a.issue(0, { kind: 'preset', group: 0, type: 'shieldwall' });
    const nDeploy = a.orderLog.filter((o) => o.side === 0).length;
    a.startBattle();
    for (let t = 0; t < 20 * 150 && a.phase !== 'ended'; t++) {
      if (a.tick === 20) a.issue(0, { kind: 'order', group: 0, order: 'advance' });
      if (a.tick === 300) a.issue(0, { kind: 'order', group: 0, order: 'charge' });
      a.step();
    }
    const human = a.orderLog.filter((o) => o.side === 0);
    const b = new Battle(pristine);
    for (const o of human.slice(0, nDeploy)) b.issue(0, o.order);
    b.startBattle();
    const rest = human.slice(nDeploy);
    for (let t = 0; t < 20 * 150 && b.phase !== 'ended'; t++) {
      for (const o of rest) if (o.tick === b.tick) b.issue(0, o.order);
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
    expect(JSON.stringify(b.result())).toBe(JSON.stringify(a.result()));
  });

  it('old setups without terrain still replay, and a flat open grid plays exactly like none', () => {
    const run = (setup: BattleSetup) => {
      const b = new Battle(setup);
      b.startBattle();
      for (let t = 0; t < 20 * 200 && b.phase !== 'ended'; t++) {
        if (b.tick === 30) b.issue(0, { kind: 'order', group: 0, order: 'advance' });
        b.step();
      }
      return `${b.tick}:${b.hash()}`;
    };
    // An old client's JSON: no terrain field at all.
    const old = JSON.parse(JSON.stringify(standardSetup(55, false).setup)) as BattleSetup;
    delete (old as { terrain?: unknown }).terrain;
    const r = run(old);
    expect(run(JSON.parse(JSON.stringify(old)))).toBe(r);
    expect(run({ ...old, terrain: flatGrid(W, H) })).toBe(r);
    // A malformed grid is ignored rather than crashing a replay.
    expect(run({ ...old, terrain: { w: 24, h: 36 } as unknown as TerrainGrid })).toBe(r);
  });

  it('terrain changes the battle', () => {
    const setup = setupWith(generateBattlefield(5, { base: 'forest', river: true, coast: false, rocky: true, woods: 0.6 }), 99);
    const plain = setupWith(undefined, 99);
    const run = (s: BattleSetup) => {
      const b = new Battle(s);
      b.startBattle();
      for (let t = 0; t < 20 * 60; t++) b.step();
      return b.hash();
    };
    expect(run(setup)).not.toBe(run(plain));
  });
});

describe('battlefield generator', () => {
  it('is deterministic and sized to the field', () => {
    for (const base of SITE_BASES) {
      const site: BattleSite = { base, river: base === 'plain', coast: base === 'beach', rocky: base === 'hills', woods: 0.2 };
      const a = generateBattlefield(1234, site);
      expect(a).toEqual(generateBattlefield(1234, site));
      expect(a.cells.length).toBe(W * H);
      expect(a.height!.length).toBe(W * H);
      expect(/^[0-3]+$/.test(a.height!)).toBe(true);
      expect(a.name).toBeTruthy();
    }
  });

  it('paints what the site asks for and keeps the deployment fronts clear', () => {
    let hills = 0;
    let woods = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const river = generateBattlefield(seed, { base: 'plain', river: true, coast: false, rocky: false, woods: 0 });
      const t = new Terrain(river, W, H);
      expect(t.ford).not.toBeNull();
      expect(t.riverBetween(8, 28)).toBe(true);
      const coast = generateBattlefield(seed, { base: 'beach', river: false, coast: true, rocky: false, woods: 0 });
      expect(coast.cells).toContain(TERRAIN.sea.code);
      expect(coast.cells).toContain(TERRAIN.sand.code);
      const h = generateBattlefield(seed, { base: 'hills', river: false, coast: false, rocky: true, woods: 0 });
      if (/[23]/.test(h.height!)) hills++;
      const f = generateBattlefield(seed, { base: 'forest', river: false, coast: false, rocky: false, woods: 0.5 });
      woods += [...f.cells].filter((c) => c === TERRAIN.forest.code).length / (W * H);
      // the centre of each deployment front is never blocked
      for (const g of [river, coast, h, f]) {
        const tt = new Terrain(g, W, H);
        for (const y of [8, 10, 26, 28]) for (let x = 9; x <= 15; x++) expect(tt.blocked(x + 0.5, y + 0.5)).toBe(false);
      }
    }
    expect(hills).toBeGreaterThan(15);
    expect(woods / 20).toBeGreaterThan(0.2);
  });

  it('reads the site from the world map', () => {
    const m = generateMap(4242);
    const find = (t: number) => {
      for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) if (m.terrain[y * m.w + x] === t && !m.river[y * m.w + x]) return { x, y };
      return null;
    };
    const forest = find(T.forest)!;
    expect(siteAt(m, forest.x + 0.5, forest.y + 0.5).base).toBe('forest');
    const hills = find(T.hills)!;
    expect(siteAt(m, hills.x, hills.y).base).toBe('hills');
    const beach = find(T.beach)!;
    const b = siteAt(m, beach.x, beach.y);
    expect(b.base).toBe('beach');
    expect(b.coast).toBe(true);
    let rv = -1;
    for (let i = 0; i < m.w * m.h && rv < 0; i++) if (m.river[i] && m.terrain[i] !== T.mountain) rv = i;
    expect(siteAt(m, rv % m.w, Math.floor(rv / m.w)).river).toBe(true);
    const r = randomSite(new Rng(3));
    expect(SITE_BASES).toContain(r.base);
  });
});

describe('the bot uses the ground', () => {
  it('a bot line deploys onto a hill in its zone and holds it while the enemy comes', () => {
    const rng = new Rng(8);
    const ids = { nextId: 1 };
    const a = Array.from({ length: 6 }, () => hero(rng, ids, 'hoplite'));
    const d = Array.from({ length: 6 }, () => hero(rng, ids, 'hoplite'));
    // a hill on the left of the bot's zone only
    const terrain = grid('open', null, (x, y) => (x > 10 ? 0 : y >= 3 && y <= 10 ? 2 : y === 11 ? 1 : 0));
    const b = new Battle({ seed: 8, armies: [armySpec(a, true), armySpec(d, true)], terrain });
    const main = b.groups.find((g) => g.side === 1 && g.role === 'main')!;
    const avgH = () => b.activeMembers(main.id).reduce((s, u) => s + b.heightAt(u.x, u.y), 0) / 6;
    expect(avgH()).toBeGreaterThan(1.5);
    b.startBattle();
    // it waits on the hill until the enemy has climbed up to it
    for (let i = 0; i < 25 * TICK_RATE && !main.contact; i++) {
      b.step();
      expect(main.order).toBe('hold');
    }
    expect(main.contact).toBe(true);
    expect(avgH()).toBeGreaterThan(1);
  });

  it('bot skirmishers form up in a wood', () => {
    const rng = new Rng(9);
    const ids = { nextId: 1 };
    const a = [hero(rng, ids, 'hoplite'), hero(rng, ids, 'hoplite'), hero(rng, ids, 'slinger', 3, 1), hero(rng, ids, 'slinger', 3, 1)];
    const d = a.map((h) => ({ ...h, id: `${h.id}b` }));
    const terrain = grid('open', (x, y) => (y >= 3 && y <= 10 && x >= 12 && x <= 19 ? 'forest' : null));
    const b = new Battle({ seed: 9, armies: [armySpec(a, false), armySpec(d, true)], terrain });
    const sk = b.units.filter((u) => u.side === 1 && u.stats.role === 'ranged');
    expect(sk.every((u) => b.ground(u.x, u.y).kind === 'forest')).toBe(true);
  });

  it('defending a ridge beats attacking it more often than not', () => {
    let win = 0;
    for (let i = 0; i < 40; i++) if (runTerrainMirror(9000 + i, (h: Side) => hillGrid(h)).win) win++;
    expect(win).toBeGreaterThanOrEqual(23);
  });
});
