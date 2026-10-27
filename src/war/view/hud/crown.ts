/**
 * W-64 the Crown panel (rules: server/src/war/crown.ts; numbers and views: src/war/net/crown.ts), in the red-figure kit
 * like the Works and Tasks windows. The corner button "Crown" (a gold pip when a vote waits for you or an order is new)
 * opens a window of four tabs, after Crusader Kings III's council screen:
 *
 *   Court      the throne (the monarch's medallion in his alliance's colour, his realm power, the term's bar; Regent
 *              while an election runs after it), the four council seats (office, holder, duty; the monarch appoints and
 *              dismisses there), the treasury (coin and goods, the tax and what it brought; deposit; the Treasurer's
 *              tax, works and contract tools) and the chronicle.
 *   Election   the candidates as portraits with their power and a vote bar (your vote marked; your weight), or the
 *              term's countdown and the no-confidence petition (signatures, then yes and no), and the members by power.
 *   Orders     "Orders of the crown": each order's bounty, progress and time, deliver to a quest; the Marshal's and the
 *              Quartermaster's form to post one.
 *   Envoys     pacts and truces with the other alliances (offers to answer), and the Envoy's offer form.
 *
 * Online it reads /api/war/crown (polled each minute for the pip); offline it says the crown needs the server.
 */
import { CROWN, OFFICES, type CrownLog, type CrownOrder, type CrownView, type Office, type OrderKind } from '../../net/crown';
import { GOODS } from '../../net/protocol';
import { ALLIANCES } from '../../world/alliances';
import { WORLD_REGIONS } from '../../world/regions';
import { FRONTIER_TOWNS, OMPHALOS } from '../../world/season';
import { WORKS, WONDER } from '../../net/works';
import type { SandboxScene } from '../SandboxScene';
import { draggable } from './drag';
import { glyph } from './glyph';
import { closeCornerWindows, CORNER_BOTTOM, fitHeight, icon } from './kit';
import { esc, tipper } from './roster/ui';
import { keys } from '../../input/keys';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type Tab = 'court' | 'election' | 'orders' | 'envoys';
const attr = esc;
const fmt = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const until = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};
const ago = (ms: number) => (ms < 60_000 ? 'now' : `${until(ms)} ago`);
const regionName = (id: string) => WORLD_REGIONS.find((r) => r.id === id)?.name ?? id;
const allianceName = (a: number) => ALLIANCES[a]?.name ?? `#${a}`;
const colourOf = (a: number | null) => (a === null ? '#8a786a' : (ALLIANCES[a]?.color ?? '#8a786a'));
const TOWNS = [...ALLIANCES.map((a) => a.home), ...FRONTIER_TOWNS, OMPHALOS];
const SUPPLY_GOODS = GOODS.filter((g) => g !== 'coin').slice(0, 18);
const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'coin', 'silver']);
const gi = (r: string) => (ICONED.has(r) ? icon('res-' + r) : `<span class="rf-dim">${esc(r)}</span>`);
/** A disabled button's attributes, with the reason as its tip. */
const why = (reason: string) => ` disabled data-tip="${attr(`<span class="rf-hint">${reason}</span>`)}"`;
/** What a second click does, for the buttons that ask first (data-sure): shown on the message line while armed. */
const SURE: Record<string, string> = {
  conf: 'Vote to depose the monarch? Click Confirm to go ahead.',
  sign: 'Sign the petition against the crown? Click Confirm to go ahead.',
  dismiss: 'Dismiss this councillor? Click Confirm to go ahead.',
  endOrder: 'Close this order now? Click Confirm to go ahead.',
  pact: 'End this pact with the other alliance? Click Confirm to go ahead.',
  post: 'Post an attack order: every member who fights there shares the bounty. Click Confirm to go ahead.',
};

const OFFICE_GLYPH: Record<Office, string> = { marshal: 'ui:standard', treasurer: 'ui:coin', envoy: 'ui:scales', quartermaster: 'ui:amphora' };
const ORDER: Record<OrderKind, { name: string; glyph: string; cls: string }> = {
  attack: { name: 'Attack', glyph: 'ui:raid', cls: 'war' },
  defend: { name: 'Defend', glyph: 'ui:shield', cls: 'def' },
  rally: { name: 'Rally', glyph: 'ui:rally', cls: 'rally' },
  supply: { name: 'Supply', glyph: 'ui:amphora', cls: 'sup' },
};

/** A gold crown, drawn (the medallion's crest). */
const CROWN_SVG = (w = 34) => `<svg class="cr-crest" width="${w}" height="${Math.round(w * 0.62)}" viewBox="0 0 34 21" aria-hidden="true"><defs><linearGradient id="crg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".55" stop-color="#e0b867"/><stop offset="1" stop-color="#8a6326"/></linearGradient></defs><path d="M2 7 L9 12 L17 2 L25 12 L32 7 L29 18 L5 18 Z" fill="url(#crg)" stroke="#3a2410" stroke-width="1.2" stroke-linejoin="round"/><rect x="5" y="17" width="24" height="3" fill="#b38a3e" stroke="#3a2410" stroke-width="1"/><circle cx="17" cy="2.6" r="1.8" fill="#de8a4e" stroke="#3a2410" stroke-width=".8"/><circle cx="2.6" cy="7" r="1.5" fill="#de8a4e" stroke="#3a2410" stroke-width=".8"/><circle cx="31.4" cy="7" r="1.5" fill="#de8a4e" stroke="#3a2410" stroke-width=".8"/><circle cx="17" cy="13" r="1.6" fill="#b42c22"/></svg>`;

/** A round portrait: the initial in a ring of the alliance colour. */
const avatar = (name: string | null, a: number | null, size = 26, extra = '') =>
  `<span class="cr-av${extra ? ' ' + extra : ''}" style="--c:${colourOf(a)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px">${esc((name ?? '?').trim().charAt(0).toUpperCase() || '?')}</span>`;

