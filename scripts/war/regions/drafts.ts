/**
 * Per-biome drafts of the 31 regions not yet hand-made (docs/impl W-41): one parameterised template, driven by the
 * region's row in ./world.ts (role, biome family, relief, water, sea sides, forest share, fauna, resources) and by its
 * purpose (./world.ts BRIEF, docs/WAR.md "Purpose of every region"), seeded by its id. Every draft gets its entries on
 * the sides facing its neighbours and a hub (claim point) with roads to every entry, so each trade route through it
 * runs entry - hub - entry; then what its must-have line asks for:
 *   narrows   the chokepoint of PLAN (a gap between rock masses, a sunken road through a scarp or a cliff band, a canyon
 *             floor, a neck between waters, a ford over a deep river, a rock bridge, a causeway) on the road toward
 *             its neighbour, with high ground over it (a ledge, the scarp or band top, a hill, an isle);
 *   square    a town square (market) at the hub with stall and caravan sites;
 *   nodes     the scarce goods in a field on a knoll, the region's lair by the richest, a haul road to the hub;
 *   fields    ploughed strips and crops by water; olives: olive rows; ridge: a defensive ridge across the home road;
 *   fortress  a flat-topped hill with one ramp; beach: the sea's beaches (kept clear).
 * Marked `draft: true` in the data (meta); each is replaced by its own script when hand-made. ./checks.ts verifies.
 */
import { nearestSample, spline, type Sample } from '../shapes.ts';
import { E, type BiomeName, type Kit, type Pt, type RegionDef } from './kit.ts';
import { BRIEF, SCARCE, WORLD, type Family, type Side, type WorldRegion } from './world.ts';

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
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];

/**
 * The chokepoint of a draft, on the road from the hub toward neighbour `toward`, `t` of the way (default 0.55); `gw`
 * half the gap in units. rock: rock masses both sides, a ledge on one; scarp: the far side 4 levels up, the road sunk
 * into it; band: a cliff band 3 up across the road, cut by a wadi; canyon: that road's canyon narrow; water: deep water
 * both sides (marsh round it when `marsh`); river: a deep river across (fords where roads cross, a bridge site);
 * bridge: a deep gorge river crossed by rock bridges; causeway: a lake round the hub, causeways across it.
 */
interface Choke { kind: 'rock' | 'scarp' | 'band' | 'canyon' | 'water' | 'river' | 'bridge' | 'causeway'; toward: string; t?: number; gw?: number; marsh?: boolean; shallow?: boolean }
interface Plan { chokes?: Choke[]; hub?: Pt }
const PLAN: Record<string, Plan> = {
  'dodona-n': { chokes: [{ kind: 'water', toward: 'krios', gw: 1.7 }] },
  'dodona-e': { chokes: [{ kind: 'rock', toward: 'kleisoura', gw: 2.2 }] },
  'dodona-s': { chokes: [{ kind: 'river', toward: 'stymphalia' }] },
  'skythia-w': { chokes: [{ kind: 'rock', toward: 'kleisoura', gw: 2 }] },
  'kyrene-n': { chokes: [{ kind: 'band', toward: 'ammos' }] },
  'kyrene-e': { chokes: [{ kind: 'water', toward: 'ammon', gw: 1.4 }] },
  'kyrene-w': { hub: [92, 128], chokes: [{ kind: 'river', toward: 'achelous', t: 0.62 }] },
  'elaia-n': { chokes: [{ kind: 'water', toward: 'stymphalia', gw: 1.7, marsh: true }] },
  'elaia-e': { hub: [164, 128], chokes: [{ kind: 'river', toward: 'achelous', t: 0.62 }] },
  krios: { chokes: [{ kind: 'rock', toward: 'kleisoura', gw: 1.5 }] },
  delta: { chokes: [{ kind: 'river', toward: 'achelous', t: 0.5 }, { kind: 'river', toward: 'kyrene-s', t: 0.5, shallow: true }] },
  stymphalia: { chokes: [{ kind: 'causeway', toward: 'dodona-s' }] },
  achelous: { chokes: [{ kind: 'river', toward: 'elaia-e', t: 0.4 }, { kind: 'river', toward: 'kyrene-w', t: 0.4, shallow: true }] },
  saddle: { chokes: [{ kind: 'scarp', toward: 'omphalos', t: 0.5 }] },
  erymanthos: { chokes: [{ kind: 'scarp', toward: 'omphalos', t: 0.5 }] },
  gorge: { chokes: [{ kind: 'bridge', toward: 'omphalos', t: 0.45 }] },
  canyons: { chokes: [{ kind: 'canyon', toward: 'omphalos' }] },
};

