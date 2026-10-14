// The web sign-in forms end to end against a local Worker (V6-ACCT-05, design/ux/accounts-v6.md §5–§7).
//
//   node scripts/account-e2e.mjs <workerUrl> [--persist server/.wrangler/state] [--shots <dir>]
//
// Needs `wrangler dev` (from server/: npx wrangler dev --config ../wrangler.jsonc --persist-to <dir>
// --port <port>) serving a build made with VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA, and a
// .dev.vars with DEV_AUTH=1, DEV_EMAIL=1, the always-pass TURNSTILE_SECRET and DEV_ORIGINS holding the
// worker's origin. Links are read from the local D1 dev_outbox (wrangler d1 execute). It runs as a web
// page (the email forms are web-only) and checks Telegram mode never opens them.
//
// Flows: sign up (a common password refused, then accepted) → Check your email → a taken address gets the
// same answer → verify from the outbox → signed in (recheckSession) → log out → log in → wrong password and
// an unknown email read the same → too many attempts after 5 → forgot password (same answer for an unknown
// email) → reset from the outbox → log in with the new password → keyboard only (Tab order, Enter, Esc) →
// rate limited (429) last, since it blocks log-in for a minute.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { check, finish, launch, ROOT, until } from './lib/harness.mjs';
import { applyPlatform, launchUrl } from './lib/platform.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const BASE = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? '').replace(/\/?$/, '/');
if (BASE === '/') {
  console.log('NOT RUN: give the URL of the local worker');
  process.exit(2);
}
const PERSIST = opt('persist', join(ROOT, 'server/.wrangler/state'));
const SHOTS = opt('shots', null);

/** The newest dev_outbox mail to `to` whose text holds `path` (e.g. /auth/signup#t=), as its token. */
function outboxToken(to, path) {
  const sql = `SELECT text FROM dev_outbox WHERE to_addr = '${to.replace(/'/g, "''")}' ORDER BY id DESC LIMIT 5`;
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pixelarrow', '--local', '--config', '../wrangler.jsonc', '--persist-to', PERSIST, '--json', '--command', sql], { cwd: join(ROOT, 'server'), encoding: 'utf8' });
  try {
    const rows = JSON.parse(r.stdout)[0].results;
    for (const { text } of rows) {
      const m = new RegExp(`${path.replace(/[#/]/g, '\\$&')}([A-Za-z0-9_-]+)`).exec(text);
      if (m) return m[1];
    }
  } catch {
    /* no rows */
  }
  return null;
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await applyPlatform(ctx, 'web');
await ctx.addInitScript(() => (window.__noFirstRun = true));
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const ev = (fn, a) => p.evaluate(fn, a);
const shot = async (name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.png`) });

const form = () => ev(() => document.querySelector('#px-auth form')?.dataset.form ?? null);
const banner = () => ev(() => document.querySelector('#px-auth .px-banner')?.textContent ?? '');
const fieldErr = (name) => ev((n) => document.getElementById(`${document.querySelector(`#px-auth input[name=${n}]`)?.id}-err`)?.textContent ?? '', name);
const menuText = () => ev(() => {
  const out = [];
  const walk = (l) => l.forEach((o) => (o.text !== undefined && out.push(o.text), o.list && walk(o.list)));
  walk(window.__game.scene.getScene('Menu').children.list);
  return out.join(' ').replace(/\s+/g, ' ');
});
async function open(hash) {
  await p.goto('about:blank'); // a hash change alone would not reload the game
  await p.goto(`${BASE}#${hash}`);
  await until(() => form().then((f) => f === hash), 30000);
}
async function fill(values) {
  for (const [k, v] of Object.entries(values)) await p.fill(`#px-auth input[name=${k}]`, v);
}
const submit = () => p.click('#px-auth [data-act=submit]');
/** Waits until the form is no longer busy. */
const settled = () => until(() => ev(() => !document.querySelector('#px-auth [aria-busy=true]')), 20000);

const stamp = Date.now().toString(36);
const EMAIL = `acct05+${stamp}@example.com`;
const PW = 'amber falcon river 42';
const PW2 = 'copper owl meadow 77';

// ---- sign up
await open('login');
check('#login opens the Log in form over the menu', (await form()) === 'login');
const attrs = await ev(() => [...document.querySelectorAll('#px-auth input')].map((i) => `${i.name}:${i.type}:${i.autocomplete}`));
check('log-in inputs carry email / current-password autocomplete (password managers)', attrs.join() === 'email:email:email,password:password:current-password', attrs.join());
await p.click('#px-auth [data-link=signup]');
check('"New here? Create account" replaces the form in place', (await form()) === 'signup');
check('sign-up password is new-password', await ev(() => document.querySelector('#px-auth input[name=password]').autocomplete === 'new-password'));
await fill({ email: EMAIL, password: 'short' });
check('live hint counts to 10', (await ev(() => document.querySelector('#px-auth .px-hint').textContent)).includes('5/10'));
await fill({ password: 'password1234' });
await submit();
await settled();
check('a common password: field error from the server (400 common)', (await fieldErr('password')).includes('too common'), await fieldErr('password'));
await fill({ password: PW });
await shot('signup-filled');
await submit();
await until(() => menuText().then((t) => t.includes('CHECK YOUR EMAIL') || t.includes('Check your email')), 20000)
const sheet = await menuText();
check('202 check_email: the form closes and Check your email names the address', !(await form()) && sheet.includes(EMAIL), sheet.slice(0, 200));
check('Resend is off with a countdown', /Resend in [01]:\d\d/i.test(sheet));
await shot('check-email');
const pending = await ev(() => localStorage.getItem('pixelarrow:account.pending'));
check('the pending email is remembered on this device', !!pending && pending.includes(EMAIL));

// ---- verify (the /auth/signup page is ACCT-06: its POST, then the session re-read)
let tok = null;
await until(async () => !!(tok = outboxToken(EMAIL, '/auth/signup#t=')), 20000, 1000);
check('the verify link is in dev_outbox', !!tok);
const verified = await ev(async (t) => (await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) })).status, tok);
check('POST /api/auth/verify signs this browser in (200)', verified === 200, String(verified));
check('recheckSession() then sees the cookie session', (await ev(() => window.__online.recheckSession())) && (await ev(() => window.__online.signedIn)));

