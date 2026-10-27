/**
 * W-64 crown and council (server/src/war/crown.ts): realm power and the candidates, the weighted election and its
 * ties, a term's end and the regent, the no-confidence petition and vote, appointments by the monarch only, the tax
 * into the treasury (capped), a war goal's bounty paid by fight shares, a supply quest paid on delivery, and a pact
 * broken by an attack (announced to both alliances).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { good, setGood } from './goods';
import { joinAlliance } from '../../src/war/world/members';
import {
  advance, answerPact, appoint, bookFight, confidence, crownSeason, crownTax, crownView, deliver, deposit, endOrder, fundWork, membersOf, offerPact,
  pactAttack, postOrder, setTax, sign, treasuryOf, vote,
} from '../../src/war/crown';
import { goodsOf, putStmt } from '../../src/war/holders';
import { candidatesOf, CROWN, electionWinner, realmPower, splitBounty, voteWeight, type RealmSettlement } from '../../../src/war/net/crown';
import { ALLIANCES } from '../../../src/war/world/alliances';
import type { FightReport } from '../../../src/war/types';
import { fill, listOffer, rentSite, stallId, warehouseId } from '../../src/war/market';
import { fillHook } from '../../src/war/tradeScore';
import { levy } from '../../src/war/settlements';

const DB = () => env.DB!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const H = 3_600_000;
let tg = 64_000, piece = 1, seasonN = 640;

/** A fresh season per test: crowns are per alliance and season. */
const fresh = () => ++seasonN;
async function member(alliance: number, season: number, now = Date.now()) {
  const p = await devLogin(++tg);
  await joinAlliance(DB(), p.playerId, alliance as never, now, season);
  return p.playerId;
}
/** A settlement ruled by `lord` (level, region, overlord), its lord a member. */
async function settle(lord: number, level: number, region = 'kyrene', overlord: number | null = null): Promise<number> {
  const id = (await DB()
    .prepare("INSERT INTO war_settlements (region, centre_piece, x, y, r, name, lord_pid, level, overlord_id, founded_season, tended_at, levied_at) VALUES (?1, ?2, 10, 10, 24, 'S', ?3, ?4, ?5, 1, 0, 0) RETURNING id")
    .bind(region, piece++, lord, level, overlord)
    .first<{ id: number }>())!.id;
  await DB().prepare("INSERT INTO war_settlement_members (settlement_id, player_id, role, since) VALUES (?1, ?2, 'lord', 0)").bind(id, lord).run();
  return id;
}
const electionOf = async (season: number, a: number) => (await DB().prepare("SELECT * FROM war_crown_votes WHERE season = ?1 AND alliance = ?2 AND kind = 'election' ORDER BY id DESC").bind(season, a).first<{ id: number; state: string; closes_at: number; winner_pid: number | null }>());
const coinIn = async (place: string) => Math.round(((await goodsOf(DB(), place)).coin ?? 0) * 100) / 100;

/** Crown a monarch: three members by power, `king` the strongest; the election closes with no votes. */
async function crowned(season: number, a = 1) {
  const now = Date.now();
  const king = await member(a, season), b = await member(a, season), c = await member(a, season);
  await settle(king, 5);
  await settle(b, 2);
  await settle(c, 1);
  await advance(env, a, now, season);
  const e = (await electionOf(season, a))!;
  await advance(env, a, e.closes_at, season);
  return { king, b, c, now: e.closes_at };
}