function template(w: WorldRegion): RegionDef {
  const brief = BRIEF[w.id], needs = new Set(brief.needs), plan = PLAN[w.id] ?? {};
  return {
    id: w.id,
    draft: true,
    style: w.family === 'steppe' ? { dry: 0.25, dryHigh: false, trees: 0.3 } : {},
    build(k: Kit) {
      const r = rng(w.id), j = (a: number) => (r() * 2 - 1) * a;
      const sea = new Set(w.sea ?? []), base = BASE[w.relief];
      k.fill(base);
      k.zone(ZONE[w.family], () => 99);
      if (w.family === 'steppe') k.zone('elaia', [128 + j(60), 128 + j(60), 70, 50, j(1)], 10);
      const hub: Pt = plan.hub ?? [128 + j(24), 128 + j(24)];
      // ---- layout first (points and road lines), the land after, roads last
      const chokes = (plan.chokes ?? []).map((c) => {
        const s = k.sides.find((e) => e.id === c.toward)!, inner = onSide(s.side, s.along, 14);
        const len = Math.hypot(inner[0] - hub[0], inner[1] - hub[1]), d: Pt = [(inner[0] - hub[0]) / len, (inner[1] - hub[1]) / len];
        return { ...c, side: s, d, n: [-d[1], d[0]] as Pt, G: add(hub, d, len * (c.t ?? 0.55)), inner };
      });
      // road lines: hub -> a bend (or the choke's gap) -> each entry
      const lines = k.sides.map((s) => {
        const e = k.entry(s.id), ch = chokes.find((c) => c.toward === s.id);
        const m: Pt = ch ? ch.G : [(hub[0] + e[0]) / 2 + j(18), (hub[1] + e[1]) / 2 + j(18)];
        return [hub, m, onSide(s.side, s.along, 14), e] as Pt[];
      });
      const curves: Sample[][] = lines.map((l) => spline(l, 2));
      const roadNear = (p: Pt) => Math.min(...curves.map((c) => { const q = nearestSample(c, p[0], p[1]); return Math.hypot(q.x - p[0], q.y - p[1]); }));
      const taken: [Pt, number][] = chokes.map((c) => [c.G, 30]);
      /** A point at least `gap` units from every road, the hub, the chokes and the things placed so far (tries a few). */
      const free = (gap: number, edge = 30): Pt => {
        let best: Pt = [128, 128], bd = -1;
        for (let n = 0; n < 40; n++) {
          const p: Pt = [edge + r() * (256 - 2 * edge), edge + r() * (256 - 2 * edge)];
          const d = Math.min(roadNear(p), Math.hypot(p[0] - hub[0], p[1] - hub[1]), ...taken.map(([q, g]) => Math.hypot(p[0] - q[0], p[1] - q[1]) - g + gap));
          if (d >= gap) return p;
          if (d > bd) (bd = d), (best = p);
        }
        return best;
      };
      const claim = (p: Pt, g: number) => (taken.push([p, g]), p);
      // the scarce goods' fields and their haul roads to the hub
      const scarce = needs.has('nodes') ? SCARCE.filter((s) => w.resources[s]) : [];
      const fields = scarce.map((res) => ({ res, p: claim(res === 'tin' && w.id === 'achelous' ? add(hub, [0, -30]) : free(20, 36), 24) }));
      for (const f of fields) { lines.push([f.p, [(f.p[0] + hub[0]) / 2 + j(8), (f.p[1] + hub[1]) / 2 + j(8)], hub]); curves.push(spline(lines.at(-1)!, 2)); }
      const fort = needs.has('fortress') ? claim(free(26, 44), 30) : null;
      const ud: Pt = fort ? (() => { const u: Pt = [hub[0] - fort[0], hub[1] - fort[1]], ul = Math.hypot(u[0], u[1]) || 1; return [u[0] / ul, u[1] / ul]; })() : [0, 0];
      if (fort) { lines.push([hub, add(fort, ud, 30)]); curves.push(spline(lines.at(-1)!, 2)); }
      const ridgeAt = needs.has('ridge') ? (() => {
        const home = k.sides.find((s) => byRole(s.id) === 'home') ?? k.sides[0], e = onSide(home.side, home.along, 14);
        return { p: add(hub, [e[0] - hub[0], e[1] - hub[1]], 0.5), home };
      })() : null;
      if (ridgeAt) claim(ridgeAt.p, 20);
      if (chokes.some((c) => c.kind === 'causeway')) taken.push([hub, 84]);
      // the other resources and the lairs: the region's lair beast on its richest scarce node, the rest away from the hub
      const others = Object.entries(w.resources).filter(([res]) => ['tin', 'iron', 'copper', 'marble', 'stone', 'food'].includes(res) && !scarce.includes(res as 'tin')).map(([res, n]) => ({ res, n, p: claim(free(10, 30), 12) }));
      const richest = fields.slice().sort((a, b) => w.resources[b.res] - w.resources[a.res])[0];
      const lairKind = w.fauna.find((f) => f.lair) ?? w.fauna[0];
      const lairAt = w.fauna.flatMap((f, n) => Array.from({ length: f.lair ? 1 : n === 0 ? 2 : 1 }, (_, c) => {
        const onNode = !!richest && f === lairKind && c === 0;
        return { f, onNode, p: onNode ? add(richest.p, [7, 5]) : claim(free(14, 24), 12) };
      }));
      /** On a canyon map a side canyon leads from the hub to every placed thing (the mesas between stay high ground). */
      const reachLines = w.relief === 'canyon' ? [...others.map((o) => o.p), ...lairAt.map((l) => l.p), ...fields.map((f) => f.p)].map((p) => [hub, [(hub[0] + p[0]) / 2 + j(10), (hub[1] + p[1]) / 2 + j(10)], p] as Pt[]) : [];
      curves.push(...reachLines.map((l) => spline(l, 2)));
      // ---- relief
      if (w.relief === 'hills' || w.relief === 'cliffs') for (let n = 0; n < 6; n++) { const p = free(10); k.hill([p[0], p[1], 14 + r() * 16, 10 + r() * 10, j(1.5)], base + 2, 4); }
      if (w.relief === 'plateau') {
        const p = free(6, 60), u = Math.hypot(hub[0] - p[0], hub[1] - p[1]) || 1, ru: Pt = [(hub[0] - p[0]) / u, (hub[1] - p[1]) / u];
        k.plateau([p[0], p[1], 30 + r() * 14, 22 + r() * 10, j(1)], 4);
        k.road([add(p, ru, 48), add(p, ru, 34), add(p, ru, 18)], { w: 1.3, fill: true, grade: 2 });
        k.spot('highGround', p);
      }
      if (w.relief === 'dunes') { k.paint('sand', [128, 128, 200, 200, 0], { rough: 8 }); for (let n = 0; n < 10; n++) { const p = free(6, 16); k.hill([p[0], p[1], 8 + r() * 10, 4 + r() * 4, j(1.5)], 3, 2, 2); } }
      if (w.relief === 'canyon') {
        k.paint('sand', [128, 128, 200, 200, 0], { rough: 8, on: ['grass'] });
        lines.forEach((l, n) => { const ch = chokes.find((c) => c.kind === 'canyon' && n < k.sides.length && k.sides[n].id === c.toward); k.cut(l, { h: 1, half: ch ? 1.9 : 9, bank: 0, t: 'sand' }); });
        k.basin([hub[0], hub[1], 22, 18, j(1)], 1);
        for (const l of reachLines) k.cut(l, { h: 1, half: 6, t: 'sand' });
      }
      if (w.relief === 'mountain') for (let n = 0; n < 4; n++) { const p = free(34, 20); k.rockMass([p[0], p[1], 24 + r() * 16, 16 + r() * 10, j(1.5)]); }
      // ---- the sea
      for (const s of sea) {
        const c = onSide(s, 0.5, -30);
        k.waterBody([c[0], c[1], s === 'N' || s === 'S' ? 190 : 50, s === 'N' || s === 'S' ? 50 : 190, 0], { shore: 4, beach: 3, rough: 7 });
        if (w.relief === 'cliffs') { const b = onSide(s, 0.5, 34); k.hill([b[0], b[1], s === 'N' || s === 'S' ? 120 : 14, s === 'N' || s === 'S' ? 14 : 120, 0], 4, 3); }
        if (w.water === 'fjord') for (const a of [0.3, 0.7]) { const p = onSide(s, a + j(0.05), 30); k.waterBody([p[0], p[1], s === 'N' || s === 'S' ? 7 : 40, s === 'N' || s === 'S' ? 40 : 7, j(0.3)], { shore: 2, beach: 1 }); }
      }
      // ---- the chokepoints
      const fordsOf = (c: Sample[]) => curves.flatMap((rc) => {
        const out: Pt[] = [];
        for (const p of rc) { const q = nearestSample(c, p.x, p.y); if (Math.hypot(q.x - p.x, q.y - p.y) < 1.2 && !out.some((o) => Math.hypot(o[0] - q.x, o[1] - q.y) < 12)) out.push([q.x, q.y]); }
        return out;
      });
      const bridges: Pt[] = [];
      chokes.forEach((ch, n) => {
        const { G, d, n: nn } = ch, gw = ch.gw ?? 2, rot = Math.atan2(nn[1], nn[0]);
        const main = n === 0;
        if (ch.kind === 'rock') {
          for (const sg of [1, -1]) for (const o of [24, 60, 96]) { const c = add(G, nn, sg * (gw + o)); k.rockMass([c[0], c[1], 24, 24, 0], { rough: 1.2 }); }
          // the ledge: carved out of one wall, 3 levels over the gap, a ramp up from the hub side
          const L = add(G, nn, gw + 2.6);
          k.plateau([L[0], L[1], 2.4, 16, rot], base + 4, { terrain: 'dirt', rough: 0.5 });
          k.road([add(add(G, d, -22), nn, gw - 1.5), add(add(G, d, -16), nn, gw + 0.5), add(add(G, d, -10), nn, gw + 2.6)], { w: 1.2, fill: true, grade: 1.6 });
          if (main) k.spot('narrows', add(G, nn, -1)), k.spot('ledge', L);
        } else if (ch.kind === 'scarp') {
          k.lift((x, y) => ((x - G[0]) * d[0] + (y - G[1]) * d[1] > 0 ? base + 4 : NaN));
          if (main) k.spot('narrows', add(G, d, 4)), k.spot('scarpTop', add(add(G, d, 14), nn, 16));
        } else if (ch.kind === 'band') {
          k.lift((x, y) => { const u = (x - G[0]) * d[0] + (y - G[1]) * d[1]; return u > -10 && u < 10 ? base + 3 : NaN; });
          k.cut([add(G, d, -16), G, add(G, d, 16)], { h: base, half: 1.8, bank: 0, t: 'sand' });
          k.road([add(add(G, d, 22), nn, 18), add(add(G, d, 14), nn, 18), add(add(G, d, 4), nn, 18)], { w: 1.2, fill: true, grade: 2 });
          if (main) k.spot('narrows', G), k.spot('bandTop', add(G, nn, 18));
        } else if (ch.kind === 'canyon') {
          const M = add(add(G, d, -14), nn, 16);
          k.road([add(hub, nn, 12), add(add(hub, nn, 18), d, 6), M], { w: 1.2, fill: true, grade: 2 });
          if (main) k.spot('narrows', G), k.spot('mesa', M);
        } else if (ch.kind === 'water') {
          for (const sg of [1, -1]) for (const o of [26, 66, 106]) {
            const c = add(G, nn, sg * (gw + o));
            if (k.sides.some((s) => s.id !== ch.toward && Math.hypot(k.entry(s.id)[0] - c[0], k.entry(s.id)[1] - c[1]) < 60)) continue;
            if (ch.marsh) k.paint('marsh', [c[0], c[1], 40, 36, 0], { on: ['grass', 'sand'] });
            k.waterBody([c[0], c[1], 26, 26, 0], { shore: 0.6, beach: 1.5, rough: 1 });
          }
          k.causeway([add(G, d, -16), add(G, d, 16)], gw);
          const Hh = add(add(G, d, -16), nn, gw + 6);
          k.hill([Hh[0], Hh[1], 7, 6, 0], base + 3, 2, 1);
          if (main) k.spot('narrows', G);
        } else if (ch.kind === 'river' || ch.kind === 'bridge') {
          const pts: Pt[] = [-1.4, -0.7, 0, 0.7, 1.4].map((t, m) => add(add(G, nn, t * 180), d, m === 2 ? 0 : (m % 2 ? 1 : -1) * 6 + j(4)));
          const c = spline(pts, 1), crossings = fordsOf(c);
          // the bridge site: the river point farthest from the roads, inside the map
          const site = c.filter((p) => p.x > 24 && p.y > 24 && p.x < 232 && p.y < 232).sort((a, b) => roadNear([b.x, b.y]) - roadNear([a.x, a.y]))[0];
          if (ch.kind === 'bridge') {
            k.river(pts, { half: 5, bed: 0, bank: 1.2 });
            bridges.push(...crossings);
          } else {
            k.river(pts, { half: ch.shallow ? 3.5 : 4.5, deep: !ch.shallow, bed: bedOf(w.relief), bank: 4, fords: crossings, fordHalf: 1.6, narrows: site && !ch.shallow ? [[[site.x, site.y], 2.6]] : [], name: `river${n || ''}` });
          }
          if (main) {
            k.spot('narrows', pt(nearestSample(c, G[0], G[1])));
            const Hh = add(add(G, d, -11), nn, 11);
            k.hill([Hh[0], Hh[1], 8, 7, 0], Math.min(6, base + 3), 2, 1);
          }
        } else if (ch.kind === 'causeway') {
          k.paint('marsh', [hub[0], hub[1], 112, 96, rot], { on: ['grass', 'sand'] });
          k.waterBody([hub[0], hub[1], 78, 64, rot], { shore: 5, beach: 2, rough: 3 });
          const isle = add(G, nn, 16);
          for (const l of lines) k.causeway(l, 1.2);
          k.island([hub[0], hub[1], 16, 14, rot], 1);
          k.island([isle[0], isle[1], 9, 7, rot], 2);
          k.hill([isle[0], isle[1], 6, 5, rot], 3, 2, 1);
          k.causeway([G, isle], 0.9);
          if (main) k.spot('narrows', G), k.spot('isle', isle);
        }
      });
      // ---- water (when no chokepoint river or lake took its place)
      if (!chokes.some((c) => c.kind === 'river' || c.kind === 'causeway' || c.kind === 'bridge')) {
        if (w.water === 'lake') { const p = claim(free(26, 50), 30); k.waterBody([p[0], p[1], 26 + r() * 16, 18 + r() * 10, j(1)], { shore: 3, beach: 2 }); k.spot('lake', p); }
        if (w.water === 'marsh') for (let n = 0; n < 4; n++) { const p = free(8); k.paint('marsh', [p[0], p[1], 18 + r() * 12, 10 + r() * 8, j(1.5)], { on: ['grass', 'sand'] }); k.waterBody([p[0] + j(5), p[1] + j(5), 3, 2, 0], { deep: true, shore: 1, beach: 0 }); }
        if (w.water === 'river' || w.water === 'brook') {
          // edge to edge across the map; shallow where a road crosses it, deep (with a narrows) elsewhere for a river
          const a = r() * Math.PI, dd: Pt = [Math.cos(a), Math.sin(a)];
          const pts: Pt[] = [-1.2, -0.6, 0, 0.6, 1.2].map((t, n) => [128 + dd[0] * t * 140 + (n % 2 ? 1 : -1) * dd[1] * 18 + j(6), 128 + dd[1] * t * 140 - (n % 2 ? 1 : -1) * dd[0] * 18 + j(6)]);
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
      }
      // ---- purpose features on the land
      if (fort) {
        k.basin([fort[0], fort[1], 20, 18, 0], base, 0, 1);
        k.plateau([fort[0], fort[1], 13, 11, 0], base + 3, { rough: 1 });
        k.road([add(fort, ud, 30), add(fort, ud, 21), add(fort, ud, 7)], { w: 1.3, fill: true, grade: 2.2 });
        k.spot('fortress', add(fort, ud, -2));
        k.piece('wall-ruin', fort, { r: 9, n: 3, gap: 5 });
        k.piece('watchtower', add(fort, ud, -5), { r: 5 });
      }
      if (ridgeAt) {
        const { p } = ridgeAt, e = onSide(ridgeAt.home.side, ridgeAt.home.along, 14), dl = Math.hypot(e[0] - hub[0], e[1] - hub[1]) || 1, nn: Pt = [-(e[1] - hub[1]) / dl, (e[0] - hub[0]) / dl];
        k.ridge([add(p, nn, -64), add(add(p, nn, -30), [nn[1], -nn[0]], 6), p, add(add(p, nn, 30), [nn[1], -nn[0]], -6), add(p, nn, 64)], { crest: base + 3, step: 2.5, top: 2, reach: 22 });
        k.spot('ridge', p);
      }
      if (needs.has('square')) {
        k.square(hub, 7, chokes.some((c) => c.kind === 'causeway') ? 1 : undefined);
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) k.piece(w.family === 'desert' ? 'kyrene/nomad-tent' : 'wall-ruin', add(hub, [dx * 10.5, dy * 10.5]), { r: 3 });
        k.piece(w.family === 'desert' ? 'kyrene/camels' : 'elaia/goats', add(hub, [0, 12]), { r: 5 });
        if (w.id === 'ammos') { k.oasis(add(hub, [16, -14]), 3); k.piece('kyrene/ruin-wall', add(hub, [-9, -9]), { r: 5, n: 4, gap: 4 }); }
      } else k.paint('dirt', [hub[0], hub[1], 9, 7, j(1)], { on: ['grass', 'sand', 'forest'], rough: 2 });
      // ---- roads (the hub, the chokes' gaps, the haul roads)
      for (const l of lines) k.road(l, { pass: w.relief === 'mountain' ? 4 : undefined, grade: 4, bridges, span: 6 });
      if (!needs.has('square')) k.spot('market', hub);
      // ---- forest
      const nf = Math.round(w.forest * 12);
      for (let n = 0; n < nf; n++) { const p = free(6, 10); k.forest([p[0], p[1], 10 + r() * 22, 8 + r() * 14, j(1.5)]); }
      // ---- breadbasket fields by the water, olive rows
      if (needs.has('fields')) {
        const p = claim(nearWater(k, free(12, 30), () => free(12, 30)), 24);
        k.fields([p[0], p[1], 20, 14, j(0.6)], j(0.6));
        k.resource('food', p, 9, 16);
        if (!hasWater(k, p, 30)) k.waterBody([p[0] + 22, p[1], 5, 4, 0], { deep: false, beach: 1 });
      }
      if (needs.has('olives')) {
        const p = claim(free(16, 34), 24);
        k.rows(E(['olive-orchard', 'olive-orchard', 'olive-tall', 'olive-ancient']), [p[0], p[1], 22, 14, j(0.6)], { dx: 3, dy: 3 });
        k.spot('olives', p);
      }
      // ---- resources: the scarce ones on a knoll (silver, salt: no node art, a spot); the rest round a spot
      for (const f of fields) {
        if (w.relief !== 'canyon') k.hill([f.p[0], f.p[1], 12, 10, j(1)], Math.min(6, base + 1), 3, 1);
        if (f.res === 'silver' || f.res === 'salt') {
          k.paint(f.res === 'salt' ? 'sand' : 'dirt', [f.p[0], f.p[1], 8, 6, 0], { on: ['grass', 'forest', 'dirt'] });
          k.piece(f.res === 'salt' ? 'boulder-b' : 'mountains/cairn', f.p, { r: 6, n: 2 });
        } else k.resource(f.res as 'tin', f.p, Math.max(3, w.resources[f.res] * 2 + 1), 10);
        k.spot(f.res, f.p);
      }
      for (const o of others) { k.resource(o.res as 'tin', o.p, o.n * 2, 14); k.spot(o.res, o.p); }
      // ---- fauna (the lair beast on the richest scarce node)
      for (const l of lairAt) k.lair(l.f.kind, l.p, { as: l.f.as, ...(l.f.lair ? { count: 10 } : {}) });
      if (w.role !== 'home') k.claim(hub, 200);
    },
  };
}

const pt = (p: { x: number; y: number }): Pt => [p.x, p.y];
const byRole = (id: string) => WORLD.find((w) => w.id === id)?.role;
/** Whether there is open water within r units of p. */
function hasWater(k: Kit, p: Pt, r: number) {
  for (let y = p[1] - r; y <= p[1] + r; y += 2) for (let x = p[0] - r; x <= p[0] + r; x += 2) { const i = k.at([x, y]); if (i >= 0 && k.water[i] && Math.hypot(x - p[0], y - p[1]) <= r) return true; }
  return false;
}
/** Of a few candidate points, the first with water within 30 units (else the first). */
function nearWater(k: Kit, first: Pt, next: () => Pt): Pt {
  let p = first;
  for (let n = 0; n < 12 && !hasWater(k, p, 30); n++) p = next();
  return hasWater(k, p, 30) ? p : first;
}

const HAND = new Set(['elaia', 'kyrene', 'dodona', 'skythia', 'kleisoura', 'omphalos', 'stymphalia', 'achelous', 'ammos', 'krios', 'gorge']);
export const DRAFTS: RegionDef[] = WORLD.filter((w) => !HAND.has(w.id)).map(template);
