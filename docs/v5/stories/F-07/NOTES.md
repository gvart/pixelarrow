# F-07: retire the v3 layer and the inkify shim, notes

Story: docs/v5/plan/STORIES.md F-07 (W21). It also carries the Director's cleanup follow-ups. I did this while the user was asleep. The calls I made are listed under Decisions.

## What was deleted

- **`src/ui/v3.ts`** (1,040 lines). The parts still in use moved into the kit, unchanged in look:
  - `Toggle`, `Stepper` → `src/ui/mosaic/toggles.ts`
  - `purchaseButton`, `confirmPurchase` → `src/ui/mosaic/purchase.ts` (a docked parchment sheet that draws its ink directly)
  - `flyReward`, `addClaimGlow` → `src/ui/mosaic/rewardFx.ts` (the fly target is now a `FlyTarget` type, not `InfoChip`)
  - `addMedallion` → `src/ui/mosaic/medallion.ts`
  - `addSwipe` → `src/ui/mosaic/Pager.ts`
  - `tipHidden` → `src/ui/mosaic/tips.ts`

  Everything else went with the file: `ScreenHeader`, `InfoChip`, `resourceChip`, `layChips`, the v3 `addTipLine`, `ProgressBar`, `addLocked`, `Pager`, `Tile`, `ToggleChip`, `openLegend`, `openSheet`, `textW` and `hitBox`. None of them had a caller outside the Kit's V3 page.
- **`src/ui/inkSkin.ts`** (182 lines). `openModal` and `openParchmentSheet` no longer re-ink what goes in them. The `skin` option is gone, and every sheet draws ink on parchment itself.
- **Kit V3 page (KIT-1).** Removed from `KitScene`, `kit/catalog.ts` and the layout check (`kit-v3`). The "Legacy bottom sheet" overlay sample and the Parts page's `openSheet` button are gone too.
- **`openBeastInfo`** (the old dark v3 beast modal, `beastInfo.ts`). It had no caller. With it went `V3_INK`, the `inset` well path and the `sheet ?` branches.
- **Follow-ups:** `openJournalSheet` (eventCard.ts, dead since WLD-02) and its `none` entry in `tests/regression/sheetFixtures.test.ts`; `DUEL_RULES.ticketTtlMs` (never read: the ladder uses `LADDER_TICKET_TTL_MS`, async duels use `ASYNC.ticketTtlMs`); `groupDigits` and `goldText`.

`grep -r "ui/v3\|inkSkin\|inkify" src` returns nothing.

## What was inked (the content the shim used to re-ink)

To find every remap, I first logged each one inkify made across all 196 layout-check screens. Then I converted each spot at its source:

- `sheet.ts`: the item card, its rule lines and the class card use `pInk`, `pMuted`, `pBad`, `pGood` and `pSec`, plus the rarity ink fonts (new `rarityInkKey`).
- `widgets.ts`: StatBar, the CountUp number, and the confirm dialog's body text. The `ownSkin` marks on `Tabs` and `UnderlineTabs` are gone.
- `settings.ts` and `notifySettings.ts`: section heads in `hInk`, rows on `parchmentWell`, ink labels.
- `ResultsScene.inspect`: the spoils inspector (2 lines plus 1 Label font).
- **Scroll-hint fades.** The shim used to turn the dark edge fade into a parchment one. Now `openParchmentSheet` marks its container (`markSurface`), and `addScrollHint` / `ScrollList` fade into the surface they sit in (`surfaceUnder`) unless the caller passes a colour.
- **Item card notes**: callers now pass ink fonts (see below).

### One-line changes in other scenes

| File | Change |
| --- | --- |
| `src/scenes/BattleScene.ts:4622` (openGroups) | Groups legend `font: 'dim'` → `'pMuted'`. The only change in BattleScene, approved by the Director. |
| `src/scenes/ShopScene.ts:8, 82, 192` | Import from `ui/mosaic`; `InfoChip` → `FlyTarget` (type only) |
| `src/scenes/HeroScene.ts:8` | Import from `ui/mosaic` |
| `src/scenes/MarketScene.ts:509` | Item-card note font `'red'` → `'pBad'` |
| `src/scenes/duel/DuelScene.ts:2915` | Note font `'gold'` → `'pGold'` |
| `src/scenes/online/MerchantScene.ts:291` | Note font `'dim'` → `'pMuted'` |
| `src/scenes/ResultsScene.ts` (inspect) | Three fonts to ink |
| `src/scenes/SettlementScene.ts:28, 599` | `goldText` → `fmtCount` |

## Director follow-ups

1. **`openJournalSheet` deleted.** See above.
2. **One number formatter.** `fmtCount(n, lang = lang())` now lives in `src/i18n/numbers.ts`. DUE-01's version in `hubLayout.ts` and EC-01's `groupDigits` in `economy.ts` are gone, and every caller imports the new one.
   - The rules are DUE-01's: Russian groups with a space from five digits up and never writes a comma. English uses commas.
   - EC-01 used U+00A0, but **the UI bitmap fonts have no glyph for it**, so it drew as nothing ("12450"; the forge sheets were affected too). The formatter uses a plain space. `tests/duelHub.test.ts` now checks that it writes only characters the fonts carry.
