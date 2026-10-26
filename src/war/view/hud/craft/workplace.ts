/**
 * The workplace panel (M5h5), laid out like a smithy screen (Diablo IV's blacksmith, Kingdom Come's and Bannerlord's
 * smithing, Battle Brothers' gear compare): the crew strip on top; a recipe list grouped by gear slot (a forge) or by
 * kind, each with its icon, tier and time; the picked recipe on the right with who it is for (a man of the selected
 * squad), its stats against what he wears now, the inputs as have/need chips, time and the odds, and a big Forge
 * button; the queue as slots along the foot; mending the stash's gear folds away under it. Pure HTML; ./index.ts
 * mounts it and routes data-* clicks. Rows are data (RECIPES, ITEMS, itemMods): new recipes and stats slot in.
 */
import { CIV_CLASSES, type CivClassId } from '../../../../data/classes';
import { ITEMS, itemDef, itemMods, RARITIES, type Item, type Slot, type StatMods } from '../../../../data/items';
import { PROF_NODES, type ProfId } from '../../../../data/professions';
import { RECIPES, type Recipe, type Workplace } from '../../../../data/recipes';
import { BUILDINGS } from '../../../sim/economy';
import { CRAFT, itemRecipe, repairCost } from '../../../sim/crafting';
import type { BuildingSnap, ResourceKind } from '../../../types';
import { bar, BUILDING_ICON, icon, snapW } from '../kit';
import { needChips, shortText } from '../goods';
import { glyph } from '../glyph';
import { esc, itemBadges, itemIcon, itemTip, rarityHex } from '../roster/ui';
import { nameOf, type Civ, type SandboxCraft } from './state';

export const WP_W = snapW(452);
export const WP_PROF: Record<Workplace, ProfId | null> = { forge: 'smith', cookhouse: 'cook', infirmary: 'physician', workshop: 'engineer', stall: 'merchant', sorting: 'forager', press: 'forager', store: null, site: null };
export const WP_NAME: Record<Workplace, string> = { forge: 'Forge', cookhouse: 'Cookhouse', infirmary: 'Infirmary', workshop: 'Workshop', stall: 'Market stall', sorting: 'Sorting floor', press: 'Olive press', store: 'Store', site: 'Site' };

/** A civilian at work here: his unit, squad, record (null: no person) and work rate. */
export interface Crafter { unit: number; squad: number; civ: Civ | null; rate: number }
/** A squad of the trade that could be sent here. */
export interface Idle { squad: number; men: number; name: string; at: string }
/** A soldier the made piece could be for: his person id, name, class, level, what he wears, may he use it (why not). */
export interface Man { pid: string; name: string; cls: string; level: number; equip: Partial<Record<Slot, Item>>; block: (item: Item) => string | null }
export interface WpView { tab: string; all: boolean; recipe: string | null; for?: string | null; mend?: boolean }

/** The list's groups: gear by slot at a forge, then by recipe kind. */
const SLOT_GROUP: Record<Slot, string> = { weapon: 'Weapons', armor: 'Armour', helmet: 'Helmets', shield: 'Shields', trinket: 'Trinkets' };
const KIND_GROUP: Record<string, string> = { smelt: 'Smelting', coin: 'Coin', dish: 'Dishes', remedy: 'Remedies', good: 'Goods', tool: 'Tools', caravan: 'Caravan goods', cart: 'Carts' };
const groupOf = (r: Recipe) => (r.out.item && ITEMS[r.out.item] ? SLOT_GROUP[ITEMS[r.out.item].slot] : KIND_GROUP[r.kind] ?? r.kind);
const GROUP_ORDER = ['Weapons', 'Shields', 'Armour', 'Helmets', 'Trinkets', 'Smelting', 'Coin', 'Tools', 'Dishes', 'Remedies', 'Goods', 'Caravan goods', 'Carts'];
/** Kept for scripts: the old tab names. */
export const tabsOf = (kind: Workplace): string[] => (kind === 'forge' ? ['Weapons', 'Armour', 'Helmets', 'Shields', 'Trinkets', 'Bronze'] : ['All']);

/** Recipes queueable at this kind of workplace (engines and forts are built on site). */
export const recipesAt = (kind: Workplace): Recipe[] =>
  Object.values(RECIPES).filter((r) => r.at === kind && r.kind !== 'engine' && r.kind !== 'fort').sort((a, b) => a.lv - b.lv || a.tier - b.tier || nameOf(outId(a)).localeCompare(nameOf(outId(b))));
