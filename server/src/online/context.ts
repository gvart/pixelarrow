/** Per-request helpers for the online routes. */
import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';
import { db } from '../middleware';
import { requireRate } from '../rateLimit';
import { currentSeason, getShard, membership, requireProfile, shardDoName, type Membership, type ProfileRow, type Season, type Shard } from './store';

export interface Ctx {
  db: D1Database;
  env: Env;
  now: number;
  pid: number;
  name: string;
  season: Season;
}

export interface PlayerCtx extends Ctx {
  profile: ProfileRow;
  shard: Shard;
  clan: Membership | null;
}

export async function base(c: Context<AppEnv>): Promise<Ctx> {
  const d = db(c.env);
  const now = Date.now();
  const s = c.get('session');
  return { db: d, env: c.env, now, pid: s.pid, name: s.name, season: await currentSeason(d, now) };
}

export async function player(c: Context<AppEnv>): Promise<PlayerCtx> {
  const b = await base(c);
  const profile = await requireProfile(b.db, b.season.id, b.pid);
  const [shard, clan] = await Promise.all([getShard(b.db, b.season.id, profile.shard_id), membership(b.db, b.season.id, b.pid)]);
  return { ...b, profile, shard, clan };
}

/** Per-player soft rate limit (per isolate, like the login limiter). */
export function limit(c: Context<AppEnv>, bucket: string, n: number, windowMs = 60_000): void {
  const pid = c.get('session').pid;
  requireRate(`online:${bucket}:${pid}`, n, windowMs);
}

/** The shard's Durable Object (presence, duels, region attack locks). */
export function shardStub(env: Env, shard: { season: number; id: number }) {
  return env.REGION.get(env.REGION.idFromName(shardDoName(shard)));
}

/** Key of a region's attack lock in the shard's Durable Object. */
export const regionKey = (loc: number) => `r${loc}`;
