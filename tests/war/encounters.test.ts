/**
 * W-65 random encounters (src/war/sim/encounters.ts, src/data/warEncounters.ts): the kinds are sound data; the cooldown
 * counts travel only and never rolls in a fight or at home; rolls are deterministic; and on the real sim (seeded) a
 * player's squad beats off an ambush, judges a deserter, guides a lost merchant to town and searches a shrine.
 */
import { describe, expect, it } from 'vitest';
import { itemDef } from '../../src/data/items';
import { ENCOUNTERS } from '../../src/data/warEncounters';
import { STORIES } from '../../src/data/warStories';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { ENC, EncounterRun, encTowns, type EncHost, type EncNote, type EncSave } from '../../src/war/sim/encounters';
import { MOB_TEAM } from '../../src/war/sim/mobs';
import { snapOpen, type StoryReward } from '../../src/war/sim/stories';
import type { RegionData, Snapshot, WarBuildSim } from '../../src/war/types';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;
const none: EncHost = { addLair() {}, spawnSoul() {}, give() {} };

describe('W-65 encounter data', () => {
  it('8-12 kinds, each with short lore, 1-3 steps whose links and items resolve', () => {
    const ds = Object.values(ENCOUNTERS);
    expect(ds.length).toBeGreaterThanOrEqual(8);
    expect(ds.length).toBeLessThanOrEqual(12);
    for (const d of ds) {
      expect(d.lore.length, d.id).toBeLessThan(170);
      expect(d.steps.length, d.id).toBeGreaterThanOrEqual(1);
      expect(d.steps.length, d.id).toBeLessThanOrEqual(3);
      const ids = new Set(d.steps.map((s) => s.id));
      const rewards: (StoryReward | undefined)[] = [];
      for (const s of d.steps) {
        if (s.next && s.next !== 'end') expect(ids.has(s.next), `${d.id}.${s.id} next`).toBe(true);
        rewards.push(s.reward);
        if (s.trigger.kind === 'choice')
          for (const o of s.trigger.options) {
            rewards.push(o.reward);
            for (const n of [o.next, o.risk?.next]) if (n && n !== 'end') expect(ids.has(n), `${d.id}.${o.id} -> ${n}`).toBe(true);
          }
      }
      for (const r of rewards) {
        if (r?.item) expect(() => itemDef(r.item!.def), `${d.id} item`).not.toThrow();
        // small pay: no step pays more than 20 coin
        expect(r?.goods?.coin ?? 0, d.id).toBeLessThanOrEqual(20);
      }
    }
  });
});

// ---------------------------------------------------------------- the cooldown on hand-made snapshots

const R = region('dodona-e');
/** One squad of 6 men of team 0 (owner p:1) at (x,y), walking; optional foes of the wild at (fx,fy). */
function snap(tick: number, x: number, y: number, o: { state?: 'move' | 'idle' | 'attack'; foe?: [number, number] } = {}): Snapshot {
  const units = Array.from({ length: 6 }, (_, i) => ({ id: i, squad: 0, x: x + (i % 3), y: y + Math.floor(i / 3), facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: o.state ?? 'move' }));
  const squads = [{ id: 0, owner: 'p:1', team: 0, units: units.map((u) => u.id), order: 'move' }];
  if (o.foe) {
    units.push({ id: 99, squad: 1, x: o.foe[0], y: o.foe[1], facing: 0, hp: 10, maxHp: 10, cls: 'mob_wolf', state: 'idle' });
    squads.push({ id: 1, owner: 'mobs', team: MOB_TEAM, units: [99], order: 'hold' });
  }
  return { tick, units, squads, lairs: [] } as unknown as Snapshot;
}

