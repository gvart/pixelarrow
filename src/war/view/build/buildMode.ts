/**
 * Build mode and economy controls of the sandbox (M2b, W-22..W-28). The UI around it (./buildPanel.ts) is a dev
 * skin that only calls the methods here and reads `status`, so the PixelLab UI kit (W-25) can replace it.
 *
 *   B toggles build mode (own influence and every footprint shown), with or without a selection; pick a tool
 *   building / tower: the real sprite snapped to tiles follows the cursor, tinted green / red with the sim's reason; R
 *     cycles its orientations (rotated footprint; art without a rotated view is mirrored); click lays the site out
 *     (W-26): with an own squad selected that squad builds it, else it stays planned (team 0); shift keeps the tool. A
 *     tower shows where it joins a walk at its height (green edges, open sides)
 *   wall (palisade / timber rampart / stone wall): drag a straight run, drag again from its end to extend; a drag
 *     elsewhere starts another line, all lines stay pending (each previewed with the real kit, 2 deep with the inside
 *     marked by arrows; F flips the inside of the last line). G / T: a gate / tower ghost follows the cursor along the
 *     lines (green / red with the reason), click inserts it. Backspace removes the last line, right click a pending line
 *     removes it; Enter (or the toolbar) orders every line
 *   stairs / ladder: the piece snaps to the nearest place it can lean on (stairs: the inside face of an own walkway
 *     wall; ladder: beside any walkway wall or tower); R cycles the places near the cursor; red with 'attach' when none
 *   siege (ram / stone thrower / siege ladder, M2c): the engine's sprite follows the cursor; click: the selected own squad
 *     builds it there (its cost paid at once; ../siege/siegeControls.ts)
 *   Esc drops the drag, then the pending lines, then the tool, then the selected site, then build mode
 *   any mode: E / right click a resource node with squads selected gathers it, an unfinished (or damaged) own site
 *   builds / resumes it (../interact.ts); left click a building selects it (panel: assign N, stop work, cancel; upgrade a finished
 *   wall, tower or gate to its next tier)
 */
import { BUILDINGS, CANCEL_REFUND, rectTiles, rotated, WALL_KIT } from '../../sim/economy';
import type { BuildingSnap, BuildingType, NodeSnap, PlaceReason, PlaceResult, ResourceKind, SiegeType, WallPlan } from '../../types';
import { SIEGE } from '../../sim/siege';
import { SIEGE_NAME } from '../siege/siegeControls';
import type { SandboxScene } from '../SandboxScene';
import { BuildingLayer, pairs, type GhostMark, type GhostPiece } from './buildingLayer';
import { BuildArt } from './buildArt';

export type WallMaterial = 'wood' | 'timber' | 'stone';
export type Tool =
  | { kind: 'building'; type: BuildingType }
  | { kind: 'wall'; material: WallMaterial }
  | { kind: 'access'; type: 'woodStairs' | 'stoneStairs' | 'ladder' }
  | { kind: 'siege'; type: SiegeType }
  | null;
export type Cost = Partial<Record<ResourceKind, number>>;
/** A wall line being planned: flat tile-centre points, its gates and towers (points on it), an explicit inside point. */
export interface WallLine { points: number[]; gates: number[]; towers: number[]; inside?: number[] }

