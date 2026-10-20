/**
 * Trade API (/api/war/trade/*, M6f-M6g; ./market.ts, ./contracts.ts). Signed in and playable; bodies zod-checked. The
 * town's holder (the alliance that holds the region, for rent and tax) comes from the world.
 *
 *   GET  /:town/board                         the price board: best ask / bid, depth, last fills (player offers only)
 *   GET  /:town/mine                          the player's stall and warehouse there (goods, level, rent) and offers
 *   POST /:town/rent     { kind }             rent a stall or warehouse (first day's rent from the home strongroom)
 *   POST /:town/upgrade                       the stall's next level (paid from the stall)
 *   POST /:town/offers   { side, res|uid, n, price, standing? }   list a sell offer or a buy order (escrowed)
 *   POST /offers/:id/cancel                   cancel an open offer of his (escrow back to the stall)
 *   POST /offers/:id/fill { n, key }          take n of an offer (men in the town); `key` makes it idempotent
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
import { fillHook } from './tradeScore';

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

trade.get('/:town/board', requirePlayable, async (c) => c.json(await board(db(c.env), town(c.req.param('town')))));

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

trade.post('/offers/:id/fill', requirePlayable, async (c) => {
  const id = num(c.req.param('id'));
  const b = await readJson(c, z.object({ n: z.number().positive().max(100_000), key: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/) }), MAX_BODY);
  const d = db(c.env), pid = c.get('session').pid;
  const row = await d.prepare('SELECT town FROM war_offers WHERE id = ?1').bind(id).first<{ town: string }>();
  const holder = row ? await holderOf(c.env, row.town) : -1;
  return c.json(await fill(d, pid, id, b.n, b.key, holder, Date.now(), fillHook(c.env)));
});
