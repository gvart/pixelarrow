# FL-03: audio (buses and ducking, horns, rout, ability, works and UI sounds, haptics map)

Presentation only. Audio reads the sim and never writes to it: replay-hash 13/13, and a unit test runs a real battle with and without the hook and gets the same tick and hash.

## What shipped

- **The mixer in dB** (`src/audio/mixer.ts`, pure, unit-tested):

  ```
  destination ← limiter ← master ┬ world ┬ music ← musicDuck ← tracks, stingers
                                 │       └ sfx   ┬ sfxDuck ← field sounds
                                 │               └ the ducking horns (they never duck themselves)
                                 └ ui ← clicks, taps, coins, chimes, narrator
  ```

  - A volume step is 2 dB (10 = 0 dB, 1 = -18 dB, 0 = off). Then a per-bus trim: music +1.5 dB, SFX -1 dB, UI -1 dB. These match the old linear maxima (1.2 and 0.9).
  - The Effects slider drives both the SFX and the UI bus. Settings shows only Music and Effects (V5-072: no dead controls), so there's no UI slider.
  - Which sound is UI comes from its id (`busOf`): click, tap, back, error, warning, coin, levelUp, chime, narrate and quill. No call site changed.
- **Ducking** (`DUCK`, `Ducker`):
  - The charge and retreat horns pull the music down 7 dB. The army-break chord pulls it down 10 dB, and the field sounds 4 dB. Rally Cry pulls the music down 4 dB.
  - The attack time constant is 25 ms and the release is 300 ms, so the music doesn't pump.
  - Volume automation on a duck gain, with the deepest active duck winning. The engine's 60 ms clock releases it.
