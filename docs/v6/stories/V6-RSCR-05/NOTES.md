# V6-RSCR-05 notes: Army and Hero (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.3, §3.4, §4, §10 (10.1–10.3), §16.8. Decisions: V6-055, V6-059, V6-062, V6-063, V6-065, V6-066, V6-067, V6-068.

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/ArmyScene.ts`, `src/scenes/HeroScene.ts`, `src/ui/army/*`, `src/ui/mosaic/StashGrid.ts` and `openItemCard` in `src/ui/sheet.ts` at v6 803fde39. Columns: where the element is after this story. "v5" means compact portrait (390x844, 360x780, 320x693), unchanged.

### Army

| Element (code) | uiId | Spec §10.1 | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Sub-shell top bar: back arrow (outside Telegram), plaque "Army", gear | `army.topbar` | sub-shell | yes | yes | yes | yes |
| Sync badge (cloud) | — | sync badge | yes | yes | yes | yes |
| Situation sentence (points to spend, wounds, men; stash count; pick-mode prompt) | — | situation | VH ≥ 300 or pick (as v5) | master pane, always | master pane | master pane |
| Chips: men, gold, hurt | `army.chip.men`, `.gold`, `.hurt` | chips | yes | master | master | master |
| Hero card (`addArmyHead`): niche with figure and class bust, status pill, name, class, Lv and role pills, Power, rank stars | `legend.rank` | hero card | yes | detail pane | detail pane | detail pane (max 340, centred) |
| Group buttons I–IV and the group's name | `army.group.0..3` | (card) | yes | detail | detail | detail |
| Gear slots (shared order) and the mount | `slot:helmet` … `slot:shield` | slots | yes | detail | detail | detail |
| Sticky mini-head (once the card scrolls away) | `army.mini` | mini-head | yes | collapsed into `slot:helmet` (`uiCollapsed`): the card is a fixed pane | same | same |
| Roster \| Stash switch, its badge | `army.tab` | army.tab | yes | master | master | master |
| Roster: filter, sort (each opens a sheet), rows | `army.filter`, `army.sort`, `roster:n` | rows | yes | master | master | master |
| Stash: `MStashGrid` (filters, cells, upgrade arrows), drag-to-equip | `filter:*`, `item:*` | stash grid | yes | master; drops on the detail's slots | master (cells 40) | master (cells 34: 6 columns) |
| Empty states (no men; filter matches no one) | — | — | yes | master / detail | same | same |
| `ArmyFooter`: Dismiss (confirm), Sheet (primary, points badge) | `army.footer`, `army.dismiss`, `army.sheet` | ArmyFooter | yes | under the detail pane, on its floor | under the card | under the card |
| Filter and sort sheets | `army.filterSheet`, `army.sortSheet` (+ `.bg`, `.close`, options) | sheets | bottom sheet | right side panel | bottom sheet | right side panel |
| Item card / compare (equip, repair, sell in town, scrap in camp, take off) | `stash.*` | item cards | sheet | side panel | bottom sheet | side panel |
| Dismiss, sell, scrap confirms | — | — | dialog | centred dialog | dialog | centred dialog |
| First-time hint (drag) | — | — | toast | toast | toast | toast |

The spec's "Map or Town" in `ArmyFooter` is not in the code (v5 moved Back to the top bar only, N3), so there is nothing to place.

Added (nothing removed): beside the list the hero's figure opens his sheet (`army.figure`, the same action as the row's second tap and Sheet), and in pick mode the detail carries a Perks button (`army.pickPerks`, the same action as the row's tap). The selected row also gets a bronze rim and a chevron toward the detail (§3.3: not colour alone).

### Hero

| Element (code) | uiId | Spec §10.1 | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Top bar, plaque retitled to his name (the head shows it when the plaque would cut it) | `hero.header` | plaque | yes | yes | yes | yes |
| Power chip; wound line | `hero.power` | power, wound | yes | left pane | head | left pane |
| Stage niche (his figure), swipe to page | `hero.stage` (landscape) | stage niche | yes | left pane, 110 tall | head (max 360 wide) | left pane, fills its height (≤ 240) |
| Gear slots 3 + 2 (+ mount) around the stage | `slot:*` | GearSlots | yes | left | head | left |
| Level pill, rank stars | `legend.rank` | level, stars | yes | left | head | left |
| Pager (chevrons, "2 / 8") | `hero.prev`, `hero.next` | MPager | under the stage | under the stage | under the stage | under the stage |
| Class, role pill, traits | — | class pill, trait | yes | left pane (scrolls) | head | left pane |
| XP bar | — | XP bar | head | right pane, top | head | right pane, top |
| Tabs Stats / Gear / Perks / Skills with badges | `hero.tab`, `hero.tab.*` | hero.tab | yes | right pane, fixed | yes | right pane, fixed |
| Pinned copy of the tabs | `hero.pinTab`, `hero.pinTab.*` | pinTab | yes | collapsed into `hero.tab.*` (`uiCollapsed`): the tabs never scroll away | yes | collapsed |
| Stats: points line, attribute rows with −/+, stat bars, record, traits, respec (duels) | `attr.*.info`, `attr.*.minus`, `attr.*.plus`, `stat:*`, `hero.respec` | Stats | yes | right page | page (max 360) | right page (max 360) |
| Gear: `MStashGrid`, drag to the slots | `filter:*`, `item:*` | Gear grid | yes | right page | page | right page, cells 44, the well fills the page with the drag hint at its foot |
| Perks: tiers of two cards; tier sheet (learn, retrain) and confirms | `perk:*`, `hero.perkSheet`, `perkopt:*`, `hero.perk.learn`, `hero.retrain` | perk sheet | yes | right page; sheet → side panel | bottom sheet | right page; side panel |
| Skills rows, empty state | — | Skills | yes | right page | page | right page |
| `MActionBar`: Undo / Confirm, or Dismiss (duels) | `hero.undo`, `hero.confirm`, `hero.dismiss` | MActionBar | full width | bottom right (≤ 320, one button ≤ 248) | bottom right | bottom right |
| Item card (equip, repair, take off) | `stash.*` | compare | sheet | side panel | bottom sheet | side panel |

### Stash and compare (`openItemCard`)

Header (icon, name, rarity and slot, condition, worth), the compare block (against what he carries, Power change, stat changes, what it also removes), stats, rules, description, notes, actions. All present at every size; in a side panel the card lays out across the width it is given (`sheetBox`), and its action row keeps each button within 240 UI px, at the right.

## What changed

- **Army** (`ArmyScene.ts`): `responsive = true`. Compact portrait is the v5 page (code path untouched). Elsewhere `refreshSplit`: `masterDetail` panes inside a `CONTENT_MAX` region; the master scrolls on its own (sentence, chips, switch, filter and sort, rows or stash grid); the detail holds the card and the footer as one group centred in the pane's height when they fit, else the footer sits on the pane's floor and the card scrolls. On the Stash tab the detail scrolls to the slots (the drop targets). Tab order: top bar, master, detail, footer (`focusPane`).
- **Hero** (`HeroScene.ts`): `responsive = true`. Compact portrait: v5. Medium portrait: the v5 stack, head and page at most 360 UI px wide, the action bar at the right. Compact landscape and expanded (`layoutSplit`): the paper doll in its own scroll pane on the left (168 / 240), the XP line and tabs fixed on the right, the page scrolling under them (≤ 360, centred), the action bar bottom right.
- **Sheets**: `sheetBox` (ParchmentSheet, additive export) gives the box a sheet would get; `openItemCard` and the perk tier sheet lay out from it, so their content fills the side panel. `openOptionSheet` (filter, sort) becomes a task panel outside compact portrait (`openParchmentSheet`), one or two columns by the panel's width; compact portrait keeps the v5 sheet.
- **Drag** (`DragDrop` in sheet.ts, `src/ui/army/drop.ts`): a mouse over a stash item shows `grab`; while dragging, slots that take the item get a bronze dashed outline (full under the cursor, 50% elsewhere), refusing slots none; the cursor is `grabbing`, or `not-allowed` over a refusing slot (§4). Pure rule in `dropView`, tested in `tests/armyDrop.test.ts`.
- **Shared, additive**: `HEAD_NICHE` (parts.ts), `MStashGridOpts.fill`/`hint` (StashGrid.ts), `sheetBox` (ParchmentSheet.ts). None changes a caller that does not pass the new option.

## Deviations

- Medium landscape (near-square windows) uses the split Hero layout, like expanded; it is not in the matrix.
- Expanded Army keeps the master at `masterDetail`'s 40% (251 at 1280) rather than a fixed 260.
- The pick-mode Perks button and the tappable figure are additions (both repeat an existing action).

## Verification (after merging v6 at cd5a0e1f)

- **Layout check**, family scenes (`--scenes 'army*,hero*,stash*'`), all ten sizes, en and ru, plain and tg: 28 configs x 13 screens, 0 distinct violations, 0 new, 0 pending: PASSED. The four Hero element-parity failures at 768x1024 and 820x1180 (`hero.pinTab.*` collapsed in medium portrait) are gone: medium portrait keeps the v5 pinned tabs.
- **Portrait pixel compare** (`.rscr05/portrait.mjs`, a fake clock and a fixed campaign, against v6 cd5a0e1f) at 390x844, 360x780 and 320x693, en and ru, 13 screens each: 78 compared, 0 different (0 px).
- **Keyboard and mouse at 1280x800**: `docs/v6/shots/V6-RSCR-05/keyboard-mouse-1280x800.txt` (Tab order top bar, master, detail, footer; Enter and Esc; grab, grabbing and not-allowed cursors; drop equips).
- **Gates**: tsc 0 errors; vitest 156 files, 1952 tests passed; vite build OK; regression `--all` (telegram and web): 21 of 21 rows PASS, suite 1991 s. The World test that timed out under load earlier (FLAKY F7) did not recur.
- **Screenshots**: `docs/v6/shots/V6-RSCR-05/after/` has every family screen at 1280x800, 1920x1080, 844x390 and 768x1024 (en), plus Army, Hero, Hero gear and the compare card in ru at the same sizes; all opened and checked. The other sizes and tg variants come from the layout check's shots (git-ignored).

## Open items

- `scripts/layout-allowlist/V6-RSCR-04.json` still lists 7 stale duel-hero entries for these screens; RSCR-04 owns that file and removes them.