const outId = (r: Recipe) => r.out.item ?? r.out.tool ?? r.out.good ?? r.out.product ?? r.id;

const PRODUCT_RES: Record<string, string> = { bandage: 'bandages', salve: 'salves', theriac: 'theriac' };
/** An output's icon (items from the item atlas, goods and remedies from the kit, the rest a lettered tile). */
function outIcon(r: Recipe, px = 24): string {
  if (r.out.item || r.out.tool) return itemIcon({ uid: '', def: (r.out.item ?? r.out.tool)!, rarity: 'common', cond: 100 }, px);
  const res = r.out.good ?? (r.out.product && PRODUCT_RES[r.out.product]);
  if (res) return `<img src="war/ui/icons/24/res-${res}.png" srcset="war/ui/icons/24/res-${res}@2x.png 2x" width="${px}" height="${px}" alt="">`;
  return `<span class="wp-lt" style="width:${px}px;height:${px}px">${esc(nameOf(outId(r)).slice(0, 2))}</span>`;
}
const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m${Math.round(n % 60) ? ` ${Math.round(n % 60)}s` : ''}` : `${Math.round(n)}s`);
const tierPip = (t: number) => `<span class="wp-tier t${t}">${'I'.repeat(Math.max(1, Math.min(3, t)))}</span>`;

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

/** The stats compared (an item's StatMods keys): label, how to print, whether more is better. */
const STATS: [keyof StatMods, string, (v: number) => string, boolean][] = [
  ['dmg', 'Melee', (v) => v.toFixed(1), true],
  ['rangedDmg', 'Missile', (v) => v.toFixed(1), true],
  ['atkTime', 'Blow time', (v) => `${v.toFixed(2)} s`, false],
  ['shotTime', 'Shot time', (v) => `${v.toFixed(2)} s`, false],
  ['reach', 'Reach', (v) => v.toFixed(1), true],
  ['range', 'Range', (v) => String(Math.round(v)), true],
  ['ammo', 'Ammunition', (v) => String(Math.round(v)), true],
  ['armor', 'Armour', (v) => (Math.round(v * 10) / 10).toString(), true],
  ['block', 'Block', (v) => `${Math.round(v * 100)}%`, true],
  ['accuracy', 'Accuracy', (v) => `${Math.round(v * 100)}%`, true],
  ['hp', 'Health', (v) => String(Math.round(v)), true],
  ['chargeBonus', 'Charge', (v) => `${Math.round(v * 100)}%`, true],
  ['armorPierce', 'Armour pierce', (v) => `${Math.round(v * 100)}%`, true],
  ['blockPierce', 'Block pierce', (v) => `${Math.round(v * 100)}%`, true],
  ['speed', 'Speed', (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`, true],
];

/** The new piece against the one he wears: a row per stat either has, the change coloured. */
function compareHtml(made: Item, worn: Item | undefined): string {
  const a = itemMods(made) as Record<string, number>, b = (worn ? itemMods(worn) : {}) as Record<string, number>;
  const rows = STATS.filter(([k]) => a[k] || b[k]).map(([k, label, f, up]) => {
    const n = a[k] ?? 0, o = b[k] ?? 0, d = n - o, better = up ? d > 1e-6 : d < -1e-6, worse = up ? d < -1e-6 : d > 1e-6;
    return `<span>${label}</span><span class="rf-num o">${o ? f(o) : '–'}</span><span class="rf-num n">${n ? f(n) : '–'}</span><span class="rf-num d ${better ? 'up' : worse ? 'down' : ''}">${better ? '▲' : worse ? '▼' : '='}</span>`;
  });
  return rows.length ? `<div class="wp-cmp"><span></span><span class="h">now</span><span class="h">new</span><span></span>${rows.join('')}</div>` : '';
}

