# Operations: monitoring, analytics, backups, admin panel

Production: game and API on https://play.pixelarrow.app (Worker `pixelarrow`,
`wrangler.jsonc`); landing and legal pages on https://pixelarrow.app and www
(Worker `pixelarrow-landing`, `landing/wrangler.jsonc`). Code:
`server/src/telemetry/`, `server/src/admin/`, `server/src/ban.ts`,
`src/platform/{telemetry,analytics,analyticsSchema,monitoring}.ts`,
`server/migrations/0006_ops.sql`, `.github/workflows/backup.yml`,
`server/scripts/d1-restore.mjs`. Only Cloudflare built-ins and GitHub Actions.

## Operator setup (once)

From `server/`, logged in (`npx wrangler login`) or with
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`:

1. **Admin token** (the panel answers 503 without it; ≥ 32 chars; re-run to
   rotate; `/api/health` shows `"adminToken": true`):
   ```bash
   openssl rand -hex 32 | tee /dev/tty | npx wrangler secret put ADMIN_TOKEN --config ../wrangler.jsonc
   # one per operator, named in the audit log:
   echo "alice:$(openssl rand -hex 32),bob:$(openssl rand -hex 32)" | tee /dev/tty | npx wrangler secret put ADMIN_TOKEN --config ../wrangler.jsonc
   ```
2. **Analytics Engine:** enable it in the dashboard if asked. Datasets
   `pixelarrow_events` and `pixelarrow_client_errors` appear on first write. If
   the deploy cannot bind them, CI deploys without them and warns (events
   skipped, crash reports still reach D1). Off on purpose:
   `gh variable set ANALYTICS_ENGINE --body off`.
3. **Backups:** `openssl rand -base64 32 | tee /dev/tty | gh secret set BACKUP_PASSPHRASE`
   (keep it: backups are unreadable without it). Optional
   `BACKUP_RETENTION_DAYS` variable (default 30, max 90).
4. **Tokens:** CI's `CLOUDFLARE_API_TOKEN` needs *D1: Edit*. Analytics queries
   use a separate local read-only token (*Account Analytics: Read*,
   `CF_ANALYTICS_TOKEN`), never in CI.
5. **Optional R2 copy:** `npx wrangler r2 bucket create pixelarrow-backups`,
   `gh variable set BACKUP_R2_BUCKET --body pixelarrow-backups`, grant the CI
   token *Workers R2 Storage: Edit*, add a lifecycle rule.

Tables come from `0006_ops.sql` (CI applies it); cron and dataset bindings from `wrangler.jsonc`.

## Costs

At launch scale everything fits Workers Paid ($5/month). Drivers: ~1 log line
per error, admin action or cron run; ~5-30 events per player per day; one D1
`client_errors` write per distinct error per batch (capped 300 rows/min per
isolate, 6 batches/min per IP and player; pruned after 30 days); daily export
artifacts count toward Actions storage on a private repo.

## Monitoring

### Server errors (Workers Logs)

`observability` is on with `head_sampling_rate: 1`. One JSON object per line
(`server/src/telemetry/log.ts`), filterable in *Workers & Pages → pixelarrow → Logs*:

| `event` | `level` | Fields |
| --- | --- | --- |
| `unhandled` | error | `scope` (`http`, `do.region` + `op`/`room`, `cron`), `message`, `stack`, `path`, `method`, `pid`, `ray` |
| `api_error` | warn | `ApiError` ≥ 500: `status`, `code`, `path`, `message` |
| `admin_auth_failed` | warn | `ip`, `path` |
| `admin_request`, `admin_action`, `admin_action_failed` | info/warn | `actor`, `action`, `player`, `requestId` |
| `analytics_write_failed`, `analytics_emit_failed`, `background_failed` | warn | `message` |
| `cron_pruned` | info | `table`, `rows` |

Tail: `cd server && npx wrangler tail pixelarrow --format json --config ../wrangler.jsonc`.
Alerts: a Cloudflare Notification on the Worker's error rate.

### Client errors

`src/platform/telemetry.ts` captures `window.onerror`, unhandled rejections
and exceptions in Phaser's scene loop (re-thrown). Reports carry the last 20
breadcrumbs (scenes, button ids, never labels), running scenes,
`__APP_VERSION__` (git sha), Telegram platform/version, language, viewport,
DPR, OS/engine, device memory, and the session token only to resolve the
player id. Tokens, `initData`, query strings and e-mails are scrubbed on both
sides. ≤ 3 sends per error per session, 10 new/min, batched 4 s or
`sendBeacon` on hide.

`POST /api/telemetry/errors` (≤ 10 per batch, 48 KB, rate limited) upserts one
D1 row per `sha256(kind | message without numbers | top frame | app version)`.
See the admin *Errors* tab, or:

```bash
cd server
npx wrangler d1 execute pixelarrow --remote --config ../wrangler.deploy.json --command \
  "SELECT datetime(last_seen/1000,'unixepoch') AS seen, count, kind, scene, app_version, substr(message,1,120) AS message
   FROM client_errors ORDER BY last_seen DESC LIMIT 30"
