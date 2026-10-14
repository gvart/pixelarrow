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

Nothing is removed or collapsed: every id present at 390x844 is present at every other size (`element-parity`).
