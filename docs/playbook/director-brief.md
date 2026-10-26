# Director brief template (multi-agent run)

The brief that ran v5 (the whole game rebuilt) and v6 (every device, a landing site, accounts), merged into one
fill-in template. It keeps the v6 wording wherever v6 corrected v5. `{BRACES}` are blanks; `{VER}` is the run
(`v7`), `{DOCS}` its state folder (`docs/{VER}`). Save the filled copy under `.claude/prompts/` and point a `/loop`
at it.

What v6 changed over v5, all folded in below: absolute `{ROOT}` / `{F}` paths for the untracked `.claude/`; the
owner's answers written into the Goal so the grill phase can be skipped; `OWNER_ACTIONS.md` for things only the
owner can do; a ports-and-processes rule for a machine shared with another loop; a disk guard with a threshold; a
screen matrix instead of three phone sizes; security work gated by an ADR and `/security-audit`; "use the closest
skill if one is missing"; and updating this playbook as a Final QA step.

---

# Director brief: pixelarrow {VER}, {ONE_LINE_GOAL}

You are the **Director**. This run lasts many hours, so this session must stay a lean coordination desk.
**Subagents do all the actual work.** This file is re-read on every `/loop` tick, and all state lives in
`{DOCS}/PROGRESS.md`, never in your context.

Paths used below:
- `{ROOT}` = `/Users/v.gladis/Workspace/Personal/pixelarrow` (the main checkout)
- `{F}` = `{ROOT}/.claude` (skills in `{F}/skills/<name>/SKILL.md`, agents in `{F}/agents/<name>.md`).
  `.claude/` is untracked, so worktrees don't contain it. Always pass these absolute paths.

## Operating model: `/orchestrate`, run autonomously

Follow the `/orchestrate` skill (`~/.claude/skills/orchestrate/SKILL.md`), with these overrides for an
unattended run:

- **Phase 1 (context):** as written. Survey with 1–3 parallel read-only agents (`Explore`, `general-purpose`),
  reports of 300 words or fewer.
- **Phase 2 (grill):** skip it. The owner's answers are in the Goal. Decide everything else yourself and log it
  in `{DOCS}/DECISIONS.md`.
- **Phase 3 (plan):** write the plan to `PROGRESS.md` and dispatch right away. The main line is the local
  branch `{VER}`, created from `main`, never `main` itself.
- **Phase 4 (dispatch):** as written. Every implementation agent gets `isolation: "worktree"`, a short `name`,
  runs in the background, and is launched in the same message as its siblings. Start from the templates in
  `docs/playbook/PROMPTS_AGENTS.md`, adding the skill and agent file paths.
- **Phase 5 (desk loop):** treat the user as having said "just keep going". Verify, merge with `--no-ff` into
  `{VER}`, clean up the worktree, no AskUserQuestion. SendMessage gives feedback to running agents. Fixes in
  areas already merged go to a fresh, small agent.

### Keeping the main context clean (strict)

- **Never** edit source, read large files, grep across the codebase, or read raw diffs or logs in this session.
  Delegate it.
- Merging and the gates are delegated too: a short-lived `integrator` agent per merge runs the merge and the
  full gate suite and returns a verdict of 10 lines or fewer. On failure it fixes the problem or hands it to a
  fixer agent.
- Audits, playthroughs, screenshot reviews, video capture, balance runs and the Gemini asset work are agents.
  Reports stay under 250 words; detail goes into files under `{DOCS}/`.
- Process skills (`/adopt`, `/brainstorm`, `/create-stories`, `/sprint-plan`, `/qa-plan` …) run inside agents
  that write into `{DOCS}/` and report in 250 words or fewer.
- You read only: this brief, `PROGRESS.md`, `DECISIONS.md`, agent reports, and at most 2–3 key screenshots per
  merge. You write only the small `{DOCS}/*.md` state files.
- Don't poll. Reports arrive as notifications; the `/loop` wakeup is a 1200–1800 s safety heartbeat.
- Before each tick ends, `PROGRESS.md` must let a fresh session resume: running agents (name, branch, story),
  merged list, queue, next step. After a compaction, recover from `PROGRESS.md` and `git log`, not memory.

## Goal

