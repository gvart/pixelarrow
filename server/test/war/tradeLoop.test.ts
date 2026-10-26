/**
 * The buyer's side of a market trade through the region server, as scripts/war/play-smoke.mjs used to drive it live
 * (docs/PLAYTEST.md): coin out of his home strongroom into his men's packs over the socket, the men carried to
 * Kleisoura (the region DOs' depart / arrive, as the world's transfer calls them, without the travel time), the coin
 * stowed into a rented warehouse from inside the market court, and a seller's offer filled from it.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, BASE, devLogin } from '../helpers';
import { good, setGood } from './goods';
import { goodsOf, putStmt } from '../../src/war/holders';
import { listOffer, rentSite, stallId, warehouseId } from '../../src/war/market';
import { warRegion } from '../../src/war/regions';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';
import { SIM_VERSION } from '../../../src/sim/version';

const DB = () => env.DB!;
const T = 'kleisoura';

async function connect(token: string, region: string) {
  const res = await SELF.fetch(`${BASE}/ws/war/${region}?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const msgs: ServerMsg[] = [];
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') msgs.push(JSON.parse(e.data) as ServerMsg);
  });
  const next = async (pred: (m: ServerMsg) => boolean, ms = 20_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 20))) {
      const i = msgs.findIndex(pred);
      if (i >= 0) return msgs.splice(i, 1)[0];
    }
    throw new Error(`timeout: ${JSON.stringify(msgs.map((m) => m.t))}`);
  };
  return { send: (m: unknown) => ws.send(JSON.stringify(m)), next, close: () => ws.close(1000) };
}
const stub = (region: string) => env.WAR_REGION.get(env.WAR_REGION.idFromName(region));
const answer = (m: ServerMsg) => m.t === 'stowed' || m.t === 'error';

describe('a market trade: the buyer brings his coin', () => {
  it('strongroom -> packs at home, carried to kleisoura, stowed into his warehouse in the court, an offer filled', async () => {
    const PURSE = 60;
    // the seller: a stall in kleisoura with wood, 10 offered at 3
    const s = await devLogin(8301), now = Date.now();
    await api('/api/war/roster', { token: s.token });
    await rentSite(DB(), s.playerId, T, 'stall', -1, now);
    await DB().batch([putStmt(DB(), stallId(T, s.playerId), 'wood', 10, 'dodona')]);
    const offer = await listOffer(DB(), s.playerId, T, { side: 'sell', res: 'wood', n: 10, price: 3 }, -1, now);

    // the buyer: Skythia (home skythia), his men at home, coin in his strongroom
    const b = await devLogin(8302);
    expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: b.token, json: { alliance: 1 } })).status).toBe(200);
    expect((await api('/api/war/dev/seed', { method: 'POST', token: b.token, json: {} })).status).toBe(200);
    const ros = await (await api('/api/war/roster', { token: b.token })).json<{ persons: { id: string; state: string; region: string | null }[] }>();
    const ids = ros.persons.filter((p) => p.state === 'active' && !p.region).map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    await setGood(b.playerId, 'coin', PURSE);

    // 1. at home: the coin out of the strongroom into his men's packs
    const home = await connect(b.token, 'skythia');
    home.send({ t: 'join', v: NET_VERSION, region: 'skythia', playerId: b.playerId, team: 1, squads: [ids] });
    const w = (await home.next((m) => m.t === 'welcome' || m.t === 'refused')) as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w.t).toBe('welcome');
    const sq = w.squads[0];
    home.send({ t: 'stow', dir: 'out', site: 'strongroom', squad: sq, goods: { coin: PURSE } });
    expect(await home.next(answer)).toMatchObject({ t: 'stowed', dir: 'out', goods: { coin: PURSE } });
    expect(await good(b.playerId, 'coin')).toBe(0);
    home.close();

    // 2. the world's transfer: out of skythia with the packs, into kleisoura from the east
    const out = await stub('skythia').depart('skythia', b.playerId, sq, 'W', T, 20);
    if ('error' in out) throw new Error(`depart: ${out.error}`);
    expect(Object.values(out.cargo?.packs ?? {}).flatMap((p) => p.lots).reduce((t, l) => t + (l.r === 'coin' ? l.n : 0), 0)).toBe(PURSE);
    const inn = await stub(T).arrive(T, b.playerId, 1, out.ids, 'E', {}, out.cargo);
    expect('error' in inn ? inn.error : 'ok').toBe('ok');

    // 3. in kleisoura: his squad taken over, a warehouse rented; a stow outside the court is refused, inside it lands
    const k = await connect(b.token, T);
    k.send({ t: 'join', v: NET_VERSION, region: T, playerId: b.playerId, team: 1, squads: [out.ids] });
    const kw = (await k.next((m) => m.t === 'welcome' || m.t === 'refused')) as Extract<ServerMsg, { t: 'welcome' }>;
    expect(kw.t).toBe('welcome');
    const ksq = kw.squads[0];
    expect((await api(`/api/war/trade/${T}/rent`, { method: 'POST', token: b.token, json: { kind: 'warehouse' } })).status).toBe(200);
    k.send({ t: 'stow', dir: 'in', site: 'warehouse', squad: ksq, goods: { coin: PURSE } });
    expect(await k.next(answer)).toMatchObject({ t: 'error', detail: expect.stringMatching(/not_in_court/) });
    k.send({ t: 'stow', dir: 'out', site: 'strongroom', squad: ksq, goods: { coin: 1 } }); // the strongroom is at home
    expect(await k.next(answer)).toMatchObject({ t: 'error', detail: expect.stringMatching(/not_home/) });
    const ct = warRegion(T)!.safe![0];
    k.send({ t: 'order', o: { kind: 'move', squad: ksq, x: Math.round(ct.x + ct.w / 2), y: Math.round(ct.y + ct.h / 2) } });
    let stowed: ServerMsg | null = null;
    for (let i = 0; i < 30 && !stowed; i++) {
      k.send({ t: 'dev', op: 'skip', ticks: 200 });
      k.send({ t: 'stow', dir: 'in', site: 'warehouse', squad: ksq, goods: { coin: PURSE } });
      const r = await k.next(answer);
      if (r.t === 'stowed') stowed = r;
      else expect((r as { detail?: string }).detail).toMatch(/not_in_court/);
    }
    expect(stowed).toMatchObject({ t: 'stowed', dir: 'in', goods: { coin: PURSE } });
    expect(await goodsOf(DB(), warehouseId(T, b.playerId))).toEqual({ coin: PURSE });
    k.close();

    // 4. the fill: the wood into his warehouse, paid from it, the coin in the seller's stall
    const f = await api(`/api/war/trade/offers/${offer}/fill`, { method: 'POST', token: b.token, json: { n: 10, key: 'loop-fill-1' } });
    expect(f.status).toBe(200);
    expect(await f.json()).toMatchObject({ n: 10, price: 3, seller: s.playerId, buyer: b.playerId });
    expect(await goodsOf(DB(), warehouseId(T, b.playerId))).toEqual({ coin: PURSE - 30, wood: 10 });
    expect((await goodsOf(DB(), stallId(T, s.playerId))).coin).toBeGreaterThan(0);
  });
});
