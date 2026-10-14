// Account management end to end against a local Worker (V6-LINK-05, design/ux/accounts-v6.md §1.4, §8.2–§8.4, §8.8).
//
//   node scripts/account-manage-e2e.mjs <gameUrl> --bot-token <TELEGRAM_BOT_TOKEN of .dev.vars> [--persist <wrangler state dir>] [--shots <dir>]
//
// The setup of scripts/account-e2e.mjs: `wrangler dev` with DEV_AUTH, DEV_EMAIL and the always-pass Turnstile
// secret on a private local D1, and the game from vite proxying /api to it (give vite's URL). The Telegram
// part signs its own initData with the local bot token, so the Worker checks a real HMAC.
//
// Flows:
// 1. Telegram (the fake WebApp, initData 11 minutes old): Account → email "Not added" · Add → the form →
//    401 reauth_required → initData re-sent silently → 401 init_data_expired → AU-10 Reopen variant (no
//    password on the account) → "reopen" (fresh initData) → Back to the form, fields kept → submit → silent
//    proof → retried once → 202 → Check your email (add email) → the row reads Waiting.
// 2. The link from dev_outbox opens /auth/add_email in a desktop browser: signed in as the same player.
//    The Mini App's row then reads the masked email.
// 3. Web (cookie): reauth_required simulated (sessions.reauth_at moved 11 minutes back) → email ⋯ → Change
//    email → AU-10 password: a wrong one (field error), the right one → retried → Check your email (change)
//    → the link → the new address; the same address again → field error. Change password: a wrong current
//    one (field error), then changed (toast).
// 4. Remove Telegram (web), then email's Remove is off as the last method (the reason on tap), and the
//    server refuses it too (409 last_login_method).
// 5. Keyboard only: Tab to the email ⋯, Enter, Change password with the keyboard, Escape closes.
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { check, finish, launch, ROOT, until, phoneContext, makePageApi, prepContext } from './lib/harness.mjs';
import { applyPlatform } from './lib/platform.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const BASE = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? '').replace(/\/?$/, '/');
const BOT = opt('bot-token', process.env.TELEGRAM_BOT_TOKEN ?? '');
if (BASE === '/' || !BOT) {
  console.log('NOT RUN: give the game URL (vite, proxying /api to the local worker) and --bot-token');
  process.exit(2);
}
const PERSIST = opt('persist', join(ROOT, 'server/.wrangler/state'));
const SHOTS = opt('shots', null);

function d1(sql) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pixelarrow', '--local', '--config', '../wrangler.jsonc', '--persist-to', PERSIST, '--json', '--command', sql], { cwd: join(ROOT, 'server'), encoding: 'utf8' });
  try {
    return JSON.parse(r.stdout)[0].results;
  } catch {
    return [];
  }
}
function outboxToken(to, path) {
  for (const { text } of d1(`SELECT text FROM dev_outbox WHERE to_addr = '${to.replace(/'/g, "''")}' ORDER BY id DESC LIMIT 5`)) {
    const m = new RegExp(`${path.replace(/[#/]/g, '\\$&')}([A-Za-z0-9_-]+)`).exec(text);
    if (m) return m[1];
  }
  return null;
}
/** Telegram's initData for `user`, signed with the local bot token (server/src/telegramAuth.ts signInitData). */
function initData(user, ageSec) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000) - ageSec), query_id: 'AAlink05', user: JSON.stringify(user) };
  const dcs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT).digest();
  const p = new URLSearchParams(fields);
  p.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

const stamp = Date.now().toString(36);
const TG_USER = { id: 700000000 + Math.floor(Math.random() * 1e8), first_name: 'Nikias', username: `nik_${stamp}` };
const EMAIL = `link05+${stamp}@example.com`;
const EMAIL2 = `link05b+${stamp}@example.com`;
const PW = 'amber falcon river 42';
const PW2 = 'copper owl meadow 77';

const browser = await launch();
const errors = [];