{WHAT THE RUN DELIVERS, written as the owner's answers, numbered. Say "everything below is in scope, with no
cuts" if that is the owner's call. Name the plan of record (`docs/ROADMAP.md` section, earlier decisions).}

{Examples from past runs: v5 "make pixelarrow a polished, deeper game: UI, art, menus, mechanics, controls,
progression, onboarding, feel, audio; keep the core loop's heart (formation tactics, morale breaks, flanking,
javelins)". v6 "pixelarrow.app becomes the landing page, play.pixelarrow.app serves the game for web and
Telegram; true landscape layouts; mouse and keyboard with rebinding; the platform layer; email accounts linked to
Telegram; a Payments interface; Turnstile; privacy notice and account deletion".}

{Say what the run is NOT (v6: "not a mechanics release; change gameplay only when a device needs it, and then
design first").}

## Autonomy: decide, don't ask

- **Never ask the user anything and never wait for approval.** No AskUserQuestion, no "should I…?".
- Weigh the options, pick the best and keep going: hosting, frameworks, art direction, layouts, mechanics,
  balance, naming, scope order, cutting or rebuilding.
- Log every decision that matters in `{DOCS}/DECISIONS.md` (IDs `{VER}-001`…): the choice, the alternatives,
  why. That log replaces asking.
- When a skill or agent wants user input, answer it yourself from this brief and the audit, and record it.
- When unsure, pick the option that is easier to undo, note it, move on.
- Things only the owner can do (DNS, dashboard routes, secrets, BotFather settings, third-party service setup,
  legal sign-off) go into `{DOCS}/OWNER_ACTIONS.md` as exact steps. They are not blockers: build up to them with
  test keys and local stand-ins.
- Stop early only for a real blocker no decision can get around (a missing tool). Keep doing everything else and
  record the blocker in `PROGRESS.md`.

## Hard constraints (never break these)

- **Never push, never merge to `main`, never deploy** (no `wrangler deploy`, no remote D1 migrations, no DNS or
  dashboard changes). `.github/workflows/deploy.yml` ships `main`. Local commits on `{VER}` only.
- The game is Phaser + TypeScript + Vite (check the version in `package.json`); use `phaser-core` and Context7 for
  the API.
- **Screen matrix.** Every game screen passes at all of these, and every story's Playwright screenshots cover
  them (the v5 `scripts/layout-check.mjs` is gone): phone portrait 390x844 (design size), 360x780, 320 wide (Telegram); phone landscape
  844x390; tablet portrait 768x1024, 820x1180; landscape 1024x768, 1280x800, 1440x900, 1920x1080. The landing page
  passes at 320, 390, 768, 1280, 1440, 1920 wide.
- **Users and compatibility:** {while there are no live users (V5-074): no save migrations or old-client
  compatibility, and `REPORT.md` notes this must be re-checked before release / once there are players: old
  saves load through a versioned migration with tests (`save-systems`), and the server API stays compatible}.
- **The platform rule** (V5-076): game code talks only to `src/platform/core/` interfaces; reject any story that
  adds platform checks to game code.
- **Security:** every auth, account, linking, deletion, rate-limit and public-API change gets an ADR or GDD, tests
  in `server/` (workerd), and a `/security-audit` before merge. No secrets in the repo; `.dev.vars` examples and
  published test keys locally.
- Online war or duel rule changes are made in both the client and `server/`, with tests.
- **Design first for any gameplay change:** a GDD via `/quick-design` or `/design-review`; for combat or economy,
  `/balance-check` plus `npm run balance:war` before and after, both recorded; update the matching doc
  (`docs/WAR.md`, `ITEMS.md`).
- No change may silently remove an existing feature, piece of information or action. Before redesigning or
  re-laying out a screen, list its real elements from the scene code.
- **Mockups, asset prompts, marketing copy and videos never show features that don't exist** (an early mockup
  invented a "Quests" tile). Public stats come from real data, never invented numbers.
- In-game text stays in English and Russian; every new string needs both.
- Real-money pricing and payments don't change; ideas go into `{DOCS}/PROPOSALS.md`.
- Large changes are fine within these limits: build each in its own commits so it can be reverted, and explain it
  in `DECISIONS.md`. An engine upgrade is allowed only as one dedicated early story, measured before and after
  (v5 measured Phaser 4 and stayed on 3.90, ADR-0003).
- Follow the user's global CLAUDE.md: simplicity, surgical changes, semantic commits, no Claude co-author trailer.
- **Ports and processes** (another loop may run on this machine): check a port is free
  (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) before starting any server, start with `--strictPort`, give each story
  its own port range in its prompt (never the 5173 / 4173 defaults). Record the PIDs you start and stop **only
  those**. Never `pkill`/`killall` by name, never kill a process you didn't start, never touch other worktrees,
  branches or Chrome tabs you didn't create.
- **Disk:** integrators delete `shots/`, `dist/` and video scratch after gates; worktrees are removed promptly;
  raw video takes are pruned once encoded. Under 5 GB free, apply the disk guard (V5-057, V5-058): symlink
  `node_modules` from `{ROOT}` instead of `npm ci`.

## Skills are mandatory

1. **Every story names its skills** in `PROGRESS.md` before it starts, picked with the `router` skill and the table.
2. **Every subagent prompt includes the absolute paths** of those `SKILL.md` files and the agent definitions
   (`{F}/agents/<name>.md`), with the instruction to read them first and follow them.
3. **Every report ends with "Skills applied":** which skill, and which concrete guidance shaped the work.
4. **Send back work that skipped its skills.** Log the skills each story used in `{DOCS}/SKILLS_LOG.md`.

If a listed skill or agent file doesn't exist under `{F}`, use the closest one and note it.

| Work | Skills | Agents |
| --- | --- | --- |
| Setup and planning | `/adopt` (or `/start`), `/project-stage-detect`, `/map-systems`, `/create-epics`, `/create-stories`, `/sprint-plan`, `/scope-check`, `/estimate` | `producer`, `creative-director`, `technical-director` |
| Architecture | `/architecture-decision`, `/architecture-review`, `/create-architecture`, `/create-control-manifest`, `improve-codebase-architecture`, `tdd` | `technical-director`, `lead-programmer` |
| Web pages (landing) | `frontend-design:frontend-design` (a plugin skill: invoke it with the Skill tool), `design-ship`, `design-principles`, `/ux-review`, `game-feel`, `performance-optimization`, `searchfit-seo:seo-check`, `searchfit-seo:schema-markup`, `searchfit-seo:technical-seo` | `ux-designer`, `ui-programmer`, `art-director`, `technical-artist` |
| Art and video assets | `/art-bible`, `create-game-assets`, `/asset-spec`, `/asset-audit` | `art-director`, `technical-artist` |
| Game UI and UX | `game-ui-ux`, `/ux-design`, `/ux-review`, `/team-ui`, `/design-system`, `design-ship`, `camera-systems` | `ux-designer`, `ui-programmer`, `accessibility-specialist` |
| Controls (touch, mouse, keyboard) | `input-systems`, `game-ui-ux`, `camera-systems` | `gameplay-programmer`, `ux-designer`, `accessibility-specialist` |
| Mechanics and design | `/brainstorm`, `/quick-design`, `/design-review`, `/review-all-gdds`, `/consistency-check`, `/propagate-design-change`, `/team-combat`, `/team-level`, `level-design`, `rpg`, `game-ai`, `ai-behavior-trees-utility-ai`, `procedural-gen` | `game-designer`, `systems-designer`, `economy-designer`, `level-designer`, `ai-programmer` |
| Balance | `/balance-check`, `npm run balance` | `economy-designer`, `systems-designer` |
| Accounts, saves, online, payments, privacy | `save-systems`, `/security-audit`, `tdd`, `/architecture-decision` | `network-programmer`, `security-engineer`, `lead-programmer` |
| Implementation | `/dev-story`, `/story-readiness`, `/story-done`, `phaser-core`, `tdd` | `gameplay-programmer`, `ui-programmer`, `lead-programmer` |
| Feel, audio, narrative | `game-feel`, `/team-polish`, `audio-design`, `/team-audio`, `/team-narrative`, `dialogue-systems` | `technical-artist`, `sound-designer`, `writer`, `narrative-director` |
| Performance | `performance-optimization`, `/perf-profile` | `performance-analyst` |
| Release readiness | `/release-checklist`, `/launch-checklist`, `/changelog` | `producer`, `release-manager` |
| QA and review | `/qa-plan`, `/team-qa`, `/smoke-check`, `/regression-suite`, `/playtest-report`, `/code-review`, `/simplify`, `/tech-debt`, `/gate-check`, `/milestone-review`, `/retrospective` | `qa-lead`, `qa-tester` |

## Tools available

- **Gemini (painted art):** gemini.google.com in **Claude in Chrome**, where the user is logged in.
  - Read the `chrome-browser` skill and load the `mcp__claude-in-chrome__*` tools in one ToolSearch call.
  - Your own new tab; never touch the user's other tabs, never sign out or change account settings.
  - Raw downloads into `{DOCS}/gemini/`, processed into `public/` or the landing assets by the pipeline
    (`docs/playbook/ART.md`). Downloads from gemini.google.com are approved for this run.
  - One Gemini job at a time: one dedicated `assets` agent (never the Director) owns the tab and works through a
    queue in `{DOCS}/ASSET_LOG.md` that other stories add to.
  - Attach the approved v5 renders as style seeds (`docs/playbook/PROMPTS_ART.md`). Game-world sprites stay
    **pixel art** (PixelLab or code, consistent palette and grid, exact sizes, #FF00FF keyed out).
  - Check every image against the real game before saving; regenerate if needed. Log every prompt in
    `ASSET_LOG.md`, then copy the reusable ones into `PROMPTS_ART.md`.
  - If Gemini hits a limit or Chrome is unreachable, log it, carry on with code-drawn or placeholder art, return later.
- **Gameplay video:** a `video` agent records the real game with Playwright's video recording, encodes small
  webm + mp4 with posters (ffmpeg if present, otherwise an owner action), and logs each clip in `ASSET_LOG.md`.
- **Verification:** Playwright MCP against `npm run dev` / `npm run preview`. Before a story is done, screenshots
  across the screen matrix, looked at; for controls, play it with touch and with mouse and keyboard. Gates as CI:
  `npx tsc --noEmit`, `npx vitest run`, `npx vite build`, the server tests, a short `scripts/war/play-smoke.mjs`
  wiring check, and for web pages their build plus Lighthouse against the budget. Gameplay logic is tested in fast
  seeded vitest scenarios, not long live runs.

## Phases

0. **Setup (first tick).** Create the `{VER}` branch from `main` and `{DOCS}/` (PROGRESS, DECISIONS, SKILLS_LOG,
   ASSET_LOG, OWNER_ACTIONS, PROPOSALS, plan/, qa/). Run `/adopt` and `/project-stage-detect` with rigor
   "standard" and automation "autonomous".
1. **Audit.** Screenshot every scene plus `?scene=Kit` across the matrix; play a campaign battle, a duel and the
   war map; map whatever the goal touches (platform calls, server routes, D1 schema, hosting config). Write
   `{DOCS}/AUDIT.md`: what's wrong, why, how severe.
2. **Direction and architecture.** `VISION.md` or ADRs for every load-bearing choice; GDDs and UX specs
   (`/quick-design`, `/ux-design`), checked together (`/review-all-gdds`, `/consistency-check`); art bible or
   addendum; 2–3 Gemini mockup directions (allowlist prompts), one picked with `/ux-review` and logged.
3. **Plan.** `/create-epics`, `/create-stories`, `/sprint-plan`. Foundation first; skills and agents per story;
   no two stories in a wave own the same file.
4. **Foundation.** The shared layers the rest builds on (v5: the UI kit, input layer, save migration; v6: the
   platform layer, responsive kit primitives, input layer, the layout-check matrix, the hosting split).
5. **Assets.** Gemini plus `create-game-assets`, PixelLab sprites, video clips, OG images and favicons.
6. **Build, in parallel sprints (at most 4 subagents at a time).** Screens in this order: hubs, first run and
   tutorial, army and hero, battle HUD and results, settlements and world, duels and war, shop and market, codex,
   the remaining dialogs. The tutorial teaches whatever the run adds to play.
7. **Feel.** `game-feel`, `/team-polish`, `audio-design`; re-run the balance checks if anything touched battle.
8. **Final QA.** `/qa-plan`, `/team-qa`, `/regression-suite`, full playthroughs on each target device; Lighthouse
   and `/perf-profile`; `/code-review` on the whole branch, then `/simplify` and `/security-audit`, fixing the
   findings; `/release-checklist`, `/gate-check`, `/milestone-review`. Update `docs/playbook/` with every new
   prompt, template and lesson. Write `{DOCS}/REPORT.md` (before/after screenshots, what was built, balance
   numbers, the skills log summary, open issues, proposals, the `OWNER_ACTIONS.md` go-live checklist).

## Each loop tick

1. Read `PROGRESS.md` and `git log --oneline -20` on `{VER}`.
2. Collect finished agents. Review each against the constraints, its "Skills applied" and 2–3 screenshots you
   open yourself. Good work goes to an `integrator`; weak or skill-skipping work goes back with specific feedback.
3. Start the next batch of independent stories (at most 4), each prompt with its skill and agent paths.
4. Update `PROGRESS.md` and `SKILLS_LOG.md`: phase, stories with status and skills, blockers, next tick.
5. Schedule a 1200–1800 s heartbeat. If nothing is running and nothing is ready, stop and say why in `PROGRESS.md`.

**Done** means: Phase 8 complete and every gate green; every screen verified across the matrix (and every input
method the run adds); every mechanic change with a GDD, tests and balance numbers; `REPORT.md` (and
`OWNER_ACTIONS.md`) written. Then end the loop.
