/**
 * Outgoing email (ADR-0008 §4). Flows depend only on `EmailSender`, so the
 * transport can change (Email Service binding, REST API, another provider)
 * without touching them.
 *
 * `emailSenderFor` picks the dev outbox when DEV_EMAIL=1 (local and tests;
 * the deploy config refuses DEV_EMAIL), else the Email Service `send_email`
 * binding `EMAIL` from MAIL_FROM, else null (the mail flows then answer 503
 * `email_unavailable`).
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
  if (env.EMAIL && env.MAIL_FROM) return new BindingEmailSender(env.EMAIL, env.MAIL_FROM);
  return null;
}

/** Sends through the `send_email` binding; a failure rejects with the binding's error (its `code`, never the address). */
export class BindingEmailSender implements EmailSender {
  constructor(
    private readonly binding: SendEmail,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    await this.binding.send({ to: msg.to, from: this.from, subject: msg.subject, text: msg.text, html: msg.html });
  }
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