// a taken address: the same answer, the same sheet
await open('login');
await p.click('#px-auth [data-link=signup]');
await fill({ email: EMAIL, password: PW2 });
await submit();
await until(() => menuText().then((t) => t.includes(EMAIL)), 20000)
await shot('taken');
check('sign-up with a taken address shows the same Check your email (no disclosure)', !(await form()) && (await menuText()).includes(EMAIL), `${await form()} ${await banner()} ${await fieldErr('email')} ${await fieldErr('password')}`);

// ---- log out (the Account page's Log out is ACCT-07: the same POST and re-read as logOut())
const out = await ev(async () => (await fetch('/api/auth/logout', { method: 'POST' })).status);
check('log out: 200 and the session re-read says signed out', out === 200 && !(await ev(() => window.__online.recheckSession())));

// ---- log in: wrong password and unknown email read the same
await open('login');
await fill({ email: EMAIL, password: 'not the password' });
await submit();
await settled();
const wrong = await banner();
const cleared = await ev(() => document.querySelector('#px-auth input[name=password]').value === '' && document.activeElement?.name === 'password');
await shot('login-creds');
await fill({ email: `nobody+${stamp}@example.com`, password: 'not the password' });
await submit();
await settled();
check('wrong password and unknown email: the same banner, password cleared and focused', wrong.includes("don't match") && wrong === (await banner()) && cleared, wrong);
// three more failures with the unknown address: the 5th says too many attempts
for (let i = 0; i < 3; i++) {
  await fill({ password: 'not the password' });
  await submit();
  await settled();
}
check('the 5th failure: "Too many attempts", Forgot password? becomes a button', (await banner()).includes('Too many attempts') && (await ev(() => document.querySelector('[data-link=forgot]').classList.contains('px-asButton'))));
await shot('login-toomany');
await fill({ email: EMAIL, password: PW });
await submit();
await until(() => form().then((f) => f === null), 20000)
check('log in: the form closes, signed in, "Signed in as" toast', !(await form()) && (await ev(() => window.__online.signedIn)) && /Signed in as/.test(await menuText()));
check('log in cleared the pending email', !(await ev(() => localStorage.getItem('pixelarrow:account.pending'))));
await ev(() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.__online.recheckSession()));

