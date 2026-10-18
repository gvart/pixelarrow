// Linking end to end against a local Worker (V6-LINK-06; design/ux/accounts-v6.md §8.5–§8.7, V6-053/054):
// a web browser and a fake Telegram Mini App, both driving the real game.
//
//   node scripts/link-telegram-e2e.mjs <gameUrl> --bot-token <TELEGRAM_BOT_TOKEN of .dev.vars> [--persist <wrangler state dir>] [--shots <dir>]
//
// The setup of scripts/account-manage-e2e.mjs: `wrangler dev` with DEV_AUTH, DEV_EMAIL, the always-pass
// Turnstile secret and TELEGRAM_BOT_USERNAME on a private local D1, and the game from vite proxying /api
// to it (give vite's URL). The Mini App signs its own initData (with start_param) with the local bot token,
// so the Worker checks a real HMAC; each "launch" gets fresh initData, as Telegram does.
//
// Flows:
// A. No conflict: the web's Link (QR on a mouse device, the deep link) → the Mini App's request names the
//    web account (masked email) → Link → the web turns to "Is this you?" within a poll → Confirm → linked;
//    the Telegram-side player, with only its day-1 cloud save (V6-LINK-07), is removed; the open Mini App
//    switches to the web account by itself with a toast; one player with both identities. Keyboard only on the web.
// B. A conflict where both sides choose the same account → resolved (the web waits, 202, until the Mini
//    App, from a newer launch, chooses the same; typed names on both sides).
// C. Different choices → nothing changes (the Mini App reads choices_differ, the web "chose differently").
// D. "Not me" in the Mini App → the code is cancelled; the web says so.
// E. An expired code → the web offers a new code; the Mini App says it expired.
// F. The attacker: an attacker's web code and the victim's one tap; the attacker confirms and chooses but
//    can't resolve alone (202, again 202); the victim's Mini App shows who asks (name, masked email) and
//    what would be deleted, with Not me first; Not me ends it; the victim's account is intact.
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
/** Telegram's initData for `user` (and a start_param), signed with the local bot token. */
function initData(user, startParam = null, ageSec = 0) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000) - ageSec), query_id: `AA${Math.random().toString(36).slice(2, 10)}`, user: JSON.stringify(user) };
  if (startParam) fields.start_param = startParam;
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

/** Page helpers: the scene's words, a uiId's presence, a tap (scrolling the sheet first), the forms. */
function helpers(p, tag) {
  const api = makePageApi(p, { tapWait: 250, step: 200, btnWaitMs: 15000 });
  const ev = api.ev;
  const h = {
    api,
    ev,
    text: async () => (await api.sceneText('Menu')).replace(/\s+/g, ' ').toLowerCase(),
    has: (id) =>
      ev((i) => {
        let hit = false;
        const walk = (l) => l.forEach((o) => ((o.__uiId === i && o.visible && (hit = true)), o.list && walk(o.list)));
        for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
        return hit;
      }, id),
    /** Taps a control by its uiId, scrolling the sheet with the wheel until it is in the upper part of the view. */
    async tap(id) {
      await until(() => h.has(id), 15000, 150);
      for (let i = 0; i < 12; i++) {
        const at = await api.btn('Menu', { id });
        const vh = p.viewportSize().height;
        if (at && at[1] < vh * 0.72) break;
        await p.mouse.move(p.viewportSize().width / 2, vh / 2);
        await p.mouse.wheel(0, 160);
        await p.waitForTimeout(250);
      }
      await api.tapBtn('Menu', { id });
    },
    form: () => ev(() => document.querySelector('#px-auth form')?.dataset.form ?? null),
    async fill(values) {
      for (const [k, v] of Object.entries(values)) await p.fill(`#px-auth input[name=${k}]`, v);
    },
    submit: () => p.click('#px-auth [data-act=submit]'),
    submitDisabled: () => ev(() => !!document.querySelector('#px-auth [data-act=submit]')?.disabled),
    focused: () => ev(() => window.__focus?.focused?.key ?? null),
    me: () => ev(async () => (await window.__online.api.me()).player),
    account: () => ev(() => window.__online.api.account()),
    async boot(path = '') {
      await p.goto('about:blank');
      await p.goto(`${BASE}${path}`);
      await until(() => ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
      await p.waitForTimeout(800);
    },
    /** The account has a cloud save with progress past day 1 (a won battle; V6-LINK-07's day1Only), on top of the game's own upload. */
    async progress() {
      return ev(async () => {
        for (let i = 0; i < 3; i++) {
          const r = await window.__online.api.getSave();
          try {
            return (await window.__online.api.putSave(r.revision, { ...window.__state.campaign.sync(), won: 3, fought: 3, seq: 1000 + i })).revision;
          } catch {
            /* the game uploaded meanwhile: look again */
          }
        }
        return 0;
      });
    },
    /** The cloud save as the server holds it (null without one). */
    cloud: () => ev(async () => (await window.__online.api.getSave()).data ?? null),
    shot: async (name) => {
      if (!SHOTS || shots >= 10) return;
      shots++;
      await p.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 78 });
    },
  };
  p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return h;
}

