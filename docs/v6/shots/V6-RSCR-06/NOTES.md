# V6-RSCR-06 notes: Settlements and economy (landscape and tablet)

Spec: design/ux/landscape-v6.md §2.3, §3.2–§3.4, §4, §5, §11 (11.1–11.3), §15. Decisions: V6-055 (ADR-0013), V6-057, V6-062, V6-063, V6-066, V6-067, V6-068, V6-074, V6-076, V6-078.

Scenes opted in (`responsive = true`, `uiLayout`): `SettlementScene`, `MarketScene`, `ShopScene`. Compact portrait (390x844, 360x780, 320x693) runs the v5 code paths; every change below is behind the layout variant.

## What goes where

### Settlement (village, town: Hire, Buy, Sell, Services; forge, recruit card, ware card)

| Element | uiId | compact portrait | compact landscape (844x390) | medium (768, 820) | expanded (1024–1920) |
| --- | --- | --- | --- | --- | --- |
| Top bar, place name | `town.topbar` | yes | yes | yes | yes |
| Fresco | `town.art` | band 38–78 | banner pane (150), above the purse | band 120 (§11.2 max) | banner pane (220), at most 55% of the height |
| Kind and culture line | — | yes | banner pane | yes | banner pane |
| Chips gold, men, wounded | `town.gold`, `town.men`, `town.hurt` | one row | banner pane, rows as they fit | one row | banner pane, rows as they fit |
| Tabs | `town.tab` | yes | top of the body pane | yes | top of the body pane (≤ 360) |
| Recruit rows, Hire | `recruit.card`, `town.hire` | price only | price only (body < 300) | "Hire 56" | "Hire 56"; a short list sits in the middle of the body's height |
| Wares, Buy | `item:*`, `town.buy` | price only | price only | "Buy 102", stats in a second column | "Buy 102", stats in a second column |
| Sell grid | `stash` cells, filters | 28 cells | 28 cells | 40 cells | 40 cells |
| Services rows, Rest 8 hours | `town.physician`, `town.drill`, `town.forge`, `town.buy.*`, `town.rest` | Rest full width | Rest ≤ 240, centred | Rest ≤ 240 | Rest ≤ 240 |
| Army, Leave | `town.party`, `town.leave` | action bar across the foot | foot of the banner pane | action bar across the foot | foot of the banner pane |
| Event card, recruit card, ware card, buy confirm, forge sheets | (sheets) | bottom | §3.4 (kit) | §3.4 | §3.4 |

### Market (Browse, Mine, Sell; filter, find, goods, sell form, keypad)

