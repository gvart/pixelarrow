/**
 * The world map as an overlay over a running region (../view/hud/fullMap.ts, the M cycle: region map, world map,
 * play). The world screen's own map (./map.ts), cards (./cards.ts) and state (./state.ts) in a gold frame over the
 * region, which keeps running under it: nothing of the region is torn down or fetched again. Loaded on the first
 * region map (a dynamic import), its art and the world's data then stay cached for the page's life.
 *
 * Opens with a zoom out from the region the player is in (outlined in gold) to the whole map. Wheel zooms, drag pans,
 * hover shows a card, a click docks the region's card with Enter, a double click enters (a real page switch; the
 * region he is in just closes the map). L the map key, F fit, + - zoom; the orders, the haul planner and the season
 * panels live on the world screen (its button, top right).
 */
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import { uiZoom } from '../view/hud/kit';
import { hoverCard, regionCardFor, type CardsCtx } from './cards';
import { CARD_CSS } from './regionCard';
import { LEGEND_CSS, legendHtml } from './legend';
import { allianceColor, WorldMap, type MapPick } from './map';
import { MockSource, NetSource, type WorldSource, type WorldView } from './source';
import { applyView, emptyState, loadMastered, loadSettlements, refreshLords } from './state';

export interface OverlayOpts {
  /** The region the player is in. */
  here: string;
  /** Live (the region plays on the server) or the offline mock world. */
  net: boolean;
  /** The dev player's id, when the region runs as one. */
  dev: string | null;
  /** Enter another region (a page switch). */
  enter(id: string): void;
  /** The overlay asks to close (the region he is in was entered). */
  close(): void;
  /** Open the full world screen (world.html). */
  screen(): void;
  /** The key hint in the frame ("M: close"). */
  hint(): string;
}

const CSS = `
#rfWorldMap{position:fixed;inset:0;z-index:8;background:rgba(8,6,5,.72);opacity:0;transition:opacity .18s ease-out}
#rfWorldMap.on{opacity:1}
#rfWorldMap .wo-frame{position:absolute;inset:12px;overflow:hidden;background:#17151d;box-shadow:0 0 0 1px #050506,0 0 0 3px #5f4b2a,0 0 0 4px #050506,0 10px 40px rgba(0,0,0,.6);touch-action:none}
#rfWorldMap canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
#rfWorldMap canvas.drag{cursor:grabbing}
#rfWorldMap .wo-chrome{position:absolute;pointer-events:auto}
#rfWorldMap .wo-title{left:20px;top:20px;display:flex;align-items:baseline;gap:8px;padding:6px 10px 5px;pointer-events:none}
#rfWorldMap .wo-title .rf-name{font-size:18px;letter-spacing:.05em}
#rfWorldMap .wo-btns{right:20px;top:20px;display:flex;gap:4px}
#rfWorldMap .wo-btns kbd,#rfWorldMap .wo-hint kbd{display:inline-block;min-width:14px;padding:2px 4px 1px;margin-left:5px;font:700 11px/1.1 Inter,sans-serif;color:var(--rf-gold);text-align:center;background:#15171b;box-shadow:inset 0 0 0 1px #6a5326}
#rfWorldMap .wo-hint{left:20px;bottom:20px;padding:5px 9px;pointer-events:none;font:600 13px/1 Inter,sans-serif;color:var(--rf-muted);display:flex;align-items:center;gap:10px}
#rfWorldMap .wo-hint b{color:var(--rf-ink);font-weight:700}
#rfWorldMap .wo-load{left:50%;top:50%;transform:translate(-50%,-50%);padding:8px 14px;font:600 14px/1 Inter,sans-serif;color:var(--rf-muted);pointer-events:none}
#rfWorldMap .wo-card{display:none;pointer-events:none;z-index:2;padding:8px 10px 10px;opacity:0;transition:opacity .12s ease-out}
#rfWorldMap .wo-card.on{opacity:1}
#rfWorldMap .wo-pin{display:none;right:20px;top:60px;width:300px;padding:8px 10px 10px;max-height:calc(100% - 100px);overflow:auto;z-index:1}
#rfWorldMap .wo-legend{display:none;right:20px;bottom:20px;width:400px;padding:8px 10px 10px;z-index:1}
#rfWorldMap .wv-sw{width:10px;height:10px;display:inline-block;flex:none;border:1px solid #0e0907}
@media (prefers-reduced-motion:reduce){#rfWorldMap{transition:none}}
`;

