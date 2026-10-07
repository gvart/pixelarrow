/**
 * Drachmae wallets (D1). Every movement is a drachmae_ledger row, unique per
 * (player, kind, ref), written in the same batch as the balance change and
 * guarded so a retry can never apply it twice:
 *
 * - `walletMove(..., guard)` writes a ledger row and the balance change only
 *   when `guard` (an SQL EXISTS of the operation's own key row) holds.
 * - `creditOnce` uses the ledger row itself as the key (Telegram charges).
 *
 * Spending must check `drachmae >= price` in the guarding statement; only a
 * refund may push a balance below zero, which then blocks spending.
 */
import { randomToken } from '../online/store';

export function ensureWallet(db: D1Database, pid: number, now: number): D1PreparedStatement {
  return db.prepare('INSERT OR IGNORE INTO wallets (player_id, drachmae, updated_at) VALUES (?1, 0, ?2)').bind(pid, now);
}

/** SQL: the player's balance (0 without a wallet). Use inside WHERE clauses. */
export function balanceSql(pidParam: string): string {
  return `COALESCE((SELECT drachmae FROM wallets WHERE player_id = ${pidParam}), 0)`;
}

/** Ledger row + balance change, both only if `guard` holds (an SQL boolean). */
export function walletMove(db: D1Database, pid: number, delta: number, kind: string, ref: string, guard: string, now: number): D1PreparedStatement[] {
  return [
    db
      .prepare(`INSERT INTO drachmae_ledger (player_id, delta, kind, ref, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${guard} ON CONFLICT DO NOTHING`)
      .bind(pid, delta, kind, ref, now),
    db.prepare(`UPDATE wallets SET drachmae = drachmae + ?2, updated_at = ?3 WHERE player_id = ?1 AND ${guard}`).bind(pid, delta, now),
  ];
}

/**
 * Credits (or with a negative delta debits) exactly once per (player, kind, ref):
 * the ledger row is inserted with a fresh nonce and the balance only moves when
 * that very row was written by this batch. `cond` adds an SQL precondition
 * (its parameters are numbered from ?7).
 * Returns true when this call applied it.
 */
export async function creditOnce(
  db: D1Database,
  pid: number,
  delta: number,
  kind: string,
  ref: string,
  now: number,
  cond: { sql: string; binds: unknown[] } = { sql: '1', binds: [] },
): Promise<boolean> {
  const nonce = randomToken(8);
  const res = await db.batch([
    ensureWallet(db, pid, now),
    db
      .prepare(`INSERT INTO drachmae_ledger (player_id, delta, kind, ref, nonce, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${cond.sql} ON CONFLICT DO NOTHING`)
      .bind(pid, delta, kind, ref, nonce, now, ...cond.binds),
    db
      .prepare(
        `UPDATE wallets SET drachmae = drachmae + ?2, updated_at = ?3
         WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM drachmae_ledger WHERE player_id = ?1 AND kind = ?4 AND ref = ?5 AND nonce = ?6)`,
      )
      .bind(pid, delta, now, kind, ref, nonce),
  ]);
  return res[1].meta.changes === 1;
}

export async function balance(db: D1Database, pid: number): Promise<number> {
  const r = await db.prepare('SELECT drachmae FROM wallets WHERE player_id = ?1').bind(pid).first<{ drachmae: number }>();
  return r?.drachmae ?? 0;
}
