/**
 * World API (/api/war/world/*, M4; protocol src/war/net/world.ts). Signed in and playable; the world itself is the one
 * WarWorldDO.
 *
 *   GET  /                    WorldSnapshot: region owners, contested and besieged flags, live men and claims per
 *                             alliance, alliance stats, the player's own squads in transit
 *   POST /transfer  { from, to, squad }   send a squad of the player's standing in `from` to the adjacent `to`
 *   POST /dev/alliance { alliance }       DEV_AUTH=1 only: join alliance 0..3 (Dodona, Skythia, Kyrene, Elaia)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../../body';
import type { AppEnv, Env } from '../../env';
import { ApiError } from '../../errors';
import { db, requirePlayable } from '../../middleware';
import type { TransferOrder } from '../../../../src/war/net/world';
import type { AllianceId } from '../../../../src/war/world/types';
import { allianceOf, joinAlliance } from './members';
import { WORLD_NAME } from './world';

export const worldApi = new Hono<AppEnv>();

const MAX_BODY = 512;
// src/war/net/world.ts transferSchema, built with the server's zod (readJson takes its own copy's schemas)
const regionId = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const transfer = z.object({ from: regionId, to: regionId, squad: z.number().int().min(0).max(2 ** 31) });
export const worldStub = (env: Env) => env.WAR_WORLD.get(env.WAR_WORLD.idFromName(WORLD_NAME));

worldApi.get('/', requirePlayable, async (c) => {
  const pid = c.get('session').pid;
  return c.json(await worldStub(c.env).snapshot(pid, await allianceOf(db(c.env), pid)));
});

worldApi.post('/transfer', requirePlayable, async (c) => {
  const pid = c.get('session').pid;
  const o: TransferOrder = await readJson(c, transfer, MAX_BODY);
  const r = await worldStub(c.env).transfer(pid, await allianceOf(db(c.env), pid), o);
  if ('error' in r) throw new ApiError(r.error === 'unavailable' ? 503 : 409, r.error, r.detail ?? r.error);
  return c.json(r);
});

worldApi.post('/dev/alliance', requirePlayable, async (c) => {
  if (c.env.DEV_AUTH !== '1') throw new ApiError(404, 'not_found', 'No such endpoint');
  const b = await readJson(c, z.object({ alliance: z.number().int().min(0).max(3) }), MAX_BODY);
  await joinAlliance(db(c.env), c.get('session').pid, b.alliance as AllianceId, Date.now());
  return c.json({ alliance: b.alliance });
});
