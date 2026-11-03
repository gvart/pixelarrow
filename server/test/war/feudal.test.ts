/**
 * W-150..W-155 the feudal chain (server/src/war/oaths.ts, ./crown.ts, ./regionDO.ts stowTribute): swearing inside one
 * alliance, election weight, heir, no confidence, the 72-hour lapse, tribute collected in person with coin conserved, the
 * oath break and its bar, cross-alliance refused, and a season reset clearing it all.
 */
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { FEUDAL } from '../../../src/data/warFeudal';
import { CROWN, voteWeight } from '../../../src/war/net/crown';
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import { api, BASE, devLogin } from '../helpers';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';
import { SIM_VERSION } from '../../../src/sim/version';
import { abdicate, advance, confidence, crownView, membersOf, nameHeir, sign, vote } from '../../src/war/crown';
import { callGuard, takeContract } from '../../src/war/contracts';
import { goodsOf, putStmt } from '../../src/war/holders';
import { stallId } from '../../src/war/market';
import { answerOath, barUntil, breakOath, liegeOf, oathOf, owedBy, rateOf, saleTribute, setRate, swear, sworn, syncTies, tributePlace } from '../../src/war/oaths';
import { householdOf } from '../../src/war/roomSettlements';
import { SEASON_WIPE, seasonWipe } from '../../src/war/seasonWipe';
import { joinAlliance } from '../../src/war/world/members';
import type { WarRegionDO } from '../../src/war/regionDO';
import type { WarRoom } from '../../src/war/room';
import { regionStub } from '../../src/war/placement';
import { warRegion } from '../../src/war/regions';

const DB = () => env.DB!;
const H = 3_600_000;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
let tg = 74_000, piece = 500, seasonN = 740;
const fresh = () => ++seasonN;
async function member(a: number, season: number, now = Date.now()) {
  const p = await devLogin(++tg);
  await joinAlliance(DB(), p.playerId, a as never, now, season);
  return p.playerId;
}
/** He rules a settlement: a lord. */
async function lordOf(pid: number, level = 1): Promise<number> {
  const id = (await DB()
    .prepare("INSERT INTO war_settlements (region, centre_piece, x, y, r, name, lord_pid, level, founded_season, tended_at, levied_at) VALUES ('kyrene', ?1, 10, 10, 24, 'S', ?2, ?3, 1, 0, 0) RETURNING id")
    .bind(piece++, pid, level)
    .first<{ id: number }>())!.id;
  await DB().prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, since) VALUES (?1, ?2, 'lord', 0)").bind(id, pid).run();
  return id;
}
const oathed = async (v: number, l: number, now: number, season: number) => {
  await swear(DB(), v, l, now, season);
  expect(await answerOath(DB(), l, v, true, now, season)).toBe('sworn');
};
/** Seen now: the king is not lapsing while a test moves time on. */
const seen = (pid: number, at: number) => DB().prepare('UPDATE players SET last_seen_at = ?2 WHERE id = ?1').bind(pid, at).run();
const electionOf = (season: number, a: number) => DB().prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'election' AND state = 'open'").bind(season, a).first<{ closes_at: number }>();
/** A king crowned by an empty election (the strongest). */
async function crowned(season: number, a: number) {
  const now = Date.now(), king = await member(a, season), b = await member(a, season), c = await member(a, season);
  await lordOf(king, 5), await lordOf(b, 2), await lordOf(c, 1);
  await advance(env, a, now, season);
  const t = (await electionOf(season, a))!.closes_at;
  for (const p of [king, b, c]) await seen(p, t);
  await advance(env, a, t, season);
  return { king, b, c, now: t };
}
const allCoin = async () => (await DB().prepare("SELECT SUM(amount) AS n FROM war_goods WHERE res = 'coin'").first<{ n: number }>())!.n ?? 0;

