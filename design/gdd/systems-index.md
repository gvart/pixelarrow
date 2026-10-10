# Systems Index: Pixelarrow

> **Status**: Draft
> **Created**: 2026-10-10
> **Last Updated**: 2026-10-10
> **Source Concept**: no `design/gdd/game-concept.md` yet. This index is reverse-documented from the shipped v4 code (`src/`, `server/src/`) and the legacy design docs (`README.md`, `docs/GAMEPLAY.md`, `docs/DESIGN_V2.md`, `docs/DUELS.md`, `docs/ITEMS.md`, `docs/ROADMAP.md`). The v5 concept is due from Phase 2 (`/brainstorm` → VISION).

---

## Overview

Pixelarrow is a live, mobile-first formation tactics game (Phaser 3.90, TypeScript, Vite, Telegram Mini App, portrait at 390x844). Its heart is a deterministic real-time battle sim (`src/sim`, 20 Hz, seeded RNG, orders as logged data) that every mode reuses: the offline overland campaign, the tutorial, the beast trial, the seasonal online war and duels. A Cloudflare Worker (`server/`) replays that same sim to verify online battles, so the sim is shared code, not just client code.

Every system below already exists in code, so none was inferred from a concept doc. **Status** is GDD status: all rows are `Not Started` because no system has a template-format GDD yet, though every one of them is implemented. The **Design Doc** column points at the legacy doc that describes the system today. That doc is where `/design-system retrofit` (or `/reverse-document`) should start.

