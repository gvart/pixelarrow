# UX Spec: Landscape, tablet and desktop layouts (v6)

> **Status**: Draft (P2-UX-LAND), self-reviewed with `/ux-review` (§18)
> **Date**: 2026-10-13
> **Template**: Layout spec (cross-screen). It covers every screen family, not one screen.
> **Platform Target**: play.pixelarrow.app and the Telegram Mini App, across the v6 screen matrix: phone portrait (390x844, 360x780, 320x693), phone landscape (844x390), tablet portrait (768x1024, 820x1180) and landscape (1024x768, 1280x800, 1440x900, 1920x1080). Touch, mouse and keyboard.
> **Source of the requirement**: `docs/playbook/director-brief-v6.md` goal 3 ("True landscape layouts … not a letterboxed portrait column, plus tablet portrait. Phones stay portrait-first") and the screen matrix; decision V6-018.
> **Inputs**: `docs/v6/audit/UI.md` (A1-UI: the element inventories, findings and effort order), `design/ux/input-v6.md` (hover, focus, cursor and keys; ADR-0012), `design/ux/accounts-v6.md` §1.6 (account surfaces per size class), `docs/UI_KIT.md`, `src/ui/kit.ts` `uiMetrics`, `index.html`.
> **Out of scope**: key bindings and hotkeys (owned by input-v6.md; this spec adds none), account form sizes (accounts-v6.md §1.6), the landing site.

## 0. Purpose and principles

**Player need.** A player on a laptop, a tablet or a phone held sideways wants the game to use their screen: a battlefield that fills the window, lists that show the detail next to them, and every action in reach without scrolling. Today they get a 0.64-aspect phone column with 52–64% of a laptop screen black (UI.md §1), and at 844x390 the game is broken (266 violations on 89 of 196 screens).

**Player context on arrival.** Same journeys as v5. Desktop players arrive from the landing page's "Play in browser" with a mouse and keyboard; tablet players hold the device in either orientation; phone players turn the phone sideways mostly for battles.

Principles:

1. **Phones portrait stay exactly as v5.** Compact portrait is the reference layout; every other class rearranges the same elements, it never redesigns them.
2. **Rearrange, never drop.** Every element that exists at 390x844 exists at every size, either visible or one deliberate step away (a "more" control or a pane switch). The checklists in §6–§13 and the `element-parity` check (§5) enforce it.
3. **Fields fill the screen; menus get columns.** A field scene (battle, world, camp, war map) draws its map edge to edge and puts the HUD in edge rails. A menu scene splits its content into panes instead of stretching rows.
4. **Read the size, not the device.** Layout follows the viewport's size class (§1). Input follows `InputHints` (input-v6.md §8). A touch tablet and a mouse laptop at the same size get the same layout.
5. **No letterbox, no stretch.** The canvas always fills the safe area. Content never runs wider than its maximum (§2.3); the space beyond it is the stone stage, never black.
6. **Thumbs on landscape phones live at the left and right edges.** Primary controls in compact landscape go in side rails, not in a bottom bar.

## 1. Size classes and thresholds

Measured on the **safe-area CSS box** of `#game` (after the Telegram and notch insets), never on device pixels. `W` and `H` are CSS px; `short = min(W, H)`; `aspect = W / H`.

| Class | Rule | Orientation variants | Nav |
| --- | --- | --- | --- |
| **compact** | `short < 480` | **compact portrait** (`aspect < 1`): phones, v5 layout. **compact landscape** (`aspect ≥ 1`): phones sideways and short desktop windows. | portrait: bottom tab bar. landscape: left nav rail. |
| **medium** | `short ≥ 480` and not expanded | **medium portrait** (`aspect < 1`): tablets upright, tall windows. **medium landscape** (`1 ≤ aspect < 1.1`, or `W < 960`): near-square windows. | portrait: bottom tab bar. landscape: left nav rail. |
| **expanded** | `short ≥ 480` and `aspect ≥ 1.1` and `W ≥ 960` | one variant | left nav rail |

Floors (below them the game shows the global `RotateCard`, §3.6):
- compact portrait: the v5 floor, 320x568 CSS inside Telegram (about 137×214 UI px).
- compact landscape: `H ≥ 320` CSS (VH ≥ 160 UI px).

### 1.1 The matrix

| Viewport | Class | S | VW × VH (UI px) | Nav | Notes |
| --- | --- | --- | --- | --- | --- |
| 390x844 | compact portrait | 2 | 195 × 422 | tab bar | design size, unchanged |
| 360x780 | compact portrait | 2 | 180 × 390 | tab bar | unchanged |
| 320x693 | compact portrait | 2 | 160 × 346 | tab bar | unchanged (Telegram 320) |
| **844x390** | **compact landscape** | 2 | **422 × 195** | rail (84) | was 124 × 195 in a 250-px sliver |
| 768x1024 | medium portrait | 2 | 384 × 512 | tab bar | two phone-width panes |
| 820x1180 | medium portrait | 2 | 410 × 590 | tab bar | two panes |
| 1024x768 | expanded | 2 | 512 × 384 | rail (72) | was a 492-px column |
| 1280x800 | expanded | 2 | 640 × 400 | rail (72) | the reference landscape size |
| 1440x900 | expanded | 2 | 720 × 450 | rail (72) | content capped at 640 (§2.3) |
| 1920x1080 | expanded | 3 | 640 × 360 | rail (72) | S grows to 3: readable at desk distance |

Two consequences shape every family:
- **Compact landscape has 195 UI px of height.** Nothing that is a fixed vertical stack in v5 survives; everything goes into side-by-side panes and rails.
- **Expanded is about 640 × 360–450 UI px** at every laptop size. One expanded layout designed at 640 × 400 covers 1024 to 1920 (512–720 wide, 360–450 tall).

### 1.2 The `UIMetrics` contract

`uiMetrics(scene)` returns, in addition to `S`, `VW`, `VH`:

| Field | Type | Meaning |
| --- | --- | --- |
| `cls` | `'compact' \| 'medium' \| 'expanded'` | the size class (§1) |
| `land` | `boolean` | `aspect ≥ 1` (decides nav rail vs tab bar) |
| `short` | `boolean` | `VH < 240`, the existing "compact height" switches (Menu, battle) read this instead of their own thresholds |
| `navW` | `number` | width of the nav rail in UI px (0 with a tab bar) |
| `contentW` | `number` | usable content width: `min(VW - navW, CONTENT_MAX)` (§2.3) |

Scenes read only these fields; they never compare `VW` or `VH` with their own magic numbers for layout choices (today: `VH < 300`, `VH < 240`, `VH >= 350`, `VH < 380`, `box.h >= 170|280`, UI.md §1). Resizing or rotating rebuilds the scene through the existing resize path when `cls` or `land` changes; within a class, layouts reflow.

`index.html` drops the `* 0.64` cap: `#game` fills the safe area at every size.

## 2. UI scale policy

### 2.1 Picking S from both dimensions

`S` stays a whole number of CSS px per UI px (times `RS`), so pixel art, panel textures and the 4-pt grid stay crisp. Fractional S is rejected: it blurs the pixel-art panels and breaks the "whole UI px" rule in UI_KIT.md.

| Class | Formula (CSS px) | Clamp |
| --- | --- | --- |
| compact | `floor(min(W / 190, H / 400))`, the v5 formula | 2 … 4 (in practice 2 on every phone) |
| medium | `floor(min(W / 384, H / 480))` | 2 … 3 |
| expanded | `floor(min(W / 480, H / 360))` | 2 … 3; 4 only when `short ≥ 1800` (TVs, 4K at DPR 1) |

The expanded divisors make the reference landscape layout (640 × 400) the target: S steps up when the screen could hold the reference layout at the next size, so 1920x1080 goes to S = 3 (640 × 360) instead of staying at S = 2 with tiny text, the "tiny fixed font sizes" pitfall from `game-ui-ux`. 2560x1440 stays at 3 (853 × 480; content capped, §2.3).

### 2.2 Text size limits

