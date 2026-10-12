# FL-02: scene transitions and screen motion (battle-readability.md R6, F3; A11Y-12; V5-067)

Presentation only. Files: `src/scenes/BaseScene.ts`, `src/ui/motion.ts`, `src/ui/mosaic/base.ts`, plus the regression scripts that wait on the entry.

## What shipped

- **Two kinds of screen entry** (`BaseScene.enterMotion`):

  | Transition | Motion | Length |
  | --- | --- | --- |
  | UI screen to UI screen (hubs, Army, Hero, Codex, Shop, sheets' scenes) | the ui slides 6 UI px (from the right drilling down, from the left after Back) and fades in | 220 ms (`MOTION.slide`), Cubic ease-out |
  | Into or out of a field: World map, Battle (deployment included), the War region map, and the screen after one (Results after a battle, a town or camp after the map) | every camera fades in from parchment (`MOSAIC.parch`) | 180 ms (`MOTION.fade`, R6) |
  | Reduce motion, or a relayout (new screen size) | an instant cut | 0 |

  A "field" is a scene with its own world camera (more than one camera once `create()` has run). The rule is decided on the scene's `create` event, after the world camera exists.
- **V5-067, fixed**:
  - The screen entry starts the ui at `ENTRY_ALPHA` (0.01), not 0. Phaser's `inputCandidate` skips every object under a container that won't render, and alpha 0 doesn't render, so a tap in the fade's first frame was lost.
  - `tweenTo` (motion.ts) lifts a target at alpha 0 to `ENTRY_ALPHA` before any tween to a visible alpha. That fixes the sheets (ParchmentSheet's box and shade, BottomPanel) without touching F-07's `ParchmentSheet.ts`.
  - A camera fade is drawn over the scene and never touches hit tests, so the parchment fade takes taps from its first frame too.
- **Button press response** (`makePressable`, AC 2): the face shrinks to 0.97 on `pointerdown`, the same frame. A button with no face to shrink and no pressed look of its own (forge rows, the army mini card, First Run's mode cards, Hero's tab switch, the consumable picker rows), and every face button under Reduce motion, now dims to 0.8 while held. Before, those gave no response at all.

## Regression test (director item 1)

- `scripts/regression/hub-flows.mjs`, new flow **V5-067**. It restarts the Campaign hub and freezes its tweens on the very first frame of the entry, before any tween step, so it lands inside the first 30 ms. Then it taps the Codex tab where it settles, like a fast finger going for the spot it knows. The Codex must open.
- Proven both ways: against a build with the old `ui.alpha = 0` it FAILS ("Menu" still running, the tap was swallowed). With the fix it passes.
- `tests/transitions.test.ts` (5 unit tests): `tweenTo` starts entry fades at `ENTRY_ALPHA` and leaves fade-outs alone, Reduce motion is instant, and BaseScene never sets alpha 0.

## Readiness signal (director item 3)

The suite and the smokes wait on `ui.alpha === 1 && ui.x === 0`. That still holds at the end of every entry. A field entry sets it at once, because the ui doesn't slide there; the camera fade does the work. `scripts/regression/lib.mjs` `settled()` now also waits for any camera fade to end, so positions and stills are steady. `online-e2e.mjs` waits on OnlineClan's `ui.alpha`, which is unchanged (no field), so it's left alone. The comment in `smoke.mjs` is updated: taps land during the entry now, and it still waits so its taps aim at settled positions.

## Decisions

1. **The parchment fade is a fade *in* only.** The old screen cuts to parchment, then the new one fades up over 180 ms. A fade *out* would need the old scene to wait before `scene.start`, which means wrapping ~100 call sites outside FL-02's files. It would also hold the player on a screen they had already left, where a second tap could fire a second start. So the transition costs no time and never blocks.
2. **Parchment only into or out of a field.** R6 names map → deployment and battle → Results. Hub-to-hub hops keep the slide: a light parchment flash on every tab switch would be loud, and the dark mosaic screens already cross-fade over the dark backdrop, so there's no hard cut there (F3). The War hub (Online) has a region map, so it counts as a field.
3. **On a field entry the ui doesn't slide too.** The parchment fade covers both cameras, and a slide under it would only move the buttons for nothing.
4. **Reduce motion is a cut, not a short fade.** A11Y-12 asks for "instant cuts", and R6 says the same.
5. **The press dim is instant, not a tween.** That's why it stays on under Reduce motion: it's a state, not motion. The face's 0.97 shrink stays off under Reduce motion, as before.
6. **Sheet slides are unchanged** (240 ms, `MOTION.sheet`). The only change is the alpha lift in `tweenTo`, so sheet open adds ~0 ms (AC 3).

## Checks

- `tsc` clean. vitest: 121 files, 1444 tests (5 new in `tests/transitions.test.ts`). `vite build` OK.
- layout-check, full run (24 configs × 197 screens, `--no-shots`): 46 distinct violations, **0 new**. LAYOUT CHECK PASSED.
- smoke ALL PASS (46). tutorial-smoke PASSED (135). fullscreen-smoke ALL PASS (54).
- `npm run regression`: hub-flows ALL PASS (V5-067 flow included), sheet-layout ALL PASS, replay-hash 13/13.
- battle-kinds: 95 checks pass. `[tutorial] the guided battle` fails, and the failure is **flaky and pre-existing**. Settings → Replay tutorial is tapped right after a swipe-scroll, and sometimes the tap doesn't start the battle. In a standalone probe (open Settings, scroll, tap) the v5 base build (no FL-02 change) failed 4 of 6 tries and the FL-02 build failed 4 of 7. That's not caused by FL-02. The fix is for the script's owner (QA-02): wait for the list's scroll to settle before the tap.
- The machine was heavily loaded (other agents' runs), so timing is slow everywhere.

## Screenshots

These are frozen mid-transition: the tweens are paused, and the camera fade is held at a fixed progress.

- `390-en-world-parchment`, `320-ru-world-parchment`: Begin the march → World, 40% into the parchment fade. Both cameras are faded, the UI too.
- `390-en-battle-parchment`: World → Battle deployment, 55% into the fade.
- `390-en-army-slide`, `320-ru-army-slide`: Campaign hub → Army, 35% into the UI slide.
- `390-en-world-reduced`: the same World entry under OS Reduce motion: no fade and no slide, a cut (checked: 0 fades, 0 slides, ui alpha 1 on the first frame).

## Follow-ups

- `ParchmentSheet.ts` (F-07) still sets `box.alpha = 0` and `shade.alpha = 0`. `tweenTo` lifts both to `ENTRY_ALPHA`, so they take taps. Whoever owns it next can set `ENTRY_ALPHA` there directly.
- `src/ui/sheets/recruit.ts`: the hire Undo toast fades in with `scene.tweens.add` from `setAlpha(0)`. That bypasses `tweenTo`, so for its first frame its Undo button misses taps (V5-067), and it ignores Reduce motion. Its owner should route it through `tweenTo`.
