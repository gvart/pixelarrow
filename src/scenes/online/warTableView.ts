/**
 * The war table (docs/DESIGN_V2.md "Hex map: a map on a war table"): the
 * shard's hexes as raised painted tiles on a wooden table, with miniature
 * props, painted armies and neutral garrisons, clan borders and pennants,
 * the unexplored map as parchment under drifting clouds, animated water,
 * smoke from towns and moving armies.
 *
 * Performance (mid-range phones, ~3.5k hexes): everything static (parchment,
 * tiles, props, borders, garrisons) is baked into a few 1024 px render
 * textures when the map loads, so a frame draws 4 big quads plus the moving
 * parts (a blitter of water glints and clouds, a pool of smoke puffs, the
 * armies, the selection). Textures are generated once per game (src/art/warTable.ts).
 */
import Phaser from 'phaser';
import { ELEV, FOG_ELEV, ROW_H, TILE_H, TILE_W, boardBounds, drawOrder, fromUnit, hexTop, inTopFace, pickHex, shardHexes, topCorners } from '../../online/board';
import { HEX_DIRS, hexDistance, hexId, type Axial, type HexType } from '../../online/hex';
import type { HexView, MapView } from '../../online/client';
import { LiveArmies, type ArmyPose } from '../../online/liveArmies';
import {
  LAIR_PROPS,
  renderCloud,
  renderDoodle,
  renderFlag,
  renderFogTile,
  renderHexFill,
  renderMini,
  renderPin,
  renderProp,
  renderSmoke,
  renderTableWood,
  renderTile,
  renderTileShadow,
  renderWaterGlint,
  type Doodle,
  type MiniKind,
  type PropKind,
  type Sprite,
} from '../../art/warTable';
import { hash2, Pix } from '../../art/pixels';
import { mix } from '../../art/palette';
import type { EncounterId } from '../../data/beasts';

const CHUNK = 1152;
const VARIANTS = 4;

/** Territory colours: muted paints on the board. */
export const TERRITORY = { mine: 0x3f78c0, clan: 0x2ea89a, hostile: 0xb83a2c, others: [0xb83a2c, 0x8a4aa0, 0xc8762a, 0xa02f5a, 0xb89a2c, 0x7a5a48, 0x6a3a8a, 0x9a6a3a] };

export function territoryColor(map: Pick<MapView, 'you'>, h: Pick<HexView, 'owner' | 'clan'>): number | null {
  if (h.owner === null) return null;
  if (h.owner === map.you.id) return TERRITORY.mine;
  if (map.you.clan !== null && h.clan === map.you.clan) return TERRITORY.clan;
  const id = h.clan ?? h.owner;
  return TERRITORY.others[Math.abs(Math.imul(id, 2654435761)) % TERRITORY.others.length];
}

/** Anchors of generated textures (top-left = position - anchor). */
const anchors = new Map<string, { ax: number; ay: number }>();

function ensure(scene: Phaser.Scene, key: string, make: () => Sprite | Pix): string {
  if (!scene.textures.exists(key)) {
    const s = make();
    const sp = s instanceof Pix ? { pix: s, ax: s.w / 2, ay: s.h / 2 } : s;
    scene.textures.addCanvas(key, sp.pix.toCanvas());
    anchors.set(key, { ax: sp.ax, ay: sp.ay });
  } else if (!anchors.has(key)) {
    // texture made by an earlier scene instance before a hot reload: centre anchor
    const f = scene.textures.getFrame(key);
    anchors.set(key, { ax: f.width / 2, ay: f.height / 2 });
  }
  return key;
}

/** A texture holding several same-size frames side by side (frames named 0..n-1), for blitters. */
function sheet(scene: Phaser.Scene, key: string, frames: Pix[]): void {
  if (scene.textures.exists(key)) return;
  const w = frames[0].w;
  const h = frames[0].h;
  const all = new Pix(w * frames.length, h);
  frames.forEach((f, i) => all.blit(f, i * w, 0));
  const tex = scene.textures.addCanvas(key, all.toCanvas())!;
  frames.forEach((_f, i) => tex.add(i, 0, i * w, 0, w, h));
}

const PROP_VARIANTS: Partial<Record<PropKind, number>> = { tree: 3, cypress: 3, rock: 3, peak: 2, mound: 2, house: 3, farm: 2, town: 2, ruins: 2 };

export interface PropPlace {
  kind: PropKind;
  v: number;
  dx: number;
  dy: number;
}

