/**
 * Map view modes (W-36): Normal, Altitude (hypsometric tint, contour lines), Movement (terrain cost, cliff edges), Ownership
 * (team influence, claim zones, no-build and entry zones, borders), Biomes and Resources (nodes by kind, the guard radius of
 * living lairs). Each mode is a tint: a palette and an index per tile (or per 1 m cell for altitude), lines on the edges
 * between differing neighbours. The scene bakes it over the ground of its terrain chunks (drawTint: under units, buildings
 * and live objects), the minimap and the full map paint it in tile space (paint: one px per cell, hillshaded).
 */
import { buildGrid } from '../sim/grid';
import { CLAIM } from '../sim/mobs';
import { decodeBiomes, decodeVisual, KINDS } from '../regions/visual';
import type { BuildingSnap, BuildingType, ClaimSnap, InfluenceMap, LairSnap, NodeSnap, RegionData, ResourceKind } from '../types';
import { IsoMap, LH } from './iso';

export type MapMode = 'normal' | 'altitude' | 'movement' | 'ownership' | 'biomes' | 'resources';
/** The modes: name, hotkey, kit icon and the one question each answers. */
export const MODES: { id: MapMode; name: string; key: string; icon: string; about: string }[] = [
  { id: 'normal', name: 'Normal', key: 'F2', icon: 'mode-normal', about: 'The land as it is: terrain, water and roads.' },
  { id: 'altitude', name: 'Altitude', key: 'F3', icon: 'mode-altitude', about: 'Where the high ground is. Each line is one level up.' },
  { id: 'movement', name: 'Movement', key: 'F4', icon: 'mode-movement', about: 'Where your men march fast, slow, or not at all.' },
  { id: 'ownership', name: 'Ownership', key: 'F5', icon: 'mode-ownership', about: 'Who holds the land, and where you may build.' },
  { id: 'biomes', name: 'Biomes', key: 'F6', icon: 'mode-biomes', about: 'The lands of the region and their borders.' },
  { id: 'resources', name: 'Resources', key: 'F7', icon: 'mode-resources', about: 'What lies where, and which beasts guard it.' },
];

type RGB = [number, number, number];
/** What the live modes read from the sim. */
export interface Live { influence: InfluenceMap | null; nodes: NodeSnap[]; lairs: LairSnap[]; claims: ClaimSnap[]; buildings: BuildingSnap[] }
/** A legend row: swatch colour, label; hatch: drawn striped on the maps; line: a line, not an area. */
export interface LegendRow { c: RGB; label: string; hatch?: boolean; line?: boolean }
/**
 * A mode's tint: palette, index per tile (fine: per cell) or -1, lines between differing neighbours. hatch: palette
 * indices drawn striped on the tile-space maps (zones, impassable, guarded).
 */
export interface Tint { mode: MapMode; pal: RGB[]; alpha: number; at: Int16Array; fine: boolean; line: 'dark' | 'color' | 'cliff' | null; legend: LegendRow[]; hatch?: number[] }

export const TEAM_RGB: RGB[] = [[74, 163, 255], [224, 80, 60], [232, 192, 64], [176, 112, 224]];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Normal colours of the visual kinds (tile-space maps). */
const KIND_RGB: Record<string, RGB> = {
  grass: [104, 132, 70], forest: [52, 84, 48], sand: [200, 182, 126], marsh: [92, 106, 76], rock: [122, 116, 110], road: [190, 164, 118],
  snow: [232, 234, 238], dirt: [140, 116, 84], shallow: [86, 150, 178], deep: [36, 70, 112], scree: [146, 140, 128], meadow: [122, 146, 78],
  gravel: [150, 140, 122], dry: [168, 150, 92], rossa: [170, 98, 66], marble: [214, 208, 196], grove: [96, 112, 56], dune: [222, 192, 132],
  hardpan: [186, 152, 110], redrock: [160, 82, 56], reg: [176, 146, 104], salt: [230, 224, 214], oasis: [72, 128, 72],
};
/** Biome names for players. */
export const BIOME_NAME: Record<string, string> = { global: 'Temperate', elaia: 'Elaia olive hills', kyrene: 'Kyrene desert', mountains: 'Mountains' };
const BIOME_RGB: Record<string, RGB> = { global: [104, 144, 74], elaia: [177, 173, 63], kyrene: [192, 106, 60], mountains: [122, 130, 140] };
export const RES_RGB: Record<ResourceKind | 'olives', RGB> = {
  food: [214, 188, 116], wood: [140, 156, 96], stone: [168, 168, 176], marble: [244, 240, 228], copper: [222, 120, 60], tin: [140, 170, 196],
  iron: [150, 70, 60], bronze: [200, 140, 60], silver: [200, 220, 240], coin: [230, 200, 90], salt: [250, 210, 220], pitch: [92, 58, 28], olives: [150, 160, 50],
  hides: [150, 110, 80], flax: [200, 190, 120], herbs: [96, 150, 80], charcoal: [50, 46, 44], leather: [130, 84, 50], linen: [236, 230, 210], oil: [180, 170, 60],
  // M7e rare goods
  dragonbone: [232, 226, 200], nereidPearl: [220, 236, 240], starIron: [96, 110, 140], asphodel: [200, 170, 220], titanBronze: [170, 110, 40], obsidian: [40, 36, 52],
};
/** Altitude bands (hypsometric, on parchment: sage lowland to umber hills, grey rock, cream peaks): sim levels 0..7, then the mountains' visual levels. */
const ALT_RGB: RGB[] = [[176, 186, 140], [200, 200, 150], [222, 210, 160], [232, 206, 146], [228, 188, 124], [218, 164, 104], [200, 136, 86], [178, 110, 70],
  [150, 92, 62], [128, 104, 90], [168, 160, 152], [240, 234, 222]];
