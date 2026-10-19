/**
 * The full map (W-36): M opens the whole region, centred in a red-figure card, in the current view mode with the markers
 * of the minimap (./mapDraw.ts) and the mode's legend beside it. Wheel zooms at the cursor, drag pans, hover names what
 * is there (ground, biome, movement, owner; lair, building, resource, claim point, squad), a click moves the camera there
 * and closes it; M or Esc closes. F2-F7 switch the mode while it is open.
 */
import { MOB_TEAM } from '../../sim/mobs';
import { MODES } from '../mapModes';
import type { SandboxScene } from '../SandboxScene';
import { uiZoom } from './kit';
import { drawMap, squads, type MapXf } from './mapDraw';
import { legendHtml } from './modes';

const CLASS: Record<string, string> = { militia: 'militia', hoplite: 'hoplites', celt_sword: 'swordsmen', archer: 'archers', slinger: 'slingers', javelineer: 'javelineers' };
const nice = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

export class FullMap {
  private root: HTMLDivElement;
  private frame: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private legend: HTMLDivElement;
  private tip: HTMLDivElement;
  private title: HTMLElement;
  /** Backing px per art px, the fit scale and the view. */
  private px = 1;
  private k0 = 1;
  private f: MapXf = { k: 1, x0: 0, y0: 0 };
  private hover: { x: number; y: number } | null = null;
  private raf = 0;
  private dirty = false;

