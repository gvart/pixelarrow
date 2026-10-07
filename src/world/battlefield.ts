/**
 * Battlefield generator (pure TS, seeded): turns the world-map tile where an
 * encounter happens into a terrain grid for the battle simulation — plains,
 * scrub, forest patches, hills with stepped heights, a river with a ford, a
 * beach and the sea, rocks with rough ground around them.
 *
 * The grid is stored in BattleSetup.terrain, so a battle replays (and the
 * server verifies it) without regenerating anything.
 */
import { Rng } from '../sim/rng';
import { TERRAIN, HEIGHT_RULES, type TerrainKind } from '../data/terrain';
import type { TerrainGrid } from '../sim/terrain';
import { T, inMap, isWater, type WorldMap } from './map';
import { fbm, valueNoise2 } from './noise';

export type SiteBase = 'plain' | 'scrub' | 'forest' | 'hills' | 'beach';
export const SITE_BASES: SiteBase[] = ['plain', 'scrub', 'forest', 'hills', 'beach'];

/** What the world map says about the place where a battle happens. */
export interface BattleSite {
  base: SiteBase;
  /** A river crosses the field (with a ford). */
  river: boolean;
  /** The sea lies along one flank. */
  coast: boolean;
  /** Rock outcrops (near mountains or in the hills). */
  rocky: boolean;
  /** Share of forest around the spot, 0..1 (adds copses). */
  woods: number;
}

export const SITE_NAMES: Record<SiteBase, string> = {
  plain: 'Open plain',
  scrub: 'Scrubland',
  forest: 'Woodland',
  hills: 'Hills',
  beach: 'Beach',
};

export function siteName(s: BattleSite): string {
  if (s.river) return s.base === 'forest' ? 'Wooded river ford' : s.base === 'hills' ? 'River in the hills' : 'River ford';
  if (s.coast && s.base !== 'beach') return s.base === 'hills' ? 'Coastal hills' : 'Coast';
  if (s.base === 'hills' && s.woods > 0.25) return 'Wooded hills';
  if (s.base === 'hills' && s.rocky) return 'Rocky hills';
  return SITE_NAMES[s.base];
}

/** Read the battle site from the world map around tile (x, y). */
export function siteAt(m: WorldMap, x: number, y: number): BattleSite {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const own = inMap(m, tx, ty) ? m.terrain[ty * m.w + tx] : T.grass;
  let land = 0;
  let forest = 0;
  let mountain = 0;
  let hills = 0;
  let sea = false;
  let river = false;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = tx + dx;
      const yy = ty + dy;
      if (!inMap(m, xx, yy)) continue;
      const i = yy * m.w + xx;
      const t = m.terrain[i];
      if (isWater(t)) {
        sea = true;
        continue;
      }
      land++;
      if (t === T.forest) forest++;
      if (t === T.mountain) mountain++;
      if (t === T.hills) hills++;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && m.river[i]) river = true;
    }
  }
  let base: SiteBase;
  if (own === T.beach) base = 'beach';
  else if (own === T.forest) base = 'forest';
  else if (own === T.hills || own === T.mountain) base = 'hills';
  else if (own === T.scrub) base = 'scrub';
  else base = hills >= 6 ? 'hills' : 'plain';
  return {
    base,
    river,
    coast: sea && base !== 'forest',
    rocky: mountain > 0 || (base === 'hills' && hills + mountain >= 10),
    woods: land > 0 ? forest / land : 0,
  };
}

/** A random site (skirmish battles away from the map). */
export function randomSite(rng: Rng): BattleSite {
  const base = rng.weighted<SiteBase>([['plain', 3], ['scrub', 2], ['forest', 2], ['hills', 2], ['beach', 1]]);
  return { base, river: rng.chance(0.25), coast: base === 'beach' || rng.chance(0.1), rocky: rng.chance(base === 'hills' ? 0.6 : 0.2), woods: rng.range(0, 0.4) };
}

interface Profile {
  hills: [number, number]; // min, max hill count
  peak: [number, number]; // min, max hill height
  forest: number; // target forest share
  scrub: number; // target scrub share
  rocks: [number, number]; // rock clusters
}

const PROFILES: Record<SiteBase, Profile> = {
  plain: { hills: [0, 1], peak: [1, 2], forest: 0.06, scrub: 0.06, rocks: [0, 1] },
  scrub: { hills: [0, 1], peak: [1, 2], forest: 0.05, scrub: 0.3, rocks: [0, 1] },
  forest: { hills: [0, 1], peak: [1, 2], forest: 0.28, scrub: 0.1, rocks: [0, 1] },
  hills: { hills: [2, 3], peak: [2, 3], forest: 0.08, scrub: 0.1, rocks: [1, 3] },
  beach: { hills: [0, 1], peak: [1, 1], forest: 0.02, scrub: 0.08, rocks: [0, 1] },
};

/**
 * Generate a battlefield grid of w x h cells (one per field unit). Both
 * deployment fronts are kept free of rocks so armies can always form up.
 */
