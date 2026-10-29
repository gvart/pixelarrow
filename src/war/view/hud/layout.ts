/**
 * The HUD's layout: one place that says where every docked panel sits, so no two of them meet.
 *
 * The screen is cut into zones (art px, the UI scale applied once for all of them):
 *
 *   tl  top left, a column down from under the top bar: the guide or quest card, then the world event card
 *   tc  top centre, under the bar's plaque: the town badge, the guardian bars, the tunnel pill, the toasts
 *   tr  top right: the dev row and net stats (dev only), the tracked quest, the menu windows, the landmark panel
 *   lane  the centre lane under tc: one banner at a time (quest, guardian, story)
 *   bl  bottom left, up from the corner: the minimap, the map mode's legend, the chat
 *   bc  bottom centre, up from the edge: the command card, the build bar or the control groups, the soul prompt
 *   br  bottom right: the I / R / B dock
 *   lwin  left windows (roster, market, forge, memorial): from under the bar down to the minimap, clear of the card;
 *         while one is open the tl column and the shut chat give way (an open chat stays: the window ends above it,
 *         so a Shift+click from the roster can link a man)
 *   rwin  right windows (the squad chest): up from the dock, clear of the card, under the tr column
 *
 * A zone stacks its panels with a gap; a panel in a column pushes the next one along. When a column runs out of room
 * its shrinkable panels (`min`) give up height and scroll inside, then the last ones are left out. `solve` is the pure
 * part (tests/war/hudLayout.test.ts); `mountLayout` measures the panels each frame and writes their place.
 *
 * Z-order: one table (`Z`) for the whole HUD; nothing else should pick a z-index.
 */
import { TOP_BAR_H } from './theme';
import { uiZoom } from './kit';

export { Z } from './theme';

export type Anchor = 'tl' | 'tc' | 'tr' | 'lane' | 'bl' | 'bc' | 'br' | 'lwin' | 'rwin';

/** A panel to place: its size now (art px). */
export interface Box {
  id: string;
  w: number;
  h: number;
  /** Shrinkable to this height (it scrolls inside). */
  min?: number;
  /** Gives way (hidden) while a left window is open. */
  yields?: boolean;
  /** Its own horizontal offset from the anchor (a left window beside another, the command card slid clear). */
  dx?: number;
}
/** Where a panel goes (art px, top-left corner), or `off`: no room, or giving way. */
export interface Placed { x: number; y: number; w: number; h: number; off?: boolean; /** Centre zones: the widest it may be here. */ cap?: number }
export interface Frame { w: number; h: number }
export type Stacks = Partial<Record<Anchor, Box[]>>;

/** The space between stacked panels and from the window's edge. */
export const GAP = 6, EDGE = 4;
/** The side columns start under the top bar; the centre one under the bar's plaque. */
export const TOP = TOP_BAR_H + 2 + EDGE, TOP_C = TOP_BAR_H + 10 + EDGE;

