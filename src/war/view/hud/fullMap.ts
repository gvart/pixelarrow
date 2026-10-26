/**
 * The full map (W-36): M opens the whole region as a chart in a red-figure card. Left, the map: the region turned to the
 * iso camera's north (a diamond on the black glaze, a terracotta edge, a compass), painted in the current view mode with
 * the markers of the minimap (./mapDraw.ts) and, in Resources, an icon per patch of scarce nodes. Right, the side panel:
 * the mode (icon, name, the question it answers), the six mode tabs (F2-F7), the legend, the markers' key and a card on
 * what is under the cursor (lair, building, claim point, resource, squad, then the ground; under the fog only what team 0
 * knows: "Unexplored" on ground it never saw, no live lair counts out of sight). Wheel zooms at the cursor,
 * drag pans, a click moves the camera there and closes it; M or Esc closes. Opens and closes with a short fade and scale.
 */
import '@fontsource/cinzel/700.css';
import { MOB_TEAM } from '../../sim/mobs';
import { BIOME_NAME, MODES } from '../mapModes';
import type { SandboxScene } from '../SandboxScene';
import { icon, uiZoom } from './kit';
import { swatch } from './modes';
import { drawIcon, drawMap, explored, fogAt, FOG_SWATCH, ISO_ROT, squads, TEAM, toPx, toTile, type MapXf } from './mapDraw';
import { keys } from '../../input/keys';

const CLASS: Record<string, string> = { militia: 'Militia', hoplite: 'Hoplites', celt_sword: 'Swordsmen', archer: 'Archers', slinger: 'Slingers', javelineer: 'Javelineers' };
const nice = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
const PANEL = 204;
const PACE: Record<string, string> = { impassable: 'no way through', 'fast (road)': 'fast march', open: 'normal pace', slow: 'slow going', 'very slow': 'very slow going' };
const BEAST: Record<string, string> = { wolf: 'Wolves', boar: 'Boars', bear: 'Bears', bandit: 'Bandits', jackal: 'Jackals', ibex: 'Ibex' };

const CSS = `
#rfFull{position:fixed;inset:0;z-index:8;background:rgba(10,6,4,0.66);opacity:0;transition:opacity .16s ease-out}
#rfFull.on{opacity:1}
#rfFull .fm-frame{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.965);transition:transform .18s cubic-bezier(.2,.8,.3,1);padding:6px 8px 8px;pointer-events:auto;display:flex;gap:8px}
#rfFull.on .fm-frame{transform:translate(-50%,-50%) scale(1)}
#rfFull .fm-map{position:relative;flex:none}
#rfFull canvas{display:block;cursor:crosshair;image-rendering:auto;box-shadow:0 0 0 1px #7a3418,0 0 0 2px #0e0907}
#rfFull .fm-title{position:absolute;left:6px;top:6px;pointer-events:none;font:700 17px/1 Cinzel,serif;color:var(--rf-title);letter-spacing:.04em;background:var(--rf-panel);box-shadow:inset 0 0 0 1px var(--rf-rule);padding:5px 8px 4px}
#rfFull .fm-hint{position:absolute;left:6px;bottom:6px;background:var(--rf-panel);box-shadow:inset 0 0 0 1px var(--rf-rule);padding:4px 7px;pointer-events:none;font:600 11.5px/1 Inter,sans-serif;color:var(--rf-muted)}
#rfFull .fm-panel{width:${PANEL}px;display:flex;flex-direction:column;gap:0;min-height:0;overflow:hidden auto;scrollbar-width:thin;scrollbar-color:#7a3418 #0e0907}
#rfFull .fm-card{flex:none}
#rfFull .fm-mode{display:flex;align-items:center;gap:6px;margin:1px 0 6px;padding-bottom:5px;border-bottom:1px solid var(--rf-rule)}
#rfFull .fm-mode h2{margin:0;font:700 17px/1 Cinzel,serif;color:var(--rf-title);letter-spacing:.03em}
#rfFull .fm-key{margin-left:auto;font:600 11px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-raised);border:1px solid var(--rf-line);border-bottom-width:2px;padding:3px 5px}
#rfFull .fm-about{font:600 12px/16px Inter,sans-serif;color:var(--rf-muted);margin:0 0 8px;white-space:normal}
#rfFull .fm-tabs{display:flex;gap:2px;margin-bottom:8px}
#rfFull .fm-tabs .rf-btn{width:32px;height:30px;background-size:32px 30px}
#rfFull h3{margin:8px 0 5px;font:700 12px/1 Cinzel,serif;color:var(--rf-accent);letter-spacing:.06em;display:flex;align-items:center;gap:6px}
#rfFull h3::after{content:'';flex:1;height:1px;background:var(--rf-rule)}
#rfFull .fm-row{display:flex;align-items:center;gap:6px;font:600 12px/16px Inter,sans-serif;color:var(--rf-ink);margin:2px 0}
#rfFull .fm-row .ic{flex:none}
#rfFull .sw{width:14px;height:10px;flex:none;box-shadow:0 0 0 1px #0e0907;margin:0 2px}
#rfFull .sw.ln{height:3px}
#rfFull .mk{width:18px;height:18px;flex:none;display:flex;align-items:center;justify-content:center}
#rfFull .fm-card{margin-top:auto;padding:7px 8px;background:var(--rf-sunk);box-shadow:inset 0 0 0 1px var(--rf-line);min-height:72px}
#rfFull .fm-card b{display:block;font:700 13px/1.15 Cinzel,serif;color:var(--rf-title);margin-bottom:3px}
#rfFull .fm-card .t{font:600 12px/16px Inter,sans-serif;color:var(--rf-ink)}
#rfFull .fm-card .d{font:600 11.5px/15px Inter,sans-serif;color:var(--rf-muted)}
#rfFull .fm-card .t + b{margin-top:5px}
#rfFull .fm-tip{position:fixed;z-index:9;pointer-events:none;font:600 12px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-panel);box-shadow:0 0 0 1px var(--rf-line);padding:4px 7px;white-space:nowrap;display:none}
@media (prefers-reduced-motion:reduce){#rfFull,#rfFull .fm-frame{transition:none}}
`;

