/**
 * M6k trade on the HUD (docs/WAR.md "Trade"; orders: ../trade/tradeControls.ts):
 *
 *   right, under the corner   the holder panel of the picked cart or pile (a click on it) or the selected chest or store:
 *                             owner, fill, a pile's decay, every good with load / unload by the selected squads, the
 *                             items (rarity colour, quality), salvage for a smith, and "move to" the other holders within
 *                             reach of it (load here, then unload there)
 *   at the cursor             the hover card of any cart, pile, chest or store: what it holds at a glance
 *   command card              Load / Unload / Escort / Salvage on the nearest holder (../hud.ts slots())
 */
import type { HoldItem, ResourceKind, SquadId } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { holderKey, itemName, type Holder } from '../trade/tradeControls';
import { bar, fitHeight, icon } from './kit';
import { rarityHex } from './roster/ui';
import { draggable } from './drag';
import { myTeam } from '../side';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
const W = 236;
/** Under the corner buttons (World, DEV, scale). */
const TOP = 92;
/** Other holders this close to the panel's one are offered as "move to". */
const NEAR = 10;
const Q = ['crude', '', 'masterwork'];
const HOLDER_ICON: Record<string, string> = { handcart: 'trade-cart', wagon: 'trade-wagon', pile: 'trade-pile', chest: 'trade-chest', store: 'bld-storehouse' };
const iconOf = (h: Holder) => HOLDER_ICON[h.kind === 'cart' ? h.name : h.kind];
const fmt = (n: number) => (n >= 10 ? String(Math.floor(n)) : n >= 1 ? n.toFixed(1).replace(/\.0$/, '') : n > 0.05 ? n.toFixed(1) : '0');
const mmss = (ticks: number) => { const s = Math.max(0, Math.round(ticks / 10)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const whose = (h: Holder) => (h.kind === 'pile' ? 'anyone\'s: first hands win' : h.kind === 'store' ? (h.team === myTeam() ? 'your network' : 'enemy store') : h.owner === 'you' ? 'yours' : h.team === myTeam() ? `${h.owner}'s` : 'enemy');
const goodsOf = (h: Holder) => (Object.entries(h.goods) as [ResourceKind, number][]).filter(([, n]) => n > 0.05).sort((a, b) => b[1] - a[1]);

/** Items alike (def, quality, rarity) as one row with a count; the first's uid stands for them (salvage). */
function grouped(list: HoldItem[]): { it: HoldItem; n: number }[] {
  const out: { it: HoldItem; n: number }[] = [];
  for (const it of list) {
    const g = out.find((x) => x.it.def === it.def && x.it.q === it.q && x.it.rarity === it.rarity);
    if (g) g.n++;
    else out.push({ it, n: 1 });
  }
  return out;
}
const itemLine = (it: HoldItem, n: number) => `<span style="color:${rarityHex(it.rarity)}">${itemName(it)}</span>${n > 1 ? ` <b class="rf-num">×${n}</b>` : ''}${it.q !== undefined && Q[it.q] ? ` <span class="rf-dim">${Q[it.q]}</span>` : ''}`;

/** What a holder holds as a compact HTML block (the hover card and the panel's head). */
export function holderSummary(h: Holder): string {
  const g = goodsOf(h);
  const goods = g.map(([r, n]) => `<span style="display:inline-flex;align-items:center;gap:2px;margin:0 6px 2px 0">${icon('res-' + r)}<span class="rf-num">${fmt(n)}</span></span>`).join('');
  const items = grouped(h.list).map(({ it, n }) => `<div>${itemLine(it, n)}</div>`).join('');
  const more = h.items > h.list.length ? `<div class="rf-dim">+${h.items - h.list.length} more</div>` : '';
  const fill = h.cap !== undefined && h.loads !== undefined ? `<div class="rf-dim" style="margin-top:2px">${fmt(h.loads)} / ${h.cap} loads${h.left !== undefined ? ` · gone in ${mmss(h.left)}` : ''}</div>` : '';
  return `<div style="display:flex;flex-wrap:wrap;max-width:${W - 16}px">${goods || (h.items ? '' : '<span class="rf-dim">empty</span>')}</div>${items}${more}${fill}`;
}

export interface TradeHud { slots(own: SquadId[]): HTMLElement[]; refresh(): void }

export function mountTrade(s: SandboxScene, mk: Mk, btn: (id: string, ic: string, tip: string | (() => string), key: string, run: () => void) => HTMLButtonElement, tipK: (name: string, what: string, key: string) => string): TradeHud {
  const T = s.trade;
  const panel = mk('rfHolder', `top:${TOP}px;right:4px;width:${W}px;display:none;pointer-events:auto;padding:4px 8px 8px`);
  panel.classList.add('rf-card');
  draggable(panel, '.rf-head');
  const hover = mk('rfHoldTip', 'display:none;z-index:6');
  hover.className = 'rf rf-tip';
  let html = '', shown = '';

  // ---------- command card: nearest holder within reach ----------
  const own = () => s.siege.own();
  const nearTake = () => T.nearest(own(), (h) => T.canTake(h) && T.hasAny(h) && !(h.kind === 'cart' && own().some((q) => s.siege.engineOf(q)?.id === h.id)));
  const nearPut = () => T.nearest(own(), (h) => T.canPut(h) && (h.cap === undefined || (h.loads ?? 0) < h.cap));
  const nearCart = () => T.nearest(own(), (h) => h.kind === 'cart' && h.team === myTeam());
  const nearSalvage = () => T.nearest(own(), (h) => h.kind === 'pile' && h.list.length > 0);
  const bLoad = btn('tLoad', 'act-load', () => { const h = nearTake(); return tipK('Load', h ? `from the nearest ${h.name}: a load a man every 2 s` : 'no pile, chest, store or cart of yours within reach', 'E on it'); }, '', () => { const h = nearTake(); if (h) T.load(own(), h); });
  const bUnload = btn('tUnload', 'act-unload', () => { const h = nearPut(); return tipK('Unload', h ? `into the nearest ${h.name}` : 'no chest, store or cart of yours within reach', 'E on it'); }, '', () => { const h = nearPut(); if (h) T.unload(own(), h); });
  const bEscort = btn('tEscort', 'act-escort', () => { const h = nearCart(); return tipK('Escort', h ? `keep round the ${h.name}, take on foes within 12 tiles of it` : 'no cart of yours within reach', 'E on it'); }, '', () => { const h = nearCart(); if (h) T.escort(own(), h); });
  const bSalvage = btn('tSalvage', 'act-build', () => { const h = nearSalvage(); return tipK('Salvage', h ? `break up ${itemName(h.list[0])} in the pile for its goods (30 s)` : 'no pile with gear within reach', ''); }, '', () => { const h = nearSalvage(); if (h) T.salvage(own(), h, h.list[0]); });

  const slots = (q: SquadId[]): HTMLElement[] => {
    const civ = q.some((x) => s.drawn.some((d) => d.u.squad === x && d.u.cls.startsWith('civ_')));
    const smith = q.some((x) => s.drawn.some((d) => d.u.squad === x && d.u.cls === 'civ_smith'));
    const laden = T.laden(q), take = nearTake(), put = laden ? nearPut() : null, cart = civ ? null : nearCart(), salv = smith ? nearSalvage() : null;
    const out: HTMLElement[] = [];
    if (take) out.push(bLoad);
    if (put) out.push(bUnload);
    if (cart) out.push(bEscort);
    if (salv) out.push(bSalvage);
    bEscort.classList.toggle('on', s.sim.squads.get(q[0])?.order === 'escort');
    bLoad.classList.toggle('on', s.sim.squads.get(q[0])?.order === 'load');
    bUnload.classList.toggle('on', s.sim.squads.get(q[0])?.order === 'unload');
    return out;
  };

  // ---------- the panel ----------
  const current = (): Holder | null => {
    if (T.selected) { const h = T.get(T.selected); if (!h) T.selected = null; return h; }
    const b = s.build.selectedBuilding();
    return b ? T.get({ building: b.id }) : null;
  };
  panel.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const h = current();
    if (!el || !h) return;
    const q = own(), a = el.dataset.act!, r = el.dataset.r as ResourceKind | undefined;
    if (a === 'close') { T.selected = null; s.build.selectAt({ x: -1, y: -1 }); }
    else if (!q.length) T.status = 'select a squad first';
    else if (a === 'load') T.load(q, h, r);
    else if (a === 'unload') T.unload(q, h, r);
    else if (a === 'escort') T.escort(q, h);
    else if (a === 'salvage') { const it = h.list.find((x) => x.uid === el.dataset.uid); if (it) T.salvage(q, h, it); }
    else if (a === 'to') { const to = T.holders().find((x) => holderKey(x.ref) === el.dataset.to); if (to) T.transfer(q, h, to, r); }
    refresh();
  });

  const render = (h: Holder): string => {
    const q = own(), sel = q.length > 0, take = sel && T.canTake(h), put = sel && T.canPut(h), laden = sel && T.laden(q);
    const smith = q.some((x) => s.drawn.some((d) => d.u.squad === x && d.u.cls === 'civ_smith'));
    const fill = h.cap !== undefined && h.loads !== undefined ? bar('ok', h.loads / (h.cap || 1), W - 16) : '';
    const b = (act: string, label: string, ok: boolean, extra = '', title = '') => `<button class="rf-tbtn" data-act="${act}" ${extra} ${ok ? '' : 'disabled'} title="${title}" style="height:20px;padding:0 5px;font-size:11px">${label}</button>`;
    const rows = goodsOf(h).map(([r, n]) => `<div class="rf-row" style="display:flex;align-items:center;gap:4px;padding:1px 2px">${icon('res-' + r)}<span style="flex:1">${r}</span><span class="rf-num" style="width:34px;text-align:right">${fmt(n)}</span>${b('load', '▼', take, `data-r="${r}"`, `load ${r}`)}${b('unload', '▲', put && laden, `data-r="${r}"`, `unload ${r}`)}</div>`).join('');
    const items = grouped(h.list).map(({ it, n }) => `<div class="rf-row" style="display:flex;align-items:center;gap:4px;padding:1px 2px"><span style="flex:1">${itemLine(it, n)}</span>${h.kind === 'pile' ? b('salvage', 'salvage', smith, `data-uid="${it.uid}"`, smith ? 'a smith breaks it up for goods (30 s)' : 'needs a smith squad selected') : ''}</div>`).join('');
    const more = h.items > h.list.length ? `<div class="rf-dim" style="padding:1px 2px">+${h.items - h.list.length} more items</div>` : '';
    const near = T.holders().filter((x) => holderKey(x.ref) !== holderKey(h.ref) && T.canPut(x) && Math.hypot(x.x - h.x, x.y - h.y) <= NEAR);
    const to = take && T.hasAny(h) && near.length ? `<div class="rf-cap" style="margin-top:6px">Move to <span class="rf-dim">(load here, unload there)</span></div><div style="display:flex;flex-wrap:wrap;gap:2px">${near.map((x) => `<button class="rf-tbtn" data-act="to" data-to="${holderKey(x.ref)}" style="height:22px;font-size:11px">${icon(iconOf(x))}${x.name}${x.cap !== undefined && x.loads !== undefined ? ` ${fmt(x.loads)}/${x.cap}` : ''}</button>`).join('')}</div>` : '';
    const acts = sel ? `<div style="display:flex;gap:3px;margin-top:6px;flex-wrap:wrap">${b('load', 'Load all', take && T.hasAny(h))}${b('unload', 'Unload all', put && laden)}${h.kind === 'cart' && h.team === myTeam() ? b('escort', 'Escort', true) : ''}</div>` : `<div class="rf-dim" style="margin-top:6px">select a squad to load or unload</div>`;
    const status = T.status ? `<div class="rf-dim" style="margin-top:4px">${T.status}</div>` : '';
    return `<div class="rf-head">${icon(iconOf(h), 32)}<div style="flex:1;min-width:0"><div class="rf-name">${h.name[0].toUpperCase() + h.name.slice(1)}</div><div class="rf-dim">${whose(h)}</div></div><button class="rf-tbtn x" data-act="close" title="close">×</button></div>
      <div style="margin:5px 0 3px">${fill}${h.cap !== undefined && h.loads !== undefined ? `<div class="rf-dim" style="margin-top:2px">${fmt(h.loads)} / ${h.cap} loads${h.left !== undefined ? ` · gone in ${mmss(h.left)}` : ''}</div>` : ''}</div>
      ${rows ? `<div class="rf-cap">Goods</div>${rows}` : ''}${items || more ? `<div class="rf-cap" style="margin-top:4px">Items</div>${items}${more}` : ''}${!rows && !items ? '<div class="rf-dim">empty</div>' : ''}${acts}${to}${status}`;
  };

  const refresh = () => {
    T.tick();
    const h = current();
    if (!h || (h.kind === 'store' && s.build.selectedBuilding()?.team !== myTeam() && !T.selected)) {
      if (panel.style.display !== 'none') panel.style.display = 'none';
      html = '';
    } else {
      const next = render(h);
      if (next !== html) { html = next; panel.innerHTML = next; }
      panel.style.display = '';
      fitHeight(panel);
    }
  };

  // ---------- the hover card ----------
  s.events.on('postupdate', () => {
    const p = s.input.activePointer;
    const h = s.input.isOver && !s.interact.open && !s.build.tool ? T.at(s.tileAt(p)) : null;
    const inPanel = h && panel.style.display !== 'none' && current() && holderKey(current()!.ref) === holderKey(h.ref);
    if (!h || inPanel || (h.kind === 'store' && !T.hasAny(h))) { if (hover.style.display !== 'none') hover.style.display = 'none'; shown = ''; return; }
    const body = `<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">${icon(iconOf(h))}<b style="color:var(--rf-title)">${h.name[0].toUpperCase() + h.name.slice(1)}</b><span class="rf-dim">${whose(h)}</span></div>${holderSummary(h)}`;
    if (body !== shown) { shown = body; hover.innerHTML = body; }
    // beside the cursor, kept on screen and off the command card at the bottom (above the cursor when it would cover it)
    hover.style.display = '';
    const r = s.game.canvas.getBoundingClientRect(), z = Number(hover.style.zoom) || 1, t = hover.getBoundingClientRect();
    const card = document.getElementById('rfCard'), c = card && card.style.display !== 'none' ? card.getBoundingClientRect() : null;
    let x = Math.min(r.left + p.x + 16, innerWidth - t.width - 4), y = r.top + p.y + 24;
    const hits = (yy: number) => !!c && x < c.right && x + t.width > c.left && yy + t.height > c.top && yy < c.bottom;
    if (y + t.height > innerHeight - 4 || hits(y)) y = r.top + p.y - t.height - 12;
    if (hits(y)) x = c!.left - t.width - 8 > 4 ? c!.left - t.width - 8 : c!.right + 8;
    hover.style.left = `${Math.round(Math.max(4, x) / z)}px`;
    hover.style.top = `${Math.round(Math.max(4, y) / z)}px`;
  });

  return { slots, refresh };
}