describe('pure rules', () => {
  it('realm power: own levels, vassal levels, one per region held', () => {
    const all: RealmSettlement[] = [
      { id: 1, region: 'kyrene', lord_pid: 7, level: 3, overlord_id: null },
      { id: 2, region: 'agora', lord_pid: 7, level: 2, overlord_id: null },
      { id: 3, region: 'agora', lord_pid: 8, level: 4, overlord_id: 1 }, // 8's town is 7's vassal
      { id: 4, region: 'agora', lord_pid: 7, level: 1, overlord_id: 2 }, // his own vassal counts once (as his)
    ];
    expect(realmPower(7, all)).toBe(3 + 2 + 1 + 4 + 2);
    expect(realmPower(8, all)).toBe(4 + 1);
    expect(realmPower(9, all)).toBe(0);
  });

  it('candidates, weights, ties and the bounty split', () => {
    const m = [{ pid: 4, name: 'd', power: 2 }, { pid: 1, name: 'a', power: 5 }, { pid: 3, name: 'c', power: 5 }, { pid: 2, name: 'b', power: 0 }, { pid: 5, name: 'e', power: 1 }];
    expect(candidatesOf(m).map((c) => c.pid)).toEqual([1, 3, 4]);
    expect(voteWeight(0)).toBe(1);
    expect(voteWeight(3)).toBeCloseTo(1.3);
    expect(voteWeight(9)).toBe(1 + CROWN.weightMax);
    const cs = [{ pid: 1, name: 'a', power: 3 }, { pid: 2, name: 'b', power: 6 }];
    expect(electionWinner(cs, [{ choice: 1, weight: 1.5 }, { choice: 2, weight: 1 }])!.pid).toBe(1); // weight wins
    expect(electionWinner(cs, [{ choice: 1, weight: 1 }, { choice: 2, weight: 1 }])!.pid).toBe(2); // a tie: the higher power
    expect(electionWinner(cs, [])!.pid).toBe(2);
    expect(electionWinner(cs, [{ choice: 99, weight: 5 }])!.pid).toBe(2); // not a candidate: ignored
    const s = splitBounty(100, [{ pid: 1, share: 1 }, { pid: 2, share: 2 }]);
    expect(s.pay.get(1)).toBe(33.33);
    expect(s.pay.get(2)).toBe(66.66);
    expect(s.rest).toBe(0.01);
    expect(splitBounty(50, []).rest).toBe(50);
  });
});

describe('election', () => {
  it('the top three by power stand; weighted votes elect; the term runs a week, then a new election with a regent', async () => {
    const S = fresh(), a = 0, now = Date.now();
    const [p1, p2, p3, p4, v1, v2] = [await member(a, S), await member(a, S), await member(a, S), await member(a, S), await member(a, S), await member(a, S)];
    await settle(p1, 4);
    await settle(p2, 3);
    await settle(p3, 2);
    await settle(p4, 1); // fourth: not a candidate
    await settle(v1, 5); // a city: v1 is the strongest
    let view = await crownView(env, p1, now, S);
    expect(view.monarch).toBeNull();
    expect(view.election!.candidates.map((c) => c.pid)).toEqual([v1, p1, p2]);
    expect(view.election!.candidates[0].power).toBe(6);
    expect(await code(vote(env, p2, p4, now, S))).toBe('bad_request');
    // p1 (weight 1.4) and v2 (1) vote p2; v1 (1.5) votes himself: 2.4 against 1.5
    await vote(env, p1, p2, now, S);
    await vote(env, v2, p2, now, S);
    await vote(env, v1, v1, now, S);
    await vote(env, p3, v1, now, S); // 1.2: 2.7 against 2.4
    view = await crownView(env, v2, now, S);
    expect(view.election!.candidates.find((c) => c.pid === v1)!.votes).toBeCloseTo(2.7);
    await vote(env, p3, p2, now, S); // he changes his mind: 3.6 against 1.5
    expect((await membersOf(DB(), a, S)).find((m) => m.pid === p3)!.weight).toBeCloseTo(1.2);
    const closes = view.election!.closes;
    expect(closes - now).toBe(CROWN.voteMs);
    view = await crownView(env, p2, closes, S);
    expect(view.monarch!.pid).toBe(p2);
    expect(view.monarch!.ends).toBe(closes + CROWN.termMs);
    expect(view.election).toBeNull();
    expect(view.me.monarch).toBe(true);
    expect(view.log[0].kind).toBe('crowned');
    // the term ends: a new election opens and he stays as regent
    view = await crownView(env, p2, closes + CROWN.termMs, S);
    expect(view.election).not.toBeNull();
    expect(view.regent).toBe(true);
    expect(view.monarch!.pid).toBe(p2);
    // nobody votes: the strongest (v1) wins; the old council goes with the old monarch
    await appoint(env, p2, 'marshal', p3, closes + CROWN.termMs, S);
    view = await crownView(env, p1, view.election!.closes, S);
    expect(view.monarch!.pid).toBe(v1);
    expect(view.council.every((c) => c.pid === null)).toBe(true);
  });

  it('the season ends every term; no candidates, no election', async () => {
    const S = fresh();
    const { king, now } = await crowned(S, 2);
    await crownSeason(env, now + H, S);
    const view = await crownView(env, king, now + H, S);
    expect(view.regent).toBe(true);
    expect(view.election).not.toBeNull();
    // an alliance with no settlements: no candidates, no election
    const S2 = fresh(), lone = await member(3, S2);
    expect((await crownView(env, lone, now, S2)).election).toBeNull();
  });
});

