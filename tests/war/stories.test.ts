/**
 * W-65 region story chains (src/war/sim/stories.ts, src/data/warStories.ts): every story's places stand on open ground
 * its giver can walk to, its foes clear of the region's own lairs; and on the real sim (seeded) a player's squad plays
 * the Teeth Foothills chain from the giver to the end down the spare branch, its save carried across a reload and a
 * region woken afresh, and the other branch pays its own reward.
 */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { buildGrid, findPath, tileAt } from '../../src/war/sim/grid';
import { STORIES } from '../../src/data/warStories';
import { storyItem, storyPath, StoryRun, type StoryHost, type StoryNote, type StoryReward, type StorySave } from '../../src/war/sim/stories';
import { REGION_DEPTH } from '../../src/war/sim/depth';
import type { RegionData, WarBuildSim } from '../../src/war/types';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;

describe('W-65 story data', () => {
  it('a full chain for every depth 1-2 neutral', () => {
    for (const [id, d] of Object.entries(REGION_DEPTH)) if (d === 1 || d === 2) expect(!!STORIES[id], id).toBe(true);
    for (const s of Object.values(STORIES)) {
      expect(s.steps.length, s.id).toBeGreaterThanOrEqual(3);
      expect(storyPath(s, null).length, s.id).toBeLessThanOrEqual(5);
      expect(s.steps.some((x) => x.trigger.kind === 'clear' && x.trigger.lead), `${s.id}: a named foe`).toBe(true);
    }
  });

  for (const s of Object.values(STORIES))
    it(`${s.region}: the giver can walk to every place of "${s.title}", its foes stand clear of the region's lairs`, () => {
      const r = region(s.region), g = buildGrid(r), run = new StoryRun(r, s, null, { team: 0 }, { addLair() {}, spawnSoul() {}, give() {} });
      const from = tileAt(g, run.spots.giver.x, run.spots.giver.y);
      expect(g.cost[from]).toBeGreaterThan(0);
      for (const st of s.steps) {
        for (const p of run.spots.steps[st.id]) {
          const t = tileAt(g, p.x, p.y);
          expect(g.cost[t], `${st.id} on open ground`).toBeGreaterThan(0);
          expect(findPath(g, from, t).at(-1), `${st.id} reachable from the giver`).toBe(t);
        }
        if (st.trigger.kind === 'clear') {
          const p = run.spots.steps[st.id][0];
          for (const l of r.lairs ?? []) expect(Math.hypot(l.x - p.x, l.y - p.y), `${st.id} clear of the ${l.kind} lair`).toBeGreaterThan(24);
        }
      }
    });
});

