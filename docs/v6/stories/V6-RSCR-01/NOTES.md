# V6-RSCR-01 notes: shell and hubs (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.1, §3.4, §4, §6. Decisions: V6-055, V6-059, V6-062, V6-063, V6-065, V6-066.

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/MenuScene.ts`, `src/ui/mosaic/{hub,subShell,ScreenFrame,TopBar,TabBar,ParchmentSheet}.ts` at v6 f7a3bc33.

| Element (code) | uiId | Spec §6.1 | 390x844 | 844x390 | 768x1024 | 1024–1920 |
| --- | --- | --- | --- | --- | --- | --- |
| ScreenFrame (stone frame, parchment) | — | Frame | yes | yes (beside the rail) | yes | yes (beside the rail) |
| TopBar: plaque "PIXELARROW", gear | `hub.topbar`, `hub.topbar.gear` | TopBar | yes | yes | yes | yes |
| Offline sync badge (only while the cloud save fails) | — | sync badge | yes | yes | yes | yes |
| Mode nav: Campaign, Duels, War medallion, Codex, Shop, badges | `tab.campaign` … `tab.shop` | TabBar | tab bar | rail 84, all five labels | tab bar | rail 72, all five labels |
| ProfileCard: portrait, name, status line, gold, trophies, warband | `menu.save` | ProfileCard | yes | left pane | top left | right pane |
| QuestCard "First steps n of 4" + next step (until done) | `menu.quest` | QuestCard | yes | left pane | top right | right pane |
| Fresco (tap = continue) | `menu.banner` | fresco | yes (`frescoSlot`) | collapsed into the primary (`uiCollapsed`), as `frescoSlot` drops it on short screens | yes, max 200 tall | hero pane, 16:9, max 300 wide |
| Primary: Continue the march / Begin the march | `menu.continue` / `menu.new` | primary | yes | top of the right pane | above the tiles, max 300 | under the fresco, max 300 |
| Tiles Army (pending badge), Stash, Camp | `menu.army`, `menu.stash`, `menu.camp` | tiles | yes | right pane | under the primary | right pane |
| Disabled reasons ("Begin the march first", "Pitch camp on the map") | — | disabled reason | yes | yes | yes | yes |
| Boot notice toast (`state.notice`) | — | — | yes | yes | yes | yes |
| Opens: Settings (gear), Notifications, About, new-campaign confirm | — | opens | bottom sheets | side panel / centred dialog | bottom sheet / dialog | side panel / centred dialog |

Nothing is removed. The only element not drawn in a layout is the fresco at compact landscape (and on the shortest phones, as in v5); its action is the primary's, registered with `uiCollapsed(scene, 'menu.banner', 'menu.continue'|'menu.new')`.

## What changed

- **Shell** (`hub.ts`, `TabBar.ts` NavRail, `tabLayout.ts` railLayout/fitRailLabels, `ScreenFrame.ts` x offset, `subShell.ts`): in landscape the hub shows the left nav rail and the page beside it at full height; portrait keeps the tab bar. Sub-screens have no rail (§3.1). The top bar is `uiStretch`.
- **Sheets** (`ParchmentSheet.ts`): `presentation: 'auto'` (default) and `panel`. Compact portrait (every phone and every unmigrated scene) keeps v5's placement; elsewhere a task sheet is a right side panel (20% shade, 12 px slide, `uiPanel`), a decision a centred dialog ≤ 320, medium a bottom sheet ≤ 320. A side panel is never narrower or shorter than the sheet its caller laid out (so unmigrated callers that size content themselves still fit).
- **Focus** (`input/focus.ts`, `focusRing.ts`): `pane` and `tail`, so Tab reads top bar → left pane → right pane → rail (§4); the rail is a group (Up/Down).
- **Menu**: `responsive = true`; four layouts per §6.2.

## Deviations

- The War medallion does not overhang the rail's inner edge by 6 px (§3.1): it would sit on the frame's meander. It is 26 (compact) / 40 (expanded) as specified.
- Settings opens as a side panel at expanded (the task rule), not a centred 320 panel: `settings.ts` belongs to RSCR-10 / INP-05 and passes no kind. One line there (`panel: 'settings'`) gives the §3.4 settings placement; listed as a follow-up.
