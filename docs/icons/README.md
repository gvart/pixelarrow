# Icon atlas

Every icon the game draws, in the order of the tile sheets we will regenerate
with Gemini and swap into the game. Today all of them are painted in code
(`src/art/vectorIcons.ts`, `src/art/uiIcons.ts`, `src/art/itemIconsHD.ts`,
`src/art/goodsIcons.ts`, `src/ui/online.ts`); the new art replaces them one
for one, keeping the IDs.

**160 icons on 10 sheets of 16.** Each sheet below has its exact cell map, a
short description of what each icon means in the game, the shape to draw, and
a ready-to-paste prompt.

## How to make a sheet

1. Open Gemini (image generation).
2. Paste the **global prompt** below, then that sheet's **sheet prompt** under
   it, as one message.
3. Optional but recommended: attach `docs/icons/current/sheet-NN.png` (the
   current icons in the exact same cells, on the same magenta) and add
   *"Use the attached image only as a layout and subject reference: same
   object in the same cell. Redraw every icon from scratch at much higher
   quality."*
4. Check the result against the cell map: right object in the right cell,
   nothing crossing a cell edge, flat magenta background, no text. Re-roll
   single bad icons with the single-icon prompt at the end of this file.
5. Save as `sheet-01.png` ... `sheet-10.png` (PNG, 1024 x 1024) and send them
   over. Single re-rolled icons: name the file by the icon ID, e.g.
   `ui_hold.png`.

## Sheet format

| Property | Value |
| --- | --- |
| Canvas | 1024 x 1024 px, PNG, square |
| Grid | 4 columns x 4 rows, no gaps, no grid lines |
| Cell | 256 x 256 px. Cell (row R, column C), counted from 1, covers x = (C-1)*256 ... C*256-1, y = (R-1)*256 ... R*256-1 |
| Safe area | the central 208 x 208 px of each cell (24 px margin on every side) |
| Background | flat `#FF00FF` magenta (cut out in code), no shadow, no glow |
| Cell order | reading order: cells 1-4 are row 1, 5-8 row 2, 9-12 row 3, 13-16 row 4 |
| Looks | only the full-colour look. The cream look (on terracotta buttons) and the grey disabled look are made in code |

### Where the icons end up

| Group | Shown at (UI px) | Texture size on device |
| --- | --- | --- |
| UI and camp icons (`ui:`, `camp:`) | 12 x 12 | 24-48 px (2-4 device px per UI px) |
| Items, trinkets, goods (`item:`, `trinket:`, `goods:`) | 16 x 16 (inventory up to 24+) | 32-96 px |
| Cloud-sync badges (`chrome:sync_*`) | 12 x 7 (wide) | 24-48 px wide |
| Supporter banner (`chrome:supporter_banner`) | 8 x 12 (tall) | 16-48 px tall |

A 256 px cell is downscaled 4-10x, so silhouettes must be bold and simple.

## Global prompt

Paste this first, every time.

```text
Create ONE square image, exactly 1024 x 1024 pixels: a sprite sheet of 16 game icons laid
out in an invisible grid of 4 columns x 4 rows. Every cell is exactly 256 x 256 pixels. Cell
order is reading order: row 1 left to right, then row 2, row 3, row 4.

Layout rules:
- Background: solid flat pure magenta #FF00FF over the whole canvas. No gradient, no texture,
  no vignette, no floor, no cast shadow, no glow on the background. Never use magenta, pink or
  purple inside an icon.
- Exactly one icon per cell, centred in it. The icon fits inside the central 208 x 208 pixels of
  its cell (24 px of empty magenta on every side) and never touches or crosses into another cell.
- Every icon is a single isolated object: no frame, no tile, no badge plate, no circle behind it
  (unless the icon itself is a disc or coin), no text, no letters, no numbers, no watermark,
  no grid lines.
- All 16 icons share the same scale, outline, lighting and level of detail.

Art style:
- Painted game UI icon for a premium mobile strategy game set in the ancient Greek /
  Mediterranean bronze-and-iron age. Semi-realistic, hand-painted, crisp, clean.
- Bold, simple, instantly readable silhouette: it must still read at 24 x 24 pixels. Few big
  shapes, no fine clutter, no thin lines under 6 px (at this 256 px cell size).
- One dark brown ink outline (#1A120C), about 6 px thick, around the whole silhouette; thinner
  dark seams between the parts. No coloured outlines, no second outline.
- Light from the top left: soft gloss highlight on upper-left surfaces, shading toward the lower
  right. No drop shadow (the game adds it).
- At most 4 materials per icon, chosen from: bronze #D2A564, gold #F0C24A, steel #BCC5CE,
  silver #D8DEE4, iron #8C877F, stone #8A8276, wood #9C6A3A, leather #6E4628,
  terracotta #C6623C, red #D6473A, ivory/linen #EADFC4, blue #6094CA, green #7FB84E,
  ember orange #F28A2C.
- Front view or a gentle 3/4 view, no perspective scene, no background objects, no emoji,
  no flat web-glyph look.
```

## Sheet 01: Battle orders and speed

File: `sheet-01.png`. Current icons in the same cells: [current/sheet-01.png](current/sheet-01.png)