describe('W-150 the chain', () => {
  it('a full chain: vassal to lord, lord to king; the ranks, and the settlements fly the oath', async () => {
    const S = fresh(), a = 0;
    const { king, b: lord, now } = await crowned(S, a);
    const vassal = await member(a, S), seat = (await DB().prepare('SELECT id FROM war_settlements WHERE lord_pid = ?1').bind(king).first<{ id: number }>())!.id;
    await oathed(vassal, lord, now, S);
    await oathed(lord, king, now, S);
    const v = await crownView(env, vassal, now, S), l = await crownView(env, lord, now, S), k = await crownView(env, king, now, S);
    expect(v.feudal).toMatchObject({ rank: 'vassal', lord: { pid: lord, rank: 'lord', rate: FEUDAL.rateDefault }, rate: null });
    expect(l.feudal).toMatchObject({ rank: 'lord', lord: { pid: king, rank: 'king' }, vassals: [{ pid: vassal, rank: 'vassal' }] });
    expect(k.feudal).toMatchObject({ rank: 'king', lord: null, vassals: [{ pid: lord, rank: 'lord' }] });
    const row = await DB().prepare('SELECT overlord_id, tribute_pct FROM war_settlements WHERE lord_pid = ?1').bind(lord).first<{ overlord_id: number; tribute_pct: number }>();
    expect(row).toEqual({ overlord_id: seat, tribute_pct: FEUDAL.rateDefault });
  });

  it('enforced: one oath; to a lord or the king; a lord only to the king; no cycles; the king to nobody; the lord answers', async () => {
    const S = fresh(), a = 1;
    const { king, b: l1, c: l2, now } = await crowned(S, a);
    const free = await member(a, S), other = await member(a, S);
    expect(await code(swear(DB(), free, other, now, S))).toBe('not_lord');
    expect(await code(swear(DB(), free, free, now, S))).toBe('bad_request');
    expect(await code(swear(DB(), l1, l2, now, S))).toBe('lords_to_king');
    expect(await code(swear(DB(), king, l1, now, S))).toBe('king');
    await swear(DB(), free, l1, now, S);
    expect(await liegeOf(DB(), free, S)).toBeNull(); // a request is no oath
    expect(await code(answerOath(DB(), l2, free, true, now, S))).toBe('not_party');
    expect(await answerOath(DB(), l1, free, false, now, S)).toBe('refused');
    await oathed(free, l1, now, S);
    expect(await code(swear(DB(), free, l2, now, S))).toBe('sworn');
    // a request lapses unanswered
    await swear(DB(), other, l1, now, S);
    expect(await code(answerOath(DB(), l1, other, true, now + FEUDAL.askMs, S))).toBe('closed');
    // the liege is no vassal's vassal: a vassal who founds a settlement cannot take his own lord (he swears to the king only)
    await lordOf(free);
    expect(await code(swear(DB(), l1, free, now, S))).toBe('lords_to_king');
    // whoever founds while sworn keeps the oath, and the settlement follows
    await syncTies(DB(), free, S);
    expect((await crownView(env, free, now, S)).feudal).toMatchObject({ rank: 'lord', lord: { pid: l1 } });
  });

  it('cross-alliance is refused: W-63\'s vassals across alliances are gone', async () => {
    const S = fresh();
    const { b: lord, now } = await crowned(S, 2);
    const foreign = await member(3, S);
    expect(await code(swear(DB(), foreign, lord, now, S))).toBe('not_ally');
    expect(await oathOf(DB(), foreign, S)).toBeNull();
  });

  it('household: those sworn directly to the owner, one way, one step', async () => {
    const S = fresh(), a = 3;
    const { king, b: lord, now } = await crowned(S, a);
    const vassal = await member(a, S);
    await oathed(vassal, lord, now, S);
    await oathed(lord, king, now, S);
    const ties = householdOf([], await sworn(DB(), S));
    expect(ties(`p:${lord}`, `p:${vassal}`)).toBe(true);
    expect(ties(`p:${king}`, `p:${lord}`)).toBe(true);
    expect(ties(`p:${vassal}`, `p:${lord}`)).toBe(false); // no reach upwards
    expect(ties(`p:${king}`, `p:${vassal}`)).toBe(false); // not two steps down
  });

  it('a call to guard is a contract with no fee, for those sworn to him, and nobody must answer', async () => {
    const S = WAR_SEASON.id, a = 0, now = Date.now();
    const lord = await member(a, S), vassal = await member(a, S), ally = await member(a, S);
    await lordOf(lord);
    expect(await code(callGuard(DB(), lord, 'kyrene', 2, 2, now))).toBe('no_vassals');
    await oathed(vassal, lord, now, S);
    const id = await callGuard(DB(), lord, 'kyrene', 2, 2, now);
    expect((await crownView(env, vassal, now, S)).feudal.calls).toEqual([expect.objectContaining({ id, region: 'kyrene', men: 2, hours: 2, taken: false })]);
    expect(await code(takeContract(DB(), ally, id, now))).toBe('not_sworn');
    await takeContract(DB(), vassal, id, now);
    expect((await crownView(env, vassal, now, S)).feudal.calls[0].taken).toBe(true);
    expect((await DB().prepare('SELECT reward, kind FROM war_contracts WHERE id = ?1').bind(id).first())).toEqual({ reward: 0, kind: 'guard' });
  });
});