describe('no confidence', () => {
  it('a petition of a quarter of the active members opens the vote; a majority removes the monarch; a new election opens', async () => {
    const S = fresh(), a = 1;
    const { king, b, c, now } = await crowned(S, a);
    const others = [await member(a, S), await member(a, S), await member(a, S), await member(a, S), await member(a, S)]; // 8 members: 2 signatures
    expect(await code(sign(env, king, now, S))).toBe('yours');
    let s = await sign(env, b, now, S);
    expect(s).toMatchObject({ signs: 1, need: 2, state: 'petition' });
    expect(await code(confidence(env, c, true, now, S))).toBe('no_vote');
    s = await sign(env, c, now, S);
    expect(s.state).toBe('open');
    await confidence(env, b, true, now, S);
    await confidence(env, c, true, now, S);
    await confidence(env, others[0], true, now, S);
    await confidence(env, king, false, now, S);
    await confidence(env, others[1], false, now, S);
    let view = await crownView(env, b, now, S);
    expect(view.petition).toMatchObject({ state: 'open', signs: 2, mine: 1 });
    view = await crownView(env, b, now + CROWN.voteMs, S);
    expect(view.monarch).toBeNull();
    expect(view.regent).toBe(false);
    expect(view.election).not.toBeNull();
    expect(view.log.some((l) => l.kind === 'deposed')).toBe(true);
  });

  it('a held vote keeps him and shuts petitions for a while; an unsigned petition lapses', async () => {
    const S = fresh(), a = 3;
    const { king, b, c, now } = await crowned(S, a);
    await sign(env, b, now, S); // 3 members: one signature opens it
    await confidence(env, b, true, now, S);
    await confidence(env, king, false, now, S);
    await confidence(env, c, false, now, S);
    let view = await crownView(env, b, now + CROWN.voteMs, S);
    expect(view.monarch!.pid).toBe(king);
    expect(view.petitionCooldown).toBe(now + CROWN.voteMs + CROWN.cooldownMs);
    expect(await code(sign(env, c, now + CROWN.voteMs + H, S))).toBe('cooldown');
    // after the cooldown a petition again (opens at once: 1 of 3 signs)
    expect((await sign(env, c, now + CROWN.voteMs + CROWN.cooldownMs + H, S)).state).toBe('open');
    view = await crownView(env, c, now + CROWN.voteMs + CROWN.cooldownMs + H, S);
    expect(view.petition!.state).toBe('open');
  });
});

