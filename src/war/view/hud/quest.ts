/**
 * Quest pieces shared by the guide (./guide.ts), the tasks (./tasks.ts) and the crown's orders (./crown.ts):
 *
 *  - the world marker: gold over the target ("Soul · 29 m" on the screen's edge with an arrow when it is off screen);
 *  - the quest banner: top centre, a quest started, a task ready to claim, a reward paid (giver, title, reward);
 *  - the tracked quest: one task or order at a time (Track on its card), told in a card top right under the corner
 *    buttons (giver, goal, progress, where, how it pays) with its own marker; the choice kept in localStorage.
 */
import type { SandboxScene } from '../SandboxScene';
import { ownCentre } from '../entry';
import { myTeam } from '../side';
import { icon, leftPanelOpen, uiZoom } from './kit';
import { esc } from './roster/ui';
import { chip, details, qcard } from './qcard';
import { clearOfHud, clearOnRay, laneBusy, markerArea, Z } from './layout';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type P = { x: number; y: number };

const CSS = `
.gd-mk{position:fixed;z-index:${Z.mark};pointer-events:none;transform:translate(-50%,-100%);display:none;flex-direction:column;align-items:center;font:700 13px/1 Inter,sans-serif;color:var(--rf-gold);text-shadow:0 1px 0 #050506,0 0 3px #050506;white-space:nowrap}
.gd-mk .lb{padding:4px 7px;background:rgba(10,11,13,.82);box-shadow:inset 0 0 0 1px #6a5326}
.gd-mk .ch{width:0;height:0;margin-top:3px;border:9px solid transparent;border-top:13px solid var(--rf-gold);border-bottom:0;filter:drop-shadow(0 1px 0 #050506)}
.gd-mk.on .ch,.gd-mk.trk .ch{animation:gdBob 1.1s ease-in-out infinite}
.gd-mk.edge{transform:translate(-50%,-50%)}
.gd-mk .ar{display:none;position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;filter:drop-shadow(0 1px 0 #050506) drop-shadow(0 0 2px #050506)}
.gd-mk.edge .ch{display:none}.gd-mk.edge .ar{display:block}
.gd-mk.home{color:var(--rf-ink)}
.gd-mk.home .lb{box-shadow:inset 0 0 0 1px var(--rf-rule);color:var(--rf-muted)}
.gd-mk.home .ar{color:var(--rf-muted)}
.gd-mk .ar{color:var(--rf-gold)}
.gd-mk.trk{color:#f3e2b8}.gd-mk.trk .lb{box-shadow:inset 0 0 0 1px #b38a3e;background:rgba(36,22,10,.88)}
.gd-mk.trk .ch{border-top-color:#f3e2b8}.gd-mk.trk .ar{color:#f3e2b8}
@keyframes gdBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
#rfQBanner{left:50%;top:44px;transform:translateX(-50%);z-index:${Z.banner};pointer-events:none;width:340px;padding:7px 12px 9px;text-align:center;transition:opacity .45s,transform .45s}
#rfQBanner.out{opacity:0;transform:translateX(-50%) translateY(-6px)}
#rfQBanner .qb-k{font:700 10.5px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--rf-gold)}
#rfQBanner .qb-t{margin-top:4px;font:700 17px/1.15 Cinzel,serif;color:var(--rf-title)}
#rfQBanner .qb-x{margin-top:5px;font:500 13px/1.4 Inter,sans-serif;color:var(--rf-ink)}
#rfQBanner .qb-r{display:flex;justify-content:center;flex-wrap:wrap;gap:4px;margin-top:6px}
#rfQBanner .qb-p{margin-top:5px;font:600 12.5px/1.3 Inter,sans-serif;color:var(--rf-ink)}
#rfQBanner.done .qb-k{color:var(--rf-good)}
#rfQuest{right:4px;top:40px;width:250px;pointer-events:auto;padding:5px 8px 7px}
#rfQuest .qt-h{display:flex;align-items:center;gap:6px;padding-bottom:4px;margin-bottom:5px;border-bottom:1px solid var(--rf-rule)}
#rfQuest .qt-k{font:700 10.5px/1 Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--rf-gold)}
#rfQuest .qt-x{margin-left:auto;width:18px;height:18px;min-width:18px;padding:0;font-size:12px}
#rfQuest .qt-ch{display:flex;flex-direction:column;gap:4px;margin-top:6px}
#rfQuest .qt-ch button{display:block;width:100%;height:auto;text-align:left;padding:4px 7px;font:700 13px/16px Inter,sans-serif;white-space:normal}
#rfQuest .qt-ch button i{display:block;font:500 12px/15px Inter,sans-serif;color:var(--rf-ink);font-style:normal;opacity:.85}
`;
let styled = false;
const style = () => {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
};

/** Tiles to metres (1 tile = 2 m, W-18). */
export const metres = (d: number) => `${Math.round(d * 2)} m`;

// ---------------------------------------------------------------- world marker

