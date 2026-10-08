/**
 * The war map of a shard (docs/MAP_V3.md "Rendering"): the interface the
 * online scene draws through, and the parchment implementation.
 *
 * OnlineScene only talks to `WorldMapView`: build it from a map answer, ask
 * which region is under a point, where a region sits, and tell it the
 * selection, the planned route, the bosses' HP and the camp plots.
 *
 * `ParchmentMapView` paints the season map with src/art/parchmentMap.ts:
 * terrain baked lazily into chunk textures at two levels of detail (plus a
 * coarse overview under them), culled to the camera and evicted LRU; fog of
 * war baked into the chunks and cross-faded away when regions are revealed;
 * name plates, animated dotted routes, armies and ships moving along the
 * waypoints, camp plots and the selection as light overlays.
 *
 * Coordinates are map pixels (src/online/mapSchema.ts) in the world layer.
 */
import Phaser from 'phaser';
import type { MapView, RegionView } from '../../online/client';
import { LiveArmies, routePoints } from '../../online/liveArmies';
import { getMap, hasMap, type WorldGraph } from '../../online/world';
import { addText } from '../../ui/kit';
import type { Pix } from '../../art/pixels';
import { MapLife } from './mapLife';
import {
  MP,
  MapFields,
  armyPix,
  bakeChunk,
  campPlotPix,
  campZone,
  fogCells,
  platePix,
  regionOutlinePix,
  shipPix,
  stateSignature,
  type MapState,
} from '../../art/parchmentMap';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A camp or camp plot to outline (src/online/camps.ts CampPlotMarker). */
export interface CampPlotMark {
  loc: number;
  /** A camp stands here (else an unclaimed camp plot). */
  camp: boolean;
  owner?: number | null;
  mine: boolean;
  home?: boolean;
  /** Your plot that can be made a camp now (the "active" checker). */
  claimable?: boolean;
}

export interface WorldMapView {
  /** The armies shown (map refresh + socket messages). */
  readonly armies: LiveArmies;
  /** Called when a `revealPan` region (a city state) comes out of the fog: pan there and say so. */
  onDiscover: ((loc: number, name: string) => void) | null;
  /** (Re)builds everything for a map answer; `ownMarch`: your army's march being shown. */
  build(map: MapView, ownMarch: { path: number[]; at: number[] } | null, localNow?: number): void;
  /** World boss HP bars (f = share of HP left). */
  setBossBars(bars: { loc: number; f: number; dead: boolean }[]): void;
  /** Camp plots and camps to outline (dotted border, checker fill). */
  setCampPlots(plots: readonly CampPlotMark[]): void;
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
  return { min: Math.max(0.25, uiScale * 0.125), max: Math.max(4, uiScale * 3), start: Math.max(1, Math.round(uiScale * 0.75)) };
}

/** The pixel-clean zoom nearest to z (integers from 1 up, 1/n below), inside the limits. */
export function snapZoom(z: number, lim: { min: number; max: number }): number {
  const s = z >= 1 ? Math.round(z) : 1 / Math.max(1, Math.round(1 / z));
  return Math.max(lim.min, Math.min(lim.max, s));
}

/** The next pixel-clean zoom level from z in direction dir (+1 in, -1 out). */
export function zoomStep(z: number, dir: 1 | -1, lim: { min: number; max: number }): number {
  const ladder: number[] = [];
  for (let n = 8; n >= 2; n--) ladder.push(1 / n);
  for (let n = 1; n <= 12; n++) ladder.push(n);
  const ok = ladder.filter((v) => v >= lim.min - 1e-6 && v <= lim.max + 1e-6);
  if (!ok.length) return z;
  if (dir > 0) return ok.find((v) => v > z + 1e-3) ?? ok[ok.length - 1];
  for (let i = ok.length - 1; i >= 0; i--) if (ok[i] < z - 1e-3) return ok[i];
  return ok[0];
}

/** Keeps the camera centre on the map. */
export function clampCenter(cx: number, cy: number, b: Rect): { x: number; y: number } {
  return { x: Math.max(b.x, Math.min(b.x + b.w, cx)), y: Math.max(b.y, Math.min(b.y + b.h, cy)) };
}

// ------------------------------------------------------------------ parchment view

/** Levels of detail: map px per texel and chunk size in texels. */
const LODS = [
  { s: 1, size: 128, cap: 160, most: 80 },
  { s: 4, size: 128, cap: 240, most: 200 },
] as const;
const OVERVIEW_S = 32;
/** Bake budget per frame (ms); at least one chunk is baked per frame. */
const BUDGET = 7;
const FADE_MS = 900;

