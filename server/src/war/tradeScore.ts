/**
 * Trade score and what alliances saw of the boards (M6h; docs/WAR.md "Season score and anti-abuse"; migrations/0032).
 *
 *  - A fill scores TRADE.per coin a point for its goods whose origin (the region they were gathered, made or minted
 *    in) lies TRADE.hops or more transfers from the town (a town ignores its own region's stamps: 0 transfers), and
 *    only between players of different alliances (same-alliance fills score nothing). Points go to the seller's
 *    alliance, at most TRADE.cap a UTC day (war_trade_score), and into the season score (WarWorldDO.addTrade).
 *  - Boards seen: whenever an alliance's man trades or reads the board in a town, its board is kept for the alliance
 *    (the world map's hover card shows the last one).
 */
import { heldNodes } from '../../../src/data/professions';
import { hops } from '../../../src/war/world/graph';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import type { AllianceId } from '../../../src/war/world/types';
import type { BoardSeen } from '../../../src/war/net/world';
import type { Env } from '../env';
import type { Board, FillHook } from './market';
import { allianceOf } from './world/members';
import { json } from './persons';
import { tradeRefusal } from './abuse';

export const TRADE = { per: 100, hops: 3, cap: 60 };
const DAY = 86_400_000;

/** The score of goods worth `coin` in all (lots by origin) sold in `town`: origins >= TRADE.hops transfers away count. */
export function scoreOf(town: string, lots: readonly { origin: string; amount: number }[], coin: number): number {
  const total = lots.reduce((a, l) => a + l.amount, 0);
  if (!(total > 0)) return 0;
  const far = lots.filter((l) => l.origin !== town && hops(l.origin, town) >= TRADE.hops && Number.isFinite(hops(l.origin, town))).reduce((a, l) => a + l.amount, 0);
  return (coin * (far / total)) / TRADE.per;
}

/** Points the alliance may still score today. */
async function room(db: D1Database, alliance: number, now: number): Promise<number> {
  const r = await db.prepare('SELECT points FROM war_trade_score WHERE season = ?1 AND alliance = ?2 AND day = ?3').bind(WAR_SEASON.id, alliance, Math.floor(now / DAY)).first<{ points: number }>();
  return Math.max(0, TRADE.cap - (r?.points ?? 0));
}

/** The fill hook: anti-abuse first (M6i), then the score and its daily row. */
export function fillHook(env: Env): FillHook {
  return async (f) => {
    const db = env.DB!;
    await tradeRefusal(db, f.seller, f.buyer, f.now);
    const [sa, ba] = await Promise.all([allianceOf(db, f.seller), allianceOf(db, f.buyer)]);
    if (sa === null || ba === null || sa === ba) return { score: 0, stmts: [] };
    const pts = Math.min(scoreOf(f.town, f.lots, f.coin), await room(db, sa, f.now));
    if (!(pts > 0)) return { score: 0, stmts: [] };
    return {
      score: pts,
      stmts: [db.prepare('INSERT INTO war_trade_score (season, alliance, day, points) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (season, alliance, day) DO UPDATE SET points = points + ?4').bind(WAR_SEASON.id, sa, Math.floor(f.now / DAY), pts)],
    };
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
