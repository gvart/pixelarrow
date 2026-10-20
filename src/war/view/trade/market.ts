/**
 * The market behind the trade panels (../hud/market.ts; docs/WAR.md "Trade"): stalls and warehouses, offers and
 * escrowed buy orders, the price board, contracts, letters of credit, stow and the hand-off window.
 *
 *   net mode (?net=)   the server: /api/war/trade/* (server/src/war/tradeRoutes.ts) through the worker as the dev player,
 *                      stow and handoff over the region socket (answers on SimClient.onServer)
 *   offline            LocalMarket: an in-memory stub with the server's rules in small (rent from the strongroom, escrow
 *                      out of the stall, stall levels, a contract's escrowed reward, a letter redeemed once) and a few
 *                      seeded offers and contracts of made-up traders, so the panels can be tried with no server. The
 *                      "field" side of a stow is the team's stock.
 */
import type { ServerMsg, StowMsg } from '../../net/protocol';
import type { SandboxScene } from '../SandboxScene';

export type Goods = Record<string, number>;
/** The wire's goods record (the schema types it by every good; any subset is sent). */
type WireGoods = StowMsg['goods'];
export interface Site { id: string; kind: 'stall' | 'warehouse' | 'strongroom'; level: number; paid_to: number | null; goods: Goods }
export interface Offer { id: number; side: 'sell' | 'buy'; res: string | null; item_uid: string | null; n: number; left: number; price: number; standing: number; player?: string }
export interface Mine { sites: Site[]; offers: Offer[] }
export interface BoardRow { ask: number | null; bid: number | null; askDepth: number; bidDepth: number }
/** An open goods offer on the board (server/src/war/market.ts BoardOffer): `n` left, its stall and owner; best first. */
export interface BoardOffer { offer: number; side: 'sell' | 'buy'; res: string; n: number; price: number; stall: string; player: number }
export interface Board { town: string; goods: Record<string, BoardRow>; offers: BoardOffer[]; items: { offer: number; uid: string; price: number }[]; fills: { res: string | null; n: number; price: number; at: number }[] }
export type ContractKind = 'carry' | 'supply' | 'escort';
export interface Contract { id: number; kind: ContractKind; town: string; to_town: string; poster: number; taker: number | null; reward: number; res: string | null; n: number; delivered: number; value: number; deposit: number; state: string; deadline: number }
export interface ContractIn { kind: ContractKind; toTown: string; reward: number; res?: string; n?: number; value?: number; loads?: number; deadline: number }
export interface Letter { id: number; town: string; toTown: string; amount: number; fee: number; state: 'offered' | 'sold' | 'redeemed'; mine: 'banker' | 'buyer' }
export interface Handoff { with: number; state: 'open' | 'done' | 'closed'; halves: Record<number, { goods: Goods; uids: string[] }>; ok: number[]; until?: number; why?: string }
export type Res<T> = T | { error: string };
export const failed = <T>(r: Res<T>): r is { error: string } => typeof r === 'object' && r !== null && 'error' in r;

/** Rent a day in a safe frontier town (server/src/war/market.ts townOf), stall offers by level, upgrades. */
export const RENT = 10;
export const STALL_OFFERS = [0, 4, 8, 12];
export const STALL_UPGRADE: Goods[] = [{}, {}, { coin: 200 }, { coin: 400, silver: 10 }];
export const SITE_LOADS = 20;
export const DEPOSIT = 0.5;
export const LETTER_MAX = 500;

