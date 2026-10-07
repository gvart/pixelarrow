/**
 * The war map of a shard (docs/MAP_V3.md "Rendering"): the interface the
 * online scene draws through, and a simple placeholder implementation.
 *
 * OnlineScene only talks to `WorldMapView`: build it from a map answer, ask
 * which region is under a point, where a region sits, and tell it the
 * selection, the planned route and the bosses' HP. A real parchment view
 * (baked terrain from the mask, fog clouds, dotted animated routes, armies on
 * waypoints) replaces `MarkerMapView` behind the same interface.
 *
 * Coordinates are map pixels (src/online/mapSchema.ts) in the world layer.
 */
import Phaser from 'phaser';
import type { MapView, RegionView } from '../../online/client';
import { LiveArmies } from '../../online/liveArmies';
import { routePoints } from '../../online/liveArmies';
import { getMap, hasMap, type WorldGraph } from '../../online/world';
import { addText } from '../../ui/kit';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorldMapView {
  /** The armies shown (map refresh + socket messages). */
  readonly armies: LiveArmies;
  /** (Re)builds everything for a map answer; `ownMarch`: your army's march being shown. */
  build(map: MapView, ownMarch: { path: number[]; at: number[] } | null, localNow?: number): void;
  /** World boss HP bars (f = share of HP left). */
  setBossBars(bars: { loc: number; f: number; dead: boolean }[]): void;
  /** The region under a world point (null: none). */
  pick(x: number, y: number): number | null;
  /** A region in sight (its view), or undefined in the fog. */
  known(loc: number): RegionView | undefined;
  /** Where a region sits on the map (its label point), world px. */
  anchor(loc: number): { x: number; y: number };
  /** The area the camera may look at, world px. */
  bounds(): Rect;
  setSelected(loc: number | null): void;
  /** A route to show (own march or a planned one). */
  setRoute(path: number[] | null, own?: boolean): void;
  update(time: number, delta: number, localNow?: number): void;
  destroy(): void;
}

/** Territory colours. */
export const TERRITORY = { mine: 0x3f78c0, clan: 0x2ea89a, others: [0xb83a2c, 0x8a4aa0, 0xc8762a, 0xa02f5a, 0xb89a2c, 0x7a5a48, 0x6a3a8a, 0x9a6a3a] };

export function territoryColor(map: Pick<MapView, 'you'>, r: Pick<RegionView, 'owner' | 'clan'>): number | null {
  if (r.owner === null) return null;
  if (r.owner === map.you.id) return TERRITORY.mine;
  if (map.you.clan !== null && r.clan === map.you.clan) return TERRITORY.clan;
  const id = r.clan ?? r.owner;
  return TERRITORY.others[Math.abs(Math.imul(id, 2654435761)) % TERRITORY.others.length];
}

/** Camera zoom limits for a viewport (relative to the UI scale). */
export function zoomLimits(uiScale: number): { min: number; max: number; start: number } {
  return { min: Math.max(0.5, uiScale * 0.4), max: Math.max(4, uiScale * 3), start: Math.max(1, Math.round(uiScale * 0.75)) };
}

/** Keeps the camera centre on the map. */
export function clampCenter(cx: number, cy: number, b: Rect): { x: number; y: number } {
  return { x: Math.max(b.x, Math.min(b.x + b.w, cx)), y: Math.max(b.y, Math.min(b.y + b.h, cy)) };
}

const INK = 0x3a2a1c;
const PARCH = 0xe8dcb8;
const SEA = 0xb8b4d8;
const LAND = 0xb7c49a;
const FOG = 0xcfc3a3;

/** Marker radius by kind (map px). */
const SIZE: Record<string, number> = { capital: 9, town: 7, fort: 7, post: 6, lair: 6, plot: 5, sea: 0 };

/**
 * Placeholder view: parchment, the routes as lines (naval ones dashed), every
 * land region as a marker at its label (owner colour, fogged when out of
 * sight), names, armies as dots moving along the routes' waypoints.
 */