const meets = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Place every stack in a window of `f` (art px). Lists run in stacking order: top-down for top zones, bottom-up for the bottom ones. */
export function solve(f: Frame, st: Stacks): Record<string, Placed> {
  const out: Record<string, Placed> = {};
  const shown = (zs: Anchor[]) => zs.flatMap((z) => (st[z] ?? []).map((b) => out[b.id]).filter((p) => p && !p.off));
  const off = (b: Box) => (out[b.id] = { x: 0, y: 0, w: b.w, h: b.h, off: true });
  const lwinOpen = (st.lwin ?? []).length > 0;

  /** Bottom-up from `base`; x by `xOf`; each panel also clears the boxes of `clear` it would meet. */
  const up = (list: Box[], base: number, xOf: (b: Box) => number, clear: () => Placed[] = () => []) => {
    let cur = base;
    for (const b of list) {
      if (b.yields && lwinOpen) { off(b); continue; }
      const x = xOf(b);
      let y = cur - b.h;
      for (const p of clear()) if (meets(x, x + b.w, p.x, p.x + p.w) && meets(y, y + b.h, p.y - GAP, p.y + p.h + GAP)) y = Math.min(y, p.y - GAP - b.h);
      out[b.id] = { x, y, w: b.w, h: b.h };
      cur = y - GAP;
    }
    return cur + GAP;
  };
  /** Top-down from `top` to `limit`: shrinkables give up height first, then the panels that still do not fit stay out. */
  const down = (list: Box[], top: number, limit: number, xOf: (b: Box, w: number) => number, cap = Infinity) => {
    const live = list.filter((b) => !(b.yields && lwinOpen));
    for (const b of list) if (!live.includes(b)) off(b);
    const hs = live.map((b) => b.h);
    const room = limit - top - GAP * Math.max(0, live.length - 1);
    let over = hs.reduce((a, h) => a + h, 0) - room;
    for (let i = live.length - 1; i >= 0 && over > 0; i--) {
      const m = live[i].min;
      if (m === undefined || hs[i] <= m) continue;
      const give = Math.min(over, hs[i] - m);
      hs[i] -= give;
      over -= give;
    }
    let y = top;
    live.forEach((b, i) => {
      const w = Math.min(b.w, cap);
      if (y + hs[i] > limit) return void off(b);
      out[b.id] = { x: xOf(b, w), y, w, h: hs[i], ...(cap < Infinity ? { cap } : {}) };
      y += hs[i] + GAP;
    });
    return y - GAP;
  };
  const left = (b: Box) => EDGE + (b.dx ?? 0), right = (b: Box) => f.w - EDGE - b.w - (b.dx ?? 0);
  const centre = (b: Box, w = b.w) => (f.w - w) / 2 + (b.dx ?? 0);

  // the bottom corners, then the bottom centre clear of them
  const brTop = up(st.br ?? [], f.h - EDGE, right);
  up(st.bl ?? [], f.h - EDGE, left);
  const bcTop = up(st.bc ?? [], f.h - EDGE, centre, () => shown(['bl', 'br']));
  /** The highest top among the bottom boxes a box over [x0, x1] would meet. */
  const floor = (x0: number, x1: number, zs: Anchor[]) => Math.min(f.h - EDGE, ...shown(zs).filter((p) => meets(x0, x1, p.x, p.x + p.w)).map((p) => p.y));

  // left windows: from under the bar down to the minimap, clear of the command card
  let x = EDGE;
  for (const b of st.lwin ?? []) {
    const bx = b.dx !== undefined ? EDGE + b.dx : x, limit = floor(bx, bx + b.w, ['bl', 'bc']) - GAP;
    out[b.id] = { x: bx, y: TOP, w: b.w, h: Math.max(0, Math.min(b.h, limit - TOP)) };
    x = bx + b.w + GAP;
  }

  // right windows: up from the dock, clear of the card; the tr column fits above them
  const rw = st.rwin ?? [];
  let rTop = brTop;
  for (const b of rw) {
    const bx = right(b), base = floor(bx, bx + b.w, ['br', 'bc']) - GAP;
    const h = Math.max(0, Math.min(b.h, base - TOP));
    out[b.id] = { x: bx, y: base - h, w: b.w, h };
    rTop = Math.min(rTop, base - h);
  }
  const trList = st.tr ?? [], trW = Math.max(0, ...trList.map((b) => b.w));
  down(trList, TOP, Math.min(rTop, floor(f.w - EDGE - trW, f.w - EDGE, ['br', 'bc'])) - GAP, (b) => right(b));
  // a right window that the column's fixed panels still reach starts under them
  const trBottom = Math.max(0, ...shown(['tr']).map((p) => p.y + p.h));
  for (const b of rw) {
    const p = out[b.id];
    if (trBottom + GAP > p.y && meets(p.x, p.x + p.w, ...trSpan())) { const bottom = p.y + p.h; p.y = trBottom + GAP; p.h = Math.max(0, bottom - p.y); }
  }
  function trSpan(): [number, number] { const ps = shown(['tr']); return [Math.min(f.w, ...ps.map((p) => p.x)), Math.max(0, ...ps.map((p) => p.x + p.w))]; }

  // top left: down to the bottom-left stack
  const tlW = Math.max(0, ...(st.tl ?? []).map((b) => b.w));
  down(st.tl ?? [], TOP, floor(EDGE, EDGE + tlW, ['bl', 'bc']) - GAP, (b) => left(b));

  // the centre: as wide as the gap between the side columns where it runs
  const span = (y0: number, y1: number): [number, number] => {
    const sides = shown(['tl', 'tr', 'lwin', 'rwin', 'bl', 'br']).filter((p) => meets(y0, y1, p.y, p.y + p.h));
    return [Math.max(0, ...sides.filter((p) => p.x + p.w / 2 < f.w / 2).map((p) => p.x + p.w)), Math.min(f.w, ...sides.filter((p) => p.x + p.w / 2 >= f.w / 2).map((p) => p.x))];
  };
  /** A centre stack from `top`: centred on the screen where it can be, else in the room between the sides. */
  const middle = (list: Box[], top: number) => {
    const [l0, r0] = span(top, top + list.reduce((a, b) => a + b.h + GAP, 0));
    return down(list, top, bcTop - GAP, (_b, w) => Math.max(l0 + GAP, Math.min((f.w - w) / 2, r0 - GAP - w)), Math.max(0, r0 - l0 - 2 * GAP));
  };
  const tc = st.tc ?? [], tcBottom = tc.length ? middle(tc, TOP_C) : TOP_C - GAP;
  // the lane: one banner at a time under the top centre (an open chat on the left moves it right)
  middle(st.lane ?? [], Math.max(tcBottom + GAP, Math.round(f.h * 0.14)));
  return out;
}

