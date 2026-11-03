# Paths rework

Temporary. Delete this file in the change that completes the work; lasting rules move to `docs/WAR.md` and the W-xx
log in `docs/impl/global-war-rebuild.md`.

## Goal

Every player is an unseen demigod on a season-locked path (warrior, builder or trader), in a world where nothing works
unless someone is actually there.

## Decisions (owner, 2026-11-03)

- **W-82 Unseen demigod.** Every player is a demigod on every path. The demigod is never a field unit and has no sprite;
  its power acts through the player's men, buildings and carts. Keeps the "hero brawler" anti-pillar.
- **W-83 Season-locked paths.** The path is chosen at season start and fixed for 28 days. Demigod level resets each season.
- **W-84 Level-up perks.** Each path has its own perks, unlocked by levelling. Levels come from doing that path's work.
  The 12-level divine favour track becomes this system. *(How levels are earned is assumed, not owner-picked.)*
- **W-85 Hard soldier caps.** Warrior 12, builder 4, trader 4. Replaces W-56's free squad. Start numbers, changed only on
  balance evidence. *(Builder and trader at 4 is assumed from the owner's "2-4".)*
- **W-86 One warrior family.** A warrior picks one family (e.g. phalanx, Celtic warband, skirmishers). Level-ups unlock its
  stronger classes. No mixing between families.
- **W-87 Strict one region.** All of a player's people and carts are in one region or on one road, and travel as one group.
  Nothing they own acts unless someone is there. No automated drovers, no self-firing towers. Replaces W-58.
- **W-88 Staffed buildings.** A building works only while a person is working in it; that person need not be the owner.
- **W-89 Access and terms.** Each building is set to private, household/vassals, alliance or anyone, with a share of output
  or fee kept by the owner.
- **W-90 Private houses.** A player can own a house holding their belongings. It is protected only by its walls and locks.
- **W-91 Empty buildings can be attacked.** Only walls and locks protect them. Raid losses are limited so a small builder
  is not wiped out. Replaces W-81's guard threshold. *(Assumed from "real simulation"; the limit is unset, see risks.)*
- **W-92 Winning.** Land still decides the single alliance win (Omphalos plus 3 of 4 frontier towns for 24 h). Builders and
  traders win by supplying the war. Each path also has its own ranked ladder.
- **W-93 Solo progress.** Builders and traders get path story chains and NPC towns that buy and sell. Warrior players can
  be hired for monsters. W-72 stands: no AI ally squads, no solo claim exceptions.
- **W-94 Full feudal hierarchy.** Kings, vassals, titles, tribute and succession ship in this rework, built last. Alliances
  stay the season team, with the hierarchy inside them. *(Alliance nesting is assumed.)*

Decided while building item 2: **W-95 small start, grow to cap**, **W-96 full season reset**, settlements, crowns and
mastery included (owner confirmed). Item 3, by the desk, overrulable: **W-97**, **W-98**, **W-99**, **W-100**. Item 4, by the
desk, overrulable: **W-101** who may join, **W-102** Tunnel under the cap, **W-103** workers, **W-104** carts, **W-105** a seized
cart, **W-106** no path.

Superseded or changed: W-44 (NPC towns, W-93), W-53 (its "cap of 12 stays", W-85), W-56, W-58, W-60 (souls claimable under
the path's cap), W-66 and W-68 (raised men wait at home; the Tunnel's "up to 6" fits the cap, W-102; W-66's permanent
favour, W-83), W-81. W-63 is extended by W-94.

Also assumed: wipe and reshard freely, with no migration of old data (no live users); existing sprites are reused, with
PixelLab only for real gaps.

## Open design items

Propose these in the named work item and get the owner's answer before building them.

- [ ] How someone becomes king, how titles pass, tribute rates (item 8).
- [ ] Perk lists for each path (item 5).
- [x] Raid loss limits and how empty towns get guards. W-130: what his group can carry; W-134: people, guard contracts stay.
- [ ] What each family's men can do, and its stronger classes. The list is three of today's four (item 2, default). Only hoplite,
  militia, archer, slinger, javelineer and celt_sword have work animations (item 4).
- [ ] Riders return once mounts exist. Hidden from the start by the owner: no work animations, balance unchecked.
- [ ] Where more workers come from. A builder or trader starts with 2 (item 2, default), and W-103 sets how many he may keep,
  but the only way to gain one today is a level-10 soldier retiring into a trade. A trader with no engineer cannot build a cart.
- [x] Whether a trader's cart cap rises. W-104: trader 4, warrior 1, builder 1, Emporos adds none.

Found while bringing `docs/WAR.md` in line (item 1). Each is a rule the decisions touch but do not settle.

- [x] What each path starts with, men and classes, now the free pick of 12 is gone. W-95; defaults in `src/war/world/start.ts`.
- [x] Season rollover. W-96: a full reset, so a 12-man warrior who turns builder starts over like anyone.
- [x] Offline players. W-97: men are there whether he is online or not; no new road leg starts while he is offline.
- [x] Waiting and wounded men. W-98: a waiting man is off the field; the wounded travel with the group on their usual timer.
- [x] Classes for builder and trader soldiers, and a soul outside a warrior's family. W-101: any non-rider guard; a warrior
  only his own, the rest stay for someone else. The Tunnel's fallback: W-102.
- [ ] Souls wake by site, so families do not grow alike: swordsmen wake only at lairs and old battlefields, and 12 mixed
  skirmishers lost to the chiefs and bandit lairs in the seeded check under a plain attack order (item 5, or a balance pass).
- [ ] How levels are paid per path: today's favour amounts are all war and land, region mastery and warlords pay favour,
  and the old bonus on raised men has no place yet (item 5).
- [x] What counts as "working" under W-88 beyond workplaces. W-120..W-123, W-135. Whether empty land scores is item 9.
- [x] Goods that move with nobody carrying them, and where the owner's share sits. W-124, W-126. Tribute is item 8.
- [x] Walls and locks. W-130, W-131, W-132.
- [x] Warlord raids after W-91. W-133.
- [x] "Owner" under W-89. W-125; the recruit-pool table rows are gone.
- [ ] NPC towns against W-44: which towns, what prices, and where their coin comes from, since coin is otherwise only
  minted silver and the owner rejected a coin sink in W-72 (item 7).
- [ ] The hire contract for monsters: a new kind or the guard and escort contracts, and whether it stays inside the
  alliance as build and guard do (item 7). Guard contracts for empty towns: yes, W-134.
- [ ] What builders and traders do in the guide, tasks and region mastery, which all assume a fighting army (items 7, 9).
- [ ] Hierarchy against older decisions: W-64's elected crown, one per alliance, against W-94's kings; W-63's settlements
  and vassals across alliances against "the hierarchy inside them" (item 8).
- [ ] No hegemony by day 28. Today the top score wins, and it counts trade, contracts, works and town level as well as
  land: does that fallback stay under "land decides"? Do W-61's per-alliance score caps stay? What does each path's
  ladder rank, and do W-61's titles become it (item 9)?

## Work items

Each item bumps `SIM_VERSION` (`src/sim/version.ts`) and `NET_VERSION` (`src/war/net/protocol.ts`) as needed.

- [x] **1. Rules.** Update `docs/WAR.md` and the W-xx log to match the decisions above.
  verify: each superseded decision is marked. depends on: none.
- [x] **2. Wipe and path choice.** Reset migration after `0052` (precedent `0012_map_v3_reset.sql`), a path screen replacing
  `squadScreen` in `src/war/menu/screens.ts`, path stored on the player.
  verify: seeded tests, whole-screen shots. depends on: 1.
- [x] **3. One region.** Player-level rule at `claimForJoin` (`server/src/war/persons.ts`), remove partial `depart` and
  `TransferOrder` splits, raised men and captives wait at home.
  verify: transfer and join tests. depends on: 2.
- [x] **4. Soldier limits.** Path caps replacing `ARMY_MAX` use, one family for warriors.
  verify: scenario tests. depends on: 2.
- [ ] **5. Levels and perks.** Favour track becomes three perk trees (`src/war/view/hud/favour.ts` and the sim).
  verify: tests per path. depends on: 4.
- [x] **6. Staffed buildings.** Work only while staffed, access levels, owner's share, private houses, empty-building raids.
  verify: sim and server tests, `bench:war`. depends on: 3.
- [ ] **7. Builder and trader loops.** NPC markets, warrior hire contracts, path story chains (`lore-writer`).
  verify: a seeded solo run on each path. depends on: 5, 6.
- [ ] **8. Feudal hierarchy.** Kings, vassals, titles, tribute, succession on top of W-63.
  verify: scenario tests. depends on: 6; owner answer on the open item.
- [ ] **9. Winning and HUD.** Path ladders, remove multi-region UI (`armyPanel.ts`, `roster/state.ts`, `world-view/map.ts`,
  `titleMenu`), guide per path.
  verify: `balance:war`, `hud-reviewer` shots. depends on: 7, 8.

Items 3 and 4 can run in parallel only if their file sets stay apart; both touch persons and units, so check first.

## Risks

- **Empty towns.** A 4-man builder has almost nothing protecting an empty town. Balance runs may push the cap up.
- **Art gap.** Families without work animations may need sprites or cannot gather.
- **Feudal rules are untested and least defined.** That is why they come last.
- **Blast radius.** `src/war/scenarios/index.ts`, `tests/war/souls`, `tunnel`, `guide`, `squadSize`, `carts`, `trade`,
  `server/test/war/start`, `persons` and `lifecycle` all assume today's army.
- **Uncommitted work on `main`.** Worktrees will not include the owner's local changes in `src/war/menu/*`,
  `src/war/view/*` and `public/_headers`. Item 2 and item 9 touch the same menu files.
