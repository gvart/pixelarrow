// The guest flow and the account page end to end against a local Worker (V6-ACCT-07,
// design/ux/accounts-v6.md §4, §6.3, §8.2, §8.9).
//
//   node scripts/guest-save-e2e.mjs <gameUrl> [--persist <wrangler state dir>] [--shots <dir>]
//
// The same setup as scripts/account-e2e.mjs: `wrangler dev` with DEV_AUTH, DEV_EMAIL and the always-pass
// Turnstile secret on a private local D1, and the game from vite proxying /api to it (give vite's URL).
//
// Flows: a guest with campaign progress (won battles, gold) sees the guest tip and AU-01 on Duels → signs up
// → verifies → the next launch uploads the guest save whole (nothing lost) → log out keeps the campaign and
// drops the sync metadata → more guest play, log in → Two campaigns, "In your account" kept (confirmed, the
// replaced copy kept on the device) → log out, log in again → Two campaigns, "On this browser" kept by
// keyboard (uploaded over the account's) → Signed-in devices lists a second browser and logs it out → Log out
// everywhere ends every session, the campaign stays.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { check, finish, launch, ROOT, until, phoneContext, makePageApi } from './lib/harness.mjs';
import { applyPlatform } from './lib/platform.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const BASE = (argv.find((a) => /^https?:\/\//.test(a)) ?? process.env.BASE_URL ?? '').replace(/\/?$/, '/');
if (BASE === '/') {
  console.log('NOT RUN: give the URL of the game (vite, proxying /api to the local worker)');
  process.exit(2);
}
const PERSIST = opt('persist', join(ROOT, 'server/.wrangler/state'));
const SHOTS = opt('shots', null);

function outboxToken(to, path) {
  const sql = `SELECT text FROM dev_outbox WHERE to_addr = '${to.replace(/'/g, "''")}' ORDER BY id DESC LIMIT 5`;
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pixelarrow', '--local', '--config', '../wrangler.jsonc', '--persist-to', PERSIST, '--json', '--command', sql], { cwd: join(ROOT, 'server'), encoding: 'utf8' });
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

const browser = await launch();
const ctx = await phoneContext(browser, { viewport: { width: 390, height: 844 } });
await applyPlatform(ctx, 'web');
await ctx.addInitScript(() => (window.__noFirstRun = true));
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const api = makePageApi(p, { tapWait: 250, step: 200, btnWaitMs: 15000 });
const ev = api.ev;
const shot = async (name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.png`) });
const form = () => ev(() => document.querySelector('#px-auth form')?.dataset.form ?? null);
const fill = async (values) => {
  for (const [k, v] of Object.entries(values)) await p.fill(`#px-auth input[name=${k}]`, v);
};
const submit = () => p.click('#px-auth [data-act=submit]');
const has = (id) => ev((i) => {
  let hit = false;
  const walk = (l) => l.forEach((o) => ((o.__uiId === i && o.visible && (hit = true)), o.list && walk(o.list)));
  for (const s of window.__game.scene.getScenes(true)) walk(s.children.list);
  return hit;
}, id);
const menuText = () => api.sceneText('Menu');
/** The local campaign (what this browser's storage holds). */
const local = () => ev(() => ({ won: window.__state.campaign.data.won, gold: window.__state.campaign.data.gold, seq: window.__state.campaign.data.seq }));
const cloud = () => ev(async () => {
  const r = await fetch('/api/save', { credentials: 'same-origin' });
  if (!r.ok) return { status: r.status };
  const j = await r.json();
  return { status: r.status, revision: j.revision, won: j.data?.won, gold: j.data?.gold, seq: j.data?.seq };
});
const meta = () => ev(() => localStorage.getItem('pixelarrow:px_sync') ?? Object.keys(localStorage).filter((k) => k.endsWith('px_sync')).map((k) => localStorage.getItem(k))[0] ?? null);
async function boot(hash = '') {
  await p.goto('about:blank');
  await p.goto(`${BASE}${hash}`);
  await until(() => ev(() => !!window.__game?.scene.isActive('Menu')), 60000, 250);
  await p.waitForTimeout(800);
}
/** Plays as a guest: the campaign gets `won` battles and `gold`, saved locally. */
const play = (won, gold) => ev(async ([w, g]) => {
  const st = window.__state;
  if (!st.hasSave) await st.reset();
  st.campaign.data.won = w;
  st.campaign.data.gold = g;
  await st.save();
}, [won, gold]);

const stamp = Date.now().toString(36);
const EMAIL = `acct07+${stamp}@example.com`;
const PW = 'amber falcon river 42';

// ---- a guest plays
await boot();
check('a guest: signed out, no session cookie', !(await ev(() => window.__online.signedIn)));
await play(6, 344);
await boot();
check('the guest campaign survives a reload (local save)', JSON.stringify(await local()).includes('"won":6,"gold":344'), JSON.stringify(await local()));
check('AU-07 the guest tip shows on the hub after a won battle', await has('menu.guestTip'));
await shot('01-guest-tip');
await api.start('Duel', {});
await until(() => has('auth.gate.signedOut'), 20000, 250);
check('AU-01 on Duels: Sign in to play online, Create account and Log in', (await has('auth.gate.create')) && (await has('auth.gate.login')));
await shot('02-au01-duels');
await api.start('Menu', {});
await until(() => ev(() => window.__game.scene.isActive('Menu')), 10000);

// ---- sign up from the guest tip
await p.waitForTimeout(600);
await api.tapBtn('Menu', { id: 'menu.guestTip.create' });
await until(() => form().then((f) => f === 'signup'), 10000);
check('the guest tip’s Create account opens the sign-up form', (await form()) === 'signup');
await fill({ email: EMAIL, password: PW });
await submit();
await until(() => menuText().then((t) => /check your email/i.test(t)), 20000);
let tok = null;
await until(async () => !!(tok = outboxToken(EMAIL, '/auth/signup#t=')), 20000, 1000);
const verified = await ev(async (t) => (await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) })).status, tok);
check('the email link signs this browser in (200)', verified === 200, String(verified));

