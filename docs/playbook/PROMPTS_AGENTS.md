# Agent prompt templates

The prompts the v5 Director used, cleaned into fill-in form. `{BRACES}` are blanks. The Director's own brief
is in [director-brief-v5.md](director-brief-v5.md); the general method is the `orchestrate` skill
(`~/.claude/skills/orchestrate/SKILL.md`).

How agents were launched: the Agent tool with `isolation: "worktree"`, a short `name` (`ev-02`, `integrator-batch37`,
`fixer-7`), `run_in_background: true`, all siblings in one message. At most 3–4 code agents at once, plus one
integrator; fewer when the load average is high (it was 27–50 for much of v5).

Common blanks:

| Blank | v5 value |
| --- | --- |
| `{MAIN}` | the main line branch (`v5`) |
| `{MAIN_WT}` | the worktree that has `{MAIN}` checked out: `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c` |
| `{F}` | where `.claude/` lives: same as `{MAIN_WT}` |
| `{ROOT}` | the repo root: `/Users/v.gladis/Workspace/Personal/pixelarrow` |
| `{DOCS}` | the run's state folder: `docs/v5` |

---

## 1. Implementation agent

```
You are implementing {STORY_ID}: {ONE_LINE_GOAL}, in pixelarrow, working in your own git worktree.

pixelarrow is a Phaser 3.90 + TypeScript + Vite game ({PLATFORMS: a Telegram Mini App, portrait, mobile first}).
Design at 390x844; every screen must also pass at 360x780 and 320 wide ({V6: plus the landscape sizes}).
The app has no live users: no backward compatibility for saves, clients or server state.

DISK AND LOAD RULES (the machine is short of disk and heavily loaded):
- Do NOT run npm ci or npm install. Symlink node_modules instead:
    ln -s {ROOT}/node_modules node_modules
    ln -s {MAIN_WT}/server/node_modules server/node_modules
- Serve the game with `npx vite build && npx vite preview --port {FREE_PORT}`, not the dev server
  (the dev server returns 403 for fonts when node_modules is a symlink). Use your own port; 5173 is taken.
- Run the layout check with --no-shots unless you need the screenshots.
- Stop every server you start before you finish. Then `rm -rf dist shots`.

SETUP: run `git merge-base --is-ancestor {MAIN} HEAD`; if it fails, `git reset --hard {MAIN}`.

READ YOUR STORY:
- The {STORY_ID} row in {DOCS}/plan/STORIES.md and its dispatch card in {DOCS}/plan/SPRINTS.md.
- The GDD and rules it names: {GDD_PATHS_AND_RULE_IDS}.
- Every SKILL and agent file below. Read them first and follow them:
  Skills: {F}/.claude/skills/{skill}/SKILL.md, ... (tdd: ~/.claude/skills/tdd/SKILL.md)
  Agents: {F}/.claude/agents/{agent}.md, ...
- Start with /story-readiness against the row; end with /story-done.

DIRECTOR REQUIREMENTS:
- {SPECIFIC_REQUIREMENT_1, e.g. "ship the deck behind EVENT_DECK_ENABLED = false"}
- {SPECIFIC_REQUIREMENT_2, e.g. "no text in code; strings in your own src/i18n/<ns>.en.ts / .ru.ts pair"}
- {HANDOFFS from earlier stories, with file:line}

Decide yourself. When a choice comes up, pick the simplest option that is easy to undo and note it, with the
alternative and why, in {DOCS}/stories/{STORY_ID}/NOTES.md. Do not ask.

RULES:
- Edit only the files your story owns: {FILES_OWNED}. Shared append-only files: src/i18n/index.ts (one line),
  your own fixture entries in scripts/layout-check.mjs, your own section of the docs named in the card.
- Running in parallel with you: {OTHER_AGENTS_AND_THEIR_FILES}. Do not touch their files.
- No new npm dependencies, no package.json scripts, no .github/workflows changes.
- Never push, never deploy, never touch main. Never disable git hooks (no core.hooksPath, no --no-verify).

VERIFY before you report (all must pass):
- npx tsc --noEmit
- npx vitest run      (and `cd server && npx vitest run` if you touched server/ or shared rules)
- npx vite build
- node scripts/layout-check.mjs http://localhost:{PORT}/ --no-shots   → 0 new violations
- the smokes: node scripts/{smoke,tutorial-smoke,duel-smoke,fullscreen-smoke,audio-smoke,online-smoke}.mjs http://localhost:{PORT}/
- npm run regression -- --port {OTHER_PORT}
- node scripts/replay-hash.mjs chromium   (sim changes: fixtures must match, or re-record on purpose and say so)
- mechanic changes: npm run balance -- 400 before and after → {DOCS}/balance/{STORY_ID}.md
- screenshots at 390x844 and 320 wide (and 360x780), in en and ru, of every screen and state you touched,
  saved to {DOCS}/shots/{STORY_ID}/ as JPEG ≤ 150 KB. OPEN AND LOOK at them; fix what you see.
- play the feature in the browser with real taps.

Commits: semantic (`feat(scope): …`, `fix(scope): …`, `test(...)`, `docs(...)`), small and staged. No AI
co-author trailer and no "Generated with" footer.

FINAL REPORT (under 250 words): what changed; test and gate numbers; balance before/after if any; screenshot
paths; decisions you made (from NOTES.md); open issues and handoffs; your branch name. End with a section
"Skills applied": each skill and the concrete guidance from it that shaped the work.
```

