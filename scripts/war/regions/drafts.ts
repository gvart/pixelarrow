/**
 * Per-biome drafts of the 31 regions not yet hand-made (docs/impl W-41): one parameterised template, driven by the
 * region's row in ./world.ts (role, biome family, relief, water, sea sides, forest share, fauna, resources), seeded by
 * its id. Every draft gets its entries on the sides facing its neighbours, a hub (market / claim point) with roads to
 * every entry, terrain of its relief and water, its fauna's lairs and its resource nodes (the 2 tin sources included).
 * Marked `draft: true` in the data (meta); each is replaced by its own script when hand-made.
 */
import { nearestSample, spline } from '../shapes.ts';
import type { BiomeName, Kit, Pt, RegionDef } from './kit.ts';
import { WORLD, type Family, type Side, type WorldRegion } from './world.ts';

/** Deterministic random in [0, 1) per region and call. */
function rng(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const ZONE: Record<Family, BiomeName> = { med: 'elaia', desert: 'kyrene', mountain: 'mountains', forest: 'dodona', steppe: 'global', wet: 'global' };
/** River bed level per relief (canyon floors are at 1). */
const bedOf = (rel: WorldRegion['relief']) => (rel === 'canyon' ? 0 : Math.max(0, BASE[rel] - 1));
const BASE: Record<WorldRegion['relief'], number> = { flat: 1, hills: 2, plateau: 2, mountain: 2, dunes: 1, canyon: 4, cliffs: 2 };
/** Unit point just inside side s at place `along` (0..1), `d` units in. */
const onSide = (s: Side, along: number, d: number): Pt => (s === 'N' ? [along * 256, d] : s === 'S' ? [along * 256, 256 - d] : s === 'W' ? [d, along * 256] : [256 - d, along * 256]);

function template(w: WorldRegion): RegionDef {
  return {
    id: w.id,
    draft: true,
    style: w.family === 'steppe' ? { dry: 0.25, dryHigh: false, trees: 0.3 } : {},
    build(k: Kit) {
      const r = rng(w.id), j = (a: number) => (r() * 2 - 1) * a;
      const sea = new Set(w.sea ?? []);
      k.fill(BASE[w.relief]);
      k.zone(ZONE[w.family], () => 99);
      if (w.family === 'steppe') k.zone('elaia', [128 + j(60), 128 + j(60), 70, 50, j(1)], 10);
      const hub: Pt = [128 + j(24), 128 + j(24)];
      // road lines: hub -> a bend -> each entry
      const lines = k.sides.map((s) => {
        const e = k.entry(s.id), m: Pt = [(hub[0] + e[0]) / 2 + j(18), (hub[1] + e[1]) / 2 + j(18)];
        return [hub, m, onSide(s.side, s.along, 14), e] as Pt[];
      });
      const curves = lines.map((l) => spline(l, 2));
      const roadNear = (p: Pt) => Math.min(...curves.map((c) => { const q = nearestSample(c, p[0], p[1]); return Math.hypot(q.x - p[0], q.y - p[1]); }));
      /** A point at least `gap` units from every road and the hub (tries a few). */
      const free = (gap: number, edge = 30): Pt => {
        let best: Pt = [128, 128], bd = -1;
        for (let n = 0; n < 24; n++) {
          const p: Pt = [edge + r() * (256 - 2 * edge), edge + r() * (256 - 2 * edge)], d = Math.min(roadNear(p), Math.hypot(p[0] - hub[0], p[1] - hub[1]));
          if (d >= gap) return p;
          if (d > bd) (bd = d), (best = p);
        }
        return best;
      };
      /** On a canyon map a side canyon leads from the hub to every placed thing (the mesas between stay high ground). */
      const reach = (p: Pt) => { if (w.relief === 'canyon') k.cut([hub, [(hub[0] + p[0]) / 2 + j(10), (hub[1] + p[1]) / 2 + j(10)], p], { h: 1, half: 6, t: 'sand' }); return p; };
      // relief
      if (w.relief === 'hills' || w.relief === 'cliffs') for (let n = 0; n < 6; n++) { const p = free(10); k.hill([p[0], p[1], 14 + r() * 16, 10 + r() * 10, j(1.5)], BASE[w.relief] + 2, 4); }
      if (w.relief === 'plateau') { const p = free(6, 60); k.plateau([p[0], p[1], 30 + r() * 14, 22 + r() * 10, j(1)], 4); k.spot('highGround', p); }
      if (w.relief === 'dunes') { k.paint('sand', [128, 128, 200, 200, 0], { rough: 8 }); for (let n = 0; n < 10; n++) { const p = free(6, 16); k.hill([p[0], p[1], 8 + r() * 10, 4 + r() * 4, j(1.5)], 3, 2, 2); } }
      if (w.relief === 'canyon') {
        k.paint('sand', [128, 128, 200, 200, 0], { rough: 8, on: ['grass'] });
        for (const l of lines) k.cut(l, { h: 1, half: 9, bank: 0, t: 'sand' });
        k.basin([hub[0], hub[1], 22, 18, j(1)], 1);
      }
      if (w.relief === 'mountain') {
        // rock masses in the quarters away from the roads; a pass road is cut where one still meets a line
        for (let n = 0; n < 4; n++) { const p = free(34, 20); k.rockMass([p[0], p[1], 24 + r() * 16, 16 + r() * 10, j(1.5)]); }
      }
      // the sea
      for (const s of sea) {
        const c = onSide(s, 0.5, -30);
        k.waterBody([c[0], c[1], s === 'N' || s === 'S' ? 190 : 50, s === 'N' || s === 'S' ? 50 : 190, 0], { shore: 4, beach: 3, rough: 7 });
        if (w.relief === 'cliffs') { const b = onSide(s, 0.5, 34); k.hill([b[0], b[1], s === 'N' || s === 'S' ? 120 : 14, s === 'N' || s === 'S' ? 14 : 120, 0], 4, 3); }
        if (w.water === 'fjord') for (const a of [0.3, 0.7]) { const p = onSide(s, a + j(0.05), 30); k.waterBody([p[0], p[1], s === 'N' || s === 'S' ? 7 : 40, s === 'N' || s === 'S' ? 40 : 7, j(0.3)], { shore: 2, beach: 1 }); }
      }
      // water
      if (w.water === 'lake') { const p = free(26, 50); k.waterBody([p[0], p[1], 26 + r() * 16, 18 + r() * 10, j(1)], { shore: 3, beach: 2 }); k.spot('lake', p); }
      if (w.water === 'marsh') for (let n = 0; n < 4; n++) { const p = free(8); k.paint('marsh', [p[0], p[1], 18 + r() * 12, 10 + r() * 8, j(1.5)], { on: ['grass', 'sand'] }); k.waterBody([p[0] + j(5), p[1] + j(5), 3, 2, 0], { deep: true, shore: 1, beach: 0 }); }
      if (w.water === 'river' || w.water === 'brook') {
        // edge to edge across the map; shallow where a road crosses it, deep (with a narrows) elsewhere for a river
        const a = r() * Math.PI, d: Pt = [Math.cos(a), Math.sin(a)];
        const pts: Pt[] = [-1.2, -0.6, 0, 0.6, 1.2].map((t, n) => [128 + d[0] * t * 140 + (n % 2 ? 1 : -1) * d[1] * 18 + j(6), 128 + d[1] * t * 140 - (n % 2 ? 1 : -1) * d[0] * 18 + j(6)]);
        const c = spline(pts, 2);
        k.river(pts, { half: w.water === 'river' ? 3 : 1.6, deep: false, bed: bedOf(w.relief), bank: 4 });
        if (w.water === 'river') {
          let run: Pt[] = [];
          const flush = () => {
            if (run.length > 18) { const m = run[run.length >> 1]; k.river(run, { half: 4.5, bed: bedOf(w.relief), bank: 4, narrows: [[m, 2.6]], name: `river${k.rivers.length}` }); }
            run = [];
          };
          for (const p of c) { if (roadNear([p.x, p.y]) > 16 && p.x > -2 && p.y > -2 && p.x < 258 && p.y < 258) run.push([p.x, p.y]); else flush(); }
          flush();
        }
      }
      // roads, the hub (market and claim point)
      for (const l of lines) k.road(l, { pass: w.relief === 'mountain' ? 4 : undefined, grade: 4 });
      k.paint('dirt', [hub[0], hub[1], 9, 7, j(1)], { on: ['grass', 'sand', 'forest'], rough: 2 });
      k.spot('market', hub);
      // forest
      const nf = Math.round(w.forest * 12);
      for (let n = 0; n < nf; n++) { const p = free(6, 10); k.forest([p[0], p[1], 10 + r() * 22, 8 + r() * 14, j(1.5)]); }
      // resources: rating x 2 nodes round a spot per kind (silver, salt, horses have no node art: meta only)
      for (const [res, n] of Object.entries(w.resources)) {
        if (!['tin', 'iron', 'copper', 'marble', 'stone', 'food'].includes(res)) continue;
        const p = reach(free(10, 30));
        k.resource(res as 'tin', p, n * 2, 14);
        k.spot(res, p);
      }
      // fauna: two lairs of the first kind, one of the second; the region's lair beast big and away from the hub
      w.fauna.forEach((f, n) => {
        for (let c = 0; c < (f.lair ? 1 : n === 0 ? 2 : 1); c++) k.lair(f.kind, reach(free(14, 24)), { as: f.as, ...(f.lair ? { count: 10 } : {}) });
      });
      if (w.role !== 'home') k.claim(hub, 200);
    },
  };
}

const HAND = new Set(['elaia', 'kyrene', 'dodona', 'skythia', 'kleisoura', 'omphalos']);
export const DRAFTS: RegionDef[] = WORLD.filter((w) => !HAND.has(w.id)).map(template);
