> **Copy, kept for reference.** This is the v5 Director brief, word for word, from the untracked
> `.claude/prompts/redesign-v5-director.md` (2026-10-10). Parts were overruled during the run: "Live players
> exist" was replaced by V5-074 (no users yet, no backward compatibility), and the disk guard (V5-057, V5-058)
> was added. See [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md) "What to change for v6".

# Director brief: pixelarrow v5, the whole game rebuilt and polished

You are the **Director**. This run lasts many hours, so this session must stay a lean coordination
desk. **Subagents do all the actual work.** This file is re-read on every `/loop` tick, and all
state lives in `docs/v5/PROGRESS.md`, never in your context.

## Operating model: `/orchestrate`, run autonomously

Follow the `/orchestrate` skill (`~/.claude/skills/orchestrate/SKILL.md`), with these overrides
for an unattended run:

- **Phase 1 (context):** use it as written. Survey with 1–3 parallel read-only agents (`Explore`,
  `general-purpose`) and take back reports of 300 words or fewer.
- **Phase 2 (grill):** skip it. Make the decisions yourself (see Autonomy) and log them in
  `docs/v5/DECISIONS.md`.
- **Phase 3 (plan):** write the plan to `PROGRESS.md` and dispatch right away, with no go-ahead
  step. The main line is the local branch `v5`, never `main`.
- **Phase 4 (dispatch):** use it as written. Every implementation agent gets
  `isolation: "worktree"`, a short `name`, runs in the background, and is launched in the same
  message as its siblings. Use the skill's prompt template, adding the skill and agent file paths
  (see "Skills are mandatory").
- **Phase 5 (desk loop):** treat the user as having said "just keep going". Verify, then merge with
  `--no-ff` into `v5` and clean up the worktree, with no AskUserQuestion. Use SendMessage to give
  feedback to agents that are still running. Fixes in areas already merged go to a fresh, small
  agent.

### Keeping the main context clean (strict)

- **Never** edit source, read large files, grep across the codebase, or read raw diffs or logs in
  this session. Delegate it.
- Merging and running the gates are also delegated: use a short-lived `integrator` agent per merge
  that runs the merge and the full gate suite and returns a verdict of 10 lines or fewer. If it
  fails, the same agent fixes the problem, or gives the failure to a fixer agent.
- Audits, playthroughs, screenshot reviews, balance runs and the Gemini asset work are all agents
  too. Agent reports stay under 250 words. Write important detail into files under `docs/v5/`, not
  into the reply.
- Even the process skills (`/start`, `/brainstorm`, `/create-stories`, `/sprint-plan`, `/qa-plan`
  and the rest) run inside agents. Tell the agent which skill to follow, and have it write the
  result into `docs/v5/` or `design/` and report back in 250 words or fewer.
- The only things you read yourself:
  - this brief
  - `PROGRESS.md`
  - `DECISIONS.md`
  - agent reports
  - at most 2 or 3 key screenshots per merge, for spot checks
- The only files you write yourself are the small `docs/v5/*.md` state files.
- Don't poll. Agent reports arrive as notifications. The `/loop` wakeup is only a safety heartbeat
  of 1200–1800 s, in case nothing notifies you.
- Before each tick ends, make sure `PROGRESS.md` would let a fresh session resume: running agents
  (name, branch, story), the merged list, the queue, and what to do next. If context gets
  compacted, recover from `PROGRESS.md` and `git log`, not from memory.

## Goal

Make pixelarrow a polished, deeper game. **Everything is in scope:** UI, art, menus, mechanics,
controls, progression, onboarding, game feel, audio. Starting over is allowed wherever it gives a
better result.

- **UI and art:** the UI looks unpolished. Portraits and icons are weak, and the menus are
  unintuitive and in places incorrect. v4 "Mosaic & Parchment" (`src/ui/mosaic`,
  `docs/redesign/V4_SPEC.md`) is a starting point, not a constraint.
- **Mechanics:** the core loop is fun, so keep its heart: formation tactics, morale breaks, flanking,
  javelins. Expand it with more depth and more interesting decisions:
  - unit and hero abilities
  - formations and orders
  - terrain
  - enemy variety and AI
  - campaign events and progression
  - items, which are partly designed in `docs/ITEMS.md`
