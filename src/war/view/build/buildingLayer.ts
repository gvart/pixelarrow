/**
 * Buildings, sites and the build-mode overlays on the iso map (M2b, W-26..W-28). Each building is drawn with its ART-B
 * art (./buildArt.ts; under construction the stage its labour reached: foundation, rising, scaffold) when there is one,
 * else a placeholder iso box over its footprint tinted by state.
 *
 * Wall-walks (W-28): walls with a walkway (rampart, stone wall) and towers are layered kits drawn per tile: the back
 * layer, then the units standing on that tile's walk (walkwayPx / platformPx above the ground: the art's heights, not the
 * sim's levels; each sorted at its own point, so a man near a tile's edge draws over the walk floor beside it), then the
 * front layer keyed at the tile's front corner (the outer parapets over their legs), all sorted with the units and map objects
 * (10 + depth / 4096 + 0.25, as ./units.ts). Frames: walls by frameOf[mask | open << 4] (mask: sides joined to a wall or
 * gate of the same walk; open: a stair top, a joined tower or a ladder head there), towers by their open sides. Stairs
 * and ladders are kit pieces; units on a stair stand at its top height x the distance from its low end, on a ladder they
 * climb straight up its foot; in a stone tower's door they are inside (not drawn). lift() gives the units layer those
 * heights and depths; occluded() names the units a wall or tower hides (drawn as a silhouette). Gates in a 2-deep wall
 * use the 2-deep art (the passage over the inner row); gates draw open while a unit of their team is near. An upgrade
 * keeps the old tier drawn until the new one reaches its scaffold stage (a grown inner row shows its own stage).
 * Ground overlays (under every object): footprint grids in build mode and on a hovered or selected site, a ring round a
 * selected finished building, the ghost's footprint. Over them: progress bars, the own influence area (a canvas baked per
 * influence version), the placement ghost (the real sprites or kit pieces, tinted green / red, with the sim's reason)
 * and the hovered resource node.
 * Bridges (M2d): per tile kit pieces (deck-<axis> over the water, end-<axis><0|1> ramps on the banks rising towards the
 * deck: 0 at the low end of the axis) at the tile's surface level; units on a done deck walk deckM over it (as on a
 * wall-walk), up a ramp as on a stair. A collapsed piece leaves the stumps of its damaged art at the waterline. A wider
 * axis bridge keeps rails on its outer tiles only; a bridge along a grid diagonal (W-33) draws one row segment of the
 * diagonal kit per row centre, at the depth of the row's back-most tile.
 * M5h3 Fortifier works: ditch tiles as the ditch kit by their neighbour mask on the ground (under anything standing),
 * filled in (destroyed: attackBuilding filled it) as its damaged frames; stakes by state (broken ones stay as the damaged
 * art); an iron-bound gate as the iron variant of its gate art; wet hides over a palisade or rampart as the hides
 * overlay kit (same frames), other wet wood darkened. A docked siege tower's bridge (towerBridge, drawn with the tower by
 * ../siege/siegeLayer.ts): men on its foot tile go up inside the tower to the bridge's height, then across onto the walk.
 */
import Phaser from 'phaser';
import type { BridgeAxis, BuildingSnap, BuildingType, InfluenceMap, NodeSnap } from '../../types';
import { BUILDINGS } from '../../sim/economy';
import { HH, HW, LH, type IsoMap } from '../iso';
import type { DrawUnit } from '../simClient';
import { BODY, TEAM_COLOR } from '../units';
import type { BuildArt, BuildSprite, KitSprite } from './buildArt';
import { frontDepth, type Back } from './wallDepth';

/** Ground overlays: over the terrain chunks (1) and the influence area (2), under objects and units (10+). */
const GROUND = 2.5;
const OK = 0x50e060, BAD = 0xff4040;
/** Placeholder heights in world px (~33 px a metre). */
const HEIGHT: Partial<Record<BuildingType, number>> = {
  camp: 36, storehouse: 52, outpost: 80, fort: 120, barracks: 60, farm: 8, olivePress: 48,
  brazier: 20, pitchKiln: 50,
  palisade: 56, rampart: 100, stoneWall: 160, woodTower: 120, stoneTower: 150, woodGate: 70, stoneGate: 100, woodStairs: 50, stoneStairs: 80, ladder: 120,
};
const MAT = { wood: 0x8a6a44, stone: 0xa8a294 };
const GATE_NEAR = 3; // tiles: a gate opens while one of its team stands this near
/** Cutaway: walls, towers and gates drawn as stubs this high (px, ~1 m at a side vertex); build mode cuts within CUT_NEAR tiles of the cursor. */
const STUB = 33, CUT_NEAR = 4;
/** Depth steps inside a tile's layers (a tile's depth key spans ~1 / 4096). */
const IN = 1e-6;
const view = (o: { x: number; y: number; right: number; bottom: number }, x: number, y: number, m: number) => x > o.x - m && x < o.right + m && y > o.y - m && y < o.bottom + m * 2;
/** Neighbour sides: +x 1, +y 2, -x 4, -y 8. */
const SIDES: [number, number, number][] = [[1, 0, 1], [0, 1, 2], [-1, 0, 4], [0, -1, 8]];
const sideOf = (dx: number, dy: number) => (dx > 0 ? 1 : dy > 0 ? 2 : dx < 0 ? 4 : 8);
const LETTER: Record<number, string> = { 1: 'e', 2: 's', 4: 'w', 8: 'n' };
/** The four visual cells of a tile (iso.zf: two a tile each way). */
const CELLS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** Multiply a colour's channels by k. */
const shade = (c: number, k: number) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);

type P = { x: number; y: number };
/** Where a unit is drawn: a tile point (x, y) on ground level z, raised px; depth key, hidden (inside), climbing. */
export interface Lift { x: number; y: number; z: number; px: number; depth?: number; hide?: boolean; climb?: boolean; facing?: number }
/** A raised tile: what a unit standing there is drawn on. */
interface Deck {
  kind: 'deck' | 'stair' | 'ladder' | 'door'; px: number; z: number; depth: number; b: number;
  /** stair: low-end edge (ox, oy), rising direction, length; ladder: side towards its wall. */
  ox: number; oy: number; dx: number; dy: number; n: number;
  /** A siege ladder: its foot's distance from the wall face (tiles); climbers lean in with it. */
  foot?: number;
  /** M5h3: a docked siege tower's bridge (men rise inside the tower, no climb). */
  tower?: true;
}
/** M5h3: ditch tiles sit on the ground, under every object (over the terrain and the influence area). */
const DITCH = 2.4;
/** M5h3: wet wood with no hides art, darkened. */
const WET_TINT = 0xb0b4b8;
/** Siege ladder foot from the wall face in tiles (public/war/siege/objects.json ladders.targets footM / 2 m). */
const SIEGE_FOOT: Partial<Record<BuildingType, number>> = { stoneWall: 0.945, stoneTower: 0.945, stoneGate: 0.945, rampart: 0.645, woodTower: 0.645, woodGate: 0.645 };
/** How a building is drawn this frame: the type and stage shown (an upgrade shows the old tier), and the grown tiles' stage. */
interface Look { type: BuildingType; stage: string; grown: number; grownStage: string }
/** A placement ghost piece. tiles: stairs bottom first; attach: the tile of the wall or tower a ladder leans on. */
export interface GhostPiece {
  tiles: readonly number[]; ok: boolean; type?: BuildingType; attach?: readonly number[]; rot?: 0 | 1;
  /**
   * A bridge piece: its axis, part and, for an axis ramp, the way it rises (towards the deck, +1 / -1 along the axis); a
   * diagonal one also its step along the line, width and row centres (BridgePlan).
   */
  bridge?: { axis: BridgeAxis; part: 'end0' | 'end1' | 'deck'; rise: number; dir?: readonly number[]; width?: number; rows?: readonly number[] };
}
/** A bridge along a grid diagonal (screen-horizontal h or screen-vertical v): drawn with the diagonal kit. */
export const isDiag = (axis: BridgeAxis): axis is 'h' | 'v' => axis === 'h' || axis === 'v';
/**
 * Axis bridge kit piece for tile (x, y) of a piece on `tiles` (objects.json kits bridge-*: deck-<axis>, end-<axis><0|1> the
 * upper half of a 2-tile ramp next to the deck, out-<axis><0|1> its lower half on the bank): rails only on the sides
 * across with no tile of the piece beside it (suffix .l / .h: the low / high side only, .n none).
 */
export const bridgePiece = (axis: 'x' | 'y', part: 'end0' | 'end1' | 'deck', rise: number, tiles: readonly number[] = [], x = 0, y = 0): string => {
  const has = (a: number, c: number) => { for (let i = 0; i < tiles.length; i += 2) if (tiles[i] === a && tiles[i + 1] === c) return true; return false; };
  const lo = axis === 'x' ? has(x, y - 1) : has(x - 1, y), hi = axis === 'x' ? has(x, y + 1) : has(x + 1, y);
  const outer = part !== 'deck' && !(axis === 'x' ? has(x - rise, y) : has(x, y - rise)); // no ramp tile below it
  return (part === 'deck' ? `deck-${axis}` : `${outer ? 'out' : 'end'}-${axis}${rise > 0 ? 0 : 1}`) + (lo && hi ? '.n' : lo ? '.h' : hi ? '.l' : '');
};
/**
 * Diagonal bridge kit piece (kits bridge-*-diag): <h|v><width>-deck, or a ramp row rising along the drag (end0) or against
 * it (end1): end+ rises towards +a (h) / +b (v); end = the upper row of a 2-row ramp (next to the deck), out = the lower.
 */
