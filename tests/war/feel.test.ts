import { describe, expect, it } from 'vitest';
import type { BuildingSnap, Snapshot, UnitSnap } from '../../src/war/types';
import { HitStop, ImpactWatch, isElite } from '../../src/war/view/feel/impacts';
import { CameraShake, shakeFalloff } from '../../src/war/view/feel/shake';
import { blowVol, dinLevel, heavyBlow, isBeast, weightSfx } from '../../src/war/view/sound/mix';
import { BIG_FLASH_ALPHA, FLASH, FLASH_ALPHA, FLASH_GAP, flashAlpha, HitWatch, HOLD, HOLD_GAP, MAX_PUFFS, NUDGE_MS } from '../../src/war/view/feel/hits';
import { MOB_KINDS } from '../../src/war/sim/mobs';
import { CHIEF_KINDS } from '../../src/data/warWild';
import { GUARDIANS } from '../../src/war/sim/bosses';
import { VIEW_SCALE } from '../../src/war/view/mobScale';
import wolfSheet from '../../src/assets/sheets/mob_wolf/manifest.json';
import bearSheet from '../../src/assets/sheets/mob_bear/manifest.json';

describe('E4 melee din', () => {
  it('stays out of a skirmish, rises with the press, full from some 60 men', () => {
    expect(dinLevel(4)).toBe(0);
    expect(dinLevel(12)).toBeGreaterThan(0);
    expect(dinLevel(30)).toBeGreaterThan(dinLevel(12));
    expect(dinLevel(60)).toBe(1);
    expect(dinLevel(400)).toBe(1);
  });

  it('steps the single blows down under it', () => {
    expect(blowVol(0)).toBe(1);
    expect(blowVol(1)).toBeCloseTo(0.65);
  });
});

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

