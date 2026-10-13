# v6 adoption and stage report (S0-ADOPT)

> **Generated**: 2026-10-13, by `/adopt full` and `/project-stage-detect` (no role filter), run by the `producer` agent.
> **Settings**: rigor `standard` (so workflow `standard`, review mode `lean`), automation `autonomous`. These come from the v6 brief. There is no `project.yaml` anywhere in the repo or `.claude/` (the v5 one is gone), so the helper would fall back to `minimal`/`collaborative`. This run did not write any config (see Q4).
> **Location**: the skills' default outputs are `docs/adoption-plan-[date].md` and `production/project-stage-report.md`. Both are merged here because this story owns `docs/v6/ADOPT.md` only. The v5 equivalents are in `docs/v5/setup/`.

## 1. Stage

- **Stage: Production** (observed). The game is a released v5: 407 files in `src/`, 105 Worker `.ts` files, 130 client tests and 43 server tests, Phaser 3.90 (`package.json`).
- **Configured stage**: none (no `project.stage`, no `production/stage.txt`), so the observed and configured stages can't disagree.
- **Stage Confidence: PASS.** The stage table is checked from the most advanced row back, and the Production row (10+ source files, active development) matches. v5 has the concept, the systems index, GDDs and ADRs that it lacked at the v5 setup run (CONCERNS then).
- **v6 itself is at Concept/Technical Setup.** The brief and ROADMAP define it, but none of its design or architecture artifacts exist yet. This is expected at Phase 0.

## 2. Answers recorded (autonomous mode)

| # | Question the skills ask | Answer | Source |
| --- | --- | --- | --- |
| Q1 | Write the plan? (adopt Phase 5) | Yes, to `docs/v6/ADOPT.md`. | Brief, story prompt |
| Q2 | Run the v1.0 config converter? (2g) | Not needed. There's no `project.yaml`, and no legacy file has real values (`technical-preferences.md` is all `[TO BE CONFIGURED]` apart from the prose "Required Tests" line). | Phase 2g rule |
| Q3 | ADRs are in `design/adr/`, not `docs/architecture/`. Move them? | No. Keep `design/adr/` (v5 precedent), number the v6 ADRs from ADR-0006, and pass paths explicitly to the ADR skills. This is easier to undo than a move. | Proposed V6 decision |
| Q4 | Engine not configured: run `/setup-engine`? | Not in this story. `/setup-engine` writes config (`project.yaml`, `technical-preferences.md`), and the owner keeps `.claude/` untracked. The ADRs record the engine as Phaser 3.90 + TypeScript + Vite instead. | Brief hard constraints |
| Q5 | Combat or economy code changed without GDDs? | No. v6 is not a mechanics release. Gameplay changes only for hotkeys and landscape battle framing, and those go design-first. | Brief Goal |
| Q6 | Sprints tracked elsewhere? | Yes. v5 used `docs/v5/plan/{EPICS,STORIES,SPRINTS}.md`, so v6 uses `docs/v6/plan/`. | v5 precedent |
| Q7 | ROADMAP says one domain for game and web. The brief says pixelarrow.app = landing, play.pixelarrow.app = game. Which? | The brief (owner, 2026-10-13) supersedes ROADMAP (2026-10-12). The hosting ADR must follow it, and ROADMAP gets updated with the hosting story. | Proposed V6 decision |
| Q8 | Brief skills missing from `{F}/skills`? | `tdd`, `improve-codebase-architecture`, `design-ship` and `design-principles` are in `~/.claude/skills/`. `frontend-design` is a plugin. `searchfit-seo:seo-check` doesn't exist, so use `seo-audit` + `on-page-seo` (`schema-markup` and `technical-seo` exist). `simplify` was not found as a skill file; use the built-in `/simplify` command if present, otherwise `/code-review`. | File check |

## 3. Process artifacts for v6

