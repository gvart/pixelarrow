/**
 * The world map canvas (public/war/world/, regions.json "note" for the layers): base art, ownership tints, borders,
 * trade routes, highlights, labels, markers and squads, under a pan / zoom camera. Map px are base.png's (2048 x 1536);
 * the region under a point comes from region-ids.png (half size, red = 1-based index in `order`).
 */
import { ALLIANCES } from '../world/alliances';
import type { RegionState, TransitSnap } from '../net/world';
import { TRADE_ROUTES } from './geo';

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
  private sea = '#1e2633';

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
    const got = await Promise.all(names.map((n) => img(`${ART}${n}.png`)));
    names.forEach((n, i) => (m.pics[n] = got[i]));
    const ids = got[names.indexOf('region-ids')], c = document.createElement('canvas');
    c.width = ids.width;
    c.height = ids.height;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(ids, 0, 0);
    m.ids = cx.getImageData(0, 0, c.width, c.height).data;
    // the canvas round the map takes the art's own sea colour
    cx.drawImage(got[0], 0, 0);
    const [r, g, b] = cx.getImageData(4, 4, 1, 1).data;
    m.sea = `rgb(${r},${g},${b})`;
    return m;
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
    g.imageSmoothingEnabled = this.k * dpr < 1;
    g.drawImage(this.pics[hi ? 'base@2x' : 'base'], 0, 0, W, H);

    // ownership tints (~35%), contested hatch
    for (const [id, p] of this.paths) {
      const r = st.regions.get(id);
      if (!r || r.owner < 0) continue;
      g.globalAlpha = 0.35;
      g.fillStyle = allianceColor(this.art, r.owner);
      g.fill(p);
    }
    g.globalAlpha = 1;
    for (const [id, p] of this.paths) {
      const r = st.regions.get(id);
      if (!r?.contested && !r?.besieged) continue;
      g.save();
      g.clip(p);
      g.strokeStyle = 'rgba(240,138,112,.45)';
      g.lineWidth = 3;
      for (let x = -H; x < W; x += 18) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
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

  private drawLabels(g: CanvasRenderingContext2D, st: MapState): void {
    const size = Math.max(14, 13 / this.k);
    g.font = `700 ${size}px Cinzel, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [id, r] of Object.entries(this.art.regions)) {
      const big = r.role === 'home' || r.role === 'center';
      if (!big && this.k < 0.32) continue;
      const [x, y] = r.label, tw = g.measureText(r.name).width;
      g.fillStyle = 'rgba(14,9,7,.72)';
      g.fillRect(x - tw / 2 - 6, y - size * 0.62, tw + 12, size * 1.24);
      g.fillStyle = id === st.hover || id === st.selected ? '#fff0d8' : big ? '#f2b27a' : '#f0d9b5';
      g.fillText(r.name, x, y + 1);
    }
  }

  private drawMarkers(g: CanvasRenderingContext2D, st: MapState): void {
    const s = Math.max(1, 0.8 / this.k), pic = (n: string) => this.pics[n];
    g.imageSmoothingEnabled = false;
    for (const [id, r] of Object.entries(this.art.regions)) {
      const rs = st.regions.get(id);
      if (!rs) continue;
      const [cx, cy] = r.centroid;
      if (rs.besieged) g.drawImage(pic('markers/fort'), cx + 30 * s, cy - 58 * s, 48 * s, 48 * s);
      else if (rs.contested) g.drawImage(pic('markers/battle'), cx + 26 * s, cy - 62 * s, 56 * s, 56 * s);
    }
    // the player's men: the alliance banner with a count
    const you = st.you ?? 0, key = ALLIANCES[you].key;
    for (const [id, men] of st.squads) {
      const r = this.art.regions[id];
      if (!r) continue;
      // under the region's name, left of its anchor
      const b = s * 0.7, [lx, ly] = r.label, bx = lx - 34 * b, by = ly + 14 * b, on = st.squadAt === id;
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
