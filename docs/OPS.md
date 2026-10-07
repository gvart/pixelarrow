# Operations: monitoring, analytics, backups, admin panel

How to watch the production game at https://pixelarrow.app, read its funnel
and retention numbers, restore the database, and run the admin panel. Code:
`server/src/telemetry/`, `server/src/admin/`, `server/src/ban.ts`,
`src/platform/{telemetry,analytics,analyticsSchema,monitoring}.ts`,
`server/migrations/0006_ops.sql`, `.github/workflows/backup.yml`,
`server/scripts/d1-restore.mjs`.

Everything uses Cloudflare built-ins already on the account (Workers Logs,
Analytics Engine, D1 Time Travel, a cron trigger) plus a GitHub Actions job.
There are no third-party services.

## Operator setup (once)

Run from `server/` with a logged-in wrangler (`npx wrangler login`) or with
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` exported.

1. **Admin token** (Worker secret; the admin panel answers 503 without it):
   ```bash
   cd server
   # one operator:
   openssl rand -hex 32 | tee /dev/tty | npx wrangler secret put ADMIN_TOKEN --config ../wrangler.jsonc
   # or one token per operator, so the audit log names them:
   echo "alice:$(openssl rand -hex 32),bob:$(openssl rand -hex 32)" | tee /dev/tty | npx wrangler secret put ADMIN_TOKEN --config ../wrangler.jsonc
   ```
   Keep the printed value in a password manager. Tokens shorter than 32
   characters are ignored. Rotate by running the same command again (the old
   token stops working at once). `curl https://pixelarrow.app/api/health`
   shows `"adminToken": true` once set.
2. **Analytics Engine:** Cloudflare dashboard → *Storage & Databases* →
   *Analytics Engine* → enable it if the page asks (some accounts must do this
   once). The datasets `pixelarrow_events` and `pixelarrow_client_errors` are
   created by the first write. If the deploy cannot bind them, CI deploys
   without them and prints a warning (product events are then skipped; crash
   reports still reach D1). To switch them off on purpose:
   `gh variable set ANALYTICS_ENGINE --body off` (delete the variable to turn
   them back on).
3. **Backups:** the encryption passphrase for the daily export (without it the
   job only records the Time Travel bookmark):
   ```bash
   openssl rand -base64 32 | tee /dev/tty | gh secret set BACKUP_PASSPHRASE
   ```
   Keep it in the password manager: a backup cannot be read without it.
   Optional: `gh variable set BACKUP_RETENTION_DAYS --body 30` (artifact
   retention, max 90 on public repositories) and an R2 copy (below).
4. **API token permissions** for `CLOUDFLARE_API_TOKEN` (CI): add
   *Account → D1: Edit* (already needed for migrations; export and Time Travel
   use it too). For the analytics queries below create a **separate read-only
   token** with *Account → Account Analytics: Read* and keep it on your
   machine (`export CF_ANALYTICS_TOKEN=...`), not in CI.
5. **Optional R2 copy of backups:**
   ```bash
   cd server && npx wrangler r2 bucket create pixelarrow-backups
   gh variable set BACKUP_R2_BUCKET --body pixelarrow-backups
   ```
   and give `CLOUDFLARE_API_TOKEN` *Account → Workers R2 Storage: Edit*.
   Add an R2 lifecycle rule (dashboard → R2 → bucket → Settings → Object
   lifecycle rules: delete after N days) to cap storage.

Nothing else is needed: the D1 tables come from migration `0006_ops.sql`
(applied by CI), the cron trigger and the dataset bindings from
`wrangler.jsonc`.

## Costs

Prices are Cloudflare's and GitHub's published list prices at the time of
writing; check the pricing pages before relying on them.