| | UI px | CSS px at S = 2 | S = 3 | S = 4 |
| --- | --- | --- | --- | --- |
| minimum (`TEXT_MIN`) | 6.5 | 13 | 19.5 | 26 |
| body (`TYPE.body`) | 7 | 14 | 21 | 28 |
| display (`TYPE.display`) | 12 | 24 | 36 | 48 |

- **Minimum body text: 14 CSS px; minimum of any text: 13 CSS px.** No class goes below S = 2, so text is never scaled below v5.
- **Maximum body text: 21 CSS px** on every screen up to `short < 1800`. 28 CSS px only on TV-class screens.
- Text is never scaled down to fit (UI_KIT.md). A class that runs out of room changes the layout, not the type.

### 2.3 Maximum widths

All in UI px. Content wider than its maximum is centred in its pane; the space beside it shows the pane's surface (parchment or stone), never black.

| Thing | Max | Why |
| --- | --- | --- |
| `CONTENT_MAX`: the panes region of a menu screen (excluding the nav rail) | 640 | the reference layout; beyond it the stage frame widens instead of the content |
| a reading line (wrapped body text) | 300 | about 60–70 characters, a comfortable measure |
| a list row (ScrollList row, ParchmentRow) | 360 | wider rows are the "stretched brick" finding; use a grid or a second pane instead |
| a button | 240; the hub's primary CTA 300 | a full-pane terracotta bar reads as a banner, not a button |
| a dialog (decision, confirm) | 320 | UI.md §3.1's "about 300" |
| a side panel (§3.4) | 240 … 320 | wide enough for an item card, narrow enough to keep the field visible |
| a tab bar / segmented control | the pane it belongs to | bars are meant to span (`uiStretch`, §5) |

The field (battle, maps) has no maximum: it is full bleed by definition.

## 3. Layout primitives

New Kit components in `src/ui/mosaic/`, each shown on the Kit's new **Layouts** page in all four variants (compact portrait, compact landscape, medium, expanded), which is the acceptance surface (UI.md §3.18).

### 3.1 `AppShell`: nav as a tab bar or a side rail

The hub and sub shells (`addHubShell`, `addSubShell`, `buildPage`) get one layout switch on `land`:

| | Tab bar (`land = false`) | Nav rail (`land = true`) |
| --- | --- | --- |
| Where | bottom, 46 UI px, as v5 | left edge, full height, inside the safe area |
| Width | full width | expanded and medium: 72 UI px, icon above label, items 48 tall. Compact landscape: 84 UI px, icon left of label, items 30 tall |
| Items | Campaign, Duels, War (medallion), Codex, Shop | the same five, same order top to bottom; the War medallion is the middle item, drawn at 40 UI px (expanded) or 26 (compact landscape) and overhanging the rail's right edge by 6 px |
| Labels | all five, as v5 | **all five, always** (no icon-only rail, no truncation). Russian labels fit: the longest, "Кампания", is about 48 UI px in Cinzel caps |
| Selected | parchment tab, as v5 | parchment fill on the item plus a 2-px bronze bar on the rail's inner edge (selection is bronze, UI_KIT.md) |
| Badges | as v5 | top-right of the item's icon |
| Top bar | full width over the content | over the content area only; the rail runs the full height beside it |

Sub-screens (no tab bar in v5) show **no rail** either: their back arrow stays in the top bar, and the content gets the full width. A rail with nothing selected would be a second navigation model.

Map shells (`addSubShell({ map: true })`, World and Camp) have no frame and no rail; their top bar becomes a strip over the map (§12).

### 3.2 `Columns`: panes by width

`Columns(box, spec)` splits a content box into panes. Each pane declares `min` and `max` widths and a priority. The rule by `contentW`:

| `contentW` | Panes | Typical classes |
| --- | --- | --- |
| < 300 | 1 (v5 stack) | compact portrait |
| 300 … 559 | 2 | compact landscape (338), medium (384–410), expanded 1024 (440) |
| ≥ 560 | 2 or 3 (if the screen declares a third pane) | expanded 1280+ (568) |

- Gutter 8 UI px (2 × the 4-pt grid at S = 2); the outer padding stays the frame's 6.
- Each pane is its own scroll area. **The wheel scrolls the pane under the pointer** (V6-018 item 3; today every live ScrollArea scrolls, UI.md gap 11). PageUp/PageDown scroll the pane that holds focus.
- Panes never share a scroll position. A pane that fits its content does not show a scroll cue.

### 3.3 `MasterDetail`

A list pane (master) and a detail pane, for Army, Hero, Codex, Market, Settlement, Clan and the Duels team.

| Class | Behaviour |
| --- | --- |
| compact portrait | v5: the list fills the screen; choosing a row opens the detail as a sheet or a sub-screen |
| compact landscape, medium, expanded | list on the left (min 180, max 300), detail on the right (min 160). The detail shows the **first item** on arrival (never an empty right pane); choosing a row replaces it without a transition beyond a 120 ms cross-fade (none under Reduce motion) |

- The selected row has the `cardSel` bronze rim **and** a chevron, not colour alone.
- Back (Esc, Telegram BackButton, the top bar arrow) leaves the screen; it does not "close the detail", because in two panes the detail is not a layer.
- Drag between panes (stash item onto a hero slot) uses the existing drag-to-equip; the drop targets highlight on drag start (§4).

### 3.4 Sheets become side panels

`ParchmentSheet` gains `presentation: 'auto' | 'bottom' | 'side' | 'dialog'`. `auto` picks by class and by the sheet's kind:

| Sheet kind | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| **decision / confirm** (P4, P12; `shadeCloses: false`) | bottom, as v5 | centred dialog, max 320 × (VH − 16) | centred dialog, max 320 | centred dialog, max 320 |
| **task or detail sheet** (item card, recruit card, floor sheet, build, muster, temper, supplies, shape, Groups modal, list and filter sheets) | bottom, as v5 | **right side panel**, full height, width `clamp(220, 0.6·VW, 280)` | bottom sheet, max 320 wide, centred | **right side panel**, full height of the content area, width `clamp(240, 0.36·VW, 320)` |
| **Settings and its pages** | bottom, as v5 | right side panel, 60% width (accounts-v6.md §1.6) | bottom sheet, max 280 wide (560 CSS) | centred panel, max 320 wide (640 CSS at S = 2), 80% height |

Side panel rules:
- Docks to the right edge of the content area (never over the nav rail), under the top bar.
- **Modal side panel** (the default): a 20% shade covers the rest of the screen; a click on the shade closes it, as a shade tap does in v5. Focus is trapped (input-v6.md §4.5).
- **Inspector panel** (non-modal, declared per screen): no shade; the rest of the screen stays live; selecting another thing updates the panel. Used where the player must keep acting on the field: the War hex panel (§8), Camp build placement (§12). Focus is not trapped; Tab moves between the screen and the panel; Esc closes the panel first.
- Left-hand mode (A11Y-16) docks side panels on the left.
- Enter animation: slide 12 UI px from the right plus a fade, 160 ms ease-out; none under Reduce motion (motion.ts).

### 3.5 Edge rails and anchored clusters (field scenes)

For battle and the maps, the HUD is a set of anchored clusters over a full-bleed field:

```
 TL cluster ───────── top strip ───────── TR cluster
 │                                                │
 left column                          right rail  │
 (cards / chips)          FIELD       (actions)   │
 │                                                │
 BL corner ─────── bottom-centre bar ──── BR corner
```

- Each cluster anchors to its edge or corner with the 6-UI-px frame padding, inside the safe area.
- Clusters have opaque or near-opaque backgrounds (stone, parchment); the field shows between them.
- Each scene publishes its **framing rect**: the canvas minus the clusters' insets. Cameras frame, centre and follow inside the framing rect, not the canvas (§6.3).
- Left-hand mode mirrors left and right clusters.

### 3.6 `RotateCard`: the global floor

