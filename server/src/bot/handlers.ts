/**
 * Bot commands besides /start (server/src/routes/webhook.ts dispatches):
 *
 *   /settings        notification switches as inline buttons (callback_query
 *                    `ns:<type>` / `ns:quiet` toggles), plus a button opening
 *                    Settings → Notifications in the game
 *   /paysupport      help with a purchase: `/paysupport <text>`, or the next
 *                    message, is logged to support_requests (with the player's
 *                    last Stars purchases) and acknowledged
 *   /terms           links to the terms, privacy policy and refund policy
 *   /delete_my_data  a button opening Settings → Account, where deletion
 *                    needs re-auth (ADR-0009 §7). A banned player can't open
 *                    the game, so the bot deletes that account itself after a
 *                    confirmation (callback_query `del:go`, `del:yes`, `del:no`)
 *
 * Replies are in Russian for ru/uk/be/kk Telegram languages, else English.
 */
import type { Env } from '../env';
import { deleteAccount } from '../account/delete';
import { getPlayerByTelegramId } from '../players';
import { tryBot } from '../telegramApi';
import type { TelegramUser } from '../telegramAuth';
import { disabledSet, getSettings, type NotifySettingsRow } from '../notify/outbox';
import { saveSettings } from '../notify/routes';
import { buttonUrl, langOf, NOTIFY_TYPES, type Lang, type NotifyType } from '../notify/templates';
import { landingUrl as landingUrlOf } from '../urls';

export interface BotMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
}

export interface CallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

const TYPE_LABEL: Record<Lang, Record<NotifyType, string>> = {
  en: { duel: 'Duel challenges', clan: 'Clan news', season: 'Season ending' },
  ru: { duel: 'Вызовы на дуэль', clan: 'Новости клана', season: 'Конец сезона' },
};

/** The legal pages (static assets of the landing Worker on LANDING_URL, ADR-0007). */
function legalUrls(landingUrl: string, lang: Lang) {
  const base = `${landingUrl.replace(/\/+$/, '')}${lang === 'ru' ? '/ru' : ''}`;
  return { terms: `${base}/terms`, privacy: `${base}/privacy`, refunds: `${base}/refunds` };
}

const SUPPORT_STATE = 'paysupport';
const SUPPORT_WAIT_MS = 30 * 60_000;
const SUPPORT_PER_DAY = 5;
const MAX_TEXT = 2000;

