# UI kit

How screens are built. The rules come from docs/DESIGN_V2.md ("UI", "UX
principles", "Localization"); this page says which code implements them. Read
it before touching a screen.

- `src/ui/kit.ts`: fonts, panels, `Button`, `Meter`, `ScrollArea`, `tappable`, `addText`, `fitText`.
- `src/ui/strategos.ts` + `src/ui/radialOrders.ts`: the screen chrome since the Strategos redesign (situation bar, command strip, chips, rows, tips, the radial orders ring): docs/UI_STRATEGOS.md says how screens are shaped.
- `src/ui/widgets.ts`: everything else (tabs, lists, cards, grid, item icons, tooltip, toast, badge, stat bar, count-up, modal, confirm dialog, empty state, fitted label, first-time hint).
- `src/ui/theme.ts`: colours (rarity, battle categories, meaning) and sizes (`SIZE`, touch rules).
- `src/ui/textfit.ts`: measuring and fitting text (pure, unit-tested).
- `src/ui/layout.ts` + `src/ui/layoutCheck.ts`: the layout registry and rules; `scripts/layout-check.mjs` runs them.
- `src/i18n/`: `t()`, English and Russian tables.
- Gallery: open `/?scene=Kit` (debug scene `src/scenes/KitScene.ts`) to see every component.

Coordinates and sizes are **UI pixels** inside the scene's scaled UI root
(`this.ui`, scale `S` = 2..4, see `uiMetrics`). One UI pixel is `S` CSS
pixels; 44 pt is 22 UI pixels at `S = 2`, the smallest scale.

## Components

| Component | API (short) | Use for |
| --- | --- | --- |
| `Button` | `new Button(scene, x, y, w, h, { label, icon, variant, onClick, tip, disabledReason, id })` | every tappable action. `variant`: `'primary'` (filled red, one per screen), `'secondary'` (default, parchment), `'destructive'` (dark wine; confirm first). `setEnabled(false, reason)`: a tap on it says why (toast). Long-press shows `tip` (or the full label if it was shortened). Press state, click sound and haptic are built in. Labels that do not fit end in "…". |
| `Tabs` | `new Tabs(scene, x, y, w, labels, { selected, onChange, icons })`, `.select(i)`, `.badge(i, n)` | separate sections of one screen (Hero: Stats \| Gear \| Perks). |
| `ScrollList` | `new ScrollList(scene, parent, x, y, w, h, { count, rowH, render(i, row, w, h, area), onTap, tip, id })`, `.setCount(n)`, `.refresh()`, `.scrollToIndex(i)` | long collections (roster, marketplace). Momentum, a scrollbar and a bobbing chevron hint, **virtualised**: only rows near the viewport exist, so `render` must build a row from its index alone. |
| `Grid` | `new Grid(scene, parent, x, y, w, h, { count, cell, render(i, c, size, area), onTap, tip })` | inventories (stash): as many columns as fit, on a virtualised `ScrollList`. |
| `Card` | `new Card(scene, x, y, w, { title, subtitle, icon, right, body or renderBody, onToggle, area })`, `stackCards(cards, y0)` | compact 28 px rows that expand on tap for details. Re-stack in `onToggle`. |
| `ItemIcon` | `new ItemIcon(scene, x, y, { item } or { consumable: id } or { resource: id }, { size = 24, onTap, tip, qty, selected, area })` | any item or good. Distinct procedural icon per item (`src/art/itemIcons.ts`, `src/art/goodsIcons.ts`), rarity frame, pulsing glow for Rare+, sparkles for Legendary. Long-press: name, rarity, slot. |
| `StatBar` | `new StatBar(scene, x, y, w, { label, max, color, tip, format, lowerIsBetter })`, `.set(value, preview?)` | stats; `preview` shows an equip's change in green (better) or red (worse). Height 22. |
| `CountUp` | `new CountUp(scene, x, y, w, h, { icon, label, value, prefix, suffix, duration, delay })`, `.start()` | result tiles (duration, kills, gold, XP). |
| `Badge` | `new Badge(scene, x, y, n)`, `.setCount(n)` | counts on tabs / buttons (hidden at 0). |
| `Label` / `addLabel` | `new Label(scene, x, y, text, { maxW, maxLines = 1, font, align, expandable })` | any text that might not fit: wraps to `maxLines`, ends in "…", tap shows the whole text. |
| `showTooltip` | `showTooltip(scene, text, anchorObject)` | explanations; long-press on `Button`, `tappable(..., tip)`, `ItemIcon`, `StatBar` calls it for you. |
| `toast` | `toast(scene, text, 'info' or 'good' or 'bad')` | short feedback ("Saved", "Not enough gold"). |
| `firstTimeHint` | `firstTimeHint(scene, 'army', text)` | the once-per-screen first-visit hint (stored in `settings.seenHints`). |
| `openModal` | `openModal(scene, { title, w, h, onClose, shadeCloses })` → `{ c, x, y, w, h, body, close }` | any dialog: shade that blocks the screen, Telegram Back closes it (nav layer), layout-check layer. Height is clamped to the screen: put long content in a `ScrollList` inside `body`. **Tap outside closes** by default: a tap that goes down *and* up on the shade outside the box runs the same `close` as Back (so `onClose` fires once); a press that starts on the modal (a scroll or drag ending outside) does not, and the closing tap never reaches the UI below. Pass `shadeCloses: false` where an outside tap would skip a decision or lose progress: yes/no confirms, tutorial steps, battle results, forced choices, forms with unsaved input (market sell form), unasked popups (duel challenge). |
| `confirmDialog` | `confirmDialog(scene, { title, body, ok, cancel, destructive, onOk, onCancel })` | yes/no questions. Cancel left (secondary), OK right (primary or destructive). Every destructive action goes through it. A tap outside does nothing (explicit decisions stay explicit); Back still cancels. |
| `addEmptyState` | `addEmptyState(scene, x, y, w, h, { icon, title, hint, action })` | empty lists: say what to do next, optionally with a primary action. Shrinks itself to fit. |
| `tappable` | `tappable(obj, area, onTap, tip?)` | custom tap targets (rows, zones): ignores drags inside a scroll area, plays the click and haptic, long-press tip. |
| `PanelButton` | `new PanelButton(scene, x, y, w, h, { icon, label, cat, selected, primary, tip, disabledReason, show, onClick })`, `.setCooldown(f)`, `.setBadge(s)` | battle panel commands and category tabs (`src/ui/battlePanel.ts`): tinted by battle category (`cat`), filled when selected, icon above the label from 28 tall, `show: 'icon'` for a row whose labels do not fit. Behaves like `Button`. |
| `GroupCard` | `new GroupCard(scene, x, y, w, h, onTap, tip)`, `.setInfo({ numeral, men, hp, morale, orderIcon, portrait, name, orderWord, selected, routed })` | a group in the battle panel: class portrait, numeral, men, order, health and morale bars; narrow and wide layouts. |

### Onboarding pieces

| Piece | Where | Use for |
| --- | --- | --- |
| `Narrator` | `src/ui/tutorial/narrator.ts` | the tutorial narrator: portrait (talks, blinks), name, typewriter text with sound, skip button, tap-to-go-on arrow; swallows taps and covers what is under it for the layout check. |
| `Spotlight` | `src/ui/tutorial/spotlight.ts` | dims everything but a hole, a pulsing ring round the element, blocks taps outside the hole (or everywhere, with a tap handler). |
| `GhostHand` | `src/ui/tutorial/ghost.ts` | a pale hand demonstrating a gesture on a loop: tap, drag along a path with rests, pinch. |
| `OnlineCoach` | `src/ui/tutorial/onlineCoach.ts` | anchored coach marks (dark bubble, arrow, ring, Next, "2 / 7"): the first-time-hint style for a guided sequence; progress in `settings.onlineCoach`. |

The flow: `src/game/tutorial.ts` (steps, completion checks, progress,
scenario), `src/ui/tutorial/battleTutorial.ts` (drives the battle scene through
`BattleScene.tutorialHost()` and its `'tutorial'` events),
`src/scenes/FirstRunScene.ts` (offer, resume, reward, modes).

Older helpers (`addPanel`, `addScroll`, `addText`, `fitText`, `Meter`,
`ScrollArea`, `confirmModal`) still work; `ScrollArea` + `addScrollHint` is the
non-virtualised list for mixed content.

### Army, hero and economy pieces

Built on the kit, shared by the army, hero, settlement, online army, shop and
market screens:

| Piece | Where | Use for |
| --- | --- | --- |
| `Stage` | `src/ui/sheet.ts` | the hero's figure in his actual gear on a lit stage (idles, swings now and then). |
| `addSlotTile`, `addMountTile` | `src/ui/sheet.ts` | equipment slots (item in its rarity frame with a condition pip, or the empty slot icon). |
| `openItemCard` | `src/ui/sheet.ts` | the item card; with `hero` it is the compare popup (green / red stat deltas, power change). |
| `StashGrid` | `src/ui/sheet.ts` | stash grid with slot / rarity filters, sort, upgrade arrows, empty states. |
| `DragDrop` | `src/ui/sheet.ts` | long-press a stash cell and drop it on a slot (`targets`). |
| `openClassCard` | `src/ui/sheet.ts` | a recruit's class: figure, role, strong / weak, stats, hire action. |
| `addChip`, `addStars`, `addGroupBadge`, `addTabBadge` | `src/ui/sheet.ts` | pills, rank stars, group badges, a count on a tab's top edge. |
| `rarityFont(r)` | `src/ui/fonts.ts` | item names in their rarity colour. |
| `addPurse`, `addEconState` | `src/ui/econ/widgets.ts` | Drachmae / gold in a top bar; the outside-Telegram / offline / closed states. |
| `pickBattleConsumable(scene)` | `src/ui/econ/consumablePicker.ts` | **the one-per-battle consumable picker for attacks and duels**: resolves an id, `null` (none) or `undefined` (closed); pass the id to `onlineApi.attackStart(hex, id)` or a duel challenge. |

The pure logic behind them is unit-tested: `src/game/gear.ts` (stats, compare
deltas, stash and roster queries) and `src/game/economy.ts` (pass states, fee
math, caps, availability). The shop and market scenes take `{ demo: true }` to
run on the in-memory economy of `src/ui/econ/demo.ts` (layout check,
screenshots).

## Patterns: which one when

One clear pattern per screen for long content (never shrink text or buttons
to make things fit):

- **Tabs** when the content is a few *different* sections (Stats / Gear /
  Perks; Recruits / Market). Each tab page then fits or scrolls by itself.
- **ScrollList / Grid** for *many items of one kind* (roster, inventory,
  marketplace listings). Fixed row height, virtualised.
- **Cards** when items need a *one-line summary plus details* (perks,
  quests, listings with descriptions): collapsed by default, tap to expand.
- **Modal** for focused tasks and questions; **toast** for feedback that
  needs no answer; **tooltip** for explanations.

Hierarchy: one primary (red) action per screen, at the bottom where the thumb
is; secondary actions outlined; destructive actions confirm. Empty lists get
an empty state. Disabled buttons always carry a reason.

## Colours

| Meaning | Colour | Token |
| --- | --- | --- |
| Common / Uncommon / Rare / Epic / Legendary | grey / green / blue / purple / gold | `RARITY_COLOR`, `RARITY_GLOW` |
| Battle panel: Movement / Attack / Formation / Abilities | bronze / red / blue / gold | `CATEGORY_COLOR`, `CATEGORY_DARK` |
| Better / worse (stat deltas, gains, losses) | green / red | `COLOR.good`, `COLOR.bad`, fonts `good` / `red` |
| HP, morale, XP, stamina bars | red, blue, gold, green | `COLOR.hp` ... |
| Primary action, selected tab | filled red parchment | `variant: 'primary'` |
| Destructive action | dark wine, red rim | `variant: 'destructive'` |

Fonts (`FontKey`): `ink` (body), `red` (titles), `dim` (secondary), `light`
(on red / dark, with shadow), `gold`, `title`, `good` (green).

## Spacing and touch

- Touch targets at least 44 x 44 pt = `SIZE.btnH` (24) UI px tall; never
  below 22 UI px. Icon buttons at least 24 x 24.
- At least 4 pt between targets: `SIZE.gap` (3 UI px).
- Rows 26 (`SIZE.rowH`), item cells 24 (`SIZE.cell`), panel padding 6.
- Text: the pixel font at its native size (7 px cap height x S); titles may
  use size 14. Never scale text down to fit.
- Everything stays inside the canvas: the canvas already is the Telegram safe
  area (`src/platform/safeArea.ts`), so `VW x VH` is all you have. The
  smallest case is 320 x 568 inside Telegram: about 137 x 214 UI px. Design
  for it (scroll, tabs, compact variants), see `MenuScene` for a compact
  layout switch.
- Primary actions at the bottom (thumb zone).

## Text and i18n

- All UI text goes through `t(key, params)` from `src/i18n`:
  `t('menu.continue')`, `t('common.day', { n })`. Plurals: an entry like
  `{ one: '{n} hero', other: '{n} heroes' }`; Russian needs `one`, `few`,
  `many`, `other` (`pluralForm`).
- Add a key to `src/i18n/en.ts` (the typed source) **and** `src/i18n/ru.ts`
  under your screen's prefix (`army.*`, `battle.*`, `map.*`...).
  `tests/i18n` checks every key exists in both with the same `{params}` and
  that the pixel font can draw every character.
- Data names (items, classes, perks) use `tOr('item.<id>.name', def.name)`
  so translations can be added later without touching the data.
- Russian strings are ~30% longer. Fit by measuring, not by guessing:
  `measureText`, `ellipsize`, `wrapText` (`src/ui/textfit.ts`), `Label`,
  `Button` (auto "…"). Keep `opts.label` the full text: smoke scripts find
  buttons by their English label.
- The language: `?lang=ru` in the URL, else the player's setting
  (Settings → Language: Auto / English / Русский), else Telegram's
  `language_code`, else the browser. Changing it rebuilds the screen.
- The font has Latin and Cyrillic in upper and lower case (5 px x-height,
  descenders inside the 9 px line), digits, punctuation and
  `… — – « » × № · &`. Text renders in the case it is given: write strings in
  sentence case and do not upper-case them for display.

## Layout check

`node scripts/layout-check.mjs <url>` (needs `npm run build` and
`npx vite preview`, or the dev server) visits every screen at 320x568,
375x667, 390x844, 430x932 and 360x780, plain and inside a fake full-screen
Telegram (insets top 59 + 46, bottom 34), in English and Russian, scrolls every
list to its end and checks again. It fails on:

- `overlap` / `spacing`: interactive elements overlapping or closer than 4 pt;
- `text-overflow`: text outside its box (its button / panel, or wider than
  its declared `maxWidth`); `text-overlap`: texts on top of each other;
  `text-column`: a line of a wrapped block outside its declared column, or
  the block's lines not sharing a left edge (`uiColumn`);
  `clipped`: something cut at the side of a scroll area;
- `outside-safe-area`: anything outside the canvas;
- `touch-size`: an interactive element under 44 pt.

Screenshots: `docs/screenshots/layout/<lang>-<plain|tg>/<W>x<H>/<screen>.png`
(git-ignored; CI uploads them as the `layout-screenshots` artifact), summary
in `docs/screenshots/layout/index.md`. Options: `--screens`, `--sizes`,
`--langs`, `--insets`, `--verbose`, `--update-allowlist`, `--shard i/n` (every
n-th configuration; CI runs 10 shards in parallel) and `--split k` (each
configuration's screens in k contexts, run in parallel by `--jobs`).

**Registering:** nothing to do for kit components and plain Phaser objects:
the registry walks the display list (interactive objects and bitmap texts;
the box of a text is the smallest parchment panel or button behind it).
Help it where needed:

- `uiId(obj, 'army.dismiss')`: a stable name (otherwise the i18n key of the
  text, the label or icon of a button, or the normalised text);
- `uiFrame(text, container, w, h)`: the box a text must stay in;
- `uiColumn(line, container, x0, x1, blockId)`: one line of a wrapped,
  left-aligned block (built line by line, e.g. the narrator's speech beside
  his portrait) must stay in `x0 .. x1` and start where its block's lines start;
- `uiBlocker(shade)`: a modal backdrop (everything under it is ignored;
  full-screen interactive rectangles are detected automatically);
- `uiIgnore(obj)`: not a UI element (e.g. a full-screen drag zone);
- `uiClip(container, viewportZone)`: custom scroll viewports (`ScrollArea`
  does it).

Objects under a scrolling map camera (World, Battle, Online maps) are map
content: clipped to the view, never compared with the UI drawn over them.

**New screens** go into the `SCREENS` table of `scripts/layout-check.mjs`
with an owner and a staging function (start the scene, open the dialog).

**Allowlist:** `scripts/layout-allowlist.json` lists the known violations
by owner (A = battle panel, online battle rules, battle report; B = army,
hero, stash, shop, pass, marketplace, settlements; C = world and hex maps).
Keys are `screen|check|element ids`. CI fails on anything not listed. Fix
your entries and delete them; the list must end up empty. Never add
entries for new work (`--update-allowlist` rewrites the file from the
current state: review the diff, it should only shrink). The foundation
screens (menu, settings, kit gallery) are never allowlisted.
