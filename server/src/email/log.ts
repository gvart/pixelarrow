/**
 * Local dev and tests only (DEV_EMAIL=1): "sends" a message by writing it to
 * the dev_outbox table (migration 0017), where the developer or a test reads
 * the link. The deploy config must refuse DEV_EMAIL (V6-ACCT-04, N-SE-4), so
 * production never stores mail bodies, which hold live tokens.
 */
import type { EmailMessage, EmailSender } from './sender';

export class LogEmailSender implements EmailSender {
  constructor(private readonly db: D1Database) {}

  async send(msg: EmailMessage): Promise<void> {
    await this.db
      .prepare('INSERT INTO dev_outbox (to_addr, subject, text, html, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(msg.to, msg.subject, msg.text, msg.html, Date.now())
      .run();
  }
}
