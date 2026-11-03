/**
 * W-165..W-169 the season's path ladders (docs/WAR.md "Paths" › "Ladders"; rows: src/war/net/ladders.ts). Read from the
 * live tables: a player's path on war_alliance_members and his level points on war_favour, both wiped by W-96, so what is
 * here is this season. Only his own path can hold him: W-83 locks it, and W-111 pays each reason to one path.
 */
import { LADDER, TITLE_OF, type LadderRow, type Ladders, type LaddersView } from '../../../src/war/net/ladders';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { PATH_IDS, type PathId, type StartFamily } from '../../../src/war/world/start';

interface Row { pid: number; name: string | null; alliance: number; home: string | null; family: StartFamily | null; xp: number; level: number }

/** Top rows of one ladder: most points; a tie, who got there first (his last gain), then the lower id. */
async function rowsOf(db: D1Database, path: PathId, limit: number): Promise<Row[]> {
  const rows = await db
    .prepare(`SELECT m.player_id AS pid, pl.display_name AS name, m.alliance, m.home, m.family, f.xp, f.level
      FROM war_alliance_members m JOIN war_favour f ON f.player_id = m.player_id JOIN players pl ON pl.id = m.player_id
      WHERE m.season = ?1 AND m.path = ?2 AND f.xp > 0 ORDER BY f.xp DESC, f.updated_at, m.player_id LIMIT ?3`)
    .bind(WAR_SEASON.id, path, limit)
    .all<Row>();
  return rows.results;
}

const toRow = (path: PathId) => (r: Row, i: number): LadderRow => ({
  place: i + 1, pid: r.pid, player: r.name ?? `#${r.pid}`, alliance: r.alliance, points: r.xp, level: r.level,
  ...(path === 'warrior' && r.family ? { family: r.family } : {}),
});

/** The three ladders, `limit` rows each. */
export async function ladders(db: D1Database, limit: number = LADDER.top): Promise<Ladders> {
  const out = {} as Ladders;
  for (const p of PATH_IDS) out[p] = (await rowsOf(db, p, limit)).map(toRow(p));
  return out;
}

/** The ladders and the player's own place, on the rows or below them. */
export async function laddersView(db: D1Database, pid: number, limit: number = LADDER.top): Promise<LaddersView> {
  const me = await db
    .prepare('SELECT m.path, f.xp, f.level, f.updated_at AS at FROM war_alliance_members m LEFT JOIN war_favour f ON f.player_id = m.player_id WHERE m.season = ?1 AND m.player_id = ?2')
    .bind(WAR_SEASON.id, pid)
    .first<{ path: PathId | null; xp: number | null; level: number | null; at: number | null }>();
  const view: LaddersView = { ladders: await ladders(db, limit), you: null };
  if (!me?.path) return view;
  if (!me.xp) return { ...view, you: { path: me.path, place: null, points: 0, level: me.level ?? 1 } };
  const above = await db
    .prepare(`SELECT COUNT(*) AS n FROM war_alliance_members m JOIN war_favour f ON f.player_id = m.player_id
      WHERE m.season = ?1 AND m.path = ?2 AND (f.xp > ?3 OR (f.xp = ?3 AND (f.updated_at < ?4 OR (f.updated_at = ?4 AND m.player_id < ?5))))`)
    .bind(WAR_SEASON.id, me.path, me.xp, me.at, pid)
    .first<{ n: number }>();
  return { ...view, you: { path: me.path, place: (above?.n ?? 0) + 1, points: me.xp, level: me.level ?? 1 } };
}

export interface Title { id: string; name: string; pid: number; player: string; alliance: number; home: string | null; value: number }

/** W-166: the titles: first place on each ladder that has anyone on it. */
export async function titles(db: D1Database): Promise<Title[]> {
  const out: Title[] = [];
  for (const p of PATH_IDS) {
    const [r] = await rowsOf(db, p, 1);
    if (r) out.push({ ...TITLE_OF[p], pid: r.pid, player: r.name ?? `#${r.pid}`, alliance: r.alliance, home: r.home, value: r.xp });
  }
  return out;
}
