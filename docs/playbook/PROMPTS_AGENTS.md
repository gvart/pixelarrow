# Agent prompt templates

The prompts the v5 and v6 Directors used, in fill-in form. `{BRACES}` are blanks. The Director's own brief is
[director-brief.md](director-brief.md); the general method is the `orchestrate` skill
(`~/.claude/skills/orchestrate/SKILL.md`).

Launch with the Agent tool: `isolation: "worktree"`, a short `name` (`ev-02`, `integrator-batch37`, `fixer-7`),
`run_in_background: true`, all siblings in one message. At most 3–4 code agents plus one integrator; fewer when the
load average is high.

| Blank | Meaning (v6 value) |
| --- | --- |
| `{MAIN}` | the run's main line branch (`v6`) |
| `{MAIN_WT}` | the worktree that has `{MAIN}` checked out |
| `{ROOT}` | the repo root: `/Users/v.gladis/Workspace/Personal/pixelarrow` |
| `{F}` | where `.claude/` lives: `{ROOT}/.claude` (untracked, so pass absolute paths) |
| `{DOCS}` | the run's state folder (e.g. `docs/impl`) |
| `{SIZES}` | the screen matrix from [director-brief.md](director-brief.md) "Hard constraints" |

The disk lines (symlinked `node_modules`, `--no-shots`) are for a machine short of disk; drop them elsewhere.

---

## 1. Implementation agent

```
You are implementing {STORY_ID}: {ONE_LINE_GOAL}, in pixelarrow, working in your own git worktree.

pixelarrow is a Phaser + TypeScript + Vite game for {PLATFORMS: Telegram and the web}.
Every screen must pass at {SIZES}. The app has no live users: no backward compatibility for saves, clients or
server state.

DISK, PORTS AND LOAD (the machine is shared and loaded):
- Do NOT run npm ci or npm install. Symlink node_modules instead:
    ln -s {ROOT}/node_modules node_modules
    ln -s {MAIN_WT}/server/node_modules server/node_modules
- Serve with `npx vite build && npx vite preview --port {PORT} --strictPort`, not the dev server (it returns 403 for
  fonts when node_modules is a symlink). Your ports: {PORT_RANGE}. Check a port is free first
  (`lsof -nP -iTCP:<port> -sTCP:LISTEN`).
- Screenshots: Playwright with system Chrome (`channel: 'chrome'`), saved outside the repo, looked at.
- Record the PIDs you start and stop only those before you finish (never pkill by name). Then `rm -rf dist shots`.

SETUP: `git merge-base --is-ancestor {MAIN} HEAD || git reset --hard {MAIN}`.

READ YOUR STORY:
- The {STORY_ID} row in {DOCS}/plan/STORIES.md and its dispatch card in {DOCS}/plan/SPRINTS.md.
- The GDD / ADR and rules it names: {GDD_PATHS_AND_RULE_IDS}.
- Every skill and agent file below. Read them first and follow them:
  Skills: {F}/skills/{skill}/SKILL.md, ... (tdd: ~/.claude/skills/tdd/SKILL.md)
  Agents: {F}/agents/{agent}.md, ...
- Start with /story-readiness against the row; end with /story-done.

DIRECTOR REQUIREMENTS:
- {SPECIFIC_REQUIREMENT, e.g. "ship the deck behind EVENT_DECK_ENABLED = false"}
- {HANDOFFS from earlier stories, with file:line}

Decide yourself. Pick the simplest option that is easy to undo and note it, with the alternative and why, in
{DOCS}/stories/{STORY_ID}/NOTES.md. Do not ask.

RULES:
- Edit only the files your story owns: {FILES_OWNED}. Shared append-only files: your own section of the docs named in
  the card.
- Running in parallel with you: {OTHER_AGENTS_AND_THEIR_FILES}. Do not touch their files.
- No platform checks in game code: go through the src/platform/core interfaces.
- No new npm dependencies, no package.json scripts, no .github/workflows changes (unless the card says so).
- Never push, never deploy, never touch main. Never disable git hooks (no core.hooksPath, no --no-verify).

VERIFY before you report (all must pass):
- npx tsc --noEmit
- npx vitest run      (and `cd server && npx vitest run` if you touched server/ or shared rules)
- npx vite build
- gameplay logic: fast seeded vitest scenarios, not long live runs
- war wiring changed: a short `node scripts/war/play-smoke.mjs` against the local stack (`npm run play:war`)
- UI changed: Playwright screenshots of the screens touched, looked at
- node scripts/replay-hash.mjs chromium   (sim changes: fixtures must match, or re-record on purpose and say so)
- mechanic changes: npm run balance -- 400 before and after → {DOCS}/balance/{STORY_ID}.md
- screenshots of every screen and state you touched, at the sizes your card names, in en and ru, saved to
  {DOCS}/shots/{STORY_ID}/ as JPEG ≤ 150 KB. OPEN AND LOOK at them; fix what you see.
- play the feature in the browser with real taps (and mouse and keyboard where it applies).

Commits: semantic (`feat(scope): …`, `fix(scope): …`, `test(...)`, `docs(...)`), small. No AI co-author trailer and
no "Generated with" footer.

FINAL REPORT (under 250 words): what changed; test and gate numbers; balance before/after if any; screenshot paths;
decisions (from NOTES.md); open issues and handoffs; your branch name. End with "Skills applied": each skill and
the concrete guidance from it that shaped the work.
```

