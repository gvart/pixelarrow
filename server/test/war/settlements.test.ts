/**
 * W-63 shared settlements (server/src/war/settlements.ts): founding spacing, the offer state machine, plots inside and
 * apart, tribute maths and its cap, no ties between linked accounts, truce bonds forfeited on an attack, who hears of
 * an attack, rebellion, and which settlements persist over a season's end.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { good, setGood } from './goods';
import { noteSeen } from '../../src/war/abuse';
import {
  accept, expireOffers, farEnough, found, inbox, keeps, logAttack, members, offerGarrison, offerTerms, offerTruce, plotRefusal, rebel, refuse,
  report, requestSettle, seasonSweep, settlement, SETTLE, tellOf, tributeOf, levy,
} from '../../src/war/settlements';

const DB = () => env.DB!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const ok = () => null;
const H = 3_600_000;
let piece = 1;
const R = 'kyrene';
/** A settlement in its own far corner of the region (rows stay between tests). */
const at = (n: number) => ({ x: 1000 + n * 100, y: 1000 });
const make = (lord: number, n: number, now = Date.now()) => found(DB(), { region: R, centre: piece++, ...at(n), lord }, ok, now);
const pl = async (n: number) => (await devLogin(n)).playerId;

describe('pure rules', () => {
  it('spacing, plots and tribute', () => {
    const c = { x: 0, y: 0, r: 24 };
    expect(farEnough(c, [{ x: 47, y: 0, r: 24 }])).toBe(false);
    expect(farEnough(c, [{ x: 48, y: 0, r: 24 }])).toBe(true);
    expect(plotRefusal(c, { x0: 2, y0: 2, x1: 6, y1: 6 }, [])).toBeNull();
    expect(plotRefusal(c, { x0: 20, y0: 20, x1: 22, y1: 22 }, [])).toMatch(/inside/);
    expect(plotRefusal(c, { x0: 2, y0: 2, x1: 6, y1: 6 }, [{ x0: 6, y0: 6, x1: 8, y1: 8 }])).toMatch(/overlaps/);
    expect(plotRefusal(c, { x0: 2, y0: 2, x1: 6, y1: 6 }, [{ x0: 7, y0: 2, x1: 8, y1: 8 }])).toBeNull();
    expect(tributeOf(20, { wood: 100, coin: 50 }, 50)).toEqual({ wood: 20, coin: 20 });
    expect(tributeOf(80, { stone: 100 }, 0)).toEqual({ stone: 30 }); // capped at SETTLE.tributeMax
    expect(tributeOf(10, { iron: -5 }, 0)).toEqual({});
    const now = 10 * SETTLE.tendMs;
    expect(keeps({ level: 4, tended_at: 0 }, now)).toBe(true);
    expect(keeps({ level: 3, tended_at: now - SETTLE.tendMs + 1 }, now)).toBe(true);
    expect(keeps({ level: 3, tended_at: now - SETTLE.tendMs }, now)).toBe(false);
  });
});

describe('founding', () => {
  it('the builder is lord; too close or a bad spot is refused; the same camp twice is the same settlement', async () => {
    const a = await pl(9301), now = Date.now();
    const id = await found(DB(), { region: R, centre: 501, x: 3000, y: 3000, lord: a, name: '  Akra  ' }, ok, now);
    expect(await found(DB(), { region: R, centre: 501, x: 3000, y: 3000, lord: a }, ok, now)).toBe(id);
    const s = await settlement(DB(), id);
    expect([s.lord_pid, s.name, s.level, s.r]).toEqual([a, 'Akra', 1, SETTLE.r]);
    expect((await members(DB(), id)).map((m) => [m.player_id, m.role])).toEqual([[a, 'lord']]);
    expect(await code(found(DB(), { region: R, centre: 502, x: 3000 + 2 * SETTLE.r - 1, y: 3000, lord: a }, ok, now))).toBe('too_close');
    expect(await code(found(DB(), { region: R, centre: 503, x: 3000 + 2 * SETTLE.r, y: 3000, lord: a }, () => 'a landmark', now))).toBe('bad_spot');
    expect(await code(found(DB(), { region: 'dodona', centre: 502, x: 3000, y: 3000, lord: a }, ok, now))).toBe('ok'); // another region
  });
});

