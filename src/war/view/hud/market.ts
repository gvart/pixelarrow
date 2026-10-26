/**
 * M6k market panels in the red-figure kit (docs/WAR.md "Trade"; data: ../trade/market.ts, the server in net mode, a
 * local stub offline). Two draggable windows:
 *
 *   Market (K, the corner's Market button)   tabs over one town (this region):
 *     Stall       rent a stall or warehouse (rent a day from the strongroom), the stall's level and upgrade, what each
 *                 holds against its 20 loads, stow goods in from the selected squad (out again); your men in the court
 *     Offers      list a sell offer or a buy order: the escrow it takes out of the stall, standing (Trader); your open
 *                 ones with what is left, cancel (escrow back)
 *     Board       player offers only: best bid and ask with depth by good, take n of the best (not your own), every
 *                 goods offer by id to take part of, items, the last fills
 *     Contracts   open and taken carry / supply / escort contracts at or bound for the town, take one (a carry escrows
 *                 half its value); post one (its reward escrowed)
 *     Letters     a Banker's letter of credit to another town (coin escrowed there), buy one named to you, redeem it at B
 *   Hand-off (the Market header's button)   both carriers here and within 4 tiles: each puts in a half, both confirm,
 *                 the halves swap at once or not at all; the window closes on a walk-off, a cancel or 60 s
 */
