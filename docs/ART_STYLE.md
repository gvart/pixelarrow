# ART_STYLE — "Pixel Formation"-like look, drawn procedurally

The **style** of *Pixel Formation* (isometric pixel-art formation tactics), as
measured from two 720p captures, for generating **original** procedural art in
the same family. Do not trace or copy their sprites, emblems, portraits or
logo; match proportions, palette logic and techniques only. Sizes are in
**game pixels (gp)** unless marked screen px (720p).

## 1. Camera, projection, pixel scale

**Battlefield**
- **2:1 dimetric "isometric"** (≈26.6°). Formations run along the iso diagonals, mostly upper-left to lower-right.
- Fixed angle, free pan, a few zoom levels, no rotation.
- About **2 screen px per gp** at 720p (≈3 at 1080p); logical viewport ≈ **640x360 gp**. Sprites are integer-scaled, nearest-neighbour, never rotated or sub-pixel smoothed.
- **Ground grid:** faint diamond grid, 1 step darker than the grass, cell ≈ **32x16 gp**. Unit bases and order markers snap to it.

**World map**: top-down / slight 3/4 orthographic. Square land tiles ≈ **20 gp**. Rocks, trees, towers and temples are drawn 3/4 (south face visible), short shadow to S/SE.

**Title screen**: iso, extruded 3-D block letters, a row of hoplites in front.

## 2. Sprite sizes (battlefield)

| thing | game px |
|---|---|
| infantryman, feet to top of head | **~20-24 gp** |
| crest / helmet plume | +2-3 gp |
| spear | ~28-32 gp, a 1 gp line |
| round shield (aspis) | **9-11 gp**, at ~45% of body height |
| unit base (single soldier) | **~18x8 gp** iso diamond, 1-2 gp thick |
| standard disc on pole | 9 gp disc |
| order marker diamond | one grid cell, outline only |

About **6 heads tall** ("chunky-realistic", not chibi). Heads 4-5 gp, limbs 1-2 gp. Legs visible and bare (greaves a lighter metal stroke).

## 3. Outlines

- **Selective coloured outlines (sel-out)**, never black: a dark version of the local colour (skin `#442618` / `#523624`, red cloth `#5e2427`, blue `#2e3e56`).
- **Shields: 1 gp light rim** (`#dfd9cd` / `#d2b8a7`) on the lit side, dark rim on the shadow side; this makes shields read in a crowd.
- Interior lines only where needed, 1 gp, darker ramp step.
- Unit shadows: iso base plus a soft dark ellipse, no outline.
- World map: coasts, camp plots and canopies get a **dotted 1 gp dark outline** (every other pixel); the motif runs through the map UI.

## 4. Shading

- **Light from the upper-left / top**; shadows to the lower-right (SE on the map).
- **3-4 step ramps per material** (shadow, base, light, optional 1 px specular on metal).
- **Hue shift:** shadows toward red-purple, highlights toward yellow-cream. Skin `#7b503d → #a87464 → #dbac99 → #f8d5c2`; grass shadows olive-brown, highlights straw; map shadows lavender, not grey.
- **Desaturated and warm**; only team reds on shields and banners are saturated.
- No gradients, no soft anti-aliased edges (a few manual AA pixels on shield curves are fine).

## 5. Dithering and texture

- **Grass:** no ordered dither. **Noise-clustered tufts**: 1x2 to 1x4 gp vertical strokes in 4-6 straw/olive tones, clumped into horizontal drifts (≈40-120 x 10-25 gp) of light straw over darker olive.
- **Map fog / parchment:** horizontal 1 gp streaks, sparse **checker dither** where cream fog meets purple cloud shadow.
- **UI:** **2x2 checker dither** strip under tooltip bars; checker fill for a selected map plot (`#fde0ae` with a pink tone).
- **Formation footprint:** translucent cyan-grey diamond lattice (§9).

## 6. Measured palette (hex, sampled from the frames)

Compression shifts values by about ±6; snap to these when building ramps.

**Battlefield grass**: `#765d35` (soil/shadow), `#8d7d38`, `#938739`, `#9a8f3b` (dominant), `#9f9440`, `#a19045`, `#a7954d`, `#aa9a51`, `#bba96a` (straw highlight); tuft deep shadow `#6b6038` / `#5b3f2a`. Grid line ≈1 step darker than local grass.

