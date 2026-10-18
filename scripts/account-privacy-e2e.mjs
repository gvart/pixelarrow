// Rename, Your name and Delete account end to end against a local Worker (V6-LINK-07; design/ux/accounts-v6.md
// §9, §10): a web browser and a fake Telegram Mini App, both driving the real game.
//
//   node scripts/account-privacy-e2e.mjs <gameUrl> --bot-token <TELEGRAM_BOT_TOKEN of .dev.vars> [--persist <wrangler state dir>] [--shots <dir>]
//
// The setup of scripts/link-telegram-e2e.mjs: `wrangler dev` with DEV_AUTH, DEV_EMAIL, the always-pass
// Turnstile secret on a private local D1, and the game from vite proxying /api to it (give vite's URL).
//
// Flows:
// 1. Web rename (touch): Account → Rename → the form holds the current name and Save is off → Adm1n and a
//    mixed-script name are refused on blur before any request → a new name → saved (toast) → the page shows it
//    and Rename is off with the next date → the server refuses a second change (429 cooldown).
// 2. A second web account: the first one's new name, in another case → 409 taken under the field.
// 3. Telegram: the first Duels visit shows Your name once (Keep), and not on the next visit.
// 4. Web delete, keyboard only: Account → Delete account → step 1 lists what goes → Continue → the danger
//    button is off until DELETE is typed → Confirm it's you (password) → deleted: the result card, the player
//    is a tombstone, the session is gone, the device's campaign is a fresh first run and the language stays.
// 5. Telegram delete (Russian): the word is УДАЛИТЬ (the request still carries DELETE), the proof is the
//    Mini App's own initData (no form), the card says reopening starts a new account, and Close closes the
//    Mini App (WebApp.close, V6-LINK-07b).
// 6. Telegram, a moderator reset the name: the next launch shows the notice on the menu, once (V6-LINK-07b).
// 7. Telegram, First run's Modes step: "Other players will see you as {name}", and Change renames (V6-LINK-07b).
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
function initData(user) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: `AA${Math.random().toString(36).slice(2, 10)}`, user: JSON.stringify(user) };
  const dcs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT).digest();
  const p = new URLSearchParams(fields);
  p.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

const stamp = Date.now().toString(36);
const PW = 'amber falcon river 42';
const browser = await launch();
const errors = [];
let shots = 0;

