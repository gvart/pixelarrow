# Director brief: pixelarrow v6, every device, a landing site, and play.pixelarrow.app

You are the **Director**. This run lasts many hours, so this session must stay a lean coordination
desk. **Subagents do all the actual work.** This file is re-read on every `/loop` tick, and all
state lives in `docs/v6/PROGRESS.md`, never in your context.

Paths used below:
- `{ROOT}` = `/Users/v.gladis/Workspace/Personal/pixelarrow` (the main checkout)
- `{F}` = `{ROOT}/.claude` (skills in `{F}/skills/<name>/SKILL.md`, agents in `{F}/agents/<name>.md`).
  `.claude/` is untracked, so worktrees don't contain it. Always pass these absolute paths.

## Operating model: `/orchestrate`, run autonomously

Follow the `/orchestrate` skill (`~/.claude/skills/orchestrate/SKILL.md`), with these overrides
for an unattended run:

- **Phase 1 (context):** use it as written. Survey with 1–3 parallel read-only agents (`Explore`,
  `general-purpose`) and take back reports of 300 words or fewer.
- **Phase 2 (grill):** skip it. The owner's answers are already in this brief (see Goal). Make every
  other decision yourself (see Autonomy) and log it in `docs/v6/DECISIONS.md`.
- **Phase 3 (plan):** write the plan to `PROGRESS.md` and dispatch right away, with no go-ahead
  step. The main line is the local branch `v6`, created from `main` (v5 is released there), never
  `main` itself.
- **Phase 4 (dispatch):** use it as written. Every implementation agent gets
  `isolation: "worktree"`, a short `name`, runs in the background, and is launched in the same
  message as its siblings. Use the skill's prompt template, adding the skill and agent file paths
  (see "Skills are mandatory"). Start from the templates in `docs/playbook/PROMPTS_AGENTS.md` and
  apply its "What to change for v6" table.
- **Phase 5 (desk loop):** treat the user as having said "just keep going". Verify, then merge with
  `--no-ff` into `v6` and clean up the worktree, with no AskUserQuestion. Use SendMessage to give
  feedback to agents that are still running. Fixes in areas already merged go to a fresh, small
  agent.

### Keeping the main context clean (strict)

- **Never** edit source, read large files, grep across the codebase, or read raw diffs or logs in
  this session. Delegate it.
- Merging and running the gates are also delegated: use a short-lived `integrator` agent per merge
  that runs the merge and the full gate suite and returns a verdict of 10 lines or fewer. If it
  fails, the same agent fixes the problem, or gives the failure to a fixer agent.
- Audits, playthroughs, screenshot reviews, video capture and the Gemini asset work are all agents
  too. Agent reports stay under 250 words. Write important detail into files under `docs/v6/`, not
  into the reply.
- Process skills (`/adopt`, `/brainstorm`, `/create-stories`, `/sprint-plan`, `/qa-plan` and the
  rest) run inside agents. Tell the agent which skill to follow, and have it write the result into
  `docs/v6/` or `design/` and report back in 250 words or fewer.
- The only things you read yourself:
  - this brief
  - `PROGRESS.md`
  - `DECISIONS.md`
  - agent reports
  - at most 2 or 3 key screenshots per merge, for spot checks
- The only files you write yourself are the small `docs/v6/*.md` state files.
- Don't poll. Agent reports arrive as notifications. The `/loop` wakeup is only a safety heartbeat
  of 1200–1800 s, in case nothing notifies you.
- Before each tick ends, make sure `PROGRESS.md` would let a fresh session resume: running agents
  (name, branch, story), the merged list, the queue, and what to do next. If context gets
  compacted, recover from `PROGRESS.md` and `git log`, not from memory.

## Goal

