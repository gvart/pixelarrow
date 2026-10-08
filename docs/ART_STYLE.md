# ART_STYLE — "Pixel Formation"-like look, drawn procedurally

Reference: two trailer/gameplay captures of *Pixel Formation* (an isometric pixel-art
formation-tactics game). This spec describes the **style** so we can generate
**original** procedural art in the same family. Do not trace or copy their sprites,
shield emblems, portraits, or logo; match proportions, palette logic and techniques only.

Sources analysed (both 1280x720 H.264, so fine detail is softened by compression):

| id | file | length | fps | content |
|----|------|--------|-----|---------|
| V1 | `a94dca80-...277a94d42cdd.mp4` | 117.3 s | 30 | Battlefield only: formation drill on open grass, re-forming lines, unit card popup (~62-68 s) |
| V2 | `88021eff-...3732a5442.mp4` | 43.05 s | 60 | Trailer: battle 0-17 s ("Forge your formation / In battle / And prevail"), **world map 17-33 s** ("Found city states", "Sail beyond"), title screen 33-43 s |

Measurements below are in **screen px at 720p** unless marked "gp" (game pixels).

---

## 1. Camera, projection, pixel scale

**Battlefield**
- **2:1 dimetric "isometric"** (lines at about 26.6°). Formations run along the iso diagonals
  (upper-left to lower-right is the dominant long axis in nearly every shot).
- Camera is fixed-angle with free pan and a few zoom levels. No rotation.
- **Pixel scale:** about **2 screen px per game px** at 720p in normal battle zoom (≈3 px at 1080p).
  The logical viewport is about **640x360 gp**. The title screen is zoomed further (about 4 px/gp).
  Sprites are always integer-scaled with nearest-neighbour filtering. Their pixels never rotate and never
  get sub-pixel smoothing.
- **Ground grid:** a faint diamond grid is visible over the grass, with lines only 1 step darker
  than the grass. Cell ≈ **32x16 gp** (≈ 36-40 x 18-20 screen px). Unit bases and order markers
  snap to it.

**World map**
- **Top-down / slight 3/4 orthographic**, not isometric. Land uses square tiles (≈ **20 gp**
  squares, ≈ 40 screen px). Rocks, trees, towers and temples are drawn 3/4 so you see their
  south face and they cast a short shadow to the south/south-east.

**Title screen**: iso, with extruded 3-D block letters and a row of hoplites in front of them.

## 2. Sprite sizes (battlefield)

| thing | screen px (720p) | game px |
|---|---|---|
| infantryman, feet to top of head | 32-46 (depends on zoom) | **~20-24 gp** |
| crest / helmet plume | +3-6 | +2-3 gp |
| spear (held upright or slanted) | 50-60 total | ~28-32 gp, a 1 gp line |
| round shield (aspis) | ≈ 18-22 diameter | **9-11 gp**, at ~45% of body height |
| unit base (single soldier) | ≈ 36x16 | **~18x8 gp** iso diamond with 1-2 gp thickness |
| standard / banner disc on pole | ≈ 18 disc on a 30 px pole | 9 gp disc |
| order marker diamond | ≈ 40x20 | one grid cell, outline only |

Proportions run about **6 heads tall**, which is "chunky-realistic", not chibi. Heads are 4-5 gp and limbs 1-2 gp wide.
Legs are visible and bare (greaves are sometimes a lighter metal stroke).

## 3. Outlines

- **Selective, coloured outlines (sel-out).** No pure black. Each sprite's outer edge is
  a **dark version of the local colour**: dark brown under skin (`#442618`, `#523624`),
  dark red under red cloth (`#5e2427`), dark slate under blue (`#2e3e56`).
- **Shields have a 1 gp light rim** (bronze or cream, `#dfd9cd`/`#d2b8a7`) on the lit side and a dark
  rim on the shadow side. This rim is what makes the shields stand out in a crowd.
- Interior lines (belt, arm against torso) are drawn only where needed, 1 gp, in the darker
  ramp step and never in black.
- Shadows under units are the iso base plus a soft dark ellipse. They have no outline.
- World map: coasts, camp plots and tree canopies have a **dotted 1 gp outline**
  (every other pixel) in a dark tone. This dotted-border motif runs through the whole map UI.