/** A world marker (classes: 'on' the guide's step, 'home' the town, 'trk' the tracked quest). */
export function questMarker(cls: string): HTMLElement {
  style();
  const m = document.createElement('div');
  m.className = `gd-mk ${cls}`;
  m.innerHTML = '<div class="lb"></div><div class="ch"></div><svg class="ar" viewBox="0 0 18 18"><path d="M2 3 L16 9 L2 15 L6 9 Z" fill="currentColor"/></svg>';
  document.body.appendChild(m);
  return m;
}

/**
 * Place marker `m` over tile point p (label's first part), or on the screen's edge towards it (the whole label, an arrow
 * turned at it). The edge spot keeps off every docked panel (./layout.ts).
 */
export function placeMarker(s: SandboxScene, m: HTMLElement, p: P | null, label: string): void {
  if (!p) return void (m.style.display = 'none');
  const q = s.toScreen(p.x, p.y);
  // the open play area: under the top bar's plaque, inside the edges (the HUD's zones are zoomed with the UI scale)
  const { x0, x1, y0, y1 } = markerArea();
  m.style.display = 'flex';
  const lb = m.querySelector<HTMLElement>('.lb')!, ar = m.querySelector<SVGElement>('.ar')!;
  if (q.x > x0 && q.y > y0 + 20 && q.x < x1 && q.y < y1 + 40) {
    lb.textContent = label.split(' · ')[0];
    // over its point, unless a panel stands there: then as an edge pointer beside the panel, turned at it
    const hw = lb.offsetWidth / 2 + 4, mid = q.y - 26 - 20, free = clearOfHud(q.x, mid, hw, 20);
    if (free.x === q.x && free.y === mid) {
      m.classList.remove('edge');
      m.style.left = `${q.x}px`;
      m.style.top = `${q.y - 26}px`;
      return;
    }
  }
  // off screen (or under the HUD): on the edge of the open play area, along the line from its middle
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const k = Math.min((x1 - cx) / Math.abs(q.x - cx || 1e-6), (y1 - cy) / Math.abs(q.y - cy || 1e-6), 1);
  m.classList.add('edge');
  lb.textContent = label;
  // centred on its point: keep the label and its arrow off the panels and inside the window
  const hw = lb.offsetWidth / 2 + 24, at = clearOnRay(cx, cy, cx + (q.x - cx) * k, cy + (q.y - cy) * k, hw, 18);
  at.x = Math.max(hw - 18, Math.min(innerWidth - hw + 18, at.x));
  m.style.left = `${at.x}px`;
  m.style.top = `${at.y}px`;
  const dx = q.x - at.x, dy = q.y - at.y;
  const a = Math.atan2(dy, dx), r = Math.hypot((lb.offsetWidth / 2) * Math.cos(a), 9 * Math.sin(a)) + 16; // just past the label's edge
  ar.style.transform = `rotate(${a}rad) translateX(${r}px)`;
}

// ---------------------------------------------------------------- banner

export interface Banner {
  /** start: a quest begins; ready: done, claim it; done: the reward is paid. */
  kind: 'start' | 'ready' | 'done';
  /** The small line on top ("New quest", "Task done", ...). */
  head: string;
  title: string;
  /** "Peleia, dove-priestess of the Oak". */
  giver?: string;
  text?: string;
  reward?: Record<string, number>;
  /** How the reward is paid ("paid into your stores", "claim it in Tasks"). */
  pay?: string;
}
const queue: Banner[] = [];
let showing = false;
/** Show a quest banner (one at a time, each about 5 s; later ones wait their turn). */
export function questBanner(b: Banner): void {
  style();
  queue.push(b);
  if (!showing) next();
}
function next(): void {
  const b = queue.shift();
  let el = document.getElementById('rfQBanner');
  if (!b) {
    showing = false;
    return;
  }
  showing = true;
  // the centre lane takes one banner at a time (a guardian's speaks first)
  if (laneBusy('rfQBanner')) { queue.unshift(b); setTimeout(next, 400); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'rfQBanner';
    el.className = 'rf rf-card';
    document.body.appendChild(el);
  }
  el.style.zoom = String(uiZoom());
  el.classList.toggle('done', b.kind !== 'start');
  // the giver waits on the card's details; the banner keeps the title, a line, the reward chips and how it pays
  el.innerHTML = `<div class="qb-k">${esc(b.head)}</div><div class="qb-t">${esc(b.title)}</div>${b.text ? `<div class="qb-x">${esc(b.text)}</div>` : ''}${b.reward && Object.keys(b.reward).length ? `<div class="qb-r">${chip.reward(b.reward)}</div>` : ''}${b.pay ? `<div class="qb-p">${esc(b.pay)}</div>` : ''}`;
  el.classList.remove('out');
  el.style.display = '';
  const life = b.text ? 6500 : 4500;
  setTimeout(() => el!.classList.add('out'), life);
  setTimeout(() => { el!.style.display = 'none'; next(); }, life + 500);
}

// ---------------------------------------------------------------- tracked quest