## 2. Integrator

```
You are integrator-{BATCH}. Merge these finished branches into {MAIN} in {MAIN_WT} and run the full gates.
Do the merge in {MAIN_WT} itself (the {MAIN} branch is checked out there).

Merge in this order, each with `git merge --no-ff <branch> -m "merge: {STORY_ID} — {one-line summary}"`:
1. {BRANCH_1} ({STORY_1})
2. {BRANCH_2} ({STORY_2})
...

CONFLICT RULES:
- Docs and state files ({DOCS}/*.md, story NOTES): keep both sides' content.
- i18n: en.ts / ru.ts spreads and src/i18n/index.ts imports are append-only: keep every line from both sides.
- scripts/layout-allowlist.json: take the union, then drop entries the merged code no longer produces.
- Anything else that is not trivial: stop, report the conflict, do not guess.

GATES, in this order, after all merges (never run layout-check, regression and online-e2e at the same time):
1. npx tsc --noEmit
2. npx vitest run ; (cd server && npx vitest run)
3. npx vite build ; npx vite preview --port {PORT}
4. node scripts/layout-check.mjs http://localhost:{PORT}/ --no-shots   → 0 new
5. the six smokes against http://localhost:{PORT}/
6. npm run regression -- --port {OTHER_PORT}
7. online-e2e if online code changed (wrangler dev with DEV_AUTH=1, VITE_DEV_AUTH=1 on vite, API_PROXY as a full URL;
   delete server/.dev.vars afterwards)
8. node scripts/replay-hash.mjs chromium (and webkit with PW_WEBKIT_PATH if installed)
9. npm run balance -- 400 if any merged story changed rules or data

A failure that passes when re-run alone is a flake: re-run it alone once, report BOTH results, and name it for
a fixer. Never raise a timeout or add a retry to make it pass.
A real failure: if the fix is trivial and obviously right, fix it in a separate commit and say so. Otherwise
`git reset --hard` to the commit before the culprit merge, keep the other merges, and report.

CLEANUP: stop every server you started; rm -rf dist shots; `git worktree remove` each merged worktree and
`git branch -d` its branch; `git worktree list` must show no stray entries. Never push, never touch main, never
disable hooks.

REPORT in 10 lines or fewer: merge commits; per gate the result and numbers (vitest count, layout known/new,
smokes, regression time, replay n/n, balance headline); flakes with both runs; anything reset; cleanup done.
```

## 3. Flake fixer

