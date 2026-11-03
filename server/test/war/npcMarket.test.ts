/**
 * W-140..W-148 NPC towns on the server (docs/WAR.md "NPC towns"): deals with men standing at the town, prices and purse in
 * D1, coin bounded by what buyers paid and the mint, hired workers up to W-103's cap, carts, and the level paid only for
 * goods from another land.
 */
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { good, setGood } from './goods';
import { NPC, NPC_CARTS, NPC_HIRE } from '../../../src/data/warNpcTowns';
import { NET_VERSION } from '../../../src/war/net/protocol';
import { midPrice, npcGood, npcSpot, NPC_MINT } from '../../../src/war/net/npcMarket';
import { cartCap, workerCap, type PathId } from '../../../src/war/world/start';
import { getFavour } from '../../src/war/favour';
import { npcBooks, npcDeal, npcView } from '../../src/war/npcMarket';
import { claimForJoin } from '../../src/war/persons';
import { warRegion } from '../../src/war/regions';
import { WarRoom } from '../../src/war/room';
import { pathOf, takeStartCart } from '../../src/war/start';

const DB = () => env.DB!;
const HOME = 'dodona', DAY = 86_400_000;
const NOW = Date.UTC(2031, 0, 6, 12);
const post = (token: string, path: string, json: unknown) => api(`/api/war/start${path}`, { method: 'POST', token, json });
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

/** A started player of `path` in a live room of his home, his men on the field. */
async function player(id: number, path: PathId, region = HOME) {
  const me = await devLogin(id);
  expect((await post(me.token, '/alliance', { alliance: 0 })).status).toBe(200);
  expect((await post(me.token, '/home', { region: HOME })).status).toBe(200);
  expect((await post(me.token, '/path', { path })).status).toBe(200);
  const men = (await (await api('/api/war/roster', { token: me.token })).json<{ persons: { id: string; state: string }[] }>()).persons.filter((p) => p.state === 'active').map((p) => p.id);
  const room = new WarRoom({ region: warRegion(region)!, seed: 1, cap: 600 }), pid = me.playerId;
  // abroad: the world's transfer is not the point here, a dev squad stands in
  const got = region === HOME ? await claimForJoin(DB(), pid, region, [men], room.personsHere(), NOW) : undefined;
  if (typeof got === 'string') throw new Error(got);
  const w = room.join(pid, got ? { t: 'join', v: NET_VERSION, region, playerId: pid, team: 0, squads: [men] } : { t: 'join', v: NET_VERSION, region, playerId: pid, team: 0, army: [{ cls: 'militia', count: 2 }] }, got).msg;
  if (w.t !== 'welcome') throw new Error(`refused: ${JSON.stringify(w)}`);
  room.setPath(pid, await pathOf(DB(), pid));
  room.tick();
  return { pid, token: me.token, room, squad: w.squads[0] };
}

/** His squad walked to the town (carts with it). */
function walkToTown(room: WarRoom, pid: number, squad: number) {
  const at = npcSpot(room.region);
  room.sim.order({ kind: 'move', squad, x: Math.round(at.x), y: Math.round(at.y) });
  for (let t = 0; t < 4000 && room.npcSlots(pid).length === 0; t++) room.tick();
  expect(room.npcSlots(pid).length).toBeGreaterThan(0);
}

const packed = (room: WarRoom, squad: number, res: string) => room.sim.cargo({ squad })!.slots.reduce((a, s) => a + s.hold.lots.filter((l) => l.r === res).reduce((b, l) => b + l.n, 0), 0);
const give = (room: WarRoom, pid: number, squad: number, res: string, n: number, o = 'kleisoura') => room.giveCargo(pid, { squad }, { lots: [{ r: res as never, n, o }], items: [] });

beforeEach(async () => {
  await DB().batch([DB().prepare('DELETE FROM war_npc_towns'), DB().prepare('DELETE FROM war_npc_stock')]);
});

