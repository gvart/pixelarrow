# A1-PLAT: server map (Cloudflare Worker + D1)

Audit of `server/` on `v6` at 768e9f5. Hono app in `server/src/index.ts`; 3 Durable Object classes
(`RegionDO`, `MatchmakerDO`, `DuelDO`); D1 `pixelarrow`; Analytics Engine; 2 crons.

## Routes

**116 endpoints: 112 HTTP + 4 WebSocket** (catch-alls excluded). Auth column: `none`, `session`
(`requireAuth`, `Authorization: Bearer pa1.…`), `admin` (`ADMIN_TOKEN` bearer), `webhook`
(`x-telegram-bot-api-secret-token`), `optional` (session read if present).

### Core (`server/src/index.ts`, `routes/`)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | none | liveness, DB bound, which secrets are set (booleans) |
| POST | `/api/auth/telegram` | none (rate 20/min/IP) | initData (or `{dev}` when `DEV_AUTH=1`) → session token |
| GET | `/api/me` | session | own player row |
| GET, PUT | `/api/save` | session | cloud campaign save (revisioned) |
| GET | `/api/shop/products` | none | Stars products |
| POST | `/api/shop/invoice` | session | create a Stars invoice link |
| GET | `/api/entitlements` | session | owned products |
| POST | `/api/telegram/webhook` | webhook | bot updates: commands, `pre_checkout_query`, `successful_payment`, refunds |
| POST | `/api/battle/verify` | session | deterministic replay check |
| POST | `/api/telemetry/errors` | optional (rate per IP and pid) | crash reports |
| POST | `/api/telemetry/events` | optional (rate per pid) | product analytics batch |
| POST | `/api/telemetry/consent` | session | analytics opt-out |
| GET, PUT | `/api/notify/settings` | session | bot notification prefs |
| GET | `/ws/region/:id` | session (subprotocol or `?token=`) | region DO socket |
| GET | `/ws/online` | session + season profile | shard presence, lobby, relay |
| GET | `/ws/duel` | session + duel profile | global matchmaker |
| GET | `/ws/duel/:match` | session (DO checks membership) | one live match |

### Economy (`economy/routes.ts`)
`GET /api/economy/catalog` (none); session: `GET wallet`, `POST buy`, `POST cosmetics/equip`,
`GET pass`, `POST pass/claim`.

### Season war (`online/routes.ts` and sub-routers, all session)
`/api/online`: `GET status`, `POST|GET profile`, `GET season`, `GET map`, `GET region/:loc`,
`POST march`, `POST march/stop`, `POST region/:loc/garrison`, `POST collect`, `POST recruit`,
`POST equip`, `POST salvage`, `POST army`;
`attack/` start, submit, abandon; `clans/` `POST /`, `GET mine`, `POST invite`, `GET invite/:code`,
`POST join`, `kick`, `promote`, `leave`; `camps/` `GET /`, claim, build, rest; `consumables/` `GET /`,
use; `market/` `GET /`, `GET mine`, `GET towns`, list, buy, cancel; `merchant/` `GET :loc`, buy;
`boss/` `GET /`, start, submit, abandon. (43 endpoints.)

### Duels (`duel/routes.ts`, `duel/async.ts`, all session)
`/api/duel`: `POST|GET profile`, recruit, dismiss, equip, develop, respec, team, loadout,
loadout/create, loadout/delete, shop/buy, shop/sell, shop/salvage, ladder/start, ladder/submit,
ladder/chest, ladder/abandon, `GET ranked`, `GET match/:id`; async: `GET async`, async/start,
async/submit, async/abandon, `GET async/log`, `GET async/replay/:id`, `GET season`, season/seen,
season/pick, `GET leaderboard`. (30 endpoints.)

### Admin (`admin/`)
`/api/admin/*` (admin, 14): `GET me, overview, players, players/:id, errors, audit, tickets, season`;
`POST players/:id/ban, unban, adjust`, `purchases/:charge/refund`, `season/end`, `season/start`.
`/admin`, `/admin/app.js`, `/admin/app.css`, `/admin/` → 301 (page, no auth; the API is the gate).

## Auth today

1. Client sends Telegram `initData` to `POST /api/auth/telegram` (`routes/auth.ts:41-87`).
2. `validateInitData` (`telegramAuth.ts:44-82`): HMAC-SHA256 with `secret = HMAC("WebAppData", bot_token)`,
   constant-time verify, `auth_date` ≤ 24 h old and ≤ 5 min in the future, `user.id` a safe integer.
3. Ban check, `upsertPlayer` keyed on `telegram_id` (`players.ts:21-38`), retention analytics.
4. `signSession` (`session.ts`): **stateless** token `pa1.<b64url(JSON {pid, tg, name, iat, exp})>.<HMAC>`,
   TTL 7 days, `SESSION_SECRET`. Returned in JSON; the client keeps it in memory and re-auths on 401.
