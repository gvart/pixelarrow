import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { BUILDINGS, SEGMENT } from '../../src/war/sim/economy';
import { SQUAD_MAX } from '../../src/war/sim/soldiers';
import { WallDraw } from '../../src/war/view/build/wallDraw';
import { activityText, waitText } from '../../src/war/view/hud/activity';
import type { BuildingSnap, WarBuildSim } from '../../src/war/types';
import { flat } from './flatRegion';

/** W-57 build UX: walls like Age of Empires, construction 3x faster, stalled sites say why, squads say what they do. */

function run(sim: WarBuildSim, ticks: number, until?: () => boolean): number {
  for (let t = 0; t < ticks; t++) {
    sim.step();
    if (until?.()) return t + 1;
  }
  return ticks;
}
const bs = (sim: WarBuildSim) => sim.snapshot().buildings!;
const at = (b: BuildingSnap, x: number, y: number) => b.tiles.some((v, i) => i % 2 === 0 && v === x && b.tiles[i + 1] === y);

/** Team 0 with a done camp at (20, 33) on flat 48 x 48 grass (a rock at (20, 20)) and a squad of 12 by it; [sim, squad]. */
function base(seed: number, wood = 3000): [WarBuildSim, number] {
  const r = flat(48);
  r.terrain[20 * 48 + 20] = 'rock';
  const sim = createSim(r, seed);
  sim.claim(0, 20, 30, 24);
  const s = sim.spawnSquad('a', 0, 'militia', SQUAD_MAX, 20, 28);
  sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 });
  run(sim, 2000, () => bs(sim)[0]?.state === 'done');
  expect(bs(sim)[0].state).toBe('done');
  sim.addStock(0, 'wood', wood);
  sim.addStock(0, 'stone', 3000);
  return [sim, s];
}

describe('wall lines (W-57)', () => {
  it('a line across a rock builds its valid pieces and skips the blocked one with its reason', () => {
    const [sim, s] = base(1);
    const o = { material: 'wood' as const, points: [12.5, 20.5, 28.5, 20.5] };
    const plan = sim.checkWall(0, o);
    expect(plan.ok).toBe(true);
    const bad = plan.pieces.filter((p) => !p.ok);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ reason: 'rock', tiles: [20, 20] });
    expect(plan.pieces.filter((p) => p.ok).length).toBeGreaterThanOrEqual(4);
    const before = bs(sim).length;
    sim.order({ kind: 'placeWall', squad: s, ...o });
    sim.step();
    const laid = bs(sim).slice(before);
    expect(laid.length).toBe(plan.pieces.filter((p) => p.ok).length);
    expect(laid.some((b) => at(b, 20, 20))).toBe(false);
    expect(laid.reduce((n, b) => n + b.tiles.length / 2, 0)).toBe(16); // 17 tiles, the rock skipped
    for (const b of laid) expect(b.tiles.length / 2).toBeLessThanOrEqual(SEGMENT);
    // the squad builds them all
    run(sim, 6000, () => bs(sim).slice(before).every((b) => b.state === 'done'));
    expect(bs(sim).slice(before).every((b) => b.state === 'done')).toBe(true);
  });

  it('a line wholly blocked is refused; one outside influence names it', () => {
    const [sim] = base(2);
    expect(sim.checkWall(0, { material: 'wood', points: [20.5, 20.5, 20.5, 20.5] }).ok).toBe(false);
    const far = sim.checkWall(0, { material: 'wood', points: [2.5, 2.5, 8.5, 2.5] });
    expect(far).toMatchObject({ ok: false, reason: 'influence' });
  });

  it('a line starting on an own tower joins it instead of overlapping', () => {
    const [sim, s] = base(3);
    sim.order({ kind: 'placeBuilding', squad: s, type: 'woodTower', x: 14, y: 24 }); // tiles (13..14, 23..24)
    run(sim, 3000, () => bs(sim)[1]?.state === 'done');
    expect(bs(sim)[1].state).toBe('done');
    const plan = sim.checkWall(0, { material: 'wood', points: [13.5, 23.5, 24.5, 23.5] });
    expect(plan.ok).toBe(true);
    expect(plan.pieces.every((p) => p.ok)).toBe(true);
    const tiles = plan.pieces.flatMap((p) => p.tiles);
    expect(Math.min(...tiles.filter((_, i) => i % 2 === 0))).toBe(15); // starts right after the tower
    // ending on it too, from the other side
    expect(sim.checkWall(0, { material: 'wood', points: [6.5, 24.5, 14.5, 24.5] }).pieces.every((p) => p.ok)).toBe(true);
  });

  it('a gate dropped on a wall replaces that stretch; a tower dropped on it takes its tiles', () => {
    const [sim, s] = base(4);
    sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [12.5, 24.5, 19.5, 24.5] });
    run(sim, 3000, () => bs(sim).slice(1).every((b) => b.state === 'done'));
    const wall = bs(sim).slice(1);
    expect(wall.every((b) => b.state === 'done')).toBe(true);
    expect(sim.checkPlacement(0, 'woodGate', 15, 24.5, 0)).toMatchObject({ ok: true });
    expect(sim.checkPlacement(0, 'woodTower', 19, 24)).toMatchObject({ ok: true });
    sim.order({ kind: 'placeBuilding', squad: s, type: 'woodGate', x: 15, y: 24.5, rot: 0 });
    sim.step();
    const gate = bs(sim).find((b) => b.type === 'woodGate')!;
    expect(gate).toBeTruthy();
    const segs = bs(sim).filter((b) => b.type === 'palisade');
    for (const b of segs) expect(at(b, 14, 24) || at(b, 15, 24)).toBe(false);
    expect(segs.reduce((n, b) => n + b.tiles.length / 2, 0)).toBe(6);
    run(sim, 3000, () => bs(sim).find((b) => b.id === gate.id)!.state === 'done');
    expect(bs(sim).find((b) => b.id === gate.id)!.state).toBe('done');
  });
});

