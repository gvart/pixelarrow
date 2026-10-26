/**
 * Build mode and economy controls of the sandbox (M2b, W-22..W-28). The UI around it (the HUD's build bar and command
 * card, ../hud/hud.ts) only calls the methods here and reads `status`.
 *
 *   B toggles build mode (own influence and every footprint shown), with or without a selection; pick a tool
 *   building / tower: the real sprite snapped to tiles follows the cursor, tinted green / red with the sim's reason; R
 *     cycles its orientations (rotated footprint; art without a rotated view is mirrored); click lays the site out
 *     (W-26): with an own squad selected that squad builds it, else it stays planned (team 0); shift keeps the tool. A
 *     tower shows where it joins a walk at its height (green edges, open sides)
 *   wall (palisade / timber rampart / stone wall, W-57, as Age of Empires and Stronghold): press and drag, or click the
 *     start and click the end (./wallDraw.ts); the line orders on release. The preview shows every piece green or red
 *     (2 deep with the inside marked by arrows; F flips the inside); the sim lays out the green ones and skips the red,
 *     the status says why. Starting or ending on an own wall, tower or gate joins it. Shift chains from the end, Esc or
 *     right click drops the start. G / T: the gate / tower tool of the wall's material. Towers and gates are plain
 *     building tools: dropped on an own wall a gate replaces that stretch, a tower takes its tiles and joins it; a gate
 *     turns along the wall under the cursor
 *   stairs / ladder: the piece snaps to the nearest place it can lean on (stairs: the inside face of an own walkway
 *     wall; ladder: beside any walkway wall or tower); R cycles the places near the cursor; red with 'attach' when none
 *   bridge (wood / stone, M2d, v2 W-33): drag from a bank straight across the water to the far bank; the real deck pieces
 *     and ramps follow the drag, snapped to the nearest of 4 directions (the grid axes, or the grid diagonals that run
 *     straight across the screen), [ / ] narrower / wider (1-3 tiles), green / red with the span (most
 *     BRIDGE.maxSpan[material] tiles of water) and the sim's reason; release orders it (the selected squad builds it, else planned)
 *   siege (ram / stone thrower / siege ladder, M2c): the engine's sprite follows the cursor; click: the selected own squad
 *     builds it there (its cost paid at once; ../siege/siegeControls.ts)
 *   Esc drops the drag or the wall's start, then the tool, then the selected site, then build mode
 *   any mode: E / right click a resource node with squads selected gathers it, an unfinished (or damaged) own site
 *   builds / resumes it (../interact.ts); left click a building selects it (panel: stop work, cancel; upgrade a finished
 *   wall, tower or gate to its next tier)
 */
import { BRIDGE, BUILDINGS, CANCEL_REFUND, rectTiles, rotated, WALL_KIT } from '../../sim/economy';
import type { BridgeAxis, BridgePlan, BuildingSnap, BuildingType, NodeSnap, PlaceReason, PlaceResult, ResourceKind, SiegeType, WallPlan } from '../../types';
import { SIEGE } from '../../sim/siege';
import { SIEGE_NAME } from '../siege/siegeControls';
import type { SandboxScene } from '../SandboxScene';
import { BuildingLayer, pairs, type GhostMark, type GhostPiece } from './buildingLayer';
import { BuildArt } from './buildArt';
import { keys } from '../../input/keys';
import { myTeam } from '../side';
import { SQUAD_MAX } from '../../sim/soldiers';
import { WallDraw } from './wallDraw';

export type WallMaterial = 'wood' | 'timber' | 'stone';
export type Tool =
  | { kind: 'building'; type: BuildingType }
  | { kind: 'wall'; material: WallMaterial }
  | { kind: 'access'; type: 'woodStairs' | 'stoneStairs' | 'ladder' }
  | { kind: 'siege'; type: SiegeType }
  | { kind: 'bridge'; material: 'wood' | 'stone' }
  | null;
export type Cost = Partial<Record<ResourceKind, number>>;

