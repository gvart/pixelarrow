# Pixelarrow roadmap

This records where the game is meant to go and the architecture agreed for
getting there, so that today's single-player code keeps the doors open.

## Vision

- **Online multiplayer over WebSockets.** Players share one persistent world
  map of the ancient Mediterranean. They occupy and hold territories (towns,
  villages, passes, harbours), fight each other's armies and the roaming bands,
  and expand.
- **Clans.** Players band together, share territory and treasuries, call each
  other to battle, and wage clan wars over regions.
- **Paid features through Telegram Stars.** Cosmetic and convenience purchases
  (banners, shield paints, extra hero slots, faster healing, campaign
  boosters) sold for Stars inside the Telegram Mini App. Entitlements are
  granted and checked on the server only.
- The current offline campaign (overland map, bands, settlements, heroes,
  perks, real-time formation battles) is the single-player core that the
  online game grows from.

## Agreed architecture

A first backend has already landed in `server/` (see
[server/README.md](../server/README.md)): one Worker serves the static game
and the API (Hono, zod, D1, a hibernating `RegionDO`, Telegram `initData`
auth, Stars payments, and battle verification that replays `src/sim`). The
table below is the target the phases build towards.

| Concern | Choice |
| --- | --- |
| Static game files | Already served by a Cloudflare Worker (static assets) on **https://pixelarrow.app** (`wrangler.jsonc`, `.github/workflows/deploy.yml`). The API lives on the same domain (e.g. `/api/*`, `/ws`), so no CORS and one origin for Telegram. |
| Real-time server | **Cloudflare Workers + Durable Objects**: one DO per **region** of the world map (bands, territory, presence), one per **clan** (members, treasury, chat), one per **battle** (lockstep order relay and validation). WebSockets use the **hibernation API** so idle connections cost nothing. |
| Persistence | **D1 (SQLite)**: accounts, heroes, items, territories, clans, purchases, battle records. DOs hold hot state and flush to D1. |
| Shared game logic | **TypeScript shared with the client**: `src/sim` (battle), `src/world` (map generation, travel, bands), `src/game` (heroes, loot, enemy generation) run unchanged in the Worker. The server **re-runs every battle from its seed and order log** and only accepts the result it computes itself. |
| Auth | **Telegram `initData`** sent on connect; the Worker validates its **HMAC-SHA256** signature with the bot token (secret key = HMAC("WebAppData", bot token)), checks `auth_date` freshness, and binds the session to the Telegram user id. No passwords. |
| Payments | **Telegram Stars** via the Bot API: the Worker calls `createInvoiceLink` with currency **`XTR`**; the client opens it with `WebApp.openInvoice`. A Worker **webhook** answers `pre_checkout_query` (validate the payload, stock and price) and records the **`successful_payment`** (with `telegram_payment_charge_id`) in D1, then grants the entitlement. The client never decides what was bought. Refunds via `refundStarPayment` revoke it. |
| Cost | The **Workers paid plan (~$5/month)** is expected at launch: server-side battle replays need more CPU time per request than the free tier allows, and Durable Objects require it. |

### Battle flow online

1. Both players (or a player and the server bot) join the battle DO over a WebSocket.
2. The DO fixes the seed and both armies (from D1, not from the clients).
3. Clients send orders; the DO stamps each with the tick it applies at
   (`Battle.schedule()` style lockstep) and relays them. Bots run in the DO.
4. Clients send periodic `Battle.hash()` values; a mismatch triggers a resync.
5. At the end the DO replays seed + order log with `src/sim`, writes the
   result, loot, XP and wounds to D1 and pushes them to both sides.

## Online mode, phase 1 (landed)

The seasonal hex war of [DESIGN_V2.md](DESIGN_V2.md) has its server
foundations and a first client (see DESIGN.md "Online mode" and
server/README.md "Online mode"):

- Seasons (90 days, full reset, titles kept) and shards of ~500 players on a
  seeded hex disc (~3.5k hexes) with resources, forts, capitals and
  battlefield terrain; static hex data is never stored, only changed hexes.
- Server-owned armies, gear and resources; every change is an endpoint that
  validates it (D1 batches guarded by a profile revision).
- Fog of war computed on the server; lazy income, energy, marches, wounds and
  respawns (no alarms, no polling).
- Neutral defenders on every unclaimed hex, sieges for strong hexes.
- Async attacks with tickets: server seed and armies, a per-hex lock in the
  shard Durable Object, replay verification before anything is applied.
- Garrisons, clans with roles and Telegram invite links, shared clan land.
- Presence and friendly live duels: lockstep relay through the shard DO with
  hash desync checks and a verified result.

Next for online: march-based attacks on distant hexes and scouting, player
garrison battles that wake the defender (notifications), clan wars and
treasuries, beasts and world bosses (the hex `occupant` column already allows
`beast`), the town marketplace, live duels with stakes, season rewards in the
shop, D1 clean-up of ended seasons, a rate limiter shared across isolates.

## Invariants the code must keep

These hold today and must keep holding; they are what make the plan above possible.

1. **Simulation purity.** `src/sim` (and the pure parts of `src/world`,
   `src/game`, `src/data`) import no Phaser, DOM, `Math.random`, clocks or
   storage. They run in Node, a Worker and the browser alike.