Shown only below the floors in §1 (for example a landscape browser window under 320 CSS px tall, or split-screen on a phone). A parchment card centred on the stone stage: an icon of a turning phone and "Turn your phone or make the window taller" ("Поверните телефон или сделайте окно выше"). The scene behind keeps running (a live battle is not paused by a resize; offline battles already pause on blur). It disappears as soon as the size is above the floor. No scene uses it as a layout choice (§11.1).

### 3.7 `Grid`

`Grid(box, { minCell, maxCols })`: columns = `clamp(floor((w + gap) / (minCell + gap)), 1, maxCols)`. The existing grids already work this way (Shop `LookCard`, Duels shop, `MStashGrid`); this makes it a single primitive so every list of like items (Codex, Merchant offers, ladder floors, spoils) reflows by width instead of stretching.

## 4. Hover, focus and cursor states in the new layouts

Aligned with input-v6.md §2.1 (hover), §2.4 (cursors) and §4 (focus). This section only adds the states the new primitives need.

| Element | Hover (mouse only) | Pressed | Focused (keyboard) | Selected | Cursor |
| --- | --- | --- | --- | --- | --- |
| Nav rail item | label and icon lighten one step (`hover` token); no movement | inset 1 px | two-tone ring around the item (input-v6.md §4.4) | parchment fill + bronze inner-edge bar | `pointer` |
| Tab bar item | as v5 plus the same lighten | as v5 | ring | as v5 | `pointer` |
| Master list row | row surface lightens one step | inset | ring | `cardSel` rim + chevron | `pointer` |
| Detail pane | none (not interactive as a whole) | — | its controls take focus in reading order | — | `default` |
| Side panel shade | none | — | — | — | `default` (a click closes, as v5) |
| Stash item (draggable) | lighten + tooltip after 500 ms | — | ring | — | `grab`; `grabbing` while dragging |
| Drop target (hero slot) during a drag | valid: bronze dashed outline at full strength under the cursor, 50% elsewhere; invalid: no outline | — | — | — | `grabbing` over valid, `not-allowed` over invalid |
| Disabled control (any) | no lighten | — | ring (still focusable, says why on Enter) | — | `not-allowed` |
| Field and map | as input-v6.md §2.1 | | | | as input-v6.md §2.4 |

Focus order with the new regions (extends input-v6.md §4.2, reading order within each region):

1. top bar → 2. master pane → 3. detail pane (or the second, then third column, left to right) → 4. footer / action bar → 5. nav rail (top to bottom) or tab bar.

- Within the nav rail, Up/Down move; within a tab bar, Left/Right (both are "groups" in input-v6.md §4.3).
- Opening a modal side panel moves focus into it (its default control); closing returns focus to the opener.
- An inspector panel takes focus only when opened by keyboard (Enter on a hex is not possible: hexes are pointer-only, input-v6.md §9), so it never steals focus from a mouse player.
- Keycaps on HUD controls (input-v6.md §6.1) sit in the control's top-right corner in every class; in compact landscape, controls narrower than 32 UI px hide their keycap, as at phone portrait.

## 5. Layout-check rules (catching letterbox and wasted space)

`scripts/layout-check.mjs` grows to the 10 matrix sizes (plus its existing phone sizes, and the Telegram-insets variant at 390x844 and 844x390). New checks, run on every screen and sub-state in its `SCREENS` table, at scroll top and scroll end:

