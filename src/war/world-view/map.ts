/**
 * The world map canvas (public/war/world/, regions.json "note" for the layers): base art, ownership tints, borders,
 * trade routes, highlights, labels, markers and squads, under a pan / zoom camera. Map px are base.jpg's (2048 x 1536);
 * the region under a point comes from region-ids.png (half size, red = 1-based index in `order`).
 */
import { ALLIANCES } from '../world/alliances';
import type { RegionState, TransitSnap } from '../net/world';
import { TRADE_ROUTES, MARKET_TOWNS, isChokepoint } from './geo';

type Box = [number, number, number, number];
interface PlacedLabel { id: string; lines: string[]; size: number; x: number; y: number; w: number; h: number; big: boolean; leader: [number, number] | null }

export const ART = 'war/world/';

export interface RegionArt {
  name: string;
  role: string;
  polygon: [number, number][];
  centroid: [number, number];
  label: [number, number];
  labelRoom: number;
  crossings: Record<string, [number, number]>;
}
export interface WorldArt {
  size: [number, number];
  alliances: Record<string, { name: string; color: string }>;
  order: string[];
  regions: Record<string, RegionArt>;
}

/** What the map draws this frame. */
export interface MapState {
  regions: Map<string, RegionState>;
  transit: TransitSnap[];
  /** Region id -> the player's men there. */
  squads: Map<string, number>;
  you: number | null;
  hover: string | null;
  selected: string | null;
  /** The selected squad's region: its neighbours light up. */
  squadAt: string | null;
  targets: Set<string>;
  routes: boolean;
  now: number;
}

const img = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src)); i.src = src; });

/** '#rrggbb' at alpha a. */
const hexA = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Who contests a region: the strongest alliance there other than its owner (-1: none known). */
function contender(r: RegionState): number {
  let best = -1;
  r.live.forEach((n, a) => { if (n > 0 && a !== r.owner && (best < 0 || n > r.live[best])) best = a; });
  return best;
}

