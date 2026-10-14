# Flaky browser checks (v6)

A flaky check passes and fails with no code change between runs. Nothing here is hidden with retries:
the smokes and `npm run regression` run each script once per platform mode and report every result
(V6-GATE-02). Add a row whenever a check fails and then passes on a re-run. Record every run, the cause
class (`/test-flakiness`: timing/async, order, seed, leak, external state, float, load race) and the fix.
With fewer than 3 runs a case is only **suspected**.

## Open

F1-F4 are resolved (QA-HARDEN, 2026-10-14); a new flake gets a row here.

### F5 · layout check `battle-menu-locked|text-overlap|battle.menu.note|СОШЛ…@844x390`, ru-tg (suspected, timing)

- **Seen:** failed once in the full layout matrix during V6-067's integration (FIX-KIT-WIDE), then passed 2 standalone reruns with no code change. One failure, so **suspected**.
- **Cause:** suspected timing/async: the check measured a text that had not yet settled (wrapped or faded in).
- **Fix:** none yet. Record each further run here.
- **V6-RSCR-02 (2026-10-14):** seen again as a once-only finding (`battle.banner.contact|battle.menu.note`) in 3-4 configs at 844x390 in each of two full `battle*,results*,tutorial*` matrices; the check's own second run cleared it every time ("Seen once ... ignored"), so neither run failed.
- **PARITY-STABLE (2026-10-14):** in 4 full `world*,camp*,battle*,results*` matrices (load average 40-120) it was found in 2-4 of the four 844x390 configs every time (en-plain, en-tg, ru-plain, ru-tg) and cleared by the check's second run 3 times; in the 4th (load ≈ 120, the run later stopped) it counted as new. Not an element-parity case; still open.

### F6 · `tutorial-smoke` web, `duel-smoke` Telegram and `duel-smoke` web (suspected, load timeouts)

- **Seen:** all three timed out once at load average ≈ 42 during the RSCR-01 + INP-05 integration, then passed on the first rerun with no code change. One failure each, so **suspected**.
- **Cause:** suspected load timeouts (timing/async): the runner's per-script timeout ran out while frames were slow.
- **Fix:** none yet. The next QA pass checks whether the smoke runner's per-script timeouts should scale with CPU load, or whether these scripts still have fixed waits. Record each further run here.
- **V6-RSCR-02 (2026-10-14):** `duel-smoke` Telegram failed "[ladder] deselecting in battle keeps the game running" once in `regression --all` while a full layout matrix ran beside it (it reads `loop.frame` 600 ms apart); web passed. A rerun of `--only duel-smoke,battle-kinds` with nothing else running passed both modes.

### F7 · vitest `qafixWorld.test.ts` S4 "the tap area is what is drawn on the settlement" (suspected, load timeout)

- **Seen:** timed out at 30 s twice in the full `vitest run` during V6-RSCR-05 (two layout checks from other agents were running on the machine), then passed standalone (14/14, the file takes 43 s). No World code changed in that story.
- **Cause:** suspected load timeout (timing/async): one test sweeps the settlement tap areas and runs close to the 30 s limit on a loaded CPU.
- **Fix:** none yet. Record each further run here.

### F11 · server vitest suite hangs at 0% CPU with no output (suspected, open handle)

- **Seen:** occasionally the server vitest suite hangs at 0% CPU (no output); seen in ACCT-07's agent run (killed after 40 min) and in the ACCT-06 integration (≈ 20 min); a rerun passes.
- **Cause:** suspected: a workerd/miniflare handle not closing.
- **Fix:** none yet. A QA pass should find which test file hangs (run with --reporter=verbose and a per-file timeout).

## Resolved

### F8 · layout check element parity on real-time scenes (timing/async + random seed, fixed in PARITY-STABLE)

