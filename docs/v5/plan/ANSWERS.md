# Phase 3 plan: skill questions and the producer's answers

The user is asleep (brief: "Autonomy: decide, don't ask"). Every question the planning skills would have put to the user was answered here by the producer, using the brief, VISION.md, the GDDs, the IA and the audits. Config used: `project.yaml` → `rigor: standard`, `automation: autonomous`, which resolves to `workflow: standard`, `review_mode: lean`, `docs.density: balanced`, `story_granularity: balanced` (V5-010).

## Inputs read

Brief (`.claude/prompts/redesign-v5-director.md`), `docs/v5/{AUDIT,VISION,DECISIONS,PROGRESS,PROPOSALS,ASSET_LOG,SKILLS_LOG}.md`, `docs/v5/vision/GDD_REVIEW.md`, the eight GDDs in `design/gdd/` (Online, Save, Balance, Acceptance Criteria and Files sections in full), `design/ux/` (screen register, IA, HUD headings), `docs/v5/ux/{ELEMENT_MAP,HUB_DIRECTIONS}.md`, `design/adr/ADR-0001` and `ADR-0003`, `design/accessibility-requirements.md` (on v5), `docs/v5/balance/BASELINE.md`, and the art bible branch `worktree-agent-a5051118a1944b5c1` (`docs/v5/art/ASSET_LIST.md`: 56 assets, chrome stays procedural). The source tree was listed to map real file ownership (`BattleScene.ts` is 3,061 lines; `DuelScene.ts` 2,988).

## /create-epics

| # | Question | Answer | Why |
| --- | --- | --- | --- |
| A-01 | Which layer or system? | `all`, processed in layer order: Foundation, Core, Feature, Presentation, Polish. | The Director asked for the whole plan in one pass. |
| A-02 | "Shall I create Epic: X?" (asked per epic) | **Yes** for all 25 (EPICS.md). | Each maps to a module and to an item in the Director's expected list. |
| A-03 | Untraced requirements: proceed or write ADRs first? | **Proceed.** There is no `docs/architecture/tr-registry.yaml`; at `standard` only Foundation ADRs are expected, so untraced rows are informational. The three missing Foundation ADRs (ADR-0002 save migration, ADR-0004 input layer, ADR-0005 UI kit) are written by the first story of their area (ST-02, IN-01, F-02), which every dependent story follows. | V5-008 planned these ADRs for Phase 3/4; writing them inside the story that builds the thing keeps them honest. |
| A-04 | PR-EPIC producer gate | **Skipped: lean mode** (not a phase gate). Noted here so the skip is visible. | create-epics §4b. |
| A-05 | An EPIC.md already exists: update or skip? | Not asked: none existed. | `production/` was absent. |
| A-06 | May I write `production/epics/<slug>/EPIC.md` and the index? | **Yes.** The Director named the destination ("in production/ or design/ as the skill directs"). | Producer agent: bounded exception for orchestrated runs. |

## /create-stories

| # | Question | Answer | Why |
| --- | --- | --- | --- |
| A-07 | Write one `story-NNN-*.md` per story under `production/epics/`? | **No.** STORIES.md is the single story list, one row per story; each EPIC.md has a Stories table pointing at it. | The Director asked for STORIES.md with one row each, and V5-009 keeps v5 tracking in `docs/v5/`. 86 near-duplicate files would drift from the table. |
| A-08 | Which epic? | All, Foundation first. | As A-01. |
| A-09 | ADR validation: a referenced ADR is missing | At `standard`, warn and continue: the story that writes the ADR is listed first and later stories depend on it. ADR-0001 (Accepted) governs every train story. ADR-0003 (Rejected) only pins Phaser 3.90. | create-stories §2 tier rule. |
| A-10 | QL-STORY-READY qa-lead gate | **Skipped: lean mode.** Stories carry acceptance criteria plus gate codes; per-story test cases come from QA-01 (`/qa-plan`). | create-stories §4b. |
| A-11 | Granularity | `balanced`: 2–4 story-specific ACs, plus the gate codes (G-ALL, G-UI, G-MECH, G-GUARD, G-ONLINE, G-TRAIN, G-SAVE, G-ASSET, G-DOCS) that carry the brief's rules. A few foundation stories have 5–6 because each AC is a separate audit finding. | Keeps each story to one focused session. |
| A-12 | "May I write these stories?" | Yes. | Named destination. |

## /sprint-plan

