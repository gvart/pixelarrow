import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BRIDGE } from '../../src/war/sim/economy';
import { parseRegion } from '../../src/war/region/schema';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { BRIDGE_DRAG, BRIDGE_STONE, scenarioById } from '../../src/war/scenarios';
import type { BuildingSnap, RegionData, ResourceKind, WarBuildSim } from '../../src/war/types';

/**
 * Flat grass (height 1), w x 32, with a deep river (height 0) running north-south over columns x0 .. x0 + width - 1.
 * The west bank is the team's (claimed round (8, 16)).
 */
function river(width: number, w = 40, x0 = 15): RegionData {
  const h = 32, n = w * h;
  const r: RegionData = {
    id: 'r', name: 'r', w, h, height: Array(n).fill(1), terrain: Array(n).fill('grass'), water: Array(n).fill(0), entries: [], noBuild: [],
  };
  for (let y = 0; y < h; y++) for (let x = x0; x < x0 + width; x++) {
    r.water[y * w + x] = 2;
    r.height[y * w + x] = 0;
  }
  return r;
}

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}

const bridges = (sim: WarBuildSim): BuildingSnap[] => sim.snapshot().buildings!.filter((b) => b.bridge);
const unitsOf = (sim: WarBuildSim, squad: number) => sim.snapshot().units.filter((u) => u.squad === squad);

/** A west-bank camp (the store) with stock, and a squad of n militia beside it. */
function base(sim: WarBuildSim, n = 12) {
  sim.claim(0, 8, 16, 14);
  sim.addStock(0, 'wood', 400);
  sim.addStock(0, 'stone', 600);
  const s = sim.spawnSquad('a', 0, 'militia', n, 9, 22);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 6, y: 16 });
  run(sim, 1500, () => sim.snapshot().buildings![0].state === 'done');
  expect(sim.snapshot().buildings![0].state).toBe('done');
  return s;
}