/** Deterministic dressing of a hex: which miniatures stand where on its top. */
export function propsFor(h: Pick<HexView, 'q' | 'r' | 'type' | 'fort' | 'capital' | 'occupant' | 'home' | 'lair' | 'boss'>): PropPlace[] {
  const rnd = (i: number) => hash2(h.q * 7 + i, h.r * 13 - i, 4242);
  const v = (k: PropKind, i: number) => Math.floor(rnd(i) * (PROP_VARIANTS[k] ?? 1));
  const out: PropPlace[] = [];
  const add = (kind: PropKind, dx: number, dy: number, i = out.length) => out.push({ kind, v: v(kind, i + 20), dx, dy });
  if (h.capital) add('capital', 0, 4);
  else if (h.fort) add('fort', 0, 3);
  else if (h.occupant === 'beast') out.push({ kind: 'lair', v: Math.max(0, LAIR_PROPS.indexOf((h.boss ?? h.lair ?? 'hydra') as EncounterId)), dx: -1, dy: 2 });
  else
    switch (h.type) {
      case 'forest': {
        const spots: [number, number][] = [[-7, -3], [0, -5], [7, -3], [-4, 1], [4, 1], [-8, 4], [1, 5], [8, 4]];
        spots.forEach(([x, y], i) => {
          if (rnd(i) < 0.18) return;
          add(rnd(i + 9) < 0.35 ? 'cypress' : 'tree', x + Math.round((rnd(i + 3) - 0.5) * 2), y + Math.round((rnd(i + 5) - 0.5) * 2), i);
        });
        break;
      }
      case 'mountain':
        add('peak', 0, 5);
        break;
      case 'hills':
        add('mound', -4, 0);
        if (rnd(1) < 0.6) add('rock', 6, 3);
        if (rnd(2) < 0.5) add('tree', 5, -3);
        break;
      case 'mine':
        add('mine', 0, 2);
        break;
      case 'town':
        add('town', 0, 3);
        break;
      case 'farmland':
        add('farm', rnd(1) < 0.5 ? -4 : 3, 1);
        break;
      case 'ruins':
        add(rnd(1) < 0.4 ? 'shrine' : 'ruins', 0, 2);
        break;
      case 'plains':
        if (rnd(1) < 0.45) add('tree', Math.round((rnd(2) - 0.5) * 14), Math.round((rnd(3) - 0.5) * 6));
        if (rnd(4) < 0.35) add('rock', Math.round((rnd(5) - 0.5) * 16), Math.round((rnd(6) - 0.5) * 6));
        if (rnd(7) < 0.25) add('cypress', Math.round((rnd(8) - 0.5) * 14), -3);
        break;
      default:
        break;
    }
  if (h.home) add('camp', -7, -1);
  return out.sort((a, b) => a.dy - b.dy);
}

/** Neutral garrison miniature for a hex. */
export function miniFor(h: Pick<HexView, 'owner' | 'occupant' | 'def' | 'type' | 'lair' | 'boss'>): MiniKind | null {
  if (h.owner !== null) return null;
  if (h.occupant === 'beast') return h.boss || h.lair ? (`beast_${h.boss ?? h.lair}` as MiniKind) : 'beast';
  if (h.occupant !== 'npc' || !h.def) return null;
  return (['militia', 'beasts', 'outlaws', 'tribes', 'pirates', 'deserters', 'city', 'cultists'] as const).find((k) => k === h.def) ?? 'militia';
}

interface ArmyObj {
  c: Phaser.GameObjects.Container;
  mini: Phaser.GameObjects.Image;
  flag: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Ellipse | null;
  color: number;
  phase: number;
}

interface Smoke {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  t: number;
  life: number;
}