export const diagPiece = (axis: 'h' | 'v', width: number, part: 'end0' | 'end1' | 'deck', dir: readonly number[], outer = false): string =>
  `${axis}${width}-${part === 'deck' ? 'deck' : `${outer ? 'out' : 'end'}${(part === 'end0') === dir[0] > 0 ? '+' : '-'}`}`;
/** Row i of n of a bridge piece is the outer (bank-side) row of its ramp. */
const outerRow = (part: 'end0' | 'end1' | 'deck', i: number, n: number) => (part === 'end0' ? i === 0 : part === 'end1' && i === n - 1);
/** Bridge stumps: the bottom px of the damaged art left standing in the water after a collapse. */
const STUMP = 22;
/** A ground arrow (tile point, direction) in the ghost: the wall's inside. */
export interface GhostMark { x: number; y: number; dx: number; dy: number }

export class BuildingLayer {
  art: BuildArt | null = null;
  /** The HUD's selected building (ground ring when finished, footprint grid while a site), -1 none. */
  selected = -1;
  /** Site under the pointer (footprint grid), -1 none. */
  hovered = -1;
  /** Build mode: every footprint shows its grid. */
  grids = false;
  /** Cutaway (V): every wall, tower and gate drawn as a low stub, so the inside of a fort shows. */
  cutaway = false;
  /** Build mode's cursor tile: the walls near it are cut away too (null: none). */
  cutNear: { x: number; y: number } | null = null;
  /** Units on a ladder this frame (the climb clip). */
  readonly climbing = new Set<number>();
  /** Buildings another layer draws (siege ladders, rubble: ../siege/siegeLayer.ts). */
  skip: ((b: BuildingSnap) => boolean) | null = null;
  /** A charring overlay over b's kit frames (texture key, same frames and origin; ../siege/siegeLayer.ts), or none. */
  charOf: ((b: BuildingSnap, kit: string, layer: 'back' | 'front') => string | undefined) | null = null;
  /** M5h: working fx of the workplaces with an order under way this frame, world px (drawn by ../siege/siegeLayer.ts, which holds the fx art). */
  readonly working: { id: string; x: number; y: number; alpha: number; depth: number; seed: number }[] = [];
  private gfx: Phaser.GameObjects.Graphics[] = [];
  private imgs: Phaser.GameObjects.Image[] = [];
  private ghostImgs: Phaser.GameObjects.Image[] = [];
  private gBars: Phaser.GameObjects.Graphics;
  private gGhost: Phaser.GameObjects.Graphics;
  private gGround: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private nodeLabel: Phaser.GameObjects.Text;
  private inflImg: Phaser.GameObjects.Image | null = null;
  private inflVer = -1;
  private inflShown = false;
  private warned = new Set<string>();
  // per frame (prepare)
  private occ = new Map<number, BuildingSnap>();
  private looks = new Map<number, Look>();
  /** Walk tiles of layered walls and towers: their kit id and walk px. */
  private walks = new Map<number, { kit: string; px: number; b: number }>();
  /** Gate tiles and the passages of 2-deep gates (wall masks join them). */
  private gateJoin = new Set<number>();
  /** Gate id -> the side of its 2-deep passage (n e s w), and the passage tiles. */
  private deep = new Map<number, { side: string; tiles: number[] }>();
  /** Open sides (no parapet) per wall or tower tile. */
  private open = new Map<number, number>();
  /** Tall tiles (px) that hide what stands behind them. */
  private heights = new Map<number, number>();
  private decks = new Map<number, Deck>();
  /** Per footprint tile (not stairs or ladders): its footprint's max corner and the depth its back art is drawn at. */
  private backs = new Map<number, Back>();
  /** Footprint size of each wall before an upgrade grew it (tiles). */
  private orig = new Map<number, number>();

