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

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type P = { x: number; y: number };

const CSS = `
.gd-mk{position:fixed;z-index:2;pointer-events:none;transform:translate(-50%,-100%);display:none;flex-direction:column;align-items:center;font:700 13px/1 Inter,sans-serif;color:var(--rf-gold);text-shadow:0 1px 0 #0e0907,0 0 3px #0e0907;white-space:nowrap}
.gd-mk .lb{padding:4px 7px;background:rgba(14,9,7,.82);box-shadow:inset 0 0 0 1px #6a5326}
.gd-mk .ch{width:0;height:0;margin-top:3px;border:9px solid transparent;border-top:13px solid var(--rf-gold);border-bottom:0;filter:drop-shadow(0 1px 0 #0e0907)}
.gd-mk.on .ch,.gd-mk.trk .ch{animation:gdBob 1.1s ease-in-out infinite}
.gd-mk.edge{transform:translate(-50%,-50%)}
.gd-mk .ar{display:none;position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;filter:drop-shadow(0 1px 0 #0e0907) drop-shadow(0 0 2px #0e0907)}
.gd-mk.edge .ch{display:none}.gd-mk.edge .ar{display:block}
.gd-mk.home{color:var(--rf-ink)}
.gd-mk.home .lb{box-shadow:inset 0 0 0 1px var(--rf-rule);color:var(--rf-muted)}
.gd-mk.home .ar{color:var(--rf-muted)}
.gd-mk .ar{color:var(--rf-gold)}
.gd-mk.trk{color:#f3e2b8}.gd-mk.trk .lb{box-shadow:inset 0 0 0 1px #b38a3e;background:rgba(36,22,10,.88)}
.gd-mk.trk .ch{border-top-color:#f3e2b8}.gd-mk.trk .ar{color:#f3e2b8}
@keyframes gdBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
#rfQBanner{left:50%;top:44px;transform:translateX(-50%);z-index:6;pointer-events:none;width:340px;padding:7px 12px 9px;text-align:center;transition:opacity .45s,transform .45s}
#rfQBanner.out{opacity:0;transform:translateX(-50%) translateY(-6px)}
#rfQBanner .qb-k{font:700 10px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--rf-gold)}
#rfQBanner .qb-t{margin-top:4px;font:700 16px/1.15 Cinzel,serif;color:var(--rf-title)}
#rfQBanner .qb-g{margin-top:3px;font:italic 12px/1.3 Inter,sans-serif;color:var(--rf-muted)}
#rfQBanner .qb-x{margin-top:4px;font-size:12px;line-height:1.35;color:var(--rf-ink)}
#rfQBanner .qb-r{display:flex;justify-content:center;flex-wrap:wrap;gap:4px;margin-top:6px}
#rfQBanner .qb-r .gd-rw,#rfQuest .gd-rw{display:inline-flex;align-items:center;gap:2px;padding:1px 5px 1px 2px;border:1px solid #6a5326;background:#1c140c;color:var(--rf-gold);font:700 11px/14px Inter,sans-serif}
#rfQBanner .gd-rw img,#rfQuest .gd-rw img{width:14px;height:14px}
#rfQBanner .qb-p{margin-top:4px;font-size:11px;color:var(--rf-muted)}
#rfQBanner.done .qb-k{color:var(--rf-good)}
#rfQuest{right:4px;top:40px;width:244px;z-index:3;pointer-events:auto;padding:5px 8px 7px}
#rfQuest .qt-h{display:flex;align-items:center;gap:6px;padding-bottom:4px;margin-bottom:3px;border-bottom:1px solid var(--rf-rule)}
#rfQuest .qt-k{font:700 10px/1 Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--rf-gold)}
#rfQuest .qt-n{margin-left:auto;font:700 11px/1 Inter,sans-serif;color:var(--rf-gold)}
#rfQuest .qt-x{width:18px;height:18px;min-width:18px;padding:0;font-size:12px}
#rfQuest .qt-t{font:700 13px/1.2 Cinzel,serif;color:var(--rf-title)}
#rfQuest .qt-g{font:italic 11.5px/1.3 Inter,sans-serif;color:var(--rf-muted);margin-top:1px}
#rfQuest .qt-row{display:flex;gap:5px;margin-top:4px;font-size:12px;line-height:15px;color:var(--rf-ink)}
#rfQuest .qt-row b{flex:none;width:38px;font:700 10px/15px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--rf-muted)}
#rfQuest .qt-row span{min-width:0;flex:1}
#rfQuest .qt-pay{display:flex;flex-wrap:wrap;align-items:center;gap:3px}
#rfQuest .qt-pay i{font-style:normal;color:var(--rf-muted);font-size:11px;flex-basis:100%}
#rfQuest .rf-bar{width:100%;margin-top:4px}
#rfQuest .qt-s{margin-top:4px;font:italic 12px/15px Inter,sans-serif;color:var(--rf-ink);opacity:.9}
#rfQuest .qt-s+.qt-s{margin-top:3px}
#rfQuest .qt-ch{display:flex;flex-direction:column;gap:4px;margin-top:6px}
#rfQuest .qt-ch button{display:block;width:100%;height:auto;text-align:left;padding:4px 7px;font:700 12px/15px Inter,sans-serif;white-space:normal}
#rfQuest .qt-ch button i{display:block;font:400 11px/14px Inter,sans-serif;color:var(--rf-muted);font-style:normal}
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

const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'coin', 'silver']);
/** Reward chips: +n with the good's icon. */
export const rewardChips = (reward: Record<string, number>) =>
  Object.entries(reward).filter(([, n]) => n > 0).map(([r, n]) => `<span class="gd-rw">${ICONED.has(r) ? icon(`res-${r}`) : `${esc(r)} `}+${Math.round(n * 100) / 100}</span>`).join('');

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
 * turned at it). The edge spot keeps below the cards in `avoid` (the trackers top left).
 */
export function placeMarker(s: SandboxScene, m: HTMLElement, p: P | null, label: string, avoid: readonly HTMLElement[] = []): void {
  if (!p) return void (m.style.display = 'none');
  const cam = s.cameras.main, q = s.toScreen(p.x, p.y), W = cam.width, H = cam.height;
  // the open play area: clear of the minimap, buttons and command card (the HUD is zoomed with the UI scale)
  const z = uiZoom(), x0 = 90, x1 = W - 120 * z, y0 = 70, y1 = H - 225 * z;
  m.style.display = 'flex';
  const lb = m.querySelector<HTMLElement>('.lb')!, ar = m.querySelector<SVGElement>('.ar')!;
  if (q.x > x0 && q.y > y0 + 20 && q.x < x1 && q.y < y1 + 40) {
    m.classList.remove('edge');
    m.style.left = `${q.x}px`;
    m.style.top = `${q.y - 26}px`;
    lb.textContent = label.split(' · ')[0];
    return;
  }
  // off screen (or under the HUD): on the edge of the open play area, along the line from its middle
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = q.x - cx, dy = q.y - cy;
  const k = Math.min((x1 - cx) / Math.abs(dx || 1e-6), (y1 - cy) / Math.abs(dy || 1e-6)), at = { x: cx + dx * k, y: cy + dy * k };
  for (const el of avoid) {
    if (el.style.display === 'none') continue;
    const tr = el.getBoundingClientRect();
    if (at.x > tr.left - 50 && at.x < tr.right + 50 && at.y > tr.top - 20 && at.y < tr.bottom + 20) at.y = tr.bottom + 24;
  }
  m.classList.add('edge');
  m.style.left = `${at.x}px`;
  m.style.top = `${at.y}px`;
  lb.textContent = label;
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
let showing = false, seq = 0;
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
  if (!el) {
    el = document.createElement('div');
    el.id = 'rfQBanner';
    el.className = 'rf rf-card';
    document.body.appendChild(el);
  }
  el.style.zoom = String(uiZoom());
  el.classList.toggle('done', b.kind !== 'start');
  el.innerHTML = `<div class="qb-k">${esc(b.head)}</div><div class="qb-t">${esc(b.title)}</div>${b.giver ? `<div class="qb-g">${esc(b.giver)}</div>` : ''}${b.text ? `<div class="qb-x">${esc(b.text)}</div>` : ''}${b.reward && Object.keys(b.reward).length ? `<div class="qb-r">${rewardChips(b.reward)}</div>` : ''}${b.pay ? `<div class="qb-p">${esc(b.pay)}</div>` : ''}`;
  el.classList.remove('out');
  el.style.display = '';
  // just below the small notices at the top centre (./roster/toast.ts), never over them
  const z = Number(el.style.zoom) || 1, my = ++seq, below = () => {
    if (my !== seq || el!.style.display === 'none') return;
    const t = document.getElementById('rrToasts'), bottom = t && t.children.length ? t.getBoundingClientRect().bottom : 0;
    el!.style.top = `${Math.max(44, Math.round(bottom / z) + 6)}px`;
    requestAnimationFrame(below);
  };
  below();
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
  /** W-65 a story: its lines in italics under the title (the backstory, the step's story). */
  story?: string[];
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
    // top right, under the corner buttons (the guide holds the top left)
    const g = document.getElementById('rfGuide'), corner = document.getElementById('rfDev'), z = Number(el.style.zoom) || 1;
    el.style.top = `${corner ? Math.round(corner.getBoundingClientRect().bottom / z) + 6 : 40}px`;
    el.style.display = '';
    const far = v.at ? metres(Math.hypot(v.at.x - me.x, v.at.y - me.y)) : '';
    placeMarker(s, mark, v.at, `${v.label}${far ? ` · ${far}` : ''}`, [el, ...(g ? [g] : [])]);
    // on the screen's edge beside the guide's marker: a row lower, so both read
    for (const o of document.querySelectorAll<HTMLElement>('.gd-mk.on,.gd-mk.home')) {
      if (o.style.display === 'none' || mark.style.display === 'none' || !mark.classList.contains('edge')) continue;
      const dy = parseFloat(mark.style.top) - parseFloat(o.style.top);
      if (Math.abs(parseFloat(mark.style.left) - parseFloat(o.style.left)) < 170 && Math.abs(dy) < 30) mark.style.top = `${parseFloat(o.style.top) + (dy < 0 ? -32 : 32)}px`;
    }
    const html = `<div class="qt-h">${icon('mk-claim')}<span class="qt-k">${esc(v.kind)}</span><span class="qt-n">${esc(v.progress)}</span><button class="rf-tbtn x qt-x" title="Stop tracking">×</button></div>
      <div class="qt-t">${esc(v.title)}</div><div class="qt-g">${esc(v.giver)}</div>${(v.story ?? []).map((l) => `<div class="qt-s">“${esc(l)}”</div>`).join('')}
      ${v.frac >= 0 ? `<div class="rf-bar"><i class="${v.frac >= 1 ? 'ok' : 'construction'}" style="width:${(Math.min(1, v.frac) * 100).toFixed(1)}%"></i></div>` : ''}
      <div class="qt-row"><b>Goal</b><span>${esc(v.goal)}</span></div>
      <div class="qt-row"><b>Where</b><span>${esc(v.where)}${far ? ` <span class="rf-dim">(${far})</span>` : ''}</span></div>
      <div class="qt-row"><b>Pay</b><span class="qt-pay">${rewardChips(v.reward)}<i>${esc(v.pay)}</i></span></div>${v.choices?.length ? `<div class="qt-ch">${v.choices.map((c) => `<button class="rf-tbtn" data-act="${esc(c.id)}">${esc(c.label)}<i>${esc(c.text)}</i></button>`).join('')}</div>` : ''}`;
    if (html !== last) el.innerHTML = last = html;
  };
  requestAnimationFrame(frame);
}

/** The nearest of `xs` to `me`. */
export const nearest = <T extends P>(xs: readonly T[], me: P): T | null =>
  xs.reduce<T | null>((a, p) => (!a || Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? p : a), null);