const altBand = (z: number) => (z <= 7 ? z : z <= 12 ? 8 : z <= 20 ? 9 : z <= 30 ? 10 : 11);
const WATER_RGB: RGB[] = [[132, 170, 180], [86, 128, 146]];
/** Movement: impassable (umber, hatched), road (gold), slow (ochre), very slow (terracotta). */
const MOVE_RGB: RGB[] = [[58, 36, 22], [236, 182, 60], [196, 142, 78], [186, 82, 44]];
const CLIFF_RGB: RGB = [150, 24, 20];
/** The parchment the info modes sit on: terrain lightness mapped between these, water in pale ink. */
const PARCH_LO: RGB = [150, 126, 96], PARCH_HI: RGB = [240, 226, 194], PARCH_WATER: RGB[] = [[150, 182, 186], [112, 150, 162]];
/** Buildings that do not close their tiles to movement. */
const OPEN: Set<BuildingType | string> = new Set(['woodBridge', 'stoneBridge', 'woodStairs', 'stoneStairs', 'ladder', 'woodGate', 'stoneGate']);

export class MapData {
  readonly w: number;
  readonly h: number;
  readonly fw: number;
  readonly fh: number;
  /** Per cell: visual kind and level as authored (the mountains not yet flattened under their sprites). */
  readonly kind: Uint8Array;
  readonly z: Uint8Array;
  readonly cost: Float32Array;
  readonly biome: Uint8Array;
  readonly biomeNames: string[];
  /** Per tile: 0 none, 1 no-build, 2 entry. */
  readonly zone: Uint8Array;
  private cache = new Map<MapMode, { key: string; t: Tint }>();

  constructor(readonly r: RegionData) {
    this.w = r.w; this.h = r.h; this.fw = 2 * r.w; this.fh = 2 * r.h;
    const n = this.fw * this.fh;
    if (r.visual) ({ kind: this.kind, z: this.z } = decodeVisual(r.visual.rle, n));
    else {
      this.kind = new Uint8Array(n); this.z = new Uint8Array(n);
      for (let j = 0; j < n; j++) {
        const i = this.tile(j);
        this.kind[j] = r.water[i] === 2 ? KINDS.indexOf('deep') : r.water[i] === 1 ? KINDS.indexOf('shallow') : KINDS.indexOf(r.terrain[i]);
        this.z[j] = r.height[i];
      }
    }
    this.cost = buildGrid(r).cost;
    this.biomeNames = r.biomes?.names ?? ['global'];
    this.biome = r.biomes ? decodeBiomes(r.biomes.rle, r.w * r.h) : new Uint8Array(r.w * r.h);
    this.zone = new Uint8Array(r.w * r.h);
    const mark = (b: { x: number; y: number; w: number; h: number }, k: number) => {
      for (let y = Math.max(0, b.y); y < Math.min(r.h, b.y + b.h); y++) for (let x = Math.max(0, b.x); x < Math.min(r.w, b.x + b.w); x++) this.zone[y * r.w + x] = k;
    };
    r.noBuild.forEach((b) => mark(b, 1));
    r.entries.forEach((b) => mark(b, 2));
  }