const TXT = {
  en: {
    needGame: 'Open the game once first, then your notification settings appear here.',
    play: '⚔ Play Pixelarrow',
    settingsHead: 'Notifications from Pixelarrow. Tap to switch one on or off:',
    quietOn: '🌙 Quiet hours 23:00–08:00: on',
    quietOff: '🌙 Quiet hours 23:00–08:00: off',
    quietUnknown: '\n(Quiet hours start working once you open the game: it tells us your time zone.)',
    openSettings: '⚙ Open in the game',
    saved: 'Saved',
    supportAsk:
      'Need help with a purchase (Telegram Stars or Drachmae)?\n\nDescribe the problem in your next message: what you bought, when, and what went wrong. We log it together with your recent purchases and get back to you here in Telegram.\n\nRefunds follow our refund policy: /terms',
    supportAck: (id: number) => `Thank you! Your request #${id} has been logged. We will get back to you here in Telegram. Please do not dispute the payment with Telegram before we have answered.`,
    supportLimit: 'You have already sent several requests today. We will answer them as soon as we can.',
    terms: (u: ReturnType<typeof legalUrls>) => `Pixelarrow legal pages:\n\n📜 Terms of Service: ${u.terms}\n🔒 Privacy Policy: ${u.privacy}\n💫 Refunds: ${u.refunds}\n\nHelp with a purchase: /paysupport`,
    deleteNoAccount: 'There is no Pixelarrow account for this Telegram account, so there is nothing to delete.',
    deleteOpen:
      'To delete your account and all its data, open Settings → Account in the game and choose Delete account. It happens at once and cannot be undone. Records of Stars payments are kept as long as the law requires. Details: /terms',
    deleteOpenButton: '⚙ Open Settings',
    deleteBanned:
      'This account is banned, so it cannot be opened in the game. You can still delete it and all its data here. It happens at once and cannot be undone. Records of Stars payments are kept as long as the law requires. Details: /terms',
    deleteButton: '🗑 Delete my account',
    deleteConfirm: 'Delete your account for good? Your progress, items and settings are erased now. This cannot be undone.',
    deleteYes: 'Yes, delete it',
    deleteNo: 'Cancel',
    deleteDone: 'Your account and its data have been deleted.',
    deleteCancelled: 'Cancelled. Nothing was deleted.',
    deleteBusy: 'Your account is in a battle or a duel right now. Try again in a few minutes.',
    deleteLater: 'Your account is being deleted. It finishes within a day.',
  },
  ru: {
    needGame: 'Сначала откройте игру, и здесь появятся настройки уведомлений.',
    play: '⚔ Играть в Pixelarrow',
    settingsHead: 'Уведомления Pixelarrow. Нажмите, чтобы включить или выключить:',
    quietOn: '🌙 Тихие часы 23:00–08:00: вкл',
    quietOff: '🌙 Тихие часы 23:00–08:00: выкл',
    quietUnknown: '\n(Тихие часы заработают, когда вы откроете игру: она сообщит ваш часовой пояс.)',
    openSettings: '⚙ Открыть в игре',
    saved: 'Сохранено',
    supportAsk:
      'Нужна помощь с покупкой (Telegram Stars или драхмы)?\n\nОпишите проблему следующим сообщением: что вы купили, когда и что пошло не так. Мы сохраним обращение вместе с вашими последними покупками и ответим здесь, в Telegram.\n\nВозвраты — по нашей политике возвратов: /terms',
    supportAck: (id: number) => `Спасибо! Ваше обращение №${id} зарегистрировано. Мы ответим здесь, в Telegram. Пожалуйста, не оспаривайте платёж в Telegram, пока мы не ответили.`,
    supportLimit: 'Сегодня вы уже отправили несколько обращений. Мы ответим на них как можно скорее.',
    terms: (u: ReturnType<typeof legalUrls>) => `Документы Pixelarrow:\n\n📜 Условия использования: ${u.terms}\n🔒 Политика конфиденциальности: ${u.privacy}\n💫 Возвраты: ${u.refunds}\n\nПомощь с покупкой: /paysupport`,
    deleteNoAccount: 'Для этого аккаунта Telegram нет аккаунта Pixelarrow, удалять нечего.',
    deleteOpen:
      'Чтобы удалить аккаунт и все его данные, откройте в игре Настройки → Аккаунт и выберите «Удалить аккаунт». Удаление происходит сразу, отменить его нельзя. Записи о платежах Stars хранятся столько, сколько требует закон. Подробнее: /terms',
    deleteOpenButton: '⚙ Открыть настройки',
    deleteBanned:
      'Этот аккаунт заблокирован, поэтому открыть его в игре нельзя. Но удалить его и все его данные можно здесь. Удаление происходит сразу, отменить его нельзя. Записи о платежах Stars хранятся столько, сколько требует закон. Подробнее: /terms',
    deleteButton: '🗑 Удалить мой аккаунт',
    deleteConfirm: 'Удалить аккаунт навсегда? Прогресс, предметы и настройки будут стёрты сейчас же. Отменить это нельзя.',
    deleteYes: 'Да, удалить',
    deleteNo: 'Отмена',
    deleteDone: 'Ваш аккаунт и его данные удалены.',
    deleteCancelled: 'Отменено. Ничего не удалено.',
    deleteBusy: 'Ваш аккаунт сейчас в бою или на дуэли. Попробуйте через несколько минут.',
    deleteLater: 'Ваш аккаунт удаляется. Это завершится в течение суток.',
  },
};

const send = (env: Env, params: Record<string, unknown>) => tryBot(env.TELEGRAM_BOT_TOKEN!, 'sendMessage', { link_preview_options: { is_disabled: true }, ...params });

