import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bossMaxHp, worldBossSites } from '../../src/online/lairs';
import { parseStartParam } from '../../src/online/deeplink';
import type { RegionDO } from '../src/region';
import { enqueue, ev, flushDue, flushPlayer, isQuiet, NOTIFY_RULES, notify } from '../src/notify/outbox';
import { ensureBotSetup, incomeNotices, runScheduled, seasonNotices } from '../src/notify/jobs';
import { buttonUrl, render } from '../src/notify/templates';
import { BOT_COMMANDS } from '../src/bot/commands';
import { currentSeason, getShard, shardDoName } from '../src/online/store';
import { api, mockTelegram, webhook, type BotCall } from './helpers';
import { DB, fresh, freeNeighbour, getJson, must, join, placeArmy, play, post, sameShard, wsOnline, type Player, type Ticket } from './onlineHelpers';

beforeEach(fresh);
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;

interface OutRow {
  id: number;
  event: string;
  type: string;
  data: string;
  status: string;
}

const outbox = async (pid: number) =>
  (await DB().prepare('SELECT id, event, type, data, status FROM notify_outbox WHERE player_id = ?1 ORDER BY id').bind(pid).all<OutRow>()).results;

/** Waits for a background (waitUntil) notification of this player. */
async function waitForEvent(pid: number, event: string): Promise<OutRow> {
  let row: OutRow | undefined;
  await vi.waitFor(
    async () => {
      row = (await outbox(pid)).find((r) => r.event === event);
      if (!row) throw new Error(`no ${event} yet`);
    },
    { timeout: 8000, interval: 50 },
  );
  return row!;
}

const sends = (calls: BotCall[], chat?: number) => calls.filter((c) => c.method === 'sendMessage' && (chat === undefined || c.params.chat_id === chat));
const button = (c: BotCall) => (c.params.reply_markup as { inline_keyboard: { text: string; web_app?: { url: string }; callback_data?: string }[][] }).inline_keyboard;

async function shardOf(p: Player) {
  const season = await currentSeason(DB());
  return getShard(DB(), season.id, p.profile.shard.id);
}

/** A failing Telegram: every sendMessage answers with `status`. */
function telegramFailing(status: number, description: string): BotCall[] {
  const calls: BotCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = url.pathname.split('/').pop()!;
    calls.push({ method, params: JSON.parse(String(init?.body ?? '{}')) });
    return Response.json({ ok: false, error_code: status, description }, { status });
  });
  return calls;
}

