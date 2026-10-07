# Pixelarrow duels: ranked PvP, duel army and two shops

Decisions from the design interview (2026-10-07). Covers the duel mode
(a persistent duel army, the PvE ladder, unranked and ranked matchmaking,
leagues), the duel shop and the move of the war-map shop onto map tiles.
Where it conflicts with DESIGN_V2.md, this document wins for duels and
shops. Values marked *(default)* were not settled in the interview and are
starting points to tune.

## Status

- **Slice 2 landed (duel roster and economy):** the duel profile, roster and
  team, the point budget, Glory, the duel shop (catalogue, daily offers,
  selling), hero development and respec, and the PvE ladder with verified
  battles and drops. Server: `server/src/duel/`, migration `0007_duels.sql`,
  API in server/README.md "Duels". Shared rules: `src/duel/rules.ts`,
  `src/duel/ladder.ts`. Client: the duel hub `src/scenes/duel/DuelScene.ts`
  (Menu → Duels), the hero sheet on the duel army (`src/duel/heroSource.ts`),
  and an in-memory demo (`DemoDuelSource`) for the layout check and
  `scripts/duel-smoke.mjs`.
<<<<<<< HEAD
- **Slice 3 landed (live ranked and unranked):** the global `MatchmakerDO`
  (`/ws/duel`), one `DuelDO` per match (`/ws/duel/<id>`) on the lockstep relay
  now shared with friendly duels (`server/src/online/relay.ts`), settlement in
  `server/src/duel/live.ts`, migration `0008_duel_ranked.sql`
  (`duel_ratings`, `duel_queue_state`, `duel_matches`). Shared rules:
  `src/duel/rating.ts` (`RANKED`), protocol `src/duel/protocol.ts`. Client:
  the hub's **Arena** tab (league card, placements, Find match / Unranked,
  the search with its timer and Cancel, the found opponent, the level-5 lock,
  the cooldown, Rejoin), the live battle through `src/duel/match.ts` (a
  lockstep driver that reconnects and fast-forwards), and the report via
  ResultsScene. API in server/README.md "Ranked duels".
- Next: slice 4 (async ladder, seasons, leaderboards), slice 5 (map merchants).

The numbers below are the ones the code uses (`DUEL_RULES`, `LADDER`,
`RANKED`).

### Slice 3 numbers and decisions

- **Glicko-2:** start 1500 / RD 350 / volatility 0.06, τ = 0.5, RD floor 40,
  one rating period per match (no RD growth with inactivity yet). The rating
  is season independent (`duel_ratings.ladder = 'live'`; `'async'` is
  reserved for slice 4); `peak` is kept for season rewards.
- **Leagues** (rating floors, 200 wide, 3 divisions III → I of ~67 points):
  Bronze < 1200, Silver 1200, Gold 1400, Hoplite 1600, Strategos 1800,
  Legend 2000+ (the exact rating shows; the leaderboard rank comes with
  slice 4). No league during the **10 placement matches**; the rating stays
  hidden below Legend.
- **Matchmaking window** (rating gap both players accept, by wait): ranked
  100 + 10/s up to 400, anyone after 90 s; unranked 250 + 25/s up to 800,
  anyone after 30 s. Greedy: the longest wait first, the closest rating that
  fits both windows. Re-paired every 2 s while anyone waits. Side 0 is picked
  by the seed.
- **Per match:** ranked win 30 Glory, draw 20, loss 10; unranked half (15 /
  10 / 5). Duel account XP 40 / 25 / 15 in both. Hero XP as on the ladder
  (`duelHeroXp`), win or lose. Only progression is written to the heroes.
- **Entry:** the duel team must fit the 150-point budget; ranked from duel
  level 5. **No consumables** in either queue (unranked consumables are still
  not built). The field is `randomSite` by the server seed (the "map pool").