function settingsKeyboard(s: NotifySettingsRow | null, lang: Lang, gameUrl: string) {
  const off = disabledSet(s);
  const t = TXT[lang];
  const rows: unknown[][] = NOTIFY_TYPES.map((type) => [{ text: `${off.has(type) ? '❌' : '✅'} ${TYPE_LABEL[lang][type]}`, callback_data: `ns:${type}` }]);
  rows.push([{ text: s && !s.quiet ? t.quietOff : t.quietOn, callback_data: 'ns:quiet' }]);
  rows.push([{ text: t.openSettings, web_app: { url: buttonUrl(gameUrl, { kind: 'settings' }) } }]);
  return { inline_keyboard: rows };
}

const settingsText = (s: NotifySettingsRow | null, lang: Lang) => TXT[lang].settingsHead + (s?.tz_offset === null || s?.tz_offset === undefined ? TXT[lang].quietUnknown : '');

/** Handles a command or the awaited /paysupport text. Returns false when the message is not for these handlers. */
export async function handleCommand(env: Env, db: D1Database, msg: BotMessage, gameUrl: string, now = Date.now()): Promise<boolean> {
  const from = msg.from;
  if (!from || !msg.text || msg.chat.type !== 'private') return false;
  const lang = langOf(from.language_code);
  const t = TXT[lang];
  const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(msg.text.trim());
  const name = cmd?.[1].toLowerCase();
  const arg = cmd?.[2]?.trim() ?? '';

  if (name === 'settings') {
    const player = await getPlayerByTelegramId(db, from.id);
    if (!player) {
      await send(env, { chat_id: msg.chat.id, text: t.needGame, reply_markup: { inline_keyboard: [[{ text: t.play, web_app: { url: gameUrl } }]] } });
      return true;
    }
    const s = await getSettings(db, player.id);
    await send(env, { chat_id: msg.chat.id, text: settingsText(s, lang), reply_markup: settingsKeyboard(s, lang, gameUrl) });
    return true;
  }
  if (name === 'terms') {
    await send(env, { chat_id: msg.chat.id, text: t.terms(legalUrls(landingUrlOf(env), lang)) });
    return true;
  }
  if (name === 'paysupport') {
    if (arg) return logSupport(env, db, msg, 'payment', arg, now);
    await db
      .prepare('INSERT INTO bot_state (telegram_id, state, until) VALUES (?1, ?2, ?3) ON CONFLICT (telegram_id) DO UPDATE SET state = excluded.state, until = excluded.until')
      .bind(from.id, SUPPORT_STATE, now + SUPPORT_WAIT_MS)
      .run();
    await send(env, { chat_id: msg.chat.id, text: t.supportAsk, reply_markup: { force_reply: true, input_field_placeholder: lang === 'ru' ? 'Опишите проблему' : 'Describe the problem' } });
    return true;
  }
  if (name === 'delete_my_data') {
    const player = await getPlayerByTelegramId(db, from.id);
    if (!player) await send(env, { chat_id: msg.chat.id, text: t.deleteNoAccount });
    else if (player.banned_at) await send(env, { chat_id: msg.chat.id, text: t.deleteBanned, reply_markup: { inline_keyboard: [[{ text: t.deleteButton, callback_data: 'del:go' }]] } });
    else
      await send(env, {
        chat_id: msg.chat.id,
        text: t.deleteOpen,
        reply_markup: { inline_keyboard: [[{ text: t.deleteOpenButton, web_app: { url: buttonUrl(gameUrl, { kind: 'account' }) } }]] },
      });
    return true;
  }
  if (cmd) {
    // any other command ends a pending /paysupport conversation
    await db.prepare('DELETE FROM bot_state WHERE telegram_id = ?1').bind(from.id).run();
    return false;
  }
  // Plain text: the description a /paysupport asked for?
  const st = await db.prepare('SELECT state, until FROM bot_state WHERE telegram_id = ?1').bind(from.id).first<{ state: string; until: number }>();
  if (st?.state === SUPPORT_STATE && st.until > now) return logSupport(env, db, msg, 'payment', msg.text, now);
  return false;
}