export interface Market {
  readonly live: boolean;
  /** The player's id as the market knows him (hand-off halves are keyed by it). */
  readonly me: number;
  mine(town: string): Promise<Res<Mine>>;
  board(town: string): Promise<Res<Board>>;
  rent(town: string, kind: 'stall' | 'warehouse'): Promise<Res<{ site: string }>>;
  upgrade(town: string): Promise<Res<{ level: number }>>;
  list(town: string, o: { side: 'sell' | 'buy'; res: string; n: number; price: number; standing?: boolean }): Promise<Res<{ offer: number }>>;
  cancel(id: number): Promise<Res<{ ok: true }>>;
  fill(id: number, n: number): Promise<Res<{ n: number; price: number; tax: number }>>;
  contracts(town: string): Promise<Res<{ contracts: Contract[] }>>;
  post(town: string, c: ContractIn): Promise<Res<{ contract: number }>>;
  take(id: number): Promise<Res<{ ok: true }>>;
  letter(town: string, toTown: string, amount: number, fee: number): Promise<Res<{ letter: number }>>;
  buyLetter(id: number): Promise<Res<{ ok: true }>>;
  redeem(id: number): Promise<Res<{ coin: number }>>;
  /** Letters this session knows of (the server lists none: the ones offered, bought or asked for by id here). */
  letters(): Letter[];
  /** Goods between the selected squad (or its cart) and a site here; done gets what moved. */
  stow(dir: 'in' | 'out', site: 'stall' | 'warehouse' | 'strongroom', squad: number, goods: Goods, done: (r: Res<{ goods: Goods }>) => void): void;
  /** The hand-off window with player `with`; `on` hears every change (both halves, who confirmed, done or closed). */
  handoff(op: 'offer' | 'confirm' | 'cancel', withId: number, squad: number | null, goods: Goods): void;
  on(f: (h: Handoff) => void): void;
}