| Artifact | Exists | v6 status |
| --- | --- | --- |
| Game concept | `design/gdd/game-concept.md` | OK. No change: v6 doesn't change the concept. |
| Systems index | `design/gdd/systems-index.md`, 39 systems | **Stale.** All 39 rows are `Not Started` although v5 shipped them. v6 systems are missing: email accounts, account linking, web hosting and the landing site, the public stats API, the payments interface, privacy and deletion, keyboard and mouse with rebinding, and responsive landscape layout. System #12 "Platform layer" exists but has no design doc. |
| GDDs | 9 template GDDs + 2 quick-design deltas | The 9 have every `standard` section. Their `Status` is `Draft (S2-VISION, ...)`: the value is parenthetical and stale, because they are implemented. `controls.md` has no keyboard, hotkey or landscape rules. **Missing for v6:** the input scheme and default hotkeys, plus the account and linking flows. |
| UX specs | `design/ux/` (hud, ia, interaction-patterns, screen-flow, screens-campaign, screens-modes) | All portrait only. **Missing:** landscape and tablet layout rules per screen family, focus-navigation patterns, account screens, Settings rebinding. |
| Art bible | `design/art/art-bible.md` | Exists. **Missing:** the landing addendum (key art, parallax layers, cinematic tolerance). It's required at `standard` because v6 has visual-asset stories. |
| ADRs | `design/adr/ADR-0001..0005` | All have Status, Dependencies, Engine Compatibility and GDD Requirements. 0001, 0002 and 0004 lack Performance Implications (LOW). ADR-0004 (input) is touch-first and needs a v6 successor or amendment. **Missing (all Foundation-critical):** platform layer, hosting (two hosts), auth and sessions, account linking, public stats API, landing stack and performance budget. |
| Architecture doc | none (`docs/architecture/` absent) | **Missing.** `standard` expects one. |
| Control manifest | none | **Missing (HIGH).** It's needed so stories inherit the platform rule ("no `if (telegram)` in game code") as a checkable layer rule. |
| TR registry / traceability | none | Missing. v5 treated it as informational at `standard`, and so does v6. |
| Epics | `production/epics/` has 22 v5 EPIC.md files + `index.md` | v5 only. **No v6 epics.** |
| Stories / sprints | v5 stories in `docs/v5/plan/STORIES.md` | **No v6 stories or sprints.** `docs/v6/plan/` is empty. |
| Engine config / reference | none | **Not configured (HIGH)**, as in v5. Phaser 3.90 is pinned (ADR-0003 rejected Phaser 4). |
| Milestone | none in `production/milestones/` | Missing, so `/scope-check v6` has no baseline (see §6). |