function helpers(p, tag) {
  const api = makePageApi(p, { tapWait: 250, step: 200, btnWaitMs: 15000 });
  const ev = api.ev;
  const h = {
    api,
    ev,
    /** Every active scene's words, lower-cased. */
    text: () =>
      ev(() => {
        const out = [];
        const walk = (l) => l.forEach((o) => (o.visible !== false && typeof o.text === 'string' && out.push(o.text), o.list && walk(o.list)));
        for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
        return out.join(' ').replace(/\s+/g, ' ').toLowerCase();
      }),
    has: (id) =>
      ev((i) => {
        let hit = false;
        const walk = (l) => l.forEach((o) => ((o.__uiId === i && o.visible && (hit = true)), o.list && walk(o.list)));
        for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
        return hit;
      }, id),
    enabled: (id) =>
      ev((i) => {
        let on = null;
        const walk = (l) => l.forEach((o) => (o.__uiId === i && (on = o.enabled ?? o.isEnabled?.() ?? null), o.list && walk(o.list)));
        for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
        return on;
      }, id),
    /** Taps a control by its uiId on `scene`, scrolling the sheet with the wheel until it is in the upper part of the view. */
    async tap(id, scene = 'Menu') {
      await until(() => h.has(id), 15000, 150);
      for (let i = 0; i < 14; i++) {
        const at = await api.btn(scene, { id });
        const vh = p.viewportSize().height;
        if (at && at[1] < vh * 0.72) break;
        await p.mouse.move(p.viewportSize().width / 2, vh / 2);
        await p.mouse.wheel(0, 160);
        await p.waitForTimeout(250);
      }
      await api.tapBtn(scene, { id });
    },
    form: () => ev(() => document.querySelector('#px-auth form')?.dataset.form ?? null),
    fill: async (values) => {
      for (const [k, v] of Object.entries(values)) await p.fill(`#px-auth input[name=${k}]`, v);
    },
    fieldError: (name) => ev((n) => document.querySelector(`#px-auth input[name=${n}]`)?.closest('form')?.querySelector(`#${CSS.escape(document.querySelector(`#px-auth input[name=${n}]`).id)}-err`)?.textContent ?? '', name),
    banner: () => ev(() => document.querySelector('#px-auth .px-banner')?.textContent ?? ''),
    submit: () => p.click('#px-auth [data-act=submit]'),
    submitDisabled: () => ev(() => !!document.querySelector('#px-auth [data-act=submit]')?.disabled),
    focused: () => ev(() => window.__focus?.focused?.key ?? null),
    me: () => ev(async () => (await window.__online.api.me()).player),
    account: () => ev(() => window.__online.api.account()),
    async boot() {
      await p.goto('about:blank');
      await p.goto(BASE);
      await until(() => ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
      await p.waitForTimeout(800);
    },
    async tabTo(id) {
      let guard = 0;
      while ((await h.focused()) !== id && guard++ < 40) await p.keyboard.press('Tab');
      return (await h.focused()) === id;
    },
    shot: async (name) => {
      if (!SHOTS || shots >= 12) return;
      shots++;
      await p.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 82 });
    },
  };
  p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return h;
}

async function webAccount(name, { touch = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: touch });
  await prepContext(ctx);
  await applyPlatform(ctx, 'web');
  await ctx.addInitScript(() => (window.__noFirstRun = true));
  const p = await ctx.newPage();
  const W = helpers(p, `web-${name}`);
  const email = `link07-${name}+${stamp}@example.com`;
  await W.boot();
  const st = await W.ev(
    async ([e, pw]) => (await fetch('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: pw, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' }) })).status,
    [email, PW],
  );
  let tok = null;
  await until(async () => !!(tok = outboxToken(email, '/auth/signup#t=')), 20000, 1000);
  const v = await W.ev(async (t) => (await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) })).status, tok);
  await W.boot();
  await until(() => W.ev(() => window.__online.signedIn), 15000, 250);
  const me = await W.me();
  check(`[${name}] web account ready (signup ${st}, verify ${v})`, st === 202 && v === 200 && typeof me?.id === 'number', JSON.stringify(me));
  return { ctx, p, W, email, id: me.id, name: me.displayName };
}

async function telegramUser(name, lang = 'en') {
  const ctx = await phoneContext(browser, { viewport: { width: 390, height: 844 } });
  await applyPlatform(ctx, 'telegram');
  await ctx.addInitScript(() => {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    // a launch that may show its notices (6) sets __launchOn; boot still skips the first run (the tutorial is skipped)
    window.__noFirstRun = sessionStorage.getItem('__launchOn') !== '1';
    const d = sessionStorage.getItem('__initData');
    const wa = window.Telegram?.WebApp;
    if (d && wa) wa.initData = d;
  });
  const p = await ctx.newPage();
  const T = helpers(p, `tg-${name}`);
  const user = { id: 710000000 + Math.floor(Math.random() * 1e8), first_name: name, username: `${name.toLowerCase()}_${stamp}`, language_code: lang };
  await p.goto(BASE);
  await p.evaluate((d) => sessionStorage.setItem('__initData', d), initData(user));
  await T.boot();
  await until(() => T.ev(() => window.__online.signedIn), 15000, 250);
  const me = await T.me();
  return { ctx, p, T, user, id: me.id, name: me.displayName };
}

const openAccount = (h) => h.api.call('Menu', 's.openAccount(); return 1;');
const deletedAt = (pid) => d1(`SELECT deleted_at FROM players WHERE id = ${pid}`)[0]?.deleted_at ?? null;