describe('W-151 election by lord weight', () => {
  it('only lords vote; each weighs his vassals plus one', async () => {
    const S = fresh(), a = 1, now = Date.now();
    const big = await member(a, S), small = await member(a, S), v1 = await member(a, S), v2 = await member(a, S);
    await lordOf(big, 1), await lordOf(small, 5);
    await advance(env, a, now, S);
    await oathed(v1, small, now, S);
    await oathed(v2, small, now, S);
    expect(voteWeight(true, 2)).toBe(3);
    expect(voteWeight(false, 9)).toBe(0);
    const ms = await membersOf(DB(), a, S);
    expect(ms.find((m) => m.pid === small)).toMatchObject({ weight: 3, vassals: 2, lord: true });
    expect(ms.find((m) => m.pid === v1)).toMatchObject({ weight: 0, lord: false });
    expect(await code(vote(env, v1, big, now, S))).toBe('not_lord');
    await vote(env, big, big, now, S);
    await vote(env, small, small, now, S);
    const e = (await crownView(env, big, now, S)).election!;
    expect(e.candidates.find((c) => c.pid === small)!.votes).toBe(3);
    expect(e.candidates.find((c) => c.pid === big)!.votes).toBe(1);
    await seen(small, e.closes);
    expect((await crownView(env, small, e.closes, S)).monarch!.pid).toBe(small);
  });
});