## 4. Shading

- **Light from the upper-left / top.** Highlights sit on the top-left of heads, shoulders and shield
  rims. Shadows fall to the lower-right of the sprite and SE on the map.
- **3-4 step ramps per material** (shadow, base, light, and an optional 1-pixel specular on metal).
- **Hue shift:** shadows move toward red-purple, highlights toward yellow-cream.
  Skin runs `#7b503d → #a87464 → #dbac99 → #f8d5c2`. Grass shadows are olive-brown and
  highlights are straw-yellow. The map's shadows are lavender rather than grey.
- Everything is **desaturated and warm**. There are almost no fully saturated colours, except the
  team reds on shields and banners, which carry the read.
- No gradients and no anti-aliased soft edges on sprites. A few manual AA pixels on shield curves are fine.

## 5. Dithering and texture

- **Grass:** no ordered dither. Use **noise-clustered tufts**: short 1x2 to 1x4 gp vertical
  strokes in 4-6 straw/olive tones, clumped into irregular horizontal "drifts"
  (≈ 40-120 gp wide, 10-25 gp tall) of lighter straw over a darker olive base. This gives the
  look of a field with wind-combed clumps.
- **Map fog / parchment:** horizontal 1 gp streaks and a sparse **checker dither** where the cream fog
  meets the purple cloud shadows.
- **UI:** a **2x2 checker dither** strip under the tooltip bars, and checker fill for a
  "selected" plot on the map (`#fde0ae` alternating with a pink tone).
- **Formation footprint:** a semi-transparent cyan-grey diamond lattice (see §9).

## 6. Measured palette (hex, sampled from the frames)

Values come from median-cut quantisation of role-specific regions. Compression shifts
values by about ±6, so snap to these when building ramps.

**Battlefield grass (base field)**
`#765d35` (soil/shadow), `#8d7d38`, `#938739`, `#9a8f3b` (dominant), `#9f9440`, `#a19045`,
`#a7954d`, `#aa9a51`, `#bba96a` (straw highlight), with tuft deep shadow `#6b6038` / `#5b3f2a`.
The faint grid line is about 1 step darker than the local grass.

**Units: skin, cloth, metal, wood**
- Skin: `#7b503d` `#a87464` `#be8f83` `#dbac99` `#f8d5c2`
- Dark outline browns: `#442618` `#523624` `#554026` `#564924`
- Off-white linen / tunic: `#d6c0a8` `#dfd9cd` `#e5e7e7`
- Grey-green tunic: `#7a7367` `#81876c` `#919273`
- Metal / helmet: `#836c65` `#ac9283` `#b3a692` (bronze glint `#d2b68e`)
- Spear wood: `#863c2e` / `#95593e` / `#7b7246`
- Hair (red/brown): `#863c2e` `#a8503a`

**Team / emblem colours (shields, standards)**
- Red team: `#5e2427` `#a12735` `#b12d3c` `#b83d4a` `#cc7677`
- Blue accent / enemy: `#2e3e56` `#3d5a78` (mid, estimated) `#7a7a88`
- Emblem cream: `#dfd9cd`. Bronze shield: `#b08a3a` / `#d2b68e`
- Enemies in V2 turn purple-tinted (`#8a6a9a` range) when engaged. Hit flashes are pure red `#d02030`.

**Battle UI (parchment-pink)**
`#4a3622` (darkest ink), `#894039` (icon red), `#b67c6e`, `#ba917e`, `#bd9e8a`, `#cda394`,
`#ceb3a5`, `#dba597`, `#deb3a5`, `#e0bfaf`, `#eed4c2` (paper highlight), frame wood `#8e725c`.
Tooltip lavender-pink: `#d9a6c8`-ish. Selection cyan: `#7fd0e0`.
Unit card: `#553945` / `#6e3f4b` (plum panel), `#a17f71`, `#e3c0b2`, stat text cyan `#6fc8e0`.