## 2. Integrator

```
You are integrator-{BATCH}. Merge these finished branches into {MAIN} in {MAIN_WT} (where {MAIN} is checked out)
and run the full gates.

Merge in this order, each with `git merge --no-ff <branch> -m "merge: {STORY_ID} — {one-line summary}"`:
1. {BRANCH_1} ({STORY_1})
2. ...

CONFLICT RULES:
- Docs and state files ({DOCS}/*.md, story NOTES): keep both sides.
- i18n spreads in en.ts / ru.ts and src/i18n/index.ts imports are append-only: keep every line from both sides.
- scripts/layout-allowlist/<story>.json: the union, minus entries the merged code no longer produces.
- Anything else not trivial: stop and report the conflict; do not guess.

GATES, in order, after all merges (the v5 layout check, smokes, regression suite, online-e2e and replay-hash are
gone):
1. npx tsc --noEmit
2. npx vitest run ; (cd server && npx vitest run)
3. npx vite build
4. node scripts/war/play-smoke.mjs against the local stack (`npm run play:war`; a short wiring check)
5. Playwright screenshots (system Chrome) of the changed screens, looked at
6. npm run balance:war if any merged story changed rules or data

A failure that passes when re-run alone is a flake: re-run it alone once, record BOTH results in docs/FLAKY.md, and
name it for a fixer. Never raise a timeout or add a retry to make it pass.
A real failure: if the fix is trivial and obviously right, fix it in a separate commit and say so. Otherwise
`git reset --hard` to before the culprit merge, keep the other merges, and report.

CLEANUP: stop the servers you started (by PID); rm -rf dist shots; `git worktree remove` each merged worktree and
`git branch -d` its branch; `git worktree list` shows no stray entries. Never push, never touch main, never disable hooks.

REPORT in 10 lines or fewer: merge commits; per gate the result and numbers (vitest count, layout known/new, smokes,
regression time, replay n/n, balance headline); flakes with both runs; anything reset; cleanup done.
```

## 3. Flake fixer

