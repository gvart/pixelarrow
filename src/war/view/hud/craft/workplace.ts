/**
 * The workplace panel (M5h5): a selected own workplace's crafters (slots by level, assign a civilian squad of its trade:
 * civWork), its queue (at most CRAFT.queue: progress, who works it, cancel), the recipe picker (filtered by the
 * crafters' nodes and the workplace level; inputs against the stock, missing in red; time at the crafter's rate) with an
 * output preview (the rarity and quality odds for the best crafter here), and the stash items it can repair or salvage.
 * Pure HTML; ./index.ts mounts it and routes data-* clicks.
 */
import { CIV_CLASSES, type CivClassId } from '../../../../data/classes';
import { ITEMS, itemDef, RARITIES, type Item } from '../../../../data/items';
import { PROF_NODES, type ProfId } from '../../../../data/professions';
import { RECIPES, type Goods, type Recipe, type Workplace } from '../../../../data/recipes';
import { BUILDINGS } from '../../../sim/economy';
import { CRAFT, itemRecipe, repairCost } from '../../../sim/crafting';
import type { BuildingSnap, ResourceKind } from '../../../types';
import { bar, snapW } from '../kit';
import { esc, itemBadges, itemIcon, itemTip, rarityHex } from '../roster/ui';
import { nameOf, type Civ, type SandboxCraft } from './state';

export const WP_W = snapW(282);
export const WP_PROF: Record<Workplace, ProfId | null> = { forge: 'smith', cookhouse: 'cook', infirmary: 'physician', workshop: 'engineer', stall: 'merchant', sorting: 'forager', press: 'forager', store: null, site: null };
export const WP_NAME: Record<Workplace, string> = { forge: 'Forge', cookhouse: 'Cookhouse', infirmary: 'Infirmary', workshop: 'Workshop', stall: 'Market stall', sorting: 'Sorting floor', press: 'Olive press', store: 'Store', site: 'Site' };

/** A civilian at work here: his unit, squad, record (null: no person) and work rate. */
export interface Crafter { unit: number; squad: number; civ: Civ | null; rate: number }
/** A squad of the trade that could be sent here. */
export interface Idle { squad: number; men: number; name: string; at: string }
export interface WpView { tab: string; all: boolean; recipe: string | null }

const CATS: Record<string, (r: Recipe) => boolean> = {
  Weapons: (r) => r.kind === 'item' && ITEMS[r.out.item!]?.slot === 'weapon',
  Armour: (r) => r.kind === 'item' && ITEMS[r.out.item!]?.slot === 'armor',
  Helmets: (r) => r.kind === 'item' && ITEMS[r.out.item!]?.slot === 'helmet',
  Shields: (r) => r.kind === 'item' && ITEMS[r.out.item!]?.slot === 'shield',
  Trinkets: (r) => r.kind === 'item' && ITEMS[r.out.item!]?.slot === 'trinket',
  Bronze: (r) => r.kind === 'smelt',
};
export const tabsOf = (kind: Workplace): string[] => (kind === 'forge' ? Object.keys(CATS) : ['All']);

/** Recipes queueable at this kind of workplace (engines and forts are built on site). */
export const recipesAt = (kind: Workplace): Recipe[] =>
  Object.values(RECIPES).filter((r) => r.at === kind && r.kind !== 'engine' && r.kind !== 'fort').sort((a, b) => a.lv - b.lv || a.tier - b.tier || nameOf(outId(a)).localeCompare(nameOf(outId(b))));
const outId = (r: Recipe) => r.out.item ?? r.out.tool ?? r.out.good ?? r.out.product ?? r.id;