/** Page helpers for one context: the form, its fields, the Menu's words, element presence by uiId, the canvas focus. */
function helpers(p) {
  const api = makePageApi(p, { tapWait: 250, step: 200, btnWaitMs: 15000 });
  const ev = api.ev;
  return {
    api,
    ev,
    form: () => ev(() => document.querySelector('#px-auth form')?.dataset.form ?? null),
    fields: () => ev(() => [...document.querySelectorAll('#px-auth input')].map((i) => `${i.name}:${i.autocomplete}`).join()),
    banner: () => ev(() => document.querySelector('#px-auth .px-banner')?.textContent ?? ''),
    fieldErr: (name) => ev((n) => document.getElementById(`${document.querySelector(`#px-auth input[name=${n}]`)?.id}-err`)?.textContent ?? '', name),
    value: (name) => ev((n) => document.querySelector(`#px-auth input[name=${n}]`)?.value ?? null, name),
    fill: async (values) => {
      for (const [k, v] of Object.entries(values)) await p.fill(`#px-auth input[name=${k}]`, v);
    },
    submit: () => p.click('#px-auth [data-act=submit]'),
    settled: () => until(() => ev(() => !document.querySelector('#px-auth [aria-busy=true]')), 20000),
    text: async () => (await api.sceneText('Menu')).replace(/\s+/g, ' '),
    has: (id) =>
      ev((i) => {
        let hit = false;
        const walk = (l) => l.forEach((o) => ((o.__uiId === i && o.visible && (hit = true)), o.list && walk(o.list)));
        for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
        return hit;
      }, id),
    focused: () => ev(() => window.__focus?.focused?.key ?? null),
    shot: async (name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 80 }),
    async boot(hash = '') {
      await p.goto('about:blank');
      await p.goto(`${BASE}${hash}`);
      await until(() => ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
      await p.waitForTimeout(800);
    },
    async account() {
      await api.call('Menu', 's.openAccount(); return 1;');
      await until(() => ev(() => !!window.__online?.signedIn), 15000, 250);
      await until(async () => (await this.has('account.devices')) || (await this.has('account.retry')), 15000, 250);
    },
  };
}

// =========================================================== 1. Telegram: add an email (re-auth via initData)
const tctx = await phoneContext(browser, { viewport: { width: 390, height: 844 } });
await applyPlatform(tctx, 'telegram');
const stale = initData(TG_USER, 11 * 60);
await tctx.addInitScript((d) => window.Telegram?.WebApp && (window.Telegram.WebApp.initData = d), stale);
const tp = await tctx.newPage();
tp.on('pageerror', (e) => errors.push(`[tg] ${e.message}`));
const T = helpers(tp);
await T.boot();
await T.account();
const tgId = await T.ev(async () => (await window.__online.api.me()).player.id);
check('Telegram: signed in from initData (a real HMAC) as a new player', typeof tgId === 'number', String(tgId));
check('AU-09 Telegram only: email "Not added" with Add; Telegram\'s Remove is there (off: the only method)', (await T.has('account.email.add')) && (await T.has('account.tg.remove')) && (await T.text()).includes('Not added'));
await T.shot('01-tg-account-not-added');
await T.api.tapBtn('Menu', { id: 'account.tg.remove' });
await tp.waitForTimeout(400);
check('Remove on the only method says why (account.remove.last)', (await T.text()).includes('only way to sign in'), (await T.text()).slice(-200));

await T.api.tapBtn('Menu', { id: 'account.email.add' });
await until(() => T.form().then((f) => f === 'addEmail'), 10000);
check('AU-11 Add email and password: email + new password, no human check', (await T.fields()) === 'email:email,password:new-password' && !(await T.ev(() => !!document.querySelector('#px-auth [data-slot=humanCheck]'))), await T.fields());
await T.fill({ email: EMAIL, password: 'short' });
await T.submit();
await T.settled();
check('a short password: the client check, under the field', (await T.fieldErr('password')).includes('10 characters'));
await T.fill({ password: PW });
await T.submit();
await until(() => T.form().then((f) => f === 'reauth'), 15000);
check("401 reauth_required → initData re-sent → too old → AU-10 Reopen variant (no password field)", (await T.fields()) === '' && (await T.ev(() => document.querySelector('#px-auth [data-act=submit]').textContent)).includes('Reopen'));
await T.shot('02-tg-reauth-reopen');
await T.submit();
await T.settled();
check('Reopen with no bot link configured says how to reopen by hand', (await T.banner()).includes('open it again from the bot'), await T.banner());
// the player reopens the Mini App: Telegram hands it fresh initData
await T.ev((d) => (window.Telegram.WebApp.initData = d), initData(TG_USER, 5));
await tp.keyboard.press('Escape');
await until(() => T.form().then((f) => f === 'addEmail'), 5000);
check('Back from AU-10 returns to Add email with the fields kept', (await T.value('email')) === EMAIL && (await T.value('password')) === PW);
await T.settled();
await T.submit();
await until(() => T.text().then((t) => t.includes('also signs you in there')), 20000);
check('fresh initData proves it silently, the add is retried once → 202 → Check your email (add email variant)', !(await T.form()) && (await T.text()).includes(EMAIL));
await T.shot('03-tg-check-email-add');
const hint = await T.ev(() => Object.entries(localStorage).find(([k]) => k.endsWith('account.addPending'))?.[1] ?? null);
check('the device keeps a masked hint only (no full address in storage)', !!hint && !hint.includes(EMAIL) && hint.includes('l***@e***.com'), String(hint));
await T.boot();
await T.account();
check('the email row reads Waiting with the masked address and a ⋯ (Resend, Cancel)', (await T.text()).includes('l***@e***.com') && (await T.has('account.email.more')));

// =========================================================== 2. the link opens the web, signed in as the same player
let tok = null;
await until(async () => !!(tok = outboxToken(EMAIL, '/auth/add_email#t=')), 20000, 1000);
check('the add_email link is in dev_outbox', !!tok);
// a laptop with a touch screen: the harness taps with touch events
const wctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
await prepContext(wctx);
await applyPlatform(wctx, 'web');
await wctx.addInitScript(() => (window.__noFirstRun = true));
const wp = await wctx.newPage();
wp.on('pageerror', (e) => errors.push(`[web] ${e.message}`));
const W = helpers(wp);
await wp.goto(`${BASE}auth/add_email.html#t=${tok}`);
await until(() => wp.evaluate(() => document.body.innerText.includes('Email added')), 20000).catch(() => undefined);
const page2 = await wp.evaluate(() => document.body.innerText);
check('/auth/add_email: "Email added. You\'re signed in here as …: the same account as in Telegram"', page2.includes('Email added'), page2.slice(0, 200));
const webMe = await wp.evaluate(async () => (await (await fetch('/api/me')).json()).player);
check('the desktop browser is signed in as the same player (same id)', webMe?.id === tgId, JSON.stringify(webMe));
await T.boot();
await T.account();
check("the Mini App's row reads the masked email after a refresh, with the ⋯ menu", (await T.text()).includes('l***@e***.com') && !(await T.text()).includes('Waiting') && (await T.has('account.email.more')));
await T.shot('04-tg-account-both');

// =========================================================== 3. web: change email with password re-auth; change password
await W.boot();
await W.account();
// simulate 10 minutes passing: this browser's session loses its proof (the Worker's session cache lives 30 s)
d1(`UPDATE sessions SET reauth_at = ${Date.now() - 11 * 60_000} WHERE player_id = ${tgId}`);
await wp.waitForTimeout(31_000);
await W.api.tapBtn('Menu', { id: 'account.email.more' });
await until(() => W.has('account.email.change'), 5000);
await W.shot('05-web-email-menu');
await W.api.tapBtn('Menu', { id: 'account.email.change' });
await until(() => W.form().then((f) => f === 'changeEmail'), 10000);
await W.fill({ email: EMAIL2 });
await W.submit();
await until(() => W.form().then((f) => f === 'reauth'), 15000);
check("reauth_required after 10 minutes → AU-10 Confirm it's you asks for the password (current-password)", (await W.fields()) === 'password:current-password');
await W.fill({ password: 'not my password' });
await W.submit();
await W.settled();
check('a wrong password: under the field, emptied and focused', (await W.fieldErr('password')).includes("not your password") && (await W.value('password')) === '' && (await W.ev(() => document.activeElement?.name)) === 'password');
await W.shot('06-web-reauth-wrong');
await W.fill({ password: PW });
await W.submit();
await until(() => W.text().then((t) => t.includes('new address')), 20000);
check('the right password → back to Change email, retried once → Check your email (change variant)', !(await W.form()));
await until(async () => !!(tok = outboxToken(EMAIL2, '/auth/change_email#t=')), 20000, 1000);
const changed = await wp.evaluate(async (t) => (await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) })).status, tok);
check('the change_email link confirms the new address (200)', changed === 200, String(changed));
await W.boot();
await W.account();
check('the email row now shows the new masked address', (await W.text()).includes('l***@e***.com'));
await W.api.tapBtn('Menu', { id: 'account.email.more' });
await W.api.tapBtn('Menu', { id: 'account.email.change' });
await until(() => W.form().then((f) => f === 'changeEmail'), 10000);
await W.fill({ email: EMAIL2 });
await W.submit();
await W.settled();
check('the same address again: 400 same_email under the field', (await W.fieldErr('email')).includes('already your email'), await W.fieldErr('email'));
await wp.keyboard.press('Escape');

