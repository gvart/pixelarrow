# Pixelarrow duels: ranked PvP, duel army and two shops

Decisions from the design interview (2026-10-07). Covers the duel mode
(a persistent duel army, the PvE ladder, unranked and ranked matchmaking,
leagues), the duel shop and the move of the war-map shop onto map tiles.
Where it conflicts with DESIGN_V2.md, this document wins for duels and
shops. Values marked *(default)* were not settled in the interview and are
starting points to tune.

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
| Consumables | **Not in ranked**; allowed in the PvE ladder and unranked. |
| Disconnects | **30 s to reconnect**, then a loss; repeat leavers get a queue cooldown. |
| Unlock | Duel mode after the tutorial; **ranked at duel account level 5**. |
| Shops | **Duel shop**: a menu inside the duel screen. **War-map shop**: merchants **on map tiles** (towns and trading posts), selling for gold and Drachmae. **Wallet** (Stars → Drachmae, pass, account cosmetics) stays in the profile menu. |

## Duel army

- A second roster per account (`duel_heroes`, `duel_items` in D1), never
  touched by season resets or the war-map economy. Heroes reuse the shared
  `Hero`/`Item` types, classes, perk trees and abilities (`src/data`), so the
  sim needs nothing new.
- **Roster** up to 30 heroes *(default)*; a **team** is up to 10 of them, in
  groups and formations as in the existing army screen (`OnlineArmyScene`
  reused with a duel data source).
- **Loadouts:** up to 3 saved teams *(default)*: e.g. one live ranked team,
  one async defence team, one ladder team.
- **Starter roster** after the tutorial: 6 level-1 heroes (2 hoplites,
  2 archers, 1 peltast, 1 slinger) *(default)* with common gear, enough to
  fill an early budget.
- Hero level cap stays `MAX_LEVEL` (10). XP comes from ladder battles,
  unranked and ranked (winning and losing both pay; winning pays more).
- **Duel account level** (1–30 *(default)*): the sum of progress across the
  roster, or its own XP track. It gates ranked (level 5) and elite classes.

## Power budget

The budget keeps ranked a contest of build and skill. Progression gives
**choice** (more classes, perks, item types, veterans), not an automatic
win.

- **Hero cost** = class base cost + level cost. A level-10 veteran is much
  stronger than a recruit, but costs about twice as much *(default curve)*,
  so the trade is "few elites or many recruits".
- **Item cost** by item type and rarity (common 0, uncommon +1, rare +3,
  epic +6, legendary +10 *(default)*). Cosmetics cost nothing.
- **Ranked budget:** one fixed value for everyone, e.g. 100 points
  *(default; tune so a team of 10 mid-level heroes with uncommon/rare gear fits)*.
- **Unranked** uses the same budget. **PvE ladder** stages each set their own
  budget (rising floor by floor), so a growing roster matters there.
- Costs live in `src/data/duelCosts.ts` (data-driven, shared with the
  server). The server rebuilds the `BattleSetup` from D1 and rejects a team
  over budget; the client only previews.

## Modes

### PvE ladder (farming)

- Floors of hand-tuned bot armies with rising budgets and fixed seeds
  *(default: 50 floors at launch, a boss every 10th)*, built from
  `src/game/enemy.ts` and `setBotLevel`.
- **First clear:** Glory, XP and a guaranteed item drop. **Replays** of
  cleared floors: smaller Glory, XP and a rarity-rolled drop chance (the
  farm loop). A daily cap on farm Glory *(default)* keeps the economy in
  check; XP is uncapped.
- Offline-style rules: pause allowed, consumables allowed (1 per battle).
  The result is still verified by server replay (seed + order log) before
  anything is granted.

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
- The **duel shop** is a tab inside the duel screen:
  - **Recruits:** pick a class, pay Glory, get a level-1 hero with rolled
    attributes and traits. Elite classes (royal guard, Sacred Band, Companion
    cavalry, chariot) unlock at duel account levels or ladder floors.
  - **Gear:** a fixed catalogue by type and rarity up to rare, plus a daily
    rotation slot that can offer epics *(default)*. Legendary gear only drops
    on the ladder *(default)*.
  - **Respec:** reset a hero's attributes and perks for Glory.
  - **Duel cosmetics** (league emblems, banners) for Drachmae. This is the
    only Drachmae item in the duel shop, and it gives no power.
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

- **D1 migration** `0007_duels.sql`: `duel_profiles` (account level, Glory,
  ladder floor, ratings and RD per ladder, league, cooldowns),
  `duel_heroes`, `duel_items`, `duel_teams`, `duel_matches` (seed, order log
  reference, result, rating deltas), `duel_seasons`, `duel_rewards`,
  `merchant_purchases` (per-player daily counters).
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
  simulation script before slice 2 ships.
- Should friendly duels between friends allow the duel army as well as the
  war-map army? *(Default: yes, choose one before challenging.)*
- Anti-smurf beyond the level-5 gate (e.g. a minimum Telegram account age for
  ranked rewards).
- Trading-post count per shard and whether they appear on fog-hidden hexes.
