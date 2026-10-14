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
| Beast entries (12: 10 lairs, 2 world bosses): plate or figure in a well, name, level or "World boss", two-line hint, chevron | `codex.<enc>` | rows | rows | rows (master) | cards, 3 columns (Grid) | cards (Grid, min 120, up to 4 columns) |
| Doctrine entries (5): icon in a well, name, tell (two lines), chevron | `codex.doctrine.<id>` | rows | rows | rows (master) | cards | cards |
| Locked doctrine: lock icon, "Unknown", how to learn it; no chevron; a tap says why | `codex.doctrine.<id>` | rows | rows | rows | cards | cards |
| Selected entry: bronze rim and chevron toward the detail (§3.3) | — | (new for panes) | — | yes | — (detail is a sheet) | yes |
| Scroll of the list | — | — | yes | master scrolls on its own | yes | grid pane scrolls on its own |

### Beast detail (`codex-beast`: `openBeastSheet`)

| Element (code) | uiId | v5 | 844x390 | 768x1024, 820x1180 | 1024–1920 |
| --- | --- | --- | --- | --- | --- |
| Sheet / pane holding the beast | `beast.sheet` | bottom sheet | detail pane (right) | bottom sheet, ≤ 320 wide, centred | detail pane (right, 240) |
| Title: the beast's name | — | sheet title | pane title | sheet title | pane title |
| Close X | `beast.sheet.close` | yes | collapsed into `tab.codex` (`uiCollapsed`): the detail is a pane, not a layer; Back leaves the screen (§3.3) | yes | collapsed, as 844x390 |
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
| Close X | `doctrine.sheet.close` | yes | collapsed into `tab.codex` | yes | collapsed |
| Icon beside "Tell" and the tell | — | yes | yes | yes | yes |
| "How it fights", "Counter", "Who fights this way" sections | — | yes | yes | yes | yes |
| Scroll hint | — | yes | yes | yes | yes |

Nothing is removed. In the panes the detail shows the first entry on arrival (§3.3: never an empty right pane); a door (`open`, `doctrine`) selects that entry instead.
