# UI v4 "Mosaic & Parchment" - spec

The contract for every agent that touches the redesign. The approved mockups are the visual truth:
`reference/A1-campaign-hub.jpg`, `reference/A2-duels-hub.jpg`, `reference/A3-war-hub.jpg`
(style origin: `reference/00-home-style-b.png`). Current screens: `current/*.png`, `../screens/README.md`.

## Decisions (locked with the owner)

- **Surfaces:** parchment content panels with dark ink text, inside a dark carved-stone frame with a gold Greek-key (meander) border and corner rosettes, on a dark basalt page.
- **Art pipeline (hybrid):** chrome is drawn procedurally (canvas, like `src/art/smoothUi.ts`): meander, bevels, parchment fibres, buttons, tiles, bars, icons. Painted illustrations (fresco banners, portraits) are raster files in `public/ui/` (the current ones are placeholders cropped from A1). The game world (battle, maps, unit sprites) stays pixel art.
- **Type:** Cinzel 700 for titles, plaques, buttons and tab labels (Russian glyphs fall back to Cormorant SC 700). Inter 500 for body text and every number (tabular digits).
- **Navigation:** a bottom tab bar organized by mode: **Campaign · Duels · WAR (center, raised bronze shield medallion) · Codex · Shop**. Each mode tab is that mode's hub. Settings (gear) sits in the top bar. Beasts move into Codex. Sub-screens (Army, Hero, Settlement, ...) hide the tab bar and show a back arrow in the top bar. Battle keeps its own HUD (restyled later).
- **Hierarchy:** one terracotta primary per screen. Secondary actions are aged bronze. Unavailable is grey stone with a faded icon plus a one-line reason (never red). Real money stays blue. Red is for errors, losses and alert badges only.
- **Honesty:** a screen shows only features that exist in the game. No invented content (no "Quests", no fake numbers).

## Visual reference (read from A1-A3)

| Piece | Look |
|---|---|
| Page | Dark warm basalt, very low-contrast speckle. |
| Screen frame | Stone band (~6 UI px) carrying a gold-ochre meander on dark stone; small round rosettes at the 4 corners. Frames the content area between the top bar and the tab bar. |
| Top bar | Dark stone strip; centered teal plaque with gold rim and "PIXELARROW" (hubs) or the screen name (sub-screens); gear button right; back arrow left on sub-screens. |
| Parchment card | Warm cream parchment (#ecdcb8 to #dcc394), subtle fibres and stains, thin dark-brown inked edge, small radius. Ink text. |
| Profile card | Parchment card: portrait in a bronze-rimmed square at the left; Cinzel name; lines with small icons: "Day N on the march", gold, trophies, warband. |
| Quest card | Parchment card: Cinzel title "First steps (2 of 4)", a segmented bar (done segments gold with a check, open segments dark brown), the next step centered below. |
| Fresco banner | Painted image in a dark bronze riveted frame. Tappable. |
| Primary button | Terracotta-red stone with gold rim, Cinzel caps in cream; the hero CTA has pointed (chevron) ends. |
| Secondary button | Aged bronze, cream Cinzel label. |
| Tile | Square carved stone (grey) with an engraved bronze icon and a Cinzel label; badge top-right; disabled = flat grey, faded icon, caption under the tile. Variants: stone, terracotta, teal glaze. |
| Chip | Small parchment or stone pill: icon + Inter number (A2/A3 resource chips). |
| Segmented switch | Parchment track, the selected segment lighter with a bronze rim (A2 Ladder/Arena). |
| Tab bar | Dark teal-stone bar with a gold top rim; 5 slots of icon + Cinzel label; the selected slot is a parchment block; the center War slot is a big round bronze shield medallion rising above the bar (glows when selected). Red badges allowed. |
| Bottom panel | Parchment sheet rising above the tab bar with a title, close X, lines, and an action row (A3 hex panel). |
| Ink colours | Primary ink ~#3a2414, secondary ~#5e4129, success green ~#3f6b25, rarity colours darkened for parchment. All pairs must pass WCAG AA (tests/tokens.test.ts). |

## Code layout

- `src/ui/tokens.ts`: add a `MOSAIC` token group (surfaces, inks, stone, gold, terracotta, teal, bronze) and its pairs in `CONTRAST_PAIRS`. Existing v3 tokens stay until every screen has moved.
- `src/art/mosaicUi.ts`: procedural renderers for the new surfaces (cached by size and style like `renderSmoothPanel`).
- `src/ui/mosaic/`: the component library. Each component is a Phaser Container (or factory) with typed opts, registers layout bounds (`src/ui/layout.ts`) like the v3 components, respects `motion()` and reduced motion, measures text with `src/ui/textfit.ts`, and uses only tokens (no raw hex in screens).
- `src/scenes/KitScene.ts`: a "Mosaic" tab showing every component in every state.
- Screens are migrated to `src/ui/mosaic/` one flow at a time; a migrated screen uses no v3 / strategos chrome.
- Old v3 and strategos components are deleted only when nothing uses them.

## Phases

1. **Foundation:** tokens, the Cinzel face, the renderers, the components, the Kit gallery and tests.
2. **Pilot:** the tab shell plus the Campaign hub (replaces MenuScene's layout). Duels, War and Shop tabs open the existing scenes until those are migrated. Codex opens a minimal Codex scene listing Beasts. The owner approves before step 3.
3. **Batches** (parallel): Campaign flow (world chrome, camp chrome, settlements, army, hero), Duels, War, Shop + Results, Codex, then the Battle HUD chrome.

Verification for every phase: `npm run typecheck`, `npm test`, `node scripts/layout-check.mjs` for the touched screens (no new violations), and screenshots compared side by side with the mockup.

## Batch rules (Phase 3, parallel agents)

- Each batch works in its own git worktree and branch and commits there; the lead merges.
- **Owned files only.** A batch edits only the scenes and UI files listed in its brief. Shared files have one owner:
  - `src/ui/mosaic/*` (existing components), `src/art/mosaicUi.ts`, `src/ui/tokens.ts`, `src/ui/kit.ts`: no edits except tiny additive ones (a new style key, a new opt with a default), listed in the report. A new reusable component goes in a **new file** in `src/ui/mosaic/` and is exported from `index.ts` (one-line additive edit).
  - Shared overlays (`src/ui/widgets.ts`, `src/ui/v3.ts` sheets/modals/toasts, `src/ui/sheet.ts`, `src/ui/confirm.ts`, `src/ui/settings.ts`, `src/ui/strategos.ts`): owned by the Overlays batch only.
  - i18n: new strings go in a batch's own table pair `src/i18n/mosaic.<batch>.en.ts` / `.ru.ts`, spread into `en.ts` / `ru.ts` with a one-line edit.
  - `scripts/layout-check.mjs`: additive screen entries only.
- Mode hubs (Duels, War, Shop, Codex, Campaign) show the TabBar via `addHubShell` (`src/ui/mosaic/hub.ts`) and no back arrow; sub-screens show a back arrow and no TabBar.
- No mockup yet for most sub-screens: follow this spec, A1-A3 and the Kit gallery; keep every element of the current screen (`docs/screens/README.md`), only reorganize for hierarchy.
- Verify per batch: typecheck, tests, layout check of every touched screen (`--sizes 390x844,320x568,430x932 --langs en,ru --insets plain,tg`, never `--dpr 2`), the relevant smoke script, and screenshots read and compared to the mockups.