```
You are fixer-{N}. These checks failed under load and passed alone:
- {SCRIPT}: "{CHECK NAME}" — {how often, under which load, the integrator's two runs}
...

Find the ROOT CAUSE of each. Do not raise timeouts, do not add blind retries, do not add fixed sleeps.
- Reproduce under load (run it alongside a layout check or a balance run) before you change anything.
- Wait on real conditions: a scene that has settled (`settled()`), a control that stands still (`steadyBtn`:
  two equal reads two frames apart, inside its list's window), a state the game itself reports. Read the
  helpers in scripts/regression/lib.mjs and scripts/lib/.
- Tap where the game resolves taps (use the scene's own hit state), and tap in the page, not through a raw CDP
  touch (it read as a long press).
- If a player could hit the same race (a lost tap, a freeze, a wrong state), fix the GAME, with a test, not just
  the script.
- Prove each fix: N runs in a row under load ({N = 3 to 5}), and report the before and after failure rates.

Same SETUP, DISK rules, ownership and commit rules as an implementation agent. Report: per flake, the root cause
in one line, the fix (game or test), the proof runs, and "Skills applied".
```

## 4. QA playthrough

```
You are qa-{N}. Play the real game as a player would, from a fresh save, and write {DOCS}/qa/PLAYTHROUGH.md.
Do NOT fix anything.

Build: {MAIN} @ {COMMIT}. vite preview (offline) and vite dev + wrangler dev with DEV_AUTH (online).
Sizes: 390x844, 360x780, 320x640, touch, DPR 2, in en and ru.
Skills: playtest-report, team-qa, smoke-check ({F}/.claude/skills/...); agents qa-tester, qa-lead.

1. Precondition: run the smoke check; record the result.
2. Play: the tutorial, at least {N} campaign battles, a practice fight, a ladder floor, a raid, a war attack,
   the event cards, the hubs. Use real taps for every sheet, button and order. Name any staging you had to do
   (a forced save, a dev user, stepping the sim) so no reader takes it for natural play.
3. Score every experiential AC in the QA plan and every story AC you can check in play:
   PASS / PARTIAL / FAIL / NOT ASSESSED, each with evidence (what happened, a shot number). "Needs humans" is
   NOT ASSESSED, never a guess.
4. Findings, ranked:
   S1 blocker (a dead end, data loss, a crash) · S2 major (a core loop broken or misleading) ·
   S3 minor (fix before release) · S4 polish.
   Each: screen and size; numbered repro steps; actual; expected; screenshot path; suspected file(s).
5. Also: decisions per first battle (the VISION target), what feels great, input for open design questions.
6. Verdict: NOT APPROVED if any S1 or S2 is open.

Screenshots: {DOCS}/qa/shots/NN-<step>-<size>-<lang>.jpg, JPEG ≤ 150 KB. Report in 250 words: the verdict,
the S1/S2 list, the scorecard counts, and "Skills applied".
```

The findings then go to fixer agents grouped by area (v5: QAFIX-WORLD, QAFIX-BATTLE, QAFIX-UI), each with
before and after shots in `{DOCS}/qa/fixes/<area>/`.

## 5. The Director's review loop

Not a prompt to an agent; the Director's own routine for every finished agent, written down so it can be
repeated.

1. Read the report and the agent's NOTES.md. Check "Skills applied" against the skills on its card; send back
   work that skipped them.
2. Open 2–3 screenshots yourself: the narrowest size, Russian, and the state the riskiest AC names. Never more;
   the main context stays small.
3. Spot-check one or two claims: a balance number, a test that should exist, a decision.
4. Good: dispatch an integrator with the branch in the merge order. Weak: SendMessage to the same agent with
   specific changes (it keeps its context). A fix in an area already merged goes to a fresh, small agent.
5. Never merge without looking.
6. Update the state files: PROGRESS.md (running agents, merged, queue, next), SKILLS_LOG.md (a row per story),
   DECISIONS.md (anything decided). A fresh session must be able to resume from PROGRESS.md and `git log`.