import { GOODS } from '../../net/protocol';
import { MARKET_TOWNS } from '../../world-view/geo';
import type { SandboxScene } from '../SandboxScene';
import {
  failed, LocalMarket, netMarket, RENT, SITE_LOADS, siteLoads, STALL_OFFERS, STALL_UPGRADE,
  type Board, type BoardOffer, type Contract, type ContractKind, type Goods, type Handoff, type Market, type Mine, type Res,
} from '../trade/market';
import { draggable } from './drag';
import { bar, fitHeight, icon } from './kit';
import { keys } from '../../input/keys';
import { myTeam } from '../side';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type Tab = 'Stall' | 'Offers' | 'Board' | 'Contracts' | 'Letters';
const TABS: Tab[] = ['Stall', 'Offers', 'Board', 'Contracts', 'Letters'];
const W = 340;
const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'pitch', 'hides', 'flax', 'herbs', 'charcoal', 'leather', 'linen', 'oil', 'coin']);
const gi = (r: string | null) => (r && ICONED.has(r) ? icon('res-' + r) : '');
const fmt = (n: number) => (Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const town = (t: string) => t.replace(/(^|-)([a-z])/g, (_, d, c) => (d ? ' ' : '') + c.toUpperCase());
const ago = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const inH = (ms: number) => { const h = ms / 3_600_000; return h <= 0 ? 'expired' : h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)} h`; };
const goodsLine = (g: Goods) => Object.entries(g).filter(([, n]) => n > 0.05).map(([r, n]) => `<span style="display:inline-flex;align-items:center;gap:2px;margin-right:6px">${gi(r)}<span class="rf-num">${fmt(n)}</span>${gi(r) ? '' : ` ${r}`}</span>`).join('') || '<span class="rf-dim">empty</span>';
const opts = (list: readonly string[], cur: string) => list.map((x) => `<option value="${x}"${x === cur ? ' selected' : ''}>${x}</option>`).join('');
const KIND_TIP: Record<ContractKind, string> = { carry: 'carry sealed loads from here to the town; paid on delivery, half its value escrowed by the taker', supply: 'bring the goods to the town; paid as they arrive', escort: 'escort the poster\'s cart there; paid when it arrives with 75% of its cargo' };

const CSS = `
#rfMarket select,#rfHandoff select{font:600 12px/1 Inter,sans-serif;height:23px;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);padding:0 2px}
#rfMarket input[type=number],#rfHandoff input[type=number]{width:52px}
#rfMarket .mk-row,#rfHandoff .mk-row{display:flex;align-items:center;gap:4px;padding:2px 2px;min-height:24px}
#rfMarket .mk-form,#rfHandoff .mk-form{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px;margin:4px 0;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
#rfMarket .mk-b,#rfHandoff .mk-b{height:20px;padding:0 6px;font-size:11px}
#rfMarket .mk-pill{font:700 10.5px/14px Inter,sans-serif;padding:0 4px;border:1px solid var(--rf-line);background:var(--rf-sunk);white-space:nowrap}
#rfMarket .mk-sell{color:var(--rf-good)} #rfMarket .mk-buy{color:var(--rf-gold)}
#rfMarket .mk-msg,#rfHandoff .mk-msg{margin-top:4px;min-height:15px}
#rfMarket .mk-msg.bad,#rfHandoff .mk-msg.bad{color:var(--rf-bad)}
#rfMarket .mk-tabs .rf-tab{padding:0 7px;margin-right:1px}
#rfMarket .mk-tabs{display:flex;align-items:flex-end;height:24px;margin:4px 0 0;border-bottom:1px solid var(--rf-rule)}
#rfMarket table{width:100%;border-collapse:collapse}
#rfMarket td,#rfMarket th{padding:2px 3px;text-align:right;white-space:nowrap}
#rfMarket th{font:700 11px/1.2 Cinzel,serif;color:var(--rf-accent);border-bottom:1px solid var(--rf-rule)}
#rfMarket td:first-child,#rfMarket th:first-child{text-align:left}
#rfHandoff .mk-half{flex:1;min-width:0;padding:4px;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
#rfHandoff .mk-half.ok{border-color:var(--rf-good)}
`;

export interface MarketHud { open(tab?: Tab): void; refresh(): void }

export function mountMarket(s: SandboxScene, mk: Mk): MarketHud {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const M: Market = s.sim.net ? netMarket(s) : new LocalMarket(s);
  const T = s.region.id;
  const isTown = MARKET_TOWNS.has(T) || (s.region.safe?.length ?? 0) > 0;

  // ---------- state ----------
  let tab: Tab = 'Stall';
  let mine: Mine = { sites: [], offers: [] }, board: Board | null = null, contracts: Contract[] = [];
  let msg = '', bad = false;
  const form = { side: 'sell' as 'sell' | 'buy', res: 'tin', n: 10, price: 10, standing: false, stowRes: 'iron', stowN: 10, stowSite: 'stall' as 'stall' | 'warehouse', take: 5,
    cKind: 'carry' as ContractKind, cTo: 'stymphalia', cReward: 50, cRes: 'iron', cN: 20, cValue: 300, cLoads: 4, cHours: 24, lTo: 'stymphalia', lAmount: 200, lFee: 10, lId: 0 };

  // ---------- the windows ----------
  const win = mk('rfMarket', `top:92px;left:4px;width:${W}px;display:none;pointer-events:auto;padding:4px 8px 8px`);
  win.classList.add('rf-card');
  draggable(win, '.rf-head');
  const hand = mk('rfHandoff', `top:92px;left:${W + 12}px;width:300px;display:none;pointer-events:auto;padding:4px 8px 8px`);
  hand.classList.add('rf-card');
  draggable(hand, '.rf-head');

  // the corner's Market button (K)
  const corner = document.getElementById('rfDev');
  const mBtn = document.createElement('button');
  mBtn.className = 'rf-tbtn';
  mBtn.id = 'rfMarketBtn';
  mBtn.textContent = 'Market K';
  mBtn.title = 'the market here: stall, offers, price board, contracts, letters (K)';
  mBtn.onclick = () => toggle();
  corner?.insertBefore(mBtn, corner.children[1] ?? null);

  const say = (t: string, isBad = false) => { msg = t; bad = isBad; };
  const run = async <T>(p: Promise<Res<T>>, okText: (v: T) => string): Promise<boolean> => {
    const r = await p;
    if (failed(r)) { say(r.error, true); render(); return false; }
    say(okText(r));
    await load();
    return true;
  };
  const load = async () => {
    const [a, b, c] = await Promise.all([M.mine(T), M.board(T), M.contracts(T)]);
    if (!failed(a)) mine = a; else say(a.error, true);
    if (!failed(b)) board = b;
    if (!failed(c)) contracts = c.contracts;
    render();
  };
  const own = () => s.siege.own();
  /** Own living men inside the town's safe court(s). */
  const inCourt = () => {
    const safe = s.region.safe ?? [];
    return (s.sim.cur?.units ?? []).filter((u) => u.state !== 'dead' && s.sim.squads.get(u.squad)?.team === myTeam() && safe.some((r) => u.x >= r.x && u.x < r.x + r.w && u.y >= r.y && u.y < r.y + r.h)).length;
  };
  const stall = () => mine.sites.find((x) => x.kind === 'stall') ?? null;
  const btn = (act: string, label: string, okay = true, extra = '', title = '', cls = 'rf-tbtn mk-b') => `<button class="${cls}" data-act="${act}" ${extra} ${okay ? '' : 'disabled'} title="${title}">${label}</button>`;
  const num = (k: keyof typeof form, w = 52, min = 1) => `<input type="number" data-f="${k}" min="${min}" value="${form[k] as number}" style="width:${w}px">`;
  const sel = (k: keyof typeof form, list: readonly string[]) => `<select data-f="${k}">${opts(list, form[k] as string)}</select>`;
  const towns = [...MARKET_TOWNS].filter((x) => x !== T).sort();

  // ---------- tabs ----------
  const stallTab = () => {
    const site = (kind: 'stall' | 'warehouse') => {
      const x = mine.sites.find((y) => y.kind === kind);
      if (!x) return `<div class="mk-row">${icon(kind === 'stall' ? 'trade-rent' : 'trade-chest')}<span style="flex:1"><b>${kind === 'stall' ? 'Stall' : 'Warehouse'}</b> <span class="rf-dim">not rented</span></span>${btn('rent', `Rent · ${RENT} ${icon('res-coin')}/day`, isTown, `data-k="${kind}"`, `rent a ${kind} here (the first day's rent from your home strongroom)`)}</div>`;
      const loads = siteLoads(x.goods), paid = x.paid_to === null ? 'no rent here' : x.paid_to < Date.now() ? '<span style="color:var(--rf-bad)">rent due: locked after 3 days</span>' : `paid ${inH(x.paid_to - Date.now())} ahead`;
      const up = kind === 'stall' ? STALL_UPGRADE[x.level + 1] : undefined;
      return `<div style="margin:4px 0 6px"><div class="mk-row">${icon(kind === 'stall' ? 'trade-rent' : 'trade-chest')}<span style="flex:1"><b>${kind === 'stall' ? `Stall L${x.level}` : 'Warehouse'}</b> <span class="rf-dim">${paid}</span></span>${up ? btn('upgrade', `Upgrade L${x.level + 1}`, true, '', `takes ${Object.entries(up).map(([r, n]) => `${n} ${r}`).join(' + ')} from the stall: ${STALL_OFFERS[x.level + 1]} offers`) : ''}</div>
        ${bar('ok', loads / SITE_LOADS, W - 20)}<div class="rf-dim" style="margin:2px 0 3px">${fmt(loads)} / ${SITE_LOADS} loads${kind === 'stall' ? ` · ${mine.offers.length} / ${STALL_OFFERS[x.level]} offers` : ''}</div><div style="display:flex;flex-wrap:wrap">${goodsLine(x.goods)}</div></div>`;
    };
    const q = own(), court = inCourt();
    const rented = mine.sites.filter((x) => x.kind !== 'strongroom').map((x) => x.kind);
    return `<div class="rf-dim" style="margin:4px 0">${isTown ? `${(s.region.safe?.length ?? 0) ? 'Safe market court' : 'Market town'} · your men in the court <b class="rf-num" style="color:var(--rf-ink)">${court}</b> / 6` : 'No market here: rent in a market town'}</div>
      ${site('stall')}${site('warehouse')}
      <div class="rf-cap" style="margin-top:6px">Stow <span class="rf-dim">${M.live ? (q.length ? `squad #${q[0]}'s packs` : 'select a squad in the court') : 'your stock (offline)'}</span></div>
      <div class="mk-form">${sel('stowRes', GOODS)}${num('stowN')}${sel('stowSite', rented.length ? rented : ['stall'])}${btn('stowIn', 'In ▸', !!rented.length && (!M.live || q.length > 0), '', 'from the squad into the site')}${btn('stowOut', '◂ Out', !!rented.length && (!M.live || q.length > 0), '', 'from the site back to the squad')}</div>`;
  };

  const offersTab = () => {
    const st = stall(), escrow = form.side === 'buy' ? `${fmt(form.n * form.price)} ${icon('res-coin')}` : `${fmt(form.n)} ${gi(form.res) || form.res}`;
    const rows = mine.offers.map((o) => `<div class="mk-row rf-row"><span class="mk-pill ${o.side === 'sell' ? 'mk-sell' : 'mk-buy'}">${o.side === 'sell' ? 'SELL' : 'BUY'}</span>${gi(o.res)}<span style="flex:1">${o.res ?? o.item_uid}${o.standing ? ' <span class="rf-dim">standing</span>' : ''}</span><span class="rf-num">${fmt(o.left)}/${fmt(o.n)}</span><span class="rf-num" style="width:44px;text-align:right">@${o.price}</span>${btn('cancel', '×', true, `data-id="${o.id}"`, 'cancel: the escrow goes back to the stall', 'rf-tbtn x')}</div>`).join('');
    return `<div class="mk-form" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:4px;align-items:center"><div style="display:flex;gap:2px">${btn('side', 'Sell', true, 'data-v="sell"', 'a sell offer: the goods leave your stall into escrow', `rf-tbtn mk-b${form.side === 'sell' ? ' on' : ''}`)}${btn('side', 'Buy order', true, 'data-v="buy"', 'a buy order: its coin leaves your stall into escrow', `rf-tbtn mk-b${form.side === 'buy' ? ' on' : ''}`)}</div><label class="rf-dim" style="margin-left:auto;display:flex;align-items:center;gap:3px" title="Trader: re-arms from the stall when filled out"><input type="checkbox" data-f="standing" ${form.standing ? 'checked' : ''} style="width:auto;height:auto">standing</label></div>
        <div style="display:flex;gap:4px;align-items:center">${sel('res', GOODS.filter((g) => g !== 'coin'))}<span class="rf-dim">n</span>${num('n')}<span class="rf-dim">@</span>${num('price', 46)}${icon('res-coin')}</div>
        <div style="display:flex;gap:4px;align-items:center"><span class="rf-dim" style="flex:1">escrow from the stall: <span style="display:inline-flex;align-items:center;gap:2px;color:var(--rf-ink)">${escrow}</span></span>${btn('list', form.side === 'sell' ? 'List offer' : 'Post order', !!st, '', st ? '' : 'rent a stall first', 'rf-tbtn mk-b pri')}</div></div>
      <div class="rf-cap" style="margin-top:6px">Your offers <span class="rf-dim">${st ? `${mine.offers.length} / ${STALL_OFFERS[st.level]} at a L${st.level} stall` : 'no stall'}</span></div>
      ${rows || '<div class="rf-dim" style="padding:2px">none open</div>'}`;
  };

  const boardTab = () => {
    if (!board) return '<div class="rf-dim" style="margin:6px 0">loading the board…</div>';
    const g = Object.entries(board.goods).sort((a, b) => b[1].askDepth + b[1].bidDepth - a[1].askDepth - a[1].bidDepth);
    // the best offer on each side that is not mine (the board lists them best first); a take is at most what is left
    const best = (r: string, side: 'sell' | 'buy') => board!.offers.find((o) => o.res === r && o.side === side && o.player !== M.me);
    const take = (o: BoardOffer | undefined, label: string) => btn('fill', label, !!o, o ? `data-id="${o.offer}" data-left="${o.n}"` : '', !o ? 'none listed but yours'
      : o.side === 'sell' ? `buy up to ${fmt(o.n)} at ${o.price} from #${o.player}'s stall: coin from your warehouse, then stall` : `sell up to ${fmt(o.n)} at ${o.price} into #${o.player}'s order: goods from your stall, then warehouse`);
    const rows = g.map(([r, x]) => `<tr class="rf-row"><td><span style="display:inline-flex;align-items:center;gap:3px">${gi(r)}${r}</span></td><td class="mk-buy">${x.bid ?? '–'} <span class="rf-dim">${x.bidDepth ? fmt(x.bidDepth) : ''}</span></td><td>${take(best(r, 'buy'), 'Sell')}</td><td class="mk-sell">${x.ask ?? '–'} <span class="rf-dim">${x.askDepth ? fmt(x.askDepth) : ''}</span></td><td>${take(best(r, 'sell'), 'Buy')}</td></tr>`).join('');
    const offers = board.offers.map((o) => `<div class="mk-row rf-row"><span class="mk-pill ${o.side === 'sell' ? 'mk-sell' : 'mk-buy'}">${o.side === 'sell' ? 'ASK' : 'BID'}</span>${gi(o.res)}<span style="flex:1">${o.res} <span class="rf-dim">${o.player === M.me ? 'yours' : `#${o.player}'s stall`}</span></span><span class="rf-num">${fmt(o.n)}</span><span class="rf-num" style="width:44px;text-align:right">@${o.price}</span>${o.player === M.me ? '' : take(o, o.side === 'sell' ? 'Buy' : 'Sell')}</div>`).join('');
    const items = board.items.map((it) => `<div class="mk-row rf-row"><span style="flex:1">${it.uid}</span><span class="rf-num">${it.price}</span>${icon('res-coin')}${btn('fill', 'Buy', true, `data-id="${it.offer}" data-n="1"`)}</div>`).join('');
    const fills = board.fills.map((f) => `<div class="mk-row" style="min-height:18px">${gi(f.res)}<span style="flex:1">${fmt(f.n)} ${f.res ?? 'item'} @ ${f.price}</span><span class="rf-dim">${ago(Date.now() - f.at)}</span></div>`).join('');
    return `<div class="rf-dim" style="margin:4px 0">Player offers only · take <input type="number" data-f="take" min="1" value="${form.take}" style="width:44px"> of the best</div>
      <table><tr><th>Good</th><th>Bid</th><th></th><th>Ask</th><th></th></tr>${rows || '<tr><td colspan="5" class="rf-dim">no offers listed</td></tr>'}</table>
      ${offers ? `<div class="rf-cap" style="margin-top:6px">Offers <span class="rf-dim">each one, best first</span></div>${offers}` : ''}
      ${items ? `<div class="rf-cap" style="margin-top:6px">Items</div>${items}` : ''}
      <div class="rf-cap" style="margin-top:6px">Last fills</div>${fills || '<div class="rf-dim">none yet</div>'}`;
  };

  const contractsTab = () => {
    const now = Date.now(), me = M.me;
    const rows = contracts.map((c) => {
      const what = c.kind === 'supply' ? `${fmt(c.n)} ${c.res}${c.delivered ? ` (${fmt(c.delivered)} in)` : ''}` : c.kind === 'carry' ? `${fmt(c.n)} sealed loads · value ${c.value}` : 'the poster\'s cart';
      const can = c.state === 'open' && c.poster !== me;
      return `<div class="rf-row" style="padding:3px 2px;border-bottom:1px solid var(--rf-rule)"><div class="mk-row" style="padding:0;min-height:20px">${icon('trade-contract')}<b style="text-transform:capitalize" title="${KIND_TIP[c.kind]}">${c.kind}</b><span class="rf-dim" style="flex:1">${town(c.town)} → ${town(c.to_town)}</span><span class="rf-num">${c.reward}</span>${icon('res-coin')}</div>
        <div class="mk-row" style="padding:0 0 0 28px;min-height:20px"><span style="flex:1;display:inline-flex;align-items:center;gap:3px">${gi(c.res)}${what}</span><span class="rf-dim">${c.state === 'taken' ? (c.taker === me ? 'yours' : 'taken') : inH(c.deadline - now)}</span>${c.state === 'open' ? btn('take', 'Take', can, `data-id="${c.id}"`, c.poster === me ? 'your own contract' : c.kind === 'carry' ? `escrows half its value (${c.deposit || Math.round(c.value / 2)} coin)` : 'take it') : ''}</div></div>`;
    }).join('');
    const extra = form.cKind === 'supply' ? `${sel('cRes', GOODS.filter((g) => g !== 'coin'))}<span class="rf-dim">n</span>${num('cN')}` : form.cKind === 'carry' ? `<span class="rf-dim">loads</span>${num('cLoads', 40)}<span class="rf-dim">value</span>${num('cValue')}` : '';
    return `<div class="rf-cap" style="margin-top:6px">At or bound for ${town(T)}</div>${rows || '<div class="rf-dim" style="padding:2px">no open contracts</div>'}
      <div class="rf-cap" style="margin-top:8px">Post a contract <span class="rf-dim">reward escrowed</span></div>
      <div class="mk-form">${sel('cKind', ['carry', 'supply', 'escort'])}<span class="rf-dim">to</span>${sel('cTo', towns)}${extra}<span class="rf-dim">reward</span>${num('cReward')}${icon('res-coin')}<span class="rf-dim">within</span>${num('cHours', 40)}<span class="rf-dim">h</span>${btn('post', 'Post', true, '', KIND_TIP[form.cKind], 'rf-tbtn mk-b pri')}</div>`;
  };

  const lettersTab = () => {
    const ls = M.letters();
    const rows = ls.map((l) => `<div class="mk-row rf-row">${icon('trade-contract')}<span style="flex:1">#${l.id} ${town(l.town)} → ${town(l.toTown)} <span class="rf-dim">${l.mine === 'banker' ? 'yours (Banker)' : l.state}</span></span><span class="rf-num">${l.amount}</span>${icon('res-coin')}${l.state === 'offered' && l.mine !== 'banker' ? btn('buyL', `Buy +${l.fee}`, true, `data-id="${l.id}"`, `pay ${l.amount} + ${l.fee} fee here; named to you, redeemed at ${town(l.toTown)}`) : ''}${l.state === 'sold' && l.mine === 'buyer' ? btn('redeemL', 'Redeem', l.toTown === T, `data-id="${l.id}"`, l.toTown === T ? 'once, here' : `redeem at ${town(l.toTown)}`) : ''}${l.state === 'redeemed' ? '<span class="rf-dim">redeemed</span>' : ''}</div>`).join('');
    return `<div class="rf-dim" style="margin:4px 0">Coin moves without a cart: a Banker escrows it at the far town; the buyer pays here and redeems it there, once.</div>
      ${rows || '<div class="rf-dim" style="padding:2px">no letters yet</div>'}
      <div class="rf-cap" style="margin-top:8px">Offer a letter <span class="rf-dim">Banker · stall L3</span></div>
      <div class="mk-form"><span class="rf-dim">to</span>${sel('lTo', towns)}${num('lAmount')}${icon('res-coin')}<span class="rf-dim">fee</span>${num('lFee', 40, 0)}${btn('offerL', 'Offer', true, '', 'its coin is escrowed at the far town from your strongroom', 'rf-tbtn mk-b pri')}</div>
      <div class="mk-form"><span class="rf-dim">letter #</span>${num('lId', 60, 0)}${btn('buyL', 'Buy', true, 'data-id="form"')}${btn('redeemL', 'Redeem', true, 'data-id="form"')}</div>`;
  };

  const BODY: Record<Tab, () => string> = { Stall: stallTab, Offers: offersTab, Board: boardTab, Contracts: contractsTab, Letters: lettersTab };
  const render = () => {
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop;
    win.innerHTML = `<div class="rf-head">${icon('node-merchant-trader', 32)}<div style="flex:1;min-width:0"><div class="rf-name">Market · ${town(T)}</div><div class="rf-dim" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${M.live ? 'live' : 'offline stub'} · <span style="color:var(--rf-gold)">${Math.floor(s.sim.cur?.stock?.[myTeam()]?.coin ?? 0)}</span> coin at home</div></div>${btn('handoff', 'Hand-off', true, '', 'trade with a player here, both present: each puts in a half, both confirm')}<button class="rf-tbtn x" data-act="close" title="close (K)">×</button></div>
      <div class="mk-tabs">${TABS.map((t) => `<button class="rf-tab${t === tab ? ' on' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>
      ${BODY[tab]()}<div class="mk-msg rf-dim${bad ? ' bad' : ''}">${msg}</div>`;
    win.scrollTop = scroll;
    fitHeight(win);
    win.style.overflowX = 'hidden';
  };

  // ---------- events ----------
  win.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement, k = el.dataset.f as keyof typeof form | undefined;
    if (!k) return;
    const f = form as Record<string, unknown>;
    f[k] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el instanceof HTMLInputElement && el.type === 'number' ? Number(el.value) : el.value;
    if (k === 'cKind' || k === 'side' || k === 'res' || k === 'n' || k === 'price') { if (el instanceof HTMLSelectElement) render(); else upd(); }
  });
  /** Refresh the escrow line without losing the field being typed in. */
  const upd = () => {
    const sp = win.querySelector<HTMLElement>('.mk-form span.rf-dim[style*="flex:1"] span');
    if (sp && tab === 'Offers') sp.innerHTML = form.side === 'buy' ? `${fmt(form.n * form.price)} ${icon('res-coin')}` : `${fmt(form.n)} ${gi(form.res) || form.res}`;
  };
  win.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    if (t.dataset.tab) { tab = t.dataset.tab as Tab; say(''); render(); return; }
    const a = t.dataset.act!, id = t.dataset.id === 'form' ? form.lId : Number(t.dataset.id);
    if (a === 'close') return toggle(false);
    if (a === 'handoff') return openHand();
    if (a === 'side') { form.side = t.dataset.v as 'sell' | 'buy'; render(); return; }
    if (a === 'rent') void run(M.rent(T, t.dataset.k as 'stall' | 'warehouse'), () => `${t.dataset.k} rented: ${RENT} coin a day`);
    else if (a === 'upgrade') void run(M.upgrade(T), (r) => `stall now level ${r.level}`);
    else if (a === 'list') void run(M.list(T, { side: form.side, res: form.res, n: form.n, price: form.price, ...(form.standing ? { standing: true } : {}) }), (r) => `${form.side === 'sell' ? 'offer' : 'buy order'} #${r.offer} listed; its escrow left the stall`);
    else if (a === 'cancel') void run(M.cancel(id), () => 'cancelled: the escrow is back in the stall');
    else if (a === 'fill') void run(M.fill(id, Number(t.dataset.n) || Math.min(form.take, Number(t.dataset.left) || Infinity)), (r) => `filled ${fmt(r.n)} at ${r.price}${r.tax ? ` (tax ${fmt(r.tax)})` : ''}`);
    else if (a === 'take') void run(M.take(id), () => 'contract taken');
    else if (a === 'post') void run(M.post(T, { kind: form.cKind, toTown: form.cTo, reward: form.cReward, deadline: Date.now() + form.cHours * 3_600_000, ...(form.cKind === 'supply' ? { res: form.cRes, n: form.cN } : form.cKind === 'carry' ? { loads: form.cLoads, value: form.cValue } : {}) }), (r) => `contract #${r.contract} posted; its reward is escrowed`);
    else if (a === 'offerL') void run(M.letter(T, form.lTo, form.lAmount, form.lFee), (r) => `letter #${r.letter} offered`);
    else if (a === 'buyL') void run(M.buyLetter(id), () => `letter #${id} is yours: redeem it at its town`);
    else if (a === 'redeemL') void run(M.redeem(id), (r) => `redeemed: ${r.coin} coin`);
    else if (a === 'stowIn' || a === 'stowOut') {
      const q = own()[0] ?? 0;
      M.stow(a === 'stowIn' ? 'in' : 'out', form.stowSite, q, { [form.stowRes]: form.stowN }, (r) => {
        if (failed(r)) { say(r.error, true); render(); } else { say(`${a === 'stowIn' ? 'stowed' : 'took out'} ${goodsText(r.goods)}`); void load(); }
      });
    }
  });
  const goodsText = (g: Goods) => Object.entries(g).map(([r, n]) => `${fmt(n)} ${r}`).join(', ') || 'nothing';

  // ---------- hand-off ----------
  let h: Handoff | null = null, half: Goods = {}, withId = M.live ? 0 : 2, hRes = 'iron', hN = 10, hMsg = '';
  M.on((x) => {
    h = x;
    hMsg = x.state === 'done' ? 'done: the halves swapped' : x.state === 'closed' ? `closed: ${x.why ?? 'cancelled'}` : '';
    if (x.state !== 'open') h = { ...x };
    renderHand();
    if (x.state === 'done') void load();
  });
  const openHand = () => { hand.style.display = ''; renderHand(); };
  const renderHand = () => {
    if (hand.style.display === 'none') return;
    const open = h?.state === 'open', me = M.me, theirs = h?.halves[withId], mineH = h?.halves[me];
    const left = open && h?.until !== undefined ? Math.max(0, Math.ceil((h.until - (s.sim.cur?.tick ?? 0)) / 10)) : null;
    const halfBox = (title: string, g: Goods | undefined, ok: boolean, edit: boolean) => `<div class="mk-half${ok ? ' ok' : ''}"><div class="rf-cap">${title}${ok ? ' <span style="color:var(--rf-good)">✓</span>' : ''}</div><div style="display:flex;flex-wrap:wrap;min-height:24px">${g && Object.keys(g).length ? goodsLine(g) : '<span class="rf-dim">nothing yet</span>'}</div>${edit ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px">${Object.keys(half).map((r) => `<button class="rf-tbtn mk-b" data-act="hDel" data-r="${r}" title="take out">${gi(r)}${fmt(half[r])} ×</button>`).join('')}</div>` : ''}</div>`;
    hand.innerHTML = `<div class="rf-head">${icon('act-unload', 32)}<div style="flex:1;min-width:0"><div class="rf-name">Hand-off</div><div class="rf-dim">both here, carriers within 4 tiles${left !== null ? ` · <b style="color:var(--rf-ink)">${left} s</b> left` : ''}</div></div><button class="rf-tbtn x" data-act="hClose" title="close">×</button></div>
      <div class="mk-row" style="margin-top:4px;white-space:nowrap"><span class="rf-dim">with</span>${M.live ? `<span class="rf-dim">player</span><input type="number" data-h="with" min="1" value="${withId || ''}" style="width:80px" ${open ? 'disabled' : ''}>` : '<b>Lykon</b> <span class="rf-dim">a made-up trader</span>'}</div>
      <div style="display:flex;gap:4px;margin:4px 0">${halfBox('You give', open ? mineH?.goods : half, !!h?.ok.includes(me), true)}${halfBox('You get', theirs?.goods, !!h?.ok.includes(withId), false)}</div>
      <div class="mk-form"><select data-h="res">${opts(GOODS, hRes)}</select><input type="number" data-h="n" min="1" value="${hN}">${btn('hAdd', '+ add', true)}<span class="rf-dim" style="flex:1;text-align:right;white-space:nowrap">${M.live ? (own().length ? `squad #${own()[0]}` : 'select a squad') : 'your stock'}</span></div>
      <div style="display:flex;gap:4px">${btn('hOffer', open ? 'Update my half' : 'Open · offer my half', (!M.live || (withId > 0 && own().length > 0)) && Object.keys(half).length > 0, '', 'put your half in (a change: both confirm again)', 'rf-tbtn mk-b pri')}${btn('hConfirm', 'Confirm', !!open && !!theirs && !!mineH && !h?.ok.includes(me), '', 'both confirm: the halves swap at once or not at all')}${btn('hCancel', 'Cancel', !!open)}</div>
      <div class="mk-msg${h?.state === 'closed' ? ' bad' : ' rf-dim'}">${hMsg || (open ? (theirs ? 'both halves in: confirm' : 'waiting for their half') : '')}</div>`;
  };
  hand.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.h === 'with') withId = Number(el.value);
    else if (el.dataset.h === 'res') hRes = el.value;
    else if (el.dataset.h === 'n') hN = Number(el.value);
  });
  hand.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const a = t.dataset.act!, q = own()[0] ?? null;
    if (a === 'hClose') { hand.style.display = 'none'; return; }
    if (a === 'hAdd') { if (hN > 0) half[hRes] = (half[hRes] ?? 0) + hN; }
    else if (a === 'hDel') delete half[t.dataset.r!];
    else if (a === 'hOffer') { hMsg = ''; M.handoff('offer', withId, q, half); }
    else if (a === 'hConfirm') M.handoff('confirm', withId, q, {});
    else if (a === 'hCancel') { M.handoff('cancel', withId, q, {}); half = {}; }
    renderHand();
  });

  // ---------- open / close ----------
  const toggle = (on = win.style.display === 'none') => {
    win.style.display = on ? '' : 'none';
    mBtn.classList.toggle('on', on);
    if (on) { render(); void load(); }
  };
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (keys.is(e, 'panel.market')) toggle();
  });
  // timers (rent, the hand-off countdown) and what the region holds: once a second while shown
  setInterval(() => {
    if (hand.style.display !== 'none' && h?.state === 'open') renderHand();
    if (win.style.display !== 'none' && tab === 'Stall' && !win.contains(document.activeElement)) render();
  }, 1000);

  return { open: (t) => { if (t) tab = t; toggle(true); if (t) render(); }, refresh: render };
}
