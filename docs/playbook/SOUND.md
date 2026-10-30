# Sound

The war's generated sounds (ElevenLabs sound effects). The runtime is `src/audio/bank.ts` (ids, variants shipped, mix
trims, rate caps), `src/audio/samples.ts` (lazy loader and player), `src/audio/loops.ts` (biome loops and crossfade);
the war wires them in `src/war/view/sound/warAudio.ts`. Anything without files falls back to its procedural recipe
(`src/audio/sfx.ts`, `src/audio/ambience.ts`).

## Rules

- **Style suffix** (the generator appends it to every prompt): `dark epic ancient Greek bronze age, gritty, close and
  dry, realistic foley, no music, no voice, no speech`. Loops instead get `seamless ambience loop, no music, no voice`.
- **One pass, then rerolls.** Generate the list once; listen; reroll only the bad ones (`--only id,id`). Log each
  reroll's new prompt in the table.
- **Files:** `public/war/sfx/<id>-<k>.ogg` (Opus) and `.m4a` (AAC, Safari's fallback), k = 1..variants. Trimmed of
  silence, faded 5 ms in and 30 ms out, mono for one-shots, stereo for loops, normalised to the table's LUFS (one-pass
  `loudnorm`, true peak -1 dB). Opus 48 kbps one-shots, 64 kbps loops; AAC 64 / 80 kbps.
- **Budget:** whole bank under 6 MB per format, lazy-loaded: nothing at startup, an id's variants on its first play.
- **Shipping:** set `v` in `SAMPLE_BANK` to the variants that passed; `tests/war/soundBank.test.ts` checks the files
  exist and that the table and the bank agree.
- **Mix:** buses master, effects, interface, ambience (Settings, Sound). Pitch jitter and variant picking in the bank;
  crowded fights are capped by each id's `rate` and the engine's voice limiter.

## Generate

```bash
nice -n 19 node scripts/war/gen-sounds.mjs            # every row without files
nice -n 19 node scripts/war/gen-sounds.mjs --only hit.metal,beast.wolf.cry --force
```

The key is read from `~/.config/pixelarrow/elevenlabs.env` (`ELEVENLABS_API_KEY=...`) at run time; never print or
commit it.

## The list

Columns: id, variants, seconds, target LUFS (integrated), prompt.

### Combat: men

| id | n | s | LUFS | prompt |
| --- | --- | --- | --- | --- |
| hit.metal | 4 | 0.6 | -16 | single bronze sword striking a bronze shield rim, sharp clang with short ring |
| hit.spear | 3 | 0.6 | -16 | spear point thrusting into a bronze-faced wooden shield, hard knock and scrape |
| hit.wood | 3 | 0.5 | -16 | loud sword blow on a thick wooden shield, hard wooden crack and knock |
| hit.heavy | 3 | 0.8 | -14 | huge body slamming into armoured men, deep low thud, ground shake |
| death.man | 3 | 1.2 | -18 | soldier killed in battle, short choked groan and body falling in armour on dirt |
| cry.wounded | 3 | 1.0 | -18 | wounded soldier gasping in pain, short hoarse cry |
| sting.chief | 1 | 2.5 | -15 | a beast chieftain slain, low war drum hit with a dark brass swell and fading echo |
| sting.boss | 1 | 4.0 | -14 | colossal mythic monster slain, huge collapse, deep brass and choir-less rumble fading |

### Combat: beasts