interface Chunk {
  lod: number;
  cx: number;
  cy: number;
  key: string | null;
  img: Phaser.GameObjects.Image | null;
  sig: number;
  sigVer: number;
  used: number;
  /** Fog in this chunk changed since the last bake (cross-fade the next one). */
  reveal: boolean;
  /** What it shows changed: bake again. */
  dirty: boolean;
}

interface LabelObj {
  loc: number;
  rank: number;
  x: number;
  y: number;
  plate: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.BitmapText;
  /** Owner pip on the plate (text shifted right). */
  acc: boolean;
  /** Zoom it was laid out for. */
  z: number;
  /** Crowded out by a more important label at this zoom. */
  hide: boolean;
}

/** Label importance: capitals first, plots last. */
const RANK: Record<string, number> = { capital: 0, town: 1, fort: 2, post: 2, lair: 2, plot: 3, sea: 9 };

let VIEW_SEQ = 0;

export class ParchmentMapView implements WorldMapView {
  readonly armies: LiveArmies;
  onDiscover: ((loc: number, name: string) => void) | null = null;
  private world: WorldGraph;
  private fields: MapFields;
  private map: MapView | null = null;
  private regions = new Map<number, RegionView>();
  private state: MapState;
  private stateVer = 0;
  private prefix: string;
  private texSeq = 0;
  private chunks = new Map<string, Chunk>();
  private groundOverview: Phaser.GameObjects.Container;
  private ground: Phaser.GameObjects.Container[];
  private overlays: Phaser.GameObjects.Container;
  private lifeC: Phaser.GameObjects.Container;
  private life: MapLife;
  private routeG: Phaser.GameObjects.Graphics;
  private armyC: Phaser.GameObjects.Container;
  private fxG: Phaser.GameObjects.Graphics;
  private labelC: Phaser.GameObjects.Container;
  private margin: Phaser.GameObjects.TileSprite | null = null;
  private overview: { img: Phaser.GameObjects.Image; key: string; sig: number } | null = null;
  private labels: LabelObj[] = [];
  private selected: number | null = null;
  private selImg: { img: Phaser.GameObjects.Image; key: string } | null = null;
  private route: { pts: { x: number; y: number }[]; lens: number[]; total: number; own: boolean; dest: number } | null = null;
  private bossBars: { loc: number; f: number; dead: boolean }[] = [];
  private camps: { mark: CampPlotMark; imgs: Phaser.GameObjects.Image[]; keys: string[] }[] = [];
  private armySprites = new Map<number, { img: Phaser.GameObjects.Image; kind: string; trail: { x: number; y: number }[] }>();
  private knownPrev: Set<number> | null = null;
  private frame = 0;
  private worker: Worker | null = null;
  private workerTried = false;
  private inflight = new Map<string, number>();

  constructor(
    private scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    me: number,
  ) {
    this.prefix = `pm${++VIEW_SEQ}_`;
    this.world = getMap();
    this.fields = new MapFields(this.world);
    this.state = { fog: new Uint8Array(this.world.map.w * this.world.map.h).fill(1), owner: new Map() };
    this.armies = new LiveArmies(this.world, me, (loc) => this.regions.has(loc));
    this.groundOverview = scene.add.container(0, 0);
    this.ground = LODS.map(() => scene.add.container(0, 0)).reverse();
    this.overlays = scene.add.container(0, 0);
    this.lifeC = scene.add.container(0, 0);
    this.routeG = scene.add.graphics();
    this.armyC = scene.add.container(0, 0);
    this.fxG = scene.add.graphics();
    this.labelC = scene.add.container(0, 0);
    // coarse first, fine on top
    this.life = this.makeLife();
    layer.add([this.groundOverview, ...this.ground, this.overlays, this.lifeC, this.routeG, this.fxG, this.armyC, this.labelC]);
  }

  private makeLife(): MapLife {
    return new MapLife(this.scene, this.fields, (x, y) => this.state.fog[this.fields.cellIndex(x, y)] === 1, this.prefix, this.lifeC);
  }

  private uiScale(): number {
    return (this.scene as unknown as { m?: { S: number } }).m?.S ?? 2;
  }

  private groundOf(lod: number): Phaser.GameObjects.Container {
    // this.ground is reversed: index 0 = coarsest
    return this.ground[LODS.length - 1 - lod];
  }

  // ------------------------------------------------------------------ build

