/**
 * World map vectors (src/war/world-view: geo.ts, lords.ts, map.ts transitPos and fit, regionCard.ts words) for the Godot
 * world screen (godot/src/world_view/world_geo.gd), on the fixture world (../godotWorld.ts).
 */
import { WORLD_EDGES, WORLD_IDS } from '../../war/world/graph';
import { inSight, scoreRate, seasonStandings } from '../../war/world-view/geo';
import { lordInfo, lordMarks, pennantScale, roughMen } from '../../war/world-view/lords';
import { clock, WorldMap, type WorldArt } from '../../war/world-view/map';
import { regionAction, regionKind, regionTags } from '../../war/world-view/regionCard';
import { travelMs } from '../../war/world-view/source';
import { domainOf, WARLORDS } from '../../data/warWarlords';
import type { TransitSnap } from '../../war/net/world';
import art from '../../../public/war/world/regions.json';
import { FIXTURE_NOW, worldFixture } from '../godotWorld';

export const vectors = () => {
  const v = worldFixture(), regions = v.snap.regions, by = new Map(regions.map((r) => [r.id, r])), now = FIXTURE_NOW;
  const own = [new Set<string>(), new Set(['elaia']), new Set(['kleisoura', 'omphalos'])];
  const sight = [null, 0, 1, 2, 3].flatMap((you) => own.map((o, k) => [you, k, WORLD_IDS.map((id) => inSight(id, you as 0 | null, by, o))]));
  const nows = [now, now + 60_000, now + 5 * 60_000, now + 31 * 3600_000];
  const map = { art: art as unknown as WorldArt } as unknown as WorldMap;
  const transits: TransitSnap[] = [];
  for (const [i, e] of WORLD_EDGES.entries()) if (i % 3 === 0) for (const state of ['moving', 'queued'] as const) transits.push({ id: i, from: e.b, to: e.a, men: 12, departAt: now - 10_000, arriveAt: now + 20_000 + i * 1000, state });
  const fits = [[1280, 720], [1520, 750], [1920, 1080], [844, 390], [390, 844]].map(([w, h]) => {
    const m = { art, canvas: { clientWidth: w, clientHeight: h }, settle() {} }, free = w > h ? { top: 48, left: 200, right: 200, bottom: 12 } : { top: 140, left: 0, right: 0, bottom: 200 };
    WorldMap.prototype.fit.call(m as unknown as WorldMap, free);
    const cam = m as unknown as { k: number; x: number; y: number };
    return [w, h, free, cam.k, cam.x, cam.y];
  });
  return {
    now,
    edges: WORLD_EDGES.map((e) => [e.a, e.b, e.sideA, e.sideB, e.ms, travelMs(e.a, e.b)]),
    score: regions.map((r) => [r.id, scoreRate(r)]),
    standings: seasonStandings(regions),
    sight,
    domains: WARLORDS.map((w) => [w.id, domainOf(w)]),
    lords: nows.map((t) => [t, lordMarks(regions, t), WARLORDS.map((w) => lordInfo(w.id, regions, t))]),
    rough: Array.from({ length: 31 }, (_, n) => [n, roughMen(n)]),
    pennant: [0.1, 0.2, 0.35, 0.5, 0.8, 1, 1.5, 2, 3].map((k) => [k, pennantScale(k)]),
    clock: [0, 5, 59, 60, 61, 3599, 3600, 3661, 86_399, 360_000].map((s) => [s, clock(s)]),
    transit: transits.flatMap((t) => [-20_000, 0, 7_000, 15_000, 60_000].map((dt) => [t, now + dt, WorldMap.prototype.transitPos.call(map, t, now + dt)])),
    fit: fits,
    words: WORLD_IDS.map((id) => [id, regionKind(id), regionTags(id, by.get(id)).map((t) => [t.text, t.cls, t.tip])]),
    actions: (['enter', 'march', 'haul', 'squad'] as const).map((m) => [m, regionAction(m)]),
  };
};
