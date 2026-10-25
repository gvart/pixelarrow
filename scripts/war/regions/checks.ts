/**
 * The purpose checklist (docs/WAR.md "Purpose of every region", "Authoring checklist by type") run on a built region at
 * the sim size: every must-have of its brief (./world.ts BRIEF) measured on the map, and every route leg through it
 * (./world.ts routeLegs) joined by road. scripts/war/regions/build.ts fails when one is missing.
 */
import type { Pt } from '../shapes.ts';
import { BRIEF, routeLegs, SCARCE, type Need, type WorldRegion } from './world.ts';

export interface CheckIn {
  world: WorldRegion; W: number; H: number; height: number[]; terrain: string[]; water: number[];
  walk: (i: number) => boolean; seen: Uint8Array; roadDist: Float32Array;
  /** Spots in units and the unit -> tile map. */
  spots: Record<string, Pt>; toTile: (u: number) => number;
  objects: { id: string; x: number; y: number }[]; lairs: { x: number; y: number; as?: string }[];
  entries: { x: number; y: number; w: number; h: number }[]; sides: { id: string }[];
}
export interface Check { need: string; ok: boolean; why: string }

const NODE: Record<string, RegExp> = { tin: /^mountains\/tin-ore$/, iron: /^(mountains\/iron-ore|dodona\/iron-bog)$/, copper: /^kyrene\/copper-ore$/, marble: /^elaia\/marble-(deposit|outcrop-a|outcrop-b)$/ };
const CROPS = /^(elaia\/(olive-harvest|vines|olive-orchard|wheat|barley)|kyrene\/date-palm-fruit)$/;
const OLIVES = /^(elaia\/olive-|olive-[ab]$)/;

