/**
 * The squad chest (replaces the always-on resource band): a button bottom right beside the roster and build buttons
 * (I, src/war/input) opens a grid inventory in the kit, after the Battle Brothers stash and Diablo's grid:
 *
 *   Squad        what the selected men (none selected: all your men here) have: goods in their hands, the packs' fill,
 *                a crewed cart's cargo, the gear they wear, and your loot and spare gear (the stash)
 *   Town store   W-60: only while those men stand next to a store of yours (STORE_NEAR), and only that store's goods
 *                and items: no network or team total (what is here is what the men can eat and take)
 *
 * Filter (all, goods, gear, loot) and sort (amount, name, kind); every cell has its codex card. The sections are rows of
 * SOURCES, each a function of the view's context, so new things a squad carries slot in as a row (W-60: their hunger).
 */
import { ITEMS, type Item } from '../../../data/items';
import { BUILDINGS } from '../../sim/economy';
import { PORTER } from '../../sim/trade';
import type { SquadId } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { keys } from '../../input/keys';
import { myTeam } from '../side';
import { draggable } from './drag';
import { bar, fitHeight, icon } from './kit';
import { GOOD_INFO, goodCard, goodIcon, goodName } from './goods';
import { sandboxRoster } from './roster/state';
import { nameOf, sandboxCraft } from './craft/state';
import { esc, itemBadges, itemIcon, itemTip, rarityHex, tipper } from './roster/ui';
import { hungerBadge } from './hunger';
import { glyph } from './glyph';
import { HUNGER, hungerStage } from '../../sim/food';
import type { BuildingSnap, Snapshot } from '../../types';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type Filter = 'all' | 'goods' | 'gear' | 'loot';
type Sort = 'amount' | 'name' | 'kind';
type Tab = 'squad' | 'town';

/** One cell of the grid: a good with its amount, or an item. */
export type Cell = { kind: 'good'; res: string; n: number; note?: string } | { kind: 'item'; item: Item; n?: number; note?: string };
/** A section of the chest: caption, the filter it answers to, its cells, an optional foot (a capacity bar). */
export interface Section { id: string; label: string; filter: Exclude<Filter, 'all'>; cells: Cell[]; foot?: string; empty?: string }
export interface ChestCtx { s: SandboxScene; squads: SquadId[] }

const COLS = 8;
const W = COLS * 40 + 34;
/** W-60: a store of yours this close to the men's centre (tiles from its middle) opens the Town store tab. */
export const STORE_NEAR = 8;
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const fmt = (n: number) => (n >= 10 ? String(Math.floor(n)) : n >= 1 ? String(Math.floor(n * 10) / 10).replace(/\.0$/, '') : n > 0.05 ? n.toFixed(1) : '0');

/** The living men of these squads. */
const menOf = (c: ChestCtx) => (c.s.sim.cur?.units ?? []).filter((u) => c.squads.includes(u.squad) && u.state !== 'dead');

/** W-60: the nearest standing store of yours within STORE_NEAR of (x,y) (null: none so near). */
export function storeNear(cur: Snapshot | null | undefined, team: number, x: number, y: number, r = STORE_NEAR): BuildingSnap | null {
  let best: BuildingSnap | null = null, bd = r * r;
  for (const b of cur?.buildings ?? []) {
    if (b.team !== team || !BUILDINGS[b.type]?.store || (b.state !== 'done' && b.state !== 'damaged')) continue;
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d <= bd) (bd = d), (best = b);
  }
  return best;
}
/** W-60: the store these men stand next to (their centre), null when they are away from every store of yours. */
export function storeOfMen(s: SandboxScene, qs: SquadId[]): BuildingSnap | null {
  const men = (s.sim.cur?.units ?? []).filter((u) => qs.includes(u.squad) && u.state !== 'dead');
  if (!men.length) return null;
  const cx = men.reduce((a, u) => a + u.x, 0) / men.length, cy = men.reduce((a, u) => a + u.y, 0) / men.length;
  return storeNear(s.sim.cur, myTeam(), cx, cy);
}
/** W-60: the goods a player has at hand for a cost hint: the store his selected men (else all his men) stand next to; {} away from every store. */
export function localGoods(s: SandboxScene): Record<string, number> {
  const sel = s.siege.own();
  const qs = sel.length ? sel : (s.sim.cur?.squads ?? []).filter((q) => q.team === myTeam() && q.units.length).map((q) => q.id);
  return (storeOfMen(s, qs)?.goods ?? {}) as Record<string, number>;
}

