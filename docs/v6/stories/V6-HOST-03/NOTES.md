# V6-HOST-03 notes: CI split and the two-host docs

## Job graph (`.github/workflows/deploy.yml`)

```
changes ──┬─ build ─┬─ server ─────────┐
          │         ├─ layout (28) ────┤
          │         └─ smoke (6) ──────┼─ deploy (game, main only) ─┐
          └─ landing-build ─ landing-test ─┤                        │
                                           └────────────────────────┴─ landing-deploy (main only)
```

- `changes`: `dorny/paths-filter@v3` on a push; on `workflow_dispatch` the
  `target` input (`both` default, `game`, `landing`) decides instead.
  - game: `src/**`, `server/**`, `public/**`, `index.html`, `scripts/**`,
    `package*.json`, `vite.config.*`, `wrangler.jsonc`, `tsconfig*.json` (ADR-0007),
    plus `tests/**`, `maps-src/**` and `.github/**`.
  - landing: `landing/**` (ADR-0007), plus `src/data/classes.ts` (read by
    `landing/scripts/sections-check.mjs`) and `.github/**`.
- `deploy` needs the game gates, and the landing gates too when the landing
  changed, so a run that changed both deploys both or neither (V6-023: the
  legal pages live only in the landing build).
- `landing-deploy` needs `[changes, landing-build, landing-test, deploy]` and
  runs when the landing gates pass and either the game did not change or the
  game deploy succeeded. This is stricter than ADR-0007's
  `needs.deploy.result != 'failure'`: the ADR's condition also lets the landing
  go out when the game gates failed and `deploy` was therefore *skipped*,
  which would break "game first" when the public API contract changed and
  could hit a custom-domain conflict on the cutover run.
- Both deploy jobs also require `github.ref == 'refs/heads/main'` (a manual
  run on another branch only checks).
- One `concurrency: deploy` group for the whole workflow (unchanged).

## Which jobs run

| Change set | changes | build, server, layout ×28, smoke ×6 | deploy | landing-build, landing-test | landing-deploy |
| --- | --- | --- | --- | --- | --- |
| Game only (e.g. `src/scenes/MenuScene.ts`) | runs: game=true, landing=false | run | runs after all game gates | skipped | skipped |
| Landing only (e.g. `landing/src/pages/index.astro`) | runs: game=false, landing=true | skipped | skipped | run | runs after the landing gates; never waits on a game deploy |
| Both (e.g. `server/src/index.ts` + `landing/worker/index.ts`, or `.github/**`, or dispatch `target: both`) | runs: both true | run | runs after the game **and** landing gates | run | runs after `deploy` succeeds |

## Validation

- Nothing was run remotely; no deploy.
- `actionlint` is not installed. The YAML was checked with
  `@action-validator/cli@0.6.0` (the GitHub workflow JSON schema), installed
  in a temporary folder inside the worktree and removed after: VALID. A copy
  with a misspelt key failed it, so the check is live.
- `yaml@2.8.1` parsed the file in strict mode with unique keys, and a script
  checked that every `needs` names a job and that every `needs.<job>` in an
  `if:` is listed in that job's `needs`. The layout matrix still has 28 legs
  (14 sizes × 2 languages), smoke 6.

## Assumptions

- GATE-02 (in progress) owns the smoke job. The step passes the base URL as
  argv[2] and the mode as `SMOKE_PLATFORM=both`. No `--platform` flag was
  added, because `fullscreen-smoke.mjs` and `online-smoke.mjs` read argv[3] as
  the shots folder today. gate-02 was told; if its scripts read only
  `--platform`, it changes that one line.
- `landing-test` uses Playwright from the root `node_modules` (as the scripts
  say) and installs the Chromium headless shell like
  `.github/actions/browser-setup`, without that action's game `dist/` and
  `vite preview`.
- GATE-03 later adds the landing width and Lighthouse checks; they belong in
  `landing-test`.
- The ADR-0007 cutover step 1 (temporary dual-domain game deploy) is dropped
  from the owner checklist because of V6-023; see docs/v6/OWNER_ACTIONS.md
  step 7. The Director should record that in DECISIONS.md.
