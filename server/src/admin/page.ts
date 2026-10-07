/**
 * The /admin page: a small standalone HTML page (not part of the Phaser
 * game) served by the Worker, talking to /api/admin/* with the operator's
 * ADMIN_TOKEN (kept in sessionStorage only, so it is gone when the tab
 * closes). All data is rendered with textContent, never as HTML: player
 * names and error messages are user-controlled.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../env';

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Pixelarrow admin</title>
<link rel="stylesheet" href="/admin/app.css">
</head>
<body>
<header>
  <strong>Pixelarrow admin</strong>
  <nav id="tabs"></nav>
  <span id="who"></span>
  <button id="logout" hidden>Sign out</button>
</header>
<main id="main">
  <form id="login">
    <h1>Sign in</h1>
    <p>Paste your admin token (the <code>ADMIN_TOKEN</code> Worker secret). It stays in this tab only.</p>
    <input id="token" type="password" autocomplete="off" placeholder="admin token" required minlength="32">
    <button type="submit">Sign in</button>
    <p id="login-error" class="err"></p>
  </form>
</main>
<script src="/admin/app.js"></script>
</body>
</html>`;

const CSS = `
:root { color-scheme: light dark; --bg: #faf7f2; --fg: #2b1d1a; --muted: #7a6a62; --line: #e2d9cf; --accent: #9c3d2a; --bad: #b3261e; --ok: #2e7d32; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1614; --fg: #f1e8df; --muted: #a8988f; --line: #3a2f2b; --accent: #e08a6d; --bad: #ff8a80; --ok: #81c784; } }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.45 system-ui, sans-serif; background: var(--bg); color: var(--fg); }
header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--bg); }
nav { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
nav button.sel { background: var(--accent); color: #fff; border-color: var(--accent); }
main { padding: 16px; max-width: 1200px; margin: 0 auto; }
button, input, select, textarea { font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; }
button { cursor: pointer; } button:hover { border-color: var(--accent); }
button.danger { border-color: var(--bad); color: var(--bad); }
input, select { min-width: 0; }
#login { max-width: 420px; display: grid; gap: 10px; margin-top: 10vh; }
h1 { font-size: 20px; margin: 0 0 8px; } h2 { font-size: 16px; margin: 20px 0 8px; }
.err { color: var(--bad); white-space: pre-wrap; } .ok { color: var(--ok); }
.muted { color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.card { border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.card b { display: block; font-size: 20px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
td { max-width: 420px; overflow-wrap: anywhere; }
tr.click { cursor: pointer; } tr.click:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; background: color-mix(in srgb, var(--fg) 6%, transparent); padding: 8px; border-radius: 6px; }
fieldset { border: 1px solid var(--line); border-radius: 8px; margin: 12px 0; }
`;

const JS = `'use strict';
(() => {
  const KEY = 'pa_admin_token';
  const main = document.getElementById('main');
  const tabsEl = document.getElementById('tabs');
  const whoEl = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  let token = sessionStorage.getItem(KEY) || '';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const fmtTime = (ms) => (ms ? new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 19) : '');
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

  async function api(method, path, body) {
    const res = await fetch('/api/admin' + path, {
      method,
      headers: Object.assign({ authorization: 'Bearer ' + token }, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      if (res.status === 401) { signOut(); }
      throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    }
    return data;
  }

  function table(rows, cols, onRow) {
    if (!rows || !rows.length) return h('p', { class: 'muted' }, 'Nothing here.');
    cols = cols || Object.keys(rows[0]);
    return h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null },
        cols.map((c) => h('td', {}, /(_at|_seen|At)$/.test(c) && typeof r[c] === 'number' ? fmtTime(r[c]) : r[c] === null || r[c] === undefined ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c]))))))));
  }
  function show(...nodes) { main.replaceChildren(...nodes); }
  function errBox(e) { return h('p', { class: 'err' }, String(e && e.message || e)); }
  async function guard(fn) { try { await fn(); } catch (e) { main.append(errBox(e)); } }

  // ---- action form: reason + confirm, one request id per submission
  function actionForm(label, fields, run, danger) {
    const out = h('span', {});
    const reason = h('input', { placeholder: 'reason (audited)', required: true, minlength: 3, size: 28 });
    const form = h('form', { class: 'row', onsubmit: async (ev) => {
      ev.preventDefault();
      if (!confirm(label + '?')) return;
      out.className = ''; out.textContent = '...';
      try {
        const r = await run(reason.value, rid());
        out.className = 'ok'; out.textContent = JSON.stringify(r);
      } catch (e) { out.className = 'err'; out.textContent = e.message; }
    } }, ...fields, reason, h('button', { type: 'submit', class: danger ? 'danger' : '' }, label), out);
    return form;
  }

  const TABS = {
    Overview: async () => {
      const o = await api('GET', '/overview');
      const card = (t, v, sub) => h('div', { class: 'card' }, h('span', { class: 'muted' }, t), h('b', {}, v ?? 0), sub ? h('small', { class: 'muted' }, sub) : null);
      show(h('h1', {}, 'Overview'), h('div', { class: 'cards' },
        card('Players', o.players.total, (o.players.new24h || 0) + ' new in 24 h'),
        card('Active 24 h', o.players.active24h), card('Active 7 d', o.players.active7d),
        card('Purchases 24 h', o.purchases.n24h, (o.purchases.stars24h || 0) + ' Stars'),
        card('Purchases 7 d', o.purchases.n7d, (o.purchases.stars7d || 0) + ' Stars, ' + (o.purchases.refunds7d || 0) + ' refunds'),
        card('Drachmae held', o.drachmae.circulating, (o.drachmae.negative || 0) + ' negative wallets'),
        card('Client errors 24 h', o.errors.events, (o.errors.groups || 0) + ' distinct'),
        card('Banned', o.banned),
        card('Season', o.season ? '#' + o.season.id : 'none', o.season ? 'ends ' + fmtTime(o.season.ends_at) : ''),
        card('Analytics Engine', o.analyticsEngine ? 'on' : 'off')));
    },
    Players: async () => {
      const q = h('input', { placeholder: 'id, Telegram id or username', size: 30 });
      const results = h('div', {});
      const search = async () => { results.replaceChildren(h('p', { class: 'muted' }, '...')); try { const r = await api('GET', '/players?q=' + encodeURIComponent(q.value)); results.replaceChildren(table(r.players, ['id', 'telegram_id', 'username', 'first_name', 'created_at', 'last_seen_at', 'banned_at'], (p) => openPlayer(p.id))); } catch (e) { results.replaceChildren(errBox(e)); } };
      show(h('h1', {}, 'Players'), h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); search(); } }, q, h('button', { type: 'submit' }, 'Search')), results);
      search();
    },
    Errors: async () => {
      const r = await api('GET', '/errors');
      const detail = h('div', {});
      show(h('h1', {}, 'Client errors'), h('p', { class: 'muted' }, 'Grouped by fingerprint (kind, message, top frame, app version); kept 30 days after last seen.'),
        table(r.errors, ['last_seen', 'count', 'kind', 'message', 'scene', 'app_version', 'platform', 'tg_version'], (e) => detail.replaceChildren(h('h2', {}, e.message), h('pre', {}, e.stack || '(no stack)'), h('h2', {}, 'Breadcrumbs (latest)'), h('pre', {}, e.breadcrumbs || ''), h('h2', {}, 'Device'), h('pre', {}, e.device || ''))),
        detail);
    },
    Season: async () => {
      const r = await api('GET', '/season');
      show(h('h1', {}, 'Season'),
        h('p', {}, r.active ? 'Active season #' + r.active.id + ', started ' + fmtTime(r.active.started_at) + ', ends ' + fmtTime(r.active.ends_at) : 'No active season (the next player request starts one).'),
        h('fieldset', {}, h('legend', {}, 'Manual controls'),
          actionForm('End the active season', [h('label', {}, h('input', { type: 'checkbox', id: 'startNext' }), ' start the next one now')], (reason, requestId) => api('POST', '/season/end', { requestId, reason, startNext: document.getElementById('startNext').checked }), true),
          actionForm('Start a new season', [], (reason, requestId) => api('POST', '/season/start', { requestId, reason }))),
        h('h2', {}, 'Shards'), table(r.shards),
        h('h2', {}, 'Recent seasons'), table(r.seasons));
    },
    Tickets: async () => {
      const r = await api('GET', '/tickets');
      show(h('h1', {}, '/paysupport tickets'), r.available ? table(r.tickets) : h('p', { class: 'muted' }, 'No support tickets table yet (it comes with the /paysupport bot command).'));
    },
    Audit: async () => {
      const r = await api('GET', '/audit');
      show(h('h1', {}, 'Audit log'), table(r.audit, ['created_at', 'actor', 'action', 'player_id', 'detail', 'result', 'ip']));
    },
  };

  async function openPlayer(id) {
    show(h('p', { class: 'muted' }, 'Loading player ' + id + '...'));
    await guard(async () => {
      const r = await api('GET', '/players/' + id);
      const p = r.player;
      const delta = h('input', { type: 'number', step: 1, placeholder: '+/- amount', required: true, size: 10 });
      const cur = h('select', {}, h('option', { value: 'drachmae' }, 'Drachmae'), h('option', { value: 'gold' }, 'season gold'));
      const reload = () => openPlayer(id);
      show(
        h('p', {}, h('button', { onclick: () => select('Players') }, '< Players')),
        h('h1', {}, 'Player #' + p.id + ' ', p.username ? '@' + p.username : '', ' ', p.first_name || ''),
        h('p', { class: p.banned_at ? 'err' : 'muted' }, p.banned_at ? 'BANNED ' + fmtTime(p.banned_at) + ': ' + (p.ban_reason || '') : 'Telegram id ' + p.telegram_id + ' / joined ' + fmtTime(p.created_at) + ' / last seen ' + fmtTime(p.last_seen_at) + (p.analytics_opt_out ? ' / analytics off' : '')),
        h('fieldset', {}, h('legend', {}, 'Actions'),
          p.banned_at
            ? actionForm('Unban', [], (reason, requestId) => api('POST', '/players/' + id + '/unban', { requestId, reason }).then((x) => (setTimeout(reload, 800), x)))
            : actionForm('Ban', [], (reason, requestId) => api('POST', '/players/' + id + '/ban', { requestId, reason }).then((x) => (setTimeout(reload, 800), x)), true),
          actionForm('Adjust balance', [cur, delta], (reason, requestId) => api('POST', '/players/' + id + '/adjust', { requestId, reason, currency: cur.value, delta: Number(delta.value) }))),
        h('h2', {}, 'Wallet: ' + (r.wallet.drachmae ?? 0) + ' Drachmae'), table(r.ledger),
        h('h2', {}, 'Stars purchases'),
        table(r.purchases.map((x) => Object.assign({}, x)), ['created_at', 'product_id', 'stars_amount', 'refunded', 'refunded_at', 'telegram_payment_charge_id']),
        r.purchases.filter((x) => !x.refunded).map((x) => actionForm('Refund ' + x.product_id + ' (' + x.stars_amount + ' Stars, ' + fmtTime(x.created_at) + ')', [], (reason, requestId) => api('POST', '/purchases/' + encodeURIComponent(x.telegram_payment_charge_id) + '/refund', { requestId, reason }), true)),
        h('h2', {}, 'Entitlements'), table(r.entitlements),
        h('h2', {}, 'Online season #' + r.season), r.online ? table([r.online], ['shard_id', 'gold', 'food', 'wood', 'bronze', 'recruits', 'energy', 'battles', 'wins', 'home_q', 'home_r', 'updated_at']) : h('p', { class: 'muted' }, 'Not joined.'),
        h('p', {}, 'Clan: ', r.clan ? r.clan.name + ' [' + r.clan.tag + '] (' + r.clan.role + ')' : 'none', ' / pass: ', r.pass ? r.pass.xp + ' XP' + (r.pass.premium ? ', premium' : '') : 'none'),
        h('h2', {}, 'Army (' + r.heroes.length + ' heroes)'), table(r.heroes),
        h('h2', {}, 'Stash (' + r.stash.length + ' items)'), table(r.stash),
        h('h2', {}, 'Campaign save'), r.campaign ? table([r.campaign]) : h('p', { class: 'muted' }, 'No cloud save.'),
        h('h2', {}, 'Milestones'), table(r.milestones),
        h('h2', {}, 'Admin actions on this player'), table(r.audit, ['created_at', 'actor', 'action', 'detail', 'result']),
      );
    });
  }

  let current = 'Overview';
  function select(name) {
    current = name;
    for (const b of tabsEl.children) b.classList.toggle('sel', b.textContent === name);
    show(h('p', { class: 'muted' }, 'Loading...'));
    guard(TABS[name]);
  }
  function signOut() { sessionStorage.removeItem(KEY); token = ''; location.reload(); }

  async function start() {
    const me = await api('GET', '/me');
    whoEl.textContent = 'signed in as ' + me.actor;
    logoutBtn.hidden = false;
    logoutBtn.onclick = signOut;
    tabsEl.replaceChildren(...Object.keys(TABS).map((t) => h('button', { onclick: () => select(t) }, t)));
    select(current);
  }

  const form = document.getElementById('login');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    token = document.getElementById('token').value.trim();
    try { await start(); sessionStorage.setItem(KEY, token); }
    catch (err) { token = ''; document.getElementById('login-error').textContent = err.message; }
  });
  if (token) start().catch(() => { sessionStorage.removeItem(KEY); token = ''; });
})();
`;

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};

const send = (body: string, type: string) => new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, ...SECURITY_HEADERS } });

/** Mounted at /admin (wrangler.jsonc assets.run_worker_first lists /admin and /admin/*). */
export const adminPage = new Hono<AppEnv>();
adminPage.get('/', () => send(HTML, 'text/html'));
adminPage.get('/app.js', () => send(JS, 'text/javascript'));
adminPage.get('/app.css', () => send(CSS, 'text/css'));
