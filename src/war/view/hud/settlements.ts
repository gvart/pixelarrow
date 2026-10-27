/**
 * W-63 shared settlements on the HUD (docs/impl/global-war-rebuild.md W-63), in the red-figure kit:
 *
 *   top centre   the town badge becomes the settlement's while the camera is over one (./peace.ts asks settleHost):
 *                its level ring, name and your standing; click for the settlement card (./settleCards.ts): level,
 *                banner, lord, overlord and tribute, vassals, citizens and plots, truces, the next level's needs and
 *                the actions your standing allows (ask to settle with the banner warning, offer terms, garrison,
 *                truce, rebel); disabled ones say why
 *   top right    Holdings (the corner button, a count when something waits): your settlements, requests and offers
 *                with their clocks, accept or refuse (a plot request opens the plot picker on the ground: ../plots.ts),
 *                what you sent, your truces
 *   under it     notices: "your vassal X is under attack" (the world socket's settlementAttacked) with a jump to it; W-64
 *                crown news (crownNews: elections, a new monarch, a pact broken); a
 *                build refused on settled ground (notYourGround) in words
 *   build bar    the founding hint while a camp is in hand and you rule no settlement yet
 *
 * Online it reads the region's `settlements` message and /api/war/settlements; offline (dev) `window.__settle` fills
 * it with made-up settlements and answers its own requests (screenshots, layout checks).
 */
