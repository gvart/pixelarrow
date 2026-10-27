import { describe, expect, it } from 'vitest';
import type { BuildingSnap, Snapshot, UnitSnap } from '../../src/war/types';
import { HitStop, ImpactWatch, isElite } from '../../src/war/view/feel/impacts';
import { CameraShake, shakeFalloff } from '../../src/war/view/feel/shake';

const unit = (id: number, o: Partial<UnitSnap> = {}): UnitSnap => ({ id, squad: 0, x: 10, y: 10, facing: 0, hp: 10, maxHp: 10, cls: 'militia', state: 'idle', ...o });
const wall = (id: number, o: Partial<BuildingSnap> = {}): BuildingSnap =>
  ({ id, type: 'stoneWall', team: 0, x: 20, y: 20, w: 1, h: 4, rot: 0, tiles: [], state: 'done', progress: 1, delivered: 0, hp: 100, maxHp: 100, workers: 0, maxWorkers: 0, ...o }) as BuildingSnap;
const snap = (tick: number, o: Partial<Snapshot> = {}): Snapshot => ({ tick, units: [], squads: [], ...o });

describe('E4 impacts', () => {
  it('feels a wall and a gate going down once, not what lay in ruins from the start', () => {
    const w = new ImpactWatch();
    expect(w.diff(snap(1, { buildings: [wall(1), wall(2, { type: 'stoneGate' }), wall(3, { state: 'destroyed', rubble: true })] }))).toEqual([]);
    const hits = w.diff(snap(2, { buildings: [wall(1, { state: 'destroyed', rubble: true }), wall(2, { type: 'stoneGate', state: 'destroyed' }), wall(3, { state: 'destroyed', rubble: true })] }));
    expect(hits.map((h) => h.kind)).toEqual(['wallBreak', 'gateBreak']);
    expect(w.diff(snap(3, { buildings: [wall(1, { state: 'destroyed', rubble: true })] }))).toEqual([]);
  });

  it('feels an elite falling, not a levy', () => {
    const w = new ImpactWatch();
    w.diff(snap(1, { units: [unit(1), unit(2, { level: 7 }), unit(3, { cls: 'mob_bandit_captain' })] }));
    const hits = w.diff(snap(2, { units: [unit(1, { state: 'dead' }), unit(2, { level: 7, state: 'dead' }), unit(3, { cls: 'mob_bandit_captain', state: 'dead' })] }));
    expect(hits.map((h) => h.kind)).toEqual(['eliteKill', 'eliteKill']);
    expect(isElite({ cls: 'royal_guard' })).toBe(true);
    expect(isElite({ cls: 'hoplite', level: 2 })).toBe(false);
  });

  it('feels a ram blow and a thrower stone landing', () => {
    const w = new ImpactWatch();
    const ram = { id: 1, type: 'ram', team: 0, x: 5, y: 5, facing: 0, hp: 1, maxHp: 1, state: 'attack', progress: 0, crew: 0, crewNeed: 0, crewHere: 0 } as const;
    const stone = { x0: 0, y0: 0, x1: 30, y1: 30, t0: 1, t1: 4, z0: 0, z1: 0, by: -2, kind: 'stone', siege: 1 } as const;
    w.diff(snap(1, { sieges: [{ ...ram, swing: 5 }], shots: [stone] }));
    expect(w.diff(snap(2, { sieges: [{ ...ram, swing: 0 }], shots: [stone] })).map((h) => h.kind)).toEqual(['ram']);
    expect(w.diff(snap(4, { shots: [] })).map((h) => h.kind)).toEqual(['boulder']);
  });

  it('feels a guardian slain', () => {
    const w = new ImpactWatch();
    const b = { id: 'drakon', name: 'Drakon', squad: 1, unit: 1, x: 3, y: 3, hp: 1, maxHp: 9, phase: 0, phases: [], state: 'fight', raid: 0, scale: 1 } as const;
    w.diff(snap(1, { bosses: [b] }));
    expect(w.diff(snap(2, { bosses: [{ ...b, state: 'slain' }] })).map((h) => h.kind)).toEqual(['bossKill']);
  });
});

describe('E4 hit-stop budget', () => {
  it('takes a stop, then none within the gap; a light one only after a longer quiet', () => {
    const s = new HitStop();
    expect(s.ask(1000, 70)).toBe(true);
    expect(s.frozen(1050)).toBe(true);
    expect(s.frozen(1071)).toBe(false);
    expect(s.ask(1500, 80)).toBe(false);
    expect(s.ask(1000 + HitStop.GAP + 10, 40)).toBe(false); // light: needs the quiet
    expect(s.ask(1000 + HitStop.QUIET + 10, 40)).toBe(true);
    expect(s.ask(9000, 0)).toBe(false);
  });

  it('a big fight full of elite kills freezes under 10% of the time', () => {
    const s = new HitStop();
    let frozen = 0;
    for (let t = 0; t < 20000; t += 16) {
      s.ask(t, 55);
      if (s.frozen(t)) frozen += 16;
    }
    expect(frozen / 20000).toBeLessThan(0.1);
  });
});

describe('E4 shake', () => {
  const view = { x: 0, y: 0, right: 1600, bottom: 900 };
  it('falls off from the view centre to nothing well off screen', () => {
    expect(shakeFalloff(800, 450, view)).toBe(1);
    expect(shakeFalloff(1500, 450, view)).toBeGreaterThan(0);
    expect(shakeFalloff(5000, 450, view)).toBe(0);
  });

  it('decays, stacks to 1 at most, and stays still while off', () => {
    const c = new CameraShake();
    c.enabled = true;
    c.add(0.7);
    c.add(0.7);
    expect(c.trauma).toBe(1);
    const cam = { scrollX: 0, scrollY: 0, zoom: 1 };
    const o = c.offset(16, 1000, 1);
    c.apply(cam, o.x, o.y);
    c.undo(cam);
    expect(cam.scrollX).toBe(0);
    for (let i = 0; i < 100; i++) c.offset(16, 1000 + i * 16, 1);
    expect(c.trauma).toBe(0);
    c.enabled = false;
    c.add(1);
    const off = c.offset(16, 2000, 1);
    expect(Math.hypot(off.x, off.y)).toBe(0);
  });
});