**Units**
- Skin: `#7b503d` `#a87464` `#be8f83` `#dbac99` `#f8d5c2`
- Outline browns: `#442618` `#523624` `#554026` `#564924`
- Linen / tunic: `#d6c0a8` `#dfd9cd` `#e5e7e7`; grey-green tunic `#7a7367` `#81876c` `#919273`
- Metal / helmet: `#836c65` `#ac9283` `#b3a692` (bronze glint `#d2b68e`)
- Spear wood: `#863c2e` / `#95593e` / `#7b7246`; hair `#863c2e` `#a8503a`

**Team / emblem**
- Red team: `#5e2427` `#a12735` `#b12d3c` `#b83d4a` `#cc7677`
- Blue accent / enemy: `#2e3e56` `#3d5a78` `#7a7a88`
- Emblem cream `#dfd9cd`; bronze shield `#b08a3a` / `#d2b68e`
- Engaged enemies tint purple (`#8a6a9a` range); hit flash `#d02030`.

**Battle UI (parchment-pink)**: `#4a3622` (darkest ink), `#894039` (icon red), `#b67c6e`, `#ba917e`, `#bd9e8a`, `#cda394`, `#ceb3a5`, `#dba597`, `#deb3a5`, `#e0bfaf`, `#eed4c2` (paper highlight), frame wood `#8e725c`. Tooltip lavender-pink ≈`#d9a6c8`. Selection cyan `#7fd0e0`. Unit card: plum `#553945` / `#6e3f4b`, `#a17f71`, `#e3c0b2`, stat text cyan `#6fc8e0`.

**World map**
- Parchment / unexplored: `#fde1c8` `#fbdfc3` `#f0dcc4` `#f8e0c7`; fog shadow `#978b81`.
- Sea (lavender): `#a88594` `#ae8a9a` `#b18e9d` `#b3909f` `#b694a2` `#bb98a7` `#c29fad`; deep cloud shadow `#7e5d8c` to `#5d4070`.
- Coast shelves: `#a5818d` `#c19eaa` `#caa8ab` `#e5c6b9`; sand `#f7dac3` `#fde0c7` `#fee2ca`.
- Land grass: `#d1c286` `#d7cb88` `#dcc992` `#dece95`; canopy ≈`#c8d08a` / `#a8b46a`; earth and shadow `#856a52` `#a38b70` `#b19c7c` `#c4a88f`.
- City: stone `#efd4c6` `#e0c2b6` `#d5b5af`, roofs/walls `#937372` `#81605f`; temple/tower roofs teal `#86b6ae` / `#becec6`.
- Camp plot: `#af8370` / `#fde0ae` checker, border dots `#b06030`. Ship path: dotted `#7fa9a8`.

**Title screen**: plum `#42313b` `#4d3741` `#533b46` `#563e48`; letters coral `#6b4546` `#a26161` `#b76665` `#d77f7d` `#f08e8a`, highlight `#ddaba1`; caption navy `#2a2d4a`, cyan glow `#5ad0c0`.

**Rules:** ~40 colours per scene. Battle: olive/straw, warm skin, team red. Map: cream, lavender, sage. UI: parchment pink, oxblood ink. No pure black, no pure white.

## 7. Terrain rendering techniques

- **Base:** flat `#9a8f3b`; low-frequency value noise (scale ≈60-120 gp, stretched 3:1 horizontally) picks "dark olive" or "straw" tuft sets; scatter vertical 1x2 to 1x4 tufts (≈15-25% of pixels) from the 4-6 tone ramp. Bright tufts on the top edge of each clump, shadow tufts on the bottom.
- **Grid:** 1 gp diamond lines at ≈-6% value, slightly stronger near selected units.
- Map vocabulary re-projected to iso:
  - **Trees:** blobby canopy of 3-5 overlapping circles of 6-10 gp, dotted dark rim, lighter top-left cap, dark under-band, iso shadow blob to SE.
  - **Rocks:** rounded mauve-grey lumps (`#a5818d`→`#c4a2ac`), light top, long soft shadow tail.
  - **Shorelines:** concentric bands: sand, 2-4 gp light shelf (`#e5c6b9`), darker shelf (`#c19eaa`), deep water; dotted dark line on the sand edge, sparse white foam pixels.
  - **Roads:** paler dirt tufts with a sparse pebble dither.

## 8. Map structure (battlefield)

One continuous field on a hidden iso grid (faint diamond lattice). Unit slots are grid cells; a formation is a rectangle of cells on the iso axes.

## 9. Units and formation representation (battlefield)

