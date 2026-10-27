/**
 * Personal map markers, seen by this player only (the store: ./pinStore.ts; the alliance's shared marks are P, ./chat.ts).
 * A middle click puts one on the ground there (a middle drag still pans); a middle click on one takes it away; Shift +
 * middle click clears them all. Each lasts PIN_MS and fades over its last second, here and on the maps. Drawn in the
 * alliance marks' look (markCss, ./chat.ts): on screen a small teal pennant with its number under the marks' tag;
 * off screen the marks' round edge pointer on the edge of the play area ("Marker 2 · 29 m" under it, the tip towards
 * it; left click: go there, middle click: remove). The region's markers show on the minimap and the full map too
 * (drawPins, ./mapDraw.ts).
 * Mounted by the region HUD (mountRegionPins) and the world map (mountPins, ../../world-view/main.ts).
 */
import type { SandboxScene } from '../SandboxScene';
import { ownCentre } from '../entry';
import { myTeam } from '../side';
import { markCss } from './chat';
import { uiZoom } from './kit';
import { pinAlpha, PinStore, type Pin } from './pinStore';

export interface PinView {
  /** A marker's point on screen (client px), or null. */
  project(p: Pin): { x: number; y: number } | null;
  /** The open play area (client px) the edge pointers keep to (a marker anywhere in the window shows as its pennant). */
  area(): { x0: number; y0: number; x1: number; y1: number };
  /** Centre the view on a marker. */
  focus(p: Pin): void;
  /** How far it is (" · 29 m"), or ''. */
  far(p: Pin): string;
  /** Hide them all now (a full map over the view). */
  hidden?(): boolean;
}

export interface PinHandle {
  /** A middle click at client (cx, cy) on map point `at`: remove the marker there, else put one; with Shift clear all. */
  click(cx: number, cy: number, at: { x: number; y: number }, shift: boolean): void;
  readonly store: PinStore;
}

const C = '#5fd6bd';
const CSS = `${markCss('#pnMarks', '#pnMarkEdges')}
#pnMarks .mk{transition:none}
#pnMarks .mk svg.pn{position:absolute;left:-4px;top:-39px;filter:drop-shadow(0 1px 0 #0e0907) drop-shadow(0 0 2px rgba(14,9,7,.8))}
#pnMarks .mk.new svg.pn{animation:mkDrop .38s cubic-bezier(.3,1.6,.5,1)}
#pnMarkEdges .edge .ar b{font:800 13px/1 Inter,sans-serif;color:var(--mk-c)}
`;

/** A pennant on a stake, its number on the cloth; drawn at 1.25x, the stake's foot at (4, 39). */
const pennant = (n: number) => `<svg class="pn" width="30" height="42" viewBox="0 0 24 34"><ellipse cx="3.5" cy="31" rx="3.5" ry="1.6" fill="rgba(14,9,7,.55)"/><rect x="2" y="2" width="2.4" height="29.5" fill="#2a1a10"/><rect x="2" y="2" width="1" height="29.5" fill="#6b4a30"/><path d="M4.4 3h17l-4.2 6.5 4.2 6.5h-17z" fill="#0e0907"/><path d="M4.4 4.3h14.6l-3.4 5.2 3.4 5.2H4.4z" fill="${C}"/><path d="M4.4 4.3h14.6l-.9 1.4H4.4z" fill="rgba(255,255,255,.35)"/><text x="10.6" y="12.6" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="8.5" fill="#0e0907">${n}</text></svg>`;

let styled = false;