export class FullMap {
  private root: HTMLDivElement;
  private frame: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private panel: HTMLDivElement;
  private card: HTMLDivElement;
  private tip: HTMLDivElement;
  private title: HTMLElement;
  /** Backing px per art px, the fit scale, the canvas size (backing px) and the view. */
  private px = 1;
  private k0 = 1;
  private cw = 1;
  private ch = 1;
  private f: MapXf = { k: 1, rot: ISO_ROT, cx: 0, cy: 0, ox: 0, oy: 0 };
  private hover: { x: number; y: number } | null = null;
  private raf = 0;
  private dirty = false;
  private shownMode = '';
  private closing = 0;

  constructor(private s: SandboxScene) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.root = document.createElement('div');
    this.root.id = 'rfFull';
    this.root.style.display = 'none';
    this.frame = document.createElement('div');
    this.frame.className = 'rf rf-card fm-frame';
    this.frame.innerHTML = `<div class="fm-map"><canvas id="fmMap"></canvas><div class="fm-title" id="fmTitle"></div>
      <div class="fm-hint">Wheel to zoom · drag to pan · click to go there · M closes</div></div>
      <div class="fm-panel" id="fmPanel"></div>`;
    this.root.append(this.frame);
    this.cv = this.frame.querySelector('#fmMap')!;
    this.panel = this.frame.querySelector('#fmPanel')!;
    this.title = this.frame.querySelector('#fmTitle')!;
    this.card = document.createElement('div');
    this.card.className = 'fm-card';
    this.tip = document.createElement('div');
    this.tip.className = 'rf fm-tip';
    this.root.append(this.tip);
    document.body.append(this.root);
    this.root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.root) this.close(); });
    this.root.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); if (e.target === this.cv) this.zoomAt(e, e.deltaY > 0 ? 1 / 1.25 : 1.25); }, { passive: false });
    let down: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;
    this.cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, ox: this.f.ox, oy: this.f.oy, moved: false }; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener('pointermove', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
      if (down?.moved) {
        const a = this.cssToBacking();
        this.f.ox = down.ox + (e.clientX - down.x) * a;
        this.f.oy = down.oy + (e.clientY - down.y) * a;
        this.recentre();
      }
      this.hover = this.tileAt(e);
      this.showTip(e);
      this.dirty = true;
    });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; this.tip.style.display = 'none'; this.dirty = true; });
    this.cv.addEventListener('pointerup', (e) => {
      if (down && !down.moved) {
        const t = this.tileAt(e);
        if (t.x >= 0 && t.y >= 0 && t.x <= this.s.map.w && t.y <= this.s.map.h) { this.s.focus(t.x, t.y); this.close(); }
      }
      down = null;
    });
    // capture: Esc closes the map before build mode or the siege controls see it
    addEventListener('keydown', (e: KeyboardEvent) => {
      const a = keys.act(e);
      if (a === 'view.map') { e.preventDefault(); if (this.open) this.close(); else this.show(); }
      else if (a === 'back' && this.open) { e.stopImmediatePropagation(); this.close(); }
    }, true);
  }

  get open(): boolean {
    return this.root.style.display !== 'none' && !this.closing;
  }

  show(): void {
    clearTimeout(this.closing);
    this.closing = 0;
    const z = uiZoom(), dpr = devicePixelRatio || 1;
    this.frame.style.zoom = this.tip.style.zoom = String(z);
    // the card: 16 px from the window edges, the panel at the right
    const H = Math.floor(innerHeight / z - 32 - 14), W = Math.min(Math.floor(innerWidth / z - 32 - 16 - 8 - PANEL), Math.round(H * 1.22));
    this.cv.style.width = `${W}px`;
    this.cv.style.height = `${H}px`;
    this.panel.style.height = `${H}px`;
    this.px = z * dpr;
    this.cw = this.cv.width = Math.round(W * this.px);
    this.ch = this.cv.height = Math.round(H * this.px);
    const { w, h } = this.s.map;
    this.k0 = (Math.min(this.cw, this.ch) * 0.94) / ((w + h) / Math.SQRT2);
    this.f = { k: this.k0, rot: ISO_ROT, cx: w / 2, cy: h / 2, ox: this.cw / 2, oy: this.ch / 2 };
    this.shownMode = '';
    this.card.innerHTML = ''; // no card left from the last open (the fog may have changed)
    this.root.style.display = '';
    void this.root.offsetWidth; // start the transition from the closed state
    this.root.classList.add('on');
    this.s.mapOpen = true;
    // redrawn at 10 Hz, at once on a pan, zoom or hover
    let last = 0;
    const tick = (t: number) => {
      if (this.dirty || t - last > 100) { this.draw(); last = t; this.dirty = false; }
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.dirty = true;
    this.raf = requestAnimationFrame(tick);
  }

  close(): void {
    if (this.root.style.display === 'none' || this.closing) return;
    this.root.classList.remove('on');
    this.tip.style.display = 'none';
    this.s.mapOpen = false;
    this.closing = window.setTimeout(() => {
      this.closing = 0;
      this.root.style.display = 'none';
      cancelAnimationFrame(this.raf);
    }, 170);
  }

  /** Backing px per CSS px of the pointer (CSS zoom and the device pixel ratio). */
  private cssToBacking(): number {
    return this.cv.width / this.cv.getBoundingClientRect().width;
  }

  private tileAt(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.cv.getBoundingClientRect(), a = this.cssToBacking();
    return toTile(this.f, (e.clientX - r.left) * a, (e.clientY - r.top) * a);
  }

  private zoomAt(e: WheelEvent, by: number): void {
    const r = this.cv.getBoundingClientRect(), a = this.cssToBacking(), px = (e.clientX - r.left) * a, py = (e.clientY - r.top) * a;
    const t = toTile(this.f, px, py);
    this.f = { ...this.f, k: Math.max(this.k0, Math.min(this.k0 * 12, this.f.k * by)), cx: t.x, cy: t.y, ox: px, oy: py };
    this.recentre();
    this.dirty = true;
  }

  /** Re-anchor the view on the canvas centre, which stays over the region; zoomed out fully, the region is centred. */
  private recentre(): void {
    const { w, h } = this.s.map, c = toTile(this.f, this.cw / 2, this.ch / 2);
    const fit = this.f.k <= this.k0 * 1.001;
    this.f = { ...this.f, cx: fit ? w / 2 : Math.max(0, Math.min(w, c.x)), cy: fit ? h / 2 : Math.max(0, Math.min(h, c.y)), ox: this.cw / 2, oy: this.ch / 2 };
  }

  private draw(): void {
    const g = this.cv.getContext('2d')!, m = this.px, { w, h } = this.s.map;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bg = g.createRadialGradient(this.cw / 2, this.ch / 2, 0, this.cw / 2, this.ch / 2, Math.max(this.cw, this.ch) * 0.7);
    bg.addColorStop(0, '#2a1c14'); bg.addColorStop(1, '#120b08');
    g.fillStyle = bg;
    g.fillRect(0, 0, this.cw, this.ch);
    // the region's edge: a shadow, the map, then a double terracotta line
    const edge = [toPx(this.f, 0, 0), toPx(this.f, w, 0), toPx(this.f, w, h), toPx(this.f, 0, h)];
    const path = () => { g.beginPath(); edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    g.save(); path(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 18 * m; g.fillStyle = '#0e0907'; g.fill(); g.restore();
    drawMap(g, this.s, this.f, m, true);
    if (this.s.mode === 'resources') this.drawResources(g);
    path(); g.lineWidth = 2 * m; g.strokeStyle = '#0e0907'; g.stroke();
    path(); g.lineWidth = 1 * m; g.strokeStyle = '#b8592a'; g.stroke();
    if (this.hover && this.hover.x >= 0 && this.hover.y >= 0 && this.hover.x < w && this.hover.y < h) {
      const x = Math.floor(this.hover.x), y = Math.floor(this.hover.y), q = [toPx(this.f, x, y), toPx(this.f, x + 1, y), toPx(this.f, x + 1, y + 1), toPx(this.f, x, y + 1)];
      g.beginPath(); q.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
      g.lineWidth = 1.2 * m; g.strokeStyle = '#f0d9b5'; g.stroke();
    }
    this.compass(g);
    if (this.title.textContent !== this.s.region.name) this.title.textContent = this.s.region.name;
    if (this.shownMode !== this.panelKey()) this.renderPanel();
  }

  /** A compass rose in the top right: N points to the region's north (tile -y). */
  private compass(g: CanvasRenderingContext2D): void {
    const m = this.px, r = 17 * m, x = this.cw - r - 16 * m, y = r + 18 * m;
    const [nx, ny] = toPx({ ...this.f, cx: 0, cy: 0, ox: 0, oy: 0, k: 1 }, 0, -1), a = Math.atan2(ny, nx);
    g.save(); g.translate(x, y);
    g.beginPath(); g.arc(0, 0, r * 0.7, 0, Math.PI * 2); g.fillStyle = 'rgba(14,9,7,0.6)'; g.fill(); g.lineWidth = 1.2 * m; g.strokeStyle = '#7a3418'; g.stroke();
    for (let i = 0; i < 4; i++) {
      const b = a + (i * Math.PI) / 2, len = i === 0 ? r * 1.05 : r * 0.62;
      g.beginPath(); g.moveTo(Math.cos(b) * len, Math.sin(b) * len); g.lineTo(Math.cos(b + Math.PI / 2) * r * 0.22, Math.sin(b + Math.PI / 2) * r * 0.22); g.lineTo(Math.cos(b + Math.PI) * r * 0.1, Math.sin(b + Math.PI) * r * 0.1); g.lineTo(Math.cos(b - Math.PI / 2) * r * 0.22, Math.sin(b - Math.PI / 2) * r * 0.22); g.closePath();
      g.fillStyle = i === 0 ? '#de8a4e' : '#c4ae8c'; g.fill(); g.lineWidth = 0.8 * m; g.strokeStyle = '#0e0907'; g.stroke();
    }
    g.font = `700 ${12 * m}px Cinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2b27a'; g.fillText('N', Math.cos(a) * (r + 9 * m), Math.sin(a) * (r + 9 * m));
    g.restore();
  }

  /** Resources mode: an icon badge per kind per patch of nodes (a grid of about 64 art px); wood and food, everywhere, keep the tint only. */
  private drawResources(g: CanvasRenderingContext2D): void {
    const m = this.px, cellT = (64 * m) / this.f.k, at = new Map<string, { res: string; x: number; y: number; n: number; guarded: boolean }>();
    for (const nd of this.s.sim.nodes) {
      if (nd.res === 'wood' || nd.res === 'food' || !explored(this.s, nd.x, nd.y)) continue;
      const key = `${nd.res}|${Math.floor(nd.x / cellT)},${Math.floor(nd.y / cellT)}`;
      const q = at.get(key) ?? at.set(key, { res: nd.res, x: 0, y: 0, n: 0, guarded: false }).get(key)!;
      q.x += nd.x; q.y += nd.y; q.n++; q.guarded ||= !!nd.guarded;
    }
    for (const q of at.values()) {
      const [x, y] = toPx(this.f, q.x / q.n, q.y / q.n), r = 9 * m;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = 'rgba(240,217,181,0.92)'; g.fill();
      g.lineWidth = 1.5 * m; g.strokeStyle = q.guarded ? '#b42c22' : '#7a3418'; g.stroke();
      g.beginPath(); g.arc(x, y, r + m, 0, Math.PI * 2); g.lineWidth = 0.8 * m; g.strokeStyle = '#0e0907'; g.stroke();
      drawIcon(g, 'res-' + q.res, x, y, 16 * m);
    }
  }

  /** The beast kinds of the lairs team 0 has found. */
  private lairKinds(): string[] {
    return [...new Set((this.s.sim.cur?.lairs ?? []).filter((l) => explored(this.s, l.x, l.y)).map((l) => l.kind))];
  }

  /** What the side panel shows: the mode, its live key, the found lair kinds and whether the fog is on. */
  private panelKey(): string {
    const s = this.s;
    return `${s.mode}|${s.map.key(s.mode, s.live())}|${this.lairKinds()}|${!!s.sim.fog && s.sim.fogOn}`;
  }

  /** The side panel: mode, question, tabs, legend, markers' key, the hover card. */
  private renderPanel(): void {
    const s = this.s, md = MODES.find((q) => q.id === s.mode)!, t = s.map.tint(s.mode, s.live());
    this.shownMode = this.panelKey();
    const row = (sw: string, label: string) => `<div class="fm-row">${sw}<span>${label}</span></div>`;
    let legend = '';
    if (!t) legend = row(`<i class="sw" style="background:#688440"></i>`, 'Grass and fields') + row(`<i class="sw" style="background:#345430"></i>`, 'Forest') + row(`<i class="sw" style="background:#7a746e"></i>`, 'Rock') + row(`<i class="sw" style="background:#5696b2"></i>`, 'Water') + row(`<i class="sw ln" style="background:#bea476"></i>`, 'Road');
    else if (s.mode === 'resources') legend = t.legend.map((q) => (q.hatch ? row(swatch(q), q.label) : row(icon('res-' + q.label.toLowerCase()), q.label))).join('');
    else legend = t.legend.map((q) => row(swatch(q), q.label)).join('');
    const shield = (c: string) => `<i class="mk"><i style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:0 0 0 2px #f0d9b5,0 0 0 3px #0e0907"></i></i>`;
    const square = (c: string) => `<i class="mk"><i style="width:10px;height:10px;background:${c};box-shadow:0 0 0 1px #0e0907"></i></i>`;
    const kinds = this.lairKinds();
    const fog = s.sim.fog && s.sim.fogOn ? row(`<i class="sw" style="background:linear-gradient(${FOG_SWATCH.dim},${FOG_SWATCH.dim}),#688440"></i>`, 'Explored, out of sight') + row(`<i class="sw" style="background:linear-gradient(${FOG_SWATCH.dark},${FOG_SWATCH.dark}),#688440"></i>`, 'Unexplored') : '';
    const lairs = kinds.length ? `<div class="fm-row" style="flex-wrap:wrap;gap:2px">${kinds.map((k) => `<span title="${BEAST[k] ?? k}">${icon('lair-' + k)}</span>`).join('')}<span style="margin-left:4px">Beast lairs</span></div>` : '';
    this.panel.innerHTML = `<div class="fm-mode">${icon(md.icon, 32)}<h2>${md.name}</h2><span class="fm-key">${md.key}</span></div>
      <p class="fm-about">${md.about}</p>
      <div class="fm-tabs">${MODES.map((q) => `<button class="rf-btn${q.id === s.mode ? ' on' : ''}" data-mode="${q.id}" title="${q.name} (${q.key})">${icon(q.icon)}</button>`).join('')}</div>
      <h3>Legend</h3>${legend}
      <h3>On the map</h3>${row(shield(TEAM[0]), 'Your squads (ringed: selected)')}${row(shield(TEAM[1]), 'Enemies in sight')}${row(square(TEAM[0]) , 'Your buildings')}${row(square(TEAM[1]), 'Enemy buildings')}
      ${lairs}${row(icon('mk-claim'), 'Claim point')}${row('<i class="mk"><i style="width:14px;height:9px;box-shadow:inset 0 0 0 1px #f0d9b5,0 0 0 1px #0e0907"></i></i>', 'Your view')}${fog}`;
    this.panel.append(this.card);
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => (b.onclick = () => { s.setMode(b.dataset.mode as typeof s.mode); this.dirty = true; }));
    if (!this.card.innerHTML) this.card.innerHTML = '<span class="d">Point at the map to see what is there.</span>';
  }

  /** The cursor's tip: `name` next to the pointer, kept inside the window. */
  private place(e: PointerEvent, name: string): void {
    this.tip.textContent = name;
    this.tip.style.display = 'block';
    const z = Number(this.tip.style.zoom) || 1, r = this.tip.getBoundingClientRect();
    this.tip.style.left = `${Math.min(innerWidth - r.width - 4, e.clientX + 14) / z}px`;
    this.tip.style.top = `${Math.min(innerHeight - r.height - 4, e.clientY + 16) / z}px`;
  }

  private showTip(e: PointerEvent): void {
    const t = this.hover;
    if (!t) return;
    const s = this.s, l = s.live(), near = (x: number, y: number, r: number) => (x - t.x) ** 2 + (y - t.y) ** 2 <= r * r;
    const { w, h } = s.map;
    if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= h) { this.tip.style.display = 'none'; this.card.innerHTML = '<span class="d">Point at the map to see what is there.</span>'; return; }
    const fog = fogAt(s, t.x, t.y);
    if (fog === 0) { this.place(e, 'Unexplored'); this.card.innerHTML = '<b>Unexplored</b>'; return; }
    const pick = (9 * this.px) / this.f.k; // ~9 art px in tiles
    const items: [string, string][] = [];
    const lair = l.lairs.find((q) => near(q.x, q.y, Math.max(2, pick)) && explored(s, q.x, q.y));
    if (lair) items.push([`${BEAST[lair.kind] ?? nice(lair.kind)} lair`, fog < 2 ? 'Out of sight' : lair.state === 'cleared' ? 'Cleared' : `${lair.alive} of ${lair.count} left · guards ${lair.guard} tiles`]);
    const b = l.buildings.find((q) => q.state !== 'destroyed' && Math.abs(q.x - t.x) <= Math.max(q.w / 2, pick / 2) && Math.abs(q.y - t.y) <= Math.max(q.h / 2, pick / 2));
    if (b) items.push([nice(b.type), `${b.team === 0 ? 'Yours' : 'Enemy'} · ${b.state}`]);
    const c = l.claims.find((q) => near(q.x, q.y, Math.max(2, pick)) && explored(s, q.x, q.y));
    if (c) items.push(['Claim point', c.state === 'claimed' ? (c.team === 0 ? 'Claimed by you' : 'Claimed by the enemy') : c.state === 'locked' ? 'Locked: clear the lairs first' : nice(c.state)]);
    const nd = l.nodes.find((q) => near(q.x, q.y, Math.max(1, pick / 2)) && explored(s, q.x, q.y));
    if (nd) items.push([nice(nd.res), `${Math.floor(nd.amount)} of ${nd.max} left${nd.guarded ? ' · guarded by a lair' : ''}`]);
    const q = squads(s).find((v) => v.team !== MOB_TEAM && near(v.x, v.y, Math.max(2, pick)));
    if (q) {
      const u = s.drawn.find((d) => d.u.squad === q.id);
      items.push([`${q.team === 0 ? 'Your' : 'Enemy'} ${CLASS[u?.u.cls ?? ''] ?? 'squad'}`, `${q.n} men`]);
    }
    const ground = s.map.describe(t.x, t.y, l);
    this.place(e, items[0]?.[0] ?? nice(ground[0].split(' · ')[0]));
    const biome = BIOME_NAME[s.map.biomeNames[s.map.biome[Math.floor(t.y) * w + Math.floor(t.x)]]] ?? '';
    this.card.innerHTML = items.map(([a, d]) => `<b>${a}</b><div class="t">${d}</div>`).join('') +
      `<b>${nice(ground[0].split(' · ')[0])}${ground[0].includes('level') ? `, ${ground[0].split(' · ')[1]}` : ''}</b><div class="t">${biome}${biome ? ' · ' : ''}${PACE[ground[1].split(' · ')[1]] ?? ''}</div><div class="d">${nice(ground[2])}</div>`;
  }
}
