/**
 * Mounts the soldier views (M5g) on the HUD (../hud.ts hands its element maker, so the UI scale applies):
 *
 *   left, under the band   the roster panel (R, or the roster button bottom right beside the hammer)
 *   right of the panel     the soldier card of the picked row (Esc closes the card, then the panel)
 *   top centre             toasts: level-ups, captures, the fallen (click: the card)
 *   on the map             veteran / elite pips under the selected men (./markers.ts)
 *
 * Panel and card re-render at 4 Hz while open, only when their HTML changed (so hover and scroll hold).
 */
import type { SandboxScene } from '../../SandboxScene';
import { icon } from '../kit';
import { cardHtml, CARD_W } from './card';
import { markers } from './markers';
import { FILTERS, panelHtml, PANEL_W, SORTS, type Filter, type Sort } from './panel';
import { portrait, PORTRAIT_H, PORTRAIT_W } from './portrait';
import { sandboxRoster } from './state';
import { toaster } from './toast';
import { loadItemAtlas, ROSTER_CSS, tipper } from './ui';
import { sandboxCraft } from '../craft/state';
import type { Slot } from '../../../../data/items';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

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
  const toasts = mk('rrToasts', 'top:50px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none');
  const tip = mk('rrTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const btnBox = mk('rrBtn', 'right:38px;bottom:4px;pointer-events:auto');
  const btn = document.createElement('button');
  btn.className = 'rf-btn';
  btn.id = 'cRoster';
  btn.innerHTML = icon('unit-hoplite') + '<span class="key">R</span>';
  btn.dataset.tip = '<div class="rf-name" style="margin-bottom:3px">Roster</div>your soldiers by squad <b class="k">R</b>';
  btnBox.appendChild(btn);

  let filter: Filter = 'all', sort: Sort = 'level', sel: string | null = null, open = false;
  let lastP = '', lastC = '';
  const unTip = [tipper(panel, tip), tipper(card, tip), tipper(btnBox, tip)];

  const render = () => {
    btn.classList.toggle('on', open);
    panel.style.display = open ? '' : 'none';
    const row = sel ? R.rows().find((r) => r.p.id === sel) : undefined;
    card.style.display = row ? '' : 'none';
    card.style.left = open ? `${PANEL_W + 8}px` : '4px';
    if (open) {
      // above the minimap (bottom left, about 190 art px) and below the band
      const z = Number(panel.style.zoom) || 1, listH = Math.max(120, Math.min(420, Math.floor(innerHeight / z) - 50 - 200 - 72));
      const html = panelHtml(R, filter, sort, sel, listH);
      if (html !== lastP) {
        const list = panel.querySelector<HTMLElement>('[style*="overflow-y"]'), top = list?.scrollTop ?? 0;
        panel.innerHTML = lastP = html;
        const l2 = panel.querySelector<HTMLElement>('[style*="overflow-y"]');
        if (l2) l2.scrollTop = top;
      }
    }
    if (row) {
      const html = cardHtml(R, row, C);
      if (html !== lastC) {
        card.innerHTML = lastC = html;
        const c = card.querySelector<HTMLCanvasElement>('#rrPort'), img = portrait(s, row.p.hero.cls ?? 'militia');
        if (c && img) {
          const g = c.getContext('2d')!;
          g.imageSmoothingEnabled = false;
          g.drawImage(img, 0, 0, PORTRAIT_W * 2, PORTRAIT_H * 2);
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
    if (f) filter = (FILTERS.find(([x]) => x === f.dataset.filter)?.[0] ?? 'all');
    else if (so) sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length];
    else if (a?.dataset.act === 'close') open = false;
    else if (a?.dataset.act === 'xpAll') {
      for (const x of R.rows()) if (x.where === 'field' || x.where === 'reserve') R.devXp(x.p.id);
    } else if (a?.dataset.act === 'endFight') R.endFight();
    else if (r) sel = sel === r.dataset.pid ? null : r.dataset.pid!;
    render();
  });
  card.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>('[data-act]'), o = t.closest<HTMLElement>('[data-offer]');
    const eq = t.closest<HTMLElement>('[data-equip]'), uneq = t.closest<HTMLElement>('[data-unequip]');
    if (!sel) return;
    if (eq) void C.equip(sel, eq.dataset.equip!).then(render);
    else if (uneq) void C.unequip(sel, uneq.dataset.unequip as Slot).then(render);
    else if (a?.dataset.act === 'tree') hooks.tree?.(sel);
    else if (a?.dataset.act === 'closeCard') sel = null;
    else if (a?.dataset.act === 'xp') R.devXp(sel);
    else if (o) {
      const offer = R.offers(sel)[Number(o.dataset.offer)];
      if (offer) R.choose(sel, offer);
    }
    render();
  });
  for (const el of [panel, card]) el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (s.build.active || s.build.tool) return; // R rotates and Esc closes in build mode
    if (e.key.toLowerCase() === 'r') toggle();
    else if (e.key === 'Escape' && (sel || open)) { if (sel) sel = null; else open = false; render(); }
  });

  R.onNote = toaster(toasts, (pid) => { open = true; show(pid); });
  R.onChange = render;
  markers(s);
  void loadItemAtlas().then(() => { lastP = lastC = ''; render(); });
  setInterval(() => { if (open || sel) render(); }, 250);
  render();
  // scripts (scripts/war, Playwright): open the panel or a card
  (window as unknown as { __roster: unknown }).__roster = { R, C, open: (v = true) => { open = v; render(); }, card: show };
  return hooks;
}
