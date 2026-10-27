/**
 * W-63 settlements on the ground of the region view: each settlement's ring (in its banner's colour, dashed) and its
 * citizens' plots (yours gold, others cream), hugging the terrain; hovering a plot names its holder. The plot picker
 * lets a lord drag a rectangle for a newcomer inside the ring: green while it fits, red with the reason while it does
 * not (outside the ring, over another's plot), then Give or Cancel (./hud/settlements.ts asks the server).
 */
import Phaser from 'phaser';
import type { SettlementNet } from '../net/protocol';
import { plotRefusal, spanOf, type Plot } from '../net/settlements';
import { TEAM_INT } from '../world/palette';
import type { SandboxScene } from './SandboxScene';

/** Plots: over the terrain chunks, under the building layer's ground marks (2.5). The ring: just over the fog (11.28), a border read in the dark too. */
const DEPTH = 2.4, RING_DEPTH = 11.3;
const GOLD = 0xe0b867, CREAM = 0xf0d9b5, FREE = 0xbba58c, OK = 0x9fd47a, BAD = 0xf08a70;

export interface Picking { s: SettlementNet; who: string; rect: Plot | null; why: string | null; done: (p: Plot | null) => void }

export class PlotLayer {
  private g: Phaser.GameObjects.Graphics;
  private gRing: Phaser.GameObjects.Graphics;
  private list: SettlementNet[] = [];
  private names = new Map<number, string>();
  private me: number | null = null;
  private key = '';
  private ver = 0;
  private tip: HTMLElement;
  private hoverAt: { x: number; y: number } | null = null;
  pick: Picking | null = null;
  private veil: HTMLElement;
  private bar: HTMLElement;
  private from: { x: number; y: number } | null = null;