export class WarTableView {
  readonly armies: LiveArmies;
  private hexes = new Map<string, HexView>();
  private radius = 34;
  private chunks: Phaser.GameObjects.RenderTexture[] = [];
  private glints: Phaser.GameObjects.Blitter | null = null;
  private glintBobs: { bob: Phaser.GameObjects.Bob; phase: number }[] = [];
  private clouds: Phaser.GameObjects.Blitter | null = null;
  private cloudBobs: { bob: Phaser.GameObjects.Bob; x: number; y: number; phase: number; amp: number }[] = [];
  private smokeSources: { x: number; y: number; next: number }[] = [];
  private smokes: Smoke[] = [];
  private armyObjs = new Map<number, ArmyObj>();
  private armyVersion = -1;
  private routeG: Phaser.GameObjects.Graphics;
  private marchG: Phaser.GameObjects.Graphics;
  private marchDrawn = -1;
  private ownerClan = new Map<number, number | null>();
  private selImg: Phaser.GameObjects.Image | null = null;
  private selected: Axial | null = null;
  private route: { path: Axial[]; own: boolean } | null = null;
  private map: MapView | null = null;
  private frontier = new Set<string>();
  private dyn: Phaser.GameObjects.Container;
  private lastGlint = -1;

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Layer,
    me: number,
  ) {
    this.armies = new LiveArmies(me, (q, r) => this.hexes.has(hexId(q, r)));
    this.routeG = scene.add.graphics();
    this.marchG = scene.add.graphics();
    this.dyn = scene.add.container(0, 0);
  }

  // ------------------------------------------------------------------ build

  /** (Re)builds the board for a map answer; static layers are baked into render textures. */
  build(map: MapView, ownPath: { path: [number, number][]; at: number[] } | null, localNow = Date.now()): void {
    const scene = this.scene;
    this.map = map;
    this.radius = map.shard.radius;
    this.hexes = new Map(map.hexes.map((h) => [hexId(h.q, h.r), h]));
    this.prepareTextures();
    // the table (dark oak planks around the board) is baked into the chunks too: one layer less to fill per frame
    const b = this.tableBounds();

    // static chunks
    for (const c of this.chunks) c.destroy();
    this.chunks = [];
    const cols = Math.ceil(b.w / CHUNK);
    const rows = Math.ceil(b.h / CHUNK);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const rt = scene.add.renderTexture(b.x + i * CHUNK, b.y + j * CHUNK, Math.min(CHUNK, b.w - i * CHUNK), Math.min(CHUNK, b.h - j * CHUNK)).setOrigin(0, 0);
        rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.chunks.push(rt);
      }
    this.layer.add(this.chunks);
    // Collect every stamp first, then draw each chunk in one batch (one render target bound at a time).
    const stamps: { key: string; x: number; y: number; w: number; h: number }[] = [];
    const stamp = (key: string, x: number, y: number) => {
      const a = anchors.get(key)!;
      const f = scene.textures.getFrame(key);
      stamps.push({ key, x: Math.round(x - a.ax), y: Math.round(y - a.ay), w: f.width, h: f.height });
    };
    const tw = scene.textures.getFrame('wt_table');
    for (let y = Math.floor(b.y / tw.height) * tw.height; y < b.y + b.h; y += tw.height)
      for (let x = Math.floor(b.x / tw.width) * tw.width; x < b.x + b.w; x += tw.width) stamps.push({ key: 'wt_table', x, y, w: tw.width, h: tw.height });
    const all = shardHexes(this.radius);
    // the parchment map, with its shadow on the table
    for (const h of all) if (hexDistance(h, { q: 0, r: 0 }) === this.radius) stamp('wt_shadow', hexTop(h.q, h.r, 0).x + 3, hexTop(h.q, h.r, 0).y + 4);
    for (const h of all) stamp(`wt_fog_${(Math.abs(h.q * 3 + h.r * 5) + (h.q & h.r)) % VARIANTS}`, hexTop(h.q, h.r, FOG_ELEV).x, hexTop(h.q, h.r, FOG_ELEV).y);
    // ink doodles here and there on the old map (decoration only)
    const doodles: Doodle[] = ['hills', 'trees', 'waves', 'peak'];
    for (const h of all) {
      if (this.hexes.has(hexId(h.q, h.r)) || hash2(h.q, h.r, 91) > 0.11) continue;
      const d = doodles[Math.floor(hash2(h.q, h.r, 92) * doodles.length)];
      stamp(ensure(scene, `wt_doodle_${d}`, () => renderDoodle(d)), hexTop(h.q, h.r, 0).x, hexTop(h.q, h.r, 0).y);
    }
    // raised tiles: shadows first, then tiles and their dressing back to front
    const known = drawOrder(map.hexes);
    for (const h of known) {
      const p = hexTop(h.q, h.r, 0);
      stamp('wt_shadow', p.x + 3, p.y + 3);
    }
    // neutral garrisons stand on every hex next to your (and your clan's) land and army; further out on some, so the table stays readable
    this.frontier = new Set<string>();
    const friendly = map.hexes.filter((h) => h.owner !== null && (h.owner === map.you.id || (map.you.clan !== null && h.clan === map.you.clan)));
    for (const f of [...friendly, map.you.army]) for (const d of [{ q: 0, r: 0 }, ...HEX_DIRS]) this.frontier.add(hexId(f.q + d.q, f.r + d.r));
    for (const h of known) this.stampHex(h, stamp);
    for (const rt of this.chunks) {
      rt.beginDraw();
      for (const st of stamps) {
        if (st.x + st.w < rt.x || st.x > rt.x + rt.width || st.y + st.h < rt.y || st.y > rt.y + rt.height) continue;
        rt.batchDrawFrame(st.key, undefined, st.x - rt.x, st.y - rt.y);
      }
      rt.endDraw();
    }

    this.buildGlints(known);
    this.buildClouds();
    this.buildSmoke(known);

    // armies
    this.armies.me = map.you.id;
    this.armies.load(map.armies.map((a) => (a.player === map.you.id && ownPath ? { ...a, path: ownPath.path, at: ownPath.at } : a)), map.players, map.now, localNow);
    for (const o of this.armyObjs.values()) o.c.destroy();
    this.armyObjs.clear();
    this.armyVersion = -1;
    // dynamic objects above the board
    this.ownerClan = new Map(map.hexes.filter((h) => h.owner !== null).map((h) => [h.owner as number, h.clan]));
    this.marchDrawn = -1;
    this.layer.add([this.marchG, this.routeG, this.dyn]);
    this.layer.bringToTop(this.marchG);
    this.layer.bringToTop(this.routeG);
    this.layer.bringToTop(this.dyn);
    this.drawSelection(0);
    this.drawRoute();
  }

  private prepareTextures(): void {
    const s = this.scene;
    const types: HexType[] = ['plains', 'farmland', 'forest', 'hills', 'mine', 'town', 'ruins', 'water', 'mountain'];
    for (const t of types) for (let v = 0; v < VARIANTS; v++) ensure(s, `wt_tile_${t}_${v}`, () => renderTile(t, v));
    for (let v = 0; v < VARIANTS; v++) ensure(s, `wt_fog_${v}`, () => renderFogTile(v));
    ensure(s, 'wt_shadow', () => renderTileShadow());
    ensure(s, 'wt_table', () => renderTableWood());
    ensure(s, 'wt_smoke', () => renderSmoke());
    // blitter sheets: one texture, a frame per variant
    sheet(s, 'wt_clouds', [0, 1, 2].map((v) => renderCloud(v)));
    sheet(s, 'wt_glints', [0, 1, 2, 3].map((f) => renderWaterGlint(f)));
  }

  private propKey(kind: PropKind, v: number): string {
    return ensure(this.scene, `wt_prop_${kind}_${v}`, () => renderProp(kind, v));
  }

  private miniKey(kind: MiniKind): string {
    return ensure(this.scene, `wt_mini_${kind}`, () => renderMini(kind));
  }

  private stampHex(h: HexView, stamp: (key: string, x: number, y: number) => void): void {
    const e = ELEV[h.type];
    const c = hexTop(h.q, h.r, e);
    const v = Math.floor(hash2(h.q, h.r, 77) * VARIANTS);
    stamp(`wt_tile_${h.type}_${v}`, c.x, c.y);
    const map = this.map!;
    const col = territoryColor(map, h);
    if (col !== null) {
      stamp(ensure(this.scene, `wt_fill_${col}`, () => renderHexFill(col, 0.3)), c.x, c.y);
      // borders: the edges facing another holder
      const group = (x: HexView | undefined) => (x && x.owner !== null ? (x.clan !== null ? `c${x.clan}` : `p${x.owner}`) : '');
      const mineG = group(h);
      // edge i lies between corners i and i + 1 of topCorners(): neighbours in that direction
      const EDGE_DIRS = [1, 0, 5, 4, 3, 2].map((i) => HEX_DIRS[i]);
      EDGE_DIRS.forEach((d, i) => {
        const n = this.hexes.get(hexId(h.q + d.q, h.r + d.r));
        if (group(n) === mineG) return;
        stamp(ensure(this.scene, `wt_edge_${col}_${i}`, () => renderEdge(col, i)), c.x, c.y);
      });
    }
    for (const p of propsFor(h)) stamp(this.propKey(p.kind, p.v), c.x + p.dx, c.y + p.dy);
    const m = miniFor(h);
    const show = m && (this.frontier.has(hexId(h.q, h.r)) || h.tier >= 3 || m.startsWith('beast') || hash2(h.q, h.r, 55) < 0.3);
    if (m && show) stamp(this.miniKey(m), c.x + 7, c.y + 5);
    if (col !== null) stamp(ensure(this.scene, `wt_pin_${col}`, () => renderPin(col)), c.x + (h.home ? -3 : 8), c.y + (h.home ? -2 : -1));
  }

  private buildGlints(known: HexView[]): void {
    this.glints?.destroy();
    this.glintBobs = [];
    const water = known.filter((h) => h.type === 'water');
    if (!water.length) {
      this.glints = null;
      return;
    }
    this.glints = this.scene.add.blitter(0, 0, 'wt_glints', 0);
    this.layer.add(this.glints);
    for (const h of water) {
      const c = hexTop(h.q, h.r, ELEV.water);
      const bob = this.glints.create(c.x - TILE_W / 2, c.y - TILE_H / 2);
      this.glintBobs.push({ bob, phase: Math.floor(hash2(h.q, h.r, 5) * 4) });
    }
  }

  private buildClouds(): void {
    this.clouds?.destroy();
    this.cloudBobs = [];
    this.clouds = this.scene.add.blitter(0, 0, 'wt_clouds', 0);
    this.layer.add(this.clouds);
    // clouds hang over the fog next to what you can see (ring 1 every hex, ring 2 every other one)
    const seen = this.hexes;
    const ring = new Map<string, { h: Axial; d: number }>();
    for (const h of seen.values())
      for (const d1 of HEX_DIRS) {
        const a = { q: h.q + d1.q, r: h.r + d1.r };
        if (seen.has(hexId(a.q, a.r)) || hexDistance(a, { q: 0, r: 0 }) > this.radius) continue;
        ring.set(hexId(a.q, a.r), { h: a, d: 1 });
        for (const d2 of HEX_DIRS) {
          const b = { q: a.q + d2.q, r: a.r + d2.r };
          const k = hexId(b.q, b.r);
          if (seen.has(k) || ring.has(k) || hexDistance(b, { q: 0, r: 0 }) > this.radius) continue;
          ring.set(k, { h: b, d: 2 });
        }
      }
    for (const { h, d } of ring.values()) {
      if (d === 2 && (h.q + h.r * 2) % 2 !== 0) continue;
      const c = hexTop(h.q, h.r, 0);
      const v = Math.floor(hash2(h.q, h.r, 31) * 3);
      const x = c.x - 26 + (hash2(h.q, h.r, 32) - 0.5) * 8;
      const y = c.y - 20 + (hash2(h.q, h.r, 33) - 0.5) * 6;
      const bob = this.clouds.create(x, y, v);
      bob.setAlpha(d === 1 ? 0.78 : 0.92);
      this.cloudBobs.push({ bob, x, y, phase: hash2(h.q, h.r, 34) * Math.PI * 2, amp: 3 + hash2(h.q, h.r, 35) * 4 });
    }
  }

  private buildSmoke(known: HexView[]): void {
    for (const s of this.smokes) s.img.destroy();
    this.smokes = [];
    this.smokeSources = [];
    for (const h of known) {
      if (!(h.type === 'town' || h.capital || h.fort || h.home)) continue;
      const c = hexTop(h.q, h.r, ELEV[h.type]);
      const n = h.capital ? 3 : h.type === 'town' ? 2 : 1;
      for (let i = 0; i < n; i++) this.smokeSources.push({ x: c.x - 6 + i * 6 + (h.home ? -6 : 0), y: c.y - 6 - (h.fort ? 8 : 0), next: hash2(h.q, h.r, i) * 1500 });
    }
  }

  // ------------------------------------------------------------------ world bosses

  private bossG: Phaser.GameObjects.Graphics | null = null;

  /** HP bars over the world bosses in sight (f = HP fraction; dead bosses show an empty bar). */
  setBossBars(bars: { q: number; r: number; f: number; dead: boolean }[]): void {
    this.bossG?.destroy();
    this.bossG = null;
    const g = this.scene.add.graphics().setDepth(1e6);
    this.layer.add(g);
    this.bossG = g;
    for (const b of bars) {
      const h = this.hexes.get(hexId(b.q, b.r));
      if (!h) continue;
      const c = hexTop(b.q, b.r, ELEV[h.type]);
      const w = 26;
      const x = Math.round(c.x + 7 - w / 2);
      const y = Math.round(c.y - 34);
      g.fillStyle(0x1d140f, 0.9);
      g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle(0x3a2a22, 1);
      g.fillRect(x, y, w, 4);
      g.fillStyle(b.dead ? 0x5a4a40 : 0xc0402c, 1);
      g.fillRect(x, y, Math.max(b.dead ? 0 : 1, Math.round(w * b.f)), 4);
      g.fillStyle(0xffffff, 0.3);
      g.fillRect(x, y, Math.round(w * b.f), 1);
    }
  }

  // ------------------------------------------------------------------ queries

  /** Height of a hex's tile (null outside the shard; flat parchment in the fog). */
  elevOf = (q: number, r: number): number | null => {
    const h = this.hexes.get(hexId(q, r));
    if (h) return ELEV[h.type];
    return hexDistance({ q, r }, { q: 0, r: 0 }) <= this.radius ? FOG_ELEV : null;
  };

  /** The hex under a board point (top tile first). */
  pick(x: number, y: number): Axial | null {
    return pickHex(x, y, this.elevOf);
  }

  known(h: Axial): HexView | undefined {
    return this.hexes.get(hexId(h.q, h.r));
  }

  /** Board position of a hex's top centre. */
  top(h: Axial): { x: number; y: number } {
    return hexTop(h.q, h.r, this.elevOf(h.q, h.r) ?? 0);
  }

  bounds(): { x: number; y: number; w: number; h: number } {
    return boardBounds(this.radius);
  }

  /** The board plus a margin of table around it (what the chunks cover). */
  tableBounds(): { x: number; y: number; w: number; h: number } {
    const b = boardBounds(this.radius);
    const m = 96;
    return { x: b.x - m, y: b.y - m, w: b.w + m * 2, h: b.h + m * 2 };
  }

  // ------------------------------------------------------------------ dynamic state

  setSelected(h: Axial | null): void {
    this.selected = h;
    this.drawSelection(this.scene.time.now);
  }

  /** The route to show: your army's march, or a planned one (dotted). */
  setRoute(path: Axial[] | null, own = false): void {
    this.route = path && path.length > 1 ? { path, own } : null;
    this.drawRoute();
  }

  private drawRoute(): void {
    const g = this.routeG;
    g.clear();
    if (!this.route) return;
    const pts = this.route.path.map((h) => {
      const t = this.top(h);
      return { x: t.x, y: t.y + 2 };
    });
    const col = this.route.own ? 0xf6e6c0 : 0xfff4d8;
    // dashes along the way
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.floor(len / 4));
      for (let k = 0; k < n; k += 2) {
        const t0 = k / n;
        const t1 = Math.min(1, (k + 1) / n);
        g.lineStyle(2, 0x1d140f, 0.45);
        g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 + 1, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 + 1);
        g.lineStyle(1, col, this.route.own ? 1 : 0.85);
        g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
    // a small marker at the front edge of the goal (the hex's props stay visible)
    const end = pts[pts.length - 1];
    g.fillStyle(0x1d140f, 0.5);
    g.fillEllipse(end.x, end.y + 7, 7, 4);
    g.fillStyle(this.route.own ? 0xd8a840 : col, 1);
    g.fillEllipse(end.x, end.y + 6, 5, 3);
  }

  /** The selected hex: a pre-drawn glowing outline whose light pulses (no per-frame geometry). */
  private drawSelection(time: number): void {
    if (!this.selected) {
      this.selImg?.setVisible(false);
      return;
    }
    if (!this.selImg) {
      const key = ensure(this.scene, 'wt_select', () => renderSelection());
      const a = anchors.get(key)!;
      const f = this.scene.textures.getFrame(key);
      this.selImg = this.scene.add.image(0, 0, key).setOrigin(a.ax / f.width, a.ay / f.height);
      this.layer.add(this.selImg);
    }
    const c = this.top(this.selected);
    this.selImg.setVisible(true).setPosition(c.x, c.y);
    this.selImg.setAlpha(0.65 + Math.sin(time / 260) * 0.35);
    this.layer.bringToTop(this.selImg);
    this.layer.bringToTop(this.dyn);
  }

  /** Per frame: water, clouds, smoke, flags, armies, the selection pulse. */
  update(time: number, delta: number, localNow = Date.now()): void {
    // water glints: 4 frames, ~4 per second, per-hex phase
    const gf = Math.floor(time / 260);
    if (gf !== this.lastGlint && this.glints) {
      this.lastGlint = gf;
      for (const g of this.glintBobs) g.bob.setFrame((gf + g.phase) % 4);
    }
    // clouds drift slowly
    for (const c of this.cloudBobs) {
      c.bob.x = c.x + Math.sin(time / 5200 + c.phase) * c.amp;
      c.bob.y = c.y + Math.sin(time / 7100 + c.phase * 1.7) * 1.5;
    }
    this.updateSmoke(time, delta);
    if (this.selected) this.drawSelection(time);
    this.updateArmies(time, localNow);
  }

  private updateSmoke(time: number, delta: number): void {
    for (const src of this.smokeSources) {
      src.next -= delta;
      if (src.next > 0) continue;
      src.next = 700 + Math.random() * 900;
      let s = this.smokes.find((x) => !x.img.visible);
      if (!s) {
        if (this.smokes.length > 80) continue;
        const img = this.scene.add.image(0, 0, 'wt_smoke');
        this.dyn.addAt(img, 0);
        s = { img, x: 0, y: 0, t: 0, life: 0 };
        this.smokes.push(s);
      }
      s.x = src.x + (Math.random() - 0.5) * 2;
      s.y = src.y;
      s.t = 0;
      s.life = 2400 + Math.random() * 1200;
      s.img.setVisible(true);
    }
    for (const s of this.smokes) {
      if (!s.img.visible) continue;
      s.t += delta;
      const k = s.t / s.life;
      if (k >= 1) {
        s.img.setVisible(false);
        continue;
      }
      s.img.setPosition(Math.round(s.x + Math.sin(time / 600 + s.x) * 2 + k * 9), Math.round(s.y - k * 22));
      s.img.setAlpha((1 - k) * 0.55);
      s.img.setScale(0.6 + k * 1.2);
    }
  }

  /** An army's banner colour: yours, your clan's, its owner's land colour, or hostile red for strangers. */
  private armyColor(player: number): number {
    const map = this.map!;
    const a = this.armies.armies.get(player);
    if (a?.own || player === map.you.id) return TERRITORY.mine;
    const clan = a?.clan ?? this.ownerClan.get(player) ?? null;
    if (clan !== null && clan === map.you.clan) return TERRITORY.clan;
    if (clan !== null || this.ownerClan.has(player)) return territoryColor(map, { owner: player, clan }) ?? TERRITORY.hostile;
    return TERRITORY.hostile;
  }

  /** Dotted routes of the other armies marching in sight (redrawn when the march data changes). */
  private drawMarches(localNow: number): void {
    const g = this.marchG;
    g.clear();
    const t = this.armies.serverTime(localNow);
    for (const a of this.armies.armies.values()) {
      if (a.own || !a.steps || a.steps.length < 2) continue;
      const col = this.armyColor(a.player);
      for (let i = 1; i < a.steps.length; i++) {
        const s0 = a.steps[i - 1];
        const s1 = a.steps[i];
        if (s0.until !== s1.at || hexDistance(s0, s1) !== 1 || (s1.until !== null && s1.until < t)) continue;
        const p0 = this.top(s0);
        const p1 = this.top(s1);
        for (let k = 0; k < 6; k += 2) {
          const u0 = k / 6;
          const u1 = (k + 1) / 6;
          g.lineStyle(2, 0x1d140f, 0.35);
          g.lineBetween(p0.x + (p1.x - p0.x) * u0, p0.y + 3 + (p1.y - p0.y) * u0, p0.x + (p1.x - p0.x) * u1, p0.y + 3 + (p1.y - p0.y) * u1);
          g.lineStyle(1, col, 0.9);
          g.lineBetween(p0.x + (p1.x - p0.x) * u0, p0.y + 2 + (p1.y - p0.y) * u0, p0.x + (p1.x - p0.x) * u1, p0.y + 2 + (p1.y - p0.y) * u1);
        }
      }
    }
  }

  private armyObj(pose: ArmyPose): ArmyObj {
    let o = this.armyObjs.get(pose.player);
    if (o) return o;
    const a = this.armies.armies.get(pose.player)!;
    const color = this.armyColor(pose.player);
    const c = this.scene.add.container(0, 0);
    let ring: Phaser.GameObjects.Ellipse | null = null;
    if (a.own) {
      ring = this.scene.add.ellipse(0, 0, 18, 9).setStrokeStyle(1, 0xf0d890, 0.9).setFillStyle(0xf0d890, 0.15);
      c.add(ring);
    }
    const mk = this.miniKey('army');
    const an = anchors.get(mk)!;
    const mini = this.scene.add.image(0, 0, mk).setOrigin(an.ax / this.scene.textures.getFrame(mk).width, an.ay / this.scene.textures.getFrame(mk).height);
    for (let f = 0; f < 3; f++) ensure(this.scene, `wt_flag_${color}_${f}`, () => renderFlag(color, f));
    const fk = `wt_flag_${color}_0`;
    const fa = anchors.get(fk)!;
    // the banner pole tops out ~11 px above the base centre, to its left
    const flag = this.scene.add.image(-6, -12, fk).setOrigin(fa.ax / 11, fa.ay / 9);
    c.add([mini, flag]);
    this.dyn.add(c);
    o = { c, mini, flag, ring, color, phase: hash2(pose.player, 1, 3) * 1000 };
    this.armyObjs.set(pose.player, o);
    return o;
  }

  private updateArmies(time: number, localNow: number): void {
    this.armies.settle(localNow);
    const tick = Math.floor(time / 2000);
    if (this.marchDrawn !== this.armies.version * 100000 + tick) {
      this.marchDrawn = this.armies.version * 100000 + tick;
      this.drawMarches(localNow);
    }
    const poses = this.armies.poses(localNow);
    if (this.armyVersion !== this.armies.version) {
      this.armyVersion = this.armies.version;
      for (const [pid, o] of this.armyObjs)
        if (!this.armies.armies.has(pid)) {
          o.c.destroy();
          this.armyObjs.delete(pid);
        }
    }
    for (const p of poses) {
      const o = this.armyObj(p);
      o.c.setVisible(p.visible);
      if (!p.visible) continue;
      const b = fromUnit(p.x, p.y);
      // height follows the tiles under the march
      const e0 = this.elevOf(p.q, p.r) ?? 0;
      let e = e0;
      const next = p.moving ? this.nextHex(p) : null;
      if (next) {
        // fraction of the way to the next hex
        const here = hexTop(p.q, p.r, 0);
        const there = hexTop(next.q, next.r, 0);
        const k = Math.min(1, Math.hypot(b.x - here.x, b.y - here.y) / Math.max(1, Math.hypot(there.x - here.x, there.y - here.y)));
        e = e0 + ((this.elevOf(next.q, next.r) ?? e0) - e0) * k;
      }
      const bobY = p.moving ? Math.abs(Math.sin((time + o.phase) / 140)) * -1.5 : 0;
      const standOff = p.moving ? 0 : -5; // standing armies keep to the back left of the hex, clear of the garrison
      o.c.setPosition(Math.round(b.x + standOff), Math.round(b.y - e + 3 + bobY));
      o.c.setDepth(b.y);
      o.flag.setTexture(`wt_flag_${o.color}_${Math.floor((time + o.phase) / 220) % 3}`);
      if (o.ring) o.ring.setAlpha(0.6 + Math.sin(time / 300) * 0.3);
    }
    this.dyn.sort('depth');
  }

  private nextHex(p: ArmyPose): Axial | null {
    const a = this.armies.armies.get(p.player);
    const s = a?.steps;
    if (!s) return null;
    const i = s.findIndex((x) => x.q === p.q && x.r === p.r);
    return i >= 0 && i + 1 < s.length ? s[i + 1] : null;
  }

  destroy(): void {
    for (const c of this.chunks) c.destroy();
    this.glints?.destroy();
    this.clouds?.destroy();
    this.routeG.destroy();
    this.marchG.destroy();
    this.selImg?.destroy();
    this.dyn.destroy();
  }
}