// ---- forgot password
await open('forgot');
await fill({ email: `nobody+${stamp}@example.com` });
await submit();
await until(() => menuText().then((t) => t.includes('If an account uses')), 20000)
check('forgot password with an unknown email: the reset Check your email', (await menuText()).includes('If an account uses'));
await open('forgot');
await fill({ email: EMAIL });
await submit();
await until(() => menuText().then((t) => t.includes(`If an account uses ${EMAIL}`)), 20000)
check('forgot password with the real email: the same card', (await menuText()).includes(`If an account uses ${EMAIL}`));
await shot('check-reset');
let rtok = null;
await until(async () => !!(rtok = outboxToken(EMAIL, '/auth/reset#t=')), 20000, 1000);
check('the reset link is in dev_outbox', !!rtok);
const reset = await ev(async ([t, pw]) => (await fetch('/api/auth/reset/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t, password: pw }) })).status, [rtok, PW2]);
check('reset/confirm sets the new password and signs in (200, recheckSession)', reset === 200 && (await ev(() => window.__online.recheckSession())));
await ev(() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.__online.recheckSession()));
await open('login');
await fill({ email: EMAIL, password: PW2 });
await submit();
await until(() => form().then((f) => f === null), 20000)
check('log in with the new password', !(await form()) && (await ev(() => window.__online.signedIn)));
await ev(() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.__online.recheckSession()));

// ---- keyboard only, at a laptop size
await p.setViewportSize({ width: 1280, height: 800 });
await open('login');
check('keyboard: the email field has focus on open', await ev(() => document.activeElement?.name === 'email'));
const order = [];
for (let i = 0; i < 9; i++) {
  order.push(await ev(() => {
    const a = document.activeElement;
    return a?.name || a?.dataset?.act || a?.dataset?.link || (a?.tagName === 'A' ? 'note' : a?.tagName === 'IFRAME' ? 'turnstile' : a?.tagName?.toLowerCase());
  }));
  await p.keyboard.press('Tab');
}
check('Tab order: email → password → eye → Forgot → (Turnstile) → note → Cancel → Log in → Create account', order.filter((x) => x !== 'turnstile').slice(0, 8).join(' ') === 'email password eye forgot note cancel submit signup', order.join(' '));
await p.keyboard.press('Escape');
await until(() => form().then((f) => f === null), 5000)
check('Escape closes the form', !(await form()));
await open('login');
await p.keyboard.type(EMAIL);
await p.keyboard.press('Enter');
check('Enter in the email field moves to the password', await ev(() => document.activeElement?.name === 'password'));
await p.keyboard.type(PW2);
await p.keyboard.press('Enter');
await until(() => form().then((f) => f === null), 20000)
check('Enter in the password field submits (signed in)', !(await form()) && (await ev(() => window.__online.signedIn)));
await ev(() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.__online.recheckSession()));

// ---- rate limited: 10 log-in posts a minute per IP (RL_AUTH_IP), then the form says so
await open('login');
// burst until the limiter answers 429, then submit at once (the local limiter's window is a fixed minute)
const burst = () => ev(async () => {
  for (let i = 0; i < 15; i++) if ((await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"x@y.zz","password":"x"}' })).status === 429) return true;
  return false;
});
await fill({ email: EMAIL, password: PW2 });
for (let i = 0; i < 2 && !(await banner()).includes('Too many tries'); i++) {
  await burst();
  await submit();
  await settled();
}
check('429: "Too many tries from this network. Try again in 1 min."', (await banner()).includes('Too many tries from this network'), await banner());
await shot('login-rate');

// ---- Telegram never opens the email forms (no 'password' method)
const tctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await applyPlatform(tctx, 'telegram');
await tctx.addInitScript(() => (window.__noFirstRun = true));
const tp = await tctx.newPage();
await tp.goto(launchUrl(BASE, 'telegram'));
await until(() => tp.evaluate(() => !!window.__game?.scene.isActive('Menu')), 30000)
await tp.evaluate(() => window.__game.scene.getScene('Menu').scene.restart({ account: { view: 'login' } }));
await tp.waitForTimeout(1500);
check('Telegram: the log-in route opens no email form', !(await tp.evaluate(() => !!document.querySelector('#px-auth'))));

check('no page errors', errors.length === 0, errors.join(' | '));
await finish({ browser });
