# V6-RSCR-08 notes: first run and tutorial (landscape and tablet)

Spec: design/ux/landscape-v6.md §13.1, §2.3, §5, §16.9; design/ux/input-v6.md §10. Decisions: V6-055, V6-059, V6-062, V6-063, V6-065, V6-066, V6-067, V6-068, V6-075 (the battle narrator is RSCR-02's), V6-078, V6-083.

## Real elements (from the scene code at v6 b6dbcd59, next to the spec's list)

Taken from `src/scenes/FirstRunScene.ts`, `src/ui/tutorial/{battleTutorial,narrator,spotlight,ghost,onlineCoach}.ts` and `confirmDialog` before any change. (The elements were listed from the base code before the edits; this file was written down alongside the first commits.) Spec §13.1 lists: ScreenFrame, TopBar; offer and resume (fresco `firstrun.art`, Nikias speech card, primary CTA, `firstrun.skip`); reward (gold card, item card); modes (three `firstrun.mode.*` cards); skip confirm; tutorial (narrator, coach bubbles, ghost hand, skip dialog, online coach, keyboard lines). The code has exactly these, with the parts below. "v5" is compact portrait (390x844, 360x780, 320x693), unchanged.

### Offer and resume (`first-run-offer`, `first-run-resume`)

| Element (code) | uiId | Spec §13.1 | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Frame and top bar: "Welcome, strategos" (no back at the root) | `firstrun.topbar` | ScreenFrame, TopBar | yes | yes | yes | yes |
| Key art in a fresco frame (only if ≥ 40 tall) | `firstrun.art` | fresco | top of the 200 column (not tappable, as v5) | stage left (half; less on Telegram so the words fit); tapping it starts the tutorial | top, ≤ 280 tall, ≤ 300 wide, centred; tappable | stage left, ≤ 300 wide; tappable |
| Nikias card: painted portrait in a bronze well, "Nikias, strategos", the offer or resume line | `firstrun.speech` | speech card | yes | stage right | under the fresco | stage right |
| Tutorial (Recommended) / Continue training (primary) | `mbtn:Tutorial (Recommended)` / `mbtn:<resumeBtn>` | primary CTA | full column | stage right, ≤ 300, above the fold (`uiPrimary`) | left of a row, 240 | ≤ 300 |
| Skip the tutorial (text link; resume asks first) | `firstrun.skip` | firstrun.skip | yes | ≤ 240, under the CTA | right of the CTA's row, 112 | ≤ 240, under the CTA |
| Speech never runs into the top bar (`sy` clamp, UI.md §3.17) | — | — | clamp added (no pixel change) | block centred | block centred | block centred |

### Reward (`first-run-reward`)

| Element | uiId | v5 | 844x390 | tablet | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Frame, top bar "Training complete", back | `firstrun.topbar`, `hub.back`-style back | yes | yes | yes | yes |
| Nikias card and "Take this for the road." | `firstrun.speech` | big card | stage right, portrait beside the words | big card, 360 column | stage right, portrait beside the words |
| Gold card: coin, "Gold", counter +0 → +60 | `firstrun.gold` | stacked | stage left, beside the item | side by side | stage left, beside the item |
| Item card: item icon in its rarity frame, name, rarity | `firstrun.item`, `item:<def>` | stacked | stage left, beside the gold | side by side | stage left, beside the gold |
| Continue (primary) | `mbtn:Continue` | full column | stage right, under Nikias | ≤ 300, bottom centre | stage right, ≤ 300 |

### Modes (`first-run-modes`)

| Element | uiId | v5 | 844x390 | tablet | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Frame, top bar "Three ways to fight", back | `firstrun.topbar` | yes | yes | yes | yes |
| Campaign card (lit): fresco, icon, name, pitch, chevron | `firstrun.mode.campaign`, `.art` | stacked (scrolls on a short phone) | three side by side, row centred | three side by side | three side by side, ≤ 180 each |
| Duels card | `firstrun.mode.duels`, `.art` | stacked | side by side | side by side | side by side |
| War card | `firstrun.mode.war`, `.art` | stacked | side by side | side by side | side by side |

### Skip confirm (`first-run-skip`) and the tutorial skip dialog (`tutorial-skip`)

| Element | uiId | v5 | every other class |
| --- | --- | --- | --- |
| confirmDialog: title, body, Skip (destructive), Stay | `confirm.*` (kit) | bottom | centred dialog, ≤ 320 (kit, unchanged) |

### Battle tutorial (`tutorial-*`, BattleScene + `battleTutorial.ts`)

| Element | uiId | v5 | 844x390 | tablet | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Narrator: portrait, name, typed line, Skip, ✕ (folds into the "Nikias" key) | `tut.narrator`, `tut.skip`, `tut.hide`, `tut.recall` | above the sheet | top-left of the framing rect, ≤ 320 (RSCR-02, V6-075) | as v5 | top-left of the field |
| Spotlight: dim, hole, pulsing ring on the lit control | `tut.shade` | yes | re-points to the moved control (host rects) | yes | yes |
| Ghost hand (pan, pinch, drag, tap demos) | — | yes | yes | yes | yes |
| Flag / foe ring marker, praise pop | — | yes | yes | yes | yes |
| **New:** click wording (fine pointer) and the keyboard line with the current binding (keyboard) | — (in the narrator's line) | never on touch | only on keyboard devices | idem | idem |

### Online coach (`online-coach-*`, OnlineScene + `onlineCoach.ts`)

| Element | uiId | v5 | 844x390 | tablet | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Spotlight on home hex / neighbour / hex info / March / Attack / Collect / Clan | `tut.shade` | yes | yes | yes | yes |
| Coach card: line, "n / 7", Next / Done, arrow at the target | `coach.bubble`, `coach.next` | ≤ 176 | ≤ 176, beside the target when above/below would cover it, clear of a left nav rail | ≤ 176 | ≤ 240 |

Nothing is removed at any size.

## What changed

- `src/ui/tutorial/keyLines.ts` (new, pure): `tutorialLine(step, key, params, device, keyOf)`. Touch: the v5 line word for word. Fine pointer: the `.mouse` line ("Click…", "Scroll the mouse wheel…"). Keyboard: one `.kb` sentence naming the step's current binding (select → group.1; zoom → cam.zoom.in/out; undo; fight → deploy.fight; loose → group.2 then order.shoot; play → time.pause; then → order.then then order.charge; ability → ability.1; pan → the arrows). EN and RU in `src/i18n/tutorial.{en,ru}.ts`. `battleTutorial.ts` uses it with `platform.input.keyboard()/finePointer()`, `keys.bindings` and `keyLabel` (layout labels read once).
- `BattleScene.panByKeys`: one line, the arrow pan counts toward the tutorial's pan step (input-v6.md §10 "Accepting keys"); without it the keyboard line would promise something that does not work.
- `src/ui/tutorial/firstRunLayout.ts` (new, pure): `columnBox`, `offerLayout`, `modesRow` per variant.
- `src/scenes/FirstRunScene.ts`: `responsive = true`, `uiLayout`; compact portrait runs the v5 code (one change that moves no pixel: the speech card's top is clamped below the top bar, UI.md §3.17). Offer and resume: a stage in landscape (the words widen on a short phone until they fit; the key art is tappable and starts the tutorial, as the Menu's fresco starts the march), a 360 column on tablets with the CTA and Skip in one row. Reward: a stage in landscape (the gold and item side by side on the left, Nikias and Continue on the right), the 360 column with the cards side by side on tablets. Modes: three across, equal height, the fresco in its own 2.25:1 shape, centred in the height. CTAs `uiPrimary`, ≤ 300.
- `src/ui/tutorial/coachPlace.ts` (new, pure): `bubblePlace` (moved from onlineCoach.ts) gains a left inset (the nav rail) and a beside-the-target fallback, so a card never covers its anchor; `bubbleMaxW` 176 / 240.
- `scripts/lib/layoutMatrix.mjs`: `online-coach` screens belong to V6-RSCR-03 (they are the online war map with a card on top; OnlineScene is RSCR-03's and not migrated). Their 25 allowlist entries (the map's own HUD at 844x390: tab touch sizes, the gear over the hex panel) moved from V6-RSCR-08.json to V6-RSCR-03.json unchanged.

## Deviations

- **The fresco is a door.** The layout checks see text and controls only, so a large painting reads as an empty column (`empty-column`, `wasted-width`). Rather than hide it with a hook, the key art on the offer and resume screens became what it looks like, a big target that starts the tutorial (the same pattern as the Menu's fresco, V6-068). That makes it a primary control, so it is capped at 300 wide (spec: fresco ≤ 360). Compact portrait keeps the v5 picture, not tappable.
- **Tablet offer:** the CTA (240) and Skip (112) share one row under Nikias; stacked, the column's controls spanned only 300 of 384–410 (`wasted-width`, medium 80%).
- **Reward in landscape** is a stage (the spec says only "side by side"): the gold and item on the left, Nikias and Continue on the right; a single centred column left the laptop canvas 63% used.

- The victory card's "Press ? any time for all shortcuts." is not added: `help.keys` has no handler yet (INP-06 is not merged), so the line would promise a sheet that does not open.
- The pan step's `.mouse` line drops the arrow keys; the keyboard sentence ("Or hold the arrow keys.") carries them, so a mouse-only tablet never hears about keys it lacks.