/** One chronicle line. */
function logText(l: CrownLog): string {
  const d = l.detail as Record<string, unknown>, who = l.actor ? `<b>${esc(l.actor)}</b>` : 'The realm';
  const office = (o: unknown) => OFFICES.find((x) => x.id === o)?.name ?? String(o);
  switch (l.kind) {
    case 'crowned': return `${who} is crowned${d.again ? ' again' : ''}`;
    case 'election': return `An election opens: ${(d.candidates as { name: string }[] | undefined)?.map((c) => esc(c.name)).join(', ') ?? ''} stand`;
    case 'deposed': return `${who} is deposed by the realm`;
    case 'confidence_held': return `${who} survives the vote of no confidence`;
    case 'petition': return `${who} starts a petition against the crown`;
    case 'confidence': return 'The petition carries: the realm votes';
    case 'petition_failed': return 'The petition lapses unsigned';
    case 'appointed': return `${who} names <b>${esc(String(d.name ?? ''))}</b> ${office(d.office)}`;
    case 'dismissed': return `${who} dismisses <b>${esc(String(d.name ?? ''))}</b> as ${office(d.office)}`;
    case 'tax': return `${who} sets the tax at ${d.pct}%`;
    case 'deposit': return `${who} gives ${fmt(Number(d.coin))} coin to the treasury`;
    case 'fund_work': return `${who} funds a work from the treasury`;
    case 'fund_contract': return `${who} adds ${fmt(Number(d.coin))} coin to a contract`;
    case 'order': return `${who} posts ${ORDER[d.kind as OrderKind]?.name.toLowerCase() ?? 'an order'} on ${esc(regionName(String(d.region)))}`;
    case 'order_closed': return `${ORDER[d.kind as OrderKind]?.name ?? 'An order'} closes: ${fmt(Number(d.paid ?? 0))} coin paid`;
    case 'quest_done': return `${who} completes a supply quest`;
    case 'pact_offered': return `${who} offers a ${d.kind} to ${esc(allianceName(Number(d.other)))}`;
    case 'pact_active': return `A ${d.kind} with ${esc(allianceName(Number(d.other)))} is sealed`;
    case 'pact_refused': return `The ${d.kind} with ${esc(allianceName(Number(d.other)))} is refused`;
    case 'pact_cancelled': return `The ${d.kind} offer to ${esc(allianceName(Number(d.other)))} is withdrawn`;
    case 'pact_ended': return `The ${d.kind} with ${esc(allianceName(Number(d.other)))} ends`;
    case 'pact_broken': return `<span class="cr-bad">${who} breaks the ${d.kind} with ${esc(allianceName(Number(d.other)))}</span>`;
    case 'season': return 'A new season: every term ends';
    default: return esc(l.kind);
  }
}

// ---------------------------------------------------------------- tabs

/** No alliance (or offline): what to do next instead of an empty court. */
const noAlliance = (online: boolean) => `<div class="cr-throne rf-well empty"><div class="cr-medal">${CROWN_SVG(38)}<span class="cr-av big vacant" style="width:58px;height:58px">?</span></div>
    <div class="cr-tt"><div class="cr-tier">No alliance</div><div class="cr-king">${online ? 'You serve no crown' : 'The crown needs the server'}</div>
    <div class="rf-dim cr-why">${online ? 'Join an alliance: its members elect a monarch, who names a council and posts orders with bounties.' : 'Play online in an alliance to see its monarch, council, treasury and orders.'}</div></div></div>`;

function courtHtml(v: CrownView): string {
  const a = v.alliance!, m = v.monarch, isKing = v.me.monarch;
  const termF = m && m.since ? Math.min(1, Math.max(0, (v.now - m.since) / Math.max(1, m.ends - m.since))) : 0;
  const throne = m
    ? `<div class="cr-throne rf-well${v.regent ? ' regent' : ''}">
        <div class="cr-medal">${CROWN_SVG(38)}${avatar(m.name, a, 58, 'big')}</div>
        <div class="cr-tt"><div class="cr-tier">${v.regent ? 'Regent of' : 'Monarch of'} ${esc(allianceName(a))}</div>
          <div class="cr-king">${esc(m.name)}${isKing ? ' <span class="cr-you">you</span>' : ''}</div>
          <div class="cr-stats"><span class="rf-ichip gold" data-tip="${attr('<b class="k">Realm power</b><br><span class="rf-dim tip-w">his settlements\' levels, his vassals\' levels and one per region held</span>')}">${glyph('ui:power', 16)}${fmt(m.power)}</span>
          ${v.regent ? `<span class="rf-ichip" data-tip="${attr('<b class="k">Regency</b><br><span class="rf-dim tip-w">his term is over; he rules until the election closes</span>')}">${glyph('ui:hourglass', 16)}regent</span>` : `<span class="rf-dim">${until(m.ends - v.now)} of his term left</span>`}</div>
          <div class="rf-bar cr-term"><i class="${v.regent ? 'construction' : 'ok'}" style="width:${(v.regent ? 100 : (1 - termF) * 100).toFixed(1)}%"></i></div></div></div>`
    : `<div class="cr-throne rf-well empty"><div class="cr-medal">${CROWN_SVG(38)}<span class="cr-av big vacant" style="width:58px;height:58px">?</span></div>
        <div class="cr-tt"><div class="cr-tier">The throne of ${esc(allianceName(a))}</div><div class="cr-king">The crown is empty</div>
        <div class="rf-dim cr-why">${v.election ? `The realm votes: closes in ${until(v.election.closes - v.now)}` : 'An election opens once members hold settlements: found one, or swear a vassal'}</div></div></div>`;
  const opts = (sel: number | null) => `<option value="">— choose —</option>${v.members.map((x) => `<option value="${x.pid}"${x.pid === sel ? ' selected' : ''}>${esc(x.name)} · ${fmt(x.power)}</option>`).join('')}`;
  const seats = v.council.map((c) => {
    const o = OFFICES.find((x) => x.id === c.office)!, mine = c.pid === v.me.pid;
    return `<div class="cr-seat rf-well${c.pid === null ? ' vacant' : ''}${mine ? ' me' : ''}" data-tip="${attr(`<b class="k">${o.name}</b><br><span class="rf-dim tip-w">${o.text}</span>`)}">
      <div class="cr-seat-top"><span class="cr-oi">${glyph(OFFICE_GLYPH[c.office], 22)}</span><span class="cr-on">${o.name}</span></div>
      <div class="cr-holder">${c.pid === null ? `<span class="cr-av vacant" style="width:24px;height:24px">·</span><span class="rf-dim">Vacant</span>` : `${avatar(c.name, a, 24)}<span class="cr-hn">${esc(c.name ?? '')}${mine ? ' <span class="cr-you">you</span>' : ''}</span>`}</div>
      ${isKing ? `<div class="cr-appoint"><select data-sel="appoint-${c.office}">${opts(c.pid)}</select><button class="rf-tbtn" data-act="appoint" data-o="${c.office}" data-tip="${attr(`<b class="k">Appoint</b> the chosen member ${o.name}`)}">${glyph('ui:check', 12)}</button>${c.pid !== null ? `<button class="rf-tbtn" data-act="dismiss" data-o="${c.office}" data-sure="dismiss:${c.office}" data-tip="${attr(`<b class="k">Dismiss</b> ${esc(c.name ?? '')} as ${o.name}`)}">×</button>` : ''}</div>` : ''}
    </div>`;
  }).join('');
  const goods = Object.entries(v.treasury.goods).filter(([, n]) => n > 0);
  const treasurer = isKing || v.me.offices.includes('treasurer');
  const works = [...WORKS.map((w) => ({ id: w.id, name: w.name })), { id: WONDER.id, name: WONDER.name }];
  const tools = treasurer
    ?`<div class="cr-tools"><div class="cr-tl">${glyph('ui:coin', 14)}Treasurer</div>
        <div class="cr-line"><span class="rf-dim cr-lab">Tax</span><span class="rf-step"><button class="rf-tbtn" data-act="tax-" >−</button><input data-in="tax" value="${v.treasury.tax}" inputmode="numeric"><button class="rf-tbtn" data-act="tax+">+</button></span><span class="rf-dim">% of sales and tribute, at most ${CROWN.taxMax}</span><button class="rf-tbtn pri cr-go" data-act="tax">Set</button></div>
        <div class="cr-line"><span class="rf-dim cr-lab">Works</span><select data-sel="work">${works.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select><select data-sel="workRes">${['coin', 'stone', 'wood', 'marble', 'pitch'].map((g) => `<option>${g}</option>`).join('')}</select><input data-in="workN" value="100" inputmode="numeric" style="width:48px"><button class="rf-tbtn pri cr-go" data-act="fundWork">Give</button></div>
        <div class="cr-line"><span class="rf-dim cr-lab">Contract</span><input data-in="ctId" placeholder="id" style="width:42px"><input data-in="ctCoin" value="50" inputmode="numeric" style="width:48px"><span class="rf-dim">coin to a taken build or guard contract</span><button class="rf-tbtn pri cr-go" data-act="fundContract">Grant</button></div></div>`
    : '';
  const treasury = `<div class="rf-sec">Treasury <span class="rf-dim">tax ${v.treasury.tax}% · ${fmt(v.treasury.taxed)} coin collected</span></div>
    <div class="cr-treasury rf-well"><div class="cr-coin">${icon('res-coin', 32)}<b>${fmt(v.treasury.goods.coin ?? 0)}</b><span class="rf-dim">coin</span></div>
      <div class="cr-goods">${goods.filter(([r]) => r !== 'coin').map(([r, n]) => `<span class="rf-ichip">${gi(r)}${fmt(n)}</span>`).join('') || '<span class="rf-dim">no goods in store</span>'}</div>
      <div class="cr-line cr-dep"><span class="rf-dim">Give from your strongroom</span><input data-in="dep" value="100" inputmode="numeric" style="width:52px"><button class="rf-tbtn cr-go" data-act="deposit">Deposit</button></div>
      ${tools}</div>`;
  const chron = v.log.slice(0, 6).map((l) => `<div class="cr-log"><span>${logText(l)}</span><span class="rf-dim">${ago(v.now - l.at)}</span></div>`).join('');
  return `${throne}<div class="rf-sec">The council <span class="rf-dim">${isKing ? 'name a member to each seat' : 'appointed by the crown'}</span></div><div class="cr-seats">${seats}</div>${treasury}
    ${chron ? `<div class="rf-sec">Chronicle</div><div class="cr-chron">${chron}</div>` : ''}`;
}

