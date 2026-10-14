# V6-RSCR-09 notes: Codex (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.3, §3.4, §3.7, §4, §13.2, §16.9. Decisions: V6-055, V6-059, V6-062, V6-063, V6-065, V6-066, V6-067, V6-068, V6-072, V6-074, V6-075, V6-078.

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/CodexScene.ts`, `openBeastSheet` and `fillBeastInfo` in `src/ui/beastInfo.ts`, and `openDoctrineSheet` in `src/ui/sheets/doctrine.ts` at v6 2a5e8557. Spec §13.2 lists: hub shell; `codex.seg` (or a SectionTitle); rows `codex.<enc>` and `codex.doctrine.<id>` (art well, title, level, hint, chevron); the beast sheet with the Trial fight (`codex-beast`); the doctrine sheet (`codex-doctrine`). The code has exactly these, plus the parts listed below. Columns: where each element is after this story. "v5" is compact portrait (390x844, 360x780, 320x693), unchanged.

### Codex list (`codex`, `codex-doctrines`)

| Element (code) | uiId | Spec §13.2 | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| Frame, top bar: plaque "Codex", gear | `hub.topbar` | hub shell | yes | yes | yes | yes |
| Mode navigation (five modes, Codex lit) | `tab.campaign`, `tab.duels`, `tab.war`, `tab.codex`, `tab.shop` | hub shell | tab bar | nav rail (RSCR-01) | tab bar | nav rail |
| Beasts / Doctrines switch with counts (once a doctrine is met) | `codex.seg` | codex.seg | yes | master pane, top | top of the grid | grid pane, top |
| "Beasts" section title (before any doctrine is met) | — | SectionTitle | yes | master pane, top | top of the grid | grid pane, top |
| Beast entries (8: 6 lairs, 2 world bosses): plate or figure in a well, name, level or "World boss", two-line hint, chevron | `codex.<enc>` | rows | rows | rows (master) | cards, 3 columns (Grid) | cards (Grid, min 120, up to 4 columns) |
| Doctrine entries (5): icon in a well, name, tell (two lines), chevron | `codex.doctrine.<id>` | rows | rows | rows (master) | cards, 2 columns | cards, 2 columns |
| Locked doctrine: lock icon, "Unknown", how to learn it; no chevron; a tap says why | `codex.doctrine.<id>` | rows | rows | rows | cards | cards |
| Selected entry: bronze rim and chevron toward the detail (§3.3) | — | (new for panes) | — | yes | — (detail is a sheet) | yes |
| Scroll of the list | — | — | yes | master scrolls on its own | yes | grid pane scrolls on its own |

### Beast detail (`codex-beast`: `openBeastSheet`)

| Element (code) | uiId | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Sheet / pane holding the beast | `beast.sheet` | bottom sheet | detail pane (right) | bottom sheet, ≤ 320 wide, centred | detail pane (right, 240) |
| Title: the beast's name | — | sheet title | pane title | sheet title | pane title |
| Close X | `beast.sheet.close` | yes | collapsed into the chosen entry `codex.<enc>` (`uiCollapsed`): the detail is a pane, not a layer; choosing another entry replaces it (§3.3) | yes | collapsed, as 844x390 |
| Painted plate in a well + the figure on its stage | — | yes | yes | yes | yes |
| Sub line: lair or world boss · level | — | yes | yes | yes | yes |
| HP bar, extra lines (only when a caller passes them; Codex does not) | — | n/a | n/a | n/a | n/a |
| "How it fights" heading, the beast's hints, the terror line | — | yes | yes | yes | yes |
| "What beats it" heading and the counter | — | yes | yes | yes | yes |
| Loot line | — | yes | yes | yes | yes |
| Scroll hint (when the words run past the pane) | — | yes | yes | yes | yes |
| Caption over the action (what a Trial is, or why it cannot be fought) | — | yes | yes | yes | yes |
| Trial fight (primary; disabled with the reason when no fit men) | `beast.sheet.action` | yes | pane foot, ≤ 240 wide | yes | pane foot, ≤ 240 wide |

### Doctrine detail (`codex-doctrine`: `openDoctrineSheet`)

| Element (code) | uiId | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Sheet / pane | `doctrine.sheet`, `doctrine.<id>` | centred sheet | detail pane | sheet, ≤ 320 | detail pane |
| Title: the doctrine's name | — | yes | pane title | yes | pane title |
| Close X | `doctrine.sheet.close` | yes | collapsed into the chosen entry `codex.doctrine.<id>` | yes | collapsed, as 844x390 |
| Icon beside "Tell" and the tell | — | yes | yes | yes | yes |
| "How it fights", "Counter", "Who fights this way" sections | — | yes | yes | yes | yes |
| Scroll hint | — | yes | yes | yes | yes |

Nothing is removed. In the panes the detail shows the first entry on arrival (§3.3: never an empty right pane); a door (`open`, `doctrine`) selects that entry instead.

Two cells change with the width rather than the class (see Deviations): at 1024x768 the list beside the detail is rows, and in Telegram at 844x390 the detail opens as a side panel.

## What changed

- **`src/ui/codexLayout.ts`** (new, pure, `tests/codexLayout.test.ts`): `codexLayout(m, box)` gives the list form (rows or a card grid), its columns and the detail pane per variant; `cardCols` gives two columns to a list shorter than two full rows.
- **`src/scenes/CodexScene.ts`**: `responsive = true`, `uiLayout` registered. Compact portrait runs the v5 code path (same rows, same shell scroll area). Elsewhere `place()` caps the panes region at `CONTENT_MAX` and centres it; beside a detail pane the list gets its own scroll area. Cards use the §3.7 `grid` primitive. A tap (or Enter) on an entry shows it in the detail pane (bronze rim on the chosen entry), or opens its sheet where there is no pane. Doors (`open`, `doctrine`) select their entry in the pane instead of opening a sheet.
- **`src/ui/beastInfo.ts`**: `addBeastDetail` (the sheet's content as a pane: title, plate and stage, words, caption, Trial fight ≤ 240 at the foot, `uiPrimary`, focus pane 1) and `addPaneTitle`; the beast sheet takes its width from `sheetWidth` outside compact portrait and, there, draws its Trial fight as one button ≤ 240 instead of the full-width action row. `beastStageH` keeps the figure at least 24 UI px wide beside the plate: this fixes the KNOWN_CRASH "Invalid typed array length: -888" (codex-beast at 844x390 in Telegram), whose line is removed from `scripts/lib/layoutMatrix.mjs`.
- **`src/ui/sheets/doctrine.ts`**: `addDoctrineDetail` (title and sections as a pane, as tall as its words and centred in the pane's height, as the Menu's and Army's panes); the sheet takes its width from `sheetWidth` outside compact portrait.
- **Shared kit**: not changed. Only existing exports are used (`sheetWidth`, `grid`, `masterDetail`, `focusPane`, `uiCollapsed`, `uiPrimary`).
- `scripts/layout-allowlist/V6-RSCR-09.json` is deleted (pending → done; all 11 entries were fixed).

## Deviations

- **Telegram at 844x390** (265 UI px beside the rail): two panes would leave the list 97 wide, so the rows take the width and the detail opens as the §3.4 right side panel (220 wide). Plain 844x390 (316 wide) has rows and the detail pane (148 / 160).
- **1024x768**: the grid beside the 240 detail pane would hold one 184-wide card per row, so the list is rows there (a one-column grid is a list). From 1280 the list is a card grid (2 columns at 1280 and 1920, 3 at 1440).
- **Doctrines (5) in 2 columns** on tablets and laptops: in 3 columns the third column stood empty down the tablet (`empty-column`).
- **The doctrine pane** is as tall as its words and centred, not full height: a full-height pane with short Russian text failed `empty-column` at 1440x900. The beast pane stays full height (its Trial fight sits at the foot).
- The sheet X has no pane to close: `beast.sheet.close` and `doctrine.sheet.close` are registered collapsed into the chosen entry (`uiCollapsed`), which is what replaces the pane.

## Verification (on v6 2a5e8557)

- **Layout check**, `--scenes 'codex*'`, all ten sizes, en and ru, plain and tg: 28 configs × 4 screens (112), 0 violations, 0 new, 0 pending, no crash skipped: PASSED. Before: 27 pending landscape findings, 11 allowlisted entries, 2 skipped crashes.
- **Portrait pixel compare** (a scratch script with no scrolling, a fixed campaign and a 2.5 s settle; not committed), 390x844, 360x780, 320x693 × en, ru × plain, tg × 4 screens against v6: 48 compared, 0 different (0 px). The layout check's own shots are not usable for this: two runs of the same code differ in a 4-px strip (the sheet's scroll cue after its scroll-end pass).
- **Keyboard and mouse**: `docs/v6/shots/V6-RSCR-09/keyboard-mouse.txt` (1280x800: Tab cycles top bar, switch, cards, Trial fight, rail; Enter and a click show an entry in the pane; arrows switch the segment; pointer and not-allowed cursors. 768x1024: Enter opens the sheet with focus inside; Esc and the X close it; focus returns to the opener. 1024x768: the doctrine door selects in the pane): 19 PASS.
- **Gates**: tsc 0 errors; vitest 165 files, 2041 tests passed; vite build OK; regression `--all` (telegram and web): 21 of 21 rows PASS, suite 1446 s.
- **Screenshots**: `docs/v6/shots/V6-RSCR-09/` has 9 key shots (JPEG q82, V6-078); from the layout check's shots, every family screen was opened and checked in each class (compact landscape plain and tg, medium, expanded at 1024, 1280, 1440 and 1920) in en and ru; compact portrait is pixel-identical to v6.
