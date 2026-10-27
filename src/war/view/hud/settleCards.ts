/**
 * W-63 shared settlements on the HUD as HTML (./settlements.ts mounts them): the settlement card (the town card grown
 * up, after Total War's settlement panel and Crusader Kings' vassal rows), the Holdings panel (the lord's requests and
 * offers with their clocks), the attack notice and the founding hint. Pure: data in, HTML out.
 */
import { ALLIANCES } from '../../world/alliances';
import { TEAM_CSS } from '../../world/palette';
import { worldRegion } from '../../world/graph';
import type { SettlementNet } from '../../net/protocol';
import { left, levelName, SETTLE_UI, type Inbox, type OfferRow, type SettleDetail, type SettleMember, type WorldSettlement } from '../../net/settlements';
import { TOWN_LEVELS, TOWN_MAX } from '../../sim/townLevel';
import type { TownLevelSnap } from '../../types';
import { glyph } from './glyph';
import { bar, icon, ring } from './kit';
import { townProgress, townReqs } from './peaceCards';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Who the player is to a settlement. */
export type Viewer = 'lord' | 'citizen' | 'garrison' | 'overlord' | 'visitor';

/** The player's standing at `s` (the room's role, else overlord when he rules its overlord). */
export function viewerOf(s: SettlementNet, realm: readonly number[]): Viewer {
  if (s.role === 'lord') return 'lord';
  if (s.role === 'citizen') return 'citizen';
  if (s.overlord !== null && realm.includes(s.overlord)) return 'overlord';
  return s.role === 'garrison' ? 'garrison' : 'visitor';
}

/** Whose banner a settlement's men fight under, in words. */
export const bannerOf = (s: Pick<SettlementNet, 'team' | 'lordName'>) => (s.team !== null && ALLIANCES[s.team] ? `${ALLIANCES[s.team].name}'s` : `${s.lordName}'s own`);

/** The plain warning before asking to settle: settling turns your banner here. */
export const settleWarning = (s: Pick<SettlementNet, 'team' | 'lordName'>) => `Your men fight under ${bannerOf(s)} banner in this region`;

/** The open form on the card and what it holds. */
export interface SettleForm { open: 'terms' | 'truce' | 'rebel' | null; kind: 'vassal' | 'join'; tribute: number; from: number | null; bond: number }

export interface SettleCtx {
  s: SettlementNet;
  viewer: Viewer;
  detail: SettleDetail | null;
  /** Every settlement the client knows (names of overlords and vassals). */
  world: readonly WorldSettlement[];
  /** The settlements the player rules. */
  realm: readonly WorldSettlement[];
  /** The player's living men on its ground now. */
  men: number;
  town: TownLevelSnap | null;
  inbox: Inbox | null;
  form: SettleForm;
  msg: string;
  bad: boolean;
  online: boolean;
  now: number;
}

const ROLE_PILL: Record<Viewer, [string, string]> = {
  lord: ['gold', 'Lord'], citizen: ['good', 'Citizen'], garrison: ['', 'Garrison'], overlord: ['gold', 'Overlord'], visitor: ['', 'Visitor'],
};

/** A banner chip: the alliance's colour and name, or "no banner". */
const bannerChip = (team: number | null) => team !== null && ALLIANCES[team]
  ? `<span class="st-flag" style="--c:${TEAM_CSS[team]}" data-tip="${esc(`<b class="k">${ALLIANCES[team].name}'s banner</b><br><span class="rf-dim tip-w">every man tied here fights for ${ALLIANCES[team].name} in this region</span>`)}"><i></i>${ALLIANCES[team].name}</span>`
  : `<span class="st-flag none" data-tip="${esc('<b class="k">No banner</b><br><span class="rf-dim tip-w">its lord serves no alliance</span>')}"><i></i>Free</span>`;

const avatar = (name: string, role: SettleRole | 'over' | 'vassal') => `<span class="st-av ${role}">${esc((name || '?').slice(0, 1).toUpperCase())}</span>`;
type SettleRole = SettleMember['role'];

const plotSize = (m: SettleMember) => (m.x0 === null ? '' : `${m.x1! - m.x0 + 1}×${m.y1! - m.y0! + 1}`);
const nameOf = (m: SettleMember) => m.name ?? `Player ${m.pid}`;