/** A web account, signed up and verified in a fresh desktop browser: a laptop with a touch screen, or (`touch: false`) a mouse only. */
async function webAccount(name, { touch = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: touch });
  await prepContext(ctx);
  await applyPlatform(ctx, 'web');
  await ctx.addInitScript(() => (window.__noFirstRun = true));
  const p = await ctx.newPage();
  const W = helpers(p, `web-${name}`);
  const email = `link06-${name}+${stamp}@example.com`;
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

/** A Telegram user in a fresh phone context; `launch(startParam)` relaunches with fresh initData. */
async function telegramUser(name) {
  const ctx = await phoneContext(browser, { viewport: { width: 390, height: 844 } });
  await applyPlatform(ctx, 'telegram');
  await ctx.addInitScript(() => {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const d = sessionStorage.getItem('__initData');
    const wa = window.Telegram?.WebApp;
    if (d && wa) {
      wa.initData = d;
      wa.initDataUnsafe = { ...wa.initDataUnsafe, start_param: sessionStorage.getItem('__sp') || undefined };
    }
  });
  const p = await ctx.newPage();
  const T = helpers(p, `tg-${name}`);
  const user = { id: 700000000 + Math.floor(Math.random() * 1e8), first_name: name, username: `${name.toLowerCase()}_${stamp}` };
  const launchApp = async (startParam = null, path = '') => {
    await p.goto(`${BASE}`);
    await p.evaluate(([d, sp]) => (sessionStorage.setItem('__initData', d), sessionStorage.setItem('__sp', sp ?? '')), [initData(user, startParam), startParam]);
    await T.boot(path);
    await until(() => T.ev(() => window.__online.signedIn), 15000, 250);
  };
  await launchApp();
  const me = await T.me();
  return { ctx, p, T, user, launch: launchApp, id: me.id, name: me.displayName };
}

/** The web's Account page → Link: returns the code and deep link the server gave. */
async function startLink(w, { keyboard = false } = {}) {
  await w.W.api.call('Menu', 's.openAccount(); return 1;');
  await until(() => w.W.has('account.tg.link'), 15000, 250);
  const res = w.p.waitForResponse((r) => r.url().endsWith('/api/account/link/telegram') && r.request().method() === 'POST');
  if (keyboard) {
    let guard = 0;
    while ((await w.W.focused()) !== 'account.tg.link' && guard++ < 25) await w.p.keyboard.press('Tab');
    check('keyboard: Tab reaches Telegram\'s Link on the Account page', (await w.W.focused()) === 'account.tg.link', String(await w.W.focused()));
    await w.p.keyboard.press('Enter');
  } else await w.W.tap('account.tg.link');
  // a fresh session may still need its proof: AU-10, the password
  const r = await Promise.race([res, until(() => w.W.form().then((f) => f === 'reauth'), 8000).then(() => null)]);
  let body = r && r.ok() ? await r.json() : null;
  if (!body) {
    await w.W.fill({ password: PW });
    await w.W.submit();
    body = await (await res).json();
  }
  await until(() => w.W.has('link.copy').then((x) => x || w.W.has('link.copyCode')), 15000, 250);
  return body;
}