- **Every soldier is an individual sprite** on a **small iso base plate** (`#8e8d60` / `#abb986`, darker rim), like a tabletop miniature; adjacent plates join into rank strips.
- **Formation footprint ghost:** while selected or moving, the target area is a **translucent cyan-grey diamond lattice** (`#7fa9a8` at ~35-50% alpha), one cell per soldier.
- **Order markers:** hollow diamonds with a dotted dark outline, each joined to its soldier by a long thin translucent line (move orders).
- **Ranks:** front rank of shield-bearers with spears slanted forward; rear ranks spears upright; skirmishers loose and unarmoured.
- **Variety:** hair, tunic (linen, grey-green, brown), shield emblem, bare chest vs tunic: a seeded parts system.
- **Standard bearer:** pole with a red emblem disc, one per formation, centre-front: the formation's anchor.
- **Team colour** on **shields, crests and standards** only; skin and tunics stay neutral. Engaged enemies get a purple/blue tint.
- Selected or hovered units: cyan base plates. Damaged units: small red blood pixels.

## 10. Animations observed

| animation | spec for us |
|---|---|
| idle | 2-4 frames, 3-4 fps, random phase per soldier; spears sway a little |
| walk / march | 4-6 frames at ~8-10 fps, 1 gp bob on contact frames; the lattice ghost stays put |
| re-form / wheel | per-soldier pathing with staggered start (0-300 ms jitter): the line "unzips" into a crowd |
| attack (spear thrust) | 3-4 frames: windup (2 frames held ~100 ms), thrust (1), recover (1); throwers: arm back, release |
| javelin / projectile | 1-2 gp dot plus a ground shadow dot, arc height ~10-20 gp, ~0.5-0.8 s flight |
| hit / blood | red specks (`#863c2e` / `#d02030`): 3-6 pixels over 3 frames, then a persistent 1-2 gp decal |
| death | 3 frames fall flat with a red patch, persistent corpse |
| flags / standards | optional 2-frame wobble at 4 fps |
| map: ship | glides along the dotted path; 2-frame bob at ~3 fps; wake of fading dots |
| map: water | horizontal 1 gp streaks scrolling 1 gp per ~0.5 s; white sparkles blinking at random spots, lifetime 0.3-0.8 s |
| map: fog reveal | jagged stair-step cloud edges with purple under-shadow; reveal radius around the ship, edge animated by a noise threshold; cities fade in with a noisy dissolve |
| map: animals | 2-frame graze at 2 fps |
| camera | eased lerp pans (~1 s), final position snapped to whole gp, no shake |
| UI | typewriter text ~30 chars/s; caption words fade with a cyan glow |

## 11. UI style

- **Battle HUD (bottom centre):** 3-4 **parchment-scroll panels** (`#e0bfaf` / `#cda394`) with **rolled scroll caps** at both ends (`#8e725c` cylinders, 1 gp highlights), holding square icon buttons: unit-type portraits with counts; **formation commands** as single-colour oxblood (`#894039`) dot-triangles and arrows; a tall **mini-grid panel** (8x10 cells) of the slot layout with a cyan facing caret; order icons as red silhouettes on paper.
- **Tooltips / status bars:** lavender-pink bar, pixel-font label ("CHARGE", "MOVE 6"), 2 gp checker-dither underline, small cyan "X" close.
- **Unit card:** plum panel `#553945` in a parchment frame, caps name on top, traits in cyan pixel font with tiny monochrome icons, a 2x portrait on the right.
- **Map HUD:** same scroll language: hero portraits and action icons bottom-left, a resource bar of goods icons with counts, system icons top-right on a translucent dark-taupe plate, journal and rolled-scroll meters on the left, ship card and status log bottom-right.
- **Dialogue:** wide scroll with a portrait frame (full-body hero on a dark patterned background), name in red caps under it, body text in one dark ink.
- **Toast:** small scroll banner top-left, red caps.
- **Font:** one chunky all-caps bitmap pixel font, ≈5x7 gp.

## 12. World map

**Structure**
- A **free-form coastline**, not a node graph: open continuous sea; land a patchwork of square terrain tiles (grass, sand, rock, forest clusters) on a hidden square grid, plus hand-drawn landmarks (cities) that break the grid.
- **Fog of war:** unexplored areas are cream parchment with drifting cloud bands (stair-stepped edges, hatched/checker texture, lavender drop shadow on the sea). Revealed areas are fully coloured.
- **Islands and coasts:** concentric bands (sand, light shelf, darker shelf, sea), dotted dark coastline; rock spires with long southward shadows.
- **City-states:** large top-down settlements: street grid of square blocks, teal-roofed temple, walls with teal-capped towers, harbour with piers and ships. Discovery: toast, camera pan, fog reveal.
- Ownership and landing zones are **plots** (§13), not borders.

