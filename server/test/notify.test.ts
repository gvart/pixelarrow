import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStartParam } from '../../src/online/deeplink';
import { enqueue, ev, flushDue, flushPlayer, isQuiet, NOTIFY_RULES, notify } from '../src/notify/outbox';
import { ensureBotSetup, runScheduled, seasonNotices } from '../src/notify/jobs';
import { buttonUrl, render } from '../src/notify/templates';
import { BOT_COMMANDS } from '../src/bot/commands';
import { api, mockTelegram, webhook, type BotCall } from './helpers';
import { DB, fresh, getJson, join, post } from './onlineHelpers';

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
    { timeout: 30_000, interval: 50 },
  );
  return row!;
}

const sends = (calls: BotCall[], chat?: number) => calls.filter((c) => c.method === 'sendMessage' && (chat === undefined || c.params.chat_id === chat));
const button = (c: BotCall) => (c.params.reply_markup as { inline_keyboard: { text: string; web_app?: { url: string }; callback_data?: string }[][] }).inline_keyboard;

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
  it('renders one event, folds several challenges into one message, and speaks Russian', () => {
    const one = render('en', 'clan', [{ event: 'clan_joined', data: { name: 'Brasidas', clan: '[ABC] Kites' } }]);
    expect(one.text).toContain('Brasidas joined [ABC] Kites through your invite');
    expect(one.text).toContain('/settings');
    expect(one.route).toEqual({ kind: 'clan' });
    const many = render('en', 'duel', ['A', 'B', 'C', 'D'].map((by) => ({ event: 'duel_challenge' as const, data: { by } })));
    expect(many.text).toContain('While you were away, 4 commanders challenged you to duels: A, B, C and 1 more.');
    expect(many.route).toEqual({ kind: 'duel' });
    const ru = render('ru', 'clan', [{ event: 'clan_role', data: { clan: '[ABC] Kites', role: 'officer' } }]);
    expect(ru.text).toContain('Ваш ранг в клане [ABC] Kites: офицер.');
    expect(ru.button).toBe('🏛 Открыть клан');
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
      ['duel', { event: 'duel_challenge', data: { by: 'Y' } }, 'duel'],
      ['clan', { event: 'clan_joined', data: { name: 'Z', clan: '[ABC] Kites' } }, 'myclan'],
      ['clan', { event: 'clan_kicked', data: { clan: '[ABC] Kites' } }, 'income'],
      ['season', { event: 'season_ending', data: { days: 3 } }, 'season'],
    ];
    for (const [type, e, param] of cases) {
      const r = render('en', type, [e]);
      const url = buttonUrl('https://play.pixelarrow.app', r.route);
      expect(url).toBe(`https://play.pixelarrow.app/?startapp=${param}`);
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
    const e = ev(p.playerId, 'clan_role', 'role:1', { clan: '[ABC] Kites', role: 'officer' });
    await notify(env, [e]);
    await notify(env, [e]);
    const sent = sends(calls, 77001);
    expect(sent).toHaveLength(1);
    expect(sent[0].params.text).toContain('Your rank in [ABC] Kites is now: Officer.');
    expect(button(sent[0])[0][0].web_app!.url).toBe('https://play.pixelarrow.app/?startapp=myclan');
    expect((await outbox(p.playerId)).map((r) => r.status)).toEqual(['sent']);
  });

  it('respects the per-type opt-out (settings API) and keeps the other types', async () => {
    const p = await join(77002);
    const calls = mockTelegram();
    const put = await api('/api/notify/settings', { method: 'PUT', token: p.token, json: { on: { duel: false }, tzOffset: 120 } });
    expect(put.status).toBe(200);
    const view = await put.json<{ types: { type: string; on: boolean }[]; quiet: boolean; tzOffset: number; blocked: boolean }>();
    expect(view.types.find((t) => t.type === 'duel')!.on).toBe(false);
    expect(view.types.find((t) => t.type === 'clan')!.on).toBe(true);
    expect(view).toMatchObject({ quiet: true, tzOffset: 120, blocked: false });
    const noon = Date.UTC(2026, 9, 7, 10, 0); // 12:00 local
    await notify(env, [ev(p.playerId, 'duel_challenge', 'duel:x', { by: 'Kleon' }), ev(p.playerId, 'clan_kicked', 'kick:x', { clan: '[ABC] Kites' })], { now: noon });
    expect(sends(calls, 77002).map((c) => c.params.text as string).join()).toContain('removed from the clan');
    expect(sends(calls, 77002)).toHaveLength(1);
    expect(Object.fromEntries((await outbox(p.playerId)).map((r) => [r.event, r.status]))).toEqual({ duel_challenge: 'skipped', clan_kicked: 'sent' });
    // the settings read back; bad input is refused
    expect((await getJson<{ types: { type: string; on: boolean }[] }>('/api/notify/settings', p.token)).body.types.filter((t) => !t.on).map((t) => t.type)).toEqual(['duel']);
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
    await notify(env, [ev(p.playerId, 'clan_joined', 'join:1', { name: 'Brasidas', clan: '[ABC] Kites' })], { now: night + 55 * MIN });
    await flushPlayer(env, p.playerId, Date.UTC(2026, 9, 7, 8, 0));
    const sent = sends(calls, 77003);
    expect(sent).toHaveLength(1);
    expect(sent[0].params.text).toContain('Brasidas joined [ABC] Kites');
    expect(Object.fromEntries((await outbox(p.playerId)).map((r) => [r.event, r.status]))).toEqual({ duel_challenge: 'skipped', clan_joined: 'sent' });
  });

  it('coalesces repeated events into one message after the window and caps messages per hour', async () => {
    const p = await join(77004);
    const calls = mockTelegram();
    const t0 = Date.UTC(2026, 9, 7, 12, 0);
    const raid = (i: number, held: boolean) => ev(p.playerId, 'duel_defence', `raid:${i}`, { by: `Foe${i}`, held });
    await notify(env, [raid(1, true)], { now: t0 });
    expect(sends(calls, 77004)).toHaveLength(1); // the first one goes at once
    await notify(env, [raid(2, true)], { now: t0 + 2 * MIN });
    await notify(env, [raid(3, false)], { now: t0 + 3 * MIN });
    await notify(env, [raid(4, true)], { now: t0 + 5 * MIN });
    await notify(env, [raid(5, true)], { now: t0 + 6 * MIN });
    expect(sends(calls, 77004)).toHaveLength(1); // inside the coalescing window: waiting
    await flushDue(env, t0 + 10 * MIN);
    expect(sends(calls, 77004)).toHaveLength(1);
    await flushDue(env, t0 + NOTIFY_RULES.coalesceMs.duel + 1);
    const sent = sends(calls, 77004);
    expect(sent).toHaveLength(2);
    expect(sent[1].params.text).toContain('4 raids on your defence team. Held: 3, lost: 1.');
    expect((await outbox(p.playerId)).every((r) => r.status === 'sent')).toBe(true);

    // the hourly budget: other types still go until it is spent, then everything waits
    const t1 = t0 + 20 * MIN;
    await notify(env, [ev(p.playerId, 'clan_joined', 'join:a', { name: 'Z', clan: '[ABC] Kites' })], { now: t1 });
    await notify(env, [ev(p.playerId, 'season_ending', 'season:a', { days: 3 })], { now: t1 });
    expect(sends(calls, 77004)).toHaveLength(NOTIFY_RULES.maxPerHour);
    await notify(env, [ev(p.playerId, 'clan_kicked', 'kick:a', { clan: '[ABC] Kites' })], { now: t1 + NOTIFY_RULES.coalesceMs.clan + MIN });
    expect(sends(calls, 77004)).toHaveLength(NOTIFY_RULES.maxPerHour);
    expect((await outbox(p.playerId)).find((r) => r.event === 'clan_kicked')!.status).toBe('pending');
    // an hour after the first message the budget frees up
    await flushDue(env, t0 + 61 * MIN);
    expect(sends(calls, 77004)).toHaveLength(NOTIFY_RULES.maxPerHour + 1);
  });

  it('a blocked bot (403) disables delivery until the player sends /start again; 429 just retries', async () => {
    const p = await join(77005);
    let calls = telegramFailing(403, 'Forbidden: bot was blocked by the user');
    await notify(env, [ev(p.playerId, 'clan_kicked', 'kick:b1', { clan: '[ABC] Kites' }), ev(p.playerId, 'season_ending', 'season:b1', { days: 3 })]);
    expect(sends(calls)).toHaveLength(1); // stopped at the first 403
    const st = await DB().prepare('SELECT blocked_at FROM notify_settings WHERE player_id = ?1').bind(p.playerId).first<{ blocked_at: number | null }>();
    expect(st!.blocked_at).toBeGreaterThan(0);
    expect((await outbox(p.playerId)).every((r) => r.status === 'skipped')).toBe(true);
    expect((await getJson<{ blocked: boolean }>('/api/notify/settings', p.token)).body.blocked).toBe(true);
    vi.restoreAllMocks();

    calls = mockTelegram();
    await notify(env, [ev(p.playerId, 'season_ending', 'season:b2', { days: 3 })]);
    expect(sends(calls, 77005)).toHaveLength(0);
    await webhook({ update_id: 5, message: { message_id: 1, chat: { id: 77005, type: 'private' }, from: { id: 77005 }, text: '/start' } });
    await notify(env, [ev(p.playerId, 'season_ending', 'season:b3', { days: 3 })]);
    expect(sends(calls, 77005).map((c) => c.params.text as string).some((t) => t.includes('The season ends in 3 days'))).toBe(true);
    vi.restoreAllMocks();

    calls = telegramFailing(429, 'Too Many Requests: retry after 5');
    await notify(env, [ev(p.playerId, 'clan_joined', 'join:b4', { name: 'Z', clan: '[ABC] Kites' })]);
    expect((await outbox(p.playerId)).find((r) => r.event === 'clan_joined')!.status).toBe('pending');
  });
});