- **Disconnects:** 30 s to come back (the DO re-sends the deployment, go and
  every sealed turn; the client skips what it ran and runs through the rest
  at up to 120 steps a frame). Not joining within 30 s of the match start,
  or staying connected but not reporting turns for 30 s while the opponent
  waits, counts the same. A player gone is an **abandon** and loses; both
  gone, a desync, or a match still running after 12 minutes is **void** (no
  rating change, nothing paid). Back during the deployment (`leave_duel`) is
  a surrender: a loss, not an abandon.
- **Abandons:** 3 in 24 h → a 15-minute queue cooldown for both queues,
  doubling for each repeat within 24 h, at most 4 h.
- **Deviations:** the hub tab is called "Arena" (the four tabs switch to
  icons on narrow screens); the ranked team is the one duel team (saved
  loadouts come with slice 4); the relay now refuses an `end` whose replay
  runs past the sealed turns (also for friendly duels).
=======
- **Slice 5 landed (map merchants):** every town (capitals included) and the
  seeded trading posts sell consumables and gear; the menu shop no longer
  sells consumables (`POST /api/economy/buy` answers 410 `merchant_only`) and
  keeps the wallet, the pass and cosmetics. Shared rules
  `src/online/merchants.ts` (`MERCHANT`), server
  `server/src/online/merchant.ts` (`/api/online/merchant`), migration
  `0009_merchants.sql`, client `src/scenes/online/MerchantScene.ts` (hex
  panel → Merchant; a small stall marks trading posts on the map). Numbers:
  - trading posts: one per 300 hexes (12 on a full shard of radius 34), half
    harbours (passable coast) and half crossroads (plains or farmland on a
    river, land all around), 7+ apart, 5+ from a capital, never on towns,
    forts, lairs, world bosses or homes; visible like any other hex (fog
    hides them until seen);
  - regions by the nearest capital (Attic, Thessalian, Thracian, Cretan,
    Gallic, Phoenician, Scythian goods: e.g. Cretan bows, rhomphaia and falx,
    xyston lances and Boeotian helms);
  - stock per (seed, hex, UTC day): the five consumables (their usual gold
    and Drachmae prices and caps), 3 basic common pieces, 2 specialties at
    uncommon and 1 rare in towns; every specialty plus harbour or crossroads
    goods at rare and 1 epic at trading posts. Gear: item value × 2/3/5/8
    gold by rarity, never for Drachmae; daily gear caps 2 (basic) and 1
    (regional, rare) per player across all merchants;
  - holder and clan discount 10%; the holder earns 5% of the list gold price
    (rounded down) of every sale to someone else, paid by the merchant.
  - Recruiting stays on the online army screen (not sold by merchants).
- Next: slice 3 (matchmaker, live ranked, leagues), slice 4 (async ladder,
  seasons, leaderboards).

The numbers below are the ones the code uses (`DUEL_RULES`, `LADDER`,
`MERCHANT`).
>>>>>>> origin/main

## Summary

| Topic | Decision |
| --- | --- |
| Duel army | **Separate** from the war-map army: own heroes, gear, levels and stash. |
| Persistence | **Persistent**; never reset by the 90-day war season. Only rating soft-resets. |
| Formats | **Live 1v1** (lockstep, as friendly duels today) and **async** against a server bot playing another player's saved defence army. |
| Matchmaking | **One global queue** across all shards (new matchmaker Durable Object). |
| Fairness | **Army power budget**: every hero and item has a point cost; ranked has a fixed budget. |
| Army size | **10 heroes** at most. |
| Levelling | Levels add stats and perk points, **and raise the hero's budget cost**. |
| Losses | **None**: no wounds, no death, no gear wear in any duel mode. |
| Farming | **PvE ladder** (towers) and an **unranked queue**. |
| Currency | **Glory**, a new duel-only currency, earned in duels and on the ladder. |
| Duel gear | Bought in the **duel shop** and **dropped on the PvE ladder**. |
| Recruiting | Pick a class in the duel shop and pay Glory to get a level-1 hero; elite classes unlock by progress. |
| Ratings | **Hidden rating, visible leagues**; separate ratings for live and async. |
| Ranked seasons | **Monthly**, soft reset, rewards by peak league (Glory, cosmetics, title). |
| Consumables | **Not in ranked**. Ladder and unranked: allowed by design, not built yet (war-map consumables are season-scoped; duel consumables need their own source). |
| Disconnects | **30 s to reconnect**, then a loss; repeat leavers get a queue cooldown. |
| Unlock | Duel mode after the tutorial (the first-run flow runs it before the menu); **ranked at duel account level 5**. |
| Shops | **Duel shop**: a menu inside the duel screen. **War-map shop**: merchants **on map tiles** (towns and trading posts), selling for gold and Drachmae. **Wallet** (Stars → Drachmae, pass, account cosmetics) stays in the profile menu. |