// ---------------------------------------------------------------- the DOM side

/** Which panel goes where, in stacking order (top-down, or bottom-up for bl / bc / br / rwin). */
export const ZONES: Record<Anchor, readonly string[]> = {
  tl: ['rfGuide', 'rfWorldEv'],
  tc: ['rfTown', 'rfTownCard', 'rpTop', 'rfGuard', 'rfTunnel', 'rpToast', 'rrToasts'],
  tr: ['rfDev', 'rfNet', 'rfQuest', 'rfWorks', 'rfFavour', 'rfTasks', 'rfHoldings', 'rfCrown', 'rfHolder', 'rfLand'],
  lane: ['rfQBanner', 'rfBossBanner'],
  bl: ['minimap', 'rfLegend', 'rfChat'],
  bc: ['rpBar', 'rfCard', 'rfBuild', 'rfGroups', 'rfSoul'],
  br: ['rfDock'],
  lwin: ['rrPanel', 'rrCard', 'rfMarket', 'rfHandoff', 'cfWp', 'cfTree', 'mmPanel'],
  rwin: ['rfChest'],
};
/** Shrinkable panels: their least height (art px). */
const MIN: Record<string, number> = {
  rfGuide: 34, rfQuest: 60, rfLand: 30, rfTownCard: 120,
  rfWorks: 120, rfFavour: 120, rfTasks: 120, rfHoldings: 120, rfCrown: 120, rfHolder: 120,
};
/** Panels that give way while a left window is open (the chat only while shut: open, the window ends above it). */
const YIELDS = new Set(['rfGuide', 'rfWorldEv', 'rfChat']);
const yields = (id: string, el: HTMLElement) => YIELDS.has(id) && !(id === 'rfChat' && el.classList.contains('open'));
/** Measured, never moved: the dock plate (its buttons sit on it by their own CSS). */
const FIXED = new Set(['rfDock']);
/** Centre modals: while one shows, no banner in the lane. */
const MODALS = '#rfWipe,.mn-modal';
/** Not placed, but kept clear by the map's pointers. */
const DECOR = '#rfModes,#rfModes .cap,#rfChestBtn,#rrBtn,#rfHammer';
/** Placed by their bottom edge (bottom-up zones). */
const FROM_BOTTOM = new Set<Anchor>(['bl', 'bc', 'br', 'rwin']);
/** Windows: they keep a dragged place and get a max height. */
const WINDOWS = new Set<Anchor>(['lwin', 'rwin']);
/** Windows that open beside another one (the soldier card by the roster): placed where they are across. */
const SIDE_BY_SIDE = new Set(['rrCard', 'rfHandoff', 'cfTree']);

const CSS = `.hud-off{display:none!important}`;

/** Is a banner other than `id` in the centre lane now (they take turns: ./quest.ts, ./bossBanner.ts)? */
export const laneBusy = (id: string): boolean => ZONES.lane.some((o) => o !== id && (document.getElementById(o)?.style.display ?? 'none') !== 'none');

/** The docked boxes as last placed (CSS px), for the map's edge pointers to keep off. */
let docked: { l: number; t: number; r: number; b: number }[] = [];

/** The open play area for the map's edge pointers (CSS px): under the bar's plaque, inside the window's edges. */
export function markerArea(): { x0: number; y0: number; x1: number; y1: number } {
  const z = uiZoom();
  return { x0: 80 * z, y0: (TOP_C + 16) * z, x1: innerWidth - 80 * z, y1: innerHeight - 24 * z };
}

/**
 * A pointer at (x, y) with a label `hw` by `hh` either side (CSS px), moved off every docked panel: out by the shortest
 * way that stays in `a`, a few rounds for panels side by side.
 */