/** A host on the real sim, as the server room binds it: lairs and souls spawned, rewards paid into team 0's stores. */
function simHost(sim: WarBuildSim, paid: StoryReward[]): StoryHost {
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

describe('W-65 a chain played on the sim', () => {
  it('Teeth Foothills: giver, diggings, cairns, camp, Lykon, spare; the save survives a reload and a fresh region', () => {
    const s = STORIES['dodona-e'], r = region('dodona-e');
    let sim = createSim(r, 11) as WarBuildSim;
    sim.spawnMobs();
    const paid: StoryReward[] = [], notes: StoryNote[] = [];
    let run = new StoryRun(r, s, null, { team: 0, owner: 'p:1' }, simHost(sim, paid));
    const g0 = run.spots.giver;
    let sq = sim.spawnSquad('p:1', 0, 'hoplite', 12, g0.x - 4, g0.y);
    const stepFor = (max: number, until: () => boolean) => {
      for (let t = 0; t < max && !until(); t++) {
        sim.step();
        notes.push(...run.tick(sim.snapshot(), sim.events()));
      }
      expect(until(), `${run.save.at} within ${max} ticks`).toBe(true);
    };
    const go = (p: { x: number; y: number }, fight = false) => sim.order(fight ? { kind: 'attackMove', squad: sq, x: p.x, y: p.y } : { kind: 'move', squad: sq, x: p.x, y: p.y });

    // the giver: his men reach him and the chain begins
    go(g0);
    stepFor(600, () => run.save.at === 'shaft');
    expect(notes[0]).toEqual({ kind: 'start' });

    // a reload: the save carries on in a new run (the page or the room built afresh)
    const reload = (save: StorySave) => (run = new StoryRun(r, s, JSON.parse(JSON.stringify(save)) as StorySave, { team: 0, owner: 'p:1' }, simHost(sim, paid)));
    reload(run.save);
    expect(run.save.at).toBe('shaft');

    go(run.spots.steps.shaft[0]);
    stepFor(6000, () => run.save.at === 'cairns');
    expect(paid.at(-1)).toEqual({ goods: { coin: 10 } });
    for (const m of run.spots.steps.cairns) {
      go(m);
      stepFor(4000, () => run.save.at !== 'cairns' || run.save.n > run.spots.steps.cairns.indexOf(m));
    }
    expect(run.save.at).toBe('camp');

    // the region sleeps and wakes: a fresh sim (its added lairs gone), the squad back where it stood; the run spawns the camp again
    const at = sim.snapshot().units.filter((u) => sim.snapshot().squads[sq].units.includes(u.id) && u.state !== 'dead');
    const cx = at.reduce((a, u) => a + u.x, 0) / at.length, cy = at.reduce((a, u) => a + u.y, 0) / at.length;
    sim = createSim(r, 12) as WarBuildSim;
    sim.spawnMobs();
    sq = sim.spawnSquad('p:1', 0, 'hoplite', 12, cx, cy);
    reload(run.save);
    const camp = run.spots.steps.camp[0];
    stepFor(30, () => (sim.snapshot().lairs ?? []).some((l) => Math.hypot(l.x - camp.x, l.y - camp.y) < 0.5 && l.state !== 'cleared'));
    go(camp, true);
    stepFor(6000, () => run.save.at === 'lykon');
    expect(paid.at(-1)).toEqual({ goods: { iron: 10, coin: 20 } });

    // the named captain: a lair led by a captain (x2 hp)
    const lp = run.spots.steps.lykon[0];
    stepFor(30, () => (sim.snapshot().lairs ?? []).some((l) => Math.hypot(l.x - lp.x, l.y - lp.y) < 0.5));
    go(lp, true);
    stepFor(8000, () => run.save.at === 'judge');

    // the choice: spare him (a soul and iron), then the chain's own reward
    expect(run.choose(sim.snapshot(), 'nobody')).toBeNull();
    const souls0 = sim.snapshot().souls?.length ?? 0;
    const end = run.choose(sim.snapshot(), 'spare')!;
    expect(end.map((n) => n.kind)).toEqual(['step', 'end']);
    expect(run.save).toMatchObject({ done: true, at: null, picks: { judge: 'spare' } });
    expect(paid.slice(-2)).toEqual([{ soul: { cls: 'hoplite', level: 3, name: 'Lykon' }, goods: { iron: 10 } }, { goods: { coin: 60 } }]);
    expect(sim.snapshot().souls?.length ?? 0).toBe(souls0 + 1);
    // done stays done
    expect(run.tick(sim.snapshot(), [])).toEqual([]);
  }, 120_000);

  it('the other branch: slaying Lykon pays his kopis (the same item for the same owner) and coin', () => {
    const s = STORIES['dodona-e'], r = region('dodona-e'), sim = createSim(r, 5) as WarBuildSim, paid: StoryReward[] = [];
    const run = new StoryRun(r, s, { v: 1, story: s.id, at: 'judge', n: 0, picks: {} }, { team: 0, owner: 'p:2' }, simHost(sim, paid));
    run.choose(sim.snapshot(), 'slay');
    expect(paid[0]).toEqual({ item: { def: 'kopis', rarity: 'rare' }, goods: { coin: 40 } });
    expect(sim.snapshot().piles?.length).toBe(1);
    const a = storyItem(s, 'judge:slay', 'p:2', paid[0]), b = storyItem(s, 'judge:slay', 'p:2', paid[0]);
    expect(a).toEqual(b);
    expect(a!.def).toBe('kopis');
    expect(run.save.picks).toEqual({ judge: 'slay' });
  });

  it('a mid-chain choice leads on (Western Heath: keep the oath, then the pack)', () => {
    const s = STORIES['dodona-w'], r = region('dodona-w'), sim = createSim(r, 3) as WarBuildSim, paid: StoryReward[] = [];
    const run = new StoryRun(r, s, { v: 1, story: s.id, at: 'oath', n: 0, picks: {} }, { team: 0 }, simHost(sim, paid));
    expect(run.choose(sim.snapshot(), 'keep')!.map((n) => n.kind)).toEqual(['step']);
    expect(run.save.at).toBe('pack');
    sim.step();
    run.tick(sim.snapshot(), sim.events());
    sim.step();
    const p = run.spots.steps.pack[0];
    expect(sim.snapshot().lairs?.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < 0.5 && l.kind === 'wolf')).toBe(true);
  });

  it('a captive freed: the soul at the spot claimed by his squad ends the chain (Western Heath)', () => {
    const s = STORIES['dodona-w'], r = region('dodona-w'), sim = createSim(r, 9) as WarBuildSim, paid: StoryReward[] = [];
    const run = new StoryRun(r, s, { v: 1, story: s.id, at: 'oathman', n: 0, picks: { oath: 'break' } }, { team: 0, owner: 'p:3' }, simHost(sim, paid));
    const p = run.spots.steps.oathman[0], sq = sim.spawnSquad('p:3', 0, 'hoplite', 8, p.x - 3, p.y);
    const notes: StoryNote[] = [];
    sim.step();
    notes.push(...run.tick(sim.snapshot(), sim.events()));
    const soul = sim.snapshot().souls!.find((x) => Math.hypot(x.x - p.x, x.y - p.y) < 1)!;
    expect(soul).toMatchObject({ cls: 'hoplite', level: 2 });
    sim.order({ kind: 'claimSoul', squad: sq, soul: soul.id });
    for (let t = 0; t < 900 && !run.save.done; t++) {
      sim.step();
      notes.push(...run.tick(sim.snapshot(), sim.events()));
    }
    expect(notes.map((n) => n.kind)).toEqual(['step', 'end']);
    expect(paid.at(-1)).toEqual(s.reward);
  });

  it('a foreign or broken save starts afresh', () => {
    const s = STORIES['dodona-e'], r = region('dodona-e'), h = { addLair() {}, spawnSoul() {}, give() {} };
    expect(new StoryRun(r, s, { v: 1, story: 'other', at: 'x', n: 0, picks: {} }, { team: 0 }, h).save.at).toBeNull();
    expect(new StoryRun(r, s, { v: 1, story: s.id, at: 'nope', n: 0, picks: {} }, { team: 0 }, h).save.at).toBeNull();
  });
});