async function logSupport(env: Env, db: D1Database, msg: BotMessage, kind: 'payment', text: string, now: number): Promise<boolean> {
  const from = msg.from!;
  const lang = langOf(from.language_code);
  const t = TXT[lang];
  await db.prepare('DELETE FROM bot_state WHERE telegram_id = ?1').bind(from.id).run();
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM support_requests WHERE telegram_id = ?1 AND created_at > ?2').bind(from.id, now - 24 * 3_600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= SUPPORT_PER_DAY) {
    await send(env, { chat_id: msg.chat.id, text: t.supportLimit });
    return true;
  }
  const player = await getPlayerByTelegramId(db, from.id);
  const purchases = player
    ? (
        await db
          .prepare('SELECT telegram_payment_charge_id AS charge, product_id AS product, stars_amount AS stars, created_at AS at, refunded FROM purchases WHERE player_id = ?1 ORDER BY created_at DESC LIMIT 5')
          .bind(player.id)
          .all()
      ).results
    : [];
  const row = await db
    .prepare(
      `INSERT INTO support_requests (kind, telegram_id, player_id, username, language, text, purchases, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`,
    )
    .bind(kind, from.id, player?.id ?? null, from.username ?? null, from.language_code ?? null, text.slice(0, MAX_TEXT), JSON.stringify(purchases), now)
    .first<{ id: number }>();
  const id = row?.id ?? 0;
  console.log(`support request #${id} (${kind}) from telegram user ${from.id}`);
  await send(env, { chat_id: msg.chat.id, text: t.supportAck(id) });
  return true;
}

/**
 * A banned player's deletion from the bot (/delete_my_data). The account is
 * always the presser's own (`from.id`, set by Telegram on a webhook that
 * carries our secret), never one named in the callback data.
 */
async function handleDeleteCallback(env: Env, db: D1Database, q: CallbackQuery, step: string, now: number): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const t = TXT[langOf(q.from.language_code)];
  const player = await getPlayerByTelegramId(db, q.from.id);
  const edit = (text: string, keyboard?: unknown[][]) =>
    q.message ? tryBot(token, 'editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) }) : null;
  if (!player || player.deleted_at || !player.banned_at) {
    // Players who can open the game delete there, with re-auth.
    await tryBot(token, 'answerCallbackQuery', { callback_query_id: q.id, text: player && !player.banned_at ? t.deleteOpenButton : t.deleteNoAccount });
    return;
  }
  if (step === 'go') await edit(t.deleteConfirm, [[{ text: t.deleteYes, callback_data: 'del:yes' }, { text: t.deleteNo, callback_data: 'del:no' }]]);
  else if (step === 'no') await edit(t.deleteCancelled);
  else if (step === 'yes') {
    const r = await deleteAccount(env, player.id, 'self', now);
    await edit(r === 'done' ? t.deleteDone : r === 'busy' ? t.deleteBusy : t.deleteLater);
  }
  await tryBot(token, 'answerCallbackQuery', { callback_query_id: q.id });
}

/** /settings buttons: toggles one type (or quiet hours) and redraws the keyboard; `del:*` is /delete_my_data. */
export async function handleCallback(env: Env, db: D1Database, q: CallbackQuery, gameUrl: string, now = Date.now()): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN!;
  const lang = langOf(q.from.language_code);
  const del = /^del:(go|yes|no)$/.exec(q.data ?? '');
  if (del) return handleDeleteCallback(env, db, q, del[1], now);
  const m = /^ns:([a-z]+)$/.exec(q.data ?? '');
  const player = m ? await getPlayerByTelegramId(db, q.from.id) : null;
  if (!m || !player) {
    await tryBot(token, 'answerCallbackQuery', { callback_query_id: q.id });
    return;
  }
  const cur = await getSettings(db, player.id);
  let row: NotifySettingsRow;
  if (m[1] === 'quiet') row = await saveSettings(db, player.id, { quiet: !(cur ? cur.quiet === 1 : true) }, now);
  else if ((NOTIFY_TYPES as readonly string[]).includes(m[1])) {
    const off = disabledSet(cur);
    const type = m[1] as NotifyType;
    if (off.has(type)) off.delete(type);
    else off.add(type);
    row = await saveSettings(db, player.id, { off }, now);
  } else {
    await tryBot(token, 'answerCallbackQuery', { callback_query_id: q.id });
    return;
  }
  if (q.message) {
    await tryBot(token, 'editMessageText', {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: settingsText(row, lang),
      reply_markup: settingsKeyboard(row, lang, gameUrl),
    });
  }
  await tryBot(token, 'answerCallbackQuery', { callback_query_id: q.id, text: TXT[lang].saved });
}