describe('bridge placement', () => {
  it('spans at most BRIDGE.maxSpan tiles of water bank to bank, per material (wood 12, stone 24)', () => {
    expect(BRIDGE.maxSpan).toEqual({ wood: 12, stone: 24 });
    for (const material of ['wood', 'stone'] as const) {
      const max = BRIDGE.maxSpan[material], W = 15 + max + 8;
      const ok = createSim(river(max, W, 15), 1);
      ok.claim(0, 8, 16, 14);
      const plan = ok.checkBridge(0, { material, points: [12.5, 16.5, 15 + max + 1.5, 16.5] });
      expect(plan).toMatchObject({ ok: true, axis: 'x', dir: [1, 0], width: 2, span: max, maxSpan: max });
      // ramps on the last 2 dry rows (outer row first on end0), 2 wide, decks 2 x 2 over the water
      expect(plan.pieces[0]).toMatchObject({ part: 'end0', tiles: [13, 16, 13, 17, 14, 16, 14, 17], rows: [13.5, 17, 14.5, 17] });
      expect(plan.pieces.at(-1)).toMatchObject({ part: 'end1', tiles: [15 + max, 16, 15 + max, 17, 16 + max, 16, 16 + max, 17] });
      expect(plan.pieces.filter((p) => p.part === 'deck')).toHaveLength(max / 2);
      const wide = createSim(river(max + 1, W, 15), 1);
      wide.claim(0, 8, 16, 14);
      expect(wide.checkBridge(0, { material, points: [12.5, 16.5, 15 + max + 2.5, 16.5] })).toMatchObject({ ok: false, reason: 'span', span: max + 1 });
    }
    // a wood bridge cannot take a stone bridge's span
    const sim = createSim(river(16, 40, 15), 1);
    sim.claim(0, 8, 16, 14);
    expect(sim.checkBridge(0, { material: 'wood', points: [12.5, 16.5, 32.5, 16.5] }).reason).toBe('span');
    expect(sim.checkBridge(0, { material: 'stone', points: [12.5, 16.5, 32.5, 16.5] }).ok).toBe(true);
  });

  it('is 1, 2 or 3 tiles wide', () => {
    const sim = createSim(river(6), 1);
    sim.claim(0, 8, 16, 14);
    const at = (width: number, points = [12.5, 16.5, 24.5, 16.5]) => sim.checkBridge(0, { material: 'wood', points, width });
    expect(at(1).pieces[0].tiles).toEqual([13, 16, 14, 16]);
    expect(at(2).pieces[0].tiles).toEqual([13, 16, 13, 17, 14, 16, 14, 17]);
    expect(at(3).pieces[0].tiles).toEqual([13, 15, 13, 16, 13, 17, 14, 15, 14, 16, 14, 17]); // centred on the line
    expect(at(3).pieces[1].tiles).toEqual([15, 15, 15, 16, 15, 17, 16, 15, 16, 16, 16, 17]);
    for (const w of [1, 2, 3]) expect(at(w)).toMatchObject({ ok: true, width: w });
    expect(at(7).width).toBe(3); // clamped
    // along y: beside the line in x
    const ns = createSim(river(6), 1); // the water runs north-south: a y bridge stays on its bank
    ns.claim(0, 8, 16, 14);
    expect(ns.checkBridge(0, { material: 'wood', points: [8.5, 10.5, 8.5, 20.5], width: 3 })).toMatchObject({ axis: 'y', reason: 'short' });
  });

  it('snaps the drag to the nearest of 4 directions; the diagonals lay a staircase band of rows', () => {
    const sim = createSim(river(8), 1);
    sim.claim(0, 8, 16, 14);
    const plan = (points: number[], width = 2) => sim.checkBridge(0, { material: 'stone', points, width });
    expect(plan([12.5, 16.5, 26.5, 17.5])).toMatchObject({ axis: 'x', dir: [1, 0] });
    expect(plan([12.5, 10.5, 26.5, 22.5])).toMatchObject({ axis: 'v', dir: [1, 1] }); // screen-vertical
    expect(plan([12.5, 22.5, 26.5, 10.5])).toMatchObject({ axis: 'h', dir: [1, -1] }); // screen-horizontal
    expect(plan([14.5, 30.5, 14.5, 2.5])).toMatchObject({ axis: 'y', dir: [0, -1] });
    // 1 wide along (1, 1): 2 diagonals, each row a tile and the 4-neighbour half a step ahead (no corner-only joins)
    const v1 = plan([12.5, 10.5, 26.5, 24.5], 1);
    expect(v1.ok).toBe(true);
    expect(v1.pieces[0]).toMatchObject({ part: 'end0', tiles: [13, 11, 13, 12, 14, 12, 14, 13] });
    expect(v1.span).toBe(Math.round(8 * Math.SQRT2)); // 8 rows of water, sqrt 2 tiles each
    const set = new Set(v1.pieces.flatMap((p) => p.tiles.flatMap((v, i) => (i % 2 ? [] : [`${v},${p.tiles[i + 1]}`]))));
    for (const p of v1.pieces) for (let i = 0; i < p.tiles.length; i += 2) {
      const [x, y] = [p.tiles[i], p.tiles[i + 1]];
      expect([`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`].some((k) => set.has(k))).toBe(true);
    }
    // wider: round(w sqrt 2) + 1 tiles per row, the row centres one step apart along the line
    for (const [w, n] of [[1, 2], [2, 4], [3, 5]]) {
      const p = plan([12.5, 22.5, 26.5, 8.5], w);
      expect(p.ok).toBe(true);
      expect(p.pieces[0].tiles.length / 2).toBe(2 * n); // a 2-row ramp
      const r = p.pieces[1].rows;
      expect(r[2] - r[0]).toBeCloseTo(1);
      expect(r[3] - r[1]).toBeCloseTo(-1);
    }
    // a diagonal span counts sqrt 2 tiles a row: 9 rows of water (13 tiles) is over the wood limit, under the stone one
    const nine = createSim(river(9), 1);
    nine.claim(0, 8, 16, 14);
    expect(nine.checkBridge(0, { material: 'wood', points: [12.5, 10.5, 26.5, 24.5], width: 1 })).toMatchObject({ ok: false, reason: 'span', span: 13 });
    expect(nine.checkBridge(0, { material: 'stone', points: [12.5, 10.5, 26.5, 24.5], width: 1 }).ok).toBe(true);
  });

  it('needs a dry start bank, a far bank within the drag, own influence on one bank and snaps to its axis', () => {
    const sim = createSim(river(8), 1);
    expect(sim.checkBridge(0, { material: 'stone', points: [12.5, 16.5, 28.5, 16.5] }).reason).toBe('influence');
    sim.claim(0, 8, 16, 14);
    expect(sim.checkBridge(0, { material: 'stone', points: [16.5, 16.5, 28.5, 16.5] }).reason).toBe('bank'); // starts in the water
    expect(sim.checkBridge(0, { material: 'stone', points: [12.5, 16.5, 20.5, 16.5] }).reason).toBe('bank'); // ends in it
    expect(sim.checkBridge(0, { material: 'stone', points: [12.5, 16.5, 13.5, 16.5] }).reason).toBe('short');
    // a slightly slanted drag is a straight bridge along x
    const p = sim.checkBridge(0, { material: 'stone', points: [12.5, 16.5, 28.5, 18.5] });
    expect(p.ok).toBe(true);
    for (const q of p.pieces) for (let i = 1; i < q.tiles.length; i += 2) expect([16, 17]).toContain(q.tiles[i]);
    // the far bank alone in influence is enough (bridging back home)
    const back = createSim(river(8), 1);
    back.claim(0, 8, 16, 14);
    expect(back.checkBridge(0, { material: 'stone', points: [26.5, 16.5, 10.5, 16.5] }).ok).toBe(true);
  });
});