## Duel army

- A second roster per account (`duel_heroes`, `duel_items` in D1), never
  touched by season resets or the war-map economy. Heroes reuse the shared
  `Hero`/`Item` types, classes, perk trees and abilities (`src/data`), so the
  sim needs nothing new.
- **Roster** up to 30 heroes; a **team** is up to 10 of them, with battle
  groups and formations. The duel hub's Team tab picks the team; a tap opens
  the regular hero sheet on the duel army (stats, gear, perks, skills,
  respec). A dismissed hero leaves for good (gear to the stash, no refund).
- **Loadouts:** one team for now. Saved teams (a ranked team, an async
  defence team) come with slices 3 and 4.
- **Starter roster:** 6 level-1 heroes (2 hoplites, 2 archers, a peltast, a
  slinger) with common gear, all in the team (42 points), and 200 Glory.
- Hero level cap stays `MAX_LEVEL` (10). XP comes from ladder battles,
  unranked and ranked (winning and losing both pay; winning pays more).
- **Duel account level** (1–30): its own XP track (25·n·(n−1) XP for level
  n: level 2 at 50, level 5 at 500). Ladder wins pay 20 + 2 × floor XP,
  losses a third. It gates ranked (level 5) and the classes below.

## Power budget

The budget keeps ranked a contest of build and skill. Progression gives
**choice** (more classes, perks, item types, veterans), not an automatic
win.

- **Hero cost** = round(class price / 10 × (1 + (level − 1) / 9)): a
  hoplite costs 10 at level 1 and 20 at level 10, an archer 5 and 10, a
  Companion 16 and 32. The trade is "few veterans or many recruits".
- **Item cost** by rarity: common 0, uncommon 1, rare 2, epic 4, legendary 6.
  Cosmetics cost nothing.
- **Ranked budget:** 150 points for everyone (to be tuned with slice 3).
- **Unranked** uses the same budget. **Ladder** floors set their own: 56 + 4 ×
  floor (60 on floor 1, 150 from floor 23 on).
- Costs live in `src/duel/rules.ts` (shared with the server). The server
  builds the `BattleSetup` from D1 and rejects a team over budget; the client
  only previews.

## Modes

### PvE ladder (farming)

- 50 floors, a boss every 10th. A floor's army is a pure function of its
  number (`ladderFloor`): a full army of the floor's level and mix from
  `src/game/enemy.ts`, fitted to 70% of the floor's budget on floor 1 rising
  to 115% on floor 50 (bosses +15%). Only the battle seed is random.
- **First clear:** 40 + 8 × floor Glory (bosses double), account XP and a
  guaranteed item (uncommon or better; epic or better on a boss).
  **Replays** of cleared floors: 10 + floor Glory, XP and a 25% drop chance
  (the farm loop). Farm Glory is capped at 300 a UTC day; XP is not.
- Ladder battles follow the online battle rules (15 s deployment, no pause)
  and are verified by server replay (seed + order log) before anything is
  granted. Every hero earns XP win or lose; nobody is hurt.

### Unranked queue