describe('settle requests', () => {
  it('ask, accept with a plot (inside, apart), refuse, withdraw, expire', async () => {
    const lord = await pl(9311), b = await pl(9312), c = await pl(9313), d = await pl(9314), now = Date.now();
    const id = await make(lord, 1, now), s = await settlement(DB(), id);
    const o1 = await requestSettle(DB(), b, id, now);
    expect(await code(requestSettle(DB(), b, id, now))).toBe('pending');
    expect((await inbox(DB(), lord, now)).incoming.map((o) => (o as { id: number }).id)).toEqual([o1]);
    expect(await code(accept(DB(), b, o1, null, now))).toBe('not_lord');
    expect(await code(accept(DB(), lord, o1, null, now))).toBe('bad_request');
    expect(await code(accept(DB(), lord, o1, { x0: s.x + 20, y0: s.y + 20, x1: s.x + 22, y1: s.y + 22 }, now))).toBe('bad_plot');
    expect(await accept(DB(), lord, o1, { x0: s.x, y0: s.y, x1: s.x + 4, y1: s.y + 4 }, now)).toBe('accepted');
    expect(await code(accept(DB(), lord, o1, { x0: s.x, y0: s.y, x1: s.x + 4, y1: s.y + 4 }, now))).toBe('closed');
    expect(await code(requestSettle(DB(), b, id, now))).toBe('member');
    // an overlapping plot is refused, an apart one given
    const o2 = await requestSettle(DB(), c, id, now);
    expect(await code(accept(DB(), lord, o2, { x0: s.x + 4, y0: s.y, x1: s.x + 8, y1: s.y + 2 }, now))).toBe('bad_plot');
    await accept(DB(), lord, o2, { x0: s.x + 5, y0: s.y, x1: s.x + 8, y1: s.y + 2 }, now);
    expect((await members(DB(), id)).filter((m) => m.role === 'citizen').map((m) => m.player_id).sort()).toEqual([b, c].sort());
    // refuse; withdraw; expire
    const o3 = await requestSettle(DB(), d, id, now);
    expect(await refuse(DB(), lord, o3, now)).toBe('refused');
    const o4 = await requestSettle(DB(), d, id, now);
    expect(await code(refuse(DB(), b, o4, now))).toBe('not_party');
    expect(await refuse(DB(), d, o4, now)).toBe('cancelled');
    const o5 = await requestSettle(DB(), d, id, now);
    expect(await code(accept(DB(), lord, o5, { x0: s.x - 8, y0: s.y, x1: s.x - 6, y1: s.y }, now + SETTLE.offerMs))).toBe('closed');
    expect((await DB().prepare('SELECT state FROM war_settlement_offers WHERE id = ?1').bind(o5).first<{ state: string }>())!.state).toBe('expired');
  });
});

describe('terms', () => {
  it('vassal needs presence, a cap and an own settlement; join swaps lord and citizen; no cycles', async () => {
    const a = await pl(9321), b = await pl(9322), c = await pl(9323), now = Date.now();
    const sa = await make(a, 2, now), sb = await make(b, 3, now), sc = await make(c, 4, now);
    expect(await code(offerTerms(DB(), a, 'vassal', sb, sa, 10, false, now))).toBe('not_present');
    expect(await code(offerTerms(DB(), a, 'vassal', sb, sa, 31, true, now))).toBe('bad_request');
    expect(await code(offerTerms(DB(), a, 'vassal', sb, sc, 10, true, now))).toBe('not_lord');
    const v = await offerTerms(DB(), a, 'vassal', sb, sa, 20, true, now);
    expect(await accept(DB(), b, v, null, now)).toBe('accepted');
    const sbRow = await settlement(DB(), sb);
    expect([sbRow.overlord_id, sbRow.tribute_pct]).toEqual([sa, 20]);
    // b's vassal-to-be cannot be a's overlord's overlord: no cycle
    const cyc = await offerTerms(DB(), b, 'vassal', sa, sb, 5, true, now);
    expect(await code(accept(DB(), a, cyc, null, now))).toBe('cycle');
    // garrison: only the overlord's lord, accepted by the vassal
    expect(await code(offerGarrison(DB(), c, sc, sb, now))).toBe('not_vassal');
    const g = await offerGarrison(DB(), a, sa, sb, now);
    await accept(DB(), b, g, null, now);
    expect((await members(DB(), sb)).find((m) => m.player_id === a)?.role).toBe('garrison');
    // join: c offers to take over a's settlement
    const j = await offerTerms(DB(), c, 'join', sa, null, 0, true, now);
    await accept(DB(), a, j, null, now);
    expect((await settlement(DB(), sa)).lord_pid).toBe(c);
    const ms = await members(DB(), sa);
    expect(ms.find((m) => m.player_id === a)?.role).toBe('citizen');
    expect(ms.find((m) => m.player_id === c)?.role).toBe('lord');
  });

  it('no tie between linked accounts', async () => {
    const a = await pl(9331), b = await pl(9332), now = Date.now();
    const sa = await make(a, 5, now), sb = await make(b, 6, now);
    await noteSeen(DB(), a, '10.9.9.31', null, now);
    await noteSeen(DB(), b, '10.9.9.31', null, now);
    expect(await code(offerTerms(DB(), a, 'vassal', sb, sa, 10, true, now))).toBe('linked');
    expect(await code(offerTerms(DB(), a, 'join', sb, null, 0, true, now))).toBe('linked');
    await setGood(a, 'coin', 100);
    expect(await code(offerTruce(DB(), a, sa, sb, 50, now))).toBe('linked');
    expect(await good(a, 'coin')).toBe(100);
  });
});