| What | Volume driver | Included | Beyond |
| --- | --- | --- | --- |
| Workers Logs (structured logs) | ~1 log line per error, admin action, cron run; normal requests log nothing | Free: 200k events/day, 3 days kept. Paid: 20M/month, 7 days kept | $0.60 per million |
| Analytics Engine, `pixelarrow_events` | ~5-30 events per player per day | Paid: 10M data points/month, 1M queries/month (the Free plan has a daily allowance; see the pricing page) | $0.25 per million written, $1 per million queries |
| Analytics Engine, `pixelarrow_client_errors` | one point per error group per report batch | as above | as above |
| D1 `client_errors` | one row write per distinct error per batch (deduplicated, capped at 300 rows/min per Worker isolate, 6 batches/min per IP and per player); pruned after 30 days | Free: 100k rows written/day. Paid: 50M/month | $1.00 per million rows written |
| D1 `analytics_milestones` | ≤ 3 rows per player, ever | – | – |
| D1 `admin_audit` | one row per admin action, kept forever | – | – |
| Ban check | one indexed read of the banned ids per Worker isolate per minute | – | – |
| Cron trigger (daily prune) | 1 run/day | free | – |
| D1 Time Travel | always on | Free plan: 7 days; Paid: 30 days of history | free |
| Daily export artifact | one gzip+encrypted dump/day × retention days | public repo: free; private: counts toward Actions storage (500 MB free) | GitHub storage pricing |
| Optional R2 copy | one object/day | 10 GB-month, 1M writes/month | $0.015 per GB-month |

At launch scale (thousands of players) all of this stays inside the included
amounts of the Workers Paid plan ($5/month), and inside the free plan's daily
limits for a small player base.

Why D1 (not only Analytics Engine) for crash reports: the admin panel lists
them with stacks and breadcrumbs, which needs a store the Worker can read
back. Analytics Engine can only be read through the account SQL API (an extra
API token in the Worker), so it keeps the counts for trend queries, and D1
keeps one deduplicated, pruned row per distinct error.

## Monitoring

### Server errors (Workers Logs)

`wrangler.jsonc` has `"observability": { "enabled": true, "head_sampling_rate": 1 }`:
every log line is kept and indexed. The Worker and the shard Durable Objects
log one JSON object per line (`server/src/telemetry/log.ts`), so the fields
can be filtered in the dashboard (*Workers & Pages → pixelarrow → Logs*):

| `event` | `level` | Where | Fields |
| --- | --- | --- | --- |
| `unhandled` | error | `scope: "http"` (API routes), `"do.region"` (shard DO: `op` message/alarm, `room`), `"cron"` | `message`, `stack`, `path` (route pattern), `method`, `pid`, `ray` |
| `api_error` | warn | an `ApiError` with status ≥ 500 (Telegram API failures, missing config) | `status`, `code`, `path`, `message` |
| `admin_auth_failed` | warn | wrong admin token | `ip`, `path` |
| `admin_request` / `admin_action` / `admin_action_failed` | info / warn | admin panel | `actor`, `action`, `player`, `requestId` |
| `analytics_write_failed`, `analytics_emit_failed`, `background_failed` | warn | analytics plumbing | `message` |
| `cron_pruned` | info | daily cron | `table`, `rows` |

Useful filters: `event = unhandled` (all crashes), `scope = do.region`,
`level = error`. Live tail from a terminal:
`cd server && npx wrangler tail pixelarrow --format json --config ../wrangler.jsonc`.
For alerts, add a Cloudflare Notification (*Notifications → Add → Workers*)
on the Worker's error rate.

### Client errors

The game (`src/platform/telemetry.ts`, installed in `src/main.ts`) captures
`window.onerror`, unhandled promise rejections and exceptions thrown in
Phaser's scene loop (`SceneManager.update`/`render`, re-thrown so the game
behaves as before). Each report carries:

- the last 20 breadcrumbs: scene start/stop, button taps (button id or icon,
  never the label), boot;
- the running scene(s), app version (git sha injected at build as
  `__APP_VERSION__`), Telegram platform and WebApp version, language,
  viewport, device pixel ratio, OS/engine family (`android-chromium`), device
  memory;
