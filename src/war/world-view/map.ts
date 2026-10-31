/**
 * The world map canvas (public/war/world/, regions.json "note" for the layers): base art, ownership tints, borders,
 * trade routes, highlights, labels, markers and squads, under a pan / zoom camera. Map px are base.jpg's (2048 x 1536);
 * the region under a point comes from region-ids.png (half size, red = 1-based index in `order`).
 */
import { ALLIANCES } from '../world/alliances';
import { TEAM_CSS } from '../world/palette';
import type { CrownMap, RegionState, TransitSnap } from '../net/world';
import { homeOf } from '../world/graph';
import { TRADE_ROUTES, MARKET_TOWNS, isChokepoint, type ConvoySnap, type HaulPlan } from './geo';
import type { WorldEvent } from '../world/events';
import { EVENT_INFO } from '../world/events';
import { EVENT_LOOK } from './eventLook';
import { levelKind, levelName, type LevelKind, type WorldSettlement } from '../net/settlements';
import { warlord } from '../../data/warWarlords';
import { landmarkOfRegion } from '../../data/warLandmarks';
import { PENNANT_W, pennantScale } from './lords';

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
  /** M6l: carts and porters on the road this alliance sees (fog and Safe Roads applied), the planned haul. */
  convoys: ConvoySnap[];
  haul: HaulPlan | null;
  /** W-61: region id -> the kit icons of the season's titles whose holders are at home there (drawn after its name). */
  emblems?: Map<string, string[]>;
  /** W-62: the world events running now (their regions glow, a marker with the countdown above the centre). */
  events?: WorldEvent[];
  /** W-63: the world's settlements (a marker sized by level, fealty lines vassal to overlord), the player's id, the hovered one. */
  settlements?: WorldSettlement[];
  me?: number | null;
  hoverSettle?: number | null;
  /** W-64: each alliance's monarch (a crown by its home) and the pacts and truces between alliances (lines home to home). */
  crown?: CrownMap;
  /** W-72: each warlord's hall (seat) and the lands his bands take and raid from (a smaller pennant), in his colour. */
  warlords?: WarlordMark[];
  /** W-73: the regions the player has mastered this season (a gold star by the centre). */
  mastered?: ReadonlySet<string>;
  /** The world overlay over a region (./overlay.ts): the region the player is in, outlined in gold. */
  here?: string | null;
}
/** What is under a map point, the topmost first (WorldMap.pick): its card wins over the region's. */
export interface MapPick {
  region: string | null;
  landmark: string | null;
  lord: string | null;
  mastered: string | null;
  settle: number | null;
  crown: number | null;
  cluster: { region: string; items: string[] } | null;
}
/**
 * W-72: one warlord pennant on the map: whose, in which region, his hall or one of his lands; W-76 proposal (./lords.ts):
 * places and men there as last reported, a raid warned or out (a pulsing red ring), fallen (his hall's pennant struck).
 */
export interface WarlordMark { id: string; region: string; seat: boolean; tint: number; holds?: number; men?: number; raid?: boolean; fallen?: true }
/** Where a pennant stands (pole foot, map px) and its cloth's size; a mastery star's centre and radius. */
type LordSpot = WarlordMark & { x: number; y: number; w: number; h: number };
interface StarSpot { region: string; x: number; y: number; r: number }
interface CrownSpot { x: number; y: number; r: number; name: string; alliance: number }
/** Context markers with no free spot at this zoom, as one "+N" chip in their region: what they are, in words. */
interface ClusterSpot { region: string; x: number; y: number; r: number; items: string[] }
/** The context markers as placed for this zoom (WorldMap.decor). */
interface Decor { lords: LordSpot[]; stars: StarSpot[]; landmarks: Map<string, [number, number, number]>; crowns: CrownSpot[]; settles: Map<number, [number, number]>; clusters: ClusterSpot[]; words: PactWord[] }
interface PactWord { x: number; y: number; text: string; edge: string }

/**
 * The map's marker hierarchy: yours first (your squads' banners, your men and carts on the road, the region you are
 * in), then threats (battles, sieges, world events, raids), then the context (warlord lands and halls, landmarks,
 * crowns, settlements, mastery stars, pacts). Below NEAR_K the context loses its words and, where it has no room,
 * huddles into a cluster chip per region; up close everything shows.
 */
export const NEAR_K = 0.7;
/** Marker sizes in units (0.8 CSS px each while zoomed out): radii of the round ones, the battle marker's side. */
export const SIZE = { event: 17, battle: 42, landmark: 13, crown: 11, star: 10, cluster: 10, convoy: 14, foreignConvoy: 10 } as const;
/** A context marker over a region's name costs this many times its overlap (a sliver of a name drops it into the cluster). */
const NAME_COST = 20;
/** A land pennant's size against his hall's; the pole's height in cloth heights. */
const LAND_F = 0.7, POLE = 1.9;
/** Badge text in units: 12 CSS px while zoomed out. */
const BADGE_FONT = 15;
const warlordName = (id: string) => warlord(id)?.name ?? id;
const landmarkName = (id: string) => landmarkOfRegion(id)?.name ?? id;

/** W-63: a region map's side in tiles (every region is 512 x 512), to place a settlement inside its region's shape. */
const REGION_TILES = 512;
/** W-63: a settlement marker's radius and kit icon by kind. */
const SETTLE_LOOK: Record<LevelKind, { r: number; icon: string }> = {
  camp: { r: 12, icon: 'bld-camp' }, village: { r: 15, icon: 'bld-storehouse' }, town: { r: 18.5, icon: 'bld-tower-stone' }, city: { r: 22.5, icon: 'bld-fort' },
};

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