| Element | uiId | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- | --- |
| Purse chips | `market.purse`, `market.purse.gold` | own row | one row with the tabs | own row | one row with the tabs |
| Tabs | `market.tab` | yes | beside the purse | yes | beside the purse |
| Filters Kind, Currency, Sort, Find, clear | `market.kind`, `market.cur`, `market.sort`, `market.find`, `market.clearRef` | 3 + Find rows | left sidebar (scrolls when Telegram's height is short) | one row of four | left sidebar (≤ 170) with each filter's name |
| Listings | `item:*`, `market.price`, `market.more` | v5 rows | rows; the seller left, the time right by the price | a table: name, seller, time, price | a table |
| Mine | `market.cancelRow`, status | v5 rows | a table, then every free slot (tap: Sell) | idem | idem |
| Sell | `item:*` | grid | rows: name, rarity, slot, worth, List (`market.sellRow`) | idem | idem |
| Number keypad | `market.priceSheet.*`, `market.qtySheet.*` | 4-row pad | short screen: digits in two rows, presets, Cancel and OK in a third (every key kept) | 4-row pad | 4-row pad |
| Sell form | `market.sellForm`, fields | sheet | the fields scroll above the actions when the dialog is shorter than asked | idem | idem |

### Shop (Shop, Pass, Wallet; cosmetic, pass XP, need-Drachmae sheets, consumable picker)

| Element | uiId | compact portrait | compact landscape | medium | expanded |
| --- | --- | --- | --- | --- | --- |
| Nav | `tab.*` | tab bar | rail (RSCR-01) | tab bar | rail |
| Drachmae chip | `shop.drachmae` | fixed or scrolling | beside the Shop/Pass/Wallet tabs | fixed | fixed |
| Banner | `shop.banner` | where tall enough | — (as v5 below 280) | yes | yes |
| Tip, Market door, map merchants | `shop.what`, `shop.market` | one column | left pane | one column, Market ≤ 360 | left pane |
| Looks | `cosmetic:*` | grid | right pane, 3 a row, short rows centred | 3 a row, short rows centred | right pane, 3 a row, short rows centred |
| Economy down (closed, offline) | `econ` state, Retry | the state card | the Market door kept, state card in the right pane | Market door, state card, merchants | left pane kept, state card right |
| Pass season card, Unlock, Claim all, XP info | `pass.unlock`, `pass.claimAll`, `pass.xpInfo` | yes | buttons ≤ 240, Claim all at the right | idem | idem |
| Wallet balance, packs, terms, refunds, web card (PAY-02, unchanged), history | `wallet.*` | one column | balance and packs left, history right | one column | two panes |

Nothing is removed at any size.

## Shared kit

- `ParchmentSheet`: a sheet's action buttons are at most 240 wide (§2.3) and the row is centred. At compact portrait no sheet is wide enough for the cap to bite, so phone pixels do not move; at 844x390 a lone action in a 253-wide side panel was 241.

## Deviations (recorded for review)

- **Settlement fresco height.** The spec has the fresco "full height of its pane" at expanded. The layout check's empty-column rule reads a painting as an empty column, so the fresco ends above 55% of the height and the place line and purse sit right under it; Army and Leave stay at the pane's foot.
- **Settlement at expanded has two panes, not three.** The recruit or ware card still opens as the §3.4 side panel rather than a third detail pane. The body pane is capped at a list row's 360 and the price buttons name their action ("Hire 56"); stats move into a second column so the row reads across.
- **Settlement short lists.** Beside the banner pane, a list shorter than the body (a village's two volunteers) is centred in the body's height instead of starting at the top of an empty page.
- **Market expanded has a sidebar and the listings, not three panes.** The listing card and the sell form open as sheets (§3.4) rather than as a detail pane.
- **Market Mine shows the free slots** after the listings outside compact portrait ("Free slot · List something from Sell", tap: Sell). New strings `market.freeSlot`, `market.freeSlotHint` (EN, RU).
- **Market Sell is a table of rows** (name, rarity, slot, worth, List) outside compact portrait instead of the icon grid; List does what a tap on the icon does.
- **Shop Pass keeps vertical tier rows.** The spec's horizontal tier track (compact landscape, expanded) is not built; only the season card's buttons are capped.
- **Shop page, economy down, outside compact portrait:** the tip, the Market door and the map merchants stay (they need no server; on a short landscape screen the Market door only); the state card takes the looks' place.

## Verification (b107445e, `vite preview` of the branch)

- tsc 0 errors; vitest 175 files, 2138 tests passed; vite build OK.
- **Layout check**, the family (`--scenes 'shop*,consumable-picker,market-*,village,town-*,menu-shop'`), all ten sizes, en and ru, plain and tg (28 configs × 24 screens): **LAYOUT CHECK PASSED, 0 distinct violations, 0 new, 0 pending**. Every V6-RSCR-06 allowlist entry was stale, so `scripts/layout-allowlist/V6-RSCR-06.json` is deleted.
- `--quick`: PASSED, 0 new (its 14 known findings and 24 pending screens belong to other stories).
- **Portrait parity (V6-074 method):** every element's id, kind and rect from the layout registry, v6 (cb1bb247) against this branch, the family's 24 screens × 390x844, 360x780, 320x693 × en, ru × plain, tg = 288 screens: **0 different**.
- `node scripts/regression/run.mjs <preview> --all`, both modes: 23 of 23 rows PASS (suite 4466 s).
- **Played** with real input (scripted; transcript in `play-transcript.txt`): 1280x800 keyboard and mouse (Tab: top bar → tabs → rows → Army and Leave; Enter on Hire hires; the Buy tab by mouse, its confirm, Esc; Leave with a pointer cursor; Market: Tab reads the purse, tabs, the sidebar's filters, then the listings; Enter opens the Kind sheet, Esc closes it; the wheel scrolls the listings; Sell → List → keypad → OK → List; a free slot goes to Sell; Shop: Tab reads the chip, tabs, Market door, then the looks); 768x1024 by touch (Hire, the recruit card and its shade, Rest, Market sort, Pass Claim all); Telegram 844x390 in Russian by touch (the sidebar scrolls to Find, the three-row keypad, the Shop). No page errors.
- Screenshots: 10 JPEG (q82, 2.1 MB) here; full sets in v6-shots/rscr-06.

## Open

- The ParchmentSheet action cap (≤ 240) and the stash grid's collapsed slot filters reach every family's sheets and stashes outside compact portrait; only this family ran on the full matrix (`--quick` passed; the integrator's full run covers the rest).
- The hire Undo toast lies over the banner pane's foot (Army, Leave) for its 4 s at expanded (the kit's toast position).
- Not built (deviations above): Settlement's third detail pane, Market's detail pane, the Pass's horizontal tier track.
