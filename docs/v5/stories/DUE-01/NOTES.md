# DUE-01: the Duels hub, Team and Armoury, notes

Spec: [screens-modes.md](../../../../design/ux/screens-modes.md) M-2, M-3, M-4. Audit: UI.md §21 DUE-1, DUE-4, DUE-5, DUE-7, DUE-8, DUE-12, DUE-13. Decisions: V5-021, V5-029, V5-046, V5-060, V5-068, V5-074. Depends on ARM-01 (the Army template) and CT-06 (the 30-minute ladder ticket).

## What changed

- **Fight is in the flow (AC1, DUE-1).** "Fight floor n" sits right under the next-floor card and scrolls with the page, so it can't cover anything. To keep the first floor row in view at 320x640, three other things changed:
  - the fresco is 28 px tall and only shows from 700 CSS px of height (M-2);
  - a chapter's chests share its heading row;
  - the farm bar moved under the current chapter, next to the replays it pays for.
- **One header row (DUE-4).** Glory, the level, Team and Armoury always share one row.
  - Team and Armoury show labels only when both labels fit in Cinzel. Otherwise both are icon-only, with the name in the tip.
  - On a tight row the chips trim their padding first.
  - Only 320x568 in Telegram is too narrow for one row: there the buttons take a second row (`headerLayout`, tested).
- **Floor tiles.** Each tile shows its state with a glyph as well as its colour (G13): ▸ for next, ✓ for cleared, a padlock for locked. On the narrowest screens the tiles stay touch-sized: 4 to a row when 5 won't fit.
- **The floor sheet (DUE-12, G4).**
  - It is docked full width.
  - A new line says the fight can pause at 0.5x, 1x or 2x and must end within 30 min (controls.md R10).
  - Role pills are earth-toned, not blue.
  - Below the numbers, everything scrolls on short screens.
- **Team on the Army template (AC2, D6, DUE-5).**
  - The duel army is an `ArmySource` (`duelArmy`). Its rows are `addRosterRow` rows. Where the campaign shows rank stars, a duel row shows the hero's team points: in a duel, cost matters more than rank.
  - The Team toggle is a lit ✓ when the hero is in the team and a bronze + when he isn't.
  - Recruit is the view's primary button and sits in the flow under the duel-army card, so it never covers a row. When the roster is full it is disabled with the reason "dismiss someone from the bench first".
  - A tap on the edited preset (it has a pen) opens the **Preset sheet**. The sheet holds:
    - "Fights on": Ladder, Arena and Defence as labelled buttons, the one in force lit with a ✓;
    - Rename and Duplicate;
    - Delete, on its own row 12 px below (P4).
  - The bench heading has a **Dismiss** door to the existing `openDismiss` (N10, DUE-13).
  - The symbols sheet behind the (i) explains the template's symbols.
- **Armoury (AC2, DUE-8).** "Shop" is now **Armoury** (Russian: Арсенал) on the button, the top bar, the item card, the sell confirm and the empty sell grid. Neither Team nor Armoury links to the other any more (E324).
- **Sheets on the kit (AC3).** These sheets are kit parchment sheets with all text at 6.5 or more: Level, Floor, Chest preview and reward, Recruit, Dismiss, Preset, Symbols, Defence, Raid log and Season. The Symbols legend moved off the v3 `openLegend` onto the kit sheet.
- **The ladder countdown (AC3).** From 5 min left the battle's top bar counts the ticket down, on the device clock (CT-06). This story makes three changes around it:
  1. **Director 1: explicit field.** `LadderTicket.deadline` is the ticket's end on the device clock. The ladder's `BattleSource` carries `ladder: { deadline }`. BattleScene reads `src.ladder?.deadline`. The WeakMap lookup by setup object is gone.
  2. **Director 2: expired note.** A run reported after the ticket ran out is marked on two screens. The report says "Finished after 30 min: verified, but it paid nothing", first and with no XP line (`ladderNotes`). Back on the ladder, the toast says "Floor n: the 30 min ran out, so it paid nothing" (`ladderArrival`).
  3. **Pausable line.** The floor sheet shows the line above.
- **Director 3: numbers.** `fmtCount` (in `hubLayout.ts`) groups thousands as "1,500" and "12,400" in English, and "1500" and "12 400" in Russian, never with a comma. It is used on every Glory, price, XP, points and rating number on my screens. No shared formatter existed.
- **Season icon (DUE-7).** The grey disc in front of the season line and the offers timer is now an hourglass.
- **Text size (V5-060).** I removed these allowlist entries: `duel-ladder`, `duel-ladder-open`, `duel-floor`, `duel-floor-farm`, `duel-chest`, `duel-chest-item`, `duel-recruit`, `duel-team`, `duel-team-presets`, `duel-shop-offers` and `duel-shop-gear`. `duel-shop-sell` stays: the 5.5 px price label belongs to the kit's `MStashGrid`.
- **New layout fixtures:** `duel-preset`, `duel-symbols`, `duel-level` and `duel-ladder-expired`.

## Element map (ELEMENT_MAP §1.21, DUE-01's rows)

