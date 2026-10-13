/**
 * V6-LINK-04: the bot's /delete_my_data (ADR-0009 §7). A player opens
 * Settings → Account (deletion there needs re-auth); a banned player, who can't
 * open the game, deletes from the bot after a confirmation.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DELETED_NAME } from '../src/account/delete';
import { devLogin, mockTelegram, webhook, type BotCall } from './helpers';

const DB = () => env.DB!;
let tg = 7_500_000;

const msg = (id: number, text: string, lang = 'en') => ({ update_id: 1, message: { message_id: 1, chat: { id, type: 'private' }, from: { id, language_code: lang }, text } });
const press = (id: number, data: string) => webhook({ update_id: 2, callback_query: { id: `cb${id}`, from: { id }, message: { message_id: 9, chat: { id } }, data } });
const sent = (calls: BotCall[], method: string) => calls.filter((c) => c.method === method);
type Kb = { inline_keyboard: { text: string; callback_data?: string; web_app?: { url: string } }[][] };
const keyboard = (c: BotCall) => (c.params.reply_markup as Kb).inline_keyboard.flat();
const nameOf = async (pid: number) => (await DB().prepare('SELECT display_name FROM players WHERE id = ?1').bind(pid).first<{ display_name: string }>())!.display_name;

describe('/delete_my_data', () => {
  it('points a player to Settings → Account and deletes nothing', async () => {
    const me = await devLogin(++tg);
    const calls = mockTelegram();
    await webhook(msg(tg, '/delete_my_data'));
    const [reply] = sent(calls, 'sendMessage');
    expect(reply.params.text).toContain('Settings → Account');
    expect(keyboard(reply)).toEqual([{ text: expect.any(String), web_app: { url: 'https://play.pixelarrow.app/?startapp=settings' } }]);
    // A crafted confirmation does nothing for a player who can use the game.
    await press(tg, 'del:yes');
    expect(await nameOf(me.playerId)).not.toBe(DELETED_NAME);
    expect(await DB().prepare('SELECT COUNT(*) AS n FROM support_requests WHERE telegram_id = ?1').bind(tg).first()).toEqual({ n: 0 });
  });

  it('tells someone without an account so', async () => {
    const calls = mockTelegram();
    await webhook(msg(++tg, '/delete_my_data', 'ru'));
    expect(sent(calls, 'sendMessage')[0].params.text).toContain('нет аккаунта');
  });

  it('lets a banned player delete the account from the bot after confirming', async () => {
    const me = await devLogin(++tg);
    await DB().prepare('UPDATE players SET banned_at = ?2 WHERE id = ?1').bind(me.playerId, Date.now()).run();
    const calls = mockTelegram();
    await webhook(msg(tg, '/delete_my_data'));
    const [reply] = sent(calls, 'sendMessage');
    expect(keyboard(reply)).toEqual([{ text: expect.any(String), callback_data: 'del:go' }]);

    await press(tg, 'del:go');
    const ask = sent(calls, 'editMessageText')[0];
    expect(keyboard(ask).map((b) => b.callback_data)).toEqual(['del:yes', 'del:no']);
    expect(await nameOf(me.playerId)).not.toBe(DELETED_NAME);

    await press(tg, 'del:no');
    expect(await nameOf(me.playerId)).not.toBe(DELETED_NAME);

    await press(tg, 'del:yes');
    expect(await nameOf(me.playerId)).toBe(DELETED_NAME);
    expect(sent(calls, 'editMessageText').at(-1)!.params.text).toContain('deleted');
    expect(await DB().prepare('SELECT reason, finished_at IS NOT NULL AS done FROM deletion_jobs WHERE player_id = ?1').bind(me.playerId).first()).toEqual({ reason: 'self', done: 1 });
  });

  it('acts only on the presser’s own account', async () => {
    const victim = await devLogin(++tg);
    await DB().prepare('UPDATE players SET banned_at = ?2 WHERE id = ?1').bind(victim.playerId, Date.now()).run();
    mockTelegram();
    // Another Telegram user presses a confirmation (e.g. a forwarded or crafted one).
    await press(++tg, 'del:yes');
    expect(await nameOf(victim.playerId)).not.toBe(DELETED_NAME);
  });
});