/** A tileable fog texture: periodic value noise, three octaves, white with alpha. */
function fogTexture(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!, im = g.createImageData(w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const octave = (n: number) => {
    const m = n * Math.round((n * h) / w) || n, lat = Array.from({ length: n * m }, rnd);
    return (x: number, y: number) => {
      const fx = (x / w) * n, fy = (y / h) * m, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (i: number, j: number) => lat[((j % m) + m) % m * n + (((i % n) + n) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const o = [octave(4), octave(8), octave(16)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = o[0](x, y) * 0.55 + o[1](x, y) * 0.3 + o[2](x, y) * 0.15, i = (y * w + x) * 4;
    im.data[i] = 214; im.data[i + 1] = 210; im.data[i + 2] = 226;
    im.data[i + 3] = Math.max(0, Math.min(255, (v - 0.42) * 2.4 * 255));
  }
  g.putImageData(im, 0, 0);
  return c;
}

/** An alliance's colour on the world map (the art's palette, regions.json). */
export function allianceColor(art: WorldArt, a: number): string {
  return art.alliances[ALLIANCES[a]?.key]?.color ?? '#888';
}

export class WorldMap {
  readonly ctx: CanvasRenderingContext2D;
  /** Camera: map px at the canvas's top-left, CSS px per map px. */
  x = 0;
  y = 0;
  k = 0.5;
  private ids: Uint8ClampedArray = new Uint8ClampedArray(0);
  private paths = new Map<string, Path2D>();
  private pics: Record<string, HTMLImageElement> = {};
  private sea = '#17151d'; // the Abyss beyond the painting

  private constructor(readonly canvas: HTMLCanvasElement, readonly art: WorldArt) {
    this.ctx = canvas.getContext('2d')!;
    for (const [id, r] of Object.entries(art.regions)) {
      const p = new Path2D();
      r.polygon.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
      this.paths.set(id, p);
    }
  }

  static async load(canvas: HTMLCanvasElement): Promise<WorldMap> {
    const art = (await (await fetch(`${ART}regions.json`)).json()) as WorldArt;
    const m = new WorldMap(canvas, art);
    const names = ['base', 'base@2x', 'borders', 'borders@2x', 'region-ids', 'markers/battle', 'markers/fort', 'markers/transit', ...ALLIANCES.map((a) => `banners/${a.key}`)];
    const got = await Promise.all(names.map((n) => img(`${ART}${n}.${n.startsWith('base') ? 'jpg' : 'png'}`)));
    names.forEach((n, i) => (m.pics[n] = got[i]));
    const ids = got[names.indexOf('region-ids')], c = document.createElement('canvas');
    c.width = ids.width;
    c.height = ids.height;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(ids, 0, 0);
    m.ids = cx.getImageData(0, 0, c.width, c.height).data;
    // the Abyss mist: a drifting fog that only lives off the land (region-ids 0), feathered at the shore
    const mw = c.width >> 1, mh = c.height >> 1, mask = document.createElement('canvas');
    mask.width = mw;
    mask.height = mh;
    const mx = mask.getContext('2d')!, mi = mx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) mi.data[(y * mw + x) * 4 + 3] = m.ids[(y * 2 * c.width + x * 2) * 4] ? 0 : 255;
    mx.putImageData(mi, 0, 0);
    const soft = document.createElement('canvas');
    soft.width = mw;
    soft.height = mh;
    const sx = soft.getContext('2d')!;
    sx.filter = 'blur(6px)';
    sx.drawImage(mask, 0, 0);
    sx.filter = 'none';
    sx.globalCompositeOperation = 'destination-in'; // keep the blur from bleeding onto the land
    sx.drawImage(mask, 0, 0);
    m.voidMask = soft;
    m.fog = fogTexture(mw, mh);
    m.mist = document.createElement('canvas');
    m.mist.width = mw;
    m.mist.height = mh;
    return m;
  }

  private fog?: HTMLCanvasElement;
  private mist?: HTMLCanvasElement;
  private voidMask?: HTMLCanvasElement;

  /** Two fog layers drifting against each other over the Abyss (W-42), slow enough to read as weather. */
  private drawMist(g: CanvasRenderingContext2D, now: number): void {
    const fog = this.fog, mist = this.mist, mask = this.voidMask;
    if (!fog || !mist || !mask) return;
    const x = mist.getContext('2d')!, w = mist.width, h = mist.height, [W, H] = this.art.size;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, w, h);
    const layer = (dx: number, dy: number, a: number) => {
      const ox = ((dx % w) + w) % w, oy = ((dy % h) + h) % h;
      x.globalAlpha = a;
      for (const [px, py] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) x.drawImage(fog, ox + px, oy + py);
    };
    layer(now / 260, now / 900, 0.7);
    layer(-now / 380, now / 1500 + h / 3, 0.5);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mask, 0, 0);
    g.globalAlpha = 0.3;
    g.drawImage(mist, 0, 0, W, H);
    g.globalAlpha = 1;
  }

  /** The region at map px (x, y), or null for the sea. */
  regionAt(x: number, y: number): string | null {
    const w = this.pics['region-ids'].width, h = this.pics['region-ids'].height, s = w / this.art.size[0];
    const ix = Math.floor(x * s), iy = Math.floor(y * s);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return null;
    const n = this.ids[(iy * w + ix) * 4];
    return n ? (this.art.order[n - 1] ?? null) : null;
  }

  toMap(cx: number, cy: number): [number, number] {
    return [this.x + cx / this.k, this.y + cy / this.k];
  }
  toScreen(mx: number, my: number): [number, number] {
    return [(mx - this.x) * this.k, (my - this.y) * this.k];
  }

  /** Fit the whole map into the canvas less the CSS px kept free for panels on each side. */
  fit(free: { top: number; left: number; right: number; bottom: number }): void {
    const w = this.canvas.clientWidth - free.left - free.right, h = this.canvas.clientHeight - free.top - free.bottom, [W, H] = this.art.size;
    this.k = Math.min(w / W, h / H);
    this.x = -free.left / this.k - (w / this.k - W) / 2;
    this.y = -free.top / this.k - (h / this.k - H) / 2;
  }

  /** Zoom by `f` about canvas point (cx, cy). */
  zoom(f: number, cx: number, cy: number): void {
    const [mx, my] = this.toMap(cx, cy);
    this.k = Math.max(0.2, Math.min(3, this.k * f));
    this.x = mx - cx / this.k;
    this.y = my - cy / this.k;
  }

  /** Where a squad on the road is now: from's centre to the crossing to to's centre, by time. */
  transitPos(t: TransitSnap, now: number): [number, number] {
    const a = this.art.regions[t.from], b = this.art.regions[t.to];
    if (!a || !b) return [0, 0];
    const c = a.crossings[t.to] ?? b.crossings[t.from] ?? [(a.centroid[0] + b.centroid[0]) / 2, (a.centroid[1] + b.centroid[1]) / 2];
    const f = t.state === 'queued' ? 1 : Math.max(0, Math.min(1, (now - t.departAt) / Math.max(1, t.arriveAt - t.departAt)));
    // queued: waiting on the border, just inside the target
    const pts = [a.centroid, c, b.centroid], d1 = Math.hypot(c[0] - a.centroid[0], c[1] - a.centroid[1]), d2 = Math.hypot(b.centroid[0] - c[0], b.centroid[1] - c[1]);
    if (t.state === 'queued') return [c[0] + (b.centroid[0] - c[0]) * 0.18, c[1] + (b.centroid[1] - c[1]) * 0.18];
    let s = f * (d1 + d2);
    if (s <= d1) return [pts[0][0] + ((pts[1][0] - pts[0][0]) * s) / d1, pts[0][1] + ((pts[1][1] - pts[0][1]) * s) / d1];
    s -= d1;
    return [pts[1][0] + ((pts[2][0] - pts[1][0]) * s) / d2, pts[1][1] + ((pts[2][1] - pts[1][1]) * s) / d2];
  }

  draw(st: MapState): void {
    const c = this.canvas, dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) (c.width = Math.round(w * dpr)), (c.height = Math.round(h * dpr));
    const g = this.ctx, [W, H] = this.art.size;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = this.sea;
    g.fillRect(0, 0, w, h);
    g.setTransform(dpr * this.k, 0, 0, dpr * this.k, -this.x * this.k * dpr, -this.y * this.k * dpr);
    const hi = this.k * dpr > 1.05;
    g.imageSmoothingEnabled = true; // the base is a painting, not pixel art
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.pics[hi ? 'base@2x' : 'base'], 0, 0, W, H);
    this.drawMist(g, st.now);
    // the painting's edge dissolves into the Abyss round the canvas
    const F = 150;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, F, 0, -2, -2, F, H + 4], [W, 0, W - F, 0, W - F, -2, F + 2, H + 4], [0, 0, 0, F, -2, -2, W + 4, F], [0, H, 0, H - F, -2, H - F, W + 4, F + 2]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, this.sea);
      gr.addColorStop(1, 'rgba(23,21,29,0)');
      g.fillStyle = gr;
      g.fillRect(rx, ry, rw, rh);
    }

    // region washes (W-43): neutral grey, owned in the owner's colour, contested hatched with the contender's
    for (const [id, p] of this.paths) {
      const r = st.regions.get(id);
      if (!r) continue;
      g.fillStyle = r.owner < 0 ? 'rgba(120,120,128,.26)' : hexA(allianceColor(this.art, r.owner), 0.32);
      g.fill(p);
      if (r.owner >= 0) { // the owner's edge: a band of his colour just inside the border
        g.save();
        g.clip(p);
        g.strokeStyle = hexA(allianceColor(this.art, r.owner), 0.75);
        g.lineWidth = 9;
        g.stroke(p);
        g.restore();
      }
      if (!r.contested && !r.besieged) continue;
      const foe = contender(r);
      g.save();
      g.clip(p);
      g.strokeStyle = foe < 0 ? 'rgba(240,138,112,.55)' : hexA(allianceColor(this.art, foe), 0.62);
      g.lineWidth = 7;
      for (let x = -H; x < W; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
      g.restore();
    }
    g.drawImage(this.pics[hi ? 'borders@2x' : 'borders'], 0, 0, W, H);

    // the selected squad's neighbours, the selected region, the hovered one
    const pulse = 0.55 + 0.45 * Math.sin(st.now / 220);
    for (const id of st.targets) {
      const p = this.paths.get(id)!;
      g.fillStyle = `rgba(242,178,122,${0.18 + 0.12 * pulse})`;
      g.fill(p);
      g.strokeStyle = '#f2b27a';
      g.lineWidth = 4 / Math.max(this.k, 0.4);
      g.setLineDash([12, 8]);
      g.stroke(p);
      g.setLineDash([]);
    }
    for (const [id, col, lw] of [[st.selected, '#fff0d8', 4], [st.hover, '#f0d9b5', 2.5]] as const) {
      const p = id && this.paths.get(id);
      if (!p) continue;
      g.fillStyle = 'rgba(255,240,216,.12)';
      g.fill(p);
      g.strokeStyle = col;
      g.lineWidth = lw / Math.max(this.k, 0.4);
      g.stroke(p);
    }

    if (st.routes) this.drawRoutes(g);
    this.drawLabels(g, st);
    this.drawMarkers(g, st);
  }

  private routePoints(path: string[]): [number, number][] {
    const out: [number, number][] = [];
    path.forEach((id, i) => {
      const r = this.art.regions[id];
      out.push(r.centroid);
      const next = path[i + 1];
      if (next && r.crossings[next]) out.push(r.crossings[next]);
    });
    return out;
  }

  private drawRoutes(g: CanvasRenderingContext2D): void {
    g.save();
    g.lineCap = 'round';
    for (const [i, rt] of TRADE_ROUTES.entries()) {
      const pts = this.routePoints(rt.path), sacred = rt.name.startsWith('Sacred');
      const off = sacred ? (i === 4 ? -5 : 5) : 0; // the two arms share a stretch round Omphalos
      const line = () => { g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x + off, y + off) : g.moveTo(x + off, y + off))); };
      line();
      g.strokeStyle = 'rgba(14,9,7,.7)';
      g.lineWidth = 7;
      g.setLineDash([]);
      g.stroke();
      line();
      g.strokeStyle = sacred ? '#e0b867' : '#f0d9b5';
      g.lineWidth = 3.5;
      g.setLineDash(sacred ? [4, 9] : [16, 10]);
      g.stroke();
    }
    g.restore();
  }

  /** Marker spots in map px (x, y, w, h): a siege fort or battle sword right of the region's centre, the player's
   *  banner left of it. Labels are laid out round these (never under them). */
  private markerSpots(st: MapState): { marks: [string, string, number, number, number, number][]; banners: Map<string, [number, number, number]> } {
    const s = Math.max(1, 0.8 / this.k), marks: [string, string, number, number, number, number][] = [], banners = new Map<string, [number, number, number]>();
    for (const [id, r] of Object.entries(this.art.regions)) {
      const rs = st.regions.get(id);
      if (!rs) continue;
      const [cx, cy] = r.centroid;
      if (rs.besieged) marks.push([id, 'markers/fort', cx + 6 * s, cy - 24 * s, 48 * s, 48 * s]);
      else if (rs.contested) marks.push([id, 'markers/battle', cx + 4 * s, cy - 28 * s, 56 * s, 56 * s]);
    }
    const b = s * 0.7;
    for (const id of st.squads.keys()) {
      const r = this.art.regions[id];
      if (r) banners.set(id, [r.centroid[0] - 44 * b, r.centroid[1] - 28 * b, b]);
    }
    return { marks, banners };
  }

  private labelCache?: { key: string; out: PlacedLabel[] };

  /** Collision-free names for this zoom. Order: homes and Omphalos, then market towns and chokepoints, then the rest
   *  (small regions first within a tier). Each name tries, until one overlaps no placed name and no marker: spots well
   *  inside its region round its anchor (one or two lines, full size then smaller), then spots whose row only has to
   *  stay inside, then (homes, market towns, chokepoints) a spot just outside with a leader line to the anchor. A home
   *  or Omphalos that still finds nothing keeps its least-crowded spot; any other name is left out at this zoom. */
  private layoutLabels(g: CanvasRenderingContext2D, st: MapState): PlacedLabel[] {
    const spots = this.markerSpots(st), base = Math.max(14, 13 / this.k), s = Math.max(1, 0.8 / this.k);
    const obstacles: Box[] = [
      ...spots.marks.map(([, , x, y, w, h]) => [x, y, x + w, y + h] as Box),
      ...[...spots.banners].map(([id, [x, y, b]]) => [x, y, x + 38 * b + (8 * String(st.squads.get(id)).length + 10) * s, y + 56 * b] as Box),
      // squads on the road, snapped to a coarse step so the names re-flow now and then, not every frame
      ...st.transit.map((t) => {
        const q = 32 * s, [x, y] = this.transitPos(t, st.now).map((v) => Math.round(v / q) * q);
        return [x - 20 * s - q / 2, y - 43 * s - q / 2, x + 18 * s + (8 * (String(t.men).length + 10) + 10) * s + q / 2, y + 8 * s + q / 2] as Box;
      }),
    ];
    const key = `${this.k.toFixed(3)}|${obstacles.map((o) => o.map(Math.round).join(',')).join(';')}`;
    if (this.labelCache?.key === key) return this.labelCache.out;
    const tier = (id: string, r: RegionArt) => (r.role === 'home' || r.role === 'center' ? 0 : MARKET_TOWNS.has(id) || isChokepoint(id) ? 1 : 2);
    const order = Object.entries(this.art.regions).sort(([a, ra], [b, rb]) => tier(a, ra) - tier(b, rb) || (this.regionArea(a) - this.regionArea(b)));
    const placed: Box[] = [...obstacles], out: PlacedLabel[] = [];
    const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const pad = base * 0.12; // breathing room between names
    for (const [id, r] of order) {
      const t = tier(id, r), big = t === 0;
      if (!big && this.k < 0.32) continue;
      const text = big ? r.name.toUpperCase() : r.name, words = text.split(' ');
      const variants: [string[], number, number, number][] = []; // lines, size, w, h
      for (const f of big ? [1.45, 1.25, 1.1, 0.95] : [1, 0.86, 0.74]) {
        const sets = [[text]];
        if (words.length > 1) { const h = Math.ceil(words.length / 2); sets.push([words.slice(0, h).join(' '), words.slice(h).join(' ')]); }
        const size = base * f;
        g.font = `700 ${size}px Cinzel, serif`;
        for (const lines of sets) variants.push([lines, size, Math.max(...lines.map((l) => g.measureText(l).width)) + size * 0.3, lines.length * size * 1.05 + size * 0.15]);
      }
      let best: PlacedLabel | null = null, bestCost = Infinity;
      const costAt = (w: number, h: number, x: number, y: number) => {
        const box: Box = [x - w / 2 - pad, y - h / 2 - pad, x + w / 2 + pad, y + h / 2 + pad];
        return placed.reduce((c, b) => c + overlap(box, b), 0);
      };
      search: for (const strict of [true, false]) for (const [lines, size, w, h] of variants) for (const [x, y] of this.labelSpots(r, w, h)) {
        if (!this.fits(id, x, y, w, h, strict)) continue;
        const c = costAt(w, h, x, y);
        if (c < bestCost) { bestCost = c; best = { id, lines, size, x, y, w, h, big, leader: null }; }
        if (c === 0) break search;
      }
      if (bestCost > 0 && t <= 1) {
        // just outside, with a leader line: rings round the anchor, smallest variant first; only a free spot counts
        leader: for (const [lines, size, w, h] of [...variants].reverse()) for (let ring = 1; ring <= 3; ring++)
          for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]) {
            const x = r.label[0] + dx * (w / 2 + base * 0.9 * ring), y = r.label[1] + dy * (h / 2 + base * 0.9 * ring);
            if (costAt(w, h, x, y) === 0) { bestCost = 0; best = { id, lines, size, x, y, w, h, big, leader: r.label }; break leader; }
          }
      }
      if (!best || (bestCost > 0 && !big)) continue;
      const b: PlacedLabel = best;
      placed.push([b.x - b.w / 2 - pad, b.y - b.h / 2 - pad, b.x + b.w / 2 + pad, b.y + b.h / 2 + pad]);
      out.push(b);
    }
    this.labelCache = { key, out };
    return out;
  }

  private areas = new Map<string, number>();
  private regionArea(id: string): number {
    let a = this.areas.get(id);
    if (a === undefined) {
      const p = this.art.regions[id].polygon;
      a = Math.abs(p.reduce((s, [x, y], i) => { const [nx, ny] = p[(i + 1) % p.length]; return s + x * ny - nx * y; }, 0)) / 2;
      this.areas.set(id, a);
    }
    return a;
  }

  /** Candidate centres for a w x h name: the anchor first, then rings round it, then the centroid. */
  private labelSpots(r: RegionArt, w: number, h: number): [number, number][] {
    const [ax, ay] = r.label, out: [number, number][] = [[ax, ay]];
    for (let ring = 1; ring <= 4; ring++) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]])
      out.push([ax + dx * ring * w * 0.18, ay + dy * ring * h * 0.6]);
    out.push(r.centroid);
    return out;
  }

  /** The name lies inside its own region: strict, its centre, both row ends and the four inner corners; loose, the
   *  row only. */
  private fits(id: string, x: number, y: number, w: number, h: number, strict: boolean): boolean {
    const pts: [number, number][] = [[x, y], [x - w * 0.42, y], [x + w * 0.42, y]];
    if (strict) pts.push([x - w * 0.3, y - h * 0.3], [x + w * 0.3, y + h * 0.3], [x - w * 0.3, y + h * 0.3], [x + w * 0.3, y - h * 0.3]);
    return pts.every(([px, py]) => this.regionAt(px, py) === id);
  }

  /** Atlas lettering: cream Cinzel with a dark ink halo, homes and Omphalos larger in capitals (layoutLabels). */
  private drawLabels(g: CanvasRenderingContext2D, st: MapState): void {
    const labels = this.layoutLabels(g, st);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const { id, lines, size, x, y, w, h, big, leader } of labels) {
      if (leader) { // a name set outside its region points at it: a thin ink line from the box edge, a dot at the anchor
        const [lx, ly] = leader, f = Math.min(Math.abs(w / 2 / (lx - x || 1e-6)), Math.abs(h / 2 / (ly - y || 1e-6)), 1);
        g.beginPath();
        g.moveTo(x + (lx - x) * f, y + (ly - y) * f);
        g.lineTo(lx, ly);
        g.strokeStyle = 'rgba(16,10,8,.85)';
        g.lineWidth = size * 0.22;
        g.stroke();
        g.strokeStyle = '#efe0c2';
        g.lineWidth = size * 0.08;
        g.stroke();
        g.beginPath();
        g.arc(lx, ly, size * 0.16, 0, Math.PI * 2);
        g.fillStyle = '#efe0c2';
        g.fill();
      }
      g.font = `700 ${size}px Cinzel, serif`;
      const on = id === st.hover || id === st.selected;
      lines.forEach((line, k) => {
        const ly = y + (k - (lines.length - 1) / 2) * size * 1.05;
        g.strokeStyle = 'rgba(16,10,8,.88)';
        g.lineWidth = size * 0.28;
        g.strokeText(line, x, ly);
        g.fillStyle = on ? '#fff6e4' : big ? '#f2c48a' : '#efe0c2';
        g.fillText(line, x, ly);
      });
    }
  }

  private drawMarkers(g: CanvasRenderingContext2D, st: MapState): void {
    const s = Math.max(1, 0.8 / this.k), pic = (n: string) => this.pics[n], spots = this.markerSpots(st);
    g.imageSmoothingEnabled = false;
    for (const [, name, x, y, w, h] of spots.marks) g.drawImage(pic(name), x, y, w, h);
    // the player's men: the alliance banner with a count
    const you = st.you ?? 0, key = ALLIANCES[you].key;
    for (const [id, men] of st.squads) {
      const spot = spots.banners.get(id);
      if (!spot) continue;
      // left of the region's centre (the battle marker sits right of it)
      const [bx, by, b] = spot, on = st.squadAt === id;
      if (on) {
        g.fillStyle = 'rgba(255,240,216,.35)';
        g.beginPath();
        g.ellipse(bx + 20 * b, by + 58 * b, 30 * b, 10 * b, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.drawImage(pic(`banners/${key}`), bx, by, 40 * b, 56 * b);
      this.badge(g, String(men), bx + 38 * b, by + 12 * b, s, on);
    }
    // on the road: the transit marker along the border with its ETA
    for (const t of st.transit) {
      const [x, y] = this.transitPos(t, st.now);
      g.drawImage(pic('markers/transit'), x - 20 * s, y - 40 * s, 40 * s, 48 * s);
      const left = Math.max(0, Math.ceil((t.arriveAt - st.now) / 1000));
      this.badge(g, t.state === 'queued' ? `${t.men} · waiting` : `${t.men} · ${clock(left)}`, x + 18 * s, y - 34 * s, s, false);
    }
  }

  private badge(g: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, on: boolean): void {
    g.font = `600 ${13 * s}px Inter, sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const w = g.measureText(text).width + 10 * s;
    g.fillStyle = on ? '#3d2414' : '#17100d';
    g.strokeStyle = on ? '#f2b27a' : '#7a3418';
    g.lineWidth = 2 * s;
    g.fillRect(x, y - 9 * s, w, 18 * s);
    g.strokeRect(x, y - 9 * s, w, 18 * s);
    g.fillStyle = '#f0d9b5';
    g.fillText(text, x + 5 * s, y + 1 * s);
  }
}

/** m:ss (or h:mm:ss). */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