- the player's session token only to attribute the report to the opaque
  player id. Messages and stacks are scrubbed of tokens, `initData`, query
  strings and e-mail addresses (client and server both scrub).

Reports are deduplicated (the same message/top frame is counted, and sent at
most 3 times a session), rate limited (10 new reports a minute) and batched (4
s, or a `sendBeacon` when the app is hidden or closed).

`POST /api/telemetry/errors` validates them (≤ 10 per batch, 48 KB), rate
limits per IP and player, and upserts one D1 row per fingerprint
(`sha256(kind | message with numbers stripped | top stack frame | app
version)`), so a new release starts new groups. See them in the admin panel
(*Errors*) or in D1:

```bash
cd server
npx wrangler d1 execute pixelarrow --remote --config ../wrangler.deploy.json --command \
  "SELECT datetime(last_seen/1000,'unixepoch') AS seen, count, kind, scene, app_version, substr(message,1,120) AS message
   FROM client_errors ORDER BY last_seen DESC LIMIT 30"
```

(`wrangler.deploy.json` comes from `D1_DATABASE_ID=<id> node server/scripts/deploy-config.mjs`
at the repo root; the D1 id is in the dashboard or the `D1_DATABASE_ID` Actions variable.)

## Analytics

### Events

The allowlist is `src/platform/analyticsSchema.ts`, shared by the client and
the Worker; anything else is rejected. Each event is one Analytics Engine
data point in `pixelarrow_events`:

| Column | Content |
| --- | --- |
| `index1` | player id (the sampling key) |
| `blob1` | event name |
| `blob2` | `client` or `server` |
| `blob3` | platform (`ios`, `android`, `tdesktop`, `weba`, `web`, ...) |
| `blob4` | app version (git sha) |
| `blob5`, `blob6` | the event's string props, in the order below |
| `double1` | player id |
| `double2` | days since install (install / return events; -1 elsewhere) |
| `double3`, `double4` | the event's number props, in the order below |

| Event | From | blob5, blob6 | double3, double4 |
| --- | --- | --- | --- |
| `session_start` | client, at boot | Telegram WebApp version, lang (`en`/`ru`/`other`) | – |
| `install` | server, first sign-in | – | – |
| `return_d1`, `return_d7` | server, first sign-in on UTC day 1 / 7 after the install day (from `players.created_at` and the previous `last_seen_at`) | – | – |
| `tutorial_step` | client (`track('tutorial_step', { id, step })`) | step id | step number |
| `tutorial_complete` | client | – | duration ms |
| `tutorial_skip` | client | step id | step number |
| `battle_result` | client for offline battles; server for `online`, `beast` (lair), `boss` (raid), `duel`, `ladder` (duel PvE ladder) | mode, result (`win`/`loss`/`draw`) | ticks |
| `first_battle` | server, once per player (D1 `analytics_milestones`) | mode | – |
| `online_join` | server, joining a season | – | shard, season |
| `duel_join` | server, opening the duel mode the first time | – | – |
| `first_capture` | server, once per player | – | – |
| `clan_join` | server | `create` / `invite` | – |
| `purchase` | server, Stars payment webhook | pack id | Drachmae, Stars |
| `first_purchase` | server, once per player | pack id | – |
| `pass_claim` | server | track | tier |
| `market_list`, `market_buy` | server | kind, currency | price |

Client API (`src/platform/analytics.ts`): `track(event, props)` — typed
against the allowlist, batched (10 s or 20 events), sent only once signed in,
flushed with `sendBeacon` when the app is hidden.

**Opt-out:** Settings → *Usage statistics* (RU *Статистика игры*). Off means
the client drops its queue and sends nothing, every API request carries
`x-pa-analytics: 0` (the Worker then skips its own events for that request),
and `players.analytics_opt_out = 1` is synced through
`POST /api/telemetry/consent` for server events that have no request (Stars
payments, duel results). Crash reports are not product analytics and are
still sent (they hold no personal data).

