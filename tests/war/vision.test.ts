import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE, VISION } from '../../src/war/sim/vision';
import type { RegionData, WarBuildSim } from '../../src/war/types';

/** Flat grass 80 x 40 at height 1; `shape` edits it. */
function region(shape: (r: RegionData, i: (x: number, y: number) => number) => void = () => {}): RegionData {
  const w = 80, h = 40;
  const r: RegionData = {
    id: 'v', name: 'v', w, h, height: Array(w * h).fill(1), terrain: Array(w * h).fill('grass'), water: Array(w * h).fill(0), entries: [], noBuild: [],
  };
  shape(r, (x, y) => y * w + x);
  return r;
}

const run = (sim: WarBuildSim, n: number) => {
  for (let t = 0; t < n; t++) sim.step();
};
/** A lone man of team 0 at (x, 20.5), vision updated. */
const look = (r: RegionData, x: number, cls = 'militia'): WarBuildSim => {
  const sim = createSim(r, 1);
  sim.spawnSquad('a', 0, cls, 1, x, 20.5);
  run(sim, 1);
  return sim;
};
const ridgeAt = (xs: number[], to = 40) => region((r, i) => {
  for (let y = 0; y < to; y++) for (const x of xs) r.height[i(x, y)] = 5;
});

describe('vision (W-39 fog)', () => {
  it('a ridge blocks the line of sight', () => {
    const open = look(region(), 14.5);
    expect(open.visibleTo(0, 24.5, 20.5)).toBe(true);
    const ridge = look(ridgeAt([20, 21]), 14.5);
    expect(ridge.visibleTo(0, 17.5, 20.5)).toBe(true);
    expect(ridge.visibleTo(0, 20.5, 20.5)).toBe(true); // the ridge's own face
    expect(ridge.visibleTo(0, 24.5, 20.5)).toBe(false);
    expect(ridge.visibleTo(1, 14.5, 20.5)).toBe(false); // no vision for a team with nobody there
  });

  it('high ground sees further', () => {
    const far = 27.5 + VISION.melee + 6;
    expect(look(region(), 27.5).visibleTo(0, far, 20.5)).toBe(false);
    const plateau = look(region((r, i) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 30; x++) r.height[i(x, y)] = 5; }), 27.5);
    expect(plateau.visibleTo(0, far, 20.5)).toBe(true);
  });

  it('archers see further than militia', () => {
    const at = 14.5 + VISION.melee + 3;
    expect(look(region(), 14.5).visibleTo(0, at, 20.5)).toBe(false);
    expect(look(region(), 14.5, 'archer').visibleTo(0, at, 20.5)).toBe(true);
  });

  it('forest cuts sight short', () => {
    expect(look(region(), 14.5).visibleTo(0, 25.5, 20.5)).toBe(true);
    const wood = look(region((r, i) => { for (let y = 0; y < 40; y++) for (let x = 18; x < 24; x++) r.terrain[i(x, y)] = 'forest'; }), 14.5);
    expect(wood.visibleTo(0, 18.5, 20.5)).toBe(true); // its edge
    expect(wood.visibleTo(0, 25.5, 20.5)).toBe(false);
  });

  it('explored ground stays explored; buildings are remembered as last seen', () => {
    const sim = createSim(region(), 1);
    const s = sim.spawnSquad('a', 0, 'militia', 4, 10.5, 20.5);
    sim.addStock(1, 'wood', 10);
    sim.order({ kind: 'placeBuilding', team: 1, type: 'brazier', x: 14.5, y: 20.5 });
    run(sim, 5);
    const g = sim.teamGrid(0);
    const at = (x: number, y: number) => g.state[Math.floor(y / g.cell) * g.w + Math.floor(x / g.cell)];
    expect(at(10.5, 20.5)).toBe(FOG_VISIBLE);
    expect(at(70.5, 20.5)).toBe(FOG_UNEXPLORED);
    expect(sim.lastSeen(0).map((b) => b.type)).toEqual(['brazier']);
    sim.order({ kind: 'move', squad: s, x: 70.5, y: 20.5 });
    run(sim, 600);
    expect(at(10.5, 20.5)).toBe(FOG_EXPLORED);
    expect(at(70.5, 20.5)).toBe(FOG_VISIBLE);
    expect(sim.visibleTo(0, 14.5, 20.5)).toBe(false);
    expect(sim.lastSeen(0).map((b) => b.type)).toEqual(['brazier']); // a ghost now
  });

  it('is deterministic', () => {
    const play = () => {
      const sim = createSim(region((r, i) => { for (let y = 10; y < 30; y++) r.height[i(40, y)] = 4; }), 7);
      for (let k = 0; k < 4; k++) {
        const q = sim.spawnSquad(`p${k}`, k, k % 2 ? 'archer' : 'militia', 8, 10 + k * 18, 8 + k * 7);
        sim.order({ kind: 'move', squad: q, x: 70 - k * 15, y: 32 - k * 6 });
      }
      run(sim, 300);
      return [0, 1, 2, 3].map((t) => [...sim.teamGrid(t).state].join('') + ':' + sim.teamGrid(t).version);
    };
    expect(play()).toEqual(play());
  });

  it('bots attack only what their team sees', () => {
    const blind = createSim(ridgeAt([20, 21], 34), 1);
    const bots = createBots(blind);
    const me = blind.spawnSquad('bot', 0, 'militia', 6, 14.5, 12.5);
    blind.spawnSquad('e', 1, 'militia', 6, 26.5, 12.5); // behind the ridge, 12 tiles off
    bots.set(me, { kind: 'hold', x: 14.5, y: 12.5, radius: 14 });
    for (let t = 0; t < 100; t++) blind.step(), bots.tick();
    expect(bots.phase(me)).toBe('hold');
    // the same foe in the open: fought
    const open = createSim(region(), 1);
    const ob = createBots(open);
    const me2 = open.spawnSquad('bot', 0, 'militia', 6, 14.5, 12.5);
    open.spawnSquad('e', 1, 'militia', 6, 26.5, 12.5);
    ob.set(me2, { kind: 'hold', x: 14.5, y: 12.5, radius: 14 });
    for (let t = 0; t < 30; t++) open.step(), ob.tick();
    expect(ob.phase(me2)).toBe('fight');
  });
});