  /** The tile of cell j. */
  tile(j: number): number {
    return ((j / this.fw / 2) | 0) * this.w + ((j % this.fw) >> 1);
  }

  /** What a live mode depends on: its tint is rebuilt when this changes. */
  key(mode: MapMode, l: Live): string {
    if (mode === 'ownership') return `${l.influence?.version ?? -1}|${l.claims.map((c) => c.state + c.team).join()}`;
    if (mode === 'resources') return `${l.nodes.length}|${l.lairs.map((q) => (q.state === 'cleared' ? 0 : 1)).join('')}`;
    if (mode === 'movement') return l.buildings.filter((b) => b.state !== 'destroyed' && !OPEN.has(b.type)).map((b) => b.id).join();
    return '';
  }

  /** The mode's tint (cached until its key changes); null for Normal. */
  tint(mode: MapMode, l: Live): Tint | null {
    if (mode === 'normal') return null;
    const key = this.key(mode, l), c = this.cache.get(mode);
    if (c && c.key === key) return c.t;
    const t = this.build(mode, l);
    this.cache.set(mode, { key, t });
    return t;
  }

  private build(mode: MapMode, l: Live): Tint {
    const { r, w, h } = this, nt = w * h;
    if (mode === 'altitude') {
      const at = new Int16Array(this.fw * this.fh), SH = KINDS.indexOf('shallow'), DP = KINDS.indexOf('deep');
      for (let j = 0; j < at.length; j++) at[j] = this.kind[j] === SH ? 12 : this.kind[j] === DP ? 13 : altBand(this.z[j]);
      return { mode, pal: [...ALT_RGB, ...WATER_RGB], alpha: 0.55, at, fine: true, line: 'dark',
        legend: [{ c: ALT_RGB[11], label: 'Peaks, level 31+' }, { c: ALT_RGB[10], label: 'Mountains, 21–30' }, { c: ALT_RGB[8], label: 'Hills, 8–12' }, { c: ALT_RGB[6], label: 'Level 6' },
          { c: ALT_RGB[3], label: 'Level 3' }, { c: ALT_RGB[0], label: 'Lowland, level 0' }, { c: WATER_RGB[0], label: 'Water' }, { c: [74, 46, 28], label: 'Contour: one level', line: true }] };
    }
    const at = new Int16Array(nt).fill(-1);
    if (mode === 'movement') {
      for (let i = 0; i < nt; i++) {
        const c = this.cost[i];
        at[i] = c === 0 ? 0 : c < 1 ? 1 : c === 1 ? -1 : c <= 1.6 ? 2 : 3;
      }
      for (const b of l.buildings) if (b.state !== 'destroyed' && !OPEN.has(b.type)) for (let k = 0; k + 1 < b.tiles.length; k += 2) at[b.tiles[k + 1] * w + b.tiles[k]] = 0;
      return { mode, pal: MOVE_RGB, alpha: 0.5, at, fine: false, line: 'cliff', hatch: [0],
        legend: [{ c: MOVE_RGB[1], label: 'Fast: roads' }, { c: PARCH_HI, label: 'Normal: open ground' }, { c: MOVE_RGB[2], label: 'Slow: forest, sand, snow' },
          { c: MOVE_RGB[3], label: 'Very slow: marsh, fords' }, { c: MOVE_RGB[0], label: 'No way: water, rock, walls', hatch: true }, { c: CLIFF_RGB, label: 'Cliff: 2+ levels, no climb', line: true }] };
    }
    if (mode === 'ownership') {
      for (let i = 0; i < nt; i++) if (this.zone[i]) at[i] = this.zone[i] === 1 ? 6 : 7;
      (r.claimPoints ?? []).forEach((p, k) => {
        const st = l.claims[k]?.state ?? 'locked';
        if (st === 'claimed') return;
        this.disc(p.x, p.y, p.r ?? CLAIM.r, (i) => { if (at[i] < 0) at[i] = st === 'locked' ? 5 : 4; });
      });
      const m = l.influence;
      if (m && m.w === w) for (let i = 0; i < nt; i++) {
        const v = m.mask[i];
        if (v) at[i] = v & 1 ? 0 : v & 2 ? 1 : v & 4 ? 2 : 3;
      }
      const pal: RGB[] = [...TEAM_RGB, [226, 178, 84], [138, 120, 106], [110, 86, 70], [240, 192, 80]];
      return { mode, pal, alpha: 0.42, at, fine: false, line: 'color', hatch: [4, 5, 6],
        legend: [{ c: TEAM_RGB[0], label: 'Your land' }, { c: TEAM_RGB[1], label: 'Enemy land' }, { c: pal[4], label: 'Claim zone, open', hatch: true }, { c: pal[5], label: 'Claim zone, guarded', hatch: true },
          { c: pal[6], label: 'No building here', hatch: true }, { c: pal[7], label: 'Region entry' }] };
    }
    if (mode === 'biomes') {
      for (let i = 0; i < nt; i++) at[i] = this.biome[i];
      const pal = this.biomeNames.map((b) => BIOME_RGB[b] ?? [180, 180, 180]);
      return { mode, pal, alpha: 0.5, at, fine: false, line: 'dark', legend: this.biomeNames.map((b, k) => ({ c: pal[k], label: BIOME_NAME[b] ?? b })) };
    }
    // resources
    const kinds = Object.keys(RES_RGB) as (keyof typeof RES_RGB)[], GUARD = kinds.length;
    for (const q of l.lairs) if (q.guard > 0 && q.state !== 'cleared') this.disc(q.x, q.y, q.guard, (i) => (at[i] = GUARD));
    const seen = new Set<string>();
    for (const nd of l.nodes) {
      const k = kinds.indexOf(nd.res);
      if (k < 0) continue;
      seen.add(nd.res);
      this.disc(nd.x, nd.y, 1.5, (i) => (at[i] = k));
    }
    const pal: RGB[] = [...kinds.map((k) => RES_RGB[k]), [180, 44, 34]];
    return { mode, pal, alpha: 0.6, at, fine: false, line: 'color', hatch: [GUARD],
      legend: [...kinds.filter((k) => seen.has(k)).map((k) => ({ c: RES_RGB[k], label: k[0].toUpperCase() + k.slice(1) })), { c: pal[GUARD], label: 'Guarded by a lair', hatch: true }] };
  }