### Queries (Analytics Engine SQL API)

```bash
export CF_ACCOUNT_ID=...          # dashboard → Workers & Pages → Account ID
export CF_ANALYTICS_TOKEN=...     # Account Analytics: Read
ae() { curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" --data "$1"; }
```

Counts use `SUM(_sample_interval)` (Analytics Engine samples at high volume;
each kept row stands for `_sample_interval` rows). Data is kept 3 months.

Daily active players and sessions:

```sql
SELECT toStartOfDay(timestamp) AS day, COUNT(DISTINCT index1) AS players, SUM(_sample_interval) AS sessions
FROM pixelarrow_events WHERE blob1 = 'session_start' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day ORDER BY day
```

Activation funnel (players reaching each step in the last 7 days):

```sql
SELECT blob1 AS step, COUNT(DISTINCT index1) AS players
FROM pixelarrow_events
WHERE timestamp > NOW() - INTERVAL '7' DAY
  AND blob1 IN ('install', 'tutorial_complete', 'tutorial_skip', 'first_battle', 'online_join', 'first_capture', 'first_purchase')
GROUP BY step ORDER BY players DESC
```

Tutorial drop-off by step:

```sql
SELECT double3 AS step, blob5 AS id, COUNT(DISTINCT index1) AS players
FROM pixelarrow_events WHERE blob1 = 'tutorial_step' AND timestamp > NOW() - INTERVAL '14' DAY
GROUP BY step, id ORDER BY step
```

D1 / D7 retention by install day (Analytics Engine has no joins: the markers
make it a ratio of daily counts):

```sql
SELECT toStartOfDay(timestamp) AS day, blob1 AS event, SUM(_sample_interval) AS players
FROM pixelarrow_events
WHERE blob1 IN ('install', 'return_d1', 'return_d7') AND timestamp > NOW() - INTERVAL '45' DAY
GROUP BY day, event ORDER BY day
```

D1 retention of the cohort installed on day X = `return_d1` on X+1 ÷ `install`
on X; D7 = `return_d7` on X+7 ÷ `install` on X. (`return_d1`/`return_d7` are
sent at most once per player: only on the first sign-in of that exact day.)

Battles by mode and result:

```sql
SELECT blob5 AS mode, blob6 AS result, SUM(_sample_interval) AS battles
FROM pixelarrow_events WHERE blob1 = 'battle_result' AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY mode, result ORDER BY mode
```

Revenue (Stars) and Drachmae sold per pack:

```sql
SELECT blob5 AS pack, SUM(_sample_interval) AS purchases, SUM(double4 * _sample_interval) AS stars, SUM(double3 * _sample_interval) AS drachmae
FROM pixelarrow_events WHERE blob1 = 'purchase' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY pack
```

(Refunds are not events: the admin panel's overview and the `purchases` table
are the source of truth for money.)

Marketplace volume:

```sql
SELECT blob1 AS action, blob6 AS currency, SUM(_sample_interval) AS n, SUM(double3 * _sample_interval) AS volume
FROM pixelarrow_events WHERE blob1 IN ('market_list', 'market_buy') AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY action, currency
```

Client errors per release (`pixelarrow_client_errors`: `blob1` fingerprint,
`blob2` kind, `blob3` message, `blob4` scene, `blob5` version, `blob6`
platform, `blob7` Telegram version, `double1` count, `double2` player id):

```sql
SELECT blob5 AS version, blob3 AS message, SUM(double1 * _sample_interval) AS occurrences, COUNT(DISTINCT double2) AS players
FROM pixelarrow_client_errors WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY version, message ORDER BY occurrences DESC LIMIT 20
```

## Backups

Two layers:

1. **D1 Time Travel** (always on, nothing to configure): restore the whole
   database to any minute of the last 30 days (7 days on the Workers Free
   plan). This is the main recovery tool.
