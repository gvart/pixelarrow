/**
 * Build mode and economy controls of the sandbox (M2b, W-22..W-24). The UI around it (./buildPanel.ts) is a dev
 * skin that only calls the methods here and reads `status`, so the PixelLab UI kit (W-25) can replace it.
 *
 *   B toggles build mode (own influence and every footprint shown), with or without a selection; pick a tool
 *   building: the building's sprite snapped to tiles follows the cursor, tinted green / red with the sim's reason;
 *     click lays the site out (W-26): with an own squad selected that squad builds it, else it stays planned (team 0)
 *     until a squad is sent; shift keeps the tool; R rotates
 *   wall: drag a straight run, drag again from its end to extend; G / T then click on the line inserts a gate /
 *     tower; Enter (or the toolbar) orders it, the preview shows the wall kit pieces, segments and cost
 *   Esc drops the wall line, then the tool, then the selected site, then build mode
 *   any mode: right click a resource node with squads selected gathers it; right click an unfinished (or damaged) own
 *   site builds / resumes it; left click a building selects it (site panel: assign N, stop work, cancel)
 */
import { BUILDINGS, CANCEL_REFUND, rectTiles, rotated, WALL_KIT } from '../../sim/economy';
import type { BuildingSnap, BuildingType, NodeSnap, PlaceReason, PlaceResult, ResourceKind, WallPlan } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { BuildingLayer } from './buildingLayer';
import { BuildArt } from './buildArt';

export type Tool = { kind: 'building'; type: BuildingType } | { kind: 'wall'; material: 'wood' | 'stone' } | null;
export type Cost = Partial<Record<ResourceKind, number>>;