describe('bridge construction', () => {
  it('builds from the bank inwards, closed until done, then the squad crosses on the deck', () => {
    const sim = createSim(river(8), 2);
    const s = base(sim);
    sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [12.5, 16.5, 26.5, 16.5] });
    sim.step();
    const bs = bridges(sim);
    expect(bs.map((b) => b.bridge!.part)).toEqual(['end0', 'deck', 'deck', 'deck', 'deck', 'end1']);
    // order: a deck piece starts only once the piece towards the bank is done
    const started = new Map<number, number>(), done = new Map<number, number>();
    let crossedEarly = false;
    const t = run(sim, 9000, () => {
      const tick = sim.snapshot().tick;
      for (const b of bridges(sim)) {
        if (b.state !== 'foundation' && !started.has(b.id)) started.set(b.id, tick);
        if (b.state === 'done' && !done.has(b.id)) done.set(b.id, tick);
      }
      if (unitsOf(sim, s).some((u) => u.x > 23)) crossedEarly = bridges(sim).some((b) => b.state !== 'done');
      return bridges(sim).every((b) => b.state === 'done');
    });
    expect(t).toBeLessThan(9000);
    const decks = bs.filter((b) => b.bridge!.part === 'deck');
    for (let i = 1; i < decks.length; i++) expect(started.get(decks[i].id)!).toBeGreaterThanOrEqual(done.get(decks[i - 1].id)!);
    expect(started.get(decks[0].id)!).toBeGreaterThanOrEqual(done.get(bs[0].id)!);
    expect(crossedEarly).toBe(false);
    // finished: the squad marches over at the deck level
    sim.order({ kind: 'move', squad: s, x: 32, y: 16.5 });
    let onDeck = false;
    run(sim, 900, () => {
      for (const u of unitsOf(sim, s)) if (u.x > 15 && u.x < 23 && u.on !== undefined) {
        onDeck = true;
        expect(u.z).toBe(1);
      }
      return unitsOf(sim, s).every((u) => u.x > 27);
    });
    expect(onDeck).toBe(true);
    expect(unitsOf(sim, s).every((u) => u.x > 27 && u.state !== 'dead')).toBe(true);
  });

  it('a wood bridge burns and collapses under the men on it; stone does not burn', () => {
    const sim = createSim(river(6), 3);
    const s = base(sim);
    sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [13.5, 16.5, 22.5, 16.5] });
    run(sim, 6000, () => bridges(sim).every((b) => b.state === 'done'));
    expect(bridges(sim).every((b) => b.state === 'done')).toBe(true);
    sim.order({ kind: 'move', squad: s, x: 6, y: 26 }); // the builders leave (they would mend the fire damage)
    // a second squad stands on the first deck piece; foes torch the ramp beside it and the fire spreads along
    const deck1 = bridges(sim)[1];
    const on = sim.spawnSquad('a', 0, 'militia', 4, 10, 20);
    sim.order({ kind: 'move', squad: on, x: deck1.x, y: deck1.y });
    run(sim, 300);
    const tileOf = (u: { x: number; y: number }) => [Math.floor(u.x), Math.floor(u.y)];
    const onIt = () => unitsOf(sim, on).filter((u) => u.state !== 'dead' && deck1.tiles.some((v, i) => i % 2 === 0 && v === tileOf(u)[0] && deck1.tiles[i + 1] === tileOf(u)[1]));
    expect(onIt().length).toBeGreaterThan(0);
    const torches = sim.spawnSquad('a', 1, 'militia', 4, 11, 12);
    sim.order({ kind: 'ignite', squad: torches, building: bridges(sim)[0].id });
    let before: number[] = [];
    run(sim, 12000, () => {
      const b = bridges(sim).find((q) => q.id === deck1.id)!;
      if (b.state !== 'destroyed') before = onIt().map((u) => u.id);
      return b.state === 'destroyed';
    });
    expect(bridges(sim).find((b) => b.id === deck1.id)!.state).toBe('destroyed');
    expect(before.length).toBeGreaterThan(0);
    const units = new Map(sim.snapshot().units.map((u) => [u.id, u]));
    for (const id of before) expect(units.get(id)!.state).toBe('dead'); // drowned: killed or wounded
    // the water is closed again: no way over
    const walkers = sim.spawnSquad('a', 0, 'militia', 4, 10, 17);
    sim.order({ kind: 'move', squad: walkers, x: 30, y: 17 });
    run(sim, 600);
    expect(unitsOf(sim, walkers).every((u) => u.x < 16)).toBe(true);
    // stone: torches find nothing to light
    const stone = createSim(river(6), 4);
    const q = base(stone);
    stone.order({ kind: 'placeBridge', squad: q, material: 'stone', points: [13.5, 16.5, 22.5, 16.5] });
    run(stone, 20000, () => bridges(stone).every((b) => b.state === 'done'));
    expect(bridges(stone).every((b) => b.state === 'done')).toBe(true);
    const tq = stone.spawnSquad('a', 1, 'militia', 4, 11, 12);
    stone.order({ kind: 'ignite', squad: tq, building: bridges(stone)[0].id });
    run(stone, 300);
    expect(bridges(stone).some((b) => b.burning)).toBe(false);
  });

  it('a 1-wide diagonal footbridge: built from the bank, crossed on the deck along the diagonal, collapses when burnt', () => {
    const sim = createSim(river(6), 6);
    const s = base(sim);
    // along (1, 1): 6 rows of water (x 15..20), ramps on rows 2 and 9
    sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [12.5, 10.5, 24.5, 22.5], width: 1 });
    sim.step();
    const bs = bridges(sim);
    expect(bs.map((b) => b.bridge!.part)).toEqual(['end0', 'deck', 'deck', 'deck', 'end1']);
    expect(bs[0].bridge).toMatchObject({ axis: 'v', dir: [1, 1], width: 1 });
    run(sim, 9000, () => bridges(sim).every((b) => b.state === 'done'));
    expect(bridges(sim).every((b) => b.state === 'done')).toBe(true);
    // over the deck to the far bank; on the way every man on the water stands on the deck level
    const deckTiles = new Set(bs.flatMap((b) => b.tiles.flatMap((v, i) => (i % 2 ? [] : [`${v},${b.tiles[i + 1]}`]))));
    sim.order({ kind: 'move', squad: s, x: 30, y: 26 });
    let onDeck = 0, wet = 0;
    run(sim, 1500, () => {
      for (const u of unitsOf(sim, s)) if (u.x >= 15 && u.x < 21) {
        if (deckTiles.has(`${Math.floor(u.x)},${Math.floor(u.y)}`)) (onDeck++, expect(u.z).toBe(1));
        else wet++;
      }
      return unitsOf(sim, s).every((u) => u.x > 22);
    });
    expect(onDeck).toBeGreaterThan(0);
    expect(wet).toBe(0); // no corner cut into the water
    expect(unitsOf(sim, s).every((u) => u.x > 22 && u.state !== 'dead')).toBe(true);
    // the builders go back; foes torch the near ramp and the fire takes the deck: the way over closes
    sim.order({ kind: 'move', squad: s, x: 26, y: 4 });
    const torches = sim.spawnSquad('a', 1, 'militia', 4, 11, 8);
    sim.order({ kind: 'ignite', squad: torches, building: bs[0].id });
    run(sim, 12000, () => bridges(sim).some((b) => b.bridge!.part === 'deck' && b.state === 'destroyed'));
    const gone = bridges(sim).find((b) => b.bridge!.part === 'deck' && b.state === 'destroyed');
    expect(gone).toBeDefined();
    const walkers = sim.spawnSquad('a', 0, 'militia', 4, 10, 17);
    sim.order({ kind: 'move', squad: walkers, x: 30, y: 17 });
    run(sim, 600);
    expect(unitsOf(sim, walkers).every((u) => u.x < 16)).toBe(true);
  });

  it('a 3-wide wood bridge along the screen-horizontal diagonal takes a squad over', () => {
    const sim = createSim(river(5), 8);
    const s = base(sim);
    sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [12.5, 22.5, 23.5, 11.5], width: 3 });
    sim.step();
    expect(bridges(sim)[0].bridge).toMatchObject({ axis: 'h', dir: [1, -1], width: 3 });
    run(sim, 40000, () => sim.snapshot().tick % 50 === 0 && bridges(sim).every((b) => b.state === 'done'));
    expect(bridges(sim).every((b) => b.state === 'done')).toBe(true);
    sim.order({ kind: 'move', squad: s, x: 28, y: 10 });
    run(sim, 1500, () => unitsOf(sim, s).every((u) => u.x > 21));
    expect(unitsOf(sim, s).every((u) => u.x > 21 && u.state !== 'dead')).toBe(true);
  });

  it('wood is much faster to build than stone', () => {
    const time = (material: 'wood' | 'stone') => {
      const sim = createSim(river(6), 5);
      const s = base(sim);
      sim.order({ kind: 'placeBridge', squad: s, material, points: [13.5, 16.5, 22.5, 16.5] });
      return run(sim, 30000, () => bridges(sim).every((b) => b.state === 'done'));
    };
    const wood = time('wood'), stone = time('stone');
    expect(wood).toBeLessThan(3000); // ~ 1-2 min for one squad
    expect(stone).toBeGreaterThan(wood * 3);
  });
});

