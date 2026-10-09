# UI v3 "Bronze & Stone, clarified" — plan

The menus around the battle get a clear hierarchy, one meaning per icon, honest
locked states and motion. The battle art, the battlefield, the pixel sprites and
the Greek theme stay. This page is the plan and the rules; docs/UI_KIT.md lists
the components.

## What was found

- **Render approach:** every menu is drawn **inside Phaser, on the canvas**. A
  scaled UI root container per scene (`BaseScene.ui`, scale `S` = whole UI px
  per CSS px × devicePixelRatio), kit classes that extend
  `Phaser.GameObjects.Container` (`Button`, `Tabs`, `ScrollList`, cards…),
  surfaces painted with Canvas 2D at device density and cached as textures
  (`src/art/smoothUi.ts`, used like a NineSlice), text as `BitmapText` from
  atlases drawn from Inter / Cormorant SC at device density
  (`src/art/vectorFont.ts`). No DOM UI, no rexUI. `pixelArt: true`,
  `roundPixels: true` keep the sprites sharp; UI textures sample linearly.
  **v3 keeps all of this** and builds on it: no new framework, no plugin.
- **Strings:** `t()` from `src/i18n`, English + Russian tables, checked by
  `tests/ui.test.ts` (keys, params, glyphs).
- **State to UI:** the campaign is `state.campaign.data` (offline: gold, heroes,
  `won`); the online war season, the wallet and the pass come from the server
  through `econ()` (`src/ui/econ/source.ts`); duels from `duelSource()`
  (`src/duel/client.ts`, a demo source for previews). Screens redraw from the
  answer.
- **Navigation:** `src/platform/nav.ts` is one stack wired to Telegram's
  BackButton; every scene registers its `back`. The bottom "Back" slot of the
  command strip duplicated it inside Telegram.
- **Layout check:** `scripts/layout-check.mjs` stages 139 screens at 5 sizes ×
  2 languages × (plain, fake Telegram) and fails on overlaps, overflow, touch
  size. It is the guard rail for every change below.

## Decisions

### Icons: approach (a), match the existing family

The UI icons are not pixel art since the D2 redesign: they are the smooth
"material" family of `src/art/iconStyle.ts`. Every new icon is drawn in that
exact family, and the last 12 px pixel icons are gone from the menus.

Icon spec (all icons, old and new):

| Rule | Value |
| --- | --- |
| Grid | 24 × 24 unit box, ~2 units margin, shown at 12 UI px (scaled by integers of the UI scale: 24, 36, 48 CSS px) |
| Body | filled parts, one **material** each (`TONES`: bronze, gold, steel, silver, wood, clay…), at most 4 materials per icon |
| Outline | one dark ink outline (2.3 units) round the whole silhouette, thin ink seams between parts |
| Light | from the **top left**: a diagonal gradient (highlight → body → shade), a gloss on the upper half, an inner shade on the lower edges, a soft drop shadow down-right |
| Details | ink lines or gleams drawn on top, never part of the silhouette |
| States | `full` (on stone and bronze), `light` (cream tones, on terracotta / blue buttons), `dim` (flat greys: disabled and locked) |
| No | emoji, flat web glyphs, a second outline weight, coloured outlines |

New icons: `laurel` (Glory), `tgstar` (Telegram Stars, Telegram's rounded
gold-orange star), `power`, `trophy` (wins, moved into the kit), `podium`
(leaderboards), `xp`, `pass` (season pass), `lock`, `shop` (market stall),
`ladder`, `arena`, `raid`, `march` (campaign), `chevL` / `chevR` (pager),
`info`, `team`, `chest`, and an icon per ability / aura (no grey squares).

### One icon, one meaning (resources)

`src/ui/tokens.ts` `RESOURCES`: gold `coin`, Glory `laurel`, Drachmae
`drachma`, Telegram Stars `tgstar` (always with the word "Stars"), power
`power`, wins `trophy`, XP `xp`. The gold star means only "ladder floor
rating". A test fails if two resources share an icon or a colour.

Real money: `PurchaseButton` is its own colour (Telegram blue, never the
terracotta of in-game actions), always reads "⭐ 250 Stars", and always opens a
confirmation sheet.

### Tokens

`src/ui/tokens.ts`: surfaces (bg, sunken, card, raised, rim), text (primary,
secondary, muted for locks, disabled, on-accent), accents (primary terracotta,
gold rewards, premium silver-violet, purchase blue, success, danger), a role
palette for unit roles (no danger red), rarity frames and AA rarity labels,
the type scale, spacing and motion. `tests/tokens.test.ts` checks every
text/surface pair against WCAG AA.

Type: Cormorant SC for screen and card titles; Inter for everything read, with
**tabular digits** (every digit has the same advance, so counters do not jitter
and columns of numbers line up).

### Navigation

- Inside Telegram the header BackButton is the only Back. The command strip
  drops its Back slot; outside Telegram (a plain browser) the screen header
  shows one back arrow instead. Never both, never three.
- Max two tab levels: a `SegmentedControl` (filled, sliding thumb) on top, and
  `UnderlineTabs` (sliding underline) under it.
- Hero sheet: a `Pager` (chevrons, "2 / 8", swipe) instead of Prior / Next.

### Motion and feedback

Press: scale 0.97, the face drops 2 px and darkens, light haptic. Tabs: the
indicator slides (200 ms, ease-out). Sheets slide up over a fading backdrop
(240 ms). Numbers count up; progress fills; claimable rewards pulse; a claimed
reward flies into its chip. Settings → Reduce motion (default from
`prefers-reduced-motion`) turns every tween into an instant change. No object
is created per frame; pulses are tweens on existing objects.

## Phases (the game stays playable after each)

1. Tokens and this plan.
2. Icons and the resource registry.
3. Components (header, chips, buttons, segmented control, underline tabs, edge
   fades, toggle, stepper, progress bar, locked state, bottom sheet, pager) and
   navigation (no duplicate Back), reduced motion.
4. Section B bugs at the root, with tests.
5. Screens: Home, Duels (Ladder, Arena, Team, Shop, boards, raids), Hero sheet,
   Shop / Pass / Wallet, Settings, Beasts, Online states.
6. Gates (typecheck, unit tests, layout check, smokes), before / after
   screenshots, the bug report.