**World map**
- Parchment / unexplored: `#fde1c8` `#fbdfc3` `#f0dcc4` `#f8e0c7`. Fog shadow `#978b81`.
- Sea (lavender): `#a88594` `#ae8a9a` `#b18e9d` `#b3909f` `#b694a2` `#bb98a7` `#c29fad`.
  Deep cloud shadow over sea `#7e5d8c` to `#5d4070`.
- Coast shelves: `#a5818d` `#c19eaa` `#caa8ab` `#e5c6b9`. Sand `#f7dac3` `#fde0c7` `#fee2ca`.
- Land grass tiles: `#d1c286` `#d7cb88` `#dcc992` `#dece95`. Tree canopy about `#c8d08a` / `#a8b46a`.
  Earth and shadow `#856a52` `#a38b70` `#b19c7c` `#c4a88f`.
- City: stone `#efd4c6` `#e0c2b6` `#d5b5af`, roofs/walls `#937372` `#81605f`.
  Temple/tower roofs teal `#86b6ae` / `#becec6`.
- Camp plot: fill `#af8370`/`#fde0ae` checker, border dots orange-brown `#b06030`.
- Ship path: dotted cyan-grey `#7fa9a8`.

**Title screen**
Background plum `#42313b` `#4d3741` `#533b46` `#563e48`. Letters coral
`#6b4546` `#a26161` `#b76665` `#d77f7d` `#f08e8a` with highlight `#ddaba1`.
Caption font: dark navy `#2a2d4a` with a cyan glow `#5ad0c0`.

**Palette rules:** ~40 colours per scene. The battle is olive/straw plus warm skin and team red.
The map is a 3-hue world of cream, lavender and sage. The UI is parchment pink with oxblood ink.
Nothing pure black and nothing pure white.

## 7. Terrain rendering techniques

Battlefield (V1 and V2 show only open steppe grass):
- **Base:** flat `#9a8f3b`. Overlay low-frequency value noise (scale ≈ 60-120 gp, stretched 3:1
  horizontally) that picks between "dark olive" and "straw" tuft sets. Then scatter vertical
  1x2 to 1x4 tufts (density ≈ 15-25% of pixels) using the 4-6 tone ramp.
  Bright straw tufts gather on the top edge of each clump and shadow tufts on the bottom edge.
- **Grid:** 1 gp diamond lines at very low contrast (≈ -6% value), slightly emphasised near
  selected units.
- **Trees, rocks, roads, water, cliffs:** not seen on the battlefield in these captures. Borrow them from the
  map vocabulary below, re-projected to iso:
  - Tree clusters are blobby canopies made of 3-5 overlapping circles of 6-10 gp. Each has a dotted dark
    rim, a lighter top-left cap, a dark under-band, and an iso shadow blob to the SE.
  - Rocks are rounded mauve-grey lumps (`#a5818d`→`#c4a2ac`) with a light top and a long soft
    shadow tail.
  - Shorelines use **concentric bands**: sand, then a 2-4 gp light shelf (`#e5c6b9`), then a darker shelf
    (`#c19eaa`), then deep water. Put a dotted dark line on the sand edge and add sparse white foam pixels.
  - Roads should be paler dirt tufts with a sparse pebble dither. (Inferred; none shown.)

## 8. Map structure (battlefield)
- One continuous field with no visible borders inside the shot. The game uses a hidden iso grid
  that you can see as a faint diamond lattice.
- Unit slots are grid cells. A formation is a rectangle of cells aligned to the iso axes.

## 9. Units and formation representation (battlefield)

- **Every soldier is an individual sprite**, standing on a **small iso base plate**: a light
  green-grey diamond (`#8e8d60` / `#abb986`) with a darker rim. The plate reads like the base of a
  tabletop miniature. Adjacent soldiers' plates join into a strip, which makes ranks easy to read.
- **Formation footprint ghost:** while a formation is selected or moving, the target area is drawn
  as a **translucent cyan-grey diamond lattice** (`#7fa9a8` at ~35-50% alpha), one cell per
  soldier. This footprint is the main "formation" visual. In V1 large lattices appear as dark
  wireframe grids when a new formation is being dragged out.
- **Order markers:** hollow diamonds with a dotted dark outline, each joined to its soldier by
  a long thin translucent line (move orders).