function electionHtml(v: CrownView): string {
  const e = v.election, p = v.petition, a = v.alliance;
  let top = '';
  if (e) {
    const total = e.candidates.reduce((x, c) => x + c.votes, 0);
    top = `<div class="cr-banner">${glyph('ui:podium', 20)}<div><div class="cr-bt">The realm chooses its monarch</div><div class="rf-dim">closes in ${until(e.closes - v.now)} · ties go to the greater realm · your vote weighs ${fmt(v.me.weight)}</div></div></div>
      <div class="cr-cands">${e.candidates.map((c, i) => {
        const f = total > 0 ? c.votes / total : 0, mine = e.mine === c.pid;
        return `<div class="cr-cand rf-well${mine ? ' voted' : ''}${i === 0 ? ' first' : ''}">
          <div class="cr-rank">${['I', 'II', 'III'][i] ?? i + 1}</div>${avatar(c.name, a, 46, 'big')}
          <div class="cr-cn">${esc(c.name)}${c.pid === v.me.pid ? ' <span class="cr-you">you</span>' : ''}</div>
          <div class="cr-cp" data-tip="${attr('<b class="k">Realm power</b><br><span class="rf-dim tip-w">settlement levels, vassals and regions held</span>')}">${glyph('ui:power', 14)}${fmt(c.power)}</div>
          <div class="rf-bar cr-vb"><i class="ok" style="width:${(f * 100).toFixed(1)}%"></i></div>
          <div class="cr-vn"><b>${fmt(c.votes)}</b> <span class="rf-dim">votes · ${Math.round(f * 100)}%</span></div>
          <button class="rf-tbtn${mine ? '' : ' pri'}" data-act="vote" data-p="${c.pid}"${mine ? why('you voted for him') : ''}>${mine ? `${glyph('ui:check', 12)}Your vote` : 'Vote'}</button></div>`;
      }).join('')}</div>`;
  } else if (v.monarch) {
    top = `<div class="cr-banner">${glyph('ui:hourglass', 20)}<div><div class="cr-bt">${esc(v.monarch.name)} reigns</div><div class="rf-dim">the next election opens when the term ends, in ${until(v.monarch.ends - v.now)}</div></div></div>`;
  } else top = `<div class="cr-banner">${glyph('ui:podium', 20)}<div><div class="cr-bt">No election yet</div><div class="rf-dim">the top ${CROWN.candidates} by realm power stand once someone holds a settlement</div></div></div>`;
  let conf = '';
  if (v.monarch && !e) {
    if (p?.state === 'open') {
      const t = p.yes + p.no, fy = t ? p.yes / t : 0;
      conf = `<div class="cr-nc rf-well open"><div class="cr-nct">${glyph('ui:skull', 18)}Vote of no confidence <span class="rf-dim">closes in ${until(p.closes - v.now)}</span></div>
        <div class="cr-yn"><span class="cr-y">Depose ${fmt(p.yes)}</span><div class="cr-ynbar"><i style="width:${(fy * 100).toFixed(1)}%"></i></div><span class="cr-n">${fmt(p.no)} Keep</span></div>
        <div class="cr-line"><span class="rf-dim">A weighted majority of the votes cast removes the monarch</span><button class="rf-tbtn${p.mine === 1 ? '' : ' pri'} cr-go" data-act="conf" data-y="1" data-sure="conf:1"${p.mine === 1 ? why('you voted to depose') : ''}>Depose</button><button class="rf-tbtn" data-act="conf" data-y="0"${p.mine === 0 ? why('you voted to keep') : ''}>Keep</button></div></div>`;
    } else {
      const signs = p?.signs ?? 0, need = p?.need ?? 1, cool = v.petitionCooldown > v.now;
      conf = `<div class="cr-nc rf-well"><div class="cr-nct">${glyph('ui:pen', 18)}Petition of no confidence ${p ? `<span class="rf-dim">lapses in ${until(p.closes - v.now)}</span>` : ''}</div>
        <div class="cr-line"><div class="rf-bar cr-pb"><i class="construction" style="width:${p ? Math.min(100, (signs / need) * 100).toFixed(1) : 0}%"></i></div><b class="cr-sig">${signs}<span class="rf-dim">/${p ? need : '—'}</span></b></div>
        <div class="cr-line"><span class="rf-dim">${cool ? `A petition failed: none again for ${until(v.petitionCooldown - v.now)}` : `${Math.round(CROWN.petitionShare * 100)}% of the active members sign, then the realm votes for ${until(CROWN.voteMs)}`}</span>
        <button class="rf-tbtn cr-go" data-act="sign" data-sure="sign"${p?.signed ? why('you signed it') : v.me.monarch ? why('the monarch cannot sign against himself') : cool && !p ? why('a petition failed: wait for the cooldown') : ''}>${p?.signed ? `${glyph('ui:check', 12)}Signed` : 'Sign'}</button></div></div>`;
    }
  }
  const ranks = [...v.members].sort((x, y) => y.power - x.power || x.pid - y.pid).slice(0, 8);
  const list = ranks.length ? `<div class="rf-sec">Realm power <span class="rf-dim">${v.members.length} members</span></div>${ranks.map((r, i) => `<div class="cr-rk${r.pid === v.me.pid ? ' me' : ''}"><span class="cr-rn">${i + 1}</span>${avatar(r.name, a, 20)}<span class="cr-rkn">${esc(r.name)}</span><span class="rf-dim">weighs ${fmt(r.weight)}</span><b>${fmt(r.power)}</b></div>`).join('')}` : '';
  return `${top}${conf}${list}`;
}

