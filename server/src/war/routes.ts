/**
 * War roster API (/api/war/*, M5e): the player's persistent soldiers (./persons.ts). Signed in and playable like the
 * online routes; bodies zod-checked.
 *
 *   GET  /roster                      persons, caps, recruit pools, stock, stash items
 *   POST /recruit       { town, count }        L1 militia from the town's pool (food)
 *   POST /persons/:id/equip { slot, uid|null } put on a stash item, or take one off
 *   POST /persons/:id/level { attrs?, skill? } spend points, take a skill at levels 3 / 7
 *   POST /squad         { ids }                the field squad in slot order (<= SQUAD_MAX)
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
import { equip, formSquad, levelUp, recruit, roster, ROSTER_MAX, seed } from './persons';

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

war.post('/dev/seed', requirePlayable, async (c) => {
  if (c.env.DEV_AUTH !== '1') throw new ApiError(404, 'not_found', 'No such endpoint');
  const b = await readJson(c, z.object({ squad: group.max(SQUAD_MAX).optional(), reserve: group.optional() }), MAX_BODY * 2);
  const ids = await seed(db(c.env), c.get('session').pid, Date.now(), b);
  return c.json({ ids });
});
