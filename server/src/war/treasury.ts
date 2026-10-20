/**
 * Alliance treasury (M5e; docs/WAR.md "Prisoners"): a silver pool per alliance, the player's clan of this season
 * (clan_members role leader / officer / member). Tables: migrations/0025_war_treasury.sql.
 *
 *  - Deposit: any member moves silver from his war stock into the pool.
 *  - Ransom: the leader or an officer pays a member's captive's ransom (RANSOM_PER_LEVEL x level) from the pool, to the
 *    captor's player; the man is home and fit, as when his owner pays.
 *  - Every move is in war_treasury_log (who, what, how much, which captive, when); the treasury view shows the latest.
 */
import { ApiError } from '../errors';
import { currentSeason, membership, type Membership } from '../online/store';
import { RANSOM_PER_LEVEL, settle } from './persons';

/** Log rows the treasury view shows. */
export const LOG_SHOWN = 50;
/** Roles that pay from the pool. */
const PAYERS: Membership['role'][] = ['leader', 'officer'];

async function memberOf(db: D1Database, pid: number, now: number): Promise<Membership> {
  const m = await membership(db, (await currentSeason(db, now)).id, pid);
  if (!m) throw new ApiError(409, 'no_alliance', 'You are in no alliance');
  return m;
}

export interface Treasury {
  clan: number;
  role: Membership['role'];
  silver: number;
  log: { player: number; kind: 'deposit' | 'ransom'; amount: number; person: string | null; at: number }[];
}

export async function treasury(db: D1Database, pid: number, now: number): Promise<Treasury> {
  const m = await memberOf(db, pid, now);
  const [t, log] = await Promise.all([
    db.prepare('SELECT silver FROM war_treasury WHERE clan_id = ?1').bind(m.clanId).first<{ silver: number }>(),
    db
      .prepare('SELECT player_id, kind, amount, person_id, at FROM war_treasury_log WHERE clan_id = ?1 ORDER BY at DESC, id DESC LIMIT ?2')
      .bind(m.clanId, LOG_SHOWN)
      .all<{ player_id: number; kind: 'deposit' | 'ransom'; amount: number; person_id: string | null; at: number }>(),
  ]);
  return {
    clan: m.clanId, role: m.role, silver: t?.silver ?? 0,
    log: log.results.map((r) => ({ player: r.player_id, kind: r.kind, amount: r.amount, person: r.person_id, at: r.at })),
  };
}

/** A member puts `amount` silver of his war stock into his alliance's pool. Returns the pool's silver after. */
export async function deposit(db: D1Database, pid: number, amount: number, now: number): Promise<number> {
  const m = await memberOf(db, pid, now);
  const paid = await db.prepare("UPDATE war_stock SET amount = amount - ?2 WHERE player_id = ?1 AND res = 'silver' AND amount >= ?2").bind(pid, amount).run();
  if (!paid.meta.changes) throw new ApiError(409, 'no_silver', `You have less than ${amount} silver`);
  await db.batch([
    db.prepare('INSERT INTO war_treasury (clan_id, silver) VALUES (?1, ?2) ON CONFLICT (clan_id) DO UPDATE SET silver = silver + ?2').bind(m.clanId, amount),
    db.prepare("INSERT INTO war_treasury_log (clan_id, player_id, kind, amount, at) VALUES (?1, ?2, 'deposit', ?3, ?4)").bind(m.clanId, pid, amount, now),
  ]);
  return (await db.prepare('SELECT silver FROM war_treasury WHERE clan_id = ?1').bind(m.clanId).first<{ silver: number }>())?.silver ?? 0;
}

/**
 * The leader or an officer pays the ransom of captive `id` (a soldier of a member of his alliance) from the pool: the
 * silver goes to the captor's player, the man is home and fit. Returns the price.
 */
export async function payRansomFromTreasury(db: D1Database, pid: number, id: string, now: number): Promise<number> {
  const m = await memberOf(db, pid, now);
  if (!PAYERS.includes(m.role)) throw new ApiError(403, 'not_officer', 'Only the leader and officers pay from the treasury');
  const owner = (await db.prepare('SELECT player_id FROM war_persons WHERE id = ?1').bind(id).first<{ player_id: number }>())?.player_id;
  if (owner === undefined) throw new ApiError(404, 'not_found', 'No such soldier');
  await settle(db, owner, now); // his 24 h may be up
  const r = await db.prepare('SELECT player_id, level, state, captor_pid FROM war_persons WHERE id = ?1').bind(id).first<{ player_id: number; level: number; state: string; captor_pid: number | null }>();
  if (!r) throw new ApiError(404, 'not_found', 'No such soldier');
  if ((await membership(db, (await currentSeason(db, now)).id, r.player_id))?.clanId !== m.clanId) throw new ApiError(403, 'not_member', 'He serves no member of your alliance');
  if (r.state !== 'captive') throw new ApiError(409, 'not_captive', `He is ${r.state}`);
  const price = RANSOM_PER_LEVEL * r.level;
  const paid = await db.prepare('UPDATE war_treasury SET silver = silver - ?2 WHERE clan_id = ?1 AND silver >= ?2').bind(m.clanId, price).run();
  if (!paid.meta.changes) throw new ApiError(409, 'no_silver', `His ransom is ${price} silver`);
  await db.batch([
    db
      .prepare("UPDATE war_persons SET state = 'reserve', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?2 WHERE id = ?1")
      .bind(id, now),
    ...(r.captor_pid !== null
      ? [db.prepare("INSERT INTO war_stock (player_id, res, amount) VALUES (?1, 'silver', ?2) ON CONFLICT (player_id, res) DO UPDATE SET amount = amount + ?2").bind(r.captor_pid, price)]
      : []),
    db.prepare("INSERT INTO war_treasury_log (clan_id, player_id, kind, amount, person_id, at) VALUES (?1, ?2, 'ransom', ?3, ?4, ?5)").bind(m.clanId, pid, price, id, now),
  ]);
  return price;
}