// =========================================================== 1. web rename
const a = await webAccount('Ana');
const newName = `Ana ${stamp.slice(-5)}x`.replace(/[^A-Za-z0-9 ]/g, 'q');
{
  await openAccount(a.W);
  await until(() => a.W.has('account.rename'), 15000, 250);
  check('1: the Account page shows the generated name with Rename on', (await a.W.text()).includes(a.name.toLowerCase()) && (await a.W.enabled('account.rename')) !== false);
  await a.W.tap('account.rename');
  await until(() => a.W.form().then((f) => f === 'rename'), 8000);
  const v0 = await a.W.ev(() => document.querySelector('#px-auth input[name=name]').value);
  check('1: the form holds the current name, Save is off for it, and the cost line says the first change is free', v0 === a.name && (await a.W.submitDisabled()) && (await a.W.ev(() => document.querySelector('#px-auth [data-line=cost]')?.textContent ?? '')).includes('first change is free'), v0);
  const requests = [];
  a.p.on('request', (r) => r.url().endsWith('/api/account/name') && requests.push(r.method()));
  await a.W.fill({ name: 'Adm1n' });
  await a.p.keyboard.press('Tab');
  check('1: Adm1n is refused on blur (reserved, folded), before any request', (await a.W.fieldError('name')).includes("isn't allowed") && requests.length === 0, await a.W.fieldError('name'));
  await a.W.fill({ name: 'Sаша' });
  await a.p.keyboard.press('Tab');
  check('1: a Latin S in a Cyrillic name is refused as mixed, before any request', (await a.W.fieldError('name')).includes('not both') && requests.length === 0, await a.W.fieldError('name'));
  check('1: the counter and the rules are under the field (and in its description)', await a.W.ev(() => {
    const i = document.querySelector('#px-auth input[name=name]');
    const hint = document.getElementById(`${i.id}-hint`);
    return !!hint && /\d+\/16/.test(hint.textContent) && i.getAttribute('aria-describedby').includes(hint.id);
  }));
  await a.W.fill({ name: newName });
  await a.W.shot('01-web-rename-form');
  await a.W.submit();
  await until(() => a.W.form().then((f) => f === null), 8000);
  await until(() => a.W.text().then((x) => x.includes(newName.toLowerCase())), 8000);
  check('1: saved: the page shows the new name (one PUT)', (await a.W.account()).displayName === newName && requests.length === 1, `${(await a.W.account()).displayName} ${requests.length}`);
  await until(() => a.W.enabled('account.rename').then((x) => x === false), 8000);
  check('1: Rename is off now (the 30-day cooldown)', (await a.W.enabled('account.rename')) === false);
  await a.W.shot('02-web-account-renamed');
  const again = await a.W.ev(async () => {
    const r = await fetch('/api/account/name', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Another Name' }) });
    return [r.status, (await r.json()).error?.code];
  });
  check('1: the server refuses a second change (429 cooldown)', again[0] === 429 && again[1] === 'cooldown', JSON.stringify(again));
  await a.p.keyboard.press('Escape');
}

// =========================================================== 2. a taken name
{
  const b = await webAccount('Basil');
  await openAccount(b.W);
  await b.W.tap('account.rename');
  await until(() => b.W.form().then((f) => f === 'rename'), 8000);
  await b.W.fill({ name: newName.toUpperCase() });
  await b.W.submit();
  await until(() => b.W.fieldError('name').then((x) => x.length > 0), 8000);
  check('2: another account taking that name (any case) reads "taken" under the field; nothing changes', (await b.W.fieldError('name')).includes('taken') && (await b.W.account()).displayName === b.name, await b.W.fieldError('name'));
  await b.ctx.close();
}

// =========================================================== 3. Your name, first Duels visit (Telegram)
{
  const tg = await telegramUser('Doros');
  await tg.T.ev(() => (window.__noFirstRun = false));
  await tg.T.api.call('Menu', "s.scene.start('Duel'); return 1;");
  await until(() => tg.T.has('name.keep'), 20000, 250);
  check('3: the first Duels visit shows Your name with the generated name', (await tg.T.text()).includes(tg.name.toLowerCase()) && (await tg.T.has('name.change')));
  await tg.T.shot('03-tg-your-name');
  await tg.T.tap('name.keep', 'Duel');
  await until(() => tg.T.has('name.keep').then((x) => !x), 5000, 200);
  await tg.T.api.call('Duel', "s.scene.start('Menu'); return 1;");
  await tg.p.waitForTimeout(800);
  await tg.T.api.call('Menu', "s.scene.start('Duel'); return 1;");
  await tg.p.waitForTimeout(2500);
  check('3: and only once', !(await tg.T.has('name.keep')));
  await tg.ctx.close();
}

// =========================================================== 4. web delete, keyboard only
{
  // a fresh proof is needed: the log-in's is moved 11 minutes back
  d1(`UPDATE sessions SET reauth_at = ${Date.now() - 11 * 60_000} WHERE player_id = ${a.id}`);
  // the player's own choices stay: a sound volume set here survives the deletion
  await a.W.ev(() => ((window.__state.campaign.data.settings.musicVol = 3), window.__state.save()));
  await openAccount(a.W);
  await until(() => a.W.has('account.delete'), 15000, 250);
  check('4: keyboard: Tab reaches Delete account', await a.W.tabTo('account.delete'), String(await a.W.focused()));
  await a.p.keyboard.press('Enter');
  await until(() => a.W.has('delete.continue'), 8000, 200);
  const s1 = await a.W.text();
  check('4: step 1 says it is immediate and lists what goes and what stays', s1.includes("immediate and can't be undone") && s1.includes('your campaign, heroes, items and gold') && s1.includes('kept, without your name') && s1.includes('deleted player'), s1.slice(0, 400));
  check('4: one sign-in method: no unlink alternative; no purchases: no paid warning', !(await a.W.has('delete.alt')) && !s1.includes('not refunded'));
  await a.W.shot('04-web-delete-step1');
  check('4: keyboard: Tab reaches Continue', await a.W.tabTo('delete.continue'), String(await a.W.focused()));
  await a.p.keyboard.press('Enter');
  await until(() => a.W.form().then((f) => f === 'deleteConfirm'), 8000);
  check('4: the danger button is off until the word is typed', await a.W.submitDisabled());
  await a.p.keyboard.type('delet');
  check('4: … still off for a near miss', await a.W.submitDisabled());
  await a.p.keyboard.type('e');
  check('4: … on once "delete" is typed (any case)', !(await a.W.submitDisabled()));
  await a.W.shot('05-web-delete-confirm');
  const del = a.p.waitForRequest((r) => r.url().endsWith('/api/account') && r.method() === 'DELETE');
  await a.p.keyboard.press('Enter');
  const body = JSON.parse((await del).postData() ?? '{}');
  check('4: the request carries confirm: DELETE', body.confirm === 'DELETE', JSON.stringify(body));
  await until(() => a.W.form().then((f) => f === 'reauth'), 8000);
  check('4: a stale proof: Confirm it\'s you asks for the password', (await a.W.form()) === 'reauth');
  await a.p.keyboard.type(PW);
  await a.p.keyboard.press('Enter');
  await until(() => a.W.has('delete.startOver'), 15000, 250);
  const done = await a.W.text();
  check('4: deleted: the card says so and that a confirmation went to the email', done.includes('your account was deleted') && done.includes('confirmation to your email'), done.slice(-300));
  await a.W.shot('06-web-delete-done');
  check('4: the player is a tombstone; the session is gone', deletedAt(a.id) !== null && (await a.W.ev(async () => (await fetch('/api/me')).status)) === 401);
  const local = await a.W.ev(() => ({ won: window.__state.campaign.data.won, tut: window.__state.campaign.data.settings.tutorial?.status, vol: window.__state.campaign.data.settings.musicVol, signedIn: window.__online.signedIn }));
  check('4: the device forgot the campaign (a first run next), kept the sound choice, and is signed out', local.won === 0 && local.tut === 'offer' && local.vol === 3 && local.signedIn === false, JSON.stringify(local));
  await a.p.keyboard.press('Enter');
  await a.p.waitForTimeout(400);
  check('4: keyboard: Start over (Enter) restarts the game', await until(() => a.W.ev(() => !!window.__game?.scene.isActive('Menu') || !!window.__game?.scene.isActive('FirstRun')), 30000, 250));
  await a.ctx.close();
}

// =========================================================== 5. Telegram delete, in Russian
{
  const tg = await telegramUser('Eleni', 'ru');
  await tg.T.ev(() => ((window.__state.campaign.data.settings.lang = 'ru'), window.__state.save()));
  await tg.T.boot();
  await openAccount(tg.T);
  await tg.T.tap('account.delete');
  await until(() => tg.T.has('delete.continue'), 8000, 200);
  check('5: Russian: step 1 in Russian', (await tg.T.text()).includes('отменить его нельзя'));
  await tg.T.tap('delete.continue');
  await until(() => tg.T.form().then((f) => f === 'deleteConfirm'), 8000);
  await tg.T.fill({ confirm: 'удалить' });
  check('5: the word is УДАЛИТЬ (any case)', !(await tg.T.submitDisabled()));
  await tg.T.shot('07-tg-delete-confirm-ru');
  const del = tg.p.waitForRequest((r) => r.url().endsWith('/api/account') && r.method() === 'DELETE');
  await tg.T.submit();
  check('5: … and the request still carries DELETE', JSON.parse((await del).postData() ?? '{}').confirm === 'DELETE');
  await until(() => tg.T.has('delete.startOver'), 15000, 250);
  check('5: no password form in the Mini App (its initData is the proof); the card says reopening starts a new account', (await tg.T.text()).includes('новый пустой аккаунт') && deletedAt(tg.id) !== null);
  await tg.T.shot('08-tg-delete-done-ru');
  await tg.T.tap('delete.startOver');
  check('5: Close closes the Mini App (WebApp.close)', await until(() => tg.T.ev(() => window.__tg.log.includes('close')), 5000, 200));
  await tg.ctx.close();
}

// =========================================================== 6. the moderation notice at launch (Telegram)
{
  const tg = await telegramUser('Faidon');
  await tg.T.ev(() => ((window.__state.campaign.data.settings.tutorial = { status: 'skipped', done: [] }), window.__state.save()));
  await tg.T.ev(() => sessionStorage.setItem('__launchOn', '1'));
  const now = Date.now();
  d1(`INSERT INTO display_name_history (player_id, old, new, old_key, changed_at, by_admin) VALUES (${tg.id}, '${tg.name}', '${tg.name}', 'mod07b${stamp}', ${now}, 1)`);
  d1(`UPDATE players SET name_locked_until = ${now + 7 * 86_400_000} WHERE id = ${tg.id}`);
  await tg.T.boot();
  check('6: the launch after a moderator reset shows the notice on the menu', await until(() => tg.T.has('name.mod.ok'), 15000, 250));
  const said = await tg.T.text();
  check('6: … saying the name was changed, with the current name', said.includes('your name was changed') && said.includes(tg.name.toLowerCase()), said.slice(-300));
  await tg.T.shot('12-tg-launch-moderated');
  await tg.T.tap('name.mod.ok');
  await until(() => tg.T.has('name.mod.ok').then((x) => !x), 5000, 200);
  await tg.T.boot();
  await tg.p.waitForTimeout(2500);
  check('6: … and only once: the next launch says nothing', !(await tg.T.has('name.mod.ok')));
  await openAccount(tg.T);
  await until(() => tg.T.has('account.rename'), 15000, 250);
  await tg.p.waitForTimeout(1200);
  check('6: … nor the Account page', !(await tg.T.has('name.mod.ok')));
  await tg.ctx.close();
}

// =========================================================== 7. First run, Modes: the name line and Change (Telegram)
{
  const tg = await telegramUser('Galen');
  await tg.T.api.call('Menu', "s.scene.start('FirstRun', { mode: 'modes' }); return 1;");
  await until(() => tg.T.has('firstrun.name.change'), 15000, 250);
  const said = await tg.T.text();
  check('7: Modes says "Other players will see you as {name}" with Change', said.includes(`other players will see you as ${tg.name.toLowerCase()}`), said.slice(-300));
  await tg.T.shot('11-tg-firstrun-name');
  await tg.T.tap('firstrun.name.change', 'FirstRun');
  await until(() => tg.T.form().then((f) => f === 'rename'), 8000);
  const v0 = await tg.T.ev(() => document.querySelector('#px-auth input[name=name]').value);
  check('7: Change opens the rename form with the current name', v0 === tg.name, v0);
  const renamed = `Galen ${stamp.slice(-5)}y`.replace(/[^A-Za-z0-9 ]/g, 'q');
  await tg.T.fill({ name: renamed });
  await tg.T.submit();
  await until(() => tg.T.form().then((f) => f === null), 8000);
  check('7: saved: the line shows the new name', await until(() => tg.T.text().then((x) => x.includes(`other players will see you as ${renamed.toLowerCase()}`)), 8000, 250));
  check('7: … and the account has it', (await tg.T.account()).displayName === renamed);
  await tg.ctx.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await finish({ browser });
