# v5 Asset log and Gemini queue

Owner: the `assets` agent (the only agent that touches Chrome). Other stories add requests to the queue. Every entry records the prompt, the file in `docs/v5/gemini/` and the processed destination.

## Queue

Empty. The AS-07 Nikias prompts were sent in AS-08 (below).

## Done

### I5a Shield-bearing foot classes animated: royal_guard, sacred_band, thureophoros, militia, peltast, javelineer (2026-10-18)

**Brief.** I5a takes each of the six classes from its approved I4a base (`docs/v5/pixellab/bases.json`) to a full packed sheet, matching the shipped hoplite. That means the hoplite's 16 clips (frame counts, fps, scale and anchors), 12–16 frames each, and dark-epic art that stays identical to the base. Each class's melee attack is a weighted full-body one-hand attack moving with the shield: the hoplite thrust recipe for spears, a cut along the blade for the sword, and a javelin `throw` for javelineer and peltast. Every frame passes the I3a hard-reject list. Tiers are runtime recolours (V5-092, V5-098). The budget cap is 1,050 generations for the six, with at most 3 PixelLab jobs at a time on the shared Tier 2 account.

**Tools.** The new scripts are in `scripts/art/pixellab/i5a/`. The shared scripts are unchanged, apart from main's additive `parts` / `crest` / `emblem` / `stature` spec options (STYLE_LOCK §5).

| script | what it does |
| --- | --- |
| `prep.mjs <class> [--upload url]` | Builds the first frames from the base rotations and uploads them. `rot` is 68, `tall` is 96 x 112, `die` is 128 x 128, `guard` is 128 x 112 with the spear levelled, and `guardflat` is SE with `--vec 1,0.22`. |
| `guard.mjs` | Makes a levelled-spear guard frame with no hand measuring. It finds the upright spear (`findSpear`), takes the fist from the skin on the line and erases the old spear along its line. Then `spear.mjs` redraws it in the class's own shaft and head colours. |
| `prompts.mjs <class> <anim> <dir>` | Prints the fields of every call. These are the hoplite's §15 prompts with each class's subject, shield and weapon words. |
| `job.mjs` | Logs every job to `docs/v5/pixellab/I5a/<class>/jobs.json`, in the `fetchjobs.mjs` format, with the gens quoted. |
| `spec.mjs <class>` | Writes the sheetbuild spec from `class.json` (picks, frame fixes with the reason for each, ramps, parts) and the hoplite's clip table, so the timings are the same. |
| `partsview.mjs` | Shows false-colour colour groups, to check a spec's `parts` before a build. |
| `feet.mjs` | Measures `rowsFeet`. |
| `battle.mjs` | Takes real-battle screenshots with the men's classes swapped. |

Rebuild a class: `node scripts/art/pixellab/fetchjobs.mjs docs/v5/pixellab/I5a/<class>/jobs.json docs/v5/pixellab/I5a/raw/<class> && node scripts/art/pixellab/i5a/spec.mjs <class> && node scripts/art/pixellab/sheetbuild.mjs docs/v5/pixellab/I5a/<class>/<class>.sheet.json`. Raws are in `docs/v5/pixellab/I5a/raw/` (gitignored). The base rotations are refetched with `fetch.mjs <character id>`.

#### royal_guard (base `49cc24c8`, A1)

The hoplite's full set of 16 clips in 4 facings: idle, look, adjust, walk, run, rout, kneel, ready, charge, brace, block, stagger, fallBack, fallFwd, cheer and thrust. Every clip was tested in SW first and passed. Then came NE and NW, then SE.

- **Calls and costs.** 71 jobs, **111 gens quoted**: 64 pixminimax (1 at 68, 1 at 96 x 112, 2 at 128) and 4 skeleton-v3 thrusts (3 each). The prompts are `i5a/prompts.mjs royal_guard …`, and every job id is in `jobs.json`.
- **Thrust.** The skeleton-v3 keypoints are `rig.mjs thrust <dir> guard_<dir>.png --grip <fist>`. The fist comes from `guard.mjs`: SW `71,62`, NE `58,65`, NW `87,65`, SE `36,61` on `guardflat`. The strike is on frame 6.
- **Sheet.** Shipped as `src/assets/sheets/royal_guard/{royal_guard.png, manifest.json}`.
  - 202 columns of 129 x 114, wrap 31: a 3999 x 3192 image, **48.7 MB decoded**.
  - Packed by the build to **10.11 MB decoded** (core 8.41 MB) and a 278.5 KB download.
- **Colour groups.**
  - The `parts` are `purpleBlack→cloak` (the royal-purple cloak, exclusive), `metal→metal` and `crimson→shadow`. The class has no crimson, so any crimson left after the cut is blood; mapped to shadow, it is never recoloured.
  - `crest` and `emblem` are false.
  - Main's suggested `linen→crest` was dropped: on this base the linen steps are the silver shield's highlights, not the plumes. In the remap the plumes and the silver face are in `metal`.
  - `linen` is left out of `ramps` because it cast the silver shield cream. Even so, PA-WORLD-DARK has no neutral grey, so the "dull tarnished silver" shield shows as warm grey-tan. The I4a roster, which was approved, has the same remap.
  - Tiers are the I3a anchors: veteran is a wine cloak with polished trim, elite a black cloak with gold trim. There is no crest group.
- **QC.** `qc.mjs`: **0 failures**, 62 warnings.
  - Every warning is the spear-end heuristic: "both ends wide" or "thin end leads" on lying bodies, on levelled shafts that pass behind the shield, and on the cut stubs of the spear the brace grounds. Each was checked by eye on the strips.
  - Stature (spec `"stature": {"skipTop": 5}`, which drops the plume rows) is 58, 56, 57 and 56 px for SE, NE, SW and NW. The feet are on the anchor and nothing is clipped.

| # | Clip / facing | Attempt | Outcome |
| --- | --- | --- | --- |
| 1 | all 16, SW | a1 / p1 | **Promoted.** Block f3 is replaced by f4, because the spark burst shredded the shield face once cut. Stagger f0 is replaced by f1 (the spear pivots to the ground for one frame). In fallBack, f2 is replaced by f3 (blood over the chest left holes once cut). |
| 2 | idle, look, walk, rout, ready, charge, brace, stagger, fallFwd, cheer, thrust, NE and NW | a1 / p1 | **Promoted.** In stagger NE, f0 is replaced by f1 (the shield showed its silver face). In stagger NW, f0 and f1 are replaced by f2 (he turned west and the spear smeared). |
| 3 | adjust NE | a1 | **Rejected (shield face):** in a back view the shield swings round and shows its silver face (f1–f4). |
| 4 | adjust NE | a2 | **Promoted.** The prompt adds "keeps its back to the viewer in every frame, its face turned away from the viewer". |
| 5 | run NE | a1 | **Rejected (shield vanishing):** the shield is almost gone in f2–f3, then turns its bright face round. |
| 6 | run NE | a2 | **Promoted.** The prompt adds "clearly visible … at his left side …, its dark back and rim towards the viewer, never turning its face round". |
| 7 | kneel NE | a1 | **Rejected (shield face):** the silver face and a saturated gold rim show in a back view. |
| 8 | kneel NE | a2 | **Promoted.** |
| 9 | brace NE | a1 | **Rejected (shield face):** he turns side-on and shows the silver face and a gold rim. |
| 10 | brace NE | a2 | **Promoted.** The NE line "seen from behind, the shield's dark back and rim face the viewer in every frame, never its silver face" is now added to every royal_guard NE prompt. |
| 11 | block NE | a1 | **Rejected (weapon pivot):** the levelled spear swings upright (f1–f3) and the shield shows its face. |
| 12 | block NE | a2 | **Promoted.** f3 and f4 are replaced by f2 (the silver face and sparks again). |
| 13 | fallBack NE | p1 | **Rejected (shield vanishing):** the shield face came out near-white, so the invented-colour cut hollowed it out. Blood also took the spearhead. |
| 14 | fallBack NE | p2 | **Promoted.** The prompt adds "dull and dark". f1 is replaced by f2 (blood had cut the spearhead loose). |
| 15 | fallBack NW | p1 | **Promoted.** f1 is replaced by f2 (the same loose spearhead). |
| 16 | all 16, SE | a1 / p1 | **Promoted.** In block SE, f2 is replaced by f1 (the spark streak). In stagger SE, a red `clear` was needed on f0 and f1 (a blood streak across the shield). In fallFwd SE, f0 and f1 are replaced by f2 (blood had broken the shield). |
| 17 | fallBack SE | p1 | **Rejected (weapon doubled):** two spear shafts while he falls (f5–f7), and blood over the shield. |
| 18 | fallBack SE | p2 | **Promoted.** The prompt adds "his one spear …, only one spear in every frame". f1 is replaced by f0 and f2 by f3 (blood over the shield). |

**Rejection count.** Whole clips:
- shield face or shield vanishing: 5 (adjust, run, kneel and brace NE; fallBack NE)
- weapon pivot: 1 (block NE)
- weapon doubled: 1 (fallBack SE)

Frames replaced: 15.
- 8 for invented sparks or blood that broke the shield or spear once cut
- 3 for a pivoting or smeared spear
- 2 for the shield face
- 2 more held frames in block NE

There were **0** reversed or double-ended spears, heads turned backwards, heads clipped by the canvas, or proportion drifts. The cloak, helmet and plumes keep the base's shapes in every frame.

**Lessons.**
- A bright shield face is a problem in the NE back view. pixminimax keeps swinging the shield round to show its face (5 of the 7 rejects), so name its dark back in every NE prompt.
- Bright silver also goes near-white in the falls, and the colour cut then hollows it: say "dull and dark".
- In death clips, a class with no crimson of its own should map `crimson→shadow`, so blood left on the body never joins the cloak group.

#### royal_guard SE guard fix (main's review, same day)

The SE leaf head did lead (it was at the down-right end in every frame), but the spear read as trailing. With the I3a guard geometry (head 38 px ahead of the fist, butt 20 behind), the leaf sat behind the shield's lower rim and the long butt up-left looked like the point. The hoplite has the same geometry.

The fix is a new SE guard and SE flat-guard frame from `i5a/guard.mjs --ahead 52 --behind 10`, which `prep.mjs` now uses for every spear class. ready, block, stagger and thrust SE were redone from it as **a2**: 9 gens, and **120 gens in all for the class**. The leaf now clears the rim and leads in every frame. Stagger SE a2 f0 has a `clear` over motion-streak lines behind the shield. charge and brace SE keep a1, because the model levels the spear with its head clearly ahead from f1.

STYLE_LOCK §6 gained an additive "SE guard" note. Zooms are in the scratchpad: `se_zoom_royal_guard_v2.png`. QC: 0 failures.

#### hoplite SE guard fix (routed to I5a by main)

The shipped hoplite had the same SE geometry as royal_guard: its leaf head led, but behind the shield rim. I redid four of its SE clips from an equivalent grip-back SE guard, made with `i5a/guard.mjs --ahead 52 --behind 10` on the H4 SE rotation (`docs/v5/pixellab/I3/raw/first5/`):

- ready **s2** and block **s2** (pixminimax 2 each)
- thrust **s2** (skeleton-v3, 3: `rig.mjs thrust south-east guard2flat --grip 35,61`)
- stagger **s3** (pixminimax 2). stagger s2 was **rejected (invented item / weapon doubled)**: an invented brown smear came off the shield in f0, and a second spear tip appeared in f1.

That is **11 gens**. The jobs were added to `docs/v5/pixellab/I3/jobs.json` (and also logged in `docs/v5/pixellab/I5a/hoplite/jobs.json`), and the picks are in `hoplite.sheet.json`.

The rebuild leaves the NE, SW and NW rows byte-identical; the check was a pixel diff, with 0 changed pixels outside the SE row. The colour groups and tiers are unchanged too. The SE anchor moved from x 49 to 42 because the shorter butt shrank the row's left extent, so all SE frames sit 7 px further left in the image. On screen they are identical, because the runtime draws them from the anchor. QC: 0 failures. Zoom: scratchpad `se_zoom_hoplite_v2.png`.

#### sacred_band (base `2b900b89`, A1)

The hoplite's 16 clips in 4 facings, built the way royal_guard was: every clip tested in SW first (all passed), then NE and NW, then SE. The guard frames came from the grip-back SE guard from the start (`prep.mjs`: head 52 px ahead of the fist, butt 10 behind), so no SE redo was needed for the spear's reading.

- **Calls and costs.** 68 jobs, **105 gens quoted**: 64 pixminimax (1 at 68, 1 at 96 x 112, 2 at 128) and 4 skeleton-v3 thrusts (3 each). The prompts are `i5a/prompts.mjs sacred_band …`, and every job id is in `jobs.json`.
- **Thrust.** `guard.mjs` found the same fist as on royal_guard (both bases come from H4), so the royal_guard keypoint files were reused: SW, NE and NW are identical, and SE differs by 0.5 px. The strike is on frame 6.
- **Sheet.** Shipped as `src/assets/sheets/sacred_band/{sacred_band.png, manifest.json}`.
  - 202 columns of 122 x 112, wrap 33: a 4026 x 3136 image, **48.2 MB decoded**.
  - Packed by the build to **9.97 MB decoded** (core 8.17 MB) and a 266.8 KB download.