export const RESOURCES: ResourceKind[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt'];
/** Buildings on the toolbar (wall pieces come with the wall tools). */
export const TOOLBAR: BuildingType[] = ['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress'];
const REASON: Partial<Record<PlaceReason, string>> = {
  bounds: 'off the map', noBuild: 'no-build zone', water: 'water', rock: 'rock', blocked: 'blocked', overlap: 'overlaps a building',
  influence: 'outside your influence', slope: 'too steep', node: 'on a resource', short: 'line too short',
};
const reasonText = (r: PlaceReason) => REASON[r] ?? r;
const RECHECK_MS = 500;
const TEAM = 0;

const costText = (c: Cost) => Object.entries(c).map(([r, v]) => `${Math.ceil(v!)} ${r}`).join(' ') || 'free';
/** Labour as the time a 20-man squad needs. */
export const labourText = (workerSec: number) => { const s = workerSec / 20; return s < 90 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)}m`; };

export class BuildMode {
  active = false;
  tool: Tool = null;
  rot: 0 | 1 = 0;
  /** Wall line being laid: flat tile-centre points, gate / tower points; insert: the next click adds one. */
  wall = { points: [] as number[], towers: [] as number[], gates: [] as number[], insert: null as 'gate' | 'tower' | null };
  /** Dev: the next left click claims there. */
  claimArmed = false;
  /** Selected building id (HUD), -1 none. */
  selected = -1;
  hover: NodeSnap | null = null;
  /** One line for the toolbar: what the ghost says, or why an order was refused. */
  status = '';
  readonly layer: BuildingLayer;
  private drag: { x: number; y: number } | null = null; // wall run start while dragging
  private checkKey = '';
  private checkAt = 0;
  private pending = false;
  private place: PlaceResult | null = null;
  private plan: WallPlan | null = null;
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
      else if (k === 'escape') this.cancel();
      else if (!this.active) return;
      else if (k === 'r') this.rotate();
      else if (k === 'enter') this.confirmWall();
      else if ((k === 'g' || k === 't') && this.tool?.kind === 'wall' && this.wall.points.length >= 4) this.wall.insert = k === 'g' ? 'gate' : 'tower';
    });
  }

  toggle(on = !this.active): void {
    this.active = on;
    if (!on) this.setTool(null);
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.wall = { points: [], towers: [], gates: [], insert: null };
    this.drag = null;
    this.place = this.plan = null;
    this.checkKey = '';
    this.status = '';
    if (t) this.active = true;
  }

  rotate(): void {
    this.rot = this.rot ? 0 : 1;
  }

  /** Esc: drop the wall line, then the tool, then the selected building (closes its panel), then leave build mode. */
  cancel(): void {
    this.claimArmed = false;
    if (this.tool?.kind === 'wall' && this.wall.points.length) this.setTool(this.tool);
    else if (this.tool) this.setTool(null);
    else if (this.selected >= 0) this.selected = -1;
    else this.toggle(false);
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

  /** Order the wall line laid out (if the preview is valid). */
  confirmWall(): void {
    if (this.tool?.kind !== 'wall' || this.wall.points.length < 4) return;
    if (!this.plan?.ok) { this.status = `wall: ${this.plan?.reason ? reasonText(this.plan.reason) : 'checking'}`; return; }
    const { points, towers, gates } = this.wall;
    this.s.sim.order({ kind: 'placeWall', ...this.builder(), material: this.tool.material, points, towers, gates });
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

  /** Cancel the selected unfinished site (refund: see refund()). */
  cancelSite(): void {
    const b = this.selectedBuilding();
    if (!b || !isSite(b)) return;
    this.s.sim.order({ kind: 'cancelSite', site: b.id });
    for (const [q, site] of this.sent) if (site === b.id) this.sent.delete(q);
    this.selected = -1;
  }

  /** Materials a site needs in all (cost x tiles for wall segments). */
  need(b: BuildingSnap): Cost {
    const d = BUILDINGS[b.type], k = d.perTile ? b.tiles.length / 2 : 1, c: Cost = {};
    for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) c[r] = v * k;
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
    if (this.tool.kind === 'building') {
      if (!this.place?.ok) { this.status = this.place?.reason ? `can't build: ${reasonText(this.place.reason)}` : 'checking...'; return true; }
      const [x, y] = this.centre(this.tool.type, t);
      this.s.sim.order({ kind: 'placeBuilding', ...this.builder(), type: this.tool.type, x, y, rot: this.rot });
      if (!shift) this.setTool(null);
      return true;
    }
    const p = snap(t), w = this.wall;
    if (w.insert) {
      (w.insert === 'gate' ? w.gates : w.towers).push(p[0], p[1]);
      w.insert = null;
      return true;
    }
    const n = w.points.length;
    // a new line, or extend from its end
    if (!n || Math.hypot(w.points[n - 2] - p[0], w.points[n - 1] - p[1]) > 2) w.points = [p[0], p[1]];
    this.drag = { x: w.points[w.points.length - 2], y: w.points[w.points.length - 1] };
    return true;
  }

  onUp(t: { x: number; y: number }): boolean {
    if (!this.drag) return false;
    const p = snap(t), w = this.wall;
    if (Math.hypot(p[0] - this.drag.x, p[1] - this.drag.y) >= 1) w.points.push(p[0], p[1]);
    else if (w.points.length === 2) w.points = [];
    this.drag = null;
    return true;
  }

  /**
   * Right click: in build mode with a tool, drop the tool; with own squads selected, build / resume the own unfinished
   * or damaged site under the cursor, else gather the hovered node.
   */
  command(): boolean {
    if (this.active && this.tool) { this.cancel(); return true; }
    const own = [...this.s.selected].filter((q) => this.s.sim.squads.get(q)?.team === TEAM);
    const site = this.siteAt(this.s.pointerTile);
    if (site && own.length) {
      for (const q of own) this.sendTo(q, site.id);
      return true;
    }
    const n = this.hover;
    if (!n || n.amount < 1 || !this.s.selected.size) return false;
    for (const q of this.s.selected) if (this.s.sim.squads.get(q)?.team === TEAM) this.s.sim.order({ kind: 'gather', squad: q, node: n.id });
    this.s.mark(n.x, n.y, 0xffe070);
    return true;
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

  /** An own site under t that a squad can work: unfinished or damaged. */
  private siteAt(t: { x: number; y: number }): BuildingSnap | undefined {
    const b = this.buildingAt(t);
    return b && b.team === TEAM && (isSite(b) || b.state === 'damaged') ? b : undefined;
  }

  /** Footprint centre for a type snapped so the tiles are whole. */
  private centre(type: BuildingType, t: { x: number; y: number }): [number, number] {
    const [w, h] = rotated(type, this.rot);
    return [Math.round(t.x - w / 2) + w / 2, Math.round(t.y - h / 2) + h / 2];
  }

  // --- per frame ---

  update(wp: { x: number; y: number }, zoom: number, view: { x: number; y: number; right: number; bottom: number }): void {
    const sim = this.s.sim, buildings = sim.cur?.buildings ?? [];
    if (this.selected >= 0 && !buildings.some((b) => b.id === this.selected)) this.selected = -1; // cancelled or gone
    if (this.s.sim.cur && this.nextSquad <= this.s.sim.cur.squads.length) this.nextSquad = 0;
    const placing = this.active && !!this.tool;
    this.layer.selected = this.selected;
    this.layer.grids = this.active;
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
    if (this.tool.kind === 'building') {
      const type = this.tool.type, [x, y] = this.centre(type, t), [w, h] = rotated(type, this.rot);
      this.check(`${type},${x},${y},${this.rot}`, () => sim.checkPlacement(TEAM, type, x, y, this.rot).then((r) => (this.place = r)));
      const d = BUILDINGS[type], ok = !!this.place?.ok;
      const why = this.place && !ok && this.place.reason ? reasonText(this.place.reason) : '';
      this.status = why ? `can't build: ${why}` : `${type}: ${costText(d.cost)} · ${labourText(d.labour)}${who}`;
      this.layer.ghost([{ tiles: rectTiles(x, y, w, h), ok, type }], why ? `can't build: ${why}` : `${type} ${costText(d.cost)}`, zoom);
      return;
    }
    // wall: the committed line plus the run being dragged
    const pts = [...this.wall.points], seg = WALL_KIT[this.tool.material].segment;
    if (this.drag) pts.push(...snap(t));
    if (pts.length < 4) {
      this.status = this.wall.points.length ? 'drag from the end to extend' : 'drag to draw a wall';
      this.layer.ghost([{ tiles: [Math.floor(t.x), Math.floor(t.y)], ok: true, type: seg }], '', zoom, buildings);
      return;
    }
    const o = { material: this.tool.material, points: pts, towers: this.wall.towers, gates: this.wall.gates };
    this.check(JSON.stringify(o), () => sim.checkWall(TEAM, o).then((r) => (this.plan = r)));
    const plan = this.plan;
    if (!plan) return;
    const cost: Cost = {};
    let labour = 0, segs = 0;
    for (const p of plan.pieces) {
      const d = BUILDINGS[p.type], k = d.perTile ? p.tiles.length / 2 : 1;
      for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) cost[r] = (cost[r] ?? 0) + v * k;
      labour += d.labour * k;
      if (d.wall === 'segment') segs++;
    }
    const kit = WALL_KIT[this.tool.material];
    const extra = [plan.pieces.filter((p) => p.type === kit.gate).length + ' gate', plan.pieces.filter((p) => p.type === kit.tower).length + ' tower'].join(' ');
    const why = !plan.ok && plan.reason ? `can't build: ${reasonText(plan.reason)} · ` : '';
    this.status = `${why}${segs} segments ${extra} · ${costText(cost)} · ${labourText(labour)}${who}${this.wall.insert ? ` · click the line: ${this.wall.insert}` : ' · Enter to order'}`;
    this.layer.ghost(plan.pieces, `${why}${segs} seg · ${costText(cost)}`, zoom, buildings);
  }

  /** Ask the sim (in the worker) when the query changed or got stale; the answer lands in place / plan. */
  private check(key: string, ask: () => Promise<unknown>): void {
    const now = performance.now();
    if (this.pending || (key === this.checkKey && now - this.checkAt < RECHECK_MS)) return;
    if (key !== this.checkKey) this.place = this.plan = null;
    this.pending = true;
    this.checkKey = key;
    this.checkAt = now;
    void ask().finally(() => (this.pending = false));
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

/** A tile centre under a tile point. */
const snap = (t: { x: number; y: number }): [number, number] => [Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5];