function oddsHtml(C: SandboxCraft, c: Crafter, r: Recipe, level: number): string {
  if (!r.out.item && !r.out.tool) return `<div class="rf-dim">makes <b class="rf-num" style="color:var(--rf-ink)">${r.out.n}</b> ${esc(nameOf(outId(r)).toLowerCase())}, into ${r.out.good ? 'the team stock' : 'the team supplies'}</div>`;
  const o = C.odds(c.civ!, r, level), fine = Math.max(0, 1 - o.crude - o.masterwork);
  const seg = o.rarity.map((p, i) => (p > 0 ? `<i style="flex:${p};background:${rarityHex(RARITIES[i])}" data-tip="${RARITIES[i]} ${p}%"></i>` : '')).join('');
  const lab = o.rarity.map((p, i) => (p > 0 ? `<span style="color:${rarityHex(RARITIES[i])}">${RARITIES[i]} ${p}%</span>` : '')).filter(Boolean).join(' · ');
  const tip = `<b>Odds for this crafter</b> · grade ${o.g} (his level + tool + workplace level${o.masterwork ? ' + Masterwork' : ''})<br>${lab}<br>crude ${Math.round(o.crude * 100)}% · fine ${Math.round(fine * 100)}% · masterwork ${Math.round(o.masterwork * 100)}%`;
  return `<div data-tip="${esc(tip)}"><div class="wp-odds">${seg}</div><div class="wp-small">${lab}${o.masterwork ? ` · <span style="color:var(--rf-gold)">masterwork ${Math.round(o.masterwork * 100)}%</span>` : ''}</div></div>`;
}