describe('ordinary blows felt', () => {
  // squad 1 is ours (team 0), squad 2 the foe (team 1)
  const squads = [{ id: 1, owner: 'a', team: 0, units: [], order: 'idle' }, { id: 2, owner: 'b', team: 1, units: [], order: 'idle' }] as unknown as Snapshot['squads'];
  const at = (tick: number, units: UnitSnap[], o: Partial<Snapshot> = {}) => snap(tick, { units, squads, ...o });
  const man = (o: Partial<UnitSnap> = {}) => unit(1, { squad: 1, ...o });
  const foe = (cls: string, o: Partial<UnitSnap> = {}) => unit(2, { squad: 2, cls, x: 11, y: 10, ...o });

  it('a sword blow in reach: a flash, sparks and a nudge away from the striker, once', () => {
    const w = new HitWatch();
    w.diff(at(1, [man(), foe('mob_bandit')]), 0);
    const hits = w.diff(at(2, [man({ hp: 8 }), foe('mob_bandit', { state: 'attack', swing: 0 })]), 100);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 1, by: 2, puff: 'spark', heavy: false, hold: false });
    expect(hits[0].sx).toBeLessThan(0); // the foe stands east: pushed west on screen
    expect(w.pose(1, 100)?.flash).toBe(true);
    expect(w.pose(1, 100 + FLASH)?.flash).toBe(false);
    expect(Math.hypot(w.pose(1, 150)!.ox, w.pose(1, 150)!.oy)).toBeGreaterThan(1);
    expect(w.pose(1, 100 + NUDGE_MS + 1)).toBeUndefined();
    expect(w.diff(at(2, [man({ hp: 8 }), foe('mob_bandit')]), 120)).toEqual([]); // same tick again
  });

  it('a bear\'s maul: dust, a local hold on both under 80 ms, a small shake; not held again at once', () => {
    const w = new HitWatch();
    w.diff(at(1, [man(), foe('mob_bear')]), 0);
    const [h] = w.diff(at(2, [man({ hp: 6 }), foe('mob_bear', { state: 'attack', swing: 0 })]), 100);
    expect(h).toMatchObject({ puff: 'dust', heavy: true, hold: true });
    expect(h.shake).toBeGreaterThan(0);
    expect(HOLD).toBeLessThanOrEqual(80);
    expect(w.pose(1, 100 + HOLD - 1)?.hold).toBe(true);
    expect(w.pose(2, 100 + HOLD - 1)?.hold).toBe(true);
    expect(w.pose(2, 100 + HOLD + 1)?.hold ?? false).toBe(false);
    const [h2] = w.diff(at(3, [man({ hp: 2 }), foe('mob_bear', { state: 'attack', swing: 0 })]), 100 + HOLD_GAP / 2);
    expect(h2.hold).toBe(false);
  });

  it('a chief or a guardian strikes heavy whatever its kind', () => {
    const w = new HitWatch();
    const lairs = [{ id: 1, kind: 'wolf', x: 11, y: 10, squad: 2, alive: 1, count: 1, state: 'chase', aggro: 0, leash: 0, guard: 0, nodes: 0, chief: { id: 'greymaw', name: 'Old Greymaw', title: '', unit: 2, alive: true, scale: 1.6, tint: 0 } }] as Snapshot['lairs'];
    w.diff(at(1, [man(), foe('mob_wolf')], { lairs }), 0);
    const [h] = w.diff(at(2, [man({ hp: 7 }), foe('mob_wolf', { state: 'attack', swing: 0 })], { lairs }), 100);
    expect(h.heavy).toBe(true);
    expect(heavyBlow('mob_wolf')).toBe(false);
    expect(weightSfx('mob_wolf', true)).toBe('thud');
    expect(weightSfx('hoplite')).toBeNull();
  });

  it('an arrow from afar: a flash only', () => {
    const w = new HitWatch();
    w.diff(at(1, [man(), foe('archer', { x: 30 })]), 0);
    const [h] = w.diff(at(2, [man({ hp: 9 }), foe('archer', { x: 30, state: 'attack', swing: 0 })]), 100);
    expect(h).toMatchObject({ by: -1, puff: null, hold: false });
  });

  it('a 24-man melee reads, not strobes: puffs capped a snapshot, a flash a unit at most every FLASH_GAP', () => {
    const w = new HitWatch();
    const line = (hp: number, swing: number) => Array.from({ length: 24 }, (_, i) => unit(i + 1, { squad: i < 12 ? 1 : 2, x: 10 + (i % 12), y: i < 12 ? 10 : 11, hp, state: 'attack', swing }));
    w.diff(at(1, line(10, 5)), 0);
    const hits = w.diff(at(2, line(9, 0)), 100);
    expect(hits.filter((h) => h.puff).length).toBeLessThanOrEqual(MAX_PUFFS);
    // within the gaps: no flash again, and only the men not puffed yet get theirs (the puffs spread over snapshots)
    const puffed = new Set(hits.filter((h) => h.puff).map((h) => h.id));
    const next = w.diff(at(3, line(8, 0)), 100 + FLASH_GAP / 2);
    expect(next.length).toBeLessThanOrEqual(MAX_PUFFS);
    for (const h of next) expect(puffed.has(h.id)).toBe(false);
  });

  it('every mob kind has a dust-or-spark rule; beasts kick dust, bandits ring iron', () => {
    for (const k of MOB_KINDS) expect(typeof isBeast(`mob_${k}`)).toBe('boolean');
    expect(isBeast('mob_lion')).toBe(true);
    expect(isBeast('mob_bandit_captain')).toBe(false);
  });
});

describe('mobs at true size', () => {
  it('chiefs stand 1.6x their kind at least', () => {
    for (const [k, c] of Object.entries(CHIEF_KINDS)) expect(c.scale, k).toBeGreaterThanOrEqual(1.6);
  });

  it('beasts are not drawn smaller than their sheets, and a bear outsizes a wolf', () => {
    for (const k of MOB_KINDS) expect(VIEW_SCALE[`mob_${k}`] ?? 1, k).toBeGreaterThanOrEqual(1);
    for (const k of ['wolf', 'jackal', 'boar', 'bear', 'lion', 'ibex']) expect(VIEW_SCALE[`mob_${k}`] ?? 1, `${k} at true size: crisp`).toBe(1);
    expect(bearSheet.frame.w * bearSheet.frame.h).toBeGreaterThan(wolfSheet.frame.w * wolfSheet.frame.h);
    for (const g of Object.values(GUARDIANS)) expect(VIEW_SCALE[g.cls] ?? 1, g.cls).toBeGreaterThanOrEqual(1);
  });

  it('a hit flash on a chief or a big guardian is softer, so a huge sprite reads as hit, not as a white blank', () => {
    expect(flashAlpha(1, false)).toBe(FLASH_ALPHA);
    expect(flashAlpha(VIEW_SCALE.mob_bear ?? 1, false)).toBe(FLASH_ALPHA);
    expect(flashAlpha(1, true)).toBe(BIG_FLASH_ALPHA);
    expect(flashAlpha(2.5, false)).toBe(BIG_FLASH_ALPHA);
    expect(BIG_FLASH_ALPHA).toBeLessThanOrEqual(0.5);
  });
});