/** The tracked quest as its card shows it now. */
export interface TrackView {
  /** "Daily task", "Order of the crown". */
  kind: string;
  title: string;
  giver: string;
  goal: string;
  /** "30/60", '' when it has no count. */
  progress: string;
  /** 0..1, -1: no bar. */
  frac: number;
  where: string;
  reward: Record<string, number>;
  pay: string;
  /** Where its marker points in this region (null: elsewhere, or nothing to point at); `turnIn`: the label says so. */
  at: P | null;
  label: string;
  /** W-65 a story: its lines in the details fold (the backstory, the step's story). */
  story?: string[];
  /** The goal's verb icon (HTML); the quest's mark when left out. */
  icon?: string;
  /** W-65 a story's open choice: a button each (Tracked.act gets its id). */
  choices?: { id: string; label: string; text: string }[];
}
export interface Tracked { key: string; view: (me: P) => TrackView | null; /** A choice button pressed (W-65). */ act?: (id: string) => void }

const TKEY = 'pa.war.track';
let tracked: Tracked | null = null;
/** The tracked quest's key (also from an earlier visit, until its panel restores it). */
export const trackedKey = (): string | null => tracked?.key ?? (() => { try { return localStorage.getItem(TKEY); } catch { return null; } })();
/** Track a quest (null: none). */
export function track(t: Tracked | null): void {
  tracked = t;
  try { if (t) localStorage.setItem(TKEY, t.key); else localStorage.removeItem(TKEY); } catch { /* storage blocked: for this visit only */ }
}
/** A panel's quest, tracked on an earlier visit: track it again (once its panel knows it). */
export function restoreTrack(t: Tracked): void {
  if (!tracked && trackedKey() === t.key) tracked = t;
}
export const isTracked = (key: string) => tracked?.key === key;
/** The tracked quest itself (W-65: an encounter takes the card for a while, then gives it back). */
export const trackedNow = (): Tracked | null => tracked;

/** The tracked quest card (top right) and its marker. */
export function mountQuestTracker(s: SandboxScene, mk: Mk): void {
  style();
  const el = mk('rfQuest', 'display:none');
  el.classList.add('rf-card');
  const mark = questMarker('trk');
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.qt-x')) { track(null); last = ''; }
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (c && tracked?.act) { tracked.act(c.dataset.act!); last = ''; }
  });
  let last = '';
  const frame = () => {
    requestAnimationFrame(frame);
    const cur = s.sim.cur, me = ownCentre(cur, myTeam());
    const v = tracked && me ? tracked.view(me) : null;
    if (!v || !me || leftPanelOpen()) {
      el.style.display = mark.style.display = 'none';
      return;
    }
    // top right, under the corner buttons (./layout.ts; the guide holds the top left)
    el.style.display = '';
    const far = v.at ? metres(Math.hypot(v.at.x - me.x, v.at.y - me.y)) : '';
    placeMarker(s, mark, v.at, `${v.label}${far ? ` · ${far}` : ''}`);
    // on the screen's edge beside the guide's marker: a row lower, so both read
    for (const o of document.querySelectorAll<HTMLElement>('.gd-mk.on,.gd-mk.home')) {
      if (o.style.display === 'none' || mark.style.display === 'none' || !mark.classList.contains('edge')) continue;
      const dy = parseFloat(mark.style.top) - parseFloat(o.style.top);
      if (Math.abs(parseFloat(mark.style.left) - parseFloat(o.style.left)) < 170 && Math.abs(dy) < 30) mark.style.top = `${parseFloat(o.style.top) + (dy < 0 ? -32 : 32)}px`;
    }
    // a compact card (./qcard.ts): the goal with its verb, the bar, progress, reward and the way as chips; the title,
    // giver, story, where and pay behind (i) / hover
    const done = v.frac >= 1;
    const html = `<div class="qt-h">${icon('mk-claim')}<span class="qt-k">${esc(v.kind)}</span><button class="rf-tbtn x qt-x" title="Stop tracking">×</button></div>${qcard({
      key: `trk:${tracked!.key}`, icon: v.icon ?? icon('mk-claim'), goal: v.goal, ...(v.frac >= 0 ? { bar: v.frac } : {}),
      chips: chip.prog(v.progress, done) + chip.reward(v.reward) + chip.dist(far),
      more: details({ title: v.title, story: v.story, lines: [['Where', v.where], ['Pay', v.pay]], from: v.giver }),
      ...(v.choices?.length ? { extra: `<div class="qt-ch">${v.choices.map((c) => `<button class="rf-tbtn" data-act="${esc(c.id)}">${esc(c.label)}<i>${esc(c.text)}</i></button>`).join('')}</div>` } : {}),
    })}`;
    if (html !== last) el.innerHTML = last = html;
  };
  requestAnimationFrame(frame);
}

/** The nearest of `xs` to `me`. */
export const nearest = <T extends P>(xs: readonly T[], me: P): T | null =>
  xs.reduce<T | null>((a, p) => (!a || Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? p : a), null);