function orderCard(o: CrownOrder, v: CrownView): string {
  const k = ORDER[o.kind], open = o.state === 'open', war = o.kind === 'attack' || o.kind === 'defend';
  const where = `${esc(regionName(o.region))}${o.target ? ` — ${esc(o.target)}` : ''}`;
  let prog = '';
  if (o.kind === 'supply') {
    const f = o.n ? o.delivered / o.n : 0;
    prog = `<div class="cr-prog"><div class="rf-bar"><i class="${open ? 'construction' : 'ok'}" style="width:${(f * 100).toFixed(1)}%"></i></div><span class="rf-num cr-pn">${fmt(o.delivered)}<span class="rf-dim">/${fmt(o.n)}</span>${ICONED.has(o.res ?? '') ? icon('res-' + o.res, 24) : `<span class="rf-dim">${esc(o.res ?? '')}</span>`}</span></div>`;
  } else if (war) {
    const est = o.shares > 0 ? (o.bounty - o.paid) * (o.mine / o.shares) : 0;
    prog = `<div class="cr-prog"><span class="rf-dim">${o.shares ? `${fmt(o.shares)} shares in all · yours ${fmt(o.mine)}${open && o.mine ? ` · about ${fmt(est)} coin` : ''}` : 'no fighting yet: fight in this region while it stands'}</span></div>`;
  } else prog = `<div class="cr-prog"><span class="rf-dim">gather your men at ${esc(regionName(o.region))}</span></div>`;
  const office = o.kind === 'supply' ? 'quartermaster' : 'marshal', mayEnd = open && (v.me.monarch || v.me.offices.includes(office));
  const act = !open
    ? `<span class="cr-st ${o.state}">${o.state === 'done' ? `${glyph('ui:check', 12)}done` : o.state}</span>`
    : `${o.kind === 'supply' && o.byPid !== v.me.pid ? `<input data-in="dl-${o.id}" value="${fmt(Math.max(0, o.n - o.delivered))}" inputmode="numeric" style="width:46px"><button class="rf-tbtn pri" data-act="deliver" data-id="${o.id}" data-tip="${attr(`<b class="k">Deliver</b><br><span class="rf-dim tip-w">from your warehouse and stall in ${esc(regionName(o.region))} (strongroom at home) into the treasury</span>`)}">Deliver</button>` : ''}
       ${mayEnd ? `<button class="rf-tbtn" data-act="endOrder" data-id="${o.id}" data-sure="endOrder:${o.id}" data-tip="${attr(war ? '<b class="k">Close and pay</b><br><span class="rf-dim tip-w">the bounty goes out by shares now</span>' : '<b class="k">Call off</b><br><span class="rf-dim tip-w">what is unpaid goes back to the treasury</span>')}">${war ? 'Pay out' : 'Call off'}</button>` : ''}`;
  return `<div class="cr-order rf-well ${k.cls}${open ? '' : ' closed'}">
    <div class="cr-oic">${glyph(k.glyph, 26)}</div>
    <div class="cr-ob"><div class="cr-otop"><span class="cr-okind">${k.name}</span><span class="cr-owhere">${where}</span>${o.bounty > 0 ? `<span class="rf-ichip gold cr-bounty" data-tip="${attr(`<b class="k">Bounty</b> · ${fmt(o.bounty)} coin<br><span class="rf-dim tip-w">${war ? 'shared by everyone whose men fight there (1 + kills each)' : 'paid pro rata as goods come in'}</span>`)}">${icon('res-coin')}${fmt(o.bounty)}</span>` : ''}</div>
      ${prog}
      <div class="cr-ofoot"><span class="rf-dim">${esc(o.by)} · ${open ? `${until(o.expires - v.now)} left` : 'closed'}</span><span class="cr-oact">${act}</span></div></div></div>`;
}