export function generateBattlefield(seed: number, site: BattleSite, w = 24, h = 36): TerrainGrid {
  const rng = new Rng((seed ^ 0x6c8e9cf5) >>> 0 || 1);
  const prof = PROFILES[site.base];
  const n = w * h;
  const kind: TerrainKind[] = new Array(n).fill('open');
  const height = new Uint8Array(n);
  const s1 = (rng.next() * 1e6) | 0;
  const idx = (x: number, y: number) => y * w + x;
  // The two lines deploy around these points (see Battle.autoDeploy).
  const anchors = [{ x: w / 2, y: h * 0.62 + 3.5 }, { x: w / 2, y: h * 0.38 - 3.5 }];
  const nearAnchor = (x: number, y: number, r: number) => anchors.some((a) => Math.abs(x + 0.5 - a.x) < r * 1.4 && Math.abs(y + 0.5 - a.y) < r);

  // ---- hills: elliptical mounds with stepped heights
  const hillCount = rng.int(prof.hills[0], prof.hills[1]) + (site.rocky && site.base !== 'hills' && rng.chance(0.4) ? 1 : 0);
  for (let k = 0; k < hillCount; k++) {
    const cx = rng.range(3, w - 3);
    const cy = rng.range(5, h - 5);
    const rx = rng.range(3.5, 7);
    const ry = rng.range(3.5, 7.5);
    const peak = rng.int(prof.peak[0], prof.peak[1]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.sqrt(((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2);
        if (d >= 1.25) continue;
        const wobble = (valueNoise2(x, y, 3, s1 + k * 31) - 0.5) * 0.5;
        const v = Math.floor((1 - d + wobble) * (peak + 0.6));
        const lv = Math.max(0, Math.min(HEIGHT_RULES.maxHeight, Math.min(peak, v)));
        if (lv > height[idx(x, y)]) height[idx(x, y)] = lv;
      }
    }
  }

  // ---- forest and scrub: noise thresholded to a target share
  const forestShare = Math.min(0.4, prof.forest + site.woods * 0.12);
  const fn: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = fbm(x, y, 7, s1 + 400, 3);
      if (nearAnchor(x, y, 3)) v -= 0.12; // thinner woods where the lines form up
      fn.push(v);
    }
  }
  const thr = (vals: number[], share: number) => {
    if (share <= 0) return Infinity;
    const s = [...vals].sort((a, b) => b - a);
    return s[Math.min(s.length - 1, Math.floor(s.length * share))];
  };
  const ft = thr(fn, forestShare);
  for (let i = 0; i < n; i++) if (fn[i] > ft) kind[i] = 'forest';
  const sn: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sn.push(fbm(x + 50, y + 50, 4, s1 + 900, 2));
  const st = thr(sn, prof.scrub);
  for (let i = 0; i < n; i++) if (kind[i] === 'open' && sn[i] > st) kind[i] = 'scrub';

  // ---- rocks with rough ground around them (never on the deployment fronts)
  const clusters = rng.int(prof.rocks[0], prof.rocks[1]) + (site.rocky ? 1 : 0);
  for (let k = 0; k < clusters; k++) {
    let cx = 0;
    let cy = 0;
    let ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      cx = rng.int(1, w - 2);
      cy = rng.int(2, h - 3);
      ok = !nearAnchor(cx, cy, 5);
    }
    if (!ok) continue;
    const size = rng.int(1, 3);
    for (let j = 0; j < size; j++) {
      const x = Math.max(0, Math.min(w - 1, cx + (j === 0 ? 0 : rng.int(-1, 1))));
      const y = Math.max(0, Math.min(h - 1, cy + (j === 0 ? 0 : rng.int(-1, 1))));
      kind[idx(x, y)] = 'rocks';
    }
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || kind[idx(x, y)] === 'rocks') continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 4.5 && rng.chance(0.75)) kind[idx(x, y)] = 'rough';
      }
    }
  }

  // ---- river with a ford, across the field between the armies
  if (site.river) {
    const ry = h / 2 + rng.range(-2.5, 2.5);
    const width = rng.chance(0.3) ? 3 : 2;
    const fordW = rng.int(3, 4);
    const fordX = rng.int(3, w - 3 - fordW);
    for (let x = 0; x < w; x++) {
      const yc = ry + (valueNoise2(x, 0, 6, s1 + 77) - 0.5) * 5;
      const y0 = Math.round(yc - width / 2);
      for (let y = y0; y < y0 + width; y++) {
        if (y < 0 || y >= h) continue;
        const i = idx(x, y);
        kind[i] = x >= fordX && x < fordX + fordW ? 'ford' : 'water';
        height[i] = 0;
      }
      // low banks
      for (const y of [y0 - 1, y0 + width]) if (y >= 0 && y < h) height[idx(x, y)] = Math.min(height[idx(x, y)], 1);
    }
  }

  // ---- the sea along one flank, with a beach
  if (site.coast || site.base === 'beach') {
    const left = rng.chance(0.5);
    const seaW = site.base === 'beach' ? 3.5 : 2.5;
    const sandW = site.base === 'beach' ? 5 : 2.2;
    for (let y = 0; y < h; y++) {
      const edge = seaW + valueNoise2(0, y, 5, s1 + 123) * 1.6;
      const sand = edge + sandW + valueNoise2(3, y, 4, s1 + 321) * 1.5;
      for (let x = 0; x < w; x++) {
        const d = left ? x + 0.5 : w - x - 0.5;
        const i = idx(x, y);
        if (d < edge) {
          kind[i] = 'sea';
          height[i] = 0;
        } else if (d < sand) {
          if (kind[i] !== 'water' && kind[i] !== 'ford' && kind[i] !== 'rocks') kind[i] = 'sand';
          height[i] = Math.min(height[i], 1);
        }
      }
    }
  }

  // Never block the middle of either deployment front.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (nearAnchor(x, y, 3) && kind[idx(x, y)] === 'rocks') kind[idx(x, y)] = 'rough';

  let cells = '';
  let hs = '';
  for (let i = 0; i < n; i++) {
    cells += TERRAIN[kind[i]].code;
    hs += String(height[i]);
  }
  return { w, h, cells, height: hs, name: siteName(site) };
}
