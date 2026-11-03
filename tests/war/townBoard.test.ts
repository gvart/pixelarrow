/**
 * W-184..W-193 the town boards' listing and pay (src/war/net/townBoard.ts; docs/WAR.md "Town boards"): every town, every path,
 * from the data. The fights are fought on a flat map at the town's depth, so a card's word is what happens.
 */
import { describe, expect, it } from 'vitest';
import { BOARD } from '../../src/data/warTownBoard';
import { armyStrength, bandStrength, boardEntries, boardWindow, FLOOR_STRENGTH, heatAfter, JOB_KINDS, PATH_KIND, pathPay, quotePay, ratingOf, repeatShare, type Band } from '../../src/war/net/townBoard';
import { npcGood } from '../../src/war/net/npcMarket';
import { parseRegion } from '../../src/war/region/schema';
import { WORLD_REGIONS } from '../../src/war/regions';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import { depthOf } from '../../src/war/sim/depth';
import { MOB_KINDS } from '../../src/war/sim/mobs';
import { makePerson } from '../../src/war/sim/roster';
import type { RegionData } from '../../src/war/types';
import { hops } from '../../src/war/world/graph';
import { FAMILIES, FAMILY_IDS, PATH_IDS, type StartFamily } from '../../src/war/world/start';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const REGIONS: RegionData[] = WORLD_REGIONS.map((w) => parseRegion(files[`../../src/war/regions/${w.id}.json`]) as unknown as RegionData);
const WIN = boardWindow(Date.UTC(2031, 0, 6, 12));
const start = (f: StartFamily) => FAMILIES[f].start.map((cls) => ({ cls }));

function flat(depth: number, n = 96): RegionData {
  return { id: 't', name: 't', w: n, h: n, depth, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0), entries: [], noBuild: [] } as unknown as RegionData;
}

/** These men (level, demigod level) against this band at this depth, fought as a player does. Did the band fall? */
function wins(men: readonly string[], band: Band, depth: number, seed: number, family: StartFamily = 'line', demigod = 1, level = 1): boolean {
  const sim = createSim(flat(depth), seed);
  sim.setPaths(() => ({ path: 'warrior', family, level: demigod }));
  const lair = sim.addLair({ kind: band.kind, x: 48.5, y: 48.5, count: band.count, ...(band.lead ? { lead: true as const } : {}), ...(band.chief ? { chief: band.chief } : {}) });
  const l = sim.snapshot().lairs!.find((x) => x.id === lair)!;
  const ps = men.map((c, i) => makePerson(`m${i}`, c, { level }));
  const line = ps.filter((p) => warStats(p.hero.cls!).range === 0), back = ps.filter((p) => warStats(p.hero.cls!).range > 0);
  const front = sim.spawnSquad('p:1', 0, line[0].hero.cls!, line.length, l.x + 18, l.y, line);
  const rear = back.length ? sim.spawnSquad('p:1', 0, back[0].hero.cls!, back.length, l.x + 24, l.y, back) : -1;
  sim.order({ kind: 'attack', squad: front, target: l.squad });
  for (let t = 0; t < 6000; t++) {
    if (t === 15 && rear >= 0) sim.order({ kind: 'attack', squad: rear, target: l.squad });
    sim.step();
    const s = sim.snapshot();
    if (s.lairs!.find((x) => x.id === lair)!.state === 'cleared') return true;
    if (!s.units.some((u) => s.squads[u.squad]?.team === 0 && u.state !== 'dead')) return false;
  }
  return false;
}

describe('W-184 every town keeps a board', () => {
  it('lists all three kinds at every town, on every path, with no other player', () => {
    for (const r of REGIONS) for (const path of [...PATH_IDS, null]) {
      const es = boardEntries(r, WIN, { army: 0, path });
      expect(new Set(es.map((e) => e.kind)), `${r.id} ${path}`).toEqual(new Set(JOB_KINDS));
      expect(es.length, r.id).toBeGreaterThanOrEqual(BOARD.kill.length + BOARD.build.length + BOARD.trade.length);
      expect(new Set(es.map((e) => e.id)).size, r.id).toBe(es.length);
      for (const e of es) expect(e.coin > 0 && e.points > 0 && e.goal.split(' ').length <= 7, `${r.id} ${e.goal}`).toBe(true);
    }
  });

  it('is the same for the same window, and refills with others in the next', () => {
    for (const r of REGIONS) {
      const a = boardEntries(r, WIN, { army: 0, path: null });
      expect(boardEntries(r, WIN, { army: 0, path: null })).toEqual(a);
    }
    const goals = (w: number) => REGIONS.flatMap((r) => boardEntries(r, w, { army: 0, path: null }).map((e) => `${r.id}:${e.goal}`));
    const now = new Set(goals(WIN));
    expect(goals(WIN + 1).filter((g) => !now.has(g)).length).toBeGreaterThan(REGIONS.length);
  });

  it('W-186: his own path\'s kind comes first and pays a bit more', () => {
    const r = REGIONS[0];
    for (const path of PATH_IDS) {
      const es = boardEntries(r, WIN, { army: 0, path }), n = es.filter((e) => e.kind === PATH_KIND[path]).length;
      expect(es.slice(0, n).every((e) => e.kind === PATH_KIND[path])).toBe(true);
      const e = es[0], other = PATH_IDS.find((p) => p !== path)!;
      expect(pathPay(e, path).coin).toBeGreaterThan(pathPay(e, other).coin);
      expect(pathPay(e, path).coin).toBeLessThanOrEqual(e.coin * 1.5);
    }
  });

  it('W-188: another path\'s kind pays coin and a small share of the points', () => {
    const e = { kind: 'kill' as const, coin: 100, points: 100 };
    expect(pathPay(e, 'warrior').points).toBe(100);
    expect(pathPay(e, 'builder').points).toBe(100 * BOARD.offPathPoints);
    expect(pathPay(e, 'trader').coin).toBe(100);
  });

  it('a load goes down a road to a town that deals in it, a work stands at the town', () => {
    for (const r of REGIONS) for (const e of boardEntries(r, WIN, { army: 0, path: 'trader' })) {
      if (e.kind === 'trade') {
        expect(npcGood(r.id, e.res!), `${r.id} ${e.res}`).toBeTruthy();
        expect(npcGood(e.toTown!, e.res!), `${e.toTown} ${e.res}`).toBeTruthy();
        expect(hops(r.id, e.toTown!)).toBeLessThanOrEqual(2);
        expect(e.toTown).not.toBe(r.id);
      }
      if (e.kind === 'build') expect(e.site).toBeTruthy();
    }
  });
});

