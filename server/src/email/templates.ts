/**
 * Account emails in English and Russian (ADR-0008 §4; design/ux/accounts-v6.md
 * §14 Q9): plain text plus minimal HTML. Links carry the token in the URL
 * fragment (`#t=`), so it never reaches server logs or the Referer header
 * (M-AF-6). The copy never says whether another address has an account.
 */
import type { EmailMessage } from './sender';

export type Lang = 'en' | 'ru';
export type Template = 'verify' | 'already_registered' | 'reset' | 'password_changed';

/** Russian when the hint (a language_code or an Accept-Language header) starts with "ru", else English. */
export function pickLang(...hints: (string | null | undefined)[]): Lang {
  for (const h of hints) {
    if (h && h.trim()) return /^\s*ru\b/i.test(h) ? 'ru' : 'en';
  }
  return 'en';
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

interface Copy {
  subject: string;
  lines: string[];
  button?: string;
  after?: string[];
}

const COPY: Record<Lang, Record<Template, Copy>> = {
  en: {
    verify: {
      subject: 'Confirm your Pixelarrow account',
      lines: ['Welcome to Pixelarrow!', 'Open this link to confirm your email and finish creating your account. It works for 24 hours.'],
      button: 'Confirm my email',
      after: ["If you didn't sign up, ignore this email: no account is created without this link."],
    },
    already_registered: {
      subject: 'You already have a Pixelarrow account',
      lines: ['Someone, probably you, tried to sign up to Pixelarrow with this email.', 'You already have an account. Log in, or reset your password if you forgot it.'],
      button: 'Open Pixelarrow',
      after: ["If this wasn't you, ignore this email. Your account is unchanged."],
    },
    reset: {
      subject: 'Reset your Pixelarrow password',
      lines: ['Open this link to set a new password. It works for 30 minutes and only once.', 'Setting a new password signs you out on every other device.'],
      button: 'Set a new password',
      after: ["If you didn't ask for this, ignore this email. Your password is unchanged."],
    },
    password_changed: {
      subject: 'Your Pixelarrow password was changed',
      lines: ['The password of your Pixelarrow account was just changed, and your other devices were signed out.'],
      after: ["If this wasn't you, reset your password now from the log-in screen, and contact support."],
    },
  },
  ru: {
    verify: {
      subject: 'Подтвердите аккаунт Pixelarrow',
      lines: ['Добро пожаловать в Pixelarrow!', 'Откройте ссылку, чтобы подтвердить почту и завершить создание аккаунта. Она действует 24 часа.'],
      button: 'Подтвердить почту',
      after: ['Если вы не регистрировались, просто проигнорируйте письмо: без этой ссылки аккаунт не создаётся.'],
    },
    already_registered: {
      subject: 'У вас уже есть аккаунт Pixelarrow',
      lines: ['Кто-то, вероятно вы, пытался зарегистрироваться в Pixelarrow с этой почтой.', 'Аккаунт у вас уже есть. Войдите или сбросьте пароль, если забыли его.'],
      button: 'Открыть Pixelarrow',
      after: ['Если это были не вы, проигнорируйте письмо. С аккаунтом ничего не произошло.'],
    },
    reset: {
      subject: 'Сброс пароля Pixelarrow',
      lines: ['Откройте ссылку, чтобы задать новый пароль. Она действует 30 минут и только один раз.', 'После смены пароля вы выйдете из аккаунта на всех остальных устройствах.'],
      button: 'Задать новый пароль',
      after: ['Если вы не запрашивали сброс, проигнорируйте письмо. Пароль не изменился.'],
    },
    password_changed: {
      subject: 'Пароль Pixelarrow изменён',
      lines: ['Пароль вашего аккаунта Pixelarrow только что изменён, а на остальных устройствах выполнен выход.'],
      after: ['Если это были не вы, сразу сбросьте пароль на экране входа и напишите в поддержку.'],
    },
  },
};

/** Builds one message. `link` is the full URL (with `#t=<token>` for the token templates). */
export function renderEmail(template: Template, lang: Lang, to: string, link?: string): EmailMessage {
  const c = COPY[lang][template];
  const text = [...c.lines, ...(link ? ['', link] : []), ...(c.after ? ['', ...c.after] : []), '', '— Pixelarrow'].join('\n');
  const p = (s: string) => `<p>${esc(s)}</p>`;
  const html = [
    '<!doctype html><html><body style="font-family:sans-serif;line-height:1.5;color:#222">',
    ...c.lines.map(p),
    link ? `<p><a href="${esc(link)}">${esc(c.button ?? link)}</a></p><p style="font-size:12px;color:#666">${esc(link)}</p>` : '',
    ...(c.after ?? []).map(p),
    '<p>— Pixelarrow</p></body></html>',
  ].join('');
  return { to, subject: c.subject, text, html };
}