**Priority tiers are read against the v5 goal** (a polished, deeper game that keeps the core loop's heart: formation tactics, morale breaks, flanking and javelins):
- **MVP**: the battle loop that v5 deepens first. These are the systems behind the 30-second experience of deploying, ordering, clashing and breaking a line.
- **Vertical Slice**: one complete, polished single-player loop: map, encounter, battle, results, hero growth, the camp, menus, onboarding and audio.
- **Alpha**: the shared-sim extensions and the online modes, brought to parity with the new core: item powers, beasts, the war map, duels and verification.
- **Full Vision**: monetization, social and ops systems.

Per-system notes (balanced density):

1. **Deterministic tick and seeded RNG.** A mulberry32 `Rng` and the 20 Hz fixed step. Every replay, server verification and lockstep match depends on them.
2. **Content data tables.** `src/data`: classes, units, items, affixes, sets, perks/abilities, traits, terrain, beasts and consumables. Client and server both read these rules (ROADMAP invariant 6).
3. **Unit stat derivation.** `src/sim/stats.ts` turns a hero, class, perks, traits and gear into HP, morale, stamina, damage and block. It is the balance surface for everything above it.
4. **Formations.** `src/sim/formation.ts` holds five shapes (line, column, wedge, skirmish, shield wall), slot layout and slot assignment. v5's "formations and orders" expansion starts here.
5. **Battle terrain.** A 24x36 seeded grid of terrain kinds and height levels 0–3 that changes speed, cover, block, brace and high-ground bonuses. It is generated from the overland site or the war-map region.
6. **Battle simulation core.** `src/sim/battle.ts` (2,196 lines) covers movement, facing and flanking, melee, reach, charges and braced spears, missiles with ammo, stamina, the morale cascade, rout and rally, knock-outs, the end rules and retreat with pursuit. `Battle.hash()` fingerprints its state.
7. **Orders and abilities.** The `Order` union (form, preset, order hold/advance/charge/fallback, shield wall, loose, detach, rejoin, assign, ability, retreat, horn) is validated and logged by tick. There are four abilities (bash, volley, berserk, rally) and three auras. This is the main v5 mechanic-expansion surface.
8. **Item powers and set specials.** `src/sim/powers.ts` is a hook system (on hit, on being hit, on kill, low HP, timers, small auras) fed from the battle RNG and included in the hash.
9. **Mythical beasts.** `src/sim/myth.ts` (1,285 lines) holds the boss signature moves, with `data/beasts` and `game/beasts`. Players meet beasts in the beast trial, in war-map lairs and as world bosses.
10. **Bot AI.** `src/sim/ai.ts` runs group roles (line, skirmish, flank, reserve), terrain-aware deployment and holding, ability use and the stand-off breaker. It issues the same orders the player does. v5's "enemy variety and AI" expands it.
11. **Enemy army generation.** `game/enemy.ts` `buildArmy` and `armySpec` build armies by culture, size, level, gear tier, power target and make-up (line, bandits, raiders, mercs).
12. **Platform layer.** The Telegram WebApp wrapper (ready, expand, full screen, haptics, CloudStorage), safe areas, render scale and storage. It is a no-op in a plain browser.
13. **Scene framework and back navigation.** `main.ts` registers 20 scenes. `BaseScene`, `platform/nav.ts` (Telegram Back, modal stack, closing confirmation) and the global `state.ts` complete the framework.
14. **Localization.** English and Russian tables (`src/i18n`, 34 files) and the language switch.
15. **Procedural art pipeline.** `src/art` (39 files) holds the 3D-primitive pixel renderer, paper dolls, iso ground, maps, camp art, mosaic chrome, fonts and icon atlases. Apart from the icon atlases and `public/ui` placeholders, all art is generated in code.
16. **Heroes and progression.** Attributes (STR/AGI/END/WIL), two points per level, class perk trees at levels 2/4/6/8/10, traits, XP, wounds, knock-outs, permadeath, battle groups and the muster (field cap versus reserve).
17. **Items and gear.** Rarity, random affixes, attribute requirements and class limits, sets, named legendaries, wear, repair and item sources (`game/gear.ts`, `game/sources.ts`, `data/gearRules.ts`). `docs/ITEMS.md` is partly built.
18. **Loot and battle report.** Kill-based loot picks, gold and XP formulas, and one `report.ts` model for offline battles, verified attacks and duels. `ResultsScene` draws it.
19. **Overland campaign world.** A 112x112 seeded map, A* travel, game time, roaming bands that chase, flee or wander, lairs, the danger gradient and encounters (attack, flee, ransom, let go). `game/campaign.ts` holds the state operations. v5's "campaign events" hook in here.
20. **Settlements, recruits and market.** Village and town recruit pools, market stock refreshing by epoch, rest and the physician. `SettlementScene` and `MarketScene` show them.
21. **Field camp.** Tents, fire, palisade, forge and training ground built from supplies, food, healing and drilling (`world/camp.ts`, `campLayout.ts`, `CampScene`, iso camp art).
22. **Save and migration.** `game/save.ts` is a versioned schema (`SAVE_VERSION = 5`) with a migration chain and validation. Saves are chunked under the CloudStorage 4 KB limit and mirrored to localStorage. **Live players have saves.**
23. **Battle input and controls.** Tap selection, formation move and turn-knob drags (`ui/dragFormation.ts`), tap-to-move and tap-to-attack, ability medallions, pan and pinch zoom, and pause and auto-pause. The v5 touch-first rework (order queue, previews, undo) lands here.
24. **Battle presentation.** `BattleScene` (3,078 lines), `battleHud`, `battlePanel`, `battleFx`, `sprites` and `beastView` read sim state, drain events, run the follow camera and draw the deployment UI.
25. **UI kit and Mosaic components.** The v4 `src/ui/mosaic` library (29 files), `tokens.ts` (WCAG-checked pairs), the layout registry and layout check, and `textfit`. The legacy v3 `ui/v3.ts` and `widgets.ts` are still in use.
26. **Menus, hubs and management screens.** The tab shell (Campaign, Duels, War, Codex, Shop), Menu, Army, Hero, Codex, Kit and FirstRun.
27. **Audio.** Procedural Web Audio covers SFX, modal music layers that follow the battle, and a voice limiter. `audio/hooks.ts` is the single event-to-sound map.
28. **Tutorial and onboarding.** A pure step machine (`game/tutorial.ts`), the narrator, the ghost hand and spotlight, the guided battle, `FirstRunScene` and the online coach marks.
29. **Settings and accessibility.** Sound, music and effects volume, haptics, language, auto-pause, reduced motion (`ui/motion.ts`), notification settings and the gesture-hint flag.
30. **Backend platform and auth.** One Cloudflare Worker (Hono, zod, D1 with 15 migrations, hibernating Durable Objects) with Telegram `initData` HMAC auth, sessions, rate limits and bans.
31. **Cloud save sync.** A `seq` and revision merge (`platform/saveSync.ts`, pure), a debounced PUT, boot adoption and the sync badge.
32. **Battle verification and tickets.** The server fixes the seed and armies, the client submits its order log, and `server/src/battle.ts` replays `src/sim` and applies only its own result.
33. **Online war map.** Seasonal shards of the hand-authored `westmed` region graph: energy, marches, fog, neutral defenders, lairs, online camps, garrisons, income, live armies over WebSocket and world bosses (`src/online`, `server/src/online`, `RegionDO`, `OnlineScene`).
34. **Lockstep netcode.** Sealed turns, hash checks every 10 turns and deployment hold-back (`online/lockstep.ts`, `protocol.ts`, `DuelDO`, the relay). Live duels and friendly duels on the war map both use it.
35. **Clans and marketplace.** Clans, shared land and garrisons, and player trading in gold or Drachmae with a 10% fee.
36. **Duels.** The persistent duel army with a point budget, the PvE ladder (stars, chapters, spoils), the unranked queue, ranked live and async play, rating and matchmaking, seasons, glory and the duel shop (`src/duel`, `server/src/duel`, `DuelScene` at 2,988 lines).
37. **Premium economy and monetization.** Stars buy only Drachmae. The system covers the wallet, season pass, cosmetics, consumables, war-map merchants and daily caps. The server is the authority.
38. **Bot notifications.** The Telegram bot, an outbox, jobs and templates.
39. **Telemetry, monitoring and admin.** Client analytics and telemetry, monitoring, server analytics routes and the admin panel.

**v5 expansion hooks** (from the Director brief). None of these has a GDD yet. Each belongs to an existing system and should be designed there, not as a new row, until Phase 2 decides otherwise:
- abilities → #7
- formations and orders → #4 and #7
- terrain → #5
- enemy variety and AI → #10 and #11
- campaign events → #19
- items → #17
- touch-first controls → #23
- onboarding → #28
- feel and audio → #24 and #27

---

## Systems Enumeration

| # | System Name | Category | Priority | Status | Design Doc | Depends On |
|---|-------------|----------|----------|--------|------------|------------|
| 1 | Deterministic tick and seeded RNG | Core | MVP | Not Started | — (legacy: docs/ROADMAP.md Invariants) | — |
| 2 | Content data tables | Core | MVP | Not Started | — (legacy: docs/GAMEPLAY.md, docs/ITEMS.md) | — |
| 3 | Unit stat derivation | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Hero progression) | Content data tables |
| 4 | Formations | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Controls) | Deterministic tick and seeded RNG |
| 5 | Battle terrain | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Battle terrain) | Deterministic tick and seeded RNG, Content data tables |
| 6 | Battle simulation core | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Battle simulation) | Deterministic tick and seeded RNG, Unit stat derivation, Formations, Battle terrain |
| 7 | Orders and abilities | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Hero progression, Controls) | Battle simulation core, Content data tables |
| 8 | Item powers and set specials | Gameplay | Alpha | Not Started | — (legacy: docs/ITEMS.md Powers, Sets) | Battle simulation core, Content data tables |
| 9 | Mythical beasts | Gameplay | Alpha | Not Started | — (legacy: docs/DESIGN_V2.md Mythical beasts) | Battle simulation core, Orders and abilities |
| 10 | Bot AI | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Bot AI) | Battle simulation core, Orders and abilities, Battle terrain, Formations |
| 11 | Enemy army generation | Gameplay | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Bot AI) | Content data tables, Unit stat derivation, Heroes and progression |
| 12 | Platform layer | Core | MVP | Not Started | — (legacy: README.md Telegram Mini App setup) | — |
| 13 | Scene framework and back navigation | Core | MVP | Not Started | — (legacy: README.md, docs/UI_KIT.md) | Platform layer |
| 14 | Localization | Core | MVP | Not Started | — (legacy: docs/DESIGN_V2.md Localization) | — |
| 15 | Procedural art pipeline | Art | MVP | Not Started | — (legacy: docs/ART_STYLE.md, docs/GAMEPLAY.md Art pipeline) | Content data tables |
| 16 | Heroes and progression | Progression | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Hero progression, Heroes and the army) | Content data tables, Unit stat derivation, Deterministic tick and seeded RNG |
| 17 | Items and gear | Economy | Vertical Slice | Not Started | — (legacy: docs/ITEMS.md, docs/GAMEPLAY.md Equipment) | Content data tables, Unit stat derivation, Heroes and progression |
| 18 | Loot and battle report | Economy | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Loot and rewards) | Battle simulation core, Heroes and progression, Items and gear |
| 19 | Overland campaign world | Gameplay | Vertical Slice | Not Started | — (legacy: docs/GAMEPLAY.md Campaign and the overland map) | Deterministic tick and seeded RNG, Enemy army generation, Heroes and progression, Items and gear |
| 20 | Settlements, recruits and market | Economy | Vertical Slice | Not Started | — (legacy: docs/GAMEPLAY.md Campaign and the overland map) | Overland campaign world, Heroes and progression, Items and gear |
| 21 | Field camp | Gameplay | Vertical Slice | Not Started | — (legacy: docs/GAMEPLAY.md Campaign and the overland map) | Overland campaign world, Heroes and progression |
| 22 | Save and migration | Persistence | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Saves) | Heroes and progression, Items and gear, Overland campaign world, Tutorial and onboarding, Localization |
| 23 | Battle input and controls | UI | MVP | Not Started | — (legacy: docs/GAMEPLAY.md Controls) | Orders and abilities, Formations, Scene framework and back navigation |
| 24 | Battle presentation | UI | MVP | Not Started | — (legacy: docs/UI_KIT.md Battle HUD) | Battle simulation core, Procedural art pipeline, Battle input and controls, UI kit and Mosaic components |
| 25 | UI kit and Mosaic components | UI | MVP | Not Started | — (legacy: docs/UI_KIT.md, docs/redesign/V4_SPEC.md) | Scene framework and back navigation, Localization, Procedural art pipeline |
| 26 | Menus, hubs and management screens | UI | Vertical Slice | Not Started | — (legacy: docs/redesign/V4_SPEC.md Navigation) | UI kit and Mosaic components, Heroes and progression, Items and gear, Save and migration |
| 27 | Audio | Audio | Vertical Slice | Not Started | — (legacy: README.md Audio) | Platform layer, Battle simulation core |
| 28 | Tutorial and onboarding | Meta | Vertical Slice | Not Started | — (legacy: docs/DESIGN_V2.md Localization, audio and onboarding) | Battle input and controls, Battle presentation, Orders and abilities |
| 29 | Settings and accessibility | Meta | Vertical Slice | Not Started | — (legacy: docs/UI_KIT.md) | Platform layer, Localization, Audio |
| 30 | Backend platform and auth | Core | Alpha | Not Started | — (legacy: server/README.md, docs/ROADMAP.md Agreed architecture) | — |
| 31 | Cloud save sync | Persistence | Vertical Slice | Not Started | — (legacy: docs/GAMEPLAY.md Cloud save) | Save and migration, Backend platform and auth |
| 32 | Battle verification and tickets | Core | Alpha | Not Started | — (legacy: docs/ROADMAP.md Battle flow online) | Battle simulation core, Orders and abilities, Backend platform and auth |
| 33 | Online war map | Gameplay | Alpha | Not Started | — (legacy: docs/DESIGN_V2.md) | Backend platform and auth, Battle verification and tickets, Battle terrain, Enemy army generation, Mythical beasts, Heroes and progression |
| 34 | Lockstep netcode | Core | Alpha | Not Started | — (legacy: docs/ROADMAP.md Battle flow online) | Battle simulation core, Orders and abilities, Backend platform and auth |
| 35 | Clans and marketplace | Economy | Full Vision | Not Started | — (legacy: docs/DESIGN_V2.md Clans, Trading) | Online war map, Premium economy and monetization |
| 36 | Duels | Gameplay | Alpha | Not Started | — (legacy: docs/DUELS.md) | Lockstep netcode, Battle verification and tickets, Heroes and progression, Items and gear, Online war map |
| 37 | Premium economy and monetization | Economy | Full Vision | Not Started | — (legacy: docs/DESIGN_V2.md Monetization and economy) | Backend platform and auth, Online war map |
| 38 | Bot notifications | Meta | Full Vision | Not Started | — (legacy: server/README.md Bot notifications) | Backend platform and auth |
| 39 | Telemetry, monitoring and admin | Meta | Full Vision | Not Started | — (legacy: docs/OPS.md) | Backend platform and auth, Platform layer |

