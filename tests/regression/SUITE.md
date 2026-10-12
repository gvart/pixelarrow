# Regression Suite Manifest

> Last updated: 2026-10-12 (QA-02)
> Registered: 4 browser scripts, 3 unit guard files, plus the existing tests named below
> Coverage: NOT ASSESSED as a percentage. No GDD-wide critical-path audit was run; this suite covers the
> qa-plan-v5 §5.3 HIGH and MEDIUM items it owns and the bug classes fixed this run.

## How to run

```
npm run regression                     # vite build if dist/ is missing, vite preview on :8047, every script, server stopped
npm run regression -- --port 8051      # another port (one per agent, V5-004)
npm run regression -- --all            # also the browser smokes (the smoke-check scope; not online-e2e)
npx vitest run tests/regression        # the unit guards (also part of `npm test`)
```

Exit 0 = pass, 1 = a script failed or timed out (killed after its limit), 2 = NOT ASSESSED (a script
could not run, e.g. no Chromium for the replay check). A KNOWN line is a reported open bug: it is named in
the summary and never counted as a pass.

## Registered regression tests

### Browser scripts (`scripts/regression/`)

| Script | Covers | Added |
| --- | --- | --- |
| `hub-flows.mjs` | The tab bar by real taps to all five hubs; each hub a root (Telegram Close, Back stays); every door in `doors.mjs` (22) opens its screen and Telegram Back lands on the screen-flow §3 target; one scene running after each step; no page errors. Classes: N2/N3 wrong origin, FIXER-5 tap lost in the entry fade, duel sub-view Back to the menu. | 2026-10-12 |
| `battle-kinds.mjs` | Campaign band, Codex Trial (practice), tutorial replay, duel ladder, ranked, raid, war attack (source stub): own battle data (B1/B2), pace and the Pause key (A11Y-17), the ⋯ menu items and whether it pauses (A11Y-18, BTL-01), Back closes it, Results back to the origin (N1, N8). The raid ends with its menu open and the next battle must open its own (7d3e260). | 2026-10-12 |
| `sheet-layout.mjs` | The v5 sheets layout-check does not stage (Arc lairs, Assault, abilities "more"), at 320x568, 320x640, 360x780, 390x844 in en and ru, through the game's own layout rules; a sheet that never shows fails. | 2026-10-12 |
| `run.mjs` | The runner (above). Also runs `scripts/replay-hash.mjs chromium` (the v2 replay fixtures in Chromium vs the Node hashes, qa-plan replayCrossEngine). | 2026-10-12 |

### Unit guards (`tests/regression/`)

| Test file | Covers | Added |
| --- | --- | --- |
| `doors.test.ts` | `doors.mjs` against `src/platform/nav.ts`: a door (or an ELSEWHERE reason) for every parent/origin screen; each expected landing equals `resolveBack`; the tabs in bar order; tapped layout ids still exist. | 2026-10-12 |
| `sheetFixtures.test.ts` | Every opener exported from `src/ui/sheets/**` (derived) has a layout-check screen or a `sheet-layout.mjs` fixture; both scripts default to the four sizes and en, ru. | 2026-10-12 |
| `tutorialExit.test.ts` | QA02-B1: a Settings replay returns to its screen, the first run goes to FirstRun, a first item shows its reward. | 2026-10-12 |
| `suite.test.ts` | This manifest and `run.mjs` list every regression script and test file; every KNOWN bug id in the scripts is listed below. | 2026-10-12 |

### Existing tests this suite relies on (not moved)

| Test | Covers |
| --- | --- |
| `tests/sceneStart.test.ts` | PLAY B1, B2 (scene data) |
| `tests/battleLiveFixes.test.ts` | PLAY B3, B5 |
| `tests/battleReport.test.ts` | PLAY B4 (fled and KO in Losses, RES-01) |
| `tests/saveRecovery.test.ts`, `tests/abandonedBattle.test.ts` | V5-011 |
| `tests/practice.test.ts` | V5-039 Trial farm |
| `tests/trainReplay.test.ts`, `server/test/trainReplay.test.ts` | v2 replay hashes in Node and workerd |
| `tests/layoutCheckConfig.test.ts` | layout-check sizes (320x640) and allowlist owners |
| `scripts/smoke.mjs`, `tutorial-smoke.mjs`, `duel-smoke.mjs`, `online-smoke.mjs`, `fullscreen-smoke.mjs` | the smoke-check scope (`--all`) |
| `scripts/online-e2e.mjs` | real server: attack, clan, live duel (needs wrangler with DEV_AUTH; not in the runner) |

## Known bugs

| ID | Check | Repro | Owner |
| --- | --- | --- | --- |
| (none open) | | | |

Fixed: QA02-B1 (a Settings replay skipped or finished went to FirstRun, not the screen Settings was opened from; now `TutorialStart.back`, routed by `tutorialExit`). Its battle-kinds check is a plain assertion.

## Known gaps

| Priority | Suggested path | Covers | Why not yet |
| --- | --- | --- | --- |
| MEDIUM | `scripts/regression/a11y.mjs` | Greyscale shots, Reduce motion/shake/flash (A11Y-04, 12, 13) | Out of this story's time box |
| MEDIUM | `tests/regression/elementMap.test.ts` | ELEMENT_MAP rows vs the layout registry | Same |
| LOW | `scripts/regression/telegram-desktop.mjs` | Hover tooltip, wheel zoom (A11Y-15, 22) | Same |
| — | `mixed-bundle.mjs`, `mixedBundle.test.ts` (SV-03..08) | v4/v6 bundles side by side | Dropped: V5-074, no live users, no backward compatibility |

## Quarantined tests

| Test file | Check | Reason | Since |
| --- | --- | --- | --- |
| (none) | | | |