describe('council and treasury', () => {
  it('only the monarch appoints; one office each; offices act, others may not', async () => {
    const S = fresh(), a = 0;
    const { king, b, c, now } = await crowned(S, a);
    const out = await member(1, S);
    expect(await code(appoint(env, b, 'treasurer', b, now, S))).toBe('not_office');
    expect(await code(appoint(env, king, 'treasurer', out, now, S))).toBe('not_member');
    await appoint(env, king, 'treasurer', b, now, S);
    expect(await code(appoint(env, king, 'marshal', b, now, S))).toBe('has_office');
    await appoint(env, king, 'marshal', c, now, S);
    let view = await crownView(env, c, now, S);
    expect(view.council.find((x) => x.office === 'treasurer')!.pid).toBe(b);
    expect(view.me.offices).toEqual(['marshal']);
    expect(await code(setTax(env, c, 5, now, S))).toBe('not_office');
    expect(await setTax(env, b, 5, now, S)).toBe(5);
    expect(await code(setTax(env, b, 11, now, S))).toBe('bad_request');
    expect(await setTax(env, king, 10, now, S)).toBe(10); // the monarch may too
    await appoint(env, king, 'treasurer', null, now, S);
    view = await crownView(env, king, now, S);
    expect(view.council.find((x) => x.office === 'treasurer')!.pid).toBeNull();
    expect(view.treasury.tax).toBe(10);
  });

  it('the tax takes its share of a member\'s coin into the treasury, at most 10 %', async () => {
    const S = fresh(), a = 2;
    const { king, b, now } = await crowned(S, a);
    await setTax(env, king, 10, now, S);
    const stall = `st:test:${b}`;
    await DB().batch([putStmt(DB(), stall, 'coin', 200), ...(await crownTax(DB(), b, 200, stall, undefined, S))]);
    expect(await coinIn(stall)).toBe(180);
    expect(await coinIn(treasuryOf(a, S))).toBe(20);
    // the table holds no rate above the cap
    expect(await code(DB().prepare('UPDATE war_crowns SET tax_pct = 30 WHERE season = ?1 AND alliance = ?2').bind(S, a).run())).not.toBe('ok');
    // untaxed when 0, or outside an alliance
    await setTax(env, king, 0, now, S);
    expect(await crownTax(DB(), b, 200, stall, undefined, S)).toEqual([]);
    expect((await crownView(env, king, now, S)).treasury.taxed).toBe(20);
    // deposits and a gift to a work from the treasury
    await setGood(b, 'coin', 500);
    expect(await deposit(env, b, 400, now, S)).toBe(420);
    expect(await good(b, 'coin')).toBe(100);
    expect(await code(fundWork(env, b, 'temple', { coin: 100 }, now, S))).toBe('not_office');
    expect(await fundWork(env, king, 'temple', { coin: 100 }, now, S)).toEqual({ coin: 100 });
    expect(await coinIn(treasuryOf(a, S))).toBe(320);
  });
});

describe('the tax where coin is earned', () => {
  it('a market fill and a vassal\'s tribute pay the seller\'s and the overlord\'s alliance tax', async () => {
    const T = 'kleisoura', now = Date.now();
    const seller = await member(0, 1), buyer = await member(1, 1), vassal = await member(1, 1);
    await DB().prepare('INSERT INTO war_crowns (season, alliance, tax_pct) VALUES (1, 0, 10) ON CONFLICT (season, alliance) DO UPDATE SET tax_pct = 10').run();
    await setGood(seller, 'coin', 100);
    await setGood(buyer, 'coin', 100);
    await rentSite(DB(), seller, T, 'stall', 1, now);
    await rentSite(DB(), buyer, T, 'warehouse', 1, now);
    await DB().batch([putStmt(DB(), stallId(T, seller), 'iron', 10, 'dodona'), putStmt(DB(), stallId(T, seller), 'coin', 20), putStmt(DB(), warehouseId(T, buyer), 'coin', 150)]);
    await DB().prepare("INSERT INTO war_persons (id, player_id, state, region) VALUES (?1, ?2, 'active', ?3)").bind(`cr-${buyer}`, buyer, T).run();
    const id = await listOffer(DB(), seller, T, { side: 'sell', res: 'iron', n: 8, price: 25 }, 1, now);
    const f = await fill(DB(), buyer, id, 4, 'cr-1', 1, now, fillHook(env));
    expect(f.tax).toBe(5);
    expect(await coinIn(stallId(T, seller))).toBe(20 + 95 - 10); // the sale less the town's and the crown's tax
    expect(await coinIn(treasuryOf(0, 1))).toBe(10);
    // tribute: the overlord's lord (alliance 0) gets 20 % of the vassal's 100 coin, less his crown's 10 %
    const over = await settle(seller, 3), sv = await settle(vassal, 1, 'kyrene', over);
    await DB().prepare('UPDATE war_settlements SET tribute_pct = 20 WHERE id = ?1').bind(sv).run();
    const before = await good(seller, 'coin');
    expect((await levy(DB(), sv, { coin: 100 }, 0, now))!.goods).toEqual({ coin: 20 });
    expect(await good(seller, 'coin')).toBe(before + 18);
    expect(await coinIn(treasuryOf(0, 1))).toBe(12);
  });
});