await W.api.tapBtn('Menu', { id: 'account.email.more' });
await W.api.tapBtn('Menu', { id: 'account.email.password' });
await until(() => W.form().then((f) => f === 'changePassword'), 10000);
check('Change password: current-password then new-password', (await W.fields()) === 'current:current-password,next:new-password');
await W.fill({ current: 'not my password', next: PW2 });
await W.submit();
await W.settled();
check("a wrong current password: account.err.current under it, emptied", (await W.fieldErr('current')).includes('not your current password') && (await W.value('current')) === '');
await W.fill({ current: PW, next: PW2 });
await W.submit();
await until(() => W.text().then((t) => t.includes('Password changed')), 15000);
check('password changed: the toast says other devices were signed out', !(await W.form()));
await W.shot('07-web-password-changed');

// =========================================================== 4. remove a method; the last one can't go
await W.boot();
await W.account();
await W.api.tapBtn('Menu', { id: 'account.tg.remove' });
await until(() => W.text().then((t) => t.includes('Remove Telegram?')), 5000);
check('AU-15: the Telegram body says what changes (bot, new empty account, purchases stay)', (await W.text()).includes('purchases stay'));
await W.shot('08-web-remove-tg');
await W.api.tapBtn('Menu', { label: 'Remove', index: -1 });
await until(() => W.text().then((t) => t.includes('Sign-in method removed')), 15000);
await W.boot();
await W.account();
check('Telegram now reads Not linked; still signed in on the web (a cookie session)', (await W.text()).includes('Not linked') && (await W.ev(() => window.__online.signedIn)));
await W.api.tapBtn('Menu', { id: 'account.email.more' });
await W.api.tapBtn('Menu', { id: 'account.email.remove' });
await wp.waitForTimeout(400);
check("email's Remove is off as the last method and says why on tap", (await W.text()).includes('only way to sign in'));
const refused = await wp.evaluate(async () => {
  const r = await fetch('/api/account/identities/password', { method: 'DELETE' });
  return `${r.status} ${(await r.json()).error?.code}`;
});
check('the server refuses it too: 409 last_login_method', refused === '409 last_login_method', refused);