export function clearOfHud(x: number, y: number, hw: number, hh: number, a = markerArea()): { x: number; y: number } {
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (const d of docked) {
      const l = d.l - hw, r = d.r + hw, t = d.t - hh, b = d.b + hh;
      if (x <= l || x >= r || y <= t || y >= b) continue;
      const outs = [{ x: l, y }, { x: r, y }, { x, y: t }, { x, y: b }].filter((p) => p.x >= a.x0 && p.x <= a.x1 && p.y >= a.y0 && p.y <= a.y1);
      if (!outs.length) continue;
      ({ x, y } = outs.reduce((m, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(m.x - x, m.y - y) ? p : m)));
      moved = true;
    }
    if (!moved) break;
  }
  return { x, y };
}

/** Measure the zoned panels each frame and put them in place. */
export function mountLayout(): void {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const zoneOf = new Map<string, Anchor>();
  for (const [z, ids] of Object.entries(ZONES) as [Anchor, readonly string[]][]) for (const id of ids) zoneOf.set(id, z);
  const frame = () => {
    requestAnimationFrame(frame);
    const z = uiZoom(), f = { w: innerWidth / z, h: innerHeight / z };
    const els = new Map<string, HTMLElement>();
    for (const id of zoneOf.keys()) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.remove('hud-off');
      els.set(id, el);
    }
    // measure (one layout pass), then write; a panel this clamped is measured by its content, so its scroll stays
    const stacks: Stacks = {};
    for (const [id, el] of els) {
      const r = el.getBoundingClientRect();
      if (el.style.display === 'none' || r.height < 1 || r.width < 1 || getComputedStyle(el).opacity === '0') continue;
      const zone = zoneOf.get(id)!, ez = Number(el.style.zoom) || 1;
      if (WINDOWS.has(zone) && el.dataset.moved) continue;
      const h = el.dataset.hudClamp ? el.scrollHeight + el.offsetHeight - el.clientHeight : r.height / ez;
      (stacks[zone] ??= []).push({ id, w: r.width / ez, h, ...(MIN[id] !== undefined ? { min: MIN[id] } : {}), ...(yields(id, el) ? { yields: true } : {}), ...(SIDE_BY_SIDE.has(id) ? { dx: Math.round(r.left / ez - EDGE) } : zone === 'bc' ? { dx: r.left / ez - (f.w - r.width / ez) / 2 } : {}) });
    }
    // a centre modal up (the wipe card, the game menu): the lane's banners wait under it, unseen
    if (stacks.lane && [...document.querySelectorAll(MODALS)].some((m) => m.getClientRects().length > 0)) { for (const b of stacks.lane) els.get(b.id)!.classList.add('hud-off'); delete stacks.lane; }
    const placed = solve(f, stacks);
    docked = Object.values(placed).filter((p) => !p.off).map((p) => ({ l: p.x * z, t: p.y * z, r: (p.x + p.w) * z, b: (p.y + p.h) * z }));
    // pieces that ride on a zoned panel by their own CSS: the map mode button and its caption, the dock's buttons
    for (const d of document.querySelectorAll<HTMLElement>(DECOR)) {
      const r = d.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) docked.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    for (const [id, p] of Object.entries(placed)) {
      const el = els.get(id)!, zone = zoneOf.get(id)!;
      if (p.off) { el.classList.add('hud-off'); continue; }
      if (FIXED.has(id)) continue;
      el.style.marginTop = '0';
      if (FROM_BOTTOM.has(zone)) { el.style.top = 'auto'; el.style.bottom = `${Math.round(f.h - p.y - p.h)}px`; }
      else { el.style.bottom = 'auto'; el.style.top = `${Math.round(p.y)}px`; }
      // the centre zones: placed by their middle (they keep their translateX(-50%)), no wider than the room
      if (p.cap !== undefined) { el.style.left = `${Math.round(p.x + p.w / 2)}px`; el.style.maxWidth = `${Math.floor(p.cap)}px`; }
      const want = stacks[zone]!.find((b) => b.id === id)!;
      if (p.h < want.h - 0.5) {
        Object.assign(el.style, { maxHeight: `${Math.floor(p.h)}px`, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#5f4b2a #050506' });
        el.dataset.hudClamp = '1';
      }
      else if (el.dataset.hudClamp) { el.style.maxHeight = el.style.overflowY = ''; delete el.dataset.hudClamp; }
    }
  };
  requestAnimationFrame(frame);
}