![Sheet 01, current icons](current/sheet-01.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `ui:hold` | Order: Hold. The group stands its ground. | an upright heater-shaped shield, dark iron rim, bronze face, a round steel boss in the centre, front view |
| 2 | R1 C2 | 256-511, 0-255 | `ui:advance` | Order: Advance. | a thick bronze arrow pointing straight up, a smaller gold arrow inlaid in its centre |
| 3 | R1 C3 | 512-767, 0-255 | `ui:charge` | Order: Charge. | two thick stacked chevrons pointing up, the upper one fiery orange, the lower one bronze |
| 4 | R1 C4 | 768-1023, 0-255 | `ui:fallback` | Order: Fall back. | a thick bronze arrow pointing straight down, a smaller ivory arrow inlaid in its centre |
| 5 | R2 C1 | 0-255, 256-511 | `ui:throw` | Order: Throw javelins. | a single javelin flying diagonally from lower-left to upper-right, wooden shaft, leaf-shaped steel head at the upper right, two short ivory speed streaks behind the tail |
| 6 | R2 C2 | 256-511, 256-511 | `ui:volley` | Ability: Volley (arrows / sling stones in a salvo). | three parallel arrows flying diagonally to the upper right, steel heads, wooden shafts, red fletching |
| 7 | R2 C3 | 512-767, 256-511 | `ui:wall` | Order: Shield wall. | three overlapping round bronze shields in a row with red faces and steel bosses, three spear tips standing up behind them |
| 8 | R2 C4 | 768-1023, 256-511 | `ui:bash` | Ability: Shield bash. Also the empty state of the abilities tab. | a round bronze shield with a red face and steel boss, front view, short gold impact lines bursting out of its right side |
| 9 | R3 C1 | 0-255, 512-767 | `ui:rally` | Ability: Rally (restores morale). | a straight bronze war trumpet lying horizontally, mouthpiece left, flared gold bell right, two curved gold sound waves to the right of the bell |
| 10 | R3 C2 | 256-511, 512-767 | `ui:berserk` | Ability: Berserk. | a round red furious face, dark slanted angry eyebrows, clenched ivory teeth |
| 11 | R3 C3 | 512-767, 512-767 | `ui:detach` | Command: Solo, detach a unit from its group. | four small bronze round tokens packed in a square at the upper left, one red token breaking away to the lower right, a short gold arrow from the group to the red token |
| 12 | R3 C4 | 768-1023, 512-767 | `ui:pause` | Battle speed: Pause. | a pause symbol: two upright rounded bronze bars with ivory inlays |
| 13 | R4 C1 | 0-255, 768-1023 | `ui:play` | Battle speed: Normal (play). | a play symbol: one bronze triangle pointing right with an ivory inlay |
| 14 | R4 C2 | 256-511, 768-1023 | `ui:fast` | Battle speed: Fast. | a fast-forward symbol: two bronze triangles pointing right side by side, ivory inlays |
| 15 | R4 C3 | 512-767, 768-1023 | `ui:f_line` | Formation: Line. | seen from above: soldiers as small rounded square tokens in two straight horizontal ranks of four, the top rank red, the bottom rank bronze |
| 16 | R4 C4 | 768-1023, 768-1023 | `ui:f_column` | Formation: Column. | seen from above: small rounded square tokens in a narrow vertical column two wide and four deep, the top pair red, the rest bronze |

Sheet prompt:

```text
Sheet 01 of 10: battle orders and speed.
Cells, in reading order:
1. (row 1, column 1) An upright heater-shaped shield, dark iron rim, bronze face, a round steel boss in the centre, front view.
2. (row 1, column 2) A thick bronze arrow pointing straight up, a smaller gold arrow inlaid in its centre.
3. (row 1, column 3) Two thick stacked chevrons pointing up, the upper one fiery orange, the lower one bronze.
4. (row 1, column 4) A thick bronze arrow pointing straight down, a smaller ivory arrow inlaid in its centre.
5. (row 2, column 1) A single javelin flying diagonally from lower-left to upper-right, wooden shaft, leaf-shaped steel head at the upper right, two short ivory speed streaks behind the tail.
6. (row 2, column 2) Three parallel arrows flying diagonally to the upper right, steel heads, wooden shafts, red fletching.
7. (row 2, column 3) Three overlapping round bronze shields in a row with red faces and steel bosses, three spear tips standing up behind them.
8. (row 2, column 4) A round bronze shield with a red face and steel boss, front view, short gold impact lines bursting out of its right side.
9. (row 3, column 1) A straight bronze war trumpet lying horizontally, mouthpiece left, flared gold bell right, two curved gold sound waves to the right of the bell.
10. (row 3, column 2) A round red furious face, dark slanted angry eyebrows, clenched ivory teeth.
11. (row 3, column 3) Four small bronze round tokens packed in a square at the upper left, one red token breaking away to the lower right, a short gold arrow from the group to the red token.
12. (row 3, column 4) A pause symbol: two upright rounded bronze bars with ivory inlays.
13. (row 4, column 1) A play symbol: one bronze triangle pointing right with an ivory inlay.
14. (row 4, column 2) A fast-forward symbol: two bronze triangles pointing right side by side, ivory inlays.
15. (row 4, column 3) Seen from above: soldiers as small rounded square tokens in two straight horizontal ranks of four, the top rank red, the bottom rank bronze.
16. (row 4, column 4) Seen from above: small rounded square tokens in a narrow vertical column two wide and four deep, the top pair red, the rest bronze.
```

## Sheet 02: Formations and unit status

File: `sheet-02.png`. Current icons in the same cells: [current/sheet-02.png](current/sheet-02.png)

![Sheet 02, current icons](current/sheet-02.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `ui:f_wedge` | Formation: Wedge. | seen from above: round tokens arranged in a triangle pointing up, one red token at the apex, then two and three bronze tokens below |
| 2 | R1 C2 | 256-511, 0-255 | `ui:f_skirm` | Formation: Skirmish (loose order). | seen from above: eight round tokens scattered loosely with wide irregular gaps, two red ones at the front, the rest bronze |
| 3 | R1 C3 | 512-767, 0-255 | `ui:f_wall` | Formation: Shield wall (testudo-like block). | front view of four tall red rectangular shields standing edge to edge, bronze rims, a small steel boss on each |
| 4 | R1 C4 | 768-1023, 0-255 | `ui:heart` | Health / hit points. | a glossy red heart |
| 5 | R2 C1 | 0-255, 256-511 | `ui:morale` | Morale. | a blue square banner on a wooden pole with a gold finial, the cloth flying to the right, a small ivory dot emblem in its middle |
| 6 | R2 C2 | 256-511, 256-511 | `ui:stamina` | Stamina / fatigue. | a green round medallion with a gold lightning bolt across it |
| 7 | R2 C3 | 512-767, 256-511 | `ui:star` | Ladder floor rating and level-up. Reserved: never used for a currency. | a faceted five-pointed gold star with sharp points |
| 8 | R2 C4 | 768-1023, 256-511 | `ui:skull` | Kills, losses, dead men. | an ivory human skull, front view, dark eye sockets |
| 9 | R3 C1 | 0-255, 512-767 | `ui:people` | Men in a group, army size, clan members. | two busts side by side, ivory heads, one red tunic in front, one blue tunic slightly behind |
| 10 | R3 C2 | 256-511, 512-767 | `ui:eye` | Watch / follow camera, inspect, filter, zoom. | an almond-shaped ivory eye with a blue iris and a black pupil |
| 11 | R3 C3 | 512-767, 512-767 | `ui:aura` | Hero aura (abilities tab), an unknown ability. | a blue gem set in a gold ring, four curved orange flame arcs around it like a halo |
| 12 | R3 C4 | 768-1023, 512-767 | `ui:bolt` | Energy (war map attacks). | a single gold zig-zag lightning bolt |
| 13 | R4 C1 | 0-255, 768-1023 | `ui:hourglass` | Waiting, building in progress, time to go. | an hourglass with wooden top and bottom caps and golden sand in the glass |
| 14 | R4 C2 | 256-511, 768-1023 | `ui:clock` | Time left, cooldown, season end. | a round clock with a bronze rim, ivory dial and two dark hands |
| 15 | R4 C3 | 512-767, 768-1023 | `ui:plus` | Add, upgrade, heal. | a thick green plus sign |
| 16 | R4 C4 | 768-1023, 768-1023 | `ui:cross` | Wounded / hurt. | a red rounded square with a white medical cross |

Sheet prompt:

```text
Sheet 02 of 10: formations and unit status.
Cells, in reading order:
1. (row 1, column 1) Seen from above: round tokens arranged in a triangle pointing up, one red token at the apex, then two and three bronze tokens below.
2. (row 1, column 2) Seen from above: eight round tokens scattered loosely with wide irregular gaps, two red ones at the front, the rest bronze.
3. (row 1, column 3) Front view of four tall red rectangular shields standing edge to edge, bronze rims, a small steel boss on each.
4. (row 1, column 4) A glossy red heart.
5. (row 2, column 1) A blue square banner on a wooden pole with a gold finial, the cloth flying to the right, a small ivory dot emblem in its middle.
6. (row 2, column 2) A green round medallion with a gold lightning bolt across it.
7. (row 2, column 3) A faceted five-pointed gold star with sharp points.
8. (row 2, column 4) An ivory human skull, front view, dark eye sockets.
9. (row 3, column 1) Two busts side by side, ivory heads, one red tunic in front, one blue tunic slightly behind.
10. (row 3, column 2) An almond-shaped ivory eye with a blue iris and a black pupil.
11. (row 3, column 3) A blue gem set in a gold ring, four curved orange flame arcs around it like a halo.
12. (row 3, column 4) A single gold zig-zag lightning bolt.
13. (row 4, column 1) An hourglass with wooden top and bottom caps and golden sand in the glass.
14. (row 4, column 2) A round clock with a bronze rim, ivory dial and two dark hands.
15. (row 4, column 3) A thick green plus sign.
16. (row 4, column 4) A red rounded square with a white medical cross.
```

## Sheet 03: Equipment slots, auras and navigation

File: `sheet-03.png`. Current icons in the same cells: [current/sheet-03.png](current/sheet-03.png)

![Sheet 03, current icons](current/sheet-03.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `ui:helmet` | Helmet slot. | a bronze Greek helmet, front view, T-shaped face opening, a red horsehair crest on top |
| 2 | R1 C2 | 256-511, 0-255 | `ui:swords` | Battle, fight, attack. | two short swords crossed in an X, steel blades, gold cross-guards, leather grips, bronze pommels |
| 3 | R1 C3 | 512-767, 0-255 | `ui:sword` | Weapon slot (duel army). | a single short sword, diagonal, tip to the upper right, steel blade, gold guard, leather grip |
| 4 | R1 C4 | 768-1023, 0-255 | `ui:spear` | Weapon slot (hero sheet). | a spear, diagonal, wooden shaft, bronze socket, leaf-shaped steel head at the upper right |
| 5 | R2 C1 | 0-255, 256-511 | `ui:shield` | Shield slot. | a round bronze hoplite shield, front view, red face with an ivory lambda emblem |
| 6 | R2 C2 | 256-511, 256-511 | `ui:armor` | Armour slot. | a leather cuirass, front view, bronze collar, a row of hanging leather strips at the bottom |
| 7 | R2 C3 | 512-767, 256-511 | `ui:ring` | Trinket slot. | a gold ring with a red gem on top, 3/4 view |
| 8 | R2 C4 | 768-1023, 256-511 | `ui:fire` | Camp: campfire. | a small campfire, two crossed logs, an orange flame with a yellow core |
| 9 | R3 C1 | 0-255, 512-767 | `ui:aura_steady` | Aura: Steady. | a white marble Doric column with grey stone base and capital |
| 10 | R3 C2 | 256-511, 512-767 | `ui:aura_eagle` | Aura: Eagle. | the head of a brown eagle in profile facing right, gold hooked beak, gold eye |
| 11 | R3 C3 | 512-767, 512-767 | `ui:aura_warlord` | Aura: Warlord. | a bronze Corinthian helmet, front view, a tall red horsehair crest |
| 12 | R3 C4 | 768-1023, 512-767 | `ui:back` | Back. | a thick bronze arrow pointing left, a smaller ivory arrow inlaid in its centre |
| 13 | R4 C1 | 0-255, 768-1023 | `ui:check` | Confirm, done, learned. | a thick green check mark |
| 14 | R4 C2 | 256-511, 768-1023 | `ui:close` | Close, cancel, no. | a thick red X |
| 15 | R4 C3 | 512-767, 768-1023 | `ui:chevL` | Previous (pagers, steppers). | one thick bronze chevron pointing left |
| 16 | R4 C4 | 768-1023, 768-1023 | `ui:chevR` | Next (pagers, steppers). | one thick bronze chevron pointing right |

Sheet prompt:

```text
Sheet 03 of 10: equipment slots, auras and navigation.
Cells, in reading order:
1. (row 1, column 1) A bronze Greek helmet, front view, T-shaped face opening, a red horsehair crest on top.
2. (row 1, column 2) Two short swords crossed in an X, steel blades, gold cross-guards, leather grips, bronze pommels.
3. (row 1, column 3) A single short sword, diagonal, tip to the upper right, steel blade, gold guard, leather grip.
4. (row 1, column 4) A spear, diagonal, wooden shaft, bronze socket, leaf-shaped steel head at the upper right.
5. (row 2, column 1) A round bronze hoplite shield, front view, red face with an ivory lambda emblem.
6. (row 2, column 2) A leather cuirass, front view, bronze collar, a row of hanging leather strips at the bottom.
7. (row 2, column 3) A gold ring with a red gem on top, 3/4 view.
8. (row 2, column 4) A small campfire, two crossed logs, an orange flame with a yellow core.
9. (row 3, column 1) A white marble Doric column with grey stone base and capital.
10. (row 3, column 2) The head of a brown eagle in profile facing right, gold hooked beak, gold eye.
11. (row 3, column 3) A bronze Corinthian helmet, front view, a tall red horsehair crest.
12. (row 3, column 4) A thick bronze arrow pointing left, a smaller ivory arrow inlaid in its centre.
13. (row 4, column 1) A thick green check mark.
14. (row 4, column 2) A thick red X.
15. (row 4, column 3) One thick bronze chevron pointing left.
16. (row 4, column 4) One thick bronze chevron pointing right.
```

## Sheet 04: Tools and menus

File: `sheet-04.png`. Current icons in the same cells: [current/sheet-04.png](current/sheet-04.png)

![Sheet 04, current icons](current/sheet-04.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `ui:gear` | Settings. | an iron cog wheel with a bronze hub |
| 2 | R1 C2 | 256-511, 0-255 | `ui:info` | Info, help, explain. | a round bronze disc with a bold ivory lowercase letter i |
| 3 | R1 C3 | 512-767, 0-255 | `ui:lock` | Locked. Reserved: only for locked things. | a padlock, steel shackle, bronze body, dark keyhole |
| 4 | R1 C4 | 768-1023, 0-255 | `ui:pen` | Rename, edit. | a pencil lying diagonally, wooden body, ivory tip at the lower left, red end at the upper right |
| 5 | R2 C1 | 0-255, 256-511 | `ui:copy` | Copy (army preset, code). | two overlapping sheets of paper, the back one grey, the front one ivory with three text lines |
| 6 | R2 C2 | 256-511, 256-511 | `ui:bin` | Delete. | an iron waste bin with a lid and vertical ribs |
| 7 | R2 C3 | 512-767, 256-511 | `ui:map` | World map, campaign map. | a folded parchment map in three panels, a dotted route line, a small red X |
| 8 | R2 C4 | 768-1023, 256-511 | `ui:flag` | Clan, banner, claim, sell. | a red swallow-tailed pennant on a wooden pole with a gold finial |
| 9 | R3 C1 | 0-255, 512-767 | `ui:tent` | Camp, rest. | a white canvas tent with a dark doorway and a small red pennant on top |
| 10 | R3 C2 | 256-511, 512-767 | `ui:repair` | Repair gear. | a smith's hammer, wooden handle and iron head, striking a small iron anvil |
| 11 | R3 C3 | 512-767, 512-767 | `ui:shop` | Shop. Reserved: only for the shop. | a market stall, red-and-white striped awning on wooden posts over a counter holding clay pots and gold coins |
| 12 | R3 C4 | 768-1023, 512-767 | `ui:pass` | Season pass. | a parchment ticket with text lines and a red wax seal with ribbon tails at the lower right |
| 13 | R4 C1 | 0-255, 768-1023 | `ui:chest` | Reward chest (duels, results). | a closed wooden treasure chest with bronze bands and a gold lock plate |
| 14 | R4 C2 | 256-511, 768-1023 | `ui:scales` | Point budget of a duel army. | bronze balance scales with two gold pans hanging level and a gold knob on top |
| 15 | R4 C3 | 512-767, 768-1023 | `ui:log` | Raid log, history. | an open papyrus scroll with wooden rollers at top and bottom and text lines |
| 16 | R4 C4 | 768-1023, 768-1023 | `ui:podium` | Leaderboards. Reserved. | a three-step stone podium, the tall middle step gold with an engraved numeral 1 (the only number allowed in the whole set), a small gold star above it |

Sheet prompt:

```text
Sheet 04 of 10: tools and menus.
Cells, in reading order:
1. (row 1, column 1) An iron cog wheel with a bronze hub.
2. (row 1, column 2) A round bronze disc with a bold ivory lowercase letter i.
3. (row 1, column 3) A padlock, steel shackle, bronze body, dark keyhole.
4. (row 1, column 4) A pencil lying diagonally, wooden body, ivory tip at the lower left, red end at the upper right.
5. (row 2, column 1) Two overlapping sheets of paper, the back one grey, the front one ivory with three text lines.
6. (row 2, column 2) An iron waste bin with a lid and vertical ribs.
7. (row 2, column 3) A folded parchment map in three panels, a dotted route line, a small red X.
8. (row 2, column 4) A red swallow-tailed pennant on a wooden pole with a gold finial.
9. (row 3, column 1) A white canvas tent with a dark doorway and a small red pennant on top.
10. (row 3, column 2) A smith's hammer, wooden handle and iron head, striking a small iron anvil.
11. (row 3, column 3) A market stall, red-and-white striped awning on wooden posts over a counter holding clay pots and gold coins.
12. (row 3, column 4) A parchment ticket with text lines and a red wax seal with ribbon tails at the lower right.
13. (row 4, column 1) A closed wooden treasure chest with bronze bands and a gold lock plate.
14. (row 4, column 2) Bronze balance scales with two gold pans hanging level and a gold knob on top.
15. (row 4, column 3) An open papyrus scroll with wooden rollers at top and bottom and text lines.
16. (row 4, column 4) A three-step stone podium, the tall middle step gold with an engraved numeral 1 (the only number allowed in the whole set), a small gold star above it.
```

## Sheet 05: Modes and currencies

File: `sheet-05.png`. Current icons in the same cells: [current/sheet-05.png](current/sheet-05.png)

![Sheet 05, current icons](current/sheet-05.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `ui:ladder` | Duels: Ladder mode. | a stepped stone tower of three tiers with a red pennant on top |
| 2 | R1 C2 | 256-511, 0-255 | `ui:arena` | Duels: Arena mode. | a grey stone amphitheatre facade with two rows of dark arches and a small red flag on top |
| 3 | R1 C3 | 512-767, 0-255 | `ui:raid` | Raids. | a burning torch, wooden handle, bronze cup, orange-yellow flame |
| 4 | R1 C4 | 768-1023, 0-255 | `ui:march` | Campaign. | a wooden signpost with two arrow boards pointing left and right, on a stone base |
| 5 | R2 C1 | 0-255, 256-511 | `ui:coin` | Gold (campaign and war gold). Resource icon. | a gold coin, face-on, thick rim, a dark embossed owl in the centre |
| 6 | R2 C2 | 256-511, 256-511 | `ui:drachma` | Drachmae (premium currency). Resource icon. | a silver coin, face-on, thick rim, a dark embossed triangle (Greek delta) in the centre |
| 7 | R2 C3 | 512-767, 256-511 | `ui:laurel` | Glory. Resource icon. | a green laurel wreath open at the top, tied with a red ribbon at the bottom |
| 8 | R2 C4 | 768-1023, 256-511 | `ui:tgstar` | Telegram Stars (real money). Must not look like the gold rating star. | a fat, puffy, rounded five-point star, orange outside with a yellow inner star, like the Telegram Stars symbol |
| 9 | R3 C1 | 0-255, 512-767 | `ui:power` | Power (army strength). Resource icon. | Herakles' club: a knobbly wooden club, diagonal, thick end upper right, a gold band at the grip |
| 10 | R3 C2 | 256-511, 512-767 | `ui:trophy` | Wins. Resource icon. | a gold two-handled victor's cup on a wooden base |
| 11 | R3 C3 | 512-767, 512-767 | `ui:xp` | Experience (XP). Resource icon. | two stacked blue chevrons pointing up |
| 12 | R3 C4 | 768-1023, 512-767 | `ui:food` | Food (resource bar, small). | a single golden wheat ear on a green stalk with two leaves |
| 13 | R4 C1 | 0-255, 768-1023 | `ui:wood` | Wood (resource bar, small). | three log ends stacked in a pyramid, cut faces with growth rings |
| 14 | R4 C2 | 256-511, 768-1023 | `ui:bronze` | Bronze (resource bar, small). | three bronze ingots stacked in a pyramid |
| 15 | R4 C3 | 512-767, 768-1023 | `ui:amphora` | Loot, merchant, trade. | a terracotta amphora with two handles and a dark band round the neck |
| 16 | R4 C4 | 768-1023, 768-1023 | `ui:horn` | Battle: blow the war horn. | a curved ivory animal horn, pointed tip at the lower left, curving up to a wide mouth at the upper right ringed with two bronze bands |

Sheet prompt:

```text
Sheet 05 of 10: modes and currencies.
Cells, in reading order:
1. (row 1, column 1) A stepped stone tower of three tiers with a red pennant on top.
2. (row 1, column 2) A grey stone amphitheatre facade with two rows of dark arches and a small red flag on top.
3. (row 1, column 3) A burning torch, wooden handle, bronze cup, orange-yellow flame.
4. (row 1, column 4) A wooden signpost with two arrow boards pointing left and right, on a stone base.
5. (row 2, column 1) A gold coin, face-on, thick rim, a dark embossed owl in the centre.
6. (row 2, column 2) A silver coin, face-on, thick rim, a dark embossed triangle (Greek delta) in the centre.
7. (row 2, column 3) A green laurel wreath open at the top, tied with a red ribbon at the bottom.
8. (row 2, column 4) A fat, puffy, rounded five-point star, orange outside with a yellow inner star, like the Telegram Stars symbol.
9. (row 3, column 1) Herakles' club: a knobbly wooden club, diagonal, thick end upper right, a gold band at the grip.
10. (row 3, column 2) A gold two-handled victor's cup on a wooden base.
11. (row 3, column 3) Two stacked blue chevrons pointing up.
12. (row 3, column 4) A single golden wheat ear on a green stalk with two leaves.
13. (row 4, column 1) Three log ends stacked in a pyramid, cut faces with growth rings.
14. (row 4, column 2) Three bronze ingots stacked in a pyramid.
15. (row 4, column 3) A terracotta amphora with two handles and a dark band round the neck.
16. (row 4, column 4) A curved ivory animal horn, pointed tip at the lower left, curving up to a wide mouth at the upper right ringed with two bronze bands.
```

## Sheet 06: Camp, status badges and resources

File: `sheet-06.png`. Current icons in the same cells: [current/sheet-06.png](current/sheet-06.png)

![Sheet 06, current icons](current/sheet-06.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `ui:beast` | Mythic beasts, beast trials. | a golden paw print, four toes and a pad |
| 2 | R1 C2 | 256-511, 0-255 | `ui:anvil` | Build, forge. | an iron anvil standing on a wooden block |
| 3 | R1 C3 | 512-767, 0-255 | `camp:palisade` | Camp building: Palisade. | a wooden palisade of five sharpened stakes lashed to two horizontal rails |
| 4 | R1 C4 | 768-1023, 0-255 | `camp:granary` | Camp building: Granary. | a small stone granary with a golden thatched gable roof, a round vent and an arched door |
| 5 | R2 C1 | 0-255, 256-511 | `camp:forge` | Camp building: Forge. | a grey anvil on a stone plinth with a flame burning above it |
| 6 | R2 C2 | 256-511, 256-511 | `camp:barracks` | Camp building: Barracks. | a small Greek temple, red tiled pediment roof, four white columns, stone steps |
| 7 | R2 C3 | 512-767, 256-511 | `camp:watchtower` | Camp building: Watchtower. | a wooden watchtower with a red pyramid roof and splayed legs |
| 8 | R2 C4 | 768-1023, 256-511 | `chrome:sync_synced` | Cloud save: synced. Shown at 12 x 7 UI px. | a wide cream cloud (about 12:7 wide) with a green check mark on it |
| 9 | R3 C1 | 0-255, 512-767 | `chrome:sync_syncing` | Cloud save: syncing. | a wide cream cloud (about 12:7 wide) with a blue up arrow on it |
| 10 | R3 C2 | 256-511, 512-767 | `chrome:sync_offline` | Cloud save: offline / local only. | a wide grey cloud (about 12:7 wide) with a red X on it |
| 11 | R3 C3 | 512-767, 512-767 | `chrome:supporter_banner` | Supporter badge beside a name (8 x 12 UI px, also shown mirrored). | a tall narrow standard: a wooden pole with a gold ball finial and a gold swallow-tailed banner hanging to the right |
| 12 | R3 C4 | 768-1023, 512-767 | `goods:gold` | Gold as a good (wallet, rewards, trade). | a small pile of three gold coins |
| 13 | R4 C1 | 0-255, 768-1023 | `goods:drachmae` | Drachmae as a good (wallet, shop). | a large silver coin with an embossed owl of Athena |
| 14 | R4 C2 | 256-511, 768-1023 | `goods:food` | Food as a good. | a sheaf of golden wheat ears tied with a band |
| 15 | R4 C3 | 512-767, 768-1023 | `goods:wood` | Wood as a good. | two cut logs lying stacked, the cut ends facing the viewer on the right |
| 16 | R4 C4 | 768-1023, 768-1023 | `goods:bronze` | Bronze as a good. | a bronze oxhide ingot: a flat slab with four flared corners and concave sides |

Sheet prompt:

```text
Sheet 06 of 10: camp, status badges and resources.
Cells, in reading order:
1. (row 1, column 1) A golden paw print, four toes and a pad.
2. (row 1, column 2) An iron anvil standing on a wooden block.
3. (row 1, column 3) A wooden palisade of five sharpened stakes lashed to two horizontal rails.
4. (row 1, column 4) A small stone granary with a golden thatched gable roof, a round vent and an arched door.
5. (row 2, column 1) A grey anvil on a stone plinth with a flame burning above it.
6. (row 2, column 2) A small Greek temple, red tiled pediment roof, four white columns, stone steps.
7. (row 2, column 3) A wooden watchtower with a red pyramid roof and splayed legs.
8. (row 2, column 4) A wide cream cloud (about 12:7 wide) with a green check mark on it.
9. (row 3, column 1) A wide cream cloud (about 12:7 wide) with a blue up arrow on it.
10. (row 3, column 2) A wide grey cloud (about 12:7 wide) with a red X on it.
11. (row 3, column 3) A tall narrow standard: a wooden pole with a gold ball finial and a gold swallow-tailed banner hanging to the right.
12. (row 3, column 4) A small pile of three gold coins.
13. (row 4, column 1) A large silver coin with an embossed owl of Athena.
14. (row 4, column 2) A sheaf of golden wheat ears tied with a band.
15. (row 4, column 3) Two cut logs lying stacked, the cut ends facing the viewer on the right.
16. (row 4, column 4) A bronze oxhide ingot: a flat slab with four flared corners and concave sides.
```

## Sheet 07: Goods and weapons

File: `sheet-07.png`. Current icons in the same cells: [current/sheet-07.png](current/sheet-07.png)

![Sheet 07, current icons](current/sheet-07.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `goods:recruits` | Recruits (new men). | a bronze Corinthian helmet, front view, a red crest |
| 2 | R1 C2 | 256-511, 0-255 | `goods:healing_salve` | Consumable: Healing salve. | a squat terracotta jar with a linen cover tied with cord and a green leaf sprig |
| 3 | R1 C3 | 512-767, 0-255 | `goods:morale_wine` | Consumable: Wine (morale). | a red-figure terracotta amphora with a black painted band |
| 4 | R1 C4 | 768-1023, 0-255 | `goods:war_horn` | Consumable: War horn. | a long curved ox horn with a leather carrying strap |
| 5 | R2 C1 | 0-255, 256-511 | `goods:sharpening_stone` | Consumable: Sharpening stone. | a grey whetstone bar, diagonal, a leather loop at one end and a bright spark at the other |
| 6 | R2 C2 | 256-511, 256-511 | `goods:march_rations` | Consumable: March rations. | a round loaf of bread with a cross scored on top, on a folded linen cloth |
| 7 | R2 C3 | 512-767, 256-511 | `item:spear` | Weapon: Dory spear, Bronze-shod dory. | a long spear: wooden shaft, leaf-shaped steel head |
| 8 | R2 C4 | 768-1023, 256-511 | `item:spear_short` | Weapon: Longche (short spear). | a short thick spear: wooden shaft, steel head on a bronze socket |
| 9 | R3 C1 | 0-255, 512-767 | `item:lance` | Weapon: Xyston lance. | a long cavalry lance: wooden shaft with a leather-wrapped grip in the middle, slim steel head |
| 10 | R3 C2 | 256-511, 512-767 | `item:javelins` | Weapon: Akontia, Iron saunia (javelins). | a bundle of three slim javelins, slightly fanned, bronze heads |
| 11 | R3 C3 | 512-767, 512-767 | `item:sword` | Weapon: Xiphos. | a short Greek sword: leaf-shaped bronze blade, small cross-guard, wooden grip |
| 12 | R3 C4 | 768-1023, 512-767 | `item:kopis` | Weapon: Kopis, Falcata. | a forward-curving single-edged chopping sword, steel blade, hooked grip |
| 13 | R4 C1 | 0-255, 768-1023 | `item:longsword` | Weapon: Celtic longsword. | a long straight iron sword, simple cross-guard, round pommel |
| 14 | R4 C2 | 256-511, 768-1023 | `item:axe` | Weapon: War axe. | a war axe: wooden haft, bearded steel blade |
| 15 | R4 C3 | 512-767, 768-1023 | `item:club` | Weapon: Club. | a heavy knobbly wooden club, thick end at the upper right |
| 16 | R4 C4 | 768-1023, 768-1023 | `item:falx` | Weapon: Falx. | a Dacian falx: a long wooden haft with an inward-curving sickle-like steel blade |

Sheet prompt:

```text
Sheet 07 of 10: goods and weapons.
Weapons are drawn diagonally across the cell: grip / butt at the lower left, tip / blade at the
upper right, at the same 45 degree angle (bows and the sling hang upright). Shields, helmets and armour are front views, upright.
Trinkets are small jewellery objects; when hanging from a cord, the cord's two ends go up to the
top of the icon area.
Cells, in reading order:
1. (row 1, column 1) A bronze Corinthian helmet, front view, a red crest.
2. (row 1, column 2) A squat terracotta jar with a linen cover tied with cord and a green leaf sprig.
3. (row 1, column 3) A red-figure terracotta amphora with a black painted band.
4. (row 1, column 4) A long curved ox horn with a leather carrying strap.
5. (row 2, column 1) A grey whetstone bar, diagonal, a leather loop at one end and a bright spark at the other.
6. (row 2, column 2) A round loaf of bread with a cross scored on top, on a folded linen cloth.
7. (row 2, column 3) A long spear: wooden shaft, leaf-shaped steel head.
8. (row 2, column 4) A short thick spear: wooden shaft, steel head on a bronze socket.
9. (row 3, column 1) A long cavalry lance: wooden shaft with a leather-wrapped grip in the middle, slim steel head.
10. (row 3, column 2) A bundle of three slim javelins, slightly fanned, bronze heads.
11. (row 3, column 3) A short Greek sword: leaf-shaped bronze blade, small cross-guard, wooden grip.
12. (row 3, column 4) A forward-curving single-edged chopping sword, steel blade, hooked grip.
13. (row 4, column 1) A long straight iron sword, simple cross-guard, round pommel.
14. (row 4, column 2) A war axe: wooden haft, bearded steel blade.
15. (row 4, column 3) A heavy knobbly wooden club, thick end at the upper right.
16. (row 4, column 4) A Dacian falx: a long wooden haft with an inward-curving sickle-like steel blade.
```

## Sheet 08: Weapons, shields and helmets

File: `sheet-08.png`. Current icons in the same cells: [current/sheet-08.png](current/sheet-08.png)

![Sheet 08, current icons](current/sheet-08.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `item:rhomphaia` | Weapon: Rhomphaia. | a Thracian rhomphaia: a long haft with a long, slightly curved steel blade |
| 2 | R1 C2 | 256-511, 0-255 | `item:sling` | Weapon: Sling, Balearic sling, Rhodian sling. | a leather sling hanging in a V: two cords, a pouch with a stone at the bottom, a finger loop at one end |
| 3 | R1 C3 | 512-767, 0-255 | `item:bow` | Weapon: Composite bow, Cretan bow. | a recurved composite bow standing upright, string on the left, an arrow nocked and pointing right |
| 4 | R1 C4 | 768-1023, 0-255 | `item:bow_short` | Weapon: Scythian bow. | a short double-curved Scythian bow standing upright with an arrow nocked and pointing right |
| 5 | R2 C1 | 0-255, 256-511 | `item:hoplon` | Shield: Hoplon, Argive aspis. | a round domed bronze hoplite shield, front view, wide flat rim |
| 6 | R2 C2 | 256-511, 256-511 | `item:oval` | Shield: Thureos, Celtic long shield. | a tall oval wooden shield, front view, a vertical central spine and an iron boss |
| 7 | R2 C3 | 512-767, 256-511 | `item:pelte` | Shield: Pelte. | a light crescent-shaped wicker shield covered in tan leather, front view |
| 8 | R2 C4 | 768-1023, 256-511 | `item:buckler` | Shield: Buckler. | a small round shield with concentric bronze rings and a central boss |
| 9 | R3 C1 | 0-255, 512-767 | `item:cap` | Helmet: Cap (leather / felt). | a simple brown leather skullcap made of stitched segments |
| 10 | R3 C2 | 256-511, 512-767 | `item:pilos` | Helmet: Pilos. | a conical bronze pilos helmet with a narrow rim |
| 11 | R3 C3 | 512-767, 512-767 | `item:montefortino` | Helmet: Montefortino. | a Montefortino helmet: rounded bronze bowl, top knob, short neck flare, hinged cheek guards |
| 12 | R3 C4 | 768-1023, 512-767 | `item:chalcidian` | Helmet: Chalcidian. | a Chalcidian bronze helmet with cheek guards, open face and a small red crest |
| 13 | R4 C1 | 0-255, 768-1023 | `item:hood` | Helmet: Hood (Scythian felt hood). | a brown felt Scythian hood with a pointed top bent forward and long side flaps |
| 14 | R4 C2 | 256-511, 768-1023 | `item:thracian` | Helmet: Thracian. | a Thracian bronze helmet: tall forward-curving Phrygian crest, short brim, cheek guards |
| 15 | R4 C3 | 512-767, 768-1023 | `item:boeotian` | Helmet: Boeotian. | a Boeotian cavalry helmet: bronze dome with a wide, folded, downturned brim |
| 16 | R4 C4 | 768-1023, 768-1023 | `item:attic` | Helmet: Attic. | an Attic bronze helmet: rounded bowl, brow ridge, hinged cheek guards, a crest holder |

Sheet prompt:

```text
Sheet 08 of 10: weapons, shields and helmets.
Weapons are drawn diagonally across the cell: grip / butt at the lower left, tip / blade at the
upper right, at the same 45 degree angle (bows and the sling hang upright). Shields, helmets and armour are front views, upright.
Trinkets are small jewellery objects; when hanging from a cord, the cord's two ends go up to the
top of the icon area.
Cells, in reading order:
1. (row 1, column 1) A Thracian rhomphaia: a long haft with a long, slightly curved steel blade.
2. (row 1, column 2) A leather sling hanging in a V: two cords, a pouch with a stone at the bottom, a finger loop at one end.
3. (row 1, column 3) A recurved composite bow standing upright, string on the left, an arrow nocked and pointing right.
4. (row 1, column 4) A short double-curved Scythian bow standing upright with an arrow nocked and pointing right.
5. (row 2, column 1) A round domed bronze hoplite shield, front view, wide flat rim.
6. (row 2, column 2) A tall oval wooden shield, front view, a vertical central spine and an iron boss.
7. (row 2, column 3) A light crescent-shaped wicker shield covered in tan leather, front view.
8. (row 2, column 4) A small round shield with concentric bronze rings and a central boss.
9. (row 3, column 1) A simple brown leather skullcap made of stitched segments.
10. (row 3, column 2) A conical bronze pilos helmet with a narrow rim.
11. (row 3, column 3) A Montefortino helmet: rounded bronze bowl, top knob, short neck flare, hinged cheek guards.
12. (row 3, column 4) A Chalcidian bronze helmet with cheek guards, open face and a small red crest.
13. (row 4, column 1) A brown felt Scythian hood with a pointed top bent forward and long side flaps.
14. (row 4, column 2) A Thracian bronze helmet: tall forward-curving Phrygian crest, short brim, cheek guards.
15. (row 4, column 3) A Boeotian cavalry helmet: bronze dome with a wide, folded, downturned brim.
16. (row 4, column 4) An Attic bronze helmet: rounded bowl, brow ridge, hinged cheek guards, a crest holder.
```

## Sheet 09: Helmets, armour and trinkets

File: `sheet-09.png`. Current icons in the same cells: [current/sheet-09.png](current/sheet-09.png)

![Sheet 09, current icons](current/sheet-09.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `item:corinthian` | Helmet: Corinthian. | a Corinthian helmet, front view: a full bronze face cover with almond eye openings, a nose guard and a crest stub |
| 2 | R1 C2 | 256-511, 0-255 | `item:leather` | Armour: Leather armour. | a brown leather jerkin, front view, with a belt |
| 3 | R1 C3 | 512-767, 0-255 | `item:linothorax` | Armour: Linothorax. | a white layered linen cuirass, front view, shoulder flaps and a skirt of strips |
| 4 | R1 C4 | 768-1023, 0-255 | `item:scale` | Armour: Scale armour. | a scale-armour shirt, front view, overlapping bronze scales |
| 5 | R2 C1 | 0-255, 256-511 | `item:mail` | Armour: Mail. | an iron mail shirt, front view, grey rings, short sleeves and a belt |
| 6 | R2 C2 | 256-511, 256-511 | `item:cuirass` | Armour: Bronze cuirass. | a bronze muscle cuirass, front view, sculpted chest and abdomen, strips hanging below |
| 7 | R2 C3 | 512-767, 256-511 | `trinket:owl_amulet` | Trinket: Owl amulet. | a round silver amulet with an owl of Athena in relief, on a cord |
| 8 | R2 C4 | 768-1023, 256-511 | `trinket:herakles_knot` | Trinket: Herakles knot. | a gold Herakles knot (two interlocked loops) with a red garnet in the centre |
| 9 | R3 C1 | 0-255, 512-767 | `trinket:scarab` | Trinket: Faience scarab. | a turquoise faience scarab beetle, top view |
| 10 | R3 C2 | 256-511, 512-767 | `trinket:laurel` | Trinket: Laurel token. | a small green laurel wreath, almost a closed circle, on a cord |
| 11 | R3 C3 | 512-767, 512-767 | `trinket:tanit_eye` | Trinket: Eye of Tanit. | a round terracotta pendant with the bronze sign of Tanit (a triangle, a bar and a disc), on a cord |
| 12 | R3 C4 | 768-1023, 512-767 | `trinket:boar_tusk` | Trinket: Boar tusk. | a curved white boar tusk hanging from a cord |
| 13 | R4 C1 | 0-255, 768-1023 | `trinket:eye_bead` | Trinket: Eye bead. | a blue and white glass eye bead (nazar) on a cord |
| 14 | R4 C2 | 256-511, 768-1023 | `trinket:wolf_tooth` | Trinket: Wolf-tooth string. | a necklace arc of pointed wolf teeth on a cord |
| 15 | R4 C3 | 512-767, 768-1023 | `trinket:torc` | Trinket: Bronze torc. | a twisted bronze Celtic torc, an open ring with knob ends at the bottom |
| 16 | R4 C4 | 768-1023, 768-1023 | `trinket:hermes_token` | Trinket: Hermes token. | a round bronze pendant with a caduceus, on a cord |

Sheet prompt:

```text
Sheet 09 of 10: helmets, armour and trinkets.
Weapons are drawn diagonally across the cell: grip / butt at the lower left, tip / blade at the
upper right, at the same 45 degree angle (bows and the sling hang upright). Shields, helmets and armour are front views, upright.
Trinkets are small jewellery objects; when hanging from a cord, the cord's two ends go up to the
top of the icon area.
Cells, in reading order:
1. (row 1, column 1) A Corinthian helmet, front view: a full bronze face cover with almond eye openings, a nose guard and a crest stub.
2. (row 1, column 2) A brown leather jerkin, front view, with a belt.
3. (row 1, column 3) A white layered linen cuirass, front view, shoulder flaps and a skirt of strips.
4. (row 1, column 4) A scale-armour shirt, front view, overlapping bronze scales.
5. (row 2, column 1) An iron mail shirt, front view, grey rings, short sleeves and a belt.
6. (row 2, column 2) A bronze muscle cuirass, front view, sculpted chest and abdomen, strips hanging below.
7. (row 2, column 3) A round silver amulet with an owl of Athena in relief, on a cord.
8. (row 2, column 4) A gold Herakles knot (two interlocked loops) with a red garnet in the centre.
9. (row 3, column 1) A turquoise faience scarab beetle, top view.
10. (row 3, column 2) A small green laurel wreath, almost a closed circle, on a cord.
11. (row 3, column 3) A round terracotta pendant with the bronze sign of Tanit (a triangle, a bar and a disc), on a cord.
12. (row 3, column 4) A curved white boar tusk hanging from a cord.
13. (row 4, column 1) A blue and white glass eye bead (nazar) on a cord.
14. (row 4, column 2) A necklace arc of pointed wolf teeth on a cord.
15. (row 4, column 3) A twisted bronze Celtic torc, an open ring with knob ends at the bottom.
16. (row 4, column 4) A round bronze pendant with a caduceus, on a cord.
```

## Sheet 10: Trinkets

File: `sheet-10.png`. Current icons in the same cells: [current/sheet-10.png](current/sheet-10.png)

![Sheet 10, current icons](current/sheet-10.png)

| Cell | Row, col | Pixel box (x, y) | ID | Meaning in the game | Shape to draw |
| --- | --- | --- | --- | --- | --- |
| 1 | R1 C1 | 0-255, 0-255 | `trinket:votive_shield` | Trinket: Votive shield. | a tiny round gold votive shield pendant on a cord |
| 2 | R1 C2 | 256-511, 0-255 | `trinket:iron_ring` | Trinket: Iron ring. | a plain thick iron ring, 3/4 view |
| 3 | R1 C3 | 512-767, 0-255 | `trinket:knucklebones` | Trinket: Knucklebones. | four small ivory knucklebones (astragali) scattered |
| 4 | R1 C4 | 768-1023, 0-255 | `trinket:gorgoneion` | Trinket: Gorgoneion. | a silver medallion of Medusa's face with snake hair, tongue out |
| 5 | R2 C1 | 0-255, 256-511 | `trinket:bulla` | Trinket: Golden bulla. | a round lens-shaped gold locket (bulla) on a cord |
| 6 | R2 C2 | 256-511, 256-511 | `trinket:horse_pendant` | Trinket: Horse pendant. | a round bronze pendant with a dark horse silhouette, on a cord |
| 7 | R2 C3 | 512-767, 256-511 | `trinket:lion_claw` | Trinket: Lion claw. | a dark curved lion claw hanging from a cord |
| 8 | R2 C4 | 768-1023, 256-511 | `trinket:serpent_ring` | Trinket: Serpent ring. | a silver ring shaped as a coiled snake, its head on top |
| 9 | R3 C1 | 0-255, 512-767 | `trinket:signet_ring` | Trinket: Signet ring. | a gold signet ring with an engraved oval bezel |
| 10 | R3 C2 | 256-511, 512-767 | `trinket:curse_tablet` | Trinket: Curse tablet. | a small grey lead tablet with scratched lines of writing, slightly tilted |
| 11 | R3 C3 | 512-767, 512-767 | `trinket:bes_amulet` | Trinket: Bes amulet. | a turquoise faience amulet of Bes, the squat Egyptian god with a feather crown |
| 12 | R3 C4 | 768-1023, 512-767 | `trinket:thumb_ring` | Trinket: Archer's thumb ring. | a cream bone archer's thumb ring, a short wide cylinder with a lip |
| 13 | R4 C1 | 0-255, 768-1023 | `trinket:faravahar` | Trinket: Winged disc. | a gold winged sun disc with spread wings |
| 14 | R4 C2 | 256-511, 768-1023 | `trinket:gold_torc` | Trinket: Gold torc. | a thick twisted gold torc, an open ring with round gold ends at the bottom |
| 15 | R4 C3 | 512-767, 768-1023 | `trinket:gold_stag` | Trinket: Gold stag plaque. | a rectangular gold plaque with an embossed stag |
| 16 | R4 C4 | 768-1023, 768-1023 | `trinket:pythian_token` | Trinket: Pythian crown. | a victor's crown of dark green bay leaves bound with silver |

Sheet prompt:

```text
Sheet 10 of 10: trinkets.
Weapons are drawn diagonally across the cell: grip / butt at the lower left, tip / blade at the
upper right, at the same 45 degree angle (bows and the sling hang upright). Shields, helmets and armour are front views, upright.
Trinkets are small jewellery objects; when hanging from a cord, the cord's two ends go up to the
top of the icon area.
Cells, in reading order:
1. (row 1, column 1) A tiny round gold votive shield pendant on a cord.
2. (row 1, column 2) A plain thick iron ring, 3/4 view.
3. (row 1, column 3) Four small ivory knucklebones (astragali) scattered.
4. (row 1, column 4) A silver medallion of Medusa's face with snake hair, tongue out.
5. (row 2, column 1) A round lens-shaped gold locket (bulla) on a cord.
6. (row 2, column 2) A round bronze pendant with a dark horse silhouette, on a cord.
7. (row 2, column 3) A dark curved lion claw hanging from a cord.
8. (row 2, column 4) A silver ring shaped as a coiled snake, its head on top.
9. (row 3, column 1) A gold signet ring with an engraved oval bezel.
10. (row 3, column 2) A small grey lead tablet with scratched lines of writing, slightly tilted.
11. (row 3, column 3) A turquoise faience amulet of Bes, the squat Egyptian god with a feather crown.
12. (row 3, column 4) A cream bone archer's thumb ring, a short wide cylinder with a lip.
13. (row 4, column 1) A gold winged sun disc with spread wings.
14. (row 4, column 2) A thick twisted gold torc, an open ring with round gold ends at the bottom.
15. (row 4, column 3) A rectangular gold plaque with an embossed stag.
16. (row 4, column 4) A victor's crown of dark green bay leaves bound with silver.
```

## Single-icon prompt

For re-rolling one icon that came out wrong. Paste the global prompt's
**Art style** part, then:

```text
Create ONE square image, 1024 x 1024 pixels, flat pure magenta #FF00FF background, with a single
game icon centred in it, filling the central 832 x 832 pixels and touching no edge. No text,
no frame, no shadow on the background.
The icon: <shape to draw, from the sheet table>.
It must match the other icons of the set: same outline, lighting and level of detail.
```

## ID reference

| Prefix | Comes from | Notes |
| --- | --- | --- |
| `ui:` | `VECTOR_ICONS` / `UI_ICONS`, texture keys `icon_<name>`, `iconL_<name>`, `iconD_<name>` | battle FX also reuses these (`fxicon_*`) |
| `camp:` | `VECTOR_CAMP_ICONS`, texture keys `icon_camp_<name>` | |
| `chrome:` | `src/ui/online.ts`, texture keys `sync_*`, `supporter_banner` | not square: draw the cloud wide and the banner tall inside the cell |
| `goods:` | `src/art/goodsIcons.ts` (`renderGoodsIconHD`) | resources and battle consumables |
| `item:` | `src/art/itemIconsHD.ts`, by the item's `art` key in `src/data/items.ts` | one icon per art key: items sharing an art key (e.g. Dory and Bronze-shod dory) share the picture; rarity frames and glow stay in code |
| `trinket:` | `src/art/itemIconsHD.ts`, by item ID (`art: 'none'`) | |

Rules that still hold for the new art (docs/UI_KIT.md "One icon, one meaning"):
the resource icons `ui:coin`, `ui:laurel`, `ui:drachma`, `ui:tgstar`,
`ui:power`, `ui:trophy` and `ui:xp` must not look alike; `ui:star`,
`ui:podium`, `ui:lock` and `ui:shop` are reserved for their one meaning;
`ui:tgstar` must never look like the gold rating star `ui:star`.

## Not in the atlas

Not icons, or drawn by other pipelines, so not part of this replacement:
unit and hero sprites and portraits (`paperdoll.ts`), cosmetic previews
(`cosmeticArt.ts`), shield emblems (`emblems.ts`), beasts, map, camp and
terrain art, battle markers (selection rings, plates, blood, sparks), the
tutorial hand (`ghost_hand`), and the old 12 x 12 pixel icons in
`src/art/icons.ts` (fallback only, superseded by the `ui:` set).
