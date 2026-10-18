# V6-RSCR-06b notes: the rest of Settlements and economy (landscape and tablet)

Finishes what V6-RSCR-06 recorded as deviations (docs/v6/shots/V6-RSCR-06/NOTES.md), against design/ux/landscape-v6.md §3.2–§3.4, §5, §11.2. Stacked on the RSCR-06 branch. Compact portrait runs the same code paths as before; every change is behind the layout variant.

## What changed

| | Where | What |
| --- | --- | --- |
| Settlement detail pane | expanded with ≥ 560 UI px for the panes (1280x800, 1440x900, 1920x1080) | Three panes from `columns()`: the banner (220), the list (180–300), the detail (160–240). Hire: the chosen volunteer's card (the recruit sheet's content, `addRecruitPane`) with Hire at its foot. Buy: the ware's item card with Buy (confirm as before). Sell: the stash item's card with Sell. The first one shows on arrival; a tap, click or Enter on a portrait, a ware's icon or a stash cell chooses another; the chosen row has the selected rim and a chevron (§3.3). Services, and a closed or empty tab, take the list and detail panes' width, a row wide at most, centred. 1024x768 (under 560 for the panes) keeps two panes and the §3.4 side panel. |
| Market detail pane | expanded, ≥ 560 (the same three sizes) | Browse: the sidebar (110–150), the table (≥ 303), the chosen listing's card (item card or goods card) with Buy or Cancel listing. Mine: the table and the chosen listing's card. A tap on a row's icon or price chooses it. Beside the pane the table's seller and time columns are as wide as their longest, so "26 золота войны" is not cut. The goods card is as tall as its words, centred in the pane's height. Sell keeps the List → sell form side panel. |
| Pass tier track | compact landscape (plain 844x390), expanded (1024–1920) | A horizontal track: each tier a column (its number lit when reached, the next one with its progress, "7 · You" on the current), Free on top, Premium under it, the labels at the left. It scrolls sideways a whole column at a time (drag, swipe, wheel, and keyboard focus brings a column into view), opened at the player's tier. The season card is left of it in compact landscape (its own scroll when taller than the page), above it on laptops. Same tiers, rewards, states and Claim buttons. |
| Settlement fresco | banner pane (compact landscape, expanded) | The fresco fills the pane's height above who lives here, the purse and Army/Leave. It is the pane's content, not an empty column: it answers a press, the pointer and focus with the place and its people ("Rhegion · Town of the Hellenes"), as RSCR-02 and RSCR-08 did for wide-pane art. The layout check is unchanged; the 55% cap is gone. |
| Hire Undo toast | beside the banner pane | `showUndoToast(…, place?)`: an optional span to centre in (additive; without it, the screen as before). The Settlement passes the list's span, so the toast sits over the list, clear of Army and Leave. |

## Kit (additive)

- `addParchmentPane` (ParchmentSheet.ts): the sheet's parchment, title and action row drawn in place, no shade, no X, no nav layer (§3.3: the detail is not a layer).
- `addItemCardPane` (sheet.ts): `openItemCard` split into measure and draw; the sheet draws exactly as before.
- `addRecruitPane` (sheets/recruit.ts): the recruit sheet's content in a pane.
- `ScrollArea` `{ axis: 'x', snap }` (kit.ts): sideways scrolling resting on whole columns (no column is ever cut at the window's side, which the `clipped` check forbids); `revealX` for keyboard focus (focusRing.ts calls it when present). The default vertical behaviour is unchanged.
- Element parity: the card's X (`recruit.sheet.close`, `sheet.close`, `market.goods.close`) has nothing to close in a pane; it is registered `uiCollapsed` into the chosen row's control.

## Deviations (recorded for review)

- **Telegram at 844x390 keeps the vertical tier rows.** The page under the tabs is 89 UI px; the track's tier strip and two 44-px rows need 109. Plain 844x390 (123) has the track.
- **1024x768 keeps two panes** in the Settlement and the Market: the panes region is under the three-pane width (§3.2: 560 UI px). The card opens as the side panel there.
- **The Market's sell form** stays a side panel (List on a Sell row), not a detail pane.

## Verification (`vite preview` of the branch; machine load average 30–140 from other agents)

- tsc 0 errors; vitest 175 files, 2138 tests passed; vite build OK.
- **Layout check**, the family (`--scenes 'shop*,consumable-picker,market-*,village,town-*,menu-shop'`), all ten sizes, en and ru, plain and tg (28 configs × 24 screens): **LAYOUT CHECK PASSED, 0 distinct violations, 0 new, 0 pending**. Earlier runs found element-parity of the cards' X at 1280–1920 (fixed with `uiCollapsed`) and a demo-data id clash in the Market (two listings `l30`: the pane now keeps the chosen listing itself). `menu-shop` at 1440/1920 (ru, API down) showed once and cleared on the check's own second run (timing, untouched code).
- `--quick`: PASSED, 0 new (its 14 known findings and 24 pending screens belong to other stories).
- **Portrait parity (V6-074 method):** every element's id, kind and rect from the layout registry, the RSCR-06 branch (5b5ea583) against this branch, the family's 24 screens × 390x844, 360x780, 320x693 × en, ru × plain, tg = 288 screens: **288/288 identical** (the last commit after it touches only the Market's three-pane path, which compact portrait never takes).
- `node scripts/regression/run.mjs <preview> --all`, both modes: **23 of 23 rows PASS** (suite 4661 s); `hub-flows` (it opens the Market) rerun on the final build: PASS both modes.
- **Played** with real input (scripted, `play-transcript.txt`, 39 checks, ALL PASS): 1280x800 mouse and keyboard (a click on a portrait, a ware and a stash item chooses it for the pane; Tab reaches the pane's Hire and Enter hires; the Undo toast sits over the list, clear of Army and Leave, and Undo takes the hire back; Buy in the pane asks to confirm, Esc closes; hovering the fresco names the place; Market: a click chooses a listing, the wheel scrolls the table; Pass: the wheel moves the track one column, a drag rests on a column, Tab to tier 15 brings its column into view); 768x1024 by touch (Hire, the recruit sheet, Claim all on the rows); 844x390 by touch, Telegram (ru) and plain (Hire with the toast clear of Army, a tap on the fresco, a swipe on the track (plain), the rows (Telegram), a listing's card as the side panel). No page errors.
- Screenshots: 8 JPEG (q82, 1.8 MB) here.