/** The selection: a light outline with a dark rim and a faint fill. */
function renderSelection(): Sprite {
  const px = new Pix(TILE_W + 2, TILE_H + 2);
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const dx = x + 0.5 - px.w / 2;
      const dy = y + 0.5 - px.h / 2;
      if (!inTopFace(dx * 0.95, dy * 0.93)) continue;
      if (!inTopFace(dx * 1.02, dy * 1.03)) px.set(x, y, 0x1d140f, 140);
      else if (!inTopFace(dx * 1.1, dy * 1.13)) px.set(x, y, 0xfff0c0, 255);
      else px.set(x, y, 0xfff0c0, 40);
    }
  return { pix: px, ax: px.w / 2, ay: px.h / 2 };
}

/** A territory border along edge i of a hex top: a dark ink line with a 2 px band of the colour inside it. */
function renderEdge(color: number, i: number): Sprite {
  const px = new Pix(TILE_W, TILE_H);
  const pts = topCorners(1.2).map((p) => ({ x: p.x + TILE_W / 2, y: p.y + TILE_H / 2 }));
  const a = pts[i];
  const b = pts[(i + 1) % 6];
  const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2);
  const light = mix(color, 0xfff4dc, 0.3);
  const marks: [number, number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n - 0.5;
    const y = a.y + ((b.y - a.y) * k) / n - 0.5;
    const cx = TILE_W / 2 - x;
    const cy = TILE_H / 2 - y;
    const l = Math.hypot(cx * 0.7, cy) || 1;
    const ux = (cx * 0.7) / l;
    const uy = cy / l;
    marks.push([Math.round(x), Math.round(y), 0x22160e]);
    marks.push([Math.round(x + ux), Math.round(y + uy), light]);
    marks.push([Math.round(x + ux * 2), Math.round(y + uy * 2), color]);
  }
  // inner tones first so the ink line stays on top at corners
  for (const layer of [2, 1, 0]) for (let j = layer; j < marks.length; j += 3) px.set(marks[j][0], marks[j][1], marks[j][2]);
  return { pix: px, ax: TILE_W / 2, ay: TILE_H / 2 };
}

export { ROW_H };