export const RESOURCES: ResourceKind[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt'];
/** Buildings on the toolbar (wall pieces come with the wall tools). */
export const TOOLBAR: BuildingType[] = ['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress', 'woodTower', 'stoneTower'];
export const WALL_NAME: Record<WallMaterial, string> = { wood: 'palisade', timber: 'timber rampart', stone: 'stone wall' };
const REASON: Partial<Record<PlaceReason, string>> = {
  bounds: 'off the map', noBuild: 'no-build zone', water: 'water', rock: 'rock', blocked: 'blocked', overlap: 'overlaps a building',
  influence: 'outside your influence', slope: 'too steep', node: 'on a resource', short: 'line too short',
  attach: 'attach: needs a wall to lean on',
};
export const reasonText = (r: PlaceReason) => REASON[r] ?? r;
const RECHECK_MS = 500;
const TEAM = 0;
/** Tiles from the cursor an access piece snaps over. */
const SNAP_R = 4;

const costText = (c: Cost) => Object.entries(c).map(([r, v]) => `${Math.ceil(v!)} ${r}`).join(' ') || 'free';
/** Labour as the time a 20-man squad needs. */
export const labourText = (workerSec: number) => { const s = workerSec / 20; return s < 90 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)}m`; };
const key = (x: number, y: number) => y * 65536 + x;

/** A place an access piece can go: footprint centre, rotation, tiles bottom first (stairs), the tile it leans on. */
interface Spot { x: number; y: number; rot: 0 | 1; tiles: number[]; attach: number[] }

export class BuildMode {
  active = false;
  tool: Tool = null;
  rot: 0 | 1 = 0;
  /** Pending wall lines; the last one is the line being drawn / extended. insert: the next click adds a gate or tower. */
  lines: WallLine[] = [];
  insert: 'gate' | 'tower' | null = null;
  /** Dev: the next left click claims there. */
  claimArmed = false;
  /** Selected building id (HUD), -1 none. */
  selected = -1;
  hover: NodeSnap | null = null;
  /** One line for the toolbar: what the ghost says, or why an order was refused. */
  status = '';
  readonly layer: BuildingLayer;
  private drag: { x: number; y: number } | null = null; // wall run start while dragging
  /** Sim answers by query key (placement, wall plans), refreshed every RECHECK_MS. */
  private answers = new Map<string, { at: number; r: PlaceResult | WallPlan | null }>();
  private pending = false;
  /** Access tools: the spot index R picked among those near the cursor. */
  private pick = 0;
  /** Site each squad was sent to from here (stop work finds the squads of a site by it and by proximity). */
  private sent = new Map<number, number>();
  /** Next squad id the sim hands out (detach): at least the snapshot's count, bumped per detach not yet seen. */
  private nextSquad = 0;

  constructor(private s: SandboxScene) {
    this.layer = new BuildingLayer(s, s.iso, (x, y) => s.depthAt(x, y));
    void BuildArt.load(s).then((a) => (this.layer.art = a));
    s.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'b') this.toggle();
      else if (k === 'v') this.layer.cutaway = !this.layer.cutaway;
      else if (k === 'escape') this.cancel();
      else if (!this.active) return;
      else if (k === 'r') this.rotate();
      else if (k === 'enter') this.confirmWall();
      else if (k === 'backspace') this.removeLine(this.lines.length - 1);
      else if (k === 'f') this.flipInside();
      else if ((k === 'g' || k === 't') && this.tool?.kind === 'wall' && this.lines.some((l) => l.points.length >= 4)) this.insert = k === 'g' ? 'gate' : 'tower';
    });
  }

  toggle(on = !this.active): void {
    this.active = on;
    if (!on) this.setTool(null);
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.lines = [];
    this.insert = null;
    this.drag = null;
    this.pick = 0;
    this.status = '';
    if (t) this.active = true;
  }

  /** R: the next orientation of a building, the next place near the cursor for stairs and ladders. */
  rotate(): void {
    if (this.tool?.kind === 'access') this.pick++;
    else this.rot = this.rot ? 0 : 1;
  }

  /** Esc: drop the drag, then the pending lines, then the tool, then the selected building, then leave build mode. */
  cancel(): void {
    this.claimArmed = false;
    if (this.drag) { this.drag = null; this.insert = null; return; }
    if (this.insert) { this.insert = null; return; }
    if (this.tool?.kind === 'wall' && this.lines.length) this.lines = [];
    else if (this.tool) this.setTool(null);
    else if (this.selected >= 0) this.selected = -1;
    else this.toggle(false);
  }

  /** Remove pending wall line i. */
  removeLine(i: number): void {
    if (i < 0 || i >= this.lines.length) return;
    this.lines.splice(i, 1);
    this.insert = null;
  }

  /** F: flip the inside of the last line (2-deep walls: the inner row and its stairs go there). */
  flipInside(): void {
    const l = this.lines.at(-1), plan = l && this.planOf(l);
    if (!l || !plan || this.tool?.kind !== 'wall') return;
    const dir = innerDir(plan);
    if (!dir) return;
    const [cx, cy] = centroid(l.points);
    l.inside = [cx - dir[0] * 40, cy - dir[1] * 40];
  }

  /** Dev: 500 of every resource for the own team. */
  addResources(): void {
    for (const r of RESOURCES) this.s.sim.addStock(TEAM, r, 500);
  }

  armClaim(): void {
    this.claimArmed = true;
  }

  /** The first selected own squad, if any. */
  squad(): number | null {
    for (const q of this.s.selected) if (this.s.sim.squads.get(q)?.team === TEAM) return q;
    return null;
  }

  /** Who lays a site out: the selected own squad (it builds it), else the own team (a planned site). */
  private builder(): { squad: number } | { team: number } {
    const squad = this.squad();
    return squad === null ? { team: TEAM } : { squad };
  }

  /** Order every pending wall line laid out (if all their previews are valid). */
  confirmWall(): void {
    if (this.tool?.kind !== 'wall') return;
    const lines = this.lines.filter((l) => l.points.length >= 4);
    if (!lines.length) return;
    for (const l of lines) {
      const plan = this.planOf(l);
      if (!plan?.ok) { this.status = `wall: ${plan?.reason ? reasonText(plan.reason) : 'checking'}`; return; }
    }
    for (const l of lines) this.s.sim.order({ kind: 'placeWall', ...this.builder(), material: this.tool.material, ...this.wallQuery(l) });
    this.setTool(null);
  }

  // --- site orders (W-26) ---

  /** Send own squad `squad` to build / resume site `site`. */
  sendTo(squad: number, site: number): void {
    this.s.sim.order({ kind: 'build', squad, site });
    this.sent.set(squad, site);
    const b = this.s.sim.cur?.buildings?.find((q) => q.id === site);
    if (b) this.s.mark(b.x, b.y, 0x60d060);
  }

  /**
   * Assign n soldiers of the selected own squad to the selected site: the last n detach as a new squad (its id is the
   * sim's next one) and are sent; n at or over the squad's size sends the whole squad. Returns how many went.
   */
  assign(n: number): number {
    const b = this.selectedBuilding(), squad = this.squad(), q = squad === null ? undefined : this.s.sim.squads.get(squad);
    if (!b || !q || squad === null) { this.status = 'select a squad, then assign'; return 0; }
    const alive = this.s.drawn.filter((d) => d.u.squad === squad && d.u.state !== 'dead').length;
    n = Math.floor(n);
    if (n <= 0 || !alive) return 0;
    if (n >= alive) { this.sendTo(squad, b.id); return alive; }
    const id = Math.max(this.nextSquad, this.s.sim.cur?.squads.length ?? 0);
    this.nextSquad = id + 1;
    this.s.sim.order({ kind: 'detach', squad, count: n });
    this.sendTo(id, b.id);
    return n;
  }

  /** Own squads working the site: sent to it from here (still on a build order) or labouring at it. */
  squadsAt(b: BuildingSnap): number[] {
    const out = new Set<number>(), r = Math.max(b.w, b.h) / 2 + 3;
    for (const [q, site] of this.sent) if (site === b.id && this.s.sim.squads.get(q)?.order === 'build') out.add(q);
    for (const d of this.s.drawn) {
      if (d.team !== TEAM || d.u.state !== 'build' || Math.abs(d.x - b.x) > r || Math.abs(d.y - b.y) > r) continue;
      if (this.s.sim.squads.get(d.u.squad)?.order === 'build') out.add(d.u.squad);
    }
    return [...out];
  }

  /** Stop the squads working the selected site (they hold; the site keeps what it has). */
  stopWork(): void {
    const b = this.selectedBuilding();
    if (!b) return;
    for (const q of this.squadsAt(b)) { this.s.sim.order({ kind: 'stopWork', squad: q }); this.sent.delete(q); }
  }

  /** Cancel the selected unfinished site (refund: see refund(); an upgrade reverts to the old tier). */
  cancelSite(): void {
    const b = this.selectedBuilding();
    if (!b || !isSite(b)) return;
    this.s.sim.order({ kind: 'cancelSite', site: b.id });
    for (const [q, site] of this.sent) if (site === b.id) this.sent.delete(q);
    this.selected = -1;
  }

  /** The next tier of the selected finished building and what it costs (wall segments: per tile), or null. */
  upgradeOf(b: BuildingSnap | undefined): { to: BuildingType; cost: Cost; labour: number } | null {
    const up = b && b.team === TEAM && b.state === 'done' ? BUILDINGS[b.type].upgrade : undefined;
    if (!b || !up) return null;
    // a thin wall growing a walkway takes an inner row: about twice its tiles
    const n = BUILDINGS[b.type].perTile ? (b.tiles.length / 2) * (BUILDINGS[up.to].depth === 2 && !BUILDINGS[b.type].depth ? 2 : 1) : 1, cost: Cost = {};
    for (const [r, v] of Object.entries(up.cost) as [ResourceKind, number][]) cost[r] = v * n;
    return { to: up.to, cost, labour: up.labour * n };
  }

  /** Upgrade the selected finished wall, tower or gate in place (the selected squad builds it, else it stays planned). */
  upgrade(): void {
    const b = this.selectedBuilding();
    if (!this.upgradeOf(b) || !b) return;
    this.s.sim.order({ kind: 'upgrade', building: b.id, ...this.builder() });
  }

  /** Materials a site needs in all (cost x tiles for wall segments). */
  need(b: BuildingSnap): Cost {
    const d = BUILDINGS[b.type], k = d.perTile ? b.tiles.length / 2 : 1, c: Cost = {};
    const cost = b.upgradeFrom ? BUILDINGS[b.upgradeFrom].upgrade?.cost ?? d.cost : d.cost;
    for (const [r, v] of Object.entries(cost) as [ResourceKind, number][]) c[r] = v * k;
    return c;
  }

  /** What cancelling gives back of the materials on site (loads still on the way come back in full besides). */
  refund(b: BuildingSnap): Cost {
    const c: Cost = {};
    for (const [r, v] of Object.entries(this.need(b)) as [ResourceKind, number][]) {
      const n = Math.floor(v * b.delivered * CANCEL_REFUND);
      if (n > 0) c[r] = n;
    }
    return c;
  }

  // --- pointer (the scene calls these first; true = handled) ---

  onDown(t: { x: number; y: number }, shift: boolean): boolean {
    if (this.claimArmed) {
      this.s.sim.claim(TEAM, Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5);
      this.claimArmed = false;
      return true;
    }
    if (!this.active || !this.tool) return false;
    if (this.tool.kind === 'siege') {
      if (!this.s.siege.canBuild(t)) { this.status = `can't build: ${reasonText('blocked')}`; return true; }
      if (this.s.siege.buildSiege(this.tool.type, t) && !shift) this.setTool(null);
      return true;
    }
    if (this.tool.kind === 'building') {
      const type = this.tool.type, [x, y] = this.centre(type, t), r = this.answer(`p:${type},${x},${y},${this.rot}`) as PlaceResult | null;
      if (!r?.ok) { this.status = r?.reason ? `can't build: ${reasonText(r.reason)}` : 'checking...'; return true; }
      this.s.sim.order({ kind: 'placeBuilding', ...this.builder(), type, x, y, rot: this.rot });
      if (!shift) this.setTool(null);
      return true;
    }
    if (this.tool.kind === 'access') {
      const sp = this.spot(t), r = sp && (this.answer(`p:${this.tool.type},${sp.x},${sp.y},${sp.rot}`) as PlaceResult | null);
      if (!sp || !r?.ok) { this.status = `can't build: ${reasonText(r?.reason ?? 'attach')}`; return true; }
      this.s.sim.order({ kind: 'placeBuilding', ...this.builder(), type: this.tool.type, x: sp.x, y: sp.y, rot: sp.rot });
      if (!shift) this.setTool(null);
      return true;
    }
    const p = snap(t);
    if (this.insert) {
      const l = this.nearestLine(p);
      if (l) (this.insert === 'gate' ? l.gates : l.towers).push(p[0], p[1]);
      this.insert = null;
      return true;
    }
    // extend the last line from its end, or start another one (the others stay pending)
    const last = this.lines.at(-1), n = last?.points.length ?? 0;
    if (last && n && Math.hypot(last.points[n - 2] - p[0], last.points[n - 1] - p[1]) <= 2) {
      this.drag = { x: last.points[n - 2], y: last.points[n - 1] };
    } else {
      this.lines.push({ points: [p[0], p[1]], gates: [], towers: [] });
      this.drag = { x: p[0], y: p[1] };
    }
    return true;
  }

  onUp(t: { x: number; y: number }): boolean {
    if (!this.drag) return false;
    const p = snap(t), l = this.lines.at(-1)!;
    if (Math.hypot(p[0] - this.drag.x, p[1] - this.drag.y) >= 1) l.points.push(p[0], p[1]);
    else if (l.points.length === 2) this.lines.pop();
    this.drag = null;
    return true;
  }

  /**
   * Right click: in build mode with the wall tool, remove the pending line under the cursor (else drop the tool); with
   * another tool, drop it; false without a tool (the context action of ../interact.ts runs: build a site, gather a node).
   */
  command(): boolean {
    if (this.active && this.tool) {
      if (this.tool.kind === 'wall' && this.lines.length) {
        const t = this.s.pointerTile, i = this.lines.findIndex((l) => {
          const plan = this.planOf(l);
          return plan?.pieces.some((q) => pairs(q.tiles).some(([x, y]) => Math.abs(x + 0.5 - t.x) < 1 && Math.abs(y + 0.5 - t.y) < 1));
        });
        if (i >= 0) { this.removeLine(i); return true; }
      }
      this.cancel();
      return true;
    }
    return false;
  }

  /** Left click outside build mode that hit no unit: select the building there (or none); true if one was hit. */
  selectAt(t: { x: number; y: number }): boolean {
    this.selected = this.buildingAt(t)?.id ?? -1;
    return this.selected >= 0;
  }

  /** The standing building under tile point t. */
  buildingAt(t: { x: number; y: number }): BuildingSnap | undefined {
    return this.layer.at(this.s.sim.cur?.buildings ?? [], t.x, t.y);
  }

  /** Footprint centre for a type snapped so the tiles are whole. */
  private centre(type: BuildingType, t: { x: number; y: number }): [number, number] {
    const [w, h] = rotated(type, this.rot);
    return [Math.round(t.x - w / 2) + w / 2, Math.round(t.y - h / 2) + h / 2];
  }

  // --- wall lines ---

  private wallQuery(l: WallLine) {
    return { points: l.points, gates: l.gates, towers: l.towers, ...(l.inside ? { inside: l.inside } : {}) };
  }

  /** The sim's plan of a line (asked when missing or stale), null until it answers. */
  private planOf(l: WallLine): WallPlan | null {
    if (this.tool?.kind !== 'wall' || l.points.length < 4) return null;
    const o = { material: this.tool.material, ...this.wallQuery(l) };
    return this.ask(`w:${JSON.stringify(o)}`, () => this.s.sim.checkWall(TEAM, o)) as WallPlan | null;
  }

  /** The line with a tile nearest point p (within 2 tiles), for a gate or tower. */
  private nearestLine(p: [number, number]): WallLine | null {
    let best: WallLine | null = null, bd = 2;
    for (const l of this.lines) for (let i = 0; i + 3 < l.points.length; i += 2) {
      const d = segDist(p, l.points[i], l.points[i + 1], l.points[i + 2], l.points[i + 3]);
      if (d < bd) (bd = d), (best = l);
    }
    return best;
  }

  // --- stairs and ladders ---

  /**
   * Places for the access tool near t, nearest first: stairs run straight out of the inner face of an own walkway wall
   * (the inner row: a wall's second half of tiles), over open tiles; a ladder takes an open tile beside any walkway wall
   * or tower platform.
   */
  private spots(t: { x: number; y: number }): Spot[] {
    const type = this.tool?.kind === 'access' ? this.tool.type : null, bs = this.s.sim.cur?.buildings ?? [];
    if (!type) return [];
    const occ = new Set<number>();
    for (const b of bs) if (b.state !== 'destroyed') for (const [x, y] of pairs(b.tiles)) occ.add(key(x, y));
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < this.s.region.w && y < this.s.region.h && !occ.has(key(x, y));
    const near = (x: number, y: number) => Math.abs(x + 0.5 - t.x) <= SNAP_R && Math.abs(y + 0.5 - t.y) <= SNAP_R;
    const out: Spot[] = [], n = BUILDINGS[type].h;
    for (const b of bs) {
      const def = BUILDINGS[b.type];
      if (!def.walk || def.access || b.state === 'destroyed') continue;
      const ts = pairs(b.tiles);
      if (type === 'ladder') {
        for (const [x, y] of ts) for (const [dx, dy] of DIRS) {
          const lx = x + dx, ly = y + dy;
          if (near(lx, ly) && free(lx, ly) && !out.some((s) => s.tiles[0] === lx && s.tiles[1] === ly)) out.push({ x: lx + 0.5, y: ly + 0.5, rot: 0, tiles: [lx, ly], attach: [x, y] });
        }
        continue;
      }
      if (b.team !== TEAM || def.wall !== 'segment' || (b.depth ?? 1) < 2) continue;
      // inner row: the second half; inner direction from a line tile to its inner neighbour
      const half = ts.length / 2, line = ts.slice(0, half), inner = ts.slice(half);
      const lt = line.find(([x, y]) => Math.abs(x - inner[0][0]) + Math.abs(y - inner[0][1]) === 1);
      if (!lt) continue;
      const dx = inner[0][0] - lt[0], dy = inner[0][1] - lt[1];
      for (const [x, y] of inner) {
        const tiles: number[] = [];
        for (let k = n; k >= 1; k--) tiles.push(x + dx * k, y + dy * k); // bottom first
        if (!pairs(tiles).every(([a, c]) => free(a, c)) || !free(x + dx * (n + 1), y + dy * (n + 1)) || !pairs(tiles).some(([a, c]) => near(a, c))) continue;
        const xs = pairs(tiles).map((q) => q[0]), ys = pairs(tiles).map((q) => q[1]);
        out.push({ x: (Math.min(...xs) + Math.max(...xs) + 1) / 2, y: (Math.min(...ys) + Math.max(...ys) + 1) / 2, rot: dx ? 1 : 0, tiles, attach: [x, y] });
      }
    }
    return out.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y)).slice(0, 6);
  }

  /** The access spot R picked near t, if any. */
  private spot(t: { x: number; y: number }): Spot | null {
    const s = this.spots(t);
    return s.length ? s[this.pick % s.length] : null;
  }

  // --- per frame ---

  update(wp: { x: number; y: number }, zoom: number, view: { x: number; y: number; right: number; bottom: number }): void {
    const sim = this.s.sim, buildings = sim.cur?.buildings ?? [];
    if (this.selected >= 0 && !buildings.some((b) => b.id === this.selected)) this.selected = -1; // cancelled or gone
    if (this.s.sim.cur && this.nextSquad <= this.s.sim.cur.squads.length) this.nextSquad = 0;
    const placing = this.active && !!this.tool;
    this.s.siegeLayer.ghost = null;
    this.layer.selected = this.selected;
    this.layer.grids = this.active;
    this.layer.cutNear = placing ? this.s.pointerTile : null; // the ghost inside a fort always shows
    const hb = placing ? undefined : this.buildingAt(this.s.pointerTile);
    this.layer.hovered = hb && isSite(hb) ? hb.id : -1;
    this.layer.draw(buildings, this.s.drawn, view, zoom);
    this.layer.influence(sim.influence, TEAM, this.active || this.claimArmed);
    this.hover = placing ? null : this.pickNode(wp);
    if (!placing || !this.tool) {
      this.layer.ghost(null, '', zoom);
      this.layer.node(this.hover, zoom);
      return;
    }
    this.layer.node(null, zoom);
    const t = this.s.pointerTile, who = this.squad() === null ? ' · planned (no squad)' : '';
    if (this.tool.kind === 'siege') {
      const type = this.tool.type, ok = this.s.siege.canBuild(t) && this.squad() !== null, d = SIEGE[type];
      this.s.siegeLayer.ghost = { type, x: Math.floor(t.x) + 0.5, y: Math.floor(t.y) + 0.5, ok };
      this.layer.ghost(null, '', zoom);
      this.status = this.squad() === null ? `${SIEGE_NAME[type]}: select a squad to build it` : ok ? `${SIEGE_NAME[type]}: ${costText(d.cost)} · ${labourText(d.labour)} · crew ${d.crew}` : `can't build: ${reasonText('blocked')}`;
      return;
    }
    if (this.tool.kind === 'building') {
      const type = this.tool.type, [x, y] = this.centre(type, t), [w, h] = rotated(type, this.rot);
      const r = this.ask(`p:${type},${x},${y},${this.rot}`, () => sim.checkPlacement(TEAM, type, x, y, this.rot)) as PlaceResult | null;
      const d = BUILDINGS[type], ok = !!r?.ok, why = r && !ok && r.reason ? reasonText(r.reason) : '';
      const turn = w !== h ? ` · R: ${w}x${h}` : '';
      this.status = why ? `can't build: ${why}` : `${type}: ${costText(d.cost)} · ${labourText(d.labour)}${who}${turn}`;
      this.layer.ghost([{ tiles: rectTiles(x, y, w, h), ok, type, rot: this.rot }], why ? `can't build: ${why}` : `${type} ${costText(d.cost)}`, zoom, buildings);
      return;
    }
    if (this.tool.kind === 'access') {
      const type = this.tool.type, d = BUILDINGS[type], sp = this.spot(t), all = this.spots(t).length;
      if (!sp) {
        const [w, h] = rotated(type, this.rot), [x, y] = this.centre(type, t);
        this.status = `can't build: ${reasonText('attach')}`;
        this.layer.ghost([{ tiles: rectTiles(x, y, w, h), ok: false, type }], `can't build: ${reasonText('attach')}`, zoom, buildings);
        return;
      }
      const r = this.ask(`p:${type},${sp.x},${sp.y},${sp.rot}`, () => sim.checkPlacement(TEAM, type, sp.x, sp.y, sp.rot)) as PlaceResult | null;
      const ok = !!r?.ok, why = r && !ok && r.reason ? reasonText(r.reason) : '';
      this.status = why ? `can't build: ${why}` : `${type}: ${costText(d.cost)} · ${labourText(d.labour)}${who}${all > 1 ? ` · R: next place (${all})` : ''}`;
      this.layer.ghost([{ tiles: sp.tiles, ok, type, attach: sp.attach }], why ? `can't build: ${why}` : `${type} ${costText(d.cost)}`, zoom, buildings);
      return;
    }
    // wall: every pending line, the run being dragged on the last
    const mat = this.tool.material, kit = WALL_KIT[mat], drawing = this.lines.map((l, i) => (i === this.lines.length - 1 && this.drag ? { ...l, points: [...l.points, ...snap(t)] } : l));
    if (this.insert) {
      // the gate / tower ghost: the plan with it inserted on the nearest line at the cursor
      const p = snap(t), l = this.nearestLine(p), i = l ? this.lines.indexOf(l) : -1;
      if (l) drawing[i] = { ...l, [this.insert === 'gate' ? 'gates' : 'towers']: [...(this.insert === 'gate' ? l.gates : l.towers), p[0], p[1]] };
    }
    const plans = drawing.filter((l) => l.points.length >= 4).map((l) => {
      const o = { material: mat, ...this.wallQuery(l) };
      return this.ask(`w:${JSON.stringify(o)}`, () => sim.checkWall(TEAM, o)) as WallPlan | null;
    });
    if (!drawing.some((l) => l.points.length >= 4)) {
      this.status = this.lines.length ? 'drag from the end to extend' : `drag to draw a ${WALL_NAME[mat]}`;
      // the sim's plan of a two-tile stub here: a walkway wall shows both its rows (the inner one towards the inside)
      const [sx, sy] = snap(t), o = { material: mat, points: [sx, sy, sx + 1, sy], gates: [], towers: [] };
      const one = this.ask(`w:${JSON.stringify(o)}`, () => sim.checkWall(TEAM, o)) as WallPlan | null;
      const seg = one?.pieces.filter((q) => BUILDINGS[q.type].wall === 'segment');
      const marks: GhostMark[] = [];
      for (const p of seg ?? []) if (BUILDINGS[p.type].depth === 2 && p.tiles.length === 8) for (const i of [4, 6]) marks.push({ x: p.tiles[i] + 0.5, y: p.tiles[i + 1] + 0.5, dx: p.tiles[i] - p.tiles[i - 4], dy: p.tiles[i + 1] - p.tiles[i - 3] });
      this.layer.ghost(seg?.length ? seg : [{ tiles: [Math.floor(t.x), Math.floor(t.y)], ok: true, type: kit.segment }], '', zoom, buildings, marks);
      return;
    }
    const ready = plans.filter((p): p is WallPlan => !!p);
    const cost: Cost = {};
    let labour = 0, segs = 0;
    const pieces: GhostPiece[] = [], marks: GhostMark[] = [];
    for (const plan of ready) {
      for (const p of plan.pieces) {
        const d = BUILDINGS[p.type], k = d.perTile ? p.tiles.length / 2 : 1;
        for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) cost[r] = (cost[r] ?? 0) + v * k;
        labour += d.labour * k;
        if (d.wall === 'segment') segs++;
        pieces.push(p);
        if (d.depth === 2) {
          const ts = pairs(p.tiles), half = ts.length / 2;
          for (const [x, y] of ts.slice(half)) {
            const lt = ts.slice(0, half).find(([a, c]) => Math.abs(a - x) + Math.abs(c - y) === 1);
            if (lt) marks.push({ x: x + 0.5, y: y + 0.5, dx: x - lt[0], dy: y - lt[1] });
          }
        }
      }
    }
    const bad = ready.find((p) => !p.ok), why = bad?.reason ? `can't build: ${reasonText(bad.reason)} · ` : '';
    const count = (type: BuildingType) => ready.reduce((n, p) => n + p.pieces.filter((q) => q.type === type).length, 0);
    const lines = this.lines.filter((l) => l.points.length >= 4).length;
    const hint = this.insert ? ` · click a line: ${this.insert}` : ` · Enter orders ${lines} line${lines === 1 ? '' : 's'} · Backspace / right click removes one${BUILDINGS[kit.segment].depth ? ' · F flips the inside' : ''}`;
    this.status = `${why}${WALL_NAME[mat]}: ${segs} segments ${count(kit.gate)} gate ${count(kit.tower)} tower · ${costText(cost)} · ${labourText(labour)}${who}${hint}`;
    let label = `${why}${segs} seg · ${costText(cost)}`;
    if (this.insert) {
      const pt = snap(t), hit = ready.flatMap((p) => p.pieces).find((q) => BUILDINGS[q.type].wall === (this.insert === 'gate' ? 'gate' : 'tower') && pairs(q.tiles).some(([x, y]) => Math.abs(x + 0.5 - pt[0]) <= 1 && Math.abs(y + 0.5 - pt[1]) <= 1));
      label = hit ? (hit.ok ? `${this.insert}: click to place` : `can't place ${this.insert}: ${hit.reason ? reasonText(hit.reason) : '?'}`) : `${this.insert}: move onto a line`;
    }
    this.layer.ghost(pieces, label, zoom, buildings, marks, this.insert ? { x: t.x, y: t.y } : undefined);
  }

  /**
   * The sim's answer for a query key (placement or wall plan), asked off the worker when missing or older than
   * RECHECK_MS (one query in flight at a time); the last answer for the key meanwhile, null before the first.
   */
  private ask(k: string, q: () => Promise<PlaceResult | WallPlan | null>): PlaceResult | WallPlan | null {
    const now = performance.now(), a = this.answers.get(k);
    if (!this.pending && (!a || now - a.at > RECHECK_MS)) {
      this.pending = true;
      if (this.answers.size > 64) this.answers.clear();
      void q().then((r) => this.answers.set(k, { at: performance.now(), r })).finally(() => (this.pending = false));
    }
    return a?.r ?? null;
  }

  private answer(k: string): PlaceResult | WallPlan | null {
    return this.answers.get(k)?.r ?? null;
  }

  /** The resource node drawn under world px (wx, wy): its foot to ~two tiles above it. */
  private pickNode(w: { x: number; y: number }): NodeSnap | null {
    const iso = this.s.iso;
    let best: NodeSnap | null = null, bd = Infinity;
    for (const n of this.s.sim.nodes) {
      const fx = iso.sx(n.x, n.y);
      if (Math.abs(fx - w.x) > 24) continue;
      const fy = iso.sy(n.x, n.y, iso.zAt(n.x, n.y));
      if (w.y < fy - 72 || w.y > fy + 12) continue;
      const d = Math.hypot(fx - w.x, fy - 24 - w.y);
      if (d < bd) (bd = d), (best = n);
    }
    return best;
  }

  /** The selected building, if it still stands in the snapshot. */
  selectedBuilding(): BuildingSnap | undefined {
    return this.s.sim.cur?.buildings?.find((b) => b.id === this.selected);
  }
}