import type { ServerMsg, SettlementNet } from '../../net/protocol';
import { worldTaps } from '../../net/chatLink';
import { SETTLE_UI, type Inbox, type OfferRow, type Plot, type SettleDetail, type WorldSettlement } from '../../net/settlements';
import { left } from '../../net/settlements';
import { worldRegion } from '../../world/graph';
import type { TownLevelSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { PlotLayer } from '../plots';
import { draggable } from './drag';
import { closeCornerWindows, CORNER_BOTTOM, fitHeight } from './kit';
import { keys } from '../../input/keys';
import { tipper } from './roster/ui';
import type { CrownNewsKind } from '../../net/world';
import { askFirst, attackToast, crownToast, FOUND_HINT, groundToast, holdingsHtml, SETTLE_CSS, settlementBadge, settlementCard, viewerOf, type SettleForm, type Viewer } from './settleCards';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type Api = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T | null>;
type Answer = { error?: string; message?: string; offer?: number; state?: string; overlord?: number };

/** What ./peace.ts asks to draw the badge and card as the settlement's. */
export interface SettleHost {
  here(): SettlementNet | null;
  badge(): string;
  card(): string;
  /** Changes when the badge or card must be drawn again. */
  key(): string;
  click(e: MouseEvent): void;
  input(e: Event): void;
}
export const settleHosts = new WeakMap<SandboxScene, SettleHost>();

/** Offline: the player is pid 1. */
const MOCK_ME = 1;

export function mountSettlements(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = SETTLE_CSS;
  document.head.append(style);
  const online = () => !!s.sim.net;
  let list: SettlementNet[] = [], world: WorldSettlement[] = [], inbox: Inbox | null = null;
  const details = new Map<number, SettleDetail>();
  let msg = '', bad = false, ver = 0, pinned: number | null = null;
  /** A request in flight (the actions wait); the Holdings accept armed by a first click, until a second. */
  let busy = false, armed: string | null = null, disarm = 0;
  const form: SettleForm = { open: null, kind: 'vassal', tribute: 10, from: null, bond: 500 };
  const me = () => (online() ? s.sim.playerId : MOCK_ME);
  const plots = new PlotLayer(s, mk);

  // ---------- data: the room's list, the world's settlements, details (names), the inbox ----------
  const mock = offlineBackend(() => ({ list, world, details, inbox }), (x) => ({ list, world, inbox } = { list, world, inbox, ...x }));
  const api: Api = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => (online() ? s.sim.api<T>(method, path, body) : Promise.resolve(mock(method, path, body) as T | null));
  const names = () => {
    const m = new Map<number, string>();
    for (const d of details.values()) for (const x of d.members) if (x.name) m.set(x.pid, x.name);
    for (const x of list) m.set(x.lord, x.lordName);
    return m;
  };
  const changed = () => {
    ver++;
    plots.set(list, names(), me());
  };
  const loadDetails = async () => {
    await Promise.all(list.map(async (x) => {
      const d = await api<SettleDetail>('GET', `settlements/${x.id}`);
      if (d && !('error' in d)) details.set(x.id, d);
    }));
    changed();
  };
  const loadWorld = async () => {
    const r = await api<{ settlements: WorldSettlement[] }>('GET', 'settlements');
    if (r?.settlements) (world = r.settlements), changed();
  };
  const loadInbox = async () => {
    const r = await api<Inbox>('GET', 'settlements/inbox');
    if (r && Array.isArray(r.incoming)) (inbox = r), changed(), renderHoldings();
  };
  const refresh = () => void Promise.all([loadWorld(), loadInbox(), loadDetails()]);
  s.sim.serverTaps.add((m: ServerMsg) => {
    if (m.t === 'settlements') {
      list = m.list;
      changed();
      void loadDetails();
    } else if (m.t === 'error' && m.code === 'notYourGround') note(groundToast(m.detail), 'grd', 6000);
  });
  setTimeout(refresh, 2500);
  setInterval(() => { if (online()) void loadInbox(); }, 30_000);
  setInterval(() => { if (online()) void loadWorld(); }, 120_000);

  /** The settlements the player rules (the world's rows, else the room's). */
  const realm = (): WorldSettlement[] => {
    const pid = me(), w = world.filter((x) => x.lord_pid === pid);
    return w.length ? w : list.filter((x) => x.role === 'lord').map((x) => ({ id: x.id, region: s.region.id, x: x.x, y: x.y, r: x.r, name: x.name, lord_pid: x.lord, lord: x.lordName, level: x.level, overlord_id: x.overlord, tribute_pct: x.tribute, people: x.plots.length + 1 }));
  };
  /** Every settlement known: the world's, with the room's for this region. */
  const known = (): WorldSettlement[] => {
    const ids = new Set(world.map((w) => w.id));
    return [...world, ...list.filter((x) => !ids.has(x.id)).map((x) => ({ id: x.id, region: s.region.id, x: x.x, y: x.y, r: x.r, name: x.name, lord_pid: x.lord, lord: x.lordName, level: x.level, overlord_id: x.overlord, tribute_pct: x.tribute, people: x.plots.length + 1 }))];
  };
  const viewer = (x: SettlementNet): Viewer => viewerOf(x, realm().map((r) => r.id));
  const waiting = () => inbox?.incoming.length ?? 0;

  // ---------- which settlement the badge speaks for: the one under the camera, else the one his men stand in ----------
  const inRing = (x: SettlementNet, px: number, py: number) => (px - x.x) ** 2 + (py - x.y) ** 2 <= x.r * x.r;
  const owner = () => (online() ? `p:${s.sim.playerId}` : 'you');
  const menOn = (x: SettlementNet) => {
    const cur = s.sim.cur;
    if (!cur) return 0;
    const at = new Map(cur.units.map((u) => [u.id, u])), o = owner();
    let n = 0;
    for (const q of cur.squads) if (q.owner === o) for (const id of q.units) { const u = at.get(id); if (u && u.state !== 'dead' && inRing(x, u.x, u.y)) n++; }
    return n;
  };
  const here = (): SettlementNet | null => {
    if (!list.length) return null;
    if (pinned !== null) { const p = list.find((x) => x.id === pinned); if (p) return p; pinned = null; }
    const c = s.game.canvas.getBoundingClientRect(), t = s.tileAt({ x: c.width / 2, y: c.height / 2 });
    return list.find((x) => inRing(x, t.x, t.y)) ?? null;
  };
  const townOf = (x: SettlementNet): TownLevelSnap | null => s.sim.cur?.townLevels?.find((t) => t.id === x.centre) ?? null;
  let lastHere: number | null = null;

  const ctx = (x: SettlementNet) => ({
    s: x, viewer: viewer(x), detail: details.get(x.id) ?? null, world: known(), realm: realm(), men: menOn(x), town: townOf(x),
    inbox, form, msg, bad, online: online(), now: Date.now(), busy,
  });
  const say = (t: string, isBad = false) => ((msg = t), (bad = isBad), ver++);
  /** POST and wait: the card and the panel show "Sending…" and their buttons wait until the answer. */
  const post = (path: string, body?: unknown) => {
    busy = true;
    ver++;
    renderHoldings();
    return api<Answer>('POST', path, body).finally(() => (busy = false));
  };
  const answer = (r: Answer | null, ok: string) => {
    if (!r) say('No answer from the server', true);
    else if (r.error) say(r.message ?? r.error, true);
    else say(ok);
    form.open = null;
    void loadInbox();
    void loadWorld();
    renderHoldings();
  };

  // ---------- actions (the card and the panel share them) ----------
  const act = (a: string, x: SettlementNet | null) => {
    const [k, arg] = a.split(':');
    const id = Number(arg);
    if (busy && k !== 'close' && k !== 'goto') return;
    if (armed && a !== armed) (armed = null), renderHoldings();
    if (k === 'close-form') return ((form.open = null), ver++);
    if (k === 'terms' || k === 'truce' || k === 'rebel') {
      form.open = form.open === k ? null : k;
      form.from ??= realm().find((r) => r.id !== x?.id)?.id ?? null;
      return ver++;
    }
    if (k === 'kind') return ((form.kind = arg as SettleForm['kind']), ver++);
    if (k === 'bond') return ((form.bond = Math.max(1, Math.min(SETTLE_UI.bondMax, form.bond + id))), ver++);
    if (k === 'holdings') return toggleHoldings(true);
    if (k === 'close') return toggleHoldings(false);
    if (k === 'goto') return goTo(id);
    if (k === 'withdraw' || k === 'refuse') return void post(`settlements/offers/${id}/refuse`).then((r) => answer(r, k === 'withdraw' ? 'Withdrawn' : 'Refused'));
    if (k === 'accept') return accept(id);
    if (!x) return;
    if (k === 'settle') return void post(`settlements/${x.id}/settle`).then((r) => answer(r, `Asked: ${x.lordName} answers within ${left(SETTLE_UI.offerMs)}`));
    if (k === 'send-terms') return void post(`settlements/${x.id}/terms`, form.kind === 'vassal' ? { kind: 'vassal', from: form.from, tribute: form.tribute } : { kind: 'join' }).then((r) => answer(r, 'Terms sent'));
    if (k === 'garrison') return void post(`settlements/${x.id}/garrison`, { from: x.overlord }).then((r) => answer(r, 'Asked to garrison'));
    if (k === 'send-truce') return void post(`settlements/${x.id}/truce`, { from: form.from, bond: form.bond }).then((r) => answer(r, `Truce offered: ${form.bond} coin held`));
    if (k === 'send-rebel') return void post(`settlements/${x.id}/rebel`).then((r) => answer(r, 'You are free: no more tribute'));
  };
  /** Accept: a plot request picks the plot on the ground first (in its region only). */
  const accept = (id: number) => {
    const o = inbox?.incoming.find((x) => x.id === id);
    if (!o) return;
    const yes = (plot?: Plot) => void post(`settlements/offers/${id}/accept`, plot ? { plot } : {}).then((r) => answer(r, o.kind === 'settle' ? `${o.from_name ?? 'They'} settled` : o.kind === 'truce' ? 'Truce sealed' : 'Accepted'));
    // giving something up (tribute, the lordship) asks first: the first click arms, a second within 5 s accepts
    const key = `accept:${id}`;
    if (askFirst(o.kind) && armed !== key) {
      clearTimeout(disarm);
      armed = key;
      disarm = window.setTimeout(() => { if (armed === key) (armed = null), renderHoldings(); }, 5000);
      return renderHoldings();
    }
    armed = null;
    if (o.kind !== 'settle') return yes();
    const at = list.find((x) => x.id === o.to_settlement);
    if (!at) return ((msg = `Go to ${o.to_name} to stake the plot`), (bad = true), renderHoldings());
    toggleHoldings(false);
    plots.start(at, o.from_name ?? `Player ${o.from_pid}`, (p) => (p ? yes(p) : toggleHoldings(true)));
  };
  /** Jump to a settlement: here, the camera; elsewhere, its region. */
  const goTo = (id: number, region?: string) => {
    const x = list.find((l) => l.id === id), w = world.find((l) => l.id === id);
    if (x) return ((pinned = x.id), s.focus(x.x, x.y, 1), ver++);
    const to = w?.region ?? region;
    if (!to || to === s.region.id) return undefined;
    const q = new URLSearchParams(location.search);
    q.set('region', to);
    if (q.has('net')) q.set('net', `/ws/war/${to}`);
    location.href = `sandbox.html?${q}`;
    return undefined;
  };

  // ---------- the host ./peace.ts draws the badge and card from ----------
  settleHosts.set(s, {
    here: () => {
      const h = here();
      if ((h?.id ?? null) !== lastHere) ((lastHere = h?.id ?? null), (form.open = null), (msg = ''));
      return h;
    },
    badge: () => { const h = here(); return h ? settlementBadge(h, viewer(h), viewer(h) === 'lord' ? (inbox?.incoming.filter((o) => o.to_settlement === h.id).length ?? 0) : 0) : ''; },
    card: () => { const h = here(); return h ? settlementCard(ctx(h)) : ''; },
    key: () => { const h = here(); return h ? `${ver}|${h.id}|${menOn(h)}|${JSON.stringify(townOf(h))}` : ''; },
    click: (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-sa]');
      if (t && !(t as HTMLButtonElement).disabled) act(t.dataset.sa!, here());
    },
    input: (e) => {
      const el = e.target as HTMLInputElement, f = el.dataset.sf;
      if (f === 'tribute') {
        form.tribute = Math.max(0, Math.min(SETTLE_UI.tributeMax, Math.round(Number(el.value)) || 0));
        // in place: drawing the card again would drop the slider mid-drag
        const card = el.closest('.st-form'), pct = card?.querySelector('.st-pct'), note = card?.querySelector('.st-note');
        if (pct) pct.textContent = `${form.tribute}%`;
        if (note) note.textContent = note.textContent!.replace(/\d+% of/, `${form.tribute}% of`);
      } else if (f === 'bond') form.bond = Math.max(1, Math.min(SETTLE_UI.bondMax, Math.floor(Number(el.value)) || 1));
      else if (f === 'from') (form.from = Number(el.value)), ver++;
    },
  });

  // ---------- the Holdings panel and its corner button ----------
  const tip = mk('rfSettleTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const win = mk('rfHoldings', 'top:40px;right:110px;width:360px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card';
  draggable(win, '.rf-head');
  tipper(win, tip);
  const btn = document.createElement('button');
  btn.className = 'rf-tbtn';
  btn.id = 'rfHoldingsBtn';
  btn.title = 'your settlements, requests to settle, terms and truces';
  btn.onclick = () => toggleHoldings();
  const corner = document.getElementById('rfDev');
  corner?.insertBefore(btn, corner.children[1] ?? null);
  const drawBtn = () => {
    const n = waiting();
    btn.innerHTML = `Holdings${n ? `<b class="st-n">${n}</b>` : ''}`;
    btn.style.display = online() || list.length || realm().length || n ? '' : 'none';
  };
  function renderHoldings(): void {
    drawBtn();
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop;
    win.innerHTML = holdingsHtml({ inbox, realm: realm(), world: known(), now: Date.now(), online: online() || !!inbox, msg, bad, busy, armed });
    win.scrollTop = scroll;
    fitHeight(win, CORNER_BOTTOM);
  }
  function toggleHoldings(on = win.style.display === 'none'): void {
    if (on) closeCornerWindows(btn.id);
    win.style.display = on ? '' : 'none';
    btn.classList.toggle('on', on);
    armed = null;
    if (on) (msg = ''), void loadInbox(), void loadWorld();
    renderHoldings();
  }
  // Esc: an armed accept first, then the panel (before the selection and the game menu hear it)
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (win.style.display === 'none' || keys.act(e) !== 'back' || plots.pick) return;
    const at = e.target as HTMLElement;
    if (at.closest?.('input,textarea,select') && !win.contains(at)) return; // the chat's own Esc
    e.preventDefault();
    e.stopImmediatePropagation();
    if (armed) (armed = null), renderHoldings();
    else toggleHoldings(false);
  }, true);
  win.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-sa]');
    if (t && !(t as HTMLButtonElement).disabled) act(t.dataset.sa!, null);
  });
  // the clocks tick in place, once a second (card and panel)
  setInterval(() => {
    const now = Date.now();
    for (const el of document.querySelectorAll<HTMLElement>('#rfHoldings [data-left], #rfTownCard [data-left]')) el.textContent = left(Number(el.dataset.left) - now);
    drawBtn();
  }, 1000);

  // ---------- notices ----------
  const notes = mk('rfSettleNote', '');
  function note(html: string, kind: 'atk' | 'grd' | 'crn', ms: number, jump?: () => void): void {
    const el = document.createElement('div');
    el.className = `rf rf-card sx ${kind}`;
    el.style.position = 'static';
    el.innerHTML = html;
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-sx]')?.dataset.sx;
      if (a === 'jump') jump?.();
      if (a) el.remove();
    });
    notes.append(el);
    while (notes.children.length > 3) notes.firstElementChild!.remove();
    setTimeout(() => ((el.style.opacity = '0'), (el.style.transform = 'translateX(12px)')), ms);
    setTimeout(() => el.remove(), ms + 450);
  }
  const attacked = (m: { settlement: number; name: string; region: string; broken: number[] }) => {
    const mine = realm().some((r) => r.id === m.settlement) || list.some((x) => x.id === m.settlement && x.role === 'lord');
    note(attackToast({ name: m.name, region: m.region, mine, broken: m.broken.length, here: m.region === s.region.id }), 'atk', 14_000, () => goTo(m.settlement, m.region));
    void loadInbox();
  };
  worldTaps.add((m) => { if (m.t === 'settlementAttacked') attacked(m as unknown as Parameters<typeof attacked>[0]); });
  // W-64: crown news (an election opened or closed, a new monarch, a pact broken) as a notice
  worldTaps.add((m) => { if (m.t === 'crownNews') note(crownToast(m as unknown as { kind: CrownNewsKind; text: string }), 'crn', 10_000); });

  // ---------- the founding hint: a camp in hand, outside home, and no settlement of his yet ----------
  const hint = mk('rfFoundHint', '', FOUND_HINT);
  hint.className = 'rf rf-label';
  setInterval(() => {
    const b = s.build, t = b?.tool, bar = document.getElementById('rfBuild');
    const show = !!b?.active && t?.kind === 'building' && t.type === 'camp' && worldRegion(s.region.id)?.role !== 'home' && !realm().length && !list.some((x) => x.role === 'lord');
    hint.style.display = show ? 'flex' : 'none';
    if (!show || !bar) return;
    const r = bar.getBoundingClientRect(), z = Number(hint.style.zoom) || 1;
    hint.style.left = `${(r.left + r.width / 2) / z}px`;
    hint.style.transform = 'translateX(-50%)';
    hint.style.top = `${(r.top - hint.offsetHeight * z - 34 * z) / z}px`;
  }, 300);

  // dev: settlements offline (screenshots, layout checks)
  if (import.meta.env.DEV) (window as unknown as { __settle: unknown }).__settle = {
    set: (x: { list?: SettlementNet[]; world?: WorldSettlement[]; details?: SettleDetail[]; inbox?: Inbox }) => {
      if (x.list) list = x.list;
      if (x.world) world = x.world;
      if (x.inbox) inbox = x.inbox;
      for (const d of x.details ?? []) details.set(d.id, d);
      changed();
      renderHoldings();
    },
    holdings: (on = true) => toggleHoldings(on),
    act: (a: string) => act(a, here()),
    attack: (m: { settlement: number; name: string; region: string; broken?: number[] }) => attacked({ broken: [], ...m }),
    ground: (detail?: string) => note(groundToast(detail), 'grd', 6000),
    pin: (id: number | null) => ((pinned = id), ver++),
    pickRect: (p: Plot) => plots.setRect(p),
  };
}

