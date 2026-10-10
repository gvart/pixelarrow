# S0-SETUP: skill questions and the Director's answers

Automation is `autonomous`, so no `AskUserQuestion` was called. Every point where a skill would have asked, or offered a choice, is listed here with the answer chosen and a one-line reason.

`automation-modes.md` sends `log_decision` entries to `production/session-logs/decision-log.md`. This story does not own `production/`, so this file is the decision log for S0-SETUP. None of the answers falls in an `automation_always_ask` category (scope_changes, file_deletions, schema_changes): nothing was deleted, and no schema or scope changed.

## Config (`/start`-style modes write)

| ID | Question | Answer | Reason |
| --- | --- | --- | --- |
| Q-CFG-1 | How much process (`modes.rigor`)? | `standard` | Fixed by the brief. It fits a live multi-system game that several agents implement. |
| Q-CFG-2 | How much autonomy (`modes.automation`)? | `autonomous` | Fixed by the brief: the user is asleep and the Director decides. |
| Q-CFG-3 | Pin any of the six knobs rigor fronts (review_mode, workflow, density, qa.level, story_granularity, team.size)? | No | The `project.yaml` header forbids pinning them, because it shadows the rigor expansion. Resolved values: review `lean`, workflow `standard`, density `balanced`. |

## `/adopt`

| ID | Question | Answer | Reason |
| --- | --- | --- | --- |
| Q-ADOPT-1 | Audit mode (`full`, `gdds`, `adrs`, `stories`, `infra`)? | `full` | This is the first adoption of a brownfield project, so every artifact type needs a look. |
| Q-ADOPT-2 | The project looks fresh? (Phase 1 fresh-project branch) | Not triggered | It has 279 source files and a live game: clearly brownfield. |
| Q-ADOPT-3 | Run the v1.0 config converter? | No | `project.yaml` exists and there are no legacy config files, so 2g does not apply. |
| Q-ADOPT-4 | Ready to write the migration plan? (Phase 5: yes / preview / cancel) | Yes, written to `docs/v5/setup/adoption-plan-2026-10-10.md` | The story owns `docs/v5/setup/`, not `docs/`. The plan is written once and does not diff against earlier runs, so the path doesn't matter to it. |
| Q-ADOPT-5 | Review mode to record (Phase 6b)? | None written. It resolves to `lean` from rigor. | The skill forbids writing it, because a pin would freeze review depth. |
| Q-ADOPT-6 | Phase 7 first action: start on H1 (engine config) now? | Defer to the Director | This story may write only `modes`. The engine version waits on the V5-005 Phaser 4 spike. |
| Q-ADOPT-7 | The systems index lacks a `Layer` column that the adopt checklist names. Add it? | No (LOW-3) | `/map-systems` forbids widening the template table. Layers live in the Dependency Map. |

## `/project-stage-detect`

| ID | Question | Answer | Reason |
| --- | --- | --- | --- |
| Q-PSD-1 | Role filter? | None (general) | The Director needs the holistic view. |
| Q-PSD-2 | Code root? | `src/` | `engine.name` is unset, but exactly one of `src/`, `Assets/` and `Source/` exists (code-root-resolution step 3). |
| Q-PSD-3 | No sprint plans: is work tracked elsewhere? | Yes: `docs/v5/PROGRESS.md` plus the `/orchestrate` loop. ROADMAP holds the backlog. | That is how v5 is run. Moving to `production/` sprints is a Director call. |
| Q-PSD-4 | Systems in code but no GDDs: prototyped first, or reverse-document? | Reverse-document just in time, only the systems v5 changes, MVP first | 39 retrofits up front would be busywork. The legacy docs already hold the knowledge. |
| Q-PSD-5 | No ADRs: recorded elsewhere? | Yes, in ROADMAP "Agreed architecture" and "Invariants". Write ADRs only for the Foundation decisions v5 touches. | Standard tier flags only critical Foundation ADRs. |
| Q-PSD-6 | No game concept: write one now? | No. Phase 2 `/brainstorm` (VISION) writes it. | A stand-in concept would pre-empt the v5 vision. Leaving it out is easier to undo. |
| Q-PSD-7 | Stage confidence? | CONCERNS | The code says Production (live), while the template artifacts look like Concept: ambiguous signals by the skill's rule. |
| Q-PSD-8 | May I write the report to `production/project-stage-report.md`? | Written to `docs/v5/setup/STAGE.md` instead | That is the story's named destination, and `production/` is not owned. |

## `/map-systems`

| ID | Question | Answer | Reason |
| --- | --- | --- | --- |
| Q-MAP-1 | No `design/gdd/game-concept.md` (Phase 1 would fail). Proceed? | Yes, with the legacy docs plus the code as the source concept, noted in the index header | The brief asks for an index derived from the real code. The concept is pending (Q-PSD-6). |
| Q-MAP-2 | Any systems missing, combined or split? | 39 code-derived systems. Splits: Orders and abilities apart from Battle simulation core, and Battle input apart from Battle presentation. Merges: cosmetics into Premium economy, muster into Heroes. | The splits isolate the v5 expansion surfaces. The merges keep thin modules inside their owner. |
| Q-MAP-3 | Add planned v5 systems (order queue, campaign events, enemy variety) as rows? | No. They are listed as "v5 expansion hooks" on their existing systems. | Honesty rule: no rows for systems without code or a GDD. Phase 2 GDDs can add rows. |
| Q-MAP-4 | Is the dependency ordering right? | Yes, built from real imports (e.g. `duel/rules.ts` → `online/rules.ts`, `save.ts` → `tutorial.ts`). | It was checked against the import graph, not guessed. |
| Q-MAP-5 | Circular dependencies? | Three import cycles: battle ↔ ai, battle ↔ myth, battle ↔ powers. Each pair is designed as one unit through a hook contract; any code change needs an ADR and must keep `Battle.hash()` unchanged. | These cycles are real in the code. Breaking them risks determinism. |
| Q-MAP-6 | TD-SYSTEM-BOUNDARY gate? | Skipped (lean) | The skill skips non-PHASE-GATE gates in lean mode. The technical-director lens was applied by hand to the High-Risk table. |
| Q-MAP-7 | Do the priority assignments match the vision? | MVP = the v5 battle loop (19), VS = one polished single-player loop (9), Alpha = online modes and sim extensions (7), Full Vision = monetization, social and ops (4) | The brief: keep the core loop's heart and deepen it first. The online modes must follow the new core. |
| Q-MAP-8 | PR-SCOPE gate? | Skipped (lean) | Same rule. The producer lens shows in the effort column (S/M/L) and in retrofitting only what v5 touches. |
| Q-MAP-9 | Status value for built systems with no GDD? | `Not Started` (GDD status), with "implemented" stated in the Overview | `/adopt` accepts only Not Started, In Progress, In Review, Designed, Approved and Needs Revision. `Implemented` would fail that check. |
| Q-MAP-10 | May I write `design/gdd/systems-index.md`? | Yes | Autonomous writes directly, and `design/` is owned. |
| Q-MAP-11 | CD-SYSTEMS gate? | Skipped (lean) | Same rule. |
| Q-MAP-12 | Update `production/session-state/active.md` (Step 5c)? | Not written | `production/` is not owned. The Director's state lives in `docs/v5/PROGRESS.md`. |
| Q-MAP-13 | Phase 6 and 7: start designing the first system now? | Stop here | The S0-SETUP scope is the index. GDD authoring is a later story. |
