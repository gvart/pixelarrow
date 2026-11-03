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

Superseded or changed: W-56, W-58, W-60 (souls claimable under the path's cap), W-66 and W-68 (raised men wait at home;
the Tunnel's "up to 6" must fit the 4-soldier cap), W-81. W-63 is extended by W-94.

Also assumed: wipe and reshard freely, with no migration of old data (no live users); existing sprites are reused, with
PixelLab only for real gaps.

## Open design items

Propose these in the named work item and get the owner's answer before building them.

- [ ] How someone becomes king, how titles pass, tribute rates (item 8).
- [ ] Perk lists for each path (item 5).
- [ ] Raid loss limits and how empty towns get guards (item 6).
- [ ] Family list and what each family's men can do. Only hoplite, militia, archer, slinger, javelineer and celt_sword have
  work animations; riders wait for mounts (item 4).
- [ ] Where workers come from. Civilians exist (household `min(4, 1 + fit/4)`), but how they are acquired was not confirmed.
- [ ] Whether a trader's cart cap rises above today's 2 (3 with emporos).

## Work items

Each item bumps `SIM_VERSION` (`src/sim/version.ts`) and `NET_VERSION` (`src/war/net/protocol.ts`) as needed.

- [ ] **1. Rules.** Update `docs/WAR.md` and the W-xx log to match the decisions above.
  verify: each superseded decision is marked. depends on: none.
- [ ] **2. Wipe and path choice.** Reset migration after `0052` (precedent `0012_map_v3_reset.sql`), a path screen replacing
  `squadScreen` in `src/war/menu/screens.ts`, path stored on the player.
  verify: seeded tests, whole-screen shots. depends on: 1.
- [ ] **3. One region.** Player-level rule at `claimForJoin` (`server/src/war/persons.ts`), remove partial `depart` and
  `TransferOrder` splits, raised men and captives wait at home.
  verify: transfer and join tests. depends on: 2.
- [ ] **4. Soldier limits.** Path caps replacing `ARMY_MAX` use, one family for warriors.
  verify: scenario tests. depends on: 2.
- [ ] **5. Levels and perks.** Favour track becomes three perk trees (`src/war/view/hud/favour.ts` and the sim).
  verify: tests per path. depends on: 4.
- [ ] **6. Staffed buildings.** Work only while staffed, access levels, owner's share, private houses, empty-building raids.
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