5. `requireAuth` (`middleware.ts:44-47`): bearer → `verifySession` → `assertNotBanned` (cached per isolate,
   1 min). Sockets read the token from `Sec-WebSocket-Protocol` or `?token=`.
6. Dev: `{dev:{id,…}}` accepted only when `DEV_AUTH=1` (local `.dev.vars`).

There is no logout, no server-side session list, no revocation except rotating `SESSION_SECRET` (all
users) or a ban.

## D1 schema (16 migrations, `server/migrations/`)

| Migration | Tables (`+` = added column) |
| --- | --- |
| 0001 init | `players` (id PK, **telegram_id NOT NULL UNIQUE**, username, first_name, language_code, is_premium, created_at, last_seen_at), `saves`, `purchases` (telegram_payment_charge_id UNIQUE), `entitlements` |
| 0002 online | `online_seasons`, `online_shards`, `online_profiles`, `online_heroes`, `online_items`, `online_regions`, `online_garrisons`, `clans`, `clan_members`, `clan_invites`, `battle_tickets`, `battle_log`, `season_rewards` |
| 0003 economy | `wallets`, `drachmae_ledger`, `shop_orders`, `cosmetic_loadout`, `online_consumables`, `consumable_daily`, `pass_progress`, `pass_claims`, `market_listings`, `market_audit`, +`battle_tickets.consumable` |
| 0004 beasts | `world_bosses`, `world_boss_damage`, `world_boss_loot` |
| 0005 notifications | `notify_settings`, `notify_outbox`, `notify_log`, `support_requests`, `bot_state`, `bot_meta` |
| 0006 ops | +`players.banned_at`, `ban_reason`, `analytics_opt_out`; `analytics_milestones`, `client_errors`, `admin_audit` |
| 0007 duels | `duel_profiles` (wins), `duel_heroes`, `duel_items`, `duel_tickets`, `duel_orders` |
| 0008 duel ranked | `duel_ratings` (Glicko-2: rating, rd, games, wins, losses, peak; index `(ladder, rating DESC)`), `duel_queue_state`, `duel_matches` |
| 0009 merchants | `merchant_daily`, `merchant_orders` |
| 0010 async seasons | +`duel_ratings.season, played_at, defences, defence_wins, roll_nonce`; `duel_loadouts`, +`duel_profiles.loadout, lo_*`; `duel_defences`, `duel_attacks`, `duel_season_rewards` |
| 0011 camps | `online_camps`, `online_camp_buildings` |
| 0012 map v3 reset | rebuilds the shard, region, garrison, ticket, listing, boss, battle_log, merchant_orders tables |
| 0013–0016 | +`online_heroes.reserve`; `duel_ladder_stars`, `duel_ladder_chests`; `loot_pity`, `world_boss_chests`, +spoils/pick columns; +`sim_version` on tickets, attacks, matches |

Identity is welded to Telegram: `players.telegram_id NOT NULL UNIQUE`, `Session.tg` required
(`session.ts:50` rejects a session without it), `displayName` falls back to `Player <telegram_id>`,
`purchases` keyed on the Telegram charge id.

## Rate limiting

`server/src/rateLimit.ts`: fixed-window counters **in isolate memory** (a `Map`, cleared at 10k keys).
Per-isolate, so the real limit is N × isolates; documented as a soft guard.
Used by: auth (20/min/IP), admin failures (10 per 10 min/IP), telemetry (per IP and pid), notify
(30/min/pid), economy, online and duel buckets per pid (about 50 call sites). Nothing durable, no
per-account lockout, no Workers Rate Limiting binding.

## Public stats and leaderboards: what exists

| Landing stat | Source today | Notes |
| --- | --- | --- |
| Players | `SELECT COUNT(*) FROM players` (admin overview does it) | exact; excludes banned with `banned_at IS NULL` |
| Active players 24 h / 7 d | `players.last_seen_at` (admin overview) | last sign-in only, not last play |
| Online battles fought | `battle_log` (war battles), `duel_matches` (live duels), `duel_attacks` status `used` (async), `world_boss_damage` | **campaign (offline) battles are not on the server** except as Analytics Engine `battle_result` events (sampled, needs the SQL API token, 3-month retention) |
| Top duelists | `duel_ratings` by `(ladder, season)`, index exists; `duel/season.ts:181 leaderboard()` | that function calls `rollRatings` (a **write**) and needs a `pid`: write a read-only variant for public use |
| War standings | `online/store.ts:117 standings(season)` (players and clans by held regions, computed on read from `online_regions` + map) | heavy-ish (reads all held regions); cache it |
| Clans | `clans`, `clan_members` | names are player-chosen: moderation risk |
| Past season winners | `season_rewards`, `duel_season_rewards` | |
| World boss kills | `world_bosses`, `world_boss_damage` | |
| Purchases, revenue | `purchases`, `drachmae_ledger` | **never public** |

