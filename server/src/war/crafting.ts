/**
 * Crafting persistence in D1 (M5h4; docs/WAR.md "Crafting and professions"; migrations/0023_war_crafting.sql).
 *
 *  - Nodes: a civilian's profession picks live in `war_persons.perks` (Hero.perks); one node at a time, at home, by the
 *    tree rules (src/data/professions.ts nodeRefusal). Respec clears them for RESPEC.silver, once per RESPEC.ms.
 *  - Mends: a repair or salvage order takes a stash item to a workplace of a region room: its row gets `region` (the
 *    stash and equip leave it alone meanwhile) and the room orders the sim with the stored item, never the client's.
 *    The room hands back items whose order went (cancelled, refused, workplace lost) and a fresh room frees them all.
 *  - Write-back: each `crafted` event of a room is one D1 batch keyed by region, room run and order id (war_crafts): a
 *    replayed event (a room resumed from an older save) changes nothing. craft: the item is minted into the maker's
 *    owner's stash with the sim's rolls; repair: the stored item takes the event's cond / mc and is back in the stash;
 *    salvage: the item is gone (its goods went to the team stock in the sim).
 */
import { nodeRefusal, profOf } from '../../../src/data/professions';
import type { Item } from '../../../src/data/items';
import type { WarEvent } from '../../../src/war/types';
import { ApiError } from '../errors';
import { home, json, ownerPid, person } from './persons';

export const RESPEC = { silver: 50, ms: 24 * 3_600_000 };

export type Crafted = Extract<WarEvent, { kind: 'crafted' }>;

const professionOf = (cls: string) => {
  const prof = profOf(cls);
  if (!prof) throw new ApiError(409, 'not_civilian', 'Only a civilian has a profession');
  return prof;
};

/** Take profession node `node` for civilian `id` (at home); returns his picks. */
export async function pickNode(db: D1Database, pid: number, id: string, node: string, now: number): Promise<string[]> {
  const r = await person(db, pid, id);
  home(r);
  const prof = professionOf(r.cls);
  const perks = json<string[]>(r.perks, []);
  const why = nodeRefusal(prof, r.level, perks, node);
  if (why) throw new ApiError(409, `node_${why}`, `He cannot take ${node} (${why})`);
  const next = [...perks, node];
  const res = await db
    .prepare('UPDATE war_persons SET perks = ?3, updated_at = ?4 WHERE id = ?1 AND player_id = ?2 AND region IS NULL AND perks = ?5')
    .bind(id, pid, JSON.stringify(next), now, r.perks)
    .run();
  if (res.meta.changes === 0) throw new ApiError(409, 'changed', 'He changed meanwhile; try again');
  return next;
}

/** Clear civilian `id`'s picks for RESPEC.silver, at most once per RESPEC.ms. Returns when he may respec again. */
export async function respec(db: D1Database, pid: number, id: string, now: number): Promise<number> {
  const r = await person(db, pid, id);
  home(r);
  professionOf(r.cls);
  if (!json<string[]>(r.perks, []).length) throw new ApiError(409, 'no_nodes', 'He has no nodes to reset');
  if (r.respec_at !== null && now - r.respec_at < RESPEC.ms) throw new ApiError(409, 'respec_wait', 'Once a day', { until: r.respec_at + RESPEC.ms });
  const paid = await db.prepare("UPDATE war_stock SET amount = amount - ?2 WHERE player_id = ?1 AND res = 'silver' AND amount >= ?2").bind(pid, RESPEC.silver).run();
  if (paid.meta.changes === 0) throw new ApiError(409, 'no_silver', `A respec costs ${RESPEC.silver} silver`);
  await db.prepare("UPDATE war_persons SET perks = '[]', respec_at = ?3, updated_at = ?3 WHERE id = ?1 AND player_id = ?2").bind(id, pid, now).run();
  return now + RESPEC.ms;
}

/** The player's stash: each item and the region whose workplace holds it (null: at home). */
export async function stash(db: D1Database, pid: number): Promise<{ item: Item; region: string | null }[]> {
  const rows = (await db.prepare('SELECT item, region FROM war_items WHERE player_id = ?1 ORDER BY created_at, uid').bind(pid).all<{ item: string; region: string | null }>()).results;
  return rows.map((r) => ({ item: json<Item>(r.item, { uid: '', def: '', rarity: 'common', cond: 0 }), region: r.region }));
}

/** Take stash item `uid` to a workplace in `region` (null: no such item at home). */
export async function takeForMend(db: D1Database, pid: number, uid: string, region: string): Promise<Item | null> {
  const res = await db.prepare('UPDATE war_items SET region = ?3 WHERE uid = ?1 AND player_id = ?2 AND region IS NULL').bind(uid, pid, region).run();
  if (res.meta.changes === 0) return null;
  const row = await db.prepare('SELECT item FROM war_items WHERE uid = ?1').bind(uid).first<{ item: string }>();
  return row ? json<Item | null>(row.item, null) : null;
}

/** Items whose mend order went: back in the stash. */
export async function returnMends(db: D1Database, region: string, uids: string[]): Promise<void> {
  if (!uids.length) return;
  await db.prepare('UPDATE war_items SET region = NULL WHERE region = ?1 AND uid IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(uids)).run();
}

/** A restored room: items D1 has at its workplaces that the saved state does not hold go back to the stash. */
export async function keepMends(db: D1Database, region: string, uids: string[]): Promise<void> {
  await db.prepare('UPDATE war_items SET region = NULL WHERE region = ?1 AND uid NOT IN (SELECT value FROM json_each(?2))').bind(region, JSON.stringify(uids)).run();
}

/** The idempotency key of a crafted event, and the uid a minted item gets. */
export const craftKey = (region: string, run: string, order: number) => `${region}:${run}:${order}`;

/**
 * Write a room's crafted events back, each in one batch led by its war_crafts row (a second write of the same event
 * fails on that key and changes nothing). Events of owners that are not players (bots) are skipped. Returns the events
 * written now.
 */
export async function applyCrafts(db: D1Database, region: string, run: string, evs: readonly Crafted[], now: number): Promise<number> {
  let n = 0;
  for (const e of evs) {
    const pid = ownerPid(e.owner);
    if (pid === null) continue;
    const id = craftKey(region, run, e.order);
    const head = db.prepare('INSERT INTO war_crafts (id, region, what, player_id, uid, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)');
    const stmts: D1PreparedStatement[] = [];
    if (e.what === 'craft') {
      const item: Item = { ...e.item, uid: `c:${id}` };
      stmts.push(head.bind(id, region, e.what, pid, item.uid, now));
      stmts.push(db.prepare('INSERT INTO war_items (uid, player_id, item, created_at) VALUES (?1, ?2, ?3, ?4)').bind(item.uid, pid, JSON.stringify(item), now));
    } else if (e.what === 'repair') {
      stmts.push(head.bind(id, region, e.what, pid, e.item.uid, now));
      stmts.push(db.prepare('UPDATE war_items SET item = ?3, region = NULL WHERE uid = ?1 AND player_id = ?2 AND region = ?4').bind(e.item.uid, pid, JSON.stringify(e.item), region));
    } else {
      stmts.push(head.bind(id, region, e.what, pid, e.item.uid, now));
      stmts.push(db.prepare('DELETE FROM war_items WHERE uid = ?1 AND player_id = ?2 AND region = ?3').bind(e.item.uid, pid, region));
    }
    try {
      await db.batch(stmts);
      n++;
    } catch (err) {
      if (!/UNIQUE constraint failed: war_crafts\.id/.test(String(err))) throw err;
    }
  }
  return n;
}