---

## Categories

| Category | Description | Systems here |
|----------|-------------|--------------|
| **Core** | Foundation systems everything depends on | #1, #2, #12, #13, #14, #30, #32, #34 |
| **Gameplay** | The systems that make the game fun | #3–#11, #19, #21, #33, #36 |
| **Progression** | How the player grows over time | #16 |
| **Economy** | Resource creation and consumption | #17, #18, #20, #35, #37 |
| **Persistence** | Save state and continuity | #22, #31 |
| **UI** | Player-facing displays and input | #23–#26 |
| **Art** (custom) | Procedural rendering of everything visual | #15 |
| **Audio** | Sound and music systems | #27 |
| **Meta** | Systems outside the core loop | #28, #29, #38, #39 |

Narrative has no row: there is no dialogue or quest system. Narrator lines live in the tutorial (#28).

---

## Priority Tiers

| Tier | Definition | Target Milestone | Design Urgency |
|------|------------|------------------|----------------|
| **MVP** | The v5 battle loop: without these you cannot test whether the deeper tactics are fun | v5 battle-loop playable | Design FIRST |
| **Vertical Slice** | One complete, polished single-player loop (map → battle → results → growth) with new UI, onboarding and audio | v5 campaign slice | Design SECOND |
| **Alpha** | Online modes and sim extensions at parity with the new core | v5 alpha (all modes on the new core) | Design THIRD |
| **Full Vision** | Monetization, social and ops | Beta / release | Design as needed |

Counts: MVP 19, Vertical Slice 9, Alpha 7, Full Vision 4 (39 total).

---

## Dependency Map

### Foundation Layer (no dependencies)

1. Deterministic tick and seeded RNG: every replay, verification and lockstep match rests on it.
2. Content data tables: the shared rules (ROADMAP invariant 6).
3. Platform layer: the Telegram and browser shell every scene runs in.
4. Localization: every visible string passes through it.
5. Backend platform and auth: the root of everything online.

### Core Layer (depends on foundation)

1. Unit stat derivation: depends on Content data tables.
2. Formations: depends on Deterministic tick and seeded RNG.
3. Battle terrain: depends on RNG and Content data tables.
4. Scene framework and back navigation: depends on Platform layer.
5. Procedural art pipeline: depends on Content data tables.
6. Heroes and progression: depends on Content data tables, Unit stat derivation and RNG.
7. Battle simulation core: depends on RNG, Unit stat derivation, Formations and Battle terrain. **Bottleneck:** 9 systems depend on it directly and 15 transitively.

### Feature Layer (depends on core)

1. Orders and abilities: Battle simulation core, Content data tables.
2. Bot AI: Battle simulation core, Orders and abilities, Battle terrain, Formations.
3. Item powers and set specials: Battle simulation core, Content data tables.
4. Mythical beasts: Battle simulation core, Orders and abilities.
5. Enemy army generation: Content data tables, Unit stat derivation, Heroes and progression.
6. Items and gear: Content data tables, Unit stat derivation, Heroes and progression.
7. Loot and battle report: Battle simulation core, Heroes and progression, Items and gear.
8. Overland campaign world: RNG, Enemy army generation, Heroes and progression, Items and gear.
9. Settlements, recruits and market: Overland campaign world, Heroes and progression, Items and gear.
10. Field camp: Overland campaign world, Heroes and progression.
11. Save and migration: Heroes and progression, Items and gear, Overland campaign world, Tutorial and onboarding (it stores tutorial state), Localization. **Bottleneck:** every persisted feature change becomes a migration.
12. Battle verification and tickets: Battle simulation core, Orders and abilities, Backend platform and auth.
13. Lockstep netcode: Battle simulation core, Orders and abilities, Backend platform and auth.
14. Cloud save sync: Save and migration, Backend platform and auth.
15. Online war map: Backend, Battle verification and tickets, Battle terrain, Enemy army generation, Mythical beasts, Heroes and progression.
16. Duels: Lockstep netcode, Battle verification and tickets, Heroes and progression, Items and gear, Online war map (`src/duel/rules.ts` imports `src/online/rules.ts`, and war-map friendly duels use it).
17. Clans and marketplace: Online war map, Premium economy and monetization.
18. Premium economy and monetization: Backend platform and auth, Online war map (merchants sit on the map).

### Presentation Layer (depends on features)

1. UI kit and Mosaic components: Scene framework, Localization, Procedural art pipeline.
2. Battle input and controls: Orders and abilities, Formations, Scene framework.
3. Battle presentation: Battle simulation core, Procedural art pipeline, Battle input and controls, UI kit.
4. Menus, hubs and management screens: UI kit, Heroes and progression, Items and gear, Save and migration.
5. Audio: Platform layer, Battle simulation core (event hooks).

### Polish Layer (depends on everything)

1. Tutorial and onboarding: Battle input and controls, Battle presentation, Orders and abilities.
2. Settings and accessibility: Platform layer, Localization, Audio.
3. Bot notifications: Backend platform and auth.
4. Telemetry, monitoring and admin: Backend platform and auth, Platform layer.

Leaf systems (nothing depends on them; lower risk, can be designed late): Loot and battle report, Settlements, Field camp, Clans and marketplace, Bot notifications, Telemetry, Settings and accessibility, Menus and hubs.

---

## Recommended Design Order

GDDs are retrofits of shipped systems. Effort is the size of documenting the system and folding in its v5 expansion.

| Order | System | Priority | Layer | Agent(s) | Est. Effort |
|-------|--------|----------|-------|----------|-------------|
| 1 | Deterministic tick and seeded RNG | MVP | Foundation | technical-director | S |
| 2 | Content data tables | MVP | Foundation | systems-designer | M |
| 3 | Platform layer | MVP | Foundation | engine-programmer | S |
| 4 | Localization | MVP | Foundation | localization-lead | S |
| 5 | Unit stat derivation | MVP | Core | systems-designer | M |
| 6 | Formations | MVP | Core | game-designer | M |
| 7 | Battle terrain | MVP | Core | level-designer, systems-designer | M |
| 8 | Battle simulation core | MVP | Core | game-designer, systems-designer | L |
| 9 | Heroes and progression | MVP | Core | systems-designer | M |
| 10 | Scene framework and back navigation | MVP | Core | ui-programmer | S |
| 11 | Procedural art pipeline | MVP | Core | technical-artist, art-director | M |
| 12 | Orders and abilities | MVP | Feature | game-designer | L |
| 13 | Bot AI | MVP | Feature | ai-programmer | L |
| 14 | Enemy army generation | MVP | Feature | systems-designer | S |
| 15 | Loot and battle report | MVP | Feature | economy-designer | S |
| 16 | Save and migration | MVP | Feature | lead-programmer | M |
| 17 | UI kit and Mosaic components | MVP | Presentation | ux-designer, ui-programmer | M |
| 18 | Battle input and controls | MVP | Presentation | ux-designer, gameplay-programmer | L |
| 19 | Battle presentation | MVP | Presentation | ux-designer, technical-artist | M |
| 20 | Items and gear | Vertical Slice | Feature | systems-designer, economy-designer | M |
| 21 | Overland campaign world | Vertical Slice | Feature | game-designer, world-builder | L |
| 22 | Settlements, recruits and market | Vertical Slice | Feature | economy-designer | S |
| 23 | Field camp | Vertical Slice | Feature | game-designer | S |
| 24 | Cloud save sync | Vertical Slice | Feature | network-programmer | S |
| 25 | Menus, hubs and management screens | Vertical Slice | Presentation | ux-designer | M |
| 26 | Audio | Vertical Slice | Presentation | audio-director, sound-designer | M |
| 27 | Tutorial and onboarding | Vertical Slice | Polish | ux-designer, writer | M |
| 28 | Settings and accessibility | Vertical Slice | Polish | accessibility-specialist | S |
| 29 | Backend platform and auth | Alpha | Foundation | network-programmer, security-engineer | S |
| 30 | Item powers and set specials | Alpha | Feature | systems-designer | M |
| 31 | Mythical beasts | Alpha | Feature | game-designer, ai-programmer | M |
| 32 | Battle verification and tickets | Alpha | Feature | network-programmer | S |
| 33 | Lockstep netcode | Alpha | Feature | network-programmer | M |
| 34 | Online war map | Alpha | Feature | game-designer, live-ops-designer | L |
| 35 | Duels | Alpha | Feature | game-designer, economy-designer | L |
| 36 | Premium economy and monetization | Full Vision | Feature | economy-designer | M |
| 37 | Clans and marketplace | Full Vision | Feature | economy-designer, community-manager | M |
| 38 | Bot notifications | Full Vision | Polish | live-ops-designer | S |
| 39 | Telemetry, monitoring and admin | Full Vision | Polish | analytics-engineer, devops-engineer | S |

---

## Circular Dependencies

These are module-level import cycles in `src/sim`, observed in the code:

- **Battle simulation core ↔ Bot AI.** `sim/battle.ts` imports `sim/ai.ts`, and `ai.ts` imports `battle.ts`. The AI reads `Battle` state and the battle drives the AI.
- **Battle simulation core ↔ Mythical beasts.** `battle.ts` ↔ `myth.ts`.
- **Battle simulation core ↔ Item powers.** `battle.ts` ↔ `powers.ts`.

**Proposed resolution (design level):** treat each pair as one design unit with a written contract. Each subsystem gets a read-only battle view plus the hook points it uses (on hit, on kill, on tick, issue order). Design #6 with #7, #8, #9 and #10 kept in view, so v5 abilities, AI and powers extend the hooks rather than reach into `Battle` internals. Breaking the cycles in code is optional and needs an ADR. It must not change `Battle.hash()` or replay output.

TD-SYSTEM-BOUNDARY: skipped in lean review mode (rigor `standard` resolves `review_mode: lean`).

---

## High-Risk Systems

| System | Risk Type | Risk Description | Mitigation |
|--------|-----------|-----------------|------------|
| Battle simulation core | Technical | The bottleneck: 9 systems depend on it directly and 15 transitively, it is 2,196 lines, and the server replays it to verify battles. Any rule change alters old replays and pending tickets and can split client and server during a rollout. | Replay and determinism tests before and after each change. Balance with `npm run balance` before and after. Version the sim rules if verified battles must survive a deploy. Write an ADR for rule versioning. |
| Orders and abilities | Technical / Scope | The main v5 expansion surface. New `Order` kinds are logged data that the server validates, so they must stay backward compatible with the server API and with lockstep. | Add orders additively. Give each new kind a replay test and a server test. Design the order queue and undo as client-side UI that emits ordinary orders. |
| Save and migration | Technical | Live players have saves (`SAVE_VERSION = 5`, chunked CloudStorage). A bad migration loses progress, and the cloud copy can spread it across devices. | Every persisted change gets a migration and a fixture test (`save-systems` skill). Test old-save fixtures from each version. |
| Bot AI | Design | v5 wants enemy variety and smarter AI. The AI shares the sim's determinism, and balance depends on it. | Prototype AI personalities behind data. Use the balance harness as the gate. |
| Battle input and controls / Battle presentation | Technical / Scope | `BattleScene` (3,078 lines) and `DuelScene` (2,988 lines) are monoliths. A touch-first controls rework touches both. | Extract controller pieces behind tests (`tests/drag.test.ts` pattern) before the rework. Run the smoke and layout checks. |
| Procedural art pipeline | Technical | A possible Phaser 4 upgrade (V5-005) rebuilds the renderer. 39 art files draw on canvases and textures, and the v3 and v4 UI kits coexist. | Run the technical-director spike (Phase 2) before any screen rebuild. If the upgrade goes ahead, do it as one story. |
| Online war map / Duels / Premium economy | Scope | These systems are server-authoritative. Any change needs matching client and `server/` work, tests and API compatibility, and must not be deployed. Real-money pricing is off-limits. | Keep v5 online changes minimal and additive. Pricing ideas go to `docs/v5/PROPOSALS.md`. |

PR-SCOPE: skipped in lean review mode. CD-SYSTEMS: skipped in lean review mode.

---

## Progress Tracker

| Metric | Count |
|--------|-------|
| Total systems identified | 39 |
| Design docs started | 0 |
| Design docs reviewed | 0 |
| Design docs approved | 0 |
| MVP systems designed | 0/19 |
| Vertical Slice systems designed | 0/9 |

---

## Next Steps

- [ ] Phase 2: write `design/gdd/game-concept.md` (VISION via `/brainstorm`). It becomes this index's source concept.
- [ ] Retrofit GDDs in design order with `/design-system retrofit` (or `/quick-design` for v5 expansions), starting with the MVP systems v5 changes: Orders and abilities, Formations, Bot AI, Battle input and controls.
- [ ] Run `/design-review` on each completed GDD.
- [ ] Write ADRs for the sim-rules versioning and the Phaser 4 decision (V5-005).
- [ ] Run `/gate-check technical-setup` when the MVP systems are designed.
