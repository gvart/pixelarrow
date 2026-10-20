/** Per-request helpers for the online routes. */
import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';
import { db } from '../middleware';
import { requireRate } from '../rateLimit';
import { currentSeason, membership, requireProfile, type Membership, type ProfileRow, type Season } from './store';

interface Ctx {
  db: D1Database;
  env: Env;
  now: number;
  pid: number;
  name: string;
  season: Season;
}

export interface PlayerCtx extends Ctx {
  profile: ProfileRow;
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
  const clan = await membership(b.db, b.season.id, b.pid);
  return { ...b, profile, clan };
}

/** Per-player soft rate limit (per isolate, like the login limiter). */
export function limit(c: Context<AppEnv>, bucket: string, n: number, windowMs = 60_000): void {
  const pid = c.get('session').pid;
  requireRate(`online:${bucket}:${pid}`, n, windowMs);
}
