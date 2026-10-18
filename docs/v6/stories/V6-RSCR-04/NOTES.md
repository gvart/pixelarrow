# V6-RSCR-04 notes: Duels (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.3, §3.4, §3.7, §4, §9 (9.1–9.3), §15, §16.9. Decisions: V6-055, V6-059, V6-062, V6-063, V6-065, V6-066, V6-067, V6-068, V6-072, V6-075, V6-078, V6-083, V6-086, V6-088. The duel battle HUD and Results are RSCR-02's (V6-075); the duel Hero sheet is RSCR-05's (V6-072).

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/duel/DuelScene.ts`, `hubLayout.ts` and `duelParts.ts` at v6 500a5c6d, next to spec §9.1. Columns: where the element is after this story. "v5" is compact portrait (390x844, 360x780, 320x693), unchanged. "Side" is the profile column (130 wide at 844x390, 180 at expanded and for the tablet's Team); "main" is the mode content beside it; "stack" is the v5 page across the tablet's pane.

### Hub: Ladder and Arena (`duel-ladder`, `duel-ladder-open`, `duel-ranked`, `duel-ranked-locked`)

| Element (code) | uiId | Spec §9.1 | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Hub shell: top bar, gear | `hub.topbar` | hub shell | yes | yes | yes | yes |
| Mode navigation (five modes, Duels lit) | `tab.*` | hub shell | tab bar | nav rail (RSCR-01) | tab bar | nav rail |
| "Duels" title, "Demo" note (tap: what the demo is) | `duel.demo` | — | yes | side, top | stack | side, top |
| Glory chip (counts up, target of the chest's fly-in) | `duel.glory` | Glory chip | header row | side, stacked | header row | side, stacked |
| Level chip and bar (tap: level sheet) | `duel.level` | Level chip and bar | header row | side | header row | side |
| Team (badge when a fighter has points), Armoury | `duel.team`, `duel.shop` | Team (badge), Armoury | header row (labelled or icon-only) | side, labelled, full column width | header row | side, labelled |
| Fresco of the mode (VH ≥ 350) | `duel.banner.ladder`, `duel.banner.arena` | fresco | VH ≥ 350 | collapsed into `duel.mode` (`uiCollapsed`, spec: "fresco dropped (short)") | 56 tall (spec: max 120) | side, 180 x 99 |
| Tip line (team problem; chest ready) | `duel.tip` | chest tip | VH ≥ 350 for the chest | side (always: it no longer pushes the floors down) | stack | side |
| Mode switch Ladder \| Arena | `duel.mode` | mode switch | under the header | fixed bar over main | under the header | fixed bar over main |
| Next-floor card (floor, Glory, team vs cap; tap: floor sheet) | `duel.nextCard`, `duel.nextFloor` | next-floor card | yes | main, top | main, beside Fight | main, beside Fight |
| Fight floor n (primary) | `duel.fightNext` | primary | under the card | main, under the card, `uiPrimary`, at scroll 0 | beside the card (≤ 240) | beside the card (≤ 240) |
| All floors cleared card | `duel.ladderDone` | — | yes | main | stack | main |
| Chapters: heading (open or locked), stars, three chests | `duel.chapterCard.n`, `duel.chapter`, `duel.chest.1..3` | chapters, chests | yes | main | stack | main |
| Floor tiles | `duel.floorNext`, `duel.floorDone`, `duel.floorLocked` | FloorTile grids | 5 a row (4 at 320 in Telegram) | 5 a row | 5 a row | 10 a row (one chapter a row) |
| Farm Glory left today bar | `duel.farm` | — | yes | main | stack | main |
| Season line (month, time left, season best) | — | — | yes | side | stack | side |
| Live PvP card: title, Top (board), standing, pay line, Find match, Unranked, Rejoin | `duel.liveCard`, `duel.live.board`, `duel.findRanked`, `duel.findUnranked`, `duel.rejoin` | Arena home | yes | main (Find match / Play unranked `uiPrimary`) | stack | main, buttons ≤ 360 |
| Locked card (level progress, what opens it) | — | locked | yes | main | stack | main |
| Raids card: title, Top, standing, raids left, defence row, Raid, Log | `duel.raidCard`, `duel.raids.board`, `duel.raid.defence`, `duel.raid.open`, `duel.raid.log` | raid | yes | main | stack | main |

### Ladder sheets (`duel-floor`, `duel-floor-farm`, `duel-chest`, `duel-chest-item`, `duel-level`)

| Element (code) | uiId | v5 | 844x390 | tablets | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Floor sheet: reward, your team / enemy / allowed wells, over-cap line, pausable, stars rule, farm line, enemy army rows; Fight or Farm | `duel.floorSheet`, `duel.floorFight` | bottom sheet, full width | right side panel; Fight `uiPrimary` | bottom sheet, 240 | right side panel |
| Chest preview (locked or claimed) | `duel.chestSheet` | sheet | side panel | sheet | side panel |
| Chest reward: the chest opening, Glory, the 30-star item (tap: item card), Collect | `duel.rewardSheet`, `duel.chest.item`, `duel.chest.ok` | sheet | centred dialog (a reward, not a task) | dialog | centred dialog |
| Level sheet: XP bar, how duel XP comes, what the next levels open | `duel.levelSheet` | sheet | side panel | sheet | side panel |

### Arena sub-screens (`duel-searching`, `duel-searching-unranked`, `duel-found`, `duel-raid`, `duel-raid-locked`, `duel-defence`, `duel-raid-log`, `duel-board-*`, `duel-season-*`)

| Element (code) | uiId | v5 | 844x390 | tablets | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Sub-shell: back arrow (none while searching or found), title | `duel.topbar` | yes | yes | yes | yes |
| Search: rings, clock, range bar, how it widens | — | page | main, in the middle of the pane | stack, in the middle | main, in the middle |
| Search: your lineup, your league | `duel.lineup`, `duel.myLeague` | page | side | stack | side |
| Cancel (fixed action) | `duel.cancelSearch` | page foot | main, bottom right (≤ 240) | bottom right | bottom right |
| Opponent found: two crests, names, leagues, VS, preparing line | `duel.foundCard` | page | main (lineup and league stay in the side) | stack | main |
| Preparing (fixed, off) | `duel.preparing` | page foot | bottom right | bottom right | bottom right |
| Raids: chips, tip, standing and raids left, defence row | `duel.glory`, `duel.level`, `duel.tip`, `duel.raid.defence` | page | side | stack | side |
| Raids: heading, Log, defender rows (pick lit and checked), empty / locked / error cards | `duel.raid.logStrip`, `duel.raid.row.n`, `duel.raid.pick`, `duel.raid.empty`, `duel.raid.error` | page | main (rows ≤ 360), in the middle | stack | main |
| Raid the picked defender (fixed) | `duel.raid.attack` | page foot | bottom right | bottom right | bottom right |
| Defence sheet (one button per team) | `duel.defSheet`, `duel.def.n` | sheet | side panel | sheet | side panel |
| Raid log sheet | `duel.logSheet` | sheet | side panel | sheet | side panel |
| Board: Live \| Legend switch, season sentence, title line | `duel.board` | page | side | stack | side |
| Board rows: rank medal, crest, name, rating (or the league pill) | `duel.board.n` | list | table: rank, crest, name, league, games, rating | table | table |
| You, pinned | `duel.board.me` | under the list | side, under the words | under the list | side |
| Board empty / error | `duel.board.empty`, `duel.board.error` | page | main | stack | main |
| Season rewards popup (rows, title line, set piece line; OK or Pick) | `duel.rewardsSheet`, `duel.reward.ok`, `duel.reward.pick` | sheet | centred dialog | dialog | centred dialog |
| Season pick (one button per piece) | `duel.pickSheet`, `duel.pick.<def>` | sheet | centred dialog | dialog | centred dialog |

### Team (`duel-team`, `duel-team-presets`, `duel-team-delete`, `duel-recruit`, `duel-dismiss`, `duel-preset`, `duel-symbols`)

| Element (code) | uiId | Spec §9.1 | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Chips (Glory, level) | `duel.glory`, `duel.level` | — | header row | side, stacked | side | side |
| Recruit (the view's primary) | `duel.recruit` | recruit | after the roster card | side, under the chips, `uiPrimary`, at scroll 0 | side | side |
| Tip (over budget; points to spend) | `duel.tip` | — | yes | side | side | side |
| Presets 1–3 and "+" | `duel.preset.n`, `duel.preset.new` | presets | yes | side | side | side |
| Points against the budget, cap note | `duel.points` | — | yes | side | side | side |
| Roster card, symbols (i) | `duel.rosterCard`, `duel.roster`, `duel.symbols` | roster | yes | side, last | side | side |
| Team's hero rows (tap: Hero sheet), bench / add toggle | `duel.hero.<id>`, `duel.heroRow`, `duel.bench`, `duel.addToTeam` | roster | yes | main | main | main (rows ≤ 360) |
| Bench heading, Dismiss door, bench rows | `duel.benchDismiss` | dismiss | yes | main | main | main |
| Preset sheet: where it fights, Rename, Duplicate, Delete | `duel.presetSheet`, `duel.use.*`, `duel.preset.rename`, `.duplicate`, `.delete` | preset sheet | sheet | side panel | sheet | side panel (buttons ≤ 240) |
| Delete confirm | — | team delete | dialog | centred dialog | dialog | centred dialog |
| Recruit sheet (class rows, hire, class card) | `duel.recruitSheet`, `duel.classCard`, `duel.hire` | recruit | sheet | side panel | sheet | side panel |
| Dismiss sheet (bench rows, dismiss, confirm) | `duel.dismissSheet`, `duel.dismissOne` | dismiss | sheet | side panel | sheet | side panel |
| Symbols sheet | `duel.symbolsSheet` | symbols | sheet | side panel | sheet | side panel |
| Hero sheet (the duel army's) | (HeroScene) | hero sheet | RSCR-05 | RSCR-05 | RSCR-05 | RSCR-05 |

### Armoury (`duel-shop-offers`, `duel-shop-gear`, `duel-shop-sell`)

| Element (code) | uiId | Spec §9.1 | v5 | 844x390 | tablets | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Chips, tip, Today \| Gear \| Sell | `duel.glory`, `duel.level`, `duel.tip`, `duel.shop` | Offers / Gear / Sell | yes | one pane (top) | stack | side |
| New offers in … | — | — | yes | top | stack | side |
| Slot filter (icons; cycle button when narrow) | `duel.slot.*` | — | yes | top | stack | side |
| Compare with … | `duel.compare` | — | yes | top (≤ 360) | stack | side |
| Offer cards (item, price, -20%, rarity, slot, compared stats, Buy; tap: item card) | `duel.offerCard.<id>`, `duel.offer`, `duel.buy` | cards | 2 columns from 2 x 176 | 2 columns | 2 columns | 2 columns (3 from 456 wide) |
| Sell: stash filters and grid (tap: sell or salvage card, confirm) | `filter:*`, `item:*`, `duel.sell` | Sell | grid filling the page | grid | grid | main, in the middle of the pane |
| Compare sheet | `duel.compareSheet`, `duel.compare.row` | — | sheet | side panel | sheet | side panel |

### States (`duel-closed`)

| Element (code) | uiId | v5 | landscape and tablets |
| --- | --- | --- | --- |
| Loading skeleton cards | — | yes | yes |
| Unavailable card: icon, title, hint | `duel.state` | card at the top, Retry at the page foot | one card across the pane, in the middle of its height, Retry inside it at the right (§15) |
| Retry | `duel.retry` | fixed | in the card, `uiPrimary` |
| Sign in to play online (AU-01, V6-086) | (gate) | yes | yes (unchanged, inside the pane) |

Nothing is removed. The fresco is the only element left out of a layout, at 844x390, registered `uiCollapsed` into the mode switch (spec §9.2: "fresco dropped (short)").

## What changed

- **`src/scenes/duel/duelLayout.ts`** (new, pure; `tests/duelPanes.test.ts`): `duelPanes(m, region, view)` gives the profile column and the mode content per variant (null in compact portrait: the v5 page); `floorsPerRow` (ten a row at expanded, five elsewhere, four on the narrowest phones as v5); `offerColumns` (v5's two from 2 x 176 in portrait, else the §3.7 grid).
- **`DuelScene.ts`**: `responsive = true` and `uiLayout` on every page. Compact portrait runs the v5 code (same calls, same widths: element positions identical, see Verification). Elsewhere `openPanes` builds the shell, a scroll area for the profile column and one for the mode content, and the view's fixed action at the bottom-right of the mode content (≤ 240, `uiPrimary`). `profilePart` puts the header, tips and a view's own controls in the profile column when there is one. A profile column shorter than its pane sits in the middle of it (as the Menu's, Army's and Codex's panes), except Team's, which starts level with the hero rows; the short pages sit in the middle of their pane too (search, found, raid picks, the Arena's cards, selling).
  - **Hub**: the title, Glory, level, Team and Armoury stacked in the column (`profileColumn`), the fresco under them at expanded (180 x 99), the tip under that; the Ladder | Arena switch is a fixed bar over the mode content; the next floor and Fight share one row where the pane is 300 wide (Fight ≤ 240), the chapters below, ten tiles a row at expanded. The Arena's cards stack in the pane, their buttons ≤ 360 and their lines ≤ 300.
  - **Team** (master and detail on tablets too): chips, Recruit (in view at once), the tip, the presets, the points and the roster card in the column; the hero rows (≤ 360) and the bench beside it. Each row still opens the duel Hero sheet (RSCR-05's paper doll).
  - **Armoury**: one pane at 844x390 (cards two abreast); beside a column on tablets' stack and laptops; selling lays the stash inside the pane's scroll.
  - **Raids**: chips, tip, standing, raids left and the defence in the column; the defender rows (≤ 360) beside it; Raid at the bottom-right.
  - **Leaderboards**: the switch, the season words and "You" pinned in the column; the rows as a table (rank, crest, name, league, games played with the crossed-swords icon, rating; a dash where the league has no rating) from 200 wide. Only data the board already sends.
  - **Search / found**: the rings, clock and range hold the pane, your lineup and league in the column; the opponent found takes the rings' place there at 844x390, and on tablets and laptops is one card across the pane (sides at 20% / 80%) with the lineup and league under it.
  - **Unavailable** (`duel-closed`): one card across the pane, in the middle of its height, Retry inside it at the right (§15).
  - **Sheets**: every sheet is laid out for the width it is given (`sheetW` → `sheetWidth`): task sheets become right side panels in landscape, bottom sheets on tablets; the chest reward, the season rewards and the season pick are centred dialogs (rewards and a forced choice, not tasks); confirms stay dialogs. The floor sheet no longer assumes the full screen width; its Fight is the panel's `uiPrimary`; the preset sheet's buttons stay ≤ 240.
- **Short landscape** (844x390, `m.short`; Telegram's insets leave 363 x 161 UI px): the mode switch tops the profile column (the floors keep the pane's height); the Arena's Find match comes before its line; the search sets the arena beside the clock on one row; the found card names each side and league on one line over its crest; the raid picks keep one pane where the rows would be squeezed beside the column; the preset sheet scrolls its body and the season rewards their rows when the dialog cannot hold them; the chest reward sets a smaller chest with its Glory beside it.
- **Shared kit, additive only**: `MStashGridOpts.priceSize` (src/ui/mosaic/StashGrid.ts; default 5.5, unchanged for every caller that does not pass it). The duel sell grid passes `TEXT_MIN`, which fixes the `duel-shop-sell|text-size|*` entry (all sizes). Otherwise only existing exports are used (`sheetWidth`, `gridColumns`, `layoutVariant`, `focusPane`, `uiCollapsed`, `uiPrimary`, `uiLayout`, MStashGrid's `inline`, `SLOT_FILTERS`).
- **Element parity**: where the stash has no room for its row of slot chips (320x693, a short pane) MStashGrid draws one cycling Slot button; the chips register `uiCollapsed` into `filter:slot`.
- `scripts/layout-allowlist/V6-RSCR-04.json`: the 7 stale duel-hero lines (left by RSCR-05) are removed, then the file is deleted (pending → done).

## Deviations

- **Mode switch** beside a profile column is a fixed bar over the mode content (spec: "top of the right pane"): it never scrolls away with the floors.
- **Fight** sits beside the next-floor card at the top of the pane (spec: "bottom-right, max 240" at expanded): one row, as compact landscape's "next-floor card + primary on one row", next to what it fights; ≤ 240.
- **Team at expanded**: the presets stay in the column instead of "a card row above"; the right pane is the hero rows (the "hero" detail is the duel Hero sheet, RSCR-05's screen, one tap away).
- **Shop columns**: the grid's cell is 150, not 140 (at 140 the third card cuts the name, slot and stat changes); 2 columns at 844x390, on tablets and at 1024–1920, 3 from a 456-wide pane.
- **Board columns**: games played (`games`, in the payload) is the extra column; wins and last seen are not in the payload, so nothing else is added.
- **Tablet hub**: the v5 stack across the pane with a 56-tall fresco (spec: max 120).
- **Compact portrait, one change**: the sell grid's price tags are 6.5 UI px (the text floor) instead of 5.5; everything else in portrait is the v5 code path.
- **Reward dialogs**: the chest reward, the season rewards and the season pick open as centred dialogs outside portrait (the §3.4 "decision" kind), not side panels: they are moments to acknowledge or a forced choice, not tasks beside the hub.