/** An alliance's colour on the world map: the shared team palette (../world/palette.ts), which the region draws too. */
export function allianceColor(_art: WorldArt, a: number): string {
  return TEAM_CSS[a] ?? '#888';
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
    // M6l: the kit's cart icons (public/war/ui), for convoys on the road; missing ones are drawn as a dot
    for (const n of ['trade-cart', 'trade-wagon', 'act-load', 'bld-fort', 'res-coin', 'node-engineer-master-builder', 'bld-tower-stone', 'act-attack', 'bld-ram', 'unit-hoplite', 'bld-camp', 'bld-storehouse']) void img(`war/ui/icons/32/${n}.png`).then((i) => (m.pics[n] = i)).catch(() => undefined);
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
    this.k = this.fitK = Math.min(w / W, h / H);
    this.x = -free.left / this.k - (w / this.k - W) / 2;
    this.y = -free.top / this.k - (h / this.k - H) / 2;
    this.settle();
  }

  // ---------- the camera's feel: an eased zoom about the pointer, a pan that glides on after a fling, kept on the map ----------
  /** The zoom the camera eases toward (CSS px per map px). */
  goal = 0.5;
  private fitK = 0.2;
  private anchor: [number, number] | null = null;
  private vel: [number, number] = [0, 0];
  private lastPan: { x: number; y: number; t: number } | null = null;
  private stepAt = 0;
  /** The zoom range: a little under the fit, up to 3. */
  private clampK = (k: number) => Math.max(this.fitK * 0.85, Math.min(3, k));

  /** Zoom by `f` about canvas point (cx, cy), at once. */
  zoom(f: number, cx: number, cy: number): void {
    const [mx, my] = this.toMap(cx, cy);
    this.k = this.clampK(this.k * f);
    this.x = mx - cx / this.k;
    this.y = my - cy / this.k;
    this.settle();
  }
  /** Ease toward zoom `k` about canvas point (cx, cy): that map point stays under it. */
  zoomTo(k: number, cx: number, cy: number): void {
    this.goal = this.clampK(k);
    this.anchor = [cx, cy];
    this.vel = [0, 0];
  }
  /** Stop every motion where the camera is now. */
  settle(): void {
    this.goal = this.k;
    this.anchor = null;
    this.vel = [0, 0];
    this.lastPan = null;
  }
  /** A drag starts: the glide stops. */
  grab(): void {
    this.settle();
  }
  /** A drag moves the camera to (x, y) at time t (ms); its speed carries on after release. */
  panTo(x: number, y: number, t: number): void {
    const l = this.lastPan, dt = l ? t - l.t : 0;
    if (l && dt > 0) this.vel = [this.vel[0] * 0.4 + ((x - l.x) / dt) * 0.6, this.vel[1] * 0.4 + ((y - l.y) / dt) * 0.6];
    this.x = x;
    this.y = y;
    this.lastPan = { x, y, t };
    this.keepOnMap();
  }
  /** The drag ends at time t: a fling glides on, a stop stays put. */
  release(t: number): void {
    if (!this.lastPan || t - this.lastPan.t > 60) this.vel = [0, 0];
    this.lastPan = null;
  }
  /** Keep at least a third of the view over the painting. */
  private keepOnMap(): void {
    const [W, H] = this.art.size, vw = this.canvas.clientWidth / this.k, vh = this.canvas.clientHeight / this.k;
    this.x = Math.max(-vw * 0.67, Math.min(W - vw * 0.33, this.x));
    this.y = Math.max(-vh * 0.67, Math.min(H - vh * 0.33, this.y));
  }
  /** The camera eases or glides this frame. */
  get moving(): boolean {
    return !!this.anchor || !!this.vel[0] || !!this.vel[1];
  }
  /** One frame of the camera's easing and glide. */
  private step(now: number): void {
    const dt = Math.min(50, this.stepAt ? now - this.stepAt : 16);
    this.stepAt = now;
    if (this.anchor) {
      const [cx, cy] = this.anchor, [mx, my] = this.toMap(cx, cy);
      this.k += (this.goal - this.k) * (1 - Math.exp(-dt / 65));
      if (Math.abs(this.goal - this.k) < this.goal * 0.002) (this.k = this.goal), (this.anchor = null);
      this.x = mx - cx / this.k;
      this.y = my - cy / this.k;
      this.keepOnMap();
    }
    if (!this.lastPan && (this.vel[0] || this.vel[1])) {
      this.x += this.vel[0] * dt;
      this.y += this.vel[1] * dt;
      const f = Math.exp(-dt / 200);
      this.vel = [this.vel[0] * f, this.vel[1] * f];
      if (Math.hypot(...this.vel) * this.k < 0.01) this.vel = [0, 0];
      this.keepOnMap();
    }
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
    this.step(performance.now());
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
      // light enough that the painting reads through it (owner feedback)
      g.strokeStyle = foe < 0 ? 'rgba(240,138,112,.3)' : hexA(allianceColor(this.art, foe), 0.34);
      g.lineWidth = 3.5;
      for (let x = -H; x < W; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
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

    // the overlay's "you are here": a gold double edge round the region the player is in
    const here = st.here && this.paths.get(st.here);
    if (here) {
      g.strokeStyle = 'rgba(14,9,7,.85)';
      g.lineWidth = 7 / Math.max(this.k, 0.4);
      g.stroke(here);
      g.strokeStyle = `rgba(242,212,138,${0.75 + 0.25 * pulse})`;
      g.lineWidth = 3.5 / Math.max(this.k, 0.4);
      g.stroke(here);
    }

    // W-62: a region with a world event glows in its colour
    for (const e of st.events ?? []) {
      const p = this.paths.get(e.region);
      if (!p) continue;
      const col = EVENT_LOOK[e.kind].color;
      g.fillStyle = hexA(col, 0.12 + 0.1 * pulse);
      g.fill(p);
      g.save();
      g.clip(p);
      g.strokeStyle = hexA(col, 0.55 + 0.35 * pulse);
      g.lineWidth = 12;
      g.stroke(p);
      g.restore();
    }
    if (st.routes) this.drawRoutes(g);
    if (st.haul) this.drawHaul(g, st.haul);
    // the context's lines and the others' carts pass under the names
    this.drawPacts(g, st);
    this.drawFealty(g, st);
    this.drawConvoys(g, st, false);
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

  /** Icon scale: map px per unit (a unit is 0.8 CSS px while zoomed out, then grows with the zoom). */
  private get u(): number {
    return Math.max(1, 0.8 / this.k);
  }
  /** Zoomed out (the whole map or most of it): context markers lose their words and huddle into clusters. */
  get far(): boolean {
    return this.k < NEAR_K;
  }

  /**
   * The fixed markers, yours and the threats, in map px: a siege fort or battle right of the region's centre, a world
   * event above it, the player's banner left of it. Labels are laid out round these (never under them); the context
   * markers (./map.ts decor) yield to both.
   */
  private markerSpots(st: MapState): { marks: [string, string, number, number, number, number][]; banners: Map<string, [number, number, number]>; events: Map<string, [number, number, number, WorldEvent]> } {
    const s = this.u, marks: [string, string, number, number, number, number][] = [], banners = new Map<string, [number, number, number]>();
    const events = new Map<string, [number, number, number, WorldEvent]>(); // W-62: a world event's marker, above it
    for (const [id, r] of Object.entries(this.art.regions)) {
      const rs = st.regions.get(id);
      if (!rs) continue;
      const [cx, cy] = r.centroid;
      const ev = st.events?.find((e) => e.region === id);
      if (ev) events.set(id, [cx, cy - 56 * s, SIZE.event * s, ev]);
      if (rs.besieged) marks.push([id, 'markers/fort', cx + 6 * s, cy - 22 * s, SIZE.battle * s, SIZE.battle * s]);
      else if (rs.contested) marks.push([id, 'markers/battle', cx + 6 * s, cy - 24 * s, SIZE.battle * s, SIZE.battle * s]);
    }
    for (const id of st.squads.keys()) {
      const r = this.art.regions[id];
      if (r) banners.set(id, [r.centroid[0] - 44 * s, r.centroid[1] - 28 * s, s]);
    }
    return { marks, banners, events };
  }

  /**
   * The best spot for a w x h box in region `id`: the candidates `at`, then rings round the first and round the centre;
   * the first inside the region that overlaps nothing in `placed`, else the least crowded inside (`cost` its overlap;
   * over a box of `names`, the region names, it costs NAME_COST times as much: a marker gives way to a name first).
   */
  private spotIn(id: string, at: [number, number][], box: (x: number, y: number) => Box, placed: Box[], names: Box[] = []): { p: [number, number]; cost: number } {
    const s = this.u, [cx, cy] = this.art.regions[id].centroid;
    const ring = (x: number, y: number) => {
      const out: [number, number][] = [];
      for (let r = 14; r <= 112; r += 14) for (let a = 0; a < 12; a++) out.push([x + r * s * Math.cos((a * Math.PI) / 6), y + r * s * Math.sin((a * Math.PI) / 6)]);
      return out;
    };
    const over = (b: Box, q: Box) => Math.max(0, Math.min(b[2], q[2]) - Math.max(b[0], q[0])) * Math.max(0, Math.min(b[3], q[3]) - Math.max(b[1], q[1]));
    const cost = (b: Box) => placed.reduce((c, q) => c + over(b, q), 0) + names.reduce((c, q) => c + NAME_COST * over(b, q), 0);
    const inside = (b: Box) => [[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], [b[0], b[3]], [b[2], b[1]]].every(([x, y]) => this.regionAt(x, y) === id);
    let best = at[0] ?? [cx, cy], bc = Infinity;
    for (const p of [...at, ...(at.length ? ring(...at[0]) : []), ...ring(cx, cy)]) {
      const b = box(...p), c = cost(b) + (inside(b) ? 0 : 1e9);
      if (c < bc) (bc = c), (best = p);
      if (c === 0) break;
    }
    return { p: best, cost: bc };
  }
  /** A pennant's box at pole foot (x, y). */
  private lordBox(m: WarlordMark): { w: number; h: number; box: (x: number, y: number) => Box } {
    const ps = pennantScale(this.k), f = m.seat || m.raid ? 1 : LAND_F, w = PENNANT_W * ps * f, h = 15 * ps * f;
    return { w, h, box: (x, y) => [x - 4 * ps, y - h * POLE - 2 * ps, x + w + 2 * ps, y + 2 * ps] };
  }
  private lordOffsets(id: string): [number, number][] {
    const [cx, cy] = this.art.regions[id].centroid, s = this.u;
    return [[-40, 60], [24, 60], [-62, 26], [40, 26], [-24, 90], [-70, -10], [56, -6], [-10, -60], [0, 40], [-30, 10]].map(([dx, dy]) => [cx + dx * s, cy + dy * s]);
  }
  /** A raid's pennant and every hall's: placed with the fixed markers, before the names (which flow round them). */
  private fixedLords: LordSpot[] = [];

  private decorCache?: { key: string } & Decor;
  /**
   * The context markers, placed after the names and the fixed markers (they yield to both, so no name is dropped for
   * them): warlord pennants (a raid's and a hall's always show), landmarks, crowns, settlements (bigger first), mastery
   * stars; each at its preferred spot, else the first spot round it inside its region that is free. Zoomed out, one
   * that finds no free spot joins its region's cluster (a "+N" chip: hover lists them, a click zooms in); up close each
   * takes its least crowded spot.
   */
  private decor(st: MapState): Decor {
    const labels = this.layoutLabels(this.ctx, st), s = this.u, far = this.far;
    const key = `${this.labelCache?.key}|${(st.warlords ?? []).map((m) => `${m.id}:${m.region}:${m.raid ? 1 : 0}:${m.fallen ? 1 : 0}`).join(',')}|${[...(st.mastered ?? [])].join(',')}`
      + `|${[...st.regions.values()].filter((r) => r.landmark).map((r) => r.id).join(',')}|${(st.crown?.monarchs ?? []).map((m) => `${m.alliance}:${m.name}`).join(',')}|${(st.settlements ?? []).map((w) => `${w.id}:${w.level}`).join(',')}`;
    if (this.decorCache?.key === key) return this.decorCache;
    const names = labels.map((l) => [l.x - l.w / 2, l.y - l.h / 2, l.x + l.w / 2, l.y + l.h / 2] as Box), placed: Box[] = [...this.lastObstacles, ...names];
    const near = (id: string, offs: number[][]) => { const [cx, cy] = this.art.regions[id].centroid; return offs.map(([dx, dy]) => [cx + dx * s, cy + dy * s] as [number, number]); };
    const clustered = new Map<string, string[]>();
    /** Its spot: the first free one inside its region; else (`must`, up close, or only a sliver covered) the least crowded, or null (into the cluster). */
    const pick = (id: string, at: [number, number][], box: (x: number, y: number) => Box, must: boolean, what: string): [number, number] | null => {
      const { p, cost } = this.spotIn(id, at, box, placed, names), b = box(...p), area = (b[2] - b[0]) * (b[3] - b[1]);
      if (cost > area * 0.12 && far && !must) {
        clustered.set(id, [...(clustered.get(id) ?? []), what]);
        return null;
      }
      placed.push(b);
      return p;
    };
    const lords: LordSpot[] = [...this.fixedLords], ls = st.warlords ?? [];
    const landAt = (m: WarlordMark) => {
      if (!this.art.regions[m.region]) return;
      const { w, h, box } = this.lordBox(m), p = pick(m.region, this.lordOffsets(m.region), box, false, `${warlordName(m.id)}'s land`);
      if (p) lords.push({ ...m, x: p[0], y: p[1], w, h });
    };
    // M7g: a landmark under the region's centre
    const landmarks = new Map<string, [number, number, number]>();
    for (const [id, r] of st.regions) {
      if (!r.landmark || !this.art.regions[id]) continue;
      const rr = SIZE.landmark * s, box = (x: number, y: number): Box => [x - rr - 3 * s, y - rr - 3 * s, x + rr + 3 * s, y + rr + 3 * s];
      const p = pick(id, near(id, [[0, 34], [30, 30], [-30, 30], [0, -34]]), box, false, `Landmark: ${landmarkName(id)}`);
      if (p) landmarks.set(id, [p[0], p[1], rr]);
    }
    // W-64: a crown by each monarch's home
    const crowns: CrownSpot[] = [];
    for (const m of st.crown?.monarchs ?? []) {
      const home = homeOf(m.alliance);
      if (!this.art.regions[home]) continue;
      const rr = SIZE.crown * s, wide = far ? 0 : (8 * m.name.length + 14) * s;
      const box = (x: number, y: number): Box => [x - rr - 3 * s, y - rr - 3 * s, x + rr + wide + 3 * s, y + rr + 3 * s];
      const p = pick(home, near(home, [[34, -40], [-34, -40], [40, 30], [-40, 30]]), box, false, `Monarch: ${m.name}`);
      if (p) crowns.push({ x: p[0], y: p[1], r: rr, name: m.name, alliance: m.alliance });
    }
    // W-63: settlements, cities first
    const settles = new Map<number, [number, number]>();
    for (const w of [...(st.settlements ?? [])].sort((a, b) => b.level - a.level)) {
      const at = this.settlementSpot(w);
      if (!at) continue;
      // up close its name stands right of the seal
      const rr = this.settleR(w.level), name = far ? 0 : (7 * w.name.length + 16) * s;
      const box = (x: number, y: number): Box => [x - rr - 2 * s, y - rr - 2 * s, x + rr + name + 2 * s, y + rr + 2 * s];
      const p = pick(w.region, [at], box, false, `${w.name}, ${levelName(w.level).toLowerCase()}`);
      if (p) settles.set(w.id, p);
    }
    for (const m of ls) if (!m.raid && !m.seat) landAt(m);
    const stars: StarSpot[] = [];
    for (const id of st.mastered ?? []) {
      if (!this.art.regions[id]) continue;
      const r = SIZE.star * s, box = (x: number, y: number): Box => [x - r - 3 * s, y - r - 3 * s, x + r + 3 * s, y + r + 3 * s];
      const p = pick(id, near(id, [[32, 48], [-30, 50], [52, 4], [-52, 4], [0, 72], [10, -56], [0, 30], [24, 20]]), box, false, 'Mastered by you');
      if (p) stars.push({ region: id, x: p[0], y: p[1], r });
    }
    // the clusters: a "+N" chip each, at the least crowded spot near the region's centre
    const clusters: ClusterSpot[] = [];
    for (const [id, items] of clustered) {
      const r = SIZE.cluster * s, box = (x: number, y: number): Box => [x - r - 2 * s, y - r - 2 * s, x + r + 2 * s, y + r + 2 * s];
      const p = pick(id, near(id, [[0, 40], [36, 20], [-36, 20], [0, -40]]), box, true, '');
      if (p) clusters.push({ region: id, x: p[0], y: p[1], r, items });
    }
    // up close, a pact's or truce's word at its line's middle, where it is free (the line and the key say it anyway)
    const words: PactWord[] = [];
    if (!far) for (const p of st.crown?.pacts ?? []) {
      const a = this.art.regions[homeOf(p.a)]?.centroid, b = this.art.regions[homeOf(p.b)]?.centroid;
      if (!a || !b) continue;
      const text = p.kind === 'truce' ? 'TRUCE' : 'PACT', w = (text.length * 9.5 + 10) * s;
      for (const f of [0.5, 0.42, 0.58, 0.34, 0.66]) {
        const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, bx: Box = [x - w / 2, y - 11 * s, x + w / 2, y + 11 * s];
        if (placed.some((q) => Math.min(bx[2], q[2]) > Math.max(bx[0], q[0]) && Math.min(bx[3], q[3]) > Math.max(bx[1], q[1]))) continue;
        placed.push(bx);
        words.push({ x: x - w / 2, y, text, edge: p.kind === 'truce' ? '#f0d9b5' : '#e0b867' });
        break;
      }
    }
    this.decorCache = { key, lords, stars, landmarks, crowns, settles, clusters, words };
    return this.decorCache;
  }
  lordSpots(st: MapState): LordSpot[] {
    return this.decor(st).lords;
  }
  masterySpots(st: MapState): StarSpot[] {
    return this.decor(st).stars;
  }

  /** Everything under map point (x, y): the region (or the one whose event marker it is) and the marker on top. */
  pick(st: MapState, x: number, y: number): MapPick {
    const lord = this.lordAt(st, x, y)?.id ?? null, d = this.decor(st), within = (p: { x: number; y: number; r: number }, f = 1.3) => (x - p.x) ** 2 + (y - p.y) ** 2 <= (p.r * f) ** 2;
    const cl = lord ? undefined : d.clusters.find((c) => within(c, 1.4));
    const crown = lord || cl ? undefined : d.crowns.find((c) => within(c));
    return {
      region: this.eventAt(st, x, y) ?? this.regionAt(x, y), landmark: lord || cl ? null : this.landmarkAt(st, x, y), lord, mastered: lord || cl ? null : this.masteryAt(st, x, y),
      settle: lord || cl ? null : this.settlementAt(st, x, y), crown: crown ? crown.alliance : null, cluster: cl ? { region: cl.region, items: cl.items } : null,
    };
  }

  /** W-72: the warlord pennant under map point (x, y), else null. */
  lordAt(st: MapState, x: number, y: number): { id: string; region: string } | null {
    const s = pennantScale(this.k);
    for (const p of this.lordSpots(st)) if (x >= p.x - 4 * s && x <= p.x + p.w + 2 * s && y >= p.y - p.h * POLE && y <= p.y + 2 * s) return { id: p.id, region: p.region };
    return null;
  }
  /** W-73: the mastery star under map point (x, y): its region, else null. */
  masteryAt(st: MapState, x: number, y: number): string | null {
    for (const p of this.masterySpots(st)) if ((x - p.x) ** 2 + (y - p.y) ** 2 <= (p.r * 1.4) ** 2) return p.region;
    return null;
  }

  /** W-72: a warlord's pennant: a dark pole with a gold knob, a swallow-tailed cloth in his colour (his hall's bigger). */
  private drawLords(g: CanvasRenderingContext2D, st: MapState, raids: boolean): void {
    const s = pennantScale(this.k);
    for (const p of this.lordSpots(st)) {
      if (!!p.raid !== raids) continue;
      // W-76: fallen, the cloth hangs grey half down the pole
      const top = p.y - p.h * POLE, ct = top + (p.fallen ? p.h * 0.9 : 0), col = p.fallen ? '#5a524c' : `#${p.tint.toString(16).padStart(6, '0')}`;
      if (p.raid) {
        // W-76: a raid warned or out: a red ring pulsing round the pole's foot
        const k = 0.5 + 0.5 * Math.sin(st.now / 220);
        g.beginPath();
        g.ellipse(p.x, p.y, (9 + 4 * k) * s, (4.5 + 2 * k) * s, 0, 0, Math.PI * 2);
        g.lineWidth = 2.4 * s;
        g.strokeStyle = `rgba(224,74,58,${0.55 + 0.45 * k})`;
        g.stroke();
      }
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x, top);
      g.strokeStyle = '#0e0907';
      g.lineWidth = 4.5 * s;
      g.stroke();
      g.strokeStyle = '#6b4a2a';
      g.lineWidth = 2.2 * s;
      g.stroke();
      g.beginPath();
      g.moveTo(p.x + 1 * s, ct + 2 * s);
      g.lineTo(p.x + p.w, ct + 2 * s);
      g.lineTo(p.x + p.w * 0.72, ct + 2 * s + p.h / 2);
      g.lineTo(p.x + p.w, ct + 2 * s + p.h);
      g.lineTo(p.x + 1 * s, ct + 2 * s + p.h);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      g.lineWidth = 1.8 * s;
      g.strokeStyle = '#0e0907';
      g.stroke();
      g.beginPath();
      g.arc(p.x, top, (p.seat ? 3.2 : 2.4) * s, 0, Math.PI * 2);
      g.fillStyle = '#e0b867';
      g.fill();
      g.lineWidth = 1.2 * s;
      g.stroke();
    }
  }

  /** A dark disc with a ring: the base of every round marker (one look, one shadow). */
  private disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, ring: string, width: number, dash: number[] = []): void {
    const s = this.u;
    g.beginPath();
    g.arc(x, y + 1.5 * s, r + 1.5 * s, 0, Math.PI * 2);
    g.fillStyle = 'rgba(14,9,7,.55)';
    g.fill();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#17100d';
    g.fill();
    g.lineWidth = width;
    g.strokeStyle = ring;
    g.setLineDash(dash);
    g.stroke();
    g.setLineDash([]);
  }

  /** W-73: a mastered region: a gold star on a dark disc ringed in gold. */
  private drawMastery(g: CanvasRenderingContext2D, st: MapState): void {
    const s = this.u;
    for (const { x, y, r } of this.masterySpots(st)) {
      this.disc(g, x, y, r, '#e0b867', 2 * s);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.3 : r * 0.68;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = '#f2d48a';
      g.fill();
    }
  }

  /** The clusters: "+N" on a dark disc ringed in parchment, what is in it on hover, a click zooms in. */
  private drawClusters(g: CanvasRenderingContext2D, st: MapState): void {
    const s = this.u;
    for (const c of this.decor(st).clusters) {
      this.disc(g, c.x, c.y, c.r, '#c9ae86', 2 * s);
      g.font = `700 ${11 * s}px Inter, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f0d9b5';
      g.fillText(`+${c.items.length}`, c.x, c.y + 0.5 * s);
    }
  }

  /** W-64: pacts and truces, a line home to home (solid in both alliances' colours, or dashed and pale); its word up close. */
  private drawPacts(g: CanvasRenderingContext2D, st: MapState): void {
    const s = this.u, far = this.far;
    g.save();
    g.lineCap = 'round';
    g.globalAlpha = far ? 0.7 : 1;
    for (const p of st.crown?.pacts ?? []) {
      const a = this.art.regions[homeOf(p.a)]?.centroid, b = this.art.regions[homeOf(p.b)]?.centroid;
      if (!a || !b) continue;
      const line = () => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); };
      const truce = p.kind === 'truce';
      line();
      g.setLineDash([]);
      g.strokeStyle = 'rgba(14,9,7,.6)';
      g.lineWidth = 4.5 * s;
      g.stroke();
      if (truce) {
        line();
        g.setLineDash([9 * s, 7 * s]);
        g.strokeStyle = '#f0d9b5';
        g.lineWidth = 2 * s;
        g.stroke();
      } else {
        // half in each alliance's colour, meeting at the middle
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        for (const [from, team] of [[a, p.a], [b, p.b]] as const) {
          g.beginPath();
          g.moveTo(from[0], from[1]);
          g.lineTo(mx, my);
          g.strokeStyle = TEAM_CSS[team] ?? '#f0d9b5';
          g.lineWidth = 2.4 * s;
          g.stroke();
        }
      }
      g.setLineDash([]);
    }
    g.restore();
    if (!far) for (const w of this.decor(st).words) this.badge(g, w.text, w.x, w.y, s, false, w.edge);
  }

  /** W-64: a gold crown on a dark disc by each monarch's home; his name beside it up close (and on hover). */
  private drawCrowns(g: CanvasRenderingContext2D, st: MapState): void {
    const s = this.u;
    for (const { x, y, r, name, alliance } of this.decor(st).crowns) {
      this.disc(g, x, y, r, TEAM_CSS[alliance] ?? '#e0b867', 2 * s);
      // the crown: a band and three points
      const w = r * 1.15, h = r * 0.95, bx = x - w / 2, by = y + h * 0.45;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx, by - h * 0.75);
      g.lineTo(bx + w * 0.25, by - h * 0.35);
      g.lineTo(x, by - h);
      g.lineTo(bx + w * 0.75, by - h * 0.35);
      g.lineTo(bx + w, by - h * 0.75);
      g.lineTo(bx + w, by);
      g.closePath();
      g.fillStyle = '#e0b867';
      g.fill();
      g.lineWidth = 1.2 * s;
      g.strokeStyle = '#6b4a14';
      g.stroke();
      if (!this.far) this.badge(g, name, x + r + 3 * s, y, s * 0.85, false, '#e0b867');
    }
  }

  /** W-62: the world event marker under map point (x, y), its region id, else null. */
  eventAt(st: MapState, x: number, y: number): string | null {
    for (const [id, [cx, cy, r]] of this.markerSpots(st).events) if ((x - cx) ** 2 + (y - cy) ** 2 <= (r * 1.3) ** 2) return id;
    return null;
  }

  /** W-62: a world event: its icon on a dark disc ringed in its colour, a pulsing halo, and its time left (its name up close). */
  private drawEvents(g: CanvasRenderingContext2D, st: MapState, spots: Map<string, [number, number, number, WorldEvent]>): void {
    const s = this.u, pulse = 0.5 + 0.5 * Math.sin(st.now / 260);
    for (const [, [x, y, r, e]] of spots) {
      const look = EVENT_LOOK[e.kind];
      g.beginPath();
      g.arc(x, y, r + (4 + 4 * pulse) * s, 0, Math.PI * 2);
      g.fillStyle = hexA(look.color, 0.16 + 0.12 * (1 - pulse));
      g.fill();
      this.disc(g, x, y, r, look.color, 3 * s);
      const ic = this.pics[look.icon];
      if (ic) {
        g.save();
        if (look.ghost) (g.filter = 'grayscale(1) brightness(1.8)'), (g.globalAlpha = 0.85);
        g.drawImage(ic, x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44);
        g.restore();
      }
      const left = clock(Math.max(0, Math.ceil((e.endAt - st.now) / 1000)));
      this.badge(g, this.far ? left : `${EVENT_INFO[e.kind].name} · ${left}`, x + r + 3 * s, y, s, false, look.color);
    }
  }

  private settleAt = new Map<string, [number, number]>();
  /** W-63: a settlement's home spot in map px: its tile point scaled into its region's bounds, pulled toward the centre until inside the shape. */
  settlementSpot(w: WorldSettlement): [number, number] | null {
    const k = `${w.region}:${w.x}:${w.y}`, had = this.settleAt.get(k);
    if (had) return had;
    const r = this.art.regions[w.region], p = this.paths.get(w.region);
    if (!r || !p) return null;
    const xs = r.polygon.map((q) => q[0]), ys = r.polygon.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    // inset: the shape's edge is a border band, a marker sits clear of it
    let x = x0 + (x1 - x0) * (0.15 + 0.7 * w.x / REGION_TILES), y = y0 + (y1 - y0) * (0.15 + 0.7 * w.y / REGION_TILES);
    const [cx, cy] = r.centroid;
    for (let i = 0; i < 10 && !this.ctx.isPointInPath(p, x, y); i++) (x += (cx - x) * 0.25), (y += (cy - y) * 0.25);
    const out: [number, number] = [x, y];
    this.settleAt.set(k, out);
    return out;
  }
  /** A settlement seal's radius in map px: by level, smaller while zoomed out. */
  private settleR(level: number): number {
    return SETTLE_LOOK[levelKind(level)].r * this.u * (this.far ? 0.72 : 1);
  }

  /** W-63: the settlement marker under map point (x, y), its id, else null. */
  settlementAt(st: MapState, x: number, y: number): number | null {
    for (const w of st.settlements ?? []) {
      const p = this.decor(st).settles.get(w.id);
      if (p && (x - p[0]) ** 2 + (y - p[1]) ** 2 <= (this.settleR(w.level) * 1.3) ** 2) return w.id;
    }
    return null;
  }

  /**
   * W-63: fealty lines, vassal to overlord (a solid arc with an arrowhead at the overlord, gold when his), between the
   * seals as placed (a seal in a cluster: from the cluster); thin and faint zoomed out, full when one end is hovered.
   */
  private drawFealty(g: CanvasRenderingContext2D, st: MapState): void {
    const list = st.settlements ?? [];
    if (!list.length) return;
    const s = this.u, d = this.decor(st), by = new Map(list.map((w) => [w.id, w]));
    const spot = (w: WorldSettlement): [number, number] | null => d.settles.get(w.id) ?? (() => { const c = d.clusters.find((x) => x.region === w.region); return c ? [c.x, c.y] as [number, number] : null; })();
    g.save();
    g.lineCap = 'round';
    for (const v of list) {
      const o = v.overlord_id !== null ? by.get(v.overlord_id) : undefined, a = spot(v), b = o && spot(o);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      const hot = st.hoverSettle === v.id || st.hoverSettle === o!.id, mine = st.me != null && (v.lord_pid === st.me || o!.lord_pid === st.me);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, bend = Math.min(60, len * 0.18);
      const mx = (a[0] + b[0]) / 2 - (dy / len) * bend, my = (a[1] + b[1]) / 2 + (dx / len) * bend;
      const rb = (d.settles.has(o!.id) ? this.settleR(o!.level) : SIZE.cluster * s) + 4 * s, ra = (d.settles.has(v.id) ? this.settleR(v.level) : SIZE.cluster * s) + 2 * s;
      // stop short of both markers: the arc's ends at their radii, along the curve's end tangents
      const ta = Math.hypot(mx - a[0], my - a[1]) || 1, tb = Math.hypot(b[0] - mx, b[1] - my) || 1;
      const sx = a[0] + ((mx - a[0]) / ta) * ra, sy = a[1] + ((my - a[1]) / ta) * ra, ex = b[0] - ((b[0] - mx) / tb) * rb, ey = b[1] - ((b[1] - my) / tb) * rb;
      const arc = () => { g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, ex, ey); };
      const thin = this.far && !hot;
      g.globalAlpha = thin ? 0.55 : 1;
      arc();
      g.strokeStyle = 'rgba(14,9,7,.75)';
      g.lineWidth = (hot ? 6 : thin ? 3.6 : 5) * s;
      g.setLineDash([]);
      g.stroke();
      arc();
      // solid (the trade routes are dashed), gold when it ties the player
      g.strokeStyle = mine ? '#e0b867' : '#c9a6e8';
      g.lineWidth = (hot ? 3.4 : thin ? 1.8 : 2.6) * s;
      g.stroke();
      // the arrowhead: tribute and fealty flow to the overlord
      const ang = Math.atan2(ey - my, ex - mx), h = (thin ? 7 : 9) * s;
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - Math.cos(ang - 0.45) * h, ey - Math.sin(ang - 0.45) * h);
      g.lineTo(ex - Math.cos(ang + 0.45) * h, ey - Math.sin(ang + 0.45) * h);
      g.closePath();
      g.fillStyle = mine ? '#e0b867' : '#c9a6e8';
      g.strokeStyle = '#0e0907';
      g.lineWidth = 1.5 * s;
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  /**
   * W-63: a marker per settlement sized by level (camp, village, town, city) on a parchment seal, gold-rimmed when the
   * player rules it; its name beside it up close or hovered.
   */
  private drawSettlements(g: CanvasRenderingContext2D, st: MapState): void {
    const list = st.settlements ?? [];
    if (!list.length) return;
    const s = this.u, d = this.decor(st);
    // small ones first, so a city sits on top
    for (const w of [...list].sort((p, q) => p.level - q.level)) {
      const p = d.settles.get(w.id);
      if (!p) continue;
      const look = SETTLE_LOOK[levelKind(w.level)], r = this.settleR(w.level), [x, y] = p, hot = st.hoverSettle === w.id, mine = st.me != null && w.lord_pid === st.me;
      g.beginPath();
      g.arc(x, y + 1.5 * s, r + 1.5 * s, 0, Math.PI * 2);
      g.fillStyle = 'rgba(14,9,7,.55)';
      g.fill();
      // a parchment seal (the other markers are dark discs): its rim gold when he rules it
      if (w.level >= 4 && !this.far) { // a town or city up close: an outer ring, its walls
        g.beginPath();
        g.arc(x, y, r + 4 * s, 0, Math.PI * 2);
        g.lineWidth = 2.5 * s;
        g.strokeStyle = '#0e0907';
        g.stroke();
        g.lineWidth = 1.5 * s;
        g.strokeStyle = mine ? '#e0b867' : '#f0d9b5';
        g.stroke();
      }
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      const fill = g.createRadialGradient(x, y - r * 0.4, r * 0.1, x, y, r);
      fill.addColorStop(0, '#f6e6c8');
      fill.addColorStop(1, '#c9ae86');
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 2 * s;
      g.strokeStyle = '#0e0907';
      g.stroke();
      g.lineWidth = (hot ? 2.5 : 1.4) * s;
      g.strokeStyle = mine ? '#e0b867' : hot ? '#fff0d8' : '#7a3418';
      g.beginPath();
      g.arc(x, y, r - 1.5 * s, 0, Math.PI * 2);
      g.stroke();
      const ic = this.pics[look.icon];
      if (ic) {
        g.imageSmoothingEnabled = true;
        g.drawImage(ic, x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64);
        g.imageSmoothingEnabled = false;
      }
      if (hot || !this.far) this.badge(g, w.name, x + r + 3 * s, y, s * 0.85, hot, mine ? '#e0b867' : undefined);
    }
  }

  /** M7g: the landmark marker under map point (x, y), its region id, else null. */
  landmarkAt(st: MapState, x: number, y: number): string | null {
    for (const [id, [cx, cy, r]] of this.decor(st).landmarks) if ((x - cx) ** 2 + (y - cy) ** 2 <= (r * 1.25) ** 2) return id;
    return null;
  }

  /**
   * M7g: a landmark marker: a fort on a dark disc ringed in its holder's colour (grey: nobody, red: its guardian), a gold
   * outer ring once restored (and +2 while garrisoned), dashed while damaged; a pip with the guardian alive (crossed
   * swords, red) or slain / away (a skull, grey).
   */
  private drawLandmarks(g: CanvasRenderingContext2D, st: MapState): void {
    const s = this.u, ic = this.pics['bld-fort'];
    for (const [id, [x, y, r]] of this.decor(st).landmarks) {
      const lm = st.regions.get(id)?.landmark;
      if (!lm) continue;
      const col = lm.holder >= 0 ? allianceColor(this.art, lm.holder) : lm.guardian === 'alive' ? '#b8402c' : '#8a786a';
      if (lm.state === 'restored') {
        g.beginPath();
        g.arc(x, y, r + 3.5 * s, 0, Math.PI * 2);
        g.strokeStyle = '#e0b867';
        g.lineWidth = 2 * s;
        g.stroke();
      }
      this.disc(g, x, y, r, col, 3 * s, lm.state === 'damaged' ? [5 * s, 3 * s] : []);
      if (ic) {
        g.globalAlpha = lm.state === 'damaged' || lm.state === 'unclaimed' ? 0.75 : 1;
        g.drawImage(ic, x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44);
        g.globalAlpha = 1;
      }
      // the guardian's pip, top right
      const px = x + r * 0.78, py = y - r * 0.78, pr = r * 0.44, alive = lm.guardian === 'alive';
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fillStyle = alive ? '#8a2418' : '#3a2e28';
      g.fill();
      g.lineWidth = 1.2 * s;
      g.strokeStyle = '#0e0907';
      g.stroke();
      g.fillStyle = alive ? '#ffe0c8' : '#d8ccc0';
      g.font = `700 ${pr * 1.3}px "Segoe UI Symbol", "Apple Symbols", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(alive ? '⚔' : '☠', px, py + 0.5 * s);
      if (lm.state === 'restored' && lm.garrisoned && !this.far) this.badge(g, '+2', x + r + 3 * s, y + r * 0.55, s * 0.9, false);
    }
  }

  private labelCache?: { key: string; out: PlacedLabel[] };
  private lastObstacles: Box[] = [];

  /** Collision-free names for this zoom. Order: homes and Omphalos, then market towns and chokepoints, then the rest
   *  (small regions first within a tier). Each name tries, until one overlaps no placed name and no marker: spots well
   *  inside its region round its anchor (one or two lines, full size then smaller), then spots whose row only has to
   *  stay inside, then (homes, market towns, chokepoints) a spot just outside with a leader line to the anchor. A home
   *  or Omphalos that still finds nothing keeps its least-crowded spot; any other name is left out at this zoom. */
  private layoutLabels(g: CanvasRenderingContext2D, st: MapState): PlacedLabel[] {
    // while the camera eases or glides, the last layout holds (it scales with the map); it is laid out again once still
    if (this.labelCache && this.moving) return this.labelCache.out;
    const spots = this.markerSpots(st), base = Math.max(14, 13 / this.k), s = this.u;
    // only yours and the threats: the names come before the context markers, which are placed round them (decor)
    const obstacles: Box[] = [
      ...spots.marks.map(([, , x, y, w, h]) => [x, y, x + w, y + h] as Box),
      ...[...spots.events.values()].map(([x, y, r]) => [x - r - 8 * s, y - r - 8 * s, x + r + (this.far ? 64 : 160) * s, y + r + 8 * s] as Box),
      ...[...spots.banners].map(([id, [x, y, b]]) => [x, y, x + 38 * b + (10 * String(st.squads.get(id)).length + 14) * s, y + 56 * b] as Box),
      // your carts (others' are small and pass under the names)
      ...st.convoys.filter((c) => c.alliance === st.you).map((c) => {
        const q = 32 * s, [x, y] = this.transitPos({ ...c, men: 0, state: 'moving' }, st.now).map((v) => Math.round(v / q) * q);
        return [x - 16 * s - q / 2, y - 16 * s - q / 2, x + 16 * s + 70 * s + q / 2, y + 16 * s + q / 2] as Box;
      }),
      // squads on the road, snapped to a coarse step so the names re-flow now and then, not every frame
      ...st.transit.map((t) => {
        const q = 32 * s, [x, y] = this.transitPos(t, st.now).map((v) => Math.round(v / q) * q);
        return [x - 20 * s - q / 2, y - 43 * s - q / 2, x + 18 * s + (8 * String(t.men).length + 112) * s + q / 2, y + 8 * s + q / 2] as Box;
      }),
    ];
    // a raid's pennant and every hall's: fixed too, the names flow round them
    this.fixedLords = [];
    for (const m of [...(st.warlords ?? [])].sort((a, b) => Number(!!b.raid) - Number(!!a.raid))) {
      if ((!m.raid && !m.seat) || !this.art.regions[m.region]) continue;
      const { w, h, box } = this.lordBox(m), { p } = this.spotIn(m.region, this.lordOffsets(m.region), box, obstacles);
      obstacles.push(box(...p));
      this.fixedLords.push({ ...m, x: p[0], y: p[1], w, h });
    }
    const key = `${this.k.toFixed(3)}|${obstacles.map((o) => o.map(Math.round).join(',')).join(';')}`;
    this.lastObstacles = obstacles;
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
      // W-61: the season's titles held from this home, a gold medallion each after the name (the panel's tooltip names them)
      const em = st.emblems?.get(id);
      if (em?.length) {
        const r = size * 0.62, wide = Math.max(...lines.map((l) => g.measureText(l).width));
        em.forEach((ic, k) => {
          const cx = x + wide / 2 + r * 1.25 + k * r * 2.2;
          g.beginPath();
          g.arc(cx, y, r, 0, Math.PI * 2);
          g.fillStyle = '#2a1a0e';
          g.fill();
          g.lineWidth = Math.max(1, r * 0.18);
          g.strokeStyle = '#e0b867';
          g.stroke();
          const p = this.pics[ic];
          if (p) g.drawImage(p, cx - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44);
        });
      }
    }
  }

  /** The markers over the names, by rank: the context (small, wordless zoomed out), then the threats, then yours on top. */
  private drawMarkers(g: CanvasRenderingContext2D, st: MapState): void {
    const s = this.u, pic = (n: string) => this.pics[n], spots = this.markerSpots(st);
    // the context
    this.drawSettlements(g, st);
    this.drawLandmarks(g, st);
    this.drawCrowns(g, st);
    this.drawMastery(g, st);
    this.drawLords(g, st, false);
    this.drawClusters(g, st);
    // the threats: battles and sieges, raids, world events
    g.imageSmoothingEnabled = false;
    for (const [, name, x, y, w, h] of spots.marks) g.drawImage(pic(name), x, y, w, h);
    this.drawLords(g, st, true);
    this.drawEvents(g, st, spots.events);
    // yours: carts, the men on the road with their ETA, the squads' banners with their count
    this.drawConvoys(g, st, true);
    for (const t of st.transit) {
      const [x, y] = this.transitPos(t, st.now);
      g.drawImage(pic('markers/transit'), x - 20 * s, y - 40 * s, 40 * s, 48 * s);
      const left = Math.max(0, Math.ceil((t.arriveAt - st.now) / 1000));
      this.countBadge(g, 'unit-hoplite', t.men, t.state === 'queued' ? null : left, x + 18 * s, y - 34 * s, s);
    }
    const you = st.you ?? 0, key = ALLIANCES[you].key;
    for (const [id, men] of st.squads) {
      const spot = spots.banners.get(id);
      if (!spot) continue;
      // left of the region's centre (the battle marker sits right of it); a gold glow at its foot: yours
      const [bx, by, b] = spot, on = st.squadAt === id;
      g.fillStyle = on ? 'rgba(255,240,216,.45)' : 'rgba(242,212,138,.22)';
      g.beginPath();
      g.ellipse(bx + 20 * b, by + 56 * b, 26 * b, 8 * b, 0, 0, Math.PI * 2);
      g.fill();
      g.drawImage(pic(`banners/${key}`), bx, by, 40 * b, 56 * b);
      this.badge(g, String(men), bx + 38 * b, by + 14 * b, s, on, '#e0b867');
    }
  }

  /**
   * M6l: a cart (or porters' load) on the road: the kit's cart icon on an alliance-coloured disc; `mine`: yours, with
   * loads and ETA; else the others' in sight, smaller and wordless zoomed out (under the names).
   */
  private drawConvoys(g: CanvasRenderingContext2D, st: MapState, mine: boolean): void {
    const s = this.u;
    for (const c of st.convoys) {
      if ((c.alliance === st.you) !== mine) continue;
      const [x, y] = this.transitPos({ ...c, men: 0, state: 'moving' }, st.now), r = (mine ? SIZE.convoy : SIZE.foreignConvoy) * s;
      this.disc(g, x, y, r, allianceColor(this.art, c.alliance), (mine ? 3 : 2) * s);
      if (c.safe) { g.setLineDash([4 * s, 3 * s]); g.strokeStyle = '#9fd47a'; g.lineWidth = 1.5 * s; g.beginPath(); g.arc(x, y, r + 3 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
      const ic = this.pics[c.kind === 'wagon' ? 'trade-wagon' : c.kind === 'handcart' ? 'trade-cart' : 'act-load'];
      if (ic) { g.imageSmoothingEnabled = true; g.drawImage(ic, x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); }
      if (!mine && this.k < 1) continue; // the others' loads and ETA only close up
      const left = Math.max(0, Math.ceil((c.arriveAt - st.now) / 1000));
      this.countBadge(g, 'act-load', c.loads, left, x + r + 2 * s, y, s);
    }
  }

  /** M6l: the planned haul: a bright road through the regions, chokepoints ringed, legs by risk. */
  private drawHaul(g: CanvasRenderingContext2D, h: HaulPlan): void {
    const pts = this.routePoints(h.path), k = Math.max(this.k, 0.35);
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const line = () => { g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); };
    line();
    g.strokeStyle = 'rgba(14,9,7,.8)';
    g.lineWidth = 14 / k;
    g.stroke();
    line();
    g.strokeStyle = '#ffd27a';
    g.lineWidth = 6 / k;
    g.stroke();
    const col = { low: '#9fd47a', watch: '#e0b867', high: '#f08a70', unknown: '#bba58c' };
    for (const l of h.legs) {
      const [x, y] = this.art.regions[l.to].centroid;
      g.beginPath();
      g.arc(x, y, (isChokepoint(l.to) ? 13 : 9) / k, 0, Math.PI * 2);
      g.fillStyle = col[l.risk];
      g.fill();
      g.lineWidth = 3 / k;
      g.strokeStyle = '#0e0907';
      g.stroke();
    }
    const [sx, sy] = this.art.regions[h.path[0]].centroid;
    g.beginPath();
    g.arc(sx, sy, 10 / k, 0, Math.PI * 2);
    g.fillStyle = '#fff0d8';
    g.fill();
    g.stroke();
    g.restore();
  }

  /**
   * A count and a time left on the road, each after its icon (a men or loads icon, a clock), so "12 · 1:36" reads as
   * "12 men, 1:36 to go"; `secs` null: waiting to set out.
   */
  private countBadge(g: CanvasRenderingContext2D, icon: string, n: number, secs: number | null, x: number, y: number, s: number): void {
    g.font = `600 ${BADGE_FONT * s}px Inter, sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const ic = 15 * s, pad = 5 * s, gap = 3 * s, a = String(n), b = secs === null ? 'waiting' : clock(secs);
    const wa = g.measureText(a).width, wb = g.measureText(b).width;
    const w = pad + ic + gap + wa + 7 * s + ic + gap + wb + pad;
    g.fillStyle = '#17100d';
    g.strokeStyle = '#7a3418';
    g.lineWidth = 2 * s;
    g.fillRect(x, y - 10.5 * s, w, 21 * s);
    g.strokeRect(x, y - 10.5 * s, w, 21 * s);
    let cx = x + pad;
    const pic = this.pics[icon];
    if (pic) { g.imageSmoothingEnabled = true; g.drawImage(pic, cx, y - ic / 2, ic, ic); g.imageSmoothingEnabled = false; }
    cx += ic + gap;
    g.fillStyle = '#f0d9b5';
    g.fillText(a, cx, y + 1 * s);
    cx += wa + 7 * s;
    // a clock: a ring and two hands
    const r = ic / 2 - 1 * s, ox = cx + ic / 2;
    g.beginPath();
    g.arc(ox, y, r, 0, Math.PI * 2);
    g.lineWidth = 1.6 * s;
    g.strokeStyle = '#e0b867';
    g.stroke();
    g.beginPath();
    g.moveTo(ox, y - r * 0.65);
    g.lineTo(ox, y);
    g.lineTo(ox + r * 0.5, y + r * 0.2);
    g.stroke();
    cx += ic + gap;
    g.fillStyle = '#f0d9b5';
    g.fillText(b, cx, y + 1 * s);
  }

  private badge(g: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, on: boolean, edge?: string): void {
    g.font = `600 ${BADGE_FONT * s}px Inter, sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const w = g.measureText(text).width + 10 * s;
    g.fillStyle = on ? '#3d2414' : '#17100d';
    g.strokeStyle = edge ?? (on ? '#f2b27a' : '#7a3418');
    g.lineWidth = 2 * s;
    g.fillRect(x, y - 10.5 * s, w, 21 * s);
    g.strokeRect(x, y - 10.5 * s, w, 21 * s);
    g.fillStyle = '#f0d9b5';
    g.fillText(text, x + 5 * s, y + 1 * s);
  }
}

/** m:ss (or h:mm:ss). */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