**Missing:**
- A public display name. Leaderboards today print `first_name` / `username` / `Player <telegram_id>`
  (`online/store.ts:573-585`): Telegram personal data and the Telegram id. A public API needs a
  player-chosen nickname (or a pseudonym) plus an opt-out of public boards.
- Total battles across modes (no counter table; add one `stats_daily` row updated by a cron, or count
  the per-mode tables in the cron).
- Any `/api/public/*` route, an edge cache (Cache API, 60–300 s), a durable per-IP limit, CORS for the
  landing origin.

## Gaps for v6 accounts

| Need | Gap |
| --- | --- |
| Email accounts | `players.telegram_id` NOT NULL UNIQUE; no email or password columns. Add `auth_identities (player_id, kind 'telegram'/'password', subject, …, UNIQUE(kind, subject))` and make `telegram_id` nullable, or move it there (no live users: V5-074, rewrite freely). |
| Password hashing | `crypto.ts` has only HMAC/SHA. Workers have no bcrypt/argon2 native; PBKDF2-SHA256 via WebCrypto (`crypto.subtle.deriveBits`, ~100k–600k iterations within CPU limits) or argon2 in WASM. ADR needed with a CPU-time benchmark. |
| Sessions as cookies | Tokens are stateless bearer JSON. Cookies need `HttpOnly; Secure; SameSite=Lax; Path=/` on play.pixelarrow.app, CSRF defence (SameSite + `Origin` check on unsafe methods), and a `sessions` table for logout, "log out everywhere", password change and deletion. `Session.tg` must become optional. |
| Verification and reset | No email sending. Cloudflare Email Service (send binding) or Email Routing `send_email` binding; tables `email_tokens (hash, player_id, purpose, expires_at, used_at)`; tokens stored hashed, single use, short TTL. |
| Linking | No linking flow. Telegram → add email: authenticated session + verify email. Web → link Telegram: needs a proof of the Telegram account: initData from inside the Mini App (open `t.me/<bot>/<app>?startapp=link_<nonce>`) or the Telegram Login Widget (needs `/setdomain` on the bot). Merge policy if both accounts already have progress must be designed. |
| Turnstile | None. `siteverify` call on sign-up, log-in, reset; secret `TURNSTILE_SECRET`; test keys locally. |
| Account deletion | Only `/delete_my_data` in the bot, which logs a `support_requests` row for manual handling. Need `DELETE /api/account` with re-auth, cascade or anonymise across about 60 tables (many FKs have no `ON DELETE CASCADE`), keep `purchases` for legal bookkeeping (anonymised), remove from leaderboards, revoke sessions, and a Telegram-linked policy as the privacy notice says. |
| Rate limits | Per-isolate only. Login/reset need durable limits: Workers Rate Limiting binding (per IP) plus a D1 or DO counter per account (lockout with backoff). |
| Online play gate | Everything online assumes a Telegram identity. Brief: email accounts must be verified before playing online → `requireAuth` variant `requireVerified`. |

## Security notes

- Good: constant-time HMAC for initData, sessions and admin tokens; initData max age; body size limits
  (`body.ts`, `MAX_BODY`); zod validation; webhook secret header; admin page CSP; error scrubbing of
  tokens and `initData`; `cache-control: no-store` on `/api/*`.
- **Session TTL 7 days with no revocation.** A leaked token (it travels in `?token=` for sockets when the
  subprotocol is not used, so it can end up in logs) stays valid until expiry. Prefer subprotocol only;
  add a `sessions` table / `sid` with revocation in v6.
- **Sessions carry `name`** and the DO trusts `x-player-name` from the Worker: fine, but rename flows
  must re-issue tokens.
- **CORS** allow-list is `https://pixelarrow.app` and `https://web.telegram.org`; responses add
  `access-control-allow-origin` but no `allow-credentials`. Moving the game to play.pixelarrow.app needs
  this list updated; adding cookies requires `allow-credentials: true` with an exact origin, never `*`.
- `GET /api/health` reveals which secrets are set (booleans only). Acceptable; consider admin-only.
- The `DEV_AUTH` bypass depends on a var never being set in production: add a deploy-time check
  (`deploy-config.mjs` fails if `DEV_AUTH` is present in vars).
- Rate limits are per isolate: a distributed attacker on `/api/auth/*` is not limited. Blocking for
  password log-in (credential stuffing); not for initData (unforgeable).
- Leaderboard names expose Telegram `first_name`/`username` and, as a fallback, the numeric Telegram id.
  Not acceptable on a public, unauthenticated API.
- Deletion today is manual and not cascaded: a privacy-notice blocker for v6.
- These notes follow the `/security-audit` categories 2 (network), 3 (input) and 4 (data exposure)
  for the auth and public surfaces only; they are not a full audit. The full `/security-audit` runs per
  the brief before each auth, account or public-API merge.
