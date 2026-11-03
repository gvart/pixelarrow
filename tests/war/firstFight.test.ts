/**
 * W-171 the warrior's first fight (src/war/net/guide.ts GUIDE_LAIR, ./familyFights.test.ts): the guide's camp on a new
 * player's road falls to the first men of every family on the real map of every home, with his men ordered in as a player
 * would (melee first, shooters behind) and everything else in the region standing. Seeded.
 */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { GUIDE_LAIR, guideSpots } from '../../src/war/net/guide';
import { createSim } from '../../src/war/sim';
import { warStats } from '../../src/war/sim/classes';
import { makePerson } from '../../src/war/sim/roster';
import { ALLIANCES } from '../../src/war/world/alliances';
import { FAMILIES, FAMILY_IDS, homeChoices, pathStart, type StartFamily } from '../../src/war/world/start';
import type { AllianceId } from '../../src/war/world/types';
import type { RegionData } from '../../src/war/types';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;
const HOMES = Object.values(ALLIANCES).map((a) => a.home);
const SEEDS = [11, 22, 33];
/** Every other home a new player may choose (the entry regions), one seed each. */
const ENTRIES = Object.values(ALLIANCES).flatMap((a, team) => homeChoices(team as AllianceId).filter((w) => w.id !== a.home).map((w) => [w.id, team] as const));

/** His start men at the road's entry, as he walks in: seconds to clear the guide's camp (-1: never) and men on their feet at the end. */
function fight(r: RegionData, team: number, f: StartFamily, seed: number) {
  const sp = guideSpots(r, team), sim = createSim(r, seed);
  sim.setPaths(() => ({ path: 'warrior', family: f, level: 1 }));
  sim.spawnMobs();
  sim.addLair({ kind: GUIDE_LAIR.kind, x: sp.lair.x, y: sp.lair.y, count: GUIDE_LAIR.count });
  const lair = sim.snapshot().lairs!.find((l) => Math.hypot(l.x - sp.lair.x, l.y - sp.lair.y) < 0.5)!;
  const ps = pathStart('warrior', f).map((c, i) => makePerson(`m${i}`, c, { level: 1 }));
  const line = ps.filter((p) => warStats(p.hero.cls!).range === 0), back = ps.filter((p) => warStats(p.hero.cls!).range > 0);
  const front = sim.spawnSquad('p:1', team, line[0].hero.cls!, line.length, sp.entry.x, sp.entry.y, line);
  const rear = back.length ? sim.spawnSquad('p:1', team, back[0].hero.cls!, back.length, sp.entry.x, sp.entry.y, back) : -1;
  sim.order({ kind: 'attack', squad: front, target: lair.squad });
  let secs = -1;
  for (let t = 0; t < 4000 && secs < 0; t++) {
    if (t === 15 && rear >= 0) sim.order({ kind: 'attack', squad: rear, target: lair.squad });
    sim.step();
    if (sim.snapshot().lairs!.find((l) => l.id === lair.id)?.state === 'cleared') secs = Math.round(t / 10);
  }
  const s = sim.snapshot(), mine = s.units.filter((u) => s.squads[u.squad]?.owner === 'p:1');
  return { secs, standing: mine.filter((u) => u.state !== 'dead').length, of: ps.length };
}

describe('W-171 the first fight', () => {
  it.each(FAMILY_IDS)('family %s wins it on every home, every seed, with most men on their feet', (f) => {
    const rows: string[] = [];
    HOMES.forEach((id, team) => {
      const r = region(id);
      for (const seed of SEEDS) {
        const o = fight(r, team, f, seed);
        rows.push(`${FAMILIES[f].name} ${id} seed ${seed}: ${o.secs < 0 ? 'LOST' : `${o.secs} s`} ${o.standing}/${o.of}`);
        expect.soft(o.secs, `${id} ${seed}`).toBeGreaterThanOrEqual(0);
        expect.soft(o.standing, `${id} ${seed}`).toBeGreaterThanOrEqual(Math.ceil(o.of / 2));
      }
    });
    for (const [id, team] of ENTRIES) {
      const o = fight(region(id), team, f, SEEDS[0]);
      rows.push(`${FAMILIES[f].name} ${id}: ${o.secs < 0 ? 'LOST' : `${o.secs} s`} ${o.standing}/${o.of}`);
      expect.soft(o.secs, id).toBeGreaterThanOrEqual(0);
      expect.soft(o.standing, id).toBeGreaterThanOrEqual(Math.ceil(o.of / 2));
    }
    console.log(rows.join('\n'));
  }, 300_000);
});
