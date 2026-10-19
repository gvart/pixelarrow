import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BRIDGE } from '../../src/war/sim/economy';
import type { BuildingSnap, RegionData, WarBuildSim } from '../../src/war/types';

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
  it('spans at most BRIDGE.maxSpan tiles of water bank to bank', () => {
    const ok = createSim(river(BRIDGE.maxSpan), 1);
    ok.claim(0, 8, 16, 14);
    const plan = ok.checkBridge(0, { material: 'wood', points: [12.5, 16.5, 28.5, 16.5] });
    expect(plan).toMatchObject({ ok: true, axis: 'x', span: BRIDGE.maxSpan });
    // ramps on the last dry tiles, 2 wide, decks 2 x 2 over the water
    expect(plan.pieces[0]).toMatchObject({ part: 'end0', tiles: [14, 16, 14, 17] });
    expect(plan.pieces.at(-1)).toMatchObject({ part: 'end1', tiles: [25, 16, 25, 17] });
    expect(plan.pieces.filter((p) => p.part === 'deck')).toHaveLength(BRIDGE.maxSpan / 2);
    const wide = createSim(river(BRIDGE.maxSpan + 1), 1);
    wide.claim(0, 8, 16, 14);
    expect(wide.checkBridge(0, { material: 'wood', points: [12.5, 16.5, 28.5, 16.5] })).toMatchObject({ ok: false, reason: 'span', span: BRIDGE.maxSpan + 1 });
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

describe('bridge determinism and budget', () => {
  const play = () => {
    const sim = createSim(river(8), 7);
    const s = base(sim, 20);
    sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [12.5, 6.5, 26.5, 6.5] });
    sim.order({ kind: 'placeBridge', team: 0, material: 'wood', points: [12.5, 24.5, 26.5, 24.5] });
    const ms: number[] = [];
    for (let t = 0; t < 2500; t++) {
      sim.step();
      ms.push(sim.stats().stepMs);
    }
    return { snap: JSON.stringify(sim.snapshot()), ms };
  };

  it('runs the same twice, within the tick budget', () => {
    const a = play(), b = play();
    expect(a.snap).toBe(b.snap);
    const avg = b.ms.reduce((x, y) => x + y, 0) / b.ms.length;
    expect(avg).toBeLessThan(2); // ms per tick for 20 builders on two bridges
  });
});