**Gap counts:** BLOCKING 0 · HIGH 5 (engine config, engine reference, control manifest, the 6 Foundation ADRs as one item, the ADR path that skills don't find) · MEDIUM 6 (stale systems-index statuses, stale GDD statuses, no v6 systems in the index, no architecture doc, no v6 UX specs, no sprint-status) · LOW 2 (Performance Implications on 3 ADRs, the systems-index `Layer` column).

## 4. Migration and setup plan for the v6 run

Order: blocking (none), then high, infrastructure before content, then medium. Times are rough.

1. - [ ] **Log the proposed decisions** (§7) in `docs/v6/DECISIONS.md`. Director, 5 min.
2. - [ ] **Combine the audits into `docs/v6/AUDIT.md`** (UI, platform, server and hosting audits already running). The ADRs depend on it. 30 min.
3. - [ ] **Update the systems index** with `/map-systems` (update mode): add the 8 v6 systems and set the v5 rows to their real status (`Approved` or `Designed`; the vocabulary has no `Implemented`). Fix GDD `Status` lines to `Implemented` with no parenthetical. 1 session.
4. - [ ] **Write the Foundation ADRs** with `/architecture-decision`, one per ADR in `design/adr/`: ADR-0006 platform layer, ADR-0007 hosting (pixelarrow.app + play.pixelarrow.app, API location, cookies, CORS), ADR-0008 auth and sessions (hash, cookies, Turnstile, rate limits, email), ADR-0009 account linking, ADR-0010 public stats API (cache, rate limit, no personal data), ADR-0011 landing stack and performance budget. Then an ADR-0004 amendment for keyboard and mouse. Each records Engine Compatibility as Phaser 3.90. 1 session each, and they can run in parallel after 0006 and 0007.
5. - [ ] **Run `/architecture-review`** over ADR-0001..0011 (explicit paths). 1 session.
6. - [ ] **Write `docs/v6/ARCHITECTURE.md`** with `/create-architecture` (platform core and adapters, the two hosts, the Worker API). 1 session.
7. - [ ] **Run `/create-control-manifest`**, written to `docs/v6/CONTROL_MANIFEST.md` with a `Manifest Version:` stamp. Its layer rules must include "no platform checks in game code", "every in-game string in EN and RU" and "no secrets in the repo". 30 min.
8. - [ ] **Design docs:** a `/ux-design` landscape and tablet layout rules spec per screen family; a `/quick-design` amendment to `controls.md` for the input scheme, default hotkeys and rebinding; a UX spec for the account, linking, reset and deletion flows; and a `/art-bible` landing addendum. 1 session each, in parallel.
9. - [ ] **Plan:** run `/create-epics` and `/create-stories` into `docs/v6/plan/` (v6 epics under `production/epics/v6-*`), then `/sprint-plan`. Foundation sprint first: platform layer, layout primitives, input layer, the layout-check matrix, the hosting split. Run `/estimate` per epic and `/scope-check` against a `production/milestones/v6.md` baseline written from the brief. 1 to 2 sessions.
10. - [ ] **Engine config (owner, optional):** run `/setup-engine` to record Phaser 3.90 / TypeScript / Vite and set `modes.rigor: standard` and `automation: autonomous`. Logged as a proposal, not a blocker.
11. - [ ] **LOW:** add Performance Implications to ADR-0001, 0002 and 0004 when they are next amended.

Existing v5 epics and stories keep working with the template skills, because the new format checks auto-pass when fields are absent. Don't regenerate them.

## 5. Skills per v6 goal area (router)

Router step 1: engine **Phaser** (`package.json` `phaser ^3.90.0`), so the engine skill for all game-side work is `phaser-core`. Genre: none. The router has no discipline for web hosting, auth, or marketing sites (a stated gap, §6 of the router), so the brief's process skills fill it.

| Goal area | Router skills (engine → discipline) | Process and plugin skills from the brief |
| --- | --- | --- |
| 1. Two sites, hosting | none (router gap) | `/architecture-decision`, `/create-architecture`, `/architecture-review`, `/security-audit` (cookies, CORS) |
| 2. Landing page | `game-feel` (motion, parallax), `performance-optimization`, `create-game-assets` (key art) | `frontend-design`, `design-ship`, `design-principles`, `/ux-review`, `searchfit-seo` `seo-audit`/`on-page-seo`/`schema-markup`/`technical-seo` |
| 2a. Art and video | `create-game-assets` | `/art-bible`, `/asset-spec`, `/asset-audit` |
| 3a. Landscape and tablet | `phaser-core` → `game-ui-ux`, `camera-systems` (battle framing) | `/ux-design`, `/ux-review`, `/team-ui`, `/design-system` |
| 3b. Mouse, keyboard, rebinding | `phaser-core` → `input-systems`, `game-ui-ux` (focus nav), `camera-systems` (wheel zoom), `save-systems` (per-device bindings) | `/quick-design` (amend controls.md), `tdd` |
| 4. Platform layer | `phaser-core` (router gap for platform abstraction) | `improve-codebase-architecture`, `/architecture-decision`, `/create-control-manifest`, `tdd` |
| 5–6. Accounts, linking | `save-systems` (identity, cloud save merge) | `/architecture-decision`, `/security-audit`, `tdd` |
| 7. Payments | none | `/architecture-decision`, `tdd`, `/security-audit` |
| 8. Bot protection | none | `/security-audit`, `tdd` |
| 9. Privacy, deletion | `save-systems` (data deletion) | `/security-audit`, `tdd` |
| Public stats API | `performance-optimization` (caching) | `/architecture-decision`, `/security-audit`, `tdd` |
| Feel and polish | `game-feel`, `audio-design` | `/team-polish` |
| Build, QA, release | `phaser-core` | `/dev-story`, `/story-readiness`, `/story-done`, `/qa-plan`, `/team-qa`, `/regression-suite`, `/perf-profile`, `/code-review`, `/release-checklist`, `/gate-check`, `/milestone-review` |

## 6. Scope and estimate notes

- **`/scope-check v6`: NOT ASSESSED.** There is no `production/milestones/v6.md` baseline. To make it assessable, write that file from the brief in plan step 9. For reference, the brief keeps all 9 ROADMAP v6 items (it changes hosting) and adds two major ones, the landing site (with video, art and SEO) and the public stats API. That is +2 on 9, about +22%. The owner approved it ("no cuts"), so these are acknowledged additions, not creep.
- **`/estimate`:** there is no sprint history in `production/sprints/`, so estimates aren't calibrated (v5's `docs/v5/plan/SPRINTS.md` is the nearest reference). The setup steps above total about 12 to 16 agent sessions before the Foundation sprint. Confidence is Medium. The biggest risk is the auth and linking ADRs, which need security review and owner-side Cloudflare services (email, Turnstile) that can only be stubbed locally.

## 7. Proposed decisions (for the Director to log)

- Keep ADRs in `design/adr/`, numbered from ADR-0006 for v6.
- The brief's two-host layout supersedes ROADMAP's "same domain" bullet, and ROADMAP is updated with the hosting story.
- Process files for v6 go in `docs/v6/` (ARCHITECTURE.md, CONTROL_MANIFEST.md, plan/), and v6 epics go in `production/epics/v6-*`.
- Don't write `project.yaml` during the run. Record the engine in the ADRs, and log `/setup-engine` as an owner proposal.
- Brief skills that don't exist get substitutes: `seo-check` → `seo-audit` + `on-page-seo`; `/simplify` → `/code-review` if it's unavailable.