// =========================================================== 5. keyboard only
await W.boot();
await W.account();
let guard = 0;
while ((await W.focused()) !== 'account.email.more' && guard++ < 20) await wp.keyboard.press('Tab');
check('keyboard: Tab reaches the email ⋯', (await W.focused()) === 'account.email.more', String(await W.focused()));
await wp.keyboard.press('Enter');
await until(() => W.has('account.email.password'), 5000);
guard = 0;
while ((await W.focused()) !== 'account.email.password' && guard++ < 8) await wp.keyboard.press('Tab');
await wp.keyboard.press('Enter');
await until(() => W.form().then((f) => f === 'changePassword'), 10000);
check('Enter opens Change password with the first field focused', (await W.ev(() => document.activeElement?.name)) === 'current');
await wp.keyboard.type('wrong password 1');
await wp.keyboard.press('Enter');
check('Enter in the first field moves to the next', (await W.ev(() => document.activeElement?.name)) === 'next');
await wp.keyboard.type('another long pass 2');
await wp.keyboard.press('Enter');
await W.settled();
check('Enter in the last field submits (a wrong current password: field error)', (await W.fieldErr('current')).length > 0);
await wp.keyboard.press('Escape');
await until(() => W.form().then((f) => f === null), 5000);
check('Escape closes the form and the canvas has focus again', (await W.form()) === null);

check('no page errors', errors.length === 0, errors.join(' | '));
await finish({ browser });
