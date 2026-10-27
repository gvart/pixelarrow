/**
 * W-62 the quest tracker of the guided first hour (rules and spots: ../../net/guide.ts). Top left: the chain in a card,
 * the open step in full (its hint, reward and how far its target is), the done ones ticked, the rest dim; − folds it to
 * the open step's one line (kept in localStorage; click the header to unfold), × hides the guide for good. It gives way
 * to a left panel (forge, market, roster, memorial). In the world a gold marker floats over the open step's target, or sits on the screen's edge pointing
 * at it when it is off screen; until the build step a quieter one points at the home town. A step done pays its reward
 * and tells it as a toast.
 *
 * Offline the page runs the done checks, pays into his stores and keeps progress in localStorage (wrapped: a blocked
 * store just forgets). Online the region server does all three (server/src/war/guide.ts: the reward into his home
 * strongroom, the save in the region's storage); the tracker shows its `guide` messages and × sends `guide hide`.
 * ../main.ts arms the guide (setGuide) for a world entry into a home region before the HUD mounts.
 */
import type { ServerMsg } from '../../net/protocol';
import type { WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { doneNow, GUIDE_STEPS, guideOpen, newWatch, watchEvents, type GuideSave, type GuideSpots, type GuideStepId } from '../../net/guide';
import { ownCentre } from '../entry';
import { myTeam } from '../side';
import { icon, leftPanelOpen, uiZoom } from './kit';
import { ghostIcon } from './souls';
import { sandboxRoster } from './roster/state';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

export interface GuideSetup {
  spots: GuideSpots;
  /** The home town's name (the edge marker). */
  town: string;
  /** Offline: the page runs the guide (checks, rewards, save); online the region server does. */
  offline: boolean;
}

let setup: GuideSetup | null = null;
/** ../main.ts: the guide for this page (null: none, e.g. a scenario). */
export const setGuide = (g: GuideSetup | null) => void (setup = g);

const KEY = 'pa.war.guide';
export const guideKey = (pid: number | null) => (pid === null ? `${KEY}.offline` : `${KEY}.p${pid}`);
export function loadGuide(key: string): GuideSave | null {
  try {
    const o = JSON.parse(localStorage.getItem(key) ?? 'null') as GuideSave | null;
    return o?.v === 1 && Array.isArray(o.done) ? o : null;
  } catch { return null; }
}
const saveGuide = (key: string, g: GuideSave) => { try { localStorage.setItem(key, JSON.stringify(g)); } catch { /* storage blocked: progress is forgotten */ } };
export { guideOpen };

const STEP_ICON: Record<GuideStepId, () => string> = {
  soul: () => ghostIcon('hoplite', 20),
  gather: () => icon('act-gather'),
  lair: () => icon('lair-bandit'),
  build: () => icon('bld-camp'),
  haul: () => icon('trade-chest'),
};
const TARGET: Record<GuideStepId, string> = { soul: 'Soul', gather: 'Wood', lair: 'Bandits', build: 'Camp', haul: 'Store' };

const CSS = `
#rfGuide{left:4px;top:4px;width:244px;z-index:3;pointer-events:auto;padding:5px 8px 7px}
#rfGuide .gd-h{display:flex;align-items:center;gap:6px;padding-bottom:4px;margin-bottom:3px;border-bottom:1px solid var(--rf-rule);cursor:pointer}
#rfGuide .gd-one{display:flex;align-items:center;gap:6px;font:700 12px/16px Inter,sans-serif;color:var(--rf-title)}
#rfGuide .gd-one .gd-far{font-weight:600}
#rfGuide .gd-h .rf-name{font-size:13px}
#rfGuide .gd-n{margin-left:auto;font:700 11px/1 Inter,sans-serif;color:var(--rf-gold)}
#rfGuide .gd-x,#rfGuide .gd-fold{width:18px;height:18px;min-width:18px;padding:0;font-size:12px}
#rfGuide ol{list-style:none;margin:0;padding:0}
#rfGuide li{display:flex;align-items:flex-start;gap:6px;padding:2px 0;color:var(--rf-disabled);font-size:12px;line-height:16px}
#rfGuide li .bx{flex:none;width:11px;height:11px;margin-top:2px;border:1px solid var(--rf-rule);background:var(--rf-sunk)}
#rfGuide li.ok{color:var(--rf-muted)}
#rfGuide li.ok .bx{border-color:#3f5a2c;background:#1d2a14;position:relative}
#rfGuide li.ok .bx:after{content:'';position:absolute;left:3px;top:0;width:3px;height:6px;border:solid var(--rf-good);border-width:0 2px 2px 0;transform:rotate(45deg)}
#rfGuide li.ok .t{text-decoration:line-through;text-decoration-color:rgba(187,165,140,.5)}
#rfGuide li.cur{color:var(--rf-ink);margin:2px -4px;padding:4px 4px 5px;background:var(--rf-sunk);box-shadow:inset 2px 0 0 var(--rf-gold)}
#rfGuide li.cur .ic{flex:none;margin-top:-1px}
#rfGuide li.cur .t{font:700 12px/16px Inter,sans-serif;color:var(--rf-title)}
#rfGuide .gd-hint{display:block;margin-top:1px;color:var(--rf-muted);font-size:12px;line-height:15px}
#rfGuide .gd-meta{display:flex;align-items:center;gap:6px;margin-top:4px}
#rfGuide .gd-rw{display:inline-flex;align-items:center;gap:2px;padding:1px 5px 1px 2px;border:1px solid #6a5326;background:#1c140c;color:var(--rf-gold);font:700 11px/14px Inter,sans-serif}
#rfGuide .gd-rw img{width:14px;height:14px}
#rfGuide .gd-far{margin-left:auto;color:var(--rf-muted);font-size:11px}
#rfGuide.flash li.cur{animation:gdFlash .9s ease-out}
@keyframes gdFlash{0%{background:#3d2a12}100%{background:var(--rf-sunk)}}
.gd-mk{position:fixed;z-index:2;pointer-events:none;transform:translate(-50%,-100%);display:none;flex-direction:column;align-items:center;font:700 13px/1 Inter,sans-serif;color:var(--rf-gold);text-shadow:0 1px 0 #0e0907,0 0 3px #0e0907;white-space:nowrap}
.gd-mk .lb{padding:4px 7px;background:rgba(14,9,7,.82);box-shadow:inset 0 0 0 1px #6a5326}
.gd-mk .ch{width:0;height:0;margin-top:3px;border:9px solid transparent;border-top:13px solid var(--rf-gold);border-bottom:0;filter:drop-shadow(0 1px 0 #0e0907)}
.gd-mk.on .ch{animation:gdBob 1.1s ease-in-out infinite}
.gd-mk.edge{transform:translate(-50%,-50%)}
.gd-mk .ar{display:none;position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;filter:drop-shadow(0 1px 0 #0e0907) drop-shadow(0 0 2px #0e0907)}
.gd-mk.edge .ch{display:none}.gd-mk.edge .ar{display:block}
.gd-mk.home{color:var(--rf-ink)}
.gd-mk.home .lb{box-shadow:inset 0 0 0 1px var(--rf-rule);color:var(--rf-muted)}
.gd-mk.home .ar{color:var(--rf-muted)}
.gd-mk .ar{color:var(--rf-gold)}
@keyframes gdBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
`;

/** Tiles to metres (1 tile = 2 m, W-18). */
const metres = (d: number) => `${Math.round(d * 2)} m`;

export function mountGuide(s: SandboxScene, mk: Mk): void {
  const g = setup;
  if (!g) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = mk('rfGuide', 'display:none');
  el.classList.add('rf-card');
  const marker = (cls: string) => {
    const m = document.createElement('div');
    m.className = `gd-mk ${cls}`;
    m.innerHTML = '<div class="lb"></div><div class="ch"></div><svg class="ar" viewBox="0 0 18 18"><path d="M2 3 L16 9 L2 15 L6 9 Z" fill="currentColor"/></svg>';
    document.body.appendChild(m);
    return m;
  };
  const mStep = marker('on'), mHome = marker('home');

  const team = myTeam(), watch = newWatch(team, g.spots.lair);
  // offline: the save in localStorage (key set on the first snapshot); online: the server's latest `guide` message
  let key: string | null = null, save: GuideSave | null = null;
  const steps = GUIDE_STEPS;

  /** A step done: told as a toast (with its reward), the tracker flashes. */
  const told = (id: GuideStepId, paid: boolean) => {
    const st = GUIDE_STEPS.find((x) => x.id === id)!;
    const reward = paid ? Object.entries(st.reward).map(([r, n]) => `+${n} ${r}`).join(', ') : '';
    sandboxRoster(s).onNote?.({ kind: 'levelUp', text: `${st.title}: done${reward ? ` (${reward})` : ''}` });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };
  const finish = (id: GuideStepId, paid: boolean) => {
    if (!save || save.done.includes(id)) return;
    save.done.push(id);
    saveGuide(key!, save);
    if (paid) for (const [r, n] of Object.entries(GUIDE_STEPS.find((x) => x.id === id)!.reward)) s.sim.addStock(team, r as never, n!);
    told(id, paid);
  };

  if (g.offline) {
    const prevEv = s.sim.onEvents;
    s.sim.onEvents = (ev: WarEvent[]) => { prevEv?.(ev); watchEvents(watch, s.sim.cur, ev); };
  } else {
    // online the server keeps the guide: its message is the save; `step` just done (paid into his strongroom, unless
    // it closed unpaid: a soul step with a full army)
    const prevSrv = s.sim.onServer;
    s.sim.onServer = (m: ServerMsg) => {
      prevSrv?.(m);
      if (m.t !== 'guide') return;
      save = { v: 1, done: m.done as GuideStepId[], ...(m.hidden ? { hidden: true } : {}) };
      if (m.step) told(m.step as GuideStepId, !!m.paid);
    };
  }
  // folded: the header and the open step's line only (this browser's choice, online and offline)
  const MIN_KEY = `${KEY}.min`;
  let folded = (() => { try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; } })();
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.gd-x')) {
      if (!save) return;
      save.hidden = true;
      if (g.offline) saveGuide(key!, save);
      else s.sim.guideHide();
      return;
    }
    if (!t.closest('.gd-h')) return;
    folded = !folded;
    try { localStorage.setItem(MIN_KEY, folded ? '1' : '0'); } catch { /* storage blocked: folded for this visit */ }
    last = '';
  });

  /** The open step's target now (tile point), null: nothing to point at. */
  const target = (id: GuideStepId, me: { x: number; y: number }): { x: number; y: number } | null => {
    const cur = s.sim.cur;
    const near = <T extends { x: number; y: number }>(xs: readonly T[]) => xs.reduce<T | null>((a, p) => (!a || Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? p : a), null);
    if (id === 'soul') return near(cur?.souls ?? []) ?? (g.offline ? g.spots.soul : null);
    if (id === 'gather') return near(s.sim.nodes.filter((n) => (n.res === 'wood' || n.res === 'stone') && n.amount > 0));
    if (id === 'lair') {
      const ls = (cur?.lairs ?? []).filter((l) => l.state !== 'cleared');
      const own = ls.find((l) => Math.hypot(l.x - g.spots.lair.x, l.y - g.spots.lair.y) < 0.5);
      if (own) { const q = cur?.squads.find((x) => x.id === own.squad), u = q && cur?.units.find((x) => x.id === q.units.find((id) => cur.units[id]?.state !== 'dead')); return u ? { x: u.x, y: u.y } : own; }
      return near(ls);
    }
    if (id === 'build') return g.spots.home;
    const stores = (cur?.buildings ?? []).filter((b) => b.team === team && b.state === 'done' && ['camp', 'storehouse', 'fort'].includes(b.type));
    return near(stores.map((b) => ({ x: b.x, y: b.y }))) ?? g.spots.home;
  };

  /** Place a marker over tile point p, or on the screen's edge towards it. */
  const place = (m: HTMLElement, p: { x: number; y: number } | null, label: string) => {
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
    // off screen (or under the HUD): on the edge of the open play area, along the line from its middle, the arrow
    // turned towards it
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = q.x - cx, dy = q.y - cy;
    const k = Math.min((x1 - cx) / Math.abs(dx || 1e-6), (y1 - cy) / Math.abs(dy || 1e-6)), at = { x: cx + dx * k, y: cy + dy * k };
    const tr = el.getBoundingClientRect(); // ... and below the tracker
    if (el.style.display !== 'none' && at.x < tr.right + 50 && at.y < tr.bottom + 20) at.y = tr.bottom + 24;
    m.classList.add('edge');
    m.style.left = `${at.x}px`;
    m.style.top = `${at.y}px`;
    lb.textContent = label;
    const a = Math.atan2(dy, dx), r = Math.hypot((lb.offsetWidth / 2) * Math.cos(a), 9 * Math.sin(a)) + 16; // just past the label's edge
    ar.style.transform = `rotate(${a}rad) translateX(${r}px)`;
  };

  let last = '', shown = false, closing = false;
  const frame = () => {
    requestAnimationFrame(frame);
    const cur = s.sim.cur;
    if (!cur) return;
    if (g.offline && !key) {
      key = guideKey(null);
      save = loadGuide(key) ?? { v: 1, done: [] };
    }
    if (!save) return; // online: no word from the server yet (or no guide for him here)
    const list = steps, open = list.filter((st) => !save!.done.includes(st.id));
    if (g.offline) for (const id of doneNow(watch, cur)) finish(id, true);
    const on = !save!.hidden && !leftPanelOpen() && (open.length > 0 || shown);
    if (!on) {
      el.style.display = mStep.style.display = mHome.style.display = 'none';
      return;
    }
    shown = true;
    el.style.display = '';
    const now = list.find((st) => !save!.done.includes(st.id)), me = ownCentre(cur, team) ?? g.spots.entry;
    const t = now ? target(now.id, me) : null, far = t ? Math.hypot(t.x - me.x, t.y - me.y) : 0;
    place(mStep, t, now ? `${now.id === 'build' ? g.town : TARGET[now.id]} · ${metres(far)}` : '');
    const towards = now && (now.id === 'soul' || now.id === 'gather' || now.id === 'lair');
    place(mHome, towards ? g.spots.home : null, `${g.town} · ${metres(Math.hypot(g.spots.home.x - me.x, g.spots.home.y - me.y))}`);
    // on screen the town speaks for itself; on the edge beside the step's marker it gives way
    const near = Math.hypot(parseFloat(mHome.style.left) - parseFloat(mStep.style.left), parseFloat(mHome.style.top) - parseFloat(mStep.style.top)) < 140;
    if (!mHome.classList.contains('edge') || (mStep.style.display !== 'none' && near)) mHome.style.display = 'none';
    const head = `<div class="gd-h" title="${folded ? 'Show all the steps' : 'Fold to the current step'}">${icon('mk-claim')}<span class="rf-name">The First Hour</span><span class="gd-n">${list.length - open.length}/${list.length}</span><button class="rf-tbtn gd-fold">${folded ? '+' : '−'}</button><button class="rf-tbtn x gd-x" title="Hide the guide for good">×</button></div>`;
    const html = folded
      ? `${head}${now ? `<div class="gd-one">${STEP_ICON[now.id]()}<span style="flex:1;min-width:0">${now.title}</span>${t ? `<span class="gd-far">${metres(far)}</span>` : ''}</div>` : ''}`
      : `${head}
      <ol>${list.map((st) => {
        if (save!.done.includes(st.id)) return `<li class="ok"><span class="bx"></span><span class="t">${st.title}</span></li>`;
        if (st !== now) return `<li><span class="bx"></span><span class="t">${st.title}</span></li>`;
        const rw = Object.entries(st.reward).map(([r, n]) => `<span class="gd-rw">${icon(`res-${r}`)}+${n}</span>`).join('');
        return `<li class="cur">${STEP_ICON[st.id]()}<div style="min-width:0;flex:1"><span class="t">${st.title}</span><span class="gd-hint">${st.hint}</span>
          <div class="gd-meta">${rw}${t ? `<span class="gd-far">${metres(far)} away</span>` : ''}</div></div></li>`;
      }).join('')}</ol>${now ? '' : '<div class="gd-hint" style="padding:4px 0 0">Your men know their way now. The war is yours.</div>'}`;
    if (html !== last) el.innerHTML = last = html;
    if (!now && !closing && (closing = true)) setTimeout(() => { if (save) { save.hidden = true; if (key) saveGuide(key, save); } }, 12000);
  };
  requestAnimationFrame(frame);
}
