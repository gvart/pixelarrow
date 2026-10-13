/**
 * V6-ACCT-03: the EmailSender seam (ADR-0008 §4) with fake senders: no
 * configured email is a uniform 503, a failing or hanging send never changes
 * the uniform reply and is logged without the address, and the templates.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { requestReset, signup, type FlowDeps } from '../src/auth/flows';
import { peppersFromEnv } from '../src/auth/password';
import { BindingEmailSender, emailSenderFor, sendWithTimeout, type EmailMessage, type EmailSender } from '../src/email/sender';
import { LogEmailSender } from '../src/email/log';
import { pickLang, renderEmail } from '../src/email/templates';
import { ApiError } from '../src/errors';

let n = 0;
const fresh = () => `sender.${++n}.${Date.now()}@example.com`;

function deps(mail: EmailSender | null): FlowDeps & { pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];
  return { db: env.DB!, peppers: peppersFromEnv(env), mail, gameUrl: 'https://play.pixelarrow.app', lang: 'en', defer: (p) => void pending.push(p), now: Date.now(), pending };
}

describe('EmailSender', () => {
  it('uses the dev outbox when DEV_EMAIL=1, else the send_email binding from MAIL_FROM, else none', () => {
    expect(emailSenderFor(env)).toBeInstanceOf(LogEmailSender);
    expect(env.MAIL_FROM).toBe('noreply@pixelarrow.app');
    expect(emailSenderFor({ ...env, DEV_EMAIL: undefined })).toBeInstanceOf(BindingEmailSender);
    expect(emailSenderFor({ ...env, DEV_EMAIL: undefined, EMAIL: undefined })).toBeNull();
    expect(emailSenderFor({ ...env, DEV_EMAIL: undefined, MAIL_FROM: undefined })).toBeNull();
  });

  it('sends through the binding from MAIL_FROM, with text and html', async () => {
    const sent: unknown[] = [];
    const binding = { send: async (m: unknown) => (sent.push(m), { messageId: 'm1' }) } as unknown as SendEmail;
    const sender = emailSenderFor({ ...env, DEV_EMAIL: undefined, EMAIL: binding })!;
    await sender.send({ to: 'a@example.com', subject: 'Hi', text: 't', html: '<p>h</p>' });
    expect(sent).toEqual([{ to: 'a@example.com', from: 'noreply@pixelarrow.app', subject: 'Hi', text: 't', html: '<p>h</p>' }]);
  });

  it('answers 503 email_unavailable when email is not configured, the same for any address', async () => {
    for (const run of [(d: FlowDeps) => signup(d, fresh(), 'a-fine-password'), (d: FlowDeps) => requestReset(d, fresh())]) {
      const err = await run(deps(null)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(503);
      expect((err as ApiError).code).toBe('email_unavailable');
    }
  });

  it('keeps sign-up uniform when the send fails: no throw, the pending token is kept, the log names no address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const email = fresh();
      const d = deps({ send: async () => Promise.reject(new Error(`boom for ${email}`)) });
      await expect(signup(d, email, 'a-fine-password')).resolves.toBeUndefined();
      await Promise.all(d.pending);
      const pending = await env.DB!.prepare(`SELECT COUNT(*) AS c FROM email_tokens WHERE email_norm = ?1 AND purpose = 'signup' AND used_at IS NULL`).bind(email).first<{ c: number }>();
      expect(pending!.c).toBe(1);
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('email_send_failed');
      expect(logged).not.toContain(email);
    } finally {
      warn.mockRestore();
    }
  });

  it('gives up on a hanging send after the timeout', async () => {
    const hang: EmailSender = { send: () => new Promise<void>(() => {}) };
    await expect(sendWithTimeout(hang, { to: 'a@b.co', subject: 's', text: 't', html: 'h' }, 30)).rejects.toThrow(/timed out/);
  });
});

describe('templates', () => {
  it('picks Russian from a ru language hint, else English', () => {
    expect(pickLang('ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru');
    expect(pickLang(undefined, 'ru')).toBe('ru');
    expect(pickLang('en-GB')).toBe('en');
    expect(pickLang(null)).toBe('en');
  });

  it('renders text and escaped HTML with the link, in both languages', () => {
    const link = 'https://play.pixelarrow.app/auth/reset#t=abc';
    for (const lang of ['en', 'ru'] as const) {
      const m: EmailMessage = renderEmail('reset', lang, 'p@example.com', link);
      expect(m.to).toBe('p@example.com');
      expect(m.text).toContain(link);
      expect(m.html).toContain(`href="${link}"`);
      expect(m.subject.length).toBeGreaterThan(5);
    }
    expect(renderEmail('verify', 'ru', 'x@example.com', 'https://x/#t=1').subject).toMatch(/Pixelarrow/);
    expect(renderEmail('verify', 'en', 'x@example.com', 'https://x/?a=<b>').html).toContain('&lt;b&gt;');
  });
});