const key = () => `k${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** The server, as the dev player (net mode). */
export function netMarket(s: SandboxScene): Market {
  const api = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Res<T>> => {
    const r = await s.sim.api<T & { error?: string; message?: string }>(method, `trade/${path}`, body ?? (method === 'POST' ? {} : undefined));
    if (!r) return { error: 'no server' };
    if (r.error) return { error: r.message ?? r.error };
    return r;
  };
  const letters: Letter[] = [];
  const subs: ((h: Handoff) => void)[] = [];
  let stowDone: ((r: Res<{ goods: Goods }>) => void) | null = null;
  s.sim.onServer = (m: ServerMsg) => {
    if (m.t === 'handoff') for (const f of subs) f({ with: m.with, state: m.state, halves: m.halves ?? {}, ok: m.ok ?? [], until: m.until, why: m.why });
    else if (m.t === 'stowed') { stowDone?.({ goods: m.goods }); stowDone = null; }
    else if (m.t === 'error' && stowDone) { stowDone({ error: m.detail ?? m.code }); stowDone = null; }
  };
  const note = (l: Letter) => { const i = letters.findIndex((x) => x.id === l.id); if (i >= 0) letters[i] = l; else letters.push(l); };
  return {
    live: true,
    get me() { return s.sim.playerId ?? 0; },
    mine: (t) => api('GET', `${t}/mine`),
    board: (t) => api('GET', `${t}/board`),
    rent: (t, kind) => api('POST', `${t}/rent`, { kind }),
    upgrade: (t) => api('POST', `${t}/upgrade`),
    list: (t, o) => api('POST', `${t}/offers`, o),
    cancel: (id) => api('POST', `offers/${id}/cancel`),
    fill: (id, n) => api('POST', `offers/${id}/fill`, { n, key: key() }),
    contracts: (t) => api('GET', `${t}/contracts`),
    post: (t, c) => api('POST', `${t}/contracts`, c),
    take: (id) => api('POST', `contracts/${id}/take`),
    letter: async (t, toTown, amount, fee) => {
      const r = await api<{ letter: number }>('POST', `${t}/letters`, { toTown, amount, fee });
      if (!failed(r)) note({ id: r.letter, town: t, toTown, amount, fee, state: 'offered', mine: 'banker' });
      return r;
    },
    buyLetter: async (id) => {
      const r = await api<{ ok: true }>('POST', `letters/${id}/buy`);
      if (!failed(r)) note({ ...(letters.find((l) => l.id === id) ?? { id, town: '?', toTown: '?', amount: 0, fee: 0 }), state: 'sold', mine: 'buyer' });
      return r;
    },
    redeem: async (id) => {
      const r = await api<{ coin: number }>('POST', `letters/${id}/redeem`);
      if (!failed(r)) note({ ...(letters.find((l) => l.id === id) ?? { id, town: '?', toTown: '?', fee: 0, mine: 'buyer' as const }), amount: r.coin, state: 'redeemed' });
      return r;
    },
    letters: () => letters,
    stow: (dir, site, squad, goods, done) => { stowDone = done; s.sim.stow({ dir, site, squad, goods: goods as WireGoods }); },
    handoff: (op, withId, squad, goods) => s.sim.handoff({ op, with: withId, ...(op === 'offer' && squad !== null ? { squad, goods: goods as WireGoods } : {}) }),
    on: (f) => { subs.push(f); },
  };
}

const sum = (g: Goods) => Object.values(g).reduce((a, n) => a + n, 0);
const add = (g: Goods, r: string, n: number) => { g[r] = Math.round(((g[r] ?? 0) + n) * 100) / 100; if (g[r] <= 1e-6) delete g[r]; };
/** Loads in a site: coin 200 to a load, other goods 100 (src/war/sim/holders.ts). */
const loadsOf = (g: Goods) => Object.entries(g).reduce((a, [r, n]) => a + n / (r === 'coin' ? 200 : 100), 0);
const ok = <T>(v: T): Promise<T> => Promise.resolve(v);
const no = (error: string) => Promise.resolve({ error });

/** Offline: the server's market rules in small, in memory, with made-up traders. */
export class LocalMarket implements Market {
  readonly live = false;
  readonly me = 1;
  private sites: Site[] = [];
  private offers: (Offer & { town: string; mine: boolean })[] = [];
  private fills: Board['fills'] = [];
  private cs: Contract[] = [];
  private ls: Letter[] = [];
  private seq = 100;
  private subs: ((h: Handoff) => void)[] = [];
  private hand: Handoff | null = null;
  private now = () => Date.now();

  constructor(private s: SandboxScene) {
    const t = s.region.id, at = this.now();
    const seed: [Offer['side'], string, number, number, string][] = [['sell', 'tin', 40, 11, 'Lykon'], ['sell', 'tin', 25, 12, 'Damon'], ['buy', 'tin', 30, 9, 'Damon'], ['sell', 'iron', 60, 8, 'Lykon'], ['buy', 'iron', 50, 6, 'Kleon'], ['sell', 'oil', 120, 5, 'Kleon'], ['buy', 'hides', 40, 3, 'Lykon'], ['sell', 'pitch', 30, 3, 'Damon']];
    for (const [side, res, n, price, player] of seed) this.offers.push({ id: ++this.seq, town: t, side, res, item_uid: null, n, left: n, price, standing: 0, player, mine: false });
    this.fills.push({ res: 'tin', n: 10, price: 11, at: at - 4 * 60_000 }, { res: 'iron', n: 20, price: 7, at: at - 11 * 60_000 }, { res: 'oil', n: 30, price: 5, at: at - 25 * 60_000 });
    const day = 86_400_000;
    this.cs.push(
      { id: ++this.seq, kind: 'carry', town: t, to_town: 'stymphalia', poster: 7, taker: null, reward: 60, res: null, n: 6, delivered: 0, value: 400, deposit: 200, state: 'open', deadline: at + day },
      { id: ++this.seq, kind: 'supply', town: 'ammos', to_town: t, poster: 8, taker: null, reward: 90, res: 'iron', n: 50, delivered: 0, value: 0, deposit: 0, state: 'open', deadline: at + 2 * day },
      { id: ++this.seq, kind: 'escort', town: 'ammos', to_town: t, poster: 9, taker: 4, reward: 120, res: null, n: 0, delivered: 0, value: 0, deposit: 0, state: 'taken', deadline: at + day / 2 },
    );
    this.ls.push({ id: ++this.seq, town: t, toTown: 'stymphalia', amount: 120, fee: 6, state: 'offered', mine: 'buyer' });
  }

  private stock(): Goods { return { ...(this.s.sim.cur?.stock?.[0] ?? {}) } as Goods; }
  private site(kind: Site['kind']) { return this.sites.find((x) => x.kind === kind) ?? null; }
  /** Coin from the team's stock (the strongroom offline). */
  private pay(coin: number): boolean {
    if ((this.stock().coin ?? 0) < coin) return false;
    if (coin > 0) this.s.sim.addStock(0, 'coin', -coin);
    return true;
  }
  private takeFrom(g: Goods, from: Goods): boolean {
    for (const [r, n] of Object.entries(g)) if ((from[r] ?? 0) + 1e-6 < n) return false;
    for (const [r, n] of Object.entries(g)) add(from, r, -n);
    return true;
  }

  mine(town: string) {
    return ok({ sites: this.sites.map((x) => ({ ...x, goods: { ...x.goods } })), offers: this.offers.filter((o) => o.mine && o.town === town && o.left > 0) });
  }

  board(town: string) {
    const goods: Record<string, BoardRow> = {}, offers: BoardOffer[] = [];
    for (const o of this.offers) {
      if (o.town !== town || o.left <= 0 || !o.res) continue;
      offers.push({ offer: o.id, side: o.side, res: o.res, n: o.left, price: o.price, stall: `st:${town}:${o.player ?? 'you'}`, player: o.mine ? this.me : 0 });
      const g = (goods[o.res] ??= { ask: null, bid: null, askDepth: 0, bidDepth: 0 });
      if (o.side === 'sell') { if (g.ask === null || o.price < g.ask) g.ask = o.price; g.askDepth += o.left; }
      else { if (g.bid === null || o.price > g.bid) g.bid = o.price; g.bidDepth += o.left; }
    }
    offers.sort((a, b) => a.res.localeCompare(b.res) || (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1) || (a.side === 'sell' ? a.price - b.price : b.price - a.price) || a.offer - b.offer);
    return ok({ town, goods, offers, items: [], fills: this.fills.slice(-10).reverse() });
  }

  rent(_town: string, kind: 'stall' | 'warehouse') {
    if (this.site(kind)) return no(`you rent a ${kind} here already`);
    if (!this.pay(RENT)) return no(`the first day's rent (${RENT} coin) is not in your strongroom`);
    const site: Site = { id: `${kind === 'stall' ? 'st' : 'wh'}:local`, kind, level: 1, paid_to: this.now() + 86_400_000, goods: {} };
    this.sites.push(site);
    return ok({ site: site.id });
  }

  upgrade() {
    const st = this.site('stall');
    if (!st) return no('rent a stall first');
    const cost = STALL_UPGRADE[st.level + 1];
    if (!cost) return no('the stall is at level 3');
    if (!this.takeFrom(cost, st.goods)) return no(`the upgrade takes ${Object.entries(cost).map(([r, n]) => `${n} ${r}`).join(', ')} from the stall`);
    st.level++;
    return ok({ level: st.level });
  }

  list(town: string, o: { side: 'sell' | 'buy'; res: string; n: number; price: number; standing?: boolean }) {
    const st = this.site('stall');
    if (!st) return no('rent a stall first');
    if (this.offers.filter((x) => x.mine && x.left > 0).length >= STALL_OFFERS[st.level]) return no(`a level ${st.level} stall holds ${STALL_OFFERS[st.level]} offers`);
    const escrow: Goods = o.side === 'buy' ? { coin: o.n * o.price } : { [o.res]: o.n };
    if (!this.takeFrom(escrow, st.goods)) return no(o.side === 'buy' ? `escrow: ${o.n * o.price} coin must be in the stall` : `escrow: ${o.n} ${o.res} must be in the stall`);
    const id = ++this.seq;
    this.offers.push({ id, town, side: o.side, res: o.res, item_uid: null, n: o.n, left: o.n, price: o.price, standing: o.standing ? 1 : 0, mine: true });
    return ok({ offer: id });
  }

  cancel(id: number) {
    const o = this.offers.find((x) => x.id === id && x.mine && x.left > 0), st = this.site('stall');
    if (!o || !st) return no('no open offer of yours');
    add(st.goods, o.side === 'buy' ? 'coin' : o.res!, o.side === 'buy' ? o.left * o.price : o.left);
    o.left = 0;
    return ok({ ok: true as const });
  }

  fill(id: number, n: number) {
    const o = this.offers.find((x) => x.id === id && x.left > 0), st = this.site('stall');
    if (!o) return no('the offer is gone');
    if (o.mine) return no('your own offer');
    if (!st) return no('rent a stall first: the goods and coin change hands there');
    n = Math.min(n, o.left);
    const coin = n * o.price, tax = Math.round(coin * 0.05 * 100) / 100;
    if (o.side === 'sell') { if (!this.takeFrom({ coin }, st.goods)) return no(`${coin} coin must be in your stall`); add(st.goods, o.res!, n); }
    else { if (!this.takeFrom({ [o.res!]: n }, st.goods)) return no(`${n} ${o.res} must be in your stall`); add(st.goods, 'coin', coin - tax); }
    o.left = Math.round((o.left - n) * 100) / 100;
    this.fills.push({ res: o.res, n, price: o.price, at: this.now() });
    return ok({ n, price: o.price, tax });
  }

  contracts(town: string) {
    return ok({ contracts: this.cs.filter((c) => (c.town === town || c.to_town === town) && (c.state === 'open' || c.state === 'taken')) });
  }

  post(town: string, c: ContractIn) {
    if (!this.pay(c.reward)) return no(`the reward (${c.reward} coin) is escrowed from your strongroom`);
    const id = ++this.seq;
    this.cs.push({ id, kind: c.kind, town, to_town: c.toTown, poster: this.me, taker: null, reward: c.reward, res: c.res ?? null, n: c.n ?? c.loads ?? 0, delivered: 0, value: c.value ?? 0, deposit: c.kind === 'carry' ? Math.round((c.value ?? 0) * DEPOSIT) : 0, state: 'open', deadline: c.deadline });
    return ok({ contract: id });
  }

  take(id: number) {
    const c = this.cs.find((x) => x.id === id);
    if (!c || c.state !== 'open') return no('the contract is not open');
    if (c.poster === this.me) return no('your own contract');
    if (c.deposit && !this.pay(c.deposit)) return no(`a carry escrows half its value (${c.deposit} coin) from your strongroom`);
    c.state = 'taken';
    c.taker = this.me;
    return ok({ ok: true as const });
  }

  letter(town: string, toTown: string, amount: number, fee: number) {
    if (amount > LETTER_MAX) return no(`a letter carries at most ${LETTER_MAX} coin`);
    if (toTown === town) return no('a letter goes to another town');
    if (!this.pay(amount)) return no(`${amount} coin is escrowed at ${toTown} from your strongroom`);
    const id = ++this.seq;
    this.ls.push({ id, town, toTown, amount, fee, state: 'offered', mine: 'banker' });
    return ok({ letter: id });
  }

  buyLetter(id: number) {
    const l = this.ls.find((x) => x.id === id);
    if (!l || l.state !== 'offered') return no('no such letter on offer');
    if (l.mine === 'banker') return no('your own letter');
    if (!this.pay(l.amount + l.fee)) return no(`${l.amount + l.fee} coin (amount and fee) is not in your strongroom`);
    l.state = 'sold';
    return ok({ ok: true as const });
  }

  redeem(id: number) {
    const l = this.ls.find((x) => x.id === id);
    if (!l || l.state !== 'sold' || l.mine !== 'buyer') return no('only its buyer redeems a sold letter, once');
    l.state = 'redeemed';
    this.s.sim.addStock(0, 'coin', l.amount);
    return ok({ coin: l.amount });
  }

  letters() { return this.ls; }

  stow(dir: 'in' | 'out', site: 'stall' | 'warehouse' | 'strongroom', _squad: number, goods: Goods, done: (r: Res<{ goods: Goods }>) => void): void {
    const x = this.site(site);
    if (!x) return done({ error: `rent a ${site} first` });
    if (dir === 'in') {
      const have = this.stock();
      for (const [r, n] of Object.entries(goods)) if ((have[r] ?? 0) + 1e-6 < n) return done({ error: `you hold ${Math.floor(have[r] ?? 0)} ${r}` });
      if (loadsOf(x.goods) + loadsOf(goods) > SITE_LOADS + 1e-6) return done({ error: `a ${site} holds ${SITE_LOADS} loads` });
      for (const [r, n] of Object.entries(goods)) { this.s.sim.addStock(0, r as never, -n); add(x.goods, r, n); }
    } else {
      if (!this.takeFrom(goods, x.goods)) return done({ error: `the ${site} holds less` });
      for (const [r, n] of Object.entries(goods)) this.s.sim.addStock(0, r as never, n);
    }
    done({ goods });
  }

  /** The other side is a made-up trader: he puts his half in a moment after yours and confirms after you do. */
  handoff(op: 'offer' | 'confirm' | 'cancel', withId: number, _squad: number | null, goods: Goods): void {
    const emit = () => { if (this.hand) for (const f of this.subs) f({ ...this.hand, halves: { ...this.hand.halves }, ok: [...this.hand.ok] }); };
    if (op === 'cancel') { if (this.hand) { this.hand = { ...this.hand, state: 'closed', why: 'cancelled' }; emit(); this.hand = null; } return; }
    if (op === 'offer') {
      const have = this.stock();
      for (const [r, n] of Object.entries(goods)) if ((have[r] ?? 0) + 1e-6 < n) { this.hand = { with: withId, state: 'closed', halves: {}, ok: [], why: `you hold ${Math.floor(have[r] ?? 0)} ${r}` }; emit(); this.hand = null; return; }
      const fresh = !this.hand;
      this.hand ??= { with: withId, state: 'open', halves: {}, ok: [], until: (this.s.sim.cur?.tick ?? 0) + 600 };
      this.hand.halves[this.me] = { goods: { ...goods }, uids: [] };
      this.hand.ok = []; // a changed half: both confirm again
      emit();
      if (fresh) setTimeout(() => { if (this.hand?.state === 'open') { this.hand.halves[withId] = { goods: { tin: 20, iron: 10 }, uids: [] }; emit(); } }, 900);
      return;
    }
    if (!this.hand || this.hand.state !== 'open') return;
    if (!this.hand.ok.includes(this.me)) this.hand.ok.push(this.me);
    emit();
    setTimeout(() => {
      const h = this.hand;
      if (!h || h.state !== 'open' || !h.halves[withId]) return;
      h.ok.push(withId);
      const mine = h.halves[this.me]?.goods ?? {}, theirs = h.halves[withId].goods;
      const have = this.stock();
      if (Object.entries(mine).some(([r, n]) => (have[r] ?? 0) + 1e-6 < n)) { h.state = 'closed'; h.why = 'your half is no longer with your men'; emit(); this.hand = null; return; }
      for (const [r, n] of Object.entries(mine)) this.s.sim.addStock(0, r as never, -n);
      for (const [r, n] of Object.entries(theirs)) this.s.sim.addStock(0, r as never, n);
      h.state = 'done';
      emit();
      this.hand = null;
    }, 700);
  }

  on(f: (h: Handoff) => void): void { this.subs.push(f); }
}

export const goodsSum = sum;
export const siteLoads = loadsOf;