- **Seen:** element-parity findings that a rerun clears, on scenes that run live: the world-encounter ids during V6-074's integration (RSCR-07); `results.loot15`–`17` at 320x693 and 360x780, and `battle.undo` (shown only for 3 s after an order) during V6-RSCR-02.
- **Cause:** a tooling gap (timing/async plus seed): each size stages its own live scene, so parity compared different moments of different runs. Three sources: (1) what earlier screens left behind (the campaign, its rng, the world's clock and parties) differed per size; (2) chips that show for a few seconds by design (`battle.undo`, `battle.then`); (3) staging that waited on the clock: the Spoils cards turn one every 0.35 s, and `world-encounter` rested until a band walked over, with `until()` giving up silently after 6 s (at load ≈ 120 it flagged `encounter.attack`, `.flee`, `.doctrine.info` and `.sheet.close` at 9 en configs in PARITY-STABLE's first run).
- **Fix (PARITY-STABLE, V6-076):** `restoreStage` reloads the staged campaign and reseeds `Math.random` and `crypto` from the screen id before every screen; `uiTransient(scene, id, when)` in `src/ui/layout.ts` registers ids transient by design (BattleScene: Undo and Then… while fighting) and `checkParity` leaves them out (still checked for overlap and size); `results-spoils` waits until the last card has turned; `world-encounter` opens the sheet with `openEncounter` and fails the screen if it doesn't open. Tests: `tests/parityStable.test.ts` (8).
- **Evidence:** 3 consecutive full runs of `layout-check --scenes 'world*,camp*,battle*,results*'` (28 configs x 40 screens: 10 sizes, en and ru, plain and tg) at load average 40-70 after the fix: all PASSED, **0 element-parity findings** in each. `found.json` of runs 1 and 3 is byte-identical; run 2 differs only in which 844x390 configs caught F5 (text-overlap, not parity). The 16 violations once logged at en plain 360x780 (run before the fix, the run crashed before its summary, so their ids are lost) did not recur in 4 later full runs (plus a partial one) nor a standalone 360x780 probe; they were counted before parity is added, so they were not element-parity; recorded as a one-off (suspected timing at load).

### F10 · `scripts/online-e2e.mjs`: A's "reload" before recruiting, the Hire tap, the lockstep tick wait (timing/async, fixed in FIX-E2E)

- **Seen:** "Execution context was destroyed" at the recruit step in 4 of 24 runs; "recruited a hero" failed in 2 of
  24, then 3 of 14 more; "both clients advance in lockstep" once in 4 at load ≈ 85. Not in CI (the script needs a
  local Worker with DEV_AUTH; proposal in `E2E_CI.md`).
- **Cause:** test only, no navigation and no game bug. The "reload" was a same-document page (Playwright reports any
  protocol error on an evaluate as a destroyed context) at the one evaluate that returned Phaser's ScenePlugin, a
  3-9 s serialization; not reproduced in 14 later runs, so the exact error is unknown. The Hire tap came at a fixed
  400 ms, and the 4 s undo window is game time (frames capped at 200 ms), 20 s at 1 fps. The tick wait had a 30 s cap.
- **Fix:** `void` the evaluate; Hire by layout id until the scene holds the hire, then wait for it to be sent and for
  the profile; 90 s caps on the duel waits. Then 10/10 runs in a row passed (load 54-88), plus 2 with the committed
  script. Details: `E2E_CI.md` "Stability evidence".

### F4 · `scripts/smoke.mjs` in Telegram mode, "tap on the map plans a route" and "party marched" (timing/async + missed event, fixed in QA-HARDEN)

- **Seen:** both failed once during the INP-03 integration (load average ≈ 20; `v6-shots/integrator-inp-03/regression.log`:
  the party stayed at 89.5,73.5, so the tap was dropped, not slow), then passed 3 reruns.
- **Cause:** the step tapped the map without waiting until it takes taps, and judged the tap by polling the route.
  `WorldScene` drops a ground tap while a "We found X" cut runs (`cine`), while a card, encounter, sheet or coach
  mark is open, while another pointer is down (it reads a pinch), and over any interactive object (`onDown`'s
  `over`; the target filter only kept 90/120 CSS px clear of the bars, and the top HUD reaches lower on some
  maps and modes). The route poll could also miss a short march planned and walked between two polls.
- **Fix:** `mapReady()` waits for the map to take taps (World in, two game frames since, no discovery, cut, card,
  encounter, sheet or coach mark, camera pan and fade over, no pointer down); the target must have nothing
  interactive over it (`mapPointFree`, the same hit test as `onDown`); the World's planned routes are counted
  (`window.__routes`), so "tap on the map plans a route" is an event, not a poll. A dropped tap now fails by name
  with the map's state at the tap and after (`worldDiag`).
- **Recurred (before the fix):** failed once more during V6-067's integration (FIX-KIT-WIDE, full matrix).
- **Evidence:** see F1 (same script, same series).

### F3 · `scripts/audio-smoke.mjs` in web mode, "juice tiers sound" (timing/async, fixed in QA-HARDEN)