describe('notification texts and deep links', () => {
  it('renders one event, folds several attacks into one message, and speaks Russian', () => {
    const one = render('en', 'attack', [{ event: 'attack_captured', data: { loc: 32, place: 'Massalia', by: 'Brasidas', ticket: 't1' } }]);
    expect(one.text).toContain('Brasidas captured Massalia');
    expect(one.text).toContain('/settings');
    expect(one.route).toEqual({ kind: 'loc', loc: 32 });
    const many = render('en', 'attack', [
      { event: 'attack_start', data: { loc: 1, place: 'A1', by: 'A', ticket: 't1' } },
      { event: 'attack_held', data: { loc: 1, place: 'A1', by: 'A', ticket: 't1' } },
      { event: 'attack_start', data: { loc: 2, place: 'B2', by: 'B', ticket: 't2' } },
      { event: 'attack_captured', data: { loc: 2, place: 'B2', by: 'B', ticket: 't2' } },
      { event: 'attack_start', data: { loc: 4, place: 'C4', by: 'C', ticket: 't3' } },
    ]);
    expect(many.text).toContain('3 attacks on your land in the last hour');
    expect(many.text).toContain('Regions lost: 1, attacks held: 1');
    expect(many.route).toEqual({ kind: 'loc', loc: 4 });
    const ru = render('ru', 'market', [
      { event: 'market_sold', data: { what: 'Bronze helm', price: 100, currency: 'gold', gets: 90 } },
      { event: 'market_sold', data: { what: 'Spear', price: 20, currency: 'drachmae', gets: 18 } },
    ]);
    expect(ru.text).toContain('Продано ваших лотов: 2');
    expect(ru.text).toContain('+90 золота, +18 драхм');
    expect(ru.button).toBe('🪙 Рынок');
  });

  it('folds raids on a duel defence into one message (held / broken)', () => {
    const raid = (by: string, held: boolean) => ({ event: 'duel_defence' as const, data: { by, held } });
    expect(render('en', 'duel', [raid('Kleon', true)]).text).toContain('held against Kleon');
    expect(render('ru', 'duel', [raid('Kleon', false)]).text).toContain('Kleon прорвал');
    const many = render('en', 'duel', [raid('A', true), raid('B', false), raid('C', true)]);
    expect(many.text).toContain('3 raids on your defence team. Held: 2, lost: 1.');
    expect(many.route).toEqual({ kind: 'duel' });
  });

  it('every button opens the game with a startapp the client understands', () => {
    const cases: [Parameters<typeof render>[1], Parameters<typeof render>[2][number], string][] = [
      ['attack', { event: 'attack_start', data: { loc: 57, place: 'Gades', by: 'X', ticket: 't' } }, 'loc_57'],
      ['march', { event: 'march_arrived', data: { loc: 23, place: 'Emporion' } }, 'loc_23'],
      ['income', { event: 'income_full', data: {} }, 'income'],
      ['duel', { event: 'duel_challenge', data: { by: 'Y' } }, 'duel'],
      ['clan', { event: 'clan_joined', data: { name: 'Z', clan: '[ABC] Kites' } }, 'myclan'],
      ['clan', { event: 'clan_kicked', data: { clan: '[ABC] Kites' } }, 'income'],
      ['boss', { event: 'boss_slain', data: { boss: 'kraken', loc: 91, share: 0.25, items: 2 } }, 'boss_91'],
      ['season', { event: 'season_ending', data: { days: 3 } }, 'season'],
      ['market', { event: 'market_sold', data: { what: 'Helm', price: 10, currency: 'gold', gets: 9 } }, 'market'],
    ];
    for (const [type, e, param] of cases) {
      const r = render('en', type, [e]);
      const url = buttonUrl('https://pixelarrow.app', r.route);
      expect(url).toBe(`https://pixelarrow.app/?startapp=${param}`);
      expect(parseStartParam(new URL(url).searchParams.get('startapp'))).toEqual(r.route);
    }
  });

  it('quiet hours follow the reported time zone, never when it is unknown', () => {
    const at = (h: number) => Date.UTC(2026, 9, 7, h, 30);
    expect(isQuiet({ quiet: 1, tz_offset: null }, at(2))).toBe(false);
    expect(isQuiet({ quiet: 1, tz_offset: 0 }, at(2))).toBe(true);
    expect(isQuiet({ quiet: 1, tz_offset: 0 }, at(12))).toBe(false);
    expect(isQuiet({ quiet: 1, tz_offset: 180 }, at(20))).toBe(true); // 23:30 in Moscow
    expect(isQuiet({ quiet: 1, tz_offset: 180 }, at(5))).toBe(false); // 08:30 in Moscow
    expect(isQuiet({ quiet: 0, tz_offset: 0 }, at(2))).toBe(false);
  });
});