  constructor(private s: SandboxScene, mk: (id: string, css: string, html?: string) => HTMLElement) {
    this.g = s.add.graphics().setDepth(DEPTH);
    this.gRing = s.add.graphics().setDepth(RING_DEPTH);
    s.events.on('update', () => this.draw());
    this.tip = mk('rfPlotTip', 'display:none');
    this.tip.className = 'rf rf-tip';
    const canvas = s.game.canvas;
    canvas.addEventListener('pointermove', (e) => this.hover(e));
    canvas.addEventListener('pointerleave', () => ((this.tip.style.display = 'none'), (this.hoverAt = null)));
    // the picker: a veil over the canvas takes the drag (the scene's selection never sees it); the wheel still zooms
    this.veil = document.createElement('div');
    this.veil.style.cssText = 'position:fixed;inset:0;z-index:3;display:none;cursor:crosshair';
    document.body.append(this.veil);
    this.veil.addEventListener('pointerdown', (e) => this.down(e));
    this.veil.addEventListener('pointermove', (e) => this.move(e));
    this.veil.addEventListener('pointerup', (e) => this.up(e));
    this.veil.addEventListener('wheel', (e) => { const p = this.px(e); this.s.zoomAt(p.x, p.y, e.deltaY > 0 ? -1 : 1); e.preventDefault(); }, { passive: false });
    this.bar = mk('rfPlotBar', 'display:none');
    this.bar.className = 'rf rf-card';
    this.bar.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-pb]')?.dataset.pb;
      if (a === 'give' && this.pick?.rect && !this.pick.why) this.finish(this.pick.rect);
      else if (a === 'cancel') this.finish(null);
    });
    addEventListener('keydown', (e: KeyboardEvent) => { if (this.pick && e.key === 'Escape') (this.finish(null), e.stopPropagation()); }, true);
  }

  /** The settlements to draw, the names of plot holders, the player. */
  set(list: SettlementNet[], names: Map<number, string>, me: number | null): void {
    this.list = list;
    this.names = names;
    this.me = me;
    this.ver++;
  }

  /** Start the picker: a plot for `who` inside `s`; `done` hears the rect (null: cancelled). */
  start(s: SettlementNet, who: string, done: (p: Plot | null) => void): void {
    this.pick = { s, who, rect: null, why: null, done };
    this.veil.style.display = '';
    this.bar.style.display = 'flex';
    this.s.focus(s.x, s.y, 1);
    this.renderBar();
  }

  private finish(p: Plot | null): void {
    const k = this.pick;
    this.pick = null;
    this.from = null;
    this.veil.style.display = 'none';
    this.bar.style.display = 'none';
    k?.done(p);
  }

  private renderBar(): void {
    const k = this.pick;
    if (!k) return;
    const r = k.rect, size = r ? `${r.x1 - r.x0 + 1}×${r.y1 - r.y0 + 1} tiles` : '';
    const status = !r ? '<span class="rf-dim">drag on the ground</span>' : k.why ? `<span class="rf-hint">${k.why}</span>` : `<span style="color:var(--rf-good)">${size} · fits</span>`;
    const who = k.who.replace(/</g, '&lt;'), at = k.s.name.replace(/</g, '&lt;');
    this.bar.innerHTML = `<span class="pb-t">A plot for <b>${who}</b> in <b>${at}</b></span><span class="rf-sep"></span><span class="pb-s">${status}</span>
      <button class="rf-tbtn pri" data-pb="give"${r && !k.why ? '' : ' disabled'}>Give plot</button><button class="rf-tbtn" data-pb="cancel" title="Esc">Cancel</button>`;
  }

  private px(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.s.game.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private tile(e: PointerEvent): { x: number; y: number } {
    return this.s.tileAt(this.px(e));
  }

  private down(e: PointerEvent): void {
    if (!this.pick || e.button !== 0) return;
    this.from = this.tile(e);
    this.update(this.from);
  }

  private move(e: PointerEvent): void {
    if (this.pick && this.from) this.update(this.tile(e));
  }

  private up(e: PointerEvent): void {
    if (this.pick && this.from) this.update(this.tile(e));
    this.from = null;
  }

  private update(to: { x: number; y: number }): void {
    this.setRect(spanOf(this.from!, to));
  }

  /** The picked rect (a drag, or a script): checked against the ring and the other plots. */
  setRect(rect: Plot): void {
    const k = this.pick;
    if (!k) return;
    k.rect = rect;
    k.why = plotRefusal(k.s, k.rect, k.s.plots.map((p) => ({ ...p, name: this.names.get(p.pid) })));
    this.renderBar();
  }

  /** The plot under the pointer, named. */
  private hover(e: PointerEvent): void {
    if (this.pick) return;
    const r = this.s.game.canvas.getBoundingClientRect(), t = this.s.tileAt({ x: e.clientX - r.left, y: e.clientY - r.top });
    const x = Math.floor(t.x), y = Math.floor(t.y);
    for (const s of this.list) for (const p of s.plots) {
      if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
      const who = p.pid === this.me ? 'Your plot' : `${this.names.get(p.pid) ?? `Player ${p.pid}`}'s plot`;
      this.tip.innerHTML = `<b class="k">${who.replace(/</g, '&lt;')}</b> · ${p.x1 - p.x0 + 1}×${p.y1 - p.y0 + 1} in ${s.name.replace(/</g, '&lt;')}`;
      this.tip.style.display = '';
      const z = Number(this.tip.style.zoom) || 1;
      this.tip.style.left = `${(e.clientX + 14) / z}px`;
      this.tip.style.top = `${(e.clientY + 16) / z}px`;
      this.hoverAt = { x, y };
      return;
    }
    this.tip.style.display = 'none';
    this.hoverAt = null;
  }

  /** A tile point on the ground, in world px. */
  private at(x: number, y: number): Phaser.Math.Vector2 {
    const iso = this.s.iso;
    return new Phaser.Math.Vector2(iso.sx(x, y), iso.sy(x, y, iso.zAt(x, y)));
  }

  /** A plot's outline along the ground: a point a tile along each edge. */
  private outline(p: Plot): Phaser.Math.Vector2[] {
    const out: Phaser.Math.Vector2[] = [], x0 = p.x0, y0 = p.y0, x1 = p.x1 + 1, y1 = p.y1 + 1;
    for (let x = x0; x < x1; x++) out.push(this.at(x, y0));
    for (let y = y0; y < y1; y++) out.push(this.at(x1, y));
    for (let x = x1; x > x0; x--) out.push(this.at(x, y1));
    for (let y = y1; y > y0; y--) out.push(this.at(x0, y));
    return out;
  }

  private draw(): void {
    const z = this.s.cameras.main.zoom, k = this.pick;
    const key = `${this.ver}|${z}|${k ? JSON.stringify([k.rect, k.why, k.s.id]) : ''}|${this.hoverAt?.x},${this.hoverAt?.y}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.g.clear(), gr = this.gRing.clear(), lw = Math.max(1, 1.5 / z);
    for (const s of this.list) {
      const col = s.team !== null ? TEAM_INT[s.team] ?? FREE : FREE, focus = k?.s.id === s.id;
      // the ring: the banner's colour under cream dashes, brighter while picking in it
      const n = Math.max(48, Math.round(s.r * 5)), ring: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < n; i++) ring.push(this.at(s.x + Math.cos((i / n) * Math.PI * 2) * s.r, s.y + Math.sin((i / n) * Math.PI * 2) * s.r));
      gr.lineStyle(lw * (focus ? 5 : 4), 0x0e0907, 0.35).strokePoints(ring, true);
      gr.lineStyle(lw * (focus ? 3 : 2.2), col, focus ? 0.8 : 0.55).strokePoints(ring, true);
      for (let i = 0; i < n; i += 2) {
        const p = ring[i], q = ring[(i + 1) % n];
        gr.lineStyle(lw * (focus ? 1.4 : 1), focus ? GOLD : CREAM, focus ? 1 : 0.75).lineBetween(p.x, p.y, q.x, q.y);
      }
      for (const p of s.plots) {
        const mine = p.pid === this.me, hot = this.hoverAt && this.hoverAt.x >= p.x0 && this.hoverAt.x <= p.x1 && this.hoverAt.y >= p.y0 && this.hoverAt.y <= p.y1;
        const c = mine ? GOLD : CREAM, pts = this.outline(p);
        g.fillStyle(c, hot ? 0.2 : mine ? 0.12 : 0.07).fillPoints(pts, true);
        g.lineStyle(lw * 2.2, 0x0e0907, 0.45).strokePoints(pts, true);
        g.lineStyle(lw * (hot ? 1.8 : 1.2), c, hot ? 1 : 0.8).strokePoints(pts, true);
        // corner posts: the plot reads as staked out
        for (const [x, y] of [[p.x0, p.y0], [p.x1 + 1, p.y0], [p.x1 + 1, p.y1 + 1], [p.x0, p.y1 + 1]]) {
          const v = this.at(x, y);
          g.fillStyle(0x0e0907, 0.8).fillRect(v.x - lw * 1.5, v.y - lw * 6, lw * 3, lw * 6);
          g.fillStyle(c, 1).fillRect(v.x - lw * 0.75, v.y - lw * 5.5, lw * 1.5, lw * 5);
        }
      }
    }
    if (k?.rect) {
      const pts = this.outline(k.rect), c = k.why ? BAD : OK;
      g.fillStyle(c, 0.22).fillPoints(pts, true);
      g.lineStyle(lw * 2.4, 0x0e0907, 0.6).strokePoints(pts, true);
      g.lineStyle(lw * 1.6, c, 1).strokePoints(pts, true);
      gr.lineStyle(lw, c, 0.9).strokePoints(pts, true); // over buildings and fog too
    }
  }
}
