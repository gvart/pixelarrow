# Pixelarrow duels: ranked PvP, duel army and two shops

Duels, the duel shop and war-map merchants. Wins over DESIGN_V2.md here.

## Status

- Rules (numbers here are these constants): `src/duel/rules.ts`
  (`DUEL_RULES`, costs, `offerSummary`), `ladder.ts` (`LADDER`), `rating.ts`
  (`RANKED`), `season.ts` (`SEASON`, `ASYNC`) in `src/duel/`;
  `src/online/merchants.ts` (`MERCHANT`).
- Server: `server/src/duel/`, `server/src/online/merchant.ts`; API in
  server/README.md "Duels". Client: `src/scenes/duel/DuelScene.ts` (layout
  docs/UI_KIT.md "Duels"), `src/duel/heroSource.ts`, `src/duel/match.ts`,
  `src/scenes/online/MerchantScene.ts`; `DemoDuelSource` feeds the layout
  check and `scripts/duel-smoke.mjs`.
- Not built: consumables in unranked/ladder, raid replay viewer (`GET
  /api/duel/async/replay/:id` exists), friends boards.

## Summary

| Topic | Rule |
| --- | --- |
| Duel army | Separate from the war-map army; never reset (only rating soft-resets). |
| Formats | Live 1v1 lockstep; async vs a bot playing a saved defence. One global queue. |
| Losses | **None**: no wounds, death or gear wear in any duel mode. |
| Unlock | Duel mode after the tutorial; **ranked at duel account level 5**. |
| Shops | Duel shop in the duel screen; war-map merchants on regions; wallet in the profile menu. |

## Duel army

- D1 `duel_heroes`, `duel_items`; shared `Hero`/`Item` types and classes.
  **Roster** ≤ 30, **team** ≤ 10. Dismissing is final (gear to stash).
- **Presets:** ≤ 5 teams in stable slots 1..5 (gaps refilled first); Ladder,
  Arena (live, raids) and Defence each use exactly one. Name ≤ 16 chars,
  default "Team <slot>"; the last can't be deleted. Battle groups belong to
  heroes, so presets share them.
- Team shows "!" for unspent points or a free perk slot (`heroNeedsAttention`).
- **Starter:** 2 hoplites, 2 archers, peltast, slinger at level 1, common
  gear, all in the team (42 points); 200 Glory.
- Hero cap `MAX_LEVEL` (10); XP from every duel mode, win or lose.
- **Duel account level** 1-30: level n at 25·n·(n−1) XP. Ladder win 20 + 2 ×
  floor XP, loss a third.

## Power budget

- **Hero cost** = round(class price / 10 × (1 + (level − 1) / 9)): hoplite
  10 → 20, archer 5 → 10, Companion 16 → 32.
