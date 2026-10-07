# Pixelarrow backend (v1)

One Cloudflare Worker, `pixelarrow`, serves **both** the static game (the root
`dist/` build, on https://pixelarrow.app) **and** this API. `wrangler.jsonc`
(repo root) sets `assets.run_worker_first: ["/api/*", "/ws/*"]`, so only those
paths run Worker code; everything else is plain static hosting with the SPA
fallback, exactly as before.

- **Routing:** [Hono](https://hono.dev). **Validation:** zod. **Storage:** D1
  (`DB`, database `pixelarrow`). **Realtime:** `RegionDO`, a SQLite-backed
  Durable Object (free-plan compatible) using the WebSocket Hibernation API.
- **Battle verification** imports the game's deterministic sim from
  `../src/sim` read-only; wrangler/esbuild bundles it into the Worker.

## Layout

```
server/
  src/
    index.ts          Worker entry: Hono app, CORS, error handler, /ws upgrade; exports RegionDO
    env.ts            bindings / secrets types
    routes/auth.ts    POST /api/auth/telegram
    routes/save.ts    GET/PUT /api/save
    routes/shop.ts    GET /api/shop/products, POST /api/shop/invoice, GET /api/entitlements
    routes/webhook.ts POST /api/telegram/webhook
    battle.ts         sim adapter for POST /api/battle/verify (the only file that knows the sim API)
    region.ts         RegionDO (presence; per online shard also hex attack locks, the duel relay and live army pushes)
    online/           online mode: routes.ts (profile, map, hex, march, garrison, collect, recruit, equip, army), live.ts (live army movement, fog-filtered),
                      attack.ts (tickets, verified attacks), clans.ts, duel.ts (lobby, lockstep relay),
                      store.ts (seasons, shards, homes, D1 access), income.ts, context.ts,
                      consumables.ts (season inventory, use), market.ts (town marketplace)
    notify/           bot notifications: outbox.ts (enqueue, delivery rules, flush), templates.ts (EN/RU
                      texts, coalescing, deep links), jobs.ts (cron: season/income notices, bot setup),
                      routes.ts (/api/notify/settings)
    bot/              commands.ts (command menu EN/RU), handlers.ts (/settings, /paysupport, /terms,
                      /delete_my_data, settings buttons)
    economy/          routes.ts (/api/economy: catalog, wallet, buy, cosmetics, season pass),
                      catalog.ts (cosmetics, pass tiers, market limits: all prices), wallet.ts (Drachmae
                      ledger helpers), pass.ts (pass XP)
    duel/             routes.ts (/api/duel: duel profile, roster, develop, team, shop, ladder tickets), store.ts (D1 access)
    telegramAuth.ts   initData validation (HMAC-SHA256, constant-time, 24 h max age)
    session.ts        stateless signed session tokens
    payments.ts       pre-checkout checks, idempotent payment/refund recording
    products.ts       shop catalogue (Stars prices) and invoice payload format
    middleware.ts     requireAuth, db()/secret() -> 503 when not configured
    crypto.ts, body.ts, errors.ts, players.ts, rateLimit.ts, telegramApi.ts
  migrations/0001_init.sql   D1 schema (players, saves, purchases, entitlements)
  migrations/0002_online.sql online mode (seasons, shards, profiles, heroes, items, hexes, garrisons,
                             clans, invites, battle tickets, battle log, season rewards)
  migrations/0003_economy.sql wallets, Drachmae ledger, shop orders, cosmetic loadout, consumables
                             (season inventory, daily caps), battle_tickets.consumable, season pass,
                             market listings and audit
  migrations/0005_notifications.sql notification settings, outbox and log, support_requests, bot state
  migrations/0006_ops.sql           bans, analytics opt-out and milestones, client_errors, admin_audit (docs/OPS.md)
  scripts/deploy-config.mjs  CI: wrangler.jsonc -> wrangler.deploy.json (fills/drops D1 id)
  scripts/bot-setup.mjs      one-off: setMyCommands (EN/RU) and setWebhook with the allowed updates
  test/                      vitest in workerd (@cloudflare/vitest-pool-workers)
```

The server has its own `package.json`/lockfile (vitest 4 for the Workers pool;
the game uses vitest 5). Nothing under the root `src/` is modified by the server.

## API

All responses are JSON. Errors always look like
`{ "error": { "code": "save_conflict", "message": "...", ...extra } }`.
Authenticated routes take `Authorization: Bearer <token>`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{ ok, db, secrets: {name: bool} }` (never values) |
| POST | `/api/auth/telegram` | – | body `{ "initData": "<Telegram.WebApp.initData>" }` (or the raw string). Returns `{ token, expiresAt, player }`. Token lifetime 7 days. |
| GET | `/api/me` | ✓ | `{ player, session }` |
| GET | `/api/save` | ✓ | `{ revision, version, data, updatedAt }`; `revision: 0, data: null` if none |
| PUT | `/api/save` | ✓ | body `{ revision: <last revision you saw>, data: <SaveData, must have numeric v> }` → `{ revision }`, or **409** `save_conflict` with the current `revision`. Max 512 KB. |
| POST | `/api/battle/verify` | ✓ | see below |
| GET | `/api/shop/products` | – | Stars products: the Drachmae packs (`kind: 'drachmae'`, `drachmae`) and the legacy `supporter_banner` |
| POST | `/api/shop/invoice` | ✓ | body `{ productId }` → `{ link }` (Stars invoice link); 409 if an entitlement is already owned |
| … | `/api/economy/*` | ✓ (catalog –) | Drachmae, shop, cosmetics, season pass: see "Economy" |
| GET | `/api/entitlements` | ✓ | `{ entitlements: [{productId, grantedAt}], purchases: [...] }` |
| POST | `/api/telegram/webhook` | secret header | bot updates (see below) |
| GET / PUT | `/api/notify/settings` | ✓ | bot notification switches, see "Bot notifications" |
| GET (WS) | `/ws/region/:id` | token | presence WebSocket (see below) |
| … | `/api/online/*` | ✓ | online mode, see "Online mode" |
| GET (WS) | `/ws/online` | token | the player's shard: presence, duel lobby, lockstep relay |
| … | `/api/duel/*` | ✓ | the persistent duel army, Glory, the duel shop and the PvE ladder, see "Duels" |
| POST | `/api/telemetry/errors` | optional (header or body `token`) | client crash reports, deduplicated into D1 `client_errors` (docs/OPS.md "Monitoring") |
| POST | `/api/telemetry/events` | ✓ (header or body `token`) | allowlisted product analytics events → Analytics Engine (docs/OPS.md "Analytics") |
| POST | `/api/telemetry/consent` | ✓ | body `{ analytics: boolean }`: the Settings opt-out |
| … | `/api/admin/*` | `ADMIN_TOKEN` | admin panel API; the page is `/admin` (docs/OPS.md "Admin panel") |

A banned player (admin panel) gets **403** `banned` from sign-in and from every
authenticated route and socket (existing sessions within a minute).

Missing configuration fails loudly: no D1 binding → 503 `database not
configured`; a missing secret → 503 `<NAME> not configured`.

### Auth

`initData` is validated per the Telegram spec: `secret = HMAC_SHA256("WebAppData",
bot_token)`, `hash = hex(HMAC_SHA256(secret, data_check_string))`, compared in
constant time (`crypto.subtle.verify`); `auth_date` older than 24 h (or > 5 min
in the future) is rejected. The player row is upserted (telegram id, username,
first name, language, premium, created/last seen).

Session tokens are stateless: `pa1.<base64url(json)>.<base64url(HMAC-SHA256)>`
signed with `SESSION_SECRET` (rotating it logs everyone out). There is no
sessions table.

**Rate limit:** 20 logins per minute per IP, kept in isolate memory, so it is a
per-isolate soft guard, not a global quota. Move to the Workers Rate Limiting
binding or a DO if abuse shows up.

**Dev login:** with `DEV_AUTH=1` (only in the local `.dev.vars`; never set it in
production) `POST /api/auth/telegram` also accepts
`{ "dev": { "id": 1, "first_name": "Dev" } }`.

### Saves

The campaign save is stored as an opaque, versioned JSON blob per player with an
optimistic-concurrency `revision`. **The economy is client-trusted in v1** (gold,
loot, XP are whatever the client saves). For online/competitive modes the
authoritative state (gold, items, battle rewards) must move server-side, with
battle results accepted only through `/api/battle/verify`-style replays.

### Battle verification

```jsonc
POST /api/battle/verify
{
  "setup": { "seed": 123, "armies": [ArmySpec, ArmySpec], "timeLimit": 300 },  // the sim's BattleSetup
  "orders": [ { "tick": 0, "side": 0, "order": { "kind": "preset", ... } }, ... ], // Battle.orderLog
  "deployOrders": 1,      // optional: how many leading log entries were issued before startBattle()
  "claim": { "winner": 0, "ticks": 1834, "retreated": null, "hash": "a1b2c3d4" } // hash = Battle.hash(), optional
}
→ { "match": true, "mismatches": [], "server": { winner, retreated, ticks, seconds, hash, sides: [...] },
    "ticksSimulated": 1834, "elapsedMs": 0 }
```

The Worker rebuilds the battle from the setup, replays the non-bot side's
orders at their ticks (bot sides regenerate theirs from the seed) and compares.
`elapsedMs` is wall time; Workers clocks only advance across I/O, so it usually
reads 0 in production — use the Worker's CPU-time metrics. A full battle is
~1–2k sim steps; that can exceed the **10 ms CPU limit of the Workers free
plan**, so production verification needs the paid plan (30 s default CPU) or a
cap on what is verified. Limits: 64 units and 16 groups per side, 20k orders,
600 s time limit, 1 MB body. Only `server/src/battle.ts` knows the sim's API —
update it if `BattleSetup`/`Order` change.

### Telegram bot webhook & Stars payments

`POST /api/telegram/webhook` requires `X-Telegram-Bot-Api-Secret-Token ==
TELEGRAM_WEBHOOK_SECRET` (constant-time compare), otherwise 401.

- `/start` → replies with an inline **web_app** button opening `GAME_URL`
  (https://pixelarrow.app); it also re-enables notifications for a player
  whose bot was blocked.
- `/settings`, `/paysupport`, `/terms`, `/delete_my_data` and the `/settings`
  buttons (`callback_query`): see "Bot notifications" and "Payment support
  and legal pages".
- `pre_checkout_query` → checks the payload (`v1:<product>:<playerId>:<nonce>`),
  that the product exists, currency `XTR` and amount match `products.ts`, the
  payer is the player the invoice was made for and does not already own it,
  then `answerPreCheckoutQuery`.
- `message.successful_payment` → inserts into `purchases` keyed by the unique
  `telegram_payment_charge_id` (webhook retries are no-ops) and grants the
  entitlement. `message.refunded_payment` marks it refunded and revokes it.

Products live in `src/products.ts`. **Stars buy only Drachmae packs**
(`drachmae_100` 100 Stars → 100 Dr, `drachmae_275` 250 → 275, `drachmae_600`
500 → 600, `drachmae_1300` 1000 → 1300). `successful_payment` of a pack
credits the wallet exactly once per charge (a `drachmae_ledger` row keyed by
the charge id; never after that charge was refunded); `refunded_payment`
debits the credited amount again, once, even if that makes the balance
negative. The legacy `supporter_banner` (5 Stars) stays a Stars entitlement
for the existing shop screen and doubles as a banner cosmetic. Invoices are
created with `createInvoiceLink`, currency `XTR`, empty `provider_token`.

### Region WebSocket (`RegionDO`)

`wss://pixelarrow.app/ws/region/<id>` with the session token either as
`?token=<token>` or as the second WebSocket subprotocol:
`new WebSocket(url, ['pixelarrow.v1', token])` (the server answers with
`pixelarrow.v1`). One DO per region id (`[a-z0-9_-]{1,40}`).

- server → `welcome {region, you, players}`, `join {player}`, `leave {player}`
  (when a player's last socket closes), `presence {players}`, `pong`, `error`.
- client → `{"type":"ping","t":..}` (→ `pong`), `{"type":"who"}` (→ `presence`).
  The bare text frame `ping` is auto-answered `pong` without waking the DO.

The user id/name live in each socket's attachment (`serializeAttachment`), so
presence survives hibernation. This is the skeleton for territories and clans.

## Online mode (seasonal hex war)

Design: [docs/DESIGN_V2.md](../docs/DESIGN_V2.md) and "Online mode" in
[docs/DESIGN.md](../docs/DESIGN.md). Shared rules live in `src/online/`
(`hex.ts` world generation and paths, `defenders.ts` neutral defenders,
`rules.ts` economy and clan permissions, `battle.ts` setups and result
application, `protocol.ts` socket messages, `lockstep.ts` the client adapter);
the server imports them read-only like the sim.

**Everything economic is server-owned.** Armies, heroes, gear, resources and
territory live in D1; the client only sends intents (march here, attack that,
equip this item), never amounts. Each operation is one D1 batch: the first
statement bumps the profile's `rev` from the value read and every other
statement is guarded by `EXISTS (… rev = new)`, so concurrent requests can
never half-apply or double-spend (409 `conflict` → retry).

**Seasons and shards.** `online_seasons` last 90 days; the first request
after the end ranks every shard into `season_rewards` (kept forever: rank,
score, title) and starts season n+1. That is the full reset: every army and
world table is keyed by `season_id`. Players join the newest shard with room
(500 players; a radius-34 hex disc, about 3.5k hexes; seed in
`online_shards`). Static hex data (type, resources, fort/capital,
battlefield, neutral defenders) is a pure function of the shard seed and is
never stored; `online_hexes` only holds hexes whose state changed (owner,
clan, home, income clock, neutral losses, siege progress, `occupant`
npc|player|beast). The seed never leaves the server.

**Fog of war.** `/map` and `/hex` only answer for hexes within 3 of the
player's or their clan's land and armies; anything else is 404 `fogged`.

**Lazy time.** Income (`accrued_at`, capped at 24 h), energy (`energy_at`),
marches (arrival time per hex), wounds, ticket expiry, hex locks and neutral
respawns are all computed on read from server time. No alarms or polling
(the only scheduled work is bot notifications, see "Bot notifications").

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/online/status` | `{ season, joined, shard }` |
| POST | `/api/online/profile` | join the season (idempotent): shard, home hex, 5 heroes, purse → profile |
| GET | `/api/online/profile` | resources, energy, home, army (position/march), heroes (garrison, wounds, busy), stash, clan, pending income |
| GET | `/api/online/season` | season dates and your titles from past seasons |
| GET | `/api/online/map` | visible hexes `{q,r,type,tier,fort,capital,coast,site,occupant,owner,clan,home,garrison?,def?}` (`def`: the neutral holders, a `src/online/defenders.ts` id), visible armies, player names, clan tags |
| GET | `/api/online/hex/:q/:r` | yields, march minutes, owner, garrison (own/clan only), defenders estimate, siege `{wins, needed, label}`, `locked`, `canAttack`, `canGarrison`, pending income |
| POST | `/api/online/march` | `{q,r}` → A* path over land not held by rivals, arrival times `at[]`; 1 energy per hex, at most 40 hexes |
| POST | `/api/online/march/stop` | halt on the last hex reached |
| POST | `/api/online/hex/:q/:r/garrison` | `{heroIds, formations?}`: which of YOUR heroes hold the hex (own or clan hex; the army must stand on it; refused while under attack) |
| POST | `/api/online/collect` | collect the income of all held hexes |
| POST | `/api/online/recruit` | `{archetype}`: 40 gold, 10 food, 1 recruit |
| POST | `/api/online/equip` | `{heroId, slot, itemUid \| null}`: stash ↔ hero |
| POST | `/api/online/army` | `{groups?: {heroId: 0..3}, formations?: FormationType[4]}` |
| POST | `/api/online/attack/start` | `{q,r,heroIds?}` → `{ticket, expiresAt, setup, attackers, defenders, defenderKind}` |
| POST | `/api/online/attack/submit` | `{ticket, orders, deployOrders?, claim: {winner, ticks, hash}}` → result |
| POST | `/api/online/attack/abandon` | `{ticket}` |
| GET | `/api/online/boss` | the shard's world bosses: shared HP, arms, status, top damage (players, clans), your tally and loot |
| POST | `/api/online/boss/start` | `{boss, heroIds?, consumable?}` → a raid ticket (a 120 s segment against the boss's current wounds; no hex lock) |
| POST | `/api/online/boss/submit` | `{ticket, orders, deployOrders?, claim}` → damage dealt, HP lowered relatively; the killing raid splits the hoard by damage share |
| POST | `/api/online/boss/abandon` | `{ticket}` |
| POST | `/api/online/clans` | `{name, tag}`: create (you lead it) |
| GET | `/api/online/clans/mine` | clan, members with roles and hex counts |
| POST | `/api/online/clans/invite` | leader/officer → `{code, link}`, link `https://t.me/<bot>/<app>?startapp=clan_<code>` |
| GET | `/api/online/clans/invite/:code` | invite preview |
| POST | `/api/online/clans/join` | `{code}`; a player new to the season is placed in the clan's shard |
| POST | `/api/online/clans/kick`, `/promote`, `/leave` | `{playerId}`, `{playerId, role}`, – |

Rate limits are per player and per isolate (e.g. 12 attack starts and 30
marches a minute).

### Beast lairs and world bosses

Lairs and world boss sites are a pure function of the shard seed
(`src/online/lairs.ts`). A lair hex fights with its beast (`defenderKind:
'beast'`) until it is slain: the win captures the hex at once, the loot is the
beast's hoard (rare / epic / legendary) and a `trophy_<beast>` entitlement is
granted; `online_hexes.beast_slain_at` brings the beast back after 48 h if the
hex falls back to the neutrals. World bosses live in `world_bosses` (HP and
arms), `world_boss_damage` (tally) and `world_boss_loot` (the split, one row
per player, idempotent). See migration 0004.

### Attacks: tickets and verification

1. `attack/start` checks that the army stands next to the hex (not marching),
   10 energy, no rival home hex, no cooldown; takes the **hex lock** in the
   shard DO (`lockHex`, expires with the ticket: one attack per hex at a time,
   else 409 `hex_locked`); picks the defenders: the owner's garrison (bot AI),
   a militia if the owner left none, or the **neutral defenders**
   (`src/online/defenders.ts`: by hex type and depth into the shard, losses
   persist until a respawn); fixes a crypto-random **seed**, builds the setup
   (`src/online/battle.ts`, with the hex's battlefield terrain) and stores the
   ticket (10 min). Heroes on both sides are marked busy. An open ticket for
   the same hex is **resumed** with the same seed, so restarting cannot fish
   for seeds.
2. The client plays the battle locally and submits the order log.
3. `attack/submit` replays the **stored** setup (the client's copy is never
   used). Any mismatch (winner, ticks, `Battle.hash()`) voids the ticket (422
   `replay_mismatch`, no rewards, 3 min cooldown); expired → 410. Otherwise
   one guarded batch applies permadeath, wounds (2 h), XP and wear on both
   sides, loot (the best `picks` items of the enemies the attacker killed) and
   gold, a battle_log row, and either **siege progress** (forts, towns and
   capitals need 2–4 wins in a row; progress decays after 6 h) or the
   **capture**: owner, clan, income clock, plunder of the previous owner's
   uncollected income, the army moves in, surviving garrison heroes go home.
   Submitting a used ticket again with the same claim returns the stored
   result.

### Shard socket (`/ws/online`)

`new WebSocket('/ws/online', ['pixelarrow.v1', token])` joins the room
`shard-<season>-<shard>` (needs a season profile, else 409). Messages are typed
in `src/online/protocol.ts`:

- presence: `welcome`, `join`, `leave`, `presence` (players carry `busy` while
  in a duel), `who`, `ping` / `pong`.
- lobby: `challenge {to}` → `challenge_sent` / `challenged {id, from}`;
  `challenge_reply {id, accept}`; `challenge_cancel {id}`;
  `challenge_closed {id, reason}` (declined, cancelled, expired after 30 s,
  unavailable).
- `duel_start {duel, side, setup, heroes, names, turnTicks, delayTurns,
  hashEvery, deployMs}`: both players' field armies from D1, seed from the
  server; friendly (no stakes) in this phase.
- deployment (timed, `deployMs` = 15 s, no pause in any online battle):
  `d_order {order}` (only `form`, `preset`, `order`, `shieldwall`, `loose`,
  `assign`: each touches only its own side) is echoed to the sender alone
  with a sequence number; the opponent's deployment stays secret. `d_ready`
  is echoed to both (the client shows "ready"); `d_ready` from both → each
  player gets the other side's deployment orders as `d_order`, then `go`, then
  sealed turns 0 and 1. Clients send `d_ready` themselves when their
  countdown ends; the server starts the duel anyway 3 s after the deployment
  time (`DuelHub.tick`, run by the RegionDO's alarm and on every message).
  Deployment orders all come before `go`, so the replay check sees them
  before the start. Open challenges and deployments are kept in the DO's
  storage (`hub:*` keys) until `go`: a hibernating DO is evicted after ~10 s
  without messages, which a quiet 15 s deployment easily is.
- battle (**lockstep**): turns of 2 ticks. `cmd {order}` queues an order for
  the next sealed turn; clients send `reach {n, hash?}` as they start turn n;
  once both reached n the server seals turn n+2 and sends `turn {n, tick,
  orders}` (both players' orders in arrival order, applied at tick n·2). Input
  delay ≈ 200–300 ms; a client never simulates an unsealed turn. Every 10th
  `reach` carries `Battle.hash()`; differing hashes → `desync`, the duel ends.
- `end {winner, ticks, hash}` → the DO replays the log with `src/sim`, sends
  `duel_result {winner, ticks, hash, verified, mismatches}` to both and writes
  battle_log. A player leaving → `duel_abort`.
- **live armies** (server → client only; `server/src/online/live.ts`, shared
  helpers in `src/online/liveArmies.ts`): when an army sets out (`POST
  /march`), halts (`/march/stop`) or moves into a conquered hex (attack
  submit), the Worker asks the shard who is online (`livePlayers()` RPC),
  works out each one's vision exactly like `/map` (their and their clan's
  land and armies, `ONLINE_RULES.sight`) and hands the cut messages to the DO
  (`liveMove()` RPC), which delivers them:
  - `army_march {player, name, clan, path, at, until, now}`: only the path
    hexes the receiver can see, with the time the army enters (`at`) and
    leaves (`until`, null for the last hex) each one. A gap means the army is
    out of sight in between; nothing outside the fog ever leaves the server.
    The receiver's own and clan mates' armies come whole.
  - `army_pos {player, name, clan, q, r, now}`: it stands on a hex the
    receiver sees (halt, capture).
  - `army_arrive {player, q, r, now}`: pushed by a DO alarm at the arrival
    time to those who see the last hex (arrivals are kept in DO storage).
  - `army_hide {player, now}`: a halt or a new march the receiver can no
    longer see replaces a march they were shown.

  Pushing never fails the action that moved the army. Clients interpolate
  between `at` and `until` (`LiveArmies` in `src/online/liveArmies.ts`).

Duel and challenge state is kept in DO memory (a live duel keeps the object
awake); hex locks are in DO storage.

## Economy

Rules: docs/DESIGN_V2.md "Monetization and economy" and "Trading". All
prices are data: Stars packs in `src/products.ts`, cosmetics, pass tiers and
market limits in `src/economy/catalog.ts`, consumables in the shared
`src/data/consumables.ts` (root).

**Drachmae** (`wallets`, `drachmae_ledger`): account-wide, survive seasons.
Every movement is a ledger row unique per `(player, kind, ref)` (`pack`,
`refund`, `spend`, `pass`, `market_buy`, `market_sale`), written in the same
batch as the balance change and guarded by the operation's own key row, so
retries never double-apply. Spending needs `balance >= price`; only a refund
can make it negative, which blocks spending until topped up. Things already
bought with Drachmae are kept after a pack refund.

**Purchases** are server-side debits, never Telegram invoices: `POST
/api/economy/buy {requestId, item, currency?, qty?}`. `requestId` (8–64 of
`[A-Za-z0-9_-]`; the client makes a fresh one per purchase and reuses it on
retry) is the primary key of `shop_orders`; the order row, the debit and the
goods go in one batch and only apply if the order row was inserted by it
(conditions in its `WHERE`: funds, not owned, daily cap). A retry answers the
stored order with `replayed: true`; the same id for another item is 409
`request_reused`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/economy/catalog` | public: `packs`, `cosmetics` (+`slots`), `consumables`, `pass` (price, XP rules, tiers), `market` (fee, hours, cap, price bounds) |
| GET | `/api/economy/wallet` | `{ drachmae, canSpend, ledger (last 50), cosmetics (owned ids), loadout {slot: id} }` |
| POST | `/api/economy/buy` | `{requestId, item, currency = 'drachmae', qty = 1}` → `{ order, replayed, drachmae }`. Items: a cosmetic id, `season_pass`, a consumable id (gold or Drachmae, needs a season profile). 409 `insufficient_funds` / `already_owned` / `daily_cap` / `no_profile` / `request_reused`; 404 `unknown_item` |
| POST | `/api/economy/cosmetics/equip` | `{slot, id or null}` → `{ loadout }`; 403 `not_owned` |
| GET | `/api/economy/pass` | `{ season, xp, tier, premium, premiumDrachmae, xpPerTier, claimed: [{tier, track}], tiers }` |
| POST | `/api/economy/pass/claim` | `{tier, track: free or premium}` → `{ reward, replayed }`; 409 `locked` (tier not reached / premium not unlocked), `no_profile` (gold and consumable rewards go to the season profile) |
| GET | `/api/online/consumables` | `{ inventory: {id: qty}, day, caps: {id: {cap, bought}} }` (also `consumables` in `GET /api/online/profile`) |
| POST | `/api/online/consumables/use` | `{id}`: `healing_salve` (every wound 1 h shorter), `march_rations` (rest of the march ×0.75); battle ones → 400 |
| GET | `/api/online/market` | open listings of your shard; query `kind, ref, rarity, currency, minPrice, maxPrice, townQ+townR, sort (price_asc, price_desc, newest, ending), cursor, limit ≤ 50` → `{ listings, next }` (`next` = cursor of the next page, or null) |
| GET | `/api/online/market/mine` | your listings this season (resolves expired ones first) `{ listings, open, maxOpen }` |
| GET | `/api/online/market/towns` | towns where you can list now |
| POST | `/api/online/market/list` | `{town: {q,r}, kind: item/resource/consumable, ref (item uid, food/wood/bronze, or consumable id), qty, currency: gold/drachmae, price}` → `{ listing }`; 403 `town_unreachable`, 400 `price_out_of_bounds`, 409 `listing_cap` / `cannot_afford` / `none_left` |
| POST | `/api/online/market/buy` | `{listingId}` → `{ listing, paid, fee, sellerGets }`; 403 `self_buy`, 409 `insufficient_funds` / `sold` / `gone`, 410 `expired` |
| POST | `/api/online/market/cancel` | `{listingId}` (seller) → goods back |

**Consumables** (`src/data/consumables.ts`): healing salve, morale wine, war
horn, sharpening stone, march rations. Bought with season gold or Drachmae;
the daily cap counts shop purchases per player per UTC day (server time),
gold and Drachmae together (pass rewards and marketplace buys do not count).
They are held per season (`online_consumables`) and vanish with it.

- **At most one consumable per battle**, PvP attacks and duels alike (also
  against neutrals): `POST /api/online/attack/start {q, r, consumable?}`
  (`consumables: [..]` naming more than one → 400 `one_consumable`; a
  non-battle one → 400 `bad_consumable`; none held → 409 `none_left`). It is
  spent in the ticket's batch (gone even if the attack is abandoned or
  rejected); resuming an open ticket spends nothing. Duels: `challenge {to,
  consumable?}` and `challenge_reply {id, accept, consumable?}`; both are
  spent when the duel starts (all or nothing; `error {code:
  'bad_consumable'}` for anything but one battle consumable id).
- The effect is baked into the server-built setup (unit stats: sharpening
  stone ×1.1 melee and ranged damage, morale wine +10 morale, war horn grants
  Rally Cry to the side's highest-level hero), and `setup.consumables =
  [side0, side1]` records the ids, so both clients and the server replay
  simulate the same battle. TODO(sim): a true one-shot, army-wide war-horn
  rally needs a sim feature; until then the horn uses the Rally Cry ability.

**Season pass** (`pass_progress`, `pass_claims`, per online season): 30 tiers,
100 XP each. XP is written by verified server events inside their own guarded
batches: an attack 10 (+15 won, +25 captured), a verified duel 10 (+10 to the
winner). Free track: gold every tier, a battle consumable every 5th. Premium
track (500 Dr per season, bought via `/api/economy/buy` item `season_pass`):
consumables, 15 Dr every 3rd tier, cosmetics at 10/20/30. A claim inserts its
`pass_claims` row (only if the tier is reached and, for premium, unlocked) and
the reward in one batch; claiming again grants nothing.

**Town marketplace** (`market_listings`, `market_audit`):

- Listing: in a town hex (type town, or a capital) you or your clan hold, or
  where your army stands on or next to. Goods go into escrow in the listing
  batch (stash item removed, resource or consumables subtracted). Prices in
  gold or Drachmae; total price bounds per rarity and currency
  (`MARKET.priceBounds`, five tiers; legacy fine / heroic map to uncommon / epic; resources and consumables count as common). At most
  20 open listings per player; rate limits of 20 lists, 30 buys, 30 cancels
  and 60 searches a minute per player (per isolate).
- Buying (any player of the same season and shard): one batch flips the
  listing `open → sold` (only if still open, unexpired, not your own and you
  can pay), debits the buyer, credits the seller the price minus the **10%
  fee (rounded up), which is burned**, moves the goods and writes the audit
  row. Two concurrent buyers: exactly one wins, the other gets 409 `sold`.
- Cancel returns the goods. Listings expire after 48 h (never later than the
  season end); expiry is lazy: an expired listing cannot be bought and its
  goods return to the seller the next time they list, open
  `/api/online/market/mine` or load their profile.
- **Season end:** listings are season-scoped and are left behind with the
  season like everything else. Unsold goods vanish with the season (there is
  nothing to return them to); gold dies with the season; Drachmae already
  paid to sellers stay theirs (account-wide). There is no listing fee, so
  nothing is refunded.
- Every list, buy, cancel and expiry is in `market_audit` (actor, price, fee).

## Duels

Design: [docs/DUELS.md](../docs/DUELS.md). Code: `server/src/duel/` (routes,
store), shared rules in `src/duel/` (`rules.ts` costs, budget, shop;
`ladder.ts` floors and payouts), migration `0007_duels.sql`.

The duel army is a second roster per account: persistent (no `season_id`,
never reset), separate from the war-map army, with its own stash and the
duel-only currency **Glory**. Every write follows the online convention: the
first statement of a D1 batch bumps `duel_profiles.rev`, the rest is guarded
by it. Glory spends and gains (`recruit`, `shop/buy`, `shop/sell`, `respec`)
carry a client `requestId` (8–64 chars `[A-Za-z0-9_-]`) recorded in
`duel_orders`: a retry answers with the stored result (`replayed: true`); the
same id for something else is **409** `request_reused`. Every answer that
changes the army includes the new `profile`.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/duel/profile` | – | opens the mode (idempotent): starter roster of 6 (2 hoplites, 2 archers, a peltast, a slinger), all in the team, 200 Glory |
| GET | `/api/duel/profile` | – | `{ now, day, glory, xp, level, ladder: {cleared, farmLeft, farmCap}, team, formations, heroes, stash, battles, wins, bought }`; **409** `no_duel_profile` before the first POST |
| POST | `/api/duel/recruit` | `{ cls, requestId }` | a level-1 hero of an unlocked class for its recruitment price in Glory (`locked`, `not_recruitable`, `roster_full` at 30, `cannot_afford`) |
| POST | `/api/duel/dismiss` | `{ heroId }` | the hero leaves (gear to the stash, no refund); the last hero stays |
| POST | `/api/duel/equip` | `{ heroId, slot, itemUid \| null }` | stash ⇄ hero; two-handed weapons and shields exclude each other |
| POST | `/api/duel/develop` | `{ heroId, attrs?: {str,agi,end,wil}, perks?: [] }` | spends attribute points and takes perks, checked against points, `ATTR_MAX` and the class tree (`no_points`, `attr_max`, `bad_perk`) |
| POST | `/api/duel/respec` | `{ heroId, requestId }` | 20 Glory × level: recruit attributes back, all points back, no perks |
| POST | `/api/duel/team` | `{ heroIds?, formations?, groups? }` | the team (≤ 10, any order), formations and battle groups; the budget is checked when a battle starts |
| POST | `/api/duel/shop/buy` | `{ offer, requestId }` | a catalogue offer (`<item>:<common\|uncommon\|rare>`) or one of today's (`day<N>:<item>:<rarity>`, once per player and UTC day: `sold_out`) |
| POST | `/api/duel/shop/sell` | `{ uid, requestId }` | a stash item back for a quarter of its shop price |
| POST | `/api/duel/ladder/start` | `{ floor }` | the next floor or any cleared one (`floor_locked`); the team must fit the floor's budget (`no_team`, `team_too_big`, `over_budget`). An open ticket of the same floor is resumed (same seed); one of another floor is abandoned. → `{ ticket, floor, boss, expiresAt, setup, team, enemies }` |
| POST | `/api/duel/ladder/submit` | `{ ticket, orders, deployOrders, claim }` | replayed like an attack (`replay_mismatch`, `sim_rejected`, `ticket_expired` after 10 min); pays hero XP always, and on a win Glory (first clear, or farm Glory under the 300-a-day cap), account XP and maybe an item. Only progression is written to the heroes (gear changed meanwhile stays). A repeat of the same claim returns the stored result. |
| POST | `/api/duel/ladder/abandon` | `{ ticket }` | gives an open ticket up (nothing is lost) |

No deaths, wounds or wear in duels. Analytics: `duel_join` once per player,
`battle_result` / `first_battle` with mode `ladder`.

## Bot notifications

Code: `src/notify/` (delivery), `src/bot/` (commands), shared deep links in
`../src/online/deeplink.ts`. Tests: `test/notify.test.ts`.

| Type (opt-out) | Events | Trigger | Button opens |
| --- | --- | --- | --- |
| `attack` | under attack / captured / garrison held | `attack/start` (garrison or militia defends), `attack/submit` (to the previous owner) | `hex_<q>_<r>` |
| `march` | march arrived | the shard object's alarm at the arrival time (marches of 5 min or more; a halt or capture cancels it) | `hex_<q>_<r>` |
| `income` | treasury full (24 h cap) | cron, hourly: the oldest uncollected hex reached `incomeCapHours`; once per accrual clock | `income` |
| `duel` | challenged while offline | a `challenge` to a player of the shard without an open socket (the challenger still gets `unavailable`) | `duel` |
| `clan` | invite accepted (to the inviter), rank changed, kicked | `/clans/join`, `/clans/promote`, `/clans/kick` | `myclan` |
| `boss` | a boss you damaged was slain: your share and items | the killing `boss/submit` (everyone with a loot share but the killer) | `boss_<q>_<r>` |
| `season` | the season ends in 3 days / 1 day | cron, once per season and step (`bot_meta`) | `season` |
| `market` | listing sold | `/market/buy` (to the seller) | `market` |

**Flow.** Hooks never send: after the response is decided they hand events
to `notify()` through `ctx.waitUntil` (`later()`; the DO awaits it in its
alarm / `waitUntil`), so a slow or failing Telegram never delays or breaks a
game request. Events with a `shard` are dropped for players who have the war
table open in that shard right now. `notify()` writes `notify_outbox` rows,
unique per `(player, dedupe key)` (a ticket id, listing id, accrual clock...),
then tries to deliver the player's pending rows:

1. **opt-outs** per type (`notify_settings.disabled`) → `skipped`;
2. **blocked bot**: a 403 (or 400 "chat not found" / "bot can't initiate
   conversation", i.e. the player never started the bot) sets `blocked_at`
   and skips everything pending; nothing is sent until the player messages
   the bot (`/start`) again;
3. **stale** events (per-type TTL, 1–24 h) → `skipped`;
4. **quiet hours** 23:00–08:00 local, only when the Mini App reported the
   device's UTC offset (after sign-in; Telegram does not tell bots a time
   zone) and the player left them on → wait;
5. **rate limit**: at most `NOTIFY_RULES.maxPerHour` = 4 messages per player
   per rolling hour (`notify_log`) → wait;
6. **coalescing**: after a message of a type, newer events of that type wait
   for the type's window (attacks and duels 15 min, market 20 min, clan
   10 min, march 5 min), then go out as **one** message: "3 attacks on your
   land in the last hour. Hexes lost: 1, attacks held: 1", "2 of your
   listings sold: +81 gold, +18 Drachmae", ...

Rows are claimed (`pending → sending`) before the send, so two concurrent
flushes never double-send; a 429, 5xx or network error puts them back for
the next run. Messages are EN or RU by the player's Telegram `language_code`,
end with "Turn these off: /settings" and carry one inline **web_app** button
`https://pixelarrow.app/?startapp=<route>`; `BootScene` routes it
(`parseStartParam` / `sceneForRoute` in `src/online/deeplink.ts`): `hex_q_r`
and `boss_q_r` centre the war table on the hex and select it, `duel` opens the
lobby, `market` the marketplace, `myclan` the clan, `settings` the menu with
Settings → Notifications, `wallet` the shop's wallet; `clan_<code>` is still
a clan invite.

**Cron** (`wrangler.jsonc` `triggers.crons`, every 5 minutes,
`src/notify/jobs.ts`): registers the command menu once per `COMMANDS_VERSION`
(and adds `callback_query` to the webhook's allowed updates if a restricted
list lacks it), enqueues the season notices and (hourly) the treasury
notices, delivers whatever waited and deletes outbox rows older than 3 days
and logs older than 2 days.

**Settings.** `GET /api/notify/settings` → `{ types: [{type, on}], quiet,
tzOffset, blocked }`; `PUT` with `{ on?: {type: bool}, quiet?: bool,
tzOffset?: minutes east of UTC }`. In the game: Settings → Notifications; in
the bot: `/settings` (a button per type, toggled with `callback_query`
`ns:<type>` / `ns:quiet`, plus "Open in the game"). No row means everything
on.

**Cost.** Sending is plain `fetch` to the Bot API inside `waitUntil`
(no extra Worker invocations). The cron is 288 runs a day, each a handful of
D1 queries; the hooks add 1–3 D1 writes per event. That stays far inside the
free plan (100k requests and 100k D1 writes / 5M reads a day). Cloudflare
Queues would need the paid Workers plan ($5/month) and buy nothing here: the
outbox plus the cron already give retries and batching. Telegram allows about
30 messages a second per bot; a cron run flushes at most 200 players.

## Payment support and legal pages

Bot commands (registered with `setMyCommands` in English and Russian by the
cron, or by hand: `TELEGRAM_BOT_TOKEN=... [TELEGRAM_WEBHOOK_SECRET=...] node
server/scripts/bot-setup.mjs`, which also sets the webhook with
`allowed_updates: message, pre_checkout_query, callback_query`):

- `/paysupport` explains how help works and waits 30 min for a description
  (or takes it inline: `/paysupport <text>`). The text (≤ 2000 chars) goes to
  **`support_requests`** (`kind = 'payment'`, Telegram id and username,
  player id, language, the player's last 5 Stars purchases as JSON, `status
  = 'open'`); the user gets "request #N logged". At most 5 requests per user
  per day.
- `/delete_my_data` logs `kind = 'deletion'` the same way and acknowledges.
  Deletion itself is done by the operator (admin panel or SQL).
- `/terms` links the terms, privacy and refund pages (Russian ones for
  Russian-speaking users).
- `/settings`: notification switches (above).

Open requests: `npx wrangler d1 execute pixelarrow --remote --config
../wrangler.jsonc --command "SELECT id, kind, telegram_id, username, text,
purchases, created_at FROM support_requests WHERE status = 'open' ORDER BY
id"`; mark one done with `UPDATE support_requests SET status = 'closed',
resolved_at = <ms>, note = '...' WHERE id = N`. Refund a Stars payment with
the Bot API's `refundStarPayment(user_id, telegram_payment_charge_id)`: the
`refunded_payment` update then revokes the Drachmae through the webhook.

**Legal pages** are static files in the root `public/` (copied into `dist/`
by vite, served by the Worker's assets): `/terms`, `/privacy`, `/refunds` and
`/ru/terms`, `/ru/privacy`, `/ru/refunds`, styled by `/legal.css`. They are
linked from Settings → About, the shop's wallet tab and `/terms`.

> **Operator: review these texts and fill in the placeholders**
> (`[OPERATOR NAME]`, `[OPERATOR ADDRESS / COUNTRY]`, `[CONTACT EMAIL]`,
> `[EFFECTIVE DATE]`, `[JURISDICTION]`, retention periods and `[N]` days)
> before launch. They describe what the game actually collects and does, but
> they are not legal advice. `grep -rn '\[[A-Z]' public/` lists what is left.

## Local development

```bash
npm ci && npm run build            # at the repo root: builds dist/ (needed by wrangler and the tests)
cd server && npm ci
cp .dev.vars.example ../.dev.vars  # wrangler reads .dev.vars next to wrangler.jsonc (gitignored)
npm run migrate:local              # create the local D1 tables
npm run dev                        # http://localhost:8787 — game + API
npm test                           # vitest in workerd: D1, DO, mocked Telegram
npm run typecheck
npm run dry-run                    # wrangler deploy --dry-run
```

`npm run dev` serves the built `dist/` too; for game hot reload keep using the
root `npm run dev` (vite) and point API calls at :8787 if needed.

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
4. **Worker secrets** (once; they persist across deploys):
   ```bash
   cd server
   npx wrangler secret put TELEGRAM_BOT_TOKEN --config ../wrangler.jsonc       # from @BotFather
   openssl rand -hex 32 | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --config ../wrangler.jsonc
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET --config ../wrangler.jsonc
   ```
   Keep the webhook secret value handy for step 5 (or set it from a variable).
   For the admin panel also set `ADMIN_TOKEN` (docs/OPS.md "Operator setup").
   Check with `curl https://pixelarrow.app/api/health`.
5. **Register the webhook** (also enables payment updates):
   ```bash
   curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H 'content-type: application/json' \
     -d "{\"url\":\"https://pixelarrow.app/api/telegram/webhook\",
          \"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",
          \"allowed_updates\":[\"message\",\"pre_checkout_query\",\"callback_query\"],
          \"drop_pending_updates\":true}"
   curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```
6. In @BotFather point the Mini App / menu button URL at `https://pixelarrow.app`.
   Stars payments need no provider setup.
7. Clan invite links are `https://t.me/<bot>/<app>?startapp=clan_<code>`. The
   bot username comes from `getMe` (or set the var `TELEGRAM_BOT_USERNAME`);
   the Mini App short name defaults to `play` (var `TELEGRAM_APP_NAME` if yours
   differs). The online tables (`0002_online.sql`) are created by the CI
   migration step once `D1_DATABASE_ID` is set.

## Client integration

Steps 1–4 are implemented in the game (`src/platform/api.ts`, `online.ts`,
`saveSync.ts`, `verify.ts`; see docs/DESIGN.md "Online client"); the online
mode (`src/online/`, `src/scenes/online/`) uses `/api/online/*` and
`/ws/online`.

The economy screens (`src/scenes/ShopScene.ts`: shop, season pass, wallet;
`src/scenes/MarketScene.ts`: the town marketplace; the battle consumable
picker `src/ui/econ/consumablePicker.ts`) go through `src/ui/econ/source.ts`,
which uses the typed methods in
`src/platform/api.ts`: `economyCatalog`, `wallet`, `buy` (makes a request id;
pass the same one when retrying), `equipCosmetic`, `seasonPass`, `claimPass`,
`consumables`, `useConsumable`, `marketSearch`, `marketMine`, `marketTowns`,
`marketList`, `marketBuy`, `marketCancel`. Drachmae packs still go through
`invoice(productId)` + `openInvoice`, then poll `wallet()`.

1. **Boot:** if `Telegram.WebApp.initData` is non-empty,
   `POST /api/auth/telegram { initData }` → keep `token` in memory (re-auth on
   401; initData is accepted for 24 h after launch).
2. **Save sync:** on load `GET /api/save`; prefer the server copy when its
   `revision` is newer than the locally remembered one. On save
   `PUT /api/save { revision, data }`; on 409 fetch, pick/merge (e.g. the save
   with more battles fought) and retry with the new revision. Keep
   CloudStorage/localStorage as the offline fallback.
3. **Shop:** `POST /api/shop/invoice { productId }` →
   `Telegram.WebApp.openInvoice(link, status => { if (status === 'paid') refresh() })`,
   then `GET /api/entitlements` (the grant arrives via the webhook, so poll
   briefly after `paid`).
4. **Battle verify (optional now):** send `{ setup, orders: battle.orderLog,
   deployOrders, claim: { winner, ticks, hash: battle.hash() } }` after a battle;
   record `deployOrders = battle.orderLog.length` right before `startBattle()`.
5. **Presence:** `new WebSocket('wss://pixelarrow.app/ws/region/<id>', ['pixelarrow.v1', token])`.
