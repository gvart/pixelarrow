// The standalone email-link pages /auth/* end to end against a local Worker (V6-ACCT-06,
// design/ux/accounts-v6.md §5.4, §7.2, §8.3, §8.4).
//
//   node scripts/auth-pages-e2e.mjs <gameUrl> [--persist <wrangler state dir>] [--shots <dir>]
//
// Same setup as scripts/account-e2e.mjs: `wrangler dev` with a .dev.vars holding DEV_AUTH=1,
// DEV_EMAIL=1, the always-pass TURNSTILE_SECRET, DEV_ORIGINS with the vite origin and GAME_URL set to
// it (so the mailed links open this game), plus vite proxying /api to it
// (VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA). Links come from the local D1 dev_outbox.
//
// Flows: an incomplete link → sign-up link (token gone from the address bar, signed in, the guest
// campaign line, auto-continue to the game) → the same link again (expired) → an unknown token →
// "Send a new link" (Turnstile, uniform reply) → reset link, keyboard only (short and common passwords
// refused, saved, signed in; the new password logs in) → EN | RU in place → add_email (Telegram
// player) → email_conflict (the token stays live; a wrong password, then the right one) → change_email
// → widths 320…1920 with no sideways scroll → no request ever carries the token or a Referer →
// rate limited (429) last.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { check, finish, launch, ROOT, sleep, until } from './lib/harness.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const BASE = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? '').replace(/\/?$/, '/');
if (BASE === '/') {
  console.log('NOT RUN: give the URL of the game (vite) proxying a local worker');
  process.exit(2);
}
const PERSIST = opt('persist', join(ROOT, 'server/.wrangler/state'));
const SHOTS = opt('shots', null);

/** The newest dev_outbox mail to `to` whose text holds `path`, as its token. */
function outboxToken(to, path) {
  const sql = `SELECT text FROM dev_outbox WHERE to_addr = '${to.replace(/'/g, "''")}' ORDER BY id DESC LIMIT 5`;
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pixelarrow', '--local', '--persist-to', PERSIST, '--json', '--command', sql], { cwd: ROOT, encoding: 'utf8' });
  try {
    for (const { text } of JSON.parse(r.stdout)[0].results) {
      const m = new RegExp(`${path.replace(/[#/]/g, '\\$&')}([A-Za-z0-9_-]+)`).exec(text);
      if (m) return m[1];
    }
  } catch {
    /* no rows */
  }
  return null;
}
async function mailed(to, path) {
  let t = null;
  await until(async () => !!(t = outboxToken(to, path)), 20000, 1000);
  return t;
}