  constructor(private scene: Phaser.Scene, private iso: IsoMap, private depthOf: (x: number, y: number) => number) {
    this.gBars = scene.add.graphics().setDepth(11.5);
    this.gGhost = scene.add.graphics().setDepth(11.4);
    this.gGround = scene.add.graphics().setDepth(GROUND);
    const style = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 };
    this.label = scene.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(12).setVisible(false);
    this.nodeLabel = scene.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(12).setVisible(false);
  }

  /** World px of a tile corner point on the ground at level z. */
  private pt(x: number, y: number, z: number): P {
    return { x: this.iso.sx(x, y), y: this.iso.sy(x, y, z) };
  }

  /**
   * Ground level a building's art stands on: a wall piece its centre's (it joins the tiles beside it); any other building
   * the lowest visual cell under its footprint, so its flat floor never floats over the low side of a step.
   */
  private z(b: { x: number; y: number; type?: BuildingType; tiles?: readonly number[] }): number {
    if (!b.tiles || !b.type || BUILDINGS[b.type].wall) return this.iso.zAt(b.x, b.y);
    let z = Infinity;
    for (let i = 0; i < b.tiles.length; i += 2) for (const [dx, dy] of CELLS) z = Math.min(z, this.iso.zf(2 * b.tiles[i] + dx, 2 * b.tiles[i + 1] + dy));
    return z;
  }

  /** Ground level of a tile (as its kit piece is drawn). */
  private zt(tx: number, ty: number): number {
    return this.iso.zAt(tx + 0.5, ty + 0.5);
  }

  /** Display depth of a tile point (units and objects sort the same way). */
  private D(x: number, y: number): number {
    return 10 + this.depthOf(x, y) / 4096 + 0.25;
  }

  // --- per frame: what stands where ---

  /** How b shows this frame (see Look). */
  private look(b: BuildingSnap): Look {
    const stage = this.art?.stage(b.state, b.progress) ?? b.state, n = b.tiles.length / 2;
    if (!b.upgradeFrom) {
      if (BUILDINGS[b.type].wall === 'segment') this.orig.set(b.id, n);
      return { type: b.type, stage, grown: n, grownStage: stage };
    }
    const scaf = this.art ? b.progress >= this.art.threshold('scaffold') : b.progress >= 0.5;
    if (b.state !== 'scaffold' || scaf) return { type: b.type, stage, grown: n, grownStage: stage };
    const grown = Math.min(n, this.orig.get(b.id) ?? (b.upgradeFrom === 'palisade' ? Math.ceil(n / 2) : n));
    return { type: b.upgradeFrom, stage: 'done', grown, grownStage: stage };
  }

  /** The type and stage drawn on tile index i of b. */
  private tileLook(b: BuildingSnap, i: number): [BuildingType, string] {
    const l = this.looks.get(b.id)!;
    return i < l.grown ? [l.type, l.stage] : [b.type, l.grownStage];
  }

  /** Index the standing buildings: tiles, walks, gate passages, open sides, tall tiles and the raised tiles units use. */
  private prepare(buildings: readonly BuildingSnap[]): void {
    const occ = this.occ, walks = this.walks, open = this.open;
    occ.clear(); this.looks.clear(); walks.clear(); this.gateJoin.clear(); this.deep.clear(); open.clear(); this.heights.clear(); this.decks.clear(); this.backs.clear();
    const live = buildings.filter((b) => b.state !== 'destroyed');
    for (const b of live) {
      this.looks.set(b.id, this.look(b));
      if (!BUILDINGS[b.type].brazier) for (const [x, y] of pairs(b.tiles)) occ.set(key(x, y), b); // a brazier may stand on a wall's tile
    }
    // walk tiles of the layered walls (as drawn) and towers; heights for silhouettes
    for (const b of live) {
      const def = BUILDINGS[b.type];
      pairs(b.tiles).forEach(([x, y], i) => {
        const [type, stage] = this.tileLook(b, i), m = this.art?.meta(type), k = key(x, y);
        if ((def.wall === 'segment' || def.wall === 'tower') && m?.layered) walks.set(k, { kit: m.id, px: m.walkPx, b: b.id });
        if (def.wall && stage !== 'foundation') this.heights.set(k, this.cut(b) ? STUB : (m?.heightPx || (HEIGHT[type] ?? 60)) * (stage === 'rising' ? 0.4 : 1));
        if (def.wall === 'gate') this.gateJoin.add(k);
      });
    }
    // 2-deep gates: the passage lies on the side where the walls beside the gate have their inner row
    for (const b of live) {
      if (BUILDINGS[b.type].wall !== 'gate') continue;
      const d = this.deepOf(pairs(b.tiles), b.w >= b.h, (k) => !!walks.get(k) && BUILDINGS[occ.get(k)!.type].wall === 'segment', (k) => occ.has(k));
      if (!d) continue;
      this.deep.set(b.id, d);
      for (const [x, y] of pairs(d.tiles)) { this.gateJoin.add(key(x, y)); this.heights.set(key(x, y), this.heights.get(key(b.tiles[0], b.tiles[1])) ?? 100); }
    }
    // the depths the art is drawn at (draw()): wall tiles one by one, towers and 2-deep gates as one box
    for (const b of live) {
      const def = BUILDINGS[b.type], ts = pairs(b.tiles);
      if (def.access || def.brazier) continue;
      const deep = this.deep.get(b.id), all = deep ? [...ts, ...pairs(deep.tiles)] : ts;
      if (def.wall === 'segment') {
        for (const [x, y] of ts) this.backs.set(key(x, y), { x1: x + 1, y1: y + 1, depth: this.D(x + 0.495, y + 0.495) });
        continue;
      }
      const x0 = Math.min(...all.map((t) => t[0])), y0 = Math.min(...all.map((t) => t[1]));
      const x1 = Math.max(...all.map((t) => t[0])) + 1, y1 = Math.max(...all.map((t) => t[1])) + 1;
      const depth = def.wall === 'tower' ? this.D(x0 + 1, y0 + 1) : deep ? this.D(x0 + 1.5, y0 + 1.5) : this.D(b.x + b.w / 2 - 0.5, b.y + b.h / 2 - 0.5);
      for (const [x, y] of all) this.backs.set(key(x, y), { x1, y1, depth });
      // a crafter at a station inside a workplace (the sim opens only those tiles): on its floor, over its art
      if (def.workplace && (b.state === 'done' || b.state === 'damaged'))
        for (const [x, y] of ts) this.decks.set(key(x, y), { kind: 'deck', px: 0, z: this.z(b), depth, b: b.id, ox: x0, oy: y0, dx: 0, dy: 0, n: 0 });
    }
    const setOpen = (x: number, y: number, side: number) => open.set(key(x, y), (open.get(key(x, y)) ?? 0) | side);
    for (const b of live) {
      const def = BUILDINGS[b.type], ts = pairs(b.tiles), l = this.looks.get(b.id)!, up = b.state === 'done' || b.state === 'damaged';
      if (def.access === 'stairs' && ts.length > 1) {
        // the wall tile beyond the top end: no parapet there
        const [bx, by] = ts[0], [tx, ty] = ts[ts.length - 1], dx = Math.sign(tx - bx), dy = Math.sign(ty - by);
        if (walks.has(key(tx + dx, ty + dy))) setOpen(tx + dx, ty + dy, sideOf(-dx, -dy));
        const top = this.walkTile(tx + dx, ty + dy) || this.art?.meta(b.type)?.walkPx || 99;
        if (up) for (const [x, y] of ts) this.decks.set(key(x, y), { kind: 'stair', px: top, z: this.zt(x, y), depth: this.D(b.x, b.y), b: b.id, ox: bx + (dx < 0 ? 1 : 0), oy: by + (dy < 0 ? 1 : 0), dx, dy, n: ts.length });
      } else if (def.access === 'ladder') {
        const [x, y] = ts[0];
        for (const [dx, dy, side] of SIDES) {
          const o = occ.get(key(x + dx, y + dy));
          if (!o || (b.attach !== undefined && o.id !== b.attach)) continue;
          if (walks.has(key(x + dx, y + dy))) setOpen(x + dx, y + dy, sideOf(-dx, -dy));
          if (up) this.decks.set(key(x, y), { kind: 'ladder', px: this.walkTile(x + dx, y + dy) || 99, z: this.zt(x, y), depth: this.D(x + 0.8, y + 0.8), b: b.id, ox: 0, oy: 0, dx, dy, n: side, ...(b.siege !== undefined ? { foot: SIEGE_FOOT[o.type] ?? 0.9 } : {}), ...(b.type === 'towerBridge' ? { tower: true as const, depth: this.D(x + 0.5 - dx / 2, y + 0.5 - dy / 2) + 10 * IN } : {}) });
          break;
        }
      } else if (def.wall === 'tower') {
        const m = this.art?.meta(l.type), x0 = Math.min(...ts.map((t) => t[0])), y0 = Math.min(...ts.map((t) => t[1]));
        // joined to a walk at the same height
        for (const [x, y] of ts) for (const [dx, dy, side] of SIDES) {
          const w = walks.get(key(x + dx, y + dy));
          if (w && w.b !== b.id && m && w.px === m.walkPx) { setOpen(x, y, side); setOpen(x + dx, y + dy, sideOf(-dx, -dy)); }
        }
        if (b.walk && m?.layered) {
          const z = this.zt(x0, y0), depth = this.D(x0 + 1, y0 + 1);
          for (const [x, y] of ts) this.decks.set(key(x, y), { kind: 'deck', px: m.walkPx, z, depth, b: b.id, ox: x0, oy: y0, dx: 0, dy: 0, n: 0 });
          if (b.door) this.decks.set(key(b.door[0], b.door[1]), { kind: 'door', px: 0, z, depth, b: b.id, ox: 0, oy: 0, dx: 0, dy: 0, n: 0 });
        }
      } else if (def.bridge && b.bridge && up && isDiag(b.bridge.axis)) {
        // a diagonal bridge row by row: its deck tiles at the deck height, a ramp row rising along the drag (end0, from
        // the start bank) or against it (end1) over one row step from half a step before its centre
        const m = this.art?.meta(b.type, true), px = m?.walkPx || 66, br = b.bridge, rows = pairs(br.rows), n = ts.length / rows.length;
        const [rx, ry] = br.part === 'end1' ? [-br.dir[0], -br.dir[1]] : br.dir;
        const [ocx, ocy] = rows[br.part === 'end1' ? rows.length - 1 : 0]; // a ramp rises from its outer row's back edge
        rows.forEach((_, i) => {
          const depth = this.rowDepth(b.tiles, i, n);
          for (const [x, y] of ts.slice(i * n, (i + 1) * n)) {
            if (br.part === 'deck') this.decks.set(key(x, y), { kind: 'deck', px, z: this.zt(x, y), depth, b: b.id, ox: x, oy: y, dx: 0, dy: 0, n: 0 });
            else this.decks.set(key(x, y), { kind: 'stair', px, z: this.zt(x, y), depth, b: b.id, ox: ocx - rx / 2, oy: ocy - ry / 2, dx: rx, dy: ry, n: 2 * rows.length });
          }
        });
      } else if (def.bridge && b.bridge && up) {
        const m = this.art?.meta(b.type), px = m?.walkPx || 66, br = b.bridge as typeof b.bridge & { axis: 'x' | 'y' };
        for (const [x, y] of ts) {
          if (br.part === 'deck') { this.decks.set(key(x, y), { kind: 'deck', px, z: this.zt(x, y), depth: this.D(x + 0.495, y + 0.495), b: b.id, ox: x, oy: y, dx: 0, dy: 0, n: 0 }); continue; }
          // a 2-tile ramp: from the outer tile's back edge up to the deck
          const r = this.rise(b), dx = br.axis === 'x' ? r : 0, dy = br.axis === 'y' ? r : 0, lower = !ts.some(([a, c]) => a === x - dx && c === y - dy);
          const ox = x - (lower ? 0 : dx) + (dx < 0 ? 1 : 0), oy = y - (lower ? 0 : dy) + (dy < 0 ? 1 : 0);
          this.decks.set(key(x, y), { kind: 'stair', px, z: this.zt(x, y), depth: this.D(x + 0.5, y + 0.5), b: b.id, ox, oy, dx, dy, n: 2 });
        }
      } else if (def.wall === 'segment' && b.walk) {
        pairs(b.tiles).forEach(([x, y]) => {
          const w = walks.get(key(x, y));
          if (w) this.decks.set(key(x, y), { kind: 'deck', px: w.px, z: this.zt(x, y), depth: this.D(x + 0.495, y + 0.495), b: b.id, ox: x, oy: y, dx: 0, dy: 0, n: 0 });
        });
      }
    }
  }

  /**
   * The 2-deep passage of a gate on tiles ts (along x or y): the side (n e s w) where a wall beside it has its inner
   * row (`wall`: a 2-deep wall tile there) and the passage tiles are free (`taken`), or null.
   */
  private deepOf(ts: [number, number][], alongX: boolean, wall: (k: number) => boolean, taken: (k: number) => boolean): { side: string; tiles: number[] } | null {
    const xs = ts.map((t) => t[0]), ys = ts.map((t) => t[1]);
    for (const s of [1, -1]) {
      const pass = ts.map(([x, y]) => (alongX ? [x, y + s] : [x + s, y]));
      const ends = alongX ? [[Math.min(...xs) - 1, ys[0] + s], [Math.max(...xs) + 1, ys[0] + s]] : [[xs[0] + s, Math.min(...ys) - 1], [xs[0] + s, Math.max(...ys) + 1]];
      if (!ends.some(([x, y]) => wall(key(x, y))) || pass.some(([x, y]) => taken(key(x, y)))) continue;
      return { side: alongX ? (s > 0 ? 's' : 'n') : s > 0 ? 'e' : 'w', tiles: pass.flat() };
    }
    return null;
  }

  /** Is building b drawn cut away (a wall, tower or gate; everywhere, or near build mode's cursor)? */
  private cut(b: BuildingSnap): boolean {
    const w = BUILDINGS[b.type].wall;
    if (!w || BUILDINGS[b.type].access) return false;
    if (this.cutaway) return true;
    const c = this.cutNear;
    if (!c) return false;
    for (const [x, y] of pairs(b.tiles)) if (Math.abs(x + 0.5 - c.x) <= CUT_NEAR && Math.abs(y + 0.5 - c.y) <= CUT_NEAR) return true;
    return false;
  }

  /** Crop a kit or building image to its bottom: a stub STUB px high at the side vertices of an n-tile-wide footprint whose top vertex is at frame row y0. */
  private stub(img: Phaser.GameObjects.Image, y0: number, n: number): Phaser.GameObjects.Image {
    const top = Math.max(0, Math.round(y0 + n * HH - STUB));
    return img.setCrop(0, top, img.frame.realWidth, img.frame.realHeight - top);
  }

  /** Walk px of the layered wall or tower tile at (x, y) as drawn, 0 none. */
  private walkTile(x: number, y: number): number {
    return this.walks.get(key(x, y))?.px ?? 0;
  }

  /**
   * Where a unit at tile point d is drawn: on a walk or platform (raised, between its tile's layers), up a stair (its
   * share of the top height), on a ladder (straight up its foot, climbing) or in a door (hidden); null on the ground.
   */
  lift(d: { x: number; y: number }): Lift | null {
    const tx = Math.floor(d.x), ty = Math.floor(d.y), t = this.decks.get(key(tx, ty));
    if (!t) return null;
    if (t.kind === 'deck') {
      // over the walk floor of the wall tiles beside it on the same walk (+x, +y; still under its own front parapets): a
      // man at his tile's edge is not cut by theirs
      let depth = Math.max(t.depth, this.D(d.x, d.y));
      const front = this.D(tx + 1, ty + 1);
      for (const n of [this.decks.get(key(tx + 1, ty)), this.decks.get(key(tx, ty + 1))]) if (n?.kind === 'deck' && n.px === t.px && n.depth < front) depth = Math.max(depth, n.depth);
      return { x: d.x, y: d.y, z: t.z, px: t.px, depth: depth + IN };
    }
    if (t.kind === 'door') return { x: d.x, y: d.y, z: t.z, px: 0, hide: true };
    if (t.kind === 'stair') {
      const dist = (d.x - t.ox) * t.dx + (d.y - t.oy) * t.dy;
      return { x: d.x, y: d.y, z: t.z, px: t.px * Math.max(0, Math.min(1, dist / t.n)), depth: t.depth + IN * (1 + dist) };
    }
    // ladder: f = how far across the tile towards the wall; the man steps to the ladder's foot, then climbs straight up
    const f = t.dx ? (t.dx > 0 ? d.x - tx : tx + 1 - d.x) : t.dy > 0 ? d.y - ty : ty + 1 - d.y;
    // a siege tower: up its inner stair over the back half of the tile, then on the bridge at the walk's height
    if (t.tower) return { x: d.x, y: d.y, z: t.z, px: t.px * Math.max(0, Math.min(1, f / 0.6)), depth: t.depth, facing: Math.atan2(t.dy, t.dx) };
    if (t.foot !== undefined) {
      // a siege ladder leans out from the face: up it from its foot, centred on its tile across
      const at = Math.max(0.05, 1 - t.foot), k = Math.min(1, f / at), up = Math.max(0, Math.min(1, (f - at) / (1 - at)));
      const x = t.dx ? d.x : d.x + (tx + 0.5 - d.x) * k, y = t.dx ? d.y + (ty + 0.5 - d.y) * k : d.y;
      return { x, y, z: t.z, px: t.px * up, depth: t.depth + IN * (1 + f), climb: up > 0, facing: Math.atan2(t.dy, t.dx) };
    }
    const k = Math.min(1, f / 0.3), up = Math.max(0, Math.min(1, (f - 0.3) / 0.7));
    let x = d.x, y = d.y;
    if (t.dx) x += (tx + (t.dx > 0 ? 0.7 : 0.3) - x) * k;
    else y += (ty + (t.dy > 0 ? 0.7 : 0.3) - y) * k;
    return { x, y, z: t.z, px: t.px * up, depth: t.depth + IN * (1 + f), climb: true, facing: Math.atan2(t.dy, t.dx) };
  }

  /** The least display depth of a man on the ground at d: over the wall and building faces he stands in front of (0 none). */
  groundDepth(d: { x: number; y: number }): number {
    return frontDepth(d.x, d.y, this.backs, IN);
  }

  /**
   * The raised surface under world px (wx, wy), front-most first: the top of a walkway, tower platform or stair tile
   * (a point on it, with its tile and px), or the face of a wall or tower (the ground tile just in front of that face,
   * px 0). null: nothing raised there (pick the ground).
   */
  surfaceAt(wx: number, wy: number): { x: number; y: number; tx: number; ty: number; z: number; px: number } | null {
    const iso = this.iso, u = (wx - iso.OX) / HW;
    let best: { x: number; y: number; tx: number; ty: number; z: number; px: number } | null = null, bd = -Infinity;
    for (const [k, t] of this.decks) {
      if (t.kind !== 'deck' && t.kind !== 'stair') continue;
      const tx = k % 65536, ty = (k - tx) / 65536;
      if (tx + ty + 1 <= bd) continue;
      const cut = t.kind === 'deck' && this.heights.get(k) === STUB; // a cut-away wall: its stub's top is picked
      const px = t.kind === 'stair' ? this.lift({ x: tx + 0.5, y: ty + 0.5 })!.px : cut ? STUB : t.px;
      // v along the column through the cursor: v0 on the tile's ground, v1 on its top; the tile spans [lo, hi) in v
      const v0 = (wy - iso.OY + t.z * LH) / HH, v1 = v0 + px / HH;
      const lo = Math.max(2 * tx - u, 2 * ty + u), hi = Math.min(2 * tx + 2 - u, 2 * ty + 2 + u);
      if (hi <= lo || v1 < lo || v0 >= hi) continue;
      const top = v1 < hi, d = tx + ty + (top ? 0.5 : 0);
      if (d <= bd) continue;
      bd = d;
      if (top) best = { x: (u + v1) / 2, y: (v1 - u) / 2, tx, ty, z: t.z, px };
      else {
        // the face: the column leaves the tile by its +x or +y edge (whichever bounds hi); the ground just past it
        const ex = (u + hi) / 2 - tx, ey = (hi - u) / 2 - ty, cl = (q: number) => Math.max(0.1, Math.min(0.9, q));
        const [gx, gy] = 2 * tx + 2 - u <= 2 * ty + 2 + u ? [tx + 1.5, ty + cl(ey)] : [tx + cl(ex), ty + 1.5];
        best = { x: gx, y: gy, tx: Math.floor(gx), ty: Math.floor(gy), z: iso.zAt(gx, gy), px: 0 };
      }
    }
    return best;
  }

  /** Ids of living units that a wall, tower or gate in front of them hides (each drawn as a silhouette over it). */
  occluded(units: readonly DrawUnit[], out: Set<number>): void {
    this.climbing.clear();
    if (!this.heights.size && !this.decks.size) return;
    for (const d of units) {
      if (d.u.state === 'dead') continue;
      const l = this.lift(d);
      if (l?.climb) this.climbing.add(d.u.id);
      if (l?.hide) continue;
      const px = l?.px ?? 0, own = l ? this.decks.get(key(Math.floor(d.x), Math.floor(d.y)))?.b : -1;
      for (let s = 0.5; s <= 7; s += 0.5) {
        const k = key(Math.floor(d.x + s), Math.floor(d.y + s)), h = this.heights.get(k);
        if (h !== undefined && h >= 32 * s + px + BODY && this.occ.get(k)?.id !== own) { out.add(d.u.id); break; }
      }
    }
  }

  /** Buildings and their ground overlays; clears the ghost's ground (draw the ghost after this). */
  draw(buildings: readonly BuildingSnap[], units: readonly DrawUnit[], v: { x: number; y: number; right: number; bottom: number }, zoom: number): void {
    let ng = 0;
    this.ni = 0;
    this.working.length = 0;
    const bars = this.gBars.clear(), ground = this.gGround.clear(), lw = Math.max(1, 1.25 / zoom);
    this.prepare(buildings);
    const walls = this.wallTiles(buildings), ditches = new Set<number>();
    for (const b of buildings) if (b.type === 'ditch') ditches.add(key(b.tiles[0], b.tiles[1]));
    for (const b of buildings) {
      const c = this.pt(b.x, b.y, this.z(b));
      const site = b.state === 'foundation' || b.state === 'scaffold';
      if (b.id === this.selected && !site) this.ring(ground, b, zoom);
      else if (b.id === this.selected || b.id === this.hovered) this.grid(ground, b.tiles, 0xffffff, 0.9, lw);
      else if (this.grids && b.state !== 'destroyed') this.grid(ground, b.tiles, TEAM_COLOR[b.team] ?? 0xcccccc, 0.45, lw);
      if (!view(v, c.x, c.y, Math.max(b.w, b.h) * HW + 300)) continue;
      if (this.skip?.(b)) continue;
      const x1 = b.x + b.w / 2, y1 = b.y + b.h / 2, depth = this.D(x1 - 0.5, y1 - 0.5);
      const def = BUILDINGS[b.type], l = this.looks.get(b.id) ?? this.look(b), axis = b.w >= b.h ? 'x' : 'y';
      let drawn = false;
      if (this.art && def.field) drawn = this.drawField(b, l, ditches);
      else if (this.art && def.bridge) drawn = this.drawBridge(b, l);
      else if (this.art && b.state !== 'destroyed') {
        if (def.wall === 'segment') drawn = this.drawWall(b, walls);
        else if (def.wall === 'tower') drawn = this.drawTower(b, l);
        else if (def.access) drawn = this.drawAccess(b, l);
        if (!drawn) {
          const deep = def.wall === 'gate' ? this.deep.get(b.id) : undefined;
          const near = def.wall === 'gate' && b.state === 'done' && units.some((d) => d.team === b.team && d.u.state !== 'dead' && Math.abs(d.x - b.x) < GATE_NEAR && Math.abs(d.y - b.y) < GATE_NEAR);
          const spr = this.art.sprite(l.type, near ? 'open' : l.stage, axis, deep?.side, !!b.iron);
          if (spr) {
            if (deep) {
              const all = pairs([...b.tiles, ...deep.tiles]), x0 = Math.min(...all.map((t) => t[0])), y0 = Math.min(...all.map((t) => t[1]));
              const im = this.fit(this.img(this.ni++, spr.key), spr, b.type, x0 + 1, y0 + 1, 2, 2, this.zt(x0, y0)).setDepth(this.D(x0 + 1.5, y0 + 1.5));
              if (this.cut(b)) this.stub(im, spr.tileOrigin.y, 2);
              if (b.wet) im.setTint(WET_TINT);
            } else {
              const im = this.fit(this.img(this.ni++, spr.key), spr, b.type, b.x, b.y, b.w, b.h, this.z(b), !def.wall && b.rot === 1).setDepth(depth);
              if (b.wet) im.setTint(WET_TINT);
              if (this.cut(b)) this.stub(im, spr.tileOrigin.y, (b.w + b.h) / 2);
              else if (def.workplace && (b.state === 'done' || b.state === 'damaged') && b.queue?.some((o) => o.by >= 0)) {
                // a crafter at an order: the art's working fx at their sprite px
                const k = im.scaleX, w = im.frame.realWidth;
                for (const [i, f] of this.art.workFx(b.type).entries())
                  this.working.push({ id: f.id, x: im.x + (im.flipX ? w - f.at.x : f.at.x) * k, y: im.y + f.at.y * k, alpha: f.alpha ?? 1, depth: depth + (i + 1) * 1e-6, seed: b.id * 31 + i * 7 });
              }
            }
            drawn = true;
          }
        }
      }
      if (!drawn) {
        let g = this.gfx[ng];
        if (!g) this.gfx.push((g = this.scene.add.graphics()));
        ng++;
        g.clear().setVisible(true).setDepth(def.brazier ? depth + 100 * IN : depth);
        if (def.brazier) this.brazier(g, b);
        else this.placeholder(g, b, units, zoom);
      }
      this.bar(bars, b, c, zoom);
    }
    for (let i = ng; i < this.gfx.length; i++) this.gfx[i].setVisible(false);
    for (let i = this.ni; i < this.imgs.length; i++) this.imgs[i].setVisible(false);
  }

  private ni = 0;

  /** A wall segment tile by tile: palisade by its neighbour mask, layered kits back and front. */
  private drawWall(b: BuildingSnap, walls: Set<number>): boolean {
    const ts = pairs(b.tiles), cut = this.cut(b);
    let any = false;
    ts.forEach(([x, y], i) => {
      const [type, stage] = this.tileLook(b, i), kit = this.art!.kit(type, stage), m = this.art!.meta(type);
      if (!kit || !m) return;
      any = true;
      const frame = this.wallFrame(type, x, y, walls);
      const base = this.D(x + 0.495, y + 0.495), z = this.zt(x, y);
      const back = this.piece(this.img(this.ni++, kit.key, frame), kit, x, y, z).setDepth(m.layered ? base : this.D(x + 0.5, y + 0.5));
      if (cut) { this.stub(back, kit.tileOrigin.y, 1); return; }
      const ch = this.charOf?.(b, m.id, 'back');
      if (ch) this.piece(this.img(this.ni++, ch, frame), kit, x, y, z).setDepth(back.depth + IN / 4);
      // M5h3 wet hides hung over the done wall (same frames as the kit)
      const hides = b.wet && stage === 'done' ? this.art!.hides(type) : undefined;
      if (hides) this.piece(this.img(this.ni++, hides.key, frame), hides, x, y, z).setDepth(back.depth + IN / 3);
      else if (b.wet) back.setTint(WET_TINT);
      if (hides?.front && kit.front) this.piece(this.img(this.ni++, hides.front, frame), hides, x, y, z).setDepth(this.D(x + 1, y + 1) + 2.5 * IN);
      // a back-facing inner corner: -x and -y joined, the diagonal between them open
      if (m.post && stage === 'done' && this.joins(m.id, x - 1, y) && this.joins(m.id, x, y - 1) && !this.joins(m.id, x - 1, y - 1)) {
        this.piece(this.img(this.ni++, m.post, 0), kit, x, y, z).setDepth(base + IN / 2);
      }
      if (kit.front) this.piece(this.img(this.ni++, kit.front, frame), kit, x, y, z).setDepth(this.D(x + 1, y + 1) + 2 * IN);
    });
    return any;
  }

  /** Does tile (x, y) join a layered wall of kit `kit` (a wall of that kit or a gate)? */
  private joins(kit: string, x: number, y: number): boolean {
    const k = key(x, y);
    return this.walks.get(k)?.kit === kit || this.gateJoin.has(k);
  }

  /** Kit frame of a wall tile: palisade by its neighbour mask, layered by frameOf[mask | open << 4]. */
  private wallFrame(type: BuildingType, x: number, y: number, walls: Set<number>, walk = this.walks): number {
    const m = this.art!.meta(type)!;
    let mask = 0, open = 0;
    if (!m.layered) {
      for (const [dx, dy, s] of SIDES) if (walls.has(key(x + dx, y + dy))) mask |= s;
      return mask;
    }
    for (const [dx, dy, s] of SIDES) {
      const k = key(x + dx, y + dy), w = walk.get(k);
      if ((w && w.kit === m.id) || this.gateJoin.has(k)) mask |= s;
    }
    open = (this.open.get(key(x, y)) ?? 0) & ~mask;
    return m.frameOf?.[mask | (open << 4)] ?? mask;
  }

  /** A tower: its layered kit (2 x 2 frame at the NW tile) by its open sides, back and front round its platform. */
  private drawTower(b: BuildingSnap, l: Look): boolean {
    const kit = this.art!.kit(l.type, l.stage);
    if (!kit) return false;
    const ts = pairs(b.tiles), x0 = Math.min(...ts.map((t) => t[0])), y0 = Math.min(...ts.map((t) => t[1]));
    let open = 0;
    for (const [x, y] of ts) open |= this.open.get(key(x, y)) ?? 0;
    const z = this.zt(x0, y0), base = this.D(x0 + 1, y0 + 1);
    const back = this.piece(this.img(this.ni++, kit.key, open), kit, x0, y0, z).setDepth(base);
    if (this.cut(b)) { this.stub(back, kit.tileOrigin.y, 2); return true; }
    const id = this.art!.meta(l.type)?.id ?? '', cb = this.charOf?.(b, id, 'back'), cf = this.charOf?.(b, id, 'front');
    if (cb) this.piece(this.img(this.ni++, cb, open), kit, x0, y0, z).setDepth(base + IN / 4);
    if (b.wet) back.setTint(WET_TINT);
    if (kit.front) this.piece(this.img(this.ni++, kit.front, open), kit, x0, y0, z).setDepth(this.D(x0 + 2, y0 + 2) + 2 * IN).setTint(b.wet ? WET_TINT : 0xffffff);
    if (kit.front && cf) this.piece(this.img(this.ni++, cf, open), kit, x0, y0, z).setDepth(this.D(x0 + 2, y0 + 2) + 2.25 * IN);
    return true;
  }

  /** Stairs (piece <axis><+/-><length>, rising towards their wall) and ladders (piece <target>-<side>). */
  private drawAccess(b: BuildingSnap, l: Look): boolean {
    const kit = this.art!.kit(l.type, l.stage), m = this.art!.meta(l.type);
    if (!kit || !m) return false;
    const ts = pairs(b.tiles);
    if (BUILDINGS[b.type].access === 'stairs') {
      const f = stairFrame(m.pieces, ts);
      if (f < 0) return false;
      const x0 = Math.min(...ts.map((t) => t[0])), y0 = Math.min(...ts.map((t) => t[1]));
      this.piece(this.img(this.ni++, kit.key, f), kit, x0, y0, this.zt(x0, y0)).setDepth(this.D(b.x, b.y));
      return true;
    }
    const [x, y] = ts[0], f = this.ladderFrame(m.pieces, x, y, b.attach);
    if (f < 0) return false;
    this.piece(this.img(this.ni++, kit.key, f), kit, x, y, this.zt(x, y)).setDepth(this.D(x + 0.8, y + 0.8));
    return true;
  }

  /**
   * M5h3 field tiles: a ditch as its kit frame by the neighbour mask of ditch tiles (any state), on the ground; filled
   * in (destroyed) as the damaged frames. Stakes as their sprite, broken ones (destroyed) as the damaged art.
   */
  private drawField(b: BuildingSnap, l: Look, ditches: Set<number>): boolean {
    const [x, y] = b.tiles, gone = b.state === 'destroyed';
    if (b.type === 'ditch') {
      const kit = this.art!.kit(b.type, gone ? 'damaged' : l.stage === 'damaged' ? 'done' : l.stage);
      if (!kit) return false;
      let mask = 0;
      for (const [dx, dy, s] of SIDES) if (ditches.has(key(x + dx, y + dy))) mask |= s;
      this.piece(this.img(this.ni++, kit.key, mask), kit, x, y, this.zt(x, y)).setDepth(DITCH);
      return true;
    }
    const spr = this.art!.sprite(b.type, gone ? 'damaged' : l.stage, 'x');
    if (!spr) return false;
    this.fit(this.img(this.ni++, spr.key), spr, b.type, b.x, b.y, 1, 1, this.z(b)).setDepth(this.D(x + 0.5, y + 0.5));
    return true;
  }

  /** Which way an axis ramp piece rises along its axis (+1 / -1): along the drag on the start bank, against it on the far one. */
  private rise(b: BuildingSnap): number {
    const br = b.bridge!;
    return (br.part === 'end1' ? -1 : 1) * Math.sign(br.axis === 'x' ? br.dir[0] : br.dir[1]);
  }

  /** Display depth of row i (n tiles a row) of a diagonal bridge piece: its back-most tile's (units on it draw over it). */
  private rowDepth(tiles: readonly number[], i: number, n: number): number {
    let d = Infinity;
    for (let k = i * n; k < (i + 1) * n; k++) d = Math.min(d, this.D(tiles[2 * k] + 0.495, tiles[2 * k + 1] + 0.495));
    return d;
  }

  /**
   * A bridge piece (its stage's kit; destroyed: stumps of the damaged art): along an axis tile by tile, its rails on the
   * sides with no tile of the piece beside them; along a diagonal one row segment of the diagonal kit per row centre.
   */
  private drawBridge(b: BuildingSnap, l: Look): boolean {
    const br = b.bridge, diag = !!br && isDiag(br.axis);
    const gone = b.state === 'destroyed', kit = this.art!.kit(b.type, gone ? 'damaged' : l.stage, diag), m = this.art!.meta(b.type, diag);
    if (!kit || !m || !br) return false;
    if (isDiag(br.axis)) {
      const rows = pairs(br.rows), n = b.tiles.length / 2 / rows.length;
      rows.forEach(([cx, cy], i) => {
        const f = m.pieces.indexOf(diagPiece(br.axis as 'h' | 'v', br.width, br.part, br.dir, outerRow(br.part, i, rows.length)));
        if (f < 0) return;
        const im = this.piece(this.img(this.ni++, kit.key, f), kit, cx, cy, this.zt(Math.floor(cx), Math.floor(cy))).setDepth(this.rowDepth(b.tiles, i, n));
        if (gone) {
          const top = kit.tileOrigin.y - STUMP + 8;
          im.setCrop(0, top, im.frame.realWidth, im.frame.realHeight - top);
        }
      });
      return true;
    }
    const axis = br.axis;
    for (const [x, y] of pairs(b.tiles)) {
      const f = m.pieces.indexOf(bridgePiece(axis, br.part, br.part === 'deck' ? 0 : this.rise(b), b.tiles, x, y));
      if (f < 0) continue;
      const im = this.piece(this.img(this.ni++, kit.key, f), kit, x, y, this.zt(x, y)).setDepth(this.D(x + 0.495, y + 0.495));
      if (gone) {
        const top = kit.tileOrigin.y + HH - STUMP;
        im.setCrop(0, top, im.frame.realWidth, im.frame.realHeight - top);
      }
    }
    return true;
  }

  /** Ladder frame on tile (x, y) leaning on building `attach` (or any wall or tower beside it); -1 none. */
  private ladderFrame(pieces: string[], x: number, y: number, attach?: number): number {
    for (const [dx, dy, side] of SIDES) {
      const o = this.occ.get(key(x + dx, y + dy));
      if (!o || (attach !== undefined && o.id !== attach) || BUILDINGS[o.type].access) continue;
      const [type] = this.tileLook(o, pairs(o.tiles).findIndex(([a, c]) => a === x + dx && c === y + dy));
      const target = { rampart: 'rampart', stoneWall: 'stone-wall', woodTower: 'tower-wood', stoneTower: 'stone-wall' }[type as string];
      if (target) return pieces.indexOf(`${target}-${LETTER[side]}`);
    }
    return -1;
  }

  /**
   * Place a building sprite on a w x h footprint centred on (x, y): art drawn for a bigger footprint is scaled down to
   * fit inside it (a dev warning names the type), smaller art stays 1:1; either way centred on the footprint. `turned`
   * (a building at rot 1; there is no rotated art for buildings): the sprite mirrored left to right, which swaps the
   * footprint's x and y sides on screen.
   */
  private fit(img: Phaser.GameObjects.Image, spr: BuildSprite, type: BuildingType, x: number, y: number, w: number, h: number, z: number, turned = false): Phaser.GameObjects.Image {
    const fw = turned ? spr.fh : spr.fw, fh = turned ? spr.fw : spr.fh;
    const k = Math.min(1, w / fw, h / fh), tag = `${type}${w}x${h}`;
    if ((fw !== w || fh !== h) && !this.warned.has(tag) && import.meta.env?.DEV) {
      this.warned.add(tag);
      console.warn(`[build art] ${type}: art footprint ${fw}x${fh} != sim ${w}x${h}; drawn at ${k.toFixed(2)}x`);
    }
    const ox = turned ? img.frame.realWidth - spr.tileOrigin.x : spr.tileOrigin.x;
    const top = this.pt(x - (fw * k) / 2, y - (fh * k) / 2, z);
    return img.setFlipX(turned).setScale(k).setPosition(Math.round(top.x - ox * k), Math.round(top.y - spr.tileOrigin.y * k));
  }

  /** A kit frame with its NW tile on (tx, ty) at ground level z. */
  private piece(img: Phaser.GameObjects.Image, kit: KitSprite, tx: number, ty: number, z: number): Phaser.GameObjects.Image {
    const top = this.pt(tx, ty, z);
    return img.setPosition(Math.round(top.x - kit.tileOrigin.x), Math.round(top.y - kit.tileOrigin.y));
  }

  /** Each footprint tile outlined on the ground (under the art). */
  private grid(g: Phaser.GameObjects.Graphics, tiles: readonly number[], col: number, a: number, lw: number): void {
    g.lineStyle(lw, col, a);
    for (const [x, y] of pairs(tiles)) g.strokePoints(this.corners(x, y, x + 1, y + 1, this.iso.zAt(x + 0.5, y + 0.5), 0), true);
  }

  /** A subtle ellipse on the ground round a finished building's footprint. */
  private ring(g: Phaser.GameObjects.Graphics, b: BuildingSnap, zoom: number): void {
    const c = this.pt(b.x, b.y, this.z(b)), rw = (b.w + b.h) * HW * 0.6;
    g.lineStyle(Math.max(1.5, 2 / zoom), 0xffffff, 0.5).strokeEllipse(c.x, c.y, rw * 2, rw);
    g.lineStyle(Math.max(1, 1 / zoom), TEAM_COLOR[b.team] ?? 0xcccccc, 0.8).strokeEllipse(c.x, c.y, rw * 2 + 8 / zoom, rw + 4 / zoom);
  }

  private img(i: number, texture: string, frame?: number): Phaser.GameObjects.Image {
    let img = this.imgs[i];
    if (!img) this.imgs.push((img = this.scene.add.image(0, 0, texture).setOrigin(0)));
    return img.setTexture(texture, frame).setScale(1).setFlipX(false).setCrop().clearTint().setVisible(true);
  }

  /** Tiles of standing wall pieces (the palisade's neighbour mask joins to walls, gates and towers). */
  private wallTiles(buildings: readonly BuildingSnap[]): Set<number> {
    const s = new Set<number>();
    for (const b of buildings) if (BUILDINGS[b.type].wall && b.state !== 'destroyed') for (let i = 0; i < b.tiles.length; i += 2) s.add(key(b.tiles[i], b.tiles[i + 1]));
    return s;
  }

  /** W-35 placeholder brazier (no art yet): a stand and bowl, on the deck it stands on, a flame while lit; tipped over once destroyed. */
  private brazier(g: Phaser.GameObjects.Graphics, b: BuildingSnap): void {
    const c = this.pt(b.x, b.y, this.z(b)), y = c.y - (this.lift(b)?.px ?? 0);
    if (b.state === 'destroyed') {
      g.fillStyle(0x2a2420, 1).fillEllipse(c.x, y - 2, 14, 4);
      return;
    }
    g.fillStyle(0x3a2a1a, 1).fillRect(c.x - 2, y - 14, 4, 14);
    g.fillStyle(0x5a4030, 1).fillEllipse(c.x, y - 14, 14, 5);
    g.lineStyle(1, TEAM_COLOR[b.team] ?? 0xcccccc, 1).strokeEllipse(c.x, y - 14, 14, 5);
    if (!b.lit) return;
    g.fillStyle(0xff7a20, 0.9).fillEllipse(c.x, y - 20, 9, 12);
    g.fillStyle(0xffe070, 1).fillEllipse(c.x, y - 18, 4, 6);
  }

  private placeholder(g: Phaser.GameObjects.Graphics, b: BuildingSnap, units: readonly DrawUnit[], zoom: number): void {
    const def = BUILDINGS[b.type], team = TEAM_COLOR[b.team] ?? 0xcccccc, z = this.z(b), lw = Math.max(1, 1 / zoom);
    const col = b.state === 'damaged' ? shade(MAT[def.material], 0.62) : MAT[def.material];
    const H = HEIGHT[b.type] ?? 60;
    // wall segments: one box per tile; others: the footprint rect
    const rects: [number, number, number, number][] = def.wall === 'segment'
      ? pairs(b.tiles).sort((p, q) => p[0] + p[1] - q[0] - q[1]).map(([x, y]) => [x + 0.15, y + 0.15, x + 0.85, y + 0.85])
      : [[b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2]];
    if (b.state === 'foundation') {
      for (const [x0, y0, x1, y1] of rects) {
        const c = this.corners(x0, y0, x1, y1, z, 0);
        g.fillStyle(0x6b5a40, 0.55).fillPoints(c, true);
        g.lineStyle(lw * 1.5, team, 0.9).strokePoints(c, true);
        for (const p of c) g.lineStyle(lw * 2, 0xd8c8a0, 1).lineBetween(p.x, p.y, p.x, p.y - 10);
      }
      return;
    }
    if (b.state === 'destroyed') {
      for (const [x0, y0, x1, y1] of rects) {
        g.fillStyle(0x3a3530, 0.8).fillPoints(this.corners(x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, z, 0), true);
        const c = this.pt((x0 + x1) / 2, (y0 + y1) / 2, z);
        for (let i = 0; i < 6; i++) g.fillStyle(shade(col, 0.5 + (i % 3) * 0.15), 1).fillRect(c.x - 14 + ((i * 11) % 28), c.y - 4 - ((i * 7) % 8), 6, 4);
      }
      return;
    }
    if (def.wall === 'gate' && b.state !== 'scaffold') return this.gate(g, b, units, col, team, H, z, lw);
    const scaffold = b.state === 'scaffold', h = scaffold ? H * Math.max(0.12, b.progress) : H;
    for (const [x0, y0, x1, y1] of rects) {
      this.box(g, x0, y0, x1, y1, z, h, col, lw);
      if (scaffold) this.scaffold(g, x0, y0, x1, y1, z, H, lw);
      else {
        // team band along the front top edges
        const t = this.corners(x0, y0, x1, y1, z, h);
        g.lineStyle(lw * 2, team, 1).beginPath().moveTo(t[3].x, t[3].y).lineTo(t[2].x, t[2].y).lineTo(t[1].x, t[1].y).strokePath();
        if (b.state === 'damaged') {
          const s = t[2];
          g.lineStyle(lw * 1.5, 0x1a1410, 0.9).beginPath().moveTo(s.x - 8, s.y + 4).lineTo(s.x - 3, s.y + h * 0.35).lineTo(s.x - 9, s.y + h * 0.6).strokePath();
          g.beginPath().moveTo(s.x + 10, s.y + 2).lineTo(s.x + 6, s.y + h * 0.3).strokePath();
        }
      }
    }
  }

  /** N, E, S, W corners of a tile rect at level z, raised h px. */
  private corners(x0: number, y0: number, x1: number, y1: number, z: number, h: number): P[] {
    return [this.pt(x0, y0, z), this.pt(x1, y0, z), this.pt(x1, y1, z), this.pt(x0, y1, z)].map((p) => ({ x: p.x, y: p.y - h }));
  }

  /** A solid iso box: the two front faces and the top. */
  private box(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, z: number, h: number, col: number, lw: number): void {
    const [, e, s, w] = this.corners(x0, y0, x1, y1, z, 0), top = this.corners(x0, y0, x1, y1, z, h);
    const up = (p: P) => ({ x: p.x, y: p.y - h });
    g.fillStyle(shade(col, 0.7), 1).fillPoints([w, s, up(s), up(w)], true);
    g.fillStyle(shade(col, 0.88), 1).fillPoints([s, e, up(e), up(s)], true);
    g.fillStyle(shade(col, 1.12), 1).fillPoints(top, true);
    g.lineStyle(lw, 0x1a1612, 0.8).strokePoints([w, s, e, up(e), top[0], up(w)], true).lineBetween(s.x, s.y, s.x, s.y - h);
  }

  /** Scaffold poles to the full height with diagonal braces on the front faces. */
  private scaffold(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, z: number, H: number, lw: number): void {
    const c = this.corners(x0, y0, x1, y1, z, 0);
    g.lineStyle(lw * 1.5, 0xc8a870, 0.95);
    for (const p of [c[1], c[2], c[3]]) g.lineBetween(p.x, p.y, p.x, p.y - H);
    for (const [a, b] of [[c[3], c[2]], [c[2], c[1]]]) {
      for (let k = 0; k <= 3; k++) g.lineBetween(a.x, a.y - (H * k) / 3, b.x, b.y - (H * k) / 3);
      for (let k = 0; k < 3; k++) {
        g.lineBetween(a.x, a.y - (H * k) / 3, b.x, b.y - (H * (k + 1)) / 3);
      }
    }
  }

  /** A gate: two posts and, closed, a door between them; open while one of its team is near. */
  private gate(g: Phaser.GameObjects.Graphics, b: BuildingSnap, units: readonly DrawUnit[], col: number, team: number, H: number, z: number, lw: number): void {
    const open = units.some((d) => d.team === b.team && d.u.state !== 'dead' && Math.abs(d.x - b.x) < GATE_NEAR && Math.abs(d.y - b.y) < GATE_NEAR);
    const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2, x1 = b.x + b.w / 2, y1 = b.y + b.h / 2, alongX = b.w >= b.h, k = 0.28;
    const post = (f0: number, f1: number) => alongX ? [x0 + (x1 - x0) * f0, y0 + 0.1, x0 + (x1 - x0) * f1, y1 - 0.1] : [x0 + 0.1, y0 + (y1 - y0) * f0, x1 - 0.1, y0 + (y1 - y0) * f1];
    const [a0, a1, a2, a3] = post(0, k), [c0, c1, c2, c3] = post(1 - k, 1);
    // back post first
    this.box(g, a0, a1, a2, a3, z, H, col, lw);
    if (!open) {
      const [d0, d1, d2, d3] = post(k, 1 - k);
      const m = alongX ? [d0, (d1 + d3) / 2 - 0.08, d2, (d1 + d3) / 2 + 0.08] : [(d0 + d2) / 2 - 0.08, d1, (d0 + d2) / 2 + 0.08, d3];
      this.box(g, m[0], m[1], m[2], m[3], z, H * 0.7, shade(MAT.wood, 0.8), lw);
    }
    this.box(g, c0, c1, c2, c3, z, H, col, lw);
    const t = this.corners(c0, c1, c2, c3, z, H);
    g.lineStyle(lw * 2, team, 1).lineBetween(t[3].x, t[3].y, t[1].x, t[1].y);
  }

  /** Progress (green) over materials delivered (amber) while building; hp while damaged. */
  private bar(g: Phaser.GameObjects.Graphics, b: BuildingSnap, c: P, zoom: number): void {
    const building = b.state === 'foundation' || b.state === 'scaffold';
    if (!building && b.state !== 'damaged') return;
    if (building && (BUILDINGS[b.type].wall === 'segment' || BUILDINGS[b.type].bridge) && b.delivered === 0) return; // a wall line of empty bars is noise
    const tall = this.art?.meta(b.type)?.heightPx || HEIGHT[b.type] || 60;
    const k = 1 / Math.max(zoom, 1 / 4), w = 44 * k, h = 4 * k, x = c.x - w / 2, y = c.y - tall - 14 * k;
    g.fillStyle(0x000000, 0.7).fillRect(x - k, y - k, w + 2 * k, (building ? 2 * h + 1 * k : h) + 2 * k);
    if (building) {
      g.fillStyle(0xe0a030, 1).fillRect(x, y, w * b.delivered, h);
      g.fillStyle(b.upgradeFrom ? 0x60c0f0 : 0x60d060, 1).fillRect(x, y + h + k, w * b.progress, h);
    } else g.fillStyle(0xd04030, 1).fillRect(x, y, (w * b.hp) / b.maxHp, h);
  }

  /**
   * The placement ghost: each piece's footprint on the ground (green / red; wall gates blue, towers gold), its art over it
   * (the done sprite; wall segments as kit pieces joined along the plan and the standing walls, 2 deep with both layers;
   * towers with their sides joined to a walk at their height, drawn in green on the ground; stairs and ladders as their
   * pieces), semi-transparent and tinted, ground arrows (`marks`: the wall's inside) and a label (reason, cost) above. A
   * piece without art gets a wire box of its type's height. null hides it.
   */
  ghost(pieces: GhostPiece[] | null, text: string, zoom: number, standing: readonly BuildingSnap[] = [], marks: GhostMark[] = [], labelAt?: P): void {
    const g = this.gGhost.clear();
    let ni = 0;
    if (pieces?.length) {
      const lw = Math.max(1, 1.5 / zoom), walls = this.wallTiles(standing), walk = new Map(this.walks);
      for (const p of pieces) if (p.type && BUILDINGS[p.type].wall) for (const [x, y] of pairs(p.tiles)) {
        walls.add(key(x, y));
        const m = this.art?.meta(p.type);
        if (m?.layered && BUILDINGS[p.type].wall !== 'gate') walk.set(key(x, y), { kit: m.id, px: m.walkPx, b: -1 });
      }
      let top = Infinity, cx = 0, n = 0;
      const put = (key: string, frame: number, kit: KitSprite, x: number, y: number, depth: number, tint: number, z = this.zt(x, y)) => {
        const img = this.piece(this.ghostImg(ni++, key, frame), kit, x, y, z);
        img.setDepth(depth).setTint(tint);
        top = Math.min(top, img.y + 8);
      };
      for (const p of pieces) {
        const def = p.type ? BUILDINGS[p.type] : undefined, wall = def?.wall, col = !p.ok ? BAD : wall === 'gate' ? 0x60b0ff : wall === 'tower' ? 0xffc040 : OK;
        const ts = pairs(p.tiles), xs = ts.map((q) => q[0]), ys = ts.map((q) => q[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs) + 1, y1 = Math.max(...ys) + 1, z = this.iso.zAt((x0 + x1) / 2, (y0 + y1) / 2);
        for (const [x, y] of ts) {
          const c = this.corners(x, y, x + 1, y + 1, this.iso.zAt(x + 0.5, y + 0.5), 0);
          this.gGround.fillStyle(col, 0.3).fillPoints(c, true).lineStyle(lw, col, 0.9).strokePoints(c, true);
          top = Math.min(top, c[0].y);
          cx += c[0].x; n++;
        }
        const tint = p.ok ? 0x90ff90 : 0xff7070, d = 11.3 + (x1 + y1) / 1e6;
        const kit = p.type ? this.art?.kit(p.type, 'done') : undefined, m = p.type ? this.art?.meta(p.type) : undefined;
        if (kit && m && p.bridge) {
          const br = p.bridge, axis = br.axis;
          if (isDiag(axis)) { // one row segment of the diagonal kit per row centre
            const dk = this.art?.kit(p.type!, 'done', true), dm = this.art?.meta(p.type!, true);
            const rs = pairs(br.rows ?? []);
            if (dk && dm) rs.forEach(([cx, cy], i) => {
              const f = dm.pieces.indexOf(diagPiece(axis, br.width ?? 2, br.part, br.dir ?? [1, 1], outerRow(br.part, i, rs.length)));
              if (f >= 0) put(dk.key, f, dk, cx, cy, 11.3 + (cx + cy) / 1e6, tint, this.zt(Math.floor(cx), Math.floor(cy)));
            });
          } else for (const [x, y] of ts) {
            const f = m.pieces.indexOf(bridgePiece(axis, br.part, br.rise, p.tiles, x, y));
            if (f >= 0) put(kit.key, f, kit, x, y, 11.3 + (x + y) / 1e6, tint);
          }
        } else if (kit && m && wall === 'segment') {
          for (const [x, y] of ts) {
            const f = this.wallFrame(p.type!, x, y, walls, walk);
            put(kit.key, f, kit, x, y, 11.3 + (x + y) / 1e6, tint);
            if (kit.front) put(kit.front, f, kit, x, y, 11.3 + (x + y + 0.5) / 1e6, tint);
          }
        } else if (kit && m && wall === 'tower') {
          let open = 0;
          for (const [x, y] of ts) for (const [dx, dy, s] of SIDES) {
            const w = walk.get(key(x + dx, y + dy));
            if (!w || w.b === -1 || w.px !== m.walkPx || ts.some(([a, c]) => a === x + dx && c === y + dy)) continue;
            open |= s;
            const e = this.edge(x, y, dx, dy);
            this.gGround.lineStyle(Math.max(2, 3 / zoom), 0x60ff80, 1).lineBetween(e[0].x, e[0].y, e[1].x, e[1].y);
          }
          put(kit.key, open, kit, x0, y0, d, tint);
          if (kit.front) put(kit.front, open, kit, x0, y0, d + 1e-7, tint);
        } else if (kit && m && def?.access === 'stairs') {
          const f = stairFrame(m.pieces, ts);
          if (f >= 0) put(kit.key, f, kit, x0, y0, d, tint);
        } else if (kit && m && def?.access === 'ladder' && p.attach) {
          const o = this.occ.get(key(p.attach[0], p.attach[1])), f = this.ladderFrame(m.pieces, ts[0][0], ts[0][1], o?.id);
          if (f >= 0) put(kit.key, f, kit, ts[0][0], ts[0][1], d, tint);
        } else {
          const alongX = x1 - x0 >= y1 - y0, deep = wall === 'gate' ? this.deepOf(ts, alongX, (k) => walk.has(k) && !this.occ.has(k) || (!!this.walks.get(k) && BUILDINGS[this.occ.get(k)!.type].wall === 'segment'), (k) => this.occ.has(k)) : null;
          const spr = p.type && !def?.access ? this.art?.sprite(p.type, 'done', alongX ? 'x' : 'y', deep?.side) : undefined;
          if (spr && p.type && deep) {
            const all = [...ts, ...pairs(deep.tiles)], gx = Math.min(...all.map((q) => q[0])), gy = Math.min(...all.map((q) => q[1]));
            const img = this.fit(this.ghostImg(ni++, spr.key), spr, p.type, gx + 1, gy + 1, 2, 2, this.zt(gx, gy));
            img.setDepth(d).setTint(tint);
          } else if (spr && p.type) {
            const img = this.fit(this.ghostImg(ni++, spr.key), spr, p.type, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z, !wall && p.rot === 1);
            img.setDepth(d).setTint(tint);
            top = Math.min(top, img.y + 8);
          } else if (p.type) {
            const h = HEIGHT[p.type] ?? 60, b = this.corners(x0, y0, x1, y1, z, 0), u = this.corners(x0, y0, x1, y1, z, h);
            g.lineStyle(lw, col, 0.6).strokePoints(u, true);
            for (const i of [1, 2, 3]) g.lineBetween(b[i].x, b[i].y, u[i].x, u[i].y);
            top = Math.min(top, u[0].y);
          }
        }
      }
      // the wall's inside: an arrow on each inner-row tile, pointing in
      for (const mk of marks) {
        const zz = this.iso.zAt(mk.x, mk.y), tip = this.pt(mk.x + mk.dx * 0.4, mk.y + mk.dy * 0.4, zz);
        const sx = this.pt(mk.x - mk.dy * 0.22, mk.y + mk.dx * 0.22, zz), sy = this.pt(mk.x + mk.dy * 0.22, mk.y - mk.dx * 0.22, zz);
        this.gGround.fillStyle(0xffffff, 0.85).fillTriangle(tip.x, tip.y, sx.x, sx.y, sy.x, sy.y);
        this.gGround.lineStyle(Math.max(1, 1 / zoom), 0x203020, 0.9).strokeTriangle(tip.x, tip.y, sx.x, sx.y, sy.x, sy.y);
      }
      const at = labelAt && this.pt(labelAt.x, labelAt.y, this.iso.zAt(labelAt.x, labelAt.y));
      this.label.setText(text).setScale(1 / zoom).setPosition(at ? at.x : cx / n, at ? at.y - 230 : top - 6 / zoom).setVisible(!!text);
    } else this.label.setVisible(false);
    for (let i = ni; i < this.ghostImgs.length; i++) this.ghostImgs[i].setVisible(false);
  }

  /** The two ground points of tile (x, y)'s edge towards (dx, dy). */
  private edge(x: number, y: number, dx: number, dy: number): [P, P] {
    const z = this.zt(x, y);
    if (dx) { const ex = x + (dx > 0 ? 1 : 0); return [this.pt(ex, y, z), this.pt(ex, y + 1, z)]; }
    const ey = y + (dy > 0 ? 1 : 0);
    return [this.pt(x, ey, z), this.pt(x + 1, ey, z)];
  }

  private ghostImg(i: number, texture: string, frame?: number): Phaser.GameObjects.Image {
    let img = this.ghostImgs[i];
    if (!img) this.ghostImgs.push((img = this.scene.add.image(0, 0, texture).setOrigin(0).setAlpha(0.65)));
    return img.setTexture(texture, frame).setScale(1).setFlipX(false).clearTint().setVisible(true);
  }

  /** Ring and amount label on a hovered resource node; null hides them. */
  node(n: NodeSnap | null, zoom: number): void {
    if (!n) { this.nodeLabel.setVisible(false); return; }
    const p = this.pt(n.x, n.y, this.iso.zAt(n.x, n.y)), g = this.gGhost;
    g.lineStyle(Math.max(1.5, 2 / zoom), n.amount >= 1 ? 0xffe070 : 0x808080, 1).strokeEllipse(p.x, p.y, 44, 22);
    this.nodeLabel.setText(`${n.res} ${Math.floor(n.amount)}/${n.max}`).setScale(1 / zoom).setPosition(p.x, p.y - 14 / zoom).setVisible(true);
  }

  /** Show / hide the influence area of `team`, rebaking it when the map's version changed. */
  influence(m: InfluenceMap | null, team: number, show: boolean): void {
    if (this.inflShown !== show) { this.inflShown = show; this.inflImg?.setVisible(show); }
    if (!show || !m || m.version === this.inflVer) return;
    this.inflVer = m.version;
    const { w, mask } = m, bit = 1 << team, iso = this.iso, has = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < m.h && (mask[y * w + x] & bit) !== 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const tiles: number[] = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] & bit) {
      tiles.push(x, y);
      const cx = iso.sx(x, y), cy = iso.sy(x, y, iso.zt(x, y));
      x0 = Math.min(x0, cx - HW); x1 = Math.max(x1, cx + HW); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy + 2 * HH);
    }
    this.inflImg?.destroy();
    this.inflImg = null;
    if (this.scene.textures.exists('influence')) this.scene.textures.remove('influence');
    if (!tiles.length) return;
    const s = Math.min(0.5, 4096 / (x1 - x0), 4096 / (y1 - y0));
    const tex = this.scene.textures.createCanvas('influence', Math.ceil((x1 - x0) * s) + 2, Math.ceil((y1 - y0) * s) + 2)!;
    const ctx = tex.context, col = TEAM_COLOR[team] ?? 0xcccccc, rgb = `${(col >> 16) & 255},${(col >> 8) & 255},${col & 255}`;
    ctx.lineWidth = 1.5;
    for (const [x, y] of pairs(tiles)) {
      const px = (iso.sx(x, y) - x0) * s, py = (iso.sy(x, y, iso.zt(x, y)) - y0) * s, hw = HW * s, hh = HH * s;
      const N = [px, py], E = [px + hw, py + hh], S = [px, py + 2 * hh], W = [px - hw, py + hh];
      ctx.fillStyle = `rgba(${rgb},0.18)`;
      ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(S[0], S[1]); ctx.lineTo(W[0], W[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      const edge = (a: number[], b: number[]) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
      if (!has(x, y - 1)) edge(N, E);
      if (!has(x + 1, y)) edge(E, S);
      if (!has(x, y + 1)) edge(S, W);
      if (!has(x - 1, y)) edge(W, N);
    }
    tex.refresh();
    this.inflImg = this.scene.add.image(x0, y0, 'influence').setOrigin(0).setScale(1 / s).setDepth(2);
  }

  /** The standing building whose footprint holds tile point (x, y), if any. */
  at(buildings: readonly BuildingSnap[], x: number, y: number): BuildingSnap | undefined {
    const tx = Math.floor(x), ty = Math.floor(y);
    return buildings.find((b) => b.state !== 'destroyed' && pairs(b.tiles).some(([a, c]) => a === tx && c === ty));
  }
}

const key = (x: number, y: number) => y * 65536 + x;

/** Stair piece index for tiles bottom first (piece <axis><+/-><length>: rising towards the wall), -1 none. */
export function stairFrame(pieces: string[], ts: [number, number][]): number {
  if (ts.length < 2) return -1;
  const dx = Math.sign(ts[ts.length - 1][0] - ts[0][0]), dy = Math.sign(ts[ts.length - 1][1] - ts[0][1]);
  return pieces.indexOf(`${dx ? 'x' : 'y'}${(dx || dy) > 0 ? '+' : '-'}${ts.length}`);
}

export function pairs(t: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < t.length; i += 2) out.push([t[i], t[i + 1]]);
  return out;
}
