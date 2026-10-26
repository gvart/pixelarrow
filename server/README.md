# Pixelarrow backend

One Cloudflare Worker, `pixelarrow`, serves **both** the static game (the root
`dist/` build, on https://play.pixelarrow.app) **and** this API. `wrangler.jsonc`
(repo root) sets `assets.run_worker_first: ["/api/*", "/ws/*", "/admin"]`, so
only those paths run Worker code; everything else is plain static hosting with
the SPA fallback. The landing page on https://pixelarrow.app (and www) is a
separate Worker, `pixelarrow-landing` (`landing/wrangler.jsonc`, ADR-0007):
static pages and the legal pages, plus a cached proxy that reaches this
Worker's `PublicApi` entrypoint through a service binding. It has no D1, no
Durable Objects and no secrets.

- **Routing:** [Hono](https://hono.dev). **Validation:** zod. **Storage:** D1
  (`DB`, database `pixelarrow`). **Realtime:** SQLite-backed Durable Objects
  on the WebSocket Hibernation API: `WarWorldDO` and `WarRegionDO` (the war,
  server/src/war/).
- **Shared code:** the Worker imports the war's sim and rules (`../src/war`,
  `../src/data`, `../src/sim`) read-only; wrangler/esbuild bundles them.

## Layout

```
server/
  src/
    index.ts          Worker entry: Hono app, CORS (play, DEV_ORIGINS), frame-ancestors, error handler,
                      /ws upgrades, crons; exports WarRegionDO, WarWorldDO and the PublicApi entrypoint
    env.ts            bindings / secrets types
    urls.ts           GAME_URL (play) and LANDING_URL (apex, legal links) with their defaults; dev origins
    routes/auth.ts    /api/auth: email sign-up, login, reset, sessions; POST /api/auth/telegram (DEV_AUTH sign-in)
    account/          /api/account: the account page, emails, renames, deletion (ADR-0009), links to a
                      Telegram identity and their conflicts
    auth/             sessions.ts (pa2 server-side sessions, 30 s cache, prune), identity.ts, cookies.ts
                      (__Host-pa_sid), origin.ts (CSRF), password.ts, throttle.ts, turnstile.ts, flows.ts
    war/              the war: routes, the region and world Durable Objects, persons, market, treasury,
                      store.ts (seasons, clan membership)
    public/           the public stats snapshot (ADR-0010) and GET /api/public/v1/summary
    telemetry/        /api/telemetry: crash reports, analytics events
    admin/            /admin and /api/admin (docs/OPS.md "Admin panel")
    names/            generated display names, the blocklist and the shared validator
    email/            account emails (Email Service, the dev outbox)
    telegramAuth.ts   initData validation (account links to a Telegram identity)
    simVersion.ts     the ?sim= check of the sockets
    middleware.ts     requireSession, requirePlayable, db()/secret() -> 503 when not configured
    crypto.ts, body.ts, errors.ts, players.ts, rateLimit.ts, telegramApi.ts, ban.ts
  migrations/                D1 schema, applied in order by CI; 0017-0020 accounts, 0006 ops,
                             0019 public stats, 0021+ the war; 0027 and 0036 drop the old war's and
                             the legacy game's tables
  scripts/deploy-config.mjs  CI: wrangler.jsonc -> wrangler.deploy.json (fills/drops D1 id)
  scripts/d1-restore.mjs     point-in-time restore (docs/OPS.md "Backups")
  test/                      vitest in workerd (@cloudflare/vitest-pool-workers)
```

The server has its own `package.json`/lockfile (vitest 4 for the Workers pool;
the game uses vitest 5).

## API

All responses are JSON. Errors always look like
`{ "error": { "code": "not_found", "message": "...", ...extra } }`.
Authenticated routes take the `__Host-pa_sid` cookie or
`Authorization: Bearer <token>`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{ ok, db, secrets: {name: bool} }` (never values) |
| … | `/api/auth/*` | – / ✓ | email sign-up, verify, login, reset, logout, sessions |
| POST | `/api/auth/telegram` | – | DEV_AUTH=1 only: `{ dev: { id, first_name } }` → `{ token, expiresAt, player }` |
| GET | `/api/me` | ✓ | `{ player, session }` |
| … | `/api/account/*` | ✓ | the account page, emails, rename, deletion, Telegram links |
| … | `/api/war/*` | ✓ | the war (docs/WAR.md, server/src/war/routes.ts) |
| … | `/api/war/world/*` | ✓ | the world map: snapshot, transfers |
| GET | `/ws/war/world`, `/ws/war/:region` | ✓ | the war's sockets |
| GET | `/api/public/v1/summary` | – | the public stats snapshot (ADR-0010) |
| POST | `/api/telemetry/errors` | optional | client crash reports, deduplicated into D1 `client_errors` (docs/OPS.md "Monitoring") |
| POST | `/api/telemetry/events` | ✓ | allowlisted product analytics events → Analytics Engine (docs/OPS.md "Analytics") |
| POST | `/api/telemetry/consent` | ✓ | body `{ analytics: boolean }`: the opt-out |
| … | `/api/admin/*` | `ADMIN_TOKEN` | admin panel API; the page is `/admin` (docs/OPS.md "Admin panel") |

A banned player (admin panel) gets **403** `banned` from sign-in and from every
authenticated route and socket (existing sessions within a minute).

Missing configuration fails loudly: no D1 binding → 503 `database not
configured`; a missing secret → 503 `<NAME> not configured`.

### Auth

Sessions (ADR-0008 §3) live in D1: a token is `pa2_` + 32 random bytes and only
its SHA-256 is stored. The web gets the `__Host-pa_sid` cookie (30 days, 7 days
idle); a bearer token is the alternative. One transport per request (both is
400), a token is never read from the URL (`?token=` is 400), and a cookie
request that changes state must carry the game's `Origin`. Sockets use the
cookie or `Sec-WebSocket-Protocol: pixelarrow.v1, <token>`. `POST
/api/auth/logout`, `/logout-all`, `GET /api/auth/sessions` and `DELETE
/api/auth/sessions/:handle` end and list sessions; the daily cron prunes them.
The email forms are rate-limited per IP by the `RL_AUTH_IP` binding and gated
by Turnstile.

**Dev login:** with `DEV_AUTH=1` (only in the local `.dev.vars`; never set it in
production) `POST /api/auth/telegram` takes `{ "dev": { "id": 1, "first_name":
"Dev" } }`; the war's sandbox and world pages sign in this way.

### Sim version

Sockets (`/ws/war/*`) take `?sim=` (`src/sim/version.ts` `SIM_VERSION`). The
server takes exactly `SIM_VERSION` (`server/src/simVersion.ts`); anything else,
or nothing, gets an `error` frame with code `sim_version_unsupported` and the
socket closes with code 4426, so the client asks the player to reload.

## Local development

```bash
npm ci && npm run build            # at the repo root: builds dist/ (needed by wrangler and the tests)
cd server && npm ci
cp .dev.vars.example ../.dev.vars  # wrangler reads .dev.vars next to wrangler.jsonc (gitignored)
npm run migrate:local              # create the local D1 tables
npm run dev                        # http://localhost:8787 — game + API
npm test                           # vitest in workerd: D1, DO
npm run typecheck
npm run dry-run                    # wrangler deploy --dry-run
```

`npm run dev` serves the built `dist/` too; for game hot reload keep using the
root `npm run dev` (vite), which proxies `/api` and `/ws` to :8787.

Note: the server lockfile was generated with npm 11 (npm 10.9 crashes resolving
vitest 4's optional peers on `npm install`); `npm ci` works with either.

## Deployment (GitHub Actions)

`.github/workflows/deploy.yml` on every push to `main`: client `npm ci`,
typecheck, tests, build → `server/` `npm ci`, typecheck, tests →
`node server/scripts/deploy-config.mjs` writes `wrangler.deploy.json`:

- `D1_DATABASE_ID` (Actions **variable**, or secret) set → D1 id filled in,
  `wrangler d1 migrations apply pixelarrow --remote` runs, then `wrangler deploy`.
- not set → the D1 binding is dropped and the deploy still succeeds; DB routes
  answer 503 `database not configured`.

It also writes `wrangler.deploy.noae.json` (no Analytics Engine datasets): the
deploy falls back to it if the account cannot bind Analytics Engine yet. The
Actions variable `ANALYTICS_ENGINE=off` drops the datasets on purpose.
The workflow deploys the game Worker only when the game changed (a `changes`
job filters by path; a manual run picks `target: both | game | landing`).
A landing-only change runs `landing-build`, `landing-test` and
`landing-deploy` (`wrangler deploy --config ../landing/wrangler.jsonc` with
this folder's pinned wrangler) and never touches this Worker, D1 or the
Durable Objects. When both changed, the game deploys first and the landing
right after.

`.github/workflows/backup.yml` exports the database daily (docs/OPS.md
"Backups"); `server/scripts/d1-restore.mjs` is the point-in-time restore.

## One-time setup checklist

1. **Create the database:** `cd server && npx wrangler d1 create pixelarrow`
   (or Dashboard → Storage & Databases → D1). Copy the `database_id`.
2. **GitHub:** Settings → Secrets and variables → Actions → **Variables** →
   `D1_DATABASE_ID` = that id. (Keep the existing secrets
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.)
3. **API token permissions:** the `CLOUDFLARE_API_TOKEN` needs, in addition to
   *Workers Scripts: Edit* (and the custom-domain permissions it already has),
   **Account → D1: Edit**. Durable Objects are covered by Workers Scripts: Edit.
4. **Worker secrets** (once; they persist across deploys): `ADMIN_TOKEN`
   (docs/OPS.md "Operator setup"), `PASSWORD_PEPPER`, `PASSWORD_PEPPER_ID`,
   `TURNSTILE_SECRET`, and `TELEGRAM_BOT_TOKEN` while account links to Telegram
   identities remain:
   ```bash
   cd server
   npx wrangler secret put ADMIN_TOKEN --config ../wrangler.jsonc
   ```
   Check with `curl https://play.pixelarrow.app/api/health`.

## Client integration

The war uses `/api/war/*` and `/ws/war/*` (`src/war/net/`); the standalone
email-link pages (`auth/`) use `/api/auth/*`.
