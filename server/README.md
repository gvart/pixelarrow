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
    economy/          routes.ts (/api/economy: catalog, wallet, buy, cosmetics, season pass),
                      catalog.ts (cosmetics, pass tiers, market limits: all prices), wallet.ts (Drachmae
                      ledger helpers), pass.ts (pass XP)
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
  scripts/deploy-config.mjs  CI: wrangler.jsonc -> wrangler.deploy.json (fills/drops D1 id)
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
| GET (WS) | `/ws/region/:id` | token | presence WebSocket (see below) |
| … | `/api/online/*` | ✓ | online mode, see "Online mode" |
| GET (WS) | `/ws/online` | token | the player's shard: presence, duel lobby, lockstep relay |

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
  (https://pixelarrow.app).
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
respawns are all computed on read from server time. No alarms or polling.

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
   Check with `curl https://pixelarrow.app/api/health`.
5. **Register the webhook** (also enables payment updates):
   ```bash
   curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H 'content-type: application/json' \
     -d "{\"url\":\"https://pixelarrow.app/api/telegram/webhook\",
          \"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",
          \"allowed_updates\":[\"message\",\"pre_checkout_query\"],
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