async function confirmOnWeb(w, { keyboard = false } = {}) {
  await until(() => w.W.has('link.confirm'), 8000, 200);
  if (keyboard) {
    let guard = 0;
    while ((await w.W.focused()) !== 'link.confirm' && guard++ < 25) await w.p.keyboard.press('Tab');
    check('keyboard: Tab reaches Confirm link', (await w.W.focused()) === 'link.confirm', String(await w.W.focused()));
    await w.p.keyboard.press('Enter');
  } else await w.W.tap('link.confirm');
  if (await until(() => w.W.form().then((f) => f === 'reauth'), 4000)) {
    await w.W.fill({ password: PW });
    await w.W.submit();
  }
}

const identities = (pid) => d1(`SELECT kind FROM auth_identities WHERE player_id = ${pid} ORDER BY kind`).map((r) => r.kind).join(',');
const alive = (pid) => d1(`SELECT deleted_at FROM players WHERE id = ${pid}`)[0]?.deleted_at === null;

// =========================================================== A. no conflict (keyboard only on the web, a mouse device)
{
  const w = await webAccount('Ana', { touch: false });
  const tg = await telegramUser('Basil');
  const code = await startLink(w, { keyboard: true });
  check('A: the server gives a deep link for the configured bot', code?.deepLink === `https://t.me/pixelarrow_dev_bot/play?startapp=link_${code.code}`, JSON.stringify(code));
  const alt = await w.W.ev(() => {
    let a = null;
    const walk = (l) => l.forEach((o) => (o.__uiId === 'link.qr' && (a = o.alt), o.list && walk(o.list)));
    for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
    return a;
  });
  check('A: a mouse device shows the QR code of the same link (its alt is the link), with Copy link and Open Telegram', alt === code.deepLink && (await w.W.has('link.copy')) && (await w.W.has('link.open')), `${alt} ${await w.W.has('link.copy')} ${await w.W.has('link.open')}`);
  check('A: the steps and the countdown show', /open pixelarrow in telegram.*tap "link" there.*come back and confirm here.*waiting for telegram… [0-9]:[0-9]{2}/.test(await w.W.text()), (await w.W.text()).slice(0, 300));
  await w.W.shot('01-web-link-steps-qr');
  await tg.launch(`link_${code.code}`);
  await until(() => tg.T.has('link.tg.link'), 15000, 250);
  const req = await tg.T.text();
  const masked = w.email.replace(/^(.).*@(.).*(\.[a-z]+)$/, '$1***@$2***$3');
  check('A: the Mini App request names the web account and its masked email, and warns', req.includes(w.name.toLowerCase()) && req.includes(masked) && req.includes('only continue if you started this'), req.slice(0, 300));
  check('A: the Mini App never shows the full email', !req.includes(w.email.toLowerCase()));
  await tg.T.tap('link.tg.link');
  await until(() => tg.T.text().then((x) => x.includes('almost done')), 10000, 100);
  const t0 = Date.now();
  await until(() => w.W.has('link.confirm'), 8000, 100);
  const dt = Date.now() - t0;
  check(`A: once the Mini App completed, the web turns to "Is this you?" within 3 s (${dt} ms; a 3 s poll), naming @username`, dt <= 3000 && (await w.W.text()).includes(`@${tg.user.username.toLowerCase()}`), String(dt));
  await w.W.shot('02-web-link-confirm');
  // V6-LINK-07: the Mini App uploaded its day-1 campaign on its first launch; that alone counts as empty
  const day1 = await until(async () => {
    const r = d1(`SELECT json_extract(data, '$.won') AS won, json_extract(data, '$.fought') AS fought, json_extract(data, '$.world.time') AS hours FROM saves WHERE player_id = ${tg.id}`)[0];
    return r && r.won === 0 && r.fought === 0 && r.hours < 24 ? r : null;
  }, 15000, 500);
  check('A: the Telegram side has its own day-1 cloud save (kept, not deleted by the script)', !!day1, JSON.stringify(day1));
  await confirmOnWeb(w, { keyboard: true });
  await until(() => w.W.text().then((x) => x.includes('telegram linked')), 15000);
  check('A: linked; the empty Telegram-side account was removed (the note says so)', (await w.W.text()).includes('empty pixelarrow account'), (await w.W.text()).slice(-400));
  check('A: one player with both identities', identities(w.id) === 'password,telegram', identities(w.id));
  check('A: the day-1-only Telegram-side player is being deleted, and its save with it', !alive(tg.id) && d1(`SELECT COUNT(*) AS n FROM saves WHERE player_id = ${tg.id}`)[0]?.n === 0);
  // the Mini App, still open on "Almost done", follows by itself: the web account, and the toast
  const switched = await until(() => tg.T.ev((id) => window.__online.playerId === id, w.id), 20000, 250);
  check('A: the open Mini App switches to the web account by itself (no relaunch)', switched, String(await tg.T.ev(() => window.__online.playerId)));
  const toastSeen = await until(() => tg.T.text().then((x) => x.includes(`you now play as ${w.name.toLowerCase()} here too`)), 10000, 150);
  check('A: … and says so (account.link.switched)', toastSeen, (await tg.T.text()).slice(0, 300));
  await tg.T.shot('02b-tg-switched');
  await tg.launch();
  check('A: Telegram now signs in to the web account', (await tg.T.me()).id === w.id);
  await w.p.keyboard.press('Escape');
  await w.ctx.close();
  await tg.ctx.close();
}

