import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { buildPublicSnapshot } from '../src/public/snapshot';
import { PublicSummaryV1 } from '../src/public/schema';

const db = env.DB!;
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const DAY = 86_400_000;

/** Seeded players get large, distinctive ids and Telegram ids, so a scan of the snapshot can find any leak. */
let seq = 0;
async function seedPlayer(o: { banned?: boolean; lastSeen?: number } = {}): Promise<{ id: number; tg: number; first: string; user: string }> {
  seq++;
  const id = 9_100_000 + seq;
  const tg = 7_700_000_000 + seq;
  const first = `Firstname${seq}x`;
  const user = `user_${seq}_tg`;
  await db
    .prepare('INSERT INTO players (id, telegram_id, username, first_name, created_at, last_seen_at, banned_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, tg, user, first, NOW - 30 * DAY, o.lastSeen ?? NOW - DAY, o.banned ? NOW - DAY : null)
    .run();
  return { id, tg, first, user };
}

async function stored(): Promise<{ body: string; generated_at: number } | null> {
  return db.prepare('SELECT body, generated_at FROM public_snapshot WHERE id = 1').first();
}

describe('public snapshot (ADR-0010 §2)', () => {
  it('writes one strict snapshot row with real totals; banned players are not counted', async () => {
    const before = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE banned_at IS NULL').first<{ n: number }>();
    await seedPlayer();
    await seedPlayer({ lastSeen: NOW - 30 * DAY });
    await seedPlayer({ banned: true });
    const snap = await buildPublicSnapshot(env, NOW);
    expect(snap.v).toBe(1);
    expect(snap.generatedAt).toBe(NOW);
    expect(snap.totals.players).toBe(before!.n + 2);
    const row = await stored();
    expect(row?.generated_at).toBe(NOW);
    expect(PublicSummaryV1.parse(JSON.parse(row!.body))).toEqual(snap);
  });
});