/** The standing line under the head: the role pill and what it means. */
function standing(c: SettleCtx): string {
  const { s, viewer } = c, [cls, label] = ROLE_PILL[viewer];
  const mine = c.detail?.members.find((m) => m.role === 'citizen' && c.s.plots.some((p) => p.pid === m.pid) && viewer === 'citizen');
  const what = viewer === 'lord' ? (s.overlord !== null ? 'You rule here, under an overlord' : 'You rule here')
    : viewer === 'citizen' ? `Your plot${mine ? ` · ${plotSize(mine)}` : ''} · build only on it`
    : viewer === 'overlord' ? `Your vassal${s.role === 'garrison' ? ' · your men garrison it' : ''}`
    : viewer === 'garrison' ? 'Your men garrison it'
    : `${esc(s.lordName)}'s ground · no building here`;
  return `<div class="st-stand"><span class="rf-pill ${cls}">${label}</span><span>${what}</span></div>`;
}

/** Fealty: the lord, the overlord with his tribute, the vassals with theirs. */
function fealty(c: SettleCtx): string {
  const { s } = c, over = s.overlord !== null ? c.world.find((w) => w.id === s.overlord) : null;
  const vassals = c.world.filter((w) => w.overlord_id === s.id);
  const row = (av: string, k: string, v: string, chip = '') => `<div class="st-row">${av}<span class="st-k">${k}</span><span class="st-v">${v}</span>${chip}</div>`;
  const out = [row(avatar(s.lordName, 'lord'), 'Lord', `<b>${esc(s.lordName)}</b>`, glyph('ui:laurel', 14))];
  if (s.overlord !== null) out.push(row(avatar(over?.name ?? '?', 'over'), 'Overlord', `<b>${esc(over?.name ?? `Settlement ${s.overlord}`)}</b>${over?.lord ? ` <span class="rf-dim">· ${esc(over.lord)}</span>` : ''}`,
    `<span class="rf-ichip gold st-trib" data-tip="${esc(`<b class="k">Tribute</b> · ${s.tribute}% of the goods and coin it gains goes to its overlord's lord`)}">${icon('res-coin')}${s.tribute}%</span>`));
  else out.push(row(`<span class="st-av free">${glyph('ui:flag', 14)}</span>`, 'Overlord', '<span class="rf-dim">none · owes no tribute</span>'));
  if (vassals.length) out.push(`<div class="st-vas">${vassals.map((v) => `<span class="st-vchip" data-tip="${esc(`<b class="k">${esc(v.name)}</b> · ${levelName(v.level)}, ${esc(worldRegion(v.region)?.name ?? v.region)}<br>lord ${esc(v.lord ?? '?')} · pays ${v.tribute_pct}%`)}">${glyph('ui:standard', 13)}${esc(v.name)}<i>${v.tribute_pct}%</i></span>`).join('')}</div>`);
  return `<div class="rf-sec">Fealty${vassals.length ? ` <span class="rf-dim">${vassals.length} vassal${vassals.length === 1 ? '' : 's'}</span>` : ''}</div>${out.join('')}`;
}

/** The citizens: name, role and plot. */
function citizens(c: SettleCtx): string {
  const ms = c.detail?.members ?? [];
  const order: Record<SettleRole, number> = { lord: 0, citizen: 1, garrison: 2 };
  const rows = [...ms].sort((a, b) => order[a.role] - order[b.role] || a.since - b.since).slice(0, 8).map((m) => {
    const tag = m.role === 'lord' ? '<span class="rf-pill gold">lord</span>' : m.role === 'garrison' ? '<span class="rf-pill">garrison</span>' : '<span class="rf-pill good">citizen</span>';
    return `<div class="st-cit">${avatar(nameOf(m), m.role)}<span class="st-cn">${esc(nameOf(m))}</span>${tag}<span class="st-plot rf-dim">${plotSize(m) || (m.role === 'lord' ? 'the ring' : '')}</span></div>`;
  });
  const more = ms.length > 8 ? `<div class="rf-dim" style="padding:2px 4px">and ${ms.length - 8} more</div>` : '';
  const n = ms.filter((m) => m.role !== 'garrison').length;
  return `<div class="rf-sec">Citizens <span class="rf-dim">${c.detail ? n : '…'}</span></div>${rows.join('') || `<div class="rf-dim st-empty">${c.detail ? 'only its lord' : c.online ? 'loading' : 'offline'}</div>`}${more}`;
}

/** Active truces that touch it (the ones the player can see: his own). */
function truces(c: SettleCtx): string {
  const ts = (c.inbox?.truces ?? []).filter((t) => t.to_settlement === c.s.id || t.from_settlement === c.s.id);
  if (!ts.length) return '';
  return `<div class="rf-sec">Truces</div>${ts.map((t) => {
    const other = t.to_settlement === c.s.id ? (c.world.find((w) => w.id === t.from_settlement)?.name ?? t.from_name ?? '?') : t.to_name;
    return `<div class="st-row">${glyph('ui:bond', 18)}<span class="st-v">with <b>${esc(other)}</b></span><span class="rf-ichip">${icon('res-coin')}${t.bond}</span><span class="rf-dim st-t">${left((t.ends_at ?? c.now) - c.now)}</span></div>`;
  }).join('')}`;
}

/** Growth: the town level's needs for the next level as small chips (the town card's checklist, compact). */
function growth(c: SettleCtx): string {
  const t = c.town;
  if (!t) return '';
  const reqs = townReqs(t), next = t.level < TOWN_MAX ? TOWN_LEVELS[t.level + 1].name : null;
  if (!next) return `<div class="rf-sec">Growth <span class="rf-dim">highest level</span></div>`;
  return `<div class="rf-sec">To ${next} <span class="rf-dim">${reqs.filter((r) => r.ok).length} / ${reqs.length}</span></div>
    <div class="st-reqs">${reqs.map((r) => `<span class="rf-ichip ${r.ok ? 'good' : ''}" data-tip="${esc(r.tip)}">${r.icon}${r.have || (r.ok ? 'yes' : 'no')}</span>`).join('')}</div>`;
}

/** The pending offer the player sent here, if any. */
const pendingOf = (c: SettleCtx): OfferRow | undefined => c.inbox?.outgoing.find((o) => o.to_settlement === c.s.id);

const KIND_WORD: Record<OfferRow['kind'], string> = { settle: 'Asked for a plot', vassal: 'Offered vassal terms', join: 'Demanded it join you', garrison: 'Asked to garrison', truce: 'Offered a truce' };

/** The action footer: what the player may do here, by standing; disabled ones say why. */
function actions(c: SettleCtx): string {
  const { s, viewer, form } = c, out: string[] = [];
  const btn = (act: string, label: string, opts: { pri?: boolean; bad?: boolean; why?: string; tip?: string; on?: boolean } = {}) =>
    `<button class="rf-tbtn${opts.pri ? ' pri' : ''}${opts.on ? ' on' : ''}${opts.bad ? ' st-bad' : ''}" data-sa="${act}"${opts.why ? ` disabled data-tip="${esc(`<span class="rf-hint">${opts.why}</span>`)}"` : opts.tip ? ` data-tip="${esc(opts.tip)}"` : ''}>${label}</button>`;
  const pend = pendingOf(c);
  if (pend) out.push(`<div class="st-pend">${glyph('ui:hourglass', 16)}<span>${KIND_WORD[pend.kind]} · answer within <b data-left="${pend.expires_at}">${left(pend.expires_at - c.now)}</b></span>${btn(`withdraw:${pend.id}`, 'Withdraw')}</div>`);
  const others = c.realm.filter((r) => r.id !== s.id);
  const short = c.men < SETTLE_UI.presence ? `${SETTLE_UI.presence} of your men must stand on its ground (you have ${c.men})` : '';
  if (viewer === 'visitor' || viewer === 'garrison') {
    if (viewer === 'visitor' && !pend) {
      out.push(`<div class="st-warn">${glyph('ui:banner', 16)}<span>${esc(settleWarning(s))}</span></div>`);
    }
    out.push(`<div class="st-acts">${viewer === 'visitor' ? btn('settle', 'Ask to settle', { pri: true, why: pend ? 'you have asked already' : '', tip: '<b class="k">Ask to settle</b><br><span class="rf-dim tip-w">its lord gives you a plot inside the ring, or refuses</span>' }) : ''}
      ${btn('terms', 'Offer terms', { on: form.open === 'terms', why: short, tip: '<b class="k">Offer terms</b><br><span class="rf-dim tip-w">your men stand on its ground: offer it vassalage under your settlement, or demand it join your land</span>' })}
      ${btn('truce', 'Truce', { on: form.open === 'truce', why: others.length ? '' : 'found a settlement of your own first', tip: '<b class="k">Truce</b><br><span class="rf-dim tip-w">both lords put up a bond; who breaks it loses both</span>' })}</div>`);
  } else if (viewer === 'overlord') {
    out.push(`<div class="st-acts">${btn('garrison', 'Garrison', { pri: true, why: s.role === 'garrison' ? 'your men garrison it already' : '', tip: '<b class="k">Garrison</b><br><span class="rf-dim tip-w">ask its lord to let your men in: they fight under its banner here</span>' })}
      ${btn('truce', 'Truce', { on: form.open === 'truce', why: 'it is your vassal' })}</div>`);
  } else if (viewer === 'lord') {
    const wait = (c.inbox?.incoming ?? []).filter((o) => o.to_settlement === s.id).length;
    out.push(`<div class="st-acts">${btn('holdings', `Requests${wait ? ` <b class="st-n">${wait}</b>` : ''}`, { pri: wait > 0, tip: '<b class="k">Holdings</b><br><span class="rf-dim tip-w">requests to settle, terms offered, truces</span>' })}
      ${s.overlord !== null ? btn('rebel', 'Rebel', { bad: true, on: form.open === 'rebel', tip: '<b class="k">Rebel</b><br><span class="rf-dim tip-w">end the tie: no more tribute, its garrison goes</span>' }) : ''}</div>`);
  }
  return out.join('') + formHtml(c, others);
}

/** The open form: terms (vassal with the tribute slider, or join), a truce bond, or the rebellion's confirm. */
function formHtml(c: SettleCtx, others: readonly WorldSettlement[]): string {
  const { form, s } = c;
  if (form.open === 'terms') {
    const seg = (k: SettleForm['kind'], label: string) => `<button class="rf-tbtn${form.kind === k ? ' on' : ''}" data-sa="kind:${k}">${label}</button>`;
    const from = others.find((o) => o.id === form.from) ?? others[0];
    const body = form.kind === 'vassal'
      ? (from ? `<div class="st-fr"><span class="rf-dim">Overlord</span>${others.length > 1 ? `<select data-sf="from">${others.map((o) => `<option value="${o.id}"${o.id === from.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>` : `<b>${esc(from.name)}</b>`}</div>
        <div class="st-fr"><span class="rf-dim">Tribute</span><input type="range" min="0" max="${SETTLE_UI.tributeMax}" step="1" value="${form.tribute}" data-sf="tribute"><b class="st-pct">${form.tribute}%</b></div>
        <div class="rf-dim st-note">${esc(s.name)} pays ${form.tribute}% of the goods and coin it gains to you; your men may garrison it; an attack on it is one on you.</div>`
        : `<div class="rf-hint st-note">Found a settlement of your own first: it becomes the overlord.</div>`)
      : `<div class="rf-dim st-note">${esc(s.lordName)} becomes a citizen and you its lord; its citizens keep their plots.</div>`;
    const ok = form.kind === 'join' || !!from;
    return `<div class="st-form"><div class="st-seg">${seg('vassal', 'Become our vassal')}${seg('join', 'Join our land')}</div>${body}
      <div class="st-acts"><button class="rf-tbtn pri" data-sa="send-terms"${ok ? '' : ' disabled'}>Send terms</button><button class="rf-tbtn" data-sa="close-form">Cancel</button><span class="rf-dim st-exp">answer within ${left(SETTLE_UI.offerMs)}</span></div></div>`;
  }
  if (form.open === 'truce') {
    const from = others.find((o) => o.id === form.from) ?? others[0];
    if (!from) return '';
    return `<div class="st-form"><div class="st-fr"><span class="rf-dim">From</span>${others.length > 1 ? `<select data-sf="from">${others.map((o) => `<option value="${o.id}"${o.id === from.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>` : `<b>${esc(from.name)}</b>`}</div>
      <div class="st-fr"><span class="rf-dim">Bond</span><span class="rf-step"><button class="rf-tbtn" data-sa="bond:-100">−</button><input type="number" min="1" max="${SETTLE_UI.bondMax}" value="${form.bond}" data-sf="bond"><button class="rf-tbtn" data-sa="bond:100">+</button></span>${icon('res-coin')}</div>
      <div class="rf-dim st-note">Both lords escrow ${form.bond} coin for 7 days; an attack by either side breaks it and the other takes both bonds.</div>
      <div class="st-acts"><button class="rf-tbtn pri" data-sa="send-truce">Offer truce</button><button class="rf-tbtn" data-sa="close-form">Cancel</button></div></div>`;
  }
  if (form.open === 'rebel') {
    return `<div class="st-form bad"><div class="rf-hint st-note">Rebel against your overlord? The tribute stops and their garrison leaves; they will hear of it.</div>
      <div class="st-acts"><button class="rf-tbtn st-bad" data-sa="send-rebel">Rebel</button><button class="rf-tbtn" data-sa="close-form">Stay loyal</button></div></div>`;
  }
  return '';
}

/** The settlement card. */
export function settlementCard(c: SettleCtx): string {
  const { s } = c, lv = Math.max(1, s.level), p = c.town ? townProgress(c.town) : 0;
  const ladder = `<span class="tw-ladder">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= lv ? 'on' : ''}${k === lv ? ' cur' : ''}" data-tip="${esc(`<b class="k">${k} ${TOWN_LEVELS[k].name}</b>`)}"></i>`).join('')}</span>`;
  return `<div class="tw-top">${ring(p, 44, `<b>${lv}</b>`)}<div style="flex:1;min-width:0"><div class="rf-name st-title">${esc(s.name)}</div>
      <div class="st-lvl">${ladder}<span>${levelName(lv)}</span></div></div>${bannerChip(s.team)}</div>
    ${standing(c)}${fealty(c)}${citizens(c)}${truces(c)}${growth(c)}${actions(c)}
    <div class="st-msg${c.bad ? ' bad' : ''}">${esc(c.msg)}</div>`;
}

/** The badge: the level ring, the name, the role's pip. */
export function settlementBadge(s: SettlementNet, viewer: Viewer, wait: number): string {
  const lv = Math.max(1, s.level), [cls, label] = ROLE_PILL[viewer];
  const tip = `<b class="k">${esc(s.name)}</b> · ${levelName(lv)}, ${esc(s.lordName)}'s<br><span class="rf-dim tip-w">you: ${label.toLowerCase()} · click: the settlement card</span>`;
  return `<span class="tw-badge" data-tip="${esc(tip)}">${ring(lv / TOWN_MAX, 26, `<b style="font-size:12px">${lv}</b>`)}<b class="rf-name" style="font-size:14px">${esc(s.name)}</b><span class="rf-pill ${cls}">${label}</span>${wait ? `<b class="st-n">${wait}</b>` : ''}</span>`;
}

// ------------------------------------------------------------------ the Holdings panel

const KIND_ICON: Record<OfferRow['kind'], string> = { settle: 'ui:people', vassal: 'ui:standard', join: 'ui:banner', garrison: 'ui:shield', truce: 'ui:bond' };
const b = (t: string | null | undefined) => `<b>${esc(t ?? '?')}</b>`;

/** An offer in words, for the asked lord (incoming) or its sender (outgoing). */
export function offerText(o: OfferRow, world: readonly WorldSettlement[], incoming: boolean): string {
  const fromS = world.find((w) => w.id === o.from_settlement)?.name;
  if (incoming) switch (o.kind) {
    case 'settle': return `${b(o.from_name)} asks for a plot in ${b(o.to_name)}`;
    case 'vassal': return `${b(o.from_name)} offers terms: ${b(o.to_name)} becomes a vassal of ${b(fromS)}, tribute <b class="st-gold">${o.tribute_pct}%</b>`;
    case 'join': return `${b(o.from_name)} demands ${b(o.to_name)} join his land: he becomes its lord, you a citizen`;
    case 'garrison': return `${b(o.from_name)} of ${b(fromS)}, your overlord, would garrison ${b(o.to_name)}`;
    case 'truce': return `${b(o.from_name)} of ${b(fromS)} offers a truce with ${b(o.to_name)}, a bond of <b class="st-gold">${o.bond}</b> coin each`;
  }
  switch (o.kind) {
    case 'settle': return `You asked for a plot in ${b(o.to_name)}`;
    case 'vassal': return `You offered ${b(o.to_name)} vassalage under ${b(fromS)} at ${o.tribute_pct}%`;
    case 'join': return `You demanded ${b(o.to_name)} join your land`;
    case 'garrison': return `You asked to garrison ${b(o.to_name)}`;
    case 'truce': return `You offered ${b(o.to_name)} a truce, bond ${o.bond} coin`;
  }
}

const ACCEPT: Record<OfferRow['kind'], string> = { settle: 'Give a plot…', vassal: 'Swear fealty', join: 'Yield', garrison: 'Let them in', truce: 'Seal truce' };

/** The clock on an offer: time left as words and a draining bar (red under 6 h). */
const clockOf = (until: number, span: number, now: number) => {
  const ms = until - now, f = Math.max(0, Math.min(1, ms / span));
  return `<span class="st-clock${ms < 6 * 3_600_000 ? ' low' : ''}">${glyph('ui:hourglass', 12)}<span data-left="${until}">${left(ms)}</span></span>${bar(ms < 6 * 3_600_000 ? 'burn' : 'construction', f, 64)}`;
};

/** A level icon for a settlement (camp, village, town, city). */
export const levelIcon = (lv: number, size: 24 | 32 = 24) => icon(lv >= 5 ? 'bld-fort' : lv >= 4 ? 'bld-tower-stone' : lv >= 2 ? 'bld-storehouse' : 'bld-camp', size);

export interface HoldingsCtx { inbox: Inbox | null; realm: readonly WorldSettlement[]; world: readonly WorldSettlement[]; now: number; online: boolean; msg: string; bad: boolean }

/** The Holdings panel: the player's settlements, what waits for him, what he sent, his truces. */
export function holdingsHtml(c: HoldingsCtx): string {
  const ib = c.inbox ?? { incoming: [], outgoing: [], truces: [] };
  const realm = c.realm.map((r) => {
    const over = r.overlord_id !== null ? c.world.find((w) => w.id === r.overlord_id) : null, vas = c.world.filter((w) => w.overlord_id === r.id).length;
    return `<div class="hd-set" data-sa="goto:${r.id}">${levelIcon(r.level)}<div class="hd-sn"><b>${esc(r.name)}</b><span class="rf-dim">${levelName(r.level)} · ${esc(worldRegion(r.region)?.name ?? r.region)}</span></div>
      <span class="hd-tie">${over ? `<span class="rf-pill" data-tip="${esc(`<b class="k">Vassal of ${esc(over.name)}</b> · pays ${r.tribute_pct}%`)}">${glyph('ui:standard', 11)}vassal</span>` : ''}${vas ? `<span class="rf-pill gold">${vas} vassal${vas === 1 ? '' : 's'}</span>` : ''}<span class="rf-pill">${glyph('ui:people', 11)}${r.people}</span></span></div>`;
  }).join('') || `<div class="rf-dim st-empty">You rule no settlement. Raise a camp outside your home: you become its lord.</div>`;
  const card = (o: OfferRow, incoming: boolean) => `<div class="hd-offer${incoming ? ' in' : ''}">${glyph(KIND_ICON[o.kind], 22)}<div class="hd-ob">
      <div class="hd-ot">${offerText(o, c.world, incoming)}</div>
      <div class="hd-of">${clockOf(o.expires_at, SETTLE_UI.offerMs, c.now)}<span class="hd-ab">${incoming
        ? `<button class="rf-tbtn pri" data-sa="accept:${o.id}"${c.online ? '' : ' disabled'}>${ACCEPT[o.kind]}</button><button class="rf-tbtn" data-sa="refuse:${o.id}"${c.online ? '' : ' disabled'}>Refuse</button>`
        : `<button class="rf-tbtn" data-sa="withdraw:${o.id}"${c.online ? '' : ' disabled'}>Withdraw</button>`}</span></div></div></div>`;
  const truces = ib.truces.map((t) => {
    const a = c.world.find((w) => w.id === t.from_settlement)?.name ?? t.from_name;
    return `<div class="hd-offer">${glyph('ui:bond', 22)}<div class="hd-ob"><div class="hd-ot">${b(a)} ⇄ ${b(t.to_name)} · bond <b class="st-gold">${t.bond}</b> each</div><div class="hd-of">${clockOf(t.ends_at ?? c.now, SETTLE_UI.truceMs, c.now)}<span class="rf-dim">an attack breaks it</span></div></div></div>`;
  }).join('');
  return `<div class="rf-head rf-ph">${glyph('ui:standard', 30)}<div style="flex:1;min-width:0"><div class="rf-name">Holdings</div><div class="sub">${c.realm.length} settlement${c.realm.length === 1 ? '' : 's'} · ${ib.incoming.length} waiting${c.online ? '' : ' · offline'}</div></div><button class="rf-tbtn x" data-sa="close" title="close">×</button></div>
    <div class="rf-sec">Your settlements</div>${realm}
    <div class="rf-sec">Waiting for you <span class="rf-dim">${ib.incoming.length}</span></div>${ib.incoming.map((o) => card(o, true)).join('') || '<div class="rf-dim st-empty">nothing waits</div>'}
    ${ib.outgoing.length ? `<div class="rf-sec">Sent <span class="rf-dim">${ib.outgoing.length}</span></div>${ib.outgoing.map((o) => card(o, false)).join('')}` : ''}
    ${truces ? `<div class="rf-sec">Truces <span class="rf-dim">${ib.truces.length}</span></div>${truces}` : ''}
    <div class="st-msg${c.bad ? ' bad' : ''}">${esc(c.msg)}</div>`;
}

// ------------------------------------------------------------------ notices

/** The attack notice: whose settlement, where, a broken truce, the jump. */
export function attackToast(a: { name: string; region: string; mine: boolean; broken: number; here: boolean }): string {
  return `${glyph('ui:swords', 26)}<div class="sx-b"><div class="sx-t">${a.mine ? 'Your settlement' : 'Your vassal'} <b>${esc(a.name)}</b> is under attack</div>
    <div class="rf-dim">${a.here ? 'here' : esc(worldRegion(a.region)?.name ?? a.region)}${a.broken ? ` · ${a.broken === 1 ? 'a truce broke' : `${a.broken} truces broke`}: the bonds are yours` : ''}</div></div>
    <button class="rf-tbtn pri" data-sx="jump">${a.here ? 'Look' : 'Go there'}</button><button class="rf-tbtn x" data-sx="x">×</button>`;
}

/** A build refused on settled ground, in words. */
export const groundToast = (detail: string | undefined) => `${glyph('ui:lock', 22)}<div class="sx-b"><div class="sx-t">You can't build here</div><div class="rf-dim">${esc(detail || 'This is a settlement\'s ground: ask its lord for a plot')}</div></div><button class="rf-tbtn x" data-sx="x">×</button>`;

/** The founding hint beside the build bar: the first camp outside home makes him its lord. */
export const FOUND_HINT = `${glyph('ui:laurel', 18)}<span><b>Found a settlement.</b> Raise this camp outside your home and you become its lord: others ask you for plots, and you may take vassals.</span>`;

export const SETTLE_CSS = `
#rfTownCard .st-title{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-lvl{display:flex;align-items:center;gap:6px;margin-top:3px}.st-lvl span{font:700 10.5px/1 Cinzel,serif;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-gold)}.st-lvl .tw-ladder{margin-top:0}
.st-flag{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px 0 4px;border:1px solid var(--rf-rule);background:var(--rf-sunk);font:700 11px/1 Inter,sans-serif;color:var(--rf-ink);align-self:flex-start}
.st-flag i{width:9px;height:12px;background:var(--c);clip-path:polygon(0 0,100% 0,100% 100%,50% 75%,0 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
.st-flag.none i{background:var(--rf-disabled)}
.st-stand{display:flex;align-items:center;gap:6px;padding:4px 4px;margin:2px 0 0;background:var(--rf-sunk);border:1px solid var(--rf-rule);font-size:11.5px}
.st-row{display:flex;align-items:center;gap:6px;min-height:26px;padding:1px 4px;border-bottom:1px solid #1d130e}
.st-k{width:58px;flex:none;color:var(--rf-muted);font-size:11px}.st-v{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st-v b{color:var(--rf-ink)}
.st-t{font-size:11px;white-space:nowrap}
.st-trib{height:21px}
.st-av{width:20px;height:20px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 Cinzel,serif;color:var(--rf-ink);background:radial-gradient(circle at 50% 35%,#3a2516,#120b08);box-shadow:inset 0 0 0 1.5px var(--rf-muted),0 0 0 1px #0e0907}
.st-av.lord,.st-av.over{box-shadow:inset 0 0 0 1.5px var(--rf-gold),0 0 0 1px #0e0907;color:var(--rf-gold)}
.st-av.garrison{box-shadow:inset 0 0 0 1.5px var(--rf-accent),0 0 0 1px #0e0907}
.st-av.citizen{box-shadow:inset 0 0 0 1.5px var(--rf-good),0 0 0 1px #0e0907}
.st-av.free{box-shadow:inset 0 0 0 1px var(--rf-rule)}
.st-vas{display:flex;flex-wrap:wrap;gap:3px;padding:4px 2px 2px}
.st-vchip{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 5px 0 3px;border:1px solid #6a5326;background:var(--rf-raised);font-size:11px}.st-vchip i{font-style:normal;color:var(--rf-gold);margin-left:2px}
.st-cit{display:grid;grid-template-columns:20px 1fr auto 52px;align-items:center;gap:6px;min-height:24px;padding:1px 4px;border-bottom:1px solid #1d130e}
.st-cn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st-plot{text-align:right;font-size:11px;white-space:nowrap}
.st-empty{padding:3px 4px;font-size:11.5px}
.st-reqs{display:flex;flex-wrap:wrap;gap:3px}.st-reqs .rf-ichip{height:22px;font-size:11px}
.st-warn{display:flex;align-items:center;gap:6px;margin-top:8px;padding:5px 6px;border:1px solid #6a5326;border-left:3px solid var(--rf-gold);background:#1f1610;font-size:11.5px;line-height:1.3;color:var(--rf-gold)}
.st-pend{display:flex;align-items:center;gap:6px;margin-top:8px;padding:4px 4px 4px 6px;border:1px solid var(--rf-rule);background:var(--rf-sunk);font-size:11.5px}.st-pend span{flex:1}
.st-acts{display:flex;align-items:center;gap:4px;margin-top:7px;flex-wrap:wrap}
.st-acts .rf-tbtn{height:25px}
.st-n{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--rf-bad);color:#1a0d08;font:700 10.5px/1 Inter,sans-serif}
.rf-tbtn.st-bad{color:var(--rf-bad)}
.st-form{margin-top:6px;padding:6px;background:var(--rf-sunk);border:1px solid var(--rf-rule);box-shadow:inset 0 1px 3px rgba(0,0,0,.6)}
.st-form.bad{border-color:#6a2c1c}
.st-seg{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-bottom:6px}.st-seg .rf-tbtn{width:100%}
.st-fr{display:flex;align-items:center;gap:8px;min-height:26px}.st-fr>.rf-dim:first-child{width:56px;flex:none;font-size:11px}
.st-fr input[type=range]{flex:1;width:auto;height:18px;padding:0;border:0;background:none;accent-color:var(--rf-gold)}
.st-fr .rf-step input{width:56px}
.st-pct{min-width:34px;text-align:right;font:700 14px/1 Cinzel,serif;color:var(--rf-gold)}
.st-note{font-size:11px;line-height:1.35;margin-top:4px;white-space:normal}
.st-exp{margin-left:auto;font-size:10.5px}
.st-msg{min-height:14px;margin-top:4px;font-size:11px;color:var(--rf-good)}.st-msg.bad{color:var(--rf-bad)}
.st-gold{color:var(--rf-gold)}
#rfHoldings .rf-sec:first-of-type{margin-top:2px}
.hd-set{display:flex;align-items:center;gap:7px;padding:3px 4px;border-bottom:1px solid #1d130e;cursor:pointer}.hd-set:hover{background:var(--rf-hover)}
.hd-sn{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.hd-sn b{font:700 13px/1.1 Cinzel,serif;color:var(--rf-title)}.hd-sn span{font-size:11px}
.hd-tie{display:flex;gap:3px}
.hd-offer{display:flex;gap:7px;align-items:flex-start;padding:6px 5px;margin-bottom:4px;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
.hd-offer.in{border-left:3px solid var(--rf-gold)}
.hd-ob{flex:1;min-width:0}.hd-ot{font-size:12px;line-height:1.35;white-space:normal}.hd-ot b{color:var(--rf-title)}
.hd-of{display:flex;align-items:center;gap:6px;margin-top:5px}.hd-ab{margin-left:auto;display:flex;gap:3px}
.st-clock{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--rf-muted);white-space:nowrap}.st-clock.low{color:var(--rf-bad)}
#rfHoldingsBtn{position:relative}
#rfHoldingsBtn .st-n{position:absolute;top:-6px;left:-8px;box-shadow:0 0 0 1px #0e0907}
#rfSettleNote{top:292px;right:4px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none}
.sx{display:flex;align-items:center;gap:8px;width:330px;padding:6px 8px;pointer-events:auto;transition:opacity .4s,transform .4s}
.sx.grd{border-left:3px solid var(--rf-gold)}
.sx.atk{border-left:3px solid var(--rf-bad);animation:sxIn .35s ease-out}
.sx.atk .gl{filter:drop-shadow(0 0 4px rgba(240,138,112,.7))}
.sx-b{flex:1;min-width:0}.sx-t{font-size:12.5px;line-height:1.3}.sx-t b{color:var(--rf-title)}
.sx .rf-dim{font-size:11px;margin-top:1px}
@keyframes sxIn{from{transform:translateX(12px);opacity:0}to{transform:none;opacity:1}}
#rfFoundHint{display:none;align-items:center;gap:7px;width:380px;white-space:normal;padding:5px 9px;font-size:11.5px;line-height:1.35;border-left:3px solid var(--rf-gold);pointer-events:none}
#rfFoundHint b{color:var(--rf-gold)}
#rfPlotBar{top:52px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:5px 8px;pointer-events:auto;z-index:8}
#rfPlotBar .pb-t{font-size:12px;white-space:nowrap}#rfPlotBar .pb-t b{color:var(--rf-title)}
#rfPlotBar .pb-s{min-width:150px;font-size:11.5px;white-space:nowrap}
#rfPlotTip{display:none;pointer-events:none;z-index:7}
`;
