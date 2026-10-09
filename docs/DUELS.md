# Pixelarrow duels: ranked PvP, duel army and two shops

The duel mode (a persistent duel army, the PvE ladder, unranked and ranked
matchmaking, leagues, seasons), the duel shop and the war-map merchants.
Where it conflicts with DESIGN_V2.md, this document wins for duels and
shops.

## Status

Everything below is shipped: the duel army and its economy, the PvE ladder
with stars and chapter chests, live ranked and unranked, the async defence
ladder ("Raids"), monthly seasons and leaderboards, and the map merchants.

- Shared rules: `src/duel/rules.ts` (`DUEL_RULES`, costs, `offerSummary`),
  `src/duel/ladder.ts` (`LADDER`), `src/duel/rating.ts` (`RANKED`),
  `src/duel/season.ts` (`SEASON`, `ASYNC`), `src/online/merchants.ts`
  (`MERCHANT`). The numbers on this page are those constants; change them
  there.
- Server: `server/src/duel/` (routes, `MatchmakerDO`, `DuelDO`, settlement,
  raids, seasons), `server/src/online/merchant.ts`; API in server/README.md
  "Duels". Migrations 0007-0010 and 0014.
- Client: `src/scenes/duel/DuelScene.ts` (Menu → Duels; layout in
  docs/UI_KIT.md "Duels"), the hero sheet on the duel army
  (`src/duel/heroSource.ts`), live matches through `src/duel/match.ts`, the
  merchants in `src/scenes/online/MerchantScene.ts`. An in-memory
  `DemoDuelSource` drives the layout check and `scripts/duel-smoke.mjs`.
- Not built: consumables in unranked and on the ladder, a raid replay viewer
  (`GET /api/duel/async/replay/:id` already serves setup and order log),
  friends boards (no friends list yet).

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
  groups and formations. The duel hub's Team view picks the team; a tap opens
  the regular hero sheet on the duel army (stats, gear, perks, skills,
  respec). A dismissed hero leaves for good (gear to the stash, no refund).
- **Presets:** up to five saved teams (slots 1..5, kept stable: a deleted
  preset leaves a gap the next new one fills). Each of Ladder, Arena (live
  matches and raids) and Defence uses one; a use always has exactly one
  preset. Names ≤ 16 characters, default "Team <slot>"; the last preset
  cannot be deleted. Battle groups belong to the hero, so presets share them.
- **Attention badge:** a hero with unspent attribute points or a free perk
  slot (`heroNeedsAttention`) marks Team with a "!".
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
- **Ranked budget:** 150 points for everyone.
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

### Ladder stars and chapters

