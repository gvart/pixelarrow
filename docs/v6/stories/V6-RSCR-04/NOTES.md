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

TBD (filled in at the end).