describe('W-185, W-193 a Kill is honest', () => {
  it('every kind can come up, by data: a band\'s strength grows with its size and depth', () => {
    for (const kind of MOB_KINDS) {
      expect(bandStrength({ kind, count: 4 }, 1)).toBeGreaterThan(bandStrength({ kind, count: 2 }, 1));
      expect(bandStrength({ kind, count: 4 }, 3)).toBeGreaterThan(bandStrength({ kind, count: 4 }, 0));
    }
  });

  it('a veteran army is offered bigger fights for more pay; a weak group is offered no smaller ones than a starting family', () => {
    const r = REGIONS.find((x) => x.id === 'dodona-e')!;
    const kills = (army: number) => boardEntries(r, WIN, { army, path: 'warrior' }).filter((e) => e.kind === 'kill');
    const weak = kills(armyStrength([{ cls: 'hoplite' }])), floor = kills(FLOOR_STRENGTH), big = kills(FLOOR_STRENGTH * 6);
    expect(weak).toEqual(floor); // not scaled down for two guards
    for (let i = 0; i < big.length; i++) {
      expect(big[i].strength!).toBeGreaterThan(floor[i].strength!);
      expect(big[i].coin).toBeGreaterThan(floor[i].coin);
    }
  });

  it('every board has a fight every starting family wins', () => {
    const lost: string[] = [];
    for (const r of REGIONS) {
      const e = boardEntries(r, WIN, { army: 0, path: 'warrior' }).find((x) => x.size === 'skirmish')!;
      for (const f of FAMILY_IDS) {
        const seeds = [11, 22].filter((s) => wins(FAMILIES[f].start, e.band!, depthOf(r), s, f));
        if (seeds.length < 2) lost.push(`${r.id} depth ${depthOf(r)} ${f}: ${e.band!.count} ${e.band!.kind}`);
      }
      expect(['easy', 'fair'], `${r.id} ${e.goal}`).toContain(ratingOf(FLOOR_STRENGTH, e.strength!));
    }
    expect(lost).toEqual([]);
  }, 300_000);

  it('the words mean what they say: an easy fight is won, a deadly one lost', () => {
    const r = { easy: 0, easyN: 0, deadly: 0, deadlyN: 0 }, men = FAMILIES.line.start;
    const army = armyStrength(start('line'));
    for (const kind of MOB_KINDS.filter((k) => k !== 'ibex')) for (const depth of [0, 1, 2, 3]) for (let count = 1; count <= 14; count++) {
      const word = ratingOf(army, bandStrength({ kind, count }, depth));
      if (word !== 'easy' && word !== 'deadly') continue;
      const won = wins(men, { kind, count }, depth, 7 + count);
      if (word === 'easy') { r.easyN++; if (won) r.easy++; }
      else { r.deadlyN++; if (!won) r.deadly++; }
    }
    expect(r.easyN).toBeGreaterThan(5);
    expect(r.deadlyN).toBeGreaterThan(5);
    expect(r.easy / r.easyN, JSON.stringify(r)).toBeGreaterThanOrEqual(0.9);
    expect(r.deadly / r.deadlyN, JSON.stringify(r)).toBeGreaterThanOrEqual(0.8);
  }, 300_000);
});

describe('W-187, W-189 the pay', () => {
  const job = { kind: 'build' as const, coin: 100, points: 80 };
  it('comes out of the purse: a thin one pays less, an empty one nothing, never more than it holds', () => {
    const full = quotePay(job, 'builder', 0, 4000).coin, thin = quotePay(job, 'builder', 0, 400).coin;
    expect(thin).toBeLessThan(full);
    expect(thin).toBeGreaterThan(0);
    expect(quotePay(job, 'builder', 0, 0).coin).toBe(0);
    expect(quotePay(job, 'builder', 0, 3).coin).toBeLessThanOrEqual(3);
    expect(quotePay(job, 'builder', 0, 0).points, 'his level does not hang on the purse').toBe(80);
  });
  it('a repeat at the same town and kind pays less, recovering over time, never to nothing', () => {
    expect(repeatShare(0)).toBe(1);
    let last = 1;
    for (let heat = 1; heat < 20; heat++) {
      expect(repeatShare(heat)).toBeLessThanOrEqual(last);
      last = repeatShare(heat);
    }
    expect(last).toBe(BOARD.repeat.floor);
    expect(heatAfter(3, BOARD.repeat.recoverHours * 3_600_000)).toBeCloseTo(3 * Math.exp(-1));
    expect(heatAfter(3, 48 * 3_600_000)).toBeLessThan(0.01);
    expect(quotePay(job, 'builder', 3, 4000).points).toBeLessThan(quotePay(job, 'builder', 0, 4000).points);
  });
});
