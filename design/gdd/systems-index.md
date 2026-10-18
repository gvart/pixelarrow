# Systems Index: Pixelarrow

> **Status**: Draft
> **Created**: 2026-10-10
> **Last Updated**: 2026-10-13 (P2-DOCS: v5 statuses checked against `src/`, v6 systems #42–#51 added)
> **Source Concept**: `design/gdd/game-concept.md` (v5). v6 scope: `docs/playbook/director-brief-v6.md` and `docs/ROADMAP.md` "Next: v6". Rows #1–#39 were reverse-documented from the shipped v4 code and the legacy design docs (`README.md`, `docs/GAMEPLAY.md`, `docs/DESIGN_V2.md`, `docs/DUELS.md`, `docs/ITEMS.md`, `docs/ROADMAP.md`).

---

## Overview

Pixelarrow is a live, mobile-first formation tactics game (Phaser 3.90, TypeScript, Vite, Telegram Mini App, portrait at 390x844). Its heart is a deterministic real-time battle sim (`src/sim`, 20 Hz, seeded RNG, orders as logged data) that every mode reuses: the offline overland campaign, the tutorial, the beast trial, the seasonal online war and duels. A Cloudflare Worker (`server/`) replays that same sim to verify online battles, so the sim is shared code, not just client code.

Systems #1–#41 exist in code, so none was inferred from a concept doc. **Status** uses the template vocabulary (`Not Started / In Design / In Review / Approved / Implemented`). Every v5 row is `Implemented`: v5 shipped all of them with no cuts (`docs/v5/REPORT.md`, V5-055), and each status was checked against `src/` on 2026-10-13. The **Design Doc** column names the v5 quick-design GDD where one exists, then the legacy doc. A system with only a legacy doc still has no template-format GDD; `/design-system retrofit` (or `/reverse-document`) starts from it. The v6 rows (#42–#51) are `Not Started`: none of them is in `src/` yet.

**Priority tiers for #1–#41 are read against the v5 goal** (a polished, deeper game that keeps the core loop's heart: formation tactics, morale breaks, flanking and javelins):
- **MVP**: the battle loop that v5 deepens first. These are the systems behind the 30-second experience of deploying, ordering, clashing and breaking a line.
- **Vertical Slice**: one complete, polished single-player loop: map, encounter, battle, results, hero growth, the camp, menus, onboarding and audio.
- **Alpha**: the shared-sim extensions and the online modes, brought to parity with the new core: item powers, beasts, the war map, duels and verification.
- **Full Vision**: monetization, social and ops systems.

Per-system notes (balanced density):

1. **Deterministic tick and seeded RNG.** A mulberry32 `Rng` and the 20 Hz fixed step. Every replay, server verification and lockstep match depends on them.
2. **Content data tables.** `src/data`: classes, units, items, affixes, sets, perks/abilities, traits, terrain, beasts and consumables. Client and server both read these rules (ROADMAP invariant 6).
3. **Unit stat derivation.** `src/sim/stats.ts` turns a hero, class, perks, traits and gear into HP, morale, stamina, damage and block. It is the balance surface for everything above it.
4. **Formations.** `src/sim/formation.ts` holds six shapes (line, column, wedge, skirmish, shield wall and, since v5, the orb), slot layout and slot assignment. v5 added the orb and the feint, focus and face orders (`formations-orders.md`).
5. **Battle terrain.** A 24x36 seeded grid of terrain kinds and height levels 0–3 that changes speed, cover, block, brace and high-ground bonuses. It is generated from the overland site or the war-map region. v5 added field works (stakes, ditch, laager, palisade, rampart; `field-works.md`).
6. **Battle simulation core.** `src/sim/battle.ts` (3,458 lines) covers movement, facing and flanking, melee, reach, charges and braced spears, missiles with ammo, stamina, the morale cascade, rout and rally, knock-outs, the end rules and retreat with pursuit. `Battle.hash()` fingerprints its state.
7. **Orders and abilities.** The `Order` union (form, preset, order hold/advance/charge/fallback, shield wall, loose, detach, rejoin, assign, ability, retreat, horn) is validated and logged by tick. v5 shipped 11 actives (bash, volley, berserk, rally plus the seven signature actives) and the Standard (`abilities.md`); sim rules are versioned by `SIM_VERSION = 2` (`src/sim/version.ts`).
8. **Item powers and set specials.** `src/sim/powers.ts` is a hook system (on hit, on being hit, on kill, low HP, timers, small auras) fed from the battle RNG and included in the hash.
9. **Mythical beasts.** `src/sim/myth.ts` (1,285 lines) holds the boss signature moves, with `data/beasts` and `game/beasts`. Players meet beasts in the beast trial, in war-map lairs and as world bosses.
10. **Bot AI.** `src/sim/ai.ts` runs group roles (line, skirmish, flank, reserve), terrain-aware deployment and holding, ability use and the stand-off breaker. It issues the same orders the player does. v5 added the five doctrines and captains (`src/data/doctrines.ts`, `ai-doctrines.md`).
11. **Enemy army generation.** `game/enemy.ts` `buildArmy` and `armySpec` build armies by culture, size, level, gear tier, power target and make-up (line, bandits, raiders, mercs).
12. **Platform layer.** The Telegram WebApp wrapper (ready, expand, full screen, haptics, CloudStorage), safe areas, render scale and storage (`src/platform/`, flat, Telegram-shaped). It is a no-op in a plain browser. v6 replaces it with neutral interfaces and per-platform adapters (#42).
13. **Scene framework and back navigation.** `main.ts` registers 20 scenes. `BaseScene`, `platform/nav.ts` (Telegram Back, modal stack, closing confirmation) and the global `state.ts` complete the framework.
14. **Localization.** English and Russian tables (`src/i18n`, 93 files) and the language switch.
15. **Procedural art pipeline.** `src/art` (39 files) holds the 3D-primitive pixel renderer, paper dolls, iso ground, maps, camp art, mosaic chrome, fonts and icon atlases. Apart from the icon atlases and `public/ui` placeholders, all art is generated in code.
16. **Heroes and progression.** Attributes (STR/AGI/END/WIL), two points per level, class perk trees at levels 2/4/6/8/10, traits, XP, wounds, knock-outs, permadeath, battle groups and the muster (field cap versus reserve).
17. **Items and gear.** Rarity, random affixes, attribute requirements and class limits, sets, named legendaries, wear, repair and item sources (`game/gear.ts`, `game/sources.ts`, `data/gearRules.ts`). `docs/ITEMS.md` is partly built.
18. **Loot and battle report.** Kill-based loot picks, gold and XP formulas, and one `report.ts` model for offline battles, verified attacks and duels. `ResultsScene` draws it.
19. **Overland campaign world.** A 112x112 seeded map, A* travel, game time, roaming bands that chase, flee or wander, lairs, the danger gradient and encounters (attack, flee, ransom, let go). `game/campaign.ts` holds the state operations. v5's "campaign events" hook in here.
20. **Settlements, recruits and market.** Village and town recruit pools, market stock refreshing by epoch, rest and the physician. `SettlementScene` and `MarketScene` show them.
21. **Field camp.** Tents, fire, palisade, forge and training ground built from supplies, food, healing and drilling (`world/camp.ts`, `campLayout.ts`, `CampScene`, iso camp art).
22. **Save and migration.** `game/save.ts` is a versioned schema (`SAVE_VERSION = 6`) with a migration chain and validation. Saves are chunked under the CloudStorage 4 KB limit and mirrored to localStorage. There are no live users yet (V5-074), so v6 needs no migrations for old saves or old clients.
23. **Battle input and controls.** Tap selection, formation move and turn-knob drags (`ui/dragFormation.ts`), tap-to-move and tap-to-attack, ability medallions, pan and pinch zoom, and pause and auto-pause. v5 shipped the touch-first rework: the order bar, the "Then…" queue, undo and previews (`src/ui/orderQueue.ts`, `src/ui/input/`, `controls.md`). It is touch only: no hotkeys, hover or keyboard focus yet (#44).
24. **Battle presentation.** `BattleScene` (4,898 lines), `battleHud`, `battlePanel`, `battleFx`, `sprites` and `beastView` read sim state, drain events, run the follow camera and draw the deployment UI.
25. **UI kit and Mosaic components.** The v4 `src/ui/mosaic` library (36 files), `tokens.ts` (WCAG-checked pairs), the layout registry and layout check, and `textfit`. The legacy v3 `ui/v3.ts` and `widgets.ts` are still in use.
26. **Menus, hubs and management screens.** The tab shell (Campaign, Duels, War, Codex, Shop), Menu, Army, Hero, Codex, Kit and FirstRun.
27. **Audio.** Procedural Web Audio covers SFX, modal music layers that follow the battle, and a voice limiter. `audio/hooks.ts` is the single event-to-sound map.
28. **Tutorial and onboarding.** A pure step machine (`game/tutorial.ts`), the narrator, the ghost hand and spotlight, the guided battle, `FirstRunScene` and the online coach marks.
29. **Settings and accessibility.** Sound, music and effects volume, haptics, language, auto-pause, reduced motion (`ui/motion.ts`), notification settings and the gesture-hint flag.
30. **Backend platform and auth.** One Cloudflare Worker (Hono, zod, D1 with 16 migrations, hibernating Durable Objects) with Telegram `initData` HMAC auth, sessions, rate limits and bans. Public names come from Telegram (`displayName` in `server/src/players.ts`); V6-011 replaces them with nicknames (#46).
31. **Cloud save sync.** A `seq` and revision merge (`platform/saveSync.ts`, pure), a debounced PUT, boot adoption and the sync badge.
32. **Battle verification and tickets.** The server fixes the seed and armies, the client submits its order log, and `server/src/battle.ts` replays `src/sim` and applies only its own result.
33. **Online war map.** Seasonal shards of the hand-authored `westmed` region graph: energy, marches, fog, neutral defenders, lairs, online camps, garrisons, income, live armies over WebSocket and world bosses (`src/online`, `server/src/online`, `RegionDO`, `OnlineScene`).
34. **Lockstep netcode.** Sealed turns, hash checks every 10 turns and deployment hold-back (`online/lockstep.ts`, `protocol.ts`, `DuelDO`, the relay). Live duels and friendly duels on the war map both use it.
35. **Clans and marketplace.** Clans, shared land and garrisons, and player trading in gold or Drachmae with a 10% fee.
36. **Duels.** The persistent duel army with a point budget, the PvE ladder (stars, chapters, spoils), the unranked queue, ranked live and async play, rating and matchmaking, seasons, glory and the duel shop (`src/duel`, `server/src/duel`, `src/scenes/duel/DuelScene.ts` at 3,195 lines).
37. **Premium economy and monetization.** Stars buy only Drachmae. The system covers the wallet, season pass, cosmetics, consumables, war-map merchants and daily caps. The server is the authority.
38. **Bot notifications.** The Telegram bot, an outbox, jobs and templates.
39. **Telemetry, monitoring and admin.** Client analytics and telemetry, monitoring, server analytics routes and the admin panel.

40. **Campaign arc.** The six lairs, the starter army, volunteers after a wipe, lair assaults with the `assault` battlefield, hoards, and the Tyrant's host that musters when all six lairs fall (`src/data/arc.ts`, `campaign-arc.md`). New in v5, on top of #19.
41. **Campaign events.** Data-driven event cards on the overland map, settlement and camp hooks, the journal and next-battle bonuses (`src/data/events.ts`, `src/dev/eventBalance.ts`, `campaign-events.md`). New in v5, on top of #19.

**v5 expansions (all shipped).** The Director brief's hooks became quick-design GDDs on existing rows, plus #40 and #41:
- abilities → #7, #16, #3 (`abilities.md`)
- formations and orders → #4, #6, #7 (`formations-orders.md`)
- terrain → #5 (`field-works.md`)
- enemy variety and AI → #10, #11 (`ai-doctrines.md`)
- campaign events → #41 (`campaign-events.md`); the arc → #40 (`campaign-arc.md`)
- items → #17 (`forge-reroll.md`, the town Smith)
- touch-first controls → #23 (`controls.md`)
- feel and audio → #24, #27 (`battle-readability.md`)
- the Beast Trial as practice → #9, #18 (`practice-fight.md`)

**v6 systems** (from `docs/playbook/director-brief-v6.md` and `docs/ROADMAP.md` "Next: v6"; none is in `src/` yet). v6 is not a mechanics release, so all ten are platform, device, account and web systems. Their tiers in the table are read against the v6 goal: MVP = the foundation every other v6 story needs; Vertical Slice = what makes a web account safe and complete; Alpha = the public web front door. All ten are in scope with no cuts (owner).

42. **Platform layer (core and adapters).** Neutral interfaces in `src/platform/core/` (auth, payments, storage, haptics, back button, share and invite, safe area, input hints, notifications), one adapter folder per platform (`telegram/`, `web/`, room for `steam/` and `mobile/`), and one detection at startup. It refactors #12 and is the root of every v6 system: game code talks only to the interfaces, with no `if (telegram)` (V5-076).
43. **Responsive and landscape layout.** True landscape layouts for every screen on tablets and laptops, plus tablet portrait; phones stay portrait-first. It extends the Mosaic layout registry and the layout-check matrix (1024x768 up to 1920x1080) and adds landscape battle framing.
44. **Mouse, keyboard and rebinding.** Hover states, right-click and wheel zoom on the field, keyboard focus navigation through menus and sheets, battle hotkeys (orders, groups, pause, speed, Undo, Then) and rebindable keys with conflict detection, saved per device. Offered only where a keyboard is present (an input hint from #42); touch keeps the v5 UI.
45. **Accounts and sessions.** Email and password sign-up and log-in, email verification and password reset through Cloudflare's email service, a slow server-side password hash suited to Workers, secure-cookie sessions on the web, and Telegram keeping login tokens (cookies are blocked in the Telegram Web iframe; V6-009). Extends #30.
46. **Linked accounts and nicknames.** One player id with several log-in methods: a Telegram player adds an email and password, and a web player later links Telegram. A player-chosen nickname replaces Telegram first names and ids everywhere public (V6-011): leaderboards, duels, the war map and the landing stats.
47. **Payments interface.** A `Payments` interface: the Telegram adapter keeps Stars exactly as today; the web adapter is a "coming soon" placeholder with a reason shown in the shop, ready for a real provider without touching the shop or the server's grant logic (#37).
48. **Bot protection.** Cloudflare Turnstile on sign-up and log-in, per-IP and per-account rate limits, and email verification before an account can play online. It wraps the #45 endpoints.
49. **Privacy and deletion.** The privacy notice and in-app account deletion (the email login and personal data; linked Telegram progress handled as the notice says), linked from sign-up, Settings and the landing footer.
50. **Public stats API.** A public, read-only, cached and rate-limited `/api/public/*` (players, battles fought, top duelists, war standings and other tops) with no personal data beyond nicknames. The landing Worker proxies it with a cache (V6-009).
51. **Landing site.** pixelarrow.app: a dark, effect-rich static site in English only (parallax, scroll animations, gameplay videos, Gemini key art, live stats, calls to action to play.pixelarrow.app and Telegram, FAQ, legal pages, SEO basics), served by its own Worker with a redirect for old `?startapp=` links (V6-006, V6-009). The game Worker and its API move to play.pixelarrow.app.

---

## Systems Enumeration

| # | System Name | Category | Priority | Status | Design Doc | Depends On |
|---|-------------|----------|----------|--------|------------|------------|
| 1 | Deterministic tick and seeded RNG | Core | MVP | Implemented | — (legacy: docs/ROADMAP.md Invariants) | — |
| 2 | Content data tables | Core | MVP | Implemented | — (legacy: docs/GAMEPLAY.md, docs/ITEMS.md) | — |
| 3 | Unit stat derivation | Gameplay | MVP | Implemented | design/gdd/abilities.md (legacy: docs/GAMEPLAY.md Hero progression) | Content data tables |
| 4 | Formations | Gameplay | MVP | Implemented | design/gdd/formations-orders.md (legacy: docs/GAMEPLAY.md Controls) | Deterministic tick and seeded RNG |
| 5 | Battle terrain | Gameplay | MVP | Implemented | design/gdd/field-works.md (legacy: docs/GAMEPLAY.md Battle terrain) | Deterministic tick and seeded RNG, Content data tables |
| 6 | Battle simulation core | Gameplay | MVP | Implemented | design/gdd/formations-orders.md (legacy: docs/GAMEPLAY.md Battle simulation) | Deterministic tick and seeded RNG, Unit stat derivation, Formations, Battle terrain |
| 7 | Orders and abilities | Gameplay | MVP | Implemented | design/gdd/abilities.md, design/gdd/formations-orders.md (legacy: docs/GAMEPLAY.md Hero progression, Controls) | Battle simulation core, Content data tables |
| 8 | Item powers and set specials | Gameplay | Alpha | Implemented | — (legacy: docs/ITEMS.md Powers, Sets) | Battle simulation core, Content data tables |
| 9 | Mythical beasts | Gameplay | Alpha | Implemented | design/gdd/practice-fight.md (legacy: docs/DESIGN_V2.md Mythical beasts) | Battle simulation core, Orders and abilities |
| 10 | Bot AI | Gameplay | MVP | Implemented | design/gdd/ai-doctrines.md (legacy: docs/GAMEPLAY.md Bot AI) | Battle simulation core, Orders and abilities, Battle terrain, Formations |
| 11 | Enemy army generation | Gameplay | MVP | Implemented | design/gdd/ai-doctrines.md (legacy: docs/GAMEPLAY.md Bot AI) | Content data tables, Unit stat derivation, Heroes and progression |
| 12 | Platform layer | Core | MVP | Implemented | — (legacy: README.md Telegram Mini App setup) | — |
| 13 | Scene framework and back navigation | Core | MVP | Implemented | — (legacy: README.md, docs/UI_KIT.md) | Platform layer |
| 14 | Localization | Core | MVP | Implemented | — (legacy: docs/DESIGN_V2.md Localization) | — |
| 15 | Procedural art pipeline | Art | MVP | Implemented | — (legacy: docs/ART_STYLE.md, docs/GAMEPLAY.md Art pipeline) | Content data tables |
| 16 | Heroes and progression | Progression | MVP | Implemented | design/gdd/abilities.md (legacy: docs/GAMEPLAY.md Hero progression, Heroes and the army) | Content data tables, Unit stat derivation, Deterministic tick and seeded RNG |
| 17 | Items and gear | Economy | Vertical Slice | Implemented | design/gdd/forge-reroll.md (legacy: docs/ITEMS.md, docs/GAMEPLAY.md Equipment) | Content data tables, Unit stat derivation, Heroes and progression |
| 18 | Loot and battle report | Economy | MVP | Implemented | design/gdd/practice-fight.md (legacy: docs/GAMEPLAY.md Loot and rewards) | Battle simulation core, Heroes and progression, Items and gear |
| 19 | Overland campaign world | Gameplay | Vertical Slice | Implemented | design/gdd/campaign-arc.md, design/gdd/campaign-events.md (legacy: docs/GAMEPLAY.md Campaign and the overland map) | Deterministic tick and seeded RNG, Enemy army generation, Heroes and progression, Items and gear |
| 20 | Settlements, recruits and market | Economy | Vertical Slice | Implemented | — (legacy: docs/GAMEPLAY.md Campaign and the overland map) | Overland campaign world, Heroes and progression, Items and gear |
| 21 | Field camp | Gameplay | Vertical Slice | Implemented | — (legacy: docs/GAMEPLAY.md Campaign and the overland map) | Overland campaign world, Heroes and progression |
| 22 | Save and migration | Persistence | MVP | Implemented | — (legacy: docs/GAMEPLAY.md Saves) | Heroes and progression, Items and gear, Overland campaign world, Tutorial and onboarding, Localization |
| 23 | Battle input and controls | UI | MVP | Implemented | design/gdd/controls.md (legacy: docs/GAMEPLAY.md Controls) | Orders and abilities, Formations, Scene framework and back navigation |
| 24 | Battle presentation | UI | MVP | Implemented | design/gdd/battle-readability.md (legacy: docs/UI_KIT.md Battle HUD) | Battle simulation core, Procedural art pipeline, Battle input and controls, UI kit and Mosaic components |
| 25 | UI kit and Mosaic components | UI | MVP | Implemented | — (legacy: docs/UI_KIT.md, docs/redesign/V4_SPEC.md) | Scene framework and back navigation, Localization, Procedural art pipeline |
| 26 | Menus, hubs and management screens | UI | Vertical Slice | Implemented | — (legacy: docs/redesign/V4_SPEC.md Navigation) | UI kit and Mosaic components, Heroes and progression, Items and gear, Save and migration |
| 27 | Audio | Audio | Vertical Slice | Implemented | design/gdd/battle-readability.md (legacy: README.md Audio) | Platform layer, Battle simulation core |
| 28 | Tutorial and onboarding | Meta | Vertical Slice | Implemented | — (legacy: docs/DESIGN_V2.md Localization, audio and onboarding) | Battle input and controls, Battle presentation, Orders and abilities |
| 29 | Settings and accessibility | Meta | Vertical Slice | Implemented | — (legacy: docs/UI_KIT.md) | Platform layer, Localization, Audio |
| 30 | Backend platform and auth | Core | Alpha | Implemented | — (legacy: server/README.md, docs/ROADMAP.md Agreed architecture) | — |
| 31 | Cloud save sync | Persistence | Vertical Slice | Implemented | — (legacy: docs/GAMEPLAY.md Cloud save) | Save and migration, Backend platform and auth |
| 32 | Battle verification and tickets | Core | Alpha | Implemented | — (legacy: docs/ROADMAP.md Battle flow online) | Battle simulation core, Orders and abilities, Backend platform and auth |
| 33 | Online war map | Gameplay | Alpha | Implemented | — (legacy: docs/DESIGN_V2.md) | Backend platform and auth, Battle verification and tickets, Battle terrain, Enemy army generation, Mythical beasts, Heroes and progression |
| 34 | Lockstep netcode | Core | Alpha | Implemented | — (legacy: docs/ROADMAP.md Battle flow online) | Battle simulation core, Orders and abilities, Backend platform and auth |
| 35 | Clans and marketplace | Economy | Full Vision | Implemented | — (legacy: docs/DESIGN_V2.md Clans, Trading) | Online war map, Premium economy and monetization |
| 36 | Duels | Gameplay | Alpha | Implemented | — (legacy: docs/DUELS.md) | Lockstep netcode, Battle verification and tickets, Heroes and progression, Items and gear, Online war map |
| 37 | Premium economy and monetization | Economy | Full Vision | Implemented | — (legacy: docs/DESIGN_V2.md Monetization and economy) | Backend platform and auth, Online war map |
| 38 | Bot notifications | Meta | Full Vision | Implemented | — (legacy: server/README.md Bot notifications) | Backend platform and auth |
| 39 | Telemetry, monitoring and admin | Meta | Full Vision | Implemented | — (legacy: docs/OPS.md) | Backend platform and auth, Platform layer |
| 40 | Campaign arc | Gameplay | Vertical Slice | Implemented | design/gdd/campaign-arc.md | Overland campaign world, Enemy army generation, Bot AI, Battle terrain, Items and gear |
| 41 | Campaign events | Gameplay | Vertical Slice | Implemented | design/gdd/campaign-events.md | Overland campaign world, Settlements, recruits and market, Field camp, Loot and battle report |
| 42 | Platform layer (core and adapters) | Core | MVP | Not Started | — (v6 brief §4; refactors #12) | Platform layer |
| 43 | Responsive and landscape layout | UI | MVP | Not Started | — (v6 brief §3; ROADMAP "Next: v6") | Platform layer (core and adapters), UI kit and Mosaic components, Scene framework and back navigation, Battle presentation |
| 44 | Mouse, keyboard and rebinding | UI | MVP | Not Started | — (v6 brief §3; amends design/gdd/controls.md) | Platform layer (core and adapters), Battle input and controls, UI kit and Mosaic components, Settings and accessibility |
| 45 | Accounts and sessions | Core | MVP | Not Started | — (v6 brief §5) | Backend platform and auth, Platform layer (core and adapters) |
| 46 | Linked accounts and nicknames | Core | Vertical Slice | Not Started | — (v6 brief §6; V6-011) | Accounts and sessions, Cloud save sync, Backend platform and auth |
| 47 | Payments interface | Economy | Vertical Slice | Not Started | — (v6 brief §7) | Platform layer (core and adapters), Premium economy and monetization |
| 48 | Bot protection | Core | Vertical Slice | Not Started | — (v6 brief §8) | Accounts and sessions, Backend platform and auth |
| 49 | Privacy and deletion | Meta | Vertical Slice | Not Started | — (v6 brief §9) | Accounts and sessions, Linked accounts and nicknames, Cloud save sync, Settings and accessibility |
| 50 | Public stats API | Core | Alpha | Not Started | — (v6 brief §2; V6-009) | Backend platform and auth, Linked accounts and nicknames, Duels, Online war map |
| 51 | Landing site | Web | Alpha | Not Started | — (v6 brief §1–2; V6-006, V6-009) | Public stats API, Privacy and deletion, Procedural art pipeline |

---

## Categories

| Category | Description | Systems here |
|----------|-------------|--------------|
| **Core** | Foundation systems everything depends on | #1, #2, #12, #13, #14, #30, #32, #34, #42, #45, #46, #48, #50 |
| **Gameplay** | The systems that make the game fun | #3–#11, #19, #21, #33, #36, #40, #41 |
| **Progression** | How the player grows over time | #16 |
| **Economy** | Resource creation and consumption | #17, #18, #20, #35, #37, #47 |
| **Persistence** | Save state and continuity | #22, #31 |
| **UI** | Player-facing displays and input | #23–#26, #43, #44 |
| **Art** (custom) | Procedural rendering of everything visual | #15 |
| **Audio** | Sound and music systems | #27 |
| **Meta** | Systems outside the core loop | #28, #29, #38, #39, #49 |
| **Web** (custom, v6) | The public site outside the game bundle | #51 |

Narrative has no row: there is no dialogue or quest system. Narrator lines live in the tutorial (#28).

---

## Priority Tiers

| Tier | Definition | Target Milestone | Design Urgency |
|------|------------|------------------|----------------|
| **MVP** | The v5 battle loop: without these you cannot test whether the deeper tactics are fun | v5 battle-loop playable | Design FIRST |
| **Vertical Slice** | One complete, polished single-player loop (map → battle → results → growth) with new UI, onboarding and audio | v5 campaign slice | Design SECOND |
| **Alpha** | Online modes and sim extensions at parity with the new core | v5 alpha (all modes on the new core) | Design THIRD |
| **Full Vision** | Monetization, social and ops | Beta / release | Design as needed |

Counts for v5 (#1–#41, all Implemented): MVP 19, Vertical Slice 11, Alpha 7, Full Vision 4.

**v6 rows (#42–#51) use the same tier names, read against the v6 goal** (the game on every device, with web accounts and a front door). All are in scope with no cuts; the tier sets design order only.

| Tier | v6 definition | Systems |
|------|---------------|---------|
| **MVP** | The foundation every other v6 story needs: the platform seam, layouts, input and a web account | #42, #43, #44, #45 |
| **Vertical Slice** | A web account that is safe, linked, private and able to see the shop | #46, #47, #48, #49 |
| **Alpha** | The public front door: live stats and the landing site | #50, #51 |

Counts for v6: MVP 4, Vertical Slice 4, Alpha 2 (51 systems in all).

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
8. Platform layer (core and adapters) (v6): refactors Platform layer into interfaces and adapters. **Bottleneck for v6:** every v6 system and every scene that touches Telegram today goes through it.

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
19. Campaign arc (v5): Overland campaign world, Enemy army generation, Bot AI (doctrines, captains), Battle terrain (the assault field), Items and gear (hoards).
20. Campaign events (v5): Overland campaign world, Settlements, Field camp (arrival and camp hooks), Loot and battle report (`nextBattle` bonuses).
21. Accounts and sessions (v6): Backend platform and auth, Platform layer (core and adapters) (the auth interface). **Bottleneck for v6:** linking, bot protection, privacy and nicknames all sit on it.
22. Bot protection (v6): Accounts and sessions, Backend platform and auth (rate limits exist there today).
23. Linked accounts and nicknames (v6): Accounts and sessions, Cloud save sync (one save per player id across devices), Backend platform and auth.
24. Payments interface (v6): Platform layer (core and adapters), Premium economy and monetization (the server's grant logic stays as is).
25. Privacy and deletion (v6): Accounts and sessions, Linked accounts and nicknames, Cloud save sync, Settings and accessibility (the in-app entry point).
26. Public stats API (v6): Backend platform and auth, Linked accounts and nicknames (nicknames only, no personal data), Duels and Online war map (the tops it reads).

### Presentation Layer (depends on features)

1. UI kit and Mosaic components: Scene framework, Localization, Procedural art pipeline.
2. Battle input and controls: Orders and abilities, Formations, Scene framework.
3. Battle presentation: Battle simulation core, Procedural art pipeline, Battle input and controls, UI kit.
4. Menus, hubs and management screens: UI kit, Heroes and progression, Items and gear, Save and migration.
5. Audio: Platform layer, Battle simulation core (event hooks).
6. Responsive and landscape layout (v6): Platform layer (core and adapters) (safe area), UI kit and Mosaic components (the layout registry), Scene framework, Battle presentation (landscape battle framing).
7. Mouse, keyboard and rebinding (v6): Platform layer (core and adapters) (input hints, per-device storage), Battle input and controls (hotkeys emit the same orders), UI kit and Mosaic components (focus and hover states), Settings and accessibility (the rebinding screen).

### Polish Layer (depends on everything)

1. Tutorial and onboarding: Battle input and controls, Battle presentation, Orders and abilities.
2. Settings and accessibility: Platform layer, Localization, Audio.
3. Bot notifications: Backend platform and auth.
4. Telemetry, monitoring and admin: Backend platform and auth, Platform layer.
5. Landing site (v6): Public stats API (live stats), Privacy and deletion (the notice in its footer), Procedural art pipeline (the art style its Gemini key art matches). It is a separate static site, not part of the game bundle, so nothing in the game depends on it.

Leaf systems (nothing depends on them; lower risk, can be designed late): Clans and marketplace, Bot notifications, Telemetry, Menus and hubs, Campaign arc, Campaign events, Mouse, keyboard and rebinding, Responsive and landscape layout, Bot protection, Payments interface, Landing site. (Loot and battle report, Settlements, Field camp and Settings and accessibility stopped being leaves: v5 campaign events and v6 privacy and rebinding build on them.)

---

## Recommended Design Order

### v5 order (#1–#41, all Implemented)

GDDs are retrofits of shipped systems. Effort is the size of documenting the system and folding in its v5 expansion. v5 designed its expansions as quick-design GDDs on these rows (see the Design Doc column); the rest still have only a legacy doc.

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
| 40 | Campaign arc | Vertical Slice | Feature | game-designer, level-designer | L |
| 41 | Campaign events | Vertical Slice | Feature | game-designer, writer | M |

### v6 order (#42–#51, Not Started)

MVP Foundation and Core first, then by layer within each tier. The ADRs these systems need (platform layer, hosting, auth and sessions, linking, public stats API, landing stack; `docs/v6/ADOPT.md` §4) come before or with the design docs. Design doc names are proposals.

| Order | System | Priority | Layer | Agent(s) | Est. Effort |
|-------|--------|----------|-------|----------|-------------|
| 1 | Platform layer (core and adapters) | MVP | Core | lead-programmer, engine-programmer | M |
| 2 | Accounts and sessions | MVP | Feature | security-engineer, network-programmer | L |
| 3 | Responsive and landscape layout | MVP | Presentation | ux-designer, ui-programmer | L |
| 4 | Mouse, keyboard and rebinding | MVP | Presentation | ux-designer, ui-programmer, accessibility-specialist | M |
| 5 | Bot protection | Vertical Slice | Feature | security-engineer | S |
| 6 | Linked accounts and nicknames | Vertical Slice | Feature | security-engineer, network-programmer, ux-designer | M |
| 7 | Privacy and deletion | Vertical Slice | Feature | security-engineer, writer | S |
| 8 | Payments interface | Vertical Slice | Feature | lead-programmer, economy-designer | S |
| 9 | Public stats API | Alpha | Feature | network-programmer, analytics-engineer | S |
| 10 | Landing site | Alpha | Polish | art-director, ui-programmer, community-manager | L |

---

## Circular Dependencies

These are module-level import cycles in `src/sim`, observed in the code:

- **Battle simulation core ↔ Bot AI.** `sim/battle.ts` imports `sim/ai.ts`, and `ai.ts` imports `battle.ts`. The AI reads `Battle` state and the battle drives the AI.
- **Battle simulation core ↔ Mythical beasts.** `battle.ts` ↔ `myth.ts`.
- **Battle simulation core ↔ Item powers.** `battle.ts` ↔ `powers.ts`.

**Proposed resolution (design level):** treat each pair as one design unit with a written contract. Each subsystem gets a read-only battle view plus the hook points it uses (on hit, on kill, on tick, issue order). Design #6 with #7, #8, #9 and #10 kept in view, so v5 abilities, AI and powers extend the hooks rather than reach into `Battle` internals. Breaking the cycles in code is optional and needs an ADR. It must not change `Battle.hash()` or replay output.

**v6, Accounts and sessions ↔ Bot protection (design level).** Sign-up and log-in cannot ship without Turnstile and rate limits, and bot protection exists only to guard the account endpoints. Design them as one unit: the account flow names its check points (before sign-up, before log-in, before reset, before online play needs a verified email), and bot protection fills them. Bot protection depends on accounts, not the other way round.

TD-SYSTEM-BOUNDARY: skipped in lean review mode (rigor `standard` resolves `review_mode: lean`).

---

## High-Risk Systems

| System | Risk Type | Risk Description | Mitigation |
|--------|-----------|-----------------|------------|
| Battle simulation core | Technical | The bottleneck: 9 systems depend on it directly and 15 transitively, it is 3,458 lines, and the server replays it to verify battles. Any rule change alters old replays and pending tickets and can split client and server during a rollout. | Replay and determinism tests before and after each change. Balance with `npm run balance` before and after. Version the sim rules if verified battles must survive a deploy. Write an ADR for rule versioning. |
| Orders and abilities | Technical / Scope | The main v5 expansion surface. New `Order` kinds are logged data that the server validates, so they must stay backward compatible with the server API and with lockstep. | Add orders additively. Give each new kind a replay test and a server test. Design the order queue and undo as client-side UI that emits ordinary orders. |
| Save and migration | Technical | `SAVE_VERSION = 6`, chunked CloudStorage. There are no live users yet (V5-074), so v6 needs no old-save migrations, but a linked account (#46) can meet two saves for one player id, and the cloud copy can spread a bad merge across devices. | Keep the `seq` and revision merge pure and tested. Write the link-time save choice into the linking design, with fixture tests. |
| Bot AI | Design | v5 wants enemy variety and smarter AI. The AI shares the sim's determinism, and balance depends on it. | Prototype AI personalities behind data. Use the balance harness as the gate. |
| Battle input and controls / Battle presentation | Technical / Scope | `BattleScene` (4,898 lines) and `DuelScene` (3,195 lines) are monoliths. v5's touch-first rework touched both, and v6 hotkeys, hover and landscape framing touch both again. | Extract controller pieces behind tests (`tests/drag.test.ts` pattern) before each rework. Hotkeys emit the same orders as touch. Run the smoke and layout checks. |
| Procedural art pipeline | Technical | 39 art files draw on canvases and textures, and the v3 and v4 UI kits coexist. The Phaser 4 upgrade was rejected (ADR-0003, V5-025), so the game stays on Phaser 3.90. | Any future engine upgrade is one story behind its own ADR and parity pass. |
| Online war map / Duels / Premium economy | Scope | These systems are server-authoritative. Any change needs matching client and `server/` work, tests and API compatibility, and must not be deployed. Real-money pricing is off-limits. | Keep v5 online changes minimal and additive. Pricing ideas go to `docs/v5/PROPOSALS.md`. |
| Platform layer (core and adapters) (v6) | Technical | It touches every scene that calls Telegram today, and every v6 system builds on it. A leaky interface spreads `if (telegram)` back into game code. | Write its ADR first. Test each adapter on its own. Make "no platform checks in game code" a control-manifest rule with a grep check. |
| Accounts and sessions / Linked accounts and nicknames / Bot protection (v6) | Security | Password hashing on Workers, cookies versus Telegram tokens across two hosts, account takeover through linking, and email and Turnstile that are owner-side Cloudflare services and can only be stubbed locally. | ADRs for auth and linking, `/security-audit` before merge, rate limits and verified email before online play, and owner actions for the Cloudflare services. Never deploy. |
| Responsive and landscape layout (v6) | Scope | Every screen gets landscape and tablet layouts, so the layout-check matrix multiplies, and the battle and duel monoliths need landscape framing. | Layout primitives and the bigger layout-check matrix first, then one screen family per story. |
| Public stats API / Landing site (v6) | Privacy / Performance | Public tops must not leak Telegram first names or ids (V6-011). The landing page's effects and videos must stay inside a performance budget. | Nicknames before any public stats, no personal data in responses, caching and rate limits. A landing performance budget in its ADR, checked with Lighthouse in QA. |

PR-SCOPE: skipped in lean review mode. CD-SYSTEMS: skipped in lean review mode.

---

## Progress Tracker

| Metric | Count |
|--------|-------|
| Total systems identified | 51 (41 v5, all Implemented; 10 v6, Not Started) |
| Design docs written | 10 v5 GDDs and quick specs, all Implemented; 0 for v6 |
| v5 MVP systems with a v5 GDD | 10/19 (#3, #4, #5, #6, #7, #10, #11, #16, #23, #24) |
| v5 Vertical Slice systems with a v5 GDD | 5/11 (#17, #19, #27, #40, #41) |
| v6 MVP systems designed | 0/4 |
| v6 Vertical Slice systems designed | 0/4 |
| v6 Alpha systems designed | 0/2 |

---

## Next Steps

- [x] v5 Phase 2: `design/gdd/game-concept.md` written; it is this index's source concept.
- [x] v5 expansions designed as quick-design GDDs and shipped (see the Design Doc column).
- [x] ADRs for sim determinism and replay (ADR-0001) and the Phaser version (ADR-0003).
- [ ] v6: write the Foundation ADRs (platform layer, hosting, auth and sessions, linking, public stats API, landing stack) and the keyboard and mouse amendment to ADR-0004 (`docs/v6/ADOPT.md` §4).
- [ ] v6: design #42–#51 in the v6 order above: a UX spec for landscape and tablet layouts, a `/quick-design` amendment to `controls.md` for hotkeys and rebinding, a UX spec for the account, linking, reset and deletion flows, and the art-bible landing addendum.
- [ ] Optional: retrofit template GDDs for the v5 rows that still have only a legacy doc (`/design-system retrofit` or `/reverse-document`).