- **Seen:** failed during the RFND-04 and INP-03 integrations, then passed reruns. The logs
  (`v6-shots/integrator-rfnd-04/regression.log`, `integrator-inp-03/regression.log`) show **all five** tiers
  missing (thud, splinter, standardFall, groan, hornChord), not only thud and splinter as first recorded here.
- **Cause:** the step unpaused the live fight in one `evaluate`, then fed the tiers in the next. Under load the frames
  in between ran the sim into its first enemy contact, which auto-pauses once (QA-03 S3-9, `firstContact`), and the
  audio pause gate refuses every field sound (`AudioEngine.play`: `bus !== 'ui' && paused`), so all five were
  gated together. The duck check after it read -7 dB (the battle-start horn), not the army-break chord's -10 dB.
  The rest of the script slept on timers (2.5 s after load, 150-3000 ms around async `resume()`/`suspend()`,
  gain ramps on the audio clock, sheets sliding in, a save before a reload).
- **Fix:** the field is held paused until every earlier voice has ended and a tier gap (300 ms of game time) has
  passed (a named check); then one `evaluate` resumes, feeds the tiers and pauses again, so no frame of the fight
  runs between. Every other fixed sleep is a state wait: the context state, the gain values, steady buttons
  (`steady()`), `settled()` scenes, `GameState.saving` before the reload, and one page load instead of
  load-clear-reload (the race smoke.mjs already fixed). No `wait()` is left in the script.
- **Evidence (6 busy loops (`node -e "while(true){}"`) on a 10-core Mac already loaded by other agents, the three series running side by side (load average 31-116); preview on 127.0.0.1:6170; logs in the QA-HARDEN scratchpad (`qa-harden/{smoke-final,audio-load,f2-load}-N.log`)):** `node scripts/audio-smoke.mjs <url> --platform both`, 10 runs in a row: **10/10 PASS**,
  "juice tiers sound" passing 20/20 (10 Telegram, 10 web); no fail.

### F2 · `server/test/public-api.test.ts` "a 304 and a HEAD run the same single SELECT; 405, 404 and 429 run none" (load race on a wall-clock window, fixed in QA-HARDEN)

- **Seen:** failed once under parallel load (GATE-01b, V6-057), then passed.
- **Cause:** the test spent a real RL_PUBLIC_IP bucket with 60 calls and expected the 61st to be refused. Miniflare's
  rate limiter counts in 60 s windows aligned to the wall clock (`epoch = floor(now / 60 s)` in
  `miniflare/.../ratelimit-object.worker.js`), so every bucket empties at the top of each minute. Under parallel load
  the 61 calls took long enough to straddle a minute; the 61st was a 200 and ran the SELECT. Reproduced on purpose:
  the same 61 calls started 0.3 s before a minute boundary gave a 200 for the 61st (a scratch test, not committed).