const resIcon = (r: string, px = 12) => `<img src="war/ui/icons/24/res-${r}.png" srcset="war/ui/icons/24/res-${r}@2x.png 2x" width="${px}" height="${px}" alt="" style="display:inline-block;vertical-align:-2px">`;
const PRODUCT_RES: Record<string, string> = { bandage: 'bandages', salve: 'salves', theriac: 'theriac' };
/** An output's icon box (items from the item atlas, goods and remedies from the kit, the rest a name tile). */
function outIcon(r: Recipe, px = 24): string {
  if (r.out.item || r.out.tool) return itemIcon({ uid: '', def: (r.out.item ?? r.out.tool)!, rarity: 'common', cond: 100 }, px);
  const res = r.out.good ?? (r.out.product && PRODUCT_RES[r.out.product]);
  if (res) return `<img src="war/ui/icons/24/res-${res}.png" srcset="war/ui/icons/24/res-${res}@2x.png 2x" width="${px}" height="${px}" alt="">`;
  return `<span style="display:flex;width:${px}px;height:${px}px;align-items:center;justify-content:center;font:600 9px/1 Inter;color:var(--rf-accent);border:1px solid var(--rf-rule)">${r.kind === 'dish' ? 'dish' : r.kind}</span>`;
}

const goods = (g: Goods, stock: Partial<Record<ResourceKind, number>>) =>
  Object.entries(g).map(([k, v]) => { const have = Math.floor(stock[k as ResourceKind] ?? 0), miss = have < (v ?? 0); return `<span style="display:inline-flex;align-items:center;gap:1px;margin-right:4px;${miss ? 'color:var(--rf-bad)' : ''}" data-tip="${k}: ${have} in stock">${resIcon(k)}<span class="rf-num">${v}</span>${miss ? `<span class="rf-num" style="font-size:10.5px">/${have}</span>` : ''}</span>`; }).join('') || '<span class="rf-dim">nothing</span>';