describe('tribute', () => {
  it('the overlord\'s lord gets the share of gain and stall coin; logged; nothing without an overlord', async () => {
    const a = await pl(9341), b = await pl(9342), now = Date.now();
    const sa = await make(a, 7, now), sb = await make(b, 8, now);
    expect(await levy(DB(), sb, { wood: 100 }, 0, now)).toBeNull();
    await accept(DB(), b, await offerTerms(DB(), a, 'vassal', sb, sa, 30, true, now), null, now);
    await setGood(a, 'coin', 0);
    const r = await levy(DB(), sb, { wood: 100, coin: 40 }, 60, now + H);
    expect(r).toEqual({ overlord: sa, lord: a, goods: { wood: 30, coin: 30 } });
    expect(await good(a, 'wood')).toBe(30);
    expect(await good(a, 'coin')).toBe(30);
    expect((await settlement(DB(), sb)).levied_at).toBe(now + H);
    const log = await DB().prepare("SELECT other_id, detail FROM war_settlement_log WHERE settlement_id = ?1 AND kind = 'tribute'").bind(sb).first<{ other_id: number; detail: string }>();
    expect(log!.other_id).toBe(sa);
    expect(JSON.parse(log!.detail).pct).toBe(30);
  });
});

describe('truces', () => {
  it('both bonds escrowed; an attack forfeits them to the victim; who hears; refusing and ending give them back', async () => {
    const a = await pl(9351), b = await pl(9352), v = await pl(9353), now = Date.now();
    const sa = await make(a, 9, now), sb = await make(b, 10, now), sv = await make(v, 11, now);
    // sv is a vassal of sb: an attack on sv is an attack on sb
    await accept(DB(), v, await offerTerms(DB(), b, 'vassal', sv, sb, 10, true, now), null, now);
    await setGood(a, 'coin', 500);
    await setGood(b, 'coin', 500);
    expect(await code(offerTruce(DB(), a, sa, sb, 600, now))).toBe('no_coin');
    const t = await offerTruce(DB(), a, sa, sb, 200, now);
    expect(await good(a, 'coin')).toBe(300);
    expect(await accept(DB(), b, t, null, now)).toBe('active');
    expect(await good(b, 'coin')).toBe(300);
    expect((await inbox(DB(), a, now)).truces.length).toBe(1);
    const hit = await logAttack(DB(), a, sv, now + H);
    expect(hit.broken).toEqual([t]);
    expect(hit.tell.sort()).toEqual([b, v].sort());
    expect(await tellOf(DB(), sv)).toEqual([v, b]);
    expect(await good(b, 'coin')).toBe(700); // his bond back and a's forfeited
    expect(await good(a, 'coin')).toBe(300);
    expect((await DB().prepare("SELECT COUNT(*) AS n FROM war_settlement_log WHERE kind = 'truce_break' AND settlement_id = ?1").bind(sb).first<{ n: number }>())!.n).toBe(1);
    // a second attack breaks nothing more
    expect((await logAttack(DB(), a, sv, now + 2 * H)).broken).toEqual([]);

    // refused: the bond back; ended after its time: both back
    const t2 = await offerTruce(DB(), a, sa, sb, 100, now);
    expect(await good(a, 'coin')).toBe(200);
    await refuse(DB(), b, t2, now);
    expect(await good(a, 'coin')).toBe(300);
    const t3 = await offerTruce(DB(), a, sa, sb, 100, now);
    await accept(DB(), b, t3, null, now);
    await expireOffers(DB(), now + SETTLE.truceMs);
    expect([await good(a, 'coin'), await good(b, 'coin')]).toEqual([300, 700]);
    expect((await DB().prepare('SELECT state FROM war_settlement_offers WHERE id = ?1').bind(t3).first<{ state: string }>())!.state).toBe('ended');
  });
});