describe('W-152 succession', () => {
  it('a vacant crown holds an election', async () => {
    const S = fresh(), a = 2, now = Date.now(), p = await member(a, S);
    await lordOf(p);
    expect((await crownView(env, p, now, S)).election).not.toBeNull();
  });

  it('abdication: the heir rules at once, no election; no heir: an election', async () => {
    const S = fresh(), a = 0;
    const { king, b, c, now } = await crowned(S, a);
    expect(await code(nameHeir(env, b, c, now, S))).toBe('not_office');
    const out = await member(1, S);
    expect(await code(nameHeir(env, king, out, now, S))).toBe('not_member');
    await nameHeir(env, king, b, now, S);
    expect((await crownView(env, c, now, S)).feudal.heir?.pid).toBe(b);
    expect(await abdicate(env, king, now, S)).toBe(b);
    let v = await crownView(env, c, now, S);
    expect(v.monarch!.pid).toBe(b);
    expect(v.election).toBeNull();
    expect(v.feudal.heir).toBeNull();
    expect(v.log.some((l) => l.kind === 'abdicated')).toBe(true);
    await seen(b, now);
    expect(await abdicate(env, b, now, S)).toBeNull();
    v = await crownView(env, c, now, S);
    expect(v.monarch).toBeNull();
    expect(v.election).not.toBeNull();
  });

  it('no confidence: a majority of all lord weight, cast or not; the heir rules until the election ends', async () => {
    const S = fresh(), a = 3;
    const { king, b, c, now } = await crowned(S, a);
    const d = await member(a, S), e = await member(a, S);
    await lordOf(d), await lordOf(e);
    await nameHeir(env, king, c, now, S);
    const plain = await member(a, S);
    expect(await code(sign(env, plain, now, S))).toBe('not_lord');
    await sign(env, b, now, S);
    await sign(env, d, now, S);
    expect(await code(confidence(env, plain, true, now, S))).toBe('not_lord');
    // 5 lords, weight 5: two yes against none is no majority of all of it: he stays
    await confidence(env, b, true, now, S);
    await confidence(env, d, true, now, S);
    const t1 = now + CROWN.voteMs;
    await seen(king, t1);
    expect((await crownView(env, king, t1, S)).monarch!.pid).toBe(king);
    // later, with three yes: he falls; the heir rules while the realm votes
    const later = t1 + CROWN.cooldownMs + H;
    await seen(king, later);
    await sign(env, b, later, S);
    await sign(env, d, later, S);
    for (const p of [b, d, e]) await confidence(env, p, true, later, S);
    const t2 = later + CROWN.voteMs;
    await seen(c, t2);
    const v = await crownView(env, b, t2, S);
    expect(v.monarch!.pid).toBe(c);
    expect(v.regent).toBe(true);
    expect(v.election).not.toBeNull();
    expect(v.log.some((l) => l.kind === 'deposed')).toBe(true);
  });

  it('72 hours unseen: the crown goes to election, the heir rules until it closes; no heir: it stands empty', async () => {
    const S = fresh(), a = 1;
    const { king, b, c, now } = await crowned(S, a);
    await nameHeir(env, king, b, now, S);
    await seen(king, now);
    expect((await crownView(env, c, now + FEUDAL.inactiveMs - 1, S)).monarch!.pid).toBe(king);
    const t = now + FEUDAL.inactiveMs;
    for (const p of [b, c]) await seen(p, t);
    const v = await crownView(env, c, t, S);
    expect(v.monarch!.pid).toBe(b);
    expect(v.regent).toBe(true);
    expect(v.log.some((l) => l.kind === 'lapsed')).toBe(true);
    // and the election's winner takes it from him
    await vote(env, c, c, t, S);
    await vote(env, b, c, t, S);
    const closes = v.election!.closes;
    await seen(c, closes);
    expect((await crownView(env, c, closes, S)).monarch!.pid).toBe(c);
    // no heir this time
    const S2 = fresh(), k2 = await crowned(S2, 2), t2 = k2.now + FEUDAL.inactiveMs;
    await seen(k2.king, k2.now);
    await seen(k2.b, t2);
    const w = await crownView(env, k2.b, t2, S2);
    expect(w.monarch).toBeNull();
    expect(w.election).not.toBeNull();
  });

  it('an absent winner gets his full 72 hours from the moment he takes the crown', async () => {
    const S = fresh(), a = 2, now = Date.now(), winner = await member(a, S);
    await lordOf(winner);
    await advance(env, a, now, S);
    const closes = (await electionOf(S, a))!.closes_at;
    await seen(winner, closes - FEUDAL.inactiveMs - H); // long gone before the vote closed
    expect((await crownView(env, winner, closes, S)).monarch?.pid).toBe(winner);
    expect((await crownView(env, winner, closes + FEUDAL.inactiveMs - 1, S)).monarch?.pid).toBe(winner);
    const v = await crownView(env, winner, closes + FEUDAL.inactiveMs, S);
    expect(v.monarch).toBeNull();
    expect(v.log.some((l) => l.kind === 'lapsed')).toBe(true);
  });

  it('a crown that passes frees the lords sworn to the old king; his plain vassals stay his; the new king swears to nobody', async () => {
    const S = fresh(), a = 0;
    const { king, b, c, now } = await crowned(S, a);
    const plain = await member(a, S);
    await oathed(b, king, now, S);
    await oathed(c, king, now, S);
    await oathed(plain, king, now, S);
    await nameHeir(env, king, c, now, S);
    await abdicate(env, king, now, S);
    expect(await liegeOf(DB(), b, S)).toBeNull();
    expect(await liegeOf(DB(), c, S)).toBeNull();
    expect(await liegeOf(DB(), plain, S)).toBe(king);
    expect(await barUntil(DB(), a, b, S)).toBe(0); // no mark: he broke nothing
  });
});