// ---- the next launch uploads the guest save
const before = await local();
await boot();
await until(async () => (await cloud()).won === 6, 20000, 500);
const up = await cloud();
check('sign-up: the guest campaign is on the account, nothing lost (won, gold, seq)', up.won === before.won && up.gold === before.gold && up.seq >= before.seq, JSON.stringify({ before, up }));
check('the sync metadata names this player', /"pid":\d+/.test((await meta()) ?? ''), await meta());
check('signed in: the guest tip is gone', !(await has('menu.guestTip')));

// ---- Settings → Account, log out
await api.call('Menu', 's.openAccount(); return 1;');
await until(() => has('account.logout'), 15000, 250);
check('AU-09 signed in: name, boards switch, devices, log out', (await has('account.boards')) && (await has('account.devices')));
await shot('03-account');
await api.tapBtn('Menu', { id: 'account.logout' });
await p.waitForTimeout(500);
await api.tapBtn('Menu', { label: 'Log out', index: -1 });
await until(async () => !(await ev(() => window.__online.signedIn)), 15000, 250);
check('log out: signed out, the campaign stays on the device', JSON.stringify(await local()).includes('"won":6'));
check('log out: the sync metadata is removed', !(await meta()));
check('log out: the server session is gone', (await cloud()).status === 401);

// ---- more guest play, then log in: Two campaigns, keep the account's
await play(9, 500);
await boot('#login');
await until(() => form().then((f) => f === 'login'), 20000);
await fill({ email: EMAIL, password: PW });
await submit();
await until(() => has('sync.two.play'), 20000, 250);
check('log in with progress on both sides: AU-08 Two campaigns', await has('sync.two.local'));
check('AU-08 preselects the copy with more progress ("On this browser", 9 won against 6)', await ev(() => window.__online.choice?.prefer === 'local'));
check('nothing written while AU-08 waits: the account still has 6, the browser 9', (await cloud()).won === 6 && (await local()).won === 9);
await shot('04-two-campaigns');
await api.tapBtn('Menu', { id: 'sync.two.cloud' });
await api.tapBtn('Menu', { id: 'sync.two.play' });
await p.waitForTimeout(400);
await shot('05-two-campaigns-cloud');
check('the account’s campaign has fewer battles won than this browser’s: keeping it asks first', /shorter campaign/i.test(await menuText()));
check('…and nothing is written before the confirm', (await cloud()).won === 6 && (await local()).won === 9);
await api.tapBtn('Menu', { label: 'Play this campaign', index: -1 });
await until(async () => (await local()).won === 6, 15000, 250);
check('"In your account": this browser now plays the account’s campaign', (await local()).won === 6 && (await cloud()).won === 6);
const kept = await ev(() => Object.keys(localStorage).filter((k) => k.includes('px_save_replaced')).map((k) => JSON.parse(localStorage.getItem(k)).data.won)[0] ?? null);
check('the replaced campaign (9 won) is kept once on the device', kept === 9, String(kept));

