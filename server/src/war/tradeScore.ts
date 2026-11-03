/**
 * What a fill does beyond the goods, and what alliances saw of the boards (M6h; docs/WAR.md "Anti-abuse"; migrations/0032).
 *
 *  - The fill hook: anti-abuse, the seller's season stat and level, the alliance's tax, his liege's part.
 *  - Boards seen: whenever an alliance's man trades or reads the board in a town, its board is kept for the alliance
 *    (the world map's hover card shows the last one).
 */
import { heldNodes } from '../../../src/data/professions';
import type { AllianceId } from '../../../src/war/world/types';
import type { BoardSeen } from '../../../src/war/net/world';
import type { Env } from '../env';
import { stallId, type Board, type FillHook } from './market';
import { saleTribute } from './oaths';
import { crownTax } from './crown';
import { allianceOf } from './world/members';
import { json } from './persons';
import { tradeRefusal } from './abuse';
import { statStmt } from './peace';
import { tallyStmt } from './tasks';
import { cappedStmts, FAVOUR_EARN } from './favour';

/**
 * The fill hook: anti-abuse first (M6i), then the seller's coin sold and level on every fill, W-64 the alliance tax,
 * W-153 his liege's part set aside at the stall; between alliances, the sell-abroad task's tally.
 */
export function fillHook(env: Env): FillHook {
  return async (f) => {
    const db = env.DB!;
    await tradeRefusal(db, f.seller, f.buyer, f.now);
    // W-64: the alliance tax's share of the sale, out of the seller's stall into his crown's treasury
    const sold = [statStmt(db, f.seller, 'sold', f.coin), ...(await crownTax(db, f.seller, f.coin, stallId(f.town, f.seller))), ...(await saleTribute(db, f.seller, f.coin, f.town)), ...(await cappedStmts(db, f.seller, f.coin * FAVOUR_EARN.sold, 'sold', f.now))]; // W-111 a trader's level
    const [sa, ba] = await Promise.all([allianceOf(db, f.seller), allianceOf(db, f.buyer)]);
    if (sa === null || ba === null || sa === ba) return { stmts: sold };
    return { stmts: [...sold, tallyStmt(db, f.seller, 'sellAlliance', f.coin, f.now)] }; // E7 tasks
  };
}

/** Does the player keep a merchant with this node? */
export async function hasNode(db: D1Database, pid: number, node: string): Promise<boolean> {
  const rows = (await db.prepare("SELECT perks FROM war_persons WHERE player_id = ?1 AND cls = 'merchant' AND state NOT IN ('dead', 'retired')").bind(pid).all<{ perks: string }>()).results;
  return rows.some((r) => heldNodes('merchant', json<string[]>(r.perks, [])).has(node));
}

/** The board `b` as the player's alliance saw it now. */
export async function recordBoard(db: D1Database, pid: number, b: Board, now: number): Promise<void> {
  const a = await allianceOf(db, pid);
  if (a === null) return;
  const seen: BoardSeen = { at: now, goods: b.goods, fills: b.fills };
  await db.prepare('INSERT INTO war_board_seen (alliance, town, board, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (alliance, town) DO UPDATE SET board = ?3, at = ?4').bind(a, b.town, JSON.stringify(seen), now).run();
}

/** Every board the alliance saw last, by town. */
export async function boardsSeen(db: D1Database, alliance: AllianceId): Promise<Record<string, BoardSeen>> {
  const rows = (await db.prepare('SELECT town, board FROM war_board_seen WHERE alliance = ?1').bind(alliance).all<{ town: string; board: string }>()).results;
  return Object.fromEntries(rows.map((r) => [r.town, json<BoardSeen>(r.board, { at: 0, goods: {}, fills: [] })]));
}