describe('W-200..W-202 a king rules until deposed', () => {
  const crownedLog = async (S: number, a: number, kinds: string) => (await DB().prepare(`SELECT kind FROM war_crown_log WHERE season = ?1 AND alliance = ?2 AND kind IN (${kinds})`).bind(S, a).all()).results.length;

  it('he stays past a week, and past two: no election opens, no regency, nothing lapses while he plays', async () => {
    const S = fresh(), a = 2;
    const { king, b, now } = await crowned(S, a);
    const elections = await crownedLog(S, a, "'election'");
    for (let t = now + 48 * H; t <= now + 14 * 24 * H; t += 48 * H) {
      await seen(king, t);
      const v = await crownView(env, b, t, S);
      expect(v.monarch!.pid).toBe(king);
      expect(v.election).toBeNull();
      expect(v.regent).toBe(false);
    }
    expect(await crownedLog(S, a, "'election'")).toBe(elections);
  });

  it('abdicating hands on with no election: the heir simply reigns', async () => {
    const S = fresh(), a = 2;
    const { king, b, c, now } = await crowned(S, a);
    await nameHeir(env, king, b, now, S);
    expect(await abdicate(env, king, now, S)).toBe(b);
    const v = await crownView(env, c, now, S);
    expect(v.monarch!.pid).toBe(b);
    expect(v.election).toBeNull();
    expect(v.regent).toBe(false);
  });

  it('his sworn men prop him up until they rebel: lords fail while sworn, break their oaths and depose him; he may not stand', async () => {
    const S = fresh(), a = 3;
    const { king, b, c, now } = await crowned(S, a);
    const d = await member(a, S), man = await member(a, S);
    await lordOf(d);
    await oathed(b, king, now, S);
    await oathed(c, king, now, S);
    await oathed(man, king, now, S);
    // king 1 + 3 sworn, b, c, d 1 each: 7. Three yes is no majority: he holds
    expect((await membersOf(DB(), a, S)).find((m) => m.pid === king)!.weight).toBe(4);
    await sign(env, d, now, S);
    for (const p of [b, c, d]) await confidence(env, p, true, now, S);
    const held = now + CROWN.voteMs;
    await seen(king, held);
    expect((await crownView(env, d, held, S)).monarch!.pid).toBe(king);
    // the rebels break their oaths (named on the roll, as ever): king 2, b, c, d 1 each: 5, and three yes carries it
    const later = held + CROWN.cooldownMs;
    for (const p of [king, b, c, d, man]) await seen(p, later);
    await breakOath(DB(), b, later, S);
    await breakOath(DB(), c, later, S);
    await sign(env, d, later, S);
    for (const p of [b, c, d]) await confidence(env, p, true, later, S);
    await confidence(env, king, false, later, S);
    const t = later + CROWN.voteMs;
    for (const p of [king, b, c, d]) await seen(p, t);
    const v = await crownView(env, b, t, S);
    expect(v.log.some((l) => l.kind === 'deposed')).toBe(true);
    expect(v.monarch).toBeNull();
    expect(v.election!.candidates.map((k) => k.pid)).not.toContain(king); // W-202
    // nobody votes: the strongest of those who stand takes it, not the fallen king
    const u = await crownView(env, king, v.election!.closes, S);
    expect(u.monarch!.pid).toBe(b);
    expect(u.me.monarch).toBe(false);
  });

  it('a king who stops playing is replaced: unseen 72 h the crown goes, and he cannot win it back by standing absent', async () => {
    const S = fresh(), a = 1;
    const { king, b, c, now } = await crowned(S, a); // the king is the strongest by far: he would win an empty vote
    await seen(king, now);
    const t = now + FEUDAL.inactiveMs;
    for (const p of [b, c]) await seen(p, t);
    const v = await crownView(env, b, t, S);
    expect(v.monarch).toBeNull();
    expect(v.election!.candidates.map((k) => k.pid)).toEqual([b, c]); // W-202
    const closes = v.election!.closes;
    await seen(b, closes);
    expect((await crownView(env, c, closes, S)).monarch!.pid).toBe(b); // nobody voted: still not him
    // the bar is that one election: back and playing, he may stand again at the next
    await seen(king, closes);
    await seen(b, closes);
    await abdicate(env, b, closes, S);
    expect((await crownView(env, king, closes, S)).election!.candidates.map((k) => k.pid)).toContain(king);
  });

  it('a lone lord alone stands even so: a bar never leaves a realm with no one to crown', async () => {
    const S = fresh(), a = 0, now = Date.now(), lone = await member(a, S);
    await lordOf(lone);
    await advance(env, a, now, S);
    const closes = (await electionOf(S, a))!.closes_at;
    await seen(lone, closes);
    expect((await crownView(env, lone, closes, S)).monarch!.pid).toBe(lone);
    const t = closes + FEUDAL.inactiveMs;
    await seen(lone, closes);
    const v = await crownView(env, lone, t, S);
    expect(v.monarch).toBeNull();
    expect(v.election!.candidates.map((k) => k.pid)).toEqual([lone]);
  });

  it('a king who only looks in cannot lock it: absent lords and men do not count, so those still playing can depose him', async () => {
    const S = fresh(), a = 2;
    const { king, b, c, now } = await crowned(S, a);
    const gone = [await member(a, S), await member(a, S), await member(a, S)], men = [await member(a, S), await member(a, S), await member(a, S)];
    for (const g of gone) await lordOf(g);
    for (const m of men) await oathed(m, king, now, S);
    // eight days on: the three lords and the king's three men have not played for a week; he looks in every other day
    const t0 = now + CROWN.activeMs + 24 * H;
    for (const p of [king, b, c]) await seen(p, t0);
    await sign(env, b, t0, S);
    await confidence(env, b, true, t0, S);
    await confidence(env, c, true, t0, S);
    const t = t0 + CROWN.voteMs;
    for (const p of [king, b, c]) await seen(p, t);
    // all weight: king 4 + 2 + 3 = 9, two yes fails. Active: king 1 + b + c = 3, two yes carries it
    const v = await crownView(env, b, t, S);
    expect(v.log.some((l) => l.kind === 'deposed')).toBe(true);
    expect(v.monarch).toBeNull();
  });
});