describe('delivery rules', () => {
  it('sends at once with a web_app button, once per dedupe key', async () => {
    const p = await join(77001, 'Leonidas');
    const calls = mockTelegram();
    const e = ev(p.playerId, 'march_arrived', 'march:1', { loc: 21, place: 'Saguntum' });
    await notify(env, [e]);
    await notify(env, [e]);
    const sent = sends(calls, 77001);
    expect(sent).toHaveLength(1);
    expect(sent[0].params.text).toContain('Your army has arrived at Saguntum');
    expect(button(sent[0])[0][0].web_app!.url).toBe('https://pixelarrow.app/?startapp=loc_21');
    expect((await outbox(p.playerId)).map((r) => r.status)).toEqual(['sent']);
  });

  it('respects the per-type opt-out (settings API) and keeps the other types', async () => {
    const p = await join(77002);
    const calls = mockTelegram();
    const put = await api('/api/notify/settings', { method: 'PUT', token: p.token, json: { on: { market: false }, tzOffset: 120 } });
    expect(put.status).toBe(200);
    const view = await put.json<{ types: { type: string; on: boolean }[]; quiet: boolean; tzOffset: number; blocked: boolean }>();
    expect(view.types.find((t) => t.type === 'market')!.on).toBe(false);
    expect(view.types.find((t) => t.type === 'attack')!.on).toBe(true);
    expect(view).toMatchObject({ quiet: true, tzOffset: 120, blocked: false });
    const noon = Date.UTC(2026, 9, 7, 10, 0); // 12:00 local
    await notify(env, [ev(p.playerId, 'market_sold', 'sold:x', { what: 'Helm', price: 10, currency: 'gold', gets: 9 }), ev(p.playerId, 'income_full', 'income:x', {})], { now: noon });
    expect(sends(calls, 77002).map((c) => c.params.text as string).join()).toContain('treasury is full');
    expect(sends(calls, 77002)).toHaveLength(1);
    expect(Object.fromEntries((await outbox(p.playerId)).map((r) => [r.event, r.status]))).toEqual({ market_sold: 'skipped', income_full: 'sent' });
    // the settings read back; bad input is refused
    expect((await getJson<{ types: { type: string; on: boolean }[] }>('/api/notify/settings', p.token)).body.types.filter((t) => !t.on).map((t) => t.type)).toEqual(['market']);
    expect((await api('/api/notify/settings', { method: 'PUT', token: p.token, json: { on: { nope: true } } })).status).toBe(400);
    expect((await api('/api/notify/settings')).status).toBe(401);
  });

  it('holds messages during quiet hours and sends them after', async () => {
    const p = await join(77003);
    const calls = mockTelegram();
    await api('/api/notify/settings', { method: 'PUT', token: p.token, json: { tzOffset: 0 } });
    const night = Date.UTC(2026, 9, 7, 2, 0);
    await notify(env, [ev(p.playerId, 'duel_challenge', 'duel:1', { by: 'Kleon' })], { now: night });
    expect(sends(calls, 77003)).toHaveLength(0);
    // still inside its TTL at 2:50, but quiet; at 8:00 the duel is stale (1 h TTL) and dropped
    await flushPlayer(env, p.playerId, night + 50 * MIN);
    expect(sends(calls, 77003)).toHaveLength(0);
    await notify(env, [ev(p.playerId, 'boss_slain', 'boss:1', { boss: 'titan', loc: 11, share: 0.5, items: 3 })], { now: night + 55 * MIN });
    await flushPlayer(env, p.playerId, Date.UTC(2026, 9, 7, 8, 0));
    const sent = sends(calls, 77003);
    expect(sent).toHaveLength(1);
    expect(sent[0].params.text).toContain('Titan has been slain');
    expect(Object.fromEntries((await outbox(p.playerId)).map((r) => [r.event, r.status]))).toEqual({ duel_challenge: 'skipped', boss_slain: 'sent' });
  });

  it('coalesces repeated events into one message after the window and caps messages per hour', async () => {
    const p = await join(77004);
    const calls = mockTelegram();
    const t0 = Date.UTC(2026, 9, 7, 12, 0);
    const atk = (i: number, kind: 'attack_start' | 'attack_captured' | 'attack_held') =>
      ev(p.playerId, kind, `atk:${i}:${kind === 'attack_start' ? 'start' : 'end'}`, { loc: i + 1, place: `R${i + 1}`, by: `Foe${i}`, ticket: `t${i}` });
    await notify(env, [atk(1, 'attack_start')], { now: t0 });
    expect(sends(calls, 77004)).toHaveLength(1); // the first one goes at once
    await notify(env, [atk(1, 'attack_held')], { now: t0 + 2 * MIN });
    await notify(env, [atk(2, 'attack_start')], { now: t0 + 3 * MIN });
    await notify(env, [atk(2, 'attack_captured')], { now: t0 + 5 * MIN });
    await notify(env, [atk(3, 'attack_start')], { now: t0 + 6 * MIN });
    expect(sends(calls, 77004)).toHaveLength(1); // inside the coalescing window: waiting
    await flushDue(env, t0 + 10 * MIN);
    expect(sends(calls, 77004)).toHaveLength(1);
    await flushDue(env, t0 + NOTIFY_RULES.coalesceMs.attack + 1);
    const sent = sends(calls, 77004);
    expect(sent).toHaveLength(2);
    expect(sent[1].params.text).toContain('3 attacks on your land in the last hour. Regions lost: 1, attacks held: 1.');
    expect((await outbox(p.playerId)).every((r) => r.status === 'sent')).toBe(true);

    // the hourly budget: other types still go until it is spent, then everything waits
    const t1 = t0 + 20 * MIN;
    await notify(env, [ev(p.playerId, 'income_full', 'income:a', {})], { now: t1 });
    await notify(env, [ev(p.playerId, 'boss_slain', 'boss:a', { boss: 'kraken', loc: 5, share: 0.1, items: 1 })], { now: t1 });
    expect(sends(calls, 77004)).toHaveLength(NOTIFY_RULES.maxPerHour);
    await notify(env, [ev(p.playerId, 'season_ending', 'season:a', { days: 3 })], { now: t1 + MIN });
    expect(sends(calls, 77004)).toHaveLength(NOTIFY_RULES.maxPerHour);
    expect((await outbox(p.playerId)).find((r) => r.event === 'season_ending')!.status).toBe('pending');
    // an hour after the first message the budget frees up
    await flushDue(env, t0 + 61 * MIN);
    expect(sends(calls, 77004)).toHaveLength(NOTIFY_RULES.maxPerHour + 1);
  });

  it('a blocked bot (403) disables delivery until the player sends /start again; 429 just retries', async () => {
    const p = await join(77005);
    let calls = telegramFailing(403, 'Forbidden: bot was blocked by the user');
    await notify(env, [ev(p.playerId, 'income_full', 'income:b1', {}), ev(p.playerId, 'march_arrived', 'march:b1', { loc: 1, place: 'R1' })]);
    expect(sends(calls)).toHaveLength(1); // stopped at the first 403
    const st = await DB().prepare('SELECT blocked_at FROM notify_settings WHERE player_id = ?1').bind(p.playerId).first<{ blocked_at: number | null }>();
    expect(st!.blocked_at).toBeGreaterThan(0);
    expect((await outbox(p.playerId)).every((r) => r.status === 'skipped')).toBe(true);
    expect((await getJson<{ blocked: boolean }>('/api/notify/settings', p.token)).body.blocked).toBe(true);
    vi.restoreAllMocks();

    calls = mockTelegram();
    await notify(env, [ev(p.playerId, 'income_full', 'income:b2', {})]);
    expect(sends(calls, 77005)).toHaveLength(0);
    await webhook({ update_id: 5, message: { message_id: 1, chat: { id: 77005, type: 'private' }, from: { id: 77005 }, text: '/start' } });
    await notify(env, [ev(p.playerId, 'income_full', 'income:b3', {})]);
    expect(sends(calls, 77005).map((c) => c.params.text as string).some((t) => t.includes('treasury'))).toBe(true);
    vi.restoreAllMocks();

    calls = telegramFailing(429, 'Too Many Requests: retry after 5');
    await notify(env, [ev(p.playerId, 'boss_slain', 'boss:b4', { boss: 'titan', loc: 5, share: 1, items: 1 })]);
    expect((await outbox(p.playerId)).find((r) => r.event === 'boss_slain')!.status).toBe('pending');
  });
});

