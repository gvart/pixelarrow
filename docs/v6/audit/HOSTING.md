# A1-PLAT: hosting today, and options for pixelarrow.app + play.pixelarrow.app

## Current setup

### `wrangler.jsonc` (repo root)
- One Worker `pixelarrow`, `main: server/src/index.ts`, compatibility date 2026-10-01.
- **Assets:** `./dist` (the Vite game build), binding `ASSETS`, `not_found_handling: single-page-application`,
  `run_worker_first: ["/api/*", "/ws/*", "/admin", "/admin/*"]`. Everything else (the game, `public/`
  legal pages `/terms`, `/privacy`, `/refunds`, `/ru/*`) is served by the assets layer without running the Worker.
- **Route:** `{ "pattern": "pixelarrow.app", "custom_domain": true }`. No `www`, no other hostnames.
- **Vars:** `GAME_URL = https://pixelarrow.app`.
- **D1** `pixelarrow` (`database_id` placeholder, filled by `server/scripts/deploy-config.mjs` from the
  `D1_DATABASE_ID` Actions variable), migrations `server/migrations`.
- **Durable Objects:** `REGION` (`RegionDO`), `MATCHMAKER`, `DUEL` (SQLite classes, tags v1, v2).
- **Analytics Engine:** `pixelarrow_events`, `pixelarrow_client_errors` (dropped by a fallback deploy).
- **Crons:** `*/5 * * * *` (notifications, season and income notices, bot setup), `17 3 * * *` (prune).
- **Observability:** on, sampling 1.
- Secrets (not in config): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SESSION_SECRET`, `ADMIN_TOKEN`;
  optional vars `TELEGRAM_BOT_USERNAME`, `TELEGRAM_APP_NAME` (default `play`).

### `.github/workflows/deploy.yml`
Trigger: push to `main`, or manual. `concurrency: deploy`, no cancel.
1. **build:** `npm ci`, `tsc --noEmit`, `vitest run`, `vite build` → artifact `dist`.
2. **server:** server setup, `tsc --noEmit`, `vitest run` (workerd).
3. **layout:** preview on :4173, `scripts/layout-check.mjs` in 10 shards, screenshots uploaded.
4. **smoke:** `scripts/<smoke>.mjs` matrix against the preview.
5. **deploy** (needs all four; environment `production`, URL `https://pixelarrow.app`):
   download `dist`; `deploy-config.mjs wrangler.jsonc` → `wrangler.deploy.json` (and `.noae.json`);
   `wrangler d1 migrations apply pixelarrow --remote` (if a D1 id is set);
   `wrangler deploy` (fallback without Analytics Engine). Client and API go live in one step.

Also `.github/workflows/backup.yml` (daily D1 export), unaffected by the split.

### Bot links and hard-coded `pixelarrow.app`

| Where | What | Change for v6 |
| --- | --- | --- |
| `wrangler.jsonc:22,25` | route and `GAME_URL` | game Worker → `play.pixelarrow.app`; `GAME_URL=https://play.pixelarrow.app` |
| `server/src/index.ts:40` | CORS allow-list `https://pixelarrow.app`, `https://web.telegram.org` | add `https://play.pixelarrow.app`; landing origin only for `/api/public/*` |
| `server/src/notify/outbox.ts:184` | notification buttons `web_app.url` = `GAME_URL` fallback | fallback → play |
| `server/src/routes/webhook.ts:56,95` | "Play" / "Join the clan" `web_app` buttons | via `GAME_URL` |
| `server/src/bot/handlers.ts:98,117` | `/settings`, "need the game" buttons (`buttonUrl(gameUrl, …)`) | via `GAME_URL` |
| `server/src/online/clans.ts:144` + `src/online/rules.ts:167-169` | clan invites `t.me/<bot>/<app>?startapp=clan_<code>`, fallback `https://pixelarrow.app/?startapp=` | fallback → play |
| `server/src/notify/templates.ts` (legal links in bot texts, tested in `server/test/notify.test.ts:403-406`) | `pixelarrow.app/terms`, `/privacy`, `/refunds`, `/ru/*` | **keep** on the landing domain |
| `src/ui/legal.ts:4` | `LEGAL_BASE = 'https://pixelarrow.app'` | keep (legal pages live on the landing) |
| `server/scripts/bot-setup.mjs:54` | webhook URL `https://pixelarrow.app/api/telegram/webhook` | → play (owner re-runs `setWebhook`) |
| `public/terms.html:24`, `public/ru/terms.html:24` | "a Telegram Mini App at pixelarrow.app" | rewrite: web + Telegram at play.pixelarrow.app (legal sign-off is an owner action) |
| `README.md:13,121,169`, `server/README.md:4,177,202,693,815,820,826`, `docs/OPS.md` (health, admin, curl examples) | docs | update |
| BotFather | Mini App URL and menu button = `https://pixelarrow.app` | owner action → `https://play.pixelarrow.app` |
| Tests | `server/test/notify.test.ts`, `online-social.test.ts:78`, `payments.test.ts:26`, `tests/deeplink.test.ts:54-56` | update expected URLs |

## Constraints that decide the design