/**
 * Offline answers to the REST calls (dev only): the made-up settlements as `__settle` set them; asking, accepting and
 * refusing change them as the server would (roughly), so the panels can be clicked through without a server.
 */
function offlineBackend(get: () => { list: SettlementNet[]; world: WorldSettlement[]; details: Map<number, SettleDetail>; inbox: Inbox | null }, put: (x: { list?: SettlementNet[]; inbox?: Inbox | null }) => void) {
  let seq = 900;
  return (method: 'GET' | 'POST', path: string, body?: unknown): unknown => {
    const st = get(), ib = st.inbox ?? { incoming: [], outgoing: [], truces: [] };
    if (method === 'GET') {
      if (path === 'settlements') return { settlements: st.world };
      if (path === 'settlements/inbox') return st.inbox;
      const d = st.details.get(Number(path.split('/')[1]));
      return d ?? null;
    }
    const m = /^settlements\/(?:offers\/)?(\d+)\/(\w+)$/.exec(path);
    if (!m) return { error: 'offline' };
    const id = Number(m[1]), what = m[2];
    if (what === 'refuse') return put({ inbox: { ...ib, incoming: ib.incoming.filter((o) => o.id !== id), outgoing: ib.outgoing.filter((o) => o.id !== id) } }), { state: 'refused' };
    if (what === 'accept') {
      const o = ib.incoming.find((x) => x.id === id), plot = (body as { plot?: Plot } | undefined)?.plot;
      if (o?.kind === 'settle' && plot) {
        put({ list: st.list.map((x) => (x.id === o.to_settlement ? { ...x, plots: [...x.plots, { pid: o.from_pid, ...plot }] } : x)) });
        const d = st.details.get(o.to_settlement);
        if (d) d.members.push({ pid: o.from_pid, name: o.from_name, role: 'citizen', ...plot, since: Date.now() });
      }
      return put({ inbox: { ...ib, incoming: ib.incoming.filter((x) => x.id !== id) } }), { state: 'accepted' };
    }
    const to = st.list.find((x) => x.id === id) ?? st.world.find((x) => x.id === id);
    const b = (body ?? {}) as { kind?: OfferRow['kind']; from?: number; tribute?: number; bond?: number };
    const kind: OfferRow['kind'] = what === 'terms' ? (b.kind ?? 'vassal') : what === 'garrison' ? 'garrison' : what === 'truce' ? 'truce' : 'settle';
    if (what === 'rebel') return { overlord: 0 };
    const o: OfferRow = { id: ++seq, kind, from_pid: MOCK_ME, from_name: 'You', from_settlement: b.from ?? null, to_settlement: id, to_name: to?.name ?? '?', tribute_pct: b.tribute ?? 0, bond: b.bond ?? 0, state: 'open', expires_at: Date.now() + SETTLE_UI.offerMs, ends_at: null };
    return put({ inbox: { ...ib, outgoing: [...ib.outgoing, o] } }), { offer: o.id };
  };
}
