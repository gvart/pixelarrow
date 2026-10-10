# Project Stage Analysis

**Generated**: 2026-10-10 (`/project-stage-detect`, no role filter, run autonomously)
**Stage**: Production (observed). This is a live, shipped game (v4 on https://pixelarrow.app), so in real terms it is post-release and being overhauled.
**Stage Confidence**: CONCERNS. The signals fit more than one stage: the code is shipped and live (Production or beyond), while the template design and architecture artifacts sit at Concept level (no game concept, no GDDs, no ADRs).
**Analysis Scope**: Full project

Config resolved by `yaml-helper.sh resolve_config`:
- `workflow: standard` and `docs.density: balanced`, both from `rigor: standard`
- `review_mode: lean`
- `automation: autonomous` (from `project.yaml`)
- `project.stage`: not set

No stage is configured (no `project.stage`, no `production/stage.txt`), so there is nothing to compare against: the stage above is the heuristic result. `/gate-check` has never run here.

Code root: **`src/`**. `engine.name` is unset and `technical-preferences.md` says `[TO BE CONFIGURED]`, so the root comes from the tree (step 3 of `code-root-resolution.md`). Exactly one of `src/`, `Assets/` and `Source/` exists, so the derivation is unambiguous. The engine is Phaser 3.90 (`package.json`).

---

## Executive Summary

Pixelarrow is a mature brownfield project. It has 279 client TypeScript files (about 90k lines) and 60 Worker files (about 11.6k lines). 70 unit-test suites and 7 browser smoke scripts back them, plus a 10-shard layout check, all gated in CI before deploy. The game has live players with versioned saves (`SAVE_VERSION = 5`), an online war, duels and Stars payments.

Everything the CCGS pipeline expects in template format was missing before this run: a game concept, a systems index, GDDs, ADRs, an architecture doc and production tracking. The design knowledge does exist, though: about 3,900 lines of legacy docs in `docs/` (GAMEPLAY, DESIGN_V2, DUELS, ITEMS, UI_KIT, ART_STYLE, OPS, ROADMAP) describe nearly every system. The gap is format and traceability, not missing knowledge. This run adds `design/gdd/systems-index.md` (39 systems).

**Current Focus**: the v5 overhaul (UI, art, menus, deeper mechanics, touch-first controls, onboarding, feel and audio) on local branch `v5`.
**Blocking Issues**: none that stop v5 work. The pipeline gaps are listed below.
**Estimated Time to Next Stage**: n/a. Polish and Release are explicit-only stages (`/gate-check`). The practical next step is to give v5 its design layer (a concept plus GDDs for the systems it changes).

---

## Completeness Overview

### Design Documentation
- **Status**: about 5% in template format (1 of about 41 expected docs: concept + index + 39 GDDs). About 85% of systems are described in legacy docs.
- **Files Found**: 1 in `design/` (`design/gdd/systems-index.md`, written by this run). 0 GDDs. No `design/narrative/` or `design/levels/`.
- **Key Gaps** (only those `standard` surfaces):
  - [ ] No `design/gdd/game-concept.md`. The `standard` tier requires it, and the systems index cites legacy docs in its place. Phase 2 `/brainstorm` (VISION) should produce it.
  - [ ] No GDDs for any of the 39 built systems. At `standard`, a built system without a GDD is a gap. Prioritise the systems v5 will change: Orders and abilities, Formations, Bot AI, Battle input and controls, Battle simulation core and Save and migration.
  - The art bible is **not flagged**: no visual-asset stories exist yet. It becomes required at `standard` once Phase 2 ART+UX creates them.

### Source Code
- **Status**: complete for the v4 scope (shipped and live).
- **Files Found**: 279 `.ts` files in `src/` (90,332 lines) and 60 in `server/src/` (11,645 lines). Directories with 5+ files are the major systems:
  - ✅ `src/sim/` (9): deterministic battle sim, AI, formations, terrain, beasts, item powers
  - ✅ `src/world/` (7): overland map, travel, bands, settlements, field camp
  - ✅ `src/game/` (15): campaign, heroes, enemy armies, loot, gear, save, tutorial, report
  - ✅ `src/data/` (12): classes, items, affixes, sets, perks, traits, terrain, beasts, consumables
  - ✅ `src/online/` (20), `src/duel/` (8), `server/src/` (60): online war, duels, economy, verification
  - ✅ `src/art/` (39), `src/audio/` (8): procedural art and Web Audio
  - ⚠️ `src/ui/` (32 + 29 in `mosaic/` + 5 tutorial + 5 econ): the v4 Mosaic kit and the legacy v3 kit (`ui/v3.ts`, `widgets.ts`) coexist
  - ⚠️ `src/scenes/` (17 + subfolders): `BattleScene.ts` (3,078 lines) and `duel/DuelScene.ts` (2,988 lines) are monoliths that the v5 controls rework will touch
- **Key Gaps**: none functional. The structural risks are covered in the systems index under "High-Risk Systems".

### Architecture Documentation
- **Status**: 0% in template format. The legacy coverage is partial: `docs/ROADMAP.md` has "Agreed architecture" and six invariants (sim purity, determinism, serializable state, orders as data, no client-trusted economy, data-driven content).
- **ADRs Found**: 0 (`docs/architecture/` does not exist).
- **Coverage**:
  - ⚠️ Determinism, shared client and server sim, server replay verification: implemented and described in ROADMAP, but no ADR
  - ⚠️ Save versioning and migration, CloudStorage chunking: implemented and described in GAMEPLAY, but no ADR
  - ⚠️ Cloudflare Worker, D1 and Durable Objects backend: implemented and described in ROADMAP and server/README, but no ADR
  - ❌ Phaser 4 upgrade versus staying on 3.90: undecided (V5-005, Phase 2 spike)
  - ❌ Sim-rules versioning, so verified battles survive a rule change: neither documented nor decided
- **Key Gaps** (critical Foundation-layer ADRs, flagged at `standard`):
  - [ ] ADR for determinism and the replay contract (Foundation: Deterministic tick and seeded RNG, Battle simulation core)
  - [ ] ADR for save schema versioning and migration (Foundation for every persisted change, with live players)
  - [ ] ADR for the engine version (Phaser 3.90 versus 4), after the P4 spike
  - [ ] `engine.name` is unset in `project.yaml` (and `technical-preferences.md` is `[TO BE CONFIGURED]`), so the ADR engine-compatibility checks are blind

### Production Management
- **Status**: tracked outside the template. There is no `production/` directory. v5 is tracked in `docs/v5/PROGRESS.md`, `DECISIONS.md`, `PROPOSALS.md`, `ASSET_LOG.md` and `SKILLS_LOG.md`, and the backlog lives in `docs/ROADMAP.md` "Open items".
- **Found**: sprint plans 0, milestones 0, roadmap present (legacy).
- **Key Gaps**:
  - [ ] No epics, stories or sprint plan under `production/`. The Director tracks phases in `docs/v5/PROGRESS.md` instead. Decide whether v5 stories use `/create-epics` and `/create-stories` (see ANSWERS Q-PSD-3).

### Testing
- **Status**: strong. About 60–70% of system logic is covered (estimate); the pure modules are well covered and the scenes are covered only by smoke tests.
- **Test Files**: 49 suites in `tests/` and 21 in `server/test/` (vitest). There are also 7 browser smoke scripts (`scripts/*smoke*.mjs`, `online-e2e.mjs`) and the layout check (10 CI shards).
- **Coverage by System**:
  - sim, abilities, terrain, myth, powers: high (`sim`, `abilities`, `terrain`, `myth`, `powers` tests with replay checks)
  - campaign, world, heroes, gear, loot, save: high (`campaign`, `world`, `gear`, `gearRules`, `sources`, `legacy`; save tests on the server)
  - online, duels, economy: high (client tests plus the server `online-flow`, `ranked`, `async`, `payments` and `economy` tests)
  - UI and scenes: medium (`ui`, `mosaic`, `tokens`, `drag`, `nav`, plus the layout check and smoke scripts)
- **Key Gaps**:
  - [ ] `scripts/smoke.mjs` is known to be flaky (ROADMAP "Polish")
  - [ ] Catalog step `test-setup` expects `.github/workflows/tests.yml`. Tests actually run inside `deploy.yml` (jobs build, server, layout and smoke). This is a naming mismatch, not a gap.

### Prototypes
- **Active Prototypes**: 0 (no `prototypes/`). Dev harnesses live in `src/dev/` (balance, preview, store) and `scripts/dev/`, and they are documented in the README.

---

## Gaps Identified (with the clarifying question each raises, answered as the Director)

1. **No game concept.** "Is the concept recorded somewhere else, or should we write one?" Answer: the legacy docs hold the v4 concept. The v5 concept comes from Phase 2 `/brainstorm`, so this run does not write a stand-in.
2. **39 built systems without GDDs.** "Were these prototyped first, or should we reverse-document?" Answer: they are shipped. Reverse-document only the systems v5 changes, just before their stories, starting with the MVP rows of the systems index. Don't retrofit all 39 up front.
3. **No ADRs.** "Were architecture decisions recorded elsewhere?" Answer: yes, in ROADMAP "Agreed architecture" and "Invariants". Write ADRs only for the Foundation decisions v5 touches (determinism and replay, save migration, engine version).
4. **No sprint plans.** "Are you tracking work elsewhere?" Answer: yes, `docs/v5/PROGRESS.md` and the Director's `/orchestrate` loop.
5. **Engine not configured in `project.yaml`.** Answer: leave it for the Director. This run may write only `modes`, and the engine version is still open (V5-005).

---

## Recommended Next Steps

1. Phase 2 VISION: `/brainstorm` → `design/gdd/game-concept.md` (pillars: formation tactics, morale breaks, flanking, javelins; touch-first).
2. Configure the engine (`/setup-engine` or a direct `engine:` block: Phaser, TypeScript, WebGL) once the P4 spike settles 3.90 versus 4.
3. Foundation ADRs: determinism and replay contract, save migration, engine version.
4. `/design-system retrofit` (or `/quick-design`) for the MVP systems v5 changes, in systems-index order.
5. Run `/gate-check technical-setup` before the Phase 4 builds, so `project.stage` is set authoritatively.