  build(map: MapView, ownMarch: { path: number[]; at: number[] } | null, localNow = Date.now()): void {
    this.map = map;
    const world = hasMap(map.shard.map) ? getMap(map.shard.map) : getMap();
    if (world !== this.world) {
      this.world = world;
      this.margin?.destroy();
      this.margin = null;
      this.fields = new MapFields(world);
      this.life.destroy();
      this.life = this.makeLife();
      if (this.worker) this.worker.postMessage({ type: 'map', id: world.id });
      this.dropAllChunks();
      this.knownPrev = null;
    }
    this.regions = new Map(map.regions.map((r) => [r.loc, r]));
    this.armies.world = this.world;
    this.armies.me = map.you.id;
    this.armies.load(map.armies, map.players, map.now, localNow);
    if (ownMarch) this.armies.ownMarch(ownMarch.path, ownMarch.at);
    const known = new Set(this.regions.keys());
    const owner = new Map<number, number>();
    for (const r of map.regions) {
      const c = territoryColor(map, r);
      if (c !== null) owner.set(r.loc, c);
    }
    const fog = fogCells(this.fields, known);
    const fogChanged = !sameBytes(fog, this.state.fog);
    if (fogChanged) for (const c of this.chunks.values()) c.reveal = true;
    this.state = { fog, owner };
    this.stateVer++;
    if (!this.worker && !this.workerTried) {
      this.workerTried = true;
      this.startWorker();
    }
    this.worker?.postMessage({ type: 'state', fog, owner: [...owner] });
    this.bakeMargin();
    this.bakeOverview(fogChanged);
    this.buildLabels();
    this.discover(map, known);
    if (this.selected !== null) this.setSelected(this.selected);
  }

  /** New revealPan regions (since the last build, or since the last visit by local memory). */
  private discover(map: MapView, known: Set<number>): void {
    const key = `pm_seen_${map.shard.id}_${map.season.id}`;
    let seen: Set<number> | null = null;
    if (this.knownPrev) seen = this.knownPrev;
    else {
      try {
        const raw = localStorage.getItem(key);
        if (raw) seen = new Set(JSON.parse(raw) as number[]);
      } catch {
        seen = null;
      }
    }
    const pans = [...known].filter((l) => this.world.has(l) && this.world.info(l).revealPan);
    const fresh = seen ? pans.filter((l) => !seen!.has(l)) : [];
    this.knownPrev = new Set(known);
    try {
      const prev = localStorage.getItem(key);
      const all = new Set<number>([...(prev ? (JSON.parse(prev) as number[]) : []), ...pans]);
      localStorage.setItem(key, JSON.stringify([...all]));
    } catch {
      /* private mode: no memory, no harm */
    }
    if (fresh.length && this.onDiscover) this.onDiscover(fresh[0], this.world.info(fresh[0]).name);
  }

  /** Unexplored parchment around the map's edges. */
  private bakeMargin(): void {
    if (this.margin) return;
    const T = 128;
    const st: MapState = { fog: new Uint8Array(this.world.map.w * this.world.map.h).fill(1), owner: new Map() };
    const key = this.addTex(bakeChunk(this.fields, st, 1, 0, 0, T, T));
    const pad = 4096;
    this.margin = this.scene.add.tileSprite(-pad, -pad, this.fields.W + 2 * pad, this.fields.H + 2 * pad, key).setOrigin(0, 0);
    this.groundOverview.addAt(this.margin, 0);
  }

  private bakeOverview(fade: boolean): void {
    const f = this.fields;
    const sig = stateSignature(f, this.state, 0, 0, f.cw, f.ch);
    if (this.overview && this.overview.sig === sig) return;
    const tw = Math.ceil(f.W / OVERVIEW_S);
    const th = Math.ceil(f.H / OVERVIEW_S);
    const pix = bakeChunk(f, this.state, OVERVIEW_S, 0, 0, tw, th);
    const key = this.addTex(pix);
    const img = this.scene.add.image(0, 0, key).setOrigin(0, 0).setScale(OVERVIEW_S);
    this.groundOverview.add(img);
    const old = this.overview;
    this.overview = { img, key, sig };
    if (old) this.fadeOut(old.img, old.key, fade ? FADE_MS : 0);
  }

  private addTex(pix: Pix): string {
    const key = `${this.prefix}${++this.texSeq}`;
    this.scene.textures.addCanvas(key, pix.toCanvas());
    return key;
  }

  private dropTex(key: string): void {
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
  }