The Director never edits source, never greps the codebase, never reads raw diffs or logs. It reads only the
brief, PROGRESS.md, DECISIONS.md, agent reports and 2–3 screenshots per merge.

---

## Skills and agents used

Skills live in `{F}/.claude/skills/<name>/SKILL.md` (untracked, V5-002); `tdd`, `design-ship` and `orchestrate`
are in `~/.claude/skills/`, `frontend-design` in the anthropic-agent-skills plugin. Which story used which:
[docs/v5/SKILLS_LOG.md](../v5/SKILLS_LOG.md).

### Skills by work type (from the brief)

| Work | Skills | Agents |
| --- | --- | --- |
| Setup and planning | start, adopt, project-stage-detect, map-systems, create-epics, create-stories, sprint-plan, scope-check, estimate | producer, creative-director, technical-director |
| Art direction and assets | art-bible, create-game-assets, asset-spec, asset-audit | art-director, technical-artist |
| UI and UX | game-ui-ux, ux-design, ux-review, team-ui, design-system, design-ship, frontend-design | ux-designer, ui-programmer, accessibility-specialist |
| Mechanics and design | brainstorm, quick-design, design-review, review-all-gdds, consistency-check, propagate-design-change, team-combat, team-level, level-design, rpg, game-ai, ai-behavior-trees-utility-ai, procedural-gen | game-designer, systems-designer, economy-designer, level-designer, ai-programmer |
| Balance | balance-check, `npm run balance` | economy-designer, systems-designer |
| Controls | input-systems, camera-systems, game-ui-ux | gameplay-programmer, ux-designer |
| Implementation | dev-story, story-readiness, story-done, phaser-core, tdd, architecture-decision | gameplay-programmer, ui-programmer, lead-programmer |
| Feel, audio, narrative | game-feel, team-polish, audio-design, team-audio, team-narrative, dialogue-systems | technical-artist, sound-designer, writer, narrative-director |
| Saves and online | save-systems, security-audit | network-programmer, security-engineer |
| Performance | performance-optimization, perf-profile | performance-analyst |
| QA and review | qa-plan, team-qa, smoke-check, regression-suite, playtest-report, code-review, simplify, tech-debt, gate-check, milestone-review, retrospective | qa-lead, qa-tester |
| Localization | localize | localization-lead, writer |

### All project skills (one line each)

