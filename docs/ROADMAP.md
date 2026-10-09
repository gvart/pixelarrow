# Pixelarrow roadmap

Where the game is going, the architecture it runs on, the invariants the
code keeps, and what is still open. What is built is described in
GAMEPLAY.md, DESIGN_V2.md, DUELS.md and server/README.md.

## Vision

- **A shared online war.** Seasonal shards of a hand-authored ancient
  Mediterranean map: players hold regions, fight each other's garrisons, the
  neutrals and the beasts, and expand (DESIGN_V2.md).
- **Clans** share land, garrison each other's regions and fight for capitals.
- **Duels:** a persistent duel army with ranked live and async ladders
  (DUELS.md).
- **Telegram Stars buy only Drachmae**; Drachmae buy cosmetics and the
  season pass. No paid power.
- The offline campaign (overland map, bands, settlements, heroes, perks,
  real-time formation battles) stays the single-player core (GAMEPLAY.md).

## Agreed architecture

One Worker in `server/` (see [server/README.md](../server/README.md)) serves
the static game and the API: Hono, zod, D1, hibernating Durable Objects (a
`RegionDO` per shard, `MatchmakerDO` and `DuelDO` for duels), Telegram
`initData` auth, Stars payments, and battle verification that replays
`src/sim`.

| Concern | Choice |
| --- | --- |
| Static game files | Served by a Cloudflare Worker (static assets) on **https://pixelarrow.app** (`wrangler.jsonc`, `.github/workflows/deploy.yml`). The API lives on the same domain (e.g. `/api/*`, `/ws`), so no CORS and one origin for Telegram. |
| Real-time server | **Cloudflare Workers + Durable Objects**: `RegionDO` per shard (presence, live armies, region locks, friendly duels), `MatchmakerDO` (the global duel queue), `DuelDO` per live match (lockstep relay and validation). WebSockets use the **hibernation API** so idle connections cost nothing. |
| Persistence | **D1 (SQLite)**: accounts, heroes, items, territories, clans, purchases, battle records. DOs hold hot state and flush to D1. |
| Shared game logic | **TypeScript shared with the client**: `src/sim` (battle), `src/online` (world graph, rules), `src/duel`, `src/game` (heroes, loot, enemy generation) run unchanged in the Worker. The server **re-runs every battle from its seed and order log** and only accepts the result it computes itself. |
| Auth | **Telegram `initData`** sent on connect; the Worker validates its **HMAC-SHA256** signature with the bot token (secret key = HMAC("WebAppData", bot token)), checks `auth_date` freshness, and binds the session to the Telegram user id. No passwords. |
| Payments | **Telegram Stars** via the Bot API: the Worker calls `createInvoiceLink` with currency **`XTR`**; the client opens it with `WebApp.openInvoice`. A Worker **webhook** answers `pre_checkout_query` (validate the payload, stock and price) and records the **`successful_payment`** (with `telegram_payment_charge_id`) in D1, then grants the entitlement. The client never decides what was bought. Refunds via `refundStarPayment` revoke it. |
| Cost | The **Workers paid plan (~$5/month)** is expected at launch: server-side battle replays need more CPU time per request than the free tier allows, and Durable Objects require it. |

### Battle flow online

- **Async** (war-map attacks, boss raids, the duel ladder and raids): the
  server fixes the seed and both armies (from D1, never from the client) in a
  ticket; the client fights the bot AI and submits its order log; the server
  replays it with `src/sim` and applies only the result it computes.
- **Live** (friendly and ranked duels): a DO relays deployment orders, then
  seals battle orders into turns ahead of time; nobody simulates an unsealed
  turn; clients compare `Battle.hash()` every 10 turns; at the end the server
  replays the whole log and writes the result.

## Invariants the code must keep


1. **Simulation purity.** `src/sim` (and the pure parts of `src/world`,
   `src/game`, `src/data`) import no Phaser, DOM, `Math.random`, clocks or
   storage. They run in Node, a Worker and the browser alike.
2. **Determinism.** Fixed 20 Hz tick, seeded `Rng` (mulberry32), units updated
   in id order, no iteration over unordered sets, no trigonometry in the sim.
   Same seed + same logged orders at the same ticks = the same battle
   (`tests/sim.test.ts`, `tests/abilities.test.ts` replay tests). Cross-engine
   lockstep checks hashes every 10 turns; moving to fixed point is the
   fallback if engines ever disagree.
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

## Open items

### Launch blockers

1. **Bot notifications:** done (server/README.md "Bot notifications").
2. **Payment compliance:** done; the legal texts at pixelarrow.app/terms,
   /privacy, /refunds await the operator's review (server/README.md
   "Payment support and legal pages").
3. **Monitoring and analytics:** done (docs/OPS.md "Monitoring",
   "Analytics").
4. **Backups and the admin panel:** done (docs/OPS.md "Backups", "Restore
   runbook", "Admin panel").

### Polish

- The world map, settlements, results, market, first run and the camp still
  use the older chrome (docs/UI_KIT.md "Screen chrome"); move them to the v3
  header and components.
- Consumable picker in the online flows: `pickBattleConsumable` exists but
  attacks, lairs, world-boss raids and duel challenges do not offer it yet
  (`src/ui/econ/consumablePicker.ts`, `OnlineScene`, `src/ui/duelInvites.ts`,
  the deploy HUD).
- The premium season pass (500 Dr) should return about 600 Dr over its
  tiers (DESIGN_V2.md "Economy decisions"); the reward table pays far less
  (`server/src/economy/catalog.ts` `PASS`).
- `supporter_banner` should become a Drachmae cosmetic (DESIGN_V2.md
  "Economy decisions"); it is still a legacy Stars entitlement.
- Beast trial with practice copies of the heroes (no permadeath, wounds or
  loot), labelled "Practice" (`src/scenes/BeastTrialScene.ts`).
- Show beast trophies (`trophy_<beast>` entitlements) on the hero sheet or
  the army.
- Battle report Summary tab: fill the space under the MVP card.
- Hero stash: one rarity filter plus a labelled Sort control (`StashGrid`).
- Ability cooldown numbers can overlap their icon (`PanelButton` badge).
- `scripts/smoke.mjs` has been flaky in the "shield basher in contact" and
  "ability used from the battle bar" checks; wait on state rather than a
  fast-forward loop if it recurs.

### Backlog

- Daily login rewards and daily quests that feed pass XP.
- Clan leaderboards and season titles on profiles.
- Referrals through Telegram deep links.
- Shareable battle replays (seed + order log behind a link); a raid replay
  viewer for duels.
- Abuse protection: trading limits for new accounts, flags for suspicious
  marketplace activity.
- Low-end phones: 30 fps on a budget Android in a 40-soldier battle; an
  automatic low-effects mode.
- A staging environment.
- Clan chat and clan wars (scheduled sieges of capitals).
- Season events and themes (e.g. a Kraken season).
- Assault time or post-battle rest if attacks feel too cheap (DESIGN_V2.md
  "Online battle rules").
- Friends lists (and friends leaderboards for duels).