describe('event triggers', () => {
  it('clan: invite accepted, rank changed, kicked', async () => {
    const lead = await join(77401, 'Lead');
    mockTelegram({ getMe: { username: 'pixelarrow_bot' } });
    expect((await post('/api/online/clans', lead.token, { name: 'Ravens', tag: 'RVN' })).status).toBe(200);
    const inv = await post<{ code: string }>('/api/online/clans/invite', lead.token);
    const m = await join(77402, 'Newbie');
    expect((await post('/api/online/clans/join', m.token, { code: inv.body.code })).status).toBe(200);
    expect(JSON.parse((await waitForEvent(lead.playerId, 'clan_joined')).data)).toEqual({ name: m.name, clan: '[RVN] Ravens' });
    expect((await post('/api/online/clans/promote', lead.token, { playerId: m.playerId, role: 'officer' })).status).toBe(200);
    expect(JSON.parse((await waitForEvent(m.playerId, 'clan_role')).data)).toEqual({ clan: '[RVN] Ravens', role: 'officer' });
    expect((await post('/api/online/clans/kick', lead.token, { playerId: m.playerId })).status).toBe(200);
    expect(JSON.parse((await waitForEvent(m.playerId, 'clan_kicked')).data)).toEqual({ clan: '[RVN] Ravens' });
  });

  it('season ending (3 days, then 1 day) comes from the scheduled job', async () => {
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

    const now = Date.now();
    const calls = mockTelegram();
    await runScheduled(env, now);
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
    // Legal pages live on the landing (LANDING_URL), never on the game host (ADR-0007).
    expect(`${en}${ru}`).not.toContain('play.pixelarrow.app');
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

  it('/settings shows the switches; a button toggles a type', async () => {
    const p = await join(77804);
    const calls = mockTelegram();
    await webhook(msg(77804, '/settings'));
    const kb = button(sends(calls, 77804)[0]);
    expect(kb[0][0]).toMatchObject({ text: '✅ Duel challenges', callback_data: 'ns:duel' });
    expect(kb.at(-1)![0].web_app!.url).toBe('https://play.pixelarrow.app/?startapp=settings');
    await webhook({ update_id: 2, callback_query: { id: 'cb1', from: { id: 77804 }, message: { message_id: 9, chat: { id: 77804 } }, data: 'ns:duel' } });
    const edit = calls.find((c) => c.method === 'editMessageText')!;
    expect((edit.params.reply_markup as { inline_keyboard: { text: string }[][] }).inline_keyboard[0][0].text).toBe('❌ Duel challenges');
    expect(calls.find((c) => c.method === 'answerCallbackQuery')!.params).toMatchObject({ callback_query_id: 'cb1' });
    const view = await getJson<{ types: { type: string; on: boolean }[] }>('/api/notify/settings', p.token);
    expect(view.body.types.find((t) => t.type === 'duel')!.on).toBe(false);
    // someone who never played gets a Play button
    await webhook(msg(77899, '/settings'));
    expect(button(sends(calls, 77899)[0])[0][0].web_app!.url).toBe('https://play.pixelarrow.app');
  });

  it('registers the command menu in English and Russian once per version', async () => {
    await DB().prepare("DELETE FROM bot_meta WHERE key = 'commands_version'").run();
    const calls = mockTelegram({ getWebhookInfo: { url: 'https://play.pixelarrow.app/api/telegram/webhook', allowed_updates: ['message', 'pre_checkout_query'] } });
    expect(await ensureBotSetup(env)).toBe(true);
    expect(await ensureBotSetup(env)).toBe(false);
    const set = calls.filter((c) => c.method === 'setMyCommands');
    expect(set).toHaveLength(2);
    expect(set[0].params.commands).toEqual(BOT_COMMANDS.en);
    expect(set[1].params).toMatchObject({ language_code: 'ru', commands: BOT_COMMANDS.ru });
    expect(BOT_COMMANDS.en.map((c) => c.command)).toEqual(['start', 'settings', 'paysupport', 'terms', 'delete_my_data']);
    expect(calls.find((c) => c.method === 'setWebhook')!.params).toMatchObject({ allowed_updates: ['message', 'pre_checkout_query', 'callback_query'], secret_token: env.TELEGRAM_WEBHOOK_SECRET });
  });

  it('enqueue is idempotent per dedupe key', async () => {
    const p = await join(77805);
    await enqueue(DB(), [ev(p.playerId, 'season_ending', 'k', { days: 3 }), ev(p.playerId, 'season_ending', 'k', { days: 3 })], Date.now());
    expect(await outbox(p.playerId)).toHaveLength(1);
  });
});