2. **Determinism.** Fixed 20 Hz tick, seeded `Rng` (mulberry32), units updated
   in id order, no iteration over unordered sets, no trigonometry in the sim.
   Same seed + same logged orders at the same ticks = the same battle
   (`tests/sim.test.ts`, `tests/abilities.test.ts` replay tests). Cross-engine
   lockstep must add hash checks or move to fixed point (see DESIGN.md).
3. **Serializable state.** Everything that matters is plain JSON: `SaveData`,
   `WorldSave`, heroes, items, orders, battle results. Maps are regenerated
   from seeds, never stored. Saves are versioned with migrations.
4. **Orders as data.** Every player action in battle (moves, formations,
   stances, retreats, **abilities**) is an `Order` object logged with its tick.
   The UI never mutates sim state directly.
5. **No client-trusted economy in online mode.** Gold, loot, XP, recruits,
   market purchases and Stars entitlements are computed by the server from
   validated inputs. The client may predict them for display only. (Offline,
   the client owns its save; that save is never uploaded as truth.)
6. **Data-driven content.** Items, traits, perks, abilities and auras live in
   `src/data` so client and server always agree on the rules.

## Phased plan

1. **Now: offline campaign (done).** Overland map, bands, settlements, wounds,
   hero attributes/perks/abilities/auras, real-time battles, saves in Telegram
   CloudStorage.
2. **Accounts and cloud profile** (started: `server/` v1; the client signs in, syncs the save, verifies battles and has the Stars shop). Worker + D1, Telegram `initData` login,
   server-side save of the campaign profile (heroes, items, gold) with the
   client save as a cache. Keep offline play.
3. **Server-validated battles.** Battle DO replays seed + order log; PvE
   results (vs bands) are accepted only from the replay. Ship hash desync
   checks in the client.
4. **Async PvP.** Attack another player's garrison army (bot-controlled by the
   server); results validated as in phase 3.
5. **Shared world** (phase 1 landed as the seasonal hex shards above). Region DOs hold the world map, territories and roaming
   bands for everyone; presence and movement over hibernating WebSockets.
6. **Clans.** Clan DOs, shared treasury, territory ownership, clan wars,
   chat.
7. **Live PvP battles.** Lockstep battles between two online players through
   a battle DO, with reconnect and timeouts.
8. **Telegram Stars.** Invoice links (XTR), pre-checkout and payment webhooks,
   D1 entitlements, a small store. Cosmetics and conveniences only; no paid
   power in PvP.
9. **Scale and polish.** Sharding regions, anti-cheat telemetry, seasonal
   maps, sound and music.

## Queue after the current work (2026-10-07)

In progress or queued, in order: classes/art overhaul, slingshot controls,
server economy (Drachmae, shop, pass, marketplace), audio → UI overhaul with
English/Russian and the online battle rules → tutorial battle → mythical beasts.

### Launch blockers (queued next, after the beasts)

1. **Bot notifications** (done): attacks on your land, captures and held
   garrisons, march arrivals, a full treasury, duel challenges while
   offline, clan news, world boss loot, the season ending in 3 days / 1 day,
   marketplace sales. Opt-out per type (Settings → Notifications, bot
   `/settings`), quiet hours, 4 messages an hour, coalescing, deep links into
   the right screen. See server/README.md "Bot notifications".
2. **Payment compliance** (done, legal texts await the operator's review):
   `/paysupport`, `/terms`, `/delete_my_data`, the command menu in English
   and Russian, and the terms, privacy and refund pages at
   pixelarrow.app/terms, /privacy, /refunds (and /ru/...), linked from
   Settings → About and the wallet. See server/README.md "Payment support
   and legal pages".
3. **Error monitoring and analytics:** client crash reports, plus funnel and
   retention events (tutorial completed, first battle, first purchase, day-1
   and day-7 return), in Cloudflare Analytics Engine or a similar low-cost
   store.
4. **Backups and an admin panel:** a tested D1 point-in-time restore runbook.
   A protected admin page to view players, refund, ban, adjust balances, and
   end or start a season by hand.

### Later (backlog)

- **Daily login rewards and daily quests** that feed season pass XP.
- **Leaderboards:** players and clans per shard and globally; season titles on
  profiles.
- **Referrals:** "invite a friend, both get Drachmae when they reach level 5",
  through Telegram deep links.
- **Shareable battle replays:** seed plus order log, viewable from a link
  shared in a chat.
- **Multi-account and abuse protection:** trading limits for new accounts,
  cooldowns on gifting Drachmae, flags for suspicious marketplace activity.
- **Low-end phone performance:** 30 fps on a budget Android in a 40-soldier
  battle; an automatic low-effects mode.
- **Staging environment:** deploy each push to staging; promote to production
  by hand once real players arrive.
- **Clan chat and clan wars:** scheduled sieges of capitals.
- **Season events and themes**, e.g. "Season of the Kraken" with a special
  boss and cosmetics.
- **Ranked duels** with matchmaking.
- **Assault time or post-battle rest** if attacks feel too cheap (see "Online
  battle rules" in DESIGN_V2.md).
