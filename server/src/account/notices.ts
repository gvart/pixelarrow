/**
 * Notices on every identity change (ADR-0009 §2.4, §4, §7; M-LK-4): an email
 * to the account's address(es). The targets are read before the change, so
 * an old address still hears about it.
 *
 * These are security notices: they go out at once, after the response
 * (`defer`), and skip the per-address mail caps (M-AF-5 guards against
 * mailing a stranger; these go only to the account's own verified addresses,
 * and every trigger is behind re-auth or a single-use link). A failed send is
 * logged by kind only, never the address.
 */
import { sendWithTimeout, type EmailSender } from '../email/sender';
import { pickLang, renderEmail } from '../email/templates';
import { log } from '../telemetry/log';

export type NoticeKind = 'email_added' | 'email_changed' | 'account_deleted';

export interface NoticeTargets {
  /** Addresses as typed (for sending). */
  emails: string[];
  /** players.language_code, the first language hint. */
  languageCode: string | null;
}

/** Queues the notices of one identity change; never throws. */
export type Notifier = (kind: NoticeKind, to: NoticeTargets) => void;

/** Who hears about a change on this player right now: its address(es). */
export async function noticeTargets(db: D1Database, pid: number): Promise<NoticeTargets> {
  const [ids, p] = await db.batch([
    db.prepare(`SELECT subject, email FROM auth_identities WHERE player_id = ?1 AND kind = 'password'`).bind(pid),
    db.prepare('SELECT language_code FROM players WHERE id = ?1').bind(pid),
  ]);
  return {
    emails: (ids.results as { subject: string; email: string | null }[]).map((r) => r.email ?? r.subject),
    languageCode: (p.results[0] as { language_code: string | null } | undefined)?.language_code ?? null,
  };
}

const failed = (kind: NoticeKind) => (e: unknown) => log('warn', 'account_notice_failed', { channel: 'email', kind, error: e instanceof Error ? e.name : 'non-error' });

/** Sends one notice email now (awaited); used by deletion, which must mail before the identities go. */
export async function sendNoticeEmail(mail: EmailSender | null, kind: NoticeKind, to: string, lang: string | null, acceptLanguage?: string | null): Promise<void> {
  if (!mail) return;
  await sendWithTimeout(mail, renderEmail(kind, pickLang(lang, acceptLanguage), to));
}

export function notifierFor(mail: EmailSender | null, defer: (p: Promise<unknown>) => void, acceptLanguage?: string | null): Notifier {
  return (kind, to) => {
    for (const addr of to.emails) defer(sendNoticeEmail(mail, kind, addr, to.languageCode, acceptLanguage).catch(failed(kind)));
  };
}