function ordersHtml(v: CrownView, form: OrderForm): string {
  const open = v.orders.filter((o) => o.state === 'open'), past = v.orders.filter((o) => o.state !== 'open');
  const marshal = v.me.monarch || v.me.offices.includes('marshal'), qm = v.me.monarch || v.me.offices.includes('quartermaster');
  const kinds = (['attack', 'defend', 'rally', 'supply'] as const).filter((k) => (k === 'supply' ? qm : marshal));
  const kind = kinds.includes(form.kind) ? form.kind : kinds[0];
  const regions = kind === 'supply' ? TOWNS : WORLD_REGIONS.map((r) => r.id);
  const post = kinds.length && v.alliance !== null
    ? `<div class="rf-sec">Post an order <span class="rf-dim">${fmt(v.treasury.goods.coin ?? 0)} coin in the treasury</span></div>
      <div class="cr-post rf-well"><div class="cr-kinds">${kinds.map((k) => `<button class="rf-tbtn${k === kind ? ' on' : ''}" data-act="kind" data-k="${k}">${glyph(ORDER[k].glyph, 14)}${ORDER[k].name}</button>`).join('')}</div>
        <div class="cr-line"><span class="rf-dim cr-lab">${kind === 'supply' ? 'Town' : 'Region'}</span><select data-sel="region">${regions.map((r) => `<option value="${r}"${r === form.region ? ' selected' : ''}>${esc(regionName(r))}</option>`).join('')}</select>
          ${kind === 'supply' ? `<select data-sel="res">${SUPPLY_GOODS.map((g) => `<option${g === form.res ? ' selected' : ''}>${g}</option>`).join('')}</select><input data-in="n" value="${form.n}" inputmode="numeric" style="width:48px">` : `<input data-in="target" value="${esc(form.target)}" placeholder="landmark or spot" style="width:118px">`}</div>
        <div class="cr-line"><span class="rf-dim cr-lab">Bounty</span>${kind === 'rally' ? '<span class="rf-dim">a rally carries no bounty</span>' : `<input data-in="bounty" value="${form.bounty}" inputmode="numeric" style="width:56px">${icon('res-coin')}`}<span class="rf-dim cr-lab" style="margin-left:6px">Hours</span><input data-in="hours" value="${form.hours}" inputmode="numeric" style="width:36px"><button class="rf-tbtn pri cr-go" data-act="post"${kind === 'attack' ? ' data-sure="post"' : ''}>Post</button></div></div>`
    : '';
  return `<div class="rf-sec">Orders of the crown <span class="rf-dim">${open.length} open · bounties, not commands</span></div>
    ${open.length ? open.map((o) => orderCard(o, v)).join('') : '<div class="rf-dim cr-none">No orders stand. The Marshal marks war goals, the Quartermaster posts supply quests.</div>'}
    ${past.length ? `<div class="rf-sec">Closed today</div>${past.slice(0, 4).map((o) => orderCard(o, v)).join('')}` : ''}${post}`;
}

