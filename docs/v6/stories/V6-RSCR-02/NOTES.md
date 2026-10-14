# V6-RSCR-02 notes: Battle HUD, Results and Inspect (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.5, §7 (7.1–7.6), §16.5, §16.6. Decisions: V6-055, V6-059, V6-062, V6-063, V6-064, V6-065, V6-066, V6-067, V6-068.

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/BattleScene.ts` (`buildHud`, `buildTop`, `buildSheet`, `buildTargetChips`, `buildMedallions`, `buildPips`, `buildShapeSheet`, `buildWorksTray`, `buildHeroInfo`, `updateTags`, `updatePointers`, `openGroups`, `openRetreat`, `openMenu`, `openMore`, `showGestureHint`, `showTerrainInfo`), `src/ui/battleHud.ts` (`TopBar`, `HintPill`, `Medallion`, `FacingPip`), `src/ui/battlePanel.ts` (`GroupCard`, `worksTray`), `src/ui/beastView.ts` (boss bar) and `src/scenes/ResultsScene.ts` at v6 803fde39.

States (the layout-check screens): deployment (`battle-deploy`, `-deploy-formation`, `-groups`, `-menu-deploy`), the fight (`battle-fight`, `-ring`, `-ring-soldier`, `-shapes`, `-retreat`, `-menu`, `-lefthand`), online (`battle-online-deploy`, `-online-fight`, `-menu-locked`), duel (`battle-duel-deploy`), beast (`battle-beast`, `-beast-paused`), assault and works (`battle-assault`, `-works`, `-works-place`, `-works-field`); Results (`results`, `-heroes`, `-spoils`, `-empty`, `-arc`, `-inspect`, `-online`).

"Where" columns: 390x844 is the v5 layout (unchanged); 844x390 is compact landscape; 768x1024 medium portrait; 1024–1920 expanded.

### Battle

| Element (code) | uiId | States | Spec §7.1 | 390x844 | 844x390 | 768x1024 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Top bar plate | `battle.top` | all | Top bar | 46, two rows | one 22 row | 46, two rows | one 26 row |
| ⋯ Menu key | `battle.menu` | all | Menu key | top left | top row, left (icon) | top left | top row, left |
| Clock and its word ("battle time", "live", ladder ticket, deploy seconds) | text | all | clock and its word | top centre | top row after Menu (word when it fits, as v5) | top centre | top row after Menu |
| Strength row "You n% [bar] vs [bar] n% Foe" | text + bars | fight | strength bars | second row | top row centre, bars ≤ 60 | second row | top row centre, bars ≤ 100 |
| Deployment row "n groups · n foes", the men count and "men" | text | deploy | Deployment top bar | second row / clock | top row | as v5 | top row |
| Pause / Play (terracotta while paused) | `battle.pause` / `battle.play` | offline fight | Pause/Play | top right | top row right (icon) | top right | top row right |
| Speed 1×/2× | `battle.speed` | offline fight | Speed | top right | top row right | top right | top row right |
| Flee | — | — | "Flee" | not a top-bar key in code: Retreat is in the ⋯ menu (`openRetreat`) | same | same | same |
| Online deployment countdown bar | graphics | online / duel deploy | countdown bar | under the top bar | 2-px line at the top row's foot | as v5 | 2-px line at the top row's foot |
| Zoom key (magnifier) | `battle.zoom` | not ended | Zoom | field top left | field top right, over the medallions | as v5 | bottom-right corner |
| Follow (eye) | `battle.follow` | fight | Follow | field top right | field top right, over the medallions | as v5 | bottom-right corner, left of Zoom |
| Hint pill | `battle.hint` | all | HintPill | under the top bar | top centre of the field, ≤ 220 | as v5 | top centre of the field, ≤ 300 |
| Banners (deploy, contact, paused, terrain, net, ticket) | text | all | banners | under the top bar | top centre of the field, ≤ 220 | as v5 | top centre of the field, ≤ 300 |
| Boss bar (name, pips, health) | text + graphics | beast | boss bar | under the top bar | under the top row, centred, ≤ 200 | as v5 | under the top row, centred, ≤ 300 |
| Group cards (numeral plate, portrait, name, men · order, H and M bars, focus reticle, Standard, morale glyph) | `battle.group.I`…`IV`, `*` | all | Group cards | 2 a row in the sheet | left column, 100 wide | 3 a row in the sheet | left column, 132 wide |
| Selected-group numeral badge | graphics | fight | Selected line | sheet head | head of the order rail | sheet head | head line over the orders |
| "ORDERS · PHALANX" title | text | fight | Selected line | sheet head | — (the badge carries the numeral; the name is on the selected card) | sheet head | head line |
| Formation chip (opens the shape sheet) | `battle.cat.formation` | all | Formation chip | sheet head | foot of the order rail (into the chip row when the rail is too short) | sheet head | head line, right |
| Groups chip | `battle.groups` | deploy | Groups | sheet head | rail head | sheet head | head line |
| Alone / Rejoin (selected soldier) | `battle.cmd.solo` / `battle.cmd.join` | fight, soldier selected | Reset / Alone / Rejoin | sheet head | chip row | sheet head | head line |
| Orders Advance, Charge, Hold, Shoot (Loose/Throw), Withdraw (Feint) | `battle.cmd.advance` `charge` `hold` `loose`/`throw` `fallback`/`feint` | fight | Orders | bottom row | right rail, stacked | bottom row, ≤ 360, centred | bottom-centre bar, 56 × 30 |
| Order in force lit, hollow out-of-range rim, feint cooldown sweep | graphics | fight | order lit | on the keys | on the keys | on the keys | on the keys |
| "No orders" line (no group selected) | `battle.orders.none` | fight | — | in place of the orders | in the rail | as v5 | in place of the bar |
| Fight / Ready (primary) | `battle.fight` / `battle.ready` | deploy | Fight / Ready | full width | foot of the rail, 44 tall | ≤ 300, centred | bottom centre, 200 wide |
| Inspect (i) toggle | — | — | "Inspect (i)" | not in the battle code (no such control): nothing to keep | — | — | — |
| Works key | `battle.works` | deploy, works unlocked | Works tray | chip row | chip row | chip row | chip row |
| Works tray (supplies, a row per work with its (i)) | `battle.works.stakes` … | deploy, tray open | Works tray | above the sheet | over the field's foot, between the cards and the medallions | as v5 | above the orders plate |
| Place / Turn / Cancel / Remove | `battle.works.place` `turn` `cancel` `remove` | works | — | chip row | chip row | chip row | chip row |
| Chip row: Undo, Then…, → queued, Clear plan, Focus ✕, To range | `battle.undo` `battle.then` `battle.then.cancel` `battle.plan.clear` `battle.target.clear` `battle.target.advance` | per state | Chip row | above the sheet | foot of the field, between cards and medallions | as v5 | directly above the orders |
| Ability medallions (≤ 3), horn, Standard, More | `battle.cmd.<ability>` `battle.cmd.horn` `battle.cmd.standard` `battle.more` | fight | Medallion rail | right edge | beside the rail | right edge | right edge |
| Selected soldier's info (portrait, name, weapon, HP/MOR/STA) | graphics + text | soldier selected | — | above the sheet | over the field's foot | above the sheet | above the orders plate |
| Facing pips | `battle.face.0`… | pips open | facing pips | round the group, inside the field band | inside the framing rect | as v5 | inside the framing rect |
| Group badges, flank arcs, edge pointers | `battle.pointer.group` / `foe` | all | on the field | field | field (pointers at the framing rect's edge) | field | field (framing rect) |
| Shape sheet (5–6 shapes) | `battle.cmd.form_*` | shape open | shape sheet | over the sheet | right side panel, full height | as v5 | right side panel |
| Groups modal, ⋯ battle menu, more-abilities sheet, retreat confirm, Settings | sheet ids | popups | popups | sheets | side panel / centred dialog (ParchmentSheet 'auto', RSCR-01) | bottom sheet ≤ 320 / dialog | side panel / dialog |
| Gesture hint card, terrain tip | text | deploy / long press | gesture hint, tooltip | over the field band | centred in the framing rect | as v5 | centred in the framing rect |
| Tutorial narrator (portrait, name, Skip, ✕, typed line) | `tut.narrator`, `tut.skip`, `tut.hide` | tutorial | §13.1 | v5 (full width) | top-left of the framing rect, ≤ 320, else at the field's foot | as v5, ≤ 320 centred | top-left of the framing rect, ≤ 320 |
| Coach bubbles, ghost hand, skip dialog | — | tutorial | §13.1 | v5 | anchored to the moved controls (RSCR-08 owns their landscape polish) | as v5 | as 844x390 |
| Left-hand mode | — | setting | Left-hand | rail and eye move | the whole layout mirrors | as v5 | the whole layout mirrors |

### Results and Inspect

| Element (code) | uiId | Spec §7.5 | 390x844 | 844x390 | 768x1024 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Banner (Victory, Defeat…) with laurels | text | banner | top | left pane | top | left pane |
| "vs …" line (verified, practice) | `results.vs` | vs line | under the banner | left pane | under the banner | left pane |
| Why line | `results.why` | why | under it | left pane | under it | left pane |
| Abandoned note | `results.abandoned` | note | under it | left pane | under it | left pane |
| Tabs Summary / Heroes / Spoils | `results.tab`, `.summary`, `.heroes`, `.spoils` | tabs | 3 | right pane: Heroes / Spoils; `results.tab.summary` is `uiCollapsed` into the left pane's tiles | Heroes / Spoils under the stacked Summary (`results.tab.summary` collapsed the same way) | as 844x390 |
| Summary tiles (time, kills, losses, gold or glory, XP) | `results.tile.*`, `stat.*` | tiles | 3 + 2 | left pane, 5 in a row | stacked over the tabs, 5 in a row | left pane, 3 + 2 |
| MVP card | `results.mvp` | MVP | Summary page | left pane | stacked over the tabs | left pane |
| Note chips | `results.note#` | notes | Summary page | left pane | stacked over the tabs (the stack scrolls past 40% of the page) | left pane |
| Heroes rows with XP bars | rows | Heroes | Heroes page | right pane | Heroes page, ≤ 360 | right pane |
| Spoils grid, counter, hoard header, empty chest | `results.loot#`, `results.chest` | Spoils | Spoils page | right pane | Spoils page | right pane |
| Arc variant (company roll, set piece) | `results.arc.*` | arc | page | right pane, centred in its height | under the stacked Summary, centred | right pane, centred in its height |
| Primary: Spoils, then Continue / Take n/m | `results.primary` | primary | pinned, full width | right pane foot, ≤ 240 | pinned | right pane foot, ≤ 240 |
| Inspect (item, compare bars, Take / Put back) | sheet | Inspect | modal sheet | right side panel | bottom sheet ≤ 320 | right side panel |