// ---- log out, play less, log in, keep this browser's by keyboard (confirmed: fewer battles won)
await ev(() => import('/src/ui/account/index.ts').then((m) => m.logOut()));
await play(2, 50);
await p.setViewportSize({ width: 1280, height: 800 });
await boot('#login');
await until(() => form().then((f) => f === 'login'), 20000);
await fill({ email: EMAIL, password: PW });
await submit();
await until(() => has('sync.two.play'), 20000, 250);
check('AU-08 preselects the copy with more progress ("In your account", 6 won against 2)', await ev(() => window.__online.choice?.prefer === 'cloud'));
// keyboard: Tab to "On this browser", Enter picks it, Tab to Play, Enter, then confirm with Enter
const focusedId = () => ev(() => window.__focus?.focused?.key ?? null);
let guard = 0;
while ((await focusedId()) !== 'sync.two.local' && guard++ < 8) await p.keyboard.press('Tab');
check('keyboard reaches "On this browser"', (await focusedId()) === 'sync.two.local', String(await focusedId()));
await p.keyboard.press('Enter');
guard = 0;
while ((await focusedId()) !== 'sync.two.play' && guard++ < 8) await p.keyboard.press('Tab');
await p.keyboard.press('Enter');
await p.waitForTimeout(500);
await shot('06-less-confirm');
check('keeping the shorter campaign asks first', /shorter campaign/i.test(await menuText()));
check('…and nothing is written before the confirm', (await cloud()).won === 6);
await api.tapBtn('Menu', { label: 'Play this campaign', index: -1 });
await until(async () => (await cloud()).won === 2, 20000, 500);
check('"On this browser": the browser’s campaign went up over the account’s', (await cloud()).won === 2 && (await local()).won === 2);

// ---- devices: a second browser signs in; list it, log it out; then log out everywhere
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
await p2.goto(BASE);
const login2 = () => p2.evaluate(async ([e, pw]) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: pw, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' }) })).status, [EMAIL, PW]);
check('a second browser logs in', (await login2()) === 200);
await api.call('Menu', 's.openAccount(); return 1;');
await until(() => has('account.devices'), 15000, 250);
await api.tapBtn('Menu', { id: 'account.devices' });
await until(() => ev(() => !!document && true), 1000);
await until(async () => (await api.sceneText('Menu')).includes('This device'), 15000, 250);
const handles = await ev(() => {
  const out = [];
  const walk = (l) => l.forEach((o) => (o.__uiId?.startsWith('devices.logout.') && out.push(o.__uiId), o.list && walk(o.list)));
  walk(window.__game.scene.getScene('Menu').children.list);
  return out;
});
check('AU-17 lists this device and the other browser (Log out on the other only)', handles.length === 1, handles.join());
await shot('07-devices');
await api.tapBtn('Menu', { id: handles[0] });
await until(async () => (await p2.evaluate(async () => (await fetch('/api/me')).status)) === 401, 15000, 500);
check('Log out on the other row ends that browser’s session', (await p2.evaluate(async () => (await fetch('/api/me')).status)) === 401);
check('a second login again', (await login2()) === 200);
await api.call('Menu', 's.scene.restart(); return 1;');
await p.waitForTimeout(800);
await api.call('Menu', 's.openAccount(); return 1;');
await until(() => has('account.devices'), 15000, 250);
await api.tapBtn('Menu', { id: 'account.devices' });
await until(() => has('devices.logoutAll'), 15000, 250);
await api.tapBtn('Menu', { id: 'devices.logoutAll' });
await p.waitForTimeout(500);
await api.tapBtn('Menu', { label: 'Log out everywhere', index: -1 });
await until(async () => !(await ev(() => window.__online.signedIn)), 15000, 250);
check('Log out everywhere: this device is signed out, the campaign stays', (await local()).won === 2);
check('Log out everywhere: the other browser is signed out too (Q6)', (await p2.evaluate(async () => (await fetch('/api/me')).status)) === 401);
await ctx2.close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
finish();
