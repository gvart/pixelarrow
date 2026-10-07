/**
 * Telegram bot webhook. Register it with setWebhook(url, secret_token = TELEGRAM_WEBHOOK_SECRET)
 * (see server/README.md); every update must carry that secret in
 * X-Telegram-Bot-Api-Secret-Token.
 *
 * Handled: /start (button opening the game), pre_checkout_query (validated
 * against products.ts), successful_payment (recorded idempotently) and
 * refunded_payment. Everything else is acknowledged and ignored. A 5xx makes
 * Telegram retry, which is what we want if D1 hiccups while recording a payment.
 */
import { Hono } from 'hono';
import { safeEqual } from '../crypto';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { db, secret } from '../middleware';
import { checkPreCheckout, recordPayment, recordRefund, type PreCheckoutQuery, type RefundedPayment, type SuccessfulPayment } from '../payments';
import { callBot } from '../telegramApi';
import type { TelegramUser } from '../telegramAuth';
import { CLAN_INVITE_PREFIX, inviteCodeFrom } from '../../../src/online/rules';

interface Message {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
  successful_payment?: SuccessfulPayment;
  refunded_payment?: RefundedPayment;
}

interface Update {
  update_id: number;
  message?: Message;
  pre_checkout_query?: PreCheckoutQuery;
}

export const webhook = new Hono<AppEnv>();

webhook.post('/webhook', async (c) => {
  const expected = secret(c.env, 'TELEGRAM_WEBHOOK_SECRET');
  const got = c.req.header('x-telegram-bot-api-secret-token') ?? '';
  if (!safeEqual(got, expected)) throw new ApiError(401, 'unauthorized', 'Bad webhook secret');
  const botToken = secret(c.env, 'TELEGRAM_BOT_TOKEN');

  let update: Update;
  try {
    update = await c.req.json<Update>();
  } catch {
    throw badRequest('Body is not valid JSON');
  }
  const gameUrl = c.env.GAME_URL || 'https://pixelarrow.app';

  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const problem = await checkPreCheckout(db(c.env), q);
    await callBot(botToken, 'answerPreCheckoutQuery', problem ? { pre_checkout_query_id: q.id, ok: false, error_message: problem } : { pre_checkout_query_id: q.id, ok: true });
    return c.json({ ok: true });
  }

  const msg = update.message;
  if (msg?.successful_payment && msg.from) {
    await recordPayment(db(c.env), msg.from, msg.successful_payment);
    return c.json({ ok: true });
  }
  if (msg?.refunded_payment) {
    await recordRefund(db(c.env), msg.refunded_payment);
    return c.json({ ok: true });
  }
  const start = msg?.text ? /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(msg.text) : null;
  if (msg && start) {
    // `/start clan_<code>` (a clan invite opened through the bot): carry the code into the game URL.
    const code = inviteCodeFrom(start[1]);
    const url = code ? `${gameUrl}${gameUrl.includes('?') ? '&' : '?'}startapp=${CLAN_INVITE_PREFIX}${code}` : gameUrl;
    await callBot(botToken, 'sendMessage', {
      chat_id: msg.chat.id,
      text: code ? 'You were invited to a clan! Tap below to join it in the game.' : 'Hail, commander! Your phalanx awaits. Tap below to take the field.',
      reply_markup: { inline_keyboard: [[{ text: code ? '⚔ Join the clan' : '⚔ Play Pixelarrow', web_app: { url } }]] },
    });
  }
  return c.json({ ok: true });
});
