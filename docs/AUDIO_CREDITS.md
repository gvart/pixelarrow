# Audio credits and licences

Every sound the game plays is synthesised live in the browser with the Web Audio API. The repository ships
**no recorded audio**: no samples, no music files, no third-party sound libraries. So there is nothing to
credit or license beyond this project's own code.

| What | Where | Source | Licence |
| --- | --- | --- | --- |
| Battle and UI sound effects (clashes, missiles, horns, crowd, clicks) | `src/audio/sfx.ts` | procedural (noise, oscillators, Karplus-Strong plucks, waveshaping in `src/audio/synth.ts`) | project code |
| War sound effects: combat (wounded cry), siege (ram, thrower, ladder, fire, wall collapse), work (chop, mine, hammer, cart wheels, mule), guardians (Drakon roar, wing beats, breath charge, crash, sweep, Scylla, Gyges' chains and bellow, Chimera, Brontes' thunder and anvil, the Bandit King's horn, the Maenad frenzy, slain), UI (radial, panels, notices) | `src/audio/sfx.ts` (the war block) | procedural | project code |
| Music: menu, deploy, battle, war explore, war boss | `src/audio/music.ts` | procedural sequencer (lyre, frame drums, aulos, drone, horn) | project code |
| Ambience beds: wind, mountain gale, desert wind, forest birds, river, sea, town murmur, fire | `src/audio/ambience.ts` | procedural | project code |

## Rules for adding audio

- Only add audio we may ship: our own procedural code, our own recordings, or CC0 or public-domain files.
- No rips from games, films or commercial libraries, and no "royalty-free" packs whose licence forbids
  redistribution in source form.
- Every recorded file needs a row here: the file path, the original URL, the author, the licence (with a
  link to it) and the date you downloaded it.
- Use compressed formats (Ogg Opus or Vorbis, with an AAC/M4A fallback for Safari). Lazy-load music and
  ambience per region, and never put them in the first-load bundle.

## Bundle cost

Procedural audio costs code, not assets: the whole audio layer (engine, recipes, music, ambience and the
war hook-up) is a few tens of kB of minified JS, and it downloads nothing at runtime. An ambience bed's
nodes are only built when the camera is over its biome, and they are torn down after 8 s of silence.