describe('orders', () => {
  const fight = (rows: { pid: number; team: number; kills: number }[]): FightReport =>
    ({ tick: 1, loot: {}, persons: rows.map((r, i) => ({ id: `x${i}`, owner: `p:${r.pid}`, team: r.team, kills: r.kills, state: 'fit', xp: 0 })) }) as unknown as FightReport;

  it('a war goal\'s bounty goes to the members whose men fought in its region, by 1 + kills', async () => {
    const S = fresh(), a = 1;
    const { king, b, c, now } = await crowned(S, a);
    const foe = await member(2, S);
    await setGood(king, 'coin', 2000);
    await deposit(env, king, 1000, now, S);
    await appoint(env, king, 'marshal', b, now, S);
    expect(await code(postOrder(env, c, { kind: 'attack', region: 'krios', bounty: 300, hours: 24 }, now, S))).toBe('not_office');
    expect(await code(postOrder(env, b, { kind: 'attack', region: 'krios', bounty: 5000, hours: 24 }, now, S))).toBe('no_coin');
    const id = await postOrder(env, b, { kind: 'attack', region: 'krios', target: 'the agora', bounty: 300, hours: 24 }, now, S);
    const rally = await postOrder(env, b, { kind: 'rally', region: 'krios', bounty: 999, hours: 2 }, now, S);
    expect(await coinIn(treasuryOf(a, S))).toBe(700);
    // b fights with 2 kills (3 shares), c with none (1), the foe gets nothing; a fight elsewhere does not count
    await bookFight(DB(), 'krios', fight([{ pid: b, team: a, kills: 2 }, { pid: c, team: a, kills: 0 }, { pid: foe, team: 2, kills: 4 }]), now + H, S);
    await bookFight(DB(), 'kyrene', fight([{ pid: c, team: a, kills: 9 }]), now + H, S);
    let view = await crownView(env, c, now + H, S);
    const o = view.orders.find((x) => x.id === id)!;
    expect(o).toMatchObject({ shares: 4, mine: 1, bounty: 300, state: 'open' });
    expect(view.orders.find((x) => x.id === rally)!.bounty).toBe(0);
    const [bb, cb] = [await good(b, 'coin'), await good(c, 'coin')];
    expect(await code(endOrder(env, c, id, now + H, S))).toBe('not_office');
    expect(await endOrder(env, b, id, now + H, S)).toEqual({ state: 'done', paid: 300 });
    expect(await good(b, 'coin')).toBe(bb + 225);
    expect(await good(c, 'coin')).toBe(cb + 75);
    // a goal nobody fought for expires: its bounty back
    const idle = await postOrder(env, b, { kind: 'defend', region: 'krios', bounty: 100, hours: 1 }, now, S);
    expect(await coinIn(treasuryOf(a, S))).toBe(600);
    view = await crownView(env, b, now + 2 * H, S);
    expect(view.orders.find((x) => x.id === idle)!.state).toBe('expired');
    expect(await coinIn(treasuryOf(a, S))).toBe(700);
  });

  it('a supply quest pays pro rata on delivery from his sites in its town; not to its poster', async () => {
    const S = fresh(), a = 2, home = ALLIANCES[2].home;
    const { king, b, c, now } = await crowned(S, a);
    await setGood(king, 'coin', 1000);
    await deposit(env, king, 1000, now, S);
    await appoint(env, king, 'quartermaster', b, now, S);
    expect(await code(postOrder(env, b, { kind: 'supply', region: 'dodona-n', res: 'stone', n: 100, bounty: 200, hours: 24 }, now, S))).not.toBe('ok');
    const id = await postOrder(env, b, { kind: 'supply', region: home, res: 'stone', n: 100, bounty: 200, hours: 24 }, now, S);
    await setGood(c, 'stone', 70);
    await setGood(b, 'stone', 70);
    expect(await code(deliver(env, b, id, 10, now, S))).toBe('yours');
    expect(await deliver(env, c, id, 60, now, S)).toEqual({ n: 60, paid: 120, done: false });
    expect(await good(c, 'coin')).toBe(120);
    expect(await code(deliver(env, c, id, 50, now, S))).toBe('no_stone');
    await setGood(c, 'stone', 80);
    expect(await deliver(env, c, id, 50, now, S)).toEqual({ n: 40, paid: 80, done: true });
    expect(await good(c, 'stone')).toBe(40);
    expect(await good(c, 'coin')).toBe(200);
    expect((await goodsOf(DB(), treasuryOf(a, S))).stone).toBe(100);
    const view = await crownView(env, c, now, S);
    expect(view.orders.find((x) => x.id === id)).toMatchObject({ state: 'done', delivered: 100, paid: 200, mine: 100 });
    expect(await code(deliver(env, c, id, 1, now, S))).toBe('closed');
    // a quest called off gives back what it has not paid
    const q = await postOrder(env, b, { kind: 'supply', region: home, res: 'wood', n: 10, bounty: 50, hours: 24 }, now, S);
    const before = await coinIn(treasuryOf(a, S));
    expect((await endOrder(env, b, q, now, S)).state).toBe('cancelled');
    expect(await coinIn(treasuryOf(a, S))).toBe(before + 50);
  });
});

