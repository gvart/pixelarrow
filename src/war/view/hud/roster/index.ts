/**
 * Mounts the soldier views (M5g) on the HUD (../hud.ts hands its element maker, so the UI scale applies):
 *
 *   left, under the band   the roster panel (R, or the roster button bottom right beside the hammer)
 *   right of the panel     the soldier card of the picked row (Esc closes the card, then the panel)
 *   top centre             toasts: level-ups, captures, the fallen (click: the card); right of the card when it is under them
 *   on the map             veteran / elite pips under the selected men (./markers.ts)
 *   E3                     the home memorial: graves and trophies by the town's statues, its panel (./memorial.ts)
 *   W-53                   a click on a field row selects that man in the world too, on a squad's heading its men
 *                          (shift adds); the selected men's rows carry a gold edge
 *   W-68                   the captives he holds at the panel's foot (Ask to join, Release); Dismiss on the card asks
 *                          in the card (Dismiss / Keep), then his soul rises where he stood (../../soulRise.ts)
 *
 * Panel and card re-render at 4 Hz while open, only when their HTML changed (so hover and scroll hold).
 */
import type { SandboxScene } from '../../SandboxScene';
import { draggable } from '../drag';
import { icon } from '../kit';
import { cardHtml, CARD_W } from './card';
import { markers } from './markers';
import { mountMemorial } from './memorial';
import { FILTERS, panelHtml, PANEL_W, SORTS, type Filter, type Sort } from './panel';
import { portrait, PORTRAIT_H, PORTRAIT_W, scarMarks } from './portrait';
import { sandboxRoster } from './state';
import { toaster } from './toast';
import { loadItemAtlas, ROSTER_CSS, tipper } from './ui';
import { loadGlyphs } from '../glyph';
import { sandboxCraft } from '../craft/state';
import { tipHtml } from '../theme';
import type { Slot } from '../../../../data/items';
import { keys } from '../../../input/keys';
import { mountSoulRise, soulRise } from '../../soulRise';
import { secretNotices } from '../../secretNotice';
import { mountMastery } from '../mastery';
import { foodNote, foodWarnings, type FoodMemo } from '../foodWatch';
import { fieldNotes } from '../fieldNotes';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
/** The dev panel (F1, ../hud.ts) is open: the cards show their dev buttons. */
const devOn = () => { const d = document.getElementById('dev'); return !!d && d.style.display !== 'none'; };

/** What the craft views (../craft) hook into: open a civilian's tree (pid), re-render, show a card. */
export interface RosterHooks { tree: ((pid: string) => void) | null; render: () => void; card: (pid: string | null) => void; selected: () => string | null }