| # | Question | Answer | Why |
| --- | --- | --- | --- |
| A-13 | Mode | `new`. | No sprint exists. |
| A-14 | Write `production/sprints/sprint-NNN.md` and `production/sprint-status.yaml`? | **No.** SPRINTS.md holds the plan; status stays in `docs/v5/PROGRESS.md`. | V5-009 and the Director's deliverable list. |
| A-15 | Stories per sprint (6–10 at balanced) | Replaced by waves of **at most 4** (the brief's limit); about 2–3 waves make one "sprint" of 6–10 stories. | The brief's hard cap wins. |
| A-16 | Milestone, previous sprint, risk register | None exist; noted at the top of SPRINTS.md; risks assessed from the plan's contents. | sprint-plan Phase 1 rules. |
| A-17 | PR-SPRINT producer gate | **Skipped: lean mode.** | sprint-plan Phase 4. |
| A-18 | No QA plan: run `/qa-plan` now or skip? | **[A] Run it**, as QA-01 in W6 (first free slot that delays neither the foundation nor the sim chain). Until then ACs and gate codes define done. | sprint-plan Phase 5. |
| A-19 | Producer CONCERNS: proceed, cut or extend? | **Proceed with the full plan, ordered so Must-have work comes first in every lane**, plus a cut list and a re-estimate after W3. | The user asked for everything; the cut list makes running short safe. |

## /estimate

| # | Question | Answer |
| --- | --- | --- |
| A-20 | Units and ranges | Agent-days in half-day steps, optimistic / expected / pessimistic per story. Total 122.5 / **175** / 279; critical path by waves 62.5. |
| A-21 | Sprint history? | None. Stated as a risk: the estimates are **not calibrated**. Confidence Low–Medium. Re-run `/estimate` after W3. |
| A-22 | Stories over 10 days? | None (largest 3.5: DUE-01, WAR-01). |

## /scope-check

| # | Question | Answer |
| --- | --- | --- |
| A-23 | Argument | `v5-plan`. Baseline: brief Phases 4–8, VISION, the GDDs, `design/ux/`, AUDIT, GDD_REVIEW deferrals, the Director's expected epic list. |
| A-24 | Verdict | **PASS**, net change 0% at epic level. Schedule risk High. See SPRINTS.md "Scope check". |

## /router (skills per story)

| # | Question | Answer |
| --- | --- | --- |
| A-25 | Engine | Phaser (`package.json` → `phaser ^3.90.0`). `phaser-core` targets Phaser 4.2, so its concepts are applied to the 3.90 API (brief, V5-028); `phaser-arcade-physics` is not used (the sim has its own physics). |
| A-26 | Disciplines | Chosen from the brief's "Skills are mandatory" table plus the router's concept table: `game-ui-ux` (HUD, menus, safe area), `input-systems` (selection, gestures, undo), `camera-systems` (CT-05), `game-feel` (FL-01, FL-02, RD-02), `audio-design` (FL-03), `save-systems` (ST-02, AB-01, EV-01, DLG-01), `game-ai` (AI-*, AB-02, FW-02), `create-game-assets` (AS-*, F-04, FW-03), `procedural-gen` (AR-03 drops), `level-design` (AR-01, AR-02, FW-01, WLD-02), `rpg` (perks, items, sources), `dialogue-systems` (events), `performance-optimization` (QA-05). Genre: none needed beyond `rpg` for the progression stories. |
| A-27 | Skills outside `$F/.claude/skills/` | `tdd` and `design-ship` live in `~/.claude/skills/`; `frontend-design` in the plugin marketplace; `simplify` is built in. Their paths are in the dispatch cards. |

## Producer decisions made in planning (for the Director to log in DECISIONS.md)

| # | Decision | Alternatives | Why |
| --- | --- | --- | --- |
| A-28 | The `assets` agent counts toward the 4-agent cap while its queue runs (W1–W6). | Run it as a fifth agent | The brief says at most 4 subagents at a time. |
| A-29 | **One save bump, declared up front** in ST-02 (SAVE_VERSION 6 with every v5 field). Feature stories add no bump. | A bump per epic | V5-019's "one train" logic applied to saves; campaign-arc.md already defines one bump. |
| A-30 | **ST-03 train scaffold** pre-declares all train-2 types, zod entries and harness modules. | Each sim story edits types and zod itself | Lets two sim stories share a wave (AI-01 with FO-01) and keeps `server/src/battle.ts` single-owner. |
| A-31 | **One owner of `BattleScene.ts` per wave**; new behaviour goes into new modules. | Split BattleScene in a big refactor first | IN-01's extraction is the smallest change that unblocks parallel work; a full split would delay everything. |
| A-32 | **Per-story i18n namespace files**; `src/i18n/index.ts` is shared append-only. | One owner for all i18n | Every story adds strings; this avoids 80 conflicts on one file. |
| A-33 | The Results notice overlap and BTL-2 (black square on the beast field) are folded into **LF-02** with the Beast Trial fix. | Separate stories | Same files (ResultsScene, the beast field) and both small; frees a slot for the QA plan. |
| A-34 | B6 is split: LF-01 shows "Out of range" now; CT-02 builds full targeting. | All in CT-02 | B6 is a live UX defect today; the full fix needs the train-2 focus order. |
| A-35 | 320x640 joins the layout check by changing the default `SIZES` in `scripts/layout-check.mjs` (LF-03); `.github/workflows/deploy.yml` is not touched. | Edit the workflow | CI already runs the script; the deploy workflow is off limits. |
| A-36 | Results "Hero of the battle": shown only when someone has at least 1 kill; otherwise the line is omitted (RES-01). | Pick by damage taken; "Last to stand" | The simplest honest rule (PLAY B4); no new stat. |
| A-37 | The async defence doctrine picker (ai-doctrines, optional "Alpha") is **not planned**. | Build it in AI-03 | Optional in the GDD, needs a D1 migration and DuelScene work for little battle depth. |
| A-38 | A11Y-11 (no text-scale option) is proposed as an **accepted deviation for v5**, recorded by DLG-01. | Build a text-scale setting | No GDD; every screen would need re-verification at a second scale. |
| A-39 | EC-02 and EC-04 (item and class stat changes) **ride sim train 2** and finish before ST-04. | Ship them after the train | Item and class stats are replayed by the server; a change after the train would need a SIM_VERSION 3. |
| A-40 | The forge reroll (EC-01) is campaign-only and starts with a GDD (`/quick-design`, `/design-review`). | Online too | Keeps the server untouched; it's the economy item most likely to be cut. |
| A-41 | Asset wiring belongs to the consuming screen story; the assets lane only produces and processes files. | Assets agent wires too | Only one agent may hold Chrome; wiring needs scene files other stories own. |
| A-42 | The tutorial (TUT-02) teaches face, focus, undo, Then, the morale glyph and flank arcs; Feint, Orb and Works stay gated (controls R10b). | Teach everything | The attention budget (holism W4). |
| A-43 | If the art bible isn't merged when W1 opens, start ST-01 and IN-01 at once and F-01 and AS-01 when it lands. | Hold the whole wave | Keeps two lanes moving. |