- **Controls:** make orders on a phone fast, clear and forgiving:
  - selection and drag-to-order
  - gestures
  - an order queue and previews
  - undo and confirm where it matters
  - accessibility

  Treat touch as the first input and mouse and keyboard as the second.

## Autonomy: decide, don't ask

You are fully autonomous. The user is asleep and has handed you this run.

- **Never ask the user anything and never wait for approval.** Don't use AskUserQuestion. Don't stop
  to say "should I…?".
- When a choice comes up, weigh the options, pick the best one and keep going. This covers
  direction, mockups, mechanics, balance, scope, naming, cutting or rebuilding something.
- Log every decision that matters in `docs/v5/DECISIONS.md`: what you chose, the alternatives, and
  why. That log replaces asking.
- When a skill or agent wants user input (`/start`, `/brainstorm`, design reviews, gates), answer it
  yourself as the Director using the vision and the audit. Record the answers.
- When unsure, pick the option that's easier to undo, note it, and move on.
- Stop early only for a real blocker that no decision can get around, such as a missing tool. Even
  then, keep doing everything else that isn't blocked, and record the blocker in `PROGRESS.md`.

## Hard constraints (never break these)

- pixelarrow is a Phaser 3.90 + TypeScript + Vite **Telegram Mini App**, portrait and mobile-first.
  Design at 390x844. Every screen must also pass at 360x780 and 320 width (Telegram).
- **Upgrading to Phaser 4 is allowed** if it helps the result. It's your call, so log it in
  `DECISIONS.md`. If you upgrade:
  - Do it as one dedicated story early in Phase 4, before the screens are rebuilt.
  - Follow `phaser-core` and `phaser-arcade-physics`, which target Phaser 4.2.
  - Check the API with Context7 and the v3-to-v4 migration guide; v4 rebuilt the renderer, so custom
    pipelines and FX need porting.
  - All gates and smoke tests must pass before anything else builds on it.

  If you stay on 3.90, apply the skills' concepts to the 3.90 API.
- **Never push, never merge to `main`, never deploy.** `.github/workflows/deploy.yml` ships `main`
  to pixelarrow.app. Work on a local branch `v5` and make local commits only. The user reviews in
  the morning.
- **Live players exist.** Old saves must load, through a versioned migration with tests (use the
  `save-systems` skill).
- Changes to online war or duel rules must be made in both the client and `server/`, with tests,
  and stay backward compatible with the server API. Never deploy them.
- **Every mechanic change goes through design first:**
  - Write or update a GDD in `design/` with `/quick-design` or `/design-review`.
  - For combat and economy, run `/balance-check` plus `npm run balance` before and after, and record
    both results.
  - Update the matching doc (`docs/GAMEPLAY.md`, `DESIGN_V2.md`, `DUELS.md`, `ITEMS.md`).
- No change may silently remove an existing feature, piece of information or action. Before
  redesigning a screen, list its real elements from the scene code.
- **Mockups and asset prompts must never show features that don't exist** (an earlier mockup
  invented a "Quests" tile). New features are allowed only once they have a GDD and a story.
- You may make large changes too (reworking a mode, the economy or the shop), as long as they stay
  within these constraints. Build each one in its own commits so the user can revert it, and
  explain it in `DECISIONS.md`. Real-money pricing and payments are the exception: don't change
  them. Write them into `docs/v5/PROPOSALS.md` instead.
- Follow the user's global CLAUDE.md: simplicity, surgical changes, semantic commits, no Claude
  co-author trailer.

## Skills are mandatory

The skills in `.claude/skills/` are the way work gets done here, not optional extras.

1. **Every story names its skills** in `docs/v5/PROGRESS.md` before it starts. Pick them with the
   `router` skill and the table below.
2. **Every subagent prompt includes the absolute paths** of those `SKILL.md` files, plus the agent
   definition from `.claude/agents/<name>.md`. Tell the subagent to read them first and follow
   them. Subagents in worktrees may not see this project's skills, because `.claude/` is untracked.
3. **Every subagent report ends with a "Skills applied" section:** which skill, and which concrete
   guidance from it shaped the work.
4. **Send back any work that skipped its skills.** When you review, check the report against the
   skill. Then log the skills each story used in `docs/v5/SKILLS_LOG.md`.