- **Ranks:** a front rank of shield-bearers (round shields facing the camera-right side), with
  spears slanted forward. Rear ranks have spears raised vertically. Skirmishers stand loose and
  wear no armour.
- **Variety inside a unit:** hair colour, tunic colour (linen, grey-green, brown), shield emblem,
  bare chest versus tunic. Each soldier is a recombination of parts. Use a seeded parts system.
- **Standard bearer:** a pole topped with a red disc and an emblem, one per formation, near the
  centre-front. It works as the formation's anchor marker.
- **Team colour treatment:** colour sits mostly on **shields, crests and standards**. Skin and
  tunics stay neutral. Our side is red/cream shields with mixed bronze. The enemy is the same
  but highlighted with a purple/blue tint when engaged (V2 ~13 s).
- Selected or hovered units get cyan base plates. Damaged units get small red blood
  pixels around them.

## 10. Animations observed (estimates; video compression and 30/60 fps capture limit precision)

| animation | observation | spec for us |
|---|---|---|
| idle | Subtle. Most soldiers hold pose and spears sway a little. | 2-4 frames, 3-4 fps, desynced per soldier (random phase) |
| walk / march | Legs alternate and the body bobs 1 gp. Formation glides along the axis while the lattice ghost stays put. | 4-6 frames at ~8-10 fps, 1 gp vertical bob on contact frames |
| re-form / wheel | Soldiers walk individually to new cells, so the line visibly "unzips" into a crowd (V1 6-12 s, 76-80 s) | per-soldier pathing with staggered start (0-300 ms jitter) |
| attack (spear thrust) | Spears lower and jab. Skirmishers throw: arm back, release. | 3-4 frames: windup (2 frames held ~100 ms), thrust (1), recover (1) |
| javelin / projectile | Dark 1-2 gp specks with tiny shadows flying in shallow arcs (V2 15-16 s) | 1-2 gp dot plus a ground shadow dot. Arc height ~10-20 gp. ~0.5-0.8 s flight |
| hit / blood | Red specks (`#863c2e`/`#d02030`) splash and stay on the ground as decals | 3-6 pixels burst over 3 frames, then a persistent 1-2 gp decal |
| death | Body falls flat into a horizontal sprite with a red patch, which stays (V2 battle 15 s, "corpse" at right-centre) | 3 frames fall, persistent corpse |
| flags / standards | Disc on pole. Little to no cloth flutter visible | optional 2-frame wobble at 4 fps |
| map: ship | Sprite glides along the dotted path and leaves a faint pale wake trail behind | ship bob of 2 frames at ~3 fps. Wake = fading dots |
| map: water | Lavender sea with horizontal 1 gp streaks and **twinkling white sparkle pixels**. Frame diffs show the sea changes every ~2-3 frames at 60 fps (shimmer) | sparkles that blink on/off with a lifetime of 0.3-0.8 s at random positions. Streak scroll 1 gp per ~0.5 s |
| map: fog reveal | Fog clouds have jagged horizontal stair-step edges with purple under-shadow. As the ship explores, the fog edge erodes and a city fades in with a soft noisy dissolve (V2 22-26 s) | reveal radius around the ship. Animate the edge with a noise threshold |
| map: animals | Small deer/goats stand on land tiles (likely idle loops) | 2-frame graze at 2 fps |
| camera | Smooth eased pans between battle groups. On the map the camera glides to the discovered city and back (~1 s ease-in-out). No shake seen | lerp camera, but snap the final position to whole gp |
| UI | Text "types on" in the dialogue box. Caption words (trailer) fade with a cyan glow | typewriter ~30 chars/s |

## 11. UI style

- **Battle HUD (bottom centre):** three to four **parchment-scroll panels** in pale pink-tan
  (`#e0bfaf`/`#cda394`) with **rolled scroll caps** on the left and right ends (darker
  `#8e725c` cylinders with 1 gp highlights). Panels hold square icon buttons:
  - Left: unit-type portraits (red figure on paper, count numbers in tiny font).
  - Middle-left: **formation commands** drawn as oxblood (`#894039`) dot-triangles and arrows
    (line, wedge, column, wheel, spread, compact...). Each icon is single-colour ink.
  - Centre: a tall **mini-grid panel** (8x10 cells) showing the formation slot layout, with a
    cyan caret for facing.
  - Right: order icons (charge, hold, loose, rally...) as red silhouettes on paper.