1. **Telegram Web embeds the Mini App in an iframe** on `web.telegram.org`. A cookie set by
   play.pixelarrow.app there is a third-party cookie: Safari blocks it, Chrome needs
   `SameSite=None; Secure; Partitioned`. So **the Telegram adapter must keep bearer tokens** (initData →
   token in memory, as today); **cookies are for the web adapter only**. The `Auth` interface hides this
   (`transport(): 'bearer' | 'cookie'`, `PLATFORM.md`).
2. **Cookies on the game's own host** (`play.pixelarrow.app`, host-only, no `Domain=`) are first-party
   for the web game whatever the landing does. Setting `Domain=.pixelarrow.app` is not needed and would
   widen the blast radius to the landing; avoid it.
3. **The API should be same-origin with the game** (`play.pixelarrow.app/api`, `/ws`): no CORS
   preflights for the game, cookies with `SameSite=Lax`, CSRF reduced to an `Origin` check.
4. **The landing only needs read-only public stats.** No credentials, no cookies.
5. **No live users (V5-074):** old URLs need no long-term compatibility, but a cheap redirect of
   `pixelarrow.app/?startapp=…` to play keeps old bot messages working.

## Options

### A. One Worker, two hostnames, routed in code
Both `pixelarrow.app` and `play.pixelarrow.app` as custom domains of the existing Worker; the Worker
(or `run_worker_first: true`) picks the landing or the game assets by `Host`; one `dist/` holding both builds.
- Cookies/CORS: game and API same-origin on play; the landing calls `pixelarrow.app/api/public/*` on the same Worker: no CORS.
- API location: one Worker answers on both hosts (must refuse auth routes on the landing host).
- Deploy coupling: **tight.** A landing copy fix redeploys the game Worker and restarts Durable Objects (live duels end, `OPS.md`). Running the Worker first for every asset request costs CPU and loses the free static-asset path.
- Simplest config, but mixes two products and two build pipelines in one artifact.

### B. Two Workers: game + API on play, static landing on the apex (recommended)
- **`pixelarrow` (existing):** custom domain `play.pixelarrow.app`, unchanged assets and API, plus
  `/api/public/*` (read-only, cached, rate-limited).
- **`pixelarrow-landing` (new, `landing/wrangler.jsonc`):** assets-only Worker (`landing/dist`) on `pixelarrow.app`
  and `www.pixelarrow.app` (`www` → apex redirect). A tiny Worker script, running first only for
  `/api/public/*` and `/?startapp=`, forwards stats through a **service binding** to the game Worker
  (same-origin for the browser, no CORS, edge-cached with the Cache API) and 302s old `?startapp=` links to play.
  Legal pages move into the landing build (same URLs as today, so the bot texts and `LEGAL_BASE` stay valid).
- Cookies/CORS: game cookies host-only on play; landing has none; no CORS anywhere (the CORS list keeps
  play + `web.telegram.org` for local tooling and Telegram Web).
- API location: only on play. The landing never sees auth routes.
- Deploy coupling: **loose.** Separate jobs in `deploy.yml`: the landing deploys on its own path filter
  without touching Durable Objects; the service binding needs the game Worker deployed first, once.
- Cost: one more Worker (free tier covers static assets), one more wrangler file and CI job.

### C. Cloudflare Pages for the landing, Worker for the game
Landing as a Pages project on the apex; game Worker on play; stats fetched cross-origin from
`play.pixelarrow.app/api/public/*` with `access-control-allow-origin: https://pixelarrow.app` (no credentials).
- Cookies: as B. CORS: one read-only allow rule. API location: play only.
- Deploy coupling: loose, but a second deployment product (Pages) with its own config and preview
  semantics; Cloudflare now steers new static sites to Workers static assets, and service bindings
  from Pages Functions are a separate setup. The cross-origin stats call also costs a preflight-free
  but uncached-by-default round trip to play.

## Recommendation: Option B

Two Workers in one repo: the existing game Worker moves to `play.pixelarrow.app` with the API kept
same-origin, and a new assets-first landing Worker owns `pixelarrow.app` (+`www`), the legal pages,
an old-link redirect and a service-bound, edge-cached `/api/public/*` proxy.

Why: it is the only option where a landing deploy cannot restart live duels, it keeps the game's
security model (host-only cookies, same-origin API, bearer tokens for Telegram) untouched by the landing,
and it stays on one Cloudflare product (Workers + static assets). It is easy to undo: merging back into
one Worker (A) only means moving the assets directory and a route.

Trade-offs accepted: two wrangler configs and two deploy jobs; the service binding creates a deploy
order (game first, then landing) recorded in `OWNER_ACTIONS.md`; the public stats proxy must handle
the game Worker being down (serve the last cached value or the empty state).

We'll know this was right if: a landing-only change deploys without a game deploy, the web game's
session cookie never appears on requests to `pixelarrow.app`, Telegram Web keeps signing in through the
iframe, and the landing's stats come from one cached call with no CORS headers involved.

Owner actions this implies (for `OWNER_ACTIONS.md`): add `play.pixelarrow.app` as a custom domain of
`pixelarrow` and move the apex to `pixelarrow-landing` (DNS is managed by the custom-domain step);
add `www`; re-run `setWebhook` to `https://play.pixelarrow.app/api/telegram/webhook`; set the BotFather
Mini App and menu button URL to `https://play.pixelarrow.app`; deploy order game → landing.