  private fadeOut(img: Phaser.GameObjects.Image, key: string, ms: number): void {
    if (ms <= 0 || !img.visible) {
      img.destroy();
      this.dropTex(key);
      return;
    }
    const parent = img.parentContainer;
    parent?.bringToTop(img);
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: ms,
      ease: 'Sine.easeIn',
      onComplete: () => {
        img.destroy();
        this.dropTex(key);
      },
    });
  }

  private dropAllChunks(): void {
    for (const c of this.chunks.values()) {
      c.img?.destroy();
      if (c.key) this.dropTex(c.key);
    }
    this.chunks.clear();
  }

  // ------------------------------------------------------------------ labels

  private buildLabels(): void {
    for (const l of this.labels) l.plate.destroy(), l.text.destroy();
    this.labels = [];
    const map = this.map!;
    for (const r of this.world.all()) {
      if (r.kind === 'sea') continue;
      const v = this.regions.get(r.id);
      if (!v) continue;
      const text = addText(this.scene, 0, 0, r.name, r.kind === 'capital' ? 'red' : 'ink', 0.5);
      const w = Math.ceil(text.width) + 6;
      const accent = territoryColor(map, v);
      const pk = `${this.prefix}plate_${w}_${accent ?? 'n'}`;
      if (!this.scene.textures.exists(pk)) this.scene.textures.addCanvas(pk, platePix(w + (accent !== null ? 6 : 0), 11, accent).toCanvas());
      const plate = this.scene.add.image(0, 0, pk).setOrigin(0.5, 0);
      text.setOrigin(0.5, 0);
      this.labelC.add([plate, text]);
      const pl = this.fields.placedOf(r.id);
      const x = pl ? Math.round(pl.x + pl.w / 2) : r.label[0];
      const y = pl ? pl.y + pl.h + (r.kind === 'capital' ? 0 : -2) : r.label[1] + 12;
      this.labels.push({ loc: r.id, rank: RANK[r.kind] ?? 3, x, y, plate, text, acc: accent !== null, z: -1, hide: false });
    }
  }

  private layoutLabels(zoom: number, view: Phaser.Geom.Rectangle): void {
    const S = this.uiScale();
    const k = Math.max(1, Math.round((S * 0.75) / zoom));
    const allowed = zoom >= S * 0.7 ? 3 : zoom >= S * 0.3 ? 2 : zoom >= S * 0.17 ? 1 : 0;
    const pad = 80 * k;
    if (this.labels.some((l) => l.z !== zoom)) {
      // collision avoidance, most important first: a crowded label slides below / above / aside, or hides
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const order = this.labels.filter((l) => l.rank <= allowed).sort((a, b) => a.rank - b.rank || a.y - b.y || a.loc - b.loc);
      for (const l of this.labels) {
        l.z = zoom;
        l.hide = true;
      }
      for (const l of order) {
        const acc = l.acc ? 3 : 0;
        const w = l.plate.width * k;
        const h = 11 * k;
        const y = Math.round(l.y + (k - 1) * 4);
        for (const [dx, dy] of [
          [0, 0],
          [0, h + k],
          [0, -(h + k)],
          [w / 2 + 2 * k, 0],
          [-(w / 2 + 2 * k), 0],
          [0, 2 * (h + k)],
        ]) {
          const r = { x0: l.x + dx - w / 2, y0: y + dy, x1: l.x + dx + w / 2, y1: y + dy + h };
          if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
          placed.push(r);
          l.hide = false;
          l.plate.setScale(k).setPosition(Math.round(l.x + dx), y + dy);
          l.text.setScale(k).setPosition(Math.round(l.x + dx + acc * k), y + dy + 2 * k);
          break;
        }
      }
    }
    for (const l of this.labels) {
      const on = !l.hide && l.rank <= allowed && l.x > view.x - pad && l.x < view.right + pad && l.y > view.y - pad && l.y < view.bottom + pad;
      l.plate.setVisible(on);
      l.text.setVisible(on);
    }
  }

  // ------------------------------------------------------------------ chunks

  private updateChunks(view: Phaser.Geom.Rectangle): void {
    const now = this.frame;
    // the finest level whose visible chunk count stays modest
    let lod = -1;
    for (let i = 0; i < LODS.length; i++) {
      const span = LODS[i].s * LODS[i].size;
      const n = (Math.ceil(view.width / span) + 2) * (Math.ceil(view.height / span) + 2);
      if (n <= LODS[i].most) {
        lod = i;
        break;
      }
    }
    const want = new Set<string>();
    const need: Chunk[] = [];
    const cxm = view.centerX;
    const cym = view.centerY;
    const levels = lod < 0 ? [] : lod === 0 ? [0, 1] : [lod];
    for (const li of levels) {
      const L = LODS[li];
      const span = L.s * L.size;
      const m = li === lod ? span * 0.25 : 0;
      const x0 = Math.max(0, Math.floor((view.x - m) / span));
      const y0 = Math.max(0, Math.floor((view.y - m) / span));
      const x1 = Math.min(Math.ceil(this.fields.W / span) - 1, Math.floor((view.right + m) / span));
      const y1 = Math.min(Math.ceil(this.fields.H / span) - 1, Math.floor((view.bottom + m) / span));
      for (let cy = y0; cy <= y1; cy++)
        for (let cx = x0; cx <= x1; cx++) {
          const key = `${li}:${cx}:${cy}`;
          let c = this.chunks.get(key);
          if (!c) {
            if (li !== lod) continue; // coarser underlay only when already baked
            c = { lod: li, cx, cy, key: null, img: null, sig: -1, sigVer: -1, used: now, reveal: false, dirty: true };
            this.chunks.set(key, c);
          }
          want.add(key);
          c.used = now;
          if (c.sigVer !== this.stateVer) {
            c.sigVer = this.stateVer;
            const cs = this.fields.cell;
            const sig = stateSignature(
              this.fields,
              this.state,
              Math.floor((cx * span) / cs) - 2,
              Math.floor((cy * span) / cs) - 2,
              Math.ceil(((cx + 1) * span) / cs) + 2,
              Math.ceil(((cy + 1) * span) / cs) + 2,
            );
            if (sig !== c.sig) {
              c.sig = sig;
              c.dirty = true;
            }
          }
          if (c.dirty && li === lod) need.push(c);
        }
    }
    if (lod > 0) {
      // zooming out: keep the finer chunks already baked until the coarser ones covering them are
      // ready, instead of flashing the coarse overview
      const L = LODS[lod];
      const span = L.s * L.size;
      for (const c of this.chunks.values()) {
        if (c.lod >= lod || !c.img) continue;
        const cs = LODS[c.lod].s * LODS[c.lod].size;
        if ((c.cx + 1) * cs < view.x || c.cx * cs > view.right || (c.cy + 1) * cs < view.y || c.cy * cs > view.bottom) continue;
        const parent = this.chunks.get(`${lod}:${Math.floor((c.cx * cs) / span)}:${Math.floor((c.cy * cs) / span)}`);
        if (parent?.img) continue;
        want.add(`${c.lod}:${c.cx}:${c.cy}`);
        c.used = now;
      }
    }
    for (const c of this.chunks.values()) if (c.img) c.img.setVisible(want.has(`${c.lod}:${c.cx}:${c.cy}`));
    // bake nearest first, within the frame budget
    need.sort((a, b) => dist2(a, cxm, cym) - dist2(b, cxm, cym));
    if (this.worker) {
      for (const c of need) {
        if (this.inflight.size >= 6) break;
        const key = `${c.lod}:${c.cx}:${c.cy}`;
        if (this.inflight.get(key) === c.sig) continue;
        const L = LODS[c.lod];
        this.inflight.set(key, c.sig);
        this.worker.postMessage({ type: 'bake', key, sig: c.sig, s: L.s, gx: c.cx * L.size, gy: c.cy * L.size, w: L.size, h: L.size });
      }
    } else {
      const t0 = performance.now();
      for (let i = 0; i < need.length; i++) {
        if (i > 0 && performance.now() - t0 > BUDGET) break;
        this.bake(need[i]);
      }
    }
    // forget the least recently seen
    for (let li = 0; li < LODS.length; li++) {
      const list = [...this.chunks.values()].filter((c) => c.lod === li && c.img);
      if (list.length <= LODS[li].cap) continue;
      list.sort((a, b) => a.used - b.used);
      for (const c of list.slice(0, list.length - LODS[li].cap)) {
        if (c.used === now) break;
        c.img?.destroy();
        if (c.key) this.dropTex(c.key);
        this.chunks.delete(`${c.lod}:${c.cx}:${c.cy}`);
      }
    }
  }

  private bake(c: Chunk, baked?: Pix | HTMLCanvasElement): void {
    const L = LODS[c.lod];
    const pix = baked ?? bakeChunk(this.fields, this.state, L.s, c.cx * L.size, c.cy * L.size, L.size, L.size);
    const key = `${this.prefix}${++this.texSeq}`;
    this.scene.textures.addCanvas(key, pix instanceof HTMLCanvasElement ? pix : pix.toCanvas());
    const img = this.scene.add
      .image(c.cx * L.size * L.s, c.cy * L.size * L.s, key)
      .setOrigin(0, 0)
      .setScale(L.s);
    this.groundOf(c.lod).add(img);
    if (c.img && c.key) this.fadeOut(c.img, c.key, c.reveal ? FADE_MS : 0);
    c.img = img;
    c.key = key;
    c.reveal = false;
    c.dirty = false;
  }

  /** Chunk baking in a worker (falls back to the main thread when workers are unavailable). */
  private startWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inflight.clear();
    try {
      const w = new Worker(new URL('../../art/parchmentWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent) => this.onBaked(e.data as { key: string; sig: number; w: number; h: number; data: ArrayBuffer });
      w.onerror = () => {
        w.terminate();
        if (this.worker === w) this.worker = null;
        this.inflight.clear();
      };
      w.postMessage({ type: 'map', id: this.world.id });
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }

  private onBaked(m: { key: string; sig: number; w: number; h: number; data: ArrayBuffer }): void {
    if (this.inflight.get(m.key) === m.sig) this.inflight.delete(m.key);
    const c = this.chunks.get(m.key);
    if (!c || c.sig !== m.sig || !c.dirty) return;
    const cv = document.createElement('canvas');
    cv.width = m.w;
    cv.height = m.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(m.w, m.h);
    img.data.set(new Uint8ClampedArray(m.data));
    ctx.putImageData(img, 0, 0);
    this.bake(c, cv);
  }

  // ------------------------------------------------------------------ queries

  setBossBars(bars: { loc: number; f: number; dead: boolean }[]): void {
    this.bossBars = bars;
  }

  pick(x: number, y: number): number | null {
    // the nearest settlement within reach, else the region under the point
    let best: number | null = null;
    let bd = 22 * 22;
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
    if (this.selImg) {
      this.selImg.img.destroy();
      this.dropTex(this.selImg.key);
      this.selImg = null;
    }
    this.selected = loc;
    if (loc === null || !this.world.has(loc) || this.world.info(loc).kind === 'sea') return;
    const o = regionOutlinePix(this.fields, loc, 2, MP.plan);
    if (!o) return;
    const key = this.addTex(o.pix);
    const img = this.scene.add.image(o.x, o.y, key).setOrigin(0, 0).setScale(2);
    this.overlays.add(img);
    this.selImg = { img, key };
  }

  setRoute(path: number[] | null, own = false): void {
    if (!path || path.length < 2) {
      this.route = null;
      return;
    }
    const pts: { x: number; y: number }[] = [];
    for (let i = 1; i < path.length; i++) {
      const seg = routePoints(this.world, path[i - 1], path[i]);
      for (const p of i === 1 ? seg : seg.slice(1)) pts.push(p);
    }
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    this.route = { pts, lens, total: lens[lens.length - 1], own, dest: path[path.length - 1] };
  }

  setCampPlots(plots: readonly CampPlotMark[]): void {
    for (const c of this.camps) {
      for (const i of c.imgs) i.destroy();
      for (const k of c.keys) this.dropTex(k);
    }
    this.camps = [];
    for (const mark of plots) {
      if (!this.world.has(mark.loc)) continue;
      if (!this.regions.has(mark.loc) && !mark.mine) continue;
      const cells = campZone(this.fields, mark.loc);
      if (!cells.length) continue;
      const active = !!mark.claimable || (mark.camp && mark.mine);
      const imgs: Phaser.GameObjects.Image[] = [];
      const keys: string[] = [];
      for (let phase = 0; phase < (active ? 2 : 1); phase++) {
        const o = campPlotPix(this.fields, cells, active, phase);
        const key = this.addTex(o.pix);
        const img = this.scene.add.image(o.x, o.y, key).setOrigin(0, 0).setVisible(phase === 0);
        if (!mark.camp && !active) img.setAlpha(0.75);
        this.overlays.add(img);
        imgs.push(img);
        keys.push(key);
      }
      this.camps.push({ mark, imgs, keys });
    }
  }

  // ------------------------------------------------------------------ frame

  update(time: number, _delta: number, localNow = Date.now()): void {
    this.frame++;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    this.updateChunks(view);
    this.layoutLabels(cam.zoom, view);
    const k = Math.max(1, Math.round(1.6 / cam.zoom));
    // selection pulse, marching ants on active camp plots
    if (this.selImg) this.selImg.img.setAlpha(0.65 + 0.35 * Math.sin(time / 260));
    const ant = Math.floor(time / 140) % 2;
    for (const c of this.camps) if (c.imgs.length > 1) c.imgs.forEach((im, i) => im.setVisible(i === ant));
    this.drawRoute(time, k, view);
    this.drawFx(time, k);
    this.life.update(time, view, cam.zoom);
    this.drawArmies(time, localNow, cam.zoom, view);
  }

  private drawRoute(time: number, k: number, view: Phaser.Geom.Rectangle): void {
    const g = this.routeG;
    g.clear();
    const r = this.route;
    if (!r) return;
    const col = r.own ? MP.route : MP.plan;
    const dk = r.own ? MP.routeDk : MP.planDk;
    const gap = 4 * k;
    const off = ((time / (r.own ? 45 : 90)) * k) % gap;
    let seg = 1;
    for (let d = off; d <= r.total; d += gap) {
      while (seg < r.lens.length - 1 && r.lens[seg] < d) seg++;
      const a = r.pts[seg - 1];
      const b = r.pts[seg];
      const l = r.lens[seg] - r.lens[seg - 1];
      const t = l > 0 ? (d - r.lens[seg - 1]) / l : 0;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      if (x < view.x - 8 || y < view.y - 8 || x > view.right + 8 || y > view.bottom + 8) continue;
      g.fillStyle(dk, 0.55).fillRect(x - k + (k > 1 ? 1 : 0), y, k + 1, k + 1);
      g.fillStyle(col, 1).fillRect(x - k + 1, y - k + 1, k + 1, k + 1);
    }
    // destination: a dashed square that breathes
    const p = this.world.pos(r.dest);
    const half = (9 + Math.round(Math.sin(time / 220) * 1.5)) * k;
    g.fillStyle(col, 1);
    for (let i = -half; i <= half; i += 3 * k) {
      g.fillRect(p.x + i, p.y - half, k * 2, k);
      g.fillRect(p.x + i, p.y + half, k * 2, k);
      g.fillRect(p.x - half, p.y + i, k, k * 2);
      g.fillRect(p.x + half, p.y + i, k, k * 2);
    }
  }

  private drawFx(time: number, k: number): void {
    const g = this.fxG;
    g.clear();
    if (this.selected !== null && this.world.has(this.selected)) {
      // corner brackets around the settlement
      const pl = this.fields.placedOf(this.selected);
      const p = this.world.pos(this.selected);
      const pulse = Math.round(Math.sin(time / 200) * 2);
      const bx0 = (pl ? pl.x : p.x - 14) - 3 - pulse;
      const by0 = (pl ? pl.y : p.y - 14) - 3 - pulse;
      const bx1 = (pl ? pl.x + pl.w : p.x + 14) + 3 + pulse;
      const by1 = (pl ? pl.y + pl.h : p.y + 14) + 3 + pulse;
      const L = 8 * k;
      g.fillStyle(MP.planDk, 0.6);
      for (const [cx, cy, sx, sy] of [
        [bx0, by0, 1, 1],
        [bx1, by0, -1, 1],
        [bx0, by1, 1, -1],
        [bx1, by1, -1, -1],
      ]) {
        g.fillRect(sx > 0 ? cx + k : cx - L + k, cy + k, L, k);
        g.fillRect(cx + k, sy > 0 ? cy + k : cy - L + k, k, L);
      }
      g.fillStyle(MP.plan, 1);
      for (const [cx, cy, sx, sy] of [
        [bx0, by0, 1, 1],
        [bx1, by0, -1, 1],
        [bx0, by1, 1, -1],
        [bx1, by1, -1, -1],
      ]) {
        g.fillRect(sx > 0 ? cx : cx - L, cy, L, k);
        g.fillRect(cx, sy > 0 ? cy : cy - L, k, L);
      }
    }
    for (const b of this.bossBars) {
      if (!this.world.has(b.loc)) continue;
      const p = this.world.pos(b.loc);
      const w = 22 * k;
      const x = Math.round(p.x - w / 2);
      const y = Math.round(p.y - 26 * k);
      g.fillStyle(0x4a2a30, 1).fillRect(x - k, y - k, w + 2 * k, 4 * k);
      g.fillStyle(0xd8c0b0, 1).fillRect(x, y, w, 2 * k);
      g.fillStyle(b.dead ? 0x8a7a7a : 0xb12d3c, 1).fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, b.f))), 2 * k);
    }
  }

  private teamColour(player: number): number {
    const map = this.map;
    if (!map) return TERRITORY.others[0];
    if (player === map.you.id) return TERRITORY.mine;
    const a = this.armies.armies.get(player);
    if (map.you.clan !== null && a?.clan === map.you.clan) return TERRITORY.clan;
    return TERRITORY.others[Math.abs(Math.imul(a?.clan ?? player, 2654435761)) % TERRITORY.others.length];
  }

  private armyTex(kind: 'army' | 'ship', col: number): string {
    const key = `${this.prefix}${kind}_${col}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, (kind === 'ship' ? shipPix(col) : armyPix(col)).toCanvas());
    return key;
  }

  private drawArmies(time: number, localNow: number, zoom: number, view: Phaser.Geom.Rectangle): void {
    this.armies.settle(localNow);
    const k = Math.max(1, Math.min(3, Math.round((this.uiScale() * 0.75) / zoom)));
    const seen = new Set<number>();
    const g = this.fxG;
    for (const a of this.armies.poses(localNow)) {
      if (!a.visible) continue;
      seen.add(a.player);
      let x = a.x;
      let y = a.y;
      const naval = a.moving && this.fields.coast(x, y) < -0.2;
      if (!a.moving) {
        // stand beside the settlement, not on its roofs
        x += 16;
        y += 10;
      }
      const kind = naval ? 'ship' : 'army';
      const key = this.armyTex(kind, this.teamColour(a.player));
      let s = this.armySprites.get(a.player);
      if (!s) {
        const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
        this.armyC.add(img);
        s = { img, kind, trail: [] };
        this.armySprites.set(a.player, s);
      }
      if (s.img.texture.key !== key) s.img.setTexture(key);
      s.kind = kind;
      const bob = a.moving && !naval ? (Math.floor(time / 160 + a.player) % 2) : naval ? Math.round(Math.sin(time / 300 + a.player)) : 0;
      s.img.setScale(k).setFlipX(a.dx < 0).setPosition(Math.round(x), Math.round(y) - bob * k);
      s.img.setVisible(x > view.x - 40 && x < view.right + 40 && y > view.y - 40 && y < view.bottom + 60);
      // the wake of a ship (pale pixels trailing behind)
      const last = s.trail[s.trail.length - 1];
      if (naval) {
        if (!last || Math.hypot(last.x - x, last.y - y) > 3) s.trail.push({ x, y });
        if (s.trail.length > 14) s.trail.shift();
        for (let i = 0; i < s.trail.length - 1; i++) {
          const p = s.trail[i];
          const a2 = (i + 1) / s.trail.length;
          const spread = (s.trail.length - i) * 0.5;
          g.fillStyle(MP.sparkle, 0.75 * a2);
          g.fillRect(Math.round(p.x - spread * (a.dy !== 0 ? 1 : 0)), Math.round(p.y - 1 + spread * 0.5), k, k);
          g.fillRect(Math.round(p.x + spread * (a.dy !== 0 ? 1 : 0)), Math.round(p.y - 1 - spread * 0.5 + 2), k, k);
        }
      } else s.trail = [];
    }
    for (const [pl, s] of this.armySprites)
      if (!seen.has(pl)) {
        s.img.destroy();
        this.armySprites.delete(pl);
      }
    this.armyC.sort('y');
  }

  destroy(): void {
    this.dropAllChunks();
    if (this.overview) this.dropTex(this.overview.key);
    if (this.selImg) this.dropTex(this.selImg.key);
    for (const c of this.camps) for (const kk of c.keys) this.dropTex(kk);
    for (const l of this.labels) l.plate.destroy(), l.text.destroy();
    for (const s of this.armySprites.values()) s.img.destroy();
    for (const c of [this.groundOverview, ...this.ground, this.overlays, this.armyC, this.labelC]) c.destroy();
    this.life.destroy();
    this.worker?.terminate();
    this.worker = null;
    this.routeG.destroy();
    this.fxG.destroy();
    for (const key of this.scene.textures.getTextureKeys()) if (key.startsWith(this.prefix)) this.scene.textures.remove(key);
  }
}

function dist2(c: Chunk, x: number, y: number): number {
  const L = LODS[c.lod];
  const span = L.s * L.size;
  return ((c.cx + 0.5) * span - x) ** 2 + ((c.cy + 0.5) * span - y) ** 2;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