- **Tooltips / status bars:** lavender-pink bar with a pixel-font label ("CHARGE", "MOVE 6"),
  a 2 gp checker-dither underline, and a small cyan "X" close icon.
- **Unit card** (V1 ~62 s): plum panel `#553945` with a parchment frame, name in caps on
  top, a list of traits ("VETERAN, HEALTHY, FRESH, MIGHTY, FLEET, AGILE, CUNNING") in cyan
  pixel font with tiny monochrome icons, and a 2x scale portrait of the soldier on the right.
- **Map HUD:** same scroll language. Bottom-left has hero portraits plus action icons, and the resource bar has
  14 resource icons each with "20" count (grain, wood, stone, tools, amphora...). Top-right has
  4 system icons (mail, save, stats, exit) on a translucent dark-taupe plate. The left edge has
  quill/scroll journal and vertical rolled-scroll meters (pillar-like). Bottom-right shows the
  current ship card plus a log of status lines on a dark translucent box ("X is now ...").
- **Dialogue:** a wide scroll with a portrait frame (full-body hero sprite on a dark patterned
  background) and the name in red caps under it. Body text is 1-colour dark ink.
- **Toast:** small scroll banner at top-left, "WE FOUND MASSALIA." in red caps.
- **Font:** chunky all-caps pixel font, about 5x7 gp. Use one bitmap font throughout.

## 12. World map

*Shown only in **V2, 17-33 s*** (best frames 18 s, 22 s, 26 s, 30 s).

**Structure**
- A **free-form Mediterranean coastline**, not a node graph. The sea is open and continuous.
  The land is a patchwork of square terrain tiles (grass tiles, sand, rock, forest clusters)
  laid on a hidden square grid, plus hand-drawn landmarks (cities) that break the grid.
- **Exploration is fog of war.** Everything unexplored is cream parchment with drifting
  cloud bands. Clouds have stair-stepped horizontal edges, a hatched/checker texture, and a
  lavender drop-shadow on the sea below them. Revealed areas are fully coloured.
- **Islands and coasts** use concentric bands (sand, light shelf, darker shelf, sea) with a dotted dark
  coastline. Rock spires sit on islands with long southward shadows.
- **City-states** (e.g. "Massalia") are large detailed top-down settlements: a street grid
  of square house blocks, a teal-roofed temple, walls with teal-capped towers, a harbour with
  wooden piers and docked ships. Discovering one triggers the toast, a camera pan to it and a fog
  reveal.
- No explicit political borders were visible. Ownership and landing zones are shown as **plots**
  (see Camp).

**How the player moves**
- The player is a **ship sprite** (sail plus hull, ~24x12 gp) on the sea. Click a destination and
  the route is drawn as a **dotted cyan-grey path** (1 gp dots every 2 gp, `#7fa9a8`) with a
  **dashed square waypoint marker** at the click point. The ship follows the path smoothly
  (not tile-stepped) and leaves a pale wake. A larger dotted outline sometimes shows a
  reachable / zone area around the path.
- Other ships (galleys with oars, single sail) move independently on the sea. These are NPC or
  rival fleets.
- A dialogue with a hero (Aeneas) comments on the route. Status log lines report crew states
  ("is now winded/tired"), which suggests movement costs stamina or time.

**Map icons and UI:** see §11 (resource bar, hero portraits, system icons, journal quill,
toast, ship card bottom-right).

## 13. Camp

**What the footage shows (honest scope):** neither video shows a camp *screen*, building
placement or a build-outline effect. On the world map (V2 18 s and 26-27 s, right-hand
landmass) there are **camp / landing plots**: irregular areas outlined with **orange-brown
dotted borders** (`#b06030`-ish) and filled with a tan/pink **checker dither**
(`#fde0ae` / `#af8370`), with a single standing figure (a hero or settler marker) inside.
One plot is "active" (pinker checker fill, figure present). A second plot further north is
outlined but partly under fog.