- **Fix:** the single-SELECT test takes its 429 from a limiter that refuses (it tests what runs on a refusal; the
  limiter's count has its own tests). The two limiter tests (61st call is 429, cf-connecting-ip only) start with at
  least 30 s of window left (`freshWindow()` waits for the next window otherwise), so their calls cannot straddle
  a rollover.
- **Evidence (6 busy loops (`node -e "while(true){}"`) on a 10-core Mac already loaded by other agents, the three series running side by side (load average 31-116); preview on 127.0.0.1:6170; logs in the QA-HARDEN scratchpad (`qa-harden/{smoke-final,audio-load,f2-load}-N.log`)):** `npx vitest run test/public-api.test.ts`, 10 runs in a row: **10/10 PASS** (25/25 each).
  The full server suite under the same load: 58 files, 557/557 PASS.

### F1 · `scripts/smoke.mjs` "entered the village" (timing/async in V6-GATE-02; seed-dependent staging, resolved in QA-HARDEN)

- **Seen:** PLAT-02 saw it fail once and pass on a re-run (one failure in two runs, so suspected until the cause was found).
- **Cause:** a wait on a timer instead of on state. The step reveals the village (`World.reveal` queues a
  discovery), sleeps 200 ms, waits for `!WorldScene.cine`, sleeps 300 ms, then reads the village's screen
  point and taps it. `WorldScene.update` drains the discovery on its **next frame** and only then starts the
  "We found X" camera cut (`cine = true`, a 900 ms pan there and a 700 ms pan back). On a loaded machine
  (software WebGL at a few frames a second) no frame ran within the 200 ms, so `!cine` held at once. The cut
  then started after the point was read: the tap landed during the cut (`tapWorld` ignores taps while
  `cine`) or at a spot the camera had panned away from, and the 30 s wait for the Settlement scene ran out.
- **Fix:** wait on the state. At least two game frames have run since the staging (`game.loop.frame`), no
  discovery is queued (`w.discoveries`, `panQueue`), no cut is running (`cine`), and the camera's pan effect
  is over. This is a named check (`the village cut is over, the camera still`), so a stall names itself.
  The fixed sleeps around the Army's back and the village's Leave became state waits too (Army active,
  Settlement active with its entry slide done).
- **Evidence (2026-10-13, preview on 127.0.0.1:6150, the full regression suite running beside it):**
  `node scripts/smoke.mjs <url> --platform both`, run 5 times in a row: 5/5 PASS in Telegram mode and 5/5
  in web mode, with "entered the village" passing all 10 times (logs `smoke-loop-1..5.log` in
  `.claude/worktrees/v6-shots/gate-02/`). Also PASS in the first run of both modes and in the
  `regression --all` run, so 12 of 12 passes in total.
- **Recurred:** failed once on web during the INP-03 integration under heavy load (load average ≈ 20), then passed on rerun. GATE-02's fix is not fully robust under heavy load; see F4 for the hardening story.
- **Resolved (QA-HARDEN, 2026-10-14):** the 10x series below caught the real cause on one Telegram run: the
  new guard "nothing over the village" failed. The staging took the **first** village in the list; on that map it
  stood on the map's top row (party at 36.5,4.5), where the camera stops at its bounds instead of centring it, so
  the village lay under the top HUD and the tap pressed a HUD control (game time ran on for 290 hours with no
  route). This is a seed-dependent staging miss (one map in many), which is why it looked rare and load-linked.
  The staging now takes the village nearest the map's centre; the tap waits for `mapReady()` (which covers
  GATE-02's cut wait and also cards, sheets, a pointer still down and the camera's fade), checks nothing is over
  the village (naming what is, when something is), and "the tap sets out for the village" is a named check on
  the World's planned routes. The remaining fixed sleeps in smoke.mjs are state waits (battle camera still,
  entry slide in, steady buttons, 20 battle ticks before the error check); only the 16 ms pacing between the
  moves of a two-finger gesture is left.
- **Evidence (6 busy loops (`node -e "while(true){}"`) on a 10-core Mac already loaded by other agents, the three series running side by side (load average 31-116); preview on 127.0.0.1:6170; logs in the QA-HARDEN scratchpad (`qa-harden/{smoke-final,audio-load,f2-load}-N.log`)):** `node scripts/smoke.mjs <url> --platform both` on the final code, 10 runs in a row:
  **10/10 PASS** (load average 31-75 during the series), with "tap on the map plans a route", "nothing over
  the village" and "entered the village" each passing 20/20 (10 Telegram, 10 web). Before the village fix, a 5-run series on the earlier hardening caught the failure above
  once (run 3, Telegram) and passed the other 9 mode runs.

## Not flaky, but seen while adding the modes (for the record)

- `smoke.mjs` and `audio-smoke.mjs` in Telegram mode failed "no console errors" every time they ran before the fix (smoke: 1 run; audio: all 3 of its contexts).
  The fake WebApp signs the online layer in, and the preview server's `/api` proxy answered 502. This was
  deterministic, not flaky. Both now stub the API as down (503), as the other smokes do.
- `online-smoke.mjs` in web mode: the shop never leaves "Opening the shop..." while signed out. This is a
  game bug that reproduced every time, not a flake: **GATE02-B1**, now fixed (see `tests/regression/SUITE.md`).

## Watch list (fixed sleeps still in place, not yet seen to flake)

`online-smoke.mjs` (`waitForTimeout(3000)` after load, 600-1500 ms waits between scenes) and
`fullscreen-smoke.mjs` (Telegram mode, 300-900 ms waits) still wait on timers (`audio-smoke.mjs` and
`smoke.mjs` no longer do, F3 and F1/F4). If one of them flakes, replace the sleep with a state wait
(`settled()`, `steady()` and `nextFrame()` in `scripts/lib/harness.mjs`, `untilInPage()` in
`scripts/lib/settle.mjs`) and add a row above.

### F9 (open, suspected) server auth.test.ts "rate-limits logins per IP (30 / 60 s)"

Got 200 instead of 429 once under load during the PAY-01 integration (V6-077), then passed 2 reruns. Likely the same Miniflare wall-clock rate-limit window issue fixed for F2 by QA-HARDEN: apply the same fix (a refusing-limiter stub, or start with ≥ 30 s of window left) in the next QA pass.