export function mountRoster(s: SandboxScene, mk: Mk): RosterHooks {
  const R = sandboxRoster(s), C = sandboxCraft(s, R);
  const hooks: RosterHooks = { tree: null, render: () => render(), card: (pid) => show(pid), selected: () => sel };
  const style = document.createElement('style');
  style.textContent = ROSTER_CSS;
  document.head.appendChild(style);

  const panel = mk('rrPanel', `top:50px;left:4px;width:${PANEL_W}px;display:none;pointer-events:auto`);
  const card = mk('rrCard', `top:50px;left:${PANEL_W + 8}px;width:${CARD_W}px;display:none;pointer-events:auto`);
  draggable(panel);
  draggable(card);
  const toasts = mk('rrToasts', 'top:50px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none');
  const tip = mk('rrTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const btnBox = mk('rrBtn', 'right:38px;bottom:4px;pointer-events:auto');
  const btn = document.createElement('button');
  btn.className = 'rf-btn';
  btn.id = 'cRoster';
  btn.innerHTML = icon('unit-hoplite') + '<span class="key">R</span>';
  btn.dataset.tip = tipHtml('Roster', 'your soldiers by squad', 'R');
  btnBox.appendChild(btn);

  let filter: Filter = 'all', sort: Sort = 'level', sel: string | null = null, open = false;
  let lastP = '', lastC = '';
  /** W-68: the man whose dismissal waits on the card's confirm. */
  let dismissing: string | null = null;
  mountSoulRise(s);
  const unTip = [tipper(panel, tip), tipper(card, tip), tipper(btnBox, tip)];

  const render = () => {
    btn.classList.toggle('on', open);
    panel.style.display = open ? '' : 'none';
    const row = sel ? R.rows().find((r) => r.p.id === sel) : undefined;
    card.style.display = row ? '' : 'none';
    if (!card.dataset.moved) card.style.left = open ? `${PANEL_W + 8}px` : '4px';
    if (open) {
      // above the minimap (bottom left, about 190 art px) and below the band
      const z = Number(panel.style.zoom) || 1, listH = Math.max(120, Math.min(420, Math.floor(innerHeight / z) - 50 - 200 - 96));
      const html = panelHtml(R, filter, sort, sel, listH, devOn(), s.sel.units);
      if (html !== lastP) {
        const list = panel.querySelector<HTMLElement>('.rr-list'), top = list?.scrollTop ?? 0;
        panel.innerHTML = lastP = html;
        const l2 = panel.querySelector<HTMLElement>('.rr-list');
        if (l2) l2.scrollTop = top;
      }
    }
    if (row) {
      if (dismissing !== row.p.id) dismissing = null;
      const html = cardHtml(R, row, C, devOn(), dismissing === row.p.id);
      if (html !== lastC) {
        card.innerHTML = lastC = html;
        const c = card.querySelector<HTMLCanvasElement>('#rrPort'), img = portrait(s, row.p.hero.cls ?? 'militia');
        if (c && img) {
          const g = c.getContext('2d')!;
          g.imageSmoothingEnabled = false;
          g.drawImage(img, 0, 0, PORTRAIT_W * 2, PORTRAIT_H * 2);
          scarMarks(g, row.p.scars ?? 0);
        } else lastC = ''; // the sheet is not in yet: try again
      }
    }
    for (const f of unTip) f();
  };
  const show = (pid: string | null) => { sel = pid; render(); };
  const toggle = () => { open = !open; render(); };

  btn.onclick = toggle;
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const f = t.closest<HTMLElement>('[data-filter]'), a = t.closest<HTMLElement>('[data-act]'), so = t.closest<HTMLElement>('[data-sort]'), r = t.closest<HTMLElement>('[data-pid]');
    const sq = t.closest<HTMLElement>('[data-squad]'), cap = t.closest<HTMLElement>('[data-capact]');
    if (cap) { if (!(cap as HTMLButtonElement).disabled) void R.captive(cap.dataset.cap!, cap.dataset.capact as 'join' | 'release').then(render); return; }
    if (t.closest('[data-capid]')) return;
    if (sq) s.sel.set(s.drawn.filter((d) => d.u.squad === Number(sq.dataset.squad) && d.u.state !== 'dead').map((d) => d.u.id), e.shiftKey); // W-53: a squad's men
    else if (f) filter = (FILTERS.find(([x]) => x === f.dataset.filter)?.[0] ?? 'all');
    else if (so) sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length];
    else if (a?.dataset.act === 'close') open = false;
    else if (a?.dataset.act === 'xpAll') {
      for (const x of R.rows()) if (x.where === 'field' || x.where === 'away') R.devXp(x.p.id);
    } else if (a?.dataset.act === 'endFight') R.endFight();
    else if (r) {
      // W-53: a man in the field is selected in the world too (shift adds or drops him)
      const u = R.rows().find((x) => x.p.id === r.dataset.pid)?.unit;
      if (u && u.state !== 'dead') {
        if (e.shiftKey && s.sel.units.has(u.id)) { s.sel.units.delete(u.id); s.sel.set([], true); } else s.sel.set([u.id], e.shiftKey);
      }
      sel = sel === r.dataset.pid && !e.shiftKey ? null : r.dataset.pid!;
    }
    render();
  });
  card.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>('[data-act]');
    const eq = t.closest<HTMLElement>('[data-equip]'), uneq = t.closest<HTMLElement>('[data-unequip]');
    if (!sel) return;
    if (eq) void C.equip(sel, eq.dataset.equip!).then(render);
    else if (uneq) void C.unequip(sel, uneq.dataset.unequip as Slot).then(render);
    else if (a?.dataset.act === 'tree') hooks.tree?.(sel);
    else if (a?.dataset.act === 'closeCard') sel = null;
    else if (a?.dataset.act === 'xp') R.devXp(sel);
    else if (a?.dataset.act === 'dismiss') dismissing = sel;
    else if (a?.dataset.act === 'dismissNo') dismissing = null;
    else if (a?.dataset.act === 'dismissYes') {
      const pid = sel;
      dismissing = sel = null;
      void R.dismiss(pid, (cls, x, y, id) => soulRise(s, cls, x, y, id)).then(render);
    }
    render();
  });
  for (const el of [panel, card]) el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  addEventListener('keydown', (e: KeyboardEvent) => {
    if (s.build.active || s.build.tool) return; // R rotates and Esc closes in build mode
    const a = keys.act(e);
    if (a === 'panel.roster') toggle();
    else if (a === 'back' && (sel || open)) { if (sel) sel = null; else open = false; render(); }
  });

  R.onNote = toaster(toasts, (pid) => { open = true; show(pid); });
  secretNotices(s, (n) => R.onNote?.(n)); // world-fill: hidden quests and slain chiefs as notes
  fieldNotes(s, (n) => R.onNote?.(n), () => R.rows()); // W-79 a man back on his feet, W-72 a raid beaten (../fieldNotes.ts)
  mountMastery(s, (n) => R.onNote?.(n)); // W-73: the region mastery chip and its toast
  // W-79: food low in a squad's packs, or its men going hungry (../foodWatch.ts)
  const food: FoodMemo = new Map();
  setInterval(() => {
    const cur = s.sim.cur, me = s.sim.playerId;
    if (cur) for (const w of foodWarnings(cur, me !== null ? `p:${me}` : 'you', food)) R.onNote?.(foodNote(w));
  }, 1000);
  R.onChange = render;
  markers(s);
  mountMemorial(s, mk, R); // E3: the home memorial (graves, trophies) and its panel
  void Promise.all([loadItemAtlas(), loadGlyphs()]).then(() => { lastP = lastC = ''; render(); });
  setInterval(() => { if (open || sel) render(); }, 250);
  render();
  // scripts (scripts/war, Playwright): open the panel or a card
  (window as unknown as { __roster: unknown }).__roster = { R, C, open: (v = true) => { open = v; render(); }, card: show };
  return hooks;
}
