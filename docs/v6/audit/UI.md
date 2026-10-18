# v6 audit: every screen across the screen matrix (A1-UI)

Story A1-UI, run as the `ux-designer` agent. It applies the `game-ui-ux` and `ux-review` skills
(see the end of this file). This is a read-only audit: no source was changed.

- **Screenshots** (outside git): `.claude/worktrees/v6-shots/audit-ui/layout/en-plain/<WxH>/<screen>.png`
  under the main checkout. There is also a `-end.png` for every screen whose lists scroll.
  - They were captured with `scripts/layout-check.mjs` and `SHOTS=…/audit-ui`, plain browser, English.
  - All 10 matrix sizes × every screen in the layout-check table: about 140 screens and sub-states,
    including `?scene=Kit` (all `kit-*` pages and overlays), battle, war map coach states, duels,
    shop, market, settings, codex, first run and tutorial.
  - An early sample at 1280x800 and 1920x1080 is in `…/audit-ui/early/`.
- **Element inventories** below come from the scene code. File:line references are against `v6` at
  `768e9f5`.

## 1. The one root cause: the game is a phone column on every screen

Two things fix the game to a portrait phone column on every device.

1. **`index.html` caps the canvas at a 0.64 aspect ratio.**
   `#game { width: min(100vw - insets, (100vh - insets) * 0.64) }`, centred. On any screen wider
   than 0.64:1, the canvas is a centred portrait column with the page background (#14100c) on both
   sides. This is a hard letterbox, done in CSS.
2. **`uiMetrics` (src/ui/kit.ts:50) picks the UI scale from height.**
   `S = clamp(floor(min(W/190, H/400)), 2, 4)`, then `VW = W/S`, `VH = H/S`. Every layout is written
   against VW × VH in UI px, and the design size is 195 × 422.

Measured with Playwright at each size (`#game` CSS box → S, VW × VH):

| Viewport | #game CSS box | S | VW × VH (UI px) | Used width | What you see |
| --- | --- | --- | --- | --- | --- |
| 390x844 | 390×844 | 2 | 195×422 | 100% | design size |
| 360x780 | 360×780 | 2 | 180×390 | 100% | fine |
| 320x693 | 320×693 | 2 | 160×346 | 100% | fine (v5 already passes 320 wide) |
| **844x390** | **250×390** | 2 | **124×195** | 30% | a 250-px sliver; below the kit's own minimum of 137×214 UI px; **broken** |
| 768x1024 | 655×1024 | 2 | 327×512 | 85% | full height, the layout is stretched sideways, thin side bars |
| 820x1180 | 755×1180 | 2 | 377×590 | 92% | same, more stretch |
| 1024x768 | 492×768 | 2 | 245×384 | 48% | portrait column, half the screen black |
| 1280x800 | 512×800 | 2 | 256×400 | 40% | portrait column, 60% black |
| 1440x900 | 576×900 | 2 | 288×450 | 40% | portrait column |
| 1920x1080 | 691×1080 | 2 | 345×540 | 36% | portrait column; S stays at 2, so the UI looks small at desk distance |

### Layout-check results across the matrix

`node scripts/layout-check.mjs --langs en --insets plain` over all 10 sizes ran 196 screens per
size, 2,881 screenshots in total.

- **Every size except 844x390 shows the same 4 findings, the ones v5 already had at 390x844:**
  - `duel-shop-sell|text-size|+#`
  - `tutorial-move|text-size` (two entries)
  - each in fewer than 20 configs
  - So the letterboxed column is "clean" at 1024 to 1920 wide. **The gate cannot see the
    letterbox** (gap 10 in §5).
- **844x390 has 266 violations across 89 of the 196 screens:**

| Check | Count |
| --- | --- |
| touch-size | 106 |
| text-overflow | 69 |
| text-overlap | 24 |
| text-size | 18 |
| spacing | 11 |
| overlap | 10 |
| clipped | 9 |
| outside-safe-area | 8 |

  - Examples: `army*|clipped|legend.rank` and `battle-*|text-overflow|battle.groupShort.*`.
  - This confirms the S1 rating for phone landscape on nearly half the screens.

What follows from this:

- **Laptops and desktops (1024–1920 wide) are letterboxed.** Every screen is a 492–691 CSS-px
  column with 52–64% of the screen unused. Nothing is broken inside the column: the layout check
  reports 0 new violations at 1280x800 and 1920x1080. But nothing here is a "true landscape layout".
- **Tablet portrait (768x1024, 820x1180) is stretched.** VW grows to 327–377 UI px, almost double the
  design width. Every row, card and bar stretches to the full width (see §3). Nothing is reflowed,
  so you get very long rows, sparse cards and a CTA 330 UI px wide.
- **Phone landscape (844x390) is broken.**
  - VH = 195 leaves half the height the screens are designed for, and VW = 124 is below the
    smallest supported width.
  - Labels truncate to "…" (Settings rows show "…" and "E…"; tabs read "Summ…", "Hero…").
  - Hub CTAs fall below the fold, and the tab bar loses every label but the active one.
  - The battle field band is about 55 CSS px tall.
  - On Telegram mobile, `lockOrientation()` runs only when the app opens in portrait
    (src/platform/telegram.ts:131). The web has no lock at all.
- **There is never a second column.** The agent inventories found no scene that uses VW to switch
  to a side-by-side layout. Every panel either stretches to VW, or caps its width at 176–260 UI px
  and centres (sheets, FirstRun's 200-px column). The only layout switches react to height:
  - `compact` (VH < 300) in battle and Menu, and `VH*S < 700` on the Menu
  - `VH < 240` on the situation line
  - `VH >= 350` for the duel fresco
  - `VH < 380` for Settlement art
  - `box.h >= 170` or `>= 280` on Shop

Taking the cap off `index.html` alone would make things worse, not better. Every scene would then
stretch to VW = 640 at 1280x800, as tablet portrait already shows, and phone landscape would go
from VW 124 to 422 while VH stays at 195. Landscape needs a layout model per screen family (§5),
plus a scale policy that lets S follow the shorter side on large screens. With S = 3 at 1920x1080,
the effective size is 640×360.

## 2. Severity scale

- **S1 Broken:** content or actions cannot be reached or read at that size, or it fails the kit's
  minimum.
- **S2 Poor:** usable, but letterboxed or stretched so badly that it fails the v6 goal of a true
  landscape layout.
- **S3 Cosmetic:** usable and reasonable; polish only.

Every scene is **S2 on laptops (letterbox)** and **S1 at 844x390** because of §1. The per-scene
severities below rate how hard the screen itself is to fix: what a landscape layout must solve
once the global cap is gone.

## 3. Per scene

The format for each scene is:

- **Today:** what you see on wide screens.
- **Sev:** the severity at landscape, tablet portrait and phone landscape.
- **Elements:** what is on the screen, taken from the scene code.
- **Needs:** what a good landscape or tablet layout must do.

Shared numbers:
- The hub shell loses a 46-px tab bar, a 10-px gap, a 7-px frame and a 24-px top bar. That is 94
  UI px.
- The hub content is 306 px tall at VH 400 and 98 px at VH 195.
- The sub-shell content is 362 px at VH 400 and 157 px at VH 195.

### 3.1 Shared shells (src/ui/mosaic: hub.ts, subShell.ts, ScreenFrame.ts, TopBar.ts, TabBar.ts, ParchmentSheet.ts)

- **Today:**
  - Everything is full width: frame, top bar plaque (centred), scroll area and a 5-slot `TabBar`
    with its medallion pinned to the bottom edge.
  - Sheets (`ParchmentSheet`) are capped at `min(o.w ?? 200|260, VW-16)`, centred or docked to the
    bottom.
- **Sev:** S2 / S2 / S1.
- **Needs:** this is the main lever. The shells must offer a **landscape variant**:
  - The `TabBar` becomes a **left navigation rail**: vertical, with the five modes and the
    medallion. This gives back 56 px of height.
  - The `TopBar` stays a strip.
  - The content box exposes **two or three panes** (a list pane and a detail pane) instead of one
    scroll area.
  - Sheets on landscape open as a **side panel** or a centred dialog with a sensible max width
    (about 300 UI px), not a bottom sheet across a wide screen.
  - The shells need a breakpoint API that screens read, for example a `layout: 'phone' | 'tablet'
    | 'wide' | 'short'` field on `UIMetrics`.

### 3.2 Menu / Campaign hub (src/scenes/MenuScene.ts)

- **Elements:**
  - Hub shell titled "Pixelarrow", Campaign tab, offline sync badge (:43).
  - `menu.save` ProfileCard: portrait, name, day, gold, trophies, warband (:64).
  - `menu.quest` QuestCard, "First steps n of 4" (:85).
  - `menu.banner` fresco, sized by `frescoSlot` (:114).
  - Primary `menu.continue` / `menu.new` (:127).
  - Three tiles: `menu.army`, `menu.stash`, `menu.camp`, with the disabled reason under them
    (:92–101).
  - Opens: Settings, Notifications, About, the new-campaign confirm.
- **Today:**
  - **Laptops:** a column with the fresco, and the CTA plus tiles pushed to the bottom. At
    1920x1080 an empty band sits between the quest card and the fresco.
  - **Tablet portrait:** the same stack stretched to 327–377 UI px. The tiles become wide, short
    bricks.
  - **844x390:** only the profile card is visible above the fold. The CTA, tiles and quest are
    below the fold, the name truncates ("Strategos Ep…"), and the tab labels are gone.
- **Sev:** S2 / S2 / S1.
- **Needs:**
  - Two panes: **fresco plus the CTA** as a hero panel on the left, and **profile, quest and the
    three tiles** stacked on the right.
  - The CTA must stay above the fold at every size.
  - On short landscape (VH under about 240), drop the fresco first, as `frescoSlot` already does.

### 3.3 Army (src/scenes/ArmyScene.ts)

- **Elements:**
  - Sub-shell "Army", sync badge (:88).
  - Situation sentence, only when VH ≥ 300 (:231).
  - Chips: `army.chip.men`, `.gold`, `.hurt`.
  - Hero card (`addArmyHead`), with a sticky mini-head once scrolled (:172).
  - `army.tab` switch, Roster | Stash (:314).
  - Roster: `army.filter` and `army.sort` buttons, rows `ARMY_ROW_H=34` (:341–379).
  - Stash: `MStashGrid` with drag-to-equip.
  - `ArmyFooter`: `army.dismiss` and `army.sheet` (parts.ts:305).
  - Opens: filter and sort option sheets, item cards.
- **Today:**
  - **Laptops:** one 256-px column.
  - **Tablet:** rows stretch to 327+.
  - **844x390:** the hero card fills the roughly 118-px view, and the roster starts below the fold.
- **Sev:** S2 / S2 / S1.
- **Needs:**
  - **Master–detail:** the roster or stash list on the left, the selected hero card or item on the
    right.
  - The stash grid gains columns.
  - The footer actions sit under the detail pane.
  - Drag-to-equip from the list to the hero slots works across panes, which is the natural use of
    a mouse.

### 3.4 Hero (src/scenes/HeroScene.ts)

- **Elements:**
  - Plaque retitled to the hero's name (:131, :263).
  - Power chip, wound line.
  - Head: a 112–124-px stage niche, 3+2(+mount) GearSlots, level pill, stars, and the `MPager`
    (chevrons, "2 / 8").
  - A compact head when VH < 300 (:161, :350).
  - XP bar, traits.
  - `hero.tab` with Stats / Gear / Perks / Skills, plus a pinned copy `hero.pinTab` (:236–254).
  - Stats rows with `attr.*.minus` / `attr.*.plus`, and `hero.respec`.
  - Gear `MStashGrid`.
  - Perk sheet (:937).
  - Skills.
  - `MActionBar`: `hero.undo` / `hero.confirm` or `hero.dismiss` (:509).
- **Today:** a column. At 844x390 the compact head (about 150 px) is taller than the view (about
  120 px), so the tabs start off-screen.
- **Sev:** S2 / S2 / S1.
- **Needs:**
  - A **paper-doll layout**: the stage and gear slots fixed on the left, the tabbed page (stats,
    gear grid, perks, skills) on the right.
  - The pager stays in the header.
  - Keyboard: ←/→ change hero, and 1–4 switch tabs.

### 3.5 Settlement: village, town, recruits, market, sell, rest (src/scenes/SettlementScene.ts)

- **Elements:**
  - Plaque with the place name (:100).
  - `town.art` fresco, 38, 58 or 78 px tall (:108).
  - Kind and culture line.
  - Chips: `town.gold`, `town.men`, `town.hurt`.
  - `town.tab`: Hire / Buy / Sell / Services, or Hire / Rest in a village (:137).
  - Bodies:
    - Recruits: ScrollList, 51-px rows, `town.hire`.
    - Market: ScrollList, `town.buy`.
    - Sell: `MStashGrid`.
    - Services: ScrollArea plus `town.rest` (:534).
  - `MActionBar`: `town.party` and `town.leave` (:158).
  - Opens: arrival event card, ware item card, buy confirm, recruit card (`src/ui/sheets/recruit.ts`).
- **Today:** a column. **At 844x390 this is the worst screen:** the fixed header stack leaves
  about 14 UI px for the body.
- **Sev:** S2 / S2 / **S1 (unusable)**.
- **Needs:**
  - The fresco and town identity become a **left banner pane**, running the full height.
  - The tabs and body take the right pane.
  - A recruit or ware row opens its card in a detail pane instead of a sheet.
  - The header stack must not be fixed height on short screens.

### 3.6 World map (src/scenes/WorldScene.ts)

- **Elements:**
  - Map sub-shell top bar: back, "Day N · place", gear (:911–920).
  - `SituationLine` with the time, the hint, and gold / men / food / supplies chips (:874).
  - Lairs (arc) chip and cloud badge (:877).
  - Follow eye `MIconButton` (:906).
  - `MActionBar` command strip: Camp / Rest / Stop / Party (:880, :929–950).
  - Night tint, toasts, map tooltips, coach bubble (`min(VW-16,176)`, :1607).
  - Opens: encounter and event cards (`world-encounter`, `world-event*`), the Journal
    (`world-journal`).
  - Camera: zoom 2 on the party, clamped to 1–4 (:282, :1153). Wheel zoom around the screen centre
    (:301). Pinch (:1122).
- **Today:**
  - **Laptops:** the map in a 512-px column. The map itself would happily fill the screen.
  - **Tablet:** works; the extra width shows more map.
  - **844x390:** about 100 UI px of map under the situation line.
- **Sev:** S2 / S3 / S1.
- **Needs:**
  - A full-bleed map, with the situation line as a top-left card, chips in a top bar, and the
    command strip as a bottom-right cluster or a right rail.
  - The camera already uses extra width, so this is mostly a matter of moving the overlays.
  - Mouse: wheel zoom around the pointer (today it zooms around the centre), drag to pan, and hover
    tips on towns and lairs.
  - Keys: WASD or arrows to pan, +/− to zoom, C for camp, R for rest, P for party.

### 3.7 Camp (src/scenes/CampScene.ts)

- **Elements:**
  - Sub-shell map top bar.
  - `SituationLine` over the map (:725), plus an online second chip row (:732).
  - Zoom key (:743).
  - Bottom strip, two rows of buttons, 60–72 px (:713–795): build, muster, temper, supplies,
    place, and others.
  - The clearing is a masked container in the UI layer, not a camera, and its zoom toggles
    between 1× and 2× (:620).
  - Sheets: build, muster, temper, supplies, and the war build (`camp-war-build`), all
    `min(VW-12,240|250)` (:1070–1417).
- **Today:** a column. At 844x390 about 99 px of clearing remains, and the situation line covers
  part of it.
- **Sev:** S2 / S3 / S1.
- **Needs:**
  - The clearing fills the screen, and the two-row button strip becomes a **right-side tool rail**.
  - Build, muster and temper sheets open as side panels, so the clearing stays visible while
    placing.
  - There is no wheel today, because Camp has no camera. It needs wheel zoom and drag pan for a
    mouse.

### 3.8 Battle: deploy, fight, groups, retreat, menus, assault and works, online, duel, beast (src/scenes/BattleScene.ts, src/ui/battleHud.ts, battlePanel.ts, battleCamera.ts)

- **Elements:**
  - Two cameras: the world camera and a full-screen `uiCam` (:622–628).
  - **Top bar**, `TOP_H=46` (battleHud.ts:27): Menu key, clock and label, army strength bars
    "You n% vs n% Foe", Pause/Play, Speed (1×/2×). Built at :2931.
  - Corner keys: Zoom (magnifier, :2946) and Follow (eye, :2938).
  - `HintPill` (:2936).
  - Online deploy countdown bar (:3167).
  - **Bottom sheet**:
    - Group cards two per row, 28 px tall (:3184–3221).
    - Orders row, `orderKeyWidths(VW-8)` (:3306–3328): Advance, Charge, Hold, Shoot, Withdraw.
    - Selected-group line and the Formation button.
  - **Chip row** above the sheet: shape, Groups, Then…, Undo (`undoChip`, :217). It wraps
    (:3420–3440).
  - **Ability medallion rail** on the right edge, or the left in left-hand mode, `MED_W=50`, at most
    3 medallions plus "more" (battleHud.ts:443–460).
  - On the field: facing pips (:3644), group tags, edge pointers (:4358), the boss bar for beasts
    (:620).
  - Popups: gesture hint, tooltip, works tray (:4020), banners, Groups modal (`min(VW-12,220)`,
    :4734), retreat and settings shade (:3731).
  - Camera: the opening fit `frameArmies` → `openingFrame` uses the full width, zoom 0.5–1 (:706,
    battleCamera.ts:96). Runtime zoom is 1–3 (:2040). The zoom key cycles 1→2→3 (:2054). Wheel zoom
    around the screen centre (:650).
- **Today:**
  - **1280x800** (looked at): a clean portrait column. The 6 battle screens pass the layout check,
    but the field is about 512×520 CSS px in the middle of a 1280 screen.
  - **Tablet:** the cards and order keys stretch, and there is more field.
  - **844x390** (looked at): a 250-px sliver. The field band is about 110 CSS px under a 46-UI-px
    top bar, the order keys lose their labels, and the group names truncate ("PHAL…", "SKIRM…").
- **Sev:** S2 / S3 / **S1 (unplayable)**.
- **Needs:**
  - **The field full-bleed.**
  - The top bar shrinks to a thin strip or top-left and top-right clusters.
  - The **group cards become a left or right side column**, one card per row, so they stack
    vertically.
  - The **orders become a bottom-centre bar** with hotkey hints. The ability rail stays on the
    right.
  - On landscape, the sheet height must not eat the field. Its height formula ignores `compact`
    today.
  - The opening fit should use the true band, which is wider than tall in landscape.
  - Mouse:
    - left-click selects
    - left-drag draws the order arrow
    - right-click issues move or attack, as an option
    - wheel zooms around the pointer
    - hover shows the group tooltip
  - Keys:
    - 1–9 select groups
    - Q W E R T for the five orders
    - Space pauses
    - `+` / `-` change speed
    - Ctrl+Z undoes
    - Shift queues Then

### 3.9 Results and Inspect (src/scenes/ResultsScene.ts)

- **Elements:**
  - Frame with no top bar (:162).
  - Banner (Victory, Defeat), `min(box.w-8,220)`, 30, 38 or 46 px tall (:167, :312), with the
    "vs …" line.
  - `results.why` and the abandoned note.
  - `results.tab`: Summary / Heroes / Spoils (:201).
  - Summary: 5 stat tiles in a 3+2 grid plus the MVP (:422).
  - Heroes: rows with XP bars.
  - Spoils: a card grid of 2–3 columns, 64 px tall (:629).
  - Arc-victory variant with the company roll (`results-arc`).
  - Online variant (`results-online`).
  - Primary `results.primary` (Spoils / Continue), pinned (:209).
  - Inspect modal `min(VW-12,210)` × `VH-16` (:800).
- **Today:**
  - **Laptops:** a column.
  - **844x390** (looked at): one row of tiles, labels truncated ("Summ…", "Hero…"), the page area
    about 45 UI px.
- **Sev:** S2 / S2 / S1.
- **Needs:**
  - The banner and why-line take a left pane, the tabs and page the right pane. Alternatively, on
    wide screens, all three tabs side by side as columns, because there is room for summary,
    heroes and spoils at once.
  - The primary button sits bottom-right.
  - Enter continues.

### 3.10 War map, the online hub (src/scenes/online/OnlineScene.ts, regionMapView.ts, beastPanel.ts)

- **Elements:**
  - `ScreenFrame` plus `TopBar` with the gear (:503).
  - Situation strip, `SIT_H=28`.
  - Chip grid (:505).
  - Map window (:507) and the `TabBar` (:522).
  - **Right key rail:** Army / Clan / Lobby / Centre / Zoom (:690–718). The whole rail hides if it
    doesn't fit (:701).
  - March bar, `MARCH_H=24`.
  - **Hex panel** `BottomPanel` (:893), with action rows. Its info lines are dropped when it is
    over height (:902).
  - Result sheet and list sheets (`min(VW-16,220)`).
  - Beast sheet, `VW-8`, docked to the bottom (beastPanel.ts:70).
  - Coach bubbles (`online-coach-*`).
  - Camera: zoom limits come from S only (regionMapView.ts:132). Wheel zoom around the pointer
    (:336, the only scene that does it). Pinch, snap.
  - Server down: a parchment card reading "Online unavailable…" (looked at, 1920x1080).
- **Today:**
  - **Laptops:** a hex map inside a column.
  - **844x390:** a map window of about 30–50 UI px. The rail hides, so Army, Clan, Lobby, Centre
    and Zoom are **gone**, and any hex panel covers the whole window.
- **Sev:** S2 / S3 / **S1 (actions unreachable)**.
- **Needs:**
  - A full-bleed hex map with the left navigation rail (from the shell).
  - The situation and chips become a top-left card.
  - The key rail stays on the right edge, full height.
  - The hex panel becomes a **right-side detail panel**, not a bottom panel over the map.
  - Mouse: hover a hex to show its owner and defenders, wheel zoom (already done), drag pan,
    right-click to march, as an option.

### 3.11 Online Army, Clan, Merchant (src/scenes/online/OnlineArmyScene.ts, ClanScene.ts, MerchantScene.ts)

- **Online Army elements:**
  - Sub-shell.
  - One ScrollArea (:286) holding the purse chips (:339), the hero card or garrison head, the
    Roster | Stash switch (:395), and rows or `MStashGrid` (:501).
  - Footer: Recruit (primary), Market, Shop, or a full-width Station button in garrison mode
    (:452).
  - Recruit sheet (:563).
  - API-down state (`online-army-closed`).
- **Clan elements:**
  - The no-clan card: art (`min(96,…)`, hidden under 40), lead text, `Found` (`min(b.w-16,130)`,
    :208).
  - The clan view: a label column `max(64,min(90,w*.42))` (:226).
  - Sheets: link, manage, join (`min(VW-16,200)`, :370–476).
- **Merchant elements:**
  - Gold and Drachmae chips (:154).
  - ScrollArea with an info parchment, SectionTitles and offer rows (:171–214).
- **Today:** single stretched columns. At 844x390 they scroll but stay usable.
- **Sev:** S2 / S2 / S2.
- **Needs:**
  - Online Army follows the Army master–detail pattern (§3.3).
  - Clan uses two panes: the clan card and members on the left, management on the right.
  - Merchant uses a 2–3 column offer grid.

### 3.12 Duels (src/scenes/duel/DuelScene.ts, hubLayout.ts, duelParts.ts)

- **Elements:**
  - Hub shell or sub-shell with a back arrow (:532).
  - Header row (`headerLayout`, hubLayout.ts:46): Glory chip, Level chip and bar, Team, Armoury.
  - Fresco and chest tip, only when VH ≥ 350 (hubLayout.ts:10–22).
  - Mode switch: Ladder | Arena (:765).
  - **Ladder:** chapters with `FloorTile` grids, 5 or 4 per row, plus chests (:952–967).
  - Floor sheet, full width, docked to the bottom (:1150).
  - Chest reward, level sheet.
  - **Team:** presets 1–3, roster, recruit, dismiss, preset sheet, symbols, hero sheet.
  - **Shop:** Offers / Gear / Sell. Cards go to 2 columns when `w ≥ 2*176+GAP` (:2704).
  - **Ranked / Arena:** home, raid, board (Live / Legend / Raids), defence, searching, found,
    locked states, season reward and pick, raid log, results for ladder, raid and ranked.
  - Main action `MButton`, 30 px, at the bottom of the content (:541).
  - About 13 other sheets, `min(VW-12,210–240)`.
  - API-down state (`duel-closed`).
- **Today:**
  - **Laptops:** a column.
  - **844x390** (looked at): only the header row and the mode switch are visible. The ladder, the
    main action and the fresco are all below the fold.
- **Sev:** S2 / S2 / S1.
- **Needs:**
  - **Three zones:** the header (glory, level, Team, Armoury) as a left profile column; the mode
    content (ladder chapters as a wide grid, the arena board as a table) in the centre; the main
    action fixed at the bottom-right.
  - The floor sheet becomes a side panel.
  - The shop gets a 3–4 column card grid.
  - The leaderboard uses table columns on wide screens.

### 3.13 Shop: Shop, Pass, Wallet, cosmetics, consumable picker (src/scenes/ShopScene.ts, src/ui/econ/consumablePicker.ts)

- **Elements:**
  - Hub shell, Shop tab.
  - `shop.drachmae` chip, pinned only when `box.h ≥ 170` (:158).
  - `shop.banner` fresco, only when `box.h ≥ 280` (:166).
  - `shop.tab`: Shop / Pass / Wallet, with a claim badge (:171).
  - **Shop:** a tip line, a Market card, `LookCard` grid with `cols = max(2, floor((w+GAP)/61))`
    (:267), and the map-merchants card.
  - **Pass:** season card with `pass.unlock` / `pass.claimAll`; Free and Premium headers; tier rows
    `ROW_H=46`, pinned only if two rows fit (:487).
  - **Wallet:** balance, packs, `wallet.terms`, `wallet.refunds`, history.
  - Sheets: cosmetic (:355), pass XP (:574), need-Drachmae (:748), consumable picker
    (`min(VW-16,240)`).
- **Today:** a column. At 844x390 the chip and fresco drop, and the Pass falls back to scrolling
  everything.
- **Sev:** S2 / S3 / S1.
- **Needs:**
  - The grid already reflows by width (6 columns at 422), which makes this the easiest list to
    widen.
  - The Pass becomes a **horizontal tier track**, the natural landscape pattern.
  - On the web, the Wallet must show the "coming soon" Payments placeholder (brief §7).

### 3.14 Market (src/scenes/MarketScene.ts)

- **Elements:**
  - `ScreenFrame` and `TopBar`, built by hand, with back (:163).
  - Purse chips `market.purse.gold` and `market.purse`.
  - `market.tab`: Browse / Mine / Sell (:260).
  - **Browse:** filters `market.kind`, `market.cur`, `market.sort`; `market.find`;
    `market.clearRef`; the listing ScrollList with `market.price` and `market.more`.
  - **Mine:** a ScrollList.
  - **Sell:** an ItemIcon grid.
  - Sheets: filters (:378), Find (`min(VW-12,210)` × `VH-24`, :622), goods card, sell form (:783),
    number keypad, price.
- **Today:** a column. At 844x390 (looked at) the filters truncate ("An…", "Ne…") and one listing
  shows.
- **Sev:** S2 / S2 / S1.
- **Needs:**
  - A **filter sidebar on the left**, the listings as a table or grid in the centre, and the
    listing detail and price form on the right.
  - The number keypad becomes keyboard entry when a keyboard is present.

### 3.15 Codex (src/scenes/CodexScene.ts)

- **Elements:**
  - Hub shell.
  - `codex.seg`: Beasts / Doctrines once a doctrine is met, otherwise a SectionTitle (:86–106).
  - Rows `codex.<enc>` and `codex.doctrine.<id>`: art well, title, level, hint, chevron;
    `ROW_H=40` (:29).
  - Opens: the beast sheet with the Trial fight (`codex-beast`), the doctrine sheet
    (`codex-doctrine`).
- **Today:**
  - **Laptops:** a column.
  - **Tablet 768x1024** (looked at): readable, full-width rows with long descriptions on one
    line, but a list where a grid belongs.
  - **844x390** (looked at): two rows show, with "Lernae…" truncated.
- **Sev:** S2 / S3 / S1.
- **Needs:**
  - A **card grid** of beasts and doctrines (3–5 columns).
  - The beast or doctrine detail opens in a right pane.
  - Simple to build, high payoff.

### 3.16 Settings and its sub-pages (src/ui/settings.ts, notifySettings.ts, legal.ts)

- **Elements:**
  - `ParchmentSheet` docked to the bottom, `w = min(VW-8,240)`, `h = min(…, VH-12)` (:106).
  - 27 rows in a ScrollList:
    - Audio: Sound toggle, Music and Effects steppers.
    - Language tabs: Auto / English / Русский.
    - Battle: damage numbers, the 4 pause toggles, the speed stepper.
    - Haptics, left-hand, analytics.
    - Motion, shake, flash.
    - Sync status.
    - `settings.tutorial`, `settings.newCampaign` (with a confirm, `menu-reset`).
    - Notifications page (`menu-settings-notify`) and About and legal page
      (`menu-settings-about`).
- **Today:**
  - **Laptops:** a 240-px sheet, fine.
  - **844x390** (looked at): the sheet is narrower than its rows, so labels collapse to "…" and
    "E…", and the language tabs read "Engl…" and "Рус…".
- **Sev:** S3 / S3 / S1.
- **Needs:**
  - A centred dialog on wide screens, with two columns of sections.
  - A new **Controls** section for v6, shown only with a keyboard: key bindings and rebinding.
  - Account rows: email, linking, privacy, delete.
  - Escape closes.

### 3.17 First run and tutorial (src/scenes/FirstRunScene.ts, src/ui/tutorial/*)

- **FirstRun elements:**
  - `ScreenFrame` and `TopBar` (:89).
  - **The only width-capped column** in the game: `min(inner.w, 200)`, centred (:93).
  - Offer and resume screens, laid out bottom-up: `firstrun.skip`, the primary CTA, the Nikias
    speech card, and the `firstrun.art` fresco if 40 px or more remain (:195–207).
  - Reward screen: gold card and item card.
  - Modes screen: three `ParchmentCard`s (`firstrun.mode.*`).
  - Skip confirm.
- **Tutorial elements:** battle narrator, coach bubbles, the skip dialog (`tutorial-skip`), and the
  online coach.
- **Today:**
  - **Laptops:** a 200-UI-px column inside a 256 column inside a 1280 screen.
  - **844x390:** `sy` is not clamped (:203), so a tall speech card can run up into the top bar.
- **Sev:** S2 / S3 / S1.
- **Needs:**
  - A landscape stage: the fresco or Nikias on the left, speech and choices on the right.
  - The modes as three side-by-side cards.
  - The tutorial must mention keyboard controls on keyboard devices (brief phase 6), and its coach
    bubbles must point at the new rail and bar positions.

### 3.18 UI Kit (?scene=Kit, src/scenes/KitScene.ts, src/scenes/kit/*)

- **Elements:**
  - Pager row: `kit.prev`, `kit.pages`, `kit.next` (:65).
  - Page-list sheet.
  - Pages: controls, items, lists, mosaic (with TabBar and BottomPanel), parts, shell, tokens,
    type, states, overlays (sheet, sheet-actions, decision, footer-close, confirm-over, item,
    purchase), icons, army, pages.
- **Today:** the same column. At 844x390 the mosaic page has about 71 px of content.
- **Sev:** S3 / S3 / S2 (dev-only).
- **Needs:**
  - The Kit is the **acceptance surface for the v6 responsive primitives** (brief phase 4).
  - It needs a "Layouts" page showing the shell in its phone, tablet, wide and short variants, the
    navigation rail, the side panel, and focus rings.

### 3.19 Boot and BeastTrial

- **Boot** (`src/scenes/BootScene.ts`) is the loading screen and its Retry button. It is centred
  and works at any size.
- **BeastTrialScene** is a redirect stub that goes straight to Codex (:24).
- **Sev:** S3.

## 4. Mouse and keyboard today

| Input | Today | File |
| --- | --- | --- |
| Hover | **Tooltip only.** A mouse resting 500 ms on a kit `Button` or `tappable` shows the long-press tip (A11Y-15). There is **no hover visual state** (no highlight, lift or tint) and **no hand cursor** (`useHandCursor` is unused). | src/ui/hover.ts:58, src/ui/kit.ts:470, :999 |
| Wheel | Battle and World zoom one step around the **screen centre**. The War map zooms around the **pointer**. Kit `ScrollArea`s scroll by `dy*0.3`, but **every live scroll area in the scene scrolls, whatever is under the pointer**, because `onWheel` has no bounds check. Camp has no wheel. | BattleScene.ts:650, WorldScene.ts:301, OnlineScene.ts:336, kit.ts:820 |
| Right-click | None. The browser context menu opens over the canvas. | n/a |
| Keyboard | **None in the game.** No `addKey`, `keydown` or `input.keyboard`. Escape does nothing, and Back is only on-screen or Telegram's. The only key handler is Escape in the DOM text prompt. | src/scenes/online/textInput.ts:110 |
| Focus navigation | None. There is no focus model, focus ring, tab order or initial focus, and sheets do not trap focus. | n/a |
| Drag | Pointer drags for battle orders, map pan, stash drag-to-equip and scroll; they work with a mouse. | various |
| Text entry | DOM overlay prompt (clan names and the like). | textInput.ts |

## 5. Gaps against the brief

Checked against `docs/playbook/director-brief-v6.md`, Goal §3 and the Hard constraints.

1. **True landscape layouts: missing everywhere.** The `index.html` 0.64 cap and the height-only
   `uiMetrics` make every wide screen a letterboxed column. No scene has a width breakpoint.
2. **Tablet portrait: stretched, not designed.** 768 and 820 wide fill the screen, but by stretching
   rows; nothing reflows.
3. **Phone landscape 844x390: fails.** VW 124 × VH 195 is below the kit minimum. Labels truncate,
   CTAs and the War map's key rail disappear, and Settlement and Battle are unusable. The brief keeps
   phones portrait-first but puts 844x390 in the matrix. Decide between a short-landscape layout
   and a "rotate your device" card on phones. The card is the cheaper option, with a touch device
   and a short side under about 500 CSS px as the trigger.
4. **Scale policy for large screens.** S is pinned at 2 up to 1920x1080, so the UI does not grow
   with the screen. On landscape, S should come from the shorter side: S = 3 at 1080p.
5. **Hover states: missing.** Only delayed tooltips exist. There is no highlight or cursor.
6. **Right-click and pointer-anchored wheel zoom on the field: missing.** Battle and World zoom
   around the centre.
7. **Keyboard focus navigation through menus and sheets: missing.** There is no focus model at all.
   The `game-ui-ux` skill requires one: initial focus per screen, focus order, a visible focus ring,
   mouse and focus coexisting, and a screen stack. `src/platform/nav.ts` already provides the
   screen and layer stack, so Escape and Backspace can map onto its `back`.
8. **Battle hotkeys** (orders, groups, pause, speed, Undo, Then): missing.
9. **Rebindable keys with conflict detection, saved per device, offered only with a keyboard:**
   missing. There is no input-hint detection either: nothing reads `matchMedia('(hover: hover)')`,
   `(pointer: fine)` or `maxTouchPoints`. That belongs in the platform layer ("input hints").
10. **Layout check covers only phone sizes.** The matrix needs the 10 sizes, and the rules need
    landscape checks such as "content uses at least X% of the width" and "no single row wider than
    N UI px". Today the column passes at every laptop size, so the letterbox is invisible to the
    gate.
11. **Wheel scrolling hits every scroll area,** not the one under the pointer. This will matter as
    soon as multi-pane layouts put two scroll areas on screen.
12. **Settings has no Controls section** and no account, privacy or delete rows; those are needed
    for brief §5 and §9.

## 6. Ranked screen families by landscape effort (most effort first)

| Rank | Family | Scenes | Effort | Why |
| --- | --- | --- | --- | --- |
| 1 | **Battle HUD** | Battle (all 18+ states), Results | XL | The densest HUD. It needs a new side group column, a bottom orders bar, the chip row and rail moved, a camera band rework, and the most hotkeys and mouse verbs. It has to stay readable in real time, and online and duel variants share it. |
| 2 | **War and the online hub** | Online map, Online Army, Clan, Merchant | L | Full-bleed hex map, the hex panel as a side panel, a rail that never hides, coach bubbles re-pointed, four scenes. |
| 3 | **Duels** | Duel hub, Ladder, Arena, Team, Shop, about 30 states | L | The largest single scene (3,195 lines), about 13 sheets, many sub-pages, and a three-zone layout. Leaderboards want table columns. |
| 4 | **Shell and hubs (foundation)** | Hub and sub shells, TabBar to rail, sheets to side panels, `uiMetrics` breakpoints, `index.html` cap, Menu | L, but must come first | Every other family depends on it. Menu itself is M once the shell exists. |
| 5 | **Army and Hero** | Army, Hero, stash, compare | M–L | Master–detail and a paper doll, with drag across panes. |
| 6 | **Settlements and economy** | Settlement (all tabs), Market, Shop | M | List and detail patterns with a filter sidebar. The Pass track is new. Settlement is the worst at 844x390. |
| 7 | **World and Camp maps** | World, Camp | M | The camera already uses width, so this is mostly moving overlays. Camp needs a camera, or wheel and pan, for a mouse. |
| 8 | **First run and tutorial** | FirstRun, battle tutorial, online coach | S–M | Few elements, but every coach bubble's anchor moves with the new layouts. |
| 9 | **Codex** | Codex, beast and doctrine sheets | S | A card grid and a detail pane. |
| 10 | **Settings and dialogs** | Settings, Notifications, About, confirms, Kit overlays | S | A centred dialog, plus the new Controls and account sections (new content, not relayout). |
| 11 | **Kit and Boot** | ?scene=Kit, Boot | S | Add a Layouts page as the acceptance surface; Boot already works. |

Suggested order, matching brief phase 6:
1. Shell, scale policy and breakpoints, the Kit Layouts page, the input layer (focus, hover,
   keys).
2. Hubs and first run.
3. Army and Hero.
4. Battle and Results.
5. Settlements, World and Camp.
6. Duels and War.
7. Shop and Market.
8. Codex.
9. Dialogs.

## 7. Skills applied

- **game-ui-ux:**
  - Judged each screen against its core workflow: anchors and containers rather than absolute
    positions; a scale policy for extra width (letterbox vs expand, which found the 0.64 CSS
    letterbox and the height-only S); a safe area; focus navigation with initial focus and a
    visible ring; a screen stack; "verify across screens and report what you observed at which
    resolutions" (§1 table, looked-at shots).
  - Its pitfalls drove §4–5:
    - "No aspect-ratio policy"
    - "No initial focus"
    - "Mouse-only or focus-only"
    - "Tiny fixed font sizes", which is the S = 2 cap on 1080p
- **ux-review:**
  - Applied its checklist dimensions to the current screens in place of a spec:
    - Input Method Coverage: keyboard-only navigation and focus order, all missing.
    - Completeness of States: empty and API-down states present (`duel-closed`,
      `online-army-closed`, Online unavailable).
    - Accessibility: truncation and text at 844x390.
    - "No element silently dropped": the element inventories, plus the rail hiding at short
      heights.
  - Verdict on the current UI as a v6 landscape surface: **MAJOR REVISION NEEDED**, scoped to
    layout and input; the visual kit itself is sound.
