# Pixelarrow backend

One Cloudflare Worker, `pixelarrow`, serves **both** the static game (the root
`dist/` build, on https://play.pixelarrow.app) **and** this API. `wrangler.jsonc`
(repo root) sets `assets.run_worker_first: ["/api/*", "/ws/*"]`, so only those
paths run Worker code; everything else is plain static hosting with the SPA
fallback. The landing page on https://pixelarrow.app (and www) is a separate
Worker, `pixelarrow-landing` (`landing/wrangler.jsonc`, ADR-0007): static
pages and the legal pages, plus a cached proxy that reaches this Worker's
`PublicApi` entrypoint through a service binding. It has no D1, no Durable
Objects and no secrets.

- **Routing:** [Hono](https://hono.dev). **Validation:** zod. **Storage:** D1
  (`DB`, database `pixelarrow`). **Realtime:** SQLite-backed Durable Objects
  on the WebSocket Hibernation API: `WarWorldDO` and `WarRegionDO` (the war,
  server/src/war/), `MatchmakerDO` and `DuelDO` (duels).
- **Shared code:** the Worker imports the game's deterministic sim
  (`../src/sim`) and shared rules (`../src/online`, `../src/duel`,
  `../src/data`) read-only; wrangler/esbuild bundles them.

## Layout

```
server/
  src/
    index.ts          Worker entry: Hono app, CORS (play, web.telegram.org, DEV_ORIGINS), frame-ancestors, error handler, /ws upgrades; exports MatchmakerDO, DuelDO, WarRegionDO, WarWorldDO
    env.ts            bindings / secrets types
    urls.ts           GAME_URL (play) and LANDING_URL (apex, legal links) with their defaults; dev origins
    routes/auth.ts    POST /api/auth/telegram
    routes/save.ts    GET/PUT /api/save
    routes/shop.ts    GET /api/shop/products, POST /api/shop/invoice, GET /api/entitlements
    routes/webhook.ts POST /api/telegram/webhook
    battle.ts         sim adapter for POST /api/battle/verify (the only file that knows the sim API)
    online/           online season: routes.ts (profile, recruit, equip, salvage, army), clans.ts,
                      relay.ts (the lockstep relay of one duel match), store.ts (seasons, profiles, D1 access),
                      context.ts, consumables.ts (season inventory, use)
    notify/           bot notifications: outbox.ts (enqueue, delivery rules, flush), templates.ts (EN/RU
                      texts, coalescing, deep links), jobs.ts (cron: season notices, bot setup),
                      routes.ts (/api/notify/settings)
    bot/              commands.ts (command menu EN/RU), handlers.ts (/settings, /paysupport, /terms,
                      /delete_my_data, settings buttons)
    economy/          routes.ts (/api/economy: catalog, wallet, buy, cosmetics, season pass),
                      catalog.ts (cosmetics, pass tiers, market limits: all prices), wallet.ts (Drachmae
                      ledger helpers), pass.ts (pass XP)
    duel/             routes.ts (/api/duel: duel profile, roster, develop, team, shop, ladder tickets, ranked card,
                      match reports), store.ts (D1 access), live.ts (queue checks, match armies, settlement),
                      matchmaker.ts (MatchmakerDO: the global queue), duelDO.ts (DuelDO: one live match),
                      async.ts (raids, seasons, boards routes), season.ts (rollover, leaderboards),
                      verify.ts (the replay check shared by the ladder and raids)
    telegramAuth.ts   initData validation (HMAC-SHA256, constant-time, 24 h max age)
    auth/             sessions.ts (pa2 server-side sessions, 30 s cache, prune), identity.ts (telegram
                      identity + players.telegram_id mirror), cookies.ts (__Host-pa_sid), origin.ts (CSRF)
    names/            generate.ts (generated display names and their uniqueness key)
    payments.ts       pre-checkout checks, idempotent payment/refund recording
    products.ts       shop catalogue (Stars prices) and invoice payload format
    middleware.ts     requireSession, requirePlayable, db()/secret() -> 503 when not configured
    crypto.ts, body.ts, errors.ts, players.ts, rateLimit.ts, telegramApi.ts
  migrations/                D1 schema, applied in order by CI: 0001 players, saves, purchases,
                             entitlements; 0002 online mode; 0003 economy; 0004 beasts and world
                             bosses; 0005 notifications and support; 0006 ops (docs/OPS.md);
                             0007-0010 and 0014 duels; 0009 merchants; 0011 camps; 0012 the switch
                             to region maps; 0013 the muster reserve flag; 0017 accounts and
                             sessions (ADR-0008); 0021-0026 the war; 0027 drops the old war's tables
  scripts/deploy-config.mjs  CI: wrangler.jsonc -> wrangler.deploy.json (fills/drops D1 id)
  scripts/bot-setup.mjs      one-off: setMyCommands (EN/RU) and setWebhook with the allowed updates
  test/                      vitest in workerd (@cloudflare/vitest-pool-workers)
```

The server has its own `package.json`/lockfile (vitest 4 for the Workers pool;
the game uses vitest 5).

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
| … | `/api/online/*` | ✓ | the online season, see "Online season" |
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
in the future) is rejected. The telegram identity (`auth_identities`) and its
`players.telegram_id` mirror are written in one batch; a new player gets a
generated display name, never the Telegram name.

Sessions (ADR-0008 §3) live in D1: a token is `pa2_` + 32 random bytes and only
its SHA-256 is stored. Telegram gets a 24 h bearer token; the web gets the
`__Host-pa_sid` cookie (30 days, 7 days idle). One transport per request (both
is 400), a token is never read from the URL (`?token=` is 400), and a cookie
request that changes state must carry the game's `Origin`. Sockets use the
cookie or `Sec-WebSocket-Protocol: pixelarrow.v1, <token>`. `POST
/api/auth/logout`, `/logout-all`, `GET /api/auth/sessions` and `DELETE
/api/auth/sessions/:handle` end and list sessions; the daily cron prunes them.

**Rate limit:** 20 logins per minute per IP, kept in isolate memory, so it is a
per-isolate soft guard, not a global quota. Move to the Workers Rate Limiting
binding or a DO if abuse shows up.

**Dev login:** with `DEV_AUTH=1` (only in the local `.dev.vars`; never set it in
production) `POST /api/auth/telegram` also accepts
`{ "dev": { "id": 1, "first_name": "Dev" } }`.

### Saves

The offline campaign save is stored as an opaque, versioned JSON blob per
player with an optimistic-concurrency `revision`. It is client-trusted (it
only affects the player's own campaign); everything in the online war and
duels is server-owned and changes only through verified endpoints.

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

### Sim version

Contract: `design/adr/ADR-0001-determinism-replay.md`. Every battle call
takes `simVersion` (`src/sim/version.ts` `SIM_VERSION`): `/api/battle/verify`,
and the start and submit calls of attacks, boss raids, ladder floors and async
raids. Sockets (`/ws/*`) take `?sim=`.

- The server runs one sim and takes exactly `SIM_VERSION`
  (`server/src/simVersion.ts`). Anything else, or nothing, gets **426
  `sim_version_unsupported`** (`{simVersion, expected}`), and the client asks
  the player to reload. A socket gets an `error` frame with that code and is
  closed with code 4426. A refused submission leaves its ticket open.
- Tickets (`battle_tickets`, `duel_tickets`, `duel_attacks`) and `duel_matches`
  record the `sim_version` they were played under (migration 0016).
- There is no older sim and no grace window (V5-074): a version bump voids
  battles in flight.

### Telegram bot webhook & Stars payments

`POST /api/telegram/webhook` requires `X-Telegram-Bot-Api-Secret-Token ==
TELEGRAM_WEBHOOK_SECRET` (constant-time compare), otherwise 401.

- `/start` → replies with an inline **web_app** button opening `GAME_URL`
  (https://play.pixelarrow.app); it also re-enables notifications for a player
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

## Online season

The war itself (regions, alliances, transfers, live fights) is `server/src/war/`
(docs/WAR.md, docs/impl/global-war-rebuild.md); the old shard / route-graph war
(map, marches, attacks, camps, world bosses, marketplace, merchants) is gone
(W-01). What stays is the season profile that the economy, the pass and the war
world share: `online_seasons` (90 days; the first request after the end starts
the next one), `online_profiles` (purse, energy), `online_heroes`,
`online_items`, `online_consumables`, and clans (`clans`, `clan_members`,
`clan_invites`; a clan serves the war alliance of its first member).

**Everything economic is server-owned.** Each operation is one D1 batch: the
first statement bumps the profile's `rev` from the value read and every other
statement is guarded by `EXISTS (… rev = new)`, so concurrent requests can
never half-apply or double-spend (409 `conflict` → retry).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/online/status` | `{ season, joined }` |
| POST | `/api/online/profile` | join the season (idempotent): 5 heroes, purse → profile |
| GET | `/api/online/profile` | resources, energy, formations, heroes (wounds, busy, reserve), stash, consumables, clan |
| GET | `/api/online/season` | season dates and your titles from past seasons |
| POST | `/api/online/recruit` | `{archetype}`: 40 gold, 10 food, 1 recruit |
| POST | `/api/online/equip` | `{heroId, slot, itemUid \| null}`: stash ↔ hero |
| POST | `/api/online/salvage` | `{uid}`: a bound stash item for a quarter of its worth in gold; 409 `not_bound` |
| POST | `/api/online/army` | `{groups?: {heroId: 0..3}, formations?: FormationType[4], reserve?}` |
| POST | `/api/online/clans` | `{name, tag}`: create (you lead it) |
| GET | `/api/online/clans/mine` | clan, members with roles |
| POST | `/api/online/clans/invite` | leader/officer → `{code, link}`, link `https://t.me/<bot>/<app>?startapp=clan_<code>` |
| GET | `/api/online/clans/invite/:code` | invite preview |
| POST | `/api/online/clans/join` | `{code}` |
| POST | `/api/online/clans/kick`, `/promote`, `/leave` | `{playerId}`, `{playerId, role}`, – |

## Economy

Rules: docs/DESIGN_V2.md "Monetization and economy" and "Trading". All
prices are data: Stars packs in `src/products.ts`, cosmetics, pass tiers and
market limits in `server/src/economy/catalog.ts`, consumables in the shared
`src/data/consumables.ts` (root).

**Drachmae** (`wallets`, `drachmae_ledger`): account-wide, survive seasons.
Every movement is a ledger row unique per `(player, kind, ref)` (`pack`,
`refund`, `spend`, `pass`, `market_buy`, `market_sale`, `merchant` + request
id), written in the same
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
| POST | `/api/economy/buy` | `{requestId, item, currency = 'drachmae'}` → `{ order, replayed, drachmae }`. Items: a cosmetic id or `season_pass` (Drachmae). 409 `insufficient_funds` / `already_owned` / `request_reused`; 404 `unknown_item`; a consumable id → 410 `merchant_only` (consumables are sold by the map merchants) |
| POST | `/api/economy/cosmetics/equip` | `{slot, id or null}` → `{ loadout }`; 403 `not_owned` |
| GET | `/api/economy/pass` | `{ season, xp, tier, premium, premiumDrachmae, xpPerTier, claimed: [{tier, track}], tiers }` |
| POST | `/api/economy/pass/claim` | `{tier, track: free or premium}` → `{ reward, replayed }`; 409 `locked` (tier not reached / premium not unlocked), `no_profile` (gold and consumable rewards go to the season profile) |
| GET | `/api/online/consumables` | `{ inventory: {id: qty}, day, caps: {id: {cap, bought}} }` (also `consumables` in `GET /api/online/profile`) |
| POST | `/api/online/consumables/use` | `{id}`: `healing_salve` (every wound 1 h shorter); battle ones → 400 |
**Consumables** (`src/data/consumables.ts`): healing salve, morale wine, war
horn, sharpening stone, march rations. They come from pass rewards and are
held per season (`online_consumables`); they vanish with it.

- The effect is baked into the server-built setup (unit stats: sharpening
  stone ×1.1 melee and ranged damage, morale wine +10 morale), and `setup.consumables =
  [side0, side1]` records the ids, so both clients and the server replay
  simulate the same battle. The war horn becomes `ArmySpec.horn`: the `horn`
  order rallies the whole side once (routing men turn back); the bot sounds
  it when its army breaks.

**Season pass** (`pass_progress`, `pass_claims`, per online season): 30 tiers,
100 XP each. XP is written by verified server events inside their own guarded
batches: a verified duel 10 (+10 to the winner). Free track: gold every tier, a battle consumable every 5th. Premium
track (500 Dr per season, bought via `/api/economy/buy` item `season_pass`):
consumables, 15 Dr every 3rd tier, cosmetics at 10/20/30. A claim inserts its
`pass_claims` row (only if the tier is reached and, for premium, unlocked) and
the reward in one batch; claiming again grants nothing.

## Duels

Design: [docs/DUELS.md](../docs/DUELS.md). Code: `server/src/duel/` (routes,
store), shared rules in `src/duel/` (`rules.ts` costs, budget, shop;
`ladder.ts` floors, stars, chests and payouts), migrations `0007_duels.sql`
and `0014_duel_stars_presets.sql`.

The duel army is a second roster per account: persistent (no `season_id`,
never reset), separate from the war-map army, with its own stash and the
duel-only currency **Glory**. Every write follows the online convention: the
first statement of a D1 batch bumps `duel_profiles.rev`, the rest is guarded
by it. Glory spends and gains (`recruit`, `shop/buy`, `shop/sell`, `shop/salvage`, `respec`)
carry a client `requestId` (8–64 chars `[A-Za-z0-9_-]`) recorded in
`duel_orders`: a retry answers with the stored result (`replayed: true`); the
same id for something else is **409** `request_reused`. Every answer that
changes the army includes the new `profile`.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/duel/profile` | – | opens the mode (idempotent): starter roster of 6 (2 hoplites, 2 archers, a peltast, a slinger), all in the team, 200 Glory |
| GET | `/api/duel/profile` | – | `{ now, day, glory, xp, level, ladder: {cleared, farmLeft, farmCap, stars: number[50] (best per floor, 0 = not won), chests: [{chapter, tier}]}, team, formations, heroes, stash, battles, wins, bought, loadouts: [{slot, name, team, formations}] (1..5 presets sorted by slot, gaps after deletes), loadout, use: {ladder, arena, defence}, defence: {points, heroes, updatedAt} \| null }` (`team`/`formations`: the edited loadout's); **409** `no_duel_profile` before the first POST |
| POST | `/api/duel/recruit` | `{ cls, requestId }` | a level-1 hero of an unlocked class for its recruitment price in Glory (`locked`, `not_recruitable`, `roster_full` at 30, `cannot_afford`) |
| POST | `/api/duel/dismiss` | `{ heroId }` | the hero leaves (gear to the stash, no refund); the last hero stays |
| POST | `/api/duel/equip` | `{ heroId, slot, itemUid \| null }` | stash ⇄ hero; two-handed weapons and shields exclude each other |
| POST | `/api/duel/develop` | `{ heroId, attrs?: {str,agi,end,wil}, perks?: [] }` | spends attribute points and takes perks, checked against points, `ATTR_MAX` and the class tree (`no_points`, `attr_max`, `bad_perk`) |
| POST | `/api/duel/respec` | `{ heroId, requestId }` | 20 Glory × level: recruit attributes back, all points back, no perks |
| POST | `/api/duel/team` | `{ heroIds?, formations?, groups?, loadout? }` | a saved team (default: the edited one): heroes (≤ 10, any order), formations, and battle groups (per hero, shared by every loadout); the budget is checked when a battle starts |
| POST | `/api/duel/loadout` | `{ slot: 1..5, edit?, name?, use?: ('ladder' \| 'arena' \| 'defence')[] }` | picks the preset the Team tab edits, renames it (trimmed, ≤ 16; empty or null: "Team <slot>") and assigns where it fights; a slot never saved starts as a copy of the edited one; `defence` must fit the 150-point budget (`over_budget`, `too_many`, `no_team`) and snapshots it for the raid bot |
| POST | `/api/duel/loadout/create` | `{ from?: slot \| null, name?, edit? }` | a new preset in the lowest free slot (409 `presets_full` at 5): a copy of the edited one (`from` omitted), of `from` (duplicate; 404 `no_preset`) or empty (`null`); edited at once unless `edit: false` → `{ slot, profile }` |
| POST | `/api/duel/loadout/delete` | `{ slot }` | deletes a preset (404 `no_preset`; 409 `last_preset`); the edited preset and every use on it move to the first remaining one |
| POST | `/api/duel/shop/buy` | `{ offer, requestId }` | a catalogue offer (`<item>:<common\|uncommon\|rare>`) or one of today's (`day<N>:<item>:<rarity>`, once per player and UTC day: `sold_out`) |
| POST | `/api/duel/shop/sell` | `{ uid, requestId }` | a stash item back for a quarter of its shop price (409 `bound_item` for bound gear) |
| POST | `/api/duel/shop/salvage` | `{ uid, requestId }` | a bound stash item for the same quarter (409 `not_bound` for other gear) |
| POST | `/api/duel/ladder/start` | `{ floor }` | the next floor or any cleared one (`floor_locked`); the ladder loadout must fit the floor's budget (`no_team`, `team_too_big`, `over_budget`). An open ticket of the same floor is resumed (same seed); one of another floor is abandoned. → `{ ticket, floor, boss, expiresAt, setup, team, enemies }` |
| POST | `/api/duel/ladder/submit` | `{ ticket, orders, deployOrders, claim }` | replayed like an attack (`replay_mismatch`, `sim_rejected`, `ticket_expired` after 10 min); pays hero XP always, and on a win Glory (first clear, or farm Glory under the 300-a-day cap), account XP and maybe an item. Only progression is written to the heroes (gear changed meanwhile stays). A repeat of the same claim returns the stored result. The report also has `stars` (0..3 by the share of team points lost, `lost`), `prevStars`, `bestStars`, `newBest`; the best per floor only goes up. |
| POST | `/api/duel/ladder/abandon` | `{ ticket }` | gives an open ticket up (nothing is lost) |
| POST | `/api/duel/ladder/chest` | `{ chapter: 1..5, tier: 1..3 }` | claims a chapter chest once the chapter has 10 / 20 / 30 stars (409 `chest_locked`) → `{ chapter, tier, glory, item, replayed, profile }`; Glory by `chestReward`, tier 3 also a rare-or-better item in the stash. Idempotent: a claimed chest answers with what it paid (`replayed: true`) |

No deaths, wounds or wear in duels. Analytics: `duel_join` once per player,
`battle_result` / `first_battle` with mode `ladder`, `ranked` or `unranked`.

### Ranked duels (live ranked and unranked)

Design: docs/DUELS.md "Ranked live" and "Matchmaking and rating". Shared rules
`src/duel/rating.ts` (`RANKED`: Glicko-2, leagues, windows, payouts,
cooldown), protocol `src/duel/protocol.ts`, migration `0008_duel_ranked.sql`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/duel/ranked` | `{ now, level, unlockLevel, unlocked, league \| null, rating \| null (Legend only), games, wins, losses, draws, placements: {played, of}, cooldownUntil, match \| null }` (`match`: a live match to rejoin) |
| GET | `/api/duel/match/:id` | `{ report, profile }` of a settled match of yours; **409** `match_live` while it is fought |
| WS | `/ws/duel` | the global queue (`MatchmakerDO`, one object `global`); needs a duel profile (else 409) |
| WS | `/ws/duel/:match` | one match (`DuelDO`, named by the match id); only its two players (else 403) |

**Queue** (`/ws/duel`): on connect `mm_welcome {now, match, cooldownUntil}`.
`queue {mode: 'ranked' | 'unranked'}` → `queued {mode, since}` or `unqueued
{reason}` (`locked` below duel level 5 for ranked, `no_team`, `over_budget`
(150 points), `too_many`, `cooldown`, `busy`: already in a live match).
`cancel` → `unqueued {reason: 'cancelled'}`. The last socket closing leaves the
queue; the queue is in DO storage and re-paired by an alarm every 2 s
(`pairQueue`: the longest wait first, the closest rating inside both players'
windows). A pair → both armies built from D1 (the duel team, perfect gear, no
consumables), a `duel_matches` row (`live`), `DuelDO.init` (RPC), then
`match_found {match, mode, side, opponent: {name, league}}` to both.

**Match** (`/ws/duel/:match`): the friendly duel protocol of "Shard socket"
(duel_start with `mode`, d_order, d_ready, go, turn, reach, end, desync) on
the same relay (`server/src/online/relay.ts`): deployment 15 s (+5 s to
connect), 2-tick sealed turns, hashes every 10 turns, an `end` replayed with
`src/sim` (refused with `too_early` if the replay runs past the sealed
turns). Plus:
- `peer {side, online, until}`: the opponent's socket dropped (until when
  they may come back) or came back.
- Reconnect: a new socket within 30 s gets `duel_start {resume: true}`, then
  the deployment orders, `go` and every sealed turn (`relayResume`).
- `leave_duel`: a surrender (a loss, not an abandon).
- The alarm (deployment deadline, reconnect deadlines, a snapshot every 5 s)
  ends the match when a side has been gone 30 s, never joined, or stopped
  reporting turns for 30 s while the other waits (forfeit: an abandon), or
  both (void), or after 12 minutes (void).
- `match_result {report}`: the settled `MatchReport` per player (winner,
  end `battle | forfeit | void`, verified, Glory, account XP, hero XP, rating
  before/after, league before/after, placements). Re-sent to a socket opened
  after the end.

**Settlement** (`settleMatch`) runs once: the first statement moves
`duel_matches.status` from `live` (to `done` or `void`) with a fresh
`apply_nonce` and stores the order log, deltas and both reports; everything
else is guarded by that nonce: Glicko-2 for both (ranked, not void), Glory and
account XP (`duel_profiles`, rev + 1), hero progression, and an abandon in
`duel_queue_state` (3 in 24 h → a 15-minute cooldown, doubling on repeats,
at most 4 h). A repeat returns the stored reports. The relay state and log
live in the DuelDO's storage (log in chunks of 500) so it can hibernate.

### Raids, seasons and leaderboards

Design: docs/DUELS.md "Ranked async (defence ladder)" and "Matchmaking and
rating". Shared rules
`src/duel/season.ts` (`SEASON`, `ASYNC`), code `server/src/duel/async.ts`
(routes), `server/src/duel/season.ts` (rollover, boards),
`server/src/duel/verify.ts` (the replay check shared with the ladder),
migration `0010_duel_async_seasons.sql`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/duel/async` | the raid card: `{ unlocked, level, unlockLevel, league \| null, rating (Legend only), games, wins, losses, draws, defences, defenceWins, placements, attacks: {used, cap, left}, defence, candidates: [{pid, name, league, rating, points, heroes, classes}], open }` |
| POST | `/api/duel/async/start` | `{ defender }`: one of the offered candidates (`not_offered`), duel level 5 (`locked`), 10 a UTC day (`attack_cap`), not the same defender within 24 h (`attacked_recently`), the arena loadout within the budget. An open raid on the same defender is resumed (same seed), one on another is abandoned. → `{ ticket, defender, expiresAt, setup, team, enemies }` |
| POST | `/api/duel/async/submit` | `{ ticket, orders, deployOrders, claim }`: replayed like a ladder floor (`replay_mismatch`, `sim_rejected`, `ticket_expired` after 10 min) → `{ report: AsyncReport, profile }`; a repeat returns the stored report (`replayed`) |
| POST | `/api/duel/async/abandon` | `{ ticket }` |
| GET | `/api/duel/async/log` | the last 30 raids by or on the player: `{ entries: [{id, at, role: attack \| defence, pid, name, score, delta, glory}] }` |
| GET | `/api/duel/async/replay/:id` | a finished raid for any signed-in player (shareable): `{ names, setup, orders, deployOrders, winner, ticks, at }` |
| GET | `/api/duel/season` | `{ season: {id, start, end}, live/async: {league, peak}, title, rewards (not seen yet, or with a set piece still to pick: `pick`), table }` |
| POST | `/api/duel/season/seen` | the reward popup was shown |
| POST | `/api/duel/season/pick` | `{ season, ladder, def }`: the piece of a live Strategos / Legend reward's set (Sacred Band) into the duel stash, once (404 `no_pick`, 400 `not_in_set`; a repeat answers with the same item, `replayed`) |
| GET | `/api/duel/leaderboard?board=live\|async\|legend` | top 50 placed players of the running season and `me` (rank, league; the exact rating only in Legend) |

**Raid settlement** follows the ticket convention: the first statement moves
`duel_attacks.status` from `open` with a fresh `apply_nonce` and stores the
order log, both rating changes and Glory; the rest is guarded by the nonce:
the attacker's async rating (Glicko-2 after the idle-day RD growth), the
defender's at half rate (`defences` + 1, not a game), Glory and account XP
(rev + 1), hero progression, and the defender's defence Glory (5 a held
defence, at most 50 a day). Then a `duel_defence` notification (type `duel`).

**Season rollover** (`rollRatings`, no cron): on the first access in a new
UTC month (the season card, the ranked card, the raid card, the queue, a
settlement, a board) each rating row of an earlier season is reset (half way
to 1500 per season passed, RD ≥ 150, peak cleared) by an UPDATE guarded by
its old `season`, which sets a fresh `roll_nonce`; the reward row
(`duel_season_rewards`), its Glory and the league cosmetic
(`entitlements`, account-wide, not for sale) are guarded by that nonce, so
each season pays exactly once.

## Bot notifications

Code: `src/notify/` (delivery), `src/bot/` (commands), shared deep links in
`../src/online/deeplink.ts`. Tests: `test/notify.test.ts`.

| Type (opt-out) | Events | Trigger | Button opens |
| --- | --- | --- | --- |
| `duel` | a raid on your duel defence (held or broken) | `duel/async/submit` (to the defender) | `duel` |
| `clan` | invite accepted (to the inviter), rank changed, kicked | `/clans/join`, `/clans/promote`, `/clans/kick` | `myclan` |
| `season` | the season ends in 3 days / 1 day | cron, once per season and step (`bot_meta`) | `season` |

The old war's `attack`, `march`, `income`, `boss` and `market` types (and
their templates) have no producer since W-01.

**Flow.** Hooks never send: after the response is decided they hand events
to `notify()` through `ctx.waitUntil` (`later()`; the DO awaits it in its
alarm / `waitUntil`), so a slow or failing Telegram never delays or breaks a
game request. `notify()` writes `notify_outbox` rows,
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
   land in the last hour. Regions lost: 1, attacks held: 1", "2 of your
   listings sold: +81 gold, +18 Drachmae", ...

Rows are claimed (`pending → sending`) before the send, so two concurrent
flushes never double-send; a 429, 5xx or network error puts them back for
the next run. Messages are EN or RU by the player's Telegram `language_code`,
end with "Turn these off: /settings" and carry one inline **web_app** button
`https://play.pixelarrow.app/?startapp=<route>`; `BootScene` routes it
(`parseStartParam` / `sceneForRoute` in `src/online/deeplink.ts`): `loc_<id>`
and `boss_<id>` centre the war map on the region and select it, `duel` opens the
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
The workflow deploys the game Worker only when the game changed (a `changes`
job filters by path; a manual run picks `target: both | game | landing`).
A landing-only change runs `landing-build`, `landing-test` and
`landing-deploy` (`wrangler deploy --config ../landing/wrangler.jsonc` with
this folder's pinned wrangler) and never touches this Worker, D1 or the
Durable Objects. When both changed, the game deploys first and the landing
right after. The go-live order for the two hosts is in
docs/v6/OWNER_ACTIONS.md.

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
   ```
   Keep the webhook secret value handy for step 5 (or set it from a variable).
   For the admin panel also set `ADMIN_TOKEN` (docs/OPS.md "Operator setup").
   Check with `curl https://play.pixelarrow.app/api/health`.
5. **Register the webhook** (also enables payment updates):
   ```bash
   curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -H 'content-type: application/json' \
     -d "{\"url\":\"https://play.pixelarrow.app/api/telegram/webhook\",
          \"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",
          \"allowed_updates\":[\"message\",\"pre_checkout_query\",\"callback_query\"],
          \"drop_pending_updates\":true}"
   curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```
6. In @BotFather point the Mini App / menu button URL at `https://play.pixelarrow.app`.
   Stars payments need no provider setup.
7. Clan invite links are `https://t.me/<bot>/<app>?startapp=clan_<code>`. The
   bot username comes from `getMe` (or set the var `TELEGRAM_BOT_USERNAME`);
   the Mini App short name defaults to `play` (var `TELEGRAM_APP_NAME` if yours
   differs). The online tables (`0002_online.sql`) are created by the CI
   migration step once `D1_DATABASE_ID` is set.

## Client integration

The game's side (sign-in, cloud save, battle verify, the Stars shop) is
described in docs/GAMEPLAY.md "Cloud save": `src/platform/api.ts`,
`online.ts`, `saveSync.ts`, `verify.ts`. The clan screen
(`src/scenes/online/ClanScene.ts`) uses `/api/online/*` through
`src/online/client.ts` (`onlineApi`); the duels use `/api/duel/*` and
`/ws/duel` through `src/duel/client.ts`; the war uses `/api/war/*` and
`/ws/war/*` (`src/war/`).

The economy screens (`ShopScene`: cosmetics, season pass, wallet; the consumable picker
`src/ui/econ/consumablePicker.ts`) go through `src/ui/econ/source.ts`, which
uses the typed methods in `src/platform/api.ts` (`economyCatalog`, `wallet`,
`buy` (makes a request id; pass the same one when retrying),
`equipCosmetic`, `seasonPass`, `claimPass`, `consumables`, `useConsumable`). Drachmae packs go through `invoice(productId)` +
`Telegram.WebApp.openInvoice`, then poll `wallet()` (the grant arrives via
the webhook).