| Skill | What it is for |
| --- | --- |
| adopt | Brownfield audit: do existing artifacts work; numbered migration plan |
| ai-behavior-trees-utility-ai | A behavior-tree runtime and utility AI |
| architecture-decision | Write an ADR: context, alternatives, consequences |
| architecture-review | Traceability from GDD requirements to ADRs; gaps and conflicts |
| art-bible | Author the art bible that gates asset production |
| asset-audit | Audit assets against naming, size budgets, formats; orphans |
| asset-spec | Per-asset visual specs plus AI generation prompts |
| audio-design | Bus/mixer, ducking, adaptive music, SFX variation |
| balance-check | Find balance outliers, broken progressions, degenerate strategies |
| brainstorm | Guided concept ideation |
| bug-report | Structured bug report with repro and severity |
| bug-triage | Re-prioritise open bugs, spot trends |
| camera-systems | Follow, deadzone, look-ahead, bounds, shake |
| card-game | Card data, zones, turns |
| changelog | Changelog from git and sprint data |
| code-review | Architectural code review |
| consistency-check | GDDs against the entity registry for conflicts |
| content-audit | GDD content counts versus what is built |
| create-architecture | Architecture blueprint before code |
| create-control-manifest | Must-do / never-do rules per system from ADRs |
| create-epics | Epics from GDDs and architecture |
| create-game-assets | Plan, generate, normalise and validate visual assets |
| create-stories | Stories with ACs and ADR guidance from an epic |
| day-one-patch | A focused launch patch with QA gate and rollback |
| design-review | Review one design doc for completeness and consistency |
| design-system | Section-by-section GDD authoring for one system |
| dev-story | Implement a story with the right programmer agent, code plus tests |
| dialogue-systems | Branching dialogue: node/choice graph, conditions, localisation hooks |
| estimate | Effort estimate with confidence |
| fps-shooter | FPS genre kit |
| game-ai | FSMs, behavior trees, steering, A* |
| game-feel | Juice: shake, hit-stop, easing, squash, feedback |
| game-jam | Scope and schedule under a jam deadline |
| game-ui-ux | HUDs, menus, overlays across screens; anchors, safe areas, focus, screen stack |
| gate-check | Ready to move between phases? PASS / CONCERNS / FAIL |
| help | What to do next |
| hotfix | Emergency fix with audit trail |
| input-systems | Action mapping, rebinding, multi-device, buffering, accessibility |
| itch-publish | Publish on itch.io |
| launch-checklist | Launch readiness across departments |
| level-design | Blockout to playable, pacing, encounters |
| localize | Find hardcoded strings, string tables, cultural review, string freeze |
| map-systems | Decompose a concept into systems and dependencies |
| milestone-review | Milestone completeness, risk, go/no-go |
| onboard | Onboarding doc for a contributor or agent |
| patch-notes | Player-facing patch notes |
| perf-profile | Profiling against budgets, ranked fixes |
| performance-optimization | Measure first, then pooling, batching, allocations |
| phaser-arcade-physics | Phaser Arcade Physics |
| phaser-core | Phaser game config, scenes, loader, cameras (targets Phaser 4; apply to 3.90) |
| physics-tuning | Timestep, interpolation, CCD, jitter |
| platformer | Platformer genre kit |
| playtest-report | Playtest report template |
| procedural-gen | Seeded RNG, noise, dungeons, loot tables |
| project-stage-detect | Where the project is; gaps; next steps |
| propagate-design-change | A GDD changed: find stale ADRs |
| prototype-fast | A one-hour "is it fun" prototype |
| prototype | Concept prototype before GDDs |
| puzzle | Puzzle genre kit |
| qa-plan | QA test plan for a sprint |
| quick-design | Lightweight spec for a small change |
| regression-suite | Map tests to critical paths; fixed bugs without regression tests |
| release-checklist | Pre-release checklist |
| retrospective | Sprint or milestone retrospective |
| reverse-document | Design docs from existing code |
| review-all-gdds | Cross-GDD review: contradictions, dominant strategies, overload |
| roguelike | Roguelike genre kit |
| router | Route a request to the right skills |
| rpg | Stats, inventory, quests, save/load, combat |
| save-systems | What to save, atomic writes, versioning, migration |
| scope-check | Scope creep versus the plan |
| security-audit | Save tampering, cheats, network exploits, input validation |
| settings | Project config |
| setup-engine | Pin the engine and version |
| shader-programming | Shaders from fundamentals |
| skill-improve | Improve a skill by test-fix-retest |
| skill-test | Validate skill files |
| smoke-check | Critical-path smoke gate |
| soak-test | Long-play soak protocol |
| sprint-plan | Sprint plan from milestone and capacity |
| sprint-status | Sprint snapshot |
| start | First-time onboarding |
| steam-publish | Publish on Steam with Steamworks and SteamPipe |
| story-done | End-of-story review of each AC |
| story-readiness | Is a story ready: ACs, open questions, ADR refs |
| survival-crafting | Survival-crafting genre kit |
| team-audio | Audio team orchestration |
| team-combat | Combat team orchestration, design through implementation |
| team-level | Level team orchestration |
| team-live-ops | Live-ops team orchestration |
| team-narrative | Narrative team orchestration |
| team-polish | Polish team: performance, VFX, audio, QA |
| team-qa | QA team: strategy, cases, execution, sign-off |
| team-release | Release team orchestration |
| team-ui | UI team through the UX pipeline |
| tech-debt | Track and prioritise technical debt |
| test-evidence-review | Quality of tests and evidence per story |
| test-flakiness | Find flaky tests from run logs |
| test-helpers | Engine test helper libraries |
| test-setup | Scaffold test framework and CI |
| tower-defense | Tower-defense genre kit |
| ux-design | UX spec for a screen, flow or HUD |
| ux-review | Validate a UX spec or HUD |
| vertical-slice | End-to-end pre-production validation |
| visual-novel | Visual-novel genre kit |