const ease = (t: number) => 1 - (1 - t) ** 3;

export class WorldOverlay {
  private root = document.createElement('div');
  private frame = document.createElement('div');
  private canvas = document.createElement('canvas');
  private title: HTMLElement;
  private hintEl: HTMLElement;
  private load: HTMLElement;
  private card: HTMLElement;
  private pin: HTMLElement;
  private legend: HTMLElement;
  private chrome: HTMLElement[] = [];
  private map: WorldMap | null = null;
  private st = emptyState();
  private view: WorldView | null = null;
  private source: WorldSource;
  private picked: MapPick | null = null;
  private mouse = { x: 0, y: 0 };
  private raf = 0;
  private hiding = 0;
  /** The zoom out on open: the camera from the region the player is in to the whole map. */
  private fly: { t0: number; ms: number; from: [number, number, number]; to: [number, number, number] } | null = null;
  readonly ready: Promise<void>;
  private cards: CardsCtx;

  constructor(private o: OverlayOpts) {
    if (!document.getElementById('rfWorldMapCss')) {
      const st = document.createElement('style');
      st.id = 'rfWorldMapCss';
      st.textContent = CSS + CARD_CSS + LEGEND_CSS;
      document.head.appendChild(st);
    }
    this.root.id = 'rfWorldMap';
    this.root.style.display = 'none';
    this.frame.className = 'wo-frame';
    this.frame.append(this.canvas);
    this.root.append(this.frame);
    const el = (cls: string, html = '') => { const e = document.createElement('div'); e.className = `rf ${cls} wo-chrome`; e.innerHTML = html; this.frame.append(e); this.chrome.push(e); return e; };
    this.title = el('rf-card wo-title');
    const btns = el('wo-btns', `<button class="rf-tbtn" data-act="legend" title="what the colours, lines and markers mean">Map key<kbd>L</kbd></button>
      <button class="rf-tbtn" data-act="fit" title="fit the whole map">Fit<kbd>F</kbd></button>
      <button class="rf-tbtn" data-act="screen" title="the world screen: march orders, the haul planner, the season">World screen</button>`);
    this.hintEl = el('rf-card wo-hint');
    this.load = el('rf-card wo-load', 'Unrolling the world map…');
    this.pin = el('rf-card wo-pin');
    this.legend = el('rf-card wo-legend');
    this.card = el('rf-card wo-card');
    document.body.append(this.root);
    this.source = o.net ? new NetSource(new URLSearchParams(o.dev ? { dev: o.dev } : {})) : new MockSource();
    this.st.here = o.here;
    const self = this;
    this.cards = { st: this.st, get view() { return self.view; }, color: (a) => allianceColor(self.map!.art, a), mode: () => 'enter' };
    btns.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (a === 'legend') this.toggleLegend();
      if (a === 'fit') this.fitTo(true);
      if (a === 'screen') o.screen();
    });
    this.pin.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (a === 'enter' && this.st.selected) this.enter(this.st.selected);
      if (a === 'close') this.select(null);
    });
    this.legend.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-act="close"]')) this.toggleLegend(); });
    this.input();
    this.ready = this.start();
  }

  /** Load the map art and start following the world (once; both stay for the page's life). */
  private async start(): Promise<void> {
    const m = await WorldMap.load(this.canvas);
    this.map = m;
    this.load.style.display = 'none';
    if (this.open) this.fitTo(false), this.flyIn();
    void loadSettlements(this.source, this.st);
    void loadMastered(this.source, this.st);
    setInterval(() => { if (this.open) void loadSettlements(this.source, this.st), void loadMastered(this.source, this.st); }, 60_000);
    setInterval(() => refreshLords(this.st), 5000);
    void this.source.start((v) => {
      this.view = v;
      applyView(this.st, v);
      if (this.open) this.renderChrome();
    }).catch((e) => { this.load.textContent = `World map offline: ${(e as Error).message}`; this.load.style.display = ''; });
  }

  get open(): boolean {
    return this.root.style.display !== 'none' && !this.hiding;
  }

  show(): void {
    clearTimeout(this.hiding);
    this.hiding = 0;
    const z = String(uiZoom());
    for (const e of this.chrome) e.style.zoom = z;
    this.root.style.display = '';
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.select(null);
    this.renderChrome();
    if (this.map) this.fitTo(false), this.flyIn();
    cancelAnimationFrame(this.raf);
    const frame = () => {
      if (this.map) this.drawFrame();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  hide(): void {
    if (this.root.style.display === 'none' || this.hiding) return;
    this.root.classList.remove('on');
    this.card.style.display = 'none';
    this.hiding = window.setTimeout(() => {
      this.hiding = 0;
      this.root.style.display = 'none';
      cancelAnimationFrame(this.raf); // nothing draws while it is shut
    }, 190);
  }

  /** The overlay's keys while it is open (M and Esc are the cycle's); true when it used the key. */
  key(e: KeyboardEvent): boolean {
    if (!this.map || e.ctrlKey || e.metaKey || e.altKey) return false;
    const c = e.code, m = this.map, r = this.canvas.getBoundingClientRect();
    if (c === 'KeyF') this.fitTo(true);
    else if (c === 'KeyL') this.toggleLegend();
    else if (c === 'Equal' || c === 'NumpadAdd') m.zoomTo(m.goal * 1.35, r.width / 2, r.height / 2);
    else if (c === 'Minus' || c === 'NumpadSubtract') m.zoomTo(m.goal / 1.35, r.width / 2, r.height / 2);
    else if (c === 'Enter' || c === 'NumpadEnter') { const id = this.st.hover ?? this.st.selected; if (!id) return false; this.enter(id); }
    else return false;
    return true;
  }

  private enter(id: string): void {
    if (id === this.o.here) this.o.close();
    else this.o.enter(id);
  }

  /** Fit the whole map in the frame; `animate`: glide there from where the camera is. */
  private fitTo(animate: boolean): void {
    const m = this.map;
    if (!m) return;
    const from = this.cam();
    m.fit({ top: 56, left: 16, right: 16, bottom: 48 });
    if (!animate) return;
    this.fly = { t0: performance.now(), ms: 320, from, to: this.cam() };
    this.camAt(from);
  }
  /** The camera as its centre (map px) and zoom. */
  private cam(): [number, number, number] {
    const m = this.map!;
    return [m.x + this.canvas.clientWidth / 2 / m.k, m.y + this.canvas.clientHeight / 2 / m.k, m.k];
  }

  /** The zoom out: from the region he is in, close up, to the fitted map. */
  private flyIn(): void {
    const m = this.map!, r = m.art.regions[this.o.here], to = this.cam();
    if (!r || matchMedia('(prefers-reduced-motion: reduce)').matches) return void (this.fly = null);
    const from: [number, number, number] = [r.centroid[0], r.centroid[1], Math.min(2.2, m.k * 4)];
    this.fly = { t0: performance.now(), ms: 460, from, to };
    this.camAt(from);
  }

  private camAt([cx, cy, k]: [number, number, number]): void {
    const m = this.map!;
    m.k = k;
    m.x = cx - this.canvas.clientWidth / 2 / k;
    m.y = cy - this.canvas.clientHeight / 2 / k;
    m.settle();
  }

  private drawFrame(): void {
    const m = this.map!;
    if (this.fly) {
      const t = Math.min(1, (performance.now() - this.fly.t0) / this.fly.ms), e = ease(t), { from: a, to: b } = this.fly;
      this.camAt([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * e)]);
      if (t >= 1) this.fly = null;
    }
    this.st.now = Date.now();
    m.draw(this.st);
  }

  private renderChrome(): void {
    const v = this.view, you = this.st.you;
    this.title.innerHTML = `<span class="rf-name">World</span>${v ? `<span class="rf-dim">season ${v.snap.season}</span>` : ''}${you !== null ? `<span class="wv-sw" style="background:${allianceColor(this.map?.art as never, you)};align-self:center"></span><span class="rf-dim">${ALLIANCES[you].name}</span>` : ''}`;
    this.hintEl.innerHTML = `<span><b>${worldRegion(this.o.here)?.name ?? ''}</b> outlined: you are here</span><span>Double-click a region to enter</span><span><kbd>${this.o.hint().replace(/:.*/, '')}</kbd> ${this.o.hint().replace(/^[^:]*:\s*/, '')} <kbd>Esc</kbd> back to play</span>`;
    if (this.st.selected) this.renderPin();
  }

  private toggleLegend(): void {
    const on = this.legend.style.display === 'none' || !this.legend.style.display;
    this.legend.style.display = on ? 'block' : 'none';
    if (on && this.map) this.legend.innerHTML = legendHtml((a) => allianceColor(this.map!.art, a), this.st.you);
  }

  private select(id: string | null): void {
    this.st.selected = id;
    this.renderPin();
    this.placeCard();
  }

  private renderPin(): void {
    const id = this.st.selected;
    this.pin.style.display = id && worldRegion(id) ? 'block' : 'none';
    if (id && worldRegion(id)) this.pin.innerHTML = regionCardFor(this.cards, id, true).replace('>Enter region<', id === this.o.here ? '>Back to play<' : '>Enter region<');
  }

  private placeCard(): void {
    const p = this.picked, c = this.card;
    const marker = !!p && !!(p.landmark || p.lord || p.mastered || p.settle != null || p.crown != null || p.cluster);
    const show = !!p && !!this.map && !this.drag?.moved && !this.fly && (marker || (!!p.region && p.region !== this.st.selected));
    const h = show ? hoverCard(this.cards, p!) : null;
    if (!h) return void ((c.style.display = 'none'), c.classList.remove('on'));
    if (c.style.display === 'none' || !c.style.display) { c.style.display = 'block'; void c.offsetWidth; }
    c.classList.add('on');
    c.innerHTML = h.html;
    c.style.width = `${h.width}px`;
    const z = Number(c.style.zoom) || 1, fr = this.frame.getBoundingClientRect(), r = c.getBoundingClientRect();
    let x = this.mouse.x - fr.left + 20, y = this.mouse.y - fr.top + 20;
    if (x + r.width > fr.width - 8) x = this.mouse.x - fr.left - r.width - 20;
    if (y + r.height > fr.height - 8) y = fr.height - r.height - 8;
    c.style.left = `${Math.max(8, x) / z}px`;
    c.style.top = `${Math.max(8, y) / z}px`;
  }

  private drag: { x: number; y: number; mx: number; my: number; moved: boolean } | null = null;
  private input(): void {
    const cv = this.canvas, at = (e: { clientX: number; clientY: number }) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    // the region under the overlay sees none of its pointer events
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target !== cv || !this.map) return;
      this.fly = null;
      const [x, y] = at(e);
      this.map.zoomTo(this.map.goal * Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) / 400), x, y);
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (!this.map) return;
      this.fly = null;
      this.drag = { x: e.clientX, y: e.clientY, mx: this.map.x, my: this.map.y, moved: false };
      this.map.grab();
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const m = this.map;
      if (!m) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      const d = this.drag;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 4) (d.moved = true), cv.classList.add('drag');
        if (d.moved) m.panTo(d.mx - dx / m.k, d.my - dy / m.k, e.timeStamp);
      }
      this.picked = m.pick(this.st, ...m.toMap(...at(e)));
      this.st.hover = this.picked.region;
      this.st.hoverSettle = this.picked.settle;
      cv.style.cursor = d?.moved ? '' : this.picked.cluster ? 'zoom-in' : this.st.hover ? 'pointer' : '';
      this.placeCard();
    });
    cv.addEventListener('pointerleave', () => { this.picked = null; this.st.hover = null; this.placeCard(); });
    cv.addEventListener('pointerup', (e) => {
      const d = this.drag, m = this.map;
      this.drag = null;
      cv.classList.remove('drag');
      if (!d || !m) return;
      if (d.moved) return void m.release(e.timeStamp);
      const p = m.pick(this.st, ...m.toMap(...at(e)));
      if (p.cluster) return void m.zoomTo(Math.max(m.goal * 2.2, 0.75), ...at(e));
      this.select(p.region);
    });
    cv.addEventListener('dblclick', (e) => {
      const m = this.map;
      if (!m) return;
      const id = m.regionAt(...m.toMap(...at(e)));
      if (id) this.enter(id);
    });
    addEventListener('resize', () => { if (this.open) this.fitTo(false); });
  }
}