| # | Element | Now |
| --- | --- | --- |
| E297 | States: skeleton, outside, offline, closed, error + Retry | Kept. "Open in Telegram" is deferred, see follow-ups |
| E298 | "Duels" title, Demo note | Kept; Demo note at 6.5 |
| E299 | Glory chip | Kept; grouped number |
| E300 | Lv chip → level sheet | Kept |
| E301 | Team button (badge) | Kept, in the one header row |
| E302 | Shop button | Renamed **Armoury** |
| E303 | Fresco | Kept; 28 px, hidden below 700 CSS px |
| E304 | Ladder \| Arena switch | Kept |
| E305 | Ladder tip | Kept. The team-problem tip always shows; the chest tip shows from 700 CSS px (the chest glows on short screens) |
| E306 | Next-floor card → floor sheet | Kept; sheet full width, Pausable line, earth pills |
| E307 | Farm-Glory bar | Kept, under the current chapter |
| E308 | 5 chapters, chests, floor tiles | Kept; ▸ and ✓ glyphs. The per-tile replay Glory moved to the floor sheet |
| E309 | CTA Fight floor n | Kept, in the flow |
| E310–E313 | Arena season line, Live PvP, locked ranked, Raids cards | Kept; hourglass season icon |
| E318 | Season rewards | Kept (DUE-02 owns its text-size) |
| E319 | Roster card, Symbols legend | Kept; legend behind (i) on a kit sheet |
| E320 | Presets: chips, rename/duplicate/delete, Use for, points bar | Moved: tools in the **Preset sheet** |
| E321 | Hero rows → Hero; bench toggle | Kept, on the Army row template |
| E322 | Recruit sheet | Kept (no Undo, see decision 6) |
| E323 | Shop: Today/Gear/Sell, slot filter, Compare, offers, Sell grid | Renamed: Armoury |
| E324 | Team ↔ Shop cross-links | **Removed** (D11) |
| E325 | Back arrow on hub views | Removed (already root) |
| E327 | `openDismiss` | Moved: Dismiss on the bench heading |

E314–E317 and E326 (Raid picks, Leaderboards, Search and Found) belong to DUE-02.

## Decisions (the user was asleep)

1. **Fight in the flow, not fixed.** M-2 allows either. Measured at 320x640, a fixed button leaves 190 UI px of page, and the first floor row needs about 220. In the flow, nothing can sit under it.
2. **Team and Armoury are both labelled or both icon-only.** At 390 the chips leave about 44 px per button. "ARMOURY" needs 56 px in Cinzel, and one Cinzel label next to an Inter one is against art bible 7.2. So both buttons are icons (with tips and the badge) until both labels fit, which happens on wider phones. One row was the bigger win (DUE-4, DUE-1).
3. **The per-tile replay Glory ("+11") left the tiles.** At 320 a tile is about 27 px wide. It has room for its number and a state glyph, not a third item. The floor sheet still shows what a replay pays, and the farm bar shows what is left today.
4. **Duel rows show team points instead of rank stars** (through `ArmySource.status`). In duels a hero's cost decides the team, and at 320 the template's stars ran into Power.
5. **Russian numbers:** a space separator from five digits up ("12 400"). Four-digit numbers stay whole ("1500"), as Russian typesetting does. There is never a comma. English groups from four digits ("1,500"). No non-breaking space: the bundled font has no such glyph.
6. **No 4-second Undo on a duel hire (M-3).** The duel server has no refund for a recruit (dismiss pays nothing back), so an Undo would cost the player Glory. It needs a server endpoint first: see follow-ups.
7. **"Open in Telegram" (N32, DUE-9) is deferred.** The client doesn't know the bot's t.me link (the server builds invite links). A button that guesses the link would be wrong.
8. **The Glory chip counts up only below 1000.** The kit's `MChip.setValue` writes plain digits. Above 1000 the chip is redrawn with the grouped number instead.
9. **Internal ids are unchanged** (`tab: 'shop'`, `duel.shop`, `duel.fightNext`), so the smoke scripts and fixtures keep working. Only the words changed.
10. **Two files outside the ownership list:**
    - `src/online/battleSource.ts`, for the new `ladder` field;
    - one line in `src/scenes/BattleScene.ts`, which reads that field (rd-02 holds BattleScene this wave).

    Director 1 needs both. A small new pure module, `src/scenes/duel/hubLayout.ts`, holds the hub's rules for the tests.

## Follow-ups for other owners

| Item | Owner |
| --- | --- |
| "Open in Telegram" on the outside state needs the bot's t.me link on the client (config or the server's answer) | platform / F |
| Hire Undo in Duels needs a server un-recruit with refund | server / DUE-02 or EC |
| `MChip.setValue` should write grouped numbers (Russian spaces), so every chip can count above 1000 | kit (F-05) |
| `MStashGrid` price label is 5.5 px (keeps `duel-shop-sell` allowlisted) | kit (F-05) |
| `fmtCount` could move to `src/util/format.ts` once another screen needs it | F |
| Unused now: `dv.shop`, `dv.shopTip`, `duels.view.shop`, `duels.shopItem`, `duels.sellBody`, `duels.sellEmpty`, `legend.*` (duel use), `dv.capNoteShort` | i18n cleanup (DLG-02) |
| `res.tip.glory` still says "Duels shop" | i18n owner |
