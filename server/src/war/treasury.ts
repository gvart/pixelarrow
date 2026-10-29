/**
 * Alliance treasury (M5e; docs/WAR.md "Prisoners"): M6e: the alliance strongbox at home (./holders.ts `sb:<clan>`), the
 * coin of the player's clan of this season (clan_members role leader / officer / member). Log:
 * migrations/0025_war_treasury.sql (war_treasury_log).
 *
 *  - Deposit: any member moves coin from his home strongroom into the strongbox.
 *  - Every move is in war_treasury_log (who, how much, when); the treasury view shows the latest. (W-68: ransom is gone.)
 */
import { ApiError } from '../errors';
import { currentSeason, membership, type Membership } from './store';
import { payCoin } from './persons';
import { ensureHolder, goodsOf, strongbox } from './holders';

/** Log rows the treasury view shows. */
export const LOG_SHOWN = 50;

async function memberOf(db: D1Database, pid: number, now: number): Promise<Membership> {
  const m = await membership(db, (await currentSeason(db, now)).id, pid);
  if (!m) throw new ApiError(409, 'no_alliance', 'You are in no alliance');
  return m;
}

export interface Treasury {
  clan: number;
  role: Membership['role'];
  coin: number;
  log: { player: number; kind: 'deposit'; amount: number; person: string | null; at: number }[];
}

export async function treasury(db: D1Database, pid: number, now: number): Promise<Treasury> {
  const m = await memberOf(db, pid, now);
  const [t, log] = await Promise.all([
    goodsOf(db, strongbox(m.clanId)),
    db
      .prepare('SELECT player_id, kind, amount, person_id, at FROM war_treasury_log WHERE clan_id = ?1 ORDER BY at DESC, id DESC LIMIT ?2')
      .bind(m.clanId, LOG_SHOWN)
      .all<{ player_id: number; kind: 'deposit'; amount: number; person_id: string | null; at: number }>(),
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
