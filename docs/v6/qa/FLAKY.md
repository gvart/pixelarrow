# Flaky browser checks (v6)

A flaky check passes and fails with no code change between runs. Nothing here is hidden with retries:
the smokes and `npm run regression` run each script once per platform mode and report every result
(V6-GATE-02). Add a row whenever a check fails and then passes on a re-run. Record every run, the cause
class (`/test-flakiness`: timing/async, order, seed, leak, external state, float, load race) and the fix.
With fewer than 3 runs a case is only **suspected**.

## Open

None.

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

## Not flaky, but seen while adding the modes (for the record)

- `smoke.mjs` and `audio-smoke.mjs` in Telegram mode failed "no console errors" every time they ran before the fix (smoke: 1 run; audio: all 3 of its contexts).
  The fake WebApp signs the online layer in, and the preview server's `/api` proxy answered 502. This was
  deterministic, not flaky. Both now stub the API as down (503), as the other smokes do.
- `online-smoke.mjs` in web mode: the shop never leaves "Opening the shop..." while signed out. This is a
  game bug that reproduces every time, not a flake: KNOWN **GATE02-B1** in `tests/regression/SUITE.md`.

## Watch list (fixed sleeps still in place, not yet seen to flake)

`online-smoke.mjs` (`waitForTimeout(3000)` after load, 600-1500 ms waits between scenes),
`audio-smoke.mjs` (`wait(2500)` after load) and `fullscreen-smoke.mjs` (Telegram mode, 300-900 ms waits)
still wait on timers. If one of them flakes, replace the sleep with a state wait
(`settled()` in `scripts/lib/harness.mjs`) and add a row above.