describe('event triggers', () => {
  it('attack start, then the result, reach the region owner (who is offline)', { timeout: 30_000 }, async () => {
    const owner = await join(77101, 'Owner');
    const att = await join(77102, 'Raider');
    await sameShard(att, owner);
    const shard = await shardOf(att);
    const w = shard.world;
    // the owner holds a plot (not a boss site, not locked, nobody's yet) next to the raider's army (no garrison: militia)
    const bosses = worldBossSites(w, shard.seed).map((b) => b.loc);
    const h = await freeNeighbour(att, (n) => w.info(n).kind === 'plot' && !bosses.includes(n));
    await DB()
      .prepare(
        `INSERT INTO online_regions (season_id, shard_id, loc, occupant, owner_id, accrued_at) VALUES (?1, ?2, ?3, 'player', ?4, ?5)
         ON CONFLICT (season_id, shard_id, loc) DO UPDATE SET occupant = 'player', owner_id = excluded.owner_id, accrued_at = excluded.accrued_at, home = 0`,
      )
      .bind(shard.season, shard.id, h, owner.playerId, Date.now())
      .run();
    const calls = mockTelegram();
    const t = await post<Ticket>('/api/online/attack/start', att.token, { loc: h });
    expect(t.status).toBe(200);
    expect(t.body.defenderKind).toBe('militia');
    const start = await waitForEvent(owner.playerId, 'attack_start');
    expect(JSON.parse(start.data)).toMatchObject({ loc: h, place: w.info(h).name, by: 'Raider' });
    await vi.waitFor(() => expect(sends(calls, 77101)).toHaveLength(1));
    expect(button(sends(calls, 77101)[0])[0][0].web_app!.url).toBe(`https://pixelarrow.app/?startapp=loc_${h}`);
    const run = play(t.body.setup);
    const sub = await post<{ captured: boolean; won: boolean }>('/api/online/attack/submit', att.token, { ticket: t.body.ticket, ...run });
    expect(sub.status).toBe(200);
    const end = await waitForEvent(owner.playerId, sub.body.captured ? 'attack_captured' : 'attack_held');
    expect(end.type).toBe('attack');
    // the result waits for the coalescing window (one message so far)
    expect(sends(calls, 77101)).toHaveLength(1);
    expect((await outbox(att.playerId)).length).toBe(0);
  });

  it('a march arrival notifies its owner when offline, not when online', { timeout: 20_000 }, async () => {
    const a = await join(77201);
    const calls = mockTelegram();
    const stub = env.REGION.get(env.REGION.idFromName(shardDoName({ season: a.profile.season.id, id: a.profile.shard.id })));
    await stub.marchNotice(a.playerId, { at: Date.now() - 1000, loc: 4, place: 'Arx Borea' });
    await runDurableObjectAlarm(stub);
    const row = await waitForEvent(a.playerId, 'march_arrived');
    expect(JSON.parse(row.data)).toEqual({ loc: 4, place: 'Arx Borea' });
    // (the alarm, due at once, may already have run by itself: wait for its send)
    await vi.waitFor(() => expect(sends(calls, 77201)).toHaveLength(1));
    // online on the war table: no message
    const ws = await wsOnline(a.token);
    await ws.next('welcome');
    await stub.marchNotice(a.playerId, { at: Date.now() - 1000, loc: 5, place: 'Campus Altus' });
    await runDurableObjectAlarm(stub);
    await vi.waitFor(async () => expect(await runInDurableObject(stub, (_i: RegionDO, state) => state.storage.get(`notice:${a.playerId}`))).toBeUndefined());
    expect((await outbox(a.playerId)).filter((r) => r.event === 'march_arrived')).toHaveLength(1);
    ws.ws.close(1000);
    // a long march registers its notice; a halt clears it
    await stub.marchNotice(a.playerId, null);
  });

  it('a duel challenge to an offline player of the shard notifies them', { timeout: 20_000 }, async () => {
    const a = await join(77301, 'Challenger');
    const b = await join(77302, 'Sleeper');
    await sameShard(a, b);
    const calls = mockTelegram();
    const wa = await wsOnline(a.token);
    await wa.next('welcome');
    wa.send({ type: 'challenge', to: b.playerId });
    expect(await wa.next('error')).toMatchObject({ code: 'unavailable' });
    const row = await waitForEvent(b.playerId, 'duel_challenge');
    expect(JSON.parse(row.data)).toEqual({ by: 'Challenger' });
    await vi.waitFor(() => expect(sends(calls, 77302)).toHaveLength(1));
    expect(button(sends(calls, 77302)[0])[0][0].web_app!.url).toBe('https://pixelarrow.app/?startapp=duel');
    wa.ws.close(1000);
  });

  it('clan: invite accepted, rank changed, kicked', async () => {
    const lead = await join(77401, 'Lead');
    mockTelegram({ getMe: { username: 'pixelarrow_bot' } });
    expect((await post('/api/online/clans', lead.token, { name: 'Ravens', tag: 'RVN' })).status).toBe(200);
    const inv = await post<{ code: string }>('/api/online/clans/invite', lead.token);
    const m = await join(77402, 'Newbie');
    await sameShard(lead, m);
    expect((await post('/api/online/clans/join', m.token, { code: inv.body.code })).status).toBe(200);
    expect(JSON.parse((await waitForEvent(lead.playerId, 'clan_joined')).data)).toEqual({ name: 'Newbie', clan: '[RVN] Ravens' });
    expect((await post('/api/online/clans/promote', lead.token, { playerId: m.playerId, role: 'officer' })).status).toBe(200);
    expect(JSON.parse((await waitForEvent(m.playerId, 'clan_role')).data)).toEqual({ clan: '[RVN] Ravens', role: 'officer' });
    expect((await post('/api/online/clans/kick', lead.token, { playerId: m.playerId })).status).toBe(200);
    expect(JSON.parse((await waitForEvent(m.playerId, 'clan_kicked')).data)).toEqual({ clan: '[RVN] Ravens' });
  });

  it('a marketplace sale notifies the seller', async () => {
    const seller = await join(77501, 'Seller');
    const buyer = await join(77502, 'Buyer');
    await sameShard(seller, buyer);
    const season = await currentSeason(DB());
    const shard = await shardOf(seller);
    const town = shard.world.all().find((x) => x.kind === 'town')!.id;
    for (const p of [seller, buyer]) await placeArmy(p, town, shard.id);
    await DB().prepare('UPDATE online_profiles SET wood = 50, gold = 1000 WHERE season_id = ?1').bind(season.id).run();
    mockTelegram();
    const l = await post<{ listing: { id: string } }>('/api/online/market/list', seller.token, { town, kind: 'resource', ref: 'wood', qty: 10, currency: 'gold', price: 40 });
    expect(l.status).toBe(200);
    expect((await post('/api/online/market/buy', buyer.token, { listingId: l.body.listing.id })).status).toBe(200);
    const row = await waitForEvent(seller.playerId, 'market_sold');
    expect(JSON.parse(row.data)).toMatchObject({ what: '10× wood', price: 40, currency: 'gold', gets: 36 });
  });

  it('the killing raid on a world boss tells the other damage dealers their share', { timeout: 30_000 }, async () => {
    const a = await join(77601);
    const b = await join(77602);
    const shard = await shardOf(a);
    const site = worldBossSites(shard.world, shard.seed)[0];
    const spot = must(shard.world.neighbours(site.loc).find((n) => shard.world.info(n).passable), `passable neighbour of boss site ${site.loc}`);
    for (const p of [a, b]) await placeArmy(p, spot, shard.id);
    await getJson('/api/online/boss', a.token);
    const parts = JSON.stringify(Array.from({ length: bossMaxHp(site.boss, site.level).parts }, () => 0));
    await DB().prepare('UPDATE world_bosses SET hp = 1, parts = ?2 WHERE boss = ?1 AND shard_id = ?3').bind(site.boss, parts, shard.id).run();
    await DB()
      .prepare('INSERT INTO world_boss_damage (season_id, shard_id, boss, player_id, clan_id, damage, raids, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, 3000, 4, ?5)')
      .bind(shard.season, shard.id, site.boss, b.playerId, Date.now())
      .run();
    mockTelegram();
    const t = await post<Ticket>('/api/online/boss/start', a.token, { boss: site.boss });
    expect(t.status).toBe(200);
    const sub = await post<{ killedNow: boolean }>('/api/online/boss/submit', a.token, { ticket: t.body.ticket, ...play(t.body.setup) });
    expect(sub.body.killedNow).toBe(true);
    const row = await waitForEvent(b.playerId, 'boss_slain');
    expect(JSON.parse(row.data)).toMatchObject({ boss: site.boss, loc: site.loc });
    expect(JSON.parse(row.data).share).toBeGreaterThan(0.5);
    expect((await outbox(a.playerId)).length).toBe(0);
  });

  it('season ending (3 days, then 1 day) and a full treasury come from the scheduled job', async () => {
    const p = await join(77701);
    const q = await join(77702);
    await api('/api/notify/settings', { method: 'PUT', token: q.token, json: { on: { season: false } } });
    const season = await DB().prepare("SELECT id, ends_at FROM online_seasons WHERE status = 'active'").first<{ id: number; ends_at: number }>();
    const in2days = season!.ends_at - 2 * 24 * 3_600_000;
    expect(await seasonNotices(DB(), season!.ends_at - 5 * 24 * 3_600_000)).toBe(0);
    expect(await seasonNotices(DB(), in2days)).toBeGreaterThanOrEqual(1);
    expect(await seasonNotices(DB(), in2days + 1000)).toBe(0); // once
    expect((await outbox(p.playerId)).map((r) => [r.event, JSON.parse(r.data).days])).toEqual([['season_ending', 3]]);
    expect(await outbox(q.playerId)).toEqual([]); // opted out
    await seasonNotices(DB(), season!.ends_at - 3_600_000);
    expect((await outbox(p.playerId)).map((r) => JSON.parse(r.data).days)).toEqual([3, 1]);

    // the treasury: the oldest uncollected region reached 24 h
    const now = Date.now();
    await DB().prepare('UPDATE online_regions SET accrued_at = ?1 WHERE owner_id = ?2').bind(now - 25 * 3_600_000, p.playerId).run();
    await DB().prepare('UPDATE online_regions SET accrued_at = ?1 WHERE owner_id = ?2').bind(now - 3_600_000, q.playerId).run();
    expect(await incomeNotices(DB(), now)).toBeGreaterThanOrEqual(1);
    expect(await incomeNotices(DB(), now + 1000)).toBe(0);
    expect((await outbox(p.playerId)).filter((r) => r.event === 'income_full')).toHaveLength(1);
    expect((await outbox(q.playerId)).filter((r) => r.event === 'income_full')).toHaveLength(0);
    // collecting resets the clock: the next full treasury is a new notice
    expect((await post('/api/online/collect', p.token)).status).toBe(200);
    const calls = mockTelegram();
    await runScheduled(env, now + 30 * 3_600_000 - ((now + 30 * 3_600_000) % 3_600_000)); // a full hour: the hourly income check runs
    expect((await outbox(p.playerId)).filter((r) => r.event === 'income_full')).toHaveLength(2);
    expect(calls.some((c) => c.method === 'setMyCommands')).toBe(true);
  });
});

