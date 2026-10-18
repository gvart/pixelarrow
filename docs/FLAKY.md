# Flaky browser checks

A flaky check passes and fails with no code change between runs. Nothing here is hidden with retries:
the smokes and `npm run regression` run each script once per platform mode and report every result
(V6-GATE-02). Add a row whenever a check fails and then passes on a re-run. Record every run, the cause
class (`/test-flakiness`: timing/async, order, seed, leak, external state, float, load race) and the fix.
With fewer than 3 runs a case is only **suspected**.

## Open

### F5 · layout check `battle-menu-locked|text-overlap|battle.menu.note|СОШЛ…@844x390`, ru-tg (suspected, timing)

- **Seen:** once in the full matrix (V6-067), then 2 clean reruns. Since then a once-only finding
  (`battle.banner.contact|battle.menu.note`) in 2-4 of the four 844x390 configs in most full
  `battle*`/`world*` matrices at load 40-120; the check's own second run clears it, except once at load ≈ 120.
- **Cause:** suspected timing/async: a text measured before it settled (wrap or fade). Not element parity (F8).
- **Fix:** none yet.

### F6 · `tutorial-smoke` web, `duel-smoke` Telegram and web (suspected, load timeouts)

- **Seen:** all three timed out once at load ≈ 42, then passed. `duel-smoke` Telegram failed "[ladder] deselecting
  in battle keeps the game running" once beside a full layout matrix (it reads `loop.frame` 600 ms apart).
- **Partly fixed (V6-RSCR-08, V6-QA-SPEED):** below 5 fps Phaser's `TimeStep.smoothDelta` hands scenes 16.7 ms a
  frame whatever the frame took, so game clocks ran at 1/15 to 1/70 of real time. `tutorial-smoke` now waits on the
  tutorial's own clock (fails only if it stalls 20 s), runs each context on real frame time capped at 250 ms
  (`realClock`, `scripts/lib/harness.mjs`), and runs its parts and `regression/run.mjs` scripts `--jobs` at a time
  (default 2). `--all` went from 5152 s to 1158 s at load 40-75, all PASS. `duel-smoke` not yet re-checked.

### F7 · vitest `qafixWorld.test.ts` S4 "the tap area is what is drawn on the settlement" (suspected, load timeout)

- **Seen:** timed out at 30 s three times in the full `vitest run` beside other suites; alone 14/14 (the file takes 43 s).
- **Cause:** suspected load timeout: one test sweeps the settlement tap areas close to the 30 s limit.
- **Fix:** none yet.

### F9 · server `auth.test.ts` "rate-limits logins per IP (30 / 60 s)" (suspected, load race)

- **Seen:** 200 instead of 429 once under load (PAY-01, V6-077), then 2 clean reruns.
- **Cause:** likely F2's wall-clock window. **Fix:** apply F2's fix (a refusing-limiter stub, or start with ≥ 30 s left).

### F11 · server vitest suite hangs at 0% CPU with no output (suspected, open handle)

- **Seen:** ACCT-07 agent run (killed after 40 min), ACCT-06 integration (≈ 20 min); a rerun passes.
- **Cause:** suspected workerd/miniflare handle not closing. **Fix:** none yet; find the file with
  `--reporter=verbose` and a per-file timeout.

### F12 · `scripts/account-e2e.mjs` "sign-up with a taken address shows the same Check your email (no disclosure)" (suspected, timing; cause not found)

- **Seen:** plain runs failed 5 of 9 at load 25-100; instrumented runs 1 of 17. The form closes (202, success path),
  but the address is missing from the Menu's texts when read; the sheet's other texts are there.
- **Cause:** not found; anything that slows the page before the check makes it pass. Ruled out: wrapped or dropped
  address, a 429, a Menu restart or cloud adopt.
- **Related script races (not F12):** a run within 65 s of the previous one hits the per-IP log-in limit; the 429
  step can straddle the one-minute window and the log-in goes through (check the answer, not the banner).
- **Fix:** none yet. Next failure: dump every active scene's texts and the Menu's create/shutdown times at the
  failure without slowing the run before it.

## Resolved

- **F1** · `smoke.mjs` "entered the village": slept on timers before tapping; the staged village could sit under the
  top HUD on some maps. Fix: wait on state (`mapReady()`, two game frames, no discovery or cut), stage the village
  nearest the map's centre, "nothing over the village" check. 10/10 PASS under load (QA-HARDEN).
- **F2** · `server/test/public-api.test.ts` 304/HEAD single SELECT: Miniflare's limiter counts 60 s windows aligned to
  the wall clock, so 61 calls could straddle a minute. Fix: a refusing limiter for that test; the limiter tests start
  with ≥ 30 s of window left (`freshWindow()`). 10/10 PASS under load.
- **F3** · `audio-smoke.mjs` web "juice tiers sound": the fight ran into first contact (an auto-pause) between two
  evaluates, gating all five tiers. Fix: resume, feed and pause in one evaluate after earlier voices end; every
  fixed sleep is a state wait. 10/10 PASS under load.
- **F4** · `smoke.mjs` Telegram "tap on the map plans a route" / "party marched": tapped before the map took taps and
  polled the route. Fix: `mapReady()`, `mapPointFree` (the `onDown` hit test), routes counted in `window.__routes`,
  `worldDiag` on a dropped tap.
- **F8** · layout-check element parity on live scenes: each size staged a different moment. Fix (PARITY-STABLE,
  V6-076): `restoreStage` reseeds per screen, `uiTransient()` exempts transient ids from parity, staged waits fail
  loudly. 3 full runs, 0 parity findings; `tests/parityStable.test.ts`.
- **F10** · `online-e2e.mjs` recruit and lockstep steps: an evaluate returning Phaser's ScenePlugin, a fixed 400 ms
  Hire tap, a 30 s tick cap. Fix (FIX-E2E): `void` the evaluate, Hire by layout id, 90 s caps. 10/10 PASS.

## Not flaky (for the record)

- `smoke.mjs` and `audio-smoke.mjs` Telegram "no console errors": the preview `/api` proxy answered 502 every time;
  both now stub the API as down (503).
- `online-smoke.mjs` web shop stuck on "Opening the shop..." signed out: a game bug, **GATE02-B1**, fixed.

## Watch list (fixed sleeps still in place, not yet seen to flake)

`online-smoke.mjs` (`waitForTimeout(3000)` after load, 600-1500 ms between scenes) and `fullscreen-smoke.mjs`
(Telegram, 300-900 ms). If one flakes, replace the sleep with a state wait (`settled()`, `steady()`, `nextFrame()` in
`scripts/lib/harness.mjs`, `untilInPage()` in `scripts/lib/settle.mjs`) and add a row above.