| Check | Applies to | Fails when | Notes |
| --- | --- | --- | --- |
| `letterbox` | every size | the `#game` CSS box is narrower or shorter than the viewport's safe box by more than 2 CSS px | catches the 0.64 cap and any future CSS cap |
| `class-match` | every screen | the layout variant the scene registered (`uiLayout(scene, cls, land)`) differs from the class computed for this size | catches a scene that ignores the class and builds the portrait stack |
| `wasted-width` | menu screens, medium and expanded | the union of registered content (texts, interactive objects, `uiFrame` boxes; excluding the backdrop, the frame and the nav) spans less than **80%** (medium) or **70%** (expanded) of `contentW` | the letterboxed column at 1280x800 spans 40%: it fails |
| `empty-column` | menu screens, compact landscape, medium, expanded | a vertical strip at least **25% of `contentW` wide** and **60% of the content height** contains no registered element | catches a narrow centred column (FirstRun's 200-px column) and a one-sided layout |
| `stretched` | every size | a list row is wider than 360 UI px, a button wider than 240 (300 for a declared primary CTA), a wrapped text line wider than 300, or a dialog or side panel wider than 320 | bars meant to span opt out with `uiStretch(obj)` (top bar, tab bar, progress bars, segmented controls) |
| `field-coverage` | field scenes (battle states, World, Camp, War map) | the field's visible area outside opaque HUD rects is below **60%** of the canvas (expanded), **50%** (compact landscape, medium) or **40%** (compact portrait) | needs `uiOpaque(obj)` on the HUD clusters |
| `above-fold` | every screen with a primary action | the primary (`uiPrimary(obj)`) is not fully visible at scroll 0 | UI.md: Menu, Duels and Settlement CTAs fall below the fold at 844x390 |
| `element-parity` | every screen | an `uiId` present at 390x844 is absent at another size, unless it is registered as collapsed (`uiCollapsed(id, intoId)`: reachable through the named control) | the "no element silently dropped" rule as a gate; it would have caught the War map's hidden key rail (UI.md §3.10) |
| `nav-labels` | hub screens | a nav item's label is missing or ellipsised | 844x390 today shows only the active label |

- Thresholds live in one table in the script, next to the sizes.
- The new checks can never be allowlisted for the foundation screens (Menu, Settings, Kit), as UI_KIT.md already rules for the existing checks.
- The summary (`shots/layout/index.md`) gets a per-class column so a reviewer can see which class failed.

## 6. Shell and hubs (foundation; Menu)

Built first: every other family depends on `AppShell`, `Columns`, side panels and the metrics contract.

### 6.1 Real elements (UI.md §3.1, §3.2)

- [ ] Frame, `TopBar` (plaque title, gear; back arrow on sub-screens outside Telegram), offline sync badge
- [ ] `TabBar`: Campaign, Duels, War medallion, Codex, Shop, with badges
- [ ] `menu.save` ProfileCard: portrait, name, day, gold, trophies, warband
- [ ] `menu.quest` QuestCard "First steps n of 4" with the next step line
- [ ] `menu.banner` fresco (`frescoSlot`)
- [ ] primary `menu.continue` / `menu.new`
- [ ] tiles `menu.army` (badge), `menu.stash`, `menu.camp`, with the disabled reason under them
- [ ] opens: Settings, Notifications, About, the new-campaign confirm (`menu-reset`)

### 6.2 What goes where

| | compact portrait | compact landscape (422×195) | medium portrait (384×512) | expanded (640×400) |
| --- | --- | --- | --- | --- |
| Nav | tab bar | rail, 84 | tab bar | rail, 72 |
| Panes | 1 (v5) | 2: **left** profile + quest; **right** CTA, tiles, disabled reason | 1 column, but profile and quest **side by side** (2 × 184) | 2: **left hero pane** fresco + CTA under it; **right** profile, quest, tiles |
| Fresco | `frescoSlot` | dropped (`short`), as `frescoSlot` already does | full width, max 200 tall | fills the hero pane above the CTA, 16:9, max 300 wide |
| CTA | as v5 | top of the right pane, always above the fold | above the tiles | under the fresco, max 300 |

### 6.3 Wireframes

**1280x800 (expanded, 640 × 400 UI)**

```
+--------+----------------------------------------------------------------------+
|        |                       [ PIXELARROW ]                    (sync) (gear)|
| [flag] |----------------------------------------------------------------------|
|CAMPAIGN| +----------------------------------+ +------------------------------+|
|########| |                                  | | [portrait] Strategos         ||
| [sword]| |                                  | |            Epameinon         ||
| DUELS  | |        menu.banner fresco        | | Day 1 on the march           ||
|        | |        (hero pane, 16:9)         | | 240 Gold  Warband 9 Men      ||
| ( (o) )| |                                  | | 0 Trophies                   ||
|  WAR   | |                                  | +------------------------------+|
|        | |                                  | | First steps · 2 of 4         ||
| [book] | |                                  | | [v][v][ ][ ]                 ||
| CODEX  | +----------------------------------+ | Finish the tutorial          ||
|        | | <>   CONTINUE THE MARCH       <> | +------------------------------+|
| [stall]| +----------------------------------+ | [ARMY 9] [STASH ] [ CAMP  ]  ||
|  SHOP  |                                      | Pitch camp on the map        ||
+--------+----------------------------------------------------------------------+
  rail 72        hero pane ~300                        right pane ~252
```

**844x390 (compact landscape, 422 × 195 UI)**

```
+-----------+------------------------------------------+
| CAMPAIGN #|            [ PIXELARROW ]   (sync)(gear) |
| DUELS     |+-------------------+ +------------------+|
| (o) WAR   ||[pt] Strategos     | |<> CONTINUE THE <>||
| CODEX     ||     Epameinon     | |   MARCH          ||
| SHOP      || Day 1 · 240 Gold  | +------------------+|
|           || 9 Men · 0 Trophies|[ARMY 9][STASH][CAMP]|
|           |+-------------------+Pitch camp on the map|
|           || First steps 2 of 4|                     |
|           || [v][v][ ][ ]      |                     |
|           || (next step line)  |                     |
|           |+-------------------+                     |
+-----------+------------------------------------------+
  rail 84        left pane ~165        right pane ~165
```

**768x1024 (medium portrait, 384 × 512 UI)**

```
+-----------------------------------------------+
|              [ PIXELARROW ]       (sync)(gear)|
|+---------------------+ +---------------------+|
|| [pt] Strategos      | | First steps · 2 of 4||
||      Epameinon      | | [v][v][ ][ ]        ||
|| Day 1 · 240 Gold    | | Finish the tutorial ||
|| 9 Men · 0 Trophies  | |                     ||
|+---------------------+ +---------------------+|
|+---------------------------------------------+|
||                                             ||
||          menu.banner fresco (max 200)       ||
||                                             ||
|+---------------------------------------------+|
|     <>    CONTINUE THE MARCH (max 300)   <>   |
|  [  ARMY 9  ]   [  STASH  ]   [  CAMP  ]      |
|                         Pitch camp on the map |
|-----------------------------------------------|
| CAMPAIGN | DUELS |  ( WAR )  | CODEX | SHOP   |
+-----------------------------------------------+
```

### 6.4 Other hubs on the shell

Duels, War, Codex and Shop use the same `AppShell`; their content rules are in §8–§13. A hub with only one natural pane (the War map) gives the whole content area to its field.

### 6.5 Phone landscape

Compact layout (above). No fallback.

## 7. Battle HUD and Results

The densest HUD and the highest effort (UI.md rank 1). Principle: **the field fills the screen; the orders bar, the group cards and the controls move to edge rails.**

### 7.1 Real elements (UI.md §3.8, UI_KIT.md "Battle HUD")

- [ ] Top bar: ⋯ Menu key, clock and its word, "You n% [bar] vs [bar] n% Foe", Pause/Play (terracotta while paused), Speed (1×/2×), Flee
- [ ] Deployment top bar: Leave, the men count, Men; online: seconds left and the draining countdown bar
- [ ] Corner keys: Zoom (magnifier), Follow (eye)
- [ ] `HintPill` (situation sentence) and the banners that replace it (first contact, terrain tips)
- [ ] Group cards (`GroupCard`: numeral, portrait, name, men and state, H and M bars), stable numbering
- [ ] Selected-group line ("ORDERS · PHALANX" with the numeral) and the Formation chip (opens the shape sheet)
- [ ] Orders: Advance, Charge, Hold, Shoot (Loose/Throw), Withdraw (Feint); the order in force lit; Reset / Alone / Rejoin
- [ ] Deployment: full-width Fight / Ready, Inspect (i) toggle, Works tray
- [ ] Chip row: Shape, Groups, Then…, Undo (wraps today)
- [ ] Ability medallion rail: up to 3 medallions plus "more"; halo, sweep, seconds, count bubble
- [ ] On the field: facing pips, group tags, edge pointers, the boss bar (beasts), the knob, ghosts, path lines, works
- [ ] Popups: gesture hint, tooltip, Groups modal, shape sheet, retreat and settings shade, ⋯ battle menu (Retreat, Leave, Reset all, Sound, Settings), more-abilities sheet, the keyboard shortcuts sheet (input-v6.md §6.4)
- [ ] Left-hand mode (rail and eye move)
- [ ] Tutorial narrator and coach bubbles (§13.1)

### 7.2 What goes where

| Element | compact portrait (v5) | compact landscape (422×195) | medium portrait (384×512) | expanded (640×400) |
| --- | --- | --- | --- | --- |
| Top bar | 46, two rows | **one 22-UI row**: Menu, clock, strength bars (60 UI each), Pause, Speed | 46, as v5 | **one 24-UI row**: TL Menu + clock; centre strength bars (100 each); TR Pause, Speed |
| Hint pill / banner | under the top bar | top centre of the field, max 220 wide, 2 lines max | as v5 | top centre, max 300 |
| Group cards | 2 per row in the bottom sheet | **left column**, 100 wide, one card per row, 26 tall (compact card: numeral, name, men, thin H/M bars); scrolls past 6 with a cue | 3 per row in the bottom sheet | **left column**, 132 wide, one per row, 30 tall (wide card); scrolls past 9 |
| Selected line + Formation | sheet header | top of the **right order rail**: numeral badge (14 tall); Formation chip at the rail's foot | sheet header | above the orders bar: "I ORDERS · PHALANX" left, Formation right |
| Orders | bottom row | **right order rail**, 66 wide: five keys stacked, 24 tall each (icon + label) | bottom row, max 360 wide, centred | **bottom-centre bar**, five keys 56 × 30, centred between the card column and the medallions |
| Deployment Fight / Ready | full width bottom | foot of the right rail, terracotta, 44 tall; the rail above holds Shape, Groups, Works, Inspect | full width, max 300 | bottom-centre, 200 wide, in place of the orders bar |
| Chip row (Shape, Groups, Then…, Undo) | above the sheet | bottom centre of the field, one row, 22 tall | above the sheet | directly above the orders bar |
| Medallions | right edge | inner right edge, beside the order rail, 3 × 40 tall | right edge | right edge, vertically centred, `MED_W` 50 |
| Zoom, Follow | field corners | top-right of the field, under the top row | as v5 | bottom-right corner |
| Boss bar | under the top bar | under the top row, centred, 200 wide | as v5 | under the top row, centred, 300 wide |
| Popups (shape, Groups, more, menus) | sheets | side panel or dialog (§3.4); offline battles pause as in v5 | bottom sheet max 320 | side panel or dialog |

- **Sheet height in medium and compact portrait** is capped at 36% of VH (today its formula ignores `compact`, UI.md §3.8). Cards scroll inside the cap.
- **Left-hand mode** in landscape mirrors the whole layout: order rail and medallions on the left, cards on the right. The orders keep their top-to-bottom order (Q to T map to them, input-v6.md §1.2).
- Online, duel and beast battles use the same layout; online deployment's countdown bar is a 3-UI line under the top row in every class.

### 7.3 Camera framing (camera-systems)

- **Framing rect.** The canvas minus the opaque HUD clusters (top row, card column, order rail or orders bar, medallion rail). The field is drawn under the clusters, but the camera frames, centres and follows inside the framing rect. At 1280x800 the framing rect is about 450 × 330 UI px; at 844x390 about 210 × 150.
- **Opening fit** (`frameArmies` → `openingFrame`): fit both armies into the framing rect with an 8% margin, zoom 0.5–1 as today. Landscape framing rects are wider than tall, so the fit uses the true aspect instead of the portrait band (UI.md §3.8).
- **More screen shows more field, not bigger soldiers.** The default zoom stays 1 at every S; extra width reveals more of the battlefield. If the field is narrower than the framing rect at the minimum zoom, centre it and draw the out-of-bounds fringe (terrain darkening to the vignette), never black.
- **Bounds clamp** accounts for the half-view size and the cluster insets, so the field's edge can be scrolled out from under a rail but never past it.
- **Follow** uses frame-rate-independent smoothing (`1 − exp(−rate·dt)`) after the sim step, with a deadzone of the framing rect inset by 20%, so the followed group never hides under a rail.
- **Recentre** (card double-tap, the number key of the selected group) centres on the framing rect's centre, not the canvas centre; 320 ms glide, a cut under Reduce motion (input-v6.md §7).
- **Wheel zoom** anchors at the cursor (input-v6.md §2.3); `=`/`−` and the zoom key anchor at the framing rect's centre.
- Screen shake stays an additive offset on top of follow (`game-feel`).

### 7.4 Wireframes

**1280x800 (expanded, 640 × 400 UI)**

```
+------------------------------------------------------------------------------+
|[... MENU] 0:06 battle time   You 96% [=====] vs [=====] 100% Foe  [>PLAY][1x]|
|                     ( Paused. Give orders, then tap Play. )                  |
|+---------------+                                                             |
||I [pt] PHALANX |                                                     (abil 1)|
||  4 men · adv. |                                                             |
||  H==== M====  |                                                     (abil 2)|
|+---------------+               F  I  E  L  D                                 |
||II SKIRMISH    |         (full bleed; drawn under every              (abil 3)|
||  2 men · range|          cluster; camera frames inside                      |
|+---------------+          the framing rect)                          ( more )|
||III RESERVE    |                                                             |
|+---------------+                                                             |
||IV FLANK       |                                                             |
|+---------------+        [Shape] [Groups] [Then...] [<< Undo]                 |
|                  I  ORDERS · PHALANX                 [FORMATION: LINE]       |
|                 [Advance][Charge ][ Hold  ][ Shoot ][Withdraw]   [Zoom][Eye] |
+------------------------------------------------------------------------------+
 card column 132          orders bar ~300, centred                medallions 50
```

**844x390 (compact landscape, 422 × 195 UI)**

```
+------------------------------------------------------+
|[...] 0:06  You 96% [====] vs [====] 100% Foe  [>][1x]|
|+----------+  ( Paused. Give orders... )    +--------+|
||I PHALANX |                          [Z][E]|   I    ||
||4 men     |                                |Advance ||
|+----------+                         (a1)   |Charge  ||
||II SKIRMISH     F  I  E  L  D              |Hold    ||
||2 men     |                         (a2)   |Shoot   ||
|+----------+                                |Withdraw||
||III RESERVE                         (a3)   +--------+|
|+----------+                                [  LINE  ]|
||IV FLANK  | [Shape][Groups][Then...][Undo]           |
|+----------+                                          |
+------------------------------------------------------+
 cards 100         field ~210       medal. 40 | rail 66
```

(ASCII limits only: long card names run over the drawn card border, and the hint pill is cut short. On screen the cards show the full group name in 100 UI px and the hint pill wraps to at most two lines; nothing is ellipsised, per UI_KIT.md. The order keys read "Advance", "Charge", "Hold", "Shoot", "Withdraw" in 66 UI px, in English and Russian.)

**768x1024 (medium portrait, 384 × 512 UI)**

```
+----------------------------------------------+
|[... MENU]        0:06         [>PLAY] [1x]   |
|               battle time                    |
|You 96% [==========] vs [==========] 100% Foe |
|      ( Paused. Give orders, then tap Play. ) |
|[Zoom]                                  [Eye] |
|                                              |
|                                     (abil 1) |
|                                              |
|             F  I  E  L  D           (abil 2) |
|           (about 57% of VH)                  |
|                                     (abil 3) |
|                                              |
|                                              |
|[Shape] [Groups] [Then...] [<< Undo]          |
|+--------------+--------------+--------------+|
||I PHALANX     |II SKIRMISH   |III RESERVE   ||
||4 men · adv.  |2 men · range |3 men · range ||
|+--------------+--------------+--------------+|
||IV FLANK      |                              |
|+--------------+                              |
| I  ORDERS · PHALANX       [FORMATION: LINE]  |
|  [Advance][Charge][ Hold ][Shoot][Withdraw]  |
+----------------------------------------------+
 bottom sheet capped at 36% of VH; orders max 360
```

### 7.5 Results and Inspect (UI.md §3.9)

Real elements:
- [ ] banner (Victory, Defeat) with the "vs …" line; `results.why`; the abandoned note
- [ ] `results.tab`: Summary / Heroes / Spoils
- [ ] Summary: 5 stat tiles (3+2) and the MVP card
- [ ] Heroes: rows with XP bars
- [ ] Spoils: card grid
- [ ] arc-victory variant (company roll), online variant
- [ ] primary `results.primary` (Spoils, then Continue), pinned
- [ ] Inspect modal

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Layout | v5 | **left pane**: banner (30 tall), vs line, why; Summary tiles 5 in a row below; **right pane**: Heroes / Spoils tabs and page; primary bottom-right | 1 column; tiles 5 in a row; spoils grid 3–4 columns | **left pane** (260): banner, why, Summary tiles (3+2), MVP; **right pane**: Heroes / Spoils tabs; primary bottom-right, max 240 |
| Tabs | 3 | the Summary tab becomes the left pane; the right pane keeps Heroes / Spoils. `results.tab.summary` is registered `uiCollapsed` into the left pane | 3 | as compact landscape |
| Inspect | modal | side panel | bottom sheet max 320 | side panel |

The primary keeps its two-step flow: "Spoils" switches the right pane to Spoils, then it reads "Continue". Enter activates it (input-v6.md §4.5: it has default focus).

### 7.6 Phone landscape

Compact layout. Phone landscape is the natural orientation for a battle (a wide field), so this is where compact landscape matters most. No fallback.

## 8. War and the online hub

UI.md rank 2: War map (`OnlineScene`), Online Army, Clan, Merchant.

### 8.1 Real elements (UI.md §3.10, §3.11)

War map:
- [ ] `ScreenFrame`, `TopBar` with the gear, `TabBar`
- [ ] situation strip (`SIT_H` 28) with Collect; chip grid (war gold, food, wood, stone, men, energy)
- [ ] map window: hex map, place labels, the party marker
- [ ] **key rail: Army, Clan, Lobby (badge), Centre, Zoom** (today the whole rail hides when it does not fit)
- [ ] march bar (`MARCH_H` 24)
- [ ] hex panel (`BottomPanel`): title and tier, owner, per-hour yields, action rows (March, Attack, and per hex kind: market, post, town, lair, boss, own, neutral, rival, far)
- [ ] result sheet, list sheets, beast sheet, join, lobby, challenge, camp
- [ ] coach bubbles (`online-coach-*`)
- [ ] server-down card "Online unavailable…"; "Sign in to play online" (accounts-v6.md AU-01)

Online Army: sub-shell; purse chips; hero card or garrison head; Roster | Stash; rows or `MStashGrid`; footer Recruit / Market / Shop or Station; recruit sheet; API-down state.
Clan: no-clan card (art, lead, Found); clan view (label column, members); link, manage, join and leave sheets.
Merchant: Gold and Drachmae chips; info parchment; section titles; offer rows; buy, item, post and town states.

### 8.2 What goes where

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Map | window in the frame | **full bleed** right of the nav rail | window, taller (VH 512) | **full bleed** right of the nav rail |
| Situation + chips | strip + grid | top-left card: one line + 6 chips in one row (chips 44 wide) | as v5, chips in one row of 6 | top-left card, max 320 |
| Key rail | right edge of the window | right edge, full height, 5 keys 30 tall, **always shown** | right edge | right edge, full height, keys 44 tall, labels under icons |
| March bar | under the map | bottom-centre, over the map | as v5 | bottom-centre |
| Hex panel | bottom panel | **inspector side panel** (non-modal), right, 220 wide, left of the key rail | bottom panel, max 360 | **inspector side panel**, 280 wide, left of the key rail |
| Sheets | bottom | side panel | bottom max 320 | side panel / dialog |
| Online Army | v5 | master–detail as Army (§10) | master–detail | master–detail |
| Clan | v5 | 2 panes: clan card + members left, management right; no-clan card centred with art left of the text | 2 panes | 2 panes |
| Merchant | v5 | 2 panes: info + chips left, offers grid right | offers grid 2 columns | offers grid 3 columns, info pane left |

- The key rail **never hides**: `element-parity` fails if any of Army, Clan, Lobby, Centre, Zoom is missing at any size.
- The hex panel's info lines are never dropped for height (today they are, UI.md §3.10); the side panel scrolls instead.

### 8.3 Camera framing

- Framing rect: the map area minus the situation card, the key rail, the march bar and an open hex panel.
- **Selecting a hex** with the panel open: if the hex would sit under the panel, the camera eases it into the framing rect (200 ms, a cut under Reduce motion). It never moves when the hex is already visible.
- Zoom limits come from the framing rect and S, not S alone (regionMapView.ts:132): at minimum zoom a hex is at least 44 pt across on touch devices, so it stays tappable.
- Wheel zoom at the cursor (already done here), drag pan, clamped to the region bounds with the half-view correction.
- "Centre" centres the party in the framing rect.

### 8.4 Phone landscape

Compact layout. This fixes the S1 finding (the rail and its five actions disappear at 844x390). No fallback.

## 9. Duels

UI.md rank 3: the largest scene (DuelScene, about 30 states, about 13 sheets).

### 9.1 Real elements (UI.md §3.12)

- [ ] hub shell (or sub-shell with back), header row: Glory chip, Level chip and bar, Team (badge), Armoury
- [ ] fresco and chest tip (VH ≥ 350 today)
- [ ] mode switch Ladder | Arena
- [ ] Ladder: next-floor card (floor, glory reward, team points vs the floor's limit), primary "Fight floor n", chapters with stars and chest buttons, `FloorTile` grids, the floor sheet, chest reward, level sheet, expired and open states
- [ ] Team: presets 1–3, roster, recruit, dismiss, preset sheet, symbols, hero sheet, team delete
- [ ] Shop (Armoury): Offers / Gear / Sell, cards
- [ ] Arena: home, raid, board (Live / Legend / Raids), defence, searching (ranked, unranked), found, locked, season reward and pick, raid log, results for ladder, raid and ranked
- [ ] main action `MButton`
- [ ] about 13 other sheets; API-down state (`duel-closed`); "Sign in to play online"

### 9.2 What goes where

Three zones (UI.md §3.12): **profile column**, **mode content**, **main action**.

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Profile column (Glory, Level, Team, Armoury, fresco, chest tip) | header row | left pane, 130 wide: chips stacked, Team and Armoury buttons; fresco dropped (`short`) | header row, fresco max 120 tall | left pane, 180 wide: chips, Team, Armoury, fresco (max 180 × 100), chest tip |
| Mode switch | under the header | top of the right pane | as v5 | top of the centre pane |
| Ladder | list of chapters, 5 tiles per row | right pane: next-floor card + primary on one row, chapters below; 5 tiles per row | 5 per row | centre pane: chapters as a wide grid, 10 tiles per row (one chapter per row) |
| Arena board | list | right pane, table columns: rank, name, rating | table | table with extra columns (wins, last seen) only where the data already exists in the payload; nothing invented |
| Main action | bottom of the content | bottom-right of the right pane, always above the fold | bottom | bottom-right, max 240 |
| Floor sheet | bottom, full width | side panel | bottom max 320 | side panel |
| Shop cards | 2 columns ≥ 2×176 | 2 columns | 2 columns | 3–4 columns (`Grid`, min 140) |
| Team | list | master–detail: presets and roster left, hero right | master–detail | master–detail, presets as a card row above |

### 9.3 Phone landscape

Compact layout. The profile column moves the header out of the vertical stack, which is what pushed the ladder and the main action below the fold at 844x390. No fallback.

## 10. Army and Hero

UI.md rank 5. Master–detail and a paper doll.

### 10.1 Real elements (UI.md §3.3, §3.4)

Army:
- [ ] sub-shell "Army", sync badge; situation sentence; chips men, gold, hurt
- [ ] hero card (`addArmyHead`) with slots, and the sticky mini-head
- [ ] `army.tab` Roster | Stash; Roster `army.filter`, `army.sort`, rows; Stash `MStashGrid` with drag-to-equip
- [ ] `ArmyFooter`: `army.dismiss`, `army.sheet` (badge), Map or Town
- [ ] filter and sort sheets, item cards, compare (`stash-compare`, `stash-detail`)

Hero:
- [ ] plaque retitled to the hero's name; power chip; wound line
- [ ] stage niche, 3+2(+mount) `GearSlots`, level pill, stars, `MPager` (chevrons, "2 / 8")
- [ ] class pill, trait, XP bar
- [ ] `hero.tab` Stats / Gear / Perks / Skills and the pinned copy `hero.pinTab`
- [ ] Stats rows with `attr.*.minus` / `attr.*.plus`, points, `hero.respec`; Gear grid; perk sheet; Skills
- [ ] `MActionBar`: `hero.undo` / `hero.confirm` or `hero.dismiss`

### 10.2 What goes where

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Army | v5 stack | **master**: chips, Roster/Stash switch, filter/sort, rows (left, 200); **detail**: the selected hero's card with slots and the footer actions (right) | master–detail, 2 × 190 | master (260): rows or a stash grid of 6+ columns; detail: hero card, slots, footer under it |
| Stash drag | within the grid | from the master grid onto the detail's slots | same | same; drop targets light on drag start (§4) |
| Hero | v5 stack | **paper doll left** (stage 110 tall, slots around it, pager under it); **right**: XP line, tabs, tab page, action bar | paper doll on top (full width), tabs and page below | **paper doll left** (240), **right** tabs and page, action bar bottom-right |
| Pager | under the stage | under the stage | under the stage | in the left pane, under the stage |
| Sticky mini-head, pinned tab | used | not needed: the head is a fixed pane, so `hero.pinTab` and the mini-head register as `uiCollapsed` into the left pane and the tab strip | used | not needed (as compact landscape) |

### 10.3 Phone landscape

Compact layout. Today the compact head (about 150 px) is taller than the 120-px view; side by side, the stage gets 110 of the 173 content px and the tabs start at the top of the right pane. No fallback.

## 11. Settlements and economy

UI.md rank 6: Settlement (all tabs), Market, Shop.

### 11.1 Real elements (UI.md §3.5, §3.13, §3.14)

Settlement:
- [ ] plaque with the place name; `town.art` fresco; kind and culture line
- [ ] chips `town.gold`, `town.men`, `town.hurt`
- [ ] `town.tab`: Hire / Buy / Sell / Services (Hire / Rest in a village); forge states
- [ ] Recruits list and `town.hire`; Market list and `town.buy`; Sell `MStashGrid`; Services and `town.rest`
- [ ] `MActionBar`: `town.party`, `town.leave`
- [ ] arrival event card, ware item card, buy confirm, recruit card

Shop: `shop.drachmae` chip, `shop.banner`, `shop.tab` Shop / Pass / Wallet (claim badge); tip line, Market card, `LookCard` grid, map-merchants card; Pass season card, `pass.unlock`, `pass.claimAll`, Free / Premium tier rows; Wallet balance, packs, `wallet.terms`, `wallet.refunds`, history, and the web "coming soon" card (accounts-v6.md, V6-017); cosmetic, pass XP and need-Drachmae sheets; consumable picker.

Market: purse chips; `market.tab` Browse / Mine / Sell; filters `market.kind`, `market.cur`, `market.sort`; `market.find`, `market.clearRef`; listings with `market.price`, `market.more`; Mine list; Sell grid; filter sheet, Find sheet, goods card, sell form, number keypad, price.

### 11.2 What goes where

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Settlement | v5 stack | **left banner pane** (150): fresco, name line, chips stacked, Army and Leave at its foot; **right**: tabs and body | fresco band (max 120) + chips row on top; tabs and body below; action bar at the bottom | **left banner pane** (220): fresco full height of its pane, identity, chips, actions; **centre**: tabs and list; **right**: the selected recruit or ware card as a detail pane (instead of a sheet) |
| Shop tab | grid | 2 panes: tip + Market card left, `LookCard` grid right | grid 5–6 columns | grid 8+ columns, side panel for a cosmetic |
| Pass | vertical tier rows | horizontal tier track: Free on top, Premium under it, scrolled sideways, season card left | vertical rows | **horizontal tier track**, season card above |
| Wallet | v5 | 2 panes: balance + packs left, history right | 1 column | 2 panes |
| Market | v5 | **left filter sidebar** (kind, currency, sort, Find, clear) + listings right | filters as a chip row; listings 1 column | **3 panes**: filter sidebar (150), listings (table: item, seller, price, more), detail and price form (side pane) |
| Number keypad | sheet | side panel | sheet | side panel; with a keyboard (`InputHints.keyboard()`), the price field also takes typed digits and Enter |

- The Settlement header stack is never a fixed height on short screens (UI.md §3.5); it is a pane.
- The Pass track is a layout change of the same tier data; no tier, reward or price changes.

### 11.3 Phone landscape

Compact layout. Settlement is the worst screen at 844x390 today (14 UI px of body); the banner pane gives the body 173 px of height. No fallback.

## 12. World and Camp

UI.md rank 7: map scenes.

### 12.1 Real elements (UI.md §3.6, §3.7)

World:
- [ ] map top bar: back, "Day N · place", gear
- [ ] `SituationLine`: time, safety, hint; gold, men, food (days), supplies chips
- [ ] Lairs chip, cloud badge, Follow eye
- [ ] `MActionBar`: Camp (primary in a town), Rest or Stop, Party (badge)
- [ ] night tint, toasts, map tooltips, coach bubble
- [ ] encounter and event cards, the Journal

Camp:
- [ ] map top bar; `SituationLine` and the online second chip row
- [ ] Zoom key, Follow eye
- [ ] bottom strip: Strike, Muster, Loot, Build, End Day (and Rest, Claim, Place, Cancel in their states; the drawer)
- [ ] build, muster, temper, supplies and war-build sheets

### 12.2 What goes where

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Map / clearing | under the situation line | full bleed under a 22-UI top strip | full bleed | full bleed |
| Top bar | strip | strip: back, plaque, gear (22) | strip | strip (24) |
| Situation + chips | full-width card | top-left card, 1 line + chips in one row, max 260 | as v5 | top-left card, max 320 |
| Lairs, cloud, eye | under the card | under the card, left / right | as v5 | under the card |
| World commands | bottom bar | **right rail**: Camp, Rest/Stop, Party stacked, 30 tall | bottom bar, max 360 | **bottom-right cluster**, keys 120 × 30 |
| Camp tools | two-row bottom strip | **right tool rail**: Strike, Muster, Loot, Build, End Day (terracotta, at the foot), 28 tall | two rows, max 360 | **right tool rail**, 120 wide, 30 tall keys |
| Camp sheets | bottom | build, muster, temper, supplies: **inspector side panel** (the clearing stays live for placing); confirms: dialog | bottom max 320 | inspector side panel |
| World cards (encounter, event, Journal) | sheets | side panel / dialog by kind | bottom | side panel / dialog |

### 12.3 Camera framing

- World: framing rect = the map minus the situation card and the command rail or cluster. The party is followed inside it (frame-rate-independent smoothing, deadzone 20% of the rect), so it never walks under the cards. Zoom 2 default, clamped 1–4, wheel zoom at the cursor (today it zooms about the centre), drag pan, and the bounds clamp with the half-view correction.
- Camp: the clearing gets a camera-like view (or the existing masked container) with the same rules: zoom 1× / 2× by the key, wheel at the cursor, drag pan clamped to the clearing, framing rect excluding the tool rail and an open inspector panel. Placing a structure keeps the placement ghost inside the framing rect.

### 12.4 Phone landscape

Compact layout. A map is a natural landscape view. No fallback.

## 13. First run and tutorial, Codex, Settings and dialogs

### 13.1 First run and tutorial (UI.md rank 8, §3.17)

Real elements:
- [ ] `ScreenFrame`, `TopBar`
- [ ] offer and resume screens: `firstrun.art` fresco, Nikias speech card, primary CTA (Tutorial), `firstrun.skip`
- [ ] reward screen: gold card and item card
- [ ] modes screen: three `ParchmentCard`s (`firstrun.mode.*`)
- [ ] skip confirm
- [ ] tutorial: battle narrator, coach bubbles, ghost hand, skip dialog (`tutorial-skip`), online coach, keyboard lines (input-v6.md §10)

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Offer / resume | v5 (200-px column) | **stage**: fresco left (half), speech card, CTA and skip right; CTA above the fold | fresco on top (max 280 tall), speech, CTA, skip; column max 360 | **stage**: fresco left (max 360 wide), Nikias card, CTA and skip right, vertically centred |
| Reward | stacked cards | side by side | side by side | side by side |
| Modes | stacked | **three cards side by side** | three side by side | three side by side, max 180 each |
| Coach bubbles | as v5 | anchored to the moved controls; max width 176; never over the anchor | as v5 | anchored to the moved controls; max 240 |
| Narrator | bottom | top-left of the field, clear of the card column | as v5 | top-left of the field |

- `sy` is clamped so the speech card can never run into the top bar (UI.md §3.17).
- Every coach bubble re-points to the control's new position in each class; the tutorial test runs in compact portrait, compact landscape and expanded.

Phone landscape: compact layout. No fallback.

### 13.2 Codex (UI.md rank 9, §3.15)

Real elements: hub shell; `codex.seg` Beasts / Doctrines (or a SectionTitle before a doctrine is met); rows `codex.<enc>` and `codex.doctrine.<id>` (art well, title, level, hint, chevron); beast sheet with the Trial fight (`codex-beast`); doctrine sheet (`codex-doctrine`).

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| List | rows | master–detail: rows left, beast or doctrine detail right (with the Trial button) | card grid, 3 columns; detail as a bottom sheet | **card grid** (min 120, up to 4 columns) left; detail pane right (240) |

Phone landscape: compact layout. No fallback.

### 13.3 Settings and dialogs (UI.md rank 10, §3.16)

Real elements: Audio (Sound toggle, Music and Effects steppers); Language (Auto / English / Русский); Battle (damage numbers, 4 pause toggles, speed stepper); Haptics, left-hand, analytics; Motion, shake, flash; Sync status; `settings.tutorial`; `settings.newCampaign` with its confirm; Notifications page; About and legal page; **new in v6**: Controls (keyboard only: Keyboard shortcuts page, Show key hints; input-v6.md §5), Account page (accounts-v6.md §8).

| | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- |
| Settings | bottom sheet | right side panel, 60% width (accounts-v6.md §1.6), one column, labels never ellipsised | bottom sheet, max 280 | centred panel, max 320 wide, 80% height; sections in **one column** (see note) |
| Nested pages (Notifications, About, Controls, Account) | replace the sheet's page | same | same | same |
| Confirms, decisions | bottom | centred dialog, max 320 | centred dialog | centred dialog |
| Keyboard shortcuts sheet (`?`) | — | side panel | bottom sheet | centred panel, max 320 |

Note: UI.md proposed two columns of sections on wide screens. At the 320 maximum (640 CSS px at S = 2) a single column reads better and keeps the panel's tab order trivial; two columns are rejected. Every row's label fits at 240+ width, which fixes the "…" and "E…" labels at 844x390.

Phone landscape: compact layout (side panel). No fallback.

### 13.4 Kit and Boot (UI.md rank 11)

- Kit: a new **Layouts** page showing `AppShell` (tab bar and rail), `Columns`, `MasterDetail`, a modal side panel, an inspector panel, a centred dialog, the edge clusters with a framing-rect overlay, `RotateCard`, and the focus ring and hover states on each. The Kit's pager row moves into a left rail in landscape. Every Kit page passes the §5 checks at all matrix sizes.
- Boot: centred; works at any size. No change.

## 14. Phone landscape decisions (summary)

| Family | Phone landscape | Why |
| --- | --- | --- |
| Shell and hubs | compact layout | rail plus two panes fit 422 × 195 with the CTA above the fold |
| Battle HUD and Results | compact layout | the natural orientation for a field; rails at the thumbs |
| War and online | compact layout | full-bleed map; the key rail never hides |
| Duels | compact layout | the profile column frees the height |
| Army and Hero | compact layout | master–detail and paper doll side by side |
| Settlements and economy | compact layout | banner pane and filter sidebar |
| World and Camp | compact layout | maps are landscape views |
| First run, Codex, Settings, dialogs | compact layout | few elements |
| **Any scene below the floor** (H < 320 CSS in landscape) | `RotateCard` (§3.6) | below 160 UI px of height not even a 22-UI top row plus five 26-UI rail keys fits; this is a size rule, not a scene choice |

So **no scene uses a phone-landscape fallback**. On Telegram mobile, `lockOrientation()` still holds the Mini App in portrait when it opens in portrait (src/platform/telegram.ts), so compact landscape mainly serves the web and phones already turned sideways.

## 15. States, accessibility and localization

- **States.** Loading, empty, error and API-down states (`duel-closed`, `online-army-closed`, "Online unavailable", "Sign in to play online") are parchment cards centred in the **pane** that owns the content, never in a full-width wasted column: at expanded, the War map's server-down card sits over the stone map backdrop, not a blank parchment page (UI.md screenshot at 1920x1080).
- **Touch targets** stay ≥ 44 pt (22 UI px at S = 2) in every class, including rails, with ≥ 4 pt between them. Mouse does not shrink targets (input-v6.md §8).
- **Contrast.** Rails and side panels reuse existing surfaces and pairs; the bronze inner-edge bar of the selected rail item is a shape plus colour (3:1 against stone).
- **Reduced motion.** Side-panel slides, pane cross-fades and camera eases become cuts.
- **Left-hand mode** mirrors side rails and side panels.
- **Localization.** Russian is about 30% longer. Rails and keys are sized for the Russian labels (measured with `measureText`, not estimated); nav labels never ellipsise (`nav-labels` check). Every new string (only `RotateCard`'s line) has English and Russian.
- **Safe area.** The canvas is the safe area (UI_KIT.md); in phone landscape the notch insets are left and right, so the rail and the order rail sit inside them.

## 16. Acceptance criteria

1. At every matrix size, the `#game` box fills the viewport's safe area (`letterbox` passes) and `uiMetrics` reports the class, S and VW × VH in the §1.1 table.
2. At 1280x800, 1440x900 and 1920x1080, every menu screen passes `wasted-width` (≥ 70% of `contentW`) and `empty-column`; at 768x1024 and 820x1180, ≥ 80%.
3. At 844x390, every screen in the layout-check table shows its primary action at scroll 0, shows all five nav labels on hub screens, and has 0 `touch-size`, `text-overflow` and `clipped` violations (today: 266 violations on 89 screens).
4. `element-parity` passes: every `uiId` present at 390x844 exists, or is registered collapsed, at every other matrix size. In particular the War map's Army, Clan, Lobby, Centre and Zoom are visible at 844x390.
5. In battle at 1280x800 the field covers ≥ 60% of the canvas, the five orders sit in one bottom-centre bar, the group cards in a left column, and the opening fit shows both armies inside the framing rect; at 844x390 the field covers ≥ 50%.
6. The camera never centres a followed or recentred group under a rail: the group's centre stays inside the framing rect (scripted check: follow a marching group for 10 s at 844x390 and 1280x800).
7. Every task sheet opens as a right side panel at 844x390 and 1280x800, as a bottom sheet in compact portrait, and every decision as a centred dialog in landscape; Esc and the shade close them and focus returns to the opener.
8. With a mouse at 1280x800, hovering a nav rail item, a list row and a button lightens it, the cursor is `pointer`, a disabled control shows `not-allowed`, and dragging a stash item onto a hero slot shows valid targets.
9. At 390x844, 360x780 and 320x693 the screenshots are unchanged from v5 except where §6–§13 state otherwise (compact portrait is the reference).
10. The Kit Layouts page shows every primitive in all four variants and passes every check.
11. Resizing a desktop window across the class thresholds (e.g. 900x900 → 1280x800 → 800x400) rebuilds the screen in the new class within one frame of the resize settling, without losing the screen's state (selected tab, selected row, scroll position of the master list).

## 17. Open questions (decided as below, logged for review)

| Question | Decision | Easy to undo? |
| --- | --- | --- |
| Phone landscape: compact layouts or "rotate your phone"? | compact layouts everywhere; `RotateCard` only below the size floor | yes per scene, but each fallback must be justified here |
| Fractional UI scale for smoother growth | rejected: whole S keeps pixel art and the 4-pt grid crisp | yes, one formula |
| S = 3 at 1920x1080 (VH 360) vs S = 2 (VH 540) | S = 3: readable at desk distance; the expanded layout is designed for 360–450 tall | yes, one divisor |
| Rail on sub-screens | no rail on sub-screens (back arrow only), as tab bars today | yes |
| Settings in two columns on wide screens | one column, max 320 | yes |
| Results: three columns side by side | two panes (Summary left, Heroes / Spoils right) to keep the Spoils-then-Continue flow | yes |
| Desktop window between classes | rebuild on class change only; reflow within a class | — |

## 18. Self-review (`/ux-review`)

**Checklist:** 3A (UX spec), adapted for a cross-screen layout spec. **Accessibility tier:** Standard (V5-013).

| Dimension | Result |
| --- | --- |
| Purpose and player need | present (§0), from the player's side |
| Player context on arrival | present (§0) |
| Navigation position, entry and exit | unchanged from v5 (`design/ux/screen-flow.md`); the nav model per class is in §3.1 |
| Layout specification and component inventory | per family §6–§13, each with a "real elements" checklist taken from UI.md and the scene code |
| States and variants | §15 (loading, empty, error, API-down placement), the four layout variants per family |
| Interaction map, all input methods | touch unchanged; mouse hover and cursors §4; keyboard focus order §4 (keys owned by input-v6.md) |
| Data requirements and events | N/A: no new data or events; layout only. The Arena table adds columns only for data already in the payload (§9.2) |
| Transitions | §3.3, §3.4, §8.3 (durations and Reduce motion) |
| Accessibility | §15: 44-pt targets, contrast, Reduce motion, left-hand mode, no colour-only selection |
| Localization | §15: Russian +30% sizing, no ellipsis on nav, new strings in both languages |
| Acceptance criteria | 11 testable criteria (§16), including resolution and a resize criterion |
| GDD alignment | no GDD requirement changes; battle element list matches hud.md and UI_KIT.md; `battle-readability.md` readability is preserved by keeping card, order and medallion sizes |
| No element silently dropped | every v5 element is listed; the three that move into a pane (`results.tab.summary`, `hero.pinTab`, Hero's sticky mini-head) are declared `uiCollapsed`; `element-parity` enforces it |

**Findings fixed during the review:**
- Results first followed UI.md's "all three tabs side by side", which would have removed the Spoils-then-Continue step; changed to two panes (§7.5).
- The compact-landscape order rail first had 28-UI keys plus a header line, which did not fit 173 UI px; keys set to 24 (still ≥ 22) and the header reduced to the numeral badge (§7.2).
- Settings on wide screens first had two columns (UI.md); reduced to one column for the tab order and the 320 max (§13.3).

**Residual risks** (for the implementation stories):
- The compact-landscape battle is tight: 168 of 173 UI px in the order rail. If a sixth rail item is ever needed, the Formation chip moves into the chip row.
- `field-coverage` thresholds are first estimates; tune them on the first battle implementation and record the change here.
- Duel Arena table columns depend on what the leaderboard payload already carries.

**Verdict: APPROVED** for the layout scope, with the residual risks above to verify in the implementation stories.