/** An unfinished site (planned, half built or under way). */
export const isSite = (b: BuildingSnap) => b.state === 'foundation' || b.state === 'scaffold';
export { costText };

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
/** A tile centre under a tile point. */
const snap = (t: { x: number; y: number }): [number, number] => [Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5];

/** Mean of flat x,y points. */
function centroid(p: number[]): [number, number] {
  let x = 0, y = 0;
  for (let i = 0; i < p.length; i += 2) (x += p[i]), (y += p[i + 1]);
  return [(x * 2) / p.length, (y * 2) / p.length];
}

/** Direction from the line to its inner row in a plan's first 2-deep segment, or null. */
function innerDir(plan: WallPlan): [number, number] | null {
  for (const p of plan.pieces) {
    if (BUILDINGS[p.type].depth !== 2) continue;
    const ts = pairs(p.tiles), half = ts.length / 2, [x, y] = ts[half] ?? [];
    const lt = ts.slice(0, half).find(([a, c]) => Math.abs(a - x) + Math.abs(c - y) === 1);
    if (lt) return [x - lt[0], y - lt[1]];
  }
  return null;
}

/** Distance from point p to the segment (ax, ay)-(bx, by). */
function segDist(p: [number, number], ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, k = l ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l)) : 0;
  return Math.hypot(p[0] - ax - dx * k, p[1] - ay - dy * k);
}