export function mountPins(v: PinView): PinHandle {
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }
  const layer = document.createElement('div');
  layer.id = 'pnMarks';
  const edges = document.createElement('div');
  edges.id = 'pnMarkEdges';
  document.body.append(layer, edges);
  const store = new PinStore();
  const els = new Map<number, { pin: HTMLElement; edge: HTMLElement }>();
  let looping = false;

  const make = (p: Pin, fresh: boolean) => {
    const pin = document.createElement('div');
    pin.className = `mk${fresh ? ' new' : ''}`;
    pin.style.setProperty('--mk-c', C);
    pin.innerHTML = `${pennant(p.n)}<div class="nm"><i>Marker ${p.n}</i>only you</div>`;
    const edge = document.createElement('div');
    edge.className = 'edge';
    edge.style.setProperty('--mk-c', C);
    edge.innerHTML = `<div class="ar"><b>${p.n}</b></div><div class="tip"></div><div class="nm"></div>`;
    edge.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 1) remove(p.n);
      else if (e.button === 0) v.focus(p);
    });
    layer.append(pin);
    edges.append(edge);
    els.set(p.n, { pin, edge });
  };
  const sync = (fresh?: number) => {
    const live = store.list();
    for (const [n, x] of els) if (!live.some((p) => p.n === n)) { x.pin.remove(); x.edge.remove(); els.delete(n); }
    for (const p of live) if (!els.has(p.n)) make(p, p.n === fresh);
    if (els.size && !looping) { looping = true; requestAnimationFrame(frame); }
  };
  const remove = (n: number) => { store.remove(n); sync(); };

  function frame(): void {
    sync(); // the expired go
    if (!els.size) return void (looping = false);
    requestAnimationFrame(frame);
    const a = v.area(), off = !!v.hidden?.(), now = Date.now();
    for (const p of store.list()) {
      const x = els.get(p.n), q = v.project(p);
      if (!x) continue;
      if (!q || off) { x.pin.style.display = x.edge.style.display = 'none'; continue; }
      const fade = String(pinAlpha(p, now));
      if (q.x > 4 && q.y > 30 && q.x < innerWidth - 20 && q.y < innerHeight - 2) {
        x.edge.style.display = 'none';
        x.pin.style.display = '';
        x.pin.style.transform = `translate(${q.x}px,${q.y}px)`;
        x.pin.style.opacity = fade;
        continue;
      }
      // off screen: on the edge of the play area, along the line from its middle, the tip towards it
      x.pin.style.display = 'none';
      x.edge.style.display = '';
      const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2, dx = q.x - cx, dy = q.y - cy;
      const k = Math.min((a.x1 - cx) / Math.abs(dx || 1e-6), (a.y1 - cy) / Math.abs(dy || 1e-6));
      x.edge.style.transform = `translate(${cx + dx * k}px,${cy + dy * k}px)`;
      x.edge.style.opacity = fade;
      const nm = x.edge.querySelector<HTMLElement>('.nm')!, text = `Marker ${p.n}${v.far(p)}`;
      if (nm.textContent !== text) nm.textContent = text;
      x.edge.querySelector<HTMLElement>('.tip')!.style.transform = `rotate(${Math.atan2(dy, dx)}rad) translateX(19px)`;
    }
  }

  sync();
  return {
    store,
    click(cx, cy, at, shift) {
      if (shift) { store.clear(); return sync(); }
      // on a marker: its stake and cloth stand above the point
      const hit = store.list().find((p) => { const q = v.project(p); return !!q && cx >= q.x - 7 && cx <= q.x + 27 && cy >= q.y - 41 && cy <= q.y + 4; });
      if (hit) return remove(hit.n);
      sync(store.add(at.x, at.y).n);
    },
  };
}

let regionPins: PinStore | null = null;

/** The region view's markers (the HUD's mount): middle clicks from the scene, distances from his men. */
export function mountRegionPins(s: SandboxScene): void {
  const canvas = () => s.game.canvas.getBoundingClientRect();
  const h = mountPins({
    project: (p) => { const q = s.toScreen(p.x, p.y), r = canvas(); return { x: q.x + r.left, y: q.y + r.top }; },
    // clear of the minimap, buttons and command card, as the guide's pointers (./guide.ts)
    area: () => { const r = canvas(), z = uiZoom(); return { x0: r.left + 90, y0: r.top + 70, x1: r.right - 120 * z, y1: r.bottom - 225 * z }; },
    focus: (p) => s.focus(p.x, p.y),
    hidden: () => s.mapOpen,
    far: (p) => {
      const me = ownCentre(s.sim.cur, myTeam()) ?? s.tileAt({ x: s.cameras.main.width / 2, y: s.cameras.main.height / 2 });
      return ` · ${Math.round(Math.hypot(p.x - me.x, p.y - me.y) * 2)} m`; // 1 tile = 2 m
    },
  });
  regionPins = h.store;
  s.onMiddleClick = (cx, cy, at, shift) => h.click(cx, cy, at, shift);
}

/** The region's markers on the minimap and the full map: a teal diamond with its number, fading as on the ground. */
export function drawPins(g: CanvasRenderingContext2D, P: (x: number, y: number) => [number, number], m: number, full: boolean): void {
  const now = Date.now();
  for (const p of regionPins?.list() ?? []) {
    const [x, y] = P(p.x, p.y), r = (full ? 6 : 4.2) * m;
    g.globalAlpha = pinAlpha(p, now);
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.lineWidth = 2 * m; g.strokeStyle = '#0e0907'; g.stroke();
    g.fillStyle = C; g.fill();
    if (!full) continue;
    g.fillStyle = '#0e0907'; g.font = `800 ${7 * m}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(p.n), x, y + 0.5 * m);
  }
  g.globalAlpha = 1;
}