Nothing is removed. The only element not drawn in a layout is the Summary tab where the Summary is pinned (two panes, and stacked on a tablet upright): its page is on show the whole time, registered with `uiCollapsed(scene, 'results.tab.summary', 'results.tile.time')` (the Summary's first control, always on show in the left pane).

## What changed

- **Geometry** (`src/ui/battleLayout.ts`, pure, `tests/battleLayout.test.ts`): `hudMode` (portrait, medium, land, wide; medium landscape takes wide) and `sideHud`, which places every landscape cluster and returns the camera's framing rect, mirrored for left-hand mode. `keycapSlot` gives each control's top-right corner; `BattleScene.hudKeySlots()` lists them by uiId for V6-INP-06 (no width taken).
- **Battle** (`BattleScene` opts in with `responsive = true`, registers `uiLayout(…, 'field')`, `uiOpaque` on the top row, cards, rail and plate, `uiPrimary` on Fight / Ready):
  - compact portrait: the v5 code path; the HUD is 0 px different from v6 at 390, 360 and 320 (27 HUD shots, see below);
  - medium portrait: three cards a row; orders ≤ 360 and Fight ≤ 300, centred, with the head over them; the shape sheet ≤ 256 and the works tray ≤ 270 (their rows are buttons, ≤ 240, §2.3); the sheet stays under 36% of the height (4 cards at most, tested);
  - compact landscape: one 22-UI top row (Menu and Pause as icons, the clock, bars ≤ 60, Speed); cards in a left column (100); the right thumb rail (66): numeral badge, five orders stacked (22–24 tall), Formation at its foot (moved into the chip row only if a rail is too short); in deployment Formation, Groups, Works, Undo and Fight (44); Zoom and Follow over the medallion column beside the rail; chips and the selected soldier's info at the field's foot;
  - expanded: one 26-UI top row (bars ≤ 100); cards in a left column (132 × 30); the head line ("I ORDERS · PHALANX", Formation, Groups or Alone / Rejoin) over the five orders (56 × 30) on a bottom-centre plate; Fight 200 there in deployment; medallions down the right edge, centred; Zoom and Follow in the bottom-right corner; the chip row directly above the plate;
  - landscape popups: the shape sheet is a right side panel (`uiPanel`, 20% shade, two columns of rows when one is too tall); the Groups modal, ⋯ menu, more-abilities sheet, retreat confirm and Settings go through ParchmentSheet 'auto' (side panel or dialog); the gesture hint and banners sit in the framing rect; the boss bar is centred under the top row (`BeastView.placeBar`).
  - **Camera** (camera-systems): `fieldViewport()` is the framing rect (portrait: the v5 band); the opening fit uses its true aspect, `centerCam`, `recentre`, the follow (frame-rate-independent `1 − exp(−k·dt)`, after the sim step) and the key zoom anchor at its centre; the bounds clamp adds the side insets so the field's edge can come out from under a rail but not past it. Shake stays an additive offset.
- **Results** (`ResultsScene` opts in; `src/ui/results/layout.ts`, `tests/resultsLayout.test.ts`): two panes in landscape (left: banner, why, Summary tiles 5 a row at compact landscape and 3+2 at expanded, MVP, notes; right: Heroes / Spoils, the page, the primary ≤ 240 at the foot); one column on a tablet upright (5 tiles a row, Spoils up to 4 columns, primary ≤ 300). Inspect is a side panel (ParchmentSheet 'auto').

## Deviations

- The compact-landscape rail drops the words "ORDERS · PHALANX": the badge carries the numeral and the selected card (gold frame) carries the name. The order keys keep their words.
- Works and Undo sit in the compact-landscape rail in deployment (as the spec's rail list); in battle the chip row keeps Undo, Then… and the rest.
- The top row is 26 UI tall at expanded (spec 24) so its 22-UI keys keep a 2 px margin.
- Off the phone, hero rows and the MVP card got a press / hover tip (from existing strings) and a face-down spoil turns over when pressed. They make the wide panes real content (the `empty-column` rule) and suit a mouse; compact portrait is unchanged.
- The left Summary pane uses 3+2 tiles at expanded (the spec's own §7.5 table), 5 a row at compact landscape and on a tablet upright.
- `GroupCard.barLift` (1 UI px) lifts the bar labels of the expanded cards: at S = 3 (1920x1080) pixel rounding put them 1 CSS px past the card's foot.
- The tutorial host's `panelTop`/`headTop` read the framing rect in landscape. The narrator is a dialog (≤ 320, §2.3): `battleLayout.narratorBox` puts it top-left of the framing rect in landscape (clear of the cards and the rail; the foot of the field when that covers less of what the step points at), centred ≤ 320 on a tablet upright, and the v5 full width on a phone. Coach bubbles and the first-run screens stay with V6-RSCR-08.
- Results on a tablet upright (resumed session): the Summary stacks over the Heroes / Spoils tabs (as the landscape's left pane; at most 40% of the page, scrolling past that) and the column is at most 360 (ROW_MAX), centred. The single-column page left the Spoils (empty chest) and the arc variant three quarters empty (`empty-column`) and its rows 385 wide at 820x1180 (`stretched`). The arc's roll and set piece are centred in their page's height wherever the Summary is pinned (the right pane at 1280x800 was empty under them).
- The shape sheet on a tablet upright is 248 wide so its rows are 240 (they were 248, over the button limit).

## Evidence

- `node scripts/dev/battle-follow.mjs <url>`: 844x390 and 1280x800 PASS (opening fit 0 men outside the framing rect; ~10 sim s of march with Follow on, 40/40 samples inside; recentre within 6 UI px of the rect's centre).
- Played with real input (mouse, wheel, right click, keyboard Space / E / Tab / Esc at 1280x800 and 844x390; touch at 768x1024): cards, Fight, Charge and Hold, pause, wheel zoom at the field, focus ring on the HUD; 28/28 checks, no page errors.
- Portrait HUD pixel compare against v6 (world camera and badges hidden, fake clock, portraits stilled): 9 states × 390, 360, 320 = 27 shots, 0 px different.
- replay-hash: 13/13 battles in chromium and webkit.

### Resumed session (after merging v6 at cd5a0e1f: RSCR-01, INP-05, QA-HARDEN, PLAT-05)

- `node scripts/layout-check.mjs <preview> --no-shots --scenes 'battle*,results*,tutorial*' --verbose`, all 10 sizes, en and ru, plain and Telegram (28 configurations × 38 screens): **LAYOUT CHECK PASSED, 0 new, 0 failed**. Per class clean / known: compact portrait 442 / 14, compact landscape 144 / 8, medium 148 / 4, expanded 298 / 6 (the known ones are V6-RSCR-08's text-size floor on `tutorial-move` and `tutorial-skip`). Timing-only findings the check's second run cleared: FLAKY F5 (`battle-menu-locked` banner / note at 844x390) and `results.loot15–17` element-parity at 320x693 and 360x780 (see Open issues).
- The 12 violations at 844x390 in the pause report were the narrator's width (9 tutorial screens, `stretched` 376 > 320), the medallion text-size on `tutorial-move` (allowlisted for V6-RSCR-08, unchanged) and F5. A first full run here also found the shape rows at 768x1024 (248 > 240), the battle menu rows at 1440x900 (243 > 240), Results `empty-column` at 768x1024, 1280x800 and 1440x900 and `stretched` rows at 820x1180; all fixed above.
- 37 V6-RSCR-08 allowlist entries at 844x390 (group-card overflow, the order keys' touch size, the strength-row overlap on tutorial screens) were fixed by the landscape HUD and are removed.
- tsc 0 errors; vitest 1978/1979 with the full suite under load (the known World timeout, FLAKY F7, `tests/qafixWorld.test.ts` passes 14/14 alone); vite build OK; replay-hash 13/13 in chromium and webkit (src/sim and src/game untouched).
- `node scripts/regression/run.mjs <preview> --all`, both modes: 20/21 PASS; `duel-smoke` Telegram failed once under a parallel layout matrix (FLAKY F6, recorded) and passed on the rerun (`--only duel-smoke,battle-kinds`: 4/4 PASS).
- Portrait pixel compare against v6 (hudshots, 9 HUD states × 390, 360, 320): **27/27 0 px** (two runs each side; one v6 run's `works@390` showed the world layer the harness hides, a capture flake on the v6 side). Results and the narrator are portrait-identical by construction (the stack, the 360 column and the centring run only on a tablet or with the Summary pinned; the face-down spoil's id is metadata).
- Screenshots: `docs/v6/shots/V6-RSCR-02/` (battle fight, deploy, shapes, menu, beast; Results, Spoils, arc, empty, Inspect; tutorial; at 1280x800, 844x390 and 768x1024, a 1920x1080 fight and Russian at three sizes).

## Open issues

- `results.loot15–19` element-parity at 320x693 and 360x780 shows once and clears on the check's rerun: the Spoils at 390 and 320 are staged by separate battles, so the loot count can differ; the face-down cards now carry their id, so it is no longer the reveal's pace. Not a dropped element.
- `battle.undo` element-parity at expanded showed twice in a run under heavy load: Undo lives 3 s after an order (controls.md R4.1) and the staging's wall-clock timing decides whether portrait or wide sees it. Clean in the final run.
- Coach bubbles and the first-run screens in landscape stay with V6-RSCR-08.