- **Colour groups.** The `parts` are `purpleBlack→cloak` and `metal→cloak` (the blue-black cloak spans both ramps in the remap) and `crimson→shadow`, so blood left after the cut and the dark-red club emblem are never recoloured. `crest` and `emblem` are false. Tiers are the I3a anchors (veteran wine cloak, elite black cloak).
- **QC.** `qc.mjs`: **0 failures**, 91 warnings.
  - Every warning is the spear-end heuristic ("thin end leads" on upright spears whose butt meets the feet in idle, look, adjust, run and kneel; "both ends wide" on charge NW, brace SE and the run SE shaft behind the shield) or brace SE feet 105 vs anchor 102 (the braced crouch's wide stance). Each was checked by eye on the strips.
  - Stature is 57, 58, 57 and 58 px for SE, NE, SW and NW. Nothing is clipped.

| # | Clip / facing | Attempt | Outcome |
| --- | --- | --- | --- |
| 1 | all 16, SW | a1 / p1 | **Promoted.** In fallBack, f0 and f1 are replaced by f2 (a blood burst; holes in the body once cut). In stagger, f2 is replaced by f3 (motion lines along the spear read as a forked second head). In block, f2 is replaced by f3 (spark residue over the rim). |
| 2 | all 16, NE and NW | a1 / p1 | **Promoted.** adjust, run and kneel NE used royal_guard's a2 wordings from the start, and every NE prompt ends with the dark-back line, so no NE shield-face rejects this time. In fallBack NE, f1 is replaced by f2 (the spearhead cut loose by blood). In block NW, f0 is replaced by f1 (the shield hollowed by a cut spark) and f2 by f3 (spark dashes). |
| 3 | fallBack NW | p1 | **Rejected (blood):** a heavy red spray over the cloak and body f0–f5; once cut, the body is shredded. |
| 4 | fallBack NW | p2 | **Promoted.** The prompt adds "no blood at all, no red spray, no effects, no particles". f0 and f1 are replaced by f2 (a red streak across the spear), and f3 has a `clear` over a blood speck. |
| 5 | walk, look SE | a1 | **Not used:** submitted at 12 frames by mistake (the clips are 16). Redone as a2 at 16; 2 gens lost. |
| 6 | run SE | a1 | **Rejected (head / helmet drift):** the wide-brimmed Boeotian helmet morphs into a tall crested peak (f4–f11). |
| 7 | run SE | a2 | **Promoted.** The prompt adds "his head keeps facing the lower right and the wide-brimmed Boeotian helmet keeps the same round shape in every frame, no crest, no plume". |
| 8 | every other clip, SE | a1 / p1 | **Promoted.** In stagger SE, f0 is replaced by f11 (an invented second shaft through the shield), and f1 and f2 have a `clear` over a dark smear and a speck. The block SE spark burst and the fall SE blood cut cleanly. |

**Rejection count.** Whole clips:
- blood: 1 (fallBack NW)
- head / helmet drift: 1 (run SE)
- (plus 2 SE clips redone for my wrong frame count)

Frames replaced: 10, plus 4 `clear` boxes.
- 7 for invented sparks or blood that broke the shield, spear or body once cut
- 3 for an invented streak, a forked-looking head or a second shaft

There were **0** reversed or double-ended spears, missing or doubled shields, heads turned backwards or clipped, or proportion drifts.

**Lessons.**
- Naming the shield's dark back in every NE prompt from the first call removed the NE shield-face rejects (5 on royal_guard, 0 here).
- pixminimax can reinvent a helmet in a fast clip; name the helmet's shape when it is not the generic crested one.
- Check the clip table's frame count per clip (walk and look are 16) before submitting.

#### thureophoros (base `270a1787`, A1)

The hoplite's 16 clips with `slash` (a one-hand sword cut) in place of `thrust`. Every clip was tested in SW first. A sword class has no levelled-spear guard, so `ready` was made first from the padded rotation (sword low), and its f4 (the sword forward at the waist) became each facing's guard first frame (`first/gready_<dir>.png`) for charge, brace, block, stagger and slash.

- **Calls and costs.** 72 jobs, **111 gens quoted**: 71 pixminimax and 1 skeleton-v3 test. Prompts are `i5a/prompts.mjs thureophoros …` (the `SWORD` table); every job id is in `jobs.json`.
- **Slash.** pixminimax draws a weighted full-body cut (draw back over the right shoulder, step in behind the shield, diagonal cut, follow-through low), but in every facing it also paints a swoosh arc on the cut frames, and in SW a1 it bent the blade. The arc frames are replaced by their neighbours, so the cut snaps from high to low across one frame at 14 fps; the strike is on frame 6. NE needed a3 ("we watch him from behind and he never turns round … chops the blade down hard in front of him away from the viewer", last frame pinned to the guard) because a1 and a2 turned round to face the viewer.
- **Skeleton test.** `i5a/rig5.mjs` gained `WEAPONS.sword` and `CLIPS.slash1h` (I5b's `rig5b.mjs` documents a slash1h but does not define it). SW s1 kept the facing, but the sword hides behind the body and shield through the whole cut, so the blow does not read; rejected, and kept in the rig for later tuning.
- **Sheet.** `src/assets/sheets/thureophoros/{thureophoros.png, manifest.json}`: 200 columns of 99 x 111, wrap 41, a 4059 x 2220 image, **34.4 MB decoded**; packed by the build to **8.37 MB decoded** (core 6.63 MB), a 238.0 KB download.
- **Colour groups.** `parts`: `purpleBlack→cloak` (cloak and tunic skirt, as in I4a), `iron→weaponMetal` with `metalKind.weaponMetal: iron` (the iron blade follows the weapon's rarity on the iron ramp), `crimson→shadow` (blood is never recoloured). `spear: false`, `greyCut: 0.8` (keeps the lit blade), `crest`/`emblem` false. The lightest linen steps fall in `trim`, so the elite tier gilds the corselet's highlights.
- **QC.** `qc.mjs`: **0 failures**, 196 warnings, all the spear-line heuristic, which still runs on a sword class's clips ("both ends wide" / "no spear found"); checked by eye on the strips. Stature (spec `"stature": {"skipTop": 4}`, the pilos point) is 58, 56, 58 and 56 px.

| # | Clip / facing | Attempt | Outcome |
| --- | --- | --- | --- |
| 1 | all 16, SW | a1 / p1 (slash a2) | **Promoted.** slash a1 **rejected (weapon deformed / invented effect)**: the blade bends (f5) and a big swoosh (f6). a2 adds "perfectly straight and rigid … no swoosh arc, no motion trail"; f5←f4 (the curve again) and f6←f7 (the swoosh). Frames replaced: cheer f0←f1 (the sword shrinks to a stub), rout f9←f8 (the shield splits), fallBack f3←f4 and fallFwd f3←f2 (blood over the shield). |
| 2 | slash SW | s1 | **Rejected (weapon missing):** skeleton-v3 `slash1h`, the sword hidden through the cut. |
| 3 | slash NE | a1, a2 | **Rejected (facing flip):** he turns round to face the viewer (a1 f4–f11, a2 f6–f10), with swooshes. |
| 4 | slash NE | a3 | **Promoted.** f3←f2, f4←f5 (swooshes). |
| 5 | run NE | a1, a2 | **Rejected (shield vanishing):** the shield turns edge-on / hides behind the cloak (f4–f7). |
| 6 | run NE | a3 | **Promoted.** "the tall oval shield held out on the left arm beside his body, clearly visible … never hidden behind the cloak". |
| 7 | brace NW | a1 | **Rejected (weapon reversed):** the sword points backwards (east) f1–f11. a2 ("its point forward towards the upper left … never pointing backwards") promoted. |
| 8 | ready SE | a1 | **Rejected (weapon hidden):** the blade hides behind the shield. a2 ("held low and out at his right side … the whole blade clearly visible") promoted; its f4 is the SE guard. |
| 9 | every other clip, NE / NW / SE | a1 / p1 | **Promoted.** Frames replaced: slash NW f4←f3, f5←f6 and SE f3←f4 (swooshes); block NE f1←f0, f2←f3 (the shield's red face swings round in a back view); rout NW f1←f0, f7←f6 (the sword jumps past the shield); stagger NW f0←f11 and SE f0←f11 (streaks), NE f1 `clear` over a dark streak; fallBack SE f2←f1, f3←f4 (blood over the shield). The block sparks and fall blood elsewhere cut cleanly. |

**Rejection count.** Whole clips: invented effect / weapon deformed 1, weapon missing 1 (skeleton), facing flip 2, shield vanishing 2, weapon reversed 1, weapon hidden 1. Frames replaced: 22 plus 1 `clear` (8 swoosh, 6 blood or sparks, 4 weapon or shield glitches, 3 streaks, 1 stub). No doubled weapons or shields, no heads turned backwards or clipped, no proportion drift.

**Process note.** For a few minutes 4 of my jobs ran at once (run NE a2 was submitted while 3 were running); every other submission kept to 3.

**Lessons.**
- pixminimax paints a swoosh on any sword cut whatever the prompt says; plan on replacing those frames.
- In back views (NE) the model turns a cutting man round to face the viewer; describe the blow from behind ("we watch him from behind … chops away from the viewer") and pin the last frame.
- A sword's SE guard hides behind the shield unless the prompt holds it "out at his right side … the whole blade clearly visible".

### I5c Mounted and chariot clips: companion, horse archer, thessalian, chariot, from the I4b bases to game sheets (2026-10-18)

**Brief.** Animate the four approved I4b bases (`docs/v5/pixellab/mounted.json`) to the hoplite's standard: 12-16 frames a clip, dark-epic, each class identical to its base in every frame, real rider and horse proportions, weight in every attack (a lance driven with the horse's momentum, a javelin thrown with the torso turned, a bow drawn to the cheek), real gaits, spearheads lead, one head, one bow. Hard rejects frame by frame: extra or missing horse legs, rider merged into the horse, a doubled, reversed or missing weapon, a second bow, style or proportion drift, canvas clipping, unrequested sparks or blood. Tiers by runtime recolour (V5-092, V5-098); horse coats kept out of the skin and metal groups where the colours allow, the runtime flags (`variation`, `rarity`, I6) set where they do not.

**Tool and budget.** PixelLab MCP `animate_image_pixminimax`, at most 3 of my jobs at once, cap 330 generations for the four. Balance before: 3,917.50 left (985.50 used); after: 3,230.50 left (1,672.50 used), a change of 687 that includes other agents' jobs in parallel. **Mine by receipt: 145 gens** (companion 42, horse archer 42, thessalian 36, chariot 25; every clip 1 generation at 144 x 160 or 176 x 176, two jobs cancelled) of the 330 cap. Nothing left for review: every requested clip shipped in 4 facings (companion 9 clips, horse archer and thessalian 8, chariot 6); not made because the battle falls back: look, adjust, ready, block, and charge for the two missile riders (charge falls back to gallop). Battle screenshots with the runtime-mounted picker: `docs/v5/art/I5c-battle-riders.png`, `I5c-battle-chariot.png`; sheet previews `I5c-preview-<class>.png`.

**Recipe.** Every clip is generated on one **work canvas** per class (`scripts/art/pixellab/i5c/lib.mjs` CANVAS: riders 144 x 160 with the 100 rotation at 22,44, room to rear, fall and raise the weapon; chariot 176 x 176 at 24,40): `start.mjs` pastes the rotation (or a loop key) there, it is uploaded and passed as `first_frame_url`, `view: high top-down`, `direction` the facing, `subject_description` and `initial_pose` set (prompts.json). 144 x 160 at 12-16 frames bills **1 generation**. Results are aligned on the work canvas (`align.mjs`; the stored I4b gallop on its grown canvases by matching its keys), so the sheet spec has one canvas offset per clip family and `align: false`. Loops: idle and walk pinned (`last_frame_url` = the first frame); gallop, charge and rout keyed (start = end = a stretched mid-gallop frame) or an 8-frame stride cut from an entry run that already loops (`loopfind.mjs`). Detached dust clumps are cleared by `despeck.mjs`; sparks, white streaks, grey trails and blood splats by the pipeline's invented-colour cut. Jobs and verdicts: `docs/v5/pixellab/I5c/<class>.jobs.json`; prompts word for word: `docs/v5/pixellab/I5c/prompts.json` and `docs/playbook/PROMPTS_ART.md` › 20. Raws: `docs/v5/pixellab/I5c/raw/` (gitignored; `fetchall.mjs <class>` refetches). Build: `node scripts/art/pixellab/i5c/build.mjs <class> --qc <dir>` (derive, sheetbuild, finish, anchorcheck, qc).

#### companion (42 gens)

Clips (16 frames unless said): idle 12 @ 8, walk @ 14, gallop @ 16 (the I4b loop, reused), charge @ 16 (lance couched; SE/NE/NW keyed loops, SW an 8-frame stride twice), thrust @ 14 (strike 7: a couched drive with the horse lunging one stride), stagger 12 @ 12 (the horse shies and rears half up), fallFwd @ 12 (the horse goes down, the rider is thrown clear; serves fallBack and die), rout @ 16, cheer @ 10, hold 15 (lance raised, the horse rears once and stands). Not made: look, adjust, ready, block (the battle falls back to idle / stagger).

Sheet: `src/assets/sheets/companion/` 136 columns x 4 rows of 129 x 138, packed 14.55 MB decoded (core 12.58), 513 KB download. `qc.mjs`: 0 failures; warnings are the spear heuristic catching horse legs and reins as the longest thin line, and cheer's rearing frames off the feet row (expected); every frame checked by eye on the review sheets. Groups: cloak = purpleBlack (exclusive), skin = the rider's skin **and the bay coat** (the same three hexes), metal = umber 3 (helmet, cuirass, a few bridle pixels; not the coat), weaponMetal the lance head. Manifest: `variation.skin: false` (the coat would take the man's skin tone), rarity swap kept; no trim group (the bronze has no separate highlight step), so the elite tier is the black cloak only.

| clip | facing | attempt | job | prompt | gens | outcome |
| --- | --- | --- | --- | --- | --- | --- |
| idle | SW | a1 | `b114c90c` | C-idle-1 | 1 | usable: calm breathing, 4 legs, one lance; but the tail is out at frame 11 and down at 0 (a jump at the wrap). Re-rolled pinned (a2) |
| thrust | SW | a1 | `c11bc241` | C-thrust-1 | 1 | REJECTED: frames 3-7 the spear is reversed (leaf head at the back, behind the rider, while drawing back overarm) |
| stagger | SW | a1 | `6e0c67f2` | C-stagger-1 | 1 | accepted: shies, rears half up, drops back; 4 legs, one lance upright throughout |
| idle | SW | a2 | `3a339cc0` | C-idle-1 | 1 | accepted: pinned loop (last frame = the rotation), breathing, weight shift, tail swish; 4 legs, one lance |
| thrust | SW | a2 | `e1410f5a` | C-thrust-2 | 1 | accepted: lance couched, head leads in 16/16, the horse lunges a stride (5-9), held reach 8-9, back upright; a stray light blob at frame 11 is cut by colour |
| walk | SW | a1 | `79e3bdb3` | C-walk-1 | 1 | accepted: a high-stepping walk in place, pinned loop, 4 legs, one lance upright; a grey speck at the mouth (frame 8) cut by colour |
| idle | SE | a1 | `61c08bed` | C-idle-1 | 1 | accepted: pinned loop, tail swish and breathing, 4 legs, one lance |
| thrust | SE | a1 | `2171d812` | C-thrust-2 | 1 | REJECTED: frames 1-5 the lance swings back, its head behind the rider (reversed); 6-12 right |
| stagger | SE | a1 | `ae859c17` | C-stagger-1 | 1 | accepted: rears and drops back; an orange slash arc at frame 0 (invented) is cut by colour |
| idle | NE | a1 | `8f3f8d14` | C-idle-1 | 1 | accepted |
| thrust | SE | a2 | `9f627c21` | C-thrust-3 | 1 | accepted: the lance cocked back high (butt up behind, point forward, the head hidden by the horse's neck in 1-3, not reversed), then the lunge and a couched drive, head leading 4-15; white sparks at 5-6 cut by colour |
| idle | NW | a1 | `6ad6ec43` | C-idle-1 | 1 | accepted |
| stagger | NE | a1 | `f9ce17a6` | C-stagger-1 | 1 | accepted: rears and drops back; grey specks at the bit (9-11) cut by colour |
| walk | SE | a1 | `affbac17` | C-walk-1 | 1 | accepted: the lance comes upright during the walk and slants back for the pinned end |
| walk | NE | a1 | `397490f3` | C-walk-1 | 1 | accepted |
| fallFwd | SW | a1 | `4c60ec74` | C-fall-1 | 1 | fallback: the horse sinks to its knees and lies on its belly, the rider sprawled across its back (distinct, not merged); lance flat. Re-rolled for a clearer fall (a2) |
| thrust | NE | a1 | `e42f544e` | C-thrust-3 | 1 | REJECTED: from frame 6 the rider turns to face the camera and the lance points back (south-west) |
| walk | NW | a1 | `c5372094` | C-walk-1 | 1 | accepted |
| stagger | NW | a1 | `d03a4726` | C-stagger-1 | 1 | accepted: rears and lands; a white slash streak in 0-1 is cut by colour |
| thrust | NE | a2 | `51dad0ad` | C-thrust-4 | 1 | accepted: seen from behind throughout, the lance couched and leading north-east 0-11, the lunge at 7-8, back upright 13-15 |
| fallFwd | SW | a2 | `79c83ef1` | C-fall-2 | 1 | accepted: the horse buckles and goes down, the rider is thrown clear and lies on his back, the lance flat beside him; one lance, 4 legs while visible; grey specks cut by colour |
| thrust | NW | a1 | `58ceddbc` | C-thrust-4 | 1 | accepted: seen from behind, couched, head leads north-west 2-13, plain blunt butt behind; the lunge 6-9 |
| cheer | SW | a1 | `4025f171` | C-cheer-1 | 1 | accepted with a fix: lance raised and shaken, the horse rears (6-10) and prances, ends standing with the lance aloft (hold 15); frame 2 the lower end looks like a second head: copied from frame 1 |
| charge-entry | SW | a1 | `893ae3ee` | C-charge-1 | 1 | accepted: lance couched from frame 5, a real gallop; the 8-frame stride 7..14 loops (wrap 50% vs 60-69% between neighbours): charge = frames 7-14 twice |
| fallFwd | SE | a1 | `6dedaf95` | C-fall-2 | 1 | accepted: thrown off as the horse goes down, lies beside it; red specks at 12-15 cut as splats |
| cheer | SE | a1 | `dddb0684` | C-cheer-1 | 1 | accepted: lance raised upright high, the horse rears (4-8) and settles; hold on the last frame |
| fallFwd | NE | a1 | `7d1d84df` | C-fall-3 | 1 | accepted: goes down, rider thrown beside it; a red splat at frame 0 cut |
| charge-entry | SE | a1 | `68150aa0` | C-charge-1 | 1 | partly: couched and leading from 6, but no clean couched loop (best 6..14, 9 frames) and an odd raised rear arm at 8-11; frame 6 used as the key of a step-2 loop |
| charge-entry | NE | a1 | `ee31e563` | C-charge-2 | 1 | partly: couched from 3, but dust clumps at the hooves; frame 6 keys a step-2 loop |
| charge-entry | NW | a1 | `85057299` | C-charge-2 | 1 | partly: couched from 7; frame 8 keys a step-2 loop |
| fallFwd | NW | a1 | `a1bdd555` | C-fall-3 | 1 | accepted: the horse goes down on its side, the rider slides off and lies beside it, the lance flat |
| charge | SE | a1 | `10be9348` | C-chargeloop-1 | 1 | accepted: keyed loop, two strides, the lance couched and leading in 16/16, held two-handed (the left hand on the butt, raised behind) |
| charge | NE | a1 | `b372ad80` | C-chargeloop-2 | 1 | accepted after despeck: keyed loop, the lance leads north-east; dust clumps at the hooves cleared (despeck 60) |
| charge | NW | a1 | `39bf8f19` | C-chargeloop-2 | 1 | accepted: keyed loop, couched, leads north-west |
| cheer | NE | a1 | `2d910301` | C-cheer-2 | 1 | accepted: lance raised overhead, rears 3-7, prances |
| cheer | NW | a1 | `5def6b89` | C-cheer-2 | 1 | accepted: lance raised, rears 5-11, settles |
| rout-entry | SW | a1 | `986ea194` | C-rout-1 | 1 | accepted as rout: hunched, cloak flying, the lance trailing upright; frames 0-15 loop (frame 8 = frame 0, 7.6 %) |
| rout-entry | SE | a1 | `719d087a` | C-rout-1 | 1 | accepted: the stride 3..10 loops (10 %): rout = frames 3-10 twice |
| rout-entry | NE | a1 | `d1c88a3d` | C-rout-2 | 1 | REJECTED: the rider twists round to face the camera with a cartoon face (style drift) and the brim changes |
| rout-entry | NW | a1 | `30cde16b` | C-rout-2 | 1 | partly: good, but its loop is 10 frames (4..13): frame 4 keys a 16-frame loop |
| rout | NE | a1 | `35e4859f` | C-routloop-1 | 1 | accepted: keyed loop, hunched low, head forward, lance trailing upright |
| rout | NW | a1 | `2900e63f` | C-routloop-1 | 1 | accepted: keyed loop on rout-entry frame 4 |

42 jobs, 42 gens.

**Rejected and why:** thrust SW a1 and SE a1, the lance swung back with its head behind the rider (reversed); thrust NE a1, the rider turns to face the camera with the lance pointing back; rout NE (entry), a cartoon face turned to the camera (style drift). Fixed: cheer SW frame 2 (the lower end read as a second head: copied from frame 1). Lesson: an overarm draw invites a reversed lance; say "couched … the spearhead always points forward … never backwards", and for the back views "seen from behind, the rider faces away the whole time".

#### horse_archer (42 gens)

Clips: idle 12 @ 8, walk 16 @ 14, gallop 16 @ 16 (SE, NE keyed loops; SW, NW an 8-frame stride of the entry run twice), shoot 16 @ 14, strike 10 (on the gallop: an arrow from the back quiver, nocked, the bow pushed out and drawn to the cheek, loosed; pinned to the gallop key, so it plays over a moving horse, which the sim's Parthian shot needs; frames rotated per facing so the release is frame 10 in all four), stagger 12 @ 12, fallFwd 16 @ 12, rout 24 @ 16 (bent low, glancing back; entry strides 8 x 3 or 12 x 2), cheer 16 @ 10, hold 15 (bow raised, the horse rears). No charge (the battle falls back to gallop).

Sheet: `src/assets/sheets/horse_archer/` 128 columns x 4 rows of 129 x 146, packed 13.42 MB decoded (core 11.12), 485 KB download. `qc.mjs` with `stature { from: any, px: 94, tol: 4 }` (no metal on the hood): 0 failures; the warnings are the spear heuristic run by qc on bow and legs, and cheer's rear off the feet row. Groups: cloak = the crimson riding coat (crimson + teamRed, 9 steps), skin = the rider's skin **and the brown coat** (the same hexes). Hood, leather, bow and quiver are umber / darkBronze kept as shadow, so no metal group (no rarity swap, nothing to flag) and no trim. Spec: `spear: false`, `crest: false`, `emblem: false`. Manifest: `variation.skin: false`. Dust: clumps at the hooves cleared by `despeck.mjs` (60-150 px); the arrow in flight after the release is cleared with them (it left the canvas in SW and SE). A few hoof-attached dust pixels remain in NW rout (tiny, dark).

| clip | facing | attempt | job | prompt | gens | outcome |
| --- | --- | --- | --- | --- | --- | --- |
| idle | SW | a1 | `3878c15a` | H-idle-1 | 1 | accepted: pinned loop, breathing, tail swish, one bow |
| gallop-entry | SW | a1 | `fc97c281` | H-gallop-1 | 1 | accepted: a real gallop, one bow; frames 7-14 loop (8.5 %): gallop = 7-14 twice; frame 7 keys shoot |
| shoot | SW | a1 | `d1c4b65e` | H-shoot-1 | 1 | accepted with fixes: an arrow from the quiver, nocked, the bow pushed out and drawn to the cheek (8-11, shooting to his left side, the steppe way), released at 8, the horse galloping throughout and pinned back to the gallop key; the arrow in flight at 8 and the string trail at 12 reach the canvas edge: cleared |
| stagger | SW | a1 | `9bb950fa` | H-stagger-1 | 1 | accepted: rears and lands; a grey arrow streak at frame 0 cut by colour |
| walk | SW | a1 | `3df7848c` | H-walk-1 | 1 | accepted |
| gallop-entry | SE | a1 | `280a541f` | H-gallop-1 | 1 | partly: a real gallop but no clean loop (best 10 frames, 35 %): frame 7 keys a 16-frame loop |
| gallop-entry | NE | a1 | `18c2138e` | H-gallop-2 | 1 | partly: loops in 12 (1..12), not 16: frame 3 keys a 16-frame loop |
| gallop-entry | NW | a1 | `30d2fcf3` | H-gallop-2 | 1 | accepted: frames 3-10 loop (6 %): gallop = 3-10 twice; frame 3 keys shoot |
| fallFwd | SW | a1 | `0503ae3d` | H-fall-1 | 1 | fallback only: the horse falls well, but the rider stands up out of the saddle and floats in the air (3-9) before landing; re-rolled (a2) |
| gallop | SE | a1 | `d7578c61` | H-gallopLoop-1 | 1 | accepted: keyed loop, two strides, one bow |
| gallop | NE | a1 | `d321249e` | H-gallopLoop-2 | 1 | accepted: keyed loop, rider faces away, one bow |
| shoot | NW | a1 | `0db881c3` | H-shoot-2 | 1 | accepted after despeck: seen from behind, arrow from the quiver (2-3), drawn to the cheek (6-9), loosed at 10, horse galloping; dust cleared |
| fallFwd | SW | a2 | `a69460e2` | H-fall-2 | 1 | accepted: the horse buckles and rolls, the rider slides off its shoulder and lies beside it, the bow beside him |
| shoot | SE | a1 | `22721609` | H-shoot-1 | 1 | accepted with a fix: arrow from the quiver overhead (2-3), drawn to the cheek (7-10), loosed at 11; the arrow in flight at frame 11 reaches the canvas edge: cleared |
| shoot | NE | a1 | `e7f64eea` | H-shoot-2 | 1 | accepted after despeck: seen from behind, arrow drawn overhead from the quiver (1-3), nocked, drawn to the cheek (8-11), loosed at 12 |
| idle | SE | a1 | `0a7e0630` | H-idle-1 | 1 | accepted |
| idle | NE | a1 | `279610b5` | H-idle-1 | 1 | accepted (checked on the sheet strip) |
| idle | NW | a1 | `09008f42` | H-idle-1 | 1 | accepted |
| walk | SE | a1 | `616687e9` | H-walk-1 | 1 | accepted |
| walk | NE | a1 | `cc80088e` | H-walk-2 | 1 | accepted: grey bit streaks at 5-7 cut by colour |
| walk | NW | a1 | `d1b2a98f` | H-walk-2 | 1 | accepted (checked on the sheet strip) |
| stagger | SE | a1 | `ec35169a` | H-stagger-1 | 1 | accepted |
| stagger | NE | a1 | `3836c0da` | H-stagger-2 | 1 | accepted: the bow dips behind the rider at 9-11, one bow throughout |
| stagger | NW | a1 | `790a32ed` | H-stagger-2 | 1 | accepted: shies with a buck-like leap (4-5), lands; one bow |
| fallFwd | SE | a1 | `4e8c932d` | H-fall-2 | 1 | REJECTED: from frame 8 the rider lies flat on the horse, merged into its body |
| fallFwd | NE | a1 | `9189ea0a` | H-fall-3 | 1 | accepted: the horse sinks and rolls, the rider is thrown forward and lies in front of it, the bow beside him |
| fallFwd | NW | a1 | `a52236b4` | H-fall-3 | 1 | REJECTED: the rider stays sprawled on the lying horse, merged with its back |
| rout | SW | a1 | `2cb3a8f5` | H-rout-1 | 1 | REJECTED: the rider sits upright (a plain gallop) |
| fallFwd | SE | a2 | `2f98c1c1` | H-fall-4 | 1 | REJECTED: good fall, rider clear of the horse, but his boots run off the bottom of the canvas (9 px on row 159, frames 11-15) |
| rout | SE | a1 | `f0d329e8` | H-rout-1 | 1 | REJECTED: keyed loop, but the rider sits upright (a plain gallop): the keyed-loop rout prompt (H-rout-1) does not bend him |
| rout-entry | SW | a1 | `cdb411d5` | H-rout-2 | 1 | accepted: bent low over the neck, looking back in fear, the bow along his body |
| fallFwd | SE | a3 | `35c2dd5b` | H-fall-5 | 1 | accepted: the horse goes down, the rider is thrown back over it and lies behind it (his red coat clear of the coat), the bow beside him |
| fallFwd | NW | a2 | `eb20c389` | H-fall-6 | 1 | fallback: the rider stands up out of the saddle and hangs in the air (5-9) before falling clear; kept as the fallback, re-rolled (a3) |
| rout-entry | SE | a1 | `efc771ff` | H-rout-2 | 1 | accepted: bent low, looking back, the bow along his body; stride 7-14 (wrap 46 % vs 48-65 % between neighbours): rout = 7-14 twice |
| rout-entry | NE | a1 | `fa6d1aa2` | H-rout-3 | 1 | accepted after despeck: bent low, glancing back, the bow along the flank; loops in 12 (2-13): rout = 24 frames, 2-13 twice |
| fallFwd | NW | a3 | `3437d9c7` | H-fall-7 | 1 | accepted: no floating; the rider rises in the stirrups as the horse drops, then slides off its near side and lies beside it, the bow beside him |
| rout-entry | NW | a1 | `1cf6c078` | H-rout-3 | 1 | REJECTED: the bow vanishes behind the hunched rider from frame 1 (missing weapon) |
| cheer | SW | a1 | `9c5c19b9` | H-cheer-1 | 1 | accepted: bow raised, shouting, rears 4-11, prances |
| cheer | SE | a1 | `e375ec76` | H-cheer-1 | 1 | accepted: bow raised and shaken, shouting, the horse rears (4-10) and prances off; held on the last frame |
| cheer | NE | a1 | `2cfbf868` | H-cheer-2 | 1 | accepted: bow raised overhead, rears 3-8, prances |
| rout-entry | NW | a2 | `327cf18d` | H-rout-4 | 1 | accepted after despeck: leaning low and forward, the bow visible in his left hand; loops in 12 (3-14): rout 3-14 twice |
| cheer | NW | a1 | `190fdd3d` | H-cheer-2 | 1 | accepted: bow raised overhead, rears 2-9, settles |

42 jobs, 42 gens.

**Rejected and why:** fallFwd SW a1, SE a1/a2, NW a1/a2 (the rider floats up out of the saddle, merges into the lying horse, or his boots run off the canvas); rout SW / SE keyed loops (the rider sits upright: a keyed loop keeps the key's posture, so a rout must come from an entry run); rout NW a1 (the bow vanishes behind the hunched rider). Lesson: for a fall say "never rises above the saddle … slides off … clearly apart from the horse"; a rout prompt needs "bent double … crouched low" and an entry run, not a keyed loop.

#### thessalian (36 gens)

Clips: idle 12 @ 8, walk 16 @ 14, gallop 24 @ 16 (entry strides: SW, SE, NE 8 x 3; NW 12 x 2), throw 12 @ 14, strike 6 (on the gallop: a javelin lifted overhead, head forward and down, flung down at the foe with the rise in the stirrups; the frames where the drawn javelin turned head-back or read as double-ended were cut, see the table), stagger 12 @ 12, fallFwd 16 @ 12, rout 20 @ 16 (leaning low over the neck; 10-frame strides twice, a frame dropped from the 11-frame ones), cheer 16 @ 10, hold 15. No charge (falls back to gallop).

Sheet: `src/assets/sheets/thessalian/` 128 columns x 4 rows of 123 x 139, packed 10.63 MB decoded (core 8.70), 432 KB download. `qc.mjs` with `stature { from: any, px: 90, tol: 4 }` (the javelin heads are above the pilos): 0 failures. Groups: cloak = crimson + teamRed (chlamys and tunic, exclusive); skin = the rider only (the dun-grey coat is umber / metal / iron): the per-man skin tint stays **on**. The coat, pilos, buckler and leather are kept as shadow, so no rarity-relevant metal (`rarity.metal: false` set for the small darkBronze bits the remap still finds on the javelin heads). Dust puffs touching the hooves: `dust.mjs` (light pixels in the bottom rows) then `despeck.mjs`. Per-clip canvas y offsets (gallop, throw, rout) put the horse's ground row where idle has it (`anchorcheck.mjs` within 2 px). The horse archer got the same x/y correction in this commit.

| clip | facing | attempt | job | prompt | gens | outcome |
| --- | --- | --- | --- | --- | --- | --- |
| idle | SW | a1 | `35708324` | T-idle-1 | 1 | accepted: two javelins, plain buckler, breathing, tail swish |
| gallop-entry | SW | a1 | `ca234148` | T-gallop-1 | 1 | accepted: frames 7-14 loop (9.4 %): gallop 7-14 twice; frame 7 keys throw |
| gallop-entry | SE | a1 | `aff8b784` | T-gallop-1 | 1 | accepted: frames 7-14 loop (7.5 %): gallop 7-14 twice; frame 7 keys throw |
| throw | SW | a1 | `964f7d98` | T-throw-1 | 1 | REJECTED: frames 3-9 the rider turns his back to the facing and the javelins point backwards; only the release (10-12) is right |
| stagger | SW | a1 | `bba3aab3` | T-stagger-1 | 1 | accepted: rears and lands; two javelins, buckler |
| walk | SW | a1 | `42123c8a` | T-walk-1 | 1 | accepted |
| throw | SW | a2 | `1a872a5c` | T-throw-2 | 1 | fallback: release 10-12 right, but the cock-back (5-9) holds the head behind his hand, pointing backwards |
| gallop-entry | NE | a1 | `1aa464c8` | T-gallop-2 | 1 | accepted: stride 3-10 loops (19 % vs 55-65 %): gallop 3-10 x3; frame 3 keys throw |
| gallop-entry | NW | a1 | `092b155c` | T-gallop-2 | 1 | accepted (sheet strip): loops in 12 (0-11): gallop 0-11 twice; frame 3 keys throw |
| throw | SW | a3 | `941223d6` | T-throw-3 | 1 | REJECTED: the drawn-back javelin (4-11) again has its head behind his hand |
| idle | SE | a1 | `7aee8f8a` | T-idle-1 | 1 | accepted |
| walk | SE | a1 | `a1db3e7c` | T-walk-1 | 1 | accepted (sheet strip) |
| idle | NE | a1 | `77d7b2b2` | T-idle-1 | 1 | accepted (sheet strip) |
| throw | SW | a4 | `d6a17464` | T-throw-4 | 1 | accepted with cuts: frames 3-7 show the raised javelin with a point at both ends (double-ended): dropped; shipped 0,1,2,2,8-15 (12 frames): lift overhead, then the downward fling with the head leading, release at 10 |
| idle | NW | a1 | `875c597a` | T-idle-1 | 1 | accepted (sheet strip) |
| walk | NE | a1 | `03550d2b` | T-walk-2 | 1 | accepted |
| throw | SE | a1 | `90206c07` | T-throw-4 | 1 | accepted with cuts: 2-5 hold the raised javelin head-back with a pale buckler (drift): dropped; shipped 0,1,6-15, the downward fling with the head leading, release at 10 |
| throw | NE | a1 | `28d8b1a0` | T-throw-5 | 1 | accepted with cuts: 4-8 the javelins point backwards: dropped; shipped 0-3,3,9-15; release at 10; the buckler flashes orange at 9-11 (cut by colour or remapped) |
| throw | NW | a1 | `9ab38f2a` | T-throw-5 | 1 | accepted with cuts: shipped 0-3,3,5,6,7,9,11,13,15: raise, release at 6 (the javelin flies off ahead), recover; dust cleared |
| walk | NW | a1 | `2089c7c9` | T-walk-2 | 1 |  |
| stagger | SE | a1 | `99ca4e82` | T-stagger-1 | 1 |  |
| stagger | NE | a1 | `957840d8` | T-stagger-2 | 1 |  |
| stagger | NW | a1 | `abcf4836` | T-stagger-2 | 1 |  |
| fallFwd | SW | a1 | `c5f352f1` | T-fall-1 | 1 | cancelled: stuck at 71 % for 13 min (billed 1 regardless) |
| rout-entry | SW | a1 | `c7428404` | T-rout-1 | 1 | accepted: leaning low over the neck, javelins trailing; stride 4-13 loops (10 frames): rout 4-13 twice; light dust puffs at the hooves cleared by colour/fix |
| cheer | SW | a1 | `78b3db89` | T-cheer-1 | 1 | accepted: javelins raised, rears 3-9, prances |
| cheer | SE | a1 | `ee976902` | T-cheer-1 | 1 | accepted: javelins raised and shaken, rears 5-11, prances |
| rout-entry | SE | a1 | `817b87f8` | T-rout-1 | 1 | accepted: leaning forward, the javelins upright; the buckler drifts lighter (remapped dark); loops in 11 (4-14); dust cleared |
| rout-entry | NE | a1 | `6f617f48` | T-rout-2 | 1 | accepted: hunched forward, javelins upright; loops in 11 (0-10): rout 0-10 twice + 0,1 (24) |
| rout-entry | NW | a1 | `bf5237e1` | T-rout-2 | 1 | accepted: hunched forward under the cloak, the two javelins upright (their heads close together, as in the base NW view); loop 4-14 (11) |
| cheer | NE | a1 | `69d2a4ff` | T-cheer-2 | 1 | accepted: javelins raised and shaken, rears 3-10 |
| fallFwd | SE | a1 | `7cddf707` | T-fall-1 | 1 | accepted: the horse goes down head first, the rider pitches over its shoulder and lies against its neck, his red tunic, buckler and javelins clearly his own (not merged) |
| cheer | NW | a1 | `9c3cd13f` | T-cheer-2 | 1 | accepted |
| fallFwd | SW | a2 | `0cde37f9` | T-fall-1 | 1 | accepted: the horse buckles and rolls, the rider slides off and lies beside it, javelins and buckler beside him |
| fallFwd | NE | a1 | `3240069d` | T-fall-2 | 1 | accepted: the rider slides off the near side and lies in front of the horse; the buckler drifts orange (remapped dark) and the javelins stay standing like a planted pair (kept: one pair, heads up) |
| fallFwd | NW | a1 | `08a3104e` | T-fall-2 | 1 | accepted: the horse rolls, the rider slides off and lies beside it, buckler and javelins with him |

36 jobs, 36 gens.

**Rejected and why:** throw SW a1-a3 (the cocked javelin points back over the rider, or he turns his back to the facing); SW fall a1 stuck and cancelled. Fixed by cuts: throw SW a4, SE, NE, NW (head-back and double-ended frames dropped). Lesson: an overhead harpoon throw ("tilting it so its small head points forward and down … flings it forward and down") keeps the head leading better than "draw back along its line".

#### chariot (25 gens)

Clips on a 176 x 176 work canvas (1 generation each): idle 12 @ 8, drive 16 @ 16 (both horses galloping, wheels and scythes turning; entry strides 8 x 2, SE a 14-frame loop with two frames held), charge 16 @ 16 (pinned to the drive key: the driver whirls his one kopis overhead and cuts), hit 12 @ 12 (both horses half rear in the traces, the car jolts), wreck 16 @ 12 (the horses go down, the pole snaps, the car overturns, the driver is thrown out), rout 14 @ 16 (the driver crouches low, the horses bolt; 11-14-frame loops, short ones stretched by held frames). First try in every clip and facing.

Sheet: `src/assets/sheets/chariot/` 86 columns x 4 rows of 163 x 153, packed 15.78 MB decoded (all core), 579 KB download. `qc.mjs` with `stature { from: any, px: 108, tol: 4 }`: 0 failures. Groups: cloak = the driver's purple-black cloak; skin = the driver's skin **and both bay coats** (same hexes). Everything else (car, wheels, scythes, pilos, kopis, harness) is shadow: no metal group. Manifest: `variation.skin: false`, `rarity.metal: false`. Earth clods thrown up behind the wheels (they share the coats' light browns) are cleared by shape (`dust.mjs --clods`: warm light blobs in the bottom 30 rows bordered by background or their own outline), plus everything below the wheels' ground row; a few dark specks remain in NE / NW drive (2-3 px). `anchorcheck.mjs` prints dy,dx: drive, charge and rout sit within 1 px of idle after per-clip canvas offsets.

| clip | facing | attempt | job | prompt | gens | outcome |
| --- | --- | --- | --- | --- | --- | --- |
| idle | SW | a1 | `06fa4984` | K-idle-1 | 1 | accepted: both horses breathe and shift, two horses x 4 legs, the driver with the reins and kopis |
| drive-entry | SW | a1 | `d568b18e` | K-drive-1 | 1 | accepted: both horses gallop, wheels and scythes turn, cloak streams; frames 7-14 loop (2.6 %): drive 7-14 twice |
| drive-entry | SE | a1 | `a6bc9b0e` | K-drive-1 | 1 | accepted: loops in 14 (1-14); two frames held to make 16 |
| drive-entry | NE | a1 | `11420a4f` | K-drive-2 | 1 |  |
| drive-entry | NW | a1 | `f9bd4763` | K-drive-2 | 1 |  |
| hit | SW | a1 | `850718e4` | K-hit-1 | 1 | accepted: the horses lurch and half rear in the traces, the car jolts, the driver swings his kopis up and braces; 2 x 4 legs |
| charge | SW | a1 | `7e244973` | K-charge-1 | 1 | accepted: pinned loop on the drive key; horses at full stretch, the driver whirls one kopis overhead and cuts (4-13) |
| rout-entry | SW | a1 | `c2ccb4fd` | K-rout-1 | 1 | accepted: the driver crouches low in the car, horses bolting; loops in 14 (0-13), two frames held to make 16 |
| wreck | SW | a1 | `5ef05615` | K-wreck-1 | 1 | accepted: both horses go down, the pole snaps, the car is flung up and over and crashes on its side, the driver thrown out lies beside it; 2 x 4 legs |
| idle | SE | x1 | `1221a9b1` | K-drive-1 | 1 | cancelled at once: sent with the drive prompt by mistake (may bill 1) |
| idle | SE | a1 | `c6dc1727` | K-idle-1 | 1 | accepted (sheet strip) |
| charge | SE | a1 | `605a2eb8` | K-charge-1 | 1 | accepted: the driver rises with the kopis overhead (4-8) and slashes down; one blade; pinned loop |
| charge | NE | a1 | `0bf77675` | K-charge-2 | 1 | accepted: seen from behind, the kopis swung overhead and cut (3-12); one blade; dust cleared |
| charge | NW | a1 | `fe20b914` | K-charge-2 | 1 | accepted: the driver swings the kopis out to the side (9-12), one blade, horses at full stretch |
| hit | SE | a1 | `f0c725d9` | K-hit-1 | 1 | accepted: the horses lurch and toss their heads, the car jolts, the driver is thrown back with the kopis out and recovers |
| rout-entry | SE | a1 | `81ac207f` | K-rout-1 | 1 | accepted: driver crouched low, horses bolting; loops in 12 (3-14), four frames held to make 16 |
| idle | NE | a1 | `64183b7e` | K-idle-2 | 1 | accepted (sheet strip) |
| wreck | SE | a1 | `3c7da97b` | K-wreck-1 | 1 | accepted: the horses tear loose and go down in the traces, the pole snaps, the car slews back and tips, the driver falls out behind it; 2 x 4 legs |
| hit | NE | a1 | `7cf46b30` | K-hit-2 | 1 | accepted: both horses rear in the traces and drop, the car rocks; red specks (blood, unrequested) cleared by despeck |
| rout-entry | NE | a1 | `6c57d9d6` | K-rout-2 | 1 | accepted: driver crouched under his cloak, horses bolting; loops in 12 (2-13), four frames held; dust cleared |
| rout-entry | NW | a1 | `f25654d0` | K-rout-2 | 1 | accepted: hunched driver, bolting horses; loops in 11 (2-12), five frames held |
| idle | NW | a1 | `4bb60878` | K-idle-2 | 1 | accepted (sheet strip) |
| hit | NW | a1 | `1084e890` | K-hit-2 | 1 | accepted: both horses rear in the traces and drop, the car rocks |
| wreck | NE | a1 | `d0f1e7b7` | K-wreck-2 | 1 | accepted: the horses go down, the pole snaps, the car overturns, the driver lies beside it |
| wreck | NW | a1 | `992f42b1` | K-wreck-2 | 1 | accepted: the horses go down in the traces, the car tips, the driver tumbles out and lies beside it |

25 jobs, 25 gens.

**Rejected:** none (one idle SE job sent with the drive prompt by mistake, cancelled at once).

### I3a Hoplite production and style lock: realistic H4 base, 16 clips in 4 facings, recolour tiers (2026-10-18)

**Brief** (user, after I1b): the E3 look at realistic adult proportions (about 7 heads, no big helmet), one animated
body per class (veteran and elite are runtime recolours, I3b), the full clip set at 12–16 frames, a thrust driven by
the whole body (no "only the arm stretches"), every hard reject of I1b checked frame by frame, and a recipe the other
17 classes can follow (`docs/v5/art/STYLE_LOCK.md`).

**Tool and budget.** PixelLab MCP, Tier 2. Balance before 4,803.75; after 4,408.50 (the account was shared from
mid-run with the I4a base-rotation agent). This round's own jobs: **36 base + 118 clip generations quoted** (72 clip
jobs: 63 pixminimax, 9 skeleton-v3); billing ran about 12 % over the quotes in the stretch measured alone (107 quoted,
120 billed), so about **170 generations** (cap 450). **Raws:** `docs/v5/pixellab/I3/raw/` (gitignored): `H1`–`H4`,
`ref/`, `first/` (first frames and skeleton JSON), `clips/<anim>/<dir>/<attempt>/`. **Rebuild:**
`node scripts/art/pixellab/fetchjobs.mjs docs/v5/pixellab/I3/jobs.json docs/v5/pixellab/I3/raw && node scripts/art/pixellab/sheetbuild.mjs docs/v5/pixellab/I3/hoplite.sheet.json`
(every job is in `jobs.json`, every pick and frame fix in `hoplite.sheet.json`). **Shipped:**
`src/assets/sheets/hoplite/{hoplite.png, manifest.json}`. **Contact sheets:** `docs/v5/art/I3-bases.png`,
`I3-lineup.png` (the sheet's idle beside H4 and E3), `I3-thrust.png`, `I3-rejected.png`. **Preview:**
`/hoplite-bakeoff.html?sheet=hoplite` (through the runtime; `?z=1..3`, `&anim=` for the formations).

**Base character prompts, word for word** (all 68 x 68, `high top-down`):

- **H1** (`create_character_pro_flash`, `style_image` = E3 south cropped to 68, usage "the approved style: copy its
  colours, dark bronze and crimson ramps, outline, shading, pixel density and gear design exactly; but draw the man
  with realistic adult proportions (a smaller head and helmet, longer legs) instead of this sprite's big helmet and
  short legs")
  ```
  grim battle-hardened Spartan hoplite warrior with realistic adult human proportions, about seven heads tall: a normal-sized head and helmet, long legs, natural arm length, broad shoulders, muscular athletic build; standing straight and facing the viewer, full body with the feet near the bottom of the canvas: dark weathered bronze Corinthian helmet covering the face with a deep crimson horsehair crest; deep crimson cloak hanging from the shoulders behind him; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark bronze greaves; one very large round aspis shield on his left arm reaching from his chin to his knees, dark bronze rim and a muted dark-red lambda emblem; one very long wooden spear (dory) held vertically in his right hand, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours, low-key cinematic light from the upper left, the mood of the film 300
  ```
- **H2** (`create_character` pro, `style_character_id` E3 `62d4f135`)
  ```
  grim battle-hardened Spartan hoplite with realistic adult human proportions, seven heads tall: a normal-sized head and a close-fitting helmet, long legs, natural arm length, broad shoulders, muscular athletic build; dark weathered bronze Corinthian helmet covering the face with a deep dark crimson horsehair crest; deep dark crimson cloak hanging behind him; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark bronze greaves; one very large round bronze aspis on his left arm, chin to knee, dark bronze rim and a muted dark-red lambda; one very long wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **H3** (pro, style E3): H2 with the opening "tall grim Spartan hoplite drawn with true realistic adult anatomy,
  seven and a half heads tall like a real man: a small head and a snug helmet only one seventh of his height, a long
  torso, long legs (half his height), natural arm length, broad shoulders, lean muscular build, not chibi, not heroic
  big-head proportions;" and the rest as H2.
- **H4** (pro, style E3, `concept_image_url` = H3's south re-proportioned by `proportion.mjs`, bands
  `3:10:0.6:0.75:7:33,11:24:0.68:0.78:8:33,25:48:0.86,49:65:1.55`, 4x nearest): the verbatim block in
  STYLE_LOCK §3.

| # | Attempt | id | Call | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | H1 | e752da6b | H1, Pro Flash + style image | 6 | **Rejected:** the spear is gone in NW; the crimson came out saturated, brighter than E3; helmet still big |
| 2 | H2 | 852ef75e | H2, pro + E3 style | 10 | **Rejected (proportions):** E3's colours exactly and the spear in 8/8, but 4.5 heads; a flat 9-colour palette |
| 3 | H3 | 4a5c84b4 | H3, pro + E3 style | 10 | **Rejected (proportions):** measured 3.7 heads (helmet 15 of 55 px), legs 31 % of the height |
| 4 | H4 | b7624d6d | H4, pro + E3 style + concept | 10 | **Promoted:** a small head, legs about 45 %, 52 colours in E3's ramps; spear visible, head up, butt plain in all 8 views; one shield |

**Clips.** Mode, frames, fps and prompts per clip: STYLE_LOCK §6 and PROMPTS_ART §15. Every clip was tested in SW
first, then rolled out. The thrust is the only skeleton-v3 clip shipped (rig.mjs keypoints, the spear redrawn
levelled into the first frame); everything else is pixminimax from the rotation, the levelled-spear frame, a tall
canvas or a big centred canvas.

| # | Clip | Mode | Dirs | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 5 | thrust a1 | skeleton-v3 | SW | 3 | **Rejected (spear pivots, ghost tips):** the draw-back swung the spear round (f1–f4), grey ghost tips, the figure turned to face south (the skeleton's shield hand was put in front of the body, not at his left) |
| 6 | thrust a2 | skeleton-v3 | SW | 3 | **Promoted:** spear level and head-first in 14/14, lunge on the lead foot, shield driven forward with the body |
| 7 | thrust a1 | skeleton-v3 | NE, NW | 6 | **Promoted** (NE f2 a grey ghost: cut by the colour step) |
| 8 | thrust a1 | skeleton-v3 | SE | 3 | **Rejected (pivot):** the spear rotates about 30° from the camera-true downward angle to level |
| 9 | thrust a2 | skeleton-v3 | SE | 3 | **Promoted:** first frame drawn flatter (`--vec 1,0.22`): the angle holds |
| 10 | walk, idle, look, adjust, rout | pixminimax | all 4 | 20 | **Promoted;** look NE f8 rejected (lumpy, doubled head; := f7) |
| 11 | run a1 | pixminimax | 4 | 4 | **Promoted SE SW NW; NE rejected:** the shield almost vanishes (f3) |
| 12 | run a2 | pixminimax | NE | 1 | **Promoted** ("the shield stays clearly visible on the left arm") |
| 13 | kneel a1 | pixminimax | 4 | 4 | **Promoted SE SW NW; NE rejected:** shield gone f1–f2 |
| 14 | kneel a2 | pixminimax | NE | 1 | **Promoted** |
| 15 | cheer a1 | pixminimax | SW | 1 | **Rejected:** on the 68 canvas the spear is never raised (no room overhead) |
| 16 | cheer a2 | skeleton-v3 | SW | 3 | **Rejected:** the shield vanishes in every frame |
| 17 | cheer a3 | pixminimax, tall 96 x 112 | all 4 | 4 | **Promoted** (SW turns a little towards the viewer: kept) |
| 18 | ready, charge, brace | pixminimax, guard | all 4 | 24 | **Promoted** (the charge's lambda flickers in 2 frames: kept) |
| 19 | block | pixminimax, guard | all 4 | 8 | **Promoted after the cut:** impact sparks in f2–f5 of every facing (invented effect, cut by colour); SW f2 spikes left (:= f1) |
| 20 | stagger a1 | pixminimax | SW | 2 | **Rejected:** a doubled, smeared spear f0–f2 |
| 21 | stagger a2 | skeleton-v3 | SW | 3 | **Promoted:** a weak but clean reel back (grey ghost f2 cut) |
| 22 | stagger p1 | pixminimax | SE NE NW | 6 | **Promoted after the cut:** blood (cut); NW f0–f1 lost the spearhead with the blood (:= f2) |
| 23 | fallBack a1 | skeleton-v3 | SW | 3 | Kept as the A/B: a sitting fall, spear still held level; the pixminimax fall reads better and costs 2 |
| 24 | fallBack p1, fallFwd p1 | pixminimax, die 128 x 128 | all 4 | 16 | **Promoted after the cut:** blood in 7 of 8 (bright cut; fallBack NE f0 splat cleared, `red` fix); NW fallBack f1–f2 and fallFwd f0–f1, fallFwd SW f0–f1 holes or a headless spear after the cut (:= neighbour) |

**Rejection count** (whole clips / frames): proportions 2 bases; spear missing in a game facing 1 base (H1 NW);
spear pivoting instead of travelling along its axis 2 clips (thrust SW a1, SE a1); doubled or ghost spear 1 clip
(stagger SW a1) + 1 frame (look NE f8), grey ghosts cut in 2 clips; spearhead lost with cut blood 6 frames; shield
vanishing 3 clips (run NE, kneel NE, cheer SW a2); action not performed 1 clip (cheer a1); invented effects: sparks in
4 clips and blood in 10 clips, all cut, 3 frames replaced; spear tip backwards, double-ended butt, head turned
backwards, head cut by the canvas, proportion or style drift: **0** (QC stature 56–59 px in all 4 facings).

**Colours.** The sheet uses 46 colours, all PA-WORLD-DARK steps or their 1-step group nudges; groups (dark→light):
cloak 6, crest 4, emblem 3, trim 2, skin 4, wood 11; metal: bronze 5 (shield, helmet, armour), spearhead 7. Tiers:
veteran = wine cloak, scarlet crest, polished trim; elite = black cloak and crest, gold trim (I1b elite probe colours).

**QC** (`qc.mjs`): 0 failures; 12 warnings, all eyeballed false positives of the spear-end heuristic (an end over
the legs or a lying body) and one walk frame with a lifted foot. Frame 142 x 117 (the raised cheer spear and the
lying dead set it), 202 columns, wrap 28: a 3976 x 3744 PNG, **57 MB decoded**: it needs the trim-and-pack step
before phones. Preview through the v2 runtime: no console errors; `tsc`, `vite build` and the 1,568 tests pass.

**Verdict.** H4 is the style anchor for every class (STYLE_LOCK §1). pixminimax is the workhorse (1 generation at
68, 2 at 128, identity steady, 1 in 6 clip-directions redone); skeleton-v3 is kept for the attack, where the pose must
be ours. PixelLab adds sparks and blood whatever the prompt says: the colour cut removes them, but where blood covered
the spear it takes the spearhead with it, so check every cut frame.

**Cost per class, measured** (the full basic set, 16 clips x 4 facings): base 10–20 + 0.25 import; clips 100 quoted
(28 at 1, 60 at 2, 12 at 3) + about 20 % redos ≈ 120; ≈ **135–150 generations per class with billing**, **≈ 2,500
for the other 17 foot classes** (tiers are free recolours now). Riders and chariots need bigger canvases (pixminimax
2 per clip at 128, more above).

### I4b Mounted and chariot probe: companion, thessalian, horse archer, chariot bases on the H4 anchor, the companion's gallop in 4 facings (2026-10-18)

**Brief.** Find a PixelLab approach for riders and the chariot that matches the I4a foot roster (dark-epic, H4 style, real human and real horse proportions at H4's scale, never chibi), then make 8-rotation bases for companion, thessalian, horse_archer and chariot, and a smooth gallop (12–16 frames, a real gait) for the companion in the 4 game facings (SE, NE, SW, NW). Hard rejects: extra or missing horse legs, rider merged into the horse, a doubled or missing weapon, style drift, head or hooves cut off. Cloak, crest and trim stay clean colour groups (V5-092).

**Tool and budget.** PixelLab MCP, at most 3 of my jobs at once (Tier 2 shared with other agents). Account balance before: 4,378.50 left (524.50 used). After: 3,941.50 left (961.50 used), a change of 437 that includes other agents' jobs running in parallel. **Mine by receipt: about 319 gens** (cap 400; the probe 56 of its 120): 7 pro characters at 25 (size 128) = 175, 7 at 15 (size 100) = 105, 2 pro-flash objects about 16 (estimated 10 and 6), 23 for clips (probe 6, Pa1's other facings 6, A3 1, A5's gallop 10). **Raws:** `docs/v5/pixellab/I4b/raw/<class>/<attempt>/` (gitignored; `review.png`, `facings.png`, `groups.png` beside each). **Machine-readable:** `docs/v5/pixellab/mounted.json` (ids, approach, canvas, boxes per facing, groups, status, every rejection). **Sheets:** `docs/v5/art/I4b-lineup.png` (the 4 game facings: H4, militia, peltast, sacred_band, then the 4 mounted bases, one scale, PA-WORLD-DARK-I4a remap), `docs/v5/art/I4b-formation.png` (a mixed army on the 2:1 field, SW and NE, zoom 1 and 3), `docs/v5/art/I4b-gallop.png` and `.gif` (the companion's gallop loop, 4 facings × 16 frames). **Tools:** `scripts/art/pixellab/mounted/` (`review.mjs`, `facings.mjs`, `clip.mjs`, `loopfind.mjs`, `keyframe.mjs`, `anchors.mjs`, `cutcheck.mjs`, `upload1.mjs`, `sheets.mjs`).

**Probe (companion, 56 gens).**

| approach | call | result |
| --- | --- | --- |
| (a) rider and horse as one humanoid pro character | `create_character` `mode: pro`, `style_character_id` H4, `size: 128`, `view: high top-down` (25) | **Wins.** H4's outline, shading and ramps; a real horse, 4 legs in all 8 views, the rider sits on it (no merging), one lance in 8/8; turnaround consistent in SE, NE, SW, NW. Only fault: at 128 the whole figure is 1.3–1.45x H4 (fixed by size 100) |
| (b) quadruped `template: horse`, pro, H4 style | same, `body_type: quadruped` (25) | Rejected: a pony-sized horse, an invented grey ground shadow, the helm drawn as a Corinthian. It unlocks the horse templates (`running-8-frames` etc.), but its skeleton-v3 gallop (3) has 8 frames, shrinks the figure in a 176 canvas and adds ground shadows |
| gallop on (a), SE | pixminimax 16 frames from the rotation (1) | A real two-stride gallop (gather, push-off, extension, suspension) at H4 style, but it starts from the standing pose, so it has no clean loop (best wrap 37 % vs 58 % per frame) |
| keyed loop on (a), SE | pixminimax 16, `custom_start_frame_url` = `end_frame_url` = the most stretched frame of the first run, `keep_first_frame: false` (1 + 1) | **Wins.** Two strides of 8 frames, the wrap as smooth as any step; legs, lance and cloak hold. "One stride" and "two strides" prompts both give two |

**Verdict:** approach (a), one pro humanoid character per figure with H4 as the style, **size 100 for riders and 128 for the chariot**; gallop by a 16-frame pixminimax run followed by a keyed 16-frame loop (2 gens per facing).

**Scale.** Pro fits the whole figure to the canvas. At 128 a rider came out 1.3–1.45x H4 (companion Pa1: head 14 px crown to chin against H4's 9–10, withers 62 px = 1.9 m). At 100 the head is 10–11 px and the withers about 47 px above the hooves (1.42 m at 58 px = 1.76 m), a real Greek warhorse beside H4. A chariot is long enough that at 128 its crew is at H4 scale (driver's pilos bowl to chin 8–9 px, shoulders 20–22 px). A 168 px object (`create_object_pro_flash`) drifted off style; a "full scale" front view came back the same size as A1, which confirmed A1.

**Prompts, word for word.** The I4a block, with the horse and its tack added. Riders at `size: 100`, chariot at `size: 128`.

- **companion Pa1 / Pb1** (Pa1 humanoid, Pb1 `body_type: quadruped, template: horse`; both at 128)
  ```
  grim Macedonian Companion heavy cavalryman seated astride a real full-size warhorse, the whole horse seen from muzzle to hooves to tail, with realistic adult proportions: the rider seven heads tall, a small head in a snug helmet, natural arms, broad shoulders, lean muscular build, his legs hanging down the horse's flanks; the horse a real horse with realistic proportions, much bigger than the man, a long neck and head, a deep chest, exactly four long slender legs with hooves; dark weathered bronze Boeotian helmet with a wide flaring brim all round and an open face, no crest; deep dark purple-black cloak hanging from his shoulders over the horse's back; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark leather boots; no shield; one long wooden xyston lance held upright in his right hand out at his right side, slanting a little forward, away from the horse's head and clearly visible in every direction, much taller than the man, single leaf-shaped iron spearhead at the top, plain blunt wooden butt end, no butt spike; dark bay horse with a black mane and tail, a dark leather bridle and reins, a dark crimson saddle cloth; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **companion A2** (100): Pa1 with ", its back as high as a standing man's shoulders" after "much bigger than the man".
- **companion A3** (100): A2 with the helmet "open-faced dark weathered bronze Boeotian cavalry helmet shaped like a folded sun hat, a wide downturned brim all round, the face visible, no crest, no face mask".
- **companion A4** (100): A3 with "deep dark royal-purple cloak hanging from his shoulders over the horse's back, the only purple on the figure" and "warm chestnut-brown horse with a dark brown mane and tail, no black on the horse, a dark leather bridle and reins, a plain dark leather saddle".
- **companion A5** (100, promoted)
  ```
  grim Macedonian Companion heavy cavalryman seated astride a real full-size warhorse, the whole horse seen from muzzle to hooves to tail, with realistic adult proportions: the rider seven heads tall, a small head in a snug helmet, natural arms, broad shoulders, lean muscular build, his legs hanging down the horse's flanks; the horse a real horse with realistic proportions, much bigger than the man, its back as high as a standing man's shoulders, a long neck and head, a deep chest, exactly four long slender legs with hooves; open-faced dark weathered bronze Boeotian cavalry helmet shaped like a folded sun hat, a wide downturned brim all round, the face visible, no crest, no face mask; deep dark royal-purple cloak hanging from his shoulders over the horse's back, the only purple on the figure; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark leather boots; no shield; one long wooden xyston lance held upright in his right hand out at his right side, slanting a little forward, away from the horse's head and clearly visible in every direction, much taller than the man, single leaf-shaped iron spearhead at the top, plain blunt wooden butt end, no butt spike; weathered dark bay-brown horse, dull and dark like old leather, with a dark umber-brown mane and tail, a dark leather bridle and reins, a plain dark leather saddle; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **thessalian A1** (128) / **A2** (100, with "its back as high as a standing man's shoulders")
  ```
  grim lean Thessalian light cavalryman seated astride a real full-size horse, the whole horse seen from muzzle to hooves to tail, with realistic adult proportions: the rider seven heads tall, a small head in a snug helmet, natural arms, broad shoulders, lean wiry build, his legs hanging down the horse's flanks; the horse a real horse with realistic proportions, much bigger than the man, a long neck and head, a deep chest, exactly four long slender legs with hooves; dark weathered bronze conical pilos helmet with a narrow brim, the face visible, no crest; short deep dark crimson chlamys cloak pinned at the right shoulder, hanging behind him; plain dark umber leather jerkin over a dark oxblood-brown tunic, no white cloth; tall dark leather boots; one small round dark bronze buckler on his left arm; two javelins held upright together in his right hand out at his right side, away from the horse's head and clearly visible in every direction, a little taller than the man, each with one small leaf-shaped iron head at the top and a plain blunt wooden butt end, no butt spike; dark dun-grey horse with a black mane and tail, a dark leather bridle and reins, a plain dark brown sheepskin saddle cloth; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **thessalian A3** (100, promoted): A2 with "one small plain round dark bronze buckler on his left forearm, no bigger than his chest, no emblem, no painted sign" and "exactly two javelins held upright together …".
- **horse_archer A1** (128)
  ```
  grim lean Scythian horse archer seated astride a real full-size steppe horse, the whole horse seen from muzzle to hooves to tail, with realistic adult proportions: the rider seven heads tall, a small head, natural arms, broad shoulders, lean wiry build, his legs hanging down the horse's flanks; the horse a real horse with realistic proportions, much bigger than the man, a long neck and head, a deep chest, exactly four long slender legs with hooves; tall pointed dark umber felt Scythian hood with long ear flaps, a dark beard, no helmet; long-sleeved dark umber leather riding coat with a worn dark leather belt, no white cloth; dark crimson-and-black checked wool trousers, the only red he wears, short dark leather boots; no shield; one recurved composite bow held upright in his left hand out at his left side, away from the horse's head and clearly visible in every direction; one dark leather gorytos quiver of arrows hanging at his left hip; his right hand on the reins; dark brown horse with a black mane and tail, a dark leather bridle and reins, a plain dark felt saddle cloth; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **horse_archer A2** (128): A1 with "long-sleeved deep dark crimson felt riding coat to mid-thigh with a worn dark leather belt, the only red he wears, no white cloth; dark umber leather trousers, short dark leather boots" and "one dark leather quiver full of arrows hanging at his right hip, clearly visible".
- **horse_archer A3** (128) / **A4** (100, with "its back as high as a standing man's shoulders"; promoted)
  ```
  grim lean Scythian horse archer seated astride a real full-size steppe horse, the whole horse seen from muzzle to hooves to tail, with realistic adult proportions: the rider seven heads tall, a small head, natural arms, broad shoulders, lean wiry build, his legs hanging down the horse's flanks; the horse a real horse with realistic proportions, much bigger than the man, its back as high as a standing man's shoulders, a long neck and head, a deep chest, exactly four long slender legs with hooves; tall pointed dark umber felt Scythian hood with long ear flaps, a dark beard, no helmet; long-sleeved deep dark crimson felt riding coat to mid-thigh with a worn dark leather belt, the only red he wears, no white cloth; dark umber leather trousers, short dark leather boots; no shield; one large recurved composite bow held up in his raised left hand, out to his left side at the height of his head, the whole bow standing upright above the horse's back and clearly visible in every direction; one dark leather quiver of arrows on his back, the arrow ends above his right shoulder; his right hand holds the reins; dark brown horse with a black mane and tail, a dark leather bridle and reins, a plain dark felt saddle cloth; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **chariot A1** (128, promoted)
  ```
  grim Carthaginian scythed war chariot seen whole from the horses' muzzles to the back of the car: a light two-wheeled chariot pulled by exactly two real full-size horses side by side under one yoke on a single wooden pole, each horse with exactly four long slender legs, real horse proportions, much bigger than the man; one driver standing upright in the open car behind the horses, with realistic adult proportions: seven heads tall, a small head in a snug helmet, natural arms, broad shoulders, lean muscular build; tall conical dark weathered bronze pilos helmet, no crest; deep dark purple-black cloak hanging behind him; dark umber leather corselet over a dark oxblood-brown tunic, no white cloth; he holds the dark leather reins in both hands; one curved iron kopis sword in a scabbard at his hip; the car a low dark wooden box with a dark bronze rim, two large spoked dark wooden wheels, one long curved iron scythe blade sticking out sideways from each wheel hub; two dark bay horses with black manes and tails and dark leather harness; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **chariot O1** (`create_object_pro_flash`, 168 x 168, 8 directions, `style_image` H4 south-east "copy this pixel-art style exactly … the chariot driver is the same size as this man"): the A1 prompt rephrased for an object, the driver "exactly as tall and as big as the man in the style image (about 58 pixels from head to feet)", "no ground shadow".
- **chariot S1** (`create_object_pro_flash`, 128, 1 direction, `style_image` A1 south "the same chariot … drawn bigger"): a front view of A1's prompt with "58 pixels tall from head to feet".
- **Gallop, step 1** (pixminimax, 16 frames, `subject_description` "a cavalryman with a lance riding a dark bay warhorse"; SE used "towards the south-east")
  ```
  the horse gallops in place in the direction it faces with a real horse's heavy gallop: the hind legs push off one after the other, then the front legs reach forward and strike the ground one after the other, then a moment of suspension with all four legs gathered under the belly; the head and neck nod with each stride, the body rises and falls with weight, the tail streams back; the rider sits deep in the saddle leaning a little forward, moving with the horse, the cloak flapping, the lance kept upright in his right hand; exactly four legs on the horse in every frame
  ```
- **Gallop, step 2** (pixminimax, 16 frames, start = end = the widest frame 2..9 of step 1 (`keyframe.mjs`), `keep_first_frame: false`, `initial_pose` "mid-gallop, the legs stretched out front and back")
  ```
  one full stride of a real horse's heavy gallop in place in the direction it faces, a seamless loop: the hind legs push off one after the other, the front legs reach forward and strike the ground one after the other, then a moment of suspension with all four legs gathered under the belly, back to the stretched pose; the head and neck nod with the stride, the body rises and falls with weight, the tail streams back; the rider sits deep in the saddle leaning a little forward, moving with the horse, the cloak flapping, the lance kept upright in his right hand; exactly four legs on the horse in every frame
  ```

| # | Class | Attempt | Id | Outcome |
| --- | --- | --- | --- | --- |
| 1 | companion | Pa1 | `fe66ab96` | **Probe (a) winner, rejected for scale:** 1.3–1.45x H4. Its SE/NE/SW/NW gallop loops proved the recipe |
| 2 | companion | Pb1 | `86b445a7` | **Rejected (probe b):** pony horse, ground shadow, Corinthian-looking helm |
| 3 | companion | A2 | `1df70e8f` | **Rejected:** scale right, the helm a closed Corinthian dome |
| 4 | companion | A3 | `db742ca7` | **Rejected:** the cloak's two source colours are also the black mane and tail (no clean cloak group) |
| 5 | companion | A4 | `7eb8f6be` | **Rejected:** clean purple cloak, but a bright orange chestnut horse (drift; remaps to crimson) |
| 6 | companion | A5 | `04c31c65` | **Promoted:** Boeotian brim, one lance 8/8, purple only on the cloak, dull dark bay |
| 7 | thessalian | A1 | `d20a0238` | **Rejected:** 1.35x H4 (size 128) |
| 8 | thessalian | A2 | `7e21f8b0` | **Rejected:** the buckler grew into an aspis with H4's lambda |
| 9 | thessalian | A3 | `1fb01c02` | **Promoted:** pilos, small plain buckler, exactly two javelins (2 heads in every facing), crimson cloak in its own ramp, dun-grey horse |
| 10 | horse_archer | A1 | `d126eafb` | **Rejected:** all umber (trousers hidden by the horse: no colour group), quiver unclear; 128 |
| 11 | horse_archer | A2 | `169fbd9b` | **Rejected:** the bow missing in NE and SW, two arrow bundles in NE |
| 12 | horse_archer | A3 | `148bc653` | **Rejected for scale only** (128): one bow and one back quiver in all 4 facings |
| 13 | horse_archer | A4 | `afba45aa` | **Promoted:** A3 at 100; one bow raised clear of the horse in 4/4, quiver on the back, crimson coat in its own ramp |
| 14 | chariot | A1 | `bceaa28b` | **Promoted:** two horses (4 legs each), car, 2 wheels with scythes, driver with reins in 8/8; crew at H4 scale. The kopis is drawn in his hand in SE/SW (prompt said scabbard): one blade, kept |
| 15 | chariot | O1 | object `91b243f5` | **Rejected:** near-black style drift, no scythes, hooded driver |
| 16 | chariot | S1 | object `1b8e1167` | **Discarded:** the "full scale" front view came back at A1's scale |

**Gallop (companion A5).** Step 1 in SE, NE, SW, NW (16 frames each, 5 gens). Step 2 keyed on SE frame 4, NE 5, SW 4, NW 5 (5 gens). The result is 16 frames per facing at 16 fps: two strides of 8, with gather, push-off, extension and suspension. The head nods and the cloak streams. One lance and one rider in every frame; 4 legs (a far leg is sometimes hidden behind a near one, never doubled). The wrap 15 → 0 differs 51–63 % against 35–65 % between neighbours (`loopfind.mjs`), so it loops without a jump. Stored canvases are 128–144 px; the cropped content is 77–85 x 92–104. A few stray light pixels on hooves are taken by the invented-colour cut. Checked frame by frame on `clip.mjs` sheets: no rejects. On size-100 riders, step 1 alone already loops (frame 16 ≈ frame 0, 3.7 %), but it passes through the standing pose every stride (a hop), so it is used only for the key. Sheet: `docs/v5/art/I4b-gallop.png` / `.gif`.

**Colour groups (PA-WORLD-DARK-I4a remap).** Clean: companion A5 cloak (purpleBlack), thessalian A3 cloak (crimson), horse archer A4 coat (teamRed + crimson; the class's "cloak" group), chariot driver's cloak (purpleBlack, a few harness pixels). **Shared, for the runtime to decide:** pro at size 100 draws a rider with only 10–14 colours, so the bay coat is the rider's skin ramp (companion, horse archer, chariot), and the companion's bronze shares the horse's browns. Per-man skin tinting (V5-095) would tint the horse; metal rarity would recolour the coat. A horse ramp in the palette (tried: hue 44, chroma 0.06–0.11) does not separate them, because the source colours themselves are shared (it also takes the rider's arms). Pa1 at 128 had 24 colours: a bigger canvas gives more colours, but the wrong scale.

**Runtime needs.** Rider rotations sit in a 100 x 100 canvas, hooves on row 94–98, the figure 62–71 x 85–98 px; the gallop frames come back on 128–140 canvases and need about 96 x 112 after cropping (today's rider frame is 96 x 84, hooves at 74: too short). Chariot: 128 x 128, wheels on row 117–118, the figure 113–118 x 108–110 (today 128 x 96: too short). Per-row anchors (the box centre x, the ground row) are in `mounted.json`; the manifest `scale` is the same as the H4-based foot sheets (same art px per metre).

**Cost of the full mounted set** (per class, all 4 facings): pixminimax at 100 px is 1 gen per facing per 16 frames (2 for SE once: the canvas grew); a keyed loop costs 1 more. About 25 clips (idle, look, walk, trot, gallop, charge, rout, ready, shoot / throw / thrust, hit, rear, 2 deaths, cheer …) × 4 facings × 1–2 = 100–200 gens per class, about 120 with keyed loops only on the 5 cycles; the chariot at 128 about 1.5x. **About 500–600 gens for the 4 mounted classes**, plus about 30 for re-rolls.

**Lessons.**
- One humanoid pro character carries a rider and his horse; the quadruped template is the worse choice for a mounted figure.
- The canvas sets the scale: riders at 100, the chariot at 128. Measure the head (crown to chin) and the withers before paying for clips.
- The H4 style reference leaks its lambda into any round shield: say "plain …, no emblem, no painted sign".
- A weapon held at the side vanishes behind the horse in two facings: raise it ("held up in his raised left hand … above the horse's back").
- Give the cloak a hue nothing on the horse has (purple on a bay with a brown mane); a black mane takes a dark cloak's colours.
- pixminimax gallops start from the standing pose; key the loop on a stretched frame for a clean cycle.

### I5b Shieldless, two-handed and missile foot classes: full packed sheets from the I4a bases (2026-10-18)

**Brief.** Take rhomphaia, celt_sword, archer, falx, gallic, slinger and fanatic from their approved I4a bases to full
sheets at the hoplite's standard (16 clips, 12–16 frames, 4 facings, runtime tiers), with physically real attacks: a
two-handed cleave for the two-handed blades, a weighted one-hand cut with the shield moving with the body for the shield
classes, a nock-draw-release bow shot, an overhead whirl and whip release for the sling, and a short melee `stab` for the
missile men (the sim lets them fight at close quarters). Hard rejects checked frame by frame on contact sheets.

**Tool and budget.** PixelLab MCP, Tier 2, at most 4 of my jobs at once (the account shared with other agents). Balance
before: 4,236.50 generations left. Cap 1,250 for the 7 classes. **Raws:** `docs/v5/pixellab/I5b/raw/<class>/`
(gitignored): `base/` (the I4a rotations, refetched), `first/` (first frames), `clips/<anim>/<dir>/<attempt>/`.
**Machine-readable:** `docs/v5/pixellab/I5b/<class>.jobs.json` (every job, its first frame and quoted gens),
`<class>.picks.json` (which attempt ships per clip and facing, frame fixes, with the reason of every rejected frame),
`<class>.sheet.json` (the sheetbuild spec, written from the picks by `scripts/art/pixellab/i5b/mkspec.mjs`). **Rebuild:**
`node scripts/art/pixellab/i5b/prep.mjs <class>` (first frames), `node scripts/art/pixellab/fetchjobs.mjs docs/v5/pixellab/I5b/<class>.jobs.json docs/v5/pixellab/I5b/raw/<class>`,
then the guard frames (`i5b/setfirst.mjs`, below), `i5b/mkspec.mjs <class>` and `sheetbuild.mjs docs/v5/pixellab/I5b/<class>.sheet.json`.
**Tools** (`scripts/art/pixellab/i5b/`): `prep.mjs` (rot / tall / atk / die canvases), `setfirst.mjs` + `repad.mjs` (a clip
frame promoted to a first frame, also moved onto the attack canvas), `upload.mjs`, `addjob.mjs`, `rv.mjs` (contact sheet
of clips), `rampdump.mjs` (which raw colour lands in which ramp step), `feet.mjs`, `mkspec.mjs`, `shots5b.mjs`
(preview screenshots), `rig5b.mjs` (two-handed and one-hand cut skeletons on the shared rig, kept for an A/B; not
needed in the end).

**Recipe (what changed against STYLE_LOCK §6).** All clips are pixminimax (1 gen at 68 and 96 x 112, 2 at 128).
- **The guard frame.** The bases carry the weapon at rest (upright, or point down), so the stance clips (ready, charge,
  brace, block, stagger) start from a guard frame that PixelLab draws itself: an 8-frame "he takes his fighting guard"
  clip on the tall canvas (1 gen per facing), whose last frame is the guard. Its look is the model's own, so no pixel
  editing (the hoplite's `spear.mjs`) is needed.
- **The attack** starts from that guard moved onto a 128 x 112 attack canvas (the man set back 20 px from his facing,
  40 px ahead of him, 40 above) and ends back in it, so the runtime's windup flows out of `ready` and the recovery flows
  back in. 16 frames at 16 fps, `strike` 6.
- **The crescent smear.** At the moment of the blow pixminimax bends a long blade into a big crescent (a motion smear
  drawn as metal) in every facing, whatever the prompt says. Those 1–2 frames are dropped by the spec's `frames` list,
  the windup's peak held a frame instead (an anticipation hold), so the blow lands in one frame from the top of the
  swing, the blade in its own shape.
- **Blood and sparks** come anyway; the colour cut removes them, and every frame where the cut took the blade with it is
  replaced by its neighbour (`fixes`).
- Stature: classes whose headgear rises above the skull set the spec's `stature.skipTop`; crestless classes set
  `"crest": false, "emblem": false` (both added to the shared scripts for I5b by pipeline-fix2).

#### rhomphaia

Base: I4a A2 `440f945a` (open Phrygian helm, crimson cloak, iron scale, rhomphaia upright). Ramps outline, crimson, umber,
darkBronze, skin, metal; the helmet is umber (its lightest step the trim, the rest metal), the iron scale and blade the
metal ramp (not recoloured), skin only the face and arms (no leather in the skin ramp). Subject: "a tall grim Thracian
rhomphaia warrior in an open-faced dark bronze Phrygian helmet, a dark crimson cloak, a dark iron scale corselet, dark
brown trousers and dark bronze greaves, no shield, one long rhomphaia: a wooden shaft and a long slightly curved
single-edged iron blade" (back facings: "… seen from behind, …"). Prompts: PROMPTS_ART › 19 (I5b).

**The attack (`slash`, 16 @ 16, strike 6).** From the low two-handed guard (blade forward at the enemy, both hands on
the shaft) he heaves the blade up and back over his right shoulder (f1–f5, the peak held a frame), steps in on the left
foot with the hips turning and brings it down in one frame to low at his left in front of him (f6), follows through low
and bent forward (f7–f11), and settles back into the guard (f12–f15). Both hands stay on the shaft in every frame.

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | guard | SW | a1 | 1 | **Rejected:** the blade carried up over the left shoulder (a port), not at the target |
| 2 | guard | SW SE NW | a2 | 3 | **Promoted** (f7): blade forward low, both hands on the shaft |
| 3 | guard | NE | a2 | 1 | **Rejected:** facing drift, he turns round to the right, chest to the viewer |
| 4 | guard | NE | a3 | 1 | **Promoted** (f7): side-on, back to the viewer ("his back and cloak to the viewer in every frame … he does not turn round") |
| 5 | slash | SW | a1 | 2 | Kept as the A/B: a good cut from the upright rest; superseded by a3 (starts and ends in the guard) |
| 6 | slash | SW | a2 | 2 | **Rejected:** crescent smears f6–f7, a long held low pose |
| 7 | slash | all 4 | a3 | 8 | **Promoted after frame drops:** crescent smears SE f5–f6, NE f4, SW f6, NW f5–f6 dropped (the peak held instead) |
| 8 | idle, look, adjust, walk, run, rout, kneel | all 4 | a1 | 28 | **Promoted** (walk NE drifts towards facing north mid-cycle: kept) |
| 9 | ready, brace, block, stagger | all 4 | a1 | 16 | **Promoted after the cut:** block sparks f2–f4 in every facing (cut; SE f2, NE f2 lost the blade: := f3); stagger blood SE f0, NE f0, NW f0–f1 (cut took the blade: := next frame) |
| 10 | charge | SE SW NW | a1 | 3 | **Promoted** |
| 11 | charge | NE | a1 | 1 | **Rejected:** the rhomphaia vanishes f1–f3 |
| 12 | charge | NE | a2 | 1 | **Promoted** ("the whole rhomphaia clearly visible in every frame, never hidden") |
| 13 | fallBack, fallFwd | all 4 | a1 | 16 | **Promoted after the cut:** blood in 6 of 8 (cut); fallBack SE f0 and SW f3 lost the blade (:= neighbour) |
| 14 | cheer | all 4 | a1 | 4 | **Promoted** |

**Rejections** (whole clip-directions / frames): weapon not at the target 1 clip; facing drift 1 clip; weapon missing
1 clip; gear drift (crescent smear) 1 clip + 6 frames; blade lost to the blood or spark cut 8 frames. Reversed or doubled
weapon, a hand off the haft, head backwards, clipped by the canvas, proportion drift: **0**. Invented effects cut: sparks
in 4 clips, blood in 10.

**Sheet.** 16 clips, 204 columns, frame 118 x 113, 4012 x 2712 (41.5 MB decoded as v2); packed **9.06 MB decoded
(core 7.56 MB), 252 KB download**. 48 colours; groups cloak 6, trim 2, skin, wood; metal: bronze (helmet), weapon. Tiers
(V5-098 colours): veteran wine cloak and polished trim, elite black cloak and gold trim. **QC:** 0 failures (stature 57–58
with `skipTop` 4 for the Phrygian crown); 51 warnings, all the spear-end heuristic on a blade (a blade's tip is thinner
than a spearhead, so "the leading end is the thin one" fires on the upright carry; checked by eye on the strips: blade at
the top or at the target in every frame). **Gens:** 87 quoted (73 jobs).
**Rebuilt** after the iron work below (`iron` ramp, `metalKind`, `spear: false`, `greyCut` 0.8): the iron scale and blade
are one iron metal group (weapon, armor), the bronze helmet a bronze one (helmet); 32 colours; packed 9.07 MB decoded
(core 7.56), 248 KB; QC 0 failures, 53 warnings (spear heuristic on the blade).

**Iron.** PA-WORLD-DARK had no neutral iron: the `metal` ramp's light steps are warm tan, so lit iron came out bronze,
and `foreign()` cut every light neutral grey (L > 0.55) as a ghost trail, which hollowed out lit blades (two outline lines
with the ground showing through). Fixes, each a separate commit: an additive `iron` ramp in `palette-dark.json`
(`#1c1b1c … #b0adab`, matched to the bases' iron; main logs it as V5-105), and an opt-in `greyCut` spec field in the shared
sheet pipeline (default 0.55; iron classes 0.8; the hoplite rebuilt from its raws byte-identical). With pipeline-fix3's
`metalKind` / `metalSlots` / `spear: false`, iron is its own rarity group (`ironOf`) and the spear-line heuristic no
longer tags cloak or leather pixels on swords, axes and bows.

#### celt_sword

Base: I4a N2 `73d12bee` (iron Montefortino, green plaid cloak, ring mail, bronze torc, checked trousers, oval shield,
longsword). The data gives him a shield, so the attack is a **weighted one-hand cut with the shield moving with the
body**. Ramps outline, umber, darkBronze, skin, plaidGreen, bronze, iron; parts: plaidGreen → cloak, bronze (the torc) →
trim, umber and darkBronze (shield wood, leather, trousers) → shadow, iron → metal (`metalKind` iron, slots helmet,
armor, weapon); crest and emblem off; `stature.from: any`.

**The attack (`slash`, 16 @ 16, strike 6).** From the guard behind the tall shield he draws the sword back high over his
right shoulder (f1–f5), steps in on the left foot with the hips and shoulders turning and the shield driving forward,
and cuts down into the man in front of him (f6, the blow low ahead of his left knee, the point at the target), follows
through low (f7–f11) and comes back up behind the shield (f12–f15).

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | guard | all 4 | a1 | 4 | **Promoted** (f7): SW sword up beside the shield, SE forward low, NE / NW raised |
| 2 | slash | SW | a1 | 2 | **Rejected:** he turns to face south mid-cut and the blade ends pointing to the lower right, off the target; crescent smears, an orange trail |
| 3 | slash | SW SE | a2 | 4 | **Promoted after frame drops:** "at an enemy in front of him … ending low ahead of his left knee with the point still towards …"; crescent smears SW f4–f5, SE f6 dropped |
| 4 | slash | NE | a2 | 2 | **Rejected:** he turns round to the viewer in the windup (face to the camera, f1–f4) |
| 5 | slash | NE | a3 | 2 | **Promoted:** "his back and cloak to the viewer in every frame … he never turns round"; a fiery flash f6 (cut) := f7 |
| 6 | slash | NW | a1 | 2 | **Rejected:** facing drift, he turns to face west and south-west through the follow-through |
| 7 | slash | NW | a2 | 2 | **Promoted:** "his body keeps facing the upper left the whole time"; crescent smear f7 dropped |
| 8 | idle, look, adjust, walk, run, rout, kneel | all 4 | a1 | 28 | **Promoted** |
| 9 | ready, charge, brace, block, stagger | all 4 | a1 | 20 | **Promoted after the cut** (block sparks f1–f4, stagger blood specks) |
| 10 | fallBack, fallFwd | all 4 | a1 | 16 | **Promoted after the cut** (blood in 4 of 8) |
| 11 | cheer | all 4 | a1 | 4 | **Promoted** |

**Rejections:** facing drift (turned round or sideways) 3 clips; blade off the target 1 clip; gear drift (crescent smear)
4 frames, flash-damaged blade 1 frame. Doubled or reversed weapon, shield missing, head backwards, clipping, proportion
drift: **0**. Invented effects cut: sparks in 4 clips, blood in 6, one fire trail.

**Sheet.** 16 clips, frame 83 x 110, 4067 x 2200 (34.1 MB decoded as v2); packed **7.65 MB decoded (core 6.04 MB), 257 KB**.
29 colours; groups cloak 5 (plaid green), trim 3 (the torc), skin 4; metal: iron (helmet, mail, sword). Tiers: veteran
wine cloak and polished torc, elite black cloak and gold torc (checked in the preview through the runtime). **QC:** 0
failures, stature 56–59; 184 warnings, all the spear-end heuristic on a sword and a shield edge (both free ends wide).
**Gens:** 86 quoted (71 jobs).

**Rebuilt** after `alignMax` (below): the guard canvases are now measured on the model-drawn guard frame itself
(`mkspec.mjs`), and clips whose frame 0 is redrawn 7–16 px off are re-anchored (`alignMax` [18, 8], a new opt-in field in
the shared sheetbuild, hoplite byte-identical), so ready, block and stagger no longer slide sideways off the anchor.
celt_sword packed 7.65 MB decoded, rhomphaia 9.07 MB; QC 0 failures for both.

#### archer

Base: I4a N1 `199cd6bb` (bare curly head, crimson cloak, leather jerkin, one plain bow, back quiver). The data gives him a
bow and a melee fight at close quarters (`attack` → the runtime's `stab`), so the sheet has `shoot` and `stab`; no
`brace` (no shield wall: the runtime falls back to `block`). Ramps outline, crimson, umber, darkBronze, skin, iron; the
leather and wood go to shadow (no metal, no rarity group), crimson is the cloak, skin is skin only (his leather is
umber, not in the skin ramp). Crest, emblem and the spear heuristic off; `stature.from: any`.

**The shot (`shoot`, 16 @ 16, strike 10).** He draws an arrow from the quiver over his shoulder (f0–f2), nocks it (f3),
turns side-on and raises the bow arm straight at the target while the string comes back to the cheek, back and shoulder
tight (f4–f9, the full draw held), releases at f10 (the string snaps forward, the bow arm recoils, the right hand flies
back past the ear) and lowers the bow (f11–f15). The runtime spreads f0–f9 over the aim window and plays the release at
the shot. The loosed arrow PixelLab draws in flight is cleared (`i5b/detached.mjs` lists the detached pieces as `clear`
fixes): the sim draws the missile. Every shoot was re-timed with `frames` so the release lands on index 10 in all four
facings.

**The melee (`stab`, 12 @ 14, strike 4).** A two-handed bow ram: he grips the bow with both hands, steps in on the left
foot and drives its end into the face of the man in front of him, then steps back with the bow in his left hand.

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | shoot | all 4 | a1 | 8 | **Promoted after the cut:** arrows in flight cleared; SE f0–f1 an arrow already flying before he shoots (REJECTED pieces, cleared); NE the loosed arrow flies the wrong way (cleared) |
| 2 | guard (nocked ready) | all 4 | a1 | 4 | **Promoted** (SW SE NE f7 / f6; NW f7 the arrow low to his left, kept as a low ready) |
| 3 | adjust | SW | a1 | 1 | **Rejected:** a second bow appears f5–f9 ("flexes the bow": one bow in each hand) |
| 4 | adjust | SW | a2 | 1 | **Promoted** ("the one bow never moves from his left hand … there is only one bow") |
| 5 | stab | all 4 | a1 | 8 | **Promoted after the cut:** sparks and blood in every facing; NE f5–f6 lost the bow with the cut (:= neighbours); NE swings the bow up rather than ramming it forward (kept, **weak**) |
| 6 | idle, look, walk, run, rout, kneel, charge, ready, block, stagger | all 4 | a1 | 40 | **Promoted** (stagger SW f0 an arrow pops out of the hand: := f1; a hollow-drawn bow in walk SE f6, look NE f14, adjust NE f9: := neighbour; block sparks cut) |
| 7 | fallBack, fallFwd | all 4 | a1 | 16 | **Promoted after the cut** (blood in 5 of 8) |
| 8 | cheer | all 4 | a1 | 4 | **Promoted** (the bow raised overhead) |

**Rejections:** a second bow 1 clip; a second missile (arrow already flying or popping out) 2 pieces + 1 frame; bow lost
to the cut 2 frames; hollow bow 3 frames. Head backwards, clipping, proportion drift: **0**.

**Sheet.** 16 clips, frame 120 x 109, 4080 x 2616 (40.7 MB as v2); packed **8.23 MB decoded (core 6.69 MB), 285 KB**.
28 colours; groups cloak 6 (crimson), skin 4; no metal group. Tiers: veteran wine cloak, elite black cloak. **QC:** 0
failures, stature 57–60; 146 warnings, all the spear-end heuristic on the bow and arrow. **Gens:** 85 quoted (69 jobs).

#### falx

Base: I4a N1 `63527404` (black hair and beard, moss-green cloak, umber leather jerkin, brown trousers, falx in both hands).
**Groups (the open question from I4a):** his leather jerkin, trousers and boots are raw `#412a22`, which lands on skin
step 0, while his real skin lands on steps 2–3. `parts` `{ "skin:0": "shadow" }` takes step 0 out of the skin group, so
the per-man skin recolour (V5-095) can no longer tint his leather; the skin group is now `#7b503d … #f8d5c2` only (checked
in the manifest). The other leather-clad classes were checked the same way with `i5b/rampdump.mjs`: the archer's and
celt_sword's leather is umber, not skin; slinger, gallic and fanatic are checked in their own sections. Also: plaidGreen
→ cloak, umber and darkBronze → shadow, iron → the iron metal group (weapon), crest and emblem off, `greyCut` 0.8.

**The attack (`slash`, 16 @ 16, strike 6).** The same two-handed cleave as the rhomphaia, with the falx's hook: from
the low guard he heaves the falx up and back over his right shoulder with both hands on the haft (f1–f5), steps in on
the left foot with the hips leading and brings the sickle blade down into the man in front of him, the inner edge
first (f6), follows through low at his left (f7–f11) and comes back to the guard (f12–f15).

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | guard | all 4 | a1 | 4 | **Promoted** (f7) |
| 2 | slash | all 4 | a1 | 8 | **Promoted after frame drops:** crescent smears SW f5–f6, SE f8, NE f7, NW f6 dropped |
| 3 | look | NE | a1 | 1 | **Promoted after frame drops:** f8–f15 REJECTED, the head turns round to face the viewer; the first half is played out and back |
| 4 | everything else | all 4 | a1 | 59 | **Promoted** (block sparks and death blood cut) |

**Rejections:** head turned backwards 8 frames; gear drift (crescent smear) 5 frames. **Needs review:** in the NE
stance clips (ready, charge, brace, block, stagger) the falx reads as a long curved blade with a smaller hook than the
base's; one weapon, held right, but a softer silhouette.

**Sheet.** 16 clips, frame 112 x 113, 4032 x 2712 (41.7 MB as v2); packed **8.68 MB decoded (core 7.19 MB), 243 KB**.
27 colours; groups cloak 4 (moss green), skin 4 (leather excluded); metal: iron (weapon). Tiers: veteran wine cloak, elite
black cloak. **QC:** 0 failures, stature 57 in all four facings; 139 warnings (the spear-end heuristic on the falx).
**Gens:** 80 quoted (68 jobs).

#### gallic

Base: I4a N1 (bare-chested, limed spiked hair, long moustache, blue woad, bronze torc, dark trousers, tall oval hide
shield with an iron boss, one iron war axe). The data gives him a shield, so the attack is a **weighted one-hand chop
with the shield moving with the body**. **Groups:** `i5b/rampdump.mjs` on the base and the slash: his trousers and the
hide shield are raw `#352b26` (metal step 0) and `#241913` / umber, not skin, so the skin group is his body only; the
hair lands on linen; the woad lands on enemySlate. Ramps outline, umber, darkBronze, skin, bronze, iron, linen, metal,
enemySlate; parts: bronze (the torc, the SE shield rim) → trim, iron → the iron metal group (weapon), the rest → shadow;
crest, emblem and the spear heuristic off; `greyCut` 0.8; `stature.from: any`.

**The attack (`slash`, 16 @ 16, strike 6).** From the guard behind the tall shield he lifts the axe high over his right
shoulder (f1–f5), steps in on the left foot with the hips and shoulders turning and the shield driven forward, and chops
down into the man in front of him (f6, low ahead of the left knee), follows through low (f7–f11) and comes back up
behind the shield (f12–f15). Every facing was re-timed with `frames` so the chop lands on index 6.

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | guard | SE | a1 | 1 | **Rejected:** gear drift, a bright gold shield rim and boss |
| 2 | guard | all 4 | a1 / SE a2 | 4 | **Promoted** (f7); SE a2's dark-orange rim is on the approved SE base |
| 3 | slash | SW | a1 | 2 | **Rejected:** he turns his back in the windup (f2–f6); blood at the blow |
| 4 | slash | SW | a2 | 2 | **Promoted after frame drops:** f3–f5 REJECTED (turned away again); the raised axe f2 is held into the overhead f6 |
| 5 | slash | SE | a1 | 2 | **Rejected:** the shield swings out of sight behind him for the follow-through; crescent smear |
| 6 | slash | SE | a2 | 2 | **Promoted after frame drops:** crescent smear f4 dropped |
| 7 | slash | NE NW | a1 | 4 | **Promoted after frame drops:** NE crescent smears f6–f7; NW f2–f3 REJECTED (turned round to the viewer) |
| 8 | block | SW | a1 a2 | 2 | **Rejected:** he turns his back on the blow / the shield jumps to his other side |
| 9 | block | SW | a3 | 1 | **Promoted:** the shield thrust out left shoulder first; f8 (a back view in passing) dropped |
| 10 | block | SE NE NW | a1 | 3 | **Promoted after frame drops:** SE f5–f11 REJECTED (the hair turns blond, sparks over the shield), the raise played out and back; NE f1–f2, NW f2 spark bursts over the shield |
| 11 | fallBack | SW SE | a1 | 4 | **Rejected:** blood bursts over the chest and shield in the first frames (a colour cut would hole the body) |
| 12 | fallBack | SW SE | a2 | 4 | **Promoted:** "his strength suddenly gives out … no wounds, no red" (used for NE and NW too) |
| 13 | cheer | SE | a1 | 1 | Re-run on a false alarm (the raised axe made him look taller; the body measures the same); a2 used |
| 14 | everything else | all 4 | a1 | 59 | **Promoted** (blood dropped by frame: stagger SW SE NE, fallFwd SW SE, kneel NE; one black-hair frame in adjust SE) |

**Rejections:** facing drift (turned his back or round) 3 clips + 2 frame runs; shield out of sight 1 clip; gear drift
(gold rim 1 clip, blond hair 7 frames, black hair 1 frame, crescent smears 3 frames); blood over the body 2 clips + 9
frames. Doubled or reversed weapon, a second shield, clipping, proportion drift: **0**. **Needs review:** in the NW guard
stance (ready, charge's first frame, block, the slash's windup) the axe is held up across his body over the shield's top
edge, which from behind reads like the left hand; the SE shield has the dark-orange rim of its base (the other facings
have none), and that rim is trim, so the tiers tint it; the woad stays enemySlate blue (shadow, not tinted). One slot
over the cap: five jobs ran at once for a few minutes (cheer SE a2), then back to four.

**Sheet.** 16 clips, frame 88 x 112, 4048 x 2240 (34.6 MB as v2); packed **7.76 MB decoded (core 6.05 MB), 259 KB**. 35 colours; groups trim 3
(the torc), skin 4 (the body only); metal: iron (weapon). Tiers: veteran polished torc, elite gold torc (he has no cloak).
**QC:** 0 failures, stature 61 in all four facings; 374 warnings, all the spear-end heuristic on the axe and the shield
edge. **Gens:** 92 quoted (76 jobs).

#### slinger

Base: I4a N1 `d15d6271` (bare head, short dark hair and beard, crimson cloak, oxblood tunic, belt and bullet pouch,
sandals, one leather sling in the right hand). The data gives him a sling and a melee fight at close quarters, so the
sheet has `sling` and `stab` (no `brace`: no shield wall, the runtime falls back to `block`). **Groups:**
`i5b/rampdump.mjs`: his tunic is outline / umber, his belt a few px of skin step 1; the skin group is his arms and legs.
Ramps outline, crimson, umber, skin, darkBronze; parts: crimson → cloak, umber and darkBronze → shadow; no metal; crest,
emblem and the spear heuristic off; `stature.from: any`.

**The shot (`sling`, 16 @ 16, strike 10).** From the rest he turns side-on with his weight back, lifts the loaded sling
over his head and whirls it in flat circles (f1–f9: the whirl, which loops, so the runtime can hold it through the aim),
steps in on the left foot and whips the arm forward and down at f10, one cord let go, the pouch snapping open, and
follows through past the left hip and lowers the sling (f11–f15). The whirl's motion arcs and the loosed bullet are
cleared (`i5b/detached.mjs`): the sim draws the missile. NE and NW were re-timed with `frames` so the release lands on
index 10. **The melee (`stab`, 12 @ 14, strike 4).** The cords wound round his fist, he steps in and brings the loaded
pouch down on the man in front of him like a club, then steps back.

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | guard (ready) | all 4 | a1 | 4 | **Promoted** (SW SE NE f6, NW f7); SW f7 REJECTED (the sling drawn as a stick), NE f7 (a bullet in flight) |
| 2 | sling | all 4 | a1 | 8 | **Promoted after the cut and re-timing:** motion arcs and the loosed bullet cleared; NE turns side-on to whirl (kept) |
| 3 | stab | NE NW | a1 | 4 | **Rejected:** facing drift, he turns and strikes to the west; NW his face turns to the viewer |
| 4 | stab | all 4 | SW SE a1, NE NW a2 | 8 | **Promoted after frame drops:** spark bursts over the pouch dropped, loose sparks cut; SE (a low swing) and NE (an upward swing) are **weak** |
| 5 | walk | NW | a1 | 1 | **Rejected:** the sling hidden behind the cloak for six frames |
| 6 | walk | NW | a2 | 1 | **Promoted, needs review:** still hidden f1–f6 ("clearly visible beside the cloak" did not hold) |
| 7 | rout | NE | a1 | 1 | **Rejected:** he runs out of the frame (clipped by the canvas) |
| 8 | rout | NE | a2 | 1 | **Promoted:** "running in place on the same spot … he does not move away" |
| 9 | everything else | all 4 | a1 | 62 | **Promoted** (block spark frames dropped in all 4; cheer SE f2 the sling drawn as a huge whip, dropped; the dropped bullet in adjust cleared) |

**Rejections:** facing drift 2 clips; sling hidden 1 clip; clipped by the canvas 1 clip; gear drift 3 frames (a stick, a
huge whip); a second missile 1 frame; sparks over the body 6 frames. Doubled or reversed weapon, head backwards,
proportion drift: **0**. **Needs review:** the NW walk (sling hidden by the cloak f1–f6), the NW run (f1–f4 the same),
the SE and NE stab swings; the NE cheer turns to profile; the NW fallBack falls forward like the fallFwd. Twice more
five jobs ran at once for a few minutes (a slip in counting), then back to four.

**Sheet.** 16 clips, frame 120 x 113, 4080 x 2712 (42.2 MB as v2); packed **6.78 MB decoded (core 5.45 MB), 225 KB**. 21 colours; groups cloak 6
(crimson), skin 4; no metal group. Tiers: veteran wine cloak, elite black cloak. **QC:** 0 failures, stature 57 in all
four facings; 454 warnings, all the spear-end heuristic on the sling. **Gens:** 90 quoted (72 jobs).

#### fanatic

Base: I4a N2 `fe0b0a2d` (gaunt, matted ash-grey hair, woad and ash on a bare chest, ragged black cloak, umber kilt
retinted darkBronze, bare feet, one heavy curved iron kopis, no shield). **Groups** (bases.json and `i5b/rampdump.mjs`):
cloak umber (exclusive), kilt darkBronze, hair plaidGreen and linen, woad enemySlate and metal, the blade iron. His skin
lands on the skin ramp alone (no leather), so the skin group is his body. Ramps outline, umber, darkBronze, skin, linen,
plaidGreen, metal, iron, enemySlate; parts: umber → cloak, iron → the iron metal group (weapon), the rest → shadow; crest,
emblem and the spear heuristic off; `greyCut` 0.8; `stature { from: any, skipTop: 5 }` (the hair stands up above the
crown and measured 63–64 against the lock's 58; with the top 5 rows skipped, 58–59). No `brace` (no shield: the runtime
falls back to `block`), so 15 clips.

**The attack (`slash`, 16 @ 16, strike 6).** A frenzied, weighty kopis hack: from his crouch, the blade raised beside
his head, he rears up and hauls the kopis far back over his right shoulder, the body coiling (f1–f5), lunges onto the
left foot and hacks down with all his weight into the man in front of him (f6), bent forward over the blow, then wrenches
the blade back up and drops into the crouch (f7–f15). Each facing is re-timed with `frames` so the hack lands on index 6.

| # | Clip | Dirs | Attempt | Gens | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | guard (frenzied crouch) | all 4 | a1 | 4 | **Promoted** (f7); NW f2 a white smear (not used) |
| 2 | slash | NE | a1 | 2 | **Rejected:** a huge blood burst over the blow and the body (a colour cut would hole him) |
| 3 | slash | all 4 | SW SE NW a1, NE a2 | 8 | **Promoted after frame drops:** crescent smears (SW f4, SE f3, NE f6, NW f5) and blood or sparks at the blow (SW f5–f6, SE f4–f5, NW f6) dropped, loose specks cleared |
| 4 | block | all 4 | a1 | 4 | **Promoted after frame drops:** smears and spark bursts on the parry (SW f2–f4, SE f1–f2, NE f3, NW f1) |
| 5 | stagger | SW | a1 | 1 | **Promoted after frame drops:** f1–f2 a blood burst |
| 6 | everything else | all 4 | a1 | 59 | **Promoted** (the clean-death wording from the gallic gave no blood in any fall) |

**Rejections:** blood over the body 1 clip + 7 frames; gear drift (crescent smear) 7 frames; sparks 7 frames. Doubled or
reversed weapon, head backwards, clipping, proportion drift: **0**. **Needs review:** the cloak is mostly drawn in outline
black, so the tier recolour of its umber group shows only on its folds (veteran and elite read close to basic); the NE
fallBack and the NW fallBack fall more forward than back; the NE rout turns to profile in passing.

**Sheet.** 15 clips, frame 113 x 115, 4068 x 2760 (42.8 MB as v2); packed **9.24 MB decoded (core 7.29 MB), 281 KB**. 28 colours; groups cloak 5
(umber), skin 4; metal: iron (weapon). Tiers: veteran wine cloak, elite black cloak. **QC:** 0 failures, stature 58–59;
168 warnings (the spear heuristic on the kopis). **Gens:** 78 quoted (65 jobs).

### I4a Foot-class base characters: 13 classes on the H4 anchor, 8 rotations each, no animations (2026-10-18)

**Brief.** One approved base character per foot class other than the hoplite (militia, thureophoros, celt_sword, rhomphaia, archer, slinger, javelineer, peltast, falx, gallic, fanatic, royal_guard, sacred_band), matching H4 (`b7624d6d`) in style, shape and proportion, following `docs/v5/art/STYLE_LOCK.md`. Mood is dark-epic: Greeks in bronze and crimson; Carthaginians in purple-black, bronze and linen; Celts in plaid, iron, woad and torcs. Every class must read at battle scale by its headgear and silhouette (art bible §5.2). The cloak, crest and trim stay clean colour groups for the tier recolour (V5-092). Hard rejects are checked in all 8 views.

**Tool and budget.** PixelLab MCP, at most 5 of my jobs at once. Account balance before: 4,683.75 left (219.25 used). After: 4,408.50 left (494.50 used), a change of 275.25 that includes hoplite-prod's animation jobs running in parallel. **Mine by receipt: 221.25 gens** (cap 650). That is 22 pro characters at 10 each and 5 v3 imports at 0.25 each. Four more pro jobs were cancelled mid-run (the raised-weapon re-rolls, see below). The slinger at size 62 was refused at once at no cost. **Raws:** `docs/v5/pixellab/I4a/raw/<class>/<attempt>/` (gitignored), `review.png` beside each. **Machine-readable:** `docs/v5/pixellab/bases.json`. **Ramps:** `docs/v5/pixellab/I4a/palette-dark-i4a.json` is PA-WORLD-DARK plus `purpleBlack` and `plaidGreen`; hoplite-prod is adding them to `palette-dark.json`. **Sheets:** `docs/v5/art/I4a-roster-facings.png` (all 14 classes, the 4 game facings, scale 3, PA-WORLD-DARK-I4a remap, iso ground) and `docs/v5/art/I4a-roster-formation.png` (a mixed 5x3 block, SW front and NE back, zoom 1 and 3). **Tools:** `scripts/art/pixellab/rollout/` holds `review.mjs` (fetch plus a sheet under H4), `stature.mjs`, `overlay.mjs` (H4's silhouette over the class), `groups.mjs` and `groupsall.mjs` (ramp false-colour), `normalise.mjs`, `upload.mjs`, `upscale.mjs`, `colours.mjs` and `roster.mjs`.

**Fixed call** (every attempt unless noted): `create_character`, `mode: pro`, `style_character_id: b7624d6d-132a-458c-8e3d-d6960d175988` (H4), `size: 68`, `view: high top-down`. Step A only: no concept image, except slinger B1. The prompts use STYLE_LOCK §3's block, but say "with realistic adult proportions" because there is no concept to refer to.

**Headgear** (§5.2 wins over the item data where they differ, so no two classes share H4's helmet; main logs this as a decision):

| class | headgear | shield | weapon |
| --- | --- | --- | --- |
| militia | felt pilos cap | none | short spear |
| thureophoros | bronze pilos | oval thureos | short sword |
| celt_sword | iron Montefortino | oval Celtic | longsword |
| rhomphaia | open Phrygian helm | none | rhomphaia |
| archer | bare curly head | none | composite bow |
| slinger | bare head | none | sling |
| javelineer | soft Thracian cap | pelte | 2 javelins |
| peltast | open Thracian helm | pelte | spear |
| falx | long hair | none | falx |
| gallic | limed spikes | oval hide | war axe |
| fanatic | shaved, ash | none | kopis |
| royal_guard | gilded Attic helm with plumes | silver aspis | long spear |
| sacred_band | Boeotian helm | aspis with a club | long spear |

**Prompts, word for word:**

- **militia A1**
  ```
  grim weathered Greek peasant levy spearman with realistic adult proportions: seven heads tall, a small head in a snug cap, long legs, natural arms, broad shoulders, lean wiry build; low rounded dark brown felt pilos cap, no crest, no helmet; short dark umber wool cloak hanging behind him; plain dark oxblood-brown wool tunic to mid-thigh with a worn dark leather belt, no armour, no white cloth; bare legs, dark leather sandals; no shield, his left hand empty at his side; one wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, a little taller than the man, single leaf-shaped iron spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **militia A2** (A1 with the cloak and tunic swapped)
  ```
  grim weathered Greek peasant levy spearman with realistic adult proportions: seven heads tall, a small head in a snug cap, long legs, natural arms, broad shoulders, lean wiry build; low rounded dark brown felt pilos cap, no crest, no helmet; short faded dark crimson wool cloak hanging behind him; plain dark umber wool tunic to mid-thigh with a worn dark leather belt, no armour, no white cloth; bare legs, dark leather sandals; no shield, his left hand empty at his side; one wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, a little taller than the man, single leaf-shaped iron spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **thureophoros A1**
  ```
  grim veteran Carthaginian thureophoros infantryman with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; tall conical dark weathered bronze pilos helmet, no crest; deep dark purple-black cloak hanging behind him; dull dark greyed-tan linen linothorax corselet over a dark purple-black tunic, worn dark leather straps, no white cloth; dark bronze greaves; one tall oval thureos shield on his left arm, shoulder to shin, dark umber hide face with a dark iron spine and boss down the middle; one straight iron short sword held in his right hand down at his right side, point down, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **celt_sword A1**
  ```
  grim tall Celtic warrior swordsman with a long drooping moustache, with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; dark iron Montefortino helmet with a knob on top and cheek guards, no crest; dark muted green-and-umber plaid wool cloak pinned at the right shoulder hanging behind him; dark iron ring mail shirt to mid-thigh, a twisted bronze torc around his neck; dark muted green-and-umber plaid wool trousers, dark leather shoes; one tall oval Celtic shield on his left arm, shoulder to shin, dark green-brown painted wood with a dark iron boss and spine; one long straight iron longsword held in his right hand down at his right side, point down, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **celt_sword A2** (cancelled)
  ```
  grim Celtic warrior swordsman with a long drooping moustache, with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build, the same height as the style reference hoplite; low dark iron Montefortino helmet with a small knob on top and cheek guards, no crest; dark muted green-and-umber plaid wool cloak pinned at the right shoulder hanging behind him; dark iron ring mail shirt to mid-thigh, a twisted bronze torc around his neck; dark muted green-and-umber plaid wool trousers, dark leather shoes; one tall oval Celtic shield on his left arm, shoulder to shin, dark umber-brown wood with a dark iron boss and spine; one long straight iron longsword held upright in his right hand out at his right side, the point raised high above his head, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **celt_sword A3**
  ```
  grim Celtic warrior swordsman with a long drooping moustache, with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; low dark iron Montefortino helmet with a small knob on top and cheek guards, no crest; dark muted green plaid wool cloak pinned at the right shoulder hanging behind him, the only green he wears; dark iron ring mail shirt to mid-thigh, a twisted bronze torc around his neck; dark brown-and-black checked wool trousers, dark leather shoes; one tall oval Celtic shield on his left arm, shoulder to shin, dark umber-brown wood with a dark iron boss and spine; one long straight iron longsword held in his right hand down at his right side, point down, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **rhomphaia A1**
  ```
  grim tall Thracian rhomphaia warrior with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; tall dark weathered bronze Phrygian-style Thracian helmet with a high forward-curving peak and cheek guards, no crest; dark umber-brown wool cloak hanging behind him; dark bronze scale corselet over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark brown wool trousers and dark bronze greaves; no shield; one rhomphaia, a long two-handed weapon with a wooden shaft as long as his legs and a long single-edged slightly curved iron blade, gripped upright with both hands in front of his right side, the blade standing up above his head, clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **rhomphaia A2**
  ```
  grim tall Thracian rhomphaia warrior with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; open-faced tall dark weathered bronze Phrygian helmet whose high crown curves forward like a Phrygian cap, hinged cheek guards, the face visible, no crest, no face mask; deep dark crimson cloak hanging behind him; dark iron scale corselet over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark brown wool trousers and dark bronze greaves; no shield; one rhomphaia, a long two-handed weapon with a wooden shaft as long as his legs and a long single-edged slightly curved iron blade, gripped upright with both hands in front of his right side, the blade standing up above his head, clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **archer A1**
  ```
  lean grim Cretan archer with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean wiry build; bare head with short dark curly hair and a short dark beard, no helmet; short dark umber wool cloak hanging behind him; dark leather jerkin over a dark oxblood-brown tunic, one dark leather quiver strap across his chest and one quiver of arrows on his back, no white cloth; bare legs, dark leather sandals; no shield; one large recurved composite bow held vertically in his left hand out at his left side, away from his body and clearly visible in every direction, his right hand empty ready to draw; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **archer A2**: A1 with "short deep dark crimson cloak hanging behind him" in place of "short dark umber wool cloak hanging behind him".
- **slinger A1**
  ```
  lean grim Rhodian slinger with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean wiry build; bare head with short dark hair and a short dark beard, no helmet; short dark crimson chlamys cloak knotted at the right shoulder hanging behind him; plain dark oxblood-brown wool tunic to mid-thigh with a worn dark leather belt and one small dark leather pouch of lead bullets at the hip, no armour, no white cloth; bare legs, dark leather sandals; no shield; one sling of dark leather cord hanging from his right hand out at his right side, its loaded pouch swinging near his knee, clearly visible in every direction, his left hand empty; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **slinger A2**: A1 word for word at `size: 62`. Refused: "the selected style character is 45x66 cropped to content".
- **slinger B1** (`concept_image_url`: A1 south shrunk to 55 px by `proportion.mjs --bands 4:66:0.873:0.873`, 4x nearest)
  ```
  lean grim Rhodian slinger with the realistic adult proportions and the size of the concept: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean wiry build, the same height as the style reference hoplite with empty space above his head; bare head with short dark hair and a short dark beard, no helmet; short dark crimson chlamys cloak knotted at the right shoulder hanging behind him; plain dark oxblood-brown wool tunic to mid-thigh with a worn dark leather belt and one small dark leather pouch of lead bullets at the hip, no armour, no white cloth; bare legs, dark leather sandals; no shield; one sling of dark leather cord hanging from his right hand out at his right side, its loaded pouch swinging near his knee, clearly visible in every direction, his left hand empty; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **slinger A3** (cancelled): A1 with ", the same height as the style reference hoplite" after "lean wiry build", and the sling slot "one sling of dark leather cord held up in his raised right hand high above his head, its loaded pouch hanging down beside his head, out at his right side and clearly visible in every direction, his left hand empty".
- **javelineer A1**
  ```
  grim lean Carthaginian javelin skirmisher with realistic adult proportions: seven heads tall, a small head in a snug cap, long legs, natural arms, broad shoulders, lean wiry build; soft dark umber felt Thracian cap with a tall forward-curving top and ear flaps, no helmet; short deep dark purple-black cloak hanging behind him; plain dark umber wool tunic with a worn dark leather belt, no armour, no white cloth; bare legs, dark leather sandals; one small crescent-shaped pelte shield of dark wicker and hide on his left arm, chest to hip; two javelins held vertically together in his right hand out at his right side, away from his body and clearly visible in every direction, a little taller than the man, each with one small leaf-shaped iron head at the top and a plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **peltast A1**
  ```
  grim lean Greek peltast skirmisher with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; dark weathered bronze Thracian helmet with a forward-curving peak, a low dark crimson crest along its top and cheek guards; dark umber-brown wool cloak hanging behind him; dark leather jerkin over a dark oxblood-brown tunic, no white cloth; tall dark leather boots; one crescent-shaped pelte shield on his left arm, chest to hip, dark hide face with a dark bronze rim; one wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, a little taller than the man, single leaf-shaped iron spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **peltast A2**
  ```
  grim lean Greek peltast skirmisher with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; open-faced dark weathered bronze Thracian helmet whose crown rises into a forward-curving peak like a Phrygian cap, a short brim over the eyes and hinged cheek guards, the face visible, no crest, no face mask; short deep dark crimson cloak hanging behind him; dark leather jerkin over a dark oxblood-brown tunic, no white cloth; tall dark leather boots; one crescent-shaped pelte shield on his left arm, chest to hip, dark hide face with a dark bronze rim; one wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, a little taller than the man, single leaf-shaped iron spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **falx A1**
  ```
  grim tall Dacian falx warrior with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean muscular build; bare head with long dark hair to the shoulders and a full dark beard, no helmet; dark umber-brown wool cloak hanging behind him; dark leather jerkin over a dark oxblood-brown tunic, no white cloth; dark muted green-and-umber plaid wool trousers, dark leather shoes; no shield; one falx, a heavy two-handed weapon with a long wooden haft and a long forward-curved iron sickle blade, gripped upright with both hands in front of his right side, the curved blade above his head, clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **falx A2**: A1 with "dark muted green-and-black plaid wool cloak hanging behind him" and "dark brown wool trousers, dark leather shoes".
- **falx A3**
  ```
  grim tall Dacian falx warrior with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean muscular build; bare head with long dark hair to the shoulders and a full dark beard, no helmet; plain dark moss-green wool cloak hanging behind him, the only green he wears; warm dark umber leather jerkin over a dark oxblood-brown tunic, no white cloth; dark brown wool trousers, dark leather shoes; no shield; one falx, a heavy two-handed weapon with a long wooden haft and a long forward-curved iron sickle blade, gripped upright with both hands in front of his right side, the curved blade above his head, clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **gallic A1**
  ```
  grim tall bare-chested Gallic warband warrior with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean muscular build; no helmet, thick limed hair stiffened into dull pale-grey spikes standing up from his head, a long drooping moustache; bare muscular chest and arms painted with dark blue woad swirls, one twisted bronze torc around his neck; dark muted green-and-umber plaid wool trousers with a worn dark leather belt, dark leather shoes; one tall oval Celtic hide shield on his left arm, shoulder to knee, dark umber hide with a dark iron boss; one heavy iron war axe on a wooden haft held in his right hand down at his right side, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **gallic A2** (cancelled): A1 with ", the same height as the style reference hoplite", "short limed hair stiffened into dull ash-grey spikes", and "one heavy iron war axe on a long wooden haft held upright in his right hand out at his right side, the axe head raised high above his head, away from his body and clearly visible in every direction".
- **fanatic A1**
  ```
  gaunt grim bare-chested cult fanatic with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean wiry build; no helmet, a shaved head smeared with grey ash; ragged black wool cloak hanging behind him; bare wiry chest and arms marked with dark blue woad and grey ash, no armour; a dark umber wool kilt with a rope belt; bare legs and bare feet; no shield, his left hand an empty fist; one heavy curved iron kopis blade held in his right hand down at his right side, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **fanatic A2** (cancelled): A1 with ", the same height as the style reference hoplite" and "one heavy curved iron kopis blade held upright in his right hand out at his right side, the blade raised high above his head, away from his body and clearly visible in every direction".
- **fanatic A3**: A1 with "a shaved head with streaks of grey ash on the scalp" and "bare wiry chest and arms of weathered warm tan skin marked with dark blue woad lines, no armour".
- **royal_guard A1**
  ```
  tall grim Macedonian royal guardsman, a silver-shield veteran, with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; dark gilded bronze Attic helmet with an open face, hinged cheek guards and two tall dull bone-grey feather plumes rising from its sides, no transverse crest; deep dark royal-purple cloak hanging behind him; ornate dark gilded bronze muscle cuirass over a dark crimson tunic, worn dark leather straps, no white cloth; dark bronze greaves; one very large round aspis on his left arm, chin to knee, faced with dull dark tarnished silver and a dark bronze rim, a muted dark star emblem; one very long wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **sacred_band A1**
  ```
  tall grim Theban Sacred Band hoplite with realistic adult proportions: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; dark weathered bronze Boeotian helmet with a wide flaring brim all round and an open face, no crest; very dark blue-black cloak hanging behind him; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark bronze greaves; one very large round bronze aspis on his left arm, chin to knee, dark bronze rim and a muted dark-red club of Herakles emblem; one very long wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **Imports** (`create_character`, `mode: v3`, `reference_image_url` = the normalised south, all 7 other views as `direction_images`, nothing generated, 0.25 each). The description is a one-line summary of the class, e.g. slinger N1: "lean grim Rhodian slinger: bare head with short dark hair and beard, short dark crimson cloak, dark oxblood-brown tunic with a leather belt and bullet pouch, sandals, a leather sling hanging from his right hand, no shield". The imports were checked pixel for pixel against the normalised files: identical.

**Stature.** Measured from the crown (the skull, or the helmet bowl; a crest, plume, pilos point, Phrygian crown or hair spikes is not counted) to the feet row. Target 58 ± 2 (H4: 57, crown row 10, chin 19, shoulders 21, feet 66). With H4 as the style character, pro mode lands H4's build at once: the shoulder line sits about 45 px above the feet. So STYLE_LOCK step B (the concept re-proportioning) was not needed for any class. Bare heads and low caps were the exception: pro fits the figure's top to rows 3–5, so a head with nothing above it came out 60–64 px. A spear tip, falx or rhomphaia blade, crest or plume gives the headroom. Size < 66 is refused (H4's content is 45x66), and a concept shrunk to 55 px only took 2 px off (B1: 63 to 61). A raised weapon would fix it but was overruled by main, because it changes the pose for a framing reason. **The fix is `normalise.mjs`.** It drops whole rows below the chin (the rows most like their upper neighbour, at least 4 apart) and a few columns, the same count in all 8 views, then re-aligns the feet. No pixel is resampled and no colour is invented. The 8 views then go back to PixelLab as a v3 import, so the animations start from them.

| # | Class | Attempt | Character id | Outcome |
| --- | --- | --- | --- | --- |
| 1 | militia | A1 | `4fc70201` | **Rejected:** the umber cloak and tunic share one ramp (no cloak group). Otherwise fine: felt cap, single-headed spear, blunt butt |
| 2 | militia | A2 | `4860b1e6` | **Promoted:** crimson cloak in its own ramp; stature 58 at the skull (60 with the cap); spear in 8/8 |
| 3 | thureophoros | A1 | `270a1787` | **Promoted:** pilos, oval thureos, sword in 8/8; purple-black cloak (the tunic skirt shares it) |
| 4 | celt_sword | A1 | `9049c2d3` | **Rejected:** plaid green on the cloak, trousers and shield (no cloak group); body 3 px tall (shoulders row 18) |
| 5 | celt_sword | N1 | `f8b89542` | Superseded: an import of A1 normalised (−3 rows, −1 column) |
| 6 | celt_sword | A2 | (cancelled) | **Cancelled:** a raised sword for headroom (overruled) |
| 7 | celt_sword | A3 | `ddf1d88b` | **Promoted after normalising:** green only on the cloak; 61 to 58 px (−3 rows, −1 column) → **N2 `73d12bee`** |
| 8 | rhomphaia | A1 | `eca2ca8d` | **Rejected:** a closed, crest-ridged helmet reads as the hoplite's; everything umber, no cloak group |
| 9 | rhomphaia | A2 | `440f945a` | **Promoted:** open Phrygian helm, crimson cloak, iron scale, the blade above the head in 8/8 |
| 10 | archer | A1 | `92d171f9` | **Rejected:** 6 colours, the cloak and jerkin one umber; 62 px |
| 11 | archer | A2 | `b8f323c8` | **Promoted:** crimson cloak, one strung bow, a quiver on the back; 60 px (+2, at the tolerance edge, kept) |
| 12 | slinger | A1 | `83bbfaea` | **Promoted after normalising:** 63 to 58 px (−5 rows, −2 columns) → **N1 `d15d6271`**; the sling in 8/8 |
| 13 | slinger | A2 | (refused) | size 62 is below the style character's 66 |
| 14 | slinger | B1 | `01f2d84b` | **Rejected:** the concept only took it to 61 px, and the sling moves to his left hand in SW |
| 15 | slinger | A3 | (cancelled) | **Cancelled:** a raised sling for headroom (overruled) |
| 16 | javelineer | A1 | `a0b21d96` | **Promoted:** soft Thracian cap, crescent pelte, exactly two javelins with plain butts in 8/8, purple-black cloak in its own ramp |
| 17 | peltast | A1 | `1ae2bc87` | **Rejected:** a closed helm with a crest, umber everything: a hoplite with a crescent shield |
| 18 | peltast | A2 | `4739f237` | **Promoted:** open Thracian helm, crimson cloak, pelte, spear 8/8 |
| 19 | falx | A1 | `5c53fcd8` | **Rejected:** the umber cloak and jerkin share one ramp; 60 px |
| 20 | falx | A2 | `b22ab9d0` | **Rejected (style drift):** near-black front, a cloak of green and grey checks spread over two ramps |
| 21 | falx | A3 | `c9bdfe6f` | **Promoted, groups need review:** warm umber, a moss-green cloak, 57 px, the falx carried naturally; the darkest hair steps share the cloak's plaidGreen |
| 22 | gallic | A1 | `ec8e285a` | **Promoted after normalising:** limed spikes, axe, oval hide shield in 8/8; 62 to 60 px (−2 rows, −1 column) → **N1 `462072a6`**. Bare per the data, so no cloak or crest group; the trousers share darkBronze with the torc |
| 23 | gallic | A2 | (cancelled) | **Cancelled:** a raised axe (overruled) |
| 24 | fanatic | A1 | `9e6425ee` | **Promoted after normalising, groups need review:** shaved ash head, ragged black cloak, kopis in 8/8; 64 to 59 px (−5 rows, −2 columns) → **N1 `9ae28d60`**. The black cloak and the ash skin both remap to metal |
| 25 | fanatic | A2 | (cancelled) | **Cancelled:** a raised kopis (overruled) |
| 26 | fanatic | A3 | `1a2158d3` | **Rejected:** the cloak still remaps to metal, now shared with the kilt and blade; muddy skin; 64 px |
| 27 | royal_guard | A1 | `49cc24c8` | **Promoted:** gilded Attic helm, two pale plumes, silver aspis with a star, royal-purple cloak in its own ramp, spear 8/8 |
| 28 | sacred_band | A1 | `2b900b89` | **Promoted:** Boeotian brim, a club emblem, blue-black cloak in its own ramp (remapped to dark metal), spear 8/8 |

All 13 classes passed the hard-reject list in every promoted set: one weapon and the right shield (or none) in all 8 views; spear heads leaf-shaped at the top and butts plain wood; no head cut off; every reference facing straight south.

**Verdict.**
- **Consistency:** `I4a-roster-facings.png` reads as one army with H4: the same outline weight, shading steps, pixel density and bronze and crimson ramps, with Carthaginian purple-black and Celtic green as the only new hues.
- **Distinctness:** in the formation (`I4a-roster-formation.png`) every class is told apart at zoom 1 by headgear and shield shape. The closest pair is javelineer and peltast (both crescent shields; told apart by cap against bronze, purple against crimson, two javelins against one spear).
- **The bright accents:** the gallic limed hair and the royal guard's plumes and silver shield are the brightest pixels in the set, on purpose (§5.2 markers), but they are worth a look in game.
- **Colour groups:** clean, own-ramp cloaks for militia, rhomphaia, archer, slinger, peltast, celt_sword, javelineer, royal_guard and sacred_band. Thureophoros (tunic skirt in the cloak's purple) is acceptable. **Needs review:** falx (hair in the cloak ramp), fanatic (cloak and skin both metal), gallic (no cloak; trousers share darkBronze).

**Lessons for the animation rollout.**
- H4 as `style_character_id` carries its proportions. Step A is enough, and one prompt in two lands.
- For a bare head, measure the stature and normalise rows before the import; do not re-roll for height.
- Name the cloak colour so that nothing else on the man shares its hue family. A brown cloak on a man in leather gives no recolour group.
- §5.2 headgear words that the model reads as a hoplite's ("Thracian helmet", "Phrygian-style … peak") need "open-faced …, the face visible, no crest, no face mask".
- Pro output often has only 6–10 colours. The remap then has little to lose, but groups collapse fast.

#### I4a review fixes (main's review of the roster, same day)

Three fixes: the archer carried two bows in SE, NE and NW (the recurved bow is drawn as two parallel limbs); the fanatic read as undead (ash-grey skin, a gaunt face); and the cloak, crest and trim groups of falx, fanatic and gallic were not exclusive. **Gens:** 4 pro characters (40) and 4 imports (1), so 41 this round; **262.25 in all for I4a** (cap 650). Account: 4,313.50 left after.

**Prompts, word for word:**

- **archer A3**
  ```
  lean grim Cretan archer with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean wiry build; bare head with short dark curly hair and a short dark beard, no helmet; short deep dark crimson cloak hanging behind him; dark leather jerkin over a dark oxblood-brown tunic, one dark leather quiver strap across his chest and one quiver of arrows on his back, no white cloth; bare legs, dark leather sandals; no shield; only one bow: a plain wooden bow with a single thin curved limb and one straight string, held vertically in his left hand out at his left side, away from his body and clearly visible in every direction, no second bow, his right hand empty ready to draw; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **fanatic A4**
  ```
  grim wild-eyed Celtic religious fanatic, a living man, with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean muscular build; no helmet, long wild tangled hair stiffened with lime into a dull pale ash-blond mane, a short rough beard; ragged very dark oxblood-black wool cloak hanging behind him, torn at the hem; bare chest and arms of living warm tan skin painted with bold dark blue woad patterns, no armour; a dark umber wool kilt with a rope belt; bare legs, bare feet; no shield, his left hand an empty fist; one heavy curved iron kopis blade held in his right hand down at his right side, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```
- **falx A4**: falx A3 with "long black hair to the shoulders and a full black beard".
- **gallic A3**
  ```
  grim tall bare-chested Gallic warband warrior with realistic adult proportions: seven heads tall, a small head, long legs, natural arms, broad shoulders, lean muscular build; no helmet, thick limed hair stiffened into dull pale-grey spikes standing up from his head, a long drooping moustache; bare muscular chest and arms of living tan skin painted with dark blue woad swirls; one thick twisted polished bronze torc around his neck and one wide dark belt with a polished bronze buckle, the only bright bronze he wears; dark muted green plaid wool trousers, dark leather shoes; one tall oval Celtic hide shield on his left arm, shoulder to knee, dark umber hide with a dark iron boss; one heavy iron war axe on a wooden haft held in his right hand down at his right side, away from his body and clearly visible in every direction; heavy shadows, desaturated dark warm colours like the style reference
  ```

**Retints** (`scripts/art/pixellab/rollout/retint.mjs`). Each one moves a part into a ramp of its own: the pixels of the named ramps inside a box per view go to the target ramp's step nearest in lightness, a small hue or value shift. Each result was checked with `groups.mjs`.

- **fanatic A4:** the cloak and kilt were one raw colour (`#231616`). The kilt (S, SE, SW rows 36–49 within 8 px of the centre; E columns 33–40 and W columns 28–37, rows 37–49) goes from umber to darkBronze. The cloak is now the only umber.
- **falx A4:** a few lit hair pixels (rows 4–16) go from plaidGreen to umber. The moss-green cloak is then the only plaidGreen.
- **gallic N1:** the torc was drawn in outline black, so its inner pixels on the neck row (row 20 in S, SE, E; row 21 in the others; `--inner` keeps the edge outline) go to the bronze ramp. Nothing else on him is bronze, so it is the exclusive trim group.

| # | Class | Attempt | Character id | Outcome |
| --- | --- | --- | --- | --- |
| 29 | archer | A3 | `5dabb376` | **Promoted after normalising:** one plain bow and a back quiver in 8/8 (W, not a game facing, holds the bow level); 61 to 58 px (−3 rows, −1 column) → **N1 `199cd6bb`** |
| 30 | fanatic | A4 | `7de14182` | **Promoted after the retint:** a living man (warm tan skin, blue woad, a wild limed mane, ragged dark cloak, kopis in 8/8); body at H4's height (the mane is not counted) → **N2 `fe0b0a2d`** |
| 31 | falx | A4 | `60c71589` | **Promoted after the retint and normalising:** black hair and beard, falx in 8/8; 62 to 58 px (−4 rows, −2 columns) → **N1 `63527404`** |
| 32 | gallic | A3 | `28d7356a` | **Rejected:** only 6 colours, no bronze on the torc, an invented ground shadow in W, feet on row 64 |
| 33 | gallic | N1 + torc | `2ef012ad` | **Promoted:** N1 with the bronze torc retint → **N2 `2ef012ad`** |

`normalise.mjs` now drops columns only within 11 px of the knees' centre, so a weapon held out at the side is never thinned (falx A4's first pass had cut two columns from the blade).

**Groups after the fixes:** archer, cloak crimson (exclusive); falx, cloak plaidGreen (exclusive); fanatic, cloak umber (exclusive; kilt darkBronze); gallic, trim bronze (exclusive; no cloak or crest by the data). **Still open:** falx's jerkin remaps to the skin ramp, so a per-man skin recolour (V5-095) would tint his jerkin. Other leather-clad classes may do the same; that is a check for sheetbuild's skin group.

### I1b Dark-epic hoplite: the restyle, 12–16-frame walk and thrust, frame-by-frame review, the elite probe (2026-10-18)

**Brief** (user review of I1, V5-087): darker, *300* / Lord of the Rings mood on the I1 pick B3 (high top-down, 48); smooth 12–16-frame clips; a spearhead pointing away from the facing or the attack is never allowed; then, mid-round, a hard rule: exactly one spearhead at the leading end, a plain blunt wooden butt (no sauroter), and every frame with a pointed or metallic butt rejected. Every prompt below carries "single leaf-shaped spearhead, plain blunt butt end, no butt spike".

**Tool and budget.** PixelLab MCP. Balance before: 1,948 left (52 used, I1); after: 1,900.75 left (99.25 used): **47.25 generations** this round (cap 120). The receipts quoted 3 per 12-frame skeleton-v3 direction, 2 per 16-frame pixminimax direction, 6 for the Pro Flash character, 1 for the v3 redo, 0.25 for the import; the elite state took the remaining ~10. **Raws:** `docs/v5/pixellab/I1/raw/{E1,E1fix,E1pad96,E1guard128,E2,E3,E3w,E3elite}/` (gitignored). **Rebuild:** `bash scripts/art/pixellab/i1b-e3.sh [sheets dir]` (re-fetch, add the skeleton jobs, apply `docs/v5/pixellab/I1/fixes-E3.json`, build). **Processed:** `docs/v5/pixellab/I1/processed/E3/` and `E3elite/` (raw strips and `remap/`). **Skeletons:** `docs/v5/pixellab/I1/skeletons/thrustLow_<dir>.json`. **Contact sheets:** `docs/v5/art/I1b-rotations.png`, `I1b-walk.png`, `I1b-thrust.png`, `I1b-rejected.png`, `I1b-lineup-raw-vs-remap.png`. **Preview:** `/hoplite-bakeoff.html` (today, B3, E3, E3 elite; single, 5x3 both sides, zoom 1–3; a mode panel).

**Character prompts, word for word:**

- **D1** (`create_character_pro_flash`, 68x68, `view: high top-down`; a south image first, then 8 v3 views)
  ```
  grim battle-hardened Spartan hoplite warrior, muscular build, standing straight and facing the viewer, full body with the feet near the bottom of the canvas: dark weathered bronze Corinthian helmet covering the face with a tall deep crimson horsehair crest; deep crimson cloak hanging from the shoulders behind him; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark bronze greaves; a very large round aspis shield on his left arm reaching from his chin to his knees, dark bronze rim and a muted dark-red painted emblem; a very long wooden spear (dory) held vertically in his right hand, taller than the man, single leaf-shaped spearhead at the top, plain blunt butt end, no butt spike; heavy shadows, desaturated dark warm colours, low-key cinematic light from the upper left, the mood of the film 300 and Lord of the Rings
  ```
- **D2** (`create_character` v3, reference = E1 south, E1's E, N, W, NE, SW given; SE and NW regenerated)
  ```
  grim muscular Spartan hoplite: dark weathered bronze Corinthian helmet with a tall deep crimson crest, deep crimson cloak, dark bronze cuirass, very large round aspis with a dark bronze rim and a muted red lambda on his left arm, a very long wooden spear held vertically in his right hand beside his body, taller than the man, its single leaf-shaped spearhead clearly visible above his head in every view, plain blunt butt end, no butt spike
  ```
- **D3** (`create_character` v3 import: all 8 views given, nothing generated)
  ```
  grim muscular Spartan hoplite: dark weathered bronze Corinthian helmet with a tall deep crimson crest, deep crimson cloak, dark bronze cuirass, very large round aspis with a dark bronze rim and a muted red lambda on his left arm, a very long wooden spear held vertically in his right hand, single leaf-shaped spearhead, plain blunt butt end, no butt spike
  ```
- **D4** (`create_character_state` on E3, `state_name: Elite`)
  ```
  elite veteran version of the same hoplite: a black cloak instead of the crimson one, a gilded crest holder with a black horsehair crest trimmed in gold, an ornate dark bronze muscle cuirass with gilded edges; keep the same Corinthian helmet shape, the same very large round aspis with the muted red lambda on the left arm, and the same long spear in the right hand with a single leaf-shaped spearhead, plain blunt butt end, no butt spike; same pose, same dark grim palette
  ```

| # | Attempt | Call | Outcome |
| --- | --- | --- | --- |
| 1 | E1 69c457a8 | D1, Pro Flash | **Promoted as the base, patched:** dark bronze, crimson cloak and crest, a big lambda aspis, a muscular build (a big helmet and short legs: heroic proportions). The spear is single-headed with a plain butt in S, NE, SW; in SE it crosses the face (kept, then redrawn); **in NW it is hidden behind the cloak** (spear missing in a game facing) |
| 2 | E2 a5e62c6e | D2, v3 redo of SE and NW | **Rejected:** NW spear still missing, SE unchanged |
| 3 | E3 62d4f135 | D3, import | **Promoted:** E1 with NW patched by hand (NE's spear arm pasted, columns 43–56 shifted 3 px, `i1b-prep.mjs`), padded to a 96 canvas so clips have room |
| 4 | E3 elite 9618a1bf | D4, state | **Probe passed:** identity, pose, silhouette and gear placement hold in all 8 views; black cloak and crest, gilt trim; the hand-patched NW spear arm carried over |

**Clips.** The game facings only (SE, NE, SW, NW). Frame rates for the GIFs: walk 16 frames at 20 fps (a 0.8 s cycle), thrust 12 frames at 14 fps (0.86 s).

- **W1** (pixminimax, `frame_count: 16`, `keep_first_frame: false`; subject "a grim Spartan hoplite in dark bronze Corinthian helmet, crimson cloak, large round bronze shield and a long spear"; initial pose "standing upright, spear vertical in the right hand, shield on the left arm")
  ```
  steady disciplined marching walk, the long spear held upright in the right hand, single leaf-shaped spearhead at the top, plain blunt butt end, no butt spike; the large round shield stays on the left arm across the body in every frame; the cloak sways a little
  ```
- **W2** (the SE redo, from a start frame with the spear redrawn by `spear.mjs`; initial pose "standing upright, the spear in the right hand leaning outward with its head above his left shoulder, shield on the left arm" — "left" is a slip, the head is over his right shoulder)
  ```
  steady disciplined marching walk, the long spear held in the right hand and leaning a little outward, single leaf-shaped spearhead at the top, plain blunt butt end, no butt spike; the large round shield stays on the left arm in every frame; the cloak sways a little
  ```
- **T1** (`animate_with_skeleton_v3`, `action: overhand spear thrust`, 12 frames, our overhand keypoints, first frame = the upright rotation)
  ```
  grim muscular Spartan hoplite in dark weathered bronze Corinthian helmet with a deep crimson crest, deep crimson cloak, dark bronze cuirass and greaves, a very large round bronze aspis with a muted red lambda held across his body on his left arm in every frame, a long wooden spear in his right hand gripped overhand above the shoulder, its single leaf-shaped spearhead always at the front end pointing the way he faces, plain blunt butt end, no butt spike
  ```
- **T2** (`animate_with_skeleton_v3`, `action: spear thrust`, 12 frames, `thrustLow` keypoints, first frame = `spear.mjs` couched spear on a 128 canvas). Front facings (SE, SW):
  ```
  grim muscular Spartan hoplite in a dark weathered bronze Corinthian helmet with a deep crimson crest, deep crimson cloak, dark bronze cuirass and greaves, one very large round bronze aspis with a muted red lambda held across his body on his left arm, one long wooden spear held level at the hip in his right hand with a single leaf-shaped spearhead at the front end pointing the way he faces, plain blunt butt end, no butt spike
  ```
  Back facings (NE, NW):
  ```
  grim muscular Spartan hoplite seen from behind in a dark weathered bronze Corinthian helmet with a deep crimson crest, deep crimson cloak, dark bronze greaves, one very large round bronze aspis held on his left arm in front of him, one long wooden spear held level at the hip in his right hand with a single leaf-shaped spearhead at the front end pointing the way he faces, plain blunt butt end, no butt spike
  ```

| # | Clip | Mode | Dirs | Gens | Outcome (frame by frame, both spear ends checked) |
| --- | --- | --- | --- | --- | --- |
| 5 | walk_template | template `walking-8-frames` (8 frames) | SW NE | 2 | **Rejected:** the aspis vanishes in every frame of both facings |
| 6 | walk_pixminimax | W1 | SW NE | 4 | **Promoted:** one shield and one spear in all 16 frames, head up, butt plain; the shaft is dashed in SW f1/f9 and gapped in NE f5 (cosmetic) |
| 7 | walk_pixminimax | W1 | SE | 2 | **Rejected:** the spear is gone in all 16 frames (the rotation's spear crossed the face) |
| 8 | walk_pixminimax | W1 | NW | 2 | **Promoted:** spear (the patched one) and shield in all 16 |
| 9 | walk_pixminimax_se2 | W2 | SE | 2 | **Promoted:** spear in all 16, head top-left, one shield |
| 10 | thrust | T1 | SW | 3 | **Rejected (tip rule):** the head is carried backwards over the shoulder in f1–f4 and f9–f10; the spear vanishes in f0 and goes thin and doubled in f5 |
| 11 | thrust2 | T2 | SW | 3 | **Promoted:** the head leads in 12/12, one shield, no butt seen; f2 had a grey ghost scrap (cleared, 38 px) |
| 12 | thrust2 | T2 | SE | 3 | **Promoted with 1 frame rejected:** f2's butt is flat and metallic and its head doubles (f2 := f1) |
| 13 | thrust2 | T2 | NE | 3 | **Rejected:** the head runs off the 128 canvas in f5–f7 (a truncated head) |
| 14 | thrust2 | T2 | NE, figure 16 px further left | 3 | **Promoted:** whole head leads in 12/12; f3 a light-bronze glint on the butt recoloured to the shaft (18 px), a crest speck cleared |
| 15 | thrust2 | T2 | NW | 3 | **Promoted with 1 frame rejected:** f7 has a detached light-bronze piece at the butt that reads as a butt spike (f7 := f6, inside the held extension); f0–f2 the head is hidden behind the body (the man faces away) |

**Rejection count.** Spear tip backwards: 1 clip (T1, 6 frames). Butt end pointed or metallic (the new rule, counted apart): **3 frames** (SE f2, NW f7 rejected; NE f3 glint recoloured), plus the doubled head in SE f2. Shield vanishing: 2 clips (template walk SW, NE). Spear missing: E1 NW and E2 NW (rotations), SE walk v1 (16 frames). Head cut off by the canvas: NE thrust v1 (3 frames). Stray scraps: SW f2, NW f7.

**Palette.** The I1 hard snap is dropped for units (V5-087). `scripts/art/pixellab/remap.mjs` maps each colour to the PA-WORLD-DARK ramp (`docs/v5/pixellab/palette-dark.json`: PA-WORLD plus dark bronze, crimson, umber, dark skin and steel ramps) nearest in OKLab hue and chroma, then to that ramp's step nearest in lightness. On E3 it halves the colours (turnaround 52 → 25, walk 41 → 22, thrust 38 → 20) and is hard to tell from raw at zoom 1–3 (`I1b-lineup-raw-vs-remap.png`): the bronze stays bronze, the crimson stays crimson; only the elite's blue-black cloak warms to umber-black. **Recommendation: the remap** (one battle palette at no visible cost); raw is the fallback if a later class has a hue the ramps lack.

**Verdict.**
- **Style:** E3 reads as the brief at battle scale and in a crowd: dark bronze, crimson cloaks and crests, the lambda aspis (now about chin to knee); the elite state is a clean black-and-gold step up.
- **Animation mode:** template is out (it drops the aspis). **Walk: pixminimax 16 frames** (2 per direction), steady identity, fluid cloak; it can lose an item the rotation half-hides, so the start frame must show the spear clearly. **Thrust: skeleton-v3 with our own skeletons and a hand-drawn first frame with the spear already couched head-forward** (3 per direction at 12 frames): the only mode that kept the head leading in every frame; an overhand start from the upright spear (T1) flips the head backwards. Expect about one frame in twelve to need a fix (`fixframes.mjs`), and give the thrust a canvas the extension fits in.
- **Not done:** idle (8+ frames) and the other clips; the elite state is not animated.

**Cost per class at 12–16 frames (estimate).** Base: Pro Flash 6 + a v3 import 0.25 + hand fixes ≈ 7; two tier states ≈ 20. Clips: about 16 per tier × 4 facings × 3 tiers = 192 clip-directions; 6 locomotion/idle clips by pixminimax at 2 = 144; 10 action clips by skeleton-v3 at 3–4 (12–15 frames) ≈ 420; × 1.25 for the redos seen here (1 of 4 directions per clip) ≈ 705. **≈ 730 per class; 18 classes ≈ 13,000 generations (about 6.5 months of Tier 1).** With the full set on the basic tier only and idle, walk and thrust on the other two tiers: ≈ 330 per class, ≈ 6,000 for 18 (3 months).

### I1 Hoplite bake-off: PixelLab, 2 sizes × 2 views, walk and attack, three animation modes (2026-10-18)

**Tool.** The PixelLab MCP (Tier 1, 2,000 generations a month), called from the agent; no browser. Balance before: 2,000 left, 0 used; after: 1,948 left, **52 used** (cap 60). At most 8 jobs at once. The old "ancient roman soldier" character in the account was ignored. **Raws:** `docs/v5/pixellab/I1/raw/<attempt>/` (gitignored, V5-086; `char.zip` plus the unpacked zip, fetched with `scripts/art/pixellab/fetch.mjs`). **Processed:** `docs/v5/pixellab/I1/processed/<variant>/` (`build.mjs`: the 8-view `rot.png`, one strip per animation and facing, the same under `snap/` snapped to PA-WORLD, and `info.json`), `manifest.json` for the preview. **Contact sheets:** `docs/v5/art/I1-rotations.png` (the 4 promoted turnarounds), `I1-rejected.png` (the 6 rejected), `I1-modes.png` (D2 attack: v3 custom vs template vs skeleton-v3, SW and NE), `I1-lineup-raw-vs-snap.png` (the battle line-up at zoom 1 ×3, raw over snapped). **Preview:** `/hoplite-bakeoff.html` on the dev server (`src/dev/hopliteBakeoff.ts`): the variants next to today's procedural hoplite on the iso ground at the battle's scale, zoom 1–3, RS 2, 5x3 formations from both sides, the mode comparison; `?snap=1` for the snapped strips.

**Game facings.** The sheet contract (`src/art/paperdoll.ts` DIRS) has 4 true facings, all diagonals of the 2:1 field: row 0 = PixelLab `south-east`, row 1 = `north-east` (the player's army, back view), row 2 = `south-west` (the enemy, front view), row 3 = `north-west`. Every character was made with 8 directions; walks and attacks only in these 4.

**Shared settings** (every `create_character` call): `mode: standard` (1 generation), `n_directions: 8`, `outline: selective outline`, `shading: basic shading`, `detail: medium detail`, `proportions: {"type": "preset", "name": "realistic_male"}`, `size` 48 or 32 (stored on a 68x68 or 48x48 canvas; the figure is 53–57 or 36–38 px from the crest to the feet), `view` low or high top-down. Prompts word for word:

- **P1**
  ```
  ancient Greek hoplite soldier: bronze Corinthian helmet covering the face with a red horsehair crest, large round bronze aspis shield on the left arm, long wooden dory spear with a bronze tip held upright in the right hand, white linen linothorax armour, short red tunic skirt, bronze greaves on the shins, sandals
  ```
- **P2**
  ```
  ancient Greek hoplite soldier holding a very long wooden spear (dory) vertically in his right hand, the spear taller than the man with a bronze leaf tip above his head; big round bronze aspis shield on his left arm; bronze Corinthian helmet covering the face with a red horsehair crest; white linen linothorax body armour; short red tunic; bronze greaves; sandals
  ```
- **P3**
  ```
  ancient Greek hoplite: bronze muscle cuirass over a short red tunic, bronze greaves covering both shins, bronze Corinthian helmet covering the face with a red horsehair crest, big round bronze aspis shield on the left arm, very long wooden spear (dory) held vertically in the right hand, taller than the man, bronze leaf tip above his head, sandals
  ```

**Characters** (1 generation each):

| # | Attempt | id | size, view | Prompt | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | A | e4d7cd01 | 48, low | P1 | **Rejected:** the spear is missing in 6 of 8 views, all 4 game facings among them; the linothorax came out red |
| 2 | A2 | c1c0a877 | 48, low | P2 | **Promoted (variant A):** spear in 8/8; the linothorax is red, not white, and the shins bare (no greaves); the shield is hidden behind the body in SE, NE, NW |
| 3 | A3 | f4ac5d3c | 48, low | P3 | **Rejected:** spear missing in SE, E, W |
| 4 | B | e01ad163 | 48, high | P3 | **Rejected:** spear missing in SE, E, NE, NW, W |
| 5 | C | a5dc4b0b | 32, low | P3 | **Rejected:** spear missing in SE; a grey iron cuirass, not bronze |
| 6 | D | 7faec689 | 32, high | P3 | **Rejected:** spear missing in SE, E, NE, NW, W |
| 7 | B2 | c4abda50 | 48, high | P2 | **Rejected (invented feature):** two spears in S, SE, N, NW, SW |
| 8 | C2 | 43fec036 | 32, low | P2 | **Promoted (variant C):** spear and shield 8/8, white linothorax, red crest; at 32 px the Corinthian helmet reads open-faced (a beard shows) |
| 9 | D2 | a295f28c | 32, high | P2 | **Promoted (variant D):** spear and shield 8/8, white linothorax, gold-bronze aspis; near-black outline |
| 10 | B3 | 88c59d93 | 48, high | P2 | **Promoted (variant B):** spear in all 4 game facings (missing only in E and W), red-faced aspis, white front and red back |

**Animations.** Walk: template `walking-8-frames` (8 frames, 1 generation per direction). Attack: v3 custom, 8 frames plus the reference (9 stored), 1 generation per direction; v3 stores the clip on a bigger canvas (A2 88/84, B3 80/84, C2 60, D2 56), so the strips keep their own size and feet line. Mode comparison on D2: template `lead-jab` and skeleton-v3 `lead-jab` (3 frames each; there is no spear-thrust template).

- **ATK1** (A2 only)
  ```
  thrusting the long spear forward overarm at shoulder height while the round shield stays in front of the body, then pulling the spear back
  ```
- **ATK2** (B3, C2, D2)
  ```
  overarm spear thrust: raises the long spear above the shoulder with the point forward, stabs it straight ahead in the direction he is facing, the round shield kept in front of the chest, then pulls the spear back; he keeps facing the same direction and holds the same spear and shield in every frame
  ```

| # | Variant | Clip, mode | Directions | Charged | Outcome |
| --- | --- | --- | --- | --- | --- |
| 11 | A2 | walk, template | SE NE SW NW | 4 | **Kept:** the spear is steady in each facing; no shield in SE, NE, NW (hidden in the rotations too); SW good |
| 12 | B3 | walk, template | SE NE SW NW | 4 | **Kept, flawed:** in SE the shield pops in at frame 4; in NE it turns into a **white oval and vanishes** (invented); SW, NW good |
| 13 | C2 | walk, template | SE NE SW NW | 4 | **Kept, flawed:** SE and SW steady; in NE the shield pops in; NW frame 6 loses shield and spear |
| 14 | D2 | walk, template | SE NE SW NW | 4 | **Kept, flawed:** in SE frames 7–8 a **big black shield** appears (invented); in NE the shield comes late; NW loses shield and spear at the end |
| 15 | A2 | attack, v3 ATK1 | SE NE SW NW | 4 | **Kept, flawed:** SE turns to face south, the spear swung level across the body and a small shield appears in the far hand; NW spear across the body; SW a fair overarm thrust |
| 16 | B3 | attack, v3 ATK2 | SE NE SW NW | 4 | **Rejected in review:** SE turns to face south, the shield jumps to the front; NE the spear flips left and right and the shield shrinks to a crescent and goes; SW thrusts the wrong way and a **second shield** appears behind; NW the spear reads double-ended |
| 17 | C2 | attack, v3 ATK2 | SE NE SW NW | 4 | **Kept, flawed:** the shield holds in every frame; the spear always stabs to screen-left, so SE and NE point the wrong way; SW last frame turns south |
| 18 | D2 | attack, v3 ATK2 | SE SW, then NE NW appended | 4 | **Kept, flawed:** the shield holds; the spear becomes a double-ended staff across the body in SE, NE, NW; in SW it vanishes |
| 19 | D2 | attack_template, template `lead-jab` | NE SW | 2 | SW steady but the spear does not move (a boxing jab); NE loses the shield |
| 20 | D2 | attack_skeleton, skeleton-v3 `lead-jab` | NE SW, then SE NW appended | 4 + 4 quoted (charge below) | **SW: the only correct spear thrust of the run** (levelled down-left, shield in front, identity steady). NE **rejected:** shield gone, spear in pieces, grey ghost scraps; SE turns to face south; NW the spear is gone (an empty fist) |

The receipts quoted 56 generations; the balance fell by 52 (the skeleton-v3 jobs seem to have been billed below the quoted 2 per direction).

**Palette snap.** `build.mjs` snaps with `ops.mjs snapToPalette` (the same weighted nearest colour as `process.mjs`) and binary alpha. It **hurts**: PixelLab's saturated bronze goes to the grey-khaki metal ramp (`#ac9283`/`#d2b68e`) instead of the bronze ramp, so helmets and the D2 shields lose their bronze; B3's red shield and the A2 tunics go darker; D2's near-black outline softens to `#2a1a12` and loses some punch. Reds, linen and skin survive. Snapping is still needed for the battle palette; it needs a ramp-aware remap (bronze to bronze) or generation on the palette (`palette` on `create_character_state`, or Pro mode).

**Verdict.**
- **View: high top-down.** It is closer to the battle camera's 30° elevation (`model3d.ts`), the shields face the viewer and both armies read in a crowd. Low top-down (A2, C2) hides the shield behind the body in the side and back facings and reads as a red or grey smear in formation.
- **Size: 48** (B3) over 32 (D2). At the battle's scale a 48 figure is drawn at 0.55 (about one sprite px per device px at zoom 1 on RS 2, the density of today's BATTLE_RES 2 dolls) and stays crisp at zoom 2–3; a 32 figure is drawn at 0.8, so its pixels come out unevenly doubled at every zoom. Both cost 1 generation per direction for template and v3 clips. D2 is the fallback if the 48 tier states cost more.
- **Animation mode:** none holds both spear and shield in every facing. Template keeps identity best for locomotion but pops or loses the shield in the back facings. v3 custom keeps the shield (C2, D2) but invents the spear's direction (always lateral) and doubles it. skeleton-v3 made the only correct thrust (SW) but broke the back view; `lead-jab` is a boxing clip. Next try: `animate_with_skeleton_v3` with our own spear-thrust keypoints for each facing (the procedural rig in `paperdoll.ts` already has the joints), template for walk and run, and a free `pixelart_workbench` touch-up of the frames where the shield pops.
- **Not done:** the optional elite-state probe (`create_character_state` costs 10–25 and would have broken the 60 cap); tier consistency is still unmeasured.
- **Cost per class, estimated** for the full set (V5-081, V5-084): 3 tiers × 4 facings × about 16 clips (idle, walk, run, attack, block, hit, 2 deaths, rout, victory, 2 per-weapon attacks, 2 formation stances, a richer hit, an ambient idle) = 192 clip-directions. Base character about 2.5 tries = **~3**; 2 tier states at 10–25 = **20–50**; clips at 1 per direction (template, v3) = 192, at 2 (skeleton-v3) = 384; with I1's re-roll rate (about half the clip-directions flawed) ×1.5. Template/v3 only: **~320** per class; skeleton-v3 for the 10 non-locomotion clips and template for the 6 locomotion clips: **~505**; skeleton-v3 for all: **~610**. For 18 classes that is about 5,800–11,000 generations, 3 to 5.5 months of Tier 1 (riders and chariots on bigger canvases cost more). Animating only the basic tier in full and the other two tiers with idle, walk and attack would cut the clip-directions to 88 (~170–260 per class).

**Lessons.** Standard mode loses a held spear in the rotated views unless the prompt makes it the first, largest thing ("holding a very long … spear vertically … taller than the man"); 6 of 10 characters were rejected for that or for a doubled spear. Ask for the shield size too: every aspis came out about a third of the body, against the procedural ~half. v3 attacks come back on a larger canvas than the rotations: read the feet line per strip. Back views (NE) fail most in every mode; check them first.

### AS-08 The Nikias portraits ART-033..035 and the app icon set (2026-10-13)

**Tool.** gemini.google.com, "Gemini 3.1 Pro", in Claude in Chrome, one new tab, two chats (Nikias, then the icon), typed prompts, no tool picker. References attached through the page's hidden `image/*` input. Every output was a 2048x2048 JPEG. Downloads were moved by the AS-02 safe mover (one new `Gemini_Generated_Image_*` newer than the start, else refuse); `~/Downloads` matched its start listing at the end. No CAPTCHA, quota message or download block. The tab was closed. **Raws:** `docs/v5/gemini/AS-08/` in the main checkout (gitignored). **Processed:** `docs/v5/gemini/AS-08/processed/portrait_nikias[_talk|_blink].png`. **Contact sheet:** `docs/v5/art/AS-08-contact.jpg` (the three frames at 384, the in-game card with frames 0/1/2 at 390, 360 and 320 DPR 3, the icon set at real size and zoomed, the maskable safe circle, the Telegram circle crop, the 640x360 image).

**Prompts, word for word, with their outcome:**

- **#1 ART-033** (the queued AS-07 prompt; `seed_hoplite.jpg`, the 1024 px copy of `AS-02/ART-013_bust_hoplite_1.jpg`, attached). Raw `ART-033_portrait_nikias_1.jpg`. **Rejected:** the helmet is worn down over the face (nose guard and cheek pieces closed), not pushed up, and a bronze shield rim was added; it reads as the hoplite class bust, not as the narrator (art bible §5.1: Nikias has the helmet pushed up). No text, no extra limbs.

  ```
  Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads. ROLE: a character portrait for a small round or square portrait frame in a mobile strategy game; it must be recognisable at 40 pixels. SUBJECT: Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed up on the head, red cloak; mouth closed, eyes open. FRAMING: head and shoulders, front three-quarter view, the figure turned slightly to the viewer's left, eyes on the upper third of the image, the top of the head or crest 6 to 10 percent below the top edge, chin at about 60 percent of the height, shoulders cut by the bottom edge; the whole face and headgear inside the central circle of the image. The headgear silhouette and the one listed prop are the clearest, most contrasting shapes. BACKGROUND: plain dark warm umber (#26211b to #342d25), a soft lighter glow behind the head, no scenery. EXPRESSION: composed, alert, mouth closed. ASPECT: square 1:1, highest resolution available.
  ```

- **#2 ART-033** (same chat, follow-up; the seed still in the chat). Raw `ART-033_portrait_nikias_2.jpg`. **Accepted (frame 1):** helmet high on the crown, eye holes empty above the brow, whole face and white beard visible, red crest, red cloak with a bronze brooch, no shield, umber ground with the glow; the crest tip is about 3% below the top edge (asked 6–10%), not cut. No text.

  ```
  Create a NEW image with the same prompt, but fix the helmet: the bronze Corinthian helmet is PUSHED UP and tilted back on top of his head, resting high on the crown like a cap, so his WHOLE face is uncovered: forehead, eyes, cheeks, white hair at the temples and the full white beard are all visible; the helmet's empty eye holes and cheek guards sit above his forehead. No shield: only the red cloak, pinned at the shoulder. Keep everything else from the first prompt: the fresco style matching the attached reference, the framing, the plain dark warm umber background with its soft glow, mouth closed, eyes open. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image, a shield. ASPECT: square 1:1, highest resolution available.
  ```

- **#3 ART-034** (edit; the approved frame 1 as a 1024 px JPEG attached). Raw `ART-034_portrait_nikias_talk_1.jpg`. **Accepted:** mouth open mid-word, teeth just showing. Geometry held: the mean per-channel difference to frame 1 on a 4x4 grid of the 384 px file is 1.3–4.1 everywhere except the mouth cell (10.0), so the head does not jump when the frames swap.

  ```
  Edit the attached Nikias portrait. Change only: his mouth, now open mid-word as if speaking, the lower teeth just hidden by the beard. Keep everything else identical: the same face, white beard, bronze Corinthian helmet pushed up on the head, red cloak, pose, framing, size and position in the frame, plain dark warm umber background with its soft glow, colours, painted fresco style and light from the upper left. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image. ASPECT: square 1:1, highest resolution available.
  ```

- **#4 ART-035** (edit; frame 1 attached). Raw `ART-035_portrait_nikias_blink_1.jpg`. **Accepted:** eyes closed, lids relaxed, mouth closed; grid difference 1.5–4.2, highest at the eyes. OI-7 (drift) did not happen; the three painted frames ship.

  ```
  Edit the attached Nikias portrait. Change only: his eyes, now closed in a blink, the eyelids relaxed. Keep everything else identical: the same face, white beard, closed mouth, bronze Corinthian helmet pushed up on the head, red cloak, pose, framing, size and position in the frame, plain dark warm umber background with its soft glow, colours, painted fresco style and light from the upper left. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image. ASPECT: square 1:1, highest resolution available.
  ```

- **#5 App mark** (new family T-MARK, new chat, no reference). Raw `app_mark_1.jpg`. **Accepted:** one bronze Corinthian helmet in profile facing left, red crest, dark umber disc, terracotta and cream Greek-key ring, flat magenta outside, no text, no face. The ring came out about 14% of the diameter (asked 8%), so the helmet fills about half the disc; that is why the favicon sizes use the inner disc only (below).

  ```
  Create an image. ROLE: the app icon and browser favicon of a mobile strategy game set in the ancient Mediterranean; it must read as one bold shape at 16 pixels and still look rich at 512 pixels. SUBJECT: a single bronze Corinthian hoplite helmet in side profile, facing the viewer's left, with a tall arched red horsehair crest; the eye opening is one clear dark almond shape; the helmet and crest together fill about 70 percent of the disc and are centred in it. DISC: a perfect circle of dark black-glaze umber (#2a1a12 to #3a2418), like the ground of a red-figure Greek vase, edged by a ring of terracotta (#a8432c) carrying a simple bold Greek key meander band in terracotta and warm cream (#e7d6ad), the band about 8 percent of the diameter wide; the helmet sits inside the ring and does not touch it. STYLE: painted like a red-figure Greek vase but with soft painted shading on the bronze: flat bold shapes, a heavy dark-brown outline (#2a1a12) of even weight around the helmet and crest, light from the upper left, bronze #b08a3a with warm highlights, warm earth colours, no pure black and no pure white, very few internal details; hand-painted, not a photo, not a 3D render, not glossy digital art, not anime. COMPOSITION: the disc centred, seen flat from the front, filling 94 percent of the square, nothing outside the disc. BACKGROUND: a perfectly flat solid #FF00FF magenta background outside the disc, edge to edge, with no shadow, no gradient and no glow; no magenta anywhere inside the disc. EXCLUDE: any text, letters, numbers, signatures, watermarks, a face or a person inside the helmet, spears, more than one object, tiny details, perspective, a drop shadow. ASPECT: square 1:1, highest resolution available.
  ```

**Nikias, pipeline (D-9).** `process.mjs` (painted, anchor 0.5/0.25) → 384x384; `check.mjs` PASS ×3. Slot wired as ASSET_LIST says (FirstRunScene speech card and the tutorial narrator; replaces the procedural bust): `src/ui/tutorial/narrator.ts` `preloadNarrator` (FirstRunScene.preload, and BattleScene.preload only for the tutorial battle) and `setNarratorFrame(img, frame, size)`, which shows the painted frame cover-drawn at the slot size (`raster.ts coverTexture`) when **all three** files loaded, else the pixel `narrator_0..2`. Manifest `preview`: `first-run-offer`, `first-run-resume`, `tutorial-intro`. `preview.mjs` exit 0 for each (layout check 0 new at 390x844, 360x780, 320x640), with temporary copies of the other two files in `public/ui/` (the slot needs all three); `promote.mjs --looked` shipped each over its copy (same bytes, md5 checked). Sheets read: slot filled, sharp at DPR 3, helmet, crest and beard whole in the 32 UI px well on the offer and resume cards and in the tutorial bubble (at 320 the tutorial leaves the portrait out by design, `PORTRAIT_MIN_VW`). Frames 1 and 2 were looked at in the game too (a scratch Playwright run that put each frame in the FirstRun well at the three sizes): the open mouth and the closed eyes read, nothing else moves. `check --shipped` PASS: 31.0, 31.2, 31.3 KB (budget 40).

**App icon set (no manifest row: not a game slot).** `scripts/art/appicons.mjs <raw>`: key the magenta, trim, a clean round alpha, then: `public/favicon.ico` (16, 32, 48, PNG entries) and `public/favicon-32.png` from the inner 75% of the disc (the helmet and a terracotta rim, no meander; at 16 px the full disc was a brown dot with an orange ring); `public/apple-touch-icon.png` 180 (disc at 90% on `#14100c`); `public/icon-192.png`, `icon-512.png` (disc, transparent); `public/icon-maskable-512.png` (disc at 80%, inside the W3C maskable safe circle, on `#14100c`); `docs/telegram/bot_userpic_640.png` (disc at 86% on `#14100c`, inside Telegram's circle crop) and `docs/telegram/miniapp_cover_640x360.jpg` (the campaign fresco cover-cropped, the mark at 150 px in the sky). Wired: `index.html` links the two favicons, the touch icon and `public/manifest.webmanifest` (name, standalone, portrait, the three PWA icons; theme and background `#14100c`, the `bg` token, already the page's `theme-color`). Checked at 16 px by zooming the rendered 16 px entry on the dark and the parchment ground: the red crest and the bronze helmet with its dark eye read; in greyscale it is a lighter helmet on a dark disc. The Telegram circle crop leaves the whole ring visible. Telegram sizes and the owner's BotFather steps: `docs/telegram/README.md`.


### AS-07 The v5 art left undone: 14 staged icons and 17 class busts promoted (2026-10-13)

**Decision: reuse, not regenerate (Director, 2026-10-13).** The 14 staged icons (AS-03) and the 17 unpromoted busts (AS-02) all had approved renders made with the family templates; they had waited only for a wired slot and an in-game look. They were **not** regenerated: the exact files in `docs/v5/gemini/AS-03/processed/` and `AS-02/processed/` were staged and previewed. The rule was to regenerate one only if it looked wrong in the game (contrast, legibility at size, style); none did, so **no Gemini prompt was sent in AS-07**. The Nikias portraits are in the Queue above (Chrome not connected).

**Icon slots wired** (each its ASSET_LIST slot, nothing invented): `ui:banner` and `ui:book` on the Campaign and Codex tabs (`MODE_TABS`, audit MENU-3); `ui:war` engraved on the War medallion's face at 0.62 of its diameter (`TabBar`, MENU-2); `ui:season` on the Arena season line (`DuelScene.buildSeasonLine`, DUE-7); `ui:push`, `bond`, `warcry`, `sunder`, `aimed`, `recharge`, `scythe` as the seven signature abilities' icons (`ABILITIES[*].icon`, so the battle bar, the Perks cards and the hero sheet use them; the battle fx icon falls back to the stand-in's vector shape through `UI_ICONS`); `ui:captain` for the captain row of the encounter sheet (`encounter.ts`, replacing the pixel crest; the world band plate keeps its code-drawn pixel crest, art bible §8.6). `ui:standard` and `ui:works` were already asked for by their slots (World host chip, Raise the standard, Standard Bearer perk card; the Works chip and camp drawer). `STAGED_ICONS` is now empty.

**Bust slot.** The Army hero card's class medallion and the recruit sheet's corner (`addClassBust`) already take any class: `SHIPPED_BUSTS` now lists all 21. To see each class in the game, `scripts/layout-check.mjs` gained 21 opt-in screens `army-bust-<class>` (the Army from the World with hero 0 set to that class; run only when named with `--screens`, so the default run and the allowlist are unchanged). No bust lacked a slot.

**Pipeline (D-9).** `check.mjs` PASS for all 31 staged files. Icons: `atlas.mjs icons_ui --add` (the 14 keys) into staging, then `preview.mjs` for each icon (exit 0 at 390x844, 360x780, 320x640) on `menu` (book, banner, war), `duel-ranked` (season), `hero-perks` (abilities, standard), `battle-works` (works), `world-encounter` (captain) and `kit-icons` (all 14 at 12 UI px). The `world-encounter` fixture did not open the sheet in the DPR 3 run, so the captain row was also looked at with a scratch Playwright run (World, `openEncounter` on a Galatae band) at 390x844 and 320x640, DPR 3: the red crest sits beside "Captain …, level 3" like the doctrine's ram above it. Sheets read: the banner reads on the selected parchment tab, the book on the teal stone, the war glyph (helmet and crossed spears) on the bronze medallion at 46 UI px, the hourglass and laurel on parchment at 12 px, Push of Pike on its (locked, dimmed) perk disc, the spade and stake as the Works chip's ink silhouette. The atlas was shipped with `atlas.mjs … --out public/icons --looked`; it is byte-identical to the previewed staged atlas. Busts: `preview.mjs` exit 0 for ART-014..017, 019, 020, 022..032 on their `army-bust-<class>` screen; a crop of the hero niche from every DPR 3 shot at 390 and 320 was read: slot filled, sharp, heads and headgear whole, one family; `promote.mjs --looked`, `check --shipped` PASS (19 to 25 KB each, budget 30).

**Size.** 17 busts: 382 KB in `public/ui/busts/`, loaded per class on first use. `public/icons/ui.png` 623 KB to 1,123 KB (+500 KB; 14 cells of 160 px painted art, 128 frames, 2044x586). An adaptive-filter re-encode was tried and came out larger (1,287 KB); an RGB step-4 quantization saved only 11% (1,000 KB), so the lossless file shipped. JS bundle: see the AS-07 report.

### RES-01 promotion: the laurel branch ART-055 and the open empty chest ART-053 (2026-10-11)

**Slots wired (RES-01).** `src/ui/results/art.ts` loads `ui/laurel_branch.png` (texture `ui_laurel_branch`) and `ui/chest_open_empty.png` (`ui_chest_open_empty`) in `ResultsScene.preload`. The laurel is drawn inside both ends of the Results banner plaque, at most 36 UI px tall (the right branch is the left one mirrored; dimmed to 45% on a defeat), replacing the pixel `LAUREL` grid (audit RES-2). The chest heads the compact Spoils empty-state card, at most 56 UI px tall (audit RES-4). Manifest `preview`: ART-055 on `results` and `results-arc`, ART-053 on `results-empty` (two new layout-check fixtures). ART-052 and ART-054 stay for DUE-01's chest slots.

**Pipeline (D-9).** Staged from `docs/v5/gemini/AS-05/processed/`; `check.mjs` PASS for both. `preview.mjs` exit 0 for both (layout check clean at 390x844, 360x780, 320x640), each previewed while the other file was a temporary copy in `dist/ui/`. The DPR 3 sheets were read: the branches are sharp and gilded on the teal plaque and stay clear of the word; the chest is whole, lid and lion lock visible, no fringe on the parchment. **Budget:** the processed chest was 134 KB (budget 90). It was re-encoded with adaptive PNG row filters and its RGB quantized in steps of 4 (alpha untouched; fully transparent pixels zeroed): 61 KB, 1816 colours, no visible banding on the sheet. That exact file was previewed again, then promoted. `promote.mjs --looked` shipped both; `check --shipped` PASS (laurel 33 KB / 50, chest 61 KB / 90).

### FW-03 promotion: the five works sprites (2026-10-11)

**Slots wired (FW-03).** `src/art/terrainArt.ts` `WORK_ART` and `workSprites`: one sprite per stakes, ditch, palisade or rampart cell and one wagon per 2-cell laager segment, feet on the lowest vertex of the footprint (origin 0.5, 1), flipped for a line along field y. The ditch is a decal under the men; the rest are depth-sorted with them. `BattleScene.preload` loads `public/world/tile_*.png`; placed segments are redrawn when `Battle.works()` changes, an assault field's palisade and rampart cells are drawn with the trees. Manifest `preview`: ART-072..074 on `battle-works-field` (a stakes line, a ditch and a laager laid in deployment), ART-075 and ART-076 on `battle-assault` (a lair assault's deployment with the garrison's stakes).

**Pipeline (D-9).** Staged from `docs/v5/gemini/AS-06/processed/`; `check.mjs` PASS for all five. `preview.mjs` exit 0 for each (layout check clean at 390x844, 360x780, 320x640), with temporary copies of the other four in `public/world/` (the battle loads all five; a missing file is a console error in the check), then `promote.mjs --looked` shipped each over its copy (same bytes). DPR 3 sheets read: the stakes read as a pale stake row, the ditch as a dark trench under the men's feet, the wagon at chest height, the palisade as a wall above head height with the garrison behind it; crisp at 1x. `check --shipped` PASS (0.3 to 1.1 KB).

### SET-01 promotion: the 6 settlement vignettes ART-006 to ART-011 (2026-10-11)

**Slot.** The Settlement page banner (`SettlementScene`, a `FrescoBanner` over the content width, 78 UI px tall, 58 below 380 UI px of height, 38 below 300), texture `ui_vignette_<kind>_<culture>` loaded in `SettlementScene.preload` from `ui/vignette_<kind>_<culture>.jpg` on the first visit to a place of that kind and people. Until it loads (or if it is missing) the old map-tile art is drawn. It replaces the upscaled map tile (audit SET-1). Manifest `preview`: towns on `town-recruits` and `town-rest`, villages on `village`.

**Pipeline.** Staged from `docs/v5/gemini/AS-04/processed/vignette_*.png`; `check.mjs` 6 PASS (1032x420, opaque). `preview.mjs` exit 0 for all 6 at 390x844, 360x780 and 320x640. The layout fixtures only enter Greek places (the start town Rhegion, the village Pylos), so the Greek sheets show the asset itself; the Phoenician and Celtic four were also looked at in the real game by a scratch Playwright run that entered a town and a village of each people at the same three sizes, en and ru: slot filled, sharp, no clash with the frame or the title.

**Budget.** At quality 82 the files were 137 to 141 KB (budget 130): the manifest sets `"quality": 76` (Greek towns and villages, Phoenician town) and 70 (Celtic town, Phoenician and Celtic villages). `check.mjs --shipped`: 6 PASS, 120 to 128 KB.

### SHP-01 promotion: the shop fresco ART-004 (2026-10-11)

**Slot.** The Shop hub's banner (`ShopScene` header, a `FrescoBanner` 30 UI px tall over the full content width, shown when the content box is 280 UI px or taller), texture `ui_fresco_shop` loaded in `ShopScene.preload` from `ui/fresco_shop.jpg`. It replaces the procedural pixel stall (`modeArt` "shop", SHP-5). Manifest `preview`: `ui/fresco_shop.jpg` on `shop-shop`, `shop-pass`, `shop-wallet`.

**Pipeline.** Staged from `docs/v5/gemini/AS-04/processed/fresco_shop.png`; `check.mjs` PASS (1032x132). `preview.mjs` exit 0 (layout check clean at 390x844, 360x780, 320x640); the three DPR 3 sheets were read: the slot is filled and sharp, the merchant's head, the bronze helmets and shields and the amphorae are inside the crop, the awning's edge shows at the top, the lambda shield on the ground stays outside the crop, no clash with the chip, the switch or the badge. At 320x640 the banner is not drawn (short box). `promote.mjs ART-004 --looked` shipped `public/ui/fresco_shop.jpg` (47 KB, `check --shipped` PASS, budget 80 KB).

### CDX-01 promotion: the 8 beast plates and the 5 doctrine icons (2026-10-11)

**Slots.** Plates: the Codex beast row art well (32 UI px) and the beast sheet header beside the figure (`src/ui/beastInfo.ts` SHIPPED_PLATES, lazy per scene). Doctrine icons: the Codex doctrine rows and the doctrine sheet (`ui:doctrine_*`). Manifest `preview`: plates on `codex` (hydra also `codex-beast`), icons on `codex-doctrines` and `codex-doctrine`.

**Pipeline (D-9).** Staged from `docs/v5/gemini/AS-05/processed/` and `AS-03/processed/`; `check.mjs` 13 PASS. `preview.mjs` exit 0 for all 13 (layout check clean at 390x844, 360x780, 320x640); every DPR 3 sheet read: slots filled, sharp, heads whole (hydra's five heads, the titan's boulders), no clash with the row text or the chevron, one family. The plates were previewed with temporary copies of the other seven in `public/ui/beasts/` (each preview otherwise logs seven missing files), then `promote.mjs --looked` shipped each over its copy: 24-32 KB, `check --shipped` PASS (budget 35). Icons: `atlas.mjs icons_ui --src docs/v5/gemini/AS-03/processed --add ui:doctrine_* --out public/icons --looked` wrote the same bytes as the previewed staged atlas; the keys left `STAGED_ICONS`. `ui:doctrine_hammer` reads as a hammer at 20 UI px on parchment.

**Fix.** `preview.mjs` served a staged atlas at `icons/icons_ui.png` while the game loads `icons/ui.png`, so atlas previews showed the stand-ins; it now overrides the path the game loads. The icon previews were run again after the fix.

### TUT-01 promotion: splash key art, War and Arena frescoes (2026-10-11)

**Slots wired (TUT-01).** `src/scenes/FirstRunScene.ts` loads `ui/splash_keyart.jpg` (offer and resume, in a FrescoBanner above Nikias) and `ui/fresco_war.jpg` / `ui/fresco_arena.jpg` (the War and Duels mode cards, a strip up to 4:1, dropped below 22 UI px high). The manifest `preview` of ART-056, ART-005 and ART-003 now names those URLs and the `first-run-offer`, `first-run-resume` and `first-run-modes` screens. ART-003's own slot (the DuelScene Arena banner) is still unwired; the same file serves it when DUE-01 wires it.

**Pipeline (D-9).** Staged files are the AS-04 processed PNGs (`docs/v5/gemini/AS-04/processed/`, copied into the ignored `docs/v5/art/staging/`); `check.mjs` PASS for all three. `preview.mjs` ran in the real game at 390x844, 360x780 and 320x640 with layout check exit 0, and every contact sheet was looked at (slot filled, no crop of heads, no clash with chrome) before `promote.mjs --looked`. ART-005 was previewed while the Arena card's file was a temporary local copy (the modes screen loads both; a missing file is a console error in the check); ART-003 was then previewed and promoted over it.

**Budget.** The splash at the default JPEG quality 82 was 283 KB (budget 220): the manifest row now sets `"quality": 62`, shipped 195 KB. `check.mjs --shipped`: ART-056 PASS, ART-005 PASS (107 KB / 140), ART-003 PASS (57 KB / 90).

### AS-06 Expansion pixel art: field works, captain marker, standard banner (2026-10-11)

**Scope.** The story row: works (stakes, ditch, wagon laager, palisade, rampart; field-works.md R5 "distinct iso art that reads at 1x zoom"), the captain marker (ai-doctrines.md R6: "a 10 px glyph" over his head) and the Standard bearer's banner (abilities.md R5.5, battle-readability.md R2). New manifest rows **ART-072 to ART-078** (`kind: pixel`, `dest: public/world/`, `preview: null`). Nothing invented: every row is a cell kind or marker named in those GDDs. The works sim (FW-01) and works art wiring (FW-03) are not in the code yet, so no game slot loads these files.

**Sizes (decided here, from the code).** The art bible has no size for works or markers. They come from the real battle at 1x zoom (`BattleScene` camera zoom 1 at DPR 1; terrain props drawn 1 art px = 1 world px):
- the iso cell is **36x18** (`src/art/iso.ts` ISO_HW 18, ISO_HH 9; `terrain.w` = `sim.width`, so one terrain cell = one field unit, measured in the page). The art bible §8.5 says 32x16 ("measured", from the ART_STYLE video): **open issue for the art-director**, the code is 36x18;
- a man's figure is about 20x50 world px with his spear (frame 40x99 at BATTLE_RES 2, shown at 0.5), a group standard is 13x44 (`ground.ts` renderStandard), a boulder 48x36;
- so: `tile_stakes` 36x24, `tile_ditch` 36x20 (ground decal), `tile_rampart` 36x24, `tile_palisade` 36x48 (taller than a man), `tile_laager` 72x52 (one wagon per 2-cell laager segment, field-works.md R3 "laager: 2 cells"), `crest_captain` 10x10, `crest_standard` 16x44 (the group standards' height).
- **Names.** §8.4 has no world-sprite category, so the works use `tile_` and the markers `crest_` (both in the allowed list); `scripts/art/list.mjs` got two TITLES entries so ASSET_LIST.md shows them.

**Tool.** gemini.google.com, "Pro" mode, one chat ("Isometric Wooden Stakes Sprite") in a new tab I created, typed prompts, no tool or aspect picker. The first prompt had `docs/v5/gemini/AS-06/ref/ingame_sprites_x4.png` attached through the page's hidden `image/*` input: the real in-game sprites (two men, both group standards, a base plate, a boulder, a tree) captured from the running game's textures and magnified 4x nearest. No CAPTCHA, quota message or block; one prompt (the first crest) came back **empty** (no image, no error) and was simply re-sent. Downloads: 14, each moved by `grab.sh` (scratch) from `~/Downloads` only if it was the single `Gemini_Generated_Image_*` file absent from the start listing and newer than the start marker; nothing else in `~/Downloads` was touched. The tab was closed.

**Raws** (V5-049, gitignored): `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-06/ART-07N_<stem>_<n>.jpeg` (all 2528x1696, 1792x2400 or 2400x1792 JPEG) plus `ref/`. **Processed**: `docs/v5/gemini/AS-06/processed/tile_*.png` (5 files, copies of the ignored `docs/v5/art/staging/`).

**Can Gemini draw on the grid?** Partly. It draws real block pixel art (flat cells on one grid) once told the image is "a grid of N columns by M rows of big square cells, each one flat colour", but it **does not hold the count**: it overshot the asked cell count by 1.4x to 2.6x on every image, and changed cell size from image to image in one chat. The fake-pixel size is 34 to 68 raw px, above `detectGrid`'s max of 32, so every file was processed with an explicit `--grid n` read from the image (scan with `grid.mjs`, scratch: edge energy on period p, fractional, 8 to 160; the cell count was also checked by eye on the screenshot). Unscaling is by majority colour per cell, then PA-WORLD snap, binary alpha and pad: **never scaled to fit**. Where the unscaled art was larger than its canvas, the item was regenerated (stakes 1 and 2, laager 1) or dropped to code (crest, standard). Block purity of the accepted raws at their grid (share of pixels within RGB 48 of their cell mean): stakes 0.75 (Gemini's grid drifts across this image; the unscaled result was checked cell by cell and is clean), ditch 0.97, laager 0.98, palisade 0.89, rampart 1.00.

**Prompts.** The seed prompt (stakes 1), word for word:

```
Create an image. ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game. The attached picture shows sprites already in the game (a hoplite, a skirmisher, two army standards, a unit base, a boulder, a tree) magnified 4 times: match their pixel density, palette, soft sel-out outlines and light from the upper left exactly. SUBJECT: one segment of a field-works line of sharpened wooden STAKES (a chevaux-de-frise row): five or six rough pale-wood poles with dark-brown pointed tips, driven into the ground at a 45 degree slant, all leaning the same way toward the upper right, set in a single row that runs diagonally from the upper left to the lower right like the edge of a 2:1 isometric diamond tile; a little turned dark earth at their feet. PIXEL GRID: true pixel art. The whole sprite is about 36 art pixels wide and 24 art pixels tall, and every art pixel is drawn as one clean, equal, square block of solid colour (very large chunky pixels, about 24 by 24 screen pixels each), aligned to one grid; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail, no thin lines finer than one block. PALETTE: only these colours: #2a1a12 #442618 #5e2427 #7b503d #a87464 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e. STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step ramps, light from the upper left. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no grass and no ground plane beyond the small patch of earth; the sprite centred. EXCLUDE: text, a frame, a grid overlay, several sprites, soldiers, a scene, a cast shadow on the magenta.
```

Every later prompt was a follow-up in the same chat: "Next sprite of the same set, same big cells (one flat colour each), same palette and light from the upper left, flat #FF00FF magenta background" + SUBJECT + a size **relative to an approved sprite** ("about half as wide as the wagon and a little taller") or a cell count + "No text, no anti-aliasing, no gradients, no detail smaller than one cell". Relative sizes worked better than cell counts.

| # | Raw | ART | Prompt (short) | Grid → art px | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | `ART-072_tile_stakes_1.jpeg` | 072 | seed prompt above | no grid found (fine, ~130 art px wide) | **Rejected**: crossed X stakes (a cheval-de-frise frame), horizontal row, far too fine |
| 2 | `ART-072_tile_stakes_2.jpeg` | 072 | "MUCH lower resolution… a grid of exactly 48 columns by 32 rows… three or four stakes, each 2 cells thick… diagonal row" | 34 → 50x44 | **Rejected**: clean grid, but 50x44 is taller than a man (stakes are waist-high); larger than the 36x24 canvas |
| 3 | `ART-072_tile_stakes_3.jpeg` | 072 | "even smaller and chunkier… 24 columns by 16 rows… FOUR stakes… 2 cells thick, 6 to 8 long… 2-cell point" | 68 → 27x18 | **Accepted (family seed)**: four slanted stakes on an earth strip, knee to waist high beside the men |
| 4 | `ART-073_tile_ditch_1.jpeg` | 073 | "a flat diamond-shaped patch (2:1 floor tile) about 24x12… a narrow trench… far bank lit, near bank shaded, spoil ridge" | 68 → 34x20 | **Rejected**: a dark outline round the diamond reads as a pasted tile; trench not dark enough; one pink cell |
| 5 | `ART-073_tile_ditch_2.jpeg` | 073 | "only the trench itself… a band 3 to 4 cells wide… 2 across per 1 down… about 24 columns long" | 68 → 35x22 | **Rejected**: reads as a log; slope too steep |
| 6 | `ART-073_tile_ditch_3.jpeg` | 073 | "back to the diamond ditch… exactly twice as wide as tall… NO dark outline… trench a 3-cell band of #2a1a12… 1-cell lit lip, 1-cell spoil ridge" | 68 → 32x20 | **Accepted**: dark trench along the long axis; three cells join into one continuous trench in the game |
| 7 | `ART-074_tile_laager_1.jpeg` | 074 | "one WAGON of a wagon laager… two-axle farm wagon with high plank sides… four disc wheels… rolled hide… about 24x18 cells" | 30 → 72x53 | **Rejected**: one row too tall for 72x52; the cell is half the set's |
| 8 | `ART-074_tile_laager_2.jpeg` | 074 | "cells twice as big… only about 37 cells wide… long side upper left to lower right, two big disc wheels, plank sides 3 to 4 planks high" | 34 → 62x46 | **Accepted**: one wagon per 2-cell laager segment; as tall as a man's chest, reads as a wagon at 1x |
| 9 | `ART-075_tile_palisade_1.jpeg` | 075 | "same cell size as this last wagon… six to seven upright rough logs… sharpened… one rope band… stepping down along the iso slope… HALF as wide as the wagon and a little TALLER" | 48 → 33x48 | **Accepted**: the best of the set; taller than the men |
| 10 | `ART-076_tile_rampart_1.jpeg` | 076 | "earthen RAMPART… low long mound… flat walkway… lit upper face, shaded front face… turf tufts… one third of the palisade's height" | 48 → 36x32 | **Rejected**: reads as a log or a box; slope too steep |
| 11 | `ART-076_tile_rampart_2.jpeg` | 076 | "Use the footprint of the approved ditch diamond: an isometric earth BLOCK… top face a flat 2:1 diamond… raised only 4 cells… lower-left face mid earth, lower-right shaded… ragged top edges" | 60 → 36x24 | **Accepted**: a raised earth block; three in a row show faint seams (see notes) |
| 12 | `ART-077_crest_captain_1.jpeg` | 077 | (first try came back empty) "a very small pixel-art icon… about 12 cells wide and 12 tall… the red horsehair crest… arched red brush on a curved bronze holder" | 64 → 24x24 | **Rejected → code-drawn**: 2.4x the 10x10 grid, and a hook-shaped crest that does not read as a crest |
| 13 | `ART-078_crest_standard_1.jpeg` | 078 | "the army STANDARD… pole, crossbar, bronze sun disc, red square banner with a fringe and a cream stripe, two ribbons… 14 cells wide and 44 tall" | ~42 → 21x82 (weak grid) | **Rejected**: 1.9x the 44 px height |
| 14 | `ART-078_crest_standard_2.jpeg` | 078 | "cells TWICE as big… only 8 cells wide (plus 3 for ribbons) and 22 tall… disc 4 cells, banner 5x6" | ~24 → 32x117 (weak grid) | **Rejected → code-drawn**: Gemini kept the same fine cells; 2.6x too tall |

**Totals:** 14 renders; 5 accepted (one per work), 9 rejected; 2 items (ART-077, ART-078) moved to code-drawn art. No render had text, letters, people or modern objects.

**Pipeline.** `process.mjs ART-072..076 --grid n`: exact canvases, 7 to 16 colours, key residue 0. `check.mjs`: **5 PASS** (exact size, binary alpha, every pixel in PA-WORLD, name), ART-077 and ART-078 **NOT ASSESSED** (no file; code-drawn). `preview.mjs ART-072` → **NOT ASSESSED** (exit 3: `preview: null`, no game slot loads world works art) and `promote.mjs ART-072 --looked` → **REFUSED** (no preview record). **Nothing promoted**; `public/` is untouched.

**Side by side in the real game.** Since `preview.mjs` cannot show them, a throwaway Playwright script (scratch, not committed) started a fresh deployment on the dev server, loaded the five staged PNGs as textures into the running `BattleScene` and placed them one pace in front of the player's groups at the scene's own 1x zoom, feet on the bottom vertex of their cell diamond, depth by y like trees: 3 stakes, 3 ditch cells, 3 rampart cells with 3 palisade cells behind, one wagon. Shots at 390x844, DPR 1 and DPR 3 (the bottom half of the contact sheet is the DPR 3 crop). Read:
1. All five read at 1x as what they are: stakes, a dark trench, a raised earth bank, a timber wall, a wagon.
2. Scale is right against the men: stakes knee to waist high, wagon chest high, palisade above head height, rampart a low step.
3. Crisp at an integer scale, light from the upper left like the boulders and trees, sel-out outlines in dark brown.
4. Stakes are the brightest thing on the field (pale wood #e8e2d4). That serves R5 (they must read), but if the art-director finds them loud, FW-03 can tint them.
5. Three rampart blocks in a row show faint seams between cells (each block has its own lit edge). Acceptable for a generated assault rampart; a seamless long rampart would need a code-drawn strip.

**Contact sheet:** `docs/v5/art/AS-06-contact.jpg` (1307x760, 135 KB). Top: the five works at 3x nearest on grass, then the in-game sprites for scale (an ally and an enemy man at the battle's 0.5 display scale, a group standard, a base plate, a boulder). Bottom: the DPR 3 crop of the real deployment with the works placed beside groups I, II and IV.

**For FW-03 (works art wired), RD-01 (badges) and AB-03.**
- Load `public/world/tile_*.png` (after promotion) or draw them from the staged files; each is drawn with its feet on the bottom vertex of its cell diamond (origin 0.5, 1), depth y. The sprites run along field +x (screen down-right); use `setFlipX` for a line along field y. `tile_laager` covers 2 cells (one wagon per segment), the others one cell. `tile_ditch` is a ground decal: draw it under the men (or paint it into the ground texture). Then add a manifest `preview` (a battle fixture with works), run `preview.mjs`, read the sheets, `promote.mjs --looked`.
- **ART-077 captain crest (10x10) and ART-078 Standard banner (16x44) are code-drawn**, like every other battle glyph and the group standards: the crest as a 10 px glyph beside the morale glyphs (battle-readability R2, `src/art/icons*` / `vectorIcons.ts`), the banner as a variant of `ground.ts` `renderStandard` (same 44 px height, 4-frame wave) with a bronze sun disc and a red square cloth, matching the atlas icon `icon_standard` (ART-069). Their manifest rows have status `code-drawn` and no raw is used.

### AS-05 Beast plates, reward chests and the laurel branch (2026-10-11)

**Scope.** The story row: the 8 beast plates (ART-036 to ART-043), the 3 chests (ART-052 to ART-054) and the laurel branch (ART-055). No new manifest rows. Every plate is a beast that exists in the game (`src/data/beasts.ts` MythIds, `src/i18n/beasts.en.ts` hints); each SUBJECT was written from the manifest row **plus** the in-game model in `src/art/beastArt.ts` (colours, props, part counts) and the hint text, so the plate and the battle figure agree (story AC 1).

**Tool.** gemini.google.com, "Pro" mode, one new chat in a new tab of a fresh tab group, prompts typed as "Create an image…" / "Edit…" with no tool picker and no aspect picker. Plates and chests: 2048x2048 JPEG; laurel: 1792x2400 (3:4). All above their tiers, nothing upscaled. References attached through the page's hidden `image/*` input (`file_upload`). No CAPTCHA, quota message or download block. Downloads were moved by `grab.sh` (scratch): only a `Gemini_Generated_Image_*.jpeg` absent from the start listing and newer than the start marker, refusing on anything but one match. **Note:** during the run three `Gemini_Generated_Image_*.jpg` files (1024 px, `.jpg` not `.jpeg`) appeared in `~/Downloads` that this run did not download (`metewr…`, `1rvxat…`, `4pguk8…`, from another session); the script refused the ambiguous match once, the minotaur was then taken by its exact name, and those three files were **left untouched**. Nothing else in `~/Downloads` was moved. The tab was closed.

**Raws.** Per V5-049, gitignored, in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-05/` as `ART-0NN_<stem>_1.jpeg`, plus `ref/` (the 1024 px references attached) and `ART-055_laurel_branch_1_flipped.jpeg` (below). **Processed** (`process.mjs`; plates kind painted: square cover, one area downscale to 288, opaque; chests and laurel kind cutout: key #FF00FF tol 60, fringe 3, trim, contain): `docs/v5/gemini/AS-05/processed/<file stem>.png`, 12 files, 1.8 MB, copies of the ignored `docs/v5/art/staging/`. **Contact sheet:** `docs/v5/art/AS-05-contact.jpg` (1180x470, 140 KB): row 1 each plate at 136, then 32 (the CDX-2 row thumbnail), 16 (today's thumbnail) and 48 on `stone2`; row 2 the three chests at 144x136 on parchment and on `stone1`, the laurel pair (shipped left branch + code mirror) at 80x108; row 3 the chests at the 48 UI opening size and the 16x13 ChestSlot, the laurel pair at 80x108 and at the 26x36 slot on `wine` (defeat) and on parchment.

**Family seeds.** Plates: there was no approved plate, so `plate_hydra` was made first from T-STYLE + T-PLATE with the AS-02 `bust_bear` (1024 px) attached, so the plates share the beast busts' umber ground, glow, light and brushwork. It was approved and its 1024 px copy attached to the other seven. Chests: `chest_closed` was made from T-STYLE + T-CUTOUT with the hydra seed attached for brushwork and palette only; `chest_open_empty` is an **edit** of `chest_closed`, and `chest_open_full` an **edit** of `chest_open_empty` (same geometry, so the two open states swap without a jump). Laurel: `chest_closed` attached as the cutout style reference.

**Hydra seed prompt (bust_bear attached):**

```
Create a NEW image, not an edit of the reference. The attached animal portrait is from the same mobile strategy game: match its painting style, palette, brushwork, warm umber background and lighting exactly, but this is a full creature plate, not a head-and-shoulders portrait. ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic. STYLE: [T-STYLE, word for word]. SUBJECT: the Lernaean Hydra rising from a swamp: a heavy dark teal-green scaled body with a pale belly and a row of short spines along the back, four short splayed clawed legs half in the water, and exactly FIVE serpent heads on long curving necks rising from the front of the body, fanning out; each head wedge-shaped with a small bony frill, yellow eyes and bared fangs; a coiling tail behind. COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, all five heads fully inside the frame with space above them; one simple ground cue: dark swamp water with a few reeds; a strong silhouette against the background. BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, people, modern objects, extra legs, more or fewer than five heads, heads cut by the frame, blood. ASPECT: square 1:1, highest resolution available.
```

**Plate family prompt (hydra seed attached): F + SUBJECT + COMPOSITION + G.**

```
F: Create a NEW image, not an edit of the reference. Match the attached reference bestiary plate exactly in style, palette, brushwork, fine craquelure, dark warm umber to red-brown background, warm key light from the upper left, chiaroscuro and full-bleed framing (no border); change only the creature and its ground cue. It is one of a matching set of bestiary plates for a codex in a mobile strategy game set in the ancient Mediterranean: the monster alone, dramatic, in the manner of a painted tomb fresco. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments, visible confident brushwork, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render.
COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, {the parts that must stay} fully inside the frame; one simple ground cue: {GROUND}; a strong silhouette against the background.
G: EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames, people, modern objects, extra limbs, extra heads, duplicated creatures, parts cut by the frame, blood{, extras}. ASPECT: square 1:1, highest resolution available.
```

**Cutout prompts.** `chest_closed`: "Create a NEW image … Use the attached painting ONLY as the style reference for the brushwork, the warm earth palette and the light from the upper left; do NOT copy its dark background or its creature" + T-STYLE (without background) + T-CUTOUT with the SUBJECT below, "three-quarter front view from slightly above", BACKGROUND "perfectly flat solid #FF00FF … no shadow, no cast shadow, no gradient, no glow, no vignette, no texture and no floor; no magenta or pink anywhere inside the chest"; EXCLUDE adds coins, other objects, a table or ground. The open chests: "Edit the attached chest image. Change only: {what}. Keep everything else identical: the same chest, the same oak planks, bronze bands, rivets and lion-head lock plate with its ring, the same three-quarter view, the same size and position in the frame, the same colours, painted style and light from the upper left" + the same BACKGROUND. Laurel: T-CUTOUT, portrait 3:4, "it must read at 26 by 36 pixels", EXCLUDE ribbons, berries, a full wreath, a second branch.

| # | Raw | ART | SUBJECT as sent (short; source in code) | Verdict | Notes (checked on the 2048 raw and at 288 / 32 / 16) |
| --- | --- | --- | --- | --- | --- |
| 1 | `ART-036_plate_hydra_1.jpeg` | 036 | seed prompt above (beastArt: teal scale, pale belly, back spines, 4 splayed legs, 5 neck stumps; hint "Five heads strike on long necks") | **Accepted (plate seed)** | Exactly five frilled heads, four legs, coiling tail, swamp and reeds. Top head ~6% below the edge. Craquelure visible. No text. |
| 2 | `ART-037_plate_cyclops_1.jpeg` | 037 | a one-eyed Cyclops lifting a huge grey boulder overhead with both hands: tan skin, ONE eye under a heavy brow, wild dark hair, short dark beard, a small stubby horn, a shaggy fur pelt over one shoulder, leather belt, fur loincloth; a knotted wooden club at his feet (beastArt `giant` cyclops: giantSkin, horn stub, pelt, club; hint "hurls boulders", "his club") | **Accepted** | One eye, horn stub, pelt, club on the ground, boulder ~4% below the top edge. Hands correct. A metal belt buckle, small, not modern-looking at 32. |
| 3 | `ART-038_plate_harpies_1.jpeg` | 038 | exactly three harpies diving, wings swept back, talons out: gaunt grey-skinned woman's heads and shoulders, chest in dark feathers, wild black hair, screaming mouths, glowing pale eyes; ragged dark grey-violet wings instead of arms; bird legs with long curved bronze talons; a jagged rocky crag below (beastArt `harpy`: harpySkin, feather, wild black hair, screaming mouth; hint "dive on archers") | **Accepted** | Three harpies, two wings and two bird legs each, no human arms, no nudity, bronze talons. The top-left wingtip comes within ~2% of the top edge but is not cut. They dive toward the lower left. Three, not the game's flock of six: three read at 32 px, six would not. |
| 4 | `ART-039_plate_nemean_lion_1.jpeg` | 039 | the Nemean Lion crouched to pounce, facing left: glinting golden metallic hide, massive dark ochre-brown mane, golden eyes, fangs, claws out, dark tail tuft; two snapped arrows on the rocks, bounced off its hide (beastArt `cat` lion: lion coat, mane, gold highlights; hint "Arrows … glance off its hide", "pounces") | **Accepted** | Four legs, one tail; the broken arrows carry the "missiles glance off" hint. Reads at 16 px as a gold lion. |
| 5 | `ART-040_plate_minotaur_1.jpeg` | 040 | the Minotaur charging left, head lowered, horns first: dark brown bull hide, shaggy hump, bronze nose ring, wide ivory horns; plain leather kilt, bronze bracers; a double-headed bronze labrys on a long haft (beastArt `giant` bull: bull hide, ivory horns, nose ring, bronze bracers, labrys; hint "Charges straight through lines") | **Accepted** | Two arms, two legs (hooves), five-fingered hands (checked zoomed), one head, a bull's tail. The bracer's engraving is an abstract scroll, no letters. |
| 6 | `ART-041_plate_chimera_1.jpeg` | 041 | the Chimera facing left breathing a cone of orange fire: tawny lion body, dark mane, scorched streaks on the flanks; a grey-brown goat head with curved ivory horns rising from the back; a green scaled serpent tail arcing over with the snake head at the tip; exactly three heads, four legs, no wings (beastArt `cat` chimera: goat, serpent tail, scorched streaks; hints fire cone, goat bleat, serpent tail) | **Accepted** | Exactly three heads in the right places, four legs, no wings. The fire runs out of the left edge (a cone, not a body part); the creature is whole. |
| 7 | `ART-042_plate_kraken_1.jpeg` | 042 | the Kraken rising from a stormy sea at the edge of a sandy beach: dark wine-red and maroon, a tapering dome mantle out of white surf, two pale yellow eyes, a hooked dark beak; exactly six sucker-lined tentacles, two slamming onto the sand; wet sand foreground (beastArt `krakenBody`: kraken maroon, mantle dome, eyes, beak, surf; hint "Rooted at the shore: six arms") | **Accepted** | Six tentacles, all tips inside. The sky came out warm umber rather than stormy, which keeps it in the plate family. Squid-like mantle matches the code's tapering dome. |
| 8 | `ART-043_plate_titan_1.jpeg` | 043 | a Titan hurling two boulders, one raised in each hand: a massive body of grey weathered stone with glowing orange molten cracks, bronze shoulder plates and a wide bronze belt, glowing eyes, a crown of bronze spikes, a stern bearded stone face (beastArt `giant` titan: stone + ember cracks, bronze pauldrons and belt, glowing eyes, spiked bronze crown; hint "Hurls two boulders at once") | **Accepted** | Two boulders, two arms, two legs, five-fingered hands. The plain rectangular belt plate is a little modern in shape (a broad bronze buckle); at 32 px it reads as a bronze belt. A regeneration candidate if the art-director objects. |
| 9 | `ART-052_chest_closed_1.jpeg` | 052 | a closed treasure chest of dark warm oak planks, slightly domed lid, three broad bronze bands, bronze corner plates with rivets, a bronze lion-head lock plate with a ring in its mouth; lid shut | **Accepted (cutout seed)** | Flat magenta, no shadow, no magenta in the chest; key residue 0. No text. |
| 10 | `ART-053_chest_open_empty_1.jpeg` | 053 | EDIT of #9: lid open, swung back and standing behind; empty inside, bare dark floor and walls in shadow | **Accepted** | Same chest, bands, rivets and lion lock. The open lid makes the trimmed box taller, so after `contain` the chest body is drawn somewhat smaller than the closed one in the same 288x272 frame (see the sheet). |
| 11 | `ART-054_chest_open_full_1.jpeg` | 054 | EDIT of #10: heaped above the rim with plain blank gold coins, a few spilling over the front edge; no coins on the background | **Accepted** | Geometry identical to #10, so empty and full swap cleanly. Blank coins, one small painted glint, no text. |
| 12 | `ART-055_laurel_branch_1.jpeg` | 055 | a single gilded laurel branch: stem from the bottom, bowing out to the LEFT, tip curling to the upper right (the left half of a victor's wreath); 9 to 11 pairs of pointed gilded leaves; portrait 3:4 | **Accepted, mirrored** | Gemini drew it bowing to the RIGHT. Since the manifest wants the **left** branch (the right is mirrored in code), the raw was flipped horizontally with `sips -f horizontal` into `ART-055_laurel_branch_1_flipped.jpeg` and that was processed. Leaves alternate more than they pair; painted, not pixel (RES-2). On the sheet the shipped branch + its code mirror form a wreath. |

**Totals:** 12 renders, 12 accepted on the first try, 0 regenerated. No render had text, letters, extra limbs, extra heads or modern objects beyond the two belt-buckle notes.

**Pipeline.** `process.mjs` ×12 (key residue 0 on all), `check.mjs` 12 PASS (exact size, painted opaque / cutout with alpha and no magenta, name). `preview.mjs ART-036` and `preview.mjs ART-055` gave **NOT ASSESSED** (manifest `preview: null`: no game slot loads `plate_*`, `chest_*` or `laurel_branch` yet, ASSET_LIST "not wired"), and `promote.mjs ART-036 --looked` / `ART-055 --looked` were **REFUSED** (no preview record). **Nothing promoted**; `public/` is untouched. All 12 are staged in `processed/` with status NOT ASSESSED.

**For CDX-01, RES-01 and the duel/chest story.**
- CodexScene and BeastTrialScene need `RASTERS` keys for the plates (lazy per scene, OI-4) and manifest `preview` entries; then run `preview.mjs` and `promote.mjs` on the files in `processed/` (copy them back to `docs/v5/art/staging/`; the sha must match). The plates read at 32 px (CDX-2); at 16 px they read as colour blobs, so CDX-2's 32 px thumbnail is needed.
- ChestSlot / DuelScene and ResultsScene (spoils, laurels) need the same. The laurel ships as the left branch; mirror it in code for the right (`setFlipX`). The closed chest is drawn larger than the open ones in the same frame; if the ChestSlot swaps states in place, anchor all three at the bottom and accept the size change, or scale the closed one to the open body width in code.
- Harpies: the plate shows three (readable); the game's flock is six.

### AS-04 Frescoes, settlement vignettes and the splash key art (2026-10-11)

**Scope.** The story row: the 5 frescoes (ART-001 to ART-005), the 6 settlement vignettes (ART-006 to ART-011) and the splash key art (ART-056). No new manifest rows. All subjects are scenes from ASSET_LIST; none shows UI or a feature the game lacks.

**Tool.** gemini.google.com, "Pro" mode, one new chat in a new tab, prompts typed as "Create an image…" / "Create a NEW image…" with no tool picker and no aspect picker. Every wide output is 3168x1344 JPEG (2.36:1); the splash is 1408x3040 (0.46:1). All are above their tiers, so nothing was upscaled; `fresco_campaign` is now 1080x480 from a 3168 px source (the old 1060x420 `banner_campaign.jpg` was below the tier). References were attached through the page's hidden image input (`file_upload`). No CAPTCHA, quota message or download block. Each download was moved by a script that takes only a `Gemini_Generated_Image_*` absent from a start listing and newer than the start time, refusing on anything but one match; at the end `~/Downloads` held no file that was not in the start listing. The tab was closed.

**Raws.** Per V5-049, gitignored, in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-04/` as `ART-0NN_<stem>_<n>.jpeg`. **Processed** (`process.mjs`, kind painted: cover at the anchor, one area downscale, opaque): `docs/v5/gemini/AS-04/processed/<file stem>.png`, 12 files, 11 MB, copies of the ignored `docs/v5/art/staging/`. **Contact sheet:** `docs/v5/art/AS-04-contact.jpg` (1136x840, 141 KB): the campaign fresco at 2.25:1 and at the 3.4:1 the slot crops to on narrow phones; war, ladder, arena and shop; each vignette full and at the 5.6:1 short-screen strip (centred, as `coverTexture` crops); the splash with the 320x568-of-390x844 safe area outlined.

**Family seeds.** Frescoes: `fresco_campaign` was made first from T-STYLE + T-FRESCO with the approved `bust_hoplite` (AS-02 seed, 1024 px) attached, so the frescoes share the busts' light and palette. Its accepted render #2 (1584 px JPEG) was then attached to every other fresco and to the splash. Vignettes: `vignette_town_greek` (from the fresco seed) was approved and attached to the other five.

**Seed prompt, #1 (bust_hoplite attached; T-STYLE + T-FRESCO, composition tightened to the 3.4:1 band):**

```
Create a NEW image, not an edit of the reference. The attached portrait is from the same mobile strategy game: match its painting style, palette, brushwork and lighting exactly, but this is a wide landscape scene, not a portrait. ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink. SUBJECT: a column of Greek hoplites marching along a sandy beach at dawn, seen from the side, bronze Corinthian helmets with red crests, red cloaks, round bronze shields, spears upright; two or three warships with oars drawn up on the beach behind them; low green hills in the distance; the early sun low on the left over a calm sea. COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the march runs along one band across the centre of the image; keep every head, crest, shield and spear tip inside the central horizontal band (from 30 to 70 percent of the height), so the image survives a crop to a strip 3.4 times wider than tall; calm pale dawn sky at the top and plain sand at the bottom; 5 to 7 figures, all fully inside the frame, none cut by the left or right edge. PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

**Fresco family prompt (seed #2 attached): F + SUBJECT + LIGHT + COMPOSITION + G.**

```
F: Create a NEW image, not an edit of the reference. Match the attached reference banner exactly in style, palette, brushwork, fine craquelure and full-bleed framing (no border); change only the subject, the light and the composition as stated. It is one of a matching set of wide banner paintings for a mobile strategy game set in the ancient Mediterranean, 4th century BC. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art.
G: EXCLUDE: any text, letters, numbers, runes, symbols on shields, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

COMPOSITION for the strips (ladder, arena 6:1; shop 7.8:1): "this banner will be cropped to a very thin strip six [almost eight] times wider than tall … every [figure, torch, the goods, the merchant's head] between 35 and 65 percent of the image height; plain sky above and plain ground below; nothing important at the far left or right edges".

**Vignette family prompt (vignette_town_greek attached):** "Create a NEW image, not an edit of the reference. Match the attached reference settlement view exactly in style, palette, brushwork, fine craquelure, full-bleed framing (no border), viewpoint, distance, warm afternoon light from the upper left and the same horizontal bands (sky in the top quarter, the settlement across the middle third, ground and path in the lower quarter); change only the settlement as stated. … SUBJECT: {below}; seen from a low hill at a slight distance, no people in the foreground; 3 to 5 readable landmarks. The village centred, nothing important at the left and right edges. EXCLUDE: any text, letters, numbers, runes, inscriptions, signs, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, {culture extras}, people in the foreground. ASPECT: landscape 21:9 or the widest available, highest resolution available." `vignette_town_greek` itself was T-STYLE + T-VIGNETTE with the fresco seed attached. Villages add "NOT a walled town … no fortifications, no towers, no gate" so a village never reads as a town.

| # | Raw | ART | SUBJECT / LIGHT as sent (short) | Verdict | Notes (crop = `process.mjs` anchor; checked at shipped size and at the slot's narrowest crop) |
| --- | --- | --- | --- | --- | --- |
| 1 | `ART-001_fresco_campaign_1.jpeg` | 001 | seed prompt above | **Rejected** | A carved wooden **frame painted round the picture**; a **lambda (Λ) on every shield** (a letter); the column runs off the right edge. |
| 2 | `ART-001_fresco_campaign_2.jpeg` | 001 | "same subject … fixing four problems": no frame, full-bleed; column of 6 centred; plain bronze shields, NO lambda; heads to spear tips between 30 and 70% | **Accepted as family seed**, not shipped | Fixed all three, but the group sits right of centre and the 6th man touches the right edge; in the game at 360 and 320 the 3.4:1 crop cut him. |
| 3 | `ART-001_fresco_campaign_3.jpeg` | 001 | EDIT of #2: "make the six hoplites about 25 percent smaller, move the whole column to the horizontal centre … more sky above … keep everything else identical" | **Accepted, PROMOTED** | Gemini dropped one man instead of shrinking (5 hoplites, within 3–7) and left sand on the right. `--ax 0.6`. In the menu slot: all 5 whole at 390; at 360 and 320 (3.4:1) heads, faces, shields and the ships inside, only the crest tips touch the frame. No text. |
| 4 | `ART-002_fresco_ladder_1.jpeg` | 002 | a broad stepped stone tower of five terraces like a low ziggurat, a torch on each terrace, four or five small Greek warriors climbing the central stair; torchlit dusk, violet-blue sky, orange torch pools | **Accepted** | At 6.1:1 the strip keeps terraces 2–4, four climbers and six torches; the top terrace is cut, the stair still reads as an ascent. Smoother stone than the seed (slightly more digital), craquelure and palette match. |
| 5 | `ART-003_fresco_arena_1.jpeg` | 003 | stone arena, crowd on the tiers, pennants; a Greek hoplite (red crest, red cloak, bronze shield) and a Celtic swordsman (iron helmet, checked green cloak, oval shield, long sword) face each other; torchlit dusk | **Accepted** | `--ay 0.44` keeps the hoplite's crest inside the 6.1:1 strip. Plain shields, plain pennants, no letters. The hoplite holds no spear (shield only): fine for "champions facing". |
| 6 | `ART-004_fresco_shop_1.jpeg` | 004 | agora stall under a long cream and terracotta striped awning; amphorae, bronze helmets, shields, spearheads, bowls; one bearded merchant; stoa columns; warm afternoon | **Accepted** | One shield on the ground carries a **lambda**, at 71–88% of the height: it lies **outside** the shipped 7.8:1 crop (`--ay 0.56`, rows 39–69%), checked on the staged file. The crop keeps the awning edge, the merchant's head, the helmets and the amphorae. |
| 7 | `ART-005_fresco_war_1.jpeg` | 005 | a walled Greek hill town with a temple in the centre; two rival camps on the plain, red banners left, dark blue banners right, plain cloth; grey smoke of camp fires; overcast, smoky, cooler light | **Accepted** | Plain banners, no emblems, no fighting. Edge tents are cut by the frame (background only). |
| 8 | `ART-006_vignette_town_greek_1.jpeg` | 006 | walled Hellenic town: whitewashed walls, gate, square towers, terracotta roofs, small Doric temple on the top, olives (fresco seed attached) | **Accepted (vignette seed)** | Two tiny figures at the gate, mid-ground (not foreground). The crenellations look a little medieval. At the 5.6:1 short-screen strip the wall, gate and roofs survive and the temple is cut (the template only promises the wall/roof line). |
| 9 | `ART-007_vignette_town_phoenician_1.jpeg` | 007 | walled Punic harbour town: ochre mudbrick walls and towers, flat-roofed ochre and white houses, date palms, round harbour with two ships under purple awnings; EXCLUDE adds domes, minarets | **Accepted** | Purple awnings and palms read in the strip. Same layout as #8 (the family). |
| 10 | `ART-008_vignette_town_celtic_1.jpeg` | 008 | Galatian hill town: palisade of sharpened logs with a wooden gate tower, round houses with conical thatch, roof smoke, oak woods; EXCLUDE adds stone castles | **Accepted** | |
| 11 | `ART-009_vignette_village_greek_1.jpeg` | 009 | small Hellenic farming village, NOT walled: about eight whitewashed farmhouses with terracotta roofs and courtyards, a tiny four-column Doric shrine, olives, a threshing floor, grain fields, dry-stone field walls | **Accepted** | Clearly a village, not the town. |
| 12 | `ART-010_vignette_village_phoenician_1.jpeg` | 010 | small Punic farming and fishing village, NOT walled: about seven flat-roofed ochre mudbrick houses on the shore, palms, irrigated gardens, a cove with two small boats under purple awnings | **Accepted** | |
| 13 | `ART-011_vignette_village_celtic_1.jpeg` | 011 | small Galatian village in a forest clearing, NOT a hill fort: five or six round thatched houses, smoke from one roof, a wattle cattle pen, a small grain field, a short partial stake fence, big oaks | **Accepted** | Two cattle in the pen. No towers. |
| 14 | `ART-056_splash_keyart_1.jpeg` | 056 | T-SPLASH via the fresco family prompt: a front rank of about seven hoplites with locked plain bronze shields and levelled spears, more ranks behind, beach at dawn, seen from low; beached warships; a white Doric temple on a headland; top third empty sky; key figures in the central 60% of the width; NO lambda | **Accepted** | Plain shields, no text, sky top third empty for the code-set logo. The phalanx runs off the right edge (the army continuing): the front-right hoplite is partly outside the 320x568 safe area, the front rank's other heads are inside. The image is 0.46:1, so a 390x844 phone shows all of it; only phones wider than 9:19.5 crop top and bottom. |

**Totals:** 14 renders, 12 accepted (one per asset), 2 regenerated for `fresco_campaign` (#1 rejected: painted frame and lambda lettering; #2 kept as the family seed, replaced in the slot by the edit #3). No extra limbs, modern objects, UI or invented features in any render.

**Pipeline.** `process.mjs` ×12, `check.mjs` 12 PASS (exact size, opaque, name). `preview.mjs` with a dev server on port 5347:
- **ART-001** on `menu`: layout check passed at 390x844, 360x780 and 320x640 (320x640: 5 known violations, 0 new). Sheet `docs/v5/art/staging/preview/ART-001/menu-sheet.png` (ignored) read at DPR 3: the slot is filled, sharp, the five hoplites and ships inside the frame at 390; at 360 and 320 the 3.4:1 crop keeps heads, faces and shields, crest tips touch the frame; no clash with the plaque, the CTA or the text; matches the hoplite portrait beside it (light from the left, same bronze and red). `promote.mjs ART-001 --looked` **shipped `public/ui/fresco_campaign.jpg`** (q82, 128 KB, `check --shipped` PASS, budget 160 KB).
- **ART-002 to ART-011 and ART-056: NOT ASSESSED** (exit 3, manifest `preview: null`, no slot loads them yet). Not promoted; staged in `processed/`.

**For HUB-02 and the wiring stories.**
- The game still loads `ui/banner_campaign.jpg` (`RASTERS.ui_banner_campaign`, MenuScene). The preview swapped the staged file into that request, so the check is real, but the shipped `fresco_campaign.jpg` is not loaded until HUB-02 points the key at it (and retires `banner_campaign.jpg`, a manifest `legacy` file).
- DuelScene (ladder, arena), ShopScene (shop), FirstRunScene (war card, splash), BootScene (splash) and SettlementScene (vignettes, by `kind` + `culture`) need their `RASTERS` keys and manifest `preview` entries; then `preview.mjs` and `promote.mjs` run on the files in `processed/` (copy them back to `docs/v5/art/staging/`; the sha must match the preview).
- Greek vignettes lose the temple on short screens (30 UI px tall); the wall, gate and roofs carry the culture there.

### AS-03 Icons: the 8 atlas icons (with the Codex book) and 15 v5 icons (2026-10-10)

**Scope.** The story row: the 8 `icons_ui` rows of ASSET_LIST (ART-044 to ART-051; ART-044 is the Codex book) and the v5 icons for features that have a GDD and a story: 5 doctrines (ai-doctrines.md R2, AI-01), 7 signature actives (abilities.md R3, AB-02), the Standard (abilities.md R5, AB-03), Works (field-works.md, FW-03) and the band captain's crest (ai-doctrines.md R6, AI-02). The 15 new rows are ART-057 to ART-071 in `asset-manifest.json` (ASSET_LIST regenerated by `list.mjs`, 71 assets). Frame keys: `ui:doctrine_<id>`, `ui:<ability id>` (push, bond, warcry, sunder, aimed, recharge, scythe), `ui:standard`, `ui:works`, `ui:captain`. Every subject was checked against the 109 frames already in `public/icons/ui.png` so none repeats an existing glyph (one meaning per icon, bible §7.4): the bull head (`power:momentum`), Gorgon (`power:terror`), roaring red face (`ui:berserk`), horn and trumpet (`ui:horn`, `ui:rally`), stake fence (`camp:palisade`) and sun disc (`power:retribution`) were avoided.

**Not in scope (follow-up, OI-3 / D-10).** The 101 legacy 64 px icons in `icons_ui` and the 189 in `icons_items` stay as they are. ANSWERS D-10 schedules their 160 px regeneration as a later batch; AS-03 does only the rows above.

**Tool.** gemini.google.com, "Pro" mode, one new chat in a new tab, prompts typed as "Create an image…" with no tool picker. To keep one family and spend fewer downloads, each prompt asked for a **2x2 grid of four icons** on flat #FF00FF; a scratch script (`tools.mjs split`, using `scripts/art/lib`) cut each grid into exact quadrants and checked that no opaque pixel touches a quadrant edge (0 on all 24 quadrants). Grid 1 is 1024x1024 (512 px quadrants), grids 2 to 6 are 2048x2048 (1024 px quadrants): all above the 160 px tier, so no upscale. No CAPTCHA, quota message or download block. Each download was moved by a script that takes only a `Gemini_Generated_Image_*` absent from a start listing and newer than the start time, refusing on anything but one match; `~/Downloads` matched its start listing at the end. The tab was closed.

**Raws.** Per V5-049, gitignored, in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-03/`: the six grids `gridN_<subjects>_1.jpeg` and the quadrants `ART-0NN_icon_<stem>_<n>.png`. **Processed** (`process.mjs`, kind icon: key #FF00FF tol 60, fringe 3, trim, contain at 0.88 of 160x160, centred): `docs/v5/gemini/AS-03/processed/icon_*.png`, 23 files, 804 KB, copies of the ignored `docs/v5/art/staging/`. **Contact sheet:** `docs/v5/art/AS-03-contact.jpg` (1140x528, 124 KB): each icon at 96 on parchment, 32 and 24 on parchment, 24 on `stone2`, 24 in greyscale.

**Seed.** Grid 1 (helmet, chest, tent, arena) was made from T-ICON with `public/icons/ui.png` (2x, JPEG) attached as the style reference, as Templates says. It was approved, and the grid-1 JPEG was attached to every later prompt.

**Prompt, grid 1 (T-ICON adapted to a grid):**

```
Create an image. The attached sheet is the existing icon set of my mobile strategy game; the new icons must match it exactly in style. ROLE: four game icons for a mobile strategy game menu, one of a set; each must read at 24 pixels. LAYOUT: a 2x2 grid of four separate icons, one centred in each quarter of the square image, each filling about 80 percent of its quarter, with a wide empty gap between them; no icon touches or overlaps another or the image edge. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the objects. EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind an object, grid lines, more than one object per quarter. ASPECT: square 1:1, highest resolution available.
```

**Family prompt, grids 2 to 6 (seed attached):**

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style: the same heavy dark-brown outline (#2a1a12) of even weight, the same soft painted shading, light from the upper left, slightly chunky proportions, three-quarter view, warm materials (bronze #b08a3a, wood, cloth, stone), the same perfectly flat solid #FF00FF magenta background edge to edge, and the same 2x2 layout: one icon centred in each quarter, each filling about 80 percent of its quarter, wide empty gaps, nothing touching another icon or the image edge. ROLE: four more game icons for the same set{ROLE EXTRA}; each must read at 24 pixels. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. EXCLUDE: text, letters, numbers, a frame, a badge, a disc or a circle behind an object, grid lines, shadows or glow on the background, more than one object per quarter{, blood}{, modern tools}; no magenta inside the objects. ASPECT: square 1:1, highest resolution available.
```

ROLE EXTRA: grid 3 ", emblems of four enemy battle styles"; grid 5 "ability icons … (special moves of ancient soldiers)"; grid 6 "(ancient Mediterranean, 4th century BC)".

| # | Grid raw | Quadrant | ART | SUBJECT as sent | Verdict | Notes (seen at 160, 32 and 24 px) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `grid1_helmet_chest_tent_arena_1.jpeg` | TL | 049 `ui:helmet` | a bronze Corinthian helmet with a tall red horsehair crest | **Accepted (seed)** | Crest and cheek guards read at 24. |
| 2 | grid 1 | TR | 050 `ui:chest` | a closed wooden chest with bronze bands | **Accepted** | |
| 3 | grid 1 | BL | 051 `ui:tent` | a canvas army tent with a small pennant on its pole | **Accepted** | |
| 4 | grid 1 | BR | 048 `ui:arena` | a round stone arena seen from outside, tiers of arches, two small pennants on top | **Accepted** | Two rows of arches clear at 24. |
| 5 | `grid2_book_banner_war_season_1.jpeg` | TL | 044 `ui:book` | a closed thick leather-bound book (a codex), dark red-brown leather cover, bronze corner caps and a bronze clasp | **Accepted** | A book, not a paw (MENU-3). |
| 6 | grid 2 | TR | 045 `ui:banner` | a red cloth war banner hanging from a short crossbar on a wooden pole, a round bronze disc on top of the pole | **Accepted** | Distinct from `ui:flag` (a flag on a staff) by the crossbar and disc. |
| 7 | grid 2 | BL | 046 `ui:war` | two crossed spears behind a crested Corinthian helmet, all in one engraved bronze relief, monochrome bronze, no red | **Accepted** | All bronze, so it stays apart from the red-crested `ui:helmet` (MENU-2). |
| 8 | grid 2 | BR | 047 `ui:season` | an hourglass with a bronze frame and golden sand, wreathed by a green laurel wreath | **Accepted** | The wreath tells it from the plain `ui:hourglass`. |
| 9 | `grid3_steady_rush_hammer_swarm_1.jpeg` | TL | 057 `ui:doctrine_steady` | a tortoise with a high domed shell plated like bronze scales, walking steadily, head forward | **Accepted** | Slow, holds: the testudo image. |
| 10 | grid 3 | TR | 058 `ui:doctrine_rush` | a ram's head with heavy curled horns, lowered as if to butt | **Accepted** | Not the bull of `power:momentum`. |
| 11 | grid 3 | BL | 059 `ui:doctrine_hammer` | a heavy war hammer with a long wooden haft, a leather-wrapped grip and a blunt bronze head with a spike on the back, shown diagonally | **Accepted** | The thinnest silhouette of the set (103 opaque px at 24); still a hammer at 24 on parchment. |
| 12 | grid 3 | BR | 060 `ui:doctrine_swarm` | a single large striped hornet in amber and dark brown with spread translucent wings and a visible sting | **Accepted** | Translucent wings keyed clean (residue 0, no pink cast). |
| 13 | `grid4_fury_standard_works_captain_1.jpeg` | TL | 061 `ui:doctrine_fury` | a roaring lion's head, mouth wide open with fangs, a wild mane of flame-like red and gold locks | **Accepted** | |
| 14 | grid 4 | TR | 069 `ui:standard` | an ancient army standard: a vertical wooden pole with a short bronze crossbar near the top, topped by a large bronze sixteen-ray sunburst disc, two short purple ribbons, NO cloth flag | **Accepted** | No cloth, so it does not repeat the Campaign banner. Purple ribbons survived the key. |
| 15 | grid 4 | BL | 070 `ui:works` | an iron-shod wooden digging spade crossed in an X with a sharpened wooden stake | **Rejected** | The spade has a modern D-grip and steel shaft (bible: no modern objects). |
| 16 | grid 4 | BR | 071 `ui:captain` | a tall curved transverse horsehair helmet crest, bright red, on its curved bronze crest holder, the crest alone with NO helmet | **Accepted** | Reads as a red crest hook at 24; no helmet, so not `ui:helmet`. |
| 17 | `grid5_push_bond_warcry_sunder_1.jpeg` | TL | 062 `ui:push` | the iron heads of two long pikes held level side by side, driving into the bronze rim of a round enemy shield that tilts backwards | **Accepted** | Three pikes instead of two, plus small dark impact strokes. The shield and level pikes read at 24 on parchment; the dark shafts fade on stone. |
| 18 | grid 5 | TR | 063 `ui:bond` | two muscular forearms in bronze bracers, hands firmly clasped at the wrist | **Accepted** | |
| 19 | grid 5 | BL | 064 `ui:warcry` | the head of a bearded Celtic warrior in side profile with pale limed spiky hair, mouth wide open shouting, three curved bronze sound strokes | **Accepted** | A profile with limed hair and sound arcs, unlike the red front face of `ui:berserk`. |
| 20 | grid 5 | BR | 065 `ui:sunder` | a long inward-curved iron falx blade with a wooden grip, splitting a round wooden shield that cracks in two | **Accepted** | The blade reads more like a curved sword than a falx; the split shield carries the meaning. A few splinters float free, inside the trim box. No blood. |
| 21 | `grid6_aimed_recharge_scythe_works_1.jpeg` | TL | 066 `ui:aimed` | a short recurved composite bow drawn taut, with three arrows nocked together on the string, pointing to the upper right | **Accepted** | The string is drawn loosely, not on the arrows' nocks; bow plus three arrows is clear at 24 on parchment. Thin on stone. |
| 22 | grid 6 | TR | 067 `ui:recharge` | the head and neck of a brown war horse with a bronze forehead plate, turning sharply, encircled by a thick curved bronze U-turn arrow | **Accepted** | |
| 23 | grid 6 | BL | 068 `ui:scythe` | a spoked wooden chariot wheel with a bronze rim and a long curved iron scythe blade sticking out from its hub | **Accepted** | |
| 24 | grid 6 | BR | 070 `ui:works` | a simple ancient wooden spade with a plain straight wooden handle (no D-grip, no metal handle) and a flat iron-edged blade, crossed in an X with a sharpened wooden stake | **Accepted** | T-grip wooden spade, historically fine. |

**Totals:** 6 renders (24 quadrants), 23 accepted, 1 rejected and regenerated (works: a modern D-grip spade). No text, letters, extra objects or reserved glyphs in any render.

**Pipeline.** `process.mjs` ×23, `check.mjs` 23 PASS (160x160, alpha, no magenta residue, not touching top/bottom, name). `atlas.mjs icons_ui`: 128 frames (4 replaced, 19 added), 2044x586, in `docs/v5/art/staging/atlas/` (ignored). `preview.mjs` with a dev server on port 5291:
- ART-049, ART-050, ART-051 on `menu`: layout clean at 390, 360 and 320; the sheet shows the new helmet, chest and tent sharp in the Army, Stash and Camp tiles (Camp greyed by its disabled state, as the chrome intends).
- ART-048 on `duel-ranked` and `duel-searching`: clean; the arena is sharp in the Arena tab, the Live PvP header and the search well.
- ART-044 to ART-047 and ART-057 to ART-071: **NOT ASSESSED** (exit 3, `preview: null`, no slot loads them yet).

`promote.mjs --atlas icons_ui --looked` was **REFUSED** ("ART-044 has no preview record"): an atlas ships whole, and 19 of its members have no wired slot. **Nothing was promoted; `public/` is untouched.** F-04 wires the frames (book, banner, war, season and the v5 keys), then previews and promotes the atlas from these exact staged files (`processed/` holds the copies).

**Legibility at 24 px (AC 1).** `contrast.mjs` checks palette pairs, not icons, so a scratch measure was run: the share of each icon's opaque pixels at 24 px that reach 3:1 against the background.
- On `parch`: 50–98% (lowest warcry 50%, bond 61%, tent 63%; most 80–98%). Every icon is readable there; checked by eye on the contact sheet.
- On `stone2`: 2–53%. The family's #2a1a12 outline is about 1.2:1 against #342d25, so the dark-outlined painted style (the same as the 101 legacy icons) does not separate from dark stone on its own. **Finding for F-04 / the UI stories:** where an icon sits on stone (top bar, tab bar, medallions), the chrome must give it a light ground (a parchment well, as the hub tiles and tabs already do, or a cream ring as badges have). Repainting the icons lighter would break the family.

**For the art-director / F-04.**
- Story text says processed icons go to `public/art/v5/**`, and F-04 AC 1 builds the atlas "from `public/art/v5/icons`". The pipeline (D-9) forbids anything in `public/` before a preview of a wired slot, so the 23 are in `docs/v5/gemini/AS-03/processed/` instead. F-04 should either read from there or move them into `public/art/v5/icons/` as part of wiring.
- `ui:doctrine_hammer` and `ui:aimed` are the thinnest shapes; if they read poorly in their real slots, regenerate them heavier.

### AS-02 Class busts, all 21 (2026-10-10, in two runs)

**Tool.** gemini.google.com, model "Gemini 3.1 Pro", in one chat. Each prompt was typed as "Create an image…" with no tool picker. Every output is a 2048x2048 JPEG.

**Raws.** Per V5-049 the raws are not in this branch. They are in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-02/`, which is gitignored and never deleted. They were briefly committed here, then removed with `git rm --cached`. **Processed** (`process.mjs`, kind painted, cover at anchor 0.5/0.25, area downscale to 288x288, opaque): `docs/v5/gemini/AS-02/processed/bust_<class>.png`, 21 files, 3.3 MB (12 from run 1, 9 from run 2 below). These are copies of `docs/v5/art/staging/`, which is ignored. **Contact sheet:** `docs/v5/art/AS-02-contact.jpg` (138 KB, all 21, regenerated in run 2). It shows each bust at 192, 40 and 21 px beside the game's own sprite from `preview.html`.

**Family seed.** Following the ASSET_LOG Templates, `bust_hoplite` was made first from T-STYLE + T-BUST. The prompt added "It shows a CLASS of soldier (a type), not a named hero" (V5-045) and "eyes looking toward the viewer's left". It was approved, and a 1024 px copy was then attached to **every** later prompt as the style reference.

**Family prompt (F + SUBJECT + G).** It is T-STYLE + T-BUST in condensed form, with the reference sentence from Templates added:

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject. It is one of a matching set of soldier-CLASS portraits for a mobile strategy game (a type of soldier, not a named hero). STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Hand-painted illustration, not a photo, not a 3D render. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, borders or frames, modern objects, extra limbs, duplicated figures, cropped heads. SUBJECT: {SUBJECT}. FRAMING (same as the reference): head and shoulders, front three-quarter view, turned slightly to the viewer's left, eyes on the upper third of the image, the top of the headgear or hair 6 to 10 percent below the top edge, shoulders cut by the bottom edge, the whole face and headgear inside the central circle; the headgear silhouette and the one listed prop are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber with a soft lighter glow behind the head, no scenery. EXPRESSION: composed, alert, mouth closed, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

**Subjects follow the game kit (`src/data/classes.ts`) where the art bible §5.2 or the manifest disagree** (story AC 1: "matches its class kit in the game sprite"). Each was checked against the class's sprite in `preview.html?s=6`. Deviations from the bible's table:
- **thureophoros:** the kit has pilos/montefortino, not Boeotian. Painted as a conical bronze pilos, which is also distinct from the Celt's Montefortino.
- **sacred_band:** the kit and sprite show a Corinthian helmet with a black crest, a blue cloak and a blue aspis with a gold club, not a Boeotian helmet.
- **royal_guard:** the kit is an Attic helmet and the sprite has a red crest. The bible's white plumes are kept as an extra.
- **thessalian:** the kit is a Boeotian helmet. The bible's petasos is kept: the brim reads the same and it stays distinct from the Companion.

These last three are queued, not made. The bible's "no two classes share a headgear silhouette" rule cannot fully hold for hoplite and sacred_band, which are both Corinthian in the kit. The plan is to tell them apart by crest colour and cloak (red and red, against black and blue). The art-director should decide whether §5.2 follows the kit.

| # | ART | Raw (v5 worktree) | SUBJECT | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 013 | `ART-013_bust_hoplite_1.jpg` | T-STYLE + T-BUST: a Spartan hoplite, bronze Corinthian helmet with a tall red transverse horsehair crest, red cloak, the bronze rim of a round aspis shield at the shoulder | **Accepted (seed)** | The crest is drawn front-to-back rather than transverse, but it reads red at 21 px. Its top is about 5% below the edge, so it is not cropped. No text or extra limbs. |
| 2 | 012 | `ART-012_bust_militia_1.jpg` | a Greek levy militiaman, a farmer-soldier: a brown felt cap (pilos), plain undyed ochre wool tunic, no armour, a short wooden spear with an iron head held upright at his shoulder | **Accepted** | |
| 3 | 014 | `ART-014_bust_thureophoros_1.jpg` | a Hellenistic thureophoros: plain conical bronze pilos helmet with no crest, dark hair, blue-grey linen tunic, the upper edge of a tall OVAL thureos shield, cream with a red pattern and a vertical spine | **Accepted** | Matches the sprite: blue tunic, cream shield with red pattern. |
| 4 | 015 | `ART-015_bust_celt_sword_1.jpg` | a Celtic swordsman: iron Montefortino helmet with a top knob and cheek guards, long drooping moustache, bronze torc, green checked cloak over mail, hilt and upper blade of a long sword | **Accepted** | The helmet has a small nasal, which is not historical. The checked cloak matches the sprite's `checkGreen`. |
| 5 | 016 | `ART-016_bust_rhomphaia_1.jpg` | a Thracian rhomphaia warrior: tall bronze Phrygian-style helmet curving forward, cheek guards, brown fox-fur cloak, ochre tunic, the long curved blade of a two-handed rhomphaia over the shoulder; no shield | **Accepted** | |
| 6 | 017 | `ART-017_bust_archer_1.jpg` | a Cretan archer: bare head, short dark curly hair, cream linen tunic, leather quiver strap, fletchings and the bow tip above the shoulder | **Accepted** | |
| 7 | 018 | `ART-018_bust_slinger_1.jpg` | a Rhodian slinger: bare head, short straight brown hair, short beard, white tunic, pouch of stones on a strap, a braided sling wound round his raised wrist | **Accepted** | One raised hand, anatomically correct. |
| 8 | 019 | `ART-019_bust_javelineer_1.jpg` | a Thracian javelineer: grey wolfskin cap (alopekis) with the animal's ears, light green tunic, exactly two javelins over the shoulder | **Accepted** | The kit's `wolfskin_cap`. The full wolf head is a strong silhouette, and the human face keeps it apart from `bust_wolf`. |
| 9 | 020 | `ART-020_bust_horse_archer_1.jpg` | a Scythian horse archer: tall pointed felt hood with ear flaps tied under the chin, red embroidered kaftan, gorytos bow case with a short recurved bow | **Accepted** | Red matches the sprite tunic. |
| 10 | 021 | `ART-021_bust_peltast_1.jpg` | a Thracian peltast: open-faced bronze Thracian helmet, forward-curving crown, short peak, cheek guards, brown cloak, crescent wicker pelte | **Rejected** | Its helmet silhouette is the same tall forward-curled crown as the rhomphaia (#5), which breaks bible §3 "no two classes share a headgear silhouette". |
| 11 | 021 | `ART-021_bust_peltast_2.jpg` | as #10 but: a LOW, ROUNDED open-faced bronze helmet hugging the skull, short brim-like peak, long cheek guards; NO tall crown, NO curving tip, NO crest; the crescent pelte is the main prop | **Accepted** | Distinct from the rhomphaia. The two horns of the pelte read clearly. |
| 12 | 022 | `ART-022_bust_falx_1.jpg` | a Thracian falx warrior: bare head, long dark hair, full beard, brown wool cloak over a red tunic, the inward-curved blade of a two-handed falx over his shoulder | **Accepted** | |
| 13 | 023 | `ART-023_bust_gallic_1.jpg` | a Gallic warband warrior: limed pale spiky hair, long moustache, bare chest with blue woad swirls, bronze torc, the upper edge of a long oval shield with an iron boss | **Accepted** | |
| 14 | 024 | (not saved) | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised; expression: intense, mouth closed (the bible's one grimace exception); EXCLUDE adds blood | **Looked right, not saved** | Seen in the chat: bald, ash-grey, knife raised, black cloak, no text. Download blocked (below). Remade in run 2 (#15). |

**Totals:** 14 renders, 12 accepted, 1 rejected and regenerated (peltast: a headgear silhouette clash), and 1 not saved (fanatic). No render had text, extra limbs or modern objects. Faces share one "family" look because every render had the seed attached, and that is intended.

**Pipeline.** `process.mjs` and then `check.mjs` gave PASS ×12: 288x288, opaque, name. `preview.mjs ART-013` gave **NOT ASSESSED** (exit 3): manifest `preview` is null, because no game slot loads `bust_*` yet (ASSET_LIST "not wired", OI-6). `promote.mjs ART-013 --looked` was **REFUSED** (no preview record). So **nothing was promoted**, and `public/` is untouched. All 12 are staged in `processed/` with status **NOT ASSESSED** until a UI story (HUB-02, ARM-01, HERO-01, or the recruit/Codex screens) wires `RASTERS` keys and the per-scene lazy load (OI-4). Then `preview.mjs` and `promote.mjs` can be run on these exact files.

**Side-by-side with the sprite.** Sprites roll their gear per hero: the preview militia, for example, has no cap and carries a thureos. Each bust shows the kit's signature item instead (the tier-1 or tier-2 headgear and the class weapon), and none shows gear outside the kit.

**Limit hit.** After the 14th render, Gemini's "Download full size image" fetched the image (network 200) but no file reached `~/Downloads`. It failed three times, by script click and by real click. This looks like Chrome's per-site "automatic multiple downloads" block. Changing it is a browser setting, so it was left alone, and two workarounds were denied by the permission system: a localhost receiver, and a second tab to inspect. Following the brief, Gemini use stopped there. No CAPTCHA or quota message appeared. To resume, the owner allows multiple downloads for gemini.google.com in Chrome, then the 9 in the Queue are run.

**Housekeeping.** An earlier version of the helper script moved an older, unrelated Gemini file (an icon sheet from 2026-10-09) out of `~/Downloads` by mistake. It was put back as `~/Downloads/Gemini_Generated_Image_restored-from-oct09.jpg`.

#### Run 2: the remaining 9 (2026-10-10, after the owner allowed multiple downloads for gemini.google.com)

**Tool.** Same as run 1: gemini.google.com, "Pro" mode, one new chat in a new tab, no tool picker, the same 1024 px `seed_hoplite.jpg` attached to **every** prompt through the page's hidden image input. Every output is a 2048x2048 JPEG. No CAPTCHA, quota message or download block: all 9 downloads arrived. Each new file in `~/Downloads` was moved by a script that takes only a `Gemini_Generated_Image_*` file absent from a listing made at the run's start and newer than the start time, and refuses if more than one matches; `~/Downloads` matched its start listing at the end. The tab was closed.

**Prompts.** Soldiers: the family prompt above, word for word, with {SUBJECT} from the table (fanatic: EXCLUDE adds "blood" and EXPRESSION is "intense, mouth closed"; chariot: EXCLUDE adds "horses, wheels"; sacred_band: EXCLUDE adds "anything red"). Beasts: there is no beast-plate style for busts in the art bible (T-PLATE is for myth plates), so they use T-BUST-BEAST merged into the same family prompt:

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting and background; change the subject to an animal. It is one of a matching set of unit portraits for a mobile strategy game; this one shows a wild animal that fights as a unit (a type of animal, no human). STYLE: [as the family prompt]. EXCLUDE: any text, letters, numbers, signatures, watermarks, logos, borders or frames, people, collars, harness, armour, modern objects, extra legs, two heads, duplicated animals, cropped ears{, or tusks}, blood. SUBJECT: {SUBJECT}. FRAMING: head and shoulders, three-quarter view turned toward the viewer's left, the head filling the upper two thirds of the image, the tips of the ears 6 to 10 percent below the top edge and fully inside the frame, shoulders cut by the bottom edge, the head inside the central circle; the head silhouette {and the tusks / the open mouth} are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber as the reference with a soft lighter glow behind the head, no scenery. EXPRESSION: {alert, watchful / alert, stubborn / menacing}, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

**Kit decisions (V5-050: the kit wins where the bible's table disagrees).**
- **companion:** the kit's Boeotian helmet, drawn as bronze with a domed crown and wide brim; purple cloak with an ochre border (`cloakPurple`), xyston.
- **thessalian:** the kit also says Boeotian, which would give the companion's silhouette. Following ASSET_LIST ("petasos hat over a bronze helmet") it is a cream **felt** petasos with a very flat, very wide brim and a low crown, so it differs from the companion in material, colour and shape; blue cloak (`cloakBlue`), two javelins.
- **chariot:** the kit's `persian_tiara`, asked for low, soft and cream so it does not repeat the horse archer's tall red pointed hood; scale armour, red tunic, reins.
- **royal_guard:** the kit's Attic helmet, gilded, with the sprite's red crest and the bible's white plumes; the argyraspis is the silver shield; purple cloak.
- **sacred_band:** per V5-050, the kit's Corinthian helmet, told apart from the hoplite by a black crest, a dark blue cloak and a blue shield with a gold Theban club.

| # | ART | Raw (v5 worktree) | SUBJECT | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| 15 | 024 | `ART-024_bust_fanatic_1.jpg` | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised | **Accepted** | Bald, ash-grey scalp, knife in a raised fist, torn white tunic, black cloak (kit `tunicWhite` + `cloakBlack`). Hand anatomy correct. A few small brown stains on the tunic read as dirt, not blood. |
| 16 | 025 | `ART-025_bust_companion_1.jpg` | a Macedonian Companion cavalryman: bronze Boeotian helmet (an open face, a wide flaring brim all round like a hat, no crest, no plume), short dark beard, a deep purple cloak with a broad ochre-gold border pinned at the shoulder over a bronze muscled cuirass, the long wooden shaft and iron head of a cavalry lance (xyston) held upright beside his shoulder; no shield | **Accepted** | Brim and lance are the two clearest shapes. No hand on the lance, which is fine at 40 px. |
| 17 | 026 | `ART-026_bust_thessalian_1.jpg` | a Thessalian light horseman: a pale cream FELT petasos sun hat with a very FLAT, very WIDE round brim and a LOW shallow crown, tied with a cord under the chin (cloth, not metal), young clean-shaven face, a short Egyptian-blue chlamys cloak pinned at the shoulder over a white tunic, exactly two light javelins held upright beside his shoulder | **Accepted** | Exactly two javelins. The brim reaches about 13% from each side edge, still inside the frame. Distinct from the companion at 21 px (cream against bronze, blue against purple). |
| 18 | 027 | `ART-027_bust_chariot_1.jpg` | a Persian-style scythed-chariot driver: a soft cream-and-ochre felt Persian tiara cap, LOW and ROUNDED, its top bending forward, with a cloth band round the brow and long side flaps hanging loose at the cheeks (NOT tall, NOT pointed, NOT tied under the chin), black curled beard, red tunic under a shirt of overlapping bronze SCALE armour, one raised fist gripping the leather reins, the reins running out of the frame | **Accepted** | The cap came out taller than asked, but it is cream, soft and folded forward, so it doesn't read as the horse archer's red hood. Top about 4% below the edge, not cropped. Scale armour and reins clear. No horses or wheels. |
| 19 | 028 | `ART-028_bust_royal_guard_1.jpg` | a Macedonian royal guardsman (a silver-shield man): a GILDED Attic helmet with the face open, a short brow peak, hinged cheek pieces, a low red horsehair crest running front to back and two upright white feather plumes, one at each side of the helmet; short grey-flecked beard; bronze muscled cuirass, a purple cloak; the polished SILVER rim and face of a round shield at his shoulder, the brightest cool shape in the image | **Accepted** | The helmet has a small nasal guard, which an Attic helmet shouldn't have, but the face is open and the two white plumes plus the silver shield make it unmistakable. Plume tips about 4% below the top edge. |
| 20 | 029 | `ART-029_bust_sacred_band_1.jpg` | a Theban Sacred Band hoplite: the same kind of bronze Corinthian helmet as the reference but with a tall DARK charcoal-black horsehair crest; a dark Egyptian-blue cloak, white linen corselet; at his shoulder the round bronze-rimmed shield, its face painted dark blue with one large golden Herakles CLUB emblem (a single knobbly wooden club, drawn as a picture, not a letter), the club clearly visible. NO red anywhere | **Accepted** | Meets V5-050: black crest, dark blue cloak, blue shield with a large gold club, no red. Side by side with the hoplite, it reads differently at 21 px. |
| 21 | 030 | `ART-030_bust_wolf_1.jpg` | a grey wolf: grey and tawny fur with a pale muzzle and throat, ears pricked up, amber eyes, mouth closed | **Accepted** | Ears inside the frame. Warmer (more tawny) than the sprite's grey, but within the subject. Easy to tell from the javelineer's wolfskin cap, because that bust has a human face. |
| 22 | 031 | `ART-031_bust_boar_1.jpg` | a wild boar: dark brown-grey coarse coat, a bristling dark mane standing up along the neck and back, small dark eye, long snout, two curved pale ivory tusks curling up from the lower jaw, clearly visible | **Accepted** | Two tusks (the far one at the snout tip). The mane silhouette is strong. |
| 23 | 032 | `ART-032_bust_bear_1.jpg` | a huge brown bear: thick reddish-brown fur, a heavy brow ridge, small round ears, mouth open in a low roar showing teeth and fangs, a massive hump of shoulder | **Accepted** | Open mouth as in ASSET_LIST. Jaw and ears inside the frame. Beasts are exempt from the "mouth closed" rule (§5.4 covers soldiers). |

**Run 2 totals:** 9 renders, 9 accepted on the first try, 0 regenerated. No render had text, extra limbs or modern objects. **All AS-02 busts:** 23 renders, 21 accepted, 1 rejected (peltast #10), 1 not saved (fanatic #14, remade as #15).

**Run 2 pipeline.** `process.mjs ART-024 … ART-032` (kind painted, 288x288, opaque, key residue 0), then `check.mjs` gave 9 PASS. `preview.mjs ART-024` gave **NOT ASSESSED** (exit 3, no game slot loads `bust_*`), and `promote.mjs ART-024 --looked` was **REFUSED** (no preview record). **Nothing promoted**, and `public/` is untouched. The 9 are copied into `processed/` with status NOT ASSESSED, like the first 12.

**Contact sheet.** `docs/v5/art/AS-02-contact.jpg` was regenerated with all 21 (1400x1443, JPEG q30, 138 KB) from the same HTML layout and the same `preview.html` sprite crops. Looking at the whole sheet, the 9 new busts match the first 12 in background, glow, light direction and framing. They are slightly smoother and less craquelured than the seed, which is acceptable at 21 to 46 px.

**For the art-director.** §5.2 of the art bible still lists thessalian as "petasos hat", sacred_band as "Boeotian helm" and royal_guard as "gilded Thracian helm". The busts follow V5-050 and the kit instead (thessalian: petasos over the kit's Boeotian, which keeps it apart from the companion). The table should be updated in the next art story, as V5-050 says.

**Promoted by ARM-01 (2026-10-11): 4 of 21.** The Army screen wires the bust slot (the class medallion in the hero card's niche, `src/ui/army/busts.ts`, V5-045: a class bust where a class is shown). Only the classes the layout-check fixtures show were checked in the game: ART-013 hoplite (`army`, `army-stash`), ART-012 militia (`army-wounded`), ART-018 slinger (`army-full`), ART-021 peltast (`army-pick`). `preview.mjs` PREVIEWED each (layout exit 0 at 390x844, 360x780, 320x640; DPR 3 sheets read: slot filled, no blur, heads whole, family match), `promote.mjs --looked` shipped them to `public/ui/busts/` (JPEG q82, 21-23 KB), `check.mjs --shipped` PASS. The other 17 stay staged until a screen shows their class.


### AS-01 Hub mockup directions A, B, C (2026-10-10)

Mockups only: they are design references, not game assets, so they have no ART id, no manifest row and nothing goes to `public/`. Raws are kept untouched in `docs/v5/gemini/AS-01/` (in git as provenance, per ASSET_PIPELINE "Where files go"). Previews (420 px wide, JPEG q70, 88–109 KB) are in `docs/v5/ux/hub-mockups/`. The recommendation is in `docs/v5/ux/HUB_PICK.md`.

**Tool and settings.** gemini.google.com, model "Gemini 3.1 Pro", tool *Create image*, aspect **9:16** (the tallest the picker offers; 9:19.5 is not available). Every output is 1536x2752 JPEG. Every Campaign/Codex prompt had `docs/redesign/reference/A1-campaign-hub.jpg` attached as the style reference. No limit, CAPTCHA or consent dialog was hit.

**Shared style block (S), sent at the top of every first prompt in a chat.** HUB_DIRECTIONS' block, re-checked against the art bible (its TODO): parchment hexes changed to `parch` #e7d6ad / `parchHi` #f0e3c2 / `parchLo` #dcc394, page #16120f, teal #1f4f52, tab bar #16333a, terra #a8432c, bronze #7d5b30; Cinzel ALL CAPS only (§7.2); a colour-jobs sentence (§4.2); "illustrations never behind text" (§3); "no screen title heading" (the reference has a "CAMPAIGN HUB" heading that is not in the allowlist).

```
Mobile game screen mockup, tall portrait phone screen 390x844 (9:19.5), in the exact style of the attached reference image: traditional antiquity, mosaic and parchment. Dark warm basalt page (#16120f); a dark carved-stone frame with a gold-ochre Greek-key (meander) border and small round rosettes at the four corners framing the content; warm cream parchment panels (#e7d6ad, selected #f0e3c2, shaded #dcc394) with subtle fibres and a thin dark-brown inked edge; dark ink text (#3a2414). Titles, plaques, buttons and tab labels in Cinzel bold ALL CAPS; body text and every number in Inter medium, sentence case. Top bar: a dark stone strip with a centred glazed teal plaque (#1f4f52) with a gold rim. Bottom tab bar: dark teal-stone (#16333a) with a gold top rim, five slots with an engraved icon and a Cinzel label: CAMPAIGN (banner icon), DUELS (crossed swords), WAR (centre: a big round bronze shield medallion with an engraved crossed-spears glyph, rising above the bar, its WAR label inside the bar), CODEX (closed book), SHOP (market stall). The selected tab is a parchment block. Colour jobs: terracotta (#a8432c) only for the single primary button; aged bronze (#7d5b30) for other live controls; flat grey stone only for the disabled Camp tile; red only for the small count badge (with a cream ring). Painted illustrations sit inside frames, never behind text. Text large and crisp enough to read on a phone; buttons at least 44 px tall. Spell every string exactly as given and show no other text: no screen title heading under the top bar, no watermark.
```

The screen part of each prompt is HUB_DIRECTIONS' prompt for that screen, word for word, with these additions: "nothing on the left" of the top bar; "directly under it, with no heading"; a closing "Nothing else on the screen: no quests, no mail, no energy, no level bar, no gems, no extra buttons"; B1 and C1 add "No fresco of soldiers on this screen (the map / company scroll replaces it)"; B1 adds "no other lettering on the map". The Codex prompts drop the last rows that would not fit (A: 5 of 8 beasts; C: 6 of 8) and add "No fresco, no profile card, no buttons, no search bar, no Units or Lore section". B-Codex and C-Codex were sent in the A-Codex chat as "a NEW, separate image (not an edit): the same Codex hub in exactly the same style…".

**Renders** (every one compared to its allowlist tile by tile: top bar, profile, first steps, slot, CTA, three tiles, caption, tab bar, and nothing extra)

| # | Raw file | Prompt | Verdict | Tile-by-tile notes |
| --- | --- | --- | --- | --- |
| 1 | `docs/v5/gemini/AS-01/hub_A_campaign_1.jpg` | S + A1 | **Accepted** | Every allowlisted element present, nothing extra. Text exact and readable. Deviations (not invented, logged for the build): "First Steps (2 of 4)" in mixed-case Cinzel (bible §7.2 says caps only); Army badge is a red square without the cream ring. |
| 2 | `docs/v5/gemini/AS-01/hub_B_campaign_1.jpg` | S + B1 | **Accepted** | Strip, first steps, map (Rhegion, red banner, dotted route into fog, cartouche with the status line), CTA, tiles, tab bar. Nothing extra. Deviations: strip bust has no red crest; WAR label drawn on the medallion, not in the bar; same caps/badge notes as #1. |
| 3 | `docs/v5/gemini/AS-01/hub_C_campaign_1.jpg` | S + C1 | **Rejected** | No invented feature, but the "+4" was drawn as a badge **on Nikias's portrait**, so it reads as "Nikias +4" (a level or count that does not exist). Strategos bust lost its crest. Regenerated as an edit (#4). |
| 4 | `docs/v5/gemini/AS-01/hub_C_campaign_2.jpg` | edit of #3: "Change only: the "+4" … its own small round bronze disc … after Nikias; portraits slightly smaller; give the strategos bust a red horsehair crest" | **Accepted** | "+4" is now its own disc; crest back; everything else unchanged. Note: the disc touches the scroll's right roller even at 390 (a 320 warning, see HUB_PICK). |
| 5 | `docs/v5/gemini/AS-01/hub_A_codex_1.jpg` | S + A2 (5 beasts) | **Accepted** | Plaque CODEX, gear, Beasts ✓ \| Doctrines, 5 rows with the exact `myth.*.hint1` lines and levels, a 6th row cut by the frame (scrolling), CODEX tab selected. Nothing extra. Note: Harpies drawn as one harpy (the hint says a flock of six). |
| 6 | `docs/v5/gemini/AS-01/hub_B_codex_1.jpg` | B2 in the same chat | **Rejected** | Both doctrine icons reuse the **War medallion's crossed-spears glyph** (bible §7.4: one meaning per icon, the glyph is reserved for War). Locked rows not faded. Regenerated as an edit (#7). |
| 7 | `docs/v5/gemini/AS-01/hub_B_codex_2.jpg` | edit of #6: Steady = shield-wall icon, Rush = spearhead with speed lines; locked rows faded | **Accepted** | Distinct icons, faded "? Unknown doctrine" rows with locks. Note: the faded text is probably below 4.5:1; the build must keep the reason legible (A11Y, see HUB_PICK). The icons are placeholders: AS-03 paints the 5 doctrine icons. |
| 8 | `docs/v5/gemini/AS-01/hub_C_codex_1.jpg` | C2 in the same chat (6 beasts) | **Accepted** | Two-column grid, 6 cards, names and levels exact, 3rd row cut (scrolling), nothing extra. Note: the grid drops the hint line (ELEMENT_MAP E066 "Kept"), see HUB_PICK. |

**Totals:** 8 renders, 6 accepted (A ×2, B ×2, C ×2), 2 rejected and regenerated as edits. **Invented features: none** (no Quests, mail, energy, Play button, XP bar or gems in any render). The two rejections were a misleading badge placement and a reserved-glyph reuse.

**Previews** (`sips`, 420 px wide, q70): `docs/v5/ux/hub-mockups/hub_A_campaign_1.jpg`, `hub_B_campaign_1.jpg`, `hub_C_campaign_2.jpg`, `hub_A_codex_1.jpg`, `hub_B_codex_2.jpg`, `hub_C_codex_1.jpg`.

**Browser note.** In the first chat a click landed on the generated image and opened Gemini's image editor; the B1 prompt typed there went nowhere (the editor was closed without saving, nothing was sent). B1 was then sent in a fresh chat.

## Templates

Owner: art-director (S2-ART-BIBLE). Rules: `design/art/art-bible.md`. Sizes and subjects: `docs/v5/art/ASSET_LIST.md`. Processing: `docs/v5/art/ASSET_PIPELINE.md`.

### How to use them

1. Copy the template named in the asset's row (`T-…`).
2. Replace `{SUBJECT}` with the row's Subject, word for word.
3. Paste **T-STYLE first, then the template**: every painted prompt starts with the same style block, which keeps the families consistent.

**Family seeds**
- Generate one asset of a family first (busts: `bust_hoplite`; plates: `plate_hydra`; frescoes: `fresco_campaign`; icons: `icon_book`).
- Once it is approved, **attach it as the style reference** for the rest of its family. Add: *"Match the attached reference exactly in style, palette, brushwork, lighting and framing; change only the subject."*
- Variants (`portrait_nikias_talk` and `_blink`, `chest_open_empty` and `_full`) are **edits of the approved base**. Attach it and say *"Change only: {what}. Keep everything else identical: pose, framing, colours, lighting, background."*

**Output size.** Ask for the largest size Gemini gives at the aspect named; `process.mjs` refuses sources smaller than the shipped size. File every download as `docs/v5/gemini/<ART-id>_<file stem>_<n>.png`.

**Before saving, reject on sight**
- text, letters, numbers, signatures or watermarks;
- extra or missing limbs or heads;
- modern objects;
- the wrong headgear for the class (art bible §5.2);
- a frame or border painted around the image;
- on #FF00FF assets: a shadow, gradient or ground plane on the magenta, or magenta inside the subject.

### T-STYLE (prefix for every painted template)

```
STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink.
EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads.
```

### T-FRESCO (mode banners: `fresco_*`)

```
[T-STYLE]
ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame.
SUBJECT: {SUBJECT}.
COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the action runs along one band across the centre of the image; keep heads, weapons and the focal action inside the central horizontal third, so the image survives a crop to a strip 6 times wider than tall; calm background (sky, sea, plaster) at the top and bottom edges; 3 to 7 figures, all fully inside the frame.
ASPECT: very wide landscape, 21:9 or wider, at the highest resolution available.
PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue; red cloaks and bronze shields on the Greek side.
```

### T-VIGNETTE (settlement vignettes: `vignette_*`)

```
[T-STYLE]
ROLE: a wide establishing view of a settlement, the header of a town screen in a mobile game.
SUBJECT: {SUBJECT}, seen from a low hill at a slight distance, no people in the foreground.
COMPOSITION: horizontal bands: sky in the top quarter, the settlement's wall or roof line across the middle third (the part that must survive a crop to a thin strip), ground and path in the lower quarter; 3 to 5 readable landmarks; nothing important at the left and right edges.
ASPECT: landscape 21:9, highest resolution available.
LIGHT: warm afternoon sun from the upper left.
```

### T-BUST (class busts `bust_*` and Nikias `portrait_nikias*`)

```
[T-STYLE]
ROLE: a character portrait for a small round or square portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, front three-quarter view, the figure turned slightly to the viewer's left, eyes on the upper third of the image, the top of the head or crest 6 to 10 percent below the top edge, chin at about 60 percent of the height, shoulders cut by the bottom edge; the whole face and headgear inside the central circle of the image. The headgear silhouette and the one listed prop are the clearest, most contrasting shapes.
BACKGROUND: plain dark warm umber (#26211b to #342d25), a soft lighter glow behind the head, no scenery.
EXPRESSION: composed, alert, mouth closed.
ASPECT: square 1:1, highest resolution available.
```

### T-BUST-BEAST (`bust_wolf`, `bust_boar`, `bust_bear`)

```
[T-STYLE]
ROLE: an animal portrait for a small portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, three-quarter view toward the viewer's left, the head filling the upper two thirds, ears or tusks fully inside the frame.
BACKGROUND: plain dark warm umber (#26211b), a soft glow behind the head.
ASPECT: square 1:1, highest resolution available.
```

### T-PLATE (beast plates: `plate_*`)

```
[T-STYLE]
ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic.
SUBJECT: {SUBJECT}.
COMPOSITION: the whole creature, or its unmistakable upper body for very large beasts, centred and filling about 80 percent of the frame; one simple ground cue (rock, swamp, shore); a strong silhouette against the background.
BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro.
ASPECT: square 1:1, highest resolution available.
```

### T-ICON (atlas icons: `icon_*`)

```
ROLE: a game icon for a mobile strategy game menu, one of a set; it must read at 24 pixels.
SUBJECT: {SUBJECT}, a single object.
STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions, centred, filling about 85 percent of the square.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the object.
EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind the object, more than one object.
ASPECT: square 1:1, highest resolution available.
```

Attach `public/icons/ui.png` as the style reference for the first icon: it shows the set the new icons must match.

### T-CUTOUT (reward art: `chest_*`, `laurel_branch`)

```
[T-STYLE, without its background]
ROLE: a reward object shown alone in a mobile game modal.
SUBJECT: {SUBJECT}.
FRAMING: the whole object, three-quarter front view, sitting on the bottom of the frame, centred, filling about 85 percent of the frame, nothing cut off.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no floor; no magenta anywhere inside the object.
ASPECT: square 1:1 (laurel: portrait 3:4), highest resolution available.
```

### T-SPLASH (`splash_keyart`)

```
[T-STYLE]
ROLE: the full-screen key art behind the title of a portrait mobile game.
SUBJECT: {SUBJECT}.
COMPOSITION: tall portrait; the empty sky in the top third stays calm for a logo laid on in code; the phalanx and the beach in the middle and lower thirds; all key figures inside the central 60 percent of the width, so the image survives a crop to any phone shape.
ASPECT: tall portrait 9:19.5 (or 9:16, the tallest available), highest resolution available.
LIGHT: dawn from the upper left over the sea.
```

### T-PIXEL (world pixel sprites: map props, units, beasts; from later GDDs)

```
ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game.
SUBJECT: {SUBJECT}, {FACING, e.g. facing down-right in a 2:1 isometric view}.
PIXEL GRID: true pixel art on a {W}x{H} art-pixel canvas (exact sizes in art bible section 8.5: soldier 32x32, mounted 48x48, lair beast 96x96, world boss 160x128), drawn so that every art pixel is a clean square block of 8x8 screen pixels; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail.
PALETTE: only these colours (PA-WORLD): #2a1a12 #442618 #5e2427 #2e3e56 #7b503d #a87464 #dbac99 #f8d5c2 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #e0c070 #7a2a2e #a12735 #cc7677 #3d5a78 #7a7a88 #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e #a8b46a #5d4070 #ae8a9a #978b81 #fde1c8 #d02030 #7fd0e0.
STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step hue-shifted ramps (shadows toward red-purple, lights toward cream), light from the upper left, chunky-realistic proportions about 6 heads tall, team colour only on shields, crests and standards.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no ground and no base plate (the game draws those); feet on one line at the bottom.
EXCLUDE: text, a frame, several sprites, a scene.
```

Processing: `node scripts/art/process.mjs <name> <raw> --kind pixel --size {W}x{H}`. It detects the 8 px blocks, snaps to PA-WORLD and pads the sprite into the canvas. It never scales.

### T-FRAME (raster 9-slice chrome, only if a later story replaces procedural chrome)

```
ROLE: a 9-slice UI frame for a mobile game, carved from {MATERIAL: dark stone with a gold-ochre Greek-key meander / aged bronze with rivets}.
LAYOUT: a rectangular frame {B} pixels thick on every side around an empty centre; ALL ornaments (rosettes, rivets, corner bosses) only in the four corners; the four edges carry a pattern that repeats seamlessly and is uniform along its length, with no stains or ornaments in the middle of an edge.
BACKGROUND: the centre and the outside are a perfectly flat solid #FF00FF magenta.
LIGHT: from the upper left: lit top-left bevels, shaded bottom-right bevels.
ASPECT: square 1:1, highest resolution available.
EXCLUDE: text, a picture in the centre, perspective.
```

Processing: `process.mjs` (kind `frame`), then `nineslice.mjs` with the manifest's `slice` insets.

### T-MARK (app icon and favicon mark, AS-08)

```
ROLE: the app icon and browser favicon of a mobile strategy game set in the ancient Mediterranean; it must read as one bold shape at 16 pixels and still look rich at 512 pixels.
SUBJECT: {SUBJECT: one object in side profile, e.g. a bronze Corinthian hoplite helmet facing the viewer's left with a tall arched red horsehair crest}; its one dark opening (eye hole) a single clear shape; the object fills about 70 percent of the disc and is centred in it.
DISC: a perfect circle of dark black-glaze umber (#2a1a12 to #3a2418), like the ground of a red-figure Greek vase, edged by a ring of terracotta (#a8432c) carrying a simple bold Greek key meander band in terracotta and warm cream (#e7d6ad), the band about 8 percent of the diameter wide; the object sits inside the ring and does not touch it.
STYLE: painted like a red-figure Greek vase but with soft painted shading on the bronze: flat bold shapes, a heavy dark-brown outline (#2a1a12) of even weight around the object, light from the upper left, bronze #b08a3a with warm highlights, warm earth colours, no pure black and no pure white, very few internal details; hand-painted, not a photo, not a 3D render, not glossy digital art, not anime.
COMPOSITION: the disc centred, seen flat from the front, filling 94 percent of the square, nothing outside the disc.
BACKGROUND: a perfectly flat solid #FF00FF magenta background outside the disc, edge to edge, with no shadow, no gradient and no glow; no magenta anywhere inside the disc.
EXCLUDE: any text, letters, numbers, signatures, watermarks, a face or a person, more than one object, tiny details, perspective, a drop shadow.
ASPECT: square 1:1, highest resolution available.
```

Opening line `Create an image.` (first of its family, no reference). Processing: `node scripts/art/appicons.mjs <raw>` (key, trim, round alpha, every web and Telegram size; the favicon sizes use the inner disc).
