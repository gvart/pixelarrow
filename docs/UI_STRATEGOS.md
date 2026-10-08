# UI Strategos

The screen structure of the game since the "Strategos" redesign (concept D of
the UI study): every screen tells the player **what is happening and what to do
next in a sentence**, has **one red action** in a strip that never moves, and
battle orders live **on the field, round the selected group**. The parchment
kit of docs/UI_KIT.md is unchanged underneath; this page is the layer on top.
Read docs/UI_KIT.md for the components, this page for how screens are shaped.

Implemented in this pass: the kit tokens, `src/ui/strategos.ts`,
`src/ui/radialOrders.ts`, the main menu, the battle HUD, the army, hero, shop,
the overland map's chrome and the online war map's chrome (its region panel
lays its actions out in two rows rather than cut a word). The isometric camp
scene keeps its own strips and column (they already follow the pattern: an
info sentence in the bottom strip, one red action, the back button top-left);
settlements, results, duels, market and the first run keep their old chrome
until they adopt this page.

## Tokens (`src/ui/theme.ts`)

| Token | Value | Meaning |
| --- | --- | --- |
| `BRONZE.main` / `.dark` / `.hi` | `#b8863b` / `#6e4f22` / `#e8c26a` | **selected / next**: the radial ring, its handle, the focus ring, selected chips, the rule under the situation bar |
| primary (`variant: 'primary'`) | filled red (`P.red`) | **the one action** of the screen: the strip's middle slot |
| `buttonOff` | grey dither | **cannot**, always with a reason line or a toast that says why |
| `tooltip` panel | dark | tips, the checklist, words over the field |
| `STRAT.sitH` / `sitHCompact` | 40 / 30 | situation bar height (two sentence lines / one) |
| `STRAT.stripH` | 34 | command strip height |
| `STRAT.stripSide` / `stripBtnH` | 40 / 26 | side slot width, strip button height (52 pt at S = 2) |
| `STRAT.compactVH` | 300 | below this many UI px the screen is "compact" |

Nothing else is coloured: group cards, chips and rows are parchment; red means
"tap this next", bronze means "this is the one you picked".

## Components (`src/ui/strategos.ts`, `src/ui/radialOrders.ts`)

| Component | API | Use for |
| --- | --- | --- |
| `SituationBar` | `new SituationBar(scene, VW, { sentence, numbers, urgent, compact, left, right, id })`, `.setSentence(s, urgent)`, `.setNumbers(nums)`, `.bottom` | the top of every screen: one plain sentence, then `SitNumber`s (`{ icon, value, word, tip, font }`): "344 gold", "9 men, 1 hurt". Words drop from the right when the row is too narrow; numbers never truncate. Call the setters from a refresh, they rebuild only what changed. |
| `CommandStrip` | `new CommandStrip(scene, VW, VH, { left, main, right, extra, why })`, `.set(opts)`, `.top`, `.buttons` | the bottom of every screen. `left` = Back / Map / Menu / Pause (icon over word), `main` = the one primary (red; `secondary: true` for a toggle like Speed 2x, `selected` for a toggle in force), `right` = Army / More / Flee, `extra` = a fourth narrow slot (online: Duels). A `StripSlot` with `off` is grey and says why; `badge` adds a count. Swap actions with `set()` instead of rebuilding the screen. |
| `Chip` | `new Chip(scene, x, y, w, { icon, label, selected, off, corner, tip, id, onClick, chevron })`, `.setCorner(text)`, `.setBlocked(reason)` | 22-tall parchment buttons with a word: shapes, abilities ("Rally · 39s" in the corner), follow, filters. Selected = bronze rim. |
| `ListRow` | `new ListRow(scene, x, y, w, { label, sub, icon, onClick, badge, off, selected, primary, id }, h = 26)` | a destination or choice with a line of context under it (menu rows, shapes with their meaning). Carries `opts.label` so scripts find it like a Button. |
| `addTip` | `addTip(scene, parent, id, x, y, text, { w, arrow, ax, ay, vw })` | a persistent onboarding tip: dark panel, chevron toward the thing. Stays until tapped; the tap is remembered in `settings.seenHints` under `id`. |
| `addChecklist` | `addChecklist(scene, parent, x, y, w, title, [{ text, done }])` | "First steps · 2 of 4" (menu). |
| `addFocusRing` | `addFocusRing(scene, parent, x, y, w, h)` | the pulsing bronze glow round the next thing to tap. |
| `addNumbers` | `addNumbers(scene, parent, x, y, w, nums)` | the labelled-numbers row on its own (cards, panels). |
| `RadialOrders` | `new RadialOrders(scene, { orders, numeral, bounds })`, `.place(cx, cy)`, `.setShown(on)`, `.buttons` | the ring of orders round the selected group in battle: five 26 px glyph buttons at 2x with their word outside (Advance, Charge, Hold, Shoot, Back; a sixth for Alone / Rejoin), the numeral in the centre. `place` every frame with the group's screen position; it clamps itself inside `bounds`. `buttons` maps order keys to the buttons (the tutorial lights them). |

## Patterns

**Every screen = situation bar / content / command strip.** The bar says what
is up ("Income is waiting on your hexes: tap Collect.") and the strip's middle
slot is that action. Back is always bottom-left. Nothing else on the screen
is red.

**Numbers have words.** "344 gold", "9 men, 1 hurt", "0:11 time", "96% ours".
Icons alone are never the only legend; the word drops before the number does.