/** Web and Telegram accounts that both have progress, the Mini App's Link tapped and the web confirmed: the conflict's id. */
async function conflictPair(wn, tn) {
  const w = await webAccount(wn);
  const tg = await telegramUser(tn);
  await w.W.progress();
  await tg.T.progress();
  const code = await startLink(w);
  await tg.launch(`link_${code.code}`);
  await until(() => tg.T.has('link.tg.link'), 15000, 250);
  check(`[${tn}] the Mini App warns that its own progress means choosing an account to keep`, (await tg.T.text()).includes('has progress too'));
  await tg.T.tap('link.tg.link');
  await until(() => tg.T.text().then((x) => x.includes('which account to keep')), 10000);
  await confirmOnWeb(w);
  await until(() => w.W.has('conflict.card.this'), 15000, 250);
  return { w, tg };
}

/** The web picks `keep` and types the other's name; returns once it waits for Telegram (202). */
async function webChoose(w, keep, loser, { keyboard = false } = {}) {
  if (keyboard) {
    let guard = 0;
    while ((await w.W.focused()) !== `conflict.card.${keep}` && guard++ < 25) await w.p.keyboard.press('Tab');
    check('keyboard: Tab reaches the account card', (await w.W.focused()) === `conflict.card.${keep}`, String(await w.W.focused()));
    await w.p.keyboard.press('Enter');
    await w.p.waitForTimeout(300);
    guard = 0;
    while ((await w.W.focused()) !== 'conflict.go' && guard++ < 25) await w.p.keyboard.press('Tab');
    check('keyboard: Tab reaches the danger button', (await w.W.focused()) === 'conflict.go', String(await w.W.focused()));
    await w.p.keyboard.press('Enter');
  } else {
    await w.W.tap(`conflict.card.${keep}`);
    await w.W.tap('conflict.go');
  }
  await until(() => w.W.form().then((f) => f === 'conflictConfirm'), 8000);
  check('the danger button stays off until the name matches', await w.W.submitDisabled());
  if (keyboard) {
    await w.p.keyboard.type(`  ${loser.toUpperCase()} `);
    await w.p.keyboard.press('Enter');
  } else {
    await w.W.fill({ confirm: `  ${loser.toUpperCase()} ` });
    await w.W.submit();
  }
  if (await until(() => w.W.form().then((f) => f === 'reauth'), 3000)) {
    await w.W.fill({ password: PW });
    await w.W.submit();
  }
  await until(() => w.W.text().then((x) => x.includes('choose the same account')), 15000);
}