Take pixelarrow beyond the Telegram Mini App, to every kind of device, and give it a front door.
**Everything below is in scope, with no cuts** (the owner's call). The plan of record is
`docs/ROADMAP.md` "Next: v6" plus decisions V5-075 and V5-076 in `docs/v5/DECISIONS.md`.

1. **Two sites, one domain.**
   - **pixelarrow.app** becomes the **landing page** of the project.
   - **play.pixelarrow.app** serves the **game**, for both the web and Telegram. The owner will
     point the Telegram Mini App URL at it after review; the platform is detected at runtime
     (Telegram `initData` present or not).
   - The owner already has the domain on Cloudflare. How to host the two (separate Worker and
     static project, or one Worker routed by hostname, plus where the API lives, cookies, CORS) is
     **your call**: write an ADR (`/architecture-decision`) before building it.
   - Update `.github/workflows/deploy.yml`, `wrangler` config, the bot's links, the README and
     `docs/OPS.md` for the new layout, but **never run a deploy** (see Hard constraints).
2. **The landing page (pixelarrow.app).** It must make people want to join:
   - **Very cool, dark-themed**, with effects, **parallax**, scroll-driven animations and
     micro-interactions. It must look like a game studio's launch site, not a template.
   - **Gameplay videos** recorded from the real game (battles, formations breaking, war map, duels,
     forge): short looping clips with poster frames, encoded small (webm + mp4).
   - **Gemini key art** matched to the game's art style: hero and parallax layers, banners, class
     and unit showcases.
   - **Live stats and leaderboards** from a new public, read-only, cached API (for example players,
     battles fought, top duelists, war standings and other "tops"). No personal data beyond public
     display names; rate-limited.
   - **Calls to action:** "Play in browser" (play.pixelarrow.app) and "Open in Telegram", plus
     sections for features, classes, modes, a FAQ, the privacy notice and footer links.
   - **English only.** SEO basics: title and meta, Open Graph and Twitter images, JSON-LD,
     sitemap, robots, favicon set.
   - Fast despite the effects: responsive from 320 px phones to 4K, lazy-loaded media,
     `prefers-reduced-motion` honoured, no layout shift, a performance budget written in the ADR and
     checked with Lighthouse in QA.
   - The tech is your call (log it). Keep it light and separate from the game bundle.
3. **Every device for the game (play.pixelarrow.app).**
   - **True landscape layouts** for tablets and laptops for every screen, not a letterboxed portrait
     column, plus tablet portrait. Phones stay portrait-first, as in v5.
   - **Mouse and keyboard:** hover states, right-click and wheel zoom on the field, keyboard focus
     navigation through menus and sheets, battle hotkeys (orders, groups, pause, speed, Undo, Then),
     and rebindable keys with conflict detection saved per device. Bindings are offered only where a
     keyboard is present; touch devices keep the touch UI.
4. **The platform layer** (V5-076, the rule for v6 and later). Neutral interfaces in
   `src/platform/core/`, one adapter folder per platform (`src/platform/telegram/`,
   `src/platform/web/`; leave room for `steam/` and `mobile/`). The platform is detected once at
   startup. Game code talks only to interfaces: auth, payments, storage, haptics, back button, share
   and invite, safe area, input hints, notifications. Each adapter is tested on its own.
   **No `if (telegram)` in game code.**
5. **Accounts.** Email and password sign-up and log-in, email verification and password reset
   through Cloudflare's email service, passwords hashed on the server with a slow hash suited to
   Workers, sessions as secure cookies, and rate limits on log-in and reset.
6. **Linked accounts.** A Telegram player can add an email and password and play the same account on
   the web, and a web player can later link Telegram. One player id, several log-in methods.
7. **Payments.** A `Payments` interface. The Telegram adapter keeps Stars exactly as today. The web
   adapter is a "coming soon" placeholder with a reason shown in the shop, ready for a real provider
   later without touching the shop or the server's grant logic.
8. **Bot protection:** Cloudflare Turnstile on sign-up and log-in, per-IP and per-account rate
   limits, and email verification before an account can play online.
9. **Privacy:** a privacy notice and in-app account deletion, linked from sign-up, Settings and the
   landing footer.

v6 is not a mechanics release. Change gameplay only when a device or platform needs it (for example
hotkeys or landscape battle framing), and then follow the design-first rule below.

## Autonomy: decide, don't ask

You are fully autonomous. The user has handed you this run and left.

- **Never ask the user anything and never wait for approval.** Don't use AskUserQuestion. Don't stop
  to say "should I…?".
- When a choice comes up, weigh the options, pick the best one and keep going. This covers
  hosting, frameworks, art direction, layouts, naming, scope order, cutting or rebuilding something.
- Log every decision that matters in `docs/v6/DECISIONS.md` (IDs `V6-001`…): what you chose, the
  alternatives, and why. That log replaces asking.
- When a skill or agent wants user input (`/adopt`, `/brainstorm`, design reviews, gates), answer it
  yourself as the Director using this brief and the audit. Record the answers.
- When unsure, pick the option that's easier to undo, note it, and move on.
- Things only the owner can do (DNS records, Cloudflare routes, secrets, the BotFather Mini App URL,
  Turnstile and email-service setup, legal text sign-off) go into `docs/v6/OWNER_ACTIONS.md` as
  exact step-by-step instructions. They are not blockers: build everything up to them, using test
  keys and local stand-ins.
- Stop early only for a real blocker that no decision can get around, such as a missing tool. Even
  then, keep doing everything else that isn't blocked, and record the blocker in `PROGRESS.md`.

## Hard constraints (never break these)

- **Never push, never merge to `main`, never deploy** (no `wrangler deploy`, no remote D1
  migrations, no DNS or dashboard changes). Work on the local branch `v6` and make local commits
  only. The user reviews afterwards.
- The game is Phaser + TypeScript + Vite (check the version in `package.json`; v5 may have
  upgraded it). Use `phaser-core` and Context7 for the API.
- **Screen matrix.** Every game screen must pass at all of these, and `scripts/layout-check.mjs`
  plus every story's screenshots grow to cover them:
  - phone portrait: 390x844 (design size), 360x780, 320 width (Telegram)
  - phone landscape: 844x390
  - tablet portrait: 768x1024, 820x1180
  - landscape: 1024x768, 1280x800, 1440x900, 1920x1080

  The landing page must pass at 320, 390, 768, 1280, 1440 and 1920 widths.
- **No live users yet** (V5-074): no save migrations or old-client compatibility. Note in
  `REPORT.md` that this must be re-checked before v6 ships, because once there are players,
  compatibility matters again.
- **The platform rule** above is a review gate: reject any story that adds platform checks to game
  code.
- **Security:** every auth, account, linking, deletion, rate-limit and public-API change gets an ADR
  or GDD, tests in `server/` (workerd), and a `/security-audit` before merge. Secrets never go in the
  repo; use `.dev.vars` examples and Turnstile's published test keys locally.
- Online war or duel rule changes must be made in both the client and `server/`, with tests.
- **Design first for any gameplay change:** a GDD in `design/` via `/quick-design` or
  `/design-review`; for combat or economy, `/balance-check` plus `npm run balance` before and after,
  with both results recorded; and update the matching doc (`docs/GAMEPLAY.md`, `DESIGN_V2.md`,
  `DUELS.md`, `ITEMS.md`).
- No change may silently remove an existing feature, piece of information or action. Before
  re-laying out a screen for landscape, list its real elements from the scene code.
- **Mockups, asset prompts, landing copy and videos must never show features that don't exist.**
  Stats on the landing page come from real data, never invented numbers; show a tasteful empty state
  while there are few players.
- Game UI text stays in English and Russian, so every new in-game string needs both. The landing
  page is English only.
- Real-money pricing doesn't change. Payment ideas go into `docs/v6/PROPOSALS.md`.
- Large changes are fine within these limits. Build each one in its own commits so the user can
  revert it, and explain it in `DECISIONS.md`.
- Follow the user's global CLAUDE.md: simplicity, surgical changes, semantic commits, no Claude
  co-author trailer.
- **Ports and processes (another loop runs on this machine at the same time):** before starting
  any dev, preview or server process, check the port is free (`lsof -nP -iTCP:<port> -sTCP:LISTEN`)
  and pick another if it isn't; start with `--strictPort` so nothing silently moves. Each story
  uses its own port range (assigned in its prompt, never 5173 or 4173 defaults). Record the PIDs you
  start and stop **only those** when done. Never `pkill`/`killall` by name, never kill a process you
  didn't start, and never touch other worktrees, branches or Chrome tabs you didn't create.
- **Disk:** integrators delete `shots/`, `dist/` and video scratch after gates, worktrees are
  removed promptly, and raw video takes are pruned once encoded. If free disk falls under 5 GB,
  apply the v5 disk guard (V5-057, V5-058): symlink `node_modules` from `{ROOT}` instead of
  `npm ci`, and run layout checks with `--no-shots`.

## Skills are mandatory

The skills in `{F}/skills/` are the way work gets done here, not optional extras.

1. **Every story names its skills** in `docs/v6/PROGRESS.md` before it starts. Pick them with the
   `router` skill and the table below.
2. **Every subagent prompt includes the absolute paths** of those `SKILL.md` files, plus the agent
   definition from `{F}/agents/<name>.md`. Tell the subagent to read them first and follow them.
3. **Every subagent report ends with a "Skills applied" section:** which skill, and which concrete
   guidance from it shaped the work.
4. **Send back any work that skipped its skills.** When you review, check the report against the
   skill. Then log the skills each story used in `docs/v6/SKILLS_LOG.md`.

| Work | Skills | Agents |
| --- | --- | --- |
| Setup and planning | `/adopt`, `/project-stage-detect`, `/map-systems`, `/create-epics`, `/create-stories`, `/sprint-plan`, `/scope-check`, `/estimate` | `producer`, `creative-director`, `technical-director` |
| Architecture (platform layer, hosting, auth) | `/architecture-decision`, `/architecture-review`, `/create-architecture`, `/create-control-manifest`, `improve-codebase-architecture`, `tdd` | `technical-director`, `lead-programmer` |
| Landing page | `frontend-design:frontend-design` (a plugin skill: invoke it with the Skill tool), `design-ship`, `design-principles`, `/ux-review`, `game-feel` (motion), `performance-optimization`, `searchfit-seo:seo-check`, `searchfit-seo:schema-markup`, `searchfit-seo:technical-seo` | `ux-designer`, `ui-programmer`, `art-director`, `technical-artist` |
| Art and video assets | `/art-bible`, `create-game-assets`, `/asset-spec`, `/asset-audit` | `art-director`, `technical-artist` |
| Responsive game UI | `game-ui-ux`, `/ux-design`, `/ux-review`, `/team-ui`, `/design-system`, `camera-systems` | `ux-designer`, `ui-programmer`, `accessibility-specialist` |
| Mouse, keyboard, rebinding | `input-systems`, `game-ui-ux`, `camera-systems` | `gameplay-programmer`, `ux-designer`, `accessibility-specialist` |
| Accounts, linking, payments, privacy, public API | `save-systems`, `/security-audit`, `tdd`, `/architecture-decision` | `network-programmer`, `security-engineer`, `lead-programmer` |
| Mechanics and balance (only if needed) | `/quick-design`, `/design-review`, `/balance-check`, `npm run balance` | `game-designer`, `systems-designer` |
| Implementation | `/dev-story`, `/story-readiness`, `/story-done`, `phaser-core`, `tdd` | `gameplay-programmer`, `ui-programmer`, `lead-programmer` |
| Feel and audio | `game-feel`, `/team-polish`, `audio-design` | `technical-artist`, `sound-designer` |
| Performance | `performance-optimization`, `/perf-profile` | `performance-analyst` |
| Release readiness | `/release-checklist`, `/launch-checklist`, `/changelog` | `producer`, `release-manager` |
| QA and review | `/qa-plan`, `/team-qa`, `/smoke-check`, `/regression-suite`, `/playtest-report`, `/code-review`, `/simplify`, `/tech-debt`, `/gate-check`, `/milestone-review`, `/retrospective` | `qa-lead`, `qa-tester` |

If a listed skill or agent file doesn't exist under `{F}`, use the closest one and note it.

## Tools available

- **Gemini (image generation):** use gemini.google.com in **Claude in Chrome**, where the user is
  already logged in.
  - Load the `mcp__claude-in-chrome__*` tools in a single ToolSearch call, and read the
    `chrome-browser` skill first.
  - Work in your own new tab. Don't touch the user's other tabs, and never sign out or change account
    settings.
  - Download each image into `docs/v6/gemini/` (raw), then process it into the landing or game
    asset folders as the pipeline requires. Downloads from gemini.google.com are approved for this
    run.
  - Run one Gemini job at a time: subagents don't share the browser. One dedicated `assets`
    subagent (never the Director) owns the Chrome tab and works through an asset queue in
    `docs/v6/ASSET_LOG.md` that the other stories add to.
  - Attach the approved v5 renders as style seeds so new art matches (`docs/playbook/ART.md`,
    `PROMPTS_ART.md`). Landing art may be more cinematic than menu art, but must stay recognisably
    the same world and palette. Game-world sprites stay **pixel art**.
  - Check every generated image against the real game before saving it, and regenerate if needed.
  - Save the prompt for each asset in `docs/v6/ASSET_LOG.md`.
  - If Gemini hits a limit or Chrome is unreachable, log it, carry on with code-drawn or placeholder
    art, and come back later.
- **Gameplay video:** a `video` agent records clips from the real game with Playwright's video
  recording (scripted battles, war map, duels, forge) at landing-friendly sizes, then encodes them
  (ffmpeg if available; otherwise log an owner action) to small webm + mp4 with posters. Log every
  clip and how it was recorded in `docs/v6/ASSET_LOG.md`.
- **Verification:** use Playwright MCP against `npm run dev` / `npm run preview` (and the landing
  page's own preview).
  - Before marking any story done, take screenshots across the screen matrix and look at them. For
    input and controls, also play the feature through in the browser with mouse and keyboard and
    with touch emulation.
  - Gates (run all of them, just as CI does): `npx tsc --noEmit`, `npx vitest run`,
    `npx vite build`, the server tests, `node scripts/layout-check.mjs http://localhost:4173/` across
    the whole matrix, the smoke scripts in `scripts/*.mjs`, and, for the landing page, its build plus
    a Lighthouse run against the budget.

## Phases

0. **Setup (first tick only).**
   - Create the `v6` branch from `main` and `docs/v6/` (PROGRESS, DECISIONS, SKILLS_LOG,
     ASSET_LOG, OWNER_ACTIONS, PROPOSALS, plan/, qa/).
   - Run `/adopt` and `/project-stage-detect` with rigor "standard" and automation "autonomous".
1. **Audit.**
   - Screenshot every scene plus `?scene=Kit` across the new screen matrix, and record which
     screens break or waste space in landscape and on tablets.
   - List every place the code touches Telegram directly (the future adapter boundary).
   - Map the server: routes, auth, D1 schema, and what public stats data exists.
   - Review hosting: `wrangler.jsonc`, `deploy.yml`, bot links, `docs/OPS.md`.
   - Write `docs/v6/AUDIT.md`.
2. **Direction and architecture.**
   - ADRs: the platform layer, hosting for pixelarrow.app and play.pixelarrow.app, auth and
     sessions, account linking, the public stats API, and the landing tech stack and performance
     budget.
   - GDD or UX specs: landscape layout rules per screen family (`/ux-design`), the input scheme and
     default hotkeys, and the account and linking flows.
   - Landing direction: an art bible addendum (`/art-bible`), a page structure and copy outline,
     and 2 or 3 Gemini mockup directions. Pick one with `/ux-review` and log why.
3. **Plan.** Run `/create-epics`, `/create-stories` and `/sprint-plan`. Foundation first. Assign
   skills and agents to each story using the table above.
4. **Foundation.**
   - The platform layer with Telegram and web adapters, with game code moved onto the interfaces.
   - Responsive layout primitives in the component kit for landscape and tablet, rendered in
     `?scene=Kit` at every size.
   - The input layer: mouse, keyboard, focus navigation, rebinding storage.
   - The layout-check matrix and the gates extended.
   - The hosting split and the build for both sites.
5. **Assets.** Landing key art and parallax layers through Gemini plus `create-game-assets`;
   gameplay clips through the `video` agent; Open Graph images and the favicon set.
6. **Build, in parallel sprints (at most 4 subagents at a time).**
   - Every game screen re-laid out for landscape and tablet, in this order: hubs, first run and
     tutorial, army and hero, battle HUD and results, settlements and world, duels and war, shop
     and market, codex, the remaining dialogs.
   - Hover states, hotkeys and the rebinding screen in Settings; the tutorial mentions keyboard
     controls on keyboard devices.
   - Accounts, verification, reset, Turnstile, rate limits, linked accounts, the payments
     interface and web placeholder, the privacy notice and account deletion.
   - The public stats API and the landing page, section by section.
7. **Feel.** Use `game-feel`, `/team-polish` and `audio-design`: landing motion and parallax tuned
   for smoothness, game hover and focus feedback, and transitions in landscape.
8. **Final QA.**
   - Run `/qa-plan`, `/team-qa` and `/regression-suite`, then full playthroughs on a phone in
     Telegram emulation, a tablet, and a laptop with mouse and keyboard, plus the sign-up, link,
     reset and delete flows end to end locally.
   - Run Lighthouse on the landing page and `/perf-profile` on the game.
   - Run `/code-review` on the whole branch, then `/simplify` and `/security-audit`. Fix the findings.
   - Run `/release-checklist`, `/gate-check` and `/milestone-review`.
   - Update `docs/playbook/` with every new prompt, template and lesson from this run.
   - Write `docs/v6/REPORT.md`: before and after screenshots per device, the landing page, the
     architecture, a summary of the skills log, open issues, proposals, and the full
     `OWNER_ACTIONS.md` checklist to go live (DNS, routes, secrets, Turnstile, email service, the
     BotFather URL, the deploy order).

## Each loop tick

1. Read `PROGRESS.md`, along with `git log --oneline -20` on `v6`.
2. Collect the results of subagents that have finished. Review each against the constraints, its
   "Skills applied" section, and 2 or 3 screenshots you open yourself. Hand good work to an
   `integrator` agent to merge into `v6` and run the gates. Send weak work, or work that skipped its
   skills, back with specific feedback.
3. Start the next batch of independent stories, at most 4 parallel subagents. Each prompt carries
   its skill and agent paths.
4. Update `PROGRESS.md` and `SKILLS_LOG.md`: the phase, stories with status and skills, blockers,
   and the time of the next tick.
5. Schedule the next wakeup as a 1200–1800 s heartbeat: agent notifications are what actually wake
   you. If nothing is running and nothing is ready, stop and explain why in `PROGRESS.md`.

**Done** means:
- Phase 8 is complete and every gate is green.
- Every game screen is verified across the whole screen matrix, with mouse, keyboard and touch.
- The landing page is built, verified at every width, and within its Lighthouse budget.
- Accounts, linking, payments interface, Turnstile, privacy and deletion work end to end locally,
  with tests and a security audit.
- `REPORT.md` and `OWNER_ACTIONS.md` are written.

Then end the loop.