describe('W-65 encounter cooldown', () => {
  const p = snapOpen(R, [250, 250]);

  it('rolls once per 3-5 minutes of travel, not while standing', () => {
    const run = new EncounterRun(R, ENCOUNTERS, null, { team: 0, owner: 'p:1' }, none);
    const next = run.save.next;
    expect(next).toBeGreaterThanOrEqual(ENC.cool[0]);
    expect(next).toBeLessThanOrEqual(ENC.cool[1]);
    // standing still: nothing counts
    for (let t = 0; t < 4000; t++) expect(run.tick(snap(t, p.x, p.y, { state: 'idle' }))).toEqual([]);
    expect(run.save.travel).toBe(0);
    // walking: the first encounter springs exactly when the cooldown is spent
    let fired: EncNote[] = [], at = -1;
    for (let t = 0; t < 4000 && !fired.length; t++) if ((fired = run.tick(snap(t, p.x, p.y))).length) at = t;
    expect(at).toBe(next - 1);
    expect(fired[0].kind).toBe('start');
    expect(run.save.open).not.toBeNull();
    expect(run.save.n).toBe(1);
    // a quiet save was due along the way (the cooldown's progress)
    expect(run.due).toBe(true);
    // a new cooldown is drawn, and none rolls while one is open
    expect(run.save.next).toBeGreaterThanOrEqual(ENC.cool[0]);
    expect(run.save.travel).toBe(0);
  });

  it('never rolls in a fight: a foe near, or his men striking', () => {
    const save: EncSave = { v: 1, n: 0, travel: 0, next: 10, open: null };
    const run = new EncounterRun(R, ENCOUNTERS, save, { team: 0, owner: 'p:1' }, none);
    for (let t = 0; t < 300; t++) expect(run.tick(snap(t, p.x, p.y, { foe: [p.x + 8, p.y] }))).toEqual([]);
    for (let t = 300; t < 600; t++) expect(run.tick(snap(t, p.x, p.y, { state: 'attack' }))).toEqual([]);
    expect(run.save.travel).toBe(0);
    // the foe far off: travel counts again and it rolls
    let n: EncNote[] = [];
    for (let t = 600; t < 700 && !n.length; t++) n = run.tick(snap(t, p.x, p.y, { foe: [p.x + 40, p.y] }));
    expect(n[0]?.kind).toBe('start');
  });

  it('never at home (depth 0), and only his own squads count', () => {
    const home = region('dodona'), q = snapOpen(home, [250, 250]);
    const run = new EncounterRun(home, ENCOUNTERS, { v: 1, n: 0, travel: 0, next: 5, open: null }, { team: 0, owner: 'p:1' }, none);
    for (let t = 0; t < 200; t++) expect(run.tick(snap(t, q.x, q.y))).toEqual([]);
    const other = new EncounterRun(R, ENCOUNTERS, { v: 1, n: 0, travel: 0, next: 5, open: null }, { team: 0, owner: 'p:2' }, none);
    for (let t = 0; t < 200; t++) expect(other.tick(snap(t, p.x, p.y))).toEqual([]);
  });

  it('deterministic: the same owner and seed meet the same kinds at the same spots; another owner differs', () => {
    const play = (owner: string) => {
      const run = new EncounterRun(R, ENCOUNTERS, null, { team: 0, owner }, none), out: string[] = [];
      for (let t = 0; out.length < 4 && t < 20000; t++) {
        const s = { ...snap(t, p.x, p.y), squads: [{ id: 0, owner, team: 0, units: [0, 1, 2, 3, 4, 5], order: 'move' }] } as Snapshot;
        if (run.tick(s).some((n) => n.kind === 'start')) {
          const o = run.save.open!;
          out.push(`${o.id}@${o.x.toFixed(1)},${o.y.toFixed(1)}`);
          run.save.open = null; // walked away from it
        }
      }
      return out;
    };
    const a = play('p:1');
    expect(a.length).toBe(4);
    expect(play('p:1')).toEqual(a);
    expect(play('p:7')).not.toEqual(a);
    // no kind twice in a row
    for (let i = 1; i < a.length; i++) expect(a[i].split('@')[0]).not.toBe(a[i - 1].split('@')[0]);
  });

  it('an open encounter lapses when his men walk far from it', () => {
    const run = new EncounterRun(R, ENCOUNTERS, null, { team: 0, owner: 'p:1' }, none);
    run.fire(snap(0, p.x, p.y), ENCOUNTERS.cache);
    expect(run.tick(snap(1, p.x + 120, p.y))).toEqual([{ kind: 'lapse', enc: 'cache' }]);
    expect(run.save.open).toBeNull();
  });
});

// ---------------------------------------------------------------- played on the real sim

function simHost(sim: WarBuildSim, paid: StoryReward[]): EncHost {
  return {
    addLair: (d) => void sim.addLair(d),
    spawnSoul: (x, y, cls, level) => void sim.spawnSoul(x, y, cls, level, 'lair'),
    give: (r, at, item) => {
      paid.push(r);
      for (const [k, n] of Object.entries(r.goods ?? {})) sim.addStock(0, k as never, n!);
      if (item) sim.dropPile(at.x, at.y, [], [item]);
      if (r.soul) sim.spawnSoul(at.x + 1, at.y, r.soul.cls, r.soul.level, 'lair');
    },
  };
}

function field(seed: number) {
  const sim = createSim(R, seed) as WarBuildSim, paid: StoryReward[] = [], notes: EncNote[] = [];
  const run = new EncounterRun(R, ENCOUNTERS, null, { team: 0, owner: 'p:1', seed }, simHost(sim, paid), STORIES[R.id]);
  // a road spot well clear of the region's lairs
  const towns = encTowns(R), start = snapOpen(R, [towns[0].x + 30, towns[0].y + 30]);
  const sq = sim.spawnSquad('p:1', 0, 'hoplite', 12, start.x, start.y);
  const stepFor = (max: number, until: () => boolean) => {
    for (let t = 0; t < max && !until(); t++) {
      sim.step();
      notes.push(...run.tick(sim.snapshot(), sim.events()));
    }
    expect(until(), `${run.save.open?.step ?? 'none'} within ${max} ticks`).toBe(true);
  };
  const go = (x: number, y: number, fight = false) => sim.order(fight ? { kind: 'attackMove', squad: sq, x, y } : { kind: 'move', squad: sq, x, y });
  return { sim, run, paid, notes, stepFor, go, start };
}