- A won floor earns ★ (a win), ★★ (at most 50% of the team's points lost) or
  ★★★ (at most 20%). Lost points are the costs of the heroes that died or
  fled, from the server's replay. The best per floor is kept.
- **Chapters** of 10 floors, the boss last. **Chests** at 10 / 20 / 30
  chapter stars, each claimed once: Glory 60 / 120 / 200 in chapter 1, +40 /
  +80 / +120 per later chapter; the 30-star chest also holds a rare-or-better
  item (rare 70%, epic 25%, legendary 5% in chapter 1, rarer later).

### Unranked queue

- Same global matchmaker and the same live lockstep battle as ranked, without
  rating changes. Pays XP and reduced Glory. A good place to try new builds.
- Consumables: allowed by design (1 per battle), not built yet.
- Rewards are half of ranked (Glory 15 / 10 / 5); the same account XP.

### Ranked live (1v1)

- One **`DuelDO`** per match (`/ws/duel/<id>`) on the lockstep relay shared
  with friendly duels (`server/src/online/relay.ts`): a 15 s deployment, no
  pause or speed-up, hash checks every 10 turns, a server replay at the end,
  then the result is written (`server/src/duel/live.ts`).
- **Entry:** the team fits the 150-point budget; duel level 5. **No
  consumables.** The field is `randomSite` from the server seed.
- **Per match:** win 30 Glory, draw 20, loss 10; account XP 40 / 25 / 15;
  hero XP as on the ladder, win or lose.
- **Disconnects:** 30 s to come back (the DO re-sends the deployment and
  every sealed turn; the client runs through them at up to 120 steps a
  frame). Not joining within 30 s, or not reporting turns for 30 s while the
  opponent waits, counts the same. A player gone is an **abandon** and loses;
  both gone, a desync, or a match past 12 minutes is **void** (nothing
  changes). Back during deployment is a surrender (a loss, not an abandon).
  The bot never takes over.
- **Abandons:** 3 in 24 h → a 15-minute cooldown on both queues, doubling
  for each repeat within 24 h, at most 4 h.

### Ranked async (defence ladder)

- Each player sets a **defence team**; the server bot plays it. The defence
  is a snapshot of the Defence preset (refreshed on every change while it
  fits the 150-point budget). Attacking for the first time sets the arena
  team as the defence.
- **Raids** unlock at duel level 5: 10 rated raids a UTC day (every raid
  started counts), the same defender not again within 24 h. The server offers
  3 candidates out of the 12 defenders nearest the attacker's async rating
  (one below, the closest, one above), fixed per (player, day, raids so far),
  so there is no rerolling. A raid is a ticket like a ladder floor (10
  minutes, server replay).
- A **separate Glicko-2 rating** (`duel_ratings.ladder = 'async'`), since a
  bot-played defence is weaker than a human. Defenders move at 50% both ways;
  defences do not count as games.
- **Pay:** attacker win 20 Glory / draw 12 / loss 6, account XP 30 / 20 / 10,
  hero XP as on the ladder. Defender: 5 Glory per held defence, 2 per draw,
  at most 50 a UTC day. The raid log keeps every raid with its setup and
  order log; `duel_defence` notifications fold into one message per 15
  minutes.

## Matchmaking and rating

- **Rating:** Glicko-2, start 1500 / RD 350 / volatility 0.06, τ = 0.5, RD
  floor 40, one rating period per match. Separate ratings for live and async.
  Inactivity: one rating period per idle UTC day (RD grows, up to 350).
- **Matchmaker:** one global `MatchmakerDO` (`/ws/duel`). Window (rating gap
  both players accept, by wait): ranked 100 + 10/s up to 400, anyone after
  90 s; unranked 250 + 25/s up to 800, anyone after 30 s. Greedy: the longest
  wait first, the closest rating that fits both windows, re-paired every 2 s.
  A pair gets a `DuelDO`; side 0 is picked by the seed.
- **Leagues** (rating floors, 3 divisions of ~67 points): Bronze < 1200,
  Silver 1200, Gold 1400, Hoplite 1600, Strategos 1800, Legend 2000+. No
  league during the 10 placement matches; the rating shows only in Legend.
- **Ranked seasons:** UTC calendar months. No cron: the first access in a new
  month rolls a rating row over once (`1500 + (r − 1500) × 0.5` per season
  passed, RD at least 150, peak cleared). Rewards by the season's **peak
  league** per ladder: Glory Bronze 50, Silver 100, Gold 180, Hoplite 280,
  Strategos 400, Legend 600 (raids pay half), a league cosmetic (not for
  sale) and a title shown on the boards and the season popup.
- **Leaderboards:** the running season's placed players, top 50: live,
  raids, and Legend (exact ratings); your own rank below the list. Players
  who have not opened the duels in a new month appear once they do.

## Glory and the duel shop

- **Glory** is earned only in duel modes (ladder, unranked, ranked, season
  rewards) and spent only in the duel shop. It cannot be bought with Stars or
  Drachmae and cannot be traded (no paid power, no gold-farming market).
- The **duel shop** is a view of the duel hub (the header's Shop icon):
  - **Recruits** (Team → Recruit): pick a class, pay its recruitment
    price in Glory (hoplite 100, archer 50), get a level-1 hero with rolled
    attributes and traits. Unlocks by duel level: line infantry, archers,
    slingers, javelins and peltasts at 1; rhomphaia, falx, Gallic warband and
    fanatics at 3; horse archers and Thessalian horse at 5; royal guard and
    Sacred Band at 8; Companions at 10; chariots at 12.
  - **Gear:** every item at common, uncommon and rare (half its value × 1, 2
    or 4 Glory), plus four **daily offers** (three rares and an epic, 20% off,
    once each per UTC day). Legendary gear only drops on the ladder. Each
    offer shows up to 3 main stats against the best item the team wears in
    that slot (`offerSummary`).
  - **Selling:** a stash item back for a quarter of its shop price.
  - **Respec** (hero sheet → Stats): 20 Glory × level.
  - League cosmetics are season rewards only; nothing in the duel shop gives
    power for Drachmae.
- Duel gear never wears out (no losses).

## War-map shops on the map

Consumables and gear for the war season are sold on the war map, not in the
menu shop (`POST /api/economy/buy` answers 410 `merchant_only`).

- **Where:** every town and capital has a merchant beside the player
  marketplace, plus seeded **trading posts** (`post` regions of the map:
  harbours and crossroads) with rarer stock, worth fighting over.
- **Access:** as for listing on the marketplace: you hold the region, or
  your army stands on it or next to it. The holder and their clan get 10% off;
  the holder earns 5% of the list gold price of every sale to someone else,
  paid by the merchant, not the buyer.
- **Stock** per (shard seed, region, UTC day), never stored: the five
  consumables (gold or Drachmae, daily caps across all merchants), 3 basic
  common pieces, 2 regional specialties at uncommon and 1 rare in towns
  (by the nearest capital's culture: Cretan bows, Thracian blades, xyston
  lances, Boeotian helms...); every specialty plus harbour or crossroads goods
  at rare and 1 epic at trading posts. Gear costs item value × 2/3/5/8 gold
  by rarity and is never sold for Drachmae; daily gear caps 2 (basic) and 1
  (regional, rare) per player.
- Only per-player counters are written to D1 (`merchant_orders`,
  `merchant_daily`). Recruiting stays on the online army screen.
- The region panel's "Merchant" opens `MerchantScene`; a stall marks trading
  posts on the map.

## Wallet (unchanged place)

Stars → Drachmae packs, the season pass and **account-wide cosmetics** stay
in the profile-menu wallet so payments are always one tap away (payment UX
and `/paysupport` compliance). Cosmetics apply in both modes.

## Server outline

- **D1:** `duel_profiles` (Glory, account XP, ladder progress, the daily farm
  counter), `duel_heroes`, `duel_items`, `duel_tickets` (ladder battles and
  raids), `duel_orders` (Glory spends by request id), `duel_ratings`,
  `duel_queue_state`, `duel_matches`, `duel_loadouts`, `duel_defences`,
  `duel_attacks` (raids and the raid log), `duel_season_rewards`,
  `duel_ladder_stars`, `duel_ladder_chests`.
- **Durable Objects:** `MatchmakerDO` (queue, pairing, live presence) and
  `DuelDO` (one per live match). Friendly duels stay on the shard `RegionDO`.
- **Routes:** `/api/duel/*` and `/ws/duel`. Every change is server-side,
  idempotent per client request id, and validated by replay.

## Open questions

- Budget curve, ranked budget, Glory prices and ladder numbers: tune with
  playtesting.
- Should friendly duels between friends allow the duel army as well as the
  war-map army? *(Default: yes, choose one before challenging.)*
- Anti-smurf beyond the level-5 gate (e.g. a minimum Telegram account age for
  ranked rewards).