/** What the squad view lists, in order. Add a row here for anything new a squad carries. */
export const SOURCES: ((c: ChestCtx) => Section | null)[] = [
  // W-60: how fed the men are (icons by stage) and what feeds them
  (c) => {
    const men = menOf(c).filter((u) => u.sat !== undefined);
    if (!men.length) return null;
    const by = [0, 0, 0];
    for (const u of men) by[hungerStage(u.sat!)]++;
    const worst = Math.min(...men.map((u) => u.sat!));
    const parts = [['fed', 0, 80], ['hungry', 1, (HUNGER.hungry + HUNGER.starving) / 2], ['starving', 2, 0]] as const;
    const line = parts.filter(([, i]) => by[i]).map(([n, i, sat]) => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px">${hungerBadge(sat, 14)}<b class="rf-num">${by[i]}</b><span class="rf-dim">${n}</span></span>`).join('');
    const foot = `<div class="ch-cap" style="flex-wrap:wrap">${line}</div><div class="ch-cap rf-dim">${glyph('goods:march_rations', 14)}<span style="width:auto">a ration (+${HUNGER.ration}) or ${glyph('ui:food', 14)} food (+${HUNGER.food}) from their packs, else from a store within ${HUNGER.storeR} tiles</span></div>`;
    return { id: 'food', label: `Food ${hungerBadge(worst, 13)}`, filter: 'goods', cells: [], foot, empty: '' };
  },
  // goods in hand (gatherers' loads) and in a crewed cart
  (c) => {
    const g: Record<string, number> = {};
    for (const u of menOf(c)) if (u.carry && u.load) g[u.carry] = (g[u.carry] ?? 0) + u.load;
    for (const q of c.squads) { const e = c.s.siege.engineOf(q); for (const [r, n] of Object.entries(e?.cargo ?? {})) g[r] = (g[r] ?? 0) + (n ?? 0); }
    const men = menOf(c), packs = men.reduce((a, u) => a + (u.pack ?? 0), 0), cap = men.length * PORTER.loads;
    const foot = cap ? `<div class="ch-cap"><span>Packs</span>${bar('ok', packs / cap, 150)}<b class="rf-num">${fmt(packs)} / ${cap}</b><span class="rf-dim">loads</span></div>` : '';
    return { id: 'goods', label: 'Carried goods', filter: 'goods', cells: Object.entries(g).filter(([, n]) => n > 0.05).map(([res, n]) => ({ kind: 'good', res, n })), foot, empty: 'their hands are empty' };
  },
  // the gear they wear
  (c) => {
    // alike pieces (kind, rarity, quality) stack in one slot, with who wears them
    const R = sandboxRoster(c.s), by = new Map<string, { item: Item; who: string[] }>();
    for (const u of menOf(c)) {
      const p = u.pid ? R.roster.get(u.pid) : undefined;
      for (const it of Object.values(p?.hero.equip ?? {})) {
        if (!it) continue;
        const k = `${it.def}|${it.rarity}|${it.q ?? ''}`, g = by.get(k) ?? { item: it, who: [] };
        g.who.push(esc(p!.hero.name));
        by.set(k, g);
      }
    }
    const cells: Cell[] = [...by.values()].map(({ item, who }) => ({ kind: 'item', item, n: who.length, note: `worn by ${who.length > 4 ? `${who.slice(0, 4).join(', ')} and ${who.length - 4} more` : who.join(', ')}` }));
    return { id: 'gear', label: 'Worn gear', filter: 'gear', cells, empty: 'no recorded gear: class kit only' };
  },
  // loot and spare gear: the player's stash
  (c) => {
    const C = sandboxCraft(c.s, sandboxRoster(c.s));
    return { id: 'loot', label: 'Loot and spare gear', filter: 'loot', cells: C.stash().map((x) => ({ kind: 'item' as const, item: x.item, note: x.away ? 'at a workplace for mending' : 'in your stash: put it on from a soldier\'s card (R)' })), empty: 'nothing yet' };
  },
];

/** W-60: the town store: this one store's goods (rations and food first) and the first of its items; no totals. */
function townSections(store: BuildingSnap): Section[] {
  const st = (store.goods ?? {}) as Record<string, number>;
  const rank = (r: string) => (r === 'ration' ? 0 : r === 'food' ? 1 : 2);
  const goods: Cell[] = Object.entries(st).filter(([, n]) => n > 0.05).sort((a, b) => rank(a[0]) - rank(b[0])).map(([res, n]) => ({ kind: 'good', res, n, ...(rank(res) < 2 ? { note: `your men within ${HUNGER.storeR} tiles eat from it` } : {}) }));
  const items: Cell[] = (store.list ?? []).map((i) => ({ kind: 'item', item: { uid: i.uid, def: i.def, rarity: i.rarity, cond: 100, ...(i.q !== undefined ? { q: i.q } : {}) } as Item, note: 'in this store' }));
  return [
    { id: 'store', label: 'In this store', filter: 'goods', cells: goods, empty: 'the store is empty' },
    ...(items.length ? [{ id: 'items', label: 'Its items', filter: 'gear' as const, cells: items }] : []),
  ];
}

const KIND_ORDER = Object.keys(GOOD_INFO);
function sorted(cells: Cell[], by: Sort): Cell[] {
  const name = (x: Cell) => (x.kind === 'good' ? goodName(x.res) : nameOf(x.item.def));
  const amount = (x: Cell) => (x.kind === 'good' ? x.n : RARITY_RANK[x.item.rarity] ?? 0);
  const kind = (x: Cell) => (x.kind === 'good' ? KIND_ORDER.indexOf(x.res) : 100 + ['weapon', 'shield', 'armor', 'helmet', 'trinket'].indexOf(ITEMS[x.item.def]?.slot ?? 'tool'));
  return [...cells].sort((a, b) => (by === 'name' ? name(a).localeCompare(name(b)) : by === 'kind' ? kind(a) - kind(b) || name(a).localeCompare(name(b)) : amount(b) - amount(a) || name(a).localeCompare(name(b))));
}

function cellHtml(x: Cell): string {
  if (x.kind === 'good') {
    const more = `<div class="cx-fx"><span>${x.res.startsWith('p:') ? 'in the team supplies' : 'here'}: <b class="cx-v">${fmt(x.n)}</b>${x.res === 'coin' ? ` <span class="rf-dim">(${fmt(x.n / 200)} loads)</span>` : ''}</span></div>${x.note ? `<div class="rf-dim">${x.note}</div>` : ''}`;
    return `<div class="rf-cell" data-tip="${esc(goodCard(x.res, more))}">${icon(goodIcon(x.res))}<span class="n">${fmt(x.n)}</span></div>`;
  }
  const it = x.item, worn = it.cond / (it.mc ?? 100) < 0.5;
  return `<div class="rf-cell" style="border-color:${rarityHex(it.rarity)}88" data-tip="${esc(itemTip(it, undefined, x.note ? { tone: 'dim', icon: 'ui:chest', text: x.note } : undefined))}">${itemIcon(it, 28)}${itemBadges(it, 9)}${worn ? '<i class="w" title="worn"></i>' : ''}${(x.n ?? 1) > 1 ? `<span class="n">×${x.n}</span>` : ''}</div>`;
}

function grid(cells: Cell[], empty: string): string {
  if (!cells.length) return `<div class="ch-empty rf-dim">${empty}</div>`;
  const pad = (COLS - (cells.length % COLS)) % COLS;
  return `<div class="ch-grid">${cells.map(cellHtml).join('')}${'<div class="rf-cell empty"></div>'.repeat(pad)}</div>`;
}

const CSS = `
#rfChest{width:${W}px;padding:5px 8px 8px}
#rfChest .ch-grid{display:grid;grid-template-columns:repeat(${COLS},38px);gap:2px;padding:2px}
#rfChest .ch-empty{padding:8px 4px;font-style:italic}
#rfChest .ch-cap{display:flex;align-items:center;gap:6px;margin:5px 2px 0;font-size:11.5px}
#rfChest .ch-cap>span:first-child{color:var(--rf-muted);width:44px}
#rfChest .ch-tools{display:flex;align-items:center;gap:4px;margin:6px 0 2px}
#rfChest .ch-tools .rf-tbtn{height:21px;padding:0 7px;font-size:11.5px}
#rfChest .ch-tabs{display:flex;align-items:flex-end;height:24px;border-bottom:1px solid var(--rf-line)}
#rfChest .ch-body{max-height:420px;padding-right:2px}
#rfChest .ch-away{margin:10px 2px;padding:8px;line-height:1.4}
`;

export function mountChest(s: SandboxScene, mk: Mk, tipOn: (el: HTMLElement, html: () => string) => void): { refresh(): void } {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = mk('rfChestBtn', 'right:72px;bottom:4px;pointer-events:auto');
  const btn = document.createElement('button');
  btn.className = 'rf-btn';
  btn.id = 'cChest';
  box.appendChild(btn);
  const label = () => keys.label('panel.chest');
  const paintBtn = () => { btn.innerHTML = icon('trade-chest') + `<span class="key">${label()}</span>`; };
  paintBtn();
  keys.onChange(paintBtn);
  tipOn(btn, () => `<div class="rf-name" style="margin-bottom:3px">Squad chest</div>what your men carry, and the town store <b class="k">${label()}</b>`);

  const el = mk('rfChest', 'right:4px;bottom:40px;display:none;pointer-events:auto');
  el.classList.add('rf-card');
  draggable(el, '.rf-ph');
  const tip = mk('chTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const unTip = tipper(el, tip);
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  let open = false, tab: Tab = 'squad', filter: Filter = 'all', sort: Sort = 'amount', last = '';
  /** The men the chest is about: the selected own squads, else every own squad on the map. */
  const squads = (): SquadId[] => {
    const sel = s.siege.own();
    if (sel.length) return sel;
    return (s.sim.cur?.squads ?? []).filter((q) => q.team === myTeam() && q.units.length).map((q) => q.id);
  };
  /** W-60: the store of yours these men stand next to (null: they are away). */
  const townStore = (qs: SquadId[]) => storeOfMen(s, qs);

  const render = () => {
    el.style.display = open ? '' : 'none';
    btn.classList.toggle('on', open);
    if (!open) return;
    const qs = squads(), sel = s.siege.own().length > 0, store = townStore(qs);
    const ctx: ChestCtx = { s, squads: qs };
    const men = (s.sim.cur?.units ?? []).filter((u) => qs.includes(u.squad) && u.state !== 'dead').length;
    const who = sel ? (qs.length === 1 ? `Squad #${qs[0]}` : `${qs.length} squads`) : 'All your men here';
    const sections = tab === 'squad' ? SOURCES.map((f) => f(ctx)).filter((x): x is Section => !!x) : store ? townSections(store) : [];
    const shown = sections.filter((x) => filter === 'all' || x.filter === filter);
    const body = tab === 'town' && !store
      ? `<div class="ch-away rf-well rf-dim">${glyph('ui:lock', 14)} Your men are away from your stores. Walk them next to a camp, storehouse or fort of yours to see what that store holds.</div>`
      : shown.map((x) => `<div class="rf-sec">${x.label}<span class="rf-dim">${x.cells.length || ''}</span></div>${x.cells.length || x.empty !== '' ? grid(sorted(x.cells, sort), x.empty ?? 'empty') : ''}${x.foot ?? ''}`).join('') || '<div class="ch-empty rf-dim">nothing of this kind</div>';
    const fBtn = (f: Filter, t: string) => `<button class="rf-tbtn${filter === f ? ' on' : ''}" data-filter="${f}">${t}</button>`;
    const html = `<div class="rf-ph">${icon('trade-chest', 32)}<div style="flex:1;min-width:0"><div class="rf-name">${tab === 'squad' ? 'Squad chest' : 'Town store'}</div><div class="sub">${tab === 'squad' ? `${who} · ${men} ${men === 1 ? 'man' : 'men'}` : store ? `this ${BUILDINGS[store.type] ? store.type.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()) : 'store'} only` : 'not next to a store'}</div></div><button class="rf-tbtn x" data-act="close" data-tip="close (${label()})">✕</button></div>
      <div class="ch-tabs"><button class="rf-tab${tab === 'squad' ? ' on' : ''}" data-tab="squad">Squad</button><button class="rf-tab${tab === 'town' ? ' on' : ''}" data-tab="town" ${store ? 'data-tip="this store only: what is here, no totals"' : 'data-tip="stand your men next to a store of yours to open it"'}>Town store${store ? '' : ' ·  away'}</button></div>
      <div class="ch-tools">${tab === 'squad' ? fBtn('all', 'All') + fBtn('goods', 'Goods') + fBtn('gear', 'Gear') + fBtn('loot', 'Loot') : ''}<span style="flex:1"></span><button class="rf-tbtn" data-act="sort" data-tip="sort by amount, name or kind">Sort: ${sort}</button></div>
      <div class="ch-body rf-scroll">${body}</div>`;
    if (html !== last) {
      const b = el.querySelector<HTMLElement>('.ch-body'), top = b?.scrollTop ?? 0;
      el.innerHTML = last = html;
      const b2 = el.querySelector<HTMLElement>('.ch-body');
      if (b2) b2.scrollTop = top;
    }
    fitHeight(el);
    el.style.maxHeight = '';
    unTip();
  };
  const toggle = (on = !open) => { open = on; last = ''; render(); };
  btn.onclick = () => toggle();
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-filter]');
    if (!t) return;
    if (t.dataset.act === 'close') return toggle(false);
    if (t.dataset.act === 'sort') sort = sort === 'amount' ? 'name' : sort === 'name' ? 'kind' : 'amount';
    if (t.dataset.tab) tab = t.dataset.tab as Tab;
    if (t.dataset.filter) filter = t.dataset.filter as Filter;
    render();
  });
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (s.build.active || s.build.tool) return;
    const a = keys.act(e);
    if (a === 'panel.chest') toggle();
    else if (a === 'back' && open) toggle(false);
  });
  setInterval(render, 300);
  return { refresh: render };
}