| id | n | s | LUFS | prompt |
| --- | --- | --- | --- | --- |
| beast.wolf.attack | 3 | 0.6 | -16 | wolf lunging and biting, snarl and jaws snapping |
| beast.wolf.cry | 2 | 2.5 | -16 | lone wolf howl at dusk, cold and distant |
| beast.wolf.death | 2 | 1.0 | -18 | wolf yelp and whimper as it falls |
| beast.boar.attack | 3 | 0.6 | -16 | wild boar goring, squealing grunt and tusk impact |
| beast.boar.cry | 2 | 1.5 | -16 | angry wild boar squeal and snort |
| beast.boar.death | 2 | 1.0 | -18 | wild boar dying squeal, heavy body thud |
| beast.bear.attack | 3 | 0.8 | -15 | bear swiping with claws, roar burst and heavy paw impact |
| beast.bear.cry | 2 | 2.0 | -15 | huge brown bear roaring, deep and wet |
| beast.bear.death | 2 | 1.5 | -18 | bear dying groan, heavy body collapsing |
| beast.lion.attack | 3 | 0.7 | -15 | lion pouncing, snarl and claws tearing |
| beast.lion.cry | 2 | 2.5 | -15 | male lion roar over open plain |
| beast.lion.death | 2 | 1.2 | -18 | lion dying growl fading out |
| beast.jackal.attack | 3 | 0.5 | -17 | jackal snapping bite, yip and snarl |
| beast.jackal.cry | 2 | 2.0 | -17 | jackals yipping and howling in the desert night |
| beast.jackal.death | 2 | 0.8 | -19 | jackal yelp as it dies |
| beast.ibex.attack | 3 | 0.6 | -17 | wild goat butting with horns, hard horn knock |
| beast.ibex.cry | 2 | 1.2 | -17 | wild mountain goat bleat echoing on rock |
| beast.ibex.death | 2 | 0.8 | -19 | goat bleat cut short, body falling on stones |
| beast.serpent.attack | 3 | 0.6 | -16 | giant serpent striking, sharp hiss and lunge |
| beast.serpent.cry | 2 | 2.0 | -16 | giant snake long rattling hiss |
| beast.serpent.death | 2 | 1.2 | -18 | huge snake thrashing and going limp, fading hiss |
| beast.scorpion.attack | 3 | 0.5 | -16 | giant scorpion stinger strike, chitin click and stab |
| beast.scorpion.cry | 2 | 1.5 | -16 | giant scorpion clattering pincers and chittering |
| beast.scorpion.death | 2 | 1.0 | -18 | giant insect shell cracking, legs scraping still |
| beast.harpy.attack | 3 | 0.6 | -16 | harpy diving and clawing, wing flap and shriek |
| beast.harpy.cry | 2 | 1.5 | -16 | harpy screech, half bird half woman, harsh |
| beast.harpy.death | 2 | 1.0 | -18 | harpy dying shriek and feathers thumping to ground |
| beast.cyclops.attack | 3 | 0.9 | -14 | giant swinging a tree club, whoosh and crushing impact |
| beast.cyclops.cry | 2 | 2.5 | -14 | one-eyed giant bellowing in rage, deep and huge |
| beast.cyclops.death | 2 | 2.0 | -16 | giant falling, dying groan and earth-shaking crash |
| beast.drake.attack | 3 | 0.7 | -15 | small dragon biting with fire crackle and jaws snapping |
| beast.drake.cry | 2 | 2.0 | -15 | young dragon screeching roar, reptilian rasp |
| beast.drake.death | 2 | 1.2 | -17 | dragon dying rasp, smoke hiss, body thud |

### Interface

| id | n | s | LUFS | prompt |
| --- | --- | --- | --- | --- |
| ui.click | 3 | 0.5 | -24 | small bronze stud tapped on wood, soft dry click |
| ui.open | 2 | 0.5 | -24 | leather map case flap opening, soft parchment rustle |
| ui.close | 2 | 0.5 | -24 | parchment scroll rolled shut, soft leather tap |
| ui.error | 1 | 0.5 | -22 | one firm low wooden thump, short and dry, a refusal |
| ui.coin | 2 | 0.6 | -22 | a few bronze coins dropped into a leather purse |
| ui.reward | 1 | 1.5 | -20 | treasure chest lid opening, coins and bronze jingle, warm |

### World

| id | n | s | LUFS | prompt |
| --- | --- | --- | --- | --- |
| world.raidHorn | 1 | 3.0 | -16 | distant ancient war horn, long low blast, warning of raiders |
| world.warlordFall | 1 | 3.5 | -16 | warlord defeated, heavy armour crash then a grim low horn fading |
| world.mastery | 1 | 3.5 | -17 | triumphant ancient brass fanfare, salpinx horns and frame drum, short |
| world.secret | 1 | 2.0 | -19 | a hidden secret found, low eerie chime with stone grinding open |
| world.soulWake | 1 | 2.5 | -19 | a dead soul waking, cold ghostly breath rising with a faint low hum |

### Ambience loops

| id | n | s | LUFS | prompt |
| --- | --- | --- | --- | --- |
| amb.moors | 1 | 20 | -30 | cold wind over bleak moorland heath, distant crow, grass hiss |
| amb.surf | 1 | 20 | -30 | waves breaking on a rocky shore, slow surf and shingle wash |
| amb.glacier | 1 | 20 | -30 | high mountain glacier wind, icy gusts, faint ice creak |
| amb.forest | 1 | 20 | -30 | dark oak forest, leaves in wind, distant birds, creaking boughs |
| amb.steppe | 1 | 20 | -30 | dry wind over endless grass steppe, insects, far hawk cry |
| amb.town | 1 | 20 | -28 | ancient town at dusk, distant crowd murmur, hammer on anvil, cart wheels |

## Prompt log

Rerolls go here: date, id, why, the new prompt.

- 2026-10-31, first pass: 120 clips, eleven_text_to_sound_v2, prompt_influence 0.5; with the 6 rerolls below
  2515 credits in all (about 10 per second of audio asked for; the free tier's 10k a month). Read the spend off
  `/v1/user/subscription` a minute after a run: the count lags.
- 2026-10-31, hit.wood 1-3: came back near silent (raw -46 to -49 LUFS); was "heavy blow on a leather-covered wooden
  shield, dull thick knock", now the table's prompt.
- 2026-10-31, ui.error 1: near silent (raw -49 LUFS); was "dull wooden knock with low muted thump, refusal".
- 2026-10-31, hit.metal 1-2: quiet and thin (raw -34 LUFS), same prompt rerolled.