const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m${Math.round(n % 60) ? ` ${Math.round(n % 60)}s` : ''}` : `${Math.round(n)}s`);

/** The best crafter here for r: may make it, highest level (null: none may). */
export function makerOf(C: SandboxCraft, crafters: Crafter[], r: Recipe): Crafter | null {
  let best: Crafter | null = null;
  for (const c of crafters) if (c.civ && C.canMake(c.civ, r) && (!best || c.civ.level > best.civ!.level)) best = c;
  return best;
}

/** Why r cannot be queued here now (null: it can). */
function lockOf(C: SandboxCraft, crafters: Crafter[], r: Recipe, level: number): string | null {
  if (r.lv > level) return `needs a level ${r.lv} ${WP_NAME[r.at].toLowerCase()}`;
  if (!crafters.some((c) => c.civ)) return 'nobody at work here';
  if (makerOf(C, crafters, r)) return null;
  const nodes = [r.node, ...(r.needs ?? [])].map((n) => PROF_NODES[n]?.name ?? n);
  return `needs a crafter with ${nodes.join(' + ')}`;
}

function oddsHtml(C: SandboxCraft, c: Crafter, r: Recipe, level: number): string {
  if (!r.out.item && !r.out.tool) {
    const n = r.out.n;
    return `<div class="rf-dim">makes <b class="rf-num" style="color:var(--rf-ink)">${n}</b> ${esc(nameOf(outId(r)))}${n > 1 ? '' : ''} · into the ${r.out.good ? 'team stock' : 'team supplies'}</div>`;
  }
  const o = C.odds(c.civ!, r, level), fine = Math.max(0, 1 - o.crude - o.masterwork);
  const seg = o.rarity.map((p, i) => (p > 0 ? `<i style="flex:${p};background:${rarityHex(RARITIES[i])}" data-tip="${RARITIES[i]} ${p}%"></i>` : '')).join('');
  const lab = o.rarity.map((p, i) => (p > 0 ? `<span style="color:${rarityHex(RARITIES[i])}">${RARITIES[i]} ${p}%</span>` : '')).filter(Boolean).join(' · ');
  return `<div class="rf-dim" style="margin-bottom:2px">grade <b class="rf-num" style="color:var(--rf-ink)" data-tip="craft grade: his level + tool + workplace level${o.masterwork ? ' + Masterwork' : ''}">G${o.g}</b> · by ${esc(c.civ!.name)} L${c.civ!.level}</div>
    <div class="wp-odds">${seg}</div><div style="font-size:11px;line-height:14px;margin-top:3px">${lab}</div>
    <div style="font-size:11px;line-height:14px;margin-top:2px"><span class="rf-dim">crude ${Math.round(o.crude * 100)}%</span> · <span>fine ${Math.round(fine * 100)}%</span> · <span style="color:var(--rf-gold)">masterwork ${Math.round(o.masterwork * 100)}%</span>${o.masterwork ? '' : ' <span class="rf-dim">(Masterwork node)</span>'}</div>`;
}

export function workplaceHtml(C: SandboxCraft, b: BuildingSnap, crafters: Crafter[], idle: Idle[], v: WpView, stock: Partial<Record<ResourceKind, number>>): string {
  const wp = BUILDINGS[b.type].workplace!, prof = WP_PROF[wp.kind], q = b.queue ?? [], level = wp.level;
  const unit = new Map(crafters.map((c) => [c.unit, c]));
  // crafters: the first `level` take orders
  const slots = Array.from({ length: Math.max(level, crafters.length) }, (_, i) => {
    const c = crafters[i];
    if (!c) return `<div class="wp-cr empty">slot ${i + 1} · free</div>`;
    const busy = q.find((o) => o.by === c.unit), held = c.civ ? c.civ.perks.filter((n) => PROF_NODES[n]).map((n) => PROF_NODES[n].name).join(', ') : '';
    return `<div class="wp-cr${i >= level ? ' extra' : ''}" ${c.civ ? `data-civ="${esc(c.civ.id)}"` : ''} data-tip="${esc(c.civ ? `${c.civ.name}: ${held || 'root node only'} · work x${c.rate.toFixed(2)}<br><span class='rf-dim'>click: his profession tree</span>` : 'a civilian without a record')}">
      <b>${esc(c.civ?.name ?? 'civilian')}</b> <span class="rf-dim">L${c.civ?.level ?? 1}</span><span style="flex:1"></span>${i >= level ? '<span class="rf-dim">waits: no slot</span>' : busy ? '<span style="color:var(--rf-good)">at work</span>' : '<span class="rf-dim">idle</span>'}</div>`;
  }).join('');
  const assign = idle.length
    ? idle.map((x) => `<button class="rf-tbtn pri" data-assign="${x.squad}" data-tip="send them to work here (civWork)">+ ${esc(x.name)} ×${x.men} <span class="rf-dim">${esc(x.at)}</span></button>`).join('')
    : `<span class="rf-dim">no idle ${prof ? CIV_CLASSES[`civ_${prof}` as CivClassId].name.toLowerCase() + 's' : 'civilians'} to send</span>`;

  const queue = q.length ? q.map((o) => {
    const r = o.kind === 'craft' ? RECIPES[o.recipe] : null, c = unit.get(o.by);
    const name = o.kind === 'craft' ? nameOf(r ? outId(r) : o.recipe) : `${o.kind} ${nameOf(o.recipe)}`;
    return `<div class="wp-q"><div style="width:20px">${r ? outIcon(r, 20) : ''}</div><div style="flex:1;min-width:0"><div style="display:flex;gap:3px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span><span style="flex:1"></span><span class="rf-dim">${o.by >= 0 ? esc(c?.civ?.name ?? 'at work') : 'waiting'}</span></div>
      ${bar(o.by >= 0 ? 'construction' : 'ok', o.progress, 200)}</div><button class="rf-tbtn x" data-cancel="${o.id}" data-tip="cancel: inputs taken come back">✕</button></div>`;
  }).join('') : '<div class="rf-dim" style="padding:2px">nothing queued</div>';

  // recipe picker
  const tabs = tabsOf(wp.kind), tab = tabs.includes(v.tab) ? v.tab : tabs[0];
  const list = recipesAt(wp.kind).filter((r) => tab === 'All' || CATS[tab]?.(r)).map((r) => ({ r, lock: lockOf(C, crafters, r, level) })).filter((x) => v.all || !x.lock);
  const sel = v.recipe ? RECIPES[v.recipe] : null, selLock = sel ? lockOf(C, crafters, sel, level) : null, maker = sel ? makerOf(C, crafters, sel) : null;
  const rows = list.map(({ r, lock }) => {
    const m = lock ? null : makerOf(C, crafters, r), t = r.secs / (m?.rate ?? 1);
    return `<div class="wp-r${lock ? ' lock' : ''}${v.recipe === r.id ? ' on' : ''}" data-recipe="${r.id}" ${lock ? `data-tip="${esc(lock)}"` : ''}>${outIcon(r, 20)}<div style="flex:1;min-width:0"><div style="display:flex;gap:3px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nameOf(outId(r)))}</span>${r.tier > 1 ? `<span class="rf-dim">T${r.tier}</span>` : ''}<span style="flex:1"></span><span class="rf-dim rf-num">${secs(t)}</span></div><div style="margin-top:1px">${goods(r.inputs, stock)}</div></div></div>`;
  }).join('') || `<div class="rf-dim" style="padding:4px">${crafters.some((c) => c.civ) ? 'nothing this crew can make here' : `assign ${prof ? 'a ' + CIV_CLASSES[`civ_${prof}` as CivClassId].name.toLowerCase() : 'a crafter'} first`}${v.all ? '' : ' · <b>All</b> shows what is locked'}</div>`;
  const miss = sel ? Object.entries(sel.inputs).some(([k, n]) => (stock[k as ResourceKind] ?? 0) < (n ?? 0)) : false;
  const detail = sel ? `<div class="wp-det"><div style="display:flex;gap:5px;align-items:center">${outIcon(sel, 24)}<div style="flex:1"><div class="rf-name" style="font-size:13px;margin-bottom:2px">${esc(nameOf(outId(sel)))}</div><div class="rf-dim">${sel.out.item ? `${itemDef(sel.out.item).slot} · tier ${sel.tier}` : sel.kind} · ${secs(sel.secs / (maker?.rate ?? 1))}</div></div>
      <button class="rf-tbtn pri" data-queue="${sel.id}" ${selLock || q.length >= CRAFT.queue ? 'disabled' : ''} data-tip="${esc(selLock ?? (q.length >= CRAFT.queue ? `the queue holds ${CRAFT.queue}` : miss ? 'queued: it waits until the stock holds the inputs' : 'the inputs leave the stock when work starts'))}">Queue</button></div>
      <div style="margin-top:3px">${goods(sel.inputs, stock)}</div>
      <div style="margin-top:3px">${maker ? oddsHtml(C, maker, sel, level) : `<span style="color:var(--rf-bad)">${esc(selLock ?? '')}</span>`}</div></div>` : '<div class="wp-det rf-dim">pick a recipe: inputs, time and the odds for this crew</div>';

  // mending: stash items made here
  const mends = C.stash().filter((x) => { const r = itemRecipe(x.item.def); return r && r.at === wp.kind; });
  const mendRows = mends.map(({ item, away }) => {
    const r = itemRecipe(item.def)!, rc = repairCost(item, r);
    const salv = Object.entries(r.inputs).map(([k, n]) => [k, Math.floor((n ?? 0) * CRAFT.salvage)] as const).filter(([, n]) => n > 0);
    return `<div class="wp-m"><div class="rr-slot" style="width:24px;height:24px" data-tip="${esc(itemTip(item as Item))}">${itemIcon(item, 20)}${itemBadges(item, 8)}</div>
      <div style="flex:1;min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nameOf(item.def))}</div>${bar(item.cond < 50 ? 'burn' : 'hp', item.cond / 100, 70)}</div>
      ${away ? '<span class="rf-dim">at work…</span>' : `<button class="rf-tbtn" data-repair="${esc(item.uid)}" ${rc ? '' : 'disabled'} data-tip="${esc(rc ? `repair to ${item.mc ?? 100}: ${Object.entries(rc.inputs).map(([k, n]) => `${n} ${k}`).join(', ')} · ${secs(rc.secs)}${item.cond < CRAFT.worn ? ` · below ${CRAFT.worn}: max condition -${CRAFT.loss}` : ''}` : item.cond >= (item.mc ?? 100) ? 'whole' : 'worn past mending: salvage it')}">Repair</button>
      <button class="rf-tbtn" data-salvage="${esc(item.uid)}" data-tip="${esc(`break it up: ${salv.map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'} back (Goldsmith 60%)`)}">Salvage</button>`}</div>`;
  }).join('');

  return `<div class="rf-card" style="padding:4px 6px 6px">
    <div class="rf-head"><span class="rf-name" style="font-size:16px">${WP_NAME[wp.kind]}</span><span class="rf-dim">level ${level} · ${level} crafter slot${level > 1 ? 's' : ''}</span><span style="flex:1"></span><button class="rf-tbtn x" data-act="closeWp" data-tip="close (Esc)">✕</button></div>
    <div class="rf-cap" style="margin-top:6px">Crafters</div>${slots}
    <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${assign}</div>
    <div class="rf-cap" style="margin-top:7px">Queue <span class="rf-dim rf-num">${q.length}/${CRAFT.queue}</span></div>${queue}
    <div style="display:flex;align-items:center;margin-top:7px"><div class="rf-cap" style="margin:0">Recipes</div><span style="flex:1"></span><button class="rf-tbtn${v.all ? ' on' : ''}" data-act="all" data-tip="show the recipes this crew cannot make yet, and why">${v.all ? 'Showing locked' : 'Show locked'}</button></div>
    ${tabs.length > 1 ? `<div class="rf-segs" style="margin:4px 0">${tabs.map((t) => `<button class="rf-tbtn${t === tab ? ' on' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>` : ''}
    <div class="wp-list">${rows}</div>
    ${detail}
    ${mendRows ? `<div class="rf-cap" style="margin-top:7px">Repair · salvage <span class="rf-dim">from your stash</span></div>${mendRows}` : ''}
  </div>`;
}

export const WP_CSS = `
.wp-cr{display:flex;align-items:center;gap:4px;height:24px;padding:0 6px;background:var(--rf-raised);border:1px solid var(--rf-rule);margin-bottom:2px;cursor:pointer}
.wp-cr:hover{background:var(--rf-hover);border-color:var(--rf-accent)}
.wp-cr.empty{color:var(--rf-disabled);border-style:dashed;background:none;cursor:default}.wp-cr.extra .rf-dim,.wp-cr.extra b{color:var(--rf-disabled)}
.wp-q{display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid var(--rf-rule)}
.wp-list{border-top:1px solid var(--rf-line);max-height:170px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#7a3418 #140c08}
.wp-r{display:flex;align-items:center;gap:5px;padding:3px 4px 3px 7px;cursor:pointer;border-bottom:1px solid var(--rf-rule);box-shadow:inset 3px 0 0 transparent}
.wp-r:hover{background:var(--rf-hover)}.wp-r.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.wp-r.lock{color:var(--rf-disabled)}.wp-r.lock img{opacity:.5;filter:grayscale(.6)}
.wp-det{margin-top:5px;padding:6px;border:1px solid var(--rf-line);background:var(--rf-sunk)}
.wp-odds{display:flex;height:6px;box-shadow:0 0 0 1px #0e0907}.wp-odds i{display:block;height:6px}
.wp-m{display:flex;align-items:center;gap:4px;padding:3px 0}
`;
