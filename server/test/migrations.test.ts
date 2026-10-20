/**
 * Migrations over real rows. The other tests migrate an empty database, which
 * hid a players rebuild that failed in production with FOREIGN KEY constraint
 * failed (D1 always enforces foreign keys). Here the schema up to the last
 * migration production has applied gets rows in every table, every foreign key
 * pointing at a real parent; then the remaining migrations must apply, keep
 * every row of every table they keep and leave no foreign key violation.
 */
import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/** The last migration applied in production; later ones run over the seeded rows. */
const PRODUCTION_HEAD = '0016_sim_version.sql';
const PLAYERS = 6;
/** Tables a later migration drops on purpose (0027: the old route-graph war, W-01). */
const DROPPED = new Set([
  'online_garrisons', 'online_camp_buildings', 'online_camps', 'online_regions', 'online_shards', 'market_audit', 'market_listings',
  'merchant_orders', 'merchant_daily', 'world_boss_chests', 'world_boss_loot', 'world_boss_damage', 'world_bosses', 'battle_tickets', '_keep_merchant_orders',
]);
const ROWS = 3;

interface Column { name: string; type: string; pk: number }
interface ForeignKey { from: string; table: string; to: string | null }

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function tables(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name")
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

async function snapshot(db: D1Database, table: string, columns: string[]): Promise<string[]> {
  const { results } = await db.prepare(`SELECT ${columns.map(q).join(', ')} FROM ${q(table)}`).all();
  return results.map((r) => JSON.stringify(r)).sort();
}

describe('migrations over a populated database', () => {
  it(`applies everything after ${PRODUCTION_HEAD} without losing or orphaning a row`, async () => {
    const db = env.MIGRATE_DB;
    const head = env.TEST_MIGRATIONS.findIndex((m) => m.name === PRODUCTION_HEAD);
    expect(head).toBeGreaterThan(0);
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, head + 1));

    // Seed every table, parents first.
    const names = await tables(db);
    const columns = new Map<string, Column[]>();
    const fks = new Map<string, ForeignKey[]>();
    for (const t of names) {
      columns.set(t, (await db.prepare(`SELECT name, type, pk FROM pragma_table_info(?)`).bind(t).all<Column>()).results);
      fks.set(t, (await db.prepare(`SELECT "from", "table", "to" FROM pragma_foreign_key_list(?)`).bind(t).all<ForeignKey>()).results);
    }
    const seeded = new Set<string>();
    let pass = 0;
    while (seeded.size < names.length) {
      const ready = names.filter((t) => !seeded.has(t) && fks.get(t)!.every((f) => f.table === t || seeded.has(f.table)));
      expect(ready.length, 'a foreign key cycle between tables').toBeGreaterThan(0);
      for (const t of ready) {
        const cols = columns.get(t)!;
        const pkCols = cols.filter((c) => c.pk > 0);
        const rowidPk = pkCols.length === 1 && /^INTEGER$/i.test(pkCols[0]!.type) ? pkCols[0]!.name : null;
        const parentValues = new Map<string, unknown[]>();
        for (const [k, f] of fks.get(t)!.entries()) {
          const to = f.to ?? (columns.get(f.table)!.find((c) => c.pk === 1)!.name);
          const { results } = await db.prepare(`SELECT ${q(to)} AS v FROM ${q(f.table)} ORDER BY rowid`).all<{ v: unknown }>();
          // Two keys to the same parent (attacker/defender) point at different rows.
          parentValues.set(f.from, results.map((r) => r.v).map((_, i, all) => all[(i + k) % all.length]));
        }
        const count = t === 'players' ? PLAYERS : ROWS;
        for (let i = 0; i < count; i++) {
          const insert = cols.filter((c) => c.name !== rowidPk || parentValues.has(c.name));
          const values = insert.map((c) => {
            const parents = parentValues.get(c.name);
            if (parents) return parents[i % parents.length];
            if (/INT/i.test(c.type)) return 1_000_000 + pass * 10_000 + names.indexOf(t) * 10 + i;
            if (/REAL|FLOA|DOUB/i.test(c.type)) return i + 0.5;
            return `${t}.${c.name}.${i}`;
          });
          await db
            .prepare(`INSERT INTO ${q(t)} (${insert.map((c) => q(c.name)).join(', ')}) VALUES (${insert.map(() => '?').join(', ')})`)
            .bind(...values)
            .run();
        }
        seeded.add(t);
      }
      pass++;
    }

    const before = new Map<string, string[]>();
    for (const t of names) {
      const cols = t === 'players'
        ? ['id', 'telegram_id', 'username', 'first_name', 'created_at', 'last_seen_at']
        : columns.get(t)!.map((c) => c.name);
      before.set(t, await snapshot(db, t, cols));
      expect(before.get(t)!.length, t).toBeGreaterThan(0);
    }
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);

    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    const kept = new Set(await tables(db));
    expect(names.filter((t) => !kept.has(t) && !DROPPED.has(t)), 'tables lost by a migration').toEqual([]);
    for (const t of names.filter((n) => kept.has(n))) {
      const cols = t === 'players'
        ? ['id', 'telegram_id', 'username', 'first_name', 'created_at', 'last_seen_at']
        : columns.get(t)!.map((c) => c.name);
      expect(await snapshot(db, t, cols), t).toEqual(before.get(t));
    }
    const identities = await db.prepare("SELECT count(*) AS n FROM auth_identities WHERE kind = 'telegram'").first<{ n: number }>();
    expect(identities?.n).toBe(PLAYERS);
    // The rebuilt players table hands out ids after the copied ones.
    const seq = await db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'players'").first<{ seq: number }>();
    const max = await db.prepare('SELECT max(id) AS id FROM players').first<{ id: number }>();
    expect(seq?.seq).toBe(max?.id);
  });
});
