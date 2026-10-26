/**
 * Alliance treasury (M5e; docs/WAR.md "Prisoners"): M6e: the alliance strongbox at home (./holders.ts `sb:<clan>`), the
 * coin of the player's clan of this season (clan_members role leader / officer / member). Log:
 * migrations/0025_war_treasury.sql (war_treasury_log).
 *
 *  - Deposit: any member moves coin from his home strongroom into the strongbox.
 *  - Ransom: the leader or an officer pays a member's captive's ransom (RANSOM_PER_LEVEL x level) from the pool, to the
 *    captor's player; the man is home and fit, as when his owner pays.
 *  - Every move is in war_treasury_log (who, what, how much, which captive, when); the treasury view shows the latest.
 */
import { ApiError } from '../errors';
import { currentSeason, membership, type Membership } from './store';
import { credit, payCoin, RANSOM_PER_LEVEL, settle } from './persons';
import { ensureHolder, goodsOf, pay, strongbox } from './holders';

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
  coin: number;
  log: { player: number; kind: 'deposit' | 'ransom'; amount: number; person: string | null; at: number }[];
}

export async function treasury(db: D1Database, pid: number, now: number): Promise<Treasury> {
  const m = await memberOf(db, pid, now);
  const [t, log] = await Promise.all([
    goodsOf(db, strongbox(m.clanId)),
    db
      .prepare('SELECT player_id, kind, amount, person_id, at FROM war_treasury_log WHERE clan_id = ?1 ORDER BY at DESC, id DESC LIMIT ?2')
      .bind(m.clanId, LOG_SHOWN)
      .all<{ player_id: number; kind: 'deposit' | 'ransom'; amount: number; person_id: string | null; at: number }>(),
  ]);
  return {
    clan: m.clanId, role: m.role, coin: t.coin ?? 0,
    log: log.results.map((r) => ({ player: r.player_id, kind: r.kind, amount: r.amount, person: r.person_id, at: r.at })),
  };
}

/** A member puts `amount` coin of his home strongroom into his alliance's strongbox. Returns the strongbox's coin after. */
export async function deposit(db: D1Database, pid: number, amount: number, now: number): Promise<number> {
  const m = await memberOf(db, pid, now);
  const ok = await payCoin(db, pid, amount, [
    ensureHolder(db, strongbox(m.clanId), 'strongbox', { clan: m.clanId }, now),
    db.prepare("INSERT INTO war_goods (place, res, origin, seal, amount) VALUES (?1, 'coin', 'home', 0, ?2) ON CONFLICT (place, res, origin, seal) DO UPDATE SET amount = amount + ?2").bind(strongbox(m.clanId), amount),
    db.prepare("INSERT INTO war_treasury_log (clan_id, player_id, kind, amount, at) VALUES (?1, ?2, 'deposit', ?3, ?4)").bind(m.clanId, pid, amount, now),
  ]);
  if (!ok) throw new ApiError(409, 'no_coin', `You have less than ${amount} coin`);
  return (await goodsOf(db, strongbox(m.clanId))).coin ?? 0;
}

/**
 * The leader or an officer pays the ransom of captive `id` (a soldier of a member of his alliance) from the pool: the
 * coin goes to the captor's strongroom, the man is home and fit. Returns the price.
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
  await pay(db, strongbox(m.clanId), { coin: price }, [
    db
      .prepare("UPDATE war_persons SET state = 'active', until_at = NULL, captor = NULL, captor_pid = NULL, held_at = NULL, held_fort = NULL, updated_at = ?2 WHERE id = ?1")
      .bind(id, now),
    ...(r.captor_pid !== null ? [credit(db, r.captor_pid, price)] : []),
    db.prepare("INSERT INTO war_treasury_log (clan_id, player_id, kind, amount, person_id, at) VALUES (?1, ?2, 'ransom', ?3, ?4, ?5)").bind(m.clanId, pid, price, id, now),
  ], 'The treasury').catch((e) => {
    if (e instanceof ApiError && e.code === 'no_coin') throw new ApiError(409, 'no_coin', `His ransom is ${price} coin`);
    throw e;
  });
  return price;
}