  constructor(private s: SandboxScene) {
    this.root = document.createElement('div');
    this.root.id = 'rfFull';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:8;background:rgba(10,6,4,0.62);display:none';
    this.frame = document.createElement('div');
    this.frame.className = 'rf rf-card';
    this.frame.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:4px 6px 6px;pointer-events:auto';
    this.frame.innerHTML = `<div style="display:flex;align-items:baseline;gap:8px;margin:1px 0 4px"><span class="rf-name" id="fmTitle"></span>
      <span class="rf-dim" style="font-size:10px;margin-left:auto">wheel zoom · drag pan · click: go there · M / Esc close</span></div>
      <div style="display:flex;gap:6px;align-items:flex-start"><canvas id="fmMap" style="display:block;background:#1a120d;cursor:crosshair;image-rendering:auto"></canvas><div id="fmLegend" style="width:128px"></div></div>`;
    this.root.append(this.frame);
    this.cv = this.frame.querySelector('#fmMap')!;
    this.legend = this.frame.querySelector('#fmLegend')!;
    this.title = this.frame.querySelector('#fmTitle')!;
    this.tip = document.createElement('div');
    this.tip.className = 'rf rf-tip';
    this.tip.style.cssText = 'display:none;z-index:9;line-height:13px;font-size:10px';
    this.root.append(this.tip);
    document.body.append(this.root);
    this.root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.root) this.close(); });
    this.root.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); if (e.target === this.cv) this.zoomAt(e, e.deltaY > 0 ? 1 / 1.25 : 1.25); }, { passive: false });
    let down: { x: number; y: number; x0: number; y0: number; moved: boolean } | null = null;
    this.cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, x0: this.f.x0, y0: this.f.y0, moved: false }; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', (e) => {
      this.hover = this.tileAt(e);
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
      if (down?.moved) {
        const a = this.cssToBacking();
        this.f.x0 = down.x0 - ((e.clientX - down.x) * a) / this.f.k;
        this.f.y0 = down.y0 - ((e.clientY - down.y) * a) / this.f.k;
        this.clamp();
      }
      this.showTip(e);
      this.dirty = true;
    });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; this.tip.style.display = 'none'; });
    this.cv.addEventListener('pointerup', (e) => {
      if (down && !down.moved) { const t = this.tileAt(e); this.s.focus(t.x, t.y); this.close(); }
      down = null;
    });
    // capture: Esc closes the map before build mode or the siege controls see it
    addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); if (this.open) this.close(); else this.show(); }
      else if (e.key === 'Escape' && this.open) { e.stopImmediatePropagation(); this.close(); }
    }, true);
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  show(): void {
    const z = uiZoom(), dpr = devicePixelRatio || 1;
    this.frame.style.zoom = this.tip.style.zoom = String(z);
    const side = Math.floor(Math.min(innerHeight / z - 64, innerWidth / z - 172));
    this.cv.style.width = this.cv.style.height = `${side}px`;
    this.px = z * dpr;
    this.cv.width = this.cv.height = Math.round(side * this.px);
    this.k0 = this.cv.width / Math.max(this.s.map.w, this.s.map.h);
    this.f = { k: this.k0, x0: 0, y0: 0 };
    this.root.style.display = '';
    this.s.mapOpen = true;
    // redrawn at 10 Hz, at once on a pan, zoom or hover
    let last = 0;
    const tick = (t: number) => {
      if (this.dirty || t - last > 100) { this.draw(); last = t; this.dirty = false; }
      this.raf = requestAnimationFrame(tick);
    };
    this.dirty = true;
    this.raf = requestAnimationFrame(tick);
  }

  close(): void {
    this.root.style.display = 'none';
    this.tip.style.display = 'none';
    this.s.mapOpen = false;
    cancelAnimationFrame(this.raf);
  }

  /** Backing px per CSS px of the pointer (CSS zoom and the device pixel ratio). */
  private cssToBacking(): number {
    return this.cv.width / this.cv.getBoundingClientRect().width;
  }

  private tileAt(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.cv.getBoundingClientRect(), a = this.cssToBacking();
    return { x: this.f.x0 + ((e.clientX - r.left) * a) / this.f.k, y: this.f.y0 + ((e.clientY - r.top) * a) / this.f.k };
  }

  private zoomAt(e: WheelEvent, by: number): void {
    const t = this.tileAt(e), k = Math.max(this.k0, Math.min(this.k0 * 12, this.f.k * by));
    const r = this.cv.getBoundingClientRect(), a = this.cssToBacking();
    this.f = { k, x0: t.x - ((e.clientX - r.left) * a) / k, y0: t.y - ((e.clientY - r.top) * a) / k };
    this.clamp();
    this.dirty = true;
  }

  /** Keep the region covering the canvas. */
  private clamp(): void {
    const { w, h } = this.s.map, span = this.cv.width / this.f.k;
    this.f.x0 = Math.max(0, Math.min(w - span, this.f.x0));
    this.f.y0 = Math.max(0, Math.min(h - span, this.f.y0));
  }

  private draw(): void {
    const g = this.cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1a120d';
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    drawMap(g, this.s, this.f, this.px, this.f.k >= 2 * this.px);
    if (this.hover) {
      const x = (Math.floor(this.hover.x) - this.f.x0) * this.f.k, y = (Math.floor(this.hover.y) - this.f.y0) * this.f.k;
      g.strokeStyle = '#f0d9b5'; g.lineWidth = this.px;
      g.strokeRect(x, y, Math.max(this.f.k, 2), Math.max(this.f.k, 2));
    }
    const name = `${this.s.region.name} · ${MODES.find((m) => m.id === this.s.mode)!.name}`;
    if (this.title.textContent !== name) this.title.textContent = name;
    const lg = legendHtml(this.s) || '<div class="rf-name" style="margin-bottom:4px">Normal</div><div class="rf-dim" style="font-size:10px;line-height:12px">F3-F7: altitude, movement, ownership, biomes, resources</div>';
    if (this.legend.dataset.html !== lg) { this.legend.dataset.html = lg; this.legend.innerHTML = lg + this.keyHtml(); }
  }

  /** The markers' key under the legend. */
  private keyHtml(): string {
    const row = (sw: string, label: string) => `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;font-size:10px;line-height:11px">${sw}${label}</div>`;
    const dot = (c: string) => `<i style="width:7px;height:7px;flex:none;border-radius:50%;background:${c};box-shadow:0 0 0 1px #0e0907;margin:1px"></i>`;
    const sq = (c: string) => `<i style="width:7px;height:7px;flex:none;background:${c};box-shadow:0 0 0 1px #0e0907;margin:1px"></i>`;
    return `<div class="rf-name" style="margin:8px 0 4px">Markers</div>${row(dot('#4aa3ff'), 'your squads')}${row(dot('#e0503c'), 'enemies in sight')}${row(sq('#4aa3ff'), 'buildings (by owner)')}${row(dot('#9aa0a8'), 'lair (struck: cleared)')}${row(sq('#f0ead8'), 'claim point')}${row('<i style="width:9px;height:7px;flex:none;border:1px solid #f0d9b5"></i>', 'your view')}`;
  }

  private showTip(e: PointerEvent): void {
    const t = this.hover;
    if (!t) return;
    const s = this.s, l = s.live(), near = (x: number, y: number, r: number) => (x - t.x) ** 2 + (y - t.y) ** 2 <= r * r;
    const pick = 6 / (this.f.k / this.px); // ~6 art px in tiles
    const lines: string[] = [];
    const lair = l.lairs.find((q) => near(q.x, q.y, Math.max(2, pick)));
    if (lair) lines.push(`<b class="k">${nice(lair.kind)} lair</b> · ${lair.state === 'cleared' ? 'cleared' : `${lair.alive}/${lair.count} · guards ${lair.guard} tiles`}`);
    const b = l.buildings.find((q) => q.state !== 'destroyed' && Math.abs(q.x - t.x) <= Math.max(q.w / 2, pick / 2) && Math.abs(q.y - t.y) <= Math.max(q.h / 2, pick / 2));
    if (b) lines.push(`<b class="k">${nice(b.type)}</b> · ${b.team === 0 ? 'yours' : 'enemy'} · ${b.state}`);
    const c = l.claims.find((q) => near(q.x, q.y, Math.max(2, pick)));
    if (c) lines.push(`<b class="k">Claim point</b> · ${c.state === 'claimed' ? (c.team === 0 ? 'yours' : 'enemy') : c.state}`);
    const nd = l.nodes.find((q) => near(q.x, q.y, Math.max(1, pick / 2)));
    if (nd) lines.push(`<b class="k">${nice(nd.res)}</b> · ${Math.floor(nd.amount)}/${nd.max}${nd.guarded ? ' · guarded' : ''}`);
    const q = squads(s).find((v) => v.team !== MOB_TEAM && near(v.x, v.y, Math.max(2, pick)));
    if (q) {
      const u = s.drawn.find((d) => d.u.squad === q.id);
      lines.push(`<b class="k">${q.team === 0 ? 'Your' : 'Enemy'} ${CLASS[u?.u.cls ?? ''] ?? 'squad'}</b> · ${q.n} men`);
    }
    lines.push(...s.map.describe(t.x, t.y, l));
    this.tip.innerHTML = lines.join('<br>');
    this.tip.style.display = '';
    const z = Number(this.tip.style.zoom) || 1, r = this.tip.getBoundingClientRect();
    this.tip.style.left = `${Math.min(innerWidth - r.width - 4, e.clientX + 14) / z}px`;
    this.tip.style.top = `${Math.min(innerHeight - r.height - 4, e.clientY + 14) / z}px`;
  }
}