3. **The formatter is used in:**
   - **MChip:** a number, or a string of digits, is grouped (`chipValue`), and `setValue` counts in the grouped form. `chipText` still shortens a grouped number that doesn't fit (12K) instead of cutting it. This covers the world, camp, army and town gold chips (`12 450`).
   - **WAR-01 boss sheet:** `beastPanel.ts`'s `num` no longer forces `en-US`, so RU shows `12 202 / 19 680`, not `12,202`.
   - **Item card:** the worth line, and the sell, salvage and confirm texts from `saleText`.
4. **Item card stats at 320 (RU).** The stats grid stays in two columns while every name fits beside its value. If any name doesn't fit, all stats go in one column, so no name is ever cut ("Прочность", "Темп атаки"). One column makes the card taller, and the card's scroll area already handles that. See `ru-320-item-card(-before).jpg`.
5. **En dash.** `boss.segment` (RU): "Каждый набег – бой на {s} с …".
6. **Unused i18n keys removed:** `wld.lairTap`; `v3.prev`, `v3.next`, `v3.pager`, `v3.locked`, `v3.unlocksAt`, `v3.needMore`, `v3.on` and `v3.off`; `res.tip.{wargold, gold, gold.campaign, gold.war, glory, drachmae, power, wins, xp}`. Each was removed from both en and ru.
   - I checked each key for a literal reference in `src`, `tests`, `scripts` and `server/src`, and for a template prefix.
   - The `res.tip.*` keys were reachable only through v3's `res.tip.${res}`.
   - The `res.<id>` names stay: `res.${k}` is still built dynamically in several places.

### Also done (from DLG-02's list)

- The duel queue's socket error now goes through `apiErrorText` (`DuelScene.ts:1772`).
- The merchant's API error now goes through `errorText` (`MerchantScene.ts:341`).
- `ui/econ/demo.ts` is left as it is: it runs on the demo path only.

## Decisions

1. **Move, don't rewrite.** The surviving v3 parts already drew for parchment (Toggle, Stepper) or are surface-neutral (medallion, glow, swipe), so they moved as they were. The goal was "every screen screenshot matches its pre-change shot".
2. **`openModal` stays** as a thin alias of `openParchmentSheet`, because BattleScene imports it and I couldn't touch BattleScene beyond the one approved token. It no longer skins anything.
3. **Scroll fades follow the surface**, so the shim's fade remap isn't needed. Sheets that never had `skin`, such as Camp's and Online's lists inside sheets, now also fade into parchment instead of dark stone. That fixes a small existing mismatch.
4. **One column for the item card stats when needed**, rather than two-line names. A wrapped name would desync the two columns' rows.
5. **A plain space in RU numbers.** The alternative was adding U+00A0 to three generated font metric tables, the atlas and all three wrap functions. Every count it affects sits in a chip or a one-line label.

## Visual parity (AC3)

**Method:**

- I built `v5` (with FL-01) and this branch, then took layout-check screenshots of all 196 screens at en 390x844 for both builds and pixel-diffed them (threshold: more than 24 in any channel).
- **Real differences:**
  - The Kit page list and the Overlays page: the V3 page and the "Legacy bottom sheet" row are gone, and the pager reads n/11.
  - The settings sheet: before the v5 merge it differed by FL-01's new rows. After the merge it matches.
- Every other difference was animation timing in battles, the tutorial, the camp and the war map. The large ones were spot-checked and their static UI matches.
- `en-390-sheets-before-after.jpg` shows the purchase confirm, the item card and a docked sheet before and after: identical apart from the list row shift.

## Shots

DPR 2, production build (`vite preview`):

- `ru-320-world-gold.jpg`: gold chip `12 450`
- `ru-320-boss-sheet.jpg`: HP `12 202 / 19 680`, en dash; `-before` showed `12,202`
- `ru-320-item-card.jpg`: one-column stats, "Прочность" whole; `-before` showed "Прочн…"
- `en-390-sheets-before-after.jpg`: shared sheets unchanged

## Gates (2026-10-12)

Run on the branch with v5 (FL-01, batch 32) merged in. Production build (`vite preview`, port 8081):

- `npx tsc --noEmit`: clean. Server `tsc --noEmit`: clean.
- `npx vitest run`: 120 files, 1439 tests passed.
- `npx vite build`: OK.
- `node scripts/layout-check.mjs http://localhost:8081/ --no-shots`: all 24 configs x 196 screens, **0 new** (45 distinct, all allowlisted). The "seen once" battle overlaps at TG 320x568 are timing and not in files this story touched.
- `scripts/smoke.mjs`: ALL PASS (46). `duel-smoke.mjs`: ALL PASS (53). `online-smoke.mjs`: ALL PASS (25).
- `npm run regression`: PASS (hub-flows, battle-kinds, sheet-layout, replay-hash).

Skills applied: tech-debt (scan for the dead code above; register not written, F-07 deletes it instead), code-review (self-review of the diff), phaser-core (scene and container lifecycles: surfaces marked on the sheet container, no per-instance patching left). Agents: lead-programmer, ui-programmer.