describe('rebellion', () => {
  it('the vassal\'s lord ends the tie; the garrison leaves; logged', async () => {
    const a = await pl(9361), b = await pl(9362), now = Date.now();
    const sa = await make(a, 12, now), sb = await make(b, 13, now);
    expect(await code(rebel(DB(), b, sb, now))).toBe('free');
    await accept(DB(), b, await offerTerms(DB(), a, 'vassal', sb, sa, 15, true, now), null, now);
    await accept(DB(), b, await offerGarrison(DB(), a, sa, sb, now), null, now);
    expect(await code(rebel(DB(), a, sb, now))).toBe('not_lord');
    expect(await rebel(DB(), b, sb, now)).toBe(sa);
    const s = await settlement(DB(), sb);
    expect([s.overlord_id, s.tribute_pct]).toEqual([null, 0]);
    expect((await members(DB(), sb)).some((m) => m.role === 'garrison')).toBe(false);
    expect((await DB().prepare("SELECT actor_id FROM war_settlement_log WHERE settlement_id = ?1 AND kind = 'rebellion'").bind(sb).first<{ actor_id: number }>())!.actor_id).toBe(b);
  });
});

describe('season end', () => {
  it('towns and tended villages persist; the rest go, bonds back, vassals freed', async () => {
    await DB().batch(['war_settlements', 'war_settlement_members', 'war_settlement_offers', 'war_settlement_log'].map((t) => DB().prepare(`DELETE FROM ${t}`)));
    const a = await pl(9371), b = await pl(9372), c = await pl(9373), now = Date.now(), later = now + 5 * SETTLE.tendMs;
    const town = await make(a, 14, now), village = await make(b, 15, now), tended = await make(c, 16, now);
    await report(DB(), town, { level: 4, persist: { pieces: [1, 2] } }, now);
    await report(DB(), village, { level: 3 }, now);
    await report(DB(), tended, { tended: true }, later - H);
    await accept(DB(), a, await offerTerms(DB(), b, 'vassal', town, village, 10, true, now), null, now);
    await setGood(b, 'coin', 100);
    const t = await offerTruce(DB(), b, village, tended, 60, later - H); // still open at the sweep
    expect(await good(b, 'coin')).toBe(40);
    const r = await seasonSweep(DB(), later);
    expect(r.removed).toEqual([village]);
    expect(r.kept.map((s) => s.id)).toEqual([town, tended]);
    expect(JSON.parse(r.kept[0].persist)).toEqual({ pieces: [1, 2] });
    expect((await settlement(DB(), town)).overlord_id).toBeNull();
    expect(await code(settlement(DB(), village))).toBe('not_found');
    expect(await members(DB(), village)).toEqual([]);
    expect(await DB().prepare('SELECT 1 FROM war_settlement_offers WHERE id = ?1').bind(t).first()).toBeNull();
    expect(await good(b, 'coin')).toBe(100);
  });
});

describe('routes', () => {
  it('lists, asks and answers over REST; terms need the room\'s presence', async () => {
    const lord = await devLogin(9381), asker = await devLogin(9382), now = Date.now();
    const id = await make(lord.playerId, 17, now), s = await settlement(DB(), id);
    const list = (await (await api(`/api/war/settlements?region=${R}`, { token: asker.token })).json()) as { settlements: { id: number }[] };
    expect(list.settlements.some((x) => x.id === id)).toBe(true);
    expect((await api('/api/war/settlements?region=nowhere', { token: asker.token })).status).toBe(400);
    const { offer } = (await (await api(`/api/war/settlements/${id}/settle`, { method: 'POST', token: asker.token, json: {} })).json()) as { offer: number };
    const box = (await (await api('/api/war/settlements/inbox', { token: lord.token })).json()) as { incoming: { id: number }[] };
    expect(box.incoming.map((o) => o.id)).toContain(offer);
    const res = await api(`/api/war/settlements/offers/${offer}/accept`, { method: 'POST', token: lord.token, json: { plot: { x0: s.x, y0: s.y, x1: s.x + 2, y1: s.y + 2 } } });
    expect(await res.json()).toEqual({ state: 'accepted' });
    const view = (await (await api(`/api/war/settlements/${id}`, { token: asker.token })).json()) as { members: { pid: number; role: string }[] };
    expect(view.members.find((m) => m.pid === asker.playerId)?.role).toBe('citizen');
    const terms = await api(`/api/war/settlements/${id}/terms`, { method: 'POST', token: asker.token, json: { kind: 'join' } });
    expect(terms.status).toBe(409);
  });
});