/** The Mini App, from a newer launch (the bot's button: startapp=account, V6-LINK-07), finds the conflict and picks `keep`. */
async function telegramChoose(tg, keep, loser) {
  await tg.launch('account');
  await until(() => tg.T.has(`conflict.tg.card.${keep}`), 15000, 250);
  await tg.T.tap(`conflict.tg.card.${keep}`);
  await tg.T.tap('conflict.tg.go');
  await until(() => tg.T.form().then((f) => f === 'conflictConfirm'), 8000);
  await tg.T.fill({ confirm: loser.toLowerCase() });
  await tg.T.submit();
}

// =========================================================== B. both choose the same → resolved
{
  const { w, tg } = await conflictPair('Cleo', 'Damon');
  const t1 = await w.W.text();
  check('B: the web shows both accounts with their facts (two-up at 1280)', t1.includes(w.name.toLowerCase()) && t1.includes(tg.name.toLowerCase()) && t1.includes('campaign day') && t1.includes('purchases: no'));
  await w.W.shot('03-web-conflict-cards');
  await webChoose(w, 'this', tg.name, { keyboard: true });
  check('B: the web waits for Telegram (nothing deleted yet)', alive(tg.id) && alive(w.id));
  await w.W.shot('04-web-conflict-waiting');
  await telegramChoose(tg, 'web', tg.name);
  await until(() => tg.T.text().then((x) => x.includes('finish in your browser')), 10000);
  await until(() => w.W.text().then((x) => x.includes(`${tg.name.toLowerCase()} was deleted`)), 15000);
  check('B: same choice on both sides → resolved: the web keeps both sign-ins, the Telegram-side account is deleted', identities(w.id) === 'password,telegram' && !alive(tg.id), identities(w.id));
  await w.ctx.close();
  await tg.ctx.close();
}

// =========================================================== C. different choices → nothing happens
{
  const { w, tg } = await conflictPair('Eos', 'Faidon');
  await webChoose(w, 'this', tg.name);
  await telegramChoose(tg, 'telegram', w.name);
  await until(() => tg.T.text().then((x) => x.includes('chose differently')), 10000);
  await until(() => w.W.text().then((x) => x.includes('chose differently')), 15000);
  check('C: different choices: both sides say so, both accounts stay, nothing linked', alive(w.id) && alive(tg.id) && identities(w.id) === 'password' && identities(tg.id) === 'telegram', `${identities(w.id)} | ${identities(tg.id)}`);
  await w.ctx.close();
  await tg.ctx.close();
}

// =========================================================== D. "Not me" in the Mini App
{
  const w = await webAccount('Gaia');
  const tg = await telegramUser('Helios');
  const code = await startLink(w);
  await tg.launch(`link_${code.code}`);
  await until(() => tg.T.has('link.tg.notMe'), 15000, 250);
  await tg.T.tap('link.tg.notMe');
  await until(() => tg.T.text().then((x) => x.includes('nothing was linked')), 10000);
  await until(() => w.W.text().then((x) => x.includes('cancelled in telegram')), 8000);
  check('D: Not me cancels the code; the web says it was cancelled in Telegram; nothing linked', identities(w.id) === 'password' && alive(tg.id));
  await w.ctx.close();
  await tg.ctx.close();
}