export const RESOURCES: ResourceKind[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt'];
/** Buildings on the toolbar (walls, towers and gates sit on the Walls tab). */
export const TOOLBAR: BuildingType[] = ['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress'];
export const WALL_NAME: Record<WallMaterial, string> = { wood: 'palisade', timber: 'timber rampart', stone: 'stone wall' };
const REASON: Partial<Record<PlaceReason, string>> = {
  bounds: 'off the map', noBuild: 'no-build zone', water: 'water', rock: 'rock', blocked: 'blocked', overlap: 'overlaps a building',
  influence: 'outside your influence', slope: 'too steep', node: 'on a resource', short: 'line too short',
  attach: 'attach: needs a wall to lean on', span: 'too long: over the span limit', bank: 'needs dry banks at both ends',
};
/** Bridge directions in the tool's status (BridgePlan axis). */
const AXIS_NAME: Record<BridgeAxis, string> = { x: 'along x', y: 'along y', h: 'screen-horizontal', v: 'screen-vertical' };
export const reasonText = (r: PlaceReason) => REASON[r] ?? r;
const RECHECK_MS = 500;
/** How long the status keeps what the last wall order said (what it skipped). */
const SAID_MS = 4000;
/** Tiles from the cursor an access piece snaps over. */
const SNAP_R = 4;

const costText = (c: Cost) => Object.entries(c).map(([r, v]) => `${Math.ceil(v!)} ${r}`).join(' ') || 'free';
/** Labour as the time one squad (SQUAD_MAX men) needs, `slots` of them at work at once (a piece's `workers`; default all). */
export const labourText = (workerSec: number, slots = SQUAD_MAX) => { const s = workerSec / Math.max(1, Math.min(SQUAD_MAX, slots)); return s < 90 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)}m`; };
const key = (x: number, y: number) => y * 65536 + x;

/** A place an access piece can go: footprint centre, rotation, tiles bottom first (stairs), the tile it leans on. */
interface Spot { x: number; y: number; rot: 0 | 1; tiles: number[]; attach: number[] }

export class BuildMode {
  active = false;
  tool: Tool = null;
  rot: 0 | 1 = 0;
  /** The wall tool's line being drawn (W-57); inside: a point on the wall's inside once F flipped it (else the sim's default). */
  readonly wall = new WallDraw();
  private inside: number[] | null = null;
  /** Shift held at the last press (a wall line chains from its end). */
  private shift = false;
  /** Dev: the next left click claims there. */
  claimArmed = false;
  /** Selected building id (HUD), -1 none. */
  selected = -1;
  hover: NodeSnap | null = null;
  /** One line for the toolbar: what the ghost says, or why an order was refused. */
  status = '';
  readonly layer: BuildingLayer;
  private drag: { x: number; y: number } | null = null; // bridge start while dragging
  /** Sim answers by query key (placement, wall plans), refreshed every RECHECK_MS. */
  private answers = new Map<string, { at: number; r: PlaceResult | WallPlan | BridgePlan | null }>();
  private pending = false;
  /** Access tools: the spot index R picked among those near the cursor. */
  private pick = 0;
  /** Bridge tool: the width in tiles ([ / ] narrower / wider). */
  bridgeWidth = BRIDGE.width;
  /** Site each squad was sent to from here (stop work finds the squads of a site by it and by proximity). */
  private sent = new Map<number, number>();

  constructor(private s: SandboxScene) {
    this.layer = new BuildingLayer(s, s.iso, (x, y) => s.depthAt(x, y));
    void BuildArt.load(s).then((a) => (this.layer.art = a));
    s.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const a = keys.act(e);
      if (a === 'build.mode') this.toggle();
      else if (a === 'view.cutaway') this.layer.cutaway = !this.layer.cutaway;
      else if (a === 'back') this.cancel();
      else if (!this.active) return;
      else if (a === 'build.rotate') this.rotate();
      else if (a === 'build.undo') this.wall.cancel();
      else if (a === 'build.flip') this.flipInside();
      else if ((a === 'build.narrower' || a === 'build.wider') && this.tool?.kind === 'bridge') this.bridgeWidth = Math.max(1, Math.min(3, this.bridgeWidth + (a === 'build.wider' ? 1 : -1)));
      else if ((a === 'build.gate' || a === 'build.tower') && this.tool?.kind === 'wall') this.setTool({ kind: 'building', type: WALL_KIT[this.tool.material][a === 'build.gate' ? 'gate' : 'tower'] });
    });
  }

  toggle(on = !this.active): void {
    this.active = on;
    if (!on) this.setTool(null);
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.wall.cancel();
    this.inside = null;
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

  /** Esc: drop the drag or the wall's start, then the tool, then the selected building, then leave build mode. */
  cancel(): void {
    this.claimArmed = false;
    if (this.drag) { this.drag = null; return; }
    if (this.wall.cancel()) return;
    if (this.tool) this.setTool(null);
    else if (this.selected >= 0) this.selected = -1;
    else this.toggle(false);
  }

  /** F: flip the inside of the wall being drawn (2-deep walls: the inner row and its stairs go there). */
  flipInside(): void {
    if (this.tool?.kind !== 'wall') return;
    const s = this.wall.start ?? snap(this.s.pointerTile), [cx, cy] = snap(this.s.pointerTile);
    const plan = this.planOf([...s, cx === s[0] && cy === s[1] ? cx + 1 : cx, cy]), dir = plan && innerDir(plan);
    if (!dir) return;
    this.inside = [(s[0] + cx) / 2 - dir[0] * 40, (s[1] + cy) / 2 - dir[1] * 40];
  }

  /** Dev: 500 of every resource for the own team. */
  addResources(): void {
    for (const r of RESOURCES) this.s.sim.addStock(myTeam(), r, 500);
  }

  armClaim(): void {
    this.claimArmed = true;
  }

  /** The first selected own squad, if any. */
  squad(): number | null {
    for (const q of this.s.selected) if (this.s.sim.squads.get(q)?.team === myTeam()) return q;
    return null;
  }

  /** Who lays a site out: the selected own squad (it builds it), else the own team (a planned site). */
  private builder(): { squad: number } | { team: number } {
    const squad = this.squad();
    return squad === null ? { team: myTeam() } : { squad };
  }

  /**
   * Order the wall line `points` (W-57): the sim lays out its buildable pieces and skips the blocked ones; the status says
   * what was skipped and why (from the preview's plan). The tool stays for the next line (Esc or right click drops it).
   */
  private orderWall(points: number[]): void {
    if (this.tool?.kind !== 'wall') return;
    const material = this.tool.material, plan = this.planOf(points);
    if (plan && !plan.ok) { this.said = { at: performance.now(), text: `can't build: ${plan.reason ? reasonText(plan.reason) : '?'}` }; return; }
    this.s.sim.order({ kind: 'placeWall', ...this.builder(), material, ...this.wallQuery(points) });
    const skipped = plan?.pieces.filter((p) => !p.ok) ?? [];
    this.said = { at: performance.now(), text: `${WALL_NAME[material]} ordered${skipped.length ? ` · skipped ${skipped.length} blocked: ${skipText(skipped)}` : ''}` };
  }
  /** What the last wall order said (the status shows it a few seconds while no new line is started). */
  private said: { at: number; text: string } | null = null;

  // --- site orders (W-26) ---

  /** Send own squad `squad` to build / resume site `site`. */
  sendTo(squad: number, site: number): void {
    this.s.sim.order({ kind: 'build', squad, site });
    this.sent.set(squad, site);
    const b = this.s.sim.cur?.buildings?.find((q) => q.id === site);
    if (b) this.s.mark(b.x, b.y, 0x60d060);
  }

  /** Own squads working the site: sent to it from here (still on a build order) or labouring at it. */
  squadsAt(b: BuildingSnap): number[] {
    const out = new Set<number>(), r = Math.max(b.w, b.h) / 2 + 3;
    for (const [q, site] of this.sent) if (site === b.id && this.s.sim.squads.get(q)?.order === 'build') out.add(q);
    for (const d of this.s.drawn) {
      if (d.team !== myTeam() || d.u.state !== 'build' || Math.abs(d.x - b.x) > r || Math.abs(d.y - b.y) > r) continue;
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
    const up = b && b.team === myTeam() && b.state === 'done' ? BUILDINGS[b.type].upgrade : undefined;
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
      this.s.sim.claim(myTeam(), Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5);
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
      const type = this.tool.type, rot = this.rotFor(type, t), [x, y] = this.centre(type, t, rot), r = this.answer(`p:${type},${x},${y},${rot}`) as PlaceResult | null;
      if (!r?.ok) { this.status = r?.reason ? `can't build: ${reasonText(r.reason)}` : 'checking...'; return true; }
      this.s.sim.order({ kind: 'placeBuilding', ...this.builder(), type, x, y, rot });
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
    if (this.tool.kind === 'bridge') {
      this.drag = { x: p[0], y: p[1] };
      return true;
    }
    this.said = null;
    this.shift = shift;
    this.wall.press(p);
    return true;
  }

  onUp(t: { x: number; y: number }): boolean {
    if (this.active && this.tool?.kind === 'wall') {
      const line = this.wall.release(snap(t), this.shift);
      if (line) this.orderWall(line);
      return true;
    }
    if (!this.drag) return false;
    if (this.tool?.kind === 'bridge') {
      const o = this.bridgeQuery(t), who = this.builder();
      this.drag = null;
      void this.s.sim.checkBridge(myTeam(), o).then((plan) => {
        if (!plan?.ok) { this.status = `can't build: ${plan?.reason ? reasonText(plan.reason) : 'no sim'}`; return; }
        this.s.sim.order({ kind: 'placeBridge', ...who, ...o });
        this.setTool(null);
      });
      return true;
    }
    this.drag = null;
    return true;
  }

  /**
   * Right click: in build mode with the wall tool, drop the line's start (else the tool); with another tool, drop it;
   * false without a tool (the context action of ../interact.ts runs: build a site, gather a node).
   */
  command(): boolean {
    if (this.active && this.tool) {
      this.cancel();
      return true;
    }
    return false;
  }

  /** Left click outside build mode that hit no unit: select the building there (or none); true if one was hit. */
  selectAt(t: { x: number; y: number }): boolean {
    this.selected = this.pieceAt(t)?.id ?? -1;
    return this.selected >= 0;
  }

  /** M7g: the standing building under tile point t, else a pre-built ruin there (its card offers the rebuild). */
  pieceAt(t: { x: number; y: number }): BuildingSnap | undefined {
    const all = this.s.sim.cur?.buildings ?? [], tx = Math.floor(t.x), ty = Math.floor(t.y);
    return this.layer.at(all, t.x, t.y) ?? all.find((b) => b.ruin && pairs(b.tiles).some(([a, c]) => a === tx && c === ty));
  }

  /** The standing building under tile point t. */
  buildingAt(t: { x: number; y: number }): BuildingSnap | undefined {
    return this.layer.at(this.s.sim.cur?.buildings ?? [], t.x, t.y);
  }

  /** Footprint centre for a type snapped so the tiles are whole. */
  private centre(type: BuildingType, t: { x: number; y: number }, rot = this.rot): [number, number] {
    const [w, h] = rotated(type, rot);
    return [Math.round(t.x - w / 2) + w / 2, Math.round(t.y - h / 2) + h / 2];
  }

  // --- bridges ---

  /** The bridge query for the drag from its start to tile point t. */
  private bridgeQuery(t: { x: number; y: number }): { material: 'wood' | 'stone'; points: number[]; width: number } {
    const material = this.tool?.kind === 'bridge' ? this.tool.material : 'wood', d = this.drag ?? { x: t.x, y: t.y };
    return { material, points: [d.x, d.y, ...snap(t)], width: this.bridgeWidth };
  }

  /** The bridge tool's ghost and status: the sim's plan of the drag, or a single deck tile at the cursor. */
  private bridgeGhost(t: { x: number; y: number }, zoom: number, buildings: readonly BuildingSnap[], who: string): void {
    const material = this.tool?.kind === 'bridge' ? this.tool.material : 'wood', type = BRIDGE.kit[material];
    const wide = `${this.bridgeWidth} wide ([ ] width)`;
    if (!this.drag) {
      this.status = `${material} bridge, ${wide}: drag from a bank straight across the water (at most ${BRIDGE.maxSpan[material]} tiles; along the grid or screen-straight)${who}`;
      this.layer.ghost([{ tiles: [Math.floor(t.x), Math.floor(t.y)], ok: true, type }], '', zoom, buildings);
      return;
    }
    const o = this.bridgeQuery(t), plan = this.ask(`b:${JSON.stringify(o)}`, () => this.s.sim.checkBridge(myTeam(), o)) as BridgePlan | null;
    if (!plan) { this.layer.ghost(null, '', zoom); return; }
    const d = BUILDINGS[type], cost: Cost = {};
    let n = 0;
    for (const p of plan.pieces) n += p.tiles.length / 2;
    for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) cost[r] = v * n;
    const pieces: GhostPiece[] = plan.pieces.map((p, i) => {
      // a ramp rises towards the piece beside it
      const near = plan.pieces[i === 0 ? 1 : i - 1], k = plan.axis === 'x' ? 0 : 1;
      const rise = near ? Math.sign(near.tiles[k] - p.tiles[k]) : 1;
      return { tiles: p.tiles, ok: p.ok && plan.ok, type: p.type, bridge: { axis: plan.axis, part: p.part, rise, dir: plan.dir, width: plan.width, rows: p.rows } };
    });
    const span = plan.span ? `span ${plan.span}/${plan.maxSpan}` : 'no water';
    const why = plan.ok ? '' : `can't build: ${plan.reason ? reasonText(plan.reason) : '?'} · `;
    this.status = `${why}${material} bridge ${AXIS_NAME[plan.axis]}, ${wide}: ${span} · ${costText(cost)} · ${labourText(d.labour * n)}${who} · release to order`;
    this.layer.ghost(pieces.length ? pieces : [{ tiles: [Math.floor(t.x), Math.floor(t.y)], ok: false, type }], `${why}${span}${plan.ok ? ' · ' + costText(cost) : ''}`, zoom, buildings);
  }

  // --- wall lines ---

  private wallQuery(points: number[]) {
    return { points, ...(this.inside ? { inside: this.inside } : {}) };
  }

  /** The sim's plan of a line (asked when missing or stale), null until it answers. */
  private planOf(points: number[]): WallPlan | null {
    if (this.tool?.kind !== 'wall' || points.length < 4) return null;
    const o = { material: this.tool.material, ...this.wallQuery(points) };
    return this.ask(`w:${JSON.stringify(o)}`, () => this.s.sim.checkWall(myTeam(), o)) as WallPlan | null;
  }

  /** A gate turned along the own wall under it (both its tiles on wall segments), else the chosen rotation. */
  private rotFor(type: BuildingType, t: { x: number; y: number }): 0 | 1 {
    if (BUILDINGS[type].wall !== 'gate') return this.rot;
    const walls = new Set<number>();
    for (const b of this.s.sim.cur?.buildings ?? []) if (b.team === myTeam() && BUILDINGS[b.type].wall === 'segment' && b.state !== 'destroyed') for (const [x, y] of pairs(b.tiles)) walls.add(key(x, y));
    for (const r of [this.rot, this.rot ? 0 : 1] as const) {
      const [x, y] = this.centre(type, t, r), [w, h] = rotated(type, r);
      if (pairs(rectTiles(x, y, w, h)).every(([a, c]) => walls.has(key(a, c)))) return r;
    }
    return this.rot;
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
      if (b.team !== myTeam() || def.wall !== 'segment' || (b.depth ?? 1) < 2) continue;
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
    const placing = this.active && !!this.tool;
    this.s.siegeLayer.ghost = null;
    this.layer.selected = this.selected;
    this.layer.grids = this.active;
    this.layer.cutNear = placing ? this.s.pointerTile : null; // W-57: what stands near the ghost goes see-through
    this.layer.team = myTeam();
    const hb = placing ? undefined : this.buildingAt(this.s.pointerTile);
    this.layer.hovered = hb && isSite(hb) ? hb.id : -1;
    this.layer.draw(buildings, this.s.drawn, view, zoom);
    this.layer.influence(sim.influence, myTeam(), this.active || this.claimArmed);
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
    if (this.tool.kind === 'bridge') return this.bridgeGhost(t, zoom, buildings, who);
    if (this.tool.kind === 'building') {
      const type = this.tool.type, rot = this.rotFor(type, t), [x, y] = this.centre(type, t, rot), [w, h] = rotated(type, rot);
      const r = this.ask(`p:${type},${x},${y},${rot}`, () => sim.checkPlacement(myTeam(), type, x, y, rot)) as PlaceResult | null;
      const d = BUILDINGS[type], ok = !!r?.ok, why = r && !ok && r.reason ? reasonText(r.reason) : '';
      const turn = w !== h ? ` · R: ${w}x${h}` : '', onWall = d.wall === 'gate' ? ' · on a wall: replaces it there' : d.wall === 'tower' ? ' · on or beside a wall: joins it' : '';
      this.status = why ? `can't build: ${why}` : `${type}: ${costText(d.cost)} · ${labourText(d.labour, d.workers)}${who}${turn}${onWall}`;
      this.layer.ghost([{ tiles: rectTiles(x, y, w, h), ok, type, rot }], why ? `can't build: ${why}` : `${type} ${costText(d.cost)}`, zoom, buildings);
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
      const r = this.ask(`p:${type},${sp.x},${sp.y},${sp.rot}`, () => sim.checkPlacement(myTeam(), type, sp.x, sp.y, sp.rot)) as PlaceResult | null;
      const ok = !!r?.ok, why = r && !ok && r.reason ? reasonText(r.reason) : '';
      this.status = why ? `can't build: ${why}` : `${type}: ${costText(d.cost)} · ${labourText(d.labour)}${who}${all > 1 ? ` · R: next place (${all})` : ''}`;
      this.layer.ghost([{ tiles: sp.tiles, ok, type, attach: sp.attach }], why ? `can't build: ${why}` : `${type} ${costText(d.cost)}`, zoom, buildings);
      return;
    }
    // wall (W-57): the line from its start to the cursor, every piece green or red with the sim's reason
    const mat = this.tool.material, kit = WALL_KIT[mat], [cx, cy] = snap(t), st = this.wall.start;
    const said = this.said && performance.now() - this.said.at < SAID_MS ? `${this.said.text} · ` : '';
    const flip = BUILDINGS[kit.segment].depth ? ' · F flips the inside' : '';
    if (!st || (st[0] === cx && st[1] === cy)) {
      this.status = `${said}${st ? 'click the end, or drag to it' : `drag, or click the start and the end, to draw a ${WALL_NAME[mat]}`} · shift chains · Esc / right click cancels${flip}`;
      // the sim's plan of a two-tile stub here: a walkway wall shows both its rows (the inner one towards the inside)
      const o = { material: mat, ...this.wallQuery([cx, cy, cx + 1, cy]) };
      const one = this.ask(`w:${JSON.stringify(o)}`, () => sim.checkWall(myTeam(), o)) as WallPlan | null;
      const seg = one?.pieces.filter((q) => BUILDINGS[q.type].wall === 'segment');
      this.layer.ghost(seg?.length ? seg : [{ tiles: [Math.floor(t.x), Math.floor(t.y)], ok: true, type: kit.segment }], '', zoom, buildings, innerMarks(seg ?? []));
      return;
    }
    const plan = this.planOf([...st, cx, cy]);
    if (!plan) return;
    const cost: Cost = {};
    let labour = 0, slots = 0, segs = 0;
    for (const p of plan.pieces) {
      if (!p.ok) continue;
      const d = BUILDINGS[p.type], k = d.perTile ? p.tiles.length / 2 : 1;
      for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) cost[r] = (cost[r] ?? 0) + v * k;
      labour += d.labour * k;
      slots += d.workers;
      segs++;
    }
    const skipped = plan.pieces.filter((p) => !p.ok), skip = skipped.length ? ` · ${skipped.length} blocked, skipped: ${skipText(skipped)}` : '';
    const why = plan.ok ? '' : `can't build: ${plan.reason ? reasonText(plan.reason) : '?'} · `;
    this.status = `${said}${why}${WALL_NAME[mat]}: ${segs} segment${segs === 1 ? '' : 's'} · ${costText(cost)} · ${labourText(labour, slots)}${who}${skip} · release or click to order${flip}`;
    this.layer.ghost(plan.pieces, `${why}${segs} seg · ${costText(cost)}${skipped.length ? ` · ${skipped.length} skipped` : ''}`, zoom, buildings, innerMarks(plan.pieces));
  }

  /**
   * The sim's answer for a query key (placement or wall plan), asked off the worker when missing or older than
   * RECHECK_MS (one query in flight at a time); the last answer for the key meanwhile, null before the first.
   */
  private ask(k: string, q: () => Promise<PlaceResult | WallPlan | BridgePlan | null>): PlaceResult | WallPlan | BridgePlan | null {
    const now = performance.now(), a = this.answers.get(k);
    if (!this.pending && (!a || now - a.at > RECHECK_MS)) {
      this.pending = true;
      if (this.answers.size > 64) this.answers.clear();
      void q().then((r) => this.answers.set(k, { at: performance.now(), r })).finally(() => (this.pending = false));
    }
    return a?.r ?? null;
  }

  private answer(k: string): PlaceResult | WallPlan | BridgePlan | null {
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

/** Why the skipped pieces of a wall plan cannot be built, each reason once ("rock, water"). */
export const skipText = (pieces: WallPlan['pieces']) => [...new Set(pieces.map((p) => reasonText(p.reason ?? 'blocked')))].join(', ');

/** Ground arrows on the inner-row tiles of 2-deep wall pieces (line tiles first, inner row after), pointing in. */
function innerMarks(pieces: WallPlan['pieces']): GhostMark[] {
  const out: GhostMark[] = [];
  for (const p of pieces) {
    if (BUILDINGS[p.type].depth !== 2) continue;
    const ts = pairs(p.tiles), half = Math.ceil(ts.length / 2);
    for (const [x, y] of ts.slice(half)) {
      const lt = ts.slice(0, half).find(([a, c]) => Math.abs(a - x) + Math.abs(c - y) === 1);
      if (lt) out.push({ x: x + 0.5, y: y + 0.5, dx: x - lt[0], dy: y - lt[1] });
    }
  }
  return out;
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