  private disc(cx: number, cy: number, rad: number, f: (i: number) => void): void {
    const { w, h } = this;
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(h - 1, Math.ceil(cy + rad)); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(w - 1, Math.ceil(cx + rad)); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) f(y * w + x);
  }

  /** The tint's index at cell (fx, fy); -2 off the map. */
  private idx(t: Tint, fx: number, fy: number): number {
    if (fx < 0 || fy < 0 || fx >= this.fw || fy >= this.fh) return -2;
    return t.fine ? t.at[fy * this.fw + fx] : t.at[(fy >> 1) * this.w + (fx >> 1)];
  }

  /**
   * Bake the tint over the ground in world rect (x0, y0, w, h), ctx in world px (each 1 m cell's top at its level); lines
   * `px` canvas px wide at `scale`.
   */
  drawTint(ctx: CanvasRenderingContext2D, iso: IsoMap, t: Tint, x0: number, y0: number, w: number, h: number, scale: number): void {
    const FW = 16, FH = 8, { fw, fh, fz } = iso;
    const umin = Math.floor((x0 - iso.OX) / FW) - 2, umax = Math.ceil((x0 + w - iso.OX) / FW) + 2;
    const vmin = Math.floor((y0 - iso.OY - 2 * FH) / FH) - 2, vmax = Math.ceil((y0 + h - iso.OY + iso.top * LH) / FH) + 2;
    const fills = t.pal.map(() => new Path2D()), lines = t.pal.map(() => new Path2D()), dark = new Path2D();
    let any = false;
    const X = (fx: number, fy: number) => iso.OX + (fx - fy) * FW, Y = (fx: number, fy: number, z: number) => iso.OY + (fx + fy) * FH - z * LH;
    /** The line path of the edge between cells a (index ia) and its neighbour (nx, ny), or null. */
    const edge = (fx: number, fy: number, ia: number, nx: number, ny: number): Path2D | null => {
      const ib = this.idx(t, nx, ny);
      if (ib === -2) return null;
      if (t.line === 'cliff') {
        const ta = (fy >> 1) * this.w + (fx >> 1), tb = (ny >> 1) * this.w + (nx >> 1);
        return ta !== tb && Math.abs(this.r.height[ta] - this.r.height[tb]) >= 2 && this.cost[ta] > 0 && this.cost[tb] > 0 ? lines[0] : null;
      }
      if (ia === ib) return null;
      if (t.line === 'dark') return ia >= 0 && ib >= 0 ? dark : null;
      return ia >= 0 ? lines[ia] : ib >= 0 ? lines[ib] : null;
    };
    // runs along +x of cells with one index and level are one parallelogram (and one +y edge line)
    const fy0 = Math.max(0, Math.floor((vmin - umax) / 2)), fy1 = Math.min(fh - 1, Math.ceil((vmax - umin) / 2));
    const fx0 = Math.max(0, Math.floor((umin + vmin) / 2)), fx1 = Math.min(fw - 1, Math.ceil((umax + vmax) / 2));
    for (let fy = fy0; fy <= fy1; fy++) {
      let run = -1, runZ = 0, runA = -1, ly = -1, lyZ = 0, lyP: Path2D | null = null;
      const close = (end: number) => {
        if (run < 0) return;
        if (runA >= 0) {
          const p = fills[runA], z = runZ, e = end - 1;
          p.moveTo(X(run, fy), Y(run, fy, z)); p.lineTo(X(e, fy) + FW, Y(e, fy, z) + FH); p.lineTo(X(e, fy), Y(e, fy, z) + 2 * FH); p.lineTo(X(run, fy) - FW, Y(run, fy, z) + FH); p.closePath();
          any = true;
        }
        run = -1;
      };
      const closeLine = (end: number) => {
        if (ly < 0 || !lyP) { ly = -1; return; }
        lyP.moveTo(X(ly, fy) - FW, Y(ly, fy, lyZ) + FH); lyP.lineTo(X(end - 1, fy), Y(end - 1, fy, lyZ) + 2 * FH);
        any = true;
        ly = -1;
      };
      for (let fx = fx0; fx <= fx1 + 1; fx++) {
        const u = fx - fy, v = fx + fy;
        const inside = fx <= fx1 && u >= umin && u <= umax && v >= vmin && v <= vmax;
        if (!inside) { close(fx); closeLine(fx); continue; }
        const z = fz[fy * fw + fx], a = this.idx(t, fx, fy);
        if (run >= 0 && (a !== runA || z !== runZ)) close(fx);
        if (run < 0) { run = fx; runA = a; runZ = z; }
        if (!t.line) continue;
        // +x edge (right vertex -> bottom), one segment per cell
        const ex = edge(fx, fy, a, fx + 1, fy);
        if (ex) { ex.moveTo(X(fx, fy) + FW, Y(fx, fy, z) + FH); ex.lineTo(X(fx, fy), Y(fx, fy, z) + 2 * FH); any = true; }
        // +y edge (left vertex -> bottom), merged along the run
        const ey = edge(fx, fy, a, fx, fy + 1);
        if (ly >= 0 && (ey !== lyP || z !== lyZ)) closeLine(fx);
        if (ey && ly < 0) { ly = fx; lyZ = z; lyP = ey; }
      }
    }
    if (!any) return;
    ctx.save();
    ctx.globalAlpha = t.alpha;
    t.pal.forEach((c, k) => { ctx.fillStyle = css(c); ctx.fill(fills[k]); });
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 / scale;
    ctx.lineCap = 'round';
    if (t.line === 'dark') { ctx.strokeStyle = 'rgba(40,26,18,0.7)'; ctx.stroke(dark); }
    else if (t.line === 'cliff') { ctx.strokeStyle = 'rgba(255,60,40,0.95)'; ctx.stroke(lines[0]); }
    else t.pal.forEach((c, k) => { ctx.strokeStyle = css(c, 0.95); ctx.stroke(lines[k]); });
    ctx.restore();
  }

  /** The map in tile space, one px per cell: hillshaded ground, clear water, the mode's tint and its lines. */
  paint(t: Tint | null, out?: ImageData): ImageData {
    const { fw, fh, kind, z } = this, img = out ?? new ImageData(fw, fh), d = img.data;
    const SH = KINDS.indexOf('shallow'), DP = KINDS.indexOf('deep');
    const zz = (x: number, y: number) => z[Math.max(0, Math.min(fh - 1, y)) * fw + Math.max(0, Math.min(fw - 1, x))];
    const rgb = KINDS.map((k) => KIND_RGB[k] ?? [140, 140, 140]);
    // info modes sit on parchment: the terrain's lightness between PARCH_LO and PARCH_HI, water in pale ink
    const parch = rgb.map((c, k): RGB => {
      if (k === SH || k === DP) return PARCH_WATER[k === SH ? 0 : 1];
      const v = Math.max(0, Math.min(1, ((0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255 - 0.25) / 0.55));
      return [0, 1, 2].map((i) => PARCH_LO[i] + (PARCH_HI[i] - PARCH_LO[i]) * (0.35 + 0.65 * v)) as RGB;
    });
    const base = t ? parch : rgb, alt = t?.mode === 'altitude', hatch = new Set(t?.hatch ?? []);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const j = y * fw + x, k = kind[j], wet = k === SH || k === DP;
      let c = base[k], s = 1;
      if (!wet) {
        // light from the NW: ground rising toward +x / +y faces it (stronger relief in altitude)
        const r = alt ? 1.5 : 1;
        s = 1 + r * (0.09 * (zz(x + 1, y) - zz(x - 1, y)) + 0.05 * (zz(x, y + 1) - zz(x, y - 1))) + (t ? 0 : Math.min(0.15, z[j] * 0.006));
        s = Math.max(0.55, Math.min(1.45, s));
      } else if (k === DP && (kind[j - 1] !== DP || kind[j - fw] !== DP)) s = 0.9;
      let line = false;
      if (t) {
        const a = this.idx(t, x, y);
        if (a >= 0) {
          const p = t.pal[a], m = alt ? 0.9 : Math.min(0.8, t.alpha + 0.15);
          c = [c[0] * (1 - m) + p[0] * m, c[1] * (1 - m) + p[1] * m, c[2] * (1 - m) + p[2] * m];
          // zones and no-go ground: diagonal strokes every 4 cells
          if (hatch.has(a) && ((x + y) & 3) === 0) c = t.mode === 'movement' ? [196, 170, 130] : [c[0] * 0.55, c[1] * 0.5, c[2] * 0.45];
        }
        if (t.line === 'cliff') {
          const ta = this.tile(j), cliff = (nb: number) => Math.abs(this.r.height[ta] - this.r.height[nb]) >= 2 && this.cost[ta] > 0 && this.cost[nb] > 0;
          line = ((x & 1) === 1 && x + 1 < fw && cliff(ta + 1)) || ((y & 1) === 1 && y + 1 < fh && cliff(ta + this.w));
        } else if (t.line === 'dark') {
          const b = this.idx(t, x + 1, y), e = this.idx(t, x, y + 1);
          line = a >= 0 && ((b >= 0 && b !== a) || (e >= 0 && e !== a));
        } else if (t.line === 'color') {
          const b = this.idx(t, x + 1, y), e = this.idx(t, x, y + 1);
          line = (b !== -2 && b !== a) || (e !== -2 && e !== a);
          const q = a >= 0 ? a : b >= 0 ? b : e;
          if (line && q >= 0) { c = t.pal[q]; s = 1.1; }
        }
      }
      if (line && t?.line === 'dark') { if (alt) c = [c[0] * 0.5 + 37, c[1] * 0.5 + 23, c[2] * 0.5 + 14]; s *= alt ? 0.7 : 0.6; }
      if (line && t?.line === 'cliff') { c = CLIFF_RGB; s = 1; }
      const o = j * 4;
      d[o] = Math.min(255, c[0] * s); d[o + 1] = Math.min(255, c[1] * s); d[o + 2] = Math.min(255, c[2] * s); d[o + 3] = 255;
    }
    return img;
  }

  /** A few words on the ground at tile (x, y), for the full map's tooltip. */
  describe(x: number, y: number, l: Live): string[] {
    const { w } = this, i = Math.floor(y) * w + Math.floor(x), j = Math.floor(2 * y) * this.fw + Math.floor(2 * x);
    const k = KINDS[this.kind[j]], c = this.cost[i];
    const move = c === 0 ? 'impassable' : c < 1 ? 'fast (road)' : c === 1 ? 'open' : c <= 1.6 ? 'slow' : 'very slow';
    const owner = l.influence?.mask[i] ? (l.influence.mask[i] & 1 ? 'yours' : 'enemy') : 'unowned';
    const b = this.biomeNames[this.biome[i]] ?? '';
    const out = [`${k}${this.r.water[i] ? '' : ` · level ${this.z[j]}`}`, `${BIOME_NAME[b] ?? b} · ${move}`, `${owner}${this.zone[i] === 1 ? ' · no building' : this.zone[i] === 2 ? ' · region entry' : ''}`];
    return out;
  }
}
