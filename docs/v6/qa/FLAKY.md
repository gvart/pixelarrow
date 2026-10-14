# Flaky browser checks (v6)

A flaky check passes and fails with no code change between runs. Nothing here is hidden with retries:
the smokes and `npm run regression` run each script once per platform mode and report every result
(V6-GATE-02). Add a row whenever a check fails and then passes on a re-run. Record every run, the cause
class (`/test-flakiness`: timing/async, order, seed, leak, external state, float, load race) and the fix.
With fewer than 3 runs a case is only **suspected**.

## Open

### F2 · `server/test/public-api.test.ts` "a 304 and a HEAD run the same single SELECT; 405, 404 and 429 run none" (suspected, cause not yet classified)

- **Seen:** failed once under parallel load (reported with GATE-01b, V6-057), and passes on a re-run with no code change. One failure, so **suspected** until it is seen again or the cause is found.
- **Cause:** not yet found. Likely timing/async or load race (the test counts D1 SELECTs per request; under load a cache or rate-limit window may differ).
- **Fix:** none yet. Record each further run here.

### F3 · `scripts/audio-smoke.mjs` in web mode, the Web Audio juice-tier sounds (thud, splinter) (suspected, cause not yet classified)

- **Seen:** failed once on the juice-tier sounds (thud, splinter) during the RFND-04 integration, then passed on 2 web-only reruns with no code change. One failure, so **suspected** until it is seen again or the cause is found.
- **Cause:** not yet found. Likely timing/async (`audio-smoke.mjs` still waits on fixed timers, see the watch list).
- **Fix:** none yet. Record each further run here.
- **Recurred:** failed once more on web during the INP-03 integration (load average ≈ 20). Still **suspected**, now suspected load-sensitive; see F4 for the hardening story.

### F4 · `scripts/smoke.mjs` in Telegram mode, "tap on the map plans a route" and "party marched" (suspected, load-sensitive)

- **Seen:** both failed once during the INP-03 integration with the machine heavily loaded (load average ≈ 20), then passed 3 reruns with no code change. One failure, so **suspected**.
- **Cause:** suspected load-sensitive (timing/async): the steps still lean on time-based waits that run out when frames are slow.
- **Fix:** none yet. A QA hardening story should replace the remaining time-based waits in `smoke.mjs` and `audio-smoke.mjs` with state waits (`settled()` in `scripts/lib/harness.mjs`). Record each further run here.
- **Recurred:** failed once more during V6-067's integration (FIX-KIT-WIDE, full matrix). Still **suspected**, load-sensitive.

### F5 · layout check `battle-menu-locked|text-overlap|battle.menu.note|СОШЛ…@844x390`, ru-tg (suspected, timing)

- **Seen:** failed once in the full layout matrix during V6-067's integration (FIX-KIT-WIDE), then passed 2 standalone reruns with no code change. One failure, so **suspected**.
- **Cause:** suspected timing/async: the check measured a text that had not yet settled (wrapped or faded in).
- **Fix:** none yet. Record each further run here.

## Fixed

### F1 · `scripts/smoke.mjs` "entered the village" (timing/async, fixed in V6-GATE-02)

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

## Not flaky, but seen while adding the modes (for the record)

- `smoke.mjs` and `audio-smoke.mjs` in Telegram mode failed "no console errors" every time they ran before the fix (smoke: 1 run; audio: all 3 of its contexts).
  The fake WebApp signs the online layer in, and the preview server's `/api` proxy answered 502. This was
  deterministic, not flaky. Both now stub the API as down (503), as the other smokes do.
- `online-smoke.mjs` in web mode: the shop never leaves "Opening the shop..." while signed out. This is a
  game bug that reproduced every time, not a flake: **GATE02-B1**, now fixed (see `tests/regression/SUITE.md`).

## Watch list (fixed sleeps still in place, not yet seen to flake)

`online-smoke.mjs` (`waitForTimeout(3000)` after load, 600-1500 ms waits between scenes),
`audio-smoke.mjs` (`wait(2500)` after load) and `fullscreen-smoke.mjs` (Telegram mode, 300-900 ms waits)
still wait on timers. If one of them flakes, replace the sleep with a state wait
(`settled()` in `scripts/lib/harness.mjs`) and add a row above.