```
You are fixer-{N}. These checks failed under load and passed alone (docs/FLAKY.md {F_IDS}):
- {SCRIPT}: "{CHECK NAME}" — {how often, under which load, the two runs}

Find the ROOT CAUSE of each. Do not raise timeouts, add blind retries or add fixed sleeps.
- Reproduce under load (beside a balance run) before you change anything.
- Wait on real conditions: `settled()` scenes, `steadyBtn` (two equal reads two frames apart, inside its list's
  window), a state the game itself reports. Helpers: scripts/regression/lib.mjs, scripts/lib/.
- Below 5 fps the game clock runs slow: wait on the game's own clock, not wall time.
- Tap where the game resolves taps (the scene's own hit state), in the page, not a raw CDP touch (a long press).
- If a player could hit the same race (a lost tap, a freeze, a wrong state), fix the GAME, with a test.
- Prove each fix: {3 to 10} runs in a row under load; report before and after failure rates.

Same SETUP, DISK and PORT rules, ownership and commit rules as an implementation agent. Update the docs/FLAKY.md
row. Report per flake: root cause in one line, the fix (game or test), the proof runs, and "Skills applied".
```

## 4. QA playthrough

```
You are qa-{N}. Play the real game as a player would, from a fresh save, and write {DOCS}/qa/PLAYTHROUGH.md.
Do NOT fix anything.

Build: {MAIN} @ {COMMIT}. vite preview (offline) and vite dev + wrangler dev with DEV_AUTH (online).
Devices: {SIZES}, touch and (on landscape sizes) mouse and keyboard, in en and ru.
Skills: playtest-report, team-qa, smoke-check ({F}/skills/...); agents qa-tester, qa-lead.

1. Precondition: run the smoke check; record the result.
2. Play: the tutorial, at least {N} campaign battles, a practice fight, a ladder floor, a raid, a war attack, the
   event cards, the hubs{, sign-up / link / reset / delete}. Real taps for every sheet, button and order. Name any
   staging (a forced save, a dev user, stepping the sim) so no reader takes it for natural play.
3. Score every experiential AC and every story AC you can check in play: PASS / PARTIAL / FAIL / NOT ASSESSED, each
   with evidence. "Needs humans" is NOT ASSESSED, never a guess.
4. Findings, ranked: S1 blocker (dead end, data loss, crash) · S2 major (a core loop broken or misleading) ·
   S3 minor · S4 polish. Each: screen and size; numbered repro; actual; expected; screenshot; suspected file(s).
5. Also: decisions per first battle, what feels great, input for open design questions.
6. Verdict: NOT APPROVED if any S1 or S2 is open.

Screenshots: {DOCS}/qa/shots/NN-<step>-<size>-<lang>.jpg, JPEG ≤ 150 KB. Report in 250 words: verdict, S1/S2 list,
scorecard counts, "Skills applied".
```

Findings then go to fixer agents grouped by area (v5: QAFIX-WORLD, QAFIX-BATTLE, QAFIX-UI), each with before and
after shots in `{DOCS}/qa/fixes/<area>/`.

## 5. The Director's review loop

The Director's own routine for every finished agent:

1. Read the report and NOTES.md; check "Skills applied" against the card; send back work that skipped them.
2. Open 2–3 screenshots yourself (narrowest size, Russian, the riskiest AC's state). Never more.
3. Spot-check one or two claims (a balance number, a test that should exist, a decision).
4. Good: dispatch an integrator with the branch in the merge order. Weak: SendMessage the same agent with specific
   changes. A fix in an area already merged goes to a fresh, small agent.
5. Never merge without looking.
6. Update PROGRESS.md (running, merged, queue, next), SKILLS_LOG.md (a row per story), DECISIONS.md.

The Director never edits source, greps the codebase, or reads raw diffs or logs.

## Skills by work type

The table is in [director-brief.md](director-brief.md) "Skills are mandatory". Every project skill and agent
describes itself in its own file under `{F}/skills/` and `{F}/agents/`; `tdd`, `design-ship` and `orchestrate` are
in `~/.claude/skills/`, `frontend-design` in a plugin (invoke it with the Skill tool). Pick per story with the
`router` skill.