**Movement**
- The player is a **ship sprite** (~24x12 gp). A click draws a **dotted cyan-grey path** (1 gp dots every 2 gp, `#7fa9a8`) to a **dashed square waypoint marker**; the ship follows smoothly (not tile-stepped) and leaves a pale wake.
- Other ships (galleys, single sail) move independently.

## 13. Camp

**Plots:** irregular areas with **orange-brown dotted borders** (`#b06030`) and a tan/pink **checker dither** fill (`#fde0ae` / `#af8370`), a standing figure inside marking the party; the active plot has a pinker fill.

**Visual spec for our camp:**
- Camp zone: tile-snapped outline, 1 gp dotted orange-brown border, 2x2 checker fill at ~40% alpha. Hover: border dots march (1 gp per 120 ms).
- Building placement: ghost in team-cyan (`#7fd0e0`, 50% alpha) over the footprint; valid tiles get a cyan dotted diamond/square, invalid a red one (`#b83d4a`). On placement a 3-frame dust puff (cream `#f0dcc4`).
- Buildings: small 3/4 tents and huts (≈16-24 gp) in the map palette: stone/cream walls, oxblood or teal roofs, south-side shadow, dotted dark rim.
- Camp UI: parchment scroll panels with a row of buildable structures, each with a cost line of resource icons.

## 13b. Render resolution of the figures (how we apply the rules at 2x)

Soldiers, riders and animals are 3D models rasterised by `src/art/model3d.ts`.
`DollSpec.res` draws a figure at `res` times the pixels each way and the
sprite shows it at `1 / res`, so field size, feet line, base plate and hitbox
do not move: battle `res = 2` (`BATTLE_RES`), the hero sheet's stage its
integer fit scale, portraits `PORTRAIT_RES = 2` on a `PORTRAIT_PX = 24` box.

- **Outlines keep their weight:** sel-out is `res` pixels thick, outer rings copying the first ring's shade. Shafts widen with `res`; threads (bowstrings, sling cords, blade edges) stay one pixel.
- **Detail gated by density** (`fineDetail`, from ~28 px/m: the 2x battle and portraits, not 1x screens): brows, cheek hollows, moustaches, hair and crest strands, tunic pleats, cloak folds, sandal straps, greave ridges, cheek-piece rivets, leaf-shaped spear heads, horse tack and mane.
- **Portraits:** front-3/4 busts (no shield), an idle loop per hero (breathing, blinks, glances, a metal glint) on a seeded rhythm.
- **Four-legged figures** (horses, wolves, boars, bears): posed by a footfall table (walk, trot, pace, transverse and rotary gallop) with two-bone IK from shoulder / hip to hoof; head nods, tail swishes, the spine gathers and extends at the gallop; idle with a cocked hind foot, head toss, ear laid back. Riders follow the horse (seat absorbs bob, forward seat at the gallop, thrown back on a rear, rolling with a fall). Attacks: anticipation, coil, strike, bite / follow-through, recover. Deaths: stumble onto the fores and over, or the hinds give and it sinks / topples. Battle frames are drawn on demand into shared atlases, trimmed to opaque bounds, dropped when unused.

## 14. "Biggest differences vs a cheap look" checklist

- [ ] **No black outlines**: coloured sel-out, light rims on shields.
- [ ] **Hue-shifted 3-4 step ramps**, warm and desaturated; no pure RGB primaries.
- [ ] **Integer pixel scale, pixel-snapped positions**; no mixed pixel sizes, rotation or bilinear scaling (UI on the same gp grid).
- [ ] **Grass of clumped vertical tufts** in wind-combed drifts.
- [ ] **Per-soldier variety** (hair, tunic, emblem, pose phase).
- [ ] **Miniature base plates** and a translucent formation lattice.
- [ ] **Team colour only on shields, crests and standards.**
- [ ] **Desynced idles** plus a 1 gp walk bob.
- [ ] **Persistent battle decals** (blood, corpses).
- [ ] **One UI material:** parchment scrolls with rolled caps, oxblood icons, one bitmap font, checker accents; no flat or gradient widgets.
- [ ] **Dotted 1 gp borders** for paths, coasts, plots and markers.
- [ ] **Flat translucent shadows**, cast lower-right/SE.
- [ ] **~40 colours per scene**, a hue family per mode: olive battle, lavender/cream map, plum title.
- [ ] Map fog as **parchment clouds with stair-stepped edges** and a lavender drop shadow, not a black overlay.
