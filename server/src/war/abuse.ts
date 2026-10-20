/**
 * Anti-abuse (M6i; docs/WAR.md "Season score and anti-abuse"; migrations/0033_war_abuse.sql).
 *
 *  - Linked accounts: every war API call and socket notes the account's IP (hashed) and device key (X-Device-Id);
 *    two accounts that shared one within ABUSE.linkMs may not hand off, fill each other's offers, deal, contract or
 *    sell letters to each other, nor capture each other's carts (the room gives such a cart back).
 *  - One-sided hand-offs (one half gives nothing): only within an alliance, at most ABUSE.giftCoin a UTC day to a
 *    receiver (valued at last-fill prices, coin 1:1, items at their value), and the receiver's account is
 *    ABUSE.ageMs old and has fought once this season.
 *  - Same-alliance fills score nothing (./tradeScore.ts).
 */
import { itemValue, ITEMS, type Item } from '../../../src/data/items';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { ApiError } from '../errors';
import type { Bundle } from './cargo';
import type { HandoffWindow } from './room';
import { allianceOf } from './world/members';

const DAY = 86_400_000;
export const ABUSE = { linkMs: 7 * DAY, giftCoin: 300, ageMs: 48 * 3_600_000 };

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`war-seen:${s}`));
  return [...new Uint8Array(d).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Note the account's IP and device key (hashed) as seen now. */
export async function noteSeen(db: D1Database, pid: number, ip: string | null, device: string | null, now: number): Promise<void> {
  const keys = [...(ip ? [`ip:${await sha(ip)}`] : []), ...(device ? [`dev:${await sha(device)}`] : [])];
  if (!keys.length) return;
  await db.batch(keys.map((k) => db.prepare('INSERT INTO war_seen (player_id, key, at) VALUES (?1, ?2, ?3) ON CONFLICT (player_id, key) DO UPDATE SET at = MAX(at, ?3)').bind(pid, k, now)));
}

/** From a request: its client IP and device header. */
export const seenOf = (req: Request): { ip: string | null; device: string | null } => ({
  ip: req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip'),
  device: req.headers.get('x-device-id')?.slice(0, 128) ?? null,
});

/** Did the two accounts share an IP or device within ABUSE.linkMs? */
export async function linked(db: D1Database, a: number, b: number, now: number): Promise<boolean> {
  if (a === b) return false;
  const r = await db
    .prepare('SELECT 1 FROM war_seen x JOIN war_seen y ON x.key = y.key WHERE x.player_id = ?1 AND y.player_id = ?2 AND x.at >= ?3 AND y.at >= ?3 LIMIT 1')
    .bind(a, b, now - ABUSE.linkMs)
    .first();
  return !!r;
}

/** Throws when two players may not deal with each other (contracts, deals, letters). */
export async function contractRefusal(db: D1Database, a: number, b: number, now: number): Promise<void> {
  if (await linked(db, a, b, now)) throw new ApiError(409, 'linked', 'These accounts shared an address or device: no trade between them');
}

/** Throws when two players may not fill each other's offers. */
export const tradeRefusal = contractRefusal;

const isEmpty = (h: { goods: Record<string, number>; uids: string[] }) => !h.uids.length && Object.values(h.goods).every((n) => !(n > 0));

/** Value of goods at the last fill price of each (coin 1:1, no fill yet: 1) plus items' values. */
export async function valueOf(db: D1Database, goods: Record<string, number>, items: Item[] = []): Promise<number> {
  let v = 0;
  for (const [res, n] of Object.entries(goods)) {
    if (!(n > 0)) continue;
    const p = res === 'coin' ? 1 : ((await db.prepare('SELECT price FROM war_fills WHERE res = ?1 ORDER BY at DESC LIMIT 1').bind(res).first<{ price: number }>())?.price ?? 1);
    v += n * p;
  }
  for (const it of items) if (ITEMS[it.def]) v += itemValue(it);
  return v;
}

/** Why a ready hand-off window may not swap (null: it may). */
export async function handoffRefusal(db: D1Database, w: HandoffWindow, now: number): Promise<string | null> {
  if (await linked(db, w.a, w.b, now)) return 'linked accounts';
  const ea = isEmpty(w.halves[w.a]), eb = isEmpty(w.halves[w.b]);
  if (ea === eb) return null;
  const giver = ea ? w.b : w.a, receiver = ea ? w.a : w.b, half = w.halves[giver];
  const [ga, ra] = await Promise.all([allianceOf(db, giver), allianceOf(db, receiver)]);
  if (ga === null || ga !== ra) return 'one-sided hand-offs only within an alliance';
  const p = await db.prepare('SELECT created_at FROM players WHERE id = ?1').bind(receiver).first<{ created_at: number }>();
  if (!p || now - p.created_at < ABUSE.ageMs) return 'the receiver\'s account is too new';
  const fought = await db.prepare('SELECT fights FROM war_player_stats WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, receiver).first<{ fights: number }>();
  if (!fought?.fights) return 'the receiver has not fought yet';
  const value = await valueOf(db, half.goods);
  const today = (await db.prepare('SELECT value FROM war_gifts WHERE player_id = ?1 AND day = ?2').bind(receiver, Math.floor(now / DAY)).first<{ value: number }>())?.value ?? 0;
  if (today + value > ABUSE.giftCoin) return `at most ${ABUSE.giftCoin} coin of gifts a day to one player`;
  return null;
}

/** A hand-off swapped: a one-sided one counts against the receiver's daily gifts. */
export async function handoffDone(db: D1Database, w: HandoffWindow, gave: Record<number, Bundle>, now: number): Promise<void> {
  const ea = isEmpty(w.halves[w.a]), eb = isEmpty(w.halves[w.b]);
  if (ea === eb) return;
  const giver = ea ? w.b : w.a, receiver = ea ? w.a : w.b, b = gave[giver];
  const goods: Record<string, number> = {};
  for (const l of b?.lots ?? []) goods[l.r] = (goods[l.r] ?? 0) + l.n;
  const value = await valueOf(db, goods, b?.items ?? []);
  await db.prepare('INSERT INTO war_gifts (player_id, day, value) VALUES (?1, ?2, ?3) ON CONFLICT (player_id, day) DO UPDATE SET value = value + ?3').bind(receiver, Math.floor(now / DAY), value).run();
}

/** Cart captures between linked accounts (the room's `captured`), to be given back. */
export async function linkedCaptures(db: D1Database, caps: readonly { cart: number; from: string; to: string; team: number }[], now: number): Promise<{ cart: number; from: string; to: string; team: number }[]> {
  const out: { cart: number; from: string; to: string; team: number }[] = [];
  const pid = (o: string) => (/^p:\d+$/.test(o) ? Number(o.slice(2)) : null);
  for (const c of caps) {
    const a = pid(c.from), b = pid(c.to);
    if (a !== null && b !== null && (await linked(db, a, b, now))) out.push(c);
  }
  return out;
}