export class MarkerMapView implements WorldMapView {
  readonly armies: LiveArmies;
  private world: WorldGraph;
  private map: MapView | null = null;
  private regions = new Map<number, RegionView>();
  private base: Phaser.GameObjects.Graphics;
  private dyn: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private selected: number | null = null;
  private route: { path: number[]; own: boolean } | null = null;
  private bossBars: { loc: number; f: number; dead: boolean }[] = [];

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Layer,
    me: number,
  ) {
    this.world = getMap();
    this.armies = new LiveArmies(this.world, me, (loc) => this.regions.has(loc));
    this.base = scene.add.graphics();
    this.dyn = scene.add.graphics();
    layer.add([this.base, this.dyn]);
  }

  build(map: MapView, ownMarch: { path: number[]; at: number[] } | null, localNow = Date.now()): void {
    this.map = map;
    this.world = hasMap(map.shard.map) ? getMap(map.shard.map) : getMap();
    this.regions = new Map(map.regions.map((r) => [r.loc, r]));
    this.armies.world = this.world;
    this.armies.me = map.you.id;
    this.armies.load(map.armies, map.players, map.now, localNow);
    if (ownMarch) this.armies.ownMarch(ownMarch.path, ownMarch.at);
    this.drawBase();
  }

  private drawBase(): void {
    const g = this.base;
    const w = this.world;
    const map = this.map!;
    g.clear();
    g.fillStyle(PARCH, 1).fillRect(0, 0, w.width, w.height);
    // land and sea by mask cell (coarse; the real view bakes the terrain)
    const mask = w.mask();
    const cell = w.map.cell;
    const fill = new Map<number, { col: number; alpha: number } | null>();
    const fillOf = (id: number) => {
      let f = fill.get(id);
      if (f === undefined) {
        const r = w.info(id);
        const seen = this.regions.get(id);
        f = { col: r.kind === 'sea' ? SEA : seen ? (territoryColor(map, seen) ?? LAND) : FOG, alpha: r.kind === 'sea' ? 1 : seen ? 0.85 : 0.6 };
        fill.set(id, f);
      }
      return f;
    };
    for (let y = 0; y < w.map.h; y++)
      for (let x = 0; x < w.map.w; ) {
        const id = mask[y * w.map.w + x];
        let n = 1;
        while (x + n < w.map.w && mask[y * w.map.w + x + n] === id) n++;
        if (id) {
          const f = fillOf(id)!;
          g.fillStyle(f.col, f.alpha).fillRect(x * cell, y * cell, n * cell, cell);
        }
        x += n;
      }
    // routes
    for (const e of w.map.edges) {
      const pts = routePoints(w, e.a, e.b);
      g.lineStyle(1, INK, e.naval ? 0.35 : 0.55);
      for (let i = 1; i < pts.length; i++) {
        if (e.naval) dashed(g, pts[i - 1], pts[i], 4);
        else g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      }
    }
    // markers and names
    for (const l of this.labels) l.destroy();
    this.labels = [];
    for (const r of w.all()) {
      if (r.kind === 'sea') continue;
      const v = this.regions.get(r.id);
      const p = w.pos(r.id);
      const rad = SIZE[r.kind] ?? 5;
      g.fillStyle(v ? (territoryColor(map, v) ?? 0xf4ecd4) : 0xbdb196, 1).fillCircle(p.x, p.y, rad);
      g.lineStyle(1, INK, 1).strokeCircle(p.x, p.y, rad);
      if (v?.home) g.lineStyle(1, INK, 1).strokeCircle(p.x, p.y, rad + 2);
      if (v?.occupant === 'beast') g.fillStyle(0x8a1e1e, 1).fillCircle(p.x, p.y, 2);
      const t = addText(this.scene, p.x, p.y + rad + 2, r.name, v ? 'ink' : 'dim', 0.5);
      this.layer.add(t);
      this.labels.push(t);
    }
  }

  setBossBars(bars: { loc: number; f: number; dead: boolean }[]): void {
    this.bossBars = bars;
  }

  pick(x: number, y: number): number | null {
    // the nearest land marker within reach, else the region under the point
    let best: number | null = null;
    let bd = 14 * 14;
    for (const r of this.world.all()) {
      if (r.kind === 'sea') continue;
      const d = (r.label[0] - x) ** 2 + (r.label[1] - y) ** 2;
      if (d < bd) (bd = d), (best = r.id);
    }
    if (best !== null) return best;
    const id = this.world.regionAt(x, y);
    return id && this.world.info(id).passable ? id : null;
  }

  known(loc: number): RegionView | undefined {
    return this.regions.get(loc);
  }

  anchor(loc: number): { x: number; y: number } {
    return this.world.has(loc) ? this.world.pos(loc) : { x: 0, y: 0 };
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: this.world.width, h: this.world.height };
  }

  setSelected(loc: number | null): void {
    this.selected = loc;
  }

  setRoute(path: number[] | null, own = false): void {
    this.route = path && path.length > 1 ? { path, own } : null;
  }

  update(time: number, _delta: number, localNow = Date.now()): void {
    const g = this.dyn;
    g.clear();
    if (this.route) {
      const p = this.route.path;
      g.lineStyle(2, this.route.own ? TERRITORY.mine : 0xfff0c0, 0.9);
      for (let i = 1; i < p.length; i++) {
        const pts = routePoints(this.world, p[i - 1], p[i]);
        for (let j = 1; j < pts.length; j++) dashed(g, pts[j - 1], pts[j], 3, (time / 120) % 6);
      }
    }
    if (this.selected !== null && this.world.has(this.selected)) {
      const p = this.world.pos(this.selected);
      g.lineStyle(2, 0xfff0c0, 0.6 + 0.4 * Math.sin(time / 200)).strokeCircle(p.x, p.y, (SIZE[this.world.info(this.selected).kind] ?? 5) + 4);
    }
    for (const b of this.bossBars) {
      if (!this.world.has(b.loc)) continue;
      const p = this.world.pos(b.loc);
      g.fillStyle(0x1d140f, 0.8).fillRect(p.x - 10, p.y - 14, 20, 3);
      g.fillStyle(b.dead ? 0x6a6a6a : 0xc0392b, 1).fillRect(p.x - 10, p.y - 14, Math.round(20 * Math.max(0, Math.min(1, b.f))), 3);
    }
    this.armies.settle(localNow);
    for (const a of this.armies.poses(localNow)) {
      if (!a.visible) continue;
      const own = a.player === this.map?.you.id;
      g.fillStyle(own ? TERRITORY.mine : 0xb83a2c, 1).fillRect(Math.round(a.x) - 3, Math.round(a.y) - 9, 6, 6);
      g.lineStyle(1, INK, 1).strokeRect(Math.round(a.x) - 3, Math.round(a.y) - 9, 6, 6);
    }
  }

  destroy(): void {
    for (const l of this.labels) l.destroy();
    this.base.destroy();
    this.dyn.destroy();
  }
}

function dashed(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, dash: number, offset = 0): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.5) return;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  for (let s = -offset; s < len; s += dash * 2) {
    const s0 = Math.max(0, s);
    const s1 = Math.min(len, s + dash);
    if (s1 > s0) g.lineBetween(a.x + ux * s0, a.y + uy * s0, a.x + ux * s1, a.y + uy * s1);
  }
}