describe('W-153 tribute on sales', () => {
  it('sits at the stall, the rate is the lord\'s (0 to 20), both sides see it, and no coin is made or lost', async () => {
    const S = WAR_SEASON.id, a = 2, now = Date.now(), town = ALLIANCES[a].home;
    const lord = await member(a, S), seller = await member(a, S);
    await lordOf(lord);
    await oathed(seller, lord, now, S);
    expect(await rateOf(DB(), lord, S)).toBe(FEUDAL.rateDefault);
    expect(await code(setRate(DB(), seller, 5, now, S))).toBe('not_lord');
    expect(await code(setRate(DB(), lord, FEUDAL.rateMax + 1, now, S))).toBe('bad_request');
    await setRate(DB(), lord, FEUDAL.rateMax, now, S);
    const stall = stallId(town, seller);
    await DB().batch([putStmt(DB(), stall, 'coin', 100)]);
    const before = await allCoin();
    await DB().batch(await saleTribute(DB(), seller, 100, town, S));
    expect((await goodsOf(DB(), stall)).coin).toBe(80);
    expect((await goodsOf(DB(), tributePlace(town, seller))).coin).toBe(20);
    expect((await goodsOf(DB(), `sr:${lord}`)).coin ?? 0).toBe(0); // nothing teleports
    expect(await allCoin()).toBeCloseTo(before);
    const own = await owedBy(DB(), seller);
    expect(own).toEqual([{ region: town, what: 'stall', goods: { coin: 20 } }]);
    expect((await crownView(env, seller, now, S)).feudal.owed).toEqual(own);
    expect((await crownView(env, lord, now, S)).feudal.vassals[0].owed).toEqual(own);
    // the base stops at a lord's own income: what he collects is not taxed again
    expect(await saleTribute(DB(), lord, 100, town, S)).toEqual([]);
  });

  it('a building\'s report reaches both sides; breaking the oath brings a stall\'s part back', async () => {
    const S = WAR_SEASON.id, a = 3, now = Date.now(), town = ALLIANCES[a].home;
    const lord = await member(a, S), v = await member(a, S);
    await lordOf(lord);
    await oathed(v, lord, now, S);
    await DB().batch([
      putStmt(DB(), stallId(town, v), 'coin', 50),
      putStmt(DB(), tributePlace(town, v), 'coin', 5),
      DB().prepare("INSERT INTO war_tribute_held (region, building, type, payer_pid, receiver_pid, goods) VALUES ('kyrene', 7, 'forge', ?1, ?2, '{\"iron\":3}')").bind(v, lord),
    ]);
    expect((await crownView(env, lord, now, S)).feudal.vassals[0].owed).toEqual(expect.arrayContaining([{ region: 'kyrene', what: 'forge', goods: { iron: 3 } }]));
    const before = await allCoin();
    await breakOath(DB(), v, now, S);
    expect((await goodsOf(DB(), stallId(town, v))).coin).toBe(55);
    expect((await goodsOf(DB(), tributePlace(town, v))).coin ?? 0).toBe(0);
    expect(await allCoin()).toBeCloseTo(before);
  });
});

