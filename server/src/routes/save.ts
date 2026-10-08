/**
 * Campaign save blob storage with optimistic concurrency.
 *
 * GET  /api/save -> { revision, version, data, updatedAt }  (revision 0, data null: no save yet)
 * PUT  /api/save    { revision: <the revision the client last saw>, data: SaveData }
 *      -> 200 { revision: n+1, updatedAt }  or 409 { error: { code: 'save_conflict', revision: <current> } }
 *
 * v1 trusts the client's economy; the blob is only checked for size and shape.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { db, requireAuth } from '../middleware';

export const MAX_SAVE_BYTES = 512 * 1024;

const PutBody = z.object({
  revision: z.number().int().min(0),
  data: z.looseObject({ v: z.number().int().min(1) }),
});

interface SaveRow {
  revision: number;
  version: number;
  data: string;
  updated_at: number;
}

export const save = new Hono<AppEnv>();
save.use('*', requireAuth);

save.get('/', async (c) => {
  const row = await db(c.env)
    .prepare('SELECT revision, version, data, updated_at FROM saves WHERE player_id = ?1')
    .bind(c.get('session').pid)
    .first<SaveRow>();
  if (!row) return c.json({ revision: 0, version: null, data: null, updatedAt: null });
  return c.json({ revision: row.revision, version: row.version, data: JSON.parse(row.data) as unknown, updatedAt: row.updated_at });
});

save.put('/', async (c) => {
  const body = await readJson(c, PutBody, MAX_SAVE_BYTES + 1024);
  const json = JSON.stringify(body.data);
  const size = new TextEncoder().encode(json).length;
  if (size > MAX_SAVE_BYTES) throw new ApiError(413, 'too_large', `Save larger than ${MAX_SAVE_BYTES} bytes`);

  const d = db(c.env);
  const pid = c.get('session').pid;
  const now = Date.now();
  const next = body.revision + 1;
  const res =
    body.revision === 0
      ? await d
          .prepare('INSERT INTO saves (player_id, revision, version, data, size, updated_at) VALUES (?1, 1, ?2, ?3, ?4, ?5) ON CONFLICT (player_id) DO NOTHING')
          .bind(pid, body.data.v, json, size, now)
          .run()
      : await d
          .prepare('UPDATE saves SET revision = ?2, version = ?3, data = ?4, size = ?5, updated_at = ?6 WHERE player_id = ?1 AND revision = ?7')
          .bind(pid, next, body.data.v, json, size, now, body.revision)
          .run();

  if (res.meta.changes !== 1) {
    const cur = await d.prepare('SELECT revision, updated_at FROM saves WHERE player_id = ?1').bind(pid).first<{ revision: number; updated_at: number }>();
    throw new ApiError(409, 'save_conflict', 'The save was changed elsewhere; fetch it and merge or overwrite', {
      revision: cur?.revision ?? 0,
      updatedAt: cur?.updated_at ?? null,
    });
  }
  return c.json({ revision: next, updatedAt: now });
});