const RUN = Date.now().toString(36);
const E1 = `signup-${RUN}@example.com`;
const E2 = `tg-add-${RUN}@example.com`;
const E3 = `tg-new-${RUN}@example.com`;
const E4 = `owner-${RUN}@example.com`;
const PW1 = 'amber falcon rides north';
const PW2 = 'copper lantern over hills';
const PW3 = 'violet harbour at dawn';
const TURNSTILE_DUMMY = 'XXXX.DUMMY.TOKEN.XXXX';

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'en-US' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const tokens = new Set();
const leaks = [];
p.on('request', (r) => {
  const ref = r.headers()['referer'];
  const url = r.url();
  // A Referer naming an email-link page (or any token) is a leak. Not one: vite dev's own /@vite/client,
  // which vite injects above the page's <meta name="referrer"> (dev only), and an image a stylesheet
  // asks for, whose Referer is the stylesheet's URL.
  if (ref && !url.includes('/@vite/') && (/\/auth\/(signup|reset|add_email|change_email)(\.html)?([?#]|$)/.test(ref) || [...tokens].some((t) => ref.includes(t)))) leaks.push(`referer ${ref} -> ${url}`);
  for (const t of tokens) if (url.includes(t)) leaks.push(`token in url ${url}`);
});
const ev = (fn, a) => p.evaluate(fn, a);
const shot = async (name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 70 });
const bodyText = () => ev(() => document.getElementById('body')?.innerText.replace(/\s+/g, ' ') ?? '').catch(() => '');
const title = () => ev(() => document.getElementById('title').textContent);
const hasText = (s) => until(async () => (await bodyText()).includes(s), 15000, 150);

/** A JSON call from the page (so it carries the game's Origin, as the forms do). */
const api = (path, body, bearer) =>
  ev(
    async ([path, body, bearer]) => {
      const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: bearer ? 'omit' : 'same-origin' });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [path, body, bearer],
  );
/** Opens a page fresh (a hash change alone is not a navigation). */
async function open(path) {
  await p.goto('about:blank');
  await p.goto(`${BASE}${path}`);
  await p.waitForSelector('#body');
}
const telegram = async (id) => (await api('/api/auth/telegram', { dev: { id, first_name: `Tester${id}` } })).body.token;

// ---- 1. an incomplete link
await open('auth/signup');
check('no #t=: the incomplete-link card with "Go to the game"', (await hasText('This link is incomplete')) && (await ev(() => document.querySelector('#body a.btn')?.getAttribute('href'))) === '/');
check('it renders with no API call', true);

// ---- 2. sign-up
const s = await api('/api/auth/signup', { email: E1, password: PW1, turnstile: TURNSTILE_DUMMY });
check('sign-up accepted (202)', s.status === 202, JSON.stringify(s));
const t1 = await mailed(E1, '/auth/signup#t=');
check('the verify link is mailed to /auth/signup#t=', !!t1);
tokens.add(t1);
// A guest's campaign on this browser (the game's save layout): the page says it comes along.
await ev(() => localStorage.setItem('pixelarrow:px_meta', JSON.stringify({ v: 1, n: 1, s: 0 })));
await open(`auth/signup#t=${t1}`);
check('the token is gone from the address bar at once', (await ev(() => location.href)).endsWith('/auth/signup'), await ev(() => location.href));
check('success: confirmed, signed in as the new name, the campaign comes along', (await hasText('Email confirmed')) && (await bodyText()).includes("You're signed in on this device as") && (await bodyText()).includes('Your campaign comes with you.'));
check('Play has focus, and the countdown runs', (await ev(() => document.activeElement?.textContent)) === 'Play' && (await bodyText()).includes('Opening the game in'));
const acct = await api('/api/account');
check('the cookie session is set (GET /api/account 200)', acct.status === 200, String(acct.status));
await shot('01-signup-success-390');
// Any key stops the auto-continue (WCAG 2.2.1).
await p.keyboard.press('Shift');
await sleep(3500);
check('a key press stops the auto-continue', (await ev(() => location.pathname)) === '/auth/signup' && (await bodyText()).includes('Stopped.'));
await ev(() => localStorage.clear());

// ---- 3. the same link again, and an unknown token
await open(`auth/signup#t=${t1}`);
check('a used link: expired, Log in → /#login, Send a new link', (await hasText('expired or was already used')) && (await ev(() => [...document.querySelectorAll('#body .btn')].map((b) => b.getAttribute('href') ?? b.textContent).join('|'))) === '/#login|Send a new link');
await open('auth/signup#t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
check('an unknown token: the same expired card', await hasText('expired or was already used'));
await p.setViewportSize({ width: 320, height: 640 });
await shot('02-expired-320');

// ---- 4. Send a new link (Turnstile, the uniform reply)
await p.click('text=Send a new link');
await p.waitForSelector('#body input[type=email]');
check('the new-link form focuses its email field', (await ev(() => document.activeElement?.type)) === 'email');
await p.fill('#body input[type=email]', 'not-an-email');
await p.keyboard.press('Enter');
check('a malformed address: a field error', await until(async () => (await bodyText()).includes('Enter an email address like'), 5000, 100));
await p.fill('#body input[type=email]', `nobody-${RUN}@example.com`);
await p.keyboard.press('Enter');
check('an unknown address gets the uniform "on its way" reply', await hasText('a new link is on its way'), await bodyText());
await p.setViewportSize({ width: 390, height: 844 });

// ---- 5. reset, keyboard only
const rr = await api('/api/auth/reset/request', { email: E1, turnstile: TURNSTILE_DUMMY });
check('reset requested (202)', rr.status === 202);
const t2 = await mailed(E1, '/auth/reset#t=');
check('the reset link is mailed to /auth/reset#t=', !!t2);
tokens.add(t2);
await open(`auth/reset#t=${t2}`);
check('reset: the form at once, the token gone, the password field focused', (await title()) === 'Set a new password' && (await ev(() => location.hash)) === '' && (await ev(() => document.activeElement?.getAttribute('autocomplete'))) === 'new-password');
await p.keyboard.type('short');
check('the live hint counts', (await bodyText()).includes('At least 10 characters · 5/10'));
await p.keyboard.press('Enter');
check('too short: a field error, no request needed', await until(async () => (await bodyText()).includes('Use at least 10 characters.'), 5000, 100));
await p.keyboard.press('ControlOrMeta+A');
await p.keyboard.type('qwertyuiop');
await p.keyboard.press('Enter');
check('a common password: the server refuses it under the field', await hasText('too common'), await bodyText());
// EN | RU switches in place and keeps what was typed.
await ev(() => document.querySelector('.lang [data-lang=ru]').click());
check('RU in place: title, labels, the typed value kept', (await title()) === 'Новый пароль' && (await ev(() => document.querySelector('#body input').value)) === 'qwertyuiop' && (await ev(() => document.documentElement.lang)) === 'ru');
await shot('03-reset-form-ru-390');
await ev(() => document.querySelector('.lang [data-lang=en]').click());
// Tab order from the field: eye → Save password → footer links.
await p.focus('#body input');
const order = [];
for (let i = 0; i < 4; i++) {
  await p.keyboard.press('Tab');
  order.push(await ev(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent));
}
check('Tab order: eye → Save password → Privacy notice → Terms', order.join(' | ') === 'Show password | Save password | Privacy notice | Terms', order.join(' | '));
await p.focus('#body input');
await p.keyboard.press('ControlOrMeta+A');
await p.keyboard.type(PW2);
await p.keyboard.press('Enter');
check('saved: password changed, signed in here', await hasText('Password changed.'));
await shot('04-reset-done-390');
await p.keyboard.press('Shift'); // stay on the page (stops the auto-continue)
const login = await api('/api/auth/login', { email: E1, password: PW2, turnstile: TURNSTILE_DUMMY });
check('the new password logs in (200)', login.status === 200, String(login.status));
await open(`auth/reset#t=${t2}`);
await p.fill('#body input', PW3);
await p.keyboard.press('Enter');
check('the used reset link: the reset-expired card', await hasText('Reset links work for 30 minutes'));

// ---- 6. add_email for a Telegram player
const tg1 = await telegram(700000000 + (Date.now() % 1000000));
const add = await api('/api/account/email', { email: E2, password: PW1 }, tg1);
check('add email requested (202)', add.status === 202, JSON.stringify(add));
const t3 = await mailed(E2, '/auth/add_email#t=');
check('the add_email link is mailed to /auth/add_email#t=', !!t3);
tokens.add(t3);
await open(`auth/add_email#t=${t3}`);
check('add_email: "Email added", signed in as the Telegram account', (await hasText('Email added.')) && (await bodyText()).includes('the same account as in Telegram'));

// ---- 7. change_email (the same Telegram session, re-auth is fresh)
const ch = await api('/api/account/email/change', { email: E3 }, tg1);
check('change email requested (202)', ch.status === 202, JSON.stringify(ch));
const t4 = await mailed(E3, '/auth/change_email#t=');
check('the change_email link is mailed to /auth/change_email#t=', !!t4);
tokens.add(t4);
await p.setViewportSize({ width: 1280, height: 800 });
await open(`auth/change_email#t=${t4}`);
check('change_email: "Your email is now" the masked new address', await hasText('Your email is now t'), await bodyText());
check('the masked address hides the mailbox', !(await bodyText()).includes(E3));
await shot('05-change-email-1280');
await p.keyboard.press('Shift');

// ---- 8. email_conflict: the address already has its own account (a fresh one: E1 is at its 3 mails/hour cap)
await api('/api/auth/signup', { email: E4, password: PW2, turnstile: TURNSTILE_DUMMY });
const t4v = await mailed(E4, '/auth/signup#t=');
check('a second account exists (its sign-up link verifies)', !!t4v && (await api('/api/auth/verify', { token: t4v })).status === 200);
await api('/api/auth/logout', {});
const tg2 = await telegram(800000000 + (Date.now() % 1000000));
const add2 = await api('/api/account/email', { email: E4, password: PW1 }, tg2);
check('adding an address that has an account still answers 202', add2.status === 202, JSON.stringify(add2));
const t5 = await mailed(E4, '/auth/add_email#t=');
check('the conflict link is mailed to /auth/add_email#t=', !!t5);
tokens.add(t5);
await p.setViewportSize({ width: 768, height: 1024 });
await open(`auth/add_email#t=${t5}`);
check('409 email_conflict: the prove-it form with a password field', (await hasText('already has a Pixelarrow account')) && (await ev(() => document.activeElement?.getAttribute('autocomplete'))) === 'current-password');
await shot('06-conflict-768');
await p.keyboard.type('wrong password here');
await p.keyboard.press('Enter');
check('a wrong password: a field error, the field emptied', (await hasText("That email and password don't match")) && (await ev(() => document.querySelector('#body input').value)) === '');
await p.keyboard.type(PW2);
await p.keyboard.press('Enter');
const handed = await until(async () => /#account\/conflict\/[A-Za-z0-9_-]{22}$/.test(await ev(() => location.href)) || (await bodyText().catch(() => '')).includes('Email added.'), 20000, 200);
const where = await ev(() => location.href).catch(() => '');
check('the right password: handed to the game\'s conflict sheet, or added when the other side was empty', handed, `${where} ${await bodyText()}`);

// ---- 9. widths: no sideways scroll at any width, in both languages
await p.setViewportSize({ width: 390, height: 844 });
let wide = true;
const sizes = [];
for (const w of [320, 390, 768, 1280, 1440, 1920]) {
  for (const path of ['auth/reset#t=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'auth/signup']) {
    await p.setViewportSize({ width: w, height: w < 768 ? 800 : 900 });
    await open(path);
    if (path === 'auth/signup') await hasText('incomplete');
    for (const lang of ['en', 'ru']) {
      await ev((l) => document.querySelector(`.lang [data-lang=${l}]`).click(), lang);
      const r = await ev(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, card: document.querySelector('.card').getBoundingClientRect().width }));
      if (r.sw > r.iw) wide = false;
      sizes.push(`${w}/${lang}:${Math.round(r.card)}`);
    }
  }
  if (w === 1920) await shot('07-no-token-ru-1920');
}
check('no sideways scroll at 320, 390, 768, 1280, 1440, 1920 (EN and RU)', wide, sizes.join(' '));
await p.setViewportSize({ width: 844, height: 390 });
await open('auth/reset#t=DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD');
check('phone landscape 844x390: Save password reachable by scrolling', await ev(() => { const b = document.querySelector('#body button[type=submit]'); b.scrollIntoView(); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }));
await shot('08-reset-844x390');

// ---- 10. nothing leaked
check('no request carried a Referer or the token in its URL', leaks.length === 0, leaks.slice(0, 3).join(' ; '));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' ; '));

// ---- 11. rate limited (last: it blocks verify from this IP for a minute)
let limited = false;
for (let i = 0; i < 15 && !limited; i++) limited = (await api('/api/auth/verify', { token: `EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE${i % 10}` })).status === 429;
await p.setViewportSize({ width: 390, height: 844 });
await open('auth/signup#t=FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
check('429: the rate card with Try again (it re-sends the kept token)', limited && (await hasText('Too many tries from this network')) && /try again/i.test(await bodyText()), `limited=${limited} ${await bodyText()}`);

await finish({ browser });
