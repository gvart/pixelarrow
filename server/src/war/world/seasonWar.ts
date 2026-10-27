/**
 * W-62 season war in D1 (migrations/0040_war_season_war.sql): a finished world season's scoreboard and the cosmetics it
 * awards. At the rollover (./worldDO.ts) the board is written once (war_season_results, keyed by the world season), every
 * player of the winning alliance gets its banner and every title holder his title's crest (war_cosmetics, idempotent).
 * Men, gear and titles are not touched: persons, items and season stats stay as they are.
 */
import type { BoardTitle, Crest, SeasonBoard, SeasonResult } from '../../../../src/war/net/world';
import { WAR_SEASON } from '../../../../src/war/world/alliances';
import { titles } from '../peace';

/** The board of world season `season` that ended with `r` (event score per alliance; title holders now). */
export async function buildBoard(db: D1Database | undefined, season: number, startAt: number, r: SeasonResult, event: number[]): Promise<SeasonBoard> {
  const t: BoardTitle[] = db ? (await titles(db)).map((x) => ({ id: x.id, name: x.name, pid: x.pid, player: x.player, alliance: x.alliance })) : [];
  let banners = 0;
  if (db && r.winner !== null) {
    banners = (await db.prepare('SELECT COUNT(*) AS n FROM war_alliance_members WHERE season = ?1 AND alliance = ?2').bind(WAR_SEASON.id, r.winner).first<{ n: number }>())?.n ?? 0;
  }
  return { ...r, season, startAt, event: event.map(Math.floor), titles: t, banners };
}

/** Writes the board and awards its banners and crests (again: nothing new). */
export async function recordSeason(db: D1Database, b: SeasonBoard, now: number): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db
      .prepare('INSERT OR IGNORE INTO war_season_results (season, started_at, ended_at, reason, winner, scores, event, titles) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(b.season, b.startAt, b.at, b.reason, b.winner, JSON.stringify(b.scores), JSON.stringify(b.event), JSON.stringify(b.titles)),
  ];
  if (b.winner !== null) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO war_cosmetics (player_id, season, kind, detail, alliance, at) SELECT player_id, ?1, 'banner', CAST(?2 AS TEXT), ?2, ?3 FROM war_alliance_members WHERE season = ?4 AND alliance = ?2")
        .bind(b.season, b.winner, now, WAR_SEASON.id),
    );
  }
  for (const t of b.titles) {
    stmts.push(db.prepare("INSERT OR IGNORE INTO war_cosmetics (player_id, season, kind, detail, alliance, at) VALUES (?1, ?2, 'crest', ?3, ?4, ?5)").bind(t.pid, b.season, t.id, t.alliance, now));
  }
  await db.batch(stmts);
}

/** A player's banners and crests, newest season first. */
export async function crestsOf(db: D1Database, pid: number): Promise<Crest[]> {
  const rows = (await db.prepare('SELECT season, kind, detail, alliance FROM war_cosmetics WHERE player_id = ?1 ORDER BY season DESC, kind, detail').bind(pid).all<{ season: number; kind: 'banner' | 'crest'; detail: string; alliance: number }>()).results;
  return rows.map((r) => ({ season: r.season, kind: r.kind, alliance: r.alliance, ...(r.kind === 'crest' ? { title: r.detail } : {}) }));
}
