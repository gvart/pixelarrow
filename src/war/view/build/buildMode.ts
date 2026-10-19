/**
 * Build mode and economy controls of the sandbox (M2b, W-22..W-24). The UI around it (./buildPanel.ts) is a dev
 * skin that only calls the methods here and reads `status`, so the PixelLab UI kit (W-25) can replace it.
 *
 *   B toggles build mode (own influence shown); pick a tool on the toolbar
 *   building: a ghost footprint snapped to tiles follows the cursor, green / red with the sim's reason; click places
 *     it for the first selected squad (shift keeps the tool); R rotates
 *   wall: drag a straight run, drag again from its end to extend; G / T then click on the line inserts a gate /
 *     tower; Enter (or the toolbar) orders it, the preview shows segments and cost
 *   Esc drops the wall line, then the tool, then build mode
 *   any mode: right click a resource node with squads selected gathers it; left click a building selects it (HUD)
 */
import { BUILDINGS, rectTiles, rotated, WALL_KIT } from '../../sim/economy';
import type { BuildingSnap, BuildingType, NodeSnap, PlaceReason, PlaceResult, ResourceKind, WallPlan } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { BuildingLayer } from './buildingLayer';
import { BuildArt } from './buildArt';

export type Tool = { kind: 'building'; type: BuildingType } | { kind: 'wall'; material: 'wood' | 'stone' } | null;
export type Cost = Partial<Record<ResourceKind, number>>;

export const RESOURCES: ResourceKind[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt'];
/** Buildings on the toolbar (wall pieces come with the wall tools). */
export const TOOLBAR: BuildingType[] = ['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress'];
const REASON: Record<PlaceReason, string> = {
  bounds: 'off the map', noBuild: 'no-build zone', water: 'water', rock: 'rock', blocked: 'blocked', overlap: 'overlaps a building',
  influence: 'outside your influence', slope: 'too steep', node: 'on a resource', short: 'line too short',
};
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

  /** Esc: drop the wall line, then the tool, then leave build mode. */
  cancel(): void {
    this.claimArmed = false;
    if (this.tool?.kind === 'wall' && this.wall.points.length) this.setTool(this.tool);
    else if (this.tool) this.setTool(null);
    else this.toggle(false);
  }

  /** Dev: 500 of every resource for the own team. */
  addResources(): void {
    for (const r of RESOURCES) this.s.sim.addStock(TEAM, r, 500);
  }

  armClaim(): void {
    this.claimArmed = true;
  }

  private squad(): number | null {
    for (const q of this.s.selected) if (this.s.sim.squads.get(q)?.team === TEAM) return q;
    this.status = 'select a squad to build';
    return null;
  }

  /** Order the wall line laid out (if the preview is valid). */
  confirmWall(): void {
    if (this.tool?.kind !== 'wall' || this.wall.points.length < 4) return;
    if (!this.plan?.ok) { this.status = `wall: ${this.plan?.reason ? REASON[this.plan.reason] : 'checking'}`; return; }
    const squad = this.squad();
    if (squad === null) return;
    const { points, towers, gates } = this.wall;
    this.s.sim.order({ kind: 'placeWall', squad, material: this.tool.material, points, towers, gates });
    this.setTool(null);
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
      if (!this.place?.ok) { this.status = this.place?.reason ? `can't build: ${REASON[this.place.reason]}` : 'checking...'; return true; }
      const squad = this.squad();
      if (squad === null) return true;
      const [x, y] = this.centre(this.tool.type, t);
      this.s.sim.order({ kind: 'placeBuilding', squad, type: this.tool.type, x, y, rot: this.rot });
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

  /** Right click: gather the hovered node with the selected squads; in build mode with a tool, drop the tool. */
  command(): boolean {
    if (this.active && this.tool) { this.cancel(); return true; }
    const n = this.hover;
    if (!n || n.amount < 1 || !this.s.selected.size) return false;
    for (const q of this.s.selected) if (this.s.sim.squads.get(q)?.team === TEAM) this.s.sim.order({ kind: 'gather', squad: q, node: n.id });
    this.s.mark(n.x, n.y, 0xffe070);
    return true;
  }

  /** Left click outside build mode that hit no unit: select the building there (or none). */
  selectAt(t: { x: number; y: number }): void {
    this.selected = this.layer.at(this.s.sim.cur?.buildings ?? [], t.x, t.y)?.id ?? -1;
  }

  /** Footprint centre for a type snapped so the tiles are whole. */
  private centre(type: BuildingType, t: { x: number; y: number }): [number, number] {
    const [w, h] = rotated(type, this.rot);
    return [Math.round(t.x - w / 2) + w / 2, Math.round(t.y - h / 2) + h / 2];
  }

  // --- per frame ---

  update(wp: { x: number; y: number }, zoom: number, view: { x: number; y: number; right: number; bottom: number }): void {
    const sim = this.s.sim, buildings = sim.cur?.buildings ?? [];
    this.layer.selected = this.selected;
    this.layer.draw(buildings, this.s.drawn, view, zoom);
    this.layer.influence(sim.influence, TEAM, this.active || this.claimArmed);
    this.hover = this.active && this.tool ? null : this.pickNode(wp);
    this.layer.ghost(null, '', 0, zoom);
    this.layer.node(this.hover, zoom);
    if (!this.active || !this.tool) return;
    const t = this.s.pointerTile;
    if (this.tool.kind === 'building') {
      const type = this.tool.type, [x, y] = this.centre(type, t), [w, h] = rotated(type, this.rot);
      this.check(`${type},${x},${y},${this.rot}`, () => sim.checkPlacement(TEAM, type, x, y, this.rot).then((r) => (this.place = r)));
      const d = BUILDINGS[type], ok = !!this.place?.ok;
      const why = this.place && !ok && this.place.reason ? REASON[this.place.reason] : '';
      this.status = why ? `can't build: ${why}` : `${type}: ${costText(d.cost)} · ${labourText(d.labour)}`;
      this.layer.ghost([{ tiles: rectTiles(x, y, w, h), ok }], why || `${type} ${costText(d.cost)}`, this.layer.heightOf(type), zoom);
      return;
    }
    // wall: the committed line plus the run being dragged
    const pts = [...this.wall.points];
    if (this.drag) pts.push(...snap(t));
    if (pts.length < 4) {
      this.status = this.wall.points.length ? 'drag from the end to extend' : 'drag to draw a wall';
      this.layer.ghost([{ tiles: [Math.floor(t.x), Math.floor(t.y)], ok: true }], '', 0, zoom);
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
    const why = !plan.ok && plan.reason ? `can't build: ${REASON[plan.reason]} · ` : '';
    this.status = `${why}${segs} segments ${extra} · ${costText(cost)} · ${labourText(labour)}${this.wall.insert ? ` · click the line: ${this.wall.insert}` : ' · Enter to order'}`;
    this.layer.ghost(plan.pieces, `${why}${segs} seg · ${costText(cost)}`, 0, zoom);
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

  /** Units labouring at a building (state build next to its footprint). */
  workers(b: BuildingSnap): number {
    const r = Math.max(b.w, b.h) / 2 + 2;
    return this.s.drawn.filter((d) => d.u.state === 'build' && d.team === b.team && Math.abs(d.x - b.x) < r && Math.abs(d.y - b.y) < r).length;
  }
}

/** A tile centre under a tile point. */
const snap = (t: { x: number; y: number }): [number, number] => [Math.floor(t.x) + 0.5, Math.floor(t.y) + 0.5];