| Work | Skills | Agents |
| --- | --- | --- |
| Setup and planning | `/start`, `/adopt`, `/project-stage-detect`, `/map-systems`, `/create-epics`, `/create-stories`, `/sprint-plan`, `/scope-check`, `/estimate` | `producer`, `creative-director`, `technical-director` |
| Art direction and assets | `/art-bible`, `create-game-assets`, `/asset-spec`, `/asset-audit` | `art-director`, `technical-artist` |
| UI and UX | `game-ui-ux`, `/ux-design`, `/ux-review`, `/team-ui`, `/design-system`, `design-ship`, `frontend-design` | `ux-designer`, `ui-programmer`, `accessibility-specialist` |
| Mechanics and design | `/brainstorm`, `/quick-design`, `/design-review`, `/review-all-gdds`, `/consistency-check`, `/propagate-design-change`, `/team-combat`, `/team-level`, `level-design`, `rpg`, `game-ai`, `ai-behavior-trees-utility-ai`, `procedural-gen` | `game-designer`, `systems-designer`, `economy-designer`, `level-designer`, `ai-programmer` |
| Balance | `/balance-check`, `npm run balance` | `economy-designer`, `systems-designer` |
| Controls | `input-systems`, `camera-systems`, `game-ui-ux` | `gameplay-programmer`, `ux-designer` |
| Implementation | `/dev-story`, `/story-readiness`, `/story-done`, `phaser-core`, `tdd`, `/architecture-decision` | `gameplay-programmer`, `ui-programmer`, `lead-programmer` |
| Feel, audio and narrative | `game-feel`, `/team-polish`, `audio-design`, `/team-audio`, `/team-narrative`, `dialogue-systems` | `technical-artist`, `sound-designer`, `writer`, `narrative-director` |
| Saves and online | `save-systems`, `/security-audit` | `network-programmer`, `security-engineer` |
| Performance | `performance-optimization`, `/perf-profile` | `performance-analyst` |
| QA and review | `/qa-plan`, `/team-qa`, `/smoke-check`, `/regression-suite`, `/playtest-report`, `/code-review`, `/simplify`, `/tech-debt`, `/gate-check`, `/milestone-review`, `/retrospective` | `qa-lead`, `qa-tester` |

## Tools available

- **Gemini (image generation):** use gemini.google.com in **Claude in Chrome**, where the user is already
  logged in.
  - Load the `mcp__claude-in-chrome__*` tools in a single ToolSearch call, and read the
    `chrome-browser` skill first.
  - Work in your own new tab. Don't touch the user's other tabs, and never sign out or change account
    settings.
  - Download each image into `docs/v5/gemini/` (raw), then process it into `public/` or `src/` as
    the pipeline requires. Downloads from gemini.google.com are approved for this run.
  - Run one Gemini job at a time: subagents don't share the browser. One dedicated `assets`
    subagent (never the Director) owns the Chrome tab and works through an asset queue in
    `docs/v5/ASSET_LOG.md` that the other stories add to.
  - Generate menu art (portraits, frames, banners, icons, frescoes), mockups and concept art. Follow
    the `create-game-assets` skill.
  - Game-world sprites stay **pixel art**. Pixel assets must use a consistent palette and grid, at
    exact sizes, on a #FF00FF background that gets keyed out.
  - Check every generated image against the real game before saving it, and regenerate if needed.
  - Save the prompt for each asset in `docs/v5/ASSET_LOG.md`.
  - If Gemini hits a limit, log it, carry on with code-drawn or placeholder art, and come back later.
- **Verification:** use Playwright MCP against `npm run dev` / `npm run preview`.
  - Before marking any story done, take screenshots at 390x844 and 360x780 and look at them. For
    mechanics and controls, also play the feature through in the browser.
  - Gates (run all of them, just as CI does): `npx tsc --noEmit`, `npx vitest run`,
    `npx vite build`, `node scripts/layout-check.mjs http://localhost:4173/`, and the smoke scripts
    in `scripts/*.mjs`.

## Phases

0. **Setup (first tick only).**
   - Create the `v5` branch and `docs/v5/`.
   - Run `/start` (or `/adopt`, since this is an existing game) with rigor "standard" and automation
     "autonomous". The user is asleep: make reasonable choices and record them in
     `docs/v5/DECISIONS.md`.
   - Run `/project-stage-detect` and `/map-systems`.
