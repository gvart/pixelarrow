# v5 Sprint plan: waves 1–25

Phase 3 (Plan), written with `/sprint-plan new` at `standard` rigor, `lean` review (PR-SPRINT skipped: lean mode), by the producer for the Director. Stories: [STORIES.md](STORIES.md). Epics: [EPICS.md](EPICS.md). Skill answers: [ANSWERS.md](ANSWERS.md).

- **No milestone defined**: `production/milestones/` does not exist, so this plans against the story backlog alone. The brief's Phases 4–8 act as the milestone.
- **No previous sprint**: nothing to carry over. No sprint history, so estimates are not calibrated (re-estimate after W3, below).
- **No risk register**: `production/risk-register/` does not exist; risks below are assessed from the plan's contents only.
- **Status lives in `docs/v5/PROGRESS.md`** (V5-009), so `production/sprints/sprint-NNN.md` and `production/sprint-status.yaml` are not written (ANSWERS A-14).

## Sprint goal

Ship v5 in dependency order: the foundation first (kit, input layer, sim-train and save plumbing), the live-player fixes next, then sim train 2 feature by feature alongside controls and readability, then every screen in the brief's order, then feel, then final QA, with no wave ever having two stories editing the same file.

## Capacity

- **Parallel agents**: at most 4 per wave (brief). The `assets` agent counts while its queue runs (W1–W6), so those waves hold 3 code stories plus the assets story.
- **Total work (expected)**: 175 agent-days across 86 stories (optimistic 122.5, pessimistic 279).
- **Critical path by waves**: 62.5 agent-days (sum of each wave's longest expected story).
- **Buffer (20%)**: 35 agent-days on top of the total (210 with buffer), or 12.5 on the critical path (75 with buffer). Spend it on fix-ups the integrators send back, not on new scope.
- **Unit**: one agent-day is one implementation agent doing one focused day of work, gates included. How that maps to wall-clock hours for subagents is unknown until W1–W3 finish; the Director should re-run `/estimate` on the W4–W8 stories with the measured W1–W3 times and run `/sprint-plan update` if the critical path moves by more than 20%.

## Priority (sprint-plan task tiers)

**Must have (critical path).** F-01..F-07, IN-01, IN-02, LF-01..LF-03, ST-01..ST-04, AI-01, AI-02, FO-01..FO-03, AB-01..AB-03, AR-01, CT-01..CT-07, RD-01..RD-03, HUB-01, HUB-02, TUT-01, TUT-02, ARM-01, HERO-01, BTL-01, RES-01, WLD-01, CMP-01, SET-01, DUE-01, DUE-02, WAR-01, WAR-02, SHP-01, MKT-01, CDX-01, DLG-01, DLG-02, AS-01..AS-05, FL-01, FL-04, QA-01..QA-06.

**Should have.** AI-03, AR-02, AR-03, AR-04, WLD-02, EV-01..EV-03, FW-01..FW-03, AS-06, EC-02, EC-04, FL-02, FL-03.

**Nice to have.** EC-01 (forge reroll), EC-03 (retrain cost revisit).

The tiers follow the vision's ranking: expansions 1–3 (doctrines, formations and orders, abilities) and the structural fixes (8-man opening, controls, readability) are Must; expansions 4–6 (arc beyond the opening, event deck, field works) are Should; the items the GDD review already deferred are Nice.

## Before W1

1. The integrator merges whatever is still queued in PROGRESS.md (`p4-docs`, the V5-028 docs; `fixer-1`, the online-e2e fix). `design/accessibility-requirements.md` is already on `v5`.
2. **S2-ART-BIBLE** must be merged before F-01 and AS-01 start. If it is not merged when W1 opens, start ST-01 and IN-01 at once and start F-01 and AS-01 the moment it lands.
3. Every story starts with `/story-readiness` against its STORIES.md row. Every subagent prompt carries the skill and agent paths from the dispatch cards below (brief: "Skills are mandatory").

## Lanes (why the waves look the way they do)

| Lane | Stories | Hot files it serialises | Rule |
| --- | --- | --- | --- |
| **Assets** | AS-01 → AS-06 (W1–W6) | `docs/v5/gemini/**`, `public/art/v5/**`, `ASSET_LOG.md` | The one Chrome owner. Serial. Wiring each asset is the consuming screen story's job. |
| **Sim** | ST-01 → ST-03 → (AI-01 ∥ FO-01) → FO-02 → FO-03 → AB-02 → AB-03 → FW-01 → … → ST-04 | `src/sim/battle.ts`, `src/sim/ai.ts`, `src/sim/stats.ts`, `server/src/battle.ts` | One owner per hot sim file per wave. ST-03 pre-declares all types and zod so two sim stories can run side by side when they touch different sim files. |
| **Battle presentation** | IN-01 → LF-01 → CT-01 → CT-02 → CT-03 → CT-05 → CT-04 → RD-01 → RD-02 → CT-07 → FW-03 → CT-06 → BTL-01 → TUT-02 → FL-01 | `src/scenes/BattleScene.ts` (3,061 lines), `battlePanel.ts`, `battleHud.ts`, `src/ui/input/**` | Exactly one story owns `BattleScene.ts` in any wave. New behaviour goes into new modules (`orderQueue.ts`, `battleCamera.ts`, `input/undo.ts`) to keep the scene diff small. |
| **Meta and screens** | F-*, HUB-*, screens, AR-*, EV-* | `src/world/world.ts`, `src/game/campaign.ts`, `WorldScene.ts`, `ResultsScene.ts`, `src/ui/mosaic/**` | One owner per hot file per wave; world.ts and campaign.ts pass from ST-02 to AI-02, AR-01, EV-01, FW-02, AR-03, AR-02, AR-04. |

## Waves

Each wave holds at most 4 stories (the brief's limit counts the `assets` agent while its queue runs, W1–W6). Inside a wave the file sets are disjoint; this was checked by a script over the "Files owned" column. A wave can start a story as soon as that story's own dependencies are merged: waves are an ordering, not a barrier. Days: expected agent-days; the wave length is its longest story.

| Wave | Goal | Stories | Length (E days) | Work (E days) |
| --- | --- | --- | --- | --- |
| **W1** | Foundation starts: v1 sim frozen, battle input extracted, tokens and type fixed, hub mockups rendered. | AS-01, ST-01, IN-01, F-01 | 2.5 | 6.5 |
| **W2** | Kit controls; train-2 types and zod pre-declared; battle live bugs B3/B5/B6; busts. | AS-02, ST-03, LF-01, F-02 | 2.5 | 6.5 |
| **W3** | Kit overlays; the first two sim features (doctrines, face + focus) in parallel; icons. | AS-03, AI-01, FO-01, F-03 | 3 | 9 |
| **W4** | The one v5 save bump; orb + feint; the Beast Trial farm closed; frescoes and vignettes. | AS-04, ST-02, FO-02, LF-02 | 2.5 | 7.5 |
| **W5** | Icon atlas; captains; selection and the knob sends face; beast plates. | AS-05, F-04, AI-02, CT-01 | 2.5 | 7 |
| **W6** | Kit scene; cohesion and army break; QA plan; expansion pixel art. The assets queue is done. | AS-06, FO-03, F-05, QA-01 | 2 | 5.5 |
| **W7** | Perk paths; ladder and war doctrines; targeting; small-screen war blockers and 320x640 in CI. | AB-01, AI-03, CT-02, LF-03 | 3 | 8 |
| **W8** | Signature actives; undo; input contract for menus; the 8-man opening. | AB-02, CT-03, IN-02, AR-01 | 3 | 8 |
| **W9** | The Standard; battle camera; tab bar and Back contract; dead code out. | AB-03, CT-05, HUB-01, F-06 | 2 | 6 |
| **W10** | Field-works sim; previews and the Then queue; Campaign hub; event engine. | FW-01, CT-04, HUB-02, EV-01 | 3 | 10 |
| **W11** | Works allowance and bot placement; morale glyph and cards; starter deck; first run. | FW-02, RD-01, EV-02, TUT-01 | 2 | 7.5 |
| **W12** | Class re-cost; flank arcs and banners; tier 3; the Army template. | EC-04, RD-02, AR-03, ARM-01 | 2.5 | 8.5 |
| **W13** | Item power cap; orb/feint buttons and the attention budget; lair assaults; Hero screen. | EC-02, CT-07, AR-02, HERO-01 | 3 | 10 |
| **W14** | Sim train 2 closes; works tray; event card; why-line. | ST-04, FW-03, EV-03, RD-03 | 2.5 | 7.5 |
| **W15** | The host and the end state; ladder pause and the 30-min ticket; Codex; Settings. | AR-04, CT-06, CDX-01, DLG-01 | 2.5 | 9 |
| **W16** | Battle HUD chrome; World map; Settlement; Shop hub. | BTL-01, WLD-01, SET-01, SHP-01 | 3 | 10.5 |
| **W17** | Tutorial; arc surfaces on the map; Camp; Results. | TUT-02, WLD-02, CMP-01, RES-01 | 3 | 10.5 |
| **W18** | Juice tiers; Duels hub; War hub; Market. | FL-01, DUE-01, WAR-01, MKT-01 | 3.5 | 11 |
| **W19** | Audio; duel sub-screens; Clan and Merchant; forge reroll. | FL-03, DUE-02, WAR-02, EC-01 | 3 | 9.5 |
| **W20** | Transitions; remaining sheets; regression suite. | FL-02, DLG-02, QA-02 | 2 | 6 |
| **W21** | v3 and inkify retired; final balance re-run. | F-07, FL-04 | 1 | 2 |
| **W22** | Full-game playthrough and playtest report. | QA-03 | 2 | 2 |
| **W23** | Code review, simplify, tech debt; retrain cost decision. | QA-04, EC-03 | 3 | 3.5 |
| **W24** | Performance profile. | QA-05 | 2 | 2 |
| **W25** | Gate check, milestone review, REPORT.md. | QA-06 | 1.5 | 1.5 |
| | **Total** | 86 stories | **62.5** (critical path by waves) | **175** |

## File-ownership matrix and dispatch cards, per wave

For each wave: who owns which files, what nobody else may touch in that wave, and the exact skill and agent paths for the subagent prompt. Shared append-only files (STORIES.md "Conventions") are allowed to every story. `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`.

### W1: Foundation starts: v1 sim frozen, battle input extracted, tokens and type fixed, hub mockups rendered.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AS-01** | `docs/v5/gemini/**`<br>`docs/v5/ASSET_LOG.md`<br>`docs/v5/art/asset-manifest.json`<br>`public/art/v5/**`<br>`docs/v5/ux/HUB_PICK.md` | S2-ART-BIBLE merged |
| **ST-01** | `server/src/sims/v1/**`<br>`server/src/battle.ts`<br>`src/sim/version.ts`<br>`server/test/simVersion.test.ts`<br>`tests/simVersion.test.ts`<br>`tests/fixtures/replay-v1*.json` | none |
| **IN-01** | `src/ui/input/**`<br>`src/ui/dragFormation.ts`<br>`src/ui/radialOrders.ts`<br>`src/scenes/BattleScene.ts`<br>`src/i18n/battle.en.ts`<br>`src/i18n/battle.ru.ts`<br>`tests/drag.test.ts`<br>`tests/input.test.ts`<br>`design/adr/ADR-0004-input-layer.md` | none |
| **F-01** | `src/ui/tokens.ts`<br>`src/ui/theme.ts`<br>`src/ui/fonts.ts`<br>`src/art/font.ts`<br>`src/art/fontMetrics.ts`<br>`src/art/palette.ts`<br>`src/ui/textfit.ts`<br>`tests/tokens.test.ts`<br>`tests/format.test.ts` | S2-ART-BIBLE merged |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → IN-01; `src/ui/dragFormation.ts` → IN-01; `src/ui/input/**` → IN-01; `server/src/battle.ts` → ST-01.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AS-01** (Visual/Feel, est. 0.5 / **1** / 2): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/art-bible/SKILL.md`, `$F/.claude/skills/ux-review/SKILL.md`; agents `$F/.claude/agents/art-director.md`, `$F/.claude/agents/technical-artist.md`, `$F/.claude/agents/ux-designer.md`.
- **ST-01** (Integration, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/architecture-decision/SKILL.md`, `$F/.claude/skills/security-audit/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/network-programmer.md`, `$F/.claude/agents/lead-programmer.md`.
- **IN-01** (Integration, est. 2 / **2.5** / 4): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/architecture-decision/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/lead-programmer.md`.
- **F-01** (UI, est. 1 / **1.5** / 3): skills `$F/.claude/skills/design-system/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/accessibility-specialist.md`, `$F/.claude/agents/art-director.md`.

</details>

### W2: Kit controls; train-2 types and zod pre-declared; battle live bugs B3/B5/B6; busts.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AS-02** | `docs/v5/gemini/**`<br>`docs/v5/ASSET_LOG.md`<br>`docs/v5/art/asset-manifest.json`<br>`public/art/v5/**` | AS-01 |
| **ST-03** | `src/sim/types.ts`<br>`server/src/battle.ts`<br>`src/dev/balance.ts`<br>`src/dev/doctrineBalance.ts`<br>`src/dev/ordersBalance.ts`<br>`src/dev/worksBalance.ts`<br>`src/dev/arcBalance.ts`<br>`tests/simTypes.test.ts`<br>`server/test/battleSchema.test.ts` | ST-01 |
| **LF-01** | `src/ui/battlePanel.ts`<br>`src/ui/battleHud.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/battleLiveFixes.test.ts` | IN-01 |
| **F-02** | `src/ui/mosaic/**`<br>`src/art/mosaicUi.ts`<br>`src/ui/kit.ts`<br>`tests/mosaic.test.ts`<br>`design/adr/ADR-0005-ui-kit.md` | F-01 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → LF-01; `src/ui/battlePanel.ts` → LF-01; `src/ui/battleHud.ts` → LF-01; `src/sim/types.ts` → ST-03; `server/src/battle.ts` → ST-03; `src/ui/mosaic/**` → F-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AS-02** (Visual/Feel, est. 1.5 / **2** / 4): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/art-bible/SKILL.md`; agents `$F/.claude/agents/art-director.md`, `$F/.claude/agents/technical-artist.md`.
- **ST-03** (Integration, est. 0.5 / **1** / 1.5): skills `$F/.claude/skills/architecture-decision/SKILL.md`, `$F/.claude/skills/security-audit/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/network-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **LF-01** (Logic, est. 0.5 / **1** / 2): skills `$F/.claude/skills/bug-report/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/qa-tester.md`.
- **F-02** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/design-system/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `~/.claude/plugins/marketplaces/anthropic-agent-skills/skills/frontend-design/SKILL.md`, `$F/.claude/skills/architecture-decision/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`.

</details>

### W3: Kit overlays; the first two sim features (doctrines, face + focus) in parallel; icons.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AS-03** | `docs/v5/gemini/**`<br>`docs/v5/ASSET_LOG.md`<br>`docs/v5/art/asset-manifest.json`<br>`public/art/v5/**` | AS-02 |
| **AI-01** | `src/data/doctrines.ts`<br>`src/sim/ai.ts`<br>`src/game/enemy.ts`<br>`src/dev/doctrineBalance.ts`<br>`tests/aiDoctrines.test.ts`<br>`server/test/doctrine.test.ts` | ST-03 |
| **FO-01** | `src/sim/battle.ts`<br>`src/dev/ordersBalance.ts`<br>`tests/orders.test.ts`<br>`server/test/ordersReplay.test.ts` | ST-03 |
| **F-03** | `src/ui/sheet.ts`<br>`src/ui/confirm.ts`<br>`src/ui/widgets.ts`<br>`src/ui/mosaic/ParchmentSheet.ts`<br>`tests/ui.test.ts` | F-01 |

**Hotspots held this wave:** `src/sim/battle.ts` → FO-01; `src/sim/ai.ts` → AI-01; `src/game/enemy.ts` → AI-01; `src/ui/mosaic/**` → F-03.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AS-03** (Visual/Feel, est. 1 / **1.5** / 3): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/art-bible/SKILL.md`; agents `$F/.claude/agents/art-director.md`, `$F/.claude/agents/technical-artist.md`.
- **AI-01** (Logic, est. 2 / **3** / 5): skills `$F/.claude/skills/game-ai/SKILL.md`, `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ai-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **FO-01** (Logic, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **F-03** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/design-system/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`.

</details>

### W4: The one v5 save bump; orb + feint; the Beast Trial farm closed; frescoes and vignettes.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AS-04** | `docs/v5/gemini/**`<br>`docs/v5/ASSET_LOG.md`<br>`docs/v5/art/asset-manifest.json`<br>`public/art/v5/**` | AS-03 |
| **ST-02** | `src/game/save.ts`<br>`src/state.ts`<br>`src/world/world.ts`<br>`tests/saveMigration.test.ts`<br>`tests/fixtures/save-v5*.json`<br>`design/adr/ADR-0002-save-migration.md` | none |
| **FO-02** | `src/sim/battle.ts`<br>`src/sim/formation.ts`<br>`src/dev/ordersBalance.ts`<br>`tests/orb.test.ts`<br>`tests/feint.test.ts` | FO-01 |
| **LF-02** | `design/gdd/practice-fight.md`<br>`src/scenes/BeastTrialScene.ts`<br>`src/game/beasts.ts`<br>`src/game/loot.ts`<br>`src/game/campaignBattle.ts`<br>`src/scenes/ResultsScene.ts`<br>`src/art/beastArt.ts`<br>`src/art/ground.ts`<br>`src/ui/beastView.ts`<br>`docs/GAMEPLAY.md`<br>`tests/practice.test.ts` | none |

**Hotspots held this wave:** `src/sim/battle.ts` → FO-02; `src/game/save.ts` → ST-02; `src/world/world.ts` → ST-02; `src/scenes/ResultsScene.ts` → LF-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AS-04** (Visual/Feel, est. 1 / **1.5** / 3): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/art-bible/SKILL.md`; agents `$F/.claude/agents/art-director.md`, `$F/.claude/agents/technical-artist.md`.
- **ST-02** (Integration, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/save-systems/SKILL.md`, `$F/.claude/skills/architecture-decision/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/lead-programmer.md`.
- **FO-02** (Logic, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **LF-02** (Logic, est. 1 / **2** / 3): skills `$F/.claude/skills/quick-design/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/economy-designer.md`, `$F/.claude/agents/gameplay-programmer.md`.

</details>

### W5: Icon atlas; captains; selection and the knob sends face; beast plates.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AS-05** | `docs/v5/gemini/**`<br>`docs/v5/ASSET_LOG.md`<br>`docs/v5/art/asset-manifest.json`<br>`public/art/v5/**` | AS-04 |
| **F-04** | `src/art/iconBitmaps.ts`<br>`src/art/uiIcons.ts`<br>`src/art/iconStyle.ts`<br>`src/art/vectorIcons.ts`<br>`src/art/icons.ts`<br>`scripts/art/atlas.mjs`<br>`public/icons/**`<br>`tests/iconAtlas.test.ts` | F-01, AS-03 |
| **AI-02** | `src/sim/stats.ts`<br>`src/world/world.ts`<br>`src/game/campaign.ts`<br>`src/game/report.ts`<br>`src/dev/doctrineBalance.ts`<br>`tests/captains.test.ts` | AI-01, ST-02 |
| **CT-01** | `src/ui/input/**`<br>`src/ui/dragFormation.ts`<br>`src/ui/battlePanel.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/hitTest.test.ts` | IN-01, FO-01, LF-01 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-01; `src/ui/battlePanel.ts` → CT-01; `src/ui/dragFormation.ts` → CT-01; `src/ui/input/**` → CT-01; `src/sim/stats.ts` → AI-02; `src/world/world.ts` → AI-02; `src/game/campaign.ts` → AI-02; `src/game/report.ts` → AI-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AS-05** (Visual/Feel, est. 0.5 / **1** / 2): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/art-bible/SKILL.md`; agents `$F/.claude/agents/art-director.md`, `$F/.claude/agents/technical-artist.md`.
- **F-04** (Integration, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/technical-artist.md`, `$F/.claude/agents/ui-programmer.md`.
- **AI-02** (Logic, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/game-ai/SKILL.md`, `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/rpg/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ai-programmer.md`, `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/economy-designer.md`.
- **CT-01** (Logic, est. 1.5 / **2** / 3): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/ux-designer.md`.

</details>

### W6: Kit scene; cohesion and army break; QA plan; expansion pixel art. The assets queue is done.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AS-06** | `docs/v5/gemini/**`<br>`docs/v5/ASSET_LOG.md`<br>`docs/v5/art/asset-manifest.json`<br>`public/art/v5/**` | AS-05 |
| **FO-03** | `src/sim/battle.ts`<br>`src/dev/ordersBalance.ts`<br>`tests/cohesion.test.ts` | FO-02 |
| **F-05** | `src/scenes/KitScene.ts`<br>`src/scenes/kit/**` | F-02, F-03, F-04 |
| **QA-01** | `production/qa/qa-plan-v5.md` | none |

**Hotspots held this wave:** `src/sim/battle.ts` → FO-03.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AS-06** (Visual/Feel, est. 1 / **1.5** / 3): skills `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/asset-spec/SKILL.md`, `$F/.claude/skills/asset-audit/SKILL.md`, `$F/.claude/skills/art-bible/SKILL.md`; agents `$F/.claude/agents/art-director.md`, `$F/.claude/agents/technical-artist.md`.
- **FO-03** (Logic, est. 1.5 / **2** / 3): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **F-05** (UI, est. 0.5 / **1** / 1.5): skills `$F/.claude/skills/design-system/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`.
- **QA-01** (Config/Data, est. 0.5 / **1** / 1.5): skills `$F/.claude/skills/qa-plan/SKILL.md`, `$F/.claude/skills/test-evidence-review/SKILL.md`; agents `$F/.claude/agents/qa-lead.md`.

</details>

### W7: Perk paths; ladder and war doctrines; targeting; small-screen war blockers and 320x640 in CI.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AB-01** | `src/data/perks.ts`<br>`src/data/classes.ts`<br>`src/sim/stats.ts`<br>`src/game/heroes.ts`<br>`src/duel/rules.ts`<br>`src/duel/heroSource.ts`<br>`server/src/duel/verify.ts`<br>`server/src/duel/store.ts`<br>`tests/perkPaths.test.ts`<br>`tests/abilities.test.ts`<br>`server/test/perks.test.ts` | ST-03, ST-02, AI-02 |
| **AI-03** | `src/duel/ladder.ts`<br>`server/src/online/camps.ts`<br>`server/src/online/bosses.ts`<br>`tests/ladderDoctrine.test.ts`<br>`server/test/neutrals.test.ts` | AI-01 |
| **CT-02** | `src/ui/battleHud.ts`<br>`src/ui/battlePanel.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/targeting.test.ts` | CT-01, FO-01 |
| **LF-03** | `scripts/layout-check.mjs`<br>`scripts/layout-allowlist.json`<br>`src/scenes/online/OnlineScene.ts`<br>`src/scenes/online/OnlineArmyScene.ts` | none |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-02; `src/ui/battlePanel.ts` → CT-02; `src/ui/battleHud.ts` → CT-02; `src/sim/stats.ts` → AB-01; `scripts/layout-check.mjs` → LF-03; `src/data/perks.ts` → AB-01; `src/data/classes.ts` → AB-01; `src/duel/ladder.ts` → AI-03; `src/scenes/online/OnlineScene.ts` → LF-03.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AB-01** (Logic, est. 2 / **3** / 4.5): skills `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/save-systems/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/network-programmer.md`.
- **AI-03** (Integration, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/game-ai/SKILL.md`, `$F/.claude/skills/security-audit/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/network-programmer.md`, `$F/.claude/agents/ai-programmer.md`.
- **CT-02** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/ux-designer.md`.
- **LF-03** (UI, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/smoke-check/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/qa-tester.md`.

</details>

### W8: Signature actives; undo; input contract for menus; the 8-man opening.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AB-02** | `src/sim/battle.ts`<br>`src/sim/ai.ts`<br>`src/data/perks.ts`<br>`src/dev/classBalance.ts`<br>`tests/actives.test.ts` | AB-01, FO-03, AI-01 |
| **CT-03** | `src/ui/input/undo.ts`<br>`src/scenes/BattleScene.ts`<br>`src/ui/battlePanel.ts`<br>`tests/undo.test.ts` | CT-01 |
| **IN-02** | `scripts/layout-check.mjs`<br>`scripts/layout-allowlist.json`<br>`src/ui/layoutCheck.ts`<br>`src/ui/v3.ts`<br>`src/ui/hover.ts` | IN-01, F-02, LF-03 |
| **AR-01** | `src/game/heroes.ts`<br>`src/game/campaign.ts`<br>`src/world/world.ts`<br>`src/world/camp.ts`<br>`src/dev/arcBalance.ts`<br>`tests/opening.test.ts` | ST-02, ST-03, AB-01 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-03; `src/ui/battlePanel.ts` → CT-03; `src/ui/input/**` → CT-03; `src/sim/battle.ts` → AB-02; `src/sim/ai.ts` → AB-02; `src/world/world.ts` → AR-01; `src/game/campaign.ts` → AR-01; `scripts/layout-check.mjs` → IN-02; `src/data/perks.ts` → AB-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AB-02** (Logic, est. 2 / **3** / 5): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`, `$F/.claude/skills/game-ai/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/ai-programmer.md`.
- **CT-03** (Logic, est. 1.5 / **2** / 3): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/ux-designer.md`.
- **IN-02** (Integration, est. 1 / **1.5** / 2): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **AR-01** (Logic, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/level-design/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/game-designer.md`, `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/gameplay-programmer.md`.

</details>

### W9: The Standard; battle camera; tab bar and Back contract; dead code out.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AB-03** | `src/sim/battle.ts`<br>`src/sim/stats.ts`<br>`src/dev/classBalance.ts`<br>`tests/standard.test.ts` | AB-02, AI-02, FO-03 |
| **CT-05** | `src/ui/battleCamera.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/camera.test.ts` | IN-01 |
| **HUB-01** | `src/ui/mosaic/TabBar.ts`<br>`src/ui/mosaic/tabLayout.ts`<br>`src/ui/mosaic/subShell.ts`<br>`src/platform/nav.ts`<br>`src/scenes/BaseScene.ts`<br>`tests/nav.test.ts` | F-02, F-03, IN-02 |
| **F-06** | `src/scenes/WorldScene.ts`<br>`src/scenes/online/OnlineScene.ts`<br>`src/scenes/online/campPanel.ts`<br>`src/scenes/online/common.ts`<br>`src/game/campaign.ts` | none |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-05; `src/sim/battle.ts` → AB-03; `src/sim/stats.ts` → AB-03; `src/game/campaign.ts` → F-06; `src/scenes/WorldScene.ts` → F-06; `src/ui/mosaic/**` → HUB-01; `src/scenes/BaseScene.ts` → HUB-01; `src/scenes/online/OnlineScene.ts` → F-06.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AB-03** (Logic, est. 1.5 / **2** / 3): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **CT-05** (Logic, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/camera-systems/SKILL.md`, `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`.
- **HUB-01** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **F-06** (Config/Data, est. 0.5 / **0.5** / 1): skills `$F/.claude/skills/tech-debt/SKILL.md`, `$F/.claude/skills/code-review/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`; agents `$F/.claude/agents/lead-programmer.md`.

</details>

### W10: Field-works sim; previews and the Then queue; Campaign hub; event engine.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **FW-01** | `src/data/terrain.ts`<br>`src/sim/terrain.ts`<br>`src/sim/battle.ts`<br>`src/dev/worksBalance.ts`<br>`tests/works.test.ts` | AB-03 |
| **CT-04** | `src/ui/orderQueue.ts`<br>`src/ui/battleHud.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/orderQueue.test.ts` | CT-03 |
| **HUB-02** | `src/scenes/MenuScene.ts`<br>`src/ui/mosaic/hub.ts`<br>`src/i18n/hub.en.ts`<br>`src/i18n/hub.ru.ts` | HUB-01, AS-01, AS-02, AS-04 |
| **EV-01** | `src/data/events.ts`<br>`src/world/world.ts`<br>`src/game/campaign.ts`<br>`src/game/loot.ts`<br>`tests/events.test.ts` | ST-02 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-04; `src/ui/battleHud.ts` → CT-04; `src/sim/battle.ts` → FW-01; `src/world/world.ts` → EV-01; `src/game/campaign.ts` → EV-01; `src/ui/mosaic/**` → HUB-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **FW-01** (Logic, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`, `$F/.claude/skills/level-design/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/level-designer.md`, `$F/.claude/agents/systems-designer.md`.
- **CT-04** (Logic, est. 2 / **3** / 5): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/ux-designer.md`.
- **HUB-02** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `~/.claude/skills/design-ship/SKILL.md`, `~/.claude/plugins/marketplaces/anthropic-agent-skills/skills/frontend-design/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **EV-01** (Logic, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/dialogue-systems/SKILL.md`, `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/save-systems/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/game-designer.md`, `$F/.claude/agents/gameplay-programmer.md`.

</details>

### W11: Works allowance and bot placement; morale glyph and cards; starter deck; first run.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **FW-02** | `src/game/campaign.ts`<br>`src/game/enemy.ts`<br>`src/sim/ai.ts`<br>`src/dev/worksBalance.ts`<br>`tests/worksAllowance.test.ts` | FW-01, AB-02 |
| **RD-01** | `src/ui/battleHud.ts`<br>`src/ui/battlePanel.ts`<br>`src/art/vectorIcons.ts`<br>`tests/groupState.test.ts` | F-01, F-04, LF-01 |
| **EV-02** | `src/data/eventDeck.ts`<br>`src/dev/eventBalance.ts`<br>`src/i18n/events.en.ts`<br>`src/i18n/events.ru.ts`<br>`tests/eventDeck.test.ts` | EV-01 |
| **TUT-01** | `src/scenes/FirstRunScene.ts`<br>`src/scenes/BootScene.ts`<br>`src/i18n/firstrun.en.ts`<br>`src/i18n/firstrun.ru.ts` | HUB-01, AS-04 |

**Hotspots held this wave:** `src/ui/battlePanel.ts` → RD-01; `src/ui/battleHud.ts` → RD-01; `src/sim/ai.ts` → FW-02; `src/game/campaign.ts` → FW-02; `src/game/enemy.ts` → FW-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **FW-02** (Logic, est. 1.5 / **2** / 3): skills `$F/.claude/skills/team-combat/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`, `$F/.claude/skills/game-ai/SKILL.md`; agents `$F/.claude/agents/ai-programmer.md`, `$F/.claude/agents/systems-designer.md`.
- **RD-01** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **EV-02** (Config/Data, est. 1.5 / **2** / 3): skills `$F/.claude/skills/dialogue-systems/SKILL.md`, `$F/.claude/skills/team-narrative/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/localize/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`; agents `$F/.claude/agents/writer.md`, `$F/.claude/agents/economy-designer.md`, `$F/.claude/agents/game-designer.md`.
- **TUT-01** (UI, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W12: Class re-cost; flank arcs and banners; tier 3; the Army template.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **EC-04** | `src/data/classes.ts`<br>`src/data/units.ts`<br>`src/dev/classBalance.ts`<br>`docs/GAMEPLAY.md`<br>`server/test/budget.test.ts` | AB-03, FO-01 |
| **RD-02** | `src/ui/battleFx.ts`<br>`src/ui/battleHud.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/flankArc.test.ts` | RD-01, FO-03 |
| **AR-03** | `src/world/world.ts`<br>`src/game/sources.ts`<br>`src/game/campaign.ts`<br>`src/game/loot.ts`<br>`src/dev/arcBalance.ts`<br>`tests/sources.test.ts` | AR-01 |
| **ARM-01** | `src/scenes/ArmyScene.ts`<br>`src/ui/army/**`<br>`src/i18n/army.v5.en.ts`<br>`src/i18n/army.v5.ru.ts` | HUB-01, AS-02 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → RD-02; `src/ui/battleHud.ts` → RD-02; `src/ui/battleFx.ts` → RD-02; `src/world/world.ts` → AR-03; `src/game/campaign.ts` → AR-03; `src/data/classes.ts` → EC-04.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **EC-04** (Config/Data, est. 1.5 / **2** / 3): skills `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/team-combat/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`; agents `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/economy-designer.md`.
- **RD-02** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/game-feel/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/technical-artist.md`.
- **AR-03** (Logic, est. 1 / **2** / 3): skills `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/procedural-gen/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/economy-designer.md`.
- **ARM-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W13: Item power cap; orb/feint buttons and the attention budget; lair assaults; Hero screen.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **EC-02** | `src/data/items.ts`<br>`src/data/sets.ts`<br>`src/data/affixes.ts`<br>`src/dev/rarityBalance.ts`<br>`docs/ITEMS.md` | AB-03 |
| **CT-07** | `src/ui/battlePanel.ts`<br>`src/ui/battleHud.ts`<br>`src/ui/input/**`<br>`src/scenes/BattleScene.ts`<br>`tests/attention.test.ts` | CT-04, FO-02 |
| **AR-02** | `src/data/arc.ts`<br>`src/world/world.ts`<br>`src/game/campaign.ts`<br>`src/world/battlefield.ts`<br>`src/game/enemy.ts`<br>`src/dev/arcBalance.ts`<br>`tests/lairs.test.ts` | AR-01, FW-01, AI-02 |
| **HERO-01** | `src/scenes/HeroScene.ts`<br>`src/scenes/heroSource.ts`<br>`src/i18n/hero.en.ts`<br>`src/i18n/hero.ru.ts` | HUB-01, AB-01, AS-02 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-07; `src/ui/battlePanel.ts` → CT-07; `src/ui/battleHud.ts` → CT-07; `src/ui/input/**` → CT-07; `src/world/world.ts` → AR-02; `src/game/campaign.ts` → AR-02; `src/game/enemy.ts` → AR-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **EC-02** (Config/Data, est. 1.5 / **2** / 3): skills `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/rpg/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`; agents `$F/.claude/agents/economy-designer.md`, `$F/.claude/agents/systems-designer.md`.
- **CT-07** (UI, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/accessibility-specialist.md`, `$F/.claude/agents/ux-designer.md`.
- **AR-02** (Logic, est. 2 / **3** / 5): skills `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/level-design/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/level-designer.md`, `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/gameplay-programmer.md`.
- **HERO-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W14: Sim train 2 closes; works tray; event card; why-line.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **ST-04** | `tests/fixtures/replay-v2*.json`<br>`server/test/trainReplay.test.ts`<br>`server/src/simVersion.ts`<br>`docs/v5/balance/TRAIN2.md`<br>`docs/OPS.md` | AI-03, FO-03, AB-03, FW-02, EC-02, EC-04 |
| **FW-03** | `src/ui/battlePanel.ts`<br>`src/ui/input/**`<br>`src/scenes/BattleScene.ts`<br>`src/art/terrainArt.ts`<br>`src/i18n/works.en.ts`<br>`src/i18n/works.ru.ts` | FW-02, CT-03, AS-06 |
| **EV-03** | `src/ui/sheets/eventCard.ts`<br>`src/scenes/WorldScene.ts`<br>`src/scenes/SettlementScene.ts`<br>`src/scenes/CampScene.ts` | EV-02, F-03 |
| **RD-03** | `src/game/report.ts`<br>`src/scenes/ResultsScene.ts`<br>`tests/battleReport.test.ts` | FO-03, AI-02, LF-02 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → FW-03; `src/ui/battlePanel.ts` → FW-03; `src/ui/input/**` → FW-03; `src/game/report.ts` → RD-03; `src/scenes/WorldScene.ts` → EV-03; `src/scenes/ResultsScene.ts` → RD-03; `src/scenes/SettlementScene.ts` → EV-03; `src/scenes/CampScene.ts` → EV-03.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **ST-04** (Integration, est. 1.5 / **2** / 3.5): skills `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/regression-suite/SKILL.md`, `$F/.claude/skills/smoke-check/SKILL.md`, `$F/.claude/skills/security-audit/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/network-programmer.md`, `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/qa-lead.md`.
- **FW-03** (UI, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/create-game-assets/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/ux-designer.md`.
- **EV-03** (UI, est. 1 / **1.5** / 2.5): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/dialogue-systems/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **RD-03** (Logic, est. 1 / **1.5** / 2): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/game-designer.md`.

</details>

### W15: The host and the end state; ladder pause and the 30-min ticket; Codex; Settings.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **AR-04** | `src/data/arc.ts`<br>`src/world/world.ts`<br>`src/world/map.ts`<br>`src/game/campaign.ts`<br>`tests/host.test.ts` | AR-02, AR-03 |
| **CT-06** | `src/scenes/BattleScene.ts`<br>`src/duel/ladder.ts`<br>`src/duel/client.ts`<br>`server/src/duel/routes.ts`<br>`server/src/tickets.ts`<br>`tests/ladderPause.test.ts`<br>`server/test/ladderTicket.test.ts` | CT-05, AI-03, ST-04 |
| **CDX-01** | `src/scenes/CodexScene.ts`<br>`src/scenes/BeastTrialScene.ts`<br>`src/ui/beastInfo.ts`<br>`src/ui/sheets/doctrine.ts`<br>`src/i18n/codex.en.ts`<br>`src/i18n/codex.ru.ts` | LF-02, AI-01, AS-05, F-04, HUB-01 |
| **DLG-01** | `src/ui/settings.ts`<br>`src/ui/notifySettings.ts`<br>`src/ui/legal.ts`<br>`src/ui/lang.ts`<br>`tests/settings.test.ts` | F-03, ST-02 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → CT-06; `src/world/world.ts` → AR-04; `src/game/campaign.ts` → AR-04; `src/duel/ladder.ts` → CT-06.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **AR-04** (Logic, est. 1.5 / **2.5** / 4): skills `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/game-ai/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/game-designer.md`, `$F/.claude/agents/systems-designer.md`.
- **CT-06** (Integration, est. 1.5 / **2** / 3): skills `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/security-audit/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/gameplay-programmer.md`, `$F/.claude/agents/network-programmer.md`.
- **CDX-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **DLG-01** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/save-systems/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W16: Battle HUD chrome; World map; Settlement; Shop hub.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **BTL-01** | `src/ui/battleHud.ts`<br>`src/ui/battlePanel.ts`<br>`src/scenes/BattleScene.ts`<br>`src/ui/sheets/battleMenu.ts` | RD-02, CT-07, FW-03, F-02, F-03 |
| **WLD-01** | `src/scenes/WorldScene.ts`<br>`src/ui/sheets/encounter.ts`<br>`src/art/worldArt.ts`<br>`src/i18n/world.v5.en.ts`<br>`src/i18n/world.v5.ru.ts` | HUB-01, AI-02, EV-03 |
| **SET-01** | `src/scenes/SettlementScene.ts`<br>`src/ui/sheets/recruit.ts`<br>`src/i18n/settlement.en.ts`<br>`src/i18n/settlement.ru.ts` | HUB-01, AB-01, AS-04, AR-04, EV-03 |
| **SHP-01** | `src/scenes/ShopScene.ts`<br>`src/ui/econ/**`<br>`src/i18n/shop.v5.en.ts`<br>`src/i18n/shop.v5.ru.ts` | HUB-01, AS-04 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → BTL-01; `src/ui/battlePanel.ts` → BTL-01; `src/ui/battleHud.ts` → BTL-01; `src/scenes/WorldScene.ts` → WLD-01; `src/scenes/SettlementScene.ts` → SET-01.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **BTL-01** (UI, est. 2 / **3** / 4.5): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **WLD-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **SET-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/rpg/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **SHP-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W17: Tutorial; arc surfaces on the map; Camp; Results.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **TUT-02** | `src/ui/tutorial/**`<br>`src/game/tutorial.ts`<br>`src/i18n/tutorial.en.ts`<br>`src/i18n/tutorial.ru.ts`<br>`scripts/tutorial-smoke.mjs`<br>`tests/tutorial.test.ts` | BTL-01, CT-07, RD-02 |
| **WLD-02** | `src/scenes/WorldScene.ts`<br>`src/ui/sheets/assault.ts`<br>`src/ui/sheets/arcSheet.ts`<br>`src/i18n/arc.en.ts`<br>`src/i18n/arc.ru.ts` | WLD-01, AR-04 |
| **CMP-01** | `src/scenes/CampScene.ts`<br>`src/ui/campLife.ts`<br>`src/ui/campIsoLife.ts`<br>`src/i18n/camp.v5.en.ts`<br>`src/i18n/camp.v5.ru.ts` | HUB-01, FW-02, EV-03 |
| **RES-01** | `src/scenes/ResultsScene.ts`<br>`src/ui/results/**`<br>`src/i18n/results.en.ts`<br>`src/i18n/results.ru.ts` | RD-03, AR-04, AS-05, LF-02 |

**Hotspots held this wave:** `src/scenes/WorldScene.ts` → WLD-02; `src/scenes/ResultsScene.ts` → RES-01; `src/scenes/CampScene.ts` → CMP-01.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **TUT-02** (UI, est. 2 / **3** / 5): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/team-narrative/SKILL.md`, `$F/.claude/skills/input-systems/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/writer.md`, `$F/.claude/agents/gameplay-programmer.md`.
- **WLD-02** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/level-design/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **CMP-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **RES-01** (UI, est. 2 / **2.5** / 4): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W18: Juice tiers; Duels hub; War hub; Market.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **FL-01** | `src/ui/battleFx.ts`<br>`src/ui/motion.ts`<br>`src/scenes/BattleScene.ts`<br>`tests/juice.test.ts` | BTL-01, DLG-01 |
| **DUE-01** | `src/scenes/duel/DuelScene.ts`<br>`src/scenes/duel/duelParts.ts`<br>`src/scenes/duel/duelIcons.ts`<br>`src/i18n/duels.v5.en.ts`<br>`src/i18n/duels.v5.ru.ts` | ARM-01, CT-06, AS-04 |
| **WAR-01** | `src/scenes/online/OnlineScene.ts`<br>`src/scenes/online/OnlineArmyScene.ts`<br>`src/scenes/online/regionMapView.ts`<br>`src/scenes/online/beastPanel.ts`<br>`src/scenes/online/mapLife.ts`<br>`src/ui/tutorial/onlineCoach.ts` | ARM-01, LF-03 |
| **MKT-01** | `src/scenes/MarketScene.ts`<br>`src/i18n/market.en.ts`<br>`src/i18n/market.ru.ts` | HUB-01 |

**Hotspots held this wave:** `src/scenes/BattleScene.ts` → FL-01; `src/ui/battleFx.ts` → FL-01; `src/ui/motion.ts` → FL-01; `src/scenes/duel/DuelScene.ts` → DUE-01; `src/scenes/online/OnlineScene.ts` → WAR-01.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **FL-01** (Visual/Feel, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-feel/SKILL.md`, `$F/.claude/skills/team-polish/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/technical-artist.md`, `$F/.claude/agents/gameplay-programmer.md`.
- **DUE-01** (UI, est. 2.5 / **3.5** / 5): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **WAR-01** (UI, est. 2.5 / **3.5** / 5): skills `$F/.claude/skills/ux-design/SKILL.md`, `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/team-ui/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **MKT-01** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.

</details>

### W19: Audio; duel sub-screens; Clan and Merchant; forge reroll.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **FL-03** | `src/audio/**`<br>`scripts/audio-smoke.mjs`<br>`tests/audio.test.ts` | FL-01 |
| **DUE-02** | `src/scenes/duel/DuelScene.ts`<br>`src/scenes/duel/duelParts.ts` | DUE-01 |
| **WAR-02** | `src/scenes/online/ClanScene.ts`<br>`src/scenes/online/MerchantScene.ts`<br>`src/scenes/online/textInput.ts`<br>`src/i18n/clan.en.ts`<br>`src/i18n/clan.ru.ts` | HUB-01 |
| **EC-01** | `design/gdd/forge-reroll.md`<br>`src/game/gear.ts`<br>`src/game/economy.ts`<br>`src/ui/sheets/forge.ts`<br>`src/scenes/SettlementScene.ts`<br>`docs/ITEMS.md`<br>`tests/forge.test.ts` | SET-01, AR-03 |

**Hotspots held this wave:** `src/scenes/SettlementScene.ts` → EC-01; `src/scenes/duel/DuelScene.ts` → DUE-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **FL-03** (Visual/Feel, est. 2 / **2.5** / 4): skills `$F/.claude/skills/audio-design/SKILL.md`, `$F/.claude/skills/team-audio/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/sound-designer.md`, `$F/.claude/agents/audio-director.md`.
- **DUE-02** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`.
- **WAR-02** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/localize/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`, `$F/.claude/agents/localization-lead.md`.
- **EC-01** (Logic, est. 2 / **3** / 5): skills `$F/.claude/skills/quick-design/SKILL.md`, `$F/.claude/skills/design-review/SKILL.md`, `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/rpg/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/economy-designer.md`, `$F/.claude/agents/gameplay-programmer.md`.

</details>

### W20: Transitions; remaining sheets; regression suite.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **FL-02** | `src/scenes/BaseScene.ts`<br>`src/ui/motion.ts`<br>`src/ui/mosaic/base.ts` | FL-01, HUB-01 |
| **DLG-02** | `src/ui/duelInvites.ts`<br>`src/ui/online.ts`<br>`src/ui/econ/consumablePicker.ts`<br>`src/i18n/gaps.en.ts`<br>`src/i18n/gaps.ru.ts` | DUE-02, WAR-02, SHP-01, MKT-01, CDX-01, DLG-01 |
| **QA-02** | `scripts/regression/**`<br>`tests/regression/**` | DUE-02, WAR-02, RES-01, CDX-01 |

**Hotspots held this wave:** `src/ui/mosaic/**` → FL-02; `src/ui/motion.ts` → FL-02; `src/scenes/BaseScene.ts` → FL-02.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **FL-02** (Visual/Feel, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-feel/SKILL.md`, `$F/.claude/skills/team-polish/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`; agents `$F/.claude/agents/technical-artist.md`, `$F/.claude/agents/ui-programmer.md`.
- **DLG-02** (UI, est. 1.5 / **2** / 3): skills `$F/.claude/skills/game-ui-ux/SKILL.md`, `$F/.claude/skills/ux-review/SKILL.md`, `$F/.claude/skills/localize/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`, `$F/.claude/skills/dev-story/SKILL.md`, `$F/.claude/skills/story-done/SKILL.md`; agents `$F/.claude/agents/ui-programmer.md`, `$F/.claude/agents/ux-designer.md`, `$F/.claude/agents/accessibility-specialist.md`, `$F/.claude/agents/localization-lead.md`.
- **QA-02** (Integration, est. 1.5 / **2** / 3): skills `$F/.claude/skills/regression-suite/SKILL.md`, `$F/.claude/skills/smoke-check/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`; agents `$F/.claude/agents/qa-lead.md`, `$F/.claude/agents/qa-tester.md`.

</details>

### W21: v3 and inkify retired; final balance re-run.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **F-07** | `src/ui/v3.ts`<br>`src/ui/inkSkin.ts`<br>`src/ui/widgets.ts`<br>`src/ui/fonts.ts`<br>`src/ui/kit.ts`<br>`src/ui/mosaic/rarityInk.ts`<br>`src/ui/mosaic/ParchmentSheet.ts`<br>`src/scenes/KitScene.ts` | DLG-02, HERO-01, SHP-01, DUE-02, WAR-02, CMP-01, WLD-02, BTL-01 |
| **FL-04** | `docs/v5/balance/FINAL.md` | FL-02, FL-03 |

**Hotspots held this wave:** `src/ui/mosaic/**` → F-07.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **F-07** (Config/Data, est. 0.5 / **1** / 2): skills `$F/.claude/skills/tech-debt/SKILL.md`, `$F/.claude/skills/code-review/SKILL.md`, `$F/.claude/skills/phaser-core/SKILL.md`; agents `$F/.claude/agents/lead-programmer.md`, `$F/.claude/agents/ui-programmer.md`.
- **FL-04** (Config/Data, est. 0.5 / **1** / 1.5): skills `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/playtest-report/SKILL.md`; agents `$F/.claude/agents/systems-designer.md`, `$F/.claude/agents/economy-designer.md`.

</details>

### W22: Full-game playthrough and playtest report.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **QA-03** | `docs/v5/qa/PLAYTHROUGH.md`<br>`docs/v5/qa/shots/**` | F-07, FL-04 |

**Hotspots held this wave:** none.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **QA-03** (Integration, est. 1.5 / **2** / 3): skills `$F/.claude/skills/team-qa/SKILL.md`, `$F/.claude/skills/playtest-report/SKILL.md`, `$F/.claude/skills/smoke-check/SKILL.md`; agents `$F/.claude/agents/qa-lead.md`, `$F/.claude/agents/qa-tester.md`, `$F/.claude/agents/game-designer.md`.

</details>

### W23: Code review, simplify, tech debt; retrain cost decision.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **QA-04** | `docs/v5/qa/CODE_REVIEW.md`<br>`files named by each finding` | QA-03 |
| **EC-03** | `src/data/perks.ts`<br>`tests/perkPaths.test.ts` | QA-03 |

**Hotspots held this wave:** `src/data/perks.ts` → EC-03.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **QA-04** (Integration, est. 2 / **3** / 5): skills `$F/.claude/skills/code-review/SKILL.md`, `built-in /simplify (Claude Code)`, `$F/.claude/skills/tech-debt/SKILL.md`; agents `$F/.claude/agents/lead-programmer.md`, `$F/.claude/agents/qa-lead.md`.
- **EC-03** (Config/Data, est. 0.5 / **0.5** / 1): skills `$F/.claude/skills/balance-check/SKILL.md`, `$F/.claude/skills/propagate-design-change/SKILL.md`, `~/.claude/skills/tdd/SKILL.md`; agents `$F/.claude/agents/economy-designer.md`.

</details>

### W24: Performance profile.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **QA-05** | `docs/v5/qa/PERF.md`<br>`files named by each finding` | QA-04 |

**Hotspots held this wave:** none.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **QA-05** (Integration, est. 1.5 / **2** / 3): skills `$F/.claude/skills/perf-profile/SKILL.md`, `$F/.claude/skills/performance-optimization/SKILL.md`; agents `$F/.claude/agents/performance-analyst.md`.

</details>

### W25: Gate check, milestone review, REPORT.md.

| Story | Owns (exclusive this wave) | Depends on |
| --- | --- | --- |
| **QA-06** | `docs/v5/REPORT.md`<br>`docs/v5/qa/GATE.md` | QA-05, EC-03 |

**Hotspots held this wave:** none.

<details><summary>Dispatch cards (skills and agents, full paths)</summary>

- **QA-06** (Config/Data, est. 1 / **1.5** / 2): skills `$F/.claude/skills/gate-check/SKILL.md`, `$F/.claude/skills/milestone-review/SKILL.md`, `$F/.claude/skills/retrospective/SKILL.md`; agents `$F/.claude/agents/producer.md`, `$F/.claude/agents/qa-lead.md`.

</details>

## Risks

| # | Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **`BattleScene.ts` is the bottleneck.** 13 stories own it, one per wave, between W1 and W18. One slip delays controls, readability, the HUD, the tutorial and feel. | High | High | IN-01 extracts input first; later stories add new modules and keep the scene diff small; one owner per wave (matrix). If a battle story slips, the Director moves the next battle story back a wave rather than running two on the scene. |
| R2 | **Sim train chain.** `src/sim/battle.ts` passes FO-01 → FO-02 → FO-03 → AB-02 → AB-03 → FW-01, and ST-04 waits for all of them. A determinism break or a missed balance target found late blocks the train. | Medium | High | ST-03 pre-declares types and zod; each story has its own replay-hash test and its own before/after balance run; a missed target is logged and tuned in EC-04 or EC-02, not a reason to hold the train, unless it breaks an anti-pillar. |
| R3 | **Live players and backward compatibility.** ST-01, AI-03, AB-01, CT-06, EC-02 and EC-04 change what the server accepts. | Medium | High | G-ONLINE on every one: client and server in the same story, tests on both sides, 426/409 instead of crashes, `MIN_SIM_VERSION` grace window, nothing deployed (the user decides). |
| R4 | **One save bump.** ST-02 must declare every v5 field up front. A field found later would need a second bump. | Medium | Medium | The field list comes from the five GDD "Save impact" sections. A later field must be optional with a default and pass the v6 validation, or the Director decides on a bump (logged). |
| R5 | **Assets.** Gemini limits, the art bible merge gating F-01 and AS-01, and mockups that invent features. | Medium | Medium | Screens keep the current art or code-drawn placeholders when an asset is late; wiring is in the screen story, so it can land in a fix-up. Allowlist check tile by tile (memory: verify generated mockups). |
| R6 | **Estimates are uncalibrated.** 175 agent-days with no velocity data; an overnight run may finish only part of the plan. | High | High | Re-estimate after W3; use the cut list below; Must-have stories come first in every lane. |
| R7 | **Balance targets are unmeasured** (GDD_REVIEW verdict CONCERNS). Several GDDs pull the same numbers (ridge 62–68%, archer mean ≥ 40%, RG mean ≥ 46%). | High | Medium | Each mechanic story records before/after; ST-04 and FL-04 record the whole picture; misses get an owner rather than blocking. |
| R8 | **Shared append-only files** (`src/i18n/index.ts`, layout-check fixtures, `docs/GAMEPLAY.md` sections) cause merge conflicts. | Medium | Low | Each story uses its own i18n namespace files; integrators resolve the one-line conflicts; structural edits to `layout-check.mjs` belong only to LF-03 (W7) and IN-02 (W8). |
| R9 | **Attention budget.** Doctrines, orders, actives, works and the Then queue all land on one HUD (holism W4). | Medium | Medium | CT-07 enforces at most 4 kinds of interactive control and the unlock gating; QA-03 runs the 20-man readability row. |

## Dependencies on external factors

- **S2-ART-BIBLE** merge (gates F-01, AS-01, then the whole assets lane and every screen's art).
- **Gemini in Chrome** (user logged in, checked on 2026-10-10); one tab, the `assets` agent only.
- **The Director's hub pick** after AS-01 (gates HUB-02).
- **The user**, only for: deploying anything (never in this run), and the PROPOSALS.md items (pricing, P-1..P-3), which no story touches.

## Definition of done for each wave

- [ ] Every story in the wave merged into `v5` by an integrator, with all gate codes in its AC met (G-ALL always).
- [ ] UI and Visual/Feel stories: screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`, and the Director spot-checked 2–3.
- [ ] Logic and Integration stories: tests exist and pass; online stories pass the server tests too.
- [ ] Mechanic stories: `docs/v5/balance/<story-id>.md` with before and after.
- [ ] Design docs updated for any deviation; `docs/v5/SKILLS_LOG.md` row per story.
- [ ] No S1 or S2 bug open in what the wave delivered.

## QA plan gate (sprint-plan Phase 5)

No QA plan exists yet (`production/qa/` is empty). Answer: **[A] run `/qa-plan`**, scheduled as **QA-01 in W6**, the first wave where a slot is free without delaying the foundation or the sim chain. Until it lands, each story's acceptance criteria and gate codes are its definition of done; QA-01 adds the per-epic test cases and the screen × size × language matrix that QA-02 and QA-03 execute.

---

## Scope check (`/scope-check v5-plan`)

Generated: 2026-10-10. Read-only comparison of this plan against its baseline.

### Original scope (baseline)

The brief's Phases 4–8, the ranked expansions and structural fixes in `docs/v5/VISION.md`, the eight GDDs, `design/ux/` (24 screens, 68 sheets), the open items in `docs/v5/AUDIT.md`, the three deferred items in `GDD_REVIEW.md`, and the Director's expected epic list for this phase (foundation, live fixes, sim train 2, each expansion, controls, readability and HUD, the nine screen groups, assets, feel and audio, economy deferrals, final QA). That is **25 epic-level items**.

### Current scope (this plan)

25 epics, 86 stories, 175 expected agent-days. Every story cites a source (GDD rule, audit ID, A11Y ID, IA spec or brief phase).

### Scope additions (not in the baseline)

| Addition | Source | When | Justified? | Effort |
| --- | --- | --- | --- | --- |
| ST-03 train scaffold (types and zod pre-declared) | this plan | 2026-10-10 | Yes: lets two sim stories run in parallel; no player-facing scope | S |
| `design/gdd/practice-fight.md` inside LF-02 | PROGRESS queue ("needs a /quick-design first") | earlier | Yes: required before a rule change | S |
| `design/gdd/forge-reroll.md` inside EC-01 | GDD_REVIEW deferred item 1 | earlier | Yes, requested by the Director | M |

None adds a player-facing feature outside the GDDs. No mockup or asset story may show a feature without a GDD and a story.

### Scope removals (in the baseline but not planned)

| Removed item | Reason | Impact |
| --- | --- | --- |
| Async defence doctrine picker (ai-doctrines, optional "Alpha") | Optional in the GDD; touches a D1 migration and DuelScene for little battle depth | Defence presets keep `steady` |
| Text-scale setting (A11Y-11) | Open in the requirements; no GDD | Recorded as an accepted deviation for the Director to log |
| Keyboard and gamepad access (A11Y-22) | Accepted deviation already | None new |
| Weather, utility AI, town contracts, campaign consumables, melee hit chance by skill | Deferred by VISION | None new |

### Bloat score

- Original items: 25
- Current items: 25
- Items added: 0 at epic level (+0%); 3 story-level additions, all justified enablers or required design steps
- Items removed: 1 optional GDD feature (async defence doctrine)
- Net scope change: 0 (0%)

### Risk assessment

- **Schedule risk: High.** 175 expected agent-days, a 62.5-day wave critical path, and no velocity data. The plan is complete, but an overnight run will not finish it all.
- **Quality risk: Medium.** Every story carries gates, screenshots and balance runs; balance targets are still unmeasured.
- **Integration risk: High.** `BattleScene.ts` and the sim chain are serial; online rules change on both sides.

### Recommendations

1. **Cut** (only if time runs short, in this order; see the cut list).
2. **Defer**: the async defence doctrine; A11Y-11 text scale to after v5.
3. **Keep**: ST-03 (it shortens the sim chain), the practice-fight GDD (a live farm), every Must-have story.
4. **Flag** for the Director: the hub direction pick after AS-01; A11Y-11 as an accepted deviation; the R6 re-estimate after W3.

**Scope Verdict: PASS**
Net change: +0% — On Track (scope). Schedule is the risk, not creep: re-estimate after W3.

### Total estimate

| | Optimistic | **Expected** | Pessimistic |
| --- | --- | --- | --- |
| Work, all 86 stories (agent-days) | 122.5 | **175** | 279 |
| Critical path by waves (agent-days) | — | **62.5** | — |
| With the 20% buffer | — | **210** work / **75** critical path | — |

Confidence: **Low–Medium.** The stories are well specified by the GDDs and UX specs, but there is no velocity history, the art depends on Gemini, and the battle and sim lanes are serial.

### Cut list: what to cut first if time runs short

Cut from the top. Each line says what it saves and what it costs. Never cut the foundation, the live fixes, sim train 2 plumbing, doctrines, formations and orders, abilities, controls, readability, any screen rebuild (the brief requires all of them), or final QA.

| Order | Cut | Saves (E days) | Consequence |
| --- | --- | --- | --- |
| 1 | **EC-01** forge reroll | 3 | The endgame gold sink stays a known gap (it was already accepted as one in GDD_REVIEW). |
| 2 | **EC-03** retrain cost revisit | 0.5 | Retrain stays 40 × tier. |
| 3 | **FL-02** transitions and button responses | 2 | Hard cuts remain (minor, F3); the kit's pressed states from F-02 still give button feedback. |
| 4 | **Field works**: FW-01, FW-02, FW-03, AS-06 | 8.5 | Rank-6 expansion dropped. AR-02 assaults use a ridge + ford profile without palisade and stakes; re-run the assault balance row; CMP-01 drops the supplies UI; ST-04 and BTL-01 no longer wait on FW-02 and FW-03. |
| 5 | **AI-03** ladder and war doctrines | 1.5 | Ladder floors and war neutrals stay `steady`; campaign bands still get doctrines. |
| 6 | **Event deck**: EV-01, EV-02, EV-03 | 6 | Rank-5 expansion dropped; WLD-02 drops the Journal tab; the arc's `host_musters` flag is set directly by the 6th lair. |
| 7 | **FL-03** audio additions | 2.5 | The existing procedural soundscape stays (the playtest praised it); new hooks stay silent. |
| 8 | **AR-04** the host (keep AR-01..AR-03) | 2.5 | Lairs are the end; no final battle. Only after a producer review: this is the arc's end state (MECH C2). |

Cutting 1–5 saves 15.5 expected agent-days (about 9% of the work) without touching any Must-have story. Cutting through 7 saves 24. Beyond that, stop and re-plan with `/sprint-plan update` and the producer.

> Run `/scope-check v5-plan` again after any cut to confirm the verdict.