- **The pause gate.** A paused battle fades `world` (music and field sounds) out in about 0.35 s and refuses new field sounds. UI sounds still play. When the battle is left or restarted, the gate opens again (`index.ts`, on the Battle scene's start and shutdown).
- **Juice tiers → sounds** (`JUICE_SFX` in `hooks.ts`). Each tier lands once per 300 ms of real time, like FL-01's shake. These play on top of the per-man sounds that were already there:

  | Tier | Event | Tier sound | Already there |
  | --- | --- | --- | --- |
  | kill | `death` | (none) | the death cry |
  | ability | `ability` | (none) | the ability's own sound |
  | impact | `impact` | `thud` (a deep body thud) | `impact` per man |
  | stakes | `stakesBreak` | `splinter` | (nothing before) |
  | standard | `standardLost` | `standardFall` (cloth, the pole, a drum) | (nothing before) |
  | rout | `rout` | `groan` (a crowd groan) | `rout` cries, `hornLow` when it's mine |
  | army break | `armyBreak` | `hornChord` (two horns a fifth apart, falling, plus drums; it ducks) | (nothing before) |

  These come through the existing channel: `battleAudio`, which `handleEvents(drainLogged(sim))` already calls. No new BattleScene edit was needed for them.
- **Signature actives** (AB-02) now have their own sounds: push → `shove`, bond → `bond`, sunder → `sunder`, aimed → `aimed`, scythe → `scythe`. A war cry stays the battle cry, and a re-charge stays the hooves.
- **Works:**
  - `worksStakes` (mallet knocks), `worksDig` (spadefuls), `worksLaager` (wheel creak and clunk), and `worksLift` when a work is taken up.
  - In battle, a charge breaking on stakes is the `splinter` tier above.
- **SFX variation.** Every recipe draws pitch, filter and timing jitter from the seeded `AudioRng` (not the sim's), as before. The new recipes do the same.
- **The haptics map** (`src/audio/haptics.ts`, `HAPTICS`). Each tier says who fires its haptic:
  - **The scene** fires kill (mine → warning), ability (mine → heavy) and rout (mine → error), as before.
  - **Audio** fires impact (mine → medium), stakes (medium), standard (mine → warning, theirs → light) and the enemy's army break (success).
  - A row never buzzes from both. They share the 300 ms gap. The Haptics setting gates all of them through `setHaptics`.
- **Unlock** (unchanged, verified):
  - The AudioContext is created only inside a real user gesture (pointer, touch or key listeners).
  - A 1-sample buffer is played to unlock iOS.
  - The context suspends when hidden, when Telegram is deactivated, or when muted. No context is created while muted.
- **Persistence.** The Sound toggle, Music and Effects are in the save (`settings.sound`, `musicVol`, `sfxVol`). audio-smoke now changes them, reloads, and checks they're still set.

## Sound sources

All sounds are procedurally synthesized Web Audio (`src/audio/sfx.ts`, `synth.ts`, `music.ts`). No audio files were added and nothing was downloaded. The procedural soundscape the playtest praised is kept as it was, apart from the new levels in dB (decision 2). The `audio.html` preview page lists the new sounds too.

**Bundle delta:** about **+6.8 KB minified, +2.0 KB gzip**.

- `engine-*.js` grew 25,086 → 30,369 B (gzip 8,566 → 10,124).
- `main-*.js` grew 3,526,648 → 3,528,169 B (gzip 1,068,220 → 1,068,700).

## Hooks outside `src/audio/**` (listed as the plan asks)

- `src/scenes/BattleScene.ts`, three one-line calls plus the import line:
  - `battlePaused(p)` in `setPaused`.
  - `worksPlaced(g.type)` in `placeWork`.
  - `worksRemoved()` in `removeWork`.

  The pause and the works placement in deployment reach no event channel. `battleAudio` runs only on drained sim events, and the sim doesn't step while paused or deploying. So these three couldn't hang off Juice or drainLogged.
- `src/ui/settings.ts`, one argument: the Effects volume preview plays `{ bus: 'ui' }`. Without it, the preview would be silent when Settings is opened over a paused battle, which is the usual case because the ⋯ menu pauses.

## Decisions

1. **"No sound while paused unless UI" includes the music.** The gate fades both music and field sounds. Tails are faded, not cut, in about 0.35 s. An event that auto-pauses the fight (a rout with "pause on rout" on) starts its sound, and the gate fades it within a third of a second. Music scheduling runs on under the closed gate, so Play resumes in time.
2. **2 dB a step.** The old curve was step^1.6. At the defaults (Music 6, Effects 7) the new levels are about 1 dB quieter, which is within taste. The quiet end is no longer near-silent (step 1 is -18 dB, not -33 dB).
3. **The UI bus follows Effects** instead of getting a third slider. No dead or new controls (V5-072).
4. **The tier sounds go on top of the per-man sounds**, not in place of them. The thud and the groan give a line or an army a weight a single man's sound can't. They're rate-limited like the shake.
5. **The army break sounds for both sides.** It's the battle's turning point either way. Only the enemy's break buzzes (success). Mine already buzzes as the rout's error.
6. **The haptics map lives in `src/audio`** (FL-03 owns "haptics map"), but the scene's existing haptics are only listed in it, not moved. Moving them would mean BattleScene edits outside the 1–3 line budget.
7. **The ducking horns bypass the SFX duck** (they're the sidechain key). That way the army-break chord doesn't duck itself.
8. **The Settings Effects preview is a UI-bus sound** (decision via `PlayOpts.bus`). The UI bus has the same Effects level, so the preview still sounds like what you set.

## Checks

- `tsc` clean.
- vitest: 120 files, 1456 tests. `tests/audio.test.ts` has 33, of which 17 are new: mixer dB, ducks, pause gate, per-id counts, the tier, ability and works maps, the haptics map, the real hook with juice events and the pause, and sim independence.
- `vite build` OK. replay-hash 13/13 (Node and Chromium; WebKit isn't installed on this machine).
- audio-smoke: ALL PASS. That's 3 runs: no Web Audio, Web Audio, and persist. It checks the buses, the juice tiers through the real hook, the duck down and back, the pause gate with UI still sounding, and the reload persistence.
- smoke: ALL PASS (46).
- `npm run regression`:
  - hub-flows, sheet-layout and replay-hash passed.
  - battle-kinds failed once at "[tutorial] the guided battle", under machine load: 420 s against a usual ~110 s. A re-run with `--only battle-kinds` passed (113 s). The step doesn't touch audio.

## What's missing / follow-ups

- **Interaction-pattern UI sounds** (interaction-patterns.md "Sound Standards"):
  - "Disabled tap: soft thud", "Destructive confirm: low drum" and "Undo: reverse swish" aren't wired. Their callers are in `src/ui/kit.ts` and BattleScene's undo, which are outside FL-03's files.
  - The recipes would be small (frameDrum, a reversed noise sweep). `uiError` already plays on refusals.
- **No human-recorded assets are needed.** The plan asks for none.
- **A real-device listen** on an iPhone in Telegram, and on Android, is still to do. Headless Chromium checks the graph and the gains, not how it sounds.
- **The undo of a works placement** (`ui/input/undo.ts`) re-lays or lifts a work without a sound. That's minor, and it's BattleScene's undo path.