describe('build times (W-57: about 3x faster)', () => {
  it('labour by squad: palisade segment ~40 s, stone segment ~3 min, tower ~1 min', () => {
    const secs = (t: keyof typeof BUILDINGS, tiles = 1) => (BUILDINGS[t].labour * tiles) / Math.min(SQUAD_MAX, BUILDINGS[t].workers);
    expect(secs('palisade', SEGMENT)).toBe(40);
    expect(secs('stoneWall', SEGMENT * 2)).toBe(200); // 2 deep
    expect(secs('woodTower')).toBe(50);
  });

  it('a squad of 12 puts up a palisade segment within a minute of the order', () => {
    const [sim, s] = base(5);
    sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [18.5, 28.5, 21.5, 28.5] });
    sim.step();
    const id = bs(sim).at(-1)!.id;
    const t = run(sim, 1200, () => bs(sim).find((b) => b.id === id)!.state === 'done');
    expect(bs(sim).find((b) => b.id === id)!.state).toBe('done');
    expect(t / 10).toBeLessThan(60);
  });
});

describe('stalled sites (W-57)', () => {
  it('a site short of wood says what it waits for; the squad card says so too', () => {
    const [sim, s] = base(6, 6);
    sim.order({ kind: 'placeWall', squad: s, material: 'wood', points: [18.5, 28.5, 21.5, 28.5] }); // 24 wood, 6 in stock
    run(sim, 1500);
    const site = bs(sim).at(-1)!;
    expect(site.state).not.toBe('done');
    expect(site.waiting).toEqual({ wood: 18 });
    expect(waitText(site)).toBe('Waiting for 18 wood');
    const snap = sim.snapshot();
    expect(activityText(snap.squads[s], snap)).toBe('Waiting for 18 wood');
    // more wood: it finishes
    sim.addStock(0, 'wood', 100);
    run(sim, 1500, () => bs(sim).at(-1)!.state === 'done');
    expect(bs(sim).at(-1)!.waiting).toBeUndefined();
  });

  it('a planned site has no workers', () => {
    const [sim] = base(7);
    sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 26.5, y: 33.5 });
    sim.step();
    const site = bs(sim).at(-1)!;
    expect(site.stalled).toBe('noWorkers');
    expect(waitText(site)).toBe('No workers');
  });
});

describe('squad activity (W-57)', () => {
  it('holding, building, marching in plain words', () => {
    const [sim, s] = base(8);
    sim.order({ kind: 'hold', squad: s });
    run(sim, 300);
    let snap = sim.snapshot();
    expect(activityText(snap.squads[s], snap)).toBe('Holding');
    sim.order({ kind: 'placeBuilding', squad: s, type: 'storehouse', x: 26.5, y: 33.5 });
    run(sim, 300);
    snap = sim.snapshot();
    expect(activityText(snap.squads[s], snap)).toMatch(/^Building storehouse \(\d+%\)$/);
    expect(activityText(snap.units.find((u) => u.squad === s)!, snap)).toMatch(/^Building storehouse|^Marching to the storehouse site/);
    sim.order({ kind: 'move', squad: s, x: 34, y: 33 });
    sim.step();
    sim.step();
    snap = sim.snapshot();
    expect(activityText(snap.squads[s], snap, { goal: { x: 26.5, y: 33.5 } })).toBe('Marching to the storehouse');
    expect(activityText(snap.squads[s], snap)).toBe('Marching');
  });
});

describe('wall drawing (AoE / Stronghold input)', () => {
  it('click start, click end orders the line; a drag does too; shift chains from the end', () => {
    const d = new WallDraw();
    d.press([1.5, 1.5]);
    expect(d.release([1.5, 1.5], false)).toBeNull(); // first click: the start
    expect(d.start).toEqual([1.5, 1.5]);
    d.press([6.5, 1.5]);
    expect(d.release([6.5, 1.5], false)).toEqual([1.5, 1.5, 6.5, 1.5]); // second click: the end
    expect(d.start).toBeNull();
    d.press([2.5, 2.5]);
    expect(d.release([2.5, 8.5], true)).toEqual([2.5, 2.5, 2.5, 8.5]); // a drag, shift held
    expect(d.start).toEqual([2.5, 8.5]); // chained
    d.press([7.5, 8.5]);
    expect(d.release([7.5, 8.5], false)).toEqual([2.5, 8.5, 7.5, 8.5]);
    d.press([1.5, 1.5]);
    d.release([1.5, 1.5], false);
    expect(d.cancel()).toBe(true); // Esc drops the start
    expect(d.cancel()).toBe(false);
  });
});
