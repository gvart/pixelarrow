# Pixelarrow roadmap

Where the game is going, the architecture it runs on, the invariants the
code keeps, and what is still open. What is built is described in
WAR.md and server/README.md. The campaign, duels, the shop and the Telegram
Mini App were removed (the game is only the browser war).

## Vision

- **A shared online war.** One seasonal world of ~37 hand-authored regions,
  four alliances, live server-run battles in every region and squads that
  transfer between neighbours (WAR.md, docs/impl/global-war-rebuild.md).
  **Clans** serve inside an alliance.
- **Telegram Stars buy only Drachmae**; Drachmae buy cosmetics and the
  season pass. No paid power.
- **Web and desktop as well as Telegram** (v6, below).

## Agreed architecture

Two hosts, two Workers (ADR-0007). The game Worker (`server/`,
`wrangler.jsonc`) serves the static game and the API on
**https://play.pixelarrow.app** for the web and Telegram, same origin
(`/api/*`, `/ws/*`), so the game needs no CORS. The landing Worker
(`landing/`) serves the landing and legal pages on **https://pixelarrow.app**
(and www). Each builds and deploys on its own (`.github/workflows/deploy.yml`);
a landing deploy never restarts the game's Durable Objects.

| Concern | Choice |
| --- | --- |
| Real-time server | **Workers + Durable Objects**: `WarWorldDO` (the one war world), `WarRegionDO` per live war region, `MatchmakerDO` (global duel queue), `DuelDO` per live match. WebSockets use the **hibernation API**. |
| Persistence | **D1**: accounts, heroes, items, territories, clans, purchases, battle records. DOs hold hot state and flush to D1. |
| Shared game logic | `src/sim`, `src/war`, `src/online`, `src/duel`, `src/game` run unchanged in the Worker. The server **re-runs every battle from its seed and order log** and accepts only the result it computes. |
| Auth | Telegram `initData` (HMAC-SHA256 with the bot token, `auth_date` freshness) or email and password; both resolve to one player id (ADR-0008, ADR-0009). |
| Payments | **Telegram Stars** (`XTR`): `createInvoiceLink`, `WebApp.openInvoice`, a webhook answers `pre_checkout_query` and records `successful_payment` in D1, then grants. The client never decides what was bought. `refundStarPayment` revokes. |
| Cost | Workers paid plan (~$5/month): replays need more CPU than the free tier, and DOs require it. |

### Battle flow online

- **Async** (duel ladder and raids): the server
  fixes the seed and both armies (from D1) in a ticket; the client fights the
  bot AI and submits its order log; the server replays it and applies only
  its own result.
- **Live war** (regions): the region's `WarRegionDO` runs the sim and
  streams it; the clients only send orders.
- **Live** (duels): a DO relays deployment orders, then seals battle orders
  into turns ahead of time; clients compare `Battle.hash()` every 10 turns;
  at the end the server replays the whole log and writes the result.

## Invariants the code must keep

1. **Simulation purity.** `src/sim` (and the pure parts of `src/world`,
   `src/game`, `src/data`) import no Phaser, DOM, `Math.random`, clocks or
   storage.
2. **Determinism.** Fixed 20 Hz tick, seeded `Rng` (mulberry32), units in id
   order, no unordered iteration, no trigonometry. Same seed + same orders at
   the same ticks = the same battle (replay tests in `tests/`). Fixed point is
   the fallback if engines ever disagree.
3. **Serializable state.** `SaveData`, `WorldSave`, heroes, items, orders and
   results are plain JSON. Maps are regenerated from seeds. Saves are versioned.
4. **Orders as data.** Every battle action (including abilities) is an
   `Order` logged with its tick. The UI never mutates sim state.
5. **No client-trusted economy online.** Gold, loot, XP, recruits, purchases
   and entitlements are computed by the server. Offline saves are never
   uploaded as truth.
6. **Data-driven content.** Items, traits, perks, abilities and auras live in
   `src/data`.

## Binding decisions

Still enforced by code. The ADRs themselves were removed; see the note at the end.

- (ADR-0001) Every online battle carries `SIM_VERSION` (`src/sim/version.ts`).
  The server runs one sim and takes only that version: HTTP gets 426
  `sim_version_unsupported`, sockets (`?sim=N`) close with 4426
  (`server/src/simVersion.ts`). Bump it, in one train, for any change to
  `src/sim/**`, the `src/data/**` the sim reads, order/setup schemas, server
  setup builders or tick constants; the sim never branches on it.