// =========================================================== E. an expired code
{
  const w = await webAccount('Iris');
  const tg = await telegramUser('Kastor');
  const code = await startLink(w);
  d1(`UPDATE link_codes SET expires_at = ${Date.now() - 1000} WHERE player_id = ${w.id}`);
  await until(() => w.W.has('link.newCode'), 10000, 250);
  check('E: the web says the code expired and offers a new one', (await w.W.text()).includes('the code expired'));
  await tg.launch(`link_${code.code}`);
  await until(() => tg.T.text().then((x) => x.includes('this link has expired')), 15000);
  check('E: the Mini App says the link expired (no Link button)', !(await tg.T.has('link.tg.link')));
  await w.W.tap('link.newCode');
  await until(() => w.W.has('link.copy'), 15000, 250);
  // a touch screen: the QR waits behind Show QR code
  check('E: New code starts again (touch: Show QR code, then the code)', await w.W.has('link.showQr'));
  await w.W.tap('link.showQr');
  await until(() => w.W.has('link.qr'), 5000, 200);
  check('E: Show QR code draws it', await w.W.has('link.qr'));
  await w.ctx.close();
  await tg.ctx.close();
}

// =========================================================== F. the attacker: one tap of the victim's, then alone
{
  const atk = await webAccount('Mallory');
  const vic = await telegramUser('Nikias');
  await atk.W.progress();
  await vic.T.progress();
  const code = await startLink(atk);
  // the victim opens the attacker's link (sent in a chat) and taps Link once
  await vic.launch(`link_${code.code}`);
  await until(() => vic.T.has('link.tg.link'), 15000, 250);
  await vic.T.shot('05-tg-request-attacker');
  await vic.T.tap('link.tg.link');
  await confirmOnWeb(atk);
  await until(() => atk.W.has('conflict.card.this'), 15000, 250);
  await webChoose(atk, 'this', vic.name);
  // the attacker tries to finish alone
  const again = await atk.W.ev(async ([id, n]) => {
    const r = await fetch(`/api/account/conflict/${id}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keep: 'this', confirm: n }) });
    return r.status;
  }, [d1(`SELECT id FROM link_conflicts WHERE player_id = ${atk.id}`)[0]?.id, vic.name]);
  check("F: the attacker can't resolve alone: 202 waiting_telegram again; the victim's account is intact", again === 202 && alive(vic.id) && identities(vic.id) === 'telegram', String(again));
  // the bot asks the victim; the Mini App shows who asks and what would be deleted
  await vic.launch('account');
  await until(() => vic.T.has('conflict.tg.card.web'), 15000, 250);
  const shown = await vic.T.text();
  const masked = atk.email.replace(/^(.).*@(.).*(\.[a-z]+)$/, '$1***@$2***$3');
  check('F: the Mini App names the web account asking (name and masked email) and says the other is deleted for good, with Not me', shown.includes('web account asking') && shown.includes(atk.name.toLowerCase()) && shown.includes(masked) && shown.includes('deleted for good') && (await vic.T.has('conflict.tg.notMe')));
  const notMeFirst = await vic.T.ev(() => {
    const ys = {};
    const walk = (l) => l.forEach((o) => (o.__uiId && (ys[o.__uiId] = o.getBounds().y), o.list && walk(o.list)));
    for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
    return ys['conflict.tg.notMe'] < ys['conflict.tg.card.telegram'] && ys['conflict.tg.notMe'] < ys['conflict.tg.go'];
  });
  check('F: Not me comes before the cards and the delete button (no scrolling past a choice to refuse)', notMeFirst);
  await vic.T.shot('06-tg-conflict-attacker');
  await vic.T.tap('conflict.tg.notMe');
  await until(() => vic.T.text().then((x) => x.includes('nothing was linked')), 10000);
  await until(() => atk.W.text().then((x) => x.includes('cancelled in telegram')), 15000);
  check('F: Not me ends it: the attacker sees it was cancelled; the victim keeps everything', alive(vic.id) && identities(vic.id) === 'telegram' && identities(atk.id) === 'password');
  await atk.W.shot('07-web-attacker-cancelled');
  await atk.ctx.close();
  await vic.ctx.close();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await finish({ browser });