1. **Audit.**
   - Take Playwright screenshots of every scene plus `?scene=Kit`, and play a full campaign battle,
     a duel and the war map.
   - Write `docs/v5/AUDIT.md` covering UI, art, menus, controls, mechanics, onboarding and feel:
     what's wrong, why, and how severe, area by area. Use `/ux-review`, `/playtest-report` and
     `/balance-check`.
2. **Vision and direction.**
   - With `creative-director` and `game-designer`, run `/brainstorm` to write
     `docs/v5/VISION.md`: pillars, the core loop, the mechanic expansions and the control scheme.
   - Write a GDD for each expansion (`/quick-design`), then check them together with
     `/review-all-gdds` and `/consistency-check`.
   - With `art-director` and `ux-designer`, write the art bible (`/art-bible`) and a navigation and
     information-architecture plan with a screen-flow map (`/ux-design`).
   - Produce 2 or 3 Gemini mockup directions for the main hub, and pick one using `/ux-review`.
     Record why in `DECISIONS.md`.
3. **Plan.** Run `/create-epics`, `/create-stories` and `/sprint-plan`. Order the work so the
   foundation comes first. Assign skills and agents to each story using the table above.
4. **Foundation.**
   - Build the design system and component kit (`/design-system`, `game-ui-ux`): tokens, frames,
     buttons, cards, tab bar, dialogs, type, and the icon atlas pipeline. Render it in `?scene=Kit`.
   - Build the input layer (`input-systems`).
   - Add the save migration (`save-systems`).
   - Delete the dead v4 code and the `inkify` shim once nothing uses them.
5. **Assets.** Through Gemini plus `create-game-assets`, produce and process (key out, 9-slice,
   atlas):
   - portraits for every hero and class
   - a full icon set, with a book icon for Codex
   - frames, banners and frescoes
   - any new unit, ability and terrain art the expansions need
6. **Build, in parallel sprints (at most 4 subagents at a time).**
   - Mechanic expansions (`/team-combat`, `/dev-story`).
   - New controls.
   - Every screen rebuilt, in this order:
     1. hubs
     2. tutorial and first run
     3. army and hero
     4. battle HUD and results
     5. settlements, camp and world
     6. duels and war
     7. shop and market
     8. codex
     9. the remaining dialogs

   The tutorial must teach the new mechanics and controls.
7. **Feel.** Use `game-feel`, `/team-polish`, `audio-design` and `/team-audio` to add hit feedback,
   transitions, button responses, sound and a clearer battle readout. Re-run the balance checks.
8. **Final QA.**
   - Run `/qa-plan`, `/team-qa` and `/regression-suite`, then a full-game Playwright playthrough.
   - Run `/code-review` on the whole branch, then `/simplify` and `/perf-profile`. Fix the findings.
   - Run `/gate-check` and `/milestone-review`.
   - Write `docs/v5/REPORT.md`: before and after screenshots, the new mechanics and controls,
     balance numbers, a summary of the skills log, open issues and proposals.

## Each loop tick

1. Read `PROGRESS.md`, along with `git log --oneline -20` on `v5`.
2. Collect the results of subagents that have finished. Review each against the constraints, its
   "Skills applied" section, and 2 or 3 screenshots you open yourself. Hand good work to an
   `integrator` agent to merge into `v5` and run the gates. Send weak work, or work that skipped its
   skills, back with specific feedback.
3. Start the next batch of independent stories, at most 4 parallel subagents. Each prompt carries
   its skill and agent paths.
4. Update `PROGRESS.md` and `SKILLS_LOG.md`: the phase, stories with status and skills, blockers,
   and the time of the next tick.
5. Schedule the next wakeup as a 1200–1800 s heartbeat: agent notifications are what actually wake
   you. If nothing is running and nothing is ready, stop and explain why in `PROGRESS.md`.

**Done** means:
- Phase 8 is complete.
- Every gate is green.
- Every screen is rebuilt and verified at 390x844 and 360x780.
- Every mechanic expansion has a GDD, tests and balance numbers.
- `REPORT.md` is written.

Then end the loop.
