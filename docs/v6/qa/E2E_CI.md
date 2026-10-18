# Online e2e in CI (proposal)

Status: **proposal only.** `deploy.yml` is not changed by this document (FIX-E2E, 2026-10-14).

`scripts/online-e2e.mjs` is the only browser check that talks to a real backend: two DEV_AUTH players
join the season, one attacks a hex (the server re-simulates the battle), they recruit, form a clan
through an invite deep link, and fight a live lockstep duel. Today it runs only by hand, because it
needs a local `wrangler dev` with `DEV_AUTH=1` and a client built with `VITE_DEV_AUTH=1`
(`regression --all` leaves it out for that reason). Every regression it caught so far was found late.

## The job

One extra job in the game pipeline, after `build` and `server`, in parallel with `smoke` and
`regression`, and a gate for `deploy` (`needs: [..., online-e2e]`). Everything is local to the runner:
a private D1 in a temp folder, no Cloudflare account, no secrets, no network calls outside the runner.

```yaml
  # ---- online e2e: two players against a local Worker (docs/v6/qa/E2E_CI.md)
  online-e2e:
    needs: [changes, build]
    if: needs.changes.outputs.game == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/browser-setup   # client deps, dist/, Chromium (its :4173 preview is unused)
      - uses: ./.github/actions/server-setup    # server deps and the pinned wrangler
      - name: Local secrets (test values only, from the committed example)
        run: cp server/.dev.vars.example .dev.vars
      - name: Private D1 and the local Worker on :8787
        working-directory: server
        run: |
          npx wrangler d1 migrations apply pixelarrow --local --config ../wrangler.jsonc --persist-to "$RUNNER_TEMP/d1" <<< y
          npx wrangler dev --config ../wrangler.jsonc --persist-to "$RUNNER_TEMP/d1" --port 8787 > "$RUNNER_TEMP/wrangler.log" 2>&1 &
          for i in $(seq 1 60); do curl -sf http://localhost:8787/api/health > /dev/null && exit 0; sleep 1; done
          cat "$RUNNER_TEMP/wrangler.log"; exit 1
      - name: Dev-auth client on :5173 (vite dev, proxying /api and /ws to the Worker)
        run: |
          VITE_DEV_AUTH=1 API_PROXY=http://localhost:8787 npx vite --port 5173 --strictPort > "$RUNNER_TEMP/vite.log" 2>&1 &
          for i in $(seq 1 60); do curl -sf http://localhost:5173/ > /dev/null && exit 0; sleep 1; done
          cat "$RUNNER_TEMP/vite.log"; exit 1
      - run: node scripts/online-e2e.mjs http://localhost:5173/ "$RUNNER_TEMP/shots"
      - if: failure()
        run: tail -n 200 "$RUNNER_TEMP/wrangler.log" "$RUNNER_TEMP/vite.log"
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: online-e2e-shots
          path: ${{ runner.temp }}/shots
          retention-days: 3
```

Notes:

- **Why `vite dev`, not the `dist/` build.** The dev sign-in is compiled in only when
  `import.meta.env.DEV` is true and `VITE_DEV_AUTH=1` (`src/platform/cloud.ts`), so the production
  `dist/` cannot sign in a test player, by design. `vite dev` is what this proposal verified 10 times in
  a row (below). A "dev-auth build" is possible (`NODE_ENV=development VITE_DEV_AUTH=1 vite build
  --outDir dist-e2e`, then `vite preview`, whose proxy defaults to `server.proxy`), but it is **not
  verified**; if it is used, it must never be the artifact that `deploy` uploads (keep a separate
  `outDir` and artifact name).
- **`.dev.vars` comes from the committed example.** Its values are test values only: `DEV_AUTH=1`,
  `DEV_EMAIL=1` (mail goes to the `dev_outbox` table), a placeholder pepper and Cloudflare's published
  always-pass Turnstile testing secret. `deploy-config.mjs` already refuses `DEV_AUTH`/`DEV_EMAIL` in
  Worker vars, so this cannot leak into production.
- **wrangler.jsonc's assets need `dist/`**, which `browser-setup` downloads; the Worker serves the API
  only here (the client comes from vite).
