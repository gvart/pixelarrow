/**
 * Outgoing email (ADR-0008 §4). Flows depend only on `EmailSender`, so the
 * transport can change (Email Service binding, REST API, another provider)
 * without touching them.
 *
 * Seam for V6-ACCT-04: `emailSenderFor` returns the dev outbox when
 * DEV_EMAIL=1 and otherwise null (the mail flows then answer 503
 * `email_unavailable`). ACCT-04 adds the `send_email` binding `EMAIL` to Env and
 * wrangler.jsonc and returns a binding-backed sender here, e.g.
 * `env.EMAIL.send({ to, from: env.MAIL_FROM, subject, html, text })`.
 */
import type { Env } from '../env';
import { LogEmailSender } from './log';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** ADR-0008 §4: a send is awaited for at most this long. */
export const SEND_TIMEOUT_MS = 5_000;

/** The configured sender, or null when email is not set up. */
export function emailSenderFor(env: Env): EmailSender | null {
  if (env.DEV_EMAIL === '1' && env.DB) return new LogEmailSender(env.DB);
  return null;
}

/** Sends with a timeout; rejects on failure or timeout. */
export async function sendWithTimeout(sender: EmailSender, msg: EmailMessage, timeoutMs = SEND_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('email send timed out')), timeoutMs);
  });
  try {
    await Promise.race([sender.send(msg), timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