describe('W-153 collected in person', () => {
  const T = 'kleisoura';
  const stub = (region: string) => regionStub(env, region);
  const answer = (m: ServerMsg) => m.t === 'stowed' || m.t === 'error';
  async function connect(token: string, region: string) {
    const res = await SELF.fetch(`${BASE}/ws/war/${region}?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const msgs: ServerMsg[] = [];
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') msgs.push(JSON.parse(e.data) as ServerMsg);
    });
    const next = async (pred: (m: ServerMsg) => boolean, ms = 20_000) => {
      for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 20))) {
        const i = msgs.findIndex(pred);
        if (i >= 0) return msgs.splice(i, 1)[0];
      }
      throw new Error(`timeout: ${JSON.stringify(msgs.map((m) => m.t))}`);
    };
    return { send: (m: unknown) => ws.send(JSON.stringify(m)), next };
  }
  /** Skythia's man with his squad carried to the market town and standing in its court. */
  async function inCourt(tgId: number) {
    const p = await devLogin(tgId);
    expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: p.token, json: { alliance: 1 } })).status).toBe(200);
    expect((await api('/api/war/dev/seed', { method: 'POST', token: p.token, json: {} })).status).toBe(200);
    const ros = await (await api('/api/war/roster', { token: p.token })).json<{ persons: { id: string; state: string; region: string | null }[] }>();
    const ids = ros.persons.filter((x) => x.state === 'active' && !x.region).map((x) => x.id);
    const home = await connect(p.token, 'skythia');
    home.send({ t: 'join', v: NET_VERSION, region: 'skythia', playerId: p.playerId, team: 1, squads: [ids] });
    expect((await home.next((m) => m.t === 'welcome' || m.t === 'refused')).t).toBe('welcome');
    const out = await stub('skythia').depart('skythia', p.playerId, 'W', T, 20);
    if ('error' in out) throw new Error(`depart: ${out.error}`);
    await stub(T).arrive(T, p.playerId, 1, out.ids, 'E', {}, out.cargo);
    const k = await connect(p.token, T);
    k.send({ t: 'join', v: NET_VERSION, region: T, playerId: p.playerId, team: 1, squads: [out.ids] });
    const w = (await k.next((m) => m.t === 'welcome' || m.t === 'refused')) as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w.t).toBe('welcome');
    const squad = w.squads[0], ct = warRegion(T)!.safe![0];
    k.send({ t: 'order', o: { kind: 'move', squad, x: Math.round(ct.x + ct.w / 2), y: Math.round(ct.y + ct.h / 2) } });
    return { pid: p.playerId, token: p.token, k, squad };
  }
  /** Coin on his men's backs in that room. */
  const packed = (pid: number, squad: number) =>
    runInDurableObject(stub(T), async (o: WarRegionDO) => {
      const room = await (o as unknown as { ensure(r: string): Promise<WarRoom> }).ensure(T);
      const lots = room.carrier(pid, { squad })!.slots.flatMap((s) => s.hold.lots);
      return { coin: lots.filter((l) => l.r === 'coin').reduce((t, l) => t + l.n, 0), seal: lots.find((l) => l.r === 'coin')?.s ?? 0 };
    });
  /** Stow, skipping time until the squad has reached the court. */
  async function stow(who: { k: Awaited<ReturnType<typeof connect>>; squad: number }, m: Record<string, unknown>) {
    for (let i = 0; i < 30; i++) {
      who.k.send({ t: 'stow', dir: 'out', site: 'tribute', squad: who.squad, ...m });
      const r = (await who.k.next(answer)) as { t: string; detail?: string };
      if (!/not_in_court/.test(r.detail ?? '')) return r;
      who.k.send({ t: 'dev', op: 'skip', ticks: 200 });
    }
    throw new Error('never reached the court');
  }

  it('the liege\'s men carry it off as his; the payer\'s carry it sealed; a stranger\'s get nothing; no coin is made or lost', async () => {
    const S = WAR_SEASON.id, now = Date.now();
    const lord = await inCourt(++tg), v = await inCourt(++tg), stranger = await inCourt(++tg);
    await lordOf(lord.pid);
    await oathed(v.pid, lord.pid, now, S);
    await DB().batch([putStmt(DB(), tributePlace(T, v.pid), 'coin', 30)]);
    const before = await allCoin();

    expect(await stow(stranger, { of: v.pid, goods: { coin: 5 } })).toMatchObject({ t: 'error', detail: expect.stringMatching(/not_sworn/) });
    expect((await goodsOf(DB(), tributePlace(T, v.pid))).coin).toBe(30);

    expect(await stow(lord, { of: v.pid, goods: { coin: 10 } })).toMatchObject({ t: 'stowed', goods: { coin: 10 } });
    expect(await packed(lord.pid, lord.squad)).toEqual({ coin: 10, seal: 0 });

    expect(await stow(v, { goods: { coin: 5 } })).toMatchObject({ t: 'stowed', goods: { coin: 5 } });
    expect(await packed(v.pid, v.squad)).toEqual({ coin: 5, seal: -lord.pid });
    // sealed: not his to bank
    expect((await api(`/api/war/trade/${T}/rent`, { method: 'POST', token: v.token, json: { kind: 'warehouse' } })).status).toBe(200);
    v.k.send({ t: 'stow', dir: 'in', site: 'warehouse', squad: v.squad, goods: { coin: 5 } });
    expect((await v.k.next(answer)).t).toBe('error');

    expect((await goodsOf(DB(), tributePlace(T, v.pid))).coin).toBe(15);
    expect(await allCoin()).toBeCloseTo(before - 15);
    expect((await packed(lord.pid, lord.squad)).coin + (await packed(v.pid, v.squad)).coin).toBe(15);
  });
});

describe('W-154 breaking an oath', () => {
  it('at any time: a public mark on the roll, 24 hours barred, nothing else', async () => {
    const S = fresh(), a = 2;
    const { b: lord, c: other, now } = await crowned(S, a);
    const v = await member(a, S), witness = await member(a, S);
    expect(await code(breakOath(DB(), v, now, S))).toBe('free');
    await oathed(v, lord, now, S);
    expect(await breakOath(DB(), v, now, S)).toBe(now + FEUDAL.barMs);
    expect(await liegeOf(DB(), v, S)).toBeNull();
    const seenBy = await crownView(env, witness, now, S);
    expect(seenBy.feudal.roll[0]).toMatchObject({ lord: expect.any(String), at: now });
    expect(seenBy.log.some((l) => l.kind === 'oath_broken')).toBe(true);
    expect(await code(swear(DB(), v, other, now + FEUDAL.barMs - 1, S))).toBe('barred');
    await swear(DB(), v, other, now + FEUDAL.barMs, S);
  });
});

describe('W-96 the season reset', () => {
  it('clears oaths, rates, what is reported set aside and the heir', async () => {
    for (const t of ['war_oaths', 'war_oath_rates', 'war_tribute_held']) expect(SEASON_WIPE as readonly string[]).toContain(t);
    const S = fresh(), a = 3;
    const { king, b, now } = await crowned(S, a);
    await nameHeir(env, king, b, now, S);
    await oathed(b, king, now, S);
    await setRate(DB(), king, 5, now, S);
    await DB().prepare("INSERT INTO war_tribute_held (region, building, type, payer_pid, receiver_pid, goods) VALUES ('kyrene', 9, 'forge', ?1, ?2, '{}')").bind(b, king).run();
    await seasonWipe(DB());
    for (const t of ['war_oaths', 'war_oath_rates', 'war_tribute_held', 'war_crowns']) expect((await DB().prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n, t).toBe(0);
  });
});