**Inferred mechanics (to design ourselves):**
- A camp is a **claimed plot of land tiles** next to a landing point on the coast. The dotted
  border marks its footprint on the tile grid. The checker fill marks the selected or active camp.
- A figure inside the plot marks where your party or hero is camped.
- The resource bar (14 goods at 20 each) and hero portraits suggest the camp is where
  resources are spent on recruits and supplies.

**Visual spec for our camp (consistent with the observed language):**
- Camp zone: tile-snapped outline with a 1 gp dotted border in orange-brown and a 2x2 checker fill at
  ~40% alpha. Hover = border dots animate ("marching ants", 1 gp per 120 ms).
- Building placement: a ghost of the building in team-cyan (`#7fd0e0`, 50% alpha) over the footprint
  tiles. Valid tiles get a cyan dotted diamond/square and invalid ones a red dotted one (`#b83d4a`).
  On placement, play a 3-frame dust puff (cream `#f0dcc4` pixels).
- Buildings: small top-down 3/4 tents and huts (≈ 16-24 gp) in the map palette, with stone/cream walls,
  oxblood or teal roofs, a south-side shadow and a dotted dark rim.
- Camp UI: reuse the parchment scroll panels with an icon row of buildable structures, each with
  a cost line using the resource icons.

## 14. "Biggest differences vs a cheap look" checklist

- [ ] **No black outlines.** Use coloured sel-out from the local ramp, plus light rims on shields.
- [ ] **Hue-shifted 3-4 step ramps**, warm and desaturated. Avoid pure RGB primaries.
- [ ] **Integer pixel scale and pixel-snapped positions.** No mixed pixel sizes, no rotation or
      bilinear scaling of sprites. (The UI uses the same gp grid.)
- [ ] **Grass made of clumped vertical tufts** in wind-combed drifts, not a flat fill or uniform noise.
- [ ] **Per-soldier variety** (hair, tunic, shield emblem, pose phase). Never 40 identical clones.
- [ ] **Miniature-style base plates** and a translucent formation lattice, so formations read
      as blocks at a glance.
- [ ] **Team colour only on shields, crests and standards.** Keep bodies neutral.
- [ ] **Desynced idle animations** (random phase), plus a 1 gp walk bob.
- [ ] **Persistent battle decals** (blood specks, corpses) that build history on the field.
- [ ] **Cohesive UI material:** parchment scrolls with rolled caps, single-colour oxblood icons,
      one bitmap font and checker-dither accents. No modern flat or gradient widgets.
- [ ] **Dotted 1 gp borders** for paths, coasts, plots and markers (a signature motif).
- [ ] **Soft shadows as flat translucent shapes**, consistently cast to the lower-right/SE.
- [ ] **Limited scene palette (~40 colours)** with a distinct hue family per mode: olive battle,
      lavender/cream map, plum title.
- [ ] Map fog drawn as **parchment clouds with stair-stepped edges** and a lavender drop shadow,
      not a black overlay.

## 15. Best reference frames and crops

Root: `/tmp/claude-0/-home-user-pixelarrow/5182ad09-1798-5e05-bf8a-8ffeef84b014/scratchpad/ref/`

1. `burst/b_battle_01.png`: V2 15 s, full battle (bases, order markers, blood, HUD)
2. `crops/battle_bases_x3.png`: base plates, skirmishers, corpse, blood
3. `crops/title_soldiers_x4.png`: clean hoplite sprites, shield rims, sel-out
4. `crops/ui_battle_bar_x2.png`: parchment HUD, icon language, tooltip
5. `crops/v1_unitcard_62s.png`: V1 62 s, line formation plus unit card
6. `map/m_18.0.png`: V2 18 s, world map (ship path, islands, land tiles, camp plot, HUD)
7. `crops/map_camps_26s_x3.png`: camp plots (dotted border, checker fill, figure)
8. `crops/map_city_massalia_x2.png`: city-state rendering
9. `crops/map_island_coast_x2.png`: coastline bands, rocks, sand stipple
10. `map/m_22.0.png`: fog of war, dialogue panel, city reveal

Also: `v1/sheet*.png`, `v2/sheet*.png`, `scan/v1_sheet.png` and `scan/v2_sheet.png` (timeline contact sheets).