describe('a deal needs someone standing at the town', () => {
  it('men away: refused; a town of no region: refused', async () => {
    const t = await player(9601, 'trader');
    give(t.room, t.pid, t.squad, 'wood', 10);
    const at = npcSpot(t.room.region), sl = t.room.sim.cargo({ squad: t.squad })!.slots[0];
    if (Math.hypot(sl.x - at.x, sl.y - at.y) > NPC.reach) expect(await code(npcDeal(env, t.room, t.pid, { op: 'sell', res: 'wood' }, NOW))).toBe('not_present');
    walkToTown(t.room, t.pid, t.squad);
    give(t.room, t.pid, t.squad, 'silver', 5);
    expect(await code(npcDeal(env, t.room, t.pid, { op: 'sell', res: 'silver' }, NOW))).toBe('not_traded');
    const test = new WarRoom({ region: warRegion('test-ridge')!, seed: 1, cap: 600 });
    expect(await code(npcDeal(env, test, t.pid, { op: 'sell', res: 'wood' }, NOW))).toBe('no_town');
  });
});

describe('prices and purse', () => {
  it('selling lowers the price and pays at home into the strongroom; buying takes it back dearer; both move the purse', async () => {
    const t = await player(9602, 'trader');
    walkToTown(t.room, t.pid, t.squad);
    await setGood(t.pid, 'coin', 0);
    const res = 'iron', g = npcGood(HOME, res)!;
    expect(g).toBeTruthy();
    const before = await npcView(DB(), HOME, NOW), purse0 = before.purse;
    give(t.room, t.pid, t.squad, res, 10);
    const d = (await npcDeal(env, t.room, t.pid, { op: 'sell', res, n: 10 }, NOW)).done;
    expect(d).toMatchObject({ t: 'npcDone', op: 'sell', res, n: 10 });
    expect(await good(t.pid, 'coin')).toBeCloseTo(d.coin, 3);
    expect(packed(t.room, t.squad, res)).toBe(0);
    const after = await npcView(DB(), HOME, NOW), row = (v: typeof after) => v.goods.find((x) => x.res === res)!;
    expect(row(after).pay).toBeLessThan(row(before).pay);
    expect(after.purse).toBe(Math.floor(purse0 - d.coin));
    // buy them back: dearer than he sold them, the purse has more than it started with
    await setGood(t.pid, 'coin', 500);
    const b = (await npcDeal(env, t.room, t.pid, { op: 'buy', res, n: 10 }, NOW)).done;
    expect(b.coin).toBeGreaterThan(d.coin);
    expect(packed(t.room, t.squad, res)).toBe(10);
    expect((await npcView(DB(), HOME, NOW)).purse).toBeGreaterThanOrEqual(purse0);
    // the price at par again, near enough
    expect(midPrice(g, g.par)).toBeGreaterThan(0);
  });

  it('coin is bounded: selling without end pays no more than the start purse and what it minted', async () => {
    const t = await player(9603, 'trader');
    walkToTown(t.room, t.pid, t.squad);
    await setGood(t.pid, 'coin', 0);
    const res = 'iron';
    let paid = 0, stopped = '';
    const days = 3;
    for (let day = 0; day < days; day++) {
      for (let i = 0; i < 60; i++) {
        give(t.room, t.pid, t.squad, res, 10);
        const now = NOW + day * DAY + i * 1000, r = await npcDeal(env, t.room, t.pid, { op: 'sell', res }, now).catch((e: { code?: string }) => e.code ?? String(e));
        if (typeof r === 'string') { stopped = r; break; }
        paid += r.done.coin;
      }
      expect(stopped).toBe('purse_empty');
    }
    const end = NOW + (days - 1) * DAY, books = await npcBooks(DB(), HOME, end);
    expect(paid + books.purse).toBeCloseTo(NPC.purse.start + books.minted, 3);
    expect(books.minted).toBeLessThanOrEqual((days - 1) * NPC_MINT);
    expect(await good(t.pid, 'coin')).toBeCloseTo(paid, 3);
  });

  it('abroad, coin lands in the packs; a town pays only out of its purse', async () => {
    const t = await player(9604, 'trader', 'kleisoura');
    walkToTown(t.room, t.pid, t.squad);
    await setGood(t.pid, 'coin', 0);
    give(t.room, t.pid, t.squad, 'wood', 10, HOME);
    const d = (await npcDeal(env, t.room, t.pid, { op: 'sell', res: 'wood', n: 10 }, NOW)).done;
    expect(await good(t.pid, 'coin')).toBe(0);
    expect(packed(t.room, t.squad, 'coin')).toBeCloseTo(d.coin, 3);
    // no strongroom here: a dear buy on the coin in his packs only
    await setGood(t.pid, 'coin', 100000);
    expect(await code(npcDeal(env, t.room, t.pid, { op: 'cart', cart: 'wagon' }, NOW))).toBe('no_coin');
  });
});