- Same global matchmaker and the same live lockstep battle as ranked, without
  rating changes. Pays XP and reduced Glory. A good place to try new builds.
- Consumables allowed (1 per battle, as on the war map).

### Ranked live (1v1)

- The friendly duel flow (`server/src/online/duel.ts`, `src/online/lockstep.ts`,
  `duelDriver.ts`) moves to a dedicated **`DuelDO`**: a 15 s deployment
  phase, no pause or speed-up, hash checks every 10 turns, a server replay at
  the end, then the result is written.
- **No consumables.** Terrain is drawn from a ranked map pool by the server
  seed.
- **Disconnects:** the dropped player has 30 s to reconnect and resume (the
  DO re-sends the sealed order log; the client fast-forwards). After that the
  battle is a loss. 3 abandoned matches in 24 h → a 15-minute queue cooldown,
  growing on repeats *(default)*. The bot does not take over.

### Ranked async (defence ladder)

- Each player sets a **defence team**. Others attack it whenever they like;
  the server bot plays the defence.
- A **separate rating** from the live ladder (bot-played defence is weaker
  than a human, so the two must not mix).
- Defenders gain a small amount of Glory and rating for successful defences;
  their losses cost rating at a reduced rate *(default: 50%)*, so being
  offline is never punishing. A **defence log** shows who attacked, with
  replays.
- Attacks per day are capped *(default: 10 rated attacks)*; the same opponent
  cannot be attacked again within 24 h.

## Matchmaking and rating

- **Rating:** Glicko-2 *(default; ELO works too)*. Separate ratings for live
  ranked and async. Hidden; matchmaking uses rating ± a window that widens the
  longer the wait.
- **Matchmaker:** one global `MatchmakerDO` (sharded by region later if
  needed). Players queue over the existing WebSocket. When a pair is found it
  creates a `DuelDO`, and both clients connect to it.
- **Leagues:** Bronze, Silver, Gold, Hoplite, Strategos, Legend; 3 divisions
  each, except Legend, which shows the exact rating and a leaderboard rank.
  10 placement matches *(default)*.
- **Ranked seasons:** monthly, on a UTC calendar. At the end, rating moves
  part way to the mean (soft reset), and rewards are paid by **peak league**:
  Glory, an exclusive banner or shield emblem per league, and a profile title.
- **Leaderboards:** top live and top async, global, plus friends.

## Glory and the duel shop

- **Glory** is earned only in duel modes (ladder, unranked, ranked, season
  rewards) and spent only in the duel shop. It cannot be bought with Stars or
  Drachmae and cannot be traded (no paid power, no gold-farming market).
- The **duel shop** is a tab inside the duel hub:
  - **Recruits** (Team tab → Recruit): pick a class, pay its recruitment
    price in Glory (hoplite 100, archer 50), get a level-1 hero with rolled
    attributes and traits. Unlocks by duel level: line infantry, archers,
    slingers, javelins and peltasts at 1; rhomphaia, falx, Gallic warband and
    fanatics at 3; horse archers and Thessalian horse at 5; royal guard and
    Sacred Band at 8; Companions at 10; chariots at 12.
  - **Gear:** every item at common, uncommon and rare (half its value × 1, 2
    or 4 Glory), plus four **daily offers** (three rares and an epic, 20% off,
    once each per UTC day). Legendary gear only drops on the ladder.
  - **Selling:** a stash item back for a quarter of its shop price.
  - **Respec** (hero sheet → Stats): 20 Glory × level.
  - **Duel cosmetics** (league emblems, banners) for Drachmae come with the
    leagues. They will be the only Drachmae items in the duel shop, and they
    give no power.
- Duel gear never wears out (no losses).

## War-map shops on the map

The war-map shop moves out of the menu and onto the hex map.

- **Where:** every **town** hex gets a merchant beside the existing player
  marketplace. A few seeded **trading posts** per shard (harbours,
  crossroads) carry rarer stock and are worth fighting over.