export function workplaceHtml(C: SandboxCraft, b: BuildingSnap, crafters: Crafter[], idle: Idle[], v: WpView, stock: Partial<Record<ResourceKind, number>>, men: Man[] = []): string {
  const wp = BUILDINGS[b.type].workplace!, prof = WP_PROF[wp.kind], q = b.queue ?? [], level = wp.level;
  const unit = new Map(crafters.map((c) => [c.unit, c]));
  const trade = prof ? CIV_CLASSES[`civ_${prof}` as CivClassId].name.toLowerCase() : 'crafter';

  // the crew: a chip a crafter (the first `level` take orders), then who could be sent
  const crew = Array.from({ length: Math.max(level, crafters.length) }, (_, i) => {
    const c = crafters[i];
    if (!c) return `<div class="wp-cr empty" data-tip="a free crafter slot: send a ${trade} squad here">free slot</div>`;
    const busy = q.find((o) => o.by === c.unit), held = c.civ ? c.civ.perks.filter((n) => PROF_NODES[n]).map((n) => PROF_NODES[n].name).join(', ') : '';
    return `<div class="wp-cr${i >= level ? ' extra' : ''}" ${c.civ ? `data-civ="${esc(c.civ.id)}"` : ''} data-tip="${esc(c.civ ? `<b>${c.civ.name}</b>, level ${c.civ.level}: ${held || 'root node only'} · works ×${c.rate.toFixed(2)}<br><span class='rf-dim'>click: his profession tree</span>` : 'a civilian without a record')}">
      <i class="dot ${i >= level ? '' : busy ? 'on' : 'idle'}"></i><b>${esc(c.civ?.name ?? 'civilian')}</b><span class="rf-dim">L${c.civ?.level ?? 1}</span></div>`;
  }).join('');
  const assign = idle.map((x) => `<button class="rf-tbtn" data-assign="${x.squad}" data-tip="send them to work here (${esc(x.at)})">+ ${esc(x.name)} ×${x.men}</button>`).join('');

  // the list, grouped
  const all = recipesAt(wp.kind).map((r) => ({ r, lock: lockOf(C, crafters, r, level) }));
  const list = all.filter((x) => v.all || !x.lock);
  const groups = [...new Set(list.map((x) => groupOf(x.r)))].sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
  const rows = groups.map((g) => `<div class="wp-g">${g}</div>` + list.filter((x) => groupOf(x.r) === g).map(({ r, lock }) => {
    const m = lock ? null : makerOf(C, crafters, r), short = !!shortText(r.inputs, stock);
    return `<div class="wp-r${lock ? ' lock' : ''}${v.recipe === r.id ? ' on' : ''}" data-recipe="${r.id}" ${lock ? `data-tip="${esc(lock)}"` : ''}><span class="wp-ic">${outIcon(r, 24)}</span><span class="nm">${esc(nameOf(outId(r)))}</span>${r.out.item || r.out.tool ? tierPip(r.tier) : ''}<span class="rf-dim rf-num t${short && !lock ? ' short' : ''}">${lock ? glyph('ui:lock', 12) : secs(r.secs / (m?.rate ?? 1))}</span></div>`;
  }).join('')).join('') || `<div class="rf-dim" style="padding:8px 6px;white-space:normal">${crafters.some((c) => c.civ) ? 'nothing this crew can make here' : `send a ${trade} here first`}${v.all ? '' : '<br>Show locked lists the rest.'}</div>`;
  const lockedN = all.filter((x) => x.lock).length;

  // the picked recipe
  const sel = v.recipe ? RECIPES[v.recipe] : null, selLock = sel ? lockOf(C, crafters, sel, level) : null, maker = sel ? makerOf(C, crafters, sel) : null;
  let detail = `<div class="wp-det wp-pick rf-dim">${wp.kind === 'forge' ? 'Pick something to make: its stats against what your man wears, what it takes and how long.' : 'Pick something to make: what it takes, how long, and what comes out.'}</div>`;
  if (sel) {
    const isItem = !!sel.out.item && !!ITEMS[sel.out.item], made: Item | null = isItem ? { uid: '', def: sel.out.item!, rarity: 'common', cond: 100 } : null;
    const slot = made ? itemDef(made.def).slot : null;
    // who it is for: the picked man, else the first who may use it
    const fit = made ? men.filter((m) => !m.block(made)) : [];
    const who = made ? men.find((m) => m.pid === v.for) ?? fit[0] ?? men[0] : undefined;
    const whyNot = who && made ? who.block(made) : null;
    const forRow = made && men.length ? `<div class="wp-for"><span class="rf-dim">For</span><select data-for>${men.map((m) => `<option value="${esc(m.pid)}"${m.pid === who?.pid ? ' selected' : ''}${m.block(made) ? ' disabled' : ''}>${esc(m.name)} · ${esc(m.cls)} L${m.level}${m.block(made) ? ' (cannot use)' : ''}</option>`).join('')}</select></div>` : '';
    const worn = who && slot ? who.equip[slot] : undefined;
    const compare = made ? `${forRow}${whyNot ? `<div class="rf-hint">${esc(whyNot)}</div>` : ''}<div class="wp-small rf-dim" style="margin:4px 0 2px">${worn ? `now: his ${esc(nameOf(worn.def))}` : 'he wears nothing there now'}</div>${compareHtml(made, worn)}` : '';
    const full = q.length >= CRAFT.queue, short = shortText(sel.inputs, stock);
    const why = selLock ?? (full ? `the queue holds ${CRAFT.queue}` : '');
    detail = `<div class="wp-det">
      <div class="wp-hd"><span class="rf-cell big" ${made ? `data-tip="${esc(itemTip(made))}"` : ''}>${outIcon(sel, 32)}</span><div style="min-width:0;flex:1"><div class="rf-name" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nameOf(outId(sel)))}</div>
        <div class="cx-kind">${made ? `${SLOT_GROUP[slot!].replace(/s$/, '')} · tier ${sel.tier}` : KIND_GROUP[sel.kind] ?? sel.kind}</div></div></div>
      ${compare}
      <div class="wp-in" style="margin-top:6px">${needChips(sel.inputs, stock)}<span class="wp-time" data-tip="${esc(maker ? `${maker.civ!.name} L${maker.civ!.level} works ×${maker.rate.toFixed(2)}` : 'at a crafter\'s base rate')}">${glyph('ui:hourglass', 14)}<b>${secs(sel.secs / (maker?.rate ?? 1))}</b></span></div>
      ${maker ? oddsHtml(C, maker, sel, level) : ''}
      <button class="rf-tbtn pri big wp-go" data-queue="${sel.id}" ${why ? 'disabled' : ''}>${wp.kind === 'forge' ? 'Forge' : wp.kind === 'cookhouse' ? 'Cook' : 'Make'}</button>
      ${why || short ? `<div class="wp-why rf-hint">${esc(why || `${short}: it waits in the queue until the store holds them`)}</div>` : ''}
    </div>`;
  }

  // the queue: CRAFT.queue slots along the foot
  const queue = Array.from({ length: CRAFT.queue }, (_, i) => {
    const o = q[i];
    if (!o) return '<div class="wp-qs empty"></div>';
    const r = o.kind === 'craft' ? RECIPES[o.recipe] : null, c = unit.get(o.by);
    const name = o.kind === 'craft' ? nameOf(r ? outId(r) : o.recipe) : `${o.kind} ${nameOf(o.recipe)}`;
    return `<div class="wp-qs${o.by >= 0 ? ' on' : ''}" data-tip="${esc(`<b>${name}</b><br>${o.by >= 0 ? `${c?.civ?.name ?? 'at work'}: ${Math.round(o.progress * 100)}%` : 'waiting for a free crafter or its goods'}<br><span class='rf-dim'>✕ cancels: the goods taken come back</span>`)}">${r ? outIcon(r, 24) : `<span class="wp-lt" style="width:24px;height:24px">${esc(o.kind.slice(0, 3))}</span>`}${bar(o.by >= 0 ? 'construction' : 'ok', o.progress, 40)}<button class="x" data-cancel="${o.id}">✕</button></div>`;
  }).join('');

  // mending: stash items made here
  const mends = C.stash().filter((x) => { const r = itemRecipe(x.item.def); return r && r.at === wp.kind; });
  const mendRows = mends.map(({ item, away }) => {
    const r = itemRecipe(item.def)!, rc = repairCost(item, r);
    const salv = Object.entries(r.inputs).map(([k, n]) => [k, Math.floor((n ?? 0) * CRAFT.salvage)] as const).filter(([, n]) => n > 0);
    return `<div class="wp-m"><div class="rf-cell" style="width:30px;height:30px" data-tip="${esc(itemTip(item as Item))}">${itemIcon(item, 24)}${itemBadges(item, 8)}</div>
      <div style="flex:1;min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nameOf(item.def))}</div>${bar(item.cond < 50 ? 'burn' : 'hp', item.cond / 100, 90)}</div>
      ${away ? '<span class="rf-dim">at work…</span>' : `<button class="rf-tbtn" data-repair="${esc(item.uid)}" ${rc ? '' : 'disabled'} data-tip="${esc(rc ? `repair to ${item.mc ?? 100}: ${Object.entries(rc.inputs).map(([k, n]) => `${n} ${k}`).join(', ')} · ${secs(rc.secs)}${item.cond < CRAFT.worn ? ` · below ${CRAFT.worn}: max condition -${CRAFT.loss}` : ''}` : item.cond >= (item.mc ?? 100) ? 'whole' : 'worn past mending: salvage it')}">Repair</button>
      <button class="rf-tbtn" data-salvage="${esc(item.uid)}" data-tip="${esc(`break it up: ${salv.map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'} back (Goldsmith 60%)`)}">Salvage</button>`}</div>`;
  }).join('');

  const working = q.filter((o) => o.by >= 0).length;
  return `<div class="rf-card" style="padding:5px 8px 8px">
    <div class="rf-ph"><span class="rf-cell" style="width:36px;height:36px">${icon(BUILDING_ICON[b.type] ?? 'bld-storehouse', 32)}</span><div style="flex:1;min-width:0"><div class="rf-name">${WP_NAME[wp.kind]} <span class="rf-lv">L${level}</span></div><div class="sub">${level} crafter${level > 1 ? 's' : ''} at a time · ${working ? `${working} at work` : q.length ? `${q.length} queued, nobody at work` : 'idle'}</div></div><button class="rf-tbtn x" data-act="closeWp" data-tip="close (Esc)">✕</button></div>
    <div class="wp-crew">${crew}${assign}</div>
    <div class="wp-main">
      <div class="wp-side"><div class="wp-list rf-scroll rf-well">${rows}</div>
        <button class="rf-tbtn${v.all ? ' on' : ''} wp-all" data-act="all" data-tip="list what this crew cannot make yet, and why">${v.all ? 'Hide locked' : `Show locked${lockedN ? ` (${lockedN})` : ''}`}</button></div>
      ${detail}
    </div>
    <div class="rf-sec">Queue<span class="rf-dim">${q.length} / ${CRAFT.queue}</span></div>
    <div class="wp-queue">${queue}</div>
    ${mendRows ? `<div class="rf-sec wp-fold" data-act="mend">${v.mend ? '▾' : '▸'} Mend gear<span class="rf-dim">${mends.length} in your stash</span></div>${v.mend ? mendRows : ''}` : ''}
  </div>`;
}

