/**
 * Notices on every identity change (ADR-0009 §2.4, §4, §7; M-LK-4): an email
 * to the account's address(es) and a bot message to its Telegram chat. The
 * targets are read before the change, so an unlinked address or chat still
 * hears about it.
 *
 * These are security notices: they go out at once, after the response
 * (`defer`), and skip the notification outbox's opt-outs, quiet hours and
 * coalescing, and the per-address mail caps (M-AF-5 guards against mailing a
 * stranger; these go only to the account's own verified addresses, and every
 * trigger is behind re-auth or a single-use link). A failed send is logged by
 * kind only, never the address or chat id.
 */
import type { Env } from '../env';
import { sendWithTimeout, type EmailSender } from '../email/sender';
import { pickLang, renderEmail } from '../email/templates';
import { accountButtonUrl, langOf, renderAccountNotice, type AccountNotice } from './noticeTexts';
import { tryBot } from '../telegramApi';
import { gameUrl } from '../urls';
import { log } from '../telemetry/log';

export type NoticeKind = AccountNotice;

export interface NoticeTargets {
  /** Addresses as typed (for sending). */
  emails: string[];
  telegramId: number | null;
  /** players.language_code (Telegram's), the first language hint. */
  languageCode: string | null;
}

/** Queues the notices of one identity change; never throws. */
export type Notifier = (kind: NoticeKind, to: NoticeTargets) => void;

/** Who hears about a change on this player right now: its address and its Telegram chat. */
export async function noticeTargets(db: D1Database, pid: number): Promise<NoticeTargets> {
  const [ids, p] = await db.batch([
    db.prepare('SELECT kind, subject, email FROM auth_identities WHERE player_id = ?1').bind(pid),
    db.prepare('SELECT language_code FROM players WHERE id = ?1').bind(pid),
  ]);
  const rows = ids.results as { kind: 'telegram' | 'password'; subject: string; email: string | null }[];
  const tg = rows.find((r) => r.kind === 'telegram');
  return {
    emails: rows.filter((r) => r.kind === 'password').map((r) => r.email ?? r.subject),
    telegramId: tg ? Number(tg.subject) : null,
    languageCode: (p.results[0] as { language_code: string | null } | undefined)?.language_code ?? null,
  };
}

const failed = (channel: string, kind: NoticeKind) => (e: unknown) =>
  log('warn', 'account_notice_failed', { channel, kind, error: e instanceof Error ? e.name : 'non-error' });

/** Sends one notice email now (awaited); used by deletion, which must mail before the identities go. */
export async function sendNoticeEmail(mail: EmailSender | null, kind: NoticeKind, to: string, lang: string | null, acceptLanguage?: string | null): Promise<void> {
  if (!mail) return;
  await sendWithTimeout(mail, renderEmail(kind, pickLang(lang, acceptLanguage), to));
}

/** Sends one bot notice now; a chat that blocked the bot just doesn't get it. */
export async function sendNoticeBot(env: Env, kind: NoticeKind, chat: number, lang: string | null): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const msg = renderAccountNotice(langOf(lang), kind);
  const res = await tryBot(token, 'sendMessage', {
    chat_id: chat,
    text: msg.text,
    link_preview_options: { is_disabled: true },
    ...(msg.button ? { reply_markup: { inline_keyboard: [[{ text: msg.button, web_app: { url: accountButtonUrl(gameUrl(env)) } }]] } } : {}),
  });
  if (!res.ok) log('warn', 'account_notice_failed', { channel: 'bot', kind, status: res.status });
}

export function notifierFor(env: Env, mail: EmailSender | null, defer: (p: Promise<unknown>) => void, acceptLanguage?: string | null): Notifier {
  return (kind, to) => {
    for (const addr of to.emails) defer(sendNoticeEmail(mail, kind, addr, to.languageCode, acceptLanguage).catch(failed('email', kind)));
    if (to.telegramId !== null) defer(sendNoticeBot(env, kind, to.telegramId, to.languageCode).catch(failed('bot', kind)));
  };
}