```

`wrangler.deploy.json` comes from `D1_DATABASE_ID=<id> node server/scripts/deploy-config.mjs`
(repo root; the id is the `D1_DATABASE_ID` Actions variable).

## Analytics

### Events

Allowlist: `src/platform/analyticsSchema.ts` (client and Worker); anything
else is rejected. `pixelarrow_events` columns: `index1` player id (sampling
key), `blob1` event, `blob2` `client`/`server`, `blob3` platform, `blob4` app
version, `blob5`/`blob6` string props, `double1` player id, `double2` days
since install (-1 n/a), `double3`/`double4` number props.

| Event | From | blob5, blob6 | double3, double4 |
| --- | --- | --- | --- |
| `session_start` | client | WebApp version, lang | – |
| `install`, `return_d1`, `return_d7` | server, first sign-in (of UTC day 1 / 7) | – | – |
| `tutorial_step`, `tutorial_skip` | client | step id | step number |
| `tutorial_complete` | client | – | duration ms |
| `battle_result` | client offline; server `online`, `beast`, `boss`, `duel`, `ladder` | mode, `win`/`loss`/`draw` | ticks |
| `first_battle` | server, once | mode | – |
| `online_join` | server | – | shard, season |
| `duel_join`, `first_capture` | server, once | – | – |
| `clan_join` | server | `create`/`invite` | – |
| `purchase`, `first_purchase` | server, Stars webhook | pack id | Drachmae, Stars |
| `pass_claim` | server | track | tier |
| `market_list`, `market_buy` | server | kind, currency | price |

Client `track(event, props)` (`src/platform/analytics.ts`): typed, batched
(10 s or 20), sent once signed in. **Opt-out** (Settings → *Usage
statistics*): the client sends nothing, requests carry `x-pa-analytics: 0`,
and `players.analytics_opt_out` is synced via `POST /api/telemetry/consent`.
Crash reports are still sent.

### Queries (Analytics Engine SQL API)

```bash
export CF_ACCOUNT_ID=... CF_ANALYTICS_TOKEN=...
ae() { curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" --data "$1"; }
```

Count with `SUM(_sample_interval)`; data is kept 3 months.

```sql
-- Funnel, last 7 days (DAU: blob1 = 'session_start' grouped by toStartOfDay(timestamp))
SELECT blob1 AS step, COUNT(DISTINCT index1) AS players FROM pixelarrow_events
WHERE timestamp > NOW() - INTERVAL '7' DAY
  AND blob1 IN ('install', 'tutorial_complete', 'tutorial_skip', 'first_battle', 'online_join', 'first_capture', 'first_purchase')
GROUP BY step ORDER BY players DESC

-- Retention inputs: D1 of cohort X = return_d1 on X+1 / install on X; D7 likewise
SELECT toStartOfDay(timestamp) AS day, blob1 AS event, SUM(_sample_interval) AS players
FROM pixelarrow_events WHERE blob1 IN ('install', 'return_d1', 'return_d7') AND timestamp > NOW() - INTERVAL '45' DAY
GROUP BY day, event ORDER BY day

-- Stars and Drachmae per pack (refunds: see the admin panel / purchases table)
SELECT blob5 AS pack, SUM(_sample_interval) AS purchases, SUM(double4 * _sample_interval) AS stars, SUM(double3 * _sample_interval) AS drachmae
FROM pixelarrow_events WHERE blob1 = 'purchase' AND timestamp > NOW() - INTERVAL '30' DAY GROUP BY pack

-- Client errors per release (blob1 fingerprint, blob2 kind, blob3 message, blob4 scene,
-- blob5 version, blob6 platform, blob7 Telegram version, double1 count, double2 player)
SELECT blob5 AS version, blob3 AS message, SUM(double1 * _sample_interval) AS occurrences, COUNT(DISTINCT double2) AS players
FROM pixelarrow_client_errors WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY version, message ORDER BY occurrences DESC LIMIT 20
```

Tutorial drop-off, battles and market volume follow the same pattern on
`tutorial_step` (`double3`, `blob5`), `battle_result` (`blob5`, `blob6`) and
`market_list`/`market_buy` (`blob6`, `double3`).

## Backups

1. **D1 Time Travel** (always on): any minute of the last 30 days (7 on Free).
   The main recovery tool.
2. **Daily export** (`backup.yml`, 02:41 UTC, or *Actions → D1 backup → Run
   workflow*): the bookmark (`*.bookmark.json`) and a full SQL dump, gzipped,
   encrypted with `BACKUP_PASSPHRASE` (AES-256-CBC, PBKDF2), uploaded as an
   artifact (`BACKUP_RETENTION_DAYS`), optionally copied to R2. Durable Object
   storage is ephemeral and not backed up.

Before a risky operation, run the workflow or note the bookmark:
`cd server && npx wrangler d1 time-travel info pixelarrow --config ../wrangler.deploy.json`.

## Restore runbook

### Point in time (Time Travel)

`server/scripts/d1-restore.mjs` wraps `wrangler d1 time-travel`: dry run
unless `--apply`, records the current bookmark first, asks for the database name.

1. Pick the UTC moment (*Actions* run times, admin *Audit* tab).
2. Stop ongoing damage: revert and push, or deploy a Worker answering 503.
3. `D1_DATABASE_ID=<id> node server/scripts/deploy-config.mjs wrangler.jsonc`.
4. `node server/scripts/d1-restore.mjs --timestamp 2026-10-07T09:30:00Z` (dry run),
   then again with `--apply` (type `pixelarrow`). Undo with the bookmark in
   `d1-undo-<time>.json`: `--bookmark <undoBookmark> --apply`.
5. Check `/api/health` and the admin panel. Later writes are gone: compare
   `purchases` with `getStarTransactions` and replay missing Stars payments.
   Season and ban caches refresh within a minute.

### From an exported backup

```bash
# 1. Download the artifact, or: npx wrangler r2 object get pixelarrow-backups/d1/pixelarrow-<stamp>.sql.gz.enc --file x.enc --remote
# 2. Decrypt and unpack
BACKUP_PASSPHRASE='...' openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  -in pixelarrow-<stamp>.sql.gz.enc -out restore.sql.gz && gunzip restore.sql.gz
# 3. Import into a NEW database (never the live one)
cd server && npx wrangler d1 create pixelarrow-restore
npx wrangler d1 execute pixelarrow-restore --remote --file ../restore.sql
# 4. Check it, point D1_DATABASE_ID at the new id, redeploy.
```

## Admin panel

https://play.pixelarrow.app/admin, served by the Worker. **Auth:** `ADMIN_TOKEN`,
pasted in and kept in `sessionStorage`; game session tokens are never accepted
by `/api/admin/*`. Constant-time compare; 10 failures lock an IP for 10
minutes; every action is logged with the operator. Strict CSP, `noindex`,
data rendered as text.

- *Overview:* players (total, new, active), purchases, Stars, refunds,
  Drachmae held, negative wallets, errors 24 h, bans, season, Analytics
  Engine bound.
- *Players:* search by id, Telegram id, username or first name. Shows
  profile, ban, wallet and ledger, purchases, entitlements, season data,
  army, save summary, admin history. Actions: **Ban / Unban** (reason
  required; sessions blocked within a minute, `server/src/ban.ts`); **Adjust
  balance** (Drachmae as ledger kind `admin`, may go negative; season gold,
  never below zero; campaign gold is in the save, not editable); **Refund** a
  Stars purchase (`refundStarPayment` plus the `refunded_payment`
  bookkeeping; never resent).
- *Errors:* client error groups with stack, breadcrumbs, device.
- *Season:* **End the active season** (optionally start the next), **Start a
  new season** (none active), shards, recent seasons. Other isolates may
  serve the old season for 30 s.
- *Tickets:* the first existing of `support_requests`, `support_tickets`,
  `paysupport_tickets`, `payment_support`, `paysupport`.
- *Audit:* every action. Each carries a request id, is written to
  `admin_audit` before it runs, and a resend returns the first result
  (`replayed: true`).

```bash
curl -s https://play.pixelarrow.app/api/admin/players?q=alice -H "authorization: Bearer $ADMIN_TOKEN"
curl -s https://play.pixelarrow.app/api/admin/players/42/adjust -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"requestId":"comp-2026-10-07-42","currency":"drachmae","delta":100,"reason":"outage compensation"}'
```

## Sim train releases (SIM_VERSION)

The server accepts only the client's `SIM_VERSION` (`server/src/simVersion.ts`);
anything else gets **426 `sim_version_unsupported`** (sockets close 4426) and
the client asks for a reload. Train 2 = rules version 2. No players yet, so a
bump simply voids battles in flight.

### Deploy

`.github/workflows/deploy.yml` on push to `main`, or *Run workflow* with
`target` `both`, `game` or `landing`; never by hand. A `changes` job runs only
the touched site. Landing-only runs `landing-build`, `landing-test`,
`landing-deploy` (no migrations, duels keep running); with both, the landing
deploys right after the game. Game:

1. **Gates:** typecheck, vitest (incl. `tests/trainReplay.test.ts`), build,
   Worker tests (incl. `server/test/trainReplay.test.ts`,
   `simVersion.test.ts`), layout check, smokes. Before merging run
   `node scripts/replay-hash.mjs` (Chromium and WebKit; NOT RUN is not a
   pass): each must print `13/13 battles match`.
2. **D1 migrations.**
3. **Worker and assets** in one `wrangler deploy`.
4. **Durable Objects** restart; live duels end.

### Rollback

`npx wrangler rollback` (or redeploy the previous `main` commit); migrations
are additive. Landing, from `server/`: `npx wrangler rollback --config ../landing/wrangler.jsonc`.

### The next rules change

A change that can alter a replay (`src/sim/**`, its data, stat derivation,
setup building, order kinds) either stays in train 2 with the fixtures
re-recorded on purpose (`RECORD_REPLAY_V2=1 npx vitest run tests/trainReplay.test.ts`)
and the diff reviewed, or bumps `SIM_VERSION` with new fixtures. Once there
are players, a bump that keeps battles alive needs an older sim on the server.

## Go-live

Owner-only steps, in order. Legal pages (EN/RU, `landing/public/`) are signed off.

1. **Mail and legal:** make sure privacy@pixelarrow.app receives mail
   (Cloudflare Email Routing); read the legal pages once in both languages.
2. **Workers Paid plan** (Rate Limiting bindings, CPU limits, step 3).
3. **PBKDF2 production check**, from `server/`:
   `npx wrangler deploy --config scripts/pbkdf2-probe/wrangler.jsonc`; open
   `https://pixelarrow-pbkdf2-probe.<subdomain>.workers.dev/hash?iter=100000`,
   `?iter=100001`, `?iter=310000` ~10 times each (each must answer
   `{"ok":true,...}`); in its Logs the `iter=310000` CPU time must be under
   60 ms; then `npx wrangler delete --config scripts/pbkdf2-probe/wrangler.jsonc`.
   On failure lower `PBKDF2_ITERATIONS` / `PBKDF2_SAFE_MAX`
   (`server/scripts/pbkdf2-probe/limits.ts`) to the highest passing count, at
   least 100,000.
4. **Accounts:** onboard pixelarrow.app in Cloudflare Email Service with
   sender `noreply@pixelarrow.app` (the only address the `EMAIL` binding
   allows) and check SPF, DKIM, DMARC. Create a Turnstile widget (Managed) for
   `play.pixelarrow.app`; set its site key as Actions variable
   `TURNSTILE_SITE_KEY`. Confirm Rate Limiting namespace ids `6001`, `6002`,
   `6003` (`wrangler.jsonc`) are free in the account. Worker secrets:
   `npx wrangler secret put <NAME> --config ../wrangler.jsonc` for
   `TURNSTILE_SECRET`, `PASSWORD_PEPPER`, `PASSWORD_PEPPER_ID` (plus
   "Operator setup" above).
5. **GitHub:** environment `production-landing` (same protection as
   `production`); Actions variables `PUBLIC_TELEGRAM_URL`
   (`https://t.me/<bot>/<app>` from BotFather `/myapps`),
   `TELEGRAM_BOT_USERNAME` and, if the Mini App short name isn't `play`,
   `TELEGRAM_APP_NAME`; check `CLOUDFLARE_API_TOKEN` covers the
   `pixelarrow.app` zone for Workers custom domains.
6. **Dry runs:** `landing/`: `npm ci && npm run build && npm run dry-run`;
   `server/`: `npx wrangler deploy --dry-run --config ../wrangler.jsonc`.
7. **Deploy both sites in one run:** push to `main`, or *Run workflow* on
   `main` with `target: both`. Never deploy the game alone first (the legal
   pages live only in the landing). If `landing-deploy` fails because
   `pixelarrow.app` is still attached to `pixelarrow`: dashboard → Workers &
   Pages → `pixelarrow` → Settings → Domains & Routes → remove it, then run
   with `target: landing`.
8. **Check hosts:** `/api/health` on play is ok; `https://pixelarrow.app/`,
   `/terms`, `/privacy`, `/refunds`, `/ru/terms` are 200;
   `https://pixelarrow.app/?startapp=test` is a 302 to play;
   `https://pixelarrow.app/api/public/v1/summary` answers JSON (or 503
   `{"state":"unavailable"}` without data).
9. **Telegram, right after step 7:** @BotFather `/myapps` → Edit Web App URL
   and `/mybots` → Bot Settings → Menu Button, both
   `https://play.pixelarrow.app`; run
   `TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node server/scripts/bot-setup.mjs`;
   `getWebhookInfo` must show `https://play.pixelarrow.app/api/telegram/webhook`
   and no `last_error_message`. If web linking uses the Login Widget:
   `/setdomain` → `play.pixelarrow.app`. Open the Mini App on a phone and
   Telegram Web and sign in.
10. **Zone rules** (`pixelarrow.app`): a Single Redirect for hostname
    `www.pixelarrow.app` to `concat("https://pixelarrow.app", http.request.uri.path)`,
    301, preserve query string; HSTS max-age 6 months, include subdomains,
    preload off for the first weeks.