export const WP_CSS = `
.wp-crew{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}
.wp-crew .rf-tbtn{height:22px;font-size:11.5px}
.wp-cr{display:flex;align-items:center;gap:4px;height:22px;padding:0 7px 0 5px;background:var(--rf-raised);border:1px solid var(--rf-rule);cursor:pointer;font-size:11.5px}
.wp-cr:hover{border-color:var(--rf-accent)}
.wp-cr .dot{width:6px;height:6px;border-radius:50%;background:var(--rf-disabled)}.wp-cr .dot.on{background:var(--rf-good);box-shadow:0 0 4px var(--rf-good)}.wp-cr .dot.idle{background:var(--rf-gold)}
.wp-cr.empty{color:var(--rf-disabled);border-style:dashed;background:none;cursor:default}.wp-cr.extra{opacity:.6}
.wp-main{display:flex;gap:6px;align-items:stretch}
.wp-side{width:188px;flex:none;display:flex;flex-direction:column;gap:3px}
.wp-list{height:192px}
.wp-all{height:21px;font-size:11px}
.wp-g{position:sticky;top:0;z-index:1;font:700 10.5px/1 Cinzel,serif;letter-spacing:.06em;text-transform:uppercase;color:var(--rf-accent);padding:5px 6px 4px;background:#140c09;border-bottom:1px solid var(--rf-rule)}
.wp-r{display:flex;align-items:center;gap:5px;height:30px;padding:0 5px 0 4px;cursor:pointer;border-bottom:1px solid #1d130e;box-shadow:inset 3px 0 0 transparent}
.wp-r:hover{background:var(--rf-hover)}.wp-r.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.wp-r .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px}
.wp-r .t{font-size:10.5px}.wp-r .t.short{color:var(--rf-bad)}
.wp-r.lock{color:var(--rf-disabled)}.wp-r.lock .wp-ic{opacity:.45;filter:grayscale(.7)}
.wp-ic{width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;background:#120b08;border:1px solid #2c1c14}
.wp-tier{font:700 9px/1 Cinzel,serif;color:var(--rf-muted);padding:2px 3px;border:1px solid #3a2418}.wp-tier.t2{color:var(--rf-gold);border-color:#6a5326}.wp-tier.t3{color:#e6a0ff;border-color:#5e3a6e}
.wp-lt{display:flex;align-items:center;justify-content:center;font:700 9px/1 Inter;color:var(--rf-accent);text-transform:uppercase}
.wp-det{flex:1;min-width:0;padding:7px 8px;background:var(--rf-sunk);border:1px solid var(--rf-rule);display:flex;flex-direction:column}
.wp-pick{align-items:center;justify-content:center;text-align:center;white-space:normal;line-height:1.5;padding:20px}
.wp-hd{display:flex;align-items:center;gap:7px}
.rf-cell.big{width:44px;height:44px;flex:none}
.wp-for{display:flex;align-items:center;gap:6px;margin-top:5px}.wp-for select{flex:1;min-width:0}
.wp-cmp{display:grid;grid-template-columns:1fr auto auto 12px;gap:1px 8px;font-size:11.5px;padding:3px 5px;background:#130c09;border:1px solid #24160f}
.wp-cmp .h{font:700 9.5px/1.4 Inter;letter-spacing:.06em;text-transform:uppercase;color:var(--rf-muted);text-align:right}
.wp-cmp>:nth-child(4n+1){color:var(--rf-muted)}.wp-cmp .o{text-align:right;color:var(--rf-muted)}.wp-cmp .n{text-align:right;color:var(--rf-ink)}
.wp-cmp .d{font-size:9px;text-align:center}.wp-cmp .d.up{color:var(--rf-good)}.wp-cmp .d.down{color:var(--rf-bad)}
.wp-in{display:flex;flex-wrap:wrap;align-items:center}
.wp-time{display:inline-flex;align-items:center;gap:3px;height:22px;margin:0 0 3px auto;padding-left:6px}
.wp-small{font-size:10.5px;line-height:13px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wp-odds{display:flex;height:6px;box-shadow:0 0 0 1px #0e0907}.wp-odds i{display:block;height:6px}
.wp-go{width:100%;margin-top:auto;margin-bottom:0}
.wp-det .wp-go{margin-top:8px}
.wp-why{font-size:11px;margin-top:3px;text-align:center;white-space:normal}
.wp-queue{display:grid;grid-template-columns:repeat(${CRAFT.queue},1fr);gap:3px}
.wp-qs{position:relative;height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:radial-gradient(circle at 50% 35%,#2a1b13,#120b08);border:1px solid #3a2418}
.wp-qs.on{border-color:#6a5326;box-shadow:0 0 6px rgba(224,184,103,.25)}
.wp-qs.empty{background:#0f0907;border:1px dashed #2a1a12}
.wp-qs .x{position:absolute;right:1px;top:1px;width:14px;height:14px;padding:0;border:0;background:none;color:var(--rf-muted);font-size:10px;line-height:14px}.wp-qs .x:hover{color:var(--rf-bad)}
.wp-fold{cursor:pointer}
.wp-m{display:flex;align-items:center;gap:5px;padding:3px 0}
`;
