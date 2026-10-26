# Lessons

The rules that cost the most to learn, one or two lines each, with the decision id or commit where it happened.

## Running many agents on one machine

- **Disk guard.** ENOSPC at about 0.7 GB free broke gates: symlink `node_modules` (root and `server/`) instead of
  `npm ci`, run layout-check with `--no-shots` (v5; that check is gone), `rm -rf dist shots` after gates, remove merged worktrees at once;
  pause new code agents under 2 GB free (V5-057, V5-058).
- **Load guard.** At load 27–50 everything was slow and flaky (layout check about 50 min, `npm run balance -- 400`
  74 min): at most 3 code agents plus 1 integrator; never run the long live checks together (v5: layout-check, regression, online-e2e; all
  three are gone, gameplay logic is now tested in fast seeded vitest scenarios).
- **Stale servers.** Finished agents left 15 vite/vitest processes and a foreign vite held 5173: every agent uses
  its own port and stops only the servers it started.
- **Serve gates with `vite preview`.** With a symlinked `node_modules` the dev server returns 403 for the bundled
  fonts and text renders in a fallback face.
- **Worktrees can branch from `main`.** Every prompt starts with
  `git merge-base --is-ancestor {MAIN} HEAD || git reset --hard {MAIN}`.
- **Crash recovery.** State lives in files (PROGRESS.md, DECISIONS.md, `git log`), never in a session's context.
  Before every tick ends PROGRESS.md names running agents, branches, the queue and the next step
  ([director-brief.md](director-brief.md) "Keeping the main context clean").
- **Never disable hooks** (`core.hooksPath`, `--no-verify`), even for an urgent merge.
- **`.claude/` is untracked** (V5-002): skills and agents are found by absolute path; moving it breaks every prompt.

## Flakes: find the root cause

- **A flake can be a real game bug.** "battle-kinds fails at the report under load" was a freeze: a hit-stop pose
  kept a frame the atlas sweep had dropped, so render threw every frame (f9063cd).
- **No fixed waits.** Wait on `settled()` scenes and `steadyBtn` (two equal reads two frames apart, inside the
  list's window) in `scripts/regression/lib.mjs`; a fixed 5 s wait flaked 2 of 3 (1857f4f, 60696ff).
- **Below 5 fps Phaser's game clock slows down** (`TimeStep.smoothDelta` hands 16.7 ms a frame), so a game-time
  wait can be minutes of wall time: wait on the game's own clock or run the test on real frame time
  ([FLAKY.md](../FLAKY.md) F6).
- **Tap where the game resolves taps.** Pick points from the scene's own hit state and tap in the page; a raw CDP
  touch read as a long press (f19f50d).
- **Load the page once in a test context.** Load, clear storage, reload raced the first save write (7c44902).
- **Make smoke worlds deterministic** and name every check so a failure says which one (V5-062, f8401ef).
- **Wall-clock windows race under load** (Miniflare's rate limiter, one-minute windows): start with enough window
  left or stub a refusing limiter (FLAKY F2).
- **Don't raise timeouts to hide load**; report both runs of a check that fails under load and passes alone, and
  hand it to a fixer (V5-053).

## Taps and controls

- **A refactor dropped a hit box.** F-07 kept `setSize` and dropped `setInteractive`: every switch drew and none
  took a tap; layout checks can't see it. v5 gave every control type a tap check in `scripts/regression/controls.mjs`
  (7575ce6, 96baec0; removed with the campaign).
- **The entry fade ate taps** while a container was at alpha 0; FL-02 fixed the game and `hub-flows.mjs` taps on
  the first frame of the fade (V5-067, 38a3aa9).
- **ScrollArea hit-clip.** Masked rows below the viewport stayed interactive under the tab bar and won every tab
  tap; the mask and tap window now follow the parent's world position (5af02ba).
- **Overlapping tap radii:** tapping a soldier beats the facing knob (V5-023, V5-034).

## Text and fonts

- **No NBSP.** The bitmap fonts have no U+00A0; "12 450" drew as "12450". Use a plain space (`src/i18n/numbers.ts`).
- **Only characters in `UI_CHARS` exist** (`src/art/fontMetrics.ts`); anything else draws as nothing. Check new
  symbols in a screenshot at 320.
- **Mixed-case Cinzel split words** ("Strat egos") in the bitmap path until F-01 fixed the atlas (V5-046, 51d6973).
- **Russian:** spaces between thousands, a decimal comma, names through `heroName` and places through `placeName`;
  test at 320 in ru from the start.
- **A label keeps its name at every width**; on 274 px inactive tabs go icon-only with a long-press tip (V5-063, V5-068).

## Design, balance and content

- **Ship the UI that closes a state before the engine that opens it** (V5-064, V5-070: the deck behind a flag).
- **A balance miss gets an owner**, a number and a decision, closed by a later story (V5-037, V5-069, V5-073).
- **Re-measure the ladder after any sim change** with `npm run balance:ladder` (V5-052).
- **Measure before an engine upgrade.** Phaser 4 opened the first sheet 1.43× slower on low-end renderers; stayed
  on 3.90 (V5-025, V5-028, ADR-0003).
- **No dead controls.** Settings shows only toggles the code honours; a card never sells a missing feature (V5-072).
- **Compatibility you don't need is cost.** With no users the frozen v1 sim, version floors and migrations went
  (−11.5k lines). Recheck once there are players (V5-074).

## Art

- **Mockups invent features** (a "Quests" tile): prompts are allowlists and renders are checked tile by tile
  ([ART.md](ART.md) §3).
- **Gemini letters shields and frames banners** unless told by name ("plain bronze shields, NO lambda", "no frame,
  full-bleed").
- **Gemini can't hold a pixel grid** (it overshot cell counts 1.4–2.6x); tiny sprites are drawn in code (V5-066).
  Soldier sprites come from PixelLab instead ([PROMPTS_ART.md](PROMPTS_ART.md) §13).
- **The kit beats the art bible** when they disagree: the busts match the battle sprites (V5-050).
- **Dark-outlined icons vanish on dark stone**; the chrome gives them a light ground.
- **Chrome may block repeated downloads** from one site: log it and ask the owner; never change browser settings.
- **Generating is not shipping.** Assets stay staged until the story that wires their slot previews and promotes them.
- **Anything that could pass for gameplay is rendered by the game**, not generated (the landing diorama).