- (ADR-0001) Every new online battle endpoint takes `simVersion` and calls
  `checkSimVersion` first; every replay goes through `replayBattle`
  (`server/src/battle.ts`). Replay fixtures are updated deliberately, never
  regenerated silently.
- (ADR-0002) `SAVE_VERSION` 6 is the baseline, with no older migrations: a
  higher version loads read-only, a lower one is corrupt and kept raw under
  `px_corrupt_*`. `validate` repairs v6 fields with defaults on every load;
  new fields must be optional with defaults. A future bump adds one `n → n+1`
  migration.
- (ADR-0003) Stay on Phaser 3.90 (`package.json`). The Phaser 4.2.1 upgrade
  failed its gate on first-draw time (1.4-2x slower first sheet open).
- (ADR-0004) Battle pointer input is pure and tested in `src/ui/input/`
  (`hitTest.ts`, `gestures.ts`); the scene only routes events and carries out
  the result. New pointer behaviour goes there first, with a test. `HitState`
  stays a plain snapshot.
- (ADR-0005) Controls pick a role (`primary` once per screen, `secondary`,
  `neutral`, `lit`, `disabled` with a reason), never a colour; grey only for
  disabled. Hit areas at least `TAP` (44 pt), labels never under `TEXT_MIN`
  6.5, badges are counts (no "!"), must-show facts wrap. Pure rules live in
  `src/ui/mosaic/policy.ts` with tests (removed with the legacy UI).
- (ADR-0006) Game code reaches the platform only through `src/platform`
  (facade), `src/platform/core/*` and neutral services, never
  `src/platform/{telegram,web}/**` or `detect.ts`; it branches on
  capabilities, never `platform.id`. Only `src/platform/telegram/` touches
  `window.Telegram`. Adapters import no game code and take an injected `env`.
  Detection happens once in `selectPlatform()`. A new capability goes into a
  `core/` interface and every adapter in one commit. Enforced by
  `tests/platformBoundary.test.ts`.
- (ADR-0007) Two Workers: `pixelarrow` on play.pixelarrow.app (API, DOs, D1,
  crons) and `pixelarrow-landing` on the apex and www (static assets, a `GAME`
  service binding, no D1 or secrets). Play allows framing only by itself and
  `https://web.telegram.org`; legal pages live on the apex.
- (ADR-0008) Sessions are server-side in D1: token `pa2_` + 32 random bytes,
  only its SHA-256 stored, 30 s per-isolate cache. Web uses the
  `__Host-pa_sid` cookie (30 days, 7 idle); Telegram a bearer token (24 h) in
  `Authorization` or `Sec-WebSocket-Protocol`, never in a URL. One transport
  per request. Cookie writes and socket upgrades must carry
  `Origin == GAME_URL`.
- (ADR-0008) Passwords: PBKDF2-HMAC-SHA256, `PBKDF2_ITERATIONS` = 310,000
  (`server/src/auth/password.ts`), peppered with `PASSWORD_PEPPER`, rehashed
  on log-in when parameters change. Identities exist only after proof.
  Per-IP limits use rate-limit bindings (`RL_AUTH_IP`, `RL_TG_AUTH_IP`,
  `RL_PUBLIC_IP`), per-account limits D1 `auth_throttle`; Turnstile on web auth
  forms, failing closed. Online routes and sockets use `requirePlayable`.
- (ADR-0009) One `players.id`, at most one Telegram and one password identity;
  link, unlink, email change, conflict resolution and deletion need re-auth
  within 10 minutes. Conflicts never merge state, and an account with
  purchases cannot be the loser. Deletion is immediate and resumable
  (`server/src/account/delete.ts`).
- (ADR-0009) Public names are `display_name` only (generated by default,
  never Telegram names), validated by `server/src/names/` (3-16 chars, no
  Latin/Cyrillic mix, look-alike folding into `display_name_key`, reserved
  and blocked words). `first_name` and `username` reach only the player's own
  `/api/me`.
- (ADR-0010) `/api/public/*` has one route, `GET`/`HEAD
  /api/public/v1/summary`: it returns the `public_snapshot` row built by the
  5-minute cron, runs no session middleware, sends no CORS headers, and never
  carries ids, Telegram fields, emails, money or RD. Boards with fewer than 3
  rows are empty. The landing reaches it through the `PublicApi` RPC
  entrypoint, cached at the edge with a 24 h last-good copy and
  `RL_LANDING_PUBLIC` on misses. A new public route needs a decision first.