- **Item cost:** common 0, uncommon 1, rare 2, epic 4, legendary 6, named
  legendary 7; +1 per active set bonus line (counted as in battle), so a
  full legendary set on one hero is 34. Cosmetics 0 (docs/ITEMS.md "Duel
  fairness").
- **Budget:** ranked and unranked 150; ladder floor 56 + 4 × floor (60 on 1,
  150 from 23).
- Costs in `src/duel/rules.ts`; the server builds the `BattleSetup` from D1
  and rejects over-budget teams; the client only previews.

## Modes

### PvE ladder (farming)

- 50 floors, boss every 10th. `ladderFloor` is pure: an army of the floor's
  level and mix (`src/game/enemy.ts`) fitted to 70% of the budget on floor 1
  up to 115% on 50 (bosses +15%). Only the seed is random.
- **First clear:** 40 + 8 × floor Glory (bosses ×2), account XP, an item
  (uncommon+; boss: rare+ from the beast table, floors 30/40/50 a 25% chance
  of the named legendary: Harpe of Perseus, Helm of Hades, Golden Fleece).
  Boss first-clear drops count on the duel bad-luck counter: after 8 without
  a legendary the next is legendary.
- **Replays:** 10 + floor Glory, XP, 25% drop (named item 2% on 30/40/50).
  Farm Glory cap 300 per UTC day; XP uncapped. 70% of weapons, shields and
  armour fit a roster class.
- Online battle rules (15 s deployment, no pause); server replay before any
  grant.

### Ladder stars and chapters

- Win ★; ★★ if ≤ 50% of team points lost; ★★★ if ≤ 20% (dead or fled
  heroes' costs, from the replay). Best per floor kept.
- Chapters of 10 floors. Chests at 10/20/30 chapter stars, once each: Glory
  60/120/200 in chapter 1, +40/+80/+120 per later chapter. The 30-star chest
  adds a set piece: Agoge of Sparta, Peltast of Thrace, Cretan Bowman (rare,
  ch. 1-3), Warband of Brennus, Immortals of Persia (epic, ch. 4-5).

### Spoils

- Won duel drop chance: unranked 8%, ranked 12%, raids 6%; common 50 /
  uncommon 35 / rare 15. First ranked live win per UTC day always drops
  (uncommon+). Rolled from match seed and side (`duelSpoils`, `SPOILS`), so
  a repeated settlement drops once; reports show it.

### Unranked queue

- Ranked's matchmaker and live battle, no rating; Glory 15 / 10 / 5, same
  account XP.

### Ranked live (1v1)

- One `DuelDO` per match (`/ws/duel/<id>`) on the friendly-duel lockstep
  relay (`server/src/online/relay.ts`): 15 s deployment, no pause, hash
  check every 10 turns, server replay, then settle (`server/src/duel/live.ts`).
- **Entry:** 150-point team, duel level 5, no consumables; field `randomSite`
  from the server seed.
- **Pay:** Glory 30 / 20 / 10, account XP 40 / 25 / 15; hero XP as ladder.
- **Disconnects:** 30 s to return (DO re-sends deployment and sealed turns;
  client catches up at ≤ 120 steps a frame). Not joining, or not reporting
  turns for 30 s while the opponent waits, counts the same. One gone =
  **abandon** (loss); both gone, desync or > 12 min = **void**. Leaving
  during deployment = surrender (loss, not abandon). No bot takeover.
- **Abandons:** 3 in 24 h → 15 min cooldown on both queues, doubling per
  repeat within 24 h, max 4 h.

### Ranked async (defence ladder)

- The defence is a snapshot of the Defence preset (refreshed on change while
  within 150 points); a first attack sets the arena team as defence.
- **Raids** at duel level 5: 10 per UTC day (started ones count); same
  defender not within 24 h. 3 candidates from the 12 defenders nearest the
  async rating (one below, closest, one above), fixed per (player, day,
  raids so far). A raid is a ticket (10 min, server replay).
- Separate Glicko-2 rating (`duel_ratings.ladder = 'async'`); defenders move
  at 50%; defences are not games.
- **Pay:** attacker Glory 20 / 12 / 6, account XP 30 / 20 / 10, hero XP as
  ladder. Defender 5 per hold, 2 per draw, ≤ 50 per UTC day. Raid log keeps
  setup and order log; `duel_defence` notifications fold per 15 min.

## Matchmaking and rating

- **Glicko-2:** 1500 / RD 350 / vol 0.06, τ = 0.5, RD floor 40, one period
  per match; one period per idle UTC day (RD ≤ 350). Live and async separate.
- **Matchmaker:** global `MatchmakerDO` (`/ws/duel`). Window: ranked 100 +
  10/s up to 400, anyone after 90 s; unranked 250 + 25/s up to 800, anyone
  after 30 s. Longest wait first, closest rating within both windows, every
  2 s. Side 0 from the seed.
- **Leagues** (3 divisions of ~67): Bronze < 1200, Silver 1200, Gold 1400,
  Hoplite 1600, Strategos 1800, Legend 2000+. None during 10 placement
  matches; rating shown only in Legend.
- **Seasons:** UTC months. First access in a new month rolls the row
  (`1500 + (r − 1500) × 0.5` per season, RD ≥ 150, peak cleared). Rewards by
  peak league per ladder: Glory 50 / 100 / 180 / 280 / 400 / 600 (raids
  half), a league cosmetic, a title. Live Strategos or Legend peak adds an
  epic Sacred Band piece of choice (`POST /season/pick`, asked until chosen).
- **Leaderboards:** current season's placed players, top 50: live, raids,
  Legend (exact ratings); own rank below.

## Glory and the duel shop

- Glory: earned only in duel modes, spent only in the duel shop; not
  purchasable or tradeable.
- **Recruits:** pay the class price in Glory (hoplite 100, archer 50) for a
  level-1 hero with rolled attributes and traits. By duel level: line
  infantry, archers, slingers, javelins, peltasts 1; rhomphaia, falx, Gallic
  warband, fanatics 3; horse archers, Thessalian horse 5; royal guard,
  Sacred Band 8; Companions 10; chariots 12.
- **Gear:** every item at common/uncommon/rare (half value × 1/2/4 Glory),
  plus 4 daily offers (3 rares, 1 epic, 20% off, once each per UTC day).
  Legendaries only drop. Offers compare up to 3 stats with the team's best
  in that slot (`offerSummary`).
- **Selling:** a quarter of shop price; bound gear (named legendaries,
  legendary set pieces) only salvaged for the same (`/shop/salvage`).
- **Respec:** 20 Glory × level.

## War-map shops on the map

Menu shop buying is closed (`POST /api/economy/buy` → 410 `merchant_only`).

- **Where:** a merchant in every town and capital, plus `post` regions
  (trading posts: harbours, crossroads) with rarer stock.
- **Access:** as for marketplace listing: hold the region or have the army on
  or next to it. Holder and clan get 10% off; holder earns 5% of the list
  gold price of sales to others (paid by the merchant).
- **Stock** per (shard seed, region, UTC day), never stored: the five
  consumables (gold or Drachmae, daily caps across merchants); towns: 3
  basic commons, 2 regional uncommon specialties and 1 rare (by nearest
  capital's culture); trading posts: every specialty plus harbour/crossroads
  goods at rare and 1 epic. Gear costs value × 2/3/5/8 gold by rarity, never
  Drachmae; daily gear caps 2 (basic) and 1 (regional, rare) per player.
- D1 keeps only per-player counters (`merchant_orders`, `merchant_daily`).
  Recruiting stays on the online army screen.
- Region panel "Merchant" opens `MerchantScene`; a stall marks posts.

## Wallet (unchanged place)

Stars → Drachmae, season pass and account cosmetics stay in the profile-menu
wallet (`/paysupport`). Cosmetics apply in both modes.

## Server outline

- **D1:** `duel_profiles` (Glory, XP, ladder progress, farm counter,
  first-win spoil day), `duel_heroes`, `duel_items`, `duel_tickets`,
  `duel_orders`, `duel_ratings`, `duel_queue_state`, `duel_matches`,
  `duel_loadouts`, `duel_defences`, `duel_attacks`, `duel_season_rewards`,
  `duel_ladder_stars`, `duel_ladder_chests`, `loot_pity` (track `duel`).
- `MatchmakerDO`, one `DuelDO` per live match; friendly duels on the shard
  `RegionDO`. Routes `/api/duel/*`, `/ws/duel`: idempotent per request id,
  replay-validated.

