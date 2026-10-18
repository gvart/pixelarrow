/**
 * Account emails in English and Russian (ADR-0008 §4; design/ux/accounts-v6.md
 * §14 Q9): plain text plus minimal HTML. Links carry the token in the URL
 * fragment (`#t=`), so it never reaches server logs or the Referer header
 * (M-AF-6). The copy never says whether another address has an account.
 */
import type { EmailMessage } from './sender';

export type Lang = 'en' | 'ru';
export type Template =
  | 'verify'
  | 'already_registered'
  | 'reset'
  | 'password_changed'
  // V6-LINK-02 (ADR-0009 §2, §4, §7): link emails, then the notices of every identity change.
  | 'add_email'
  | 'email_conflict'
  | 'change_email'
  | 'email_in_use'
  | 'email_added'
  | 'email_changed'
  | 'email_removed'
  | 'telegram_removed'
  | 'account_deleted'
  // V6-LINK-03 (ADR-0009 §3.5): Telegram linked from the web, or by a conflict choice.
  | 'telegram_linked'
  // V6-053: the Telegram owner is asked to choose, or cancelled the link in the Mini App.
  | 'link_conflict'
  | 'link_cancelled';

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
    add_email: {
      subject: 'Add this email to your Pixelarrow account',
      lines: ['You asked to add this email and a password to your Pixelarrow account, so you can also play in a browser.', 'Open this link to confirm. It works for 24 hours, on any device, and signs you in there.'],
      button: 'Add this email',
      after: ["If you didn't ask for this, ignore this email: nothing changes without this link."],
    },
    email_conflict: {
      subject: 'This email already has a Pixelarrow account',
      lines: ['Someone, probably you, asked to add this email to another Pixelarrow account (a Telegram one).', 'This address already has its own account, so nothing was changed. If both accounts are yours, open this link to choose what to do. It works for 24 hours.'],
      button: 'Open Pixelarrow',
      after: ["If this wasn't you, ignore this email. Your account is unchanged."],
    },
    change_email: {
      subject: 'Confirm your new Pixelarrow email',
      lines: ['You asked to use this address for your Pixelarrow account.', 'Open this link to confirm. It works for 24 hours. Until then your old address keeps working.'],
      button: 'Use this email',
      after: ["If you didn't ask for this, ignore this email: nothing changes without this link."],
    },
    email_in_use: {
      subject: 'This email already has a Pixelarrow account',
      lines: ['Someone, probably you, asked to move another Pixelarrow account to this email.', 'This address already has its own account, so nothing was changed. Log in with this email instead.'],
      after: ["If this wasn't you, ignore this email. Your account is unchanged."],
    },
    email_added: {
      subject: 'Email added to your Pixelarrow account',
      lines: ['This email and a password were added to your Pixelarrow account. You can now log in with them in any browser.'],
      after: ["If this wasn't you, open Pixelarrow in Telegram, go to Settings → Account and remove this email, then contact support."],
    },
    email_changed: {
      subject: 'Your Pixelarrow email was changed',
      lines: ['The email of your Pixelarrow account was changed from this address to another one. You can no longer log in with this address.'],
      after: ["If this wasn't you, contact support right away. If your account also uses Telegram, open Pixelarrow there and check Settings → Account."],
    },
    email_removed: {
      subject: 'Email removed from your Pixelarrow account',
      lines: ['This email was removed from your Pixelarrow account. You can no longer log in with it, and your browser sessions were signed out.', 'You can still play in Telegram.'],
      after: ["If this wasn't you, contact support right away."],
    },
    link_conflict: {
      subject: 'Choose which Pixelarrow account to keep',
      lines: ['A link between two Pixelarrow accounts is waiting for your choice. Open Pixelarrow in Telegram to decide which account to keep.'],
      after: ["If you didn't start this, tap \"Not me\" there: nothing changes."],
    },
    link_cancelled: {
      subject: 'Telegram link cancelled',
      lines: ['The Telegram account you tried to link to your Pixelarrow account said "Not me", so nothing was linked.'],
      after: ["If you didn't start this link, someone may know your password: change it now."],
    },
    telegram_linked: {
      subject: 'Telegram linked to your Pixelarrow account',
      lines: ['A Telegram account was linked to your Pixelarrow account. You can now play it in Telegram too, and the bot can message you there.'],
      after: ["If this wasn't you, change your password now, remove Telegram in Settings → Account, and contact support."],
    },
    telegram_removed: {
      subject: 'Telegram removed from your Pixelarrow account',
      lines: ['Telegram was removed from your Pixelarrow account. The bot will stop messaging you, and the game in Telegram was signed out.', 'You can still log in with this email in a browser.'],
      after: ["If this wasn't you, change your password now and contact support."],
    },
    account_deleted: {
      subject: 'Your Pixelarrow account was deleted',
      lines: ["Your Pixelarrow account was deleted, as you asked. Your progress, name and sign-in methods are gone, and this can't be undone.", 'Purchase records are kept without your name, as the privacy notice explains.'],
      after: ["If this wasn't you, contact support."],
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
    add_email: {
      subject: 'Добавьте почту к аккаунту Pixelarrow',
      lines: ['Вы попросили добавить эту почту и пароль к своему аккаунту Pixelarrow, чтобы играть и в браузере.', 'Откройте ссылку, чтобы подтвердить. Она действует 24 часа на любом устройстве и выполняет вход на нём.'],
      button: 'Добавить почту',
      after: ['Если вы этого не запрашивали, проигнорируйте письмо: без этой ссылки ничего не изменится.'],
    },
    email_conflict: {
      subject: 'У этой почты уже есть аккаунт Pixelarrow',
      lines: ['Кто-то, вероятно вы, попросил добавить эту почту к другому аккаунту Pixelarrow (аккаунту Telegram).', 'У этого адреса уже есть свой аккаунт, поэтому ничего не изменилось. Если оба аккаунта ваши, откройте ссылку и выберите, что делать. Она действует 24 часа.'],
      button: 'Открыть Pixelarrow',
      after: ['Если это были не вы, проигнорируйте письмо. С аккаунтом ничего не произошло.'],
    },
    change_email: {
      subject: 'Подтвердите новую почту Pixelarrow',
      lines: ['Вы попросили использовать этот адрес для своего аккаунта Pixelarrow.', 'Откройте ссылку, чтобы подтвердить. Она действует 24 часа. До этого старый адрес продолжает работать.'],
      button: 'Использовать эту почту',
      after: ['Если вы этого не запрашивали, проигнорируйте письмо: без этой ссылки ничего не изменится.'],
    },
    email_in_use: {
      subject: 'У этой почты уже есть аккаунт Pixelarrow',
      lines: ['Кто-то, вероятно вы, попросил перенести другой аккаунт Pixelarrow на эту почту.', 'У этого адреса уже есть свой аккаунт, поэтому ничего не изменилось. Войдите с этой почтой.'],
      after: ['Если это были не вы, проигнорируйте письмо. С аккаунтом ничего не произошло.'],
    },
    email_added: {
      subject: 'Почта добавлена к аккаунту Pixelarrow',
      lines: ['Эта почта и пароль добавлены к вашему аккаунту Pixelarrow. Теперь с ними можно войти в любом браузере.'],
      after: ['Если это были не вы, откройте Pixelarrow в Telegram, в Настройках → Аккаунт удалите эту почту и напишите в поддержку.'],
    },
    email_changed: {
      subject: 'Почта Pixelarrow изменена',
      lines: ['Почта вашего аккаунта Pixelarrow изменена с этого адреса на другой. Войти с этим адресом больше нельзя.'],
      after: ['Если это были не вы, сразу напишите в поддержку. Если аккаунт привязан и к Telegram, откройте Pixelarrow там и проверьте Настройки → Аккаунт.'],
    },
    email_removed: {
      subject: 'Почта удалена из аккаунта Pixelarrow',
      lines: ['Эта почта удалена из вашего аккаунта Pixelarrow. Войти с ней больше нельзя, а в браузерах выполнен выход.', 'Играть в Telegram можно по-прежнему.'],
      after: ['Если это были не вы, сразу напишите в поддержку.'],
    },
    link_conflict: {
      subject: 'Выберите, какой аккаунт Pixelarrow оставить',
      lines: ['Связывание двух аккаунтов Pixelarrow ждёт вашего выбора. Откройте Pixelarrow в Telegram и решите, какой аккаунт оставить.'],
      after: ['Если это были не вы, нажмите там «Это не я»: ничего не изменится.'],
    },
    link_cancelled: {
      subject: 'Привязка Telegram отменена',
      lines: ['Аккаунт Telegram, который вы пытались привязать к аккаунту Pixelarrow, ответил «Это не я», поэтому ничего не привязано.'],
      after: ['Если это были не вы, возможно, кто-то знает ваш пароль: смените его.'],
    },
    telegram_linked: {
      subject: 'Telegram привязан к аккаунту Pixelarrow',
      lines: ['К вашему аккаунту Pixelarrow привязан аккаунт Telegram. Теперь в него можно играть и в Telegram, а бот сможет писать вам там.'],
      after: ['Если это были не вы, сразу смените пароль, отвяжите Telegram в Настройках → Аккаунт и напишите в поддержку.'],
    },
    telegram_removed: {
      subject: 'Telegram отвязан от аккаунта Pixelarrow',
      lines: ['Telegram отвязан от вашего аккаунта Pixelarrow. Бот больше не будет вам писать, а в игре в Telegram выполнен выход.', 'Войти с этой почтой в браузере можно по-прежнему.'],
      after: ['Если это были не вы, сразу смените пароль и напишите в поддержку.'],
    },
    account_deleted: {
      subject: 'Ваш аккаунт Pixelarrow удалён',
      lines: ['Ваш аккаунт Pixelarrow удалён, как вы и просили. Прогресс, имя и способы входа удалены, отменить это нельзя.', 'Записи о покупках хранятся без вашего имени, как описано в уведомлении о конфиденциальности.'],
      after: ['Если это были не вы, напишите в поддержку.'],
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
