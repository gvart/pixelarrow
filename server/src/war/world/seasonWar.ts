/**
 * W-62, W-168 season war in D1: a finished world season's roll of honour and the cosmetics it awards. At the rollover
 * (./worldDO.ts), before W-96's reset, the roll is written once (war_season_results, keyed by the world season): the
 * winner, the land-hours, the event points and each path's top places. Every player of the winning alliance gets its
 * banner and each ladder's first place his title's crest (war_cosmetics, idempotent).
 */
import { LADDER, TITLE_OF, type Ladders } from '../../../../src/war/net/ladders';
import type { Crest, SeasonBoard, SeasonResult } from '../../../../src/war/net/world';
import { WAR_SEASON } from '../../../../src/war/world/alliances';
import { PATH_IDS } from '../../../../src/war/world/start';
import { ladders } from '../ladders';

const NO_LADDERS = Object.fromEntries(PATH_IDS.map((p) => [p, []])) as unknown as Ladders;

/** The roll of world season `season` that ended with `r` (event points per alliance; the ladders' top places now). */
export async function buildBoard(db: D1Database | undefined, season: number, startAt: number, r: SeasonResult, event: number[]): Promise<SeasonBoard> {
  let banners = 0;
  if (db && r.winner !== null) {
    banners = (await db.prepare('SELECT COUNT(*) AS n FROM war_alliance_members WHERE season = ?1 AND alliance = ?2').bind(WAR_SEASON.id, r.winner).first<{ n: number }>())?.n ?? 0;
  }
  return { ...r, season, startAt, event: event.map(Math.floor), ladders: db ? await ladders(db, LADDER.honour) : NO_LADDERS, banners };
}

/** Writes the roll and awards its banners and crests (again: nothing new). */
export async function recordSeason(db: D1Database, b: SeasonBoard, now: number): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db
      .prepare('INSERT OR IGNORE INTO war_season_results (season, started_at, ended_at, reason, winner, scores, event, ladders) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(b.season, b.startAt, b.at, b.reason, b.winner, JSON.stringify(b.scores), JSON.stringify(b.event), JSON.stringify(b.ladders)),
  ];
  if (b.winner !== null) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO war_cosmetics (player_id, season, kind, detail, alliance, at) SELECT player_id, ?1, 'banner', CAST(?2 AS TEXT), ?2, ?3 FROM war_alliance_members WHERE season = ?4 AND alliance = ?2")
        .bind(b.season, b.winner, now, WAR_SEASON.id),
    );
  }
  for (const p of PATH_IDS) {
    const first = b.ladders[p][0];
    if (first) stmts.push(db.prepare("INSERT OR IGNORE INTO war_cosmetics (player_id, season, kind, detail, alliance, at) VALUES (?1, ?2, 'crest', ?3, ?4, ?5)").bind(first.pid, b.season, TITLE_OF[p].id, first.alliance, now));
  }
  await db.batch(stmts);
}

/** A player's banners and crests, newest season first. */
export async function crestsOf(db: D1Database, pid: number): Promise<Crest[]> {
  const rows = (await db.prepare('SELECT season, kind, detail, alliance FROM war_cosmetics WHERE player_id = ?1 ORDER BY season DESC, kind, detail').bind(pid).all<{ season: number; kind: 'banner' | 'crest'; detail: string; alliance: number }>()).results;
  return rows.map((r) => ({ season: r.season, kind: r.kind, alliance: r.alliance, ...(r.kind === 'crest' ? { title: r.detail } : {}) }));
}