2. **Daily export** (`.github/workflows/backup.yml`, 02:41 UTC, and by hand
   from *Actions → D1 backup → Run workflow*): records the current Time Travel
   bookmark (`*.bookmark.json`) and a full SQL dump, gzipped and encrypted with
   `BACKUP_PASSPHRASE` (AES-256-CBC, PBKDF2), uploaded as a workflow artifact
   (kept `BACKUP_RETENTION_DAYS`, default 30) and optionally copied to R2. It
   covers disasters Time Travel does not: a deleted database, history older
   than 30 days, a copy outside the account. The export briefly slows the
   database while it runs, so it is scheduled at low traffic. Durable Object
   storage (shard presence, pending duel challenges) is ephemeral and not
   backed up.

Run a backup by hand before any risky operation (a migration that rewrites
data, a manual season end): *Actions → D1 backup → Run workflow*, or
`cd server && npx wrangler d1 time-travel info pixelarrow --config ../wrangler.deploy.json`
to note the current bookmark.

## Restore runbook

### Point in time (Time Travel)

`server/scripts/d1-restore.mjs` wraps `wrangler d1 time-travel info/restore`.
It is a dry run unless `--apply` is given, records the current bookmark
before restoring (so the restore can be undone), and asks you to type the
database name.

1. **Decide the moment** to go back to (UTC), e.g. just before a bad deploy
   (*Actions* run times) or a bad admin action (*Audit* tab).
2. **Stop writes** if the damage is ongoing: revert the bad commit and push,
   or put the game in maintenance (a Worker deploy that answers 503).
3. **Generate the config** with the real database id (repo root):
   ```bash
   D1_DATABASE_ID=<id> node server/scripts/deploy-config.mjs wrangler.jsonc
   ```
4. **Dry run** (changes nothing; shows the current bookmark and the target):
   ```bash
   node server/scripts/d1-restore.mjs --timestamp 2026-10-07T09:30:00Z
   ```
5. **Restore** (type `pixelarrow` when asked):
   ```bash
   node server/scripts/d1-restore.mjs --timestamp 2026-10-07T09:30:00Z --apply
   ```
   It writes `d1-undo-<time>.json` with the bookmark from before the restore.
   Undo with `node server/scripts/d1-restore.mjs --bookmark <undoBookmark> --apply`.
6. **After:** `curl https://pixelarrow.app/api/health`; open the admin panel
   (players, season); note it in the audit trail of your incident notes.
   Everything written after the target moment is gone: Stars payments
   recorded in that window must be re-applied. Telegram retries a webhook only
   for a while, so compare `purchases` with the bot's transactions
   (`getStarTransactions`) and replay the missing ones.
   Season and ban caches in running Worker isolates refresh within a minute.

The script was tested against a stub wrangler (dry run, apply with the undo
file, refusals for a missing target, a timestamp older than 30 days and a
wrong confirmation); the `wrangler` commands it runs are exactly the ones in
the dry-run output.

Plain wrangler equivalent:

```bash
cd server
npx wrangler d1 time-travel info pixelarrow --config ../wrangler.deploy.json                       # current bookmark: note it
npx wrangler d1 time-travel info pixelarrow --timestamp 2026-10-07T09:30:00Z --config ../wrangler.deploy.json
npx wrangler d1 time-travel restore pixelarrow --bookmark <bookmark> --config ../wrangler.deploy.json
```

### From an exported backup

When the moment is older than Time Travel reaches, or the database is gone:

```bash
# 1. Download the artifact (Actions → D1 backup → run → Artifacts), or from R2:
#    npx wrangler r2 object get pixelarrow-backups/d1/pixelarrow-<stamp>.sql.gz.enc --file x.enc --remote
# 2. Decrypt and unpack
BACKUP_PASSPHRASE='...' openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  -in pixelarrow-<stamp>.sql.gz.enc -out restore.sql.gz && gunzip restore.sql.gz
# 3. Import into a NEW database (never on top of the live one)
cd server
npx wrangler d1 create pixelarrow-restore
npx wrangler d1 execute pixelarrow-restore --remote --file ../restore.sql   # with a config holding its id, or by name
# 4. Check it, then point D1_DATABASE_ID at the new id and redeploy (Actions → Deploy → Run workflow).
```