describe('bot commands', () => {
  const msg = (id: number, text: string, lang = 'en') => ({ update_id: 1, message: { message_id: 1, chat: { id, type: 'private' }, from: { id, username: `u${id}`, language_code: lang }, text } });

  it('/terms links the legal pages in the user language', async () => {
    const calls = mockTelegram();
    await webhook(msg(77801, '/terms'));
    await webhook(msg(77801, '/terms', 'ru'));
    const [en, ru] = sends(calls, 77801).map((c) => c.params.text as string);
    expect(en).toContain('https://pixelarrow.app/terms');
    expect(en).toContain('https://pixelarrow.app/privacy');
    expect(en).toContain('https://pixelarrow.app/refunds');
    expect(ru).toContain('https://pixelarrow.app/ru/terms');
    expect(ru).toContain('Политика конфиденциальности');
  });

  it('/paysupport asks, logs the next message with the recent purchases, and acknowledges', async () => {
    const p = await join(77802);
    await DB()
      .prepare("INSERT INTO purchases (telegram_payment_charge_id, player_id, product_id, currency, stars_amount, payload, created_at) VALUES ('ch-ps-1', ?1, 'drachmae_100', 'XTR', 100, 'v1', ?2)")
      .bind(p.playerId, Date.now())
      .run();
    const calls = mockTelegram();
    await webhook(msg(77802, '/paysupport'));
    expect(sends(calls, 77802)[0].params.text).toContain('Describe the problem');
    expect(sends(calls, 77802)[0].params.reply_markup).toMatchObject({ force_reply: true });
    await webhook(msg(77802, 'I paid 100 Stars yesterday but got no Drachmae'));
    const ack = sends(calls, 77802)[1].params.text as string;
    expect(ack).toMatch(/request #\d+ has been logged/);
    const row = await DB().prepare("SELECT * FROM support_requests WHERE telegram_id = 77802").first<{ kind: string; text: string; player_id: number; purchases: string; status: string; username: string }>();
    expect(row).toMatchObject({ kind: 'payment', text: 'I paid 100 Stars yesterday but got no Drachmae', player_id: p.playerId, status: 'open', username: 'u77802' });
    expect(JSON.parse(row!.purchases)).toEqual([expect.objectContaining({ charge: 'ch-ps-1', product: 'drachmae_100', stars: 100, refunded: 0 })]);
    // a plain message afterwards is not logged again
    await webhook(msg(77802, 'thanks'));
    expect((await DB().prepare('SELECT COUNT(*) AS n FROM support_requests WHERE telegram_id = 77802').first<{ n: number }>())!.n).toBe(1);
    // the one-line form, in Russian
    await webhook(msg(77802, '/paysupport не пришли драхмы', 'ru'));
    expect(sends(calls, 77802).at(-1)!.params.text).toMatch(/обращение №\d+ зарегистрировано/);
    expect((await DB().prepare('SELECT COUNT(*) AS n FROM support_requests WHERE telegram_id = 77802').first<{ n: number }>())!.n).toBe(2);
  });

  it('/delete_my_data logs a deletion request', async () => {
    const calls = mockTelegram();
    await webhook(msg(77803, '/delete_my_data'));
    expect(sends(calls, 77803)[0].params.text).toMatch(/deletion request #\d+ has been logged/);
    expect(await DB().prepare("SELECT kind FROM support_requests WHERE telegram_id = 77803").first()).toEqual({ kind: 'deletion' });
  });

  it('/settings shows the switches; a button toggles a type', async () => {
    const p = await join(77804);
    const calls = mockTelegram();
    await webhook(msg(77804, '/settings'));
    const kb = button(sends(calls, 77804)[0]);
    expect(kb[0][0]).toMatchObject({ text: '✅ Attacks on your land', callback_data: 'ns:attack' });
    expect(kb.at(-1)![0].web_app!.url).toBe('https://pixelarrow.app/?startapp=settings');
    await webhook({ update_id: 2, callback_query: { id: 'cb1', from: { id: 77804 }, message: { message_id: 9, chat: { id: 77804 } }, data: 'ns:attack' } });
    const edit = calls.find((c) => c.method === 'editMessageText')!;
    expect((edit.params.reply_markup as { inline_keyboard: { text: string }[][] }).inline_keyboard[0][0].text).toBe('❌ Attacks on your land');
    expect(calls.find((c) => c.method === 'answerCallbackQuery')!.params).toMatchObject({ callback_query_id: 'cb1' });
    const view = await getJson<{ types: { type: string; on: boolean }[] }>('/api/notify/settings', p.token);
    expect(view.body.types.find((t) => t.type === 'attack')!.on).toBe(false);
    // someone who never played gets a Play button
    await webhook(msg(77899, '/settings'));
    expect(button(sends(calls, 77899)[0])[0][0].web_app!.url).toBe('https://pixelarrow.app');
  });

  it('registers the command menu in English and Russian once per version', async () => {
    await DB().prepare("DELETE FROM bot_meta WHERE key = 'commands_version'").run();
    const calls = mockTelegram({ getWebhookInfo: { url: 'https://pixelarrow.app/api/telegram/webhook', allowed_updates: ['message', 'pre_checkout_query'] } });
    expect(await ensureBotSetup(env)).toBe(true);
    expect(await ensureBotSetup(env)).toBe(false);
    const set = calls.filter((c) => c.method === 'setMyCommands');
    expect(set).toHaveLength(2);
    expect(set[0].params.commands).toEqual(BOT_COMMANDS.en);
    expect(set[1].params).toMatchObject({ language_code: 'ru', commands: BOT_COMMANDS.ru });
    expect(BOT_COMMANDS.en.map((c) => c.command)).toEqual(['start', 'settings', 'paysupport', 'terms', 'delete_my_data']);
    expect(calls.find((c) => c.method === 'setWebhook')!.params).toMatchObject({ allowed_updates: ['message', 'pre_checkout_query', 'callback_query'], secret_token: env.TELEGRAM_WEBHOOK_SECRET });
  });

  it('the legal pages are served as static assets in both languages', async () => {
    for (const [path, text] of [['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy'], ['/refunds', 'Refund Policy'], ['/ru/terms', 'Условия использования'], ['/ru/refunds', 'Политика возвратов']]) {
      const res = await api(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain(text);
    }
  });

  it('enqueue is idempotent per dedupe key', async () => {
    const p = await join(77805);
    await enqueue(DB(), [ev(p.playerId, 'income_full', 'k', {}), ev(p.playerId, 'income_full', 'k', {})], Date.now());
    expect(await outbox(p.playerId)).toHaveLength(1);
  });
});

