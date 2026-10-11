# SHP-01: the Shop hub (Shop · Pass · Wallet) on the v5 kit, notes

Spec: [screens-modes.md](../../../../design/ux/screens-modes.md) M-13, [ia.md](../../../../design/ux/ia.md) §1.2, §3, §5, [screen-flow.md](../../../../design/ux/screen-flow.md) S23. Audit: UI.md SHP-1..SHP-6. Element map: ELEMENT_MAP §1.15 (E223-E238), N31, N32. Decisions: V5-029, V5-046, V5-060, V5-063, V5-068. Real money: PROPOSALS.md (proposals only; nothing priced here).

## What changed (presentation only)

- **Pass (AC1, SHP-1).** The season card (season, tier, ends in, "How to earn XP" with the XP bar, Unlock premium, Claim all) and the Free / Premium headers are **pinned**; only the track scrolls, still opened at the player's tier. A claimable cell has a real terracotta **Claim** button (22 UI px, id `pass:<tier>:<track>`) instead of green text; other cells keep their tap-to-explain. When the labels do not fit side by side the two buttons go one a row with **Claim all first**. Where the track would keep fewer than two rows under the card (360x780 and smaller) the whole page scrolls together opened at the top, so the card and Claim all are still on screen on entry (checked by script at 390, 360, 320x640 and 320x568, en and ru).
- **Market door (AC2, D5, MKT-4).** A Market card (scales, "Market", what it is, chevron) under the tip on the Shop page opens `Market { back: { scene: 'Shop', data: { tab: 'shop' } } }`; Market's Back returns to the Shop page (checked by touch at the four sizes, en and ru).
- **Wallet (SHP-3).** Pack cards are two lines (amount with its coin; "Drachmae" and the bonus) with the **Best value tag inside the card**. Every Stars button renders at **one label size** with the star on all or none: two a row when every label fits a half-width button at its first size (390), else one a row with full-width buttons (360, 320). The bonus is never dropped (before, it vanished when the chip had under 24 px).
- **Shop page.** Look cards on the kit (`LookCard`): whole name in ink at 6.5+, a locked look's name in ink with a **lock chip** naming the source, on two lines where needed (SHP-5). The look sheet is the parchment sheet with **X only** and the price once, on its button (SHP-2). The tip names the Duels **Armoury** (renamed, ia.md §5).
- **Painted fresco (SHP-5).** ART-004 shipped through the pipeline (ASSET_LOG "SHP-01 promotion").
- **Loading (SHP-4).** A breathing skeleton of cards with "Opening the shop..." (the chip shows "…", not "-").
- **Sheets.** "Need n Dr" and "How to earn XP" moved to the parchment sheet, X only, text 7. The consumable picker drops its redundant X (it has No consumable / Use), so its title keeps 6.5 at 320x568 in Telegram.
- **Hub root.** `ShopScene` no longer keeps a `back` (HUB-01 made hubs roots centrally; its follow-up asked the owner to delete `leave`/`backTo`).

## Parity proof (no product, price or payment change)

- `tests/shop-parity.before.json` was captured from the running game **before** any change (v5 @ 5a17ad9, demo economy, en): 27 look cards (name + state/price), the action of each of the 27 look sheets, the 4 pack buttons (`wallet.pack.<id>`, "100 Stars" … "1000 Stars"), the pass buttons ("Need 500 Dr", "Claim all 3"), plus the source of the 10 purchase / claim / payment methods (`fetchAll`, `equipCosmetic`, `askBuy`, `buy`, `fail`, `claim`, `claimAll`, `unlockPremium`, `askPack`, `buyPack`).
- `tests/shopParity.test.ts` (6 tests) holds the rebuilt Shop to it: same looks in the same order with the same states and prices; same sheet action and price for each look; same packs for the same Stars, one best value; same premium price and claim count; every payment method byte for byte; the Stars confirmation call unchanged. Watched fail: a +1 Star mutation in `packOffers` fails the pack test.
- The same capture run on the rebuilt Shop differs from the before capture in exactly two places: the new Market card, and `supporter_banner`'s sheet (below).

## Decisions (the user was asleep)

1. **A not-for-sale legacy look has no action.** Before, `supporter_banner` (legacy Stars, earned nowhere) showed an "Open Pass" button that did nothing. Its sheet now has only the X. No purchase action changed; the test pins this one difference.
2. **Pinned only where the track keeps two rows**; otherwise the page scrolls as one, opened at the top. Pinning a 100 px card over a one-row track at 320x568 would leave the track unusable.
3. **"Pass XP (tap: how to earn it)" became "How to earn XP"** (new `shop.v5.xpHow`): the old line was cut at 360 and 320.
4. **Kept from v3:** `confirmPurchase` (the real-money confirmation), `flyReward`, `InfoChip`, `addClaimGlow`. They are the payment flow or its feedback; F-07 can move them when it retires v3. Shop no longer imports `openSheet` or `openModal`.
5. **New `shop.v5.*` keys instead of editing other files' strings** (`shop.sit.shop` says "Duels shop" and lives in `strat.*.ts`): `shop.v5.tip` names the Armoury.
6. **A demo Market from a demo Shop is not demo.** Market resets the economy source from its own data; the door passes only `back`. Real players are unaffected.

## Element map (§1.15)

E223 hub shell (root, no back: HUB-01), E224 Drachmae chip → Wallet (on Pass on short screens it sits under the card), E225 fresco (painted), E226 tabs with the claim badge, E227 states (loading is a skeleton; outside/offline/closed/error + Retry unchanged), E228 tip, E229 look grids (Equipped/Owned/price/locked), E230 look sheet (X only), E231 consumables note, E232 season card (pinned), E233 Free/Premium headers (pinned), E234 tier rows (Claim buttons), E235 balance + overdrawn warning + note, E236 4 packs → confirm → toasts, E237 legal text, Terms/Refunds, History (30 rows), E238 buy confirm / unlock premium / need Drachmae → Wallet: all kept. N31 Market card added. N32 "Open in Telegram" on the outside state is unchanged (`addEconState`).

## Layout (V5-060)

Cleared: `shop-shop|text-size|*`, `shop-pass|text-size|*`, `shop-wallet|text-size|*`, `consumable-picker|text-size|*`.

## Gates (2026-10-11, production build via `vite preview`)

- `npx tsc --noEmit`: clean. `npx vitest run`: 98 files, 1215 tests passed (6 new in `shopParity.test.ts`). `npx vite build`: OK.
- `node scripts/layout-check.mjs <url> --no-shots`: 24 configurations x 155 screens, **passed**, 734 distinct violations, 0 new.
- `smoke.mjs`, `fullscreen-smoke.mjs`, `online-smoke.mjs` (asserts the Shop's text): ALL PASS.

## Follow-ups for other owners

| Item | Owner |
| --- | --- |
| `OnlineArmyScene` still passes `back` to Shop (ignored; hubs are roots) | WAR-01 |
| `modeArt` "shop" pixel stall is unused by the Shop now | F-07 / art cleanup |
| `shop.sit.shop` (strat.*.ts) still says "Duels shop"; unused by the Shop now | i18n cleanup |
| Move `confirmPurchase`, `flyReward`, `InfoChip`, `addClaimGlow` out of v3 | F-07 |
| Market opened from the Shop in a demo session uses the live source | MKT-01 (optional) |

## Shots

`docs/v5/shots/SHP-01/`: before and after of Shop, Pass and Wallet at 390x844, 360x780 and 320x640, en and ru (a handful kept as JPEG).