- **No remote resources.** `--local` migrations and `--persist-to` a temp folder; no `CLOUDFLARE_API_TOKEN`
  in this job, so `wrangler` cannot touch the real D1 even by mistake.
- **Budget.** A run takes 2.5-4 min on a loaded laptop (software WebGL, two pages); 20 min leaves room
  for the npm/Chromium setup. No retries: a red run is a real signal (FLAKY.md policy, V6-GATE-02).
- **Platform modes.** The script runs in web mode only (DEV_AUTH is a web dev sign-in); Telegram mode is
  covered by `server/test/online-flow.test.ts` and the smokes.

## Stability evidence (FIX-E2E)

Before the fix the script failed about 1 run in 4, at three places: the duel step (fixed in c2a4ebfa:
it waited on a stale `scene.map`), a "reload" of player A after the attack report, and the recruit
Hire tap. Logs: `.fixe2e-logs/` in the FIX-E2E worktree (not committed).

1. **The "reload" was not a navigation, and not a game bug.** All 4 logged failures (24 runs before
   the v6 merge) threw at the same line, `ev(A, () => ...scene.start('OnlineArmy', {}))`, and the
   probe that caught one (`navprobe.patch`) read the page 3 s later: the **same document** (navigation
   type `navigate`, `history.length` 3 with the game's own `{pixelarrow:'back'}` guard state, and the
   session's navigation log holding only that guard push, no cross-document navigation). Playwright
   rewrites *any* non-JavaScript CDP error from an evaluate into "Execution context was destroyed,
   most likely because of a navigation" (`playwright-core` 1.56 `crExecutionContext.js`
   `rewriteError`). That arrow function **returns** Phaser's `ScenePlugin`, so the evaluate serializes
   the whole game graph back to node: measured 3.3-8.6 s of frozen page per call. A CDP probe
   (`E2E_NAVPROBE=1`: document requests, `frameRequestedNavigation`, `beforeunload`/`pagehide`, crashes,
   raw CDP errors) saw no navigation of A in any later run. Ruled out: the Back guard (PLAT-02, its
   push is same-document), hash routes and launch params (PLAT-05, no document request), the session
   recheck (PLAT-04, no sign-out or document request), a service worker (there is none) and Vite HMR (no
   reload in any vite log). **Not reproduced since the v6 merge:** 14 runs that kept the returning
   step (`E2E_OLDSTEP`, removed again) at load average 30-88 never hit it, so the exact protocol
   error is unknown. **Fix (test):** `void` the expression, as the clan step already did; it also
   removes the freeze right before the recruit step.
2. **The Hire tap** came a fixed 400 ms after Recruit, before the sheet's Hire button could take taps
   at software-WebGL frame rates, and the check then allowed 8 s for a 4 s undo window plus the
   request. The window is **game time**: Phaser caps a frame's delta at 200 ms (`fps.min` 5), so at
   ~1 fps it takes 20 s of wall time (seen: Hire took, the window still open after 20 s, the recruit
   POST only when the screen closed). **Fix (test):** wait for state: tap Hire by its layout id
   (`oarmy.hire`) until the scene holds the hire (up to 3 taps, reopening the sheet if it closed),
   then wait until it is sent (90 s cap) and the profile shows one more hero. Players are unaffected:
   on a device under 5 fps the undo window simply lasts longer.
3. **Found on the way:** "both clients advance in lockstep" failed once (42 / 38 ticks) at load 85: the
   wait for 40 ticks had a 30 s cap and ticks advance with frames. The duel waits (go, 40 ticks, both
   reports) now cap at 90 s; the lockstep check itself (gap of at most 12 ticks) is unchanged.

**10 runs in a row, all pass** (38/38 checks each, fresh wrangler with DEV_AUTH, private D1 and vite
dev with API_PROXY per run, load average 54-88 with other agents' jobs and `vitest` / `regression --all`
running beside it): 162-330 s per run. Then 2 more runs of the committed script (probes off): pass.
Earlier rounds with the same fixes were cut short by the Hire game-time wait (round a) and the 30 s
tick wait (round b), each fixed before the next round.

Also on this branch: `tsc --noEmit` clean; `vitest run` 161 files, 2011/2011; `regression --all`
(both platform modes, dist built fresh on a private port) PASS in 1960 s.
