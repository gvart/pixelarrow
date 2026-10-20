/**
 * Trade API (/api/war/trade/*, M6f-M6g; ./market.ts, ./contracts.ts). Signed in and playable; bodies zod-checked. The
 * town's holder (the alliance that holds the region, for rent and tax) comes from the world.
 *
 *   GET  /:town/board                         the price board: best ask / bid, depth, every goods offer by id, last fills
 *   GET  /:town/mine                          the player's stall and warehouse there (goods, level, rent) and offers
 *   POST /:town/rent     { kind }             rent a stall or warehouse (first day's rent from the home strongroom)
 *   POST /:town/upgrade                       the stall's next level (paid from the stall)
 *   POST /:town/offers   { side, res|uid, n, price, standing? }   list a sell offer or a buy order (escrowed)
 *   POST /offers/:id/cancel                   cancel an open offer of his (escrow back to the stall)
 *   POST /offers/:id/fill { n, key }          take n of an offer (a board offer id; goods: partly); `key` makes it idempotent
 *   M6g (./contracts.ts):
 *   POST /:town/deals    { broker, with, give, get }   an escrowed hand-off at a Broker's stall
 *   POST /deals/:id/drop                      drop my half from my sites there (both in: swapped)
 *   GET  /:town/contracts                     open and taken contracts posted at or bound for the town
 *   POST /:town/contracts { kind, toTown, reward, res?, n?, value?, loads?, deadline }   post (reward escrowed)
 *   POST /contracts/:id/take                  take one (a carry escrows half its value); loads and deliveries go
 *                                             over the region socket (`stow` site `contract`)
 *   POST /:town/letters  { toTown, amount, fee }   a Banker's letter of credit (coin escrowed at toTown)
 *   POST /letters/:id/buy                     buy it at its town (named to me)
 *   POST /letters/:id/redeem                  redeem it at toTown, once, only by its buyer
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv, Env } from '../env';
import { badRequest } from '../errors';
import { db, requirePlayable } from '../middleware';
import { GOODS } from '../../../src/war/net/protocol';
import { board, cancelOffer, fill, listOffer, mySites, rentSite, upgradeStall } from './market';
import { worldStub } from './world/routes';
import { fillHook, recordBoard } from './tradeScore';
import { allianceOf } from './world/members';
import { presentIn } from './market';
import type { AllianceId } from '../../../src/war/world/types';
import { buyLetter, contractsIn, dropHalf, offerLetter, postContract, postDeal, redeemLetter, takeContract } from './contracts';
import { contractRefusal, noteSeen, seenOf } from './abuse';
import type { Context } from 'hono';

/** M6i: note where the account trades from (linked accounts). */
const seen = async (c: Context<AppEnv>) => {
  const s = seenOf(c.req.raw);
  await noteSeen(db(c.env), c.get('session').pid, s.ip, s.device, Date.now());
};

export const trade = new Hono<AppEnv>();

const MAX_BODY = 1024;
const town = (s: string) => {
  if (!/^[a-z0-9_-]{1,40}$/.test(s)) throw badRequest('Bad town');
  return s;
};
const num = (s: string) => {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest('Bad id');
  return n;
};
const good = z.enum(GOODS as unknown as [string, ...string[]]);

/** The alliance holding the region (-1: nobody, or the world is unavailable). */
export async function holderOf(env: Env, region: string): Promise<number> {
  try {
    return (await worldStub(env).regionState(region))?.owner ?? -1;
  } catch {
    return -1;
  }
}

trade.get('/:town/board', requirePlayable, async (c) => {
  const t = town(c.req.param('town')), d = db(c.env), pid = c.get('session').pid;
  const b = await board(d, t);
  if (await presentIn(d, pid, t)) await recordBoard(d, pid, b, Date.now()); // his men see it: the world map keeps it
  return c.json(b);
});

trade.get('/:town/mine', requirePlayable, async (c) => c.json(await mySites(db(c.env), c.get('session').pid, town(c.req.param('town')))));

trade.post('/:town/rent', requirePlayable, async (c) => {
  const t = town(c.req.param('town'));
  const b = await readJson(c, z.object({ kind: z.enum(['stall', 'warehouse']) }), MAX_BODY);
  return c.json({ site: await rentSite(db(c.env), c.get('session').pid, t, b.kind, await holderOf(c.env, t), Date.now()) });
});

trade.post('/:town/upgrade', requirePlayable, async (c) => {
  const t = town(c.req.param('town'));
  return c.json({ level: await upgradeStall(db(c.env), c.get('session').pid, t, await holderOf(c.env, t), Date.now()) });
});

