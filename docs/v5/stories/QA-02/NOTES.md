# QA-02 Regression suite: notes

Manifest: `tests/regression/SUITE.md`. Run: `npm run regression` (vite preview on :8047, every script, server stopped).

## Decisions (made alone, the user asleep)

1. **Manifest at `tests/regression/SUITE.md`**, not `tests/regression-suite.md` as the regression-suite skill says: the story owns `tests/regression/**` only.
2. **Mixed-bundle tests (SV-03..08) dropped**: V5-074, no live users, no backward compatibility. Listed under Known gaps with the reason.
3. **Cross-engine replay not rewritten**: `scripts/replay-hash.mjs` already hashes the v2 fixtures in Chromium against the Node hashes; the runner runs it (`chromium`), and its exit 2 (engine not run) makes the suite NOT ASSESSED, never PASS.
4. **Back is Telegram's** (fake WebApp BackButton), not `__nav.back()` called directly, so the nav stack is tested through its real host. Doors use real taps on layout ids where a kit button exists; deep links, map hexes and duel sub-views are opened as the scene opens them.
5. **The door table is data** (`scripts/regression/doors.mjs`) and a unit test holds it to `BACK_RULES` / `resolveBack`: a new parent/origin screen fails `doors.test.ts` until it has a door or an ELSEWHERE reason. Watched fail: a wrong expected landing fails both the unit test and the browser walk.
6. **New-sheet fixtures**: the sheet set is derived (every `open…` exported from `src/ui/sheets/**`). layout-check already stages 8 of 11; the Arc (lairs), Assault and abilities "more" sheets had none, so `sheet-layout.mjs` stages them at 320x568, 320x640, 360x780, 390x844 in en and ru through `window.__layout.check()`. layout-check.mjs is not this story's file, so the fixtures live here. Plain insets only (the tg variant is layout-check's). All clean.
7. **Waits are on state**: a scene is settled when running, its loader idle and its entry motion over (ui alpha 1, x 0); the duel hub also past its 600 ms Back guard (`openedAt`); maps with no event card. No fixed sleeps. One retry (logged with what blocked it) for a World sheet that the map itself can refuse while a card or coach is up.
8. **KNOWN bug checks**: a check for a reported open bug prints `KNOWN <id>` and the run's verdict names it ("PASS except 1 KNOWN"); it never reads as a plain pass, and once fixed it asks to become a plain check. `suite.test.ts` fails if a KNOWN id is missing from the manifest.
9. **Tutorial ⋯**: the spotlight blocks taps outside the lit control by design, ⋯ included, so the tutorial's menu items are read via `openMenu()` and the skip goes through Back (one of the three ways the code names).
10. **War attack** uses an online source stub (as layout-check does); its Results and server verdict stay with `online-e2e.mjs` (needs wrangler).
11. `--all` adds the five browser smokes so one command runs the smoke-check scope.

## Bugs found (not fixed: reported)

- **QA02-B1** Replay tutorial from Settings, then Skip: lands on FirstRun (modes), not the screen Settings was opened from (screen-flow §3 S09). Repro: Campaign hub > Settings > Replay tutorial > Back > Skip. Cause: `src/ui/tutorial/battleTutorial.ts` askSkip and finish always `scene.start('FirstRun', …)`.
- Dead code (not touched): `openJournalSheet` in `src/ui/sheets/eventCard.ts` has no caller since the journal became the Arc sheet's tab.

## Verification

- `npx tsc --noEmit` clean; `npx vitest run` 117 files, 1415 tests pass (tests/regression: 12).
- `npm run regression` three times in a row on :8047, load average about 20: all PASS (1 KNOWN), 177 s, 181 s, 176 s (hub-flows ~46 s, battle-kinds ~101 s, sheet-layout ~28 s, replay-hash 1 s).