### Agent definitions (one line each)

| Agent | Role |
| --- | --- |
| accessibility-specialist | Accessibility standards: remapping, text scale, colourblind modes |
| ai-programmer | Game AI: behavior trees, state machines, pathfinding |
| analytics-engineer | Telemetry, events, dashboards |
| art-director | Visual identity, art bible, asset standards, palette |
| audio-director | Sonic identity, music, mix |
| community-manager | Patch notes, player comms, feedback |
| creative-director | Vision, tone, identity; breaks deadlocks |
| devops-engineer | CI/CD, branching, deployment |
| economy-designer | Economies, loot, sinks and faucets |
| engine-programmer | Rendering, loading, scene management, performance-critical code |
| game-designer | Core loops, progression, combat, economy rules |
| gameplay-programmer | Implements mechanics as code |
| lead-programmer | Code architecture, standards, review, API design |
| level-designer | Layouts, encounters, pacing |
| live-ops-designer | Post-launch content and events |
| localization-lead | i18n architecture, string pipeline, locale testing |
| narrative-director | Story architecture, world, characters |
| network-programmer | Networking, replication, protocol |
| performance-analyst | Profiling, bottlenecks, metrics |
| producer | Sprints, milestones, risk, scope, coordination |
| prototyper | Throwaway builds to test fun |
| qa-lead | Test strategy, severity, release gates |
| qa-tester | Test cases, bug reports, checklists |
| release-manager | Release pipeline, store submissions, versions |
| security-engineer | Anti-cheat, secure saves and comms, privacy |
| sound-designer | SFX specs and audio events |
| systems-designer | Formulas, curves, mechanic maths |
| technical-artist | Shaders, VFX, art pipeline tools |
| technical-director | Architecture, technology choices, technical risk |
| tools-programmer | Internal tools and pipeline automation |
| ui-programmer | Menus, HUDs, UI framework, screen flow |
| ux-designer | Flows, interaction design, information architecture |
| world-builder | Factions, cultures, lore consistency |
| writer | Player-facing text: dialogue, lore, item and ability descriptions |

---

## What to change for v6

| v5 rule | v6 |
| --- | --- |
| "Live players exist; old saves must load" (brief) | Overruled by V5-074: no users yet. Re-check before v6 ships; once there are players, saves, the server API and in-flight battles need compatibility again (ADR-0001, ADR-0002, OPS.md "The next rules change"). |
| Portrait only, 390x844 / 360x780 / 320 | Add landscape (1024x768, 1280x800, 1440x900, 1920x1080) and tablet portrait to the layout-check matrix, the screenshot sizes in G-UI and every prompt's "screen sizes" line. |
| Touch first, mouse and keyboard second | Keyboard focus navigation, hotkeys, rebinding with conflict detection, hover and wheel; touch devices keep the touch UI. Add the `input-systems` skill to every UI story. |
| Telegram only | The platform rule (V5-076): `src/platform/core/` interfaces and per-platform adapters; no platform checks in game code. Add "no `if (telegram)` in game code" to the implementation prompt's RULES and to review. |
| Online rules client + server in one story | Same, plus auth (email, verification, reset), linked accounts, Turnstile, rate limits, privacy notice and account deletion: give each a GDD or ADR and the `security-audit` skill. |
| `.claude/` at an absolute path in one worktree | Copy it somewhere stable and update `{F}`; a removed worktree breaks every prompt. |
| State in `docs/v5/` | New `docs/v6/` (PROGRESS, DECISIONS, SKILLS_LOG, ASSET_LOG, plan/, balance/, qa/). |
| Machine-specific rules (symlinked node_modules, ports, load) | Keep them only while the same machine runs the agents; drop or rewrite them on another machine. |
| Gemini via Chrome, one assets agent | Same; keep the v5 seeds attached so new art matches. |
