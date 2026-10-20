/**
 * The schema-driven half of the deletion contract (ADR-0009 §7, M-ID-5, M-DL-6):
 * every table of the migrated schema is classified in DELETION_MAP, and every
 * column that can hold a player id or a Telegram id is named by its entry.
 * Adding a table or a player column without classifying it fails here.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DELETION_MAP, playerColumnsOf, unclassified, type SchemaColumn } from '../src/account/deletionMap';

async function schema(): Promise<SchemaColumn[]> {
  const rows = await env.DB!.prepare(
    `SELECT m.name AS tbl, p.name AS col, f."table" AS ref
     FROM sqlite_master m JOIN pragma_table_info(m.name) p
     LEFT JOIN pragma_foreign_key_list(m.name) f ON f."from" = p.name
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name != 'd1_migrations'`,
  ).all<{ tbl: string; col: string; ref: string | null }>();
  return rows.results.map((r) => ({ table: r.tbl, column: r.col, references: r.ref }));
}

describe('DELETION_MAP covers the schema', () => {
  it('classifies every table and every player column of the migrated schema', async () => {
    expect(unclassified(await schema())).toEqual([]);
  });

  it('names no table or column that does not exist', async () => {
    const cols = await schema();
    const tables = new Set(cols.map((c) => c.table));
    for (const [table, rule] of Object.entries(DELETION_MAP)) {
      expect(tables.has(table), `${table} is in DELETION_MAP but not in the schema`).toBe(true);
      for (const col of [...(rule.pid ?? []), ...(rule.tg ?? []), ...(rule.kept ?? [])]) {
        expect(cols.some((c) => c.table === table && c.column === col), `${table}.${col}`).toBe(true);
      }
    }
  });

  it('fails for a new player table that is not classified', async () => {
    const cols = [
      ...(await schema()),
      { table: 'guild_chat', column: 'player_id', references: 'players' },
      { table: 'guild_chat', column: 'text', references: null },
    ];
    expect(unclassified(cols)).toEqual(['guild_chat: not in DELETION_MAP']);
  });

  it('fails for a new player column on a classified table, by foreign key or by name', async () => {
    const cols = [
      ...(await schema()),
      { table: 'clans', column: 'founder', references: 'players' },
      { table: 'online_profiles', column: 'attacker_id', references: null },
      { table: 'notify_settings', column: 'telegram_chat', references: null },
    ];
    expect(unclassified(cols)).toEqual(['clans.founder: player column not in DELETION_MAP', 'notify_settings.telegram_chat: player column not in DELETION_MAP', 'online_profiles.attacker_id: player column not in DELETION_MAP']);
  });

  it('spots player columns by foreign key and by name', () => {
    const cols: SchemaColumn[] = [
      { table: 't', column: 'player_id', references: null },
      { table: 't', column: 'owner', references: 'players' },
      { table: 't', column: 'killed_by', references: null },
      { table: 't', column: 'telegram_id', references: null },
      { table: 't', column: 'shard_id', references: null },
      { table: 't', column: 'clan_id', references: 'clans' },
    ];
    expect(playerColumnsOf(cols).map((c) => c.column)).toEqual(['player_id', 'owner', 'killed_by', 'telegram_id']);
  });
});