function envoysHtml(v: CrownView, form: { to: number; kind: 'pact' | 'truce' }): string {
  const a = v.alliance, envoy = v.me.monarch || v.me.offices.includes('envoy');
  const rows = v.pacts.map((p) => {
    const other = p.a === a ? p.b : p.a, incoming = p.state === 'offered' && p.b === a, outgoing = p.state === 'offered' && p.a === a;
    const when = p.state === 'active' ? `${until((p.ends ?? v.now) - v.now)} left` : p.state === 'offered' ? `stands ${until(p.expires - v.now)}` : p.state;
    const acts = !envoy ? '' : incoming ? `<button class="rf-tbtn pri" data-act="pact" data-id="${p.id}" data-a="accept">Accept</button><button class="rf-tbtn" data-act="pact" data-id="${p.id}" data-a="refuse">Refuse</button>`
      : outgoing ? `<button class="rf-tbtn" data-act="pact" data-id="${p.id}" data-a="cancel">Withdraw</button>` : p.state === 'active' ? `<button class="rf-tbtn" data-act="pact" data-id="${p.id}" data-a="end" data-sure="pact:${p.id}">End</button>` : '';
    return `<div class="cr-pact rf-well ${p.state}"><span class="cr-flags"><i style="--c:${colourOf(a)}"></i>${glyph(p.kind === 'pact' ? 'ui:scales' : 'ui:hourglass', 14)}<i style="--c:${colourOf(other)}"></i></span>
      <div class="cr-pb2"><div class="cr-pt">${p.kind === 'pact' ? 'Pact' : 'Truce'} with ${esc(allianceName(other))}</div><div class="rf-dim">${incoming || outgoing ? `offered by ${esc(p.by)}` : esc(p.by)} · ${when}</div></div>
      <span class="cr-st ${p.state}">${p.state}</span><span class="cr-oact">${acts}</span></div>`;
  }).join('');
  const others = ALLIANCES.filter((x) => x.id !== a);
  const offer = envoy && a !== null
    ? `<div class="rf-sec">Offer terms</div><div class="cr-post rf-well"><div class="cr-line"><select data-sel="to">${others.map((x) => `<option value="${x.id}"${x.id === form.to ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <span class="rf-segs cr-pk"><button class="rf-tbtn${form.kind === 'pact' ? ' on' : ''}" data-act="pk" data-k="pact">Pact · ${until(CROWN.pactMs)}</button><button class="rf-tbtn${form.kind === 'truce' ? ' on' : ''}" data-act="pk" data-k="truce">Truce · ${until(CROWN.truceMs)}</button></span>
        <button class="rf-tbtn pri cr-go" data-act="offer">Offer</button></div><div class="rf-dim cr-note">Their Envoy answers. An attack on their settlements while it stands breaks it, before every member of both alliances.</div></div>`
    : '';
  return `<div class="rf-sec">Pacts and truces</div>${rows || '<div class="rf-dim cr-none">No pacts stand with the other alliances.</div>'}${offer}`;
}

// ---------------------------------------------------------------- the window

const CSS = `
#rfCrown{--rf-crown:#e0b867}
#rfCrown .rf-tabs{display:flex;align-items:flex-end;height:24px;margin:0 0 6px;border-bottom:1px solid var(--rf-rule)}
.cr-av{display:inline-flex;flex:none;align-items:center;justify-content:center;border-radius:50%;font-family:Cinzel,serif;font-weight:700;color:var(--rf-ink);background:radial-gradient(circle at 50% 35%,#4a2e1c,#120b08);box-shadow:inset 0 0 0 2px var(--c),0 0 0 1px #0e0907}
.cr-av.big{box-shadow:inset 0 0 0 3px var(--c),0 0 0 1px #0e0907,0 0 10px rgba(0,0,0,.6)}
.cr-av.vacant{--c:#3a2418;color:var(--rf-disabled);background:var(--rf-sunk)}
.cr-you{font:700 10px/1 Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#0e0907;background:var(--rf-gold);padding:1px 4px;border-radius:2px;vertical-align:2px}
.cr-throne{display:flex;gap:10px;align-items:center;padding:8px 9px;border-color:#6a5326;background:radial-gradient(ellipse at 18% 50%,#3a2414,transparent 60%),linear-gradient(180deg,#22170f,var(--rf-sunk))}
.cr-throne.regent{border-color:var(--rf-accent)}.cr-throne.empty{border-style:dashed}
.cr-medal{position:relative;width:70px;height:78px;flex:none;display:flex;align-items:flex-end;justify-content:center}
.cr-medal .cr-crest{position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:1;filter:drop-shadow(0 1px 1px #000)}
.cr-tt{flex:1;min-width:0}
.cr-tier{font:700 11px/1 Cinzel,serif;letter-spacing:.14em;text-transform:uppercase;color:var(--rf-gold);margin-bottom:3px}
.cr-king{font:700 18px/1.1 Cinzel,serif;color:var(--rf-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr-stats{display:flex;align-items:center;gap:6px;margin:5px 0 5px;font-size:11px}.cr-stats .rf-ichip{height:20px}
.cr-term{width:100%}.cr-why{margin-top:4px;font-size:11px}
.cr-seats{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.cr-seat{padding:5px 6px}.cr-seat.me{border-color:#6a5326}.cr-seat.vacant{opacity:.85;border-style:dashed}
.cr-seat-top{display:flex;align-items:center;gap:5px}
.cr-oi{width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 60%,#3a2516,#120b08);border:1px solid var(--rf-line)}
.cr-on{font:700 12px/1 Cinzel,serif;letter-spacing:.05em;color:var(--rf-title)}
.cr-holder{display:flex;align-items:center;gap:6px;margin-top:5px;min-height:24px}
.cr-hn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr-appoint{display:flex;gap:2px;margin-top:5px}.cr-appoint select{flex:1;min-width:0}.cr-appoint .rf-tbtn{width:24px;padding:0}
.cr-treasury{padding:6px 7px}
.cr-coin{display:flex;align-items:center;gap:6px}.cr-coin b{font:700 20px/1 Cinzel,serif;color:var(--rf-gold)}
.cr-goods{display:flex;flex-wrap:wrap;gap:3px;margin:5px 0}.cr-goods .rf-ichip{height:20px}
.cr-line{display:flex;align-items:center;gap:4px;margin-top:5px;font-size:11px}.cr-line select{max-width:150px}
.cr-lab{min-width:46px}.cr-go{margin-left:auto}
.cr-dep{padding-top:5px;border-top:1px solid var(--rf-rule)}
.cr-tools{margin-top:6px;padding-top:5px;border-top:1px dashed #6a5326}
.cr-tl{display:flex;align-items:center;gap:4px;font:700 11px/1 Cinzel,serif;letter-spacing:.12em;text-transform:uppercase;color:var(--rf-gold)}
.cr-chron{border:1px solid var(--rf-rule);background:var(--rf-sunk);padding:2px 6px}
.cr-log{display:flex;gap:6px;justify-content:space-between;padding:3px 0;border-bottom:1px solid #1d130e;font-size:11px}.cr-log:last-child{border:0}.cr-log b{color:var(--rf-title)}.cr-log .rf-dim{white-space:nowrap}
.cr-bad{color:var(--rf-bad)}.cr-bad b{color:var(--rf-bad)!important}
.cr-banner{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:6px;border:1px solid #6a5326;background:linear-gradient(90deg,#2a1b10,var(--rf-sunk))}
.cr-bt{font:700 14px/1.1 Cinzel,serif;color:var(--rf-title)}.cr-banner .rf-dim{font-size:11px;margin-top:2px}
.cr-cands{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.cr-cand{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 5px 6px;text-align:center}
.cr-cand.first{border-color:#6a5326;background:linear-gradient(180deg,#2a1b10,var(--rf-sunk))}
.cr-cand.voted{border-color:var(--rf-good);box-shadow:inset 0 0 0 1px #2c3d1e}
.cr-rank{position:absolute;top:3px;left:5px;font:700 11px/1 Cinzel,serif;color:var(--rf-gold)}
.cr-cn{font:700 12px/1.1 Cinzel,serif;color:var(--rf-title);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.cr-cp{display:inline-flex;align-items:center;gap:3px;font:700 12px/1 Inter,sans-serif;color:var(--rf-gold)}
.cr-vb{width:100%;margin-top:2px}.cr-vn{font-size:11px}.cr-vn b{color:var(--rf-ink)}
.cr-cand .rf-tbtn{width:100%;margin-top:3px}
.cr-nc{padding:6px 7px;margin-top:6px}.cr-nc.open{border-color:#5a2c22;background:linear-gradient(180deg,#24120e,var(--rf-sunk))}
.cr-nct{display:flex;align-items:center;gap:5px;font:700 13px/1 Cinzel,serif;color:var(--rf-title)}.cr-nct .rf-dim{margin-left:auto;font:600 11px/1 Inter,sans-serif}
.cr-yn{display:flex;align-items:center;gap:6px;margin-top:7px;font:700 11px/1 Inter,sans-serif}.cr-y{color:var(--rf-bad)}.cr-n{color:var(--rf-good)}
.cr-ynbar{flex:1;height:8px;background:#1d2a14;border:1px solid var(--rf-rule)}.cr-ynbar i{display:block;height:100%;background:linear-gradient(180deg,#f08a70,#9a3a22)}
.cr-pb{flex:1}.cr-sig{font:700 13px/1 Cinzel,serif;color:var(--rf-gold);min-width:34px;text-align:right}
.cr-rk{display:flex;align-items:center;gap:6px;padding:3px 4px;border-bottom:1px solid #1d130e;font-size:11.5px}.cr-rk.me{background:var(--rf-sel)}
.cr-rn{width:14px;text-align:right;color:var(--rf-muted);font:700 11px/1 Cinzel,serif}.cr-rkn{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cr-rk b{min-width:24px;text-align:right;color:var(--rf-gold)}
.cr-order{display:flex;gap:7px;padding:5px 6px;margin-bottom:4px}.cr-order.closed{opacity:.6}
.cr-order.war{border-left:3px solid #b42c22}.cr-order.def{border-left:3px solid #2e6c9c}.cr-order.rally{border-left:3px solid var(--rf-gold)}.cr-order.sup{border-left:3px solid #6a8a3a}
.cr-oic{width:40px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 65%,#3a2516,#120b08);border:1px solid var(--rf-line)}
.cr-ob{flex:1;min-width:0}
.cr-otop{display:flex;align-items:center;gap:5px}
.cr-okind{font:700 13px/1 Cinzel,serif;color:var(--rf-title)}.war .cr-okind{color:#f08a70}.def .cr-okind{color:#8ab8e0}.sup .cr-okind{color:var(--rf-good)}
.cr-owhere{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px}
.cr-bounty{height:20px}
.cr-prog{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:11px}.cr-prog .rf-bar{flex:1}
.cr-pn{display:inline-flex;align-items:center;gap:2px;white-space:nowrap;font:700 12px/1 Inter,sans-serif;color:var(--rf-gold)}
.cr-ofoot{display:flex;align-items:center;gap:4px;font-size:11px}.cr-oact{margin-left:auto;display:flex;gap:3px;align-items:center}.cr-ofoot .rf-tbtn,.cr-pact .rf-tbtn{height:22px}
.cr-st{font:600 11px/1 Inter,sans-serif;text-transform:capitalize;color:var(--rf-muted)}.cr-st.done,.cr-st.active{color:var(--rf-good)}.cr-st.broken,.cr-st.refused{color:var(--rf-bad)}.cr-st.offered{color:var(--rf-gold)}
.cr-post{padding:6px 7px}.cr-kinds{display:flex;gap:3px}.cr-kinds .rf-tbtn{flex:1;gap:3px}
.cr-none{padding:8px 6px;font-size:11.5px;text-align:center;border:1px dashed var(--rf-rule)}
.cr-pact{display:flex;align-items:center;gap:7px;padding:5px 6px;margin-bottom:4px}.cr-pact.broken{border-color:#5a2c22}.cr-pact.active{border-color:#3f5a2c}
.cr-flags{display:inline-flex;align-items:center;gap:3px}.cr-flags i{width:12px;height:16px;background:var(--c);clip-path:polygon(0 0,100% 0,100% 100%,50% 78%,0 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
.cr-pb2{flex:1;min-width:0}.cr-pt{font:700 12.5px/1.1 Cinzel,serif;color:var(--rf-title)}.cr-pb2 .rf-dim{font-size:11px;margin-top:2px}
.cr-pk{grid-template-columns:1fr 1fr;flex:1}.cr-note{font-size:11px;margin-top:5px;line-height:1.3}
.cr-msg{min-height:15px;margin-top:4px;font-size:11.5px;color:var(--rf-good)}.cr-msg::first-letter{text-transform:uppercase}.cr-msg.bad{color:var(--rf-bad)}.cr-msg.ask{color:var(--rf-gold)}
#rfCrown.busy [data-act]:not([data-act=tab]):not([data-act=close]){pointer-events:none;opacity:.55}
#rfCrown .rf-tbtn.sure{width:auto!important;padding:0 7px!important;color:var(--rf-bad);box-shadow:0 0 0 1px var(--rf-bad)}
#rfCrownBtn{position:relative}
#rfCrownBtn.pip::after{content:'';position:absolute;right:-2px;top:-2px;width:7px;height:7px;border-radius:50%;background:var(--rf-gold);box-shadow:0 0 4px var(--rf-gold)}
`;

interface OrderForm { kind: OrderKind; region: string; target: string; res: string; n: number; bounty: number; hours: number }

/** The empty view (offline, or before the first read). */
const blank = (pid: number): CrownView => ({
  alliance: null, now: Date.now(), monarch: null, regent: false, council: OFFICES.map((o) => ({ office: o.id, pid: null, name: null })), treasury: { goods: {}, tax: 0, taxed: 0 },
  election: null, petition: null, petitionCooldown: 0, orders: [], pacts: [], log: [], members: [], me: { pid, power: 0, weight: 1, offices: [], monarch: false },
});

/** Does something wait for him (a vote not cast, a petition vote open)? */
const waiting = (v: CrownView) => (!!v.election && v.election.mine === null) || (v.petition?.state === 'open' && v.petition.mine === null);

export function mountCrown(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const tip = mk('rfCrownTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const win = mk('rfCrown', 'top:40px;right:110px;width:420px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card';
  draggable(win, '.rf-head');
  tipper(win, tip);
  const online = () => !!s.sim.net;
  let v: CrownView = blank(s.sim.playerId ?? 0), tab: Tab = 'court', msg = '', bad = false, demo = false;
  /** A server call in flight (its buttons wait); the button armed by a first click (data-sure), until a second. */
  let busy = false, armed: string | null = null, disarm = 0;
  const form: OrderForm = { kind: 'attack', region: WORLD_REGIONS[0].id, target: '', res: 'stone', n: 100, bounty: 200, hours: 24 };
  const pact = { to: 0, kind: 'pact' as 'pact' | 'truce' };
  const btn = document.createElement('button');
  const render = () => {
    btn.classList.toggle('pip', waiting(v));
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop;
    const sub = v.alliance === null ? (online() || demo ? 'no alliance' : 'offline')
      : v.election ? `election · closes in ${until(v.election.closes - v.now)}` : v.monarch ? `${v.regent ? 'regency' : 'reign'} of ${esc(v.monarch.name)}` : 'the crown is empty';
    const tabs: [Tab, string][] = [['court', 'Court'], ['election', v.election ? 'Election •' : 'Election'], ['orders', `Orders${v.orders.some((o) => o.state === 'open') ? ` ${v.orders.filter((o) => o.state === 'open').length}` : ''}`], ['envoys', 'Envoys']];
    const body = v.alliance === null ? noAlliance(online() || demo) : tab === 'court' ? courtHtml(v) : tab === 'election' ? electionHtml(v) : tab === 'orders' ? ordersHtml(v, form) : envoysHtml(v, pact);
    win.innerHTML = `<div class="rf-head rf-ph">${CROWN_SVG(30)}<div style="flex:1;min-width:0"><div class="rf-name">The Crown${v.alliance !== null ? ` of ${esc(allianceName(v.alliance))}` : ''}</div><div class="sub">${sub}</div></div><button class="rf-tbtn x" data-act="close" title="close (Esc)">×</button></div>
      ${v.alliance === null ? '' : `<div class="rf-tabs">${tabs.map(([k, n]) => `<button class="rf-tab${tab === k ? ' on' : ''}" data-act="tab" data-t="${k}">${n}</button>`).join('')}</div>`}
      ${body}<div class="cr-msg${bad ? ' bad' : armed ? ' ask' : ''}">${esc(busy ? 'sending…' : msg)}</div>`;
    win.classList.toggle('busy', busy);
    const sure = armed ? win.querySelector<HTMLElement>(`[data-sure="${armed}"]`) : null;
    if (sure) (sure.classList.add('sure'), (sure.textContent = 'Confirm'));
    win.scrollTop = scroll;
    fitHeight(win, CORNER_BOTTOM);
  };
  const arm = (key: string | null, text = '') => {
    clearTimeout(disarm);
    armed = key;
    msg = text;
    bad = false;
    if (key) disarm = window.setTimeout(() => { if (armed === key) arm(null), render(); }, 5000);
  };
  const load = async () => {
    if (demo) return render();
    if (online()) {
      const r = await s.sim.api<CrownView>('GET', 'crown');
      if (r && 'council' in r) v = r;
    } else v = blank(s.sim.playerId ?? 0);
    render();
  };
  const toggle = (on = win.style.display === 'none') => {
    if (on) closeCornerWindows(btn.id);
    win.style.display = on ? '' : 'none';
    btn.classList.toggle('on', on);
    arm(null);
    if (on) void load();
  };
  const num = (k: string) => Number((win.querySelector<HTMLInputElement>(`[data-in="${k}"]`)?.value ?? '').trim());
  const sel = (k: string) => win.querySelector<HTMLSelectElement>(`[data-sel="${k}"]`)?.value ?? '';
  const call = (path: string, body: unknown, done: (r: Record<string, unknown>) => string) => {
    if (!online()) {
      bad = true;
      msg = 'offline: the crown needs the server';
      return render();
    }
    busy = true;
    render();
    void s.sim.api<Record<string, unknown> & { error?: string; message?: string }>('POST', `crown/${path}`, body).then((r) => {
      busy = false;
      bad = !r || !!r.error;
      msg = !r ? 'no answer' : r.error ? String(r.message ?? r.error) : done(r);
      void load();
    });
  };
  /** Keep the order form's fields across renders. */
  const keepForm = () => {
    const t = win.querySelector<HTMLInputElement>('[data-in="target"]');
    if (sel('region')) form.region = sel('region');
    if (t) form.target = t.value;
    if (sel('res')) form.res = sel('res');
    for (const k of ['n', 'bounty', 'hours'] as const) if (win.querySelector(`[data-in="${k}"]`)) form[k] = num(k) || form[k];
    if (sel('to')) pact.to = Number(sel('to'));
  };
  win.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const a = t.dataset.act!, id = Number(t.dataset.id), sure = t.dataset.sure;
    keepForm();
    if (a === 'close') return toggle(false);
    if (busy && a !== 'tab') return;
    // a destructive button asks first: the first click arms it, a second within 5 s acts
    if (sure && armed !== sure) return (arm(sure, SURE[a] ?? 'Click Confirm to go ahead.'), render());
    if (armed) arm(null);
    if (a === 'tab') return ((tab = t.dataset.t as Tab), (msg = ''), render());
    if (a === 'kind') {
      form.kind = t.dataset.k as OrderKind;
      const towns = form.kind === 'supply';
      if (towns !== TOWNS.includes(form.region) || (towns && !TOWNS.includes(form.region))) form.region = towns ? TOWNS[0] : WORLD_REGIONS[0].id;
      return render();
    }
    if (a === 'pk') return ((pact.kind = t.dataset.k as 'pact' | 'truce'), render());
    if (a === 'tax-' || a === 'tax+') {
      const inp = win.querySelector<HTMLInputElement>('[data-in="tax"]')!;
      inp.value = String(Math.max(0, Math.min(CROWN.taxMax, (Number(inp.value) || 0) + (a === 'tax+' ? 1 : -1))));
      return;
    }
    if (a === 'vote') return call('vote', { candidate: Number(t.dataset.p) }, () => 'your vote is cast');
    if (a === 'sign') return call('petition', {}, (r) => (r.state === 'open' ? 'the petition carries: the vote is open' : `signed: ${r.signs} of ${r.need}`));
    if (a === 'conf') return call('confidence', { yes: t.dataset.y === '1' }, () => 'your vote is cast');
    if (a === 'appoint') {
      const p = Number(sel(`appoint-${t.dataset.o}`));
      if (!p) return ((bad = true), (msg = 'choose a member'), render());
      return call('appoint', { office: t.dataset.o, pid: p }, () => 'appointed');
    }
    if (a === 'dismiss') return call('appoint', { office: t.dataset.o, pid: null }, () => 'dismissed');
    if (a === 'tax') return call('tax', { pct: Math.round(num('tax')) }, (r) => `the tax is ${r.pct}%`);
    if (a === 'deposit') return call('deposit', { coin: num('dep') }, (r) => `the treasury holds ${fmt(Number(r.coin))} coin`);
    if (a === 'fundWork') return call(`works/${sel('work')}`, { goods: { [sel('workRes')]: num('workN') } }, (r) => `given: ${Object.entries((r.given as Record<string, number>) ?? {}).map(([g, n]) => `${fmt(n)} ${g}`).join(', ')}`);
    if (a === 'fundContract') return call(`contracts/${Math.round(num('ctId'))}`, { coin: num('ctCoin') }, (r) => `granted ${fmt(Number(r.coin))} coin`);
    if (a === 'post') {
      const body = { kind: form.kind, region: form.region, hours: Math.round(form.hours), bounty: form.kind === 'rally' ? 0 : form.bounty, ...(form.kind === 'supply' ? { res: form.res, n: form.n } : form.target.trim() ? { target: form.target.trim() } : {}) };
      return call('orders', body, () => 'the order is posted');
    }
    if (a === 'endOrder') return call(`orders/${id}/end`, {}, (r) => (Number(r.paid) > 0 ? `paid out ${fmt(Number(r.paid))} coin` : `the order is ${r.state}`));
    if (a === 'deliver') return call(`orders/${id}/deliver`, { n: num(`dl-${id}`) }, (r) => `delivered ${fmt(Number(r.n))} · paid ${fmt(Number(r.paid))} coin${r.done ? ' · the quest is done' : ''}`);
    if (a === 'offer') return call('pacts', { to: pact.to, kind: pact.kind }, () => `${pact.kind} offered to ${allianceName(pact.to)}`);
    if (a === 'pact') return call(`pacts/${id}/${t.dataset.a}`, {}, (r) => `the ${String(r.state)}`);
  });
  win.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-sel="region"],[data-sel="res"],[data-sel="to"]')) keepForm();
  });
  btn.className = 'rf-tbtn';
  btn.id = 'rfCrownBtn';
  btn.textContent = 'Crown';
  btn.title = 'the crown and council of your alliance';
  btn.onclick = () => toggle();
  // Esc: an armed button first, then the window (before the selection and the game menu hear it)
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (win.style.display === 'none' || keys.act(e) !== 'back') return;
    const at = e.target as HTMLElement;
    if (at.closest?.('input,textarea,select') && !win.contains(at)) return; // the chat's own Esc
    e.preventDefault();
    e.stopImmediatePropagation();
    if (armed) (arm(null), render());
    else toggle(false);
  }, true);
  const corner = document.getElementById('rfDev');
  corner?.insertBefore(btn, document.getElementById('rfTasksBtn')?.nextSibling ?? corner.children[1] ?? null);
  setInterval(() => (online() ? void load() : ((v = { ...v, now: Date.now() }), render())), 60_000);
  setTimeout(() => void load(), 5000);
  // dev: fill the panel offline (screenshots, layout checks)
  if (import.meta.env.DEV) (window as unknown as { __crown: unknown }).__crown = {
    view: (x: CrownView) => ((demo = true), (v = x), render()),
    open: (t: Tab = 'court') => ((tab = t), toggle(true)),
    tab: (t: Tab) => ((tab = t), render()),
  };
}