**No abbreviations.** Group cards say "4 men / Phalanx / advancing"; shapes
are "Line · 2 ranks, wide front"; orders are Advance / Charge / Hold / Shoot /
Back; an ability shows its full name when it fits, else its data short name
(both lead the long-press tip).

**Selection is bronze, action is red.** The selected group's card is filled
(with a gold rim); the order in force is the red button on the ring; a
selected chip has a bronze rim; the focus ring pulses bronze round the next
thing to tap.

**Cannot = grey with a reason.** A grey strip slot or chip never just sits
there: `off: reason` makes a tap say why (toast) and the strip prints the
reason above itself for the middle slot.

**Tips are part of the screen.** `addTip` panels stay until tapped and are
remembered; `firstTimeHint` toasts remain for one-off notes. The menu's
checklist shows progress through the first steps.

**Shallow navigation.** Menu → World → Army → Hero → Gear stays, but every
level's strip has Back bottom-left and the hub's rows carry one line of
context so the player knows what a destination is before going.

## Screens (IA)

```
Home (MenuScene)       title scroll · situation card (who, where, what is up; gold / men / won)
                       · Continue the march (primary) · rows: New campaign, Online, Duels,
                       Beasts, Shop, Settings (each with a line of context) · First steps checklist
Battle (BattleScene)   SITUATION ("Paused. Give orders, then tap Play." · time / ours % / theirs %)
                       left column: group cards (numeral, men, name, order; health / morale) ·
                       Shape chip (opens the shape sheet: five rows with one line of meaning) ·
                       Follow (battle) / Reset (deployment)
                       field: RADIAL RING round the selected group (battle); drag the bronze knob
                       ahead of the group to turn it; drag the group to move it; tap ground to go
                       ability row above the strip (chips with cooldown seconds)
                       STRIP deploy:  Leave | Fight! (or Ready online) | Men (group assignment)
                       STRIP battle:  Pause | Play / Speed 2x | Flee     online: Follow | Watch | Flee
Army (ArmyScene)       SITUATION (points to spend, wounds, men · men / hurt / gold) · hero head with
                       slots · Roster | Stash tabs · STRIP: Map or Town | Sheet (badge when points) | Dismiss
Hero (HeroScene)       SITUATION (who, what to spend · power / points / perks) · stage with slots ·
                       Stats | Gear | Perks | Skills · STRIP: Back | Confirm N (pending points) or
                       Next: <name> | Undo or Prior
Shop (ShopScene)       SITUATION (what the page sells · drachmae / gold) · Shop | Pass | Wallet ·
                       STRIP: Back | Wallet (or Shop) | Pass (badge: claimable)
Online (OnlineScene)   SITUATION (marching / income waiting / energy / season + hint · resources, energy)
                       · map · region panel (actions in rows of whole words) · STRIP: Army | Collect | Duels | Clan
World (WorldScene)     SITUATION ("Day 3, 09:00 · Road, safe. Tap the map to march, a town to enter."
                       · gold / fit men / food · days / supplies) · map (follow button under the bar)
                       · STRIP: Menu | Camp (pitch, or enter the camp) | Stop or Rest / Pause | Party
Camp (CampScene)       own iso strips: title + purse on top, the info sentence and the action row
                       (Muster, Loot, End day (primary), Strike) at the bottom; structures down the column
```

Not yet adopted (keep their own chrome for now): SettlementScene, Results,
Duel, Market, FirstRun; CampScene keeps its iso strips by design. To adopt:
replace the top bar with a `SituationBar` (sentence + numbers), the bottom
buttons with a `CommandStrip` (Back | the one action | Army), and any tab row of
actions with chips; keep the content between `sit.bottom` and `strip.top`.

## Battle specifics

- The ring opens when a group is selected in the battle phase (tap its card,
  its men or its floating numeral). It follows the group, hides while a finger
  pans or drags, and is rebuilt when the order in force changes.
- Ring geometry: radius 34, buttons 26 (52 pt), words outside; it needs
  `RING_REACH_X` x `RING_REACH_Y` (58 x 60) of free field around its centre and
  is clamped to the field right of the group cards, under the situation bar
  (and the tutorial's narrator), above the ability row and the strip.
- Group cards are 56 x 44 (30 x 30 on compact screens); as many as fit above
  the chips. The compact card shows "I 4" and the short order.
- The tutorial (`battleTutorial.ts`) lights, in order: the card, the ring
  button or the Shape chip (then the sheet row), the ability chip; the narrator
  sits at the bottom for the card step and at the top for the panel steps so
  it never covers what it points at.
- Scripts find the strip's buttons by label (`Fight!`, `Play`, `Leave`...) and
  ability chips by icon; ring buttons expose `opts.label` / `opts.icon` too.

## Checks

- `tests/ui.test.ts` covers the i18n tables (`src/i18n/strat.en.ts` /
  `strat.ru.ts` hold the sentences, strip words, ring words and tips).
- The layout check (`scripts/layout-check.mjs`) stages `battle-ring`,
  `battle-ring-soldier`, `battle-shapes` and `battle-deploy-formation` for the
  new HUD; every screen at the five sizes, plain and in Telegram, en and ru.
- Touch: strip buttons 26 UI px, ring buttons 26, chips and rows 22 to 26, all
  at least 44 pt at S = 2 with 4 pt gaps (ring buttons are 14 px apart).