trade.post('/:town/offers', requirePlayable, async (c) => {
  const t = town(c.req.param('town'));
  await seen(c);
  const b = await readJson(
    c,
    z.object({ side: z.enum(['sell', 'buy']), res: good.optional(), uid: z.string().min(1).max(120).optional(), n: z.number().positive().max(100_000), price: z.number().int().min(1).max(1_000_000), standing: z.boolean().optional() }),
    MAX_BODY,
  );
  return c.json({ offer: await listOffer(db(c.env), c.get('session').pid, t, b, await holderOf(c.env, t), Date.now()) });
});

trade.post('/offers/:id/cancel', requirePlayable, async (c) => {
  await cancelOffer(db(c.env), c.get('session').pid, num(c.req.param('id')), Date.now());
  return c.json({ ok: true });
});

const goods = z.record(good, z.number().positive().max(100_000));

trade.post('/:town/deals', requirePlayable, async (c) => {
  const t = town(c.req.param('town'));
  const b = await readJson(c, z.object({ broker: z.number().int().positive(), with: z.number().int().positive(), give: goods, get: goods }), MAX_BODY);
  const d = db(c.env), pid = c.get('session').pid;
  await seen(c);
  await contractRefusal(d, pid, b.with, Date.now());
  return c.json({ deal: await postDeal(d, pid, t, b.broker, b.with, b.give, b.get, Date.now()) });
});

trade.post('/deals/:id/drop', requirePlayable, async (c) => c.json({ state: await dropHalf(db(c.env), c.get('session').pid, num(c.req.param('id')), Date.now()) }));

trade.get('/:town/contracts', requirePlayable, async (c) => c.json({ contracts: await contractsIn(db(c.env), town(c.req.param('town')), Date.now()) }));

trade.post('/:town/contracts', requirePlayable, async (c) => {
  const t = town(c.req.param('town'));
  const b = await readJson(
    c,
    z.object({
      kind: z.enum(['carry', 'supply', 'escort']), toTown: z.string().regex(/^[a-z0-9_-]{1,40}$/), reward: z.number().int().min(1).max(100_000), res: good.optional(),
      n: z.number().positive().max(100_000).optional(), value: z.number().int().min(1).max(1_000_000).optional(), loads: z.number().positive().max(100).optional(), deadline: z.number().int().positive(),
    }),
    MAX_BODY,
  );
  return c.json({ contract: await postContract(db(c.env), c.get('session').pid, t, b, await holderOf(c.env, t), Date.now()) });
});

trade.post('/contracts/:id/take', requirePlayable, async (c) => {
  const id = num(c.req.param('id')), d = db(c.env), pid = c.get('session').pid;
  await seen(c);
  const row = await d.prepare('SELECT poster FROM war_contracts WHERE id = ?1').bind(id).first<{ poster: number }>();
  if (row) await contractRefusal(d, pid, row.poster, Date.now());
  await takeContract(d, pid, id, Date.now());
  return c.json({ ok: true });
});

trade.post('/:town/letters', requirePlayable, async (c) => {
  const t = town(c.req.param('town'));
  const b = await readJson(c, z.object({ toTown: z.string().regex(/^[a-z0-9_-]{1,40}$/), amount: z.number().int().min(1).max(100_000), fee: z.number().int().min(0).max(100_000) }), MAX_BODY);
  return c.json({ letter: await offerLetter(db(c.env), c.get('session').pid, t, b.toTown, b.amount, b.fee, await holderOf(c.env, t), Date.now()) });
});

trade.post('/letters/:id/buy', requirePlayable, async (c) => {
  const id = num(c.req.param('id')), d = db(c.env), pid = c.get('session').pid;
  await seen(c);
  const row = await d.prepare('SELECT banker FROM war_letters WHERE id = ?1').bind(id).first<{ banker: number }>();
  if (row) await contractRefusal(d, pid, row.banker, Date.now());
  await buyLetter(d, pid, id, Date.now());
  return c.json({ ok: true });
});

trade.post('/letters/:id/redeem', requirePlayable, async (c) => c.json({ coin: await redeemLetter(db(c.env), c.get('session').pid, num(c.req.param('id')), Date.now()) }));

trade.post('/offers/:id/fill', requirePlayable, async (c) => {
  const id = num(c.req.param('id'));
  const b = await readJson(c, z.object({ n: z.number().positive().max(100_000), key: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/) }), MAX_BODY);
  const d = db(c.env), pid = c.get('session').pid;
  await seen(c);
  const row = await d.prepare('SELECT town FROM war_offers WHERE id = ?1').bind(id).first<{ town: string }>();
  const holder = row ? await holderOf(c.env, row.town) : -1;
  const f = await fill(d, pid, id, b.n, b.key, holder, Date.now(), fillHook(c.env));
  if (row) {
    const bd = await board(d, row.town);
    for (const p of [f.seller, f.buyer]) await recordBoard(d, p, bd, Date.now());
  }
  if (f.score > 0) {
    const a = await allianceOf(d, f.seller);
    if (a !== null) await worldStub(c.env).addTrade(a as AllianceId, f.score);
  }
  return c.json(f);
});