// the per-tick time budget of this run is in tests/perf/war.perf.ts (npm run perf:war)
describe('bridge determinism', () => {
  const play = () => {
    const sim = createSim(river(8), 7);
    const s = base(sim, 20);
    sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [12.5, 6.5, 26.5, 6.5] });
    sim.order({ kind: 'placeBridge', team: 0, material: 'wood', points: [12.5, 24.5, 26.5, 24.5] });
    run(sim, 2500);
    return JSON.stringify(sim.snapshot());
  };

  it('runs the same twice', () => {
    expect(play()).toBe(play());
  });
});

describe('bridge-test scenario (test-ridge)', () => {
  it('a 3-wide stone bridge and a 1-wide footbridge stand, BRIDGE_DRAG is free, the hoplites cross', () => {
    const sc = scenarioById('bridge-test')!, e = sc.economy!;
    const sim = createSim(parseRegion(ridgeJson), 11);
    for (const c of e.claims) sim.claim(c.team, c.x, c.y, c.r);
    for (const [r, n] of Object.entries(e.stock ?? {})) sim.addStock(0, r as ResourceKind, n);
    for (const [r, n] of Object.entries(e.foeStock ?? {})) sim.addStock(1, r as ResourceKind, n);
    for (const q of sc.squads) sim.spawnSquad(q.owner ?? 'you', q.team, q.cls, q.count, q.x, q.y);
    // as the sandbox's prebuild: idle squads of each team take the nearest open site of theirs
    const prebuild = (max: number) => run(sim, max, () => {
      const snap = sim.snapshot();
      if (snap.tick % 20) return false;
      const open = snap.buildings!.filter((b) => b.state === 'foundation' || b.state === 'scaffold');
      if (!open.length) return true;
      for (const q of snap.squads) {
        const u = snap.units.find((v) => v.squad === q.id);
        const mine = open.filter((b) => b.team === q.team);
        if (!u || q.order === 'build' || !mine.length) continue;
        const site = mine.reduce((a, b) => (Math.hypot(b.x - u.x, b.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? b : a));
        sim.order({ kind: 'build', squad: q.id, site: site.id });
      }
      return false;
    });
    for (const t of e.sites ?? []) sim.order({ kind: 'placeBuilding', squad: t.squad, type: t.type, x: t.x, y: t.y });
    prebuild(e.prebuild!);
    for (const { squad, phase: _, ...w } of e.walls ?? []) sim.order({ kind: 'placeWall', squad, ...w });
    prebuild(e.prebuild!);
    for (const o of sc.after!.orders) sim.order(o);
    expect(sim.snapshot().buildings!.every((b) => b.state === 'done')).toBe(true);
    // the standing bridges (as the sandbox: laid out, then done at once)
    for (const { team, ...b } of e.bridges ?? []) sim.order({ kind: 'placeBridge', team, ...b });
    sim.step(); // orders apply on the next step
    sim.finishBridges(0);
    sim.step();
    const bs = bridges(sim);
    expect(bs.every((b) => b.state === 'done')).toBe(true);
    expect(new Set(bs.map((b) => `${b.bridge!.axis}${b.bridge!.width}${b.type}`))).toEqual(new Set(['h3stoneBridge', 'h1woodBridge']));
    expect(sim.checkBridge(0, { material: 'stone', points: [...BRIDGE_STONE], width: 3 }).reason).toBe('overlap');
    // a free reach for a bridge of your own
    const plan = sim.checkBridge(0, { material: 'wood', points: [...BRIDGE_DRAG] });
    expect(plan.ok).toBe(true);
    expect(plan.span).toBeLessThanOrEqual(BRIDGE.maxSpan.wood);
    // the hoplites go over to the east bank on a standing bridge
    sim.order({ kind: 'move', squad: 1, x: 312, y: 384 });
    run(sim, 2400, () => unitsOf(sim, 1).every((u) => u.x > 309));
    // every man still standing is over (the pickets catch a few on the way)
    expect(unitsOf(sim, 1).filter((u) => u.x > 309).length).toBeGreaterThanOrEqual(8);
    expect(unitsOf(sim, 1).every((u) => u.state === 'dead' || u.x > 309)).toBe(true);
  });
});

describe('bridge lanes', () => {
  /** A finished bridge of team 0 over river(water) and a squad of n of cls on the west bank. */
  const crossing = (water: number, material: 'wood' | 'stone', points: number[], width: number, cls: 'militia' | 'hoplite', n: number, seed = 21) => {
    const sim = createSim(river(water), seed);
    sim.claim(0, 8, 16, 14);
    sim.order({ kind: 'placeBridge', team: 0, material, points, width });
    sim.step();
    sim.finishBridges(0);
    sim.step();
    const bs = bridges(sim);
    expect(bs.every((b) => b.state === 'done')).toBe(true);
    const tiles = new Set(bs.flatMap((b) => b.tiles.flatMap((v, i) => (i % 2 ? [] : [`${v},${b.tiles[i + 1]}`]))));
    const br = bs[0].bridge!, l = Math.hypot(br.dir[0], br.dir[1]), [ex, ey] = [br.dir[0] / l, br.dir[1] / l];
    /** Across (c) and along (a) the centre line, and whether the point is on the bridge's tiles. */
    const at = (x: number, y: number) => ({ c: (x - br.rows[0]) * -ey + (y - br.rows[1]) * ex, a: (x - br.rows[0]) * ex + (y - br.rows[1]) * ey, on: tiles.has(`${Math.floor(x)},${Math.floor(y)}`) });
    const s = sim.spawnSquad('a', 0, cls, n, 8, 16);
    run(sim, 100);
    return { sim, s, at };
  };
  const wet = (x: number, water: number, x0 = 15) => x >= x0 && x < x0 + water;

  it('a 1-wide footbridge: strictly single file, FILE apart, nobody over the water off the deck at any tick', () => {
    const { sim, s, at } = crossing(6, 'wood', [12.5, 10.5, 24.5, 22.5], 1, 'militia', 16);
    sim.order({ kind: 'move', squad: s, x: 30, y: 26 });
    let most = 0, queued = 0;
    const t = run(sim, 3000, () => {
      const us = unitsOf(sim, s), on: number[] = [];
      for (const u of us) {
        const p = at(u.x, u.y);
        if (wet(u.x, 6)) expect(p.on).toBe(true);
        if (p.on) (expect(Math.abs(p.c)).toBeLessThan(1e-6), on.push(p.a));
      }
      on.sort((a, b) => a - b);
      for (let i = 1; i < on.length; i++) expect(on[i] - on[i - 1]).toBeGreaterThan(0.6); // one man a ~1.4 m
      most = Math.max(most, on.length);
      if (on.length && us.some((u) => u.x < 13)) queued++;
      return us.every((u) => u.x > 22);
    });
    expect(t).toBeLessThan(3000);
    expect(most).toBeGreaterThan(3);
    expect(queued).toBeGreaterThan(10); // the rest wait on the bank while the file is on the bridge
    // over: the squad takes its line again
    run(sim, 300);
    const cs = unitsOf(sim, s).map((u) => at(u.x, u.y).c);
    expect(Math.max(...cs) - Math.min(...cs)).toBeGreaterThan(3);
  });

  it('a 3-wide stone bridge: three lanes, never off them over the water', () => {
    const { sim, s, at } = crossing(5, 'stone', [12.5, 22.5, 23.5, 11.5], 3, 'hoplite', 24);
    sim.order({ kind: 'move', squad: s, x: 28, y: 10 });
    const lanes = new Set<number>();
    const t = run(sim, 3000, () => {
      for (const u of unitsOf(sim, s)) {
        const p = at(u.x, u.y);
        if (!wet(u.x, 5)) continue; // over the water (the ramps' outer ends on the bank may run past a lane's tiles)
        expect(p.on).toBe(true);
        expect(Math.abs(p.c)).toBeLessThanOrEqual(0.8 + 1e-6); // within the outer lanes
        const lane = Math.round(p.c / 0.8);
        if (Math.abs(p.c - lane * 0.8) < 0.1) lanes.add(lane);
      }
      return unitsOf(sim, s).every((u) => u.x > 21);
    });
    expect(t).toBeLessThan(3000);
    expect(lanes).toEqual(new Set([-1, 0, 1]));
  });

  it('crosses the same twice', () => {
    const play = () => {
      const { sim, s } = crossing(6, 'wood', [12.5, 10.5, 24.5, 22.5], 1, 'militia', 16);
      sim.order({ kind: 'move', squad: s, x: 30, y: 26 });
      run(sim, 600);
      return JSON.stringify(sim.snapshot());
    };
    expect(play()).toBe(play());
  });
});