describe('W-65 encounters played on the sim', () => {
  it('ambush: bandits spring from cover beside the squad; beaten off, they pay', () => {
    const f = field(3);
    f.notes.push(...f.run.fire(f.sim.snapshot(), ENCOUNTERS.ambush));
    const o = f.run.save.open!;
    expect(Math.hypot(o.x - f.start.x, o.y - f.start.y)).toBeLessThan(12);
    f.stepFor(30, () => (f.sim.snapshot().lairs ?? []).some((l) => Math.hypot(l.x - o.x, l.y - o.y) < 0.5 && l.state !== 'cleared'));
    f.go(o.x, o.y, true);
    f.stepFor(3000, () => f.run.save.open === null);
    expect(f.notes.map((n) => n.kind)).toEqual(['start', 'step', 'end']);
    expect(f.paid).toEqual([{ goods: { coin: 8, food: 10 } }]);
  }, 60_000);

  it('deserter: reach him, bind his wound: his soul waits beside your men', () => {
    const f = field(4);
    f.run.fire(f.sim.snapshot(), ENCOUNTERS.deserter);
    const o = f.run.save.open!;
    f.go(o.x, o.y);
    f.stepFor(1500, () => f.run.save.open?.step === 'judge');
    expect(f.run.choose(f.sim.snapshot(), 'nobody')).toBeNull();
    const souls0 = f.sim.snapshot().souls?.length ?? 0;
    const n = f.run.choose(f.sim.snapshot(), 'help')!;
    expect(n.map((x) => x.kind)).toEqual(['step', 'end']);
    expect(f.paid.at(-1)).toEqual({ soul: { cls: 'hoplite', level: 2, name: 'Damon' } });
    f.sim.step();
    expect(f.sim.snapshot().souls?.length ?? 0).toBe(souls0 + 1);
    expect(f.run.save.open).toBeNull();
  }, 60_000);

  it('lost merchant: reach him, walk him to the nearest town; he pays there; the save carries over a reload', () => {
    const f = field(5);
    f.run.fire(f.sim.snapshot(), ENCOUNTERS.merchant);
    const o = f.run.save.open!;
    f.go(o.x, o.y);
    f.stepFor(1500, () => !!f.run.save.open?.with);
    expect(f.notes.some((n) => n.kind === 'step' && n.step === 'guide#1')).toBe(true);
    // a reload: a new run from the save goes on
    const saved = JSON.parse(JSON.stringify(f.run.save)) as EncSave;
    const run2 = new EncounterRun(R, ENCOUNTERS, saved, { team: 0, owner: 'p:1', seed: 5 }, simHost(f.sim, f.paid));
    expect(run2.save.open).toMatchObject({ id: 'merchant', with: true });
    const t = run2.save.open!;
    f.go(t.tx, t.ty);
    const notes: EncNote[] = [];
    for (let i = 0; i < 5000 && run2.save.open; i++) {
      f.sim.step();
      notes.push(...run2.tick(f.sim.snapshot(), f.sim.events()));
    }
    expect(run2.save.open).toBeNull();
    expect(notes.map((n) => n.kind)).toEqual(['step', 'end']);
    expect(f.paid.at(-1)).toEqual({ goods: { coin: 15, salt: 6 } });
  }, 60_000);

  it('shrine: taking the offerings either pays or springs robbers, the same way for the same run', () => {
    const outcome = (seed: number) => {
      const f = field(seed);
      f.run.fire(f.sim.snapshot(), ENCOUNTERS.shrine);
      const o = f.run.save.open!;
      f.go(o.x, o.y);
      f.stepFor(1500, () => f.run.save.open?.step === 'search');
      const n = f.run.choose(f.sim.snapshot(), 'take')!;
      if (!(n[0].kind === 'step' && n[0].risk)) {
        expect(f.paid).toEqual([{ goods: { coin: 12 } }]);
        return 'paid';
      }
      expect(f.run.save.open?.step).toBe('keepers');
      f.stepFor(30, () => (f.sim.snapshot().lairs ?? []).some((l) => l.state !== 'cleared' && Math.hypot(l.x - o.tx, l.y - o.ty) < 0.5));
      f.go(o.x, o.y, true);
      f.stepFor(3000, () => f.run.save.open === null);
      expect(f.paid).toEqual([{ goods: { coin: 10 } }]);
      return 'robbers';
    };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 8 && seen.size < 2; seed++) {
      const a = outcome(seed);
      expect(outcome(seed)).toBe(a);
      seen.add(a);
    }
    expect([...seen].sort()).toEqual(['paid', 'robbers']);
  }, 120_000);
});