describe('pacts', () => {
  it('envoys make a pact; an attack by a member breaks it and both alliances hear', async () => {
    const S = fresh();
    const A = await crowned(S, 0), B = await crowned(S, 3), now = Math.max(A.now, B.now);
    await appoint(env, A.king, 'envoy', A.b, now, S);
    await appoint(env, B.king, 'envoy', B.b, now, S);
    expect(await code(offerPact(env, A.c, 3, 'pact', now, S))).toBe('not_office');
    const id = await offerPact(env, A.b, 3, 'pact', now, S);
    expect(await code(offerPact(env, B.b, 0, 'truce', now, S))).toBe('pending');
    expect(await code(answerPact(env, A.b, id, 'accept', now, S))).toBe('not_party');
    expect(await answerPact(env, B.b, id, 'accept', now, S)).toBe('active');
    const view = await crownView(env, A.c, now, S);
    expect(view.pacts[0]).toMatchObject({ id, kind: 'pact', state: 'active', ends: now + CROWN.pactMs });
    // A's c attacks a settlement of B's king: broken, both alliances told
    const victim = (await DB().prepare('SELECT id FROM war_settlements WHERE lord_pid = ?1').bind(B.king).first<{ id: number }>())!.id;
    const own = (await DB().prepare('SELECT id FROM war_settlements WHERE lord_pid = ?1').bind(A.king).first<{ id: number }>())!.id;
    expect((await pactAttack(DB(), A.b, own, now, S)).broken).toEqual([]); // his own side: nothing
    const r = await pactAttack(DB(), A.c, victim, now + H, S);
    expect(r.broken).toEqual([id]);
    expect(r.tell).toEqual(expect.arrayContaining([A.king, A.b, A.c, B.king, B.b, B.c]));
    expect(r.text).toMatch(/broke the pact with Elaia/);
    const vb = await crownView(env, B.c, now + H, S);
    expect(vb.pacts[0].state).toBe('broken');
    expect(vb.log[0]).toMatchObject({ kind: 'pact_broken' });
    expect((await pactAttack(DB(), A.c, victim, now + H, S)).broken).toEqual([]);
  });
});