This path (export → encrypt → decrypt → import into an empty database,
including `d1_migrations`, so later migrations continue from the right
number) was drilled locally with `wrangler d1 ... --local`.

## Admin panel

**URL:** https://pixelarrow.app/admin (served by the Worker, not part of the
game bundle; `wrangler.jsonc` routes `/admin` and `/admin/*` to the Worker).

**Auth:** the `ADMIN_TOKEN` secret, pasted into the page and kept in the tab's
`sessionStorage` only. Chosen over a Telegram-id allowlist because the panel
is a normal browser page: Telegram login would need the Login Widget and a
bot domain, and accepting game session tokens would let a stolen player
session become admin. Game session tokens are never accepted by
`/api/admin/*`. Tokens are compared in constant time; 10 failed attempts lock
an IP out for 10 minutes (per Worker isolate); every request and action is
logged with the operator name. The page has a strict CSP (`script-src 'self'`,
`frame-ancestors 'none'`), `noindex`, and renders all data as text.

**Tabs:**

- *Overview:* players (total, new, active 24 h / 7 d), purchases and Stars
  (24 h / 7 d, refunds), Drachmae held and negative wallets, client errors 24
  h, banned count, current season, whether Analytics Engine is bound.
- *Players:* search by player id, Telegram id, username or first name
  (prefix). The player page shows the profile, ban state, wallet and ledger,
  Stars purchases (with a *Refund* button each), entitlements, the current
  season's profile, clan, pass, army (heroes) and stash, the campaign save
  summary, analytics milestones, and every admin action on that player.
  Actions:
  - **Ban / Unban** (reason required). A ban blocks sign-in at once and every
    API call and socket of existing sessions within a minute (`server/src/ban.ts`).
  - **Adjust balance:** Drachmae (a ledger row of kind `admin`; may go below
    zero, which blocks spending like a refund does) or the current season's
    gold (never below zero). The offline campaign's gold lives in the
    player's own save and is not edited here.
  - **Refund** a Stars purchase: calls `refundStarPayment`, then applies the
    same bookkeeping as the `refunded_payment` webhook (revokes the
    entitlement, or debits the pack's Drachmae). A purchase already refunded
    is not sent to Telegram again; the webhook Telegram sends afterwards
    changes nothing.
- *Errors:* the latest client error groups; click one for the stack,
  breadcrumbs and device.
- *Season:* the active season, **End the active season** (final ranks and
  titles; optionally start the next at once — otherwise the next player
  request starts it), **Start a new season** (only when none is active), the
  shards (players, owned hexes, clans, open listings, world bosses, live
  sockets from each shard's Durable Object) and recent seasons. Other Worker
  isolates may serve the old season for up to 30 s after a manual end.
- *Tickets:* `/paysupport` tickets once that table exists (the panel looks
  for `support_requests` (the `/paysupport` and `/delete_my_data` requests), `support_tickets`, `paysupport_tickets`, `payment_support`,
  `paysupport`); until then it says so.
- *Audit:* every admin action (who, what, on whom, the request and the
  result).

**Audit and idempotency:** every action carries a request id (the page makes
one per submission) and is written to `admin_audit` before it runs. Sending
the same request id again returns the first result (`replayed: true`) and
changes nothing; a failed action keeps its error in the audit row.

The admin API (`/api/admin/*`, `Authorization: Bearer <ADMIN_TOKEN>`) can be
scripted the same way:

```bash
curl -s https://pixelarrow.app/api/admin/players?q=alice -H "authorization: Bearer $ADMIN_TOKEN"
curl -s https://pixelarrow.app/api/admin/players/42/adjust -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"requestId":"comp-2026-10-07-42","currency":"drachmae","delta":100,"reason":"outage compensation"}'
```
