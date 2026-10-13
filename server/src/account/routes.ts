/**
 * /api/account/* (ADR-0009 key interfaces). Every route needs a session and
 * acts on the caller's own player only. Cookie requests are covered by the
 * app-wide Origin check (auth/origin.ts).
 *
 * V6-LINK-01: the summary, renames and the public-boards opt-out. Linking,
 * email changes and deletion are added by V6-LINK-02 and V6-LINK-03.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { db, requireSession } from '../middleware';
import { forgetSessions } from '../auth/sessions';
import { validateDisplayName } from '../names/validate';
import { getPlayer, nameKeyHeld, setDisplayName, type PlayerRow } from '../players';
import { requireLimit } from '../rateLimit';
import { accountSummary, nameStatus } from './summary';

export const account = new Hono<AppEnv>();
account.use('*', requireSession);

async function me(d: D1Database, pid: number): Promise<PlayerRow> {
  const p = await getPlayer(d, pid);
  if (!p) throw new ApiError(404, 'not_found', 'Player not found');
  return p;
}

account.get('/', async (c) => {
  const d = db(c.env);
  const now = Date.now();
  return c.json(await accountSummary(d, await me(d, c.get('session').pid), now));
});

const NameBody = z.object({ name: z.string().max(64) });

account.put('/name', async (c) => {
  const pid = c.get('session').pid;
  // Each try reveals whether a name is taken or allowed: keep probing slow.
  // RL_AUTH_IP (10 / 60 s), shared by every isolate in the location, not the per-isolate map (V6-041).
  await requireLimit(c.env.RL_AUTH_IP, `rename:${pid}`);
  const body = await readJson(c, NameBody, 1024);
  const v = validateDisplayName(body.name);
  // One message for every reason: the client words each reason itself, and the blocklist is never shown.
  if (!v.ok) throw new ApiError(400, 'invalid_name', "This name isn't allowed", { reason: v.reason });
  const d = db(c.env);
  const now = Date.now();
  const p = await me(d, pid);
  if (v.name === p.display_name) return c.json({ displayName: p.display_name, name: await nameStatus(d, p, now) });
  const status = await nameStatus(d, p, now);
  if (status.lockedUntil !== null) throw new ApiError(423, 'locked', 'Your name was reset by a moderator', { lockedUntil: status.lockedUntil });
  if (status.nextChangeAt !== null) throw new ApiError(429, 'cooldown', 'You changed your name recently', { nextChangeAt: status.nextChangeAt });
  const taken = () => new ApiError(409, 'taken', 'That name is taken, or too close to one that is');
  if (v.key !== p.display_name_key && (await nameKeyHeld(d, v.key, pid, now))) throw taken();
  let changed: boolean;
  try {
    changed = await setDisplayName(d, pid, v.name, v.key, now, { admin: false });
  } catch (e) {
    if (/UNIQUE/i.test(String((e as Error).message))) throw taken();
    throw e;
  }
  const after = await me(d, pid);
  const fresh = await nameStatus(d, after, now);
  // Refused by the guard: a concurrent rename or an admin lock won the race.
  if (!changed) throw new ApiError(429, 'cooldown', 'You changed your name recently', { nextChangeAt: fresh.nextChangeAt ?? fresh.lockedUntil });
  forgetSessions(pid);
  return c.json({ displayName: after.display_name, name: fresh });
});

const BoardsBody = z.object({ enabled: z.boolean() });

account.put('/public-boards', async (c) => {
  const body = await readJson(c, BoardsBody, 256);
  await db(c.env).prepare('UPDATE players SET public_boards = ?2 WHERE id = ?1').bind(c.get('session').pid, body.enabled ? 1 : 0).run();
  return c.json({ publicBoards: body.enabled });
});