describe('level from trade (W-111, W-148)', () => {
  it('only goods from another land pay his level; a town\'s own sold back do not', async () => {
    const t = await player(9605, 'trader');
    walkToTown(t.room, t.pid, t.squad);
    const fav = async () => (await getFavour(env, t.pid)).xp;
    const f0 = await fav();
    give(t.room, t.pid, t.squad, 'iron', 10, 'home');
    await npcDeal(env, t.room, t.pid, { op: 'sell', res: 'iron', n: 10 }, NOW);
    expect(await fav()).toBe(f0);
    give(t.room, t.pid, t.squad, 'iron', 10, HOME);
    await npcDeal(env, t.room, t.pid, { op: 'sell', res: 'iron', n: 10 }, NOW);
    expect(await fav()).toBe(f0);
    give(t.room, t.pid, t.squad, 'iron', 10, 'kleisoura');
    const d = (await npcDeal(env, t.room, t.pid, { op: 'sell', res: 'iron', n: 10 }, NOW)).done;
    expect(await fav()).toBeGreaterThan(f0);
    expect(await fav()).toBeLessThanOrEqual(f0 + d.coin);
  });
});

describe('hired workers (W-144)', () => {
  it('a builder hires for coin up to his cap, paid into the purse; the man is on the field', async () => {
    const t = await player(9606, 'builder');
    walkToTown(t.room, t.pid, t.squad);
    const cap = workerCap('builder'), cost = NPC_HIRE.civ_engineer;
    await setGood(t.pid, 'coin', cost * cap * 2);
    const count = async () => (await DB().prepare("SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1 AND state = 'active' AND cls LIKE 'civ_%'").bind(t.pid).first<{ n: number }>())!.n;
    const purse0 = (await npcView(DB(), HOME, NOW)).purse, men0 = await count();
    const d = await npcDeal(env, t.room, t.pid, { op: 'hire', cls: 'civ_engineer' }, NOW);
    expect(d.done).toMatchObject({ op: 'hire', coin: cost });
    expect(await count()).toBe(men0 + 1);
    expect((await npcView(DB(), HOME, NOW)).purse).toBe(purse0 + cost);
    let last = 'ok', n = 0;
    while (last === 'ok' && n++ < cap + 2) last = await code(npcDeal(env, t.room, t.pid, { op: 'hire', cls: 'civ_engineer' }, NOW));
    expect(last).toBe('household_full');
    expect(await count()).toBe(cap);
  });

  it('no coin, no man; a soldier cannot be hired here', async () => {
    const t = await player(9607, 'trader');
    walkToTown(t.room, t.pid, t.squad);
    await setGood(t.pid, 'coin', 0);
    expect(await code(npcDeal(env, t.room, t.pid, { op: 'hire', cls: 'civ_forager' }, NOW))).not.toBe('ok');
    expect(await code(npcDeal(env, t.room, t.pid, { op: 'hire', cls: 'militia' }, NOW))).toBe('bad_request');
  });
});

describe('carts (W-145)', () => {
  it('a trader starts owed one handcart, once', async () => {
    const t = await player(9608, 'trader'), b = await player(9609, 'builder');
    expect(await takeStartCart(DB(), t.pid)).toBe(true);
    expect(await takeStartCart(DB(), t.pid)).toBe(false);
    expect(await takeStartCart(DB(), b.pid)).toBe(false);
  });

  it('bought at the town up to his path\'s cap, the coin into the purse', async () => {
    const t = await player(9610, 'trader');
    walkToTown(t.room, t.pid, t.squad);
    const cap = cartCap('trader');
    await setGood(t.pid, 'coin', NPC_CARTS.wagon * cap);
    const purse0 = (await npcView(DB(), HOME, NOW)).purse;
    await npcDeal(env, t.room, t.pid, { op: 'cart', cart: 'handcart' }, NOW);
    expect(t.room.cartsOf(t.pid)).toHaveLength(1);
    expect((await npcView(DB(), HOME, NOW)).purse).toBe(purse0 + NPC_CARTS.handcart);
    for (let i = 1; i < cap; i++) await npcDeal(env, t.room, t.pid, { op: 'cart', cart: 'wagon' }, NOW);
    expect(t.room.cartsOf(t.pid)).toHaveLength(cap);
    expect(await code(npcDeal(env, t.room, t.pid, { op: 'cart', cart: 'wagon' }, NOW))).toBe('carts_full');
  });
});
