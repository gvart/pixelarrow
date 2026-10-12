# FL-01: juice tiers (battle-readability.md R4, F1; A11Y-12, A11Y-13)

Presentation only. No sim rule, event or hash change (replay-hash 13/13, balance matched 53%).

## What shipped

- **`Juice`** (`src/ui/battleFx.ts`, pure): the battle's feel state. It holds the shake trauma, the hit-stop and the flash pacing. It never feeds the sim.
- **The tiers** (`JUICE_TIERS`), smallest first:

  | Event | Shake (trauma) | Hit-stop | Visual |
  | --- | --- | --- | --- |
  | Kill (`death` with a striker) | none | none | a few dust grains, plus RD-02's damage number |
  | Ability (`ability`) | 0.15 | 40 ms, the holder only | a flash ring in the ability's colour (paced, off under Reduce flash) |
  | Charge impact (`impact`) | 0.2 | 60 ms, the sprites of the two groups | a cream dust puff on the contact line |
  | Stakes break (`stakesBreak`) | 0.2 | 60 ms, the group | splinters |
  | Standard lost (`standardLost`) | 0.3 | none | a ripple |
  | Rout (`rout`) | 0.4 | none | dust at the feet of the men who run |
  | Army break (`armyBreak`) | 0.5 | none | the banner (exists); it lands on the rout's 0.4 |

- **Shake** (F1): offset = `MAX_OFFSET` × trauma² × seeded value noise (24 lattice points a second, so it's smooth). Trauma decays by 1.5 a second of real time. The offset is in UI px, so it scales with the width. It goes onto `cameras.main` scroll and comes off again the next frame (`applyShake`), so the follow camera never drifts with it. At the field bounds it's clamped.
- **Hit-stop**: `renderUnits` skips a held man's pose for the stop. The sim steps on underneath. A test runs a real battle with and without the juice and gets the same tick count and the same state hash.
- **Pause and speed**:
  - The juice clock runs on real time, and only while the battle runs. Paused, the offset is 0 and nothing decays or ends.
  - At 2× or 4×, a shake lasts the same real time.
  - A hit-stop is `stopMs / speed` long, so held sprites don't jump after it. A new stop can start at most every 400 ms of real time.
  - A kind adds trauma at most once per 300 ms, so a 20-man charge is one impact, not twenty.
  - Flash rings are at most one per 400 ms (2.5 a second, under WCAG 2.3.1's three).
- **Settings** (V5-072): two new rows, "Reduce screen shake" and "Reduce flashes" ("Меньше тряски экрана", "Меньше вспышек"), under Accessibility. Both follow Reduce motion until the player sets them (`shakeReduced` and `flashReduced` in `motion.ts`). The save fields existed already (save v6). They apply as soon as Settings closes over a battle.
- **Reduce motion** keeps the hit-stop (A11Y-12: it isn't motion) and the dust. Through the defaults above, it removes the shake and the flash rings.
- **V5-067** (partly fixed): `fadeIn` in `motion.ts` (the tab-page crossfade in Shop and Hero) now starts at `ENTRY_ALPHA` = 0.01, not 0. Phaser skips input on a container at alpha 0, and on all its children. The screen entry fade in `BaseScene.enterMotion` still starts at `ui.alpha = 0`. BaseScene is FL-02's file, so the fix there is a one-line change for FL-02: `ui.alpha = ENTRY_ALPHA`. Sheets start at alpha 0 in `ParchmentSheet.ts` too.

## Decisions

1. **The army break is 0.5, not the GDD's 0.3.** The director asked for rout < army break. 0.5 is the top of the R4 knob range. With the rout under it, the peak is 0.9: 6.5 UI px, once a battle.
2. **`MAX_OFFSET` is 8 UI px, not the GDD's 6.** At 6, a lone rout moved the view 1 UI px, which nobody sees. 8 is inside the knob range (3–10). An impact alone stays under 0.4 UI px: its weight is the hit-stop, the dust and FL-03's thud. Shake stays for the big moments.
3. **No shake on a kill or a routine hit** (AC 3). A kill gets a small puff, so the tiers still run kill < impact < rout < army break.
4. **Cohesion gets no shake.** It always comes with a rout, which already shakes, and RD-02's ripple shows it.
5. **Standard lost and stakes break shake as R4 lists them**, although AC 3 names only impact, rout and ability. They are impact-class events and they're rare.
6. **The rout's "fleeing-flag glyphs" are RD-01's badge glyph.** No new glyph.
7. **Real time for the feel, battle time for the sim.** That's how a fast fight stays readable, and how a pause freezes everything.
8. **The medallion text under 6.5** (the director's item 3) is in `src/ui/battleHud.ts` (`Medallion`: the name at 6, the sub line at 5). That file isn't in FL-01's set, so it's left alone. The `tutorial-move|text-size|*` allowlist entry stays (TUT-02's).

## Measured (390x844, headless, 12 s of live play)

- Reduce shake off: the camera moved on the impact frames only. That's 2–6 frames in 12 s, with a peak of 0.1 UI px from impacts alone.
- Reduce shake on: 0 frames moved, with a peak of 0. Hit-stops still held 1–2 frames.
- No page errors.

## Checks

- `tsc` clean. vitest 115 files, 1420 tests (`tests/juice.test.ts`, 17 new).
- `vite build` OK. replay-hash 13/13. `npm run balance`: matched 53%.
- smoke and tutorial-smoke pass.
- layout-check, 24 configs × 22 battle screens plus `menu-settings`: 0 violations, 0 new.
- No `npm run regression` script exists.

## Screenshots

`390-en-impact`, `390-en-ability`, `390-en-rout`, `320-ru-impact`, `320-ru-ability`, `320-ru-rout`, `320-ru-settings`.

Each is caught about 100 ms after the event and frozen by a pause, so the shake itself (0 while paused) isn't in the stills. The shots script was a scratch tool and isn't committed.

## Follow-ups

- FL-02: `BaseScene.enterMotion` and `ParchmentSheet` should start at `ENTRY_ALPHA` (V5-067).
- FL-03: the heavy thud on an impact, the crowd groan on a rout and the horn chord on an army break can hang off the same events.
- The medallion's name (6) and sub line (5) should come up to 6.5, under whoever owns `battleHud.ts` next.