- (ADR-0011) The landing is Astro static output in `landing/`, no UI
  framework, no GSAP or smooth-scroll library; motion is CSS scroll-driven
  and only under `prefers-reduced-motion: no-preference`. Budget: critical
  first-party JS ≤ 15 kB gzip, mobile LCP ≤ 2.0 s, CLS ≤ 0.02, above the fold
  ≤ 350 kB on mobile; one lazy hero module ≤ 80 kB may load after LCP.
- (ADR-0012) Keyboard and mouse go through `src/ui/input/`: actions by
  `ActionId` (`actions.ts`), bindings by `KeyboardEvent.code` with `mod` =
  Ctrl or ⌘, stored device-local (never in the save). One window key listener
  (`keySource.ts`, Phaser keyboard off); editable or composing events are
  ignored. A hotkey calls the same scene method as its button.
- (ADR-0013) `uiMetrics` reports a size class (compact, medium, expanded)
  with a whole-number S and the content caps in `src/ui/sizeClass.ts`
  (`CONTENT_MAX` 640 etc.). Scenes opt in with `responsive = true`; others run
  in the v5 legacy column (`setLegacyColumn`). A class or orientation change
  rebuilds the scene.

## Open items

### Launch blockers

1. **Bot notifications:** done (server/README.md "Bot notifications").
2. **Payment compliance:** done; the legal texts at pixelarrow.app/terms,
   /privacy, /refunds await the operator's review.
3. **Monitoring and analytics:** done (docs/OPS.md).
4. **Backups and the admin panel:** done (docs/OPS.md).

### Polish

- The world map, settlements, results, market, first run and camp still use
  the older chrome.
- The consumable picker (`pickBattleConsumable`) is not offered in attacks,
  lairs, world-boss raids or duel challenges yet.
- The premium season pass (500 Dr) should return about 600 Dr; the reward
  table pays far less (`server/src/economy/catalog.ts` `PASS`).
- `supporter_banner` should become a Drachmae cosmetic; it is still a legacy
  Stars entitlement (`server/src/products.ts`).
- Beast trial with practice copies of the heroes, labelled "Practice"
  (`src/scenes/BeastTrialScene.ts`).
- Show beast trophies (`trophy_<beast>`) on the hero sheet or the army.
- Battle report Summary tab: fill the space under the MVP card.
- Hero stash: one rarity filter plus a labelled Sort control (`StashGrid`).
- Ability cooldown numbers can overlap their icon.
- Flaky browser checks are tracked in docs/FLAKY.md.

### Backlog

- Daily login rewards and daily quests that feed pass XP.
- Clan leaderboards, season titles on profiles, clan chat and clan wars.
- Referrals through Telegram deep links. Friends lists.
- Shareable battle replays (seed + order log); a raid replay viewer.
- Abuse protection: trading limits for new accounts, marketplace flags.
- Low-end phones: 30 fps in a 40-soldier battle; an automatic low-effects mode.
- A staging environment.
- Season events and themes.
- Assault time or post-battle rest if attacks feel too cheap.

## v6: web and desktop

The game runs on the open web (tablets, laptops) as well as in Telegram.
The platform layer, accounts, linking, nicknames, hosting and the landing are
in place (see Binding decisions). Still open:

- **True landscape layouts** for every screen, not a portrait column: scenes
  move off the legacy column one by one (ADR-0013). The layout check covers
  landscape and tablet sizes.
- **Mouse and keyboard** everywhere: hover, right-click, wheel zoom, focus
  navigation, battle hotkeys, rebinding (ADR-0012). Touch devices keep the
  touch UI.
- **Payments.** The `Payments` interface has the Telegram Stars adapter and a
  web placeholder: the web shop shows purchases as "coming soon" with a
  reason. A real provider plugs into the web adapter, without touching the
  shop or the server's grant logic, once the legal side is settled.
- More platforms (Steam, native mobile) arrive as new adapters under
  `src/platform/`, with no platform checks in game code.

## Removed planning docs

Code comments still cite removed planning docs (`docs/v6/*`, `design/*`,
`production/*`, the planning parts of `docs/v5/*`) and story IDs such as V6-ACCT-03. They are in git
history before the cleanup: `git show 6f243dbc:<path>`.