export function runChecks(c: CheckIn): Check[] {
  const { W, H, height, terrain, water, walk, seen } = c;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x);
  const tile = (p: Pt): [number, number] => [Math.round(c.toTile(p[0])), Math.round(c.toTile(p[1]))];
  const brief = BRIEF[c.world.id], out: Check[] = [];
  const add = (need: string, ok: boolean, why: string) => out.push({ need, ok, why });
  const spot = (name: string) => (c.spots[name] ? tile(c.spots[name]) : null);
  const disk = (cx: number, cy: number, r: number, f: (i: number, x: number, y: number) => void) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) f(y * W + x, x, y);
  };
  const open = (i: number) => i >= 0 && walk(i) && seen[i] === 1;

  // the road network: road tiles and the fords on them, joined by legal steps
  const road = new Int32Array(W * H).fill(-1);
  {
    const isRoad = (i: number) => walk(i) && (terrain[i] === 'road' || (water[i] === 1 && c.roadDist[i] <= 2.4));
    let label = 0;
    const q = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (road[s] >= 0 || !isRoad(s)) continue;
      let qh = 0, qt = 0;
      q[qt++] = s; road[s] = label;
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = at(x + dx, y + dy);
          if (j < 0 || road[j] >= 0 || !isRoad(j) || Math.abs(height[j] - height[i]) >= 2) continue;
          road[j] = label; q[qt++] = j;
        }
      }
      label++;
    }
  }
  const labelsIn = (f: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number) => {
    const s = new Set<number>();
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) if (road[y * W + x] >= 0 && f(x, y)) s.add(road[y * W + x]);
    return s;
  };
  const entryLabels = (id: string) => {
    const n = c.sides.findIndex((s) => s.id === id), e = c.entries[n];
    return labelsIn(() => true, e.x, e.y, e.x + e.w, e.y + e.h);
  };
  const nearLabels = (p: [number, number], r: number) => labelsIn((x, y) => (x - p[0]) ** 2 + (y - p[1]) ** 2 <= r * r, p[0] - r, p[1] - r, p[0] + r + 1, p[1] + r + 1);
  const exitLabels = new Set(c.sides.flatMap((s) => [...entryLabels(s.id)]));

  // route legs
  for (const leg of routeLegs(c.world.id)) {
    const end = (e: string) => (e === 'market' ? (spot('market') ? nearLabels(spot('market')!, 20) : new Set<number>()) : entryLabels(e));
    const A = end(leg.a), B = end(leg.b), ok = [...A].some((l) => B.has(l));
    add(`road ${leg.a}-${leg.b}`, ok, `${leg.route}: ${ok ? 'joined by road' : `no road from ${leg.a} to ${leg.b}`}`);
  }

  const lairNear = (p: [number, number], r: number) => c.lairs.some((l) => Math.hypot(l.x - p[0], l.y - p[1]) <= r);
  const narrowsH = () => { const n = spot('narrows'); return n ? height[at(n[0], n[1])] : NaN; };
  for (const need of brief.needs as Need[]) {
    if (need === 'square') {
      const p = spot('market');
      if (!p) { add(need, false, 'no spot market'); continue; }
      let hi = -1, lo = 9, bad = 0, n = 0, paved = 0;
      for (let y = p[1] - 12; y < p[1] + 12; y++) for (let x = p[0] - 12; x < p[0] + 12; x++) {
        const i = at(x, y);
        n++;
        if (i < 0 || water[i] || terrain[i] === 'rock') { bad++; continue; }
        if (terrain[i] === 'dirt' || terrain[i] === 'road') paved++;
        if (!walk(i)) { bad++; continue; }
        hi = Math.max(hi, height[i]); lo = Math.min(lo, height[i]);
      }
      const ok = hi - lo <= 1 && bad <= n * 0.15 && paved >= n * 0.6 && nearLabels(p, 20).size > 0;
      add(need, ok, `24 x 24 at market: levels ${lo}-${hi}, ${bad} closed, ${paved} paved tiles, road ${nearLabels(p, 20).size > 0}`);
    } else if (need === 'narrows') {
      const p = spot('narrows');
      if (!p || !open(at(p[0], p[1]))) { add(need, false, 'no open spot narrows'); continue; }
      // the passage width: the shortest of 4 lines through it (each way until a closed tile or a 2+ step)
      const ray = (dx: number, dy: number) => {
        let x = p[0], y = p[1], d = 0;
        for (let k = 0; k < 60; k++) {
          const i = at(x, y), j = at(x + dx, y + dy);
          if (j < 0 || !walk(j) || Math.abs(height[j] - height[i]) >= 2) break;
          x += dx; y += dy; d += Math.hypot(dx, dy);
        }
        return d;
      };
      const wid = Math.min(...[[1, 0], [0, 1], [1, 1], [1, -1]].map(([dx, dy]) => ray(dx, dy) + ray(-dx, -dy) + 1));
      add(need, wid <= 10.5, `passage ${wid.toFixed(1)} tiles wide`);
    } else if (need === 'highGround') {
      const p = spot('narrows') ?? spot('highGround'), h0 = narrowsH();
      let best = -1;
      if (p) disk(p[0], p[1], 36, (i) => { if (open(i)) best = Math.max(best, height[i]); });
      add(need, best >= h0 + 2, `highest open ground near the narrows h${best} over h${h0}`);
    } else if (need === 'bridgeSite') {
      const n = Object.keys(c.spots).filter((s) => /Narrows\d*$/.test(s));
      add(need, n.length > 0, n.length ? `bridgeable narrows ${n.join(', ')}` : 'no river narrows');
    } else if (need === 'nodes') {
      const kinds = SCARCE.filter((k) => c.world.resources[k]);
      const richest = kinds.slice().sort((a, b) => c.world.resources[b] - c.world.resources[a])[0];
      const why: string[] = [];
      let ok = kinds.length > 0;
      for (const k of kinds) {
        let pts: [number, number][];
        if (NODE[k]) pts = c.objects.filter((o) => NODE[k].test(o.id)).map((o) => [o.x, o.y]);
        else pts = spot(k) ? [spot(k)!] : [];
        const min = NODE[k] ? 2 : 1;
        if (pts.length < min) { ok = false; why.push(`${k}: ${pts.length} nodes`); continue; }
        const haul = pts.some((q) => [...nearLabels([Math.round(q[0]), Math.round(q[1])], 30)].some((l) => exitLabels.has(l)));
        const lair = c.world.fauna.length === 0 || k !== richest || pts.some((q) => lairNear(q, 44));
        if (!haul || !lair) ok = false;
        why.push(`${k}: ${pts.length} nodes${haul ? ', haul road' : ', NO haul road'}${k === richest && c.world.fauna.length ? (lair ? ', lair by it' : ', NO lair by it') : ''}`);
      }
      add(need, ok, why.join('; ') || 'no scarce goods');
    } else if (need === 'fields' || need === 'olives') {
      const p = spot(need);
      if (!p) { add(need, false, `no spot ${need}`); continue; }
      const re = need === 'fields' ? CROPS : OLIVES;
      const crops = c.objects.filter((o) => re.test(o.id) && Math.hypot(o.x - p[0], o.y - p[1]) <= 44).length;
      let furrows = 0, wet = false;
      disk(p[0], p[1], 44, (i) => { if (terrain[i] === 'dirt' && !water[i]) furrows++; });
      disk(p[0], p[1], 70, (i) => { if (water[i]) wet = true; });
      const ok = need === 'olives' ? crops >= 12 : (crops >= 8 || furrows >= 300) && wet;
      add(need, ok, `${crops} ${need === 'olives' ? 'olive trees' : 'crops'}, ${furrows} furrow tiles${need === 'fields' ? `, water ${wet}` : ''}`);
    } else if (need === 'ridge') {
      const p = spot('ridge');
      if (!p) { add(need, false, 'no spot ridge'); continue; }
      let lo = 9;
      disk(p[0], p[1], 50, (i) => { if (open(i)) lo = Math.min(lo, height[i]); });
      let n = 0;
      disk(p[0], p[1], 40, (i) => { if (open(i) && height[i] >= lo + 2) n++; });
      add(need, n >= 300, `${n} open tiles 2+ levels over the land (h${lo})`);
    } else if (need === 'fortress') {
      const p = spot('fortress');
      if (!p || !open(at(p[0], p[1]))) { add(need, false, 'no open spot fortress'); continue; }
      const i0 = at(p[0], p[1]), h = height[i0], top = new Uint8Array(W * H), q = [i0];
      top[i0] = 1;
      const way = new Uint8Array(W * H);
      let area = 0;
      while (q.length) {
        const i = q.pop()!, x = i % W, y = (i / W) | 0;
        area++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = at(x + dx, y + dy);
          if (j < 0 || top[j] || !walk(j)) continue;
          if (height[j] === h) { top[j] = 1; q.push(j); } else if (height[j] === h - 1 && !water[j]) way[j] = 1;
        }
      }
      // ways up: clusters of the tiles one level under the rim (tiles within 4 join one cluster) that lead down off it
      const down = (s: number) => {
        const seenD = new Map<number, number>([[s, 0]]), st = [s];
        while (st.length) {
          const i = st.shift()!, x = i % W, y = (i / W) | 0, dd = seenD.get(i)!;
          if (height[i] <= h - 3) return true;
          if (dd > 60) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = at(x + dx, y + dy);
            if (j < 0 || top[j] || seenD.has(j) || !walk(j) || Math.abs(height[j] - height[i]) >= 2) continue;
            seenD.set(j, dd + 1); st.push(j);
          }
        }
        return false;
      };
      let ways = 0;
      const done = new Uint8Array(W * H);
      for (let s = 0; s < W * H; s++) {
        if (!way[s] || done[s]) continue;
        if (down(s)) ways++;
        const st = [s];
        done[s] = 1;
        while (st.length) {
          const i = st.pop()!, x = i % W, y = (i / W) | 0;
          for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const j = at(x + dx, y + dy); if (j >= 0 && way[j] && !done[j]) { done[j] = 1; st.push(j); } }
        }
      }
      const max = brief.ways ?? 2, exact = max === 4;
      add(need, area >= 900 && ways >= 1 && (exact ? ways === max : ways <= max), `top h${h} of ${area} tiles, ${ways} ways up (${exact ? '=' : '<='} ${max})`);
    } else if (need === 'beach') {
      let n = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (terrain[i] === 'sand' && !water[i] && open(i) && (water[i - 1] || water[i + 1] || water[i - W] || water[i + W])) n++;
      }
      add(need, n >= 80, `${n} beach tiles on the water`);
    } else if (need === 'lookouts') {
      const ms = Object.keys(c.spots).filter((s) => /^lookout/.test(s)).filter((s) => {
        const p = spot(s)!, h = height[at(p[0], p[1])];
        let lo = 9;
        disk(p[0], p[1], 16, (i, x, y) => { if ((x - p[0]) ** 2 + (y - p[1]) ** 2 >= 196 && walk(i)) lo = Math.min(lo, height[i]); });
        return open(at(p[0], p[1])) && h >= lo + 1;
      });
      add(need, ms.length >= 3, `${ms.length} lookout mounds`);
    }
  }
  return out;
}


/**
 * Water levels on the drawn (visual) layer: a water surface is level within a stretch (a step between water cells only
 * at a marked fall), and no bank is lower than the water beside it. Returns the defect counts and their first cells.
 */
export function waterChecks(W: number, H: number, z: ArrayLike<number>, wet: (i: number) => boolean, fall: ArrayLike<number>) {
  let steps = 0, banks = 0;
  const at: [number, number, string][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!wet(i)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (z[j] >= z[i]) continue;
      if (wet(j)) { if (fall[i] || fall[j]) continue; steps++; if (at.length < 4000) at.push([x, y, 'step']); }
      else { banks++; if (at.length < 4000) at.push([x, y, 'bank']); }
    }
  }
  return { steps, banks, at };
}

// shared borders line up (build.ts runs it over all 37 built regions; tests/war/worldRegions.test.ts too)
export { mirrorChecks, type Borders } from '../../../src/war/region/borders.ts';
