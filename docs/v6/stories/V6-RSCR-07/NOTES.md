# V6-RSCR-07 notes: World and Camp maps (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.4, §3.5, §4, §12 (12.1–12.4). Decisions: V6-055, V6-058, V6-059, V6-062, V6-063, V6-064, V6-065, V6-066, V6-067, V6-068, V6-070.

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/WorldScene.ts` and `src/scenes/CampScene.ts` at v6 803fde39, before any change. "Spec" is the §12.1 checklist line the element answers. Every element is present at every size; the columns say where it goes.

### World

| Element (code) | uiId | Spec §12.1 | compact portrait (390, 360, 320) | compact landscape (844x390) | medium (768x1024, 820x1180) | expanded (1024–1920) |
| --- | --- | --- | --- | --- | --- | --- |
| Map top bar: back (outside Telegram), "Day N · place" (or the place alone when it would be cut), gear | `world.topbar` | map top bar | strip | strip | strip | strip |
| SituationLine: hour, danger, hint / next town (never cut) | `world.situation` | SituationLine | full width, 2 lines | top-left card ≤ 260, 1 line | full width, 2 lines | top-left card ≤ 320, 2 lines |
| Chips: gold, men, food (days), supplies | `world.gold`, `world.men`, `world.food`, `world.supplies` | chips | in the card | in the card | in the card | in the card |
| Arc chip (lairs n/7, the host, the win), opens the Arc sheet | `world.arc` | Lairs chip | under the card, left | under the card, left | under the card, left | under the card, left |
| Cloud badge (only while the cloud save fails) | — | cloud badge | beside the arc chip | beside the arc chip | beside the arc chip | beside the arc chip |
| Follow eye | `world.follow` | Follow eye | under the card, right | under the card, right | under the card, right | under the card, right |
| Commands: Camp (primary in a camp), Rest / Pause or Stop, Party (badge) | `strip`, `world.camp`, `world.rest`, `world.stop`, `world.party` | MActionBar | bottom strip | stack at the right foot, keys 30 | bottom strip ≤ 360 | bottom-right stack, keys 120 × 30 |
| Night tint | — | night tint | yes | yes | yes | yes |
| Banner (found, spotted, arc news, band tap, refusals) | `world.banner` | toasts | under the card row | over the framing rect | under the card row | over the framing rect |
| "No way there" at the tap point | `world.noWay` | map tooltips | yes | yes | yes | yes |
| Coach marks (goal, bands, towns) with Next | `world.coach`, `coach.next` | coach bubble | yes | yes | yes | yes |
| Encounter sheet | `encounter` (sheet) | encounter card | bottom sheet | centred dialog (a decision) | per §3.4 | centred dialog |
| Event card | `event` | event card | bottom sheet | per §3.4 kind | per §3.4 | per §3.4 kind |
| Arc sheet (Lairs, Journal) | `arc` | the Journal | sheet | right side panel | bottom ≤ 320 | right side panel |
| Assault sheet | `assault` | (encounter family) | sheet | right side panel | bottom ≤ 320 | right side panel |
| Map: pan (drag, middle-drag), pinch, wheel zoom at the cursor (V6-058), tap to march, bands, settlements, lairs, camp zone | — | — | yes | yes | yes | yes |

### Camp (field and War camp)

| Element (code) | uiId | Spec §12.1 | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- | --- | --- |
| Map top bar: back, "Field camp" / "War camp", gear | `camp.topbar` | map top bar | strip | strip | strip | strip |
| SituationLine (where and when, what the camp does / what is picked, the cost) | `camp.situation` | SituationLine | full width | top-left card ≤ 260, 1 line | full width | top-left card ≤ 320 |
| Field chips: gold, men, food, supplies | `camp.gold`, `camp.men`, `camp.food`, `camp.supplies` | chips | in the card | in the card | in the card | in the card |
| War chips: war gold, food, wood, bronze, recruits | `camp.res.*` | chips | in the card | in the card | in the card | in the card |
| War camp's second chip row (only under 150 UI px wide) | `camp.chips2` | online second chip row | at 320 only | — (never that narrow) | — | — |
| Zoom key 1× / 2× | `camp.zoom` | Zoom key | under the card, right | under the card, right | under the card, right | under the card, right |
| Strip, field: Strike, Muster, Loot / Build, End day (primary) | `camp.strip`, `camp.strike`, `camp.muster`, `camp.loot`, `camp.build`, `camp.endDay` | bottom strip | two rows | right tool rail, keys 28, End day at the foot | two rows ≤ 360 | right tool rail, 120 × 30 |
| Strip, placing: Cancel, Place (primary) | `camp.cancel`, `camp.place` | Place, Cancel | one row | rail | one row ≤ 360 | rail |
| Strip, War camp: Muster, Loot, Rest / Buildings, Build or Upgrade or Claim (primary) | `camp.muster`, `camp.loot`, `camp.rest`, `camp.buildings`, `camp.build`, `camp.claim` | Rest, Claim | two rows | rail | two rows ≤ 360 | rail |
| War camp's reason line (why the off keys are off) | — | (the strip) | over the strip | parchment line at the foot, left of the rail | over the strip | parchment line at the foot, left of the rail |
| Day / night tint; End day's veil | — | — | yes | yes | yes | yes |
| Build drawer (field) / Buildings list (War) | `camp.drawer`, `camp.buildings` (sheets) | build sheet | sheet | inspector side panel | bottom ≤ 320 | inspector side panel |
| Supplies and field works | `camp.supplies.sheet` | supplies sheet | sheet | inspector side panel | bottom ≤ 320 | inspector side panel |
| Muster | `camp.muster.sheet` | muster sheet | sheet | inspector side panel | bottom ≤ 320 | inspector side panel |
| Forge (temper) | `camp.temper.sheet` | temper sheet | sheet | inspector side panel | bottom ≤ 320 | inspector side panel |
| Strike confirm | `confirm` | confirms | bottom | centred dialog | centred dialog | centred dialog |
| Event card over the camp | `event` | — | sheet | per §3.4 | per §3.4 | per §3.4 |
| Clearing: pan (drag, middle-drag), wheel zoom 1–2× at the cursor (V6-058), tap a structure / plot, the placement ghost | — | — | yes | yes | yes | yes |

Nothing is removed. Every id present at 390x844 is present at every other size (`element-parity`), with one registered exception: while a Camp inspector panel is open in landscape, the HUD it lies over (the card, its chips and the zoom key; in short landscape the keys of the row under it) steps aside and is registered with `uiCollapsed` into the panel's close key (`camp.*.sheet.close`), which brings it back. The tool rail is never covered.

## Short landscape (Telegram at 844x390)

Telegram's 844x390 safe area is 726x323 CSS px, 363x161 UI px. Camp's five rail keys (5 × 28 + 4 × 3 = 152) do not fit under the 24-px top bar: End day ran off the screen (outside-safe-area, above-fold), and the card, top bar and rail together covered more than half the box (field-coverage 47% and 42% for the War camp, < 50%). A rail of 22-px keys still left the field at 49%, so this is a layout change, not a tweak:

- `mapHudLayout` returns a third commands mode, `row`, in compact landscape when the stack does not fit the height under the top bar: one row of 24-px keys (48 pt, v5's strip key) along the foot, at their natural widths, right-aligned so the primary (End day, Place, Build, Claim) sits at the right end, under the thumb. The card keeps its full 260 at the top left. World's three keys still stack (96 px fits). Unit test in tests/mapHud.test.ts.
- Each key of the row is its own opaque cluster (the map shows between them). The War camp's reason line is on parchment as wide as its words, left of the keys when it fits, else right-aligned over them.
- Deviation from §12.2 ("right tool rail"), recorded here: the rail stays at every other landscape size, including plain 844x390.

## Inspector panels beside the tools (§3.4, §12.2)

The wip opened Camp's inspector panels over the right edge, which hid the whole tool rail (element-parity: camp.strike, muster, loot, build, endDay at 844x390 and 1024–1920; camp.build in the War camp). Now:

- In rail mode the panel docks left of the rail (the rail is "the nav rail" a side panel never covers, §3.4) and above the War camp's reason line. Tapping Muster with Build open switches the panel (play-tested). The rail stays live.
- In short landscape there is no room above the key row, so the panel takes the full height; the keys under it step aside (collapsed into its close key), and the keys left of it stay live.
- The framing rect ends at the panel's left edge; when the card's framing would lie under the panel, it is the clear map left of the panel.
- The forge list registers every row's Temper key (`ids` on its ScrollList), so rows scrolled out of a shorter panel still count (V6-066).
- The supplies sheet re-wraps its words to the panel's body when it is a side panel (it was laid out for 240 and clipped in a 220 panel). v5's sheet keeps v5's lines (checked: portrait element dump identical).

## Verification (final)

- Full layout matrix, the 13 World and Camp screens (world, event, event-costs, journal, encounter; camp, place, muster, temper, build, supplies, war-build, online-camp), 10 sizes, en and ru, plain and Telegram (28 configs): **0 violations, 0 new** (.rscr07-logs/lc-full2.log). The ru-tg 360 encounter "outside safe area" and the en-plain encounter parity at 820–1920 from the first run did not reproduce in isolation or in the full run (staging: the sheet was caught mid-slide or did not open under load).
- Portrait (390, 360, 320; en, ru; plain, Telegram; 13 screens, 156 screens): raw pixels differ between any two runs, v6 against v6 included (184 of 193 shots), because the staging plays real time (the hour, the night tint, map animations). So the portrait check compares every UI element's id and rect, and every text's position, from the layout registry, v6 803fde39 against this branch: **0 differences** outside the map's own labels and the encounter staging flake (when both runs opened the sheet, its box and keys match exactly).
- Play: 1280x800 mouse and keyboard (Tab, middle-drag pan, wheel zoom at the cursor, tap to march, follow inside the framing rect, Camp, Build as an inspector, the clearing pans beside it, Tent placed with the ghost in the framing rect, Muster switches the panel, Esc closes the panel then leaves the camp); 768x1024 touch (drag pan, march, camp, build sheet, place a tent). No page errors.