- **Access:** same rule as listing on the marketplace: you hold the hex, or
  your army stands on it or next to it. The hex's owner (and their clan) get a
  discount *(default: 10%)*, and the owner earns a cut of the merchant's
  sales *(default: 5% of the price in gold, paid by the shop, not the buyer)*.
- **Stock:** a shared base everywhere (consumables, recruits, basic gear)
  plus **regional specialties** by culture or terrain (Cretan bows, Thracian
  blades, Thessalian horses) and a **daily rotating rare slot**. Each item is
  priced in **gold** and some also in **Drachmae** (the shortcut DESIGN_V2.md
  already allows for consumables). Daily caps stay per player, not per shop.
- Stock is generated from `(shard seed, hex, UTC day)` and never stored; only
  per-player daily counters are written to D1.
- The UI opens the shop from the hex panel ("Merchant" next to "Market").

## Wallet (unchanged place)

Stars → Drachmae packs, the season pass and **account-wide cosmetics** stay
in the profile-menu wallet so payments are always one tap away (payment UX
and `/paysupport` compliance). Cosmetics apply in both modes.

## Server outline

- **D1:** `0007_duels.sql` (landed) has `duel_profiles` (Glory, account XP,
  ladder progress, the daily farm counter, the team), `duel_heroes`,
  `duel_items`, `duel_tickets` (ladder battles) and `duel_orders` (Glory
<<<<<<< HEAD
  spends by request id). `0008_duel_ranked.sql` (landed): `duel_ratings`,
  `duel_queue_state` (abandons, cooldown) and `duel_matches`. Seasons and
  rewards come in a later migration; `merchant_purchases` with the map
  merchants.
=======
  spends by request id). Ratings, leagues, matches, seasons and rewards come
  in later migrations. `0009_merchants.sql` (landed) has `merchant_orders`
  (every sale by request id, with the holder's cut) and `merchant_daily`
  (gear counters; consumables count in `consumable_daily`).
>>>>>>> origin/main
- **Durable Objects:** `MatchmakerDO` (queue, pairing, live presence) and
  `DuelDO` (one per live match: lockstep relay, reconnect, replay,
  result). The shard `RegionDO` keeps friendly duels for now and can hand
  them to `DuelDO` later.
- **Routes:** `/api/duel/*` (roster, teams, shop, ladder start and finish,
  async attack start and finish, leaderboard, season) and `/ws/duel`.
  Every change is server-side, idempotent per client request id, and
  validated by replay, as for war-map attacks.

## Client outline

- **Duel hub** scene (new): Play (Ranked / Unranked / Ladder / Async), Army
  (reused army screen on the duel roster), Shop, League and Leaderboard.
- The battle scene takes a duel `BattleSource`; reconnect support in
  `src/online/lockstep.ts` (resume from a sealed log).
- War map: "Merchant" in the hex panel, shop markers on town and trading-post
  hexes, regional stock UI.

## Delivery slices

1. **This doc** + roadmap entry (sign-off before code).
2. **Duel roster and economy:** migration, duel profile, roster and teams,
   power budget, Glory, the duel shop, the PvE ladder with drops, the duel hub.
3. **Live ranked:** `MatchmakerDO`, `DuelDO` with reconnect, unranked and
   ranked queues, Glicko-2, leagues and placements.
4. **Async and seasons:** defence teams and the async ladder, defence log,
   monthly seasons with rewards, leaderboards.
5. **Map merchants:** town and trading-post shops with regional and rotating
   stock, owner discount and cut; the menu shop removed from the war map.

## Open questions

- Exact budget curve, ranked budget and Glory prices: set by playtesting and a
  simulation script before ranked (slice 3) ships; the ladder numbers too.
- Should friendly duels between friends allow the duel army as well as the
  war-map army? *(Default: yes, choose one before challenging.)*
- Anti-smurf beyond the level-5 gate (e.g. a minimum Telegram account age for
  ranked rewards).
