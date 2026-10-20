/**
 * War roster API (/api/war/*, M5e): the player's persistent soldiers (./persons.ts). Signed in and playable like the
 * online routes; bodies zod-checked.
 *
 *   GET  /roster                      persons, caps, recruit pools, home strongroom (stock, items), captives held, upkeep
 *   POST /recruit       { town, count }        L1 militia from the town's pool (food)
 *   POST /persons/:id/equip { slot, uid|null } put on a strongroom item, or take one off
 *   POST /persons/:id/level { attrs?, skill? } spend points, take a skill at levels 3 / 7
 *   POST /squad         { ids }                the field squad in slot order (<= SQUAD_MAX)
 *   POST /persons/:id/train  { cls }          train at a town's barracks / range (10 min, a kit's coin)
 *   POST /persons/:id/promote { cls }        promote to an elite of his family at a fortress (30 min, the elite rare kit's coin)
 *   POST /persons/:id/ransom                  pay a captive's ransom (coin to his captor's strongroom): he comes home
 *   POST /persons/:id/retire { civ? }         retire (half his gear's value back in coin); level 10: into a civilian class
 *   GET  /treasury                            the alliance's (clan's) strongbox coin, the player's role, the latest audit log
 *   POST /treasury/deposit { amount }         a member puts coin of his home strongroom into the strongbox
 *   POST /treasury/ransom/:id                 the leader or an officer pays a member's captive's ransom from the pool
 *   POST /captives/:id/release                the captor lets a captive he holds go
 *   POST /persons/:id/node  { node }          M5h4: a civilian takes a profession node
 *   POST /persons/:id/respec                  M5h4: his nodes reset (50 coin, once a day)
 *   GET  /stash                               M6e: where his things are: items D1 keeps with their place (holder id) or
 *                                             the region whose workplace holds them, and the holders of the region rooms
 *                                             (chests, carts, packs) as saved; equip from the strongroom with
 *                                             /persons/:id/equip; repair and salvage go over the region socket (`mend`)
 *   POST /dev/seed      { squad?, reserve? }   DEV_AUTH=1 only: a full roster to test with
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { db, requirePlayable } from '../middleware';
import { SLOTS } from '../../../src/data/items';
import { ATTR_IDS, ATTR_MAX } from '../../../src/data/perks';
import { SKILLS } from '../../../src/war/sim/skills';
import { SQUAD_MAX } from '../../../src/war/sim/soldiers';
import type { WarSkillId } from '../../../src/war/types';
import { pickNode, respec, stash } from './crafting';
import { deposit, payRansomFromTreasury, treasury } from './treasury';
import { equip, formSquad, levelUp, payRansom, promote, recruit, releaseCaptive, retire, roster, ROSTER_MAX, seed, train } from './persons';

export const war = new Hono<AppEnv>();
// per route, not war.use('/*'): /api/war/:region/stats (dev, index.ts) shares the prefix

const MAX_BODY = 2048;
const personId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const idParam = (s: string) => {
  if (!personId.safeParse(s).success) throw badRequest('Bad soldier id');
  return s;
};
const skillId = z.string().refine((s): s is WarSkillId => s in SKILLS, 'unknown skill');
const group = z.array(z.object({ cls: z.string().regex(/^[a-z_]{1,24}$/), level: z.number().int().min(1).max(10).optional() })).max(ROSTER_MAX);

war.get('/roster', requirePlayable, async (c) => c.json(await roster(db(c.env), c.get('session').pid, Date.now())));

war.post('/recruit', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ town: z.string().regex(/^[a-z0-9_-]{1,40}$/), count: z.number().int().min(1).max(ROSTER_MAX).default(1) }), MAX_BODY);
  const ids = await recruit(db(c.env), c.get('session').pid, b.town, b.count, Date.now());
  return c.json({ ids });
});

war.post('/persons/:id/equip', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ slot: z.enum(SLOTS as [string, ...string[]]), uid: z.string().min(1).max(120).nullable() }), MAX_BODY);
  await equip(db(c.env), c.get('session').pid, id, b.slot as (typeof SLOTS)[number], b.uid, Date.now());
  return c.json({ ok: true });
});

war.post('/persons/:id/level', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const attrs = z.object(Object.fromEntries(ATTR_IDS.map((k) => [k, z.number().int().min(0).max(ATTR_MAX).optional()]))).strict();
  const b = await readJson(c, z.object({ attrs: attrs.optional(), skill: skillId.optional() }), MAX_BODY);
  await levelUp(db(c.env), c.get('session').pid, id, b.attrs ?? {}, b.skill as WarSkillId | undefined, Date.now());
  return c.json({ ok: true });
});

war.post('/squad', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ ids: z.array(personId).max(SQUAD_MAX) }), MAX_BODY);
  await formSquad(db(c.env), c.get('session').pid, b.ids, Date.now());
  return c.json({ ok: true });
});

war.post('/persons/:id/train', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ cls: z.string().regex(/^[a-z_]{1,24}$/) }), MAX_BODY);
  return c.json({ until: await train(db(c.env), c.get('session').pid, id, b.cls, Date.now()) });
});

war.post('/persons/:id/promote', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ cls: z.string().regex(/^[a-z_]{1,24}$/) }), MAX_BODY);
  return c.json({ until: await promote(db(c.env), c.get('session').pid, id, b.cls, Date.now()) });
});

war.post('/persons/:id/ransom', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json({ paid: await payRansom(db(c.env), c.get('session').pid, id, Date.now()) });
});

war.post('/persons/:id/retire', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ civ: z.string().regex(/^[a-z_]{1,24}$/).optional() }), MAX_BODY);
  return c.json({ refund: await retire(db(c.env), c.get('session').pid, id, b.civ, Date.now()) });
});

war.get('/treasury', requirePlayable, async (c) => c.json(await treasury(db(c.env), c.get('session').pid, Date.now())));

war.post('/treasury/deposit', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ amount: z.number().int().min(1).max(1_000_000) }), MAX_BODY);
  return c.json({ coin: await deposit(db(c.env), c.get('session').pid, b.amount, Date.now()) });
});

war.post('/treasury/ransom/:id', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json({ paid: await payRansomFromTreasury(db(c.env), c.get('session').pid, id, Date.now()) });
});

war.post('/captives/:id/release', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  await releaseCaptive(db(c.env), c.get('session').pid, id, Date.now());
  return c.json({ ok: true });
});

war.post('/persons/:id/node', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ node: z.string().regex(/^[A-Za-z0-9_]{1,40}$/) }), MAX_BODY);
  return c.json({ perks: await pickNode(db(c.env), c.get('session').pid, id, b.node, Date.now()) });
});

war.post('/persons/:id/respec', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json({ next: await respec(db(c.env), c.get('session').pid, id, Date.now()) });
});

war.get('/stash', requirePlayable, async (c) => c.json(await stash(db(c.env), c.get('session').pid)));

war.post('/dev/seed', requirePlayable, async (c) => {
  if (c.env.DEV_AUTH !== '1') throw new ApiError(404, 'not_found', 'No such endpoint');
  const b = await readJson(c, z.object({ squad: group.max(SQUAD_MAX).optional(), reserve: group.optional() }), MAX_BODY * 2);
  const ids = await seed(db(c.env), c.get('session').pid, Date.now(), b);
  return c.json({ ids });
});
