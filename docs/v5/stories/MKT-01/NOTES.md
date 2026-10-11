# MKT-01: the Market on the kit, notes

Spec: [screens-modes.md](../../../../design/ux/screens-modes.md) M-12, [interaction-patterns.md](../../../../design/ux/interaction-patterns.md) P7, P8, P11, P23, [ia.md](../../../../design/ux/ia.md) §1.3 and §5. Audit: UI.md §16 MKT-1..5. Decisions: V5-046, V5-060, V5-063, V5-068. HUB-01 NOTES: the Market Back gap.

## What changed

- **Back (AC2).** `leave()` uses `resolveBack('Market', origin)`: the screen that opened it (War army, a stash item, the Shop card once SHP-01 adds it), else the **Shop hub** (N4). Before, no origin went to the War hub.
- **Browse filters (MKT-2, P8).** Kind, Currency and Sort name their value with an icon. A tap opens a docked option sheet listing every value; the one in force is lit with a ✓. Two columns while every label keeps its icon, else one.
- **Expired listings (MKT-1).** An ended listing shows a disabled **Expired** button (lock, grey stone) whose tap says why. Its price moves to the sub-line. A live listing keeps its price button.
- **Rows (V5-060, G14).** All text is 6.5 UI px or more. A name that does not fit beside the price button takes the full row width, in as many lines as it needs, and is never cut. The facts (seller and time left; price and "you get") go under it, beside the button. They share a line when they fit, else take one line each. Rows grow from 32 to fit.
- **Time left is localized** (`fmtDuration`: "14 ч 20 мин"), in the rows and on the goods card.
- **Listing card.** Goods use a kit parchment sheet: icon, name, description, notes, Buy (primary) or Cancel listing, X only (G5). Items keep the shared item card (`sheet.ts`). Notes are one fact per line, wrapped, never cut.
- **Confirms.** Buy and Cancel listing stay `confirmDialog` (the kit's confirm overlay). **Withdraw is renamed Cancel listing** (ia.md §5).
- **Sell form (MKT-3, MKT-5).** A parchment sheet laid out from its own body width. It shows:
  - the quantity stepper (goods);
  - the currency as a segmented switch;
  - the price stepper with its bounds;
  - fee and "you get";
  - the town;
  - Cancel and List on one row.

  The value of each stepper opens a **numeric entry** (P23): the value, its bounds and "you get", ×1/×2/×5 presets of the suggested price, a keypad, Cancel / OK. OK is disabled with the bounds as its reason while the value is outside them. The town opens a list sheet when there are two or more. On short screens (320x568 in Telegram) the fields scroll between the title and the actions (P11).
- **Find…** opens a kit sheet (X only, no footer Close).

## Element and price parity (ELEMENT_MAP §1.16)

| # | Element | Now |
| --- | --- | --- |
| E239 | Top bar "Market", back | Kept; default origin Shop hub |
| E240 | Chips war gold, Drachmae | Kept |
| E241 | Tabs Browse / Mine / Sell | Kept |
| E242 | Kind / Currency / Sort | Kept; option sheets |
| E243 | Find… + clear ✕ | Kept |
| E244 | Rows → listing card → buy confirm | Kept; expired = disabled |
| E245 | Show more; empty state | Kept |
| E246 | Mine: n/max, rows with status, ✕ → confirm | Renamed: Cancel listing |
| E247 | Sell grid | Kept |
| E248 | Sell form: quantity, currency, price stepper, fee, you get, town, List | Kept; numeric entry, town list sheet |

**No trade rule or price changed.** Bounds (`priceBounds`), the suggested price (`suggestPrice`), the stepper (`priceStep`, `clampPrice`), the fee and "you get" (`marketFee`, `sellerGets`), the quantity limits and every API call are the same code. The presets are clamped to the same bounds. P-1 stays a proposal.

## Decisions (the user was asleep)

1. **The currency is a segmented switch, not two buttons with a ✓.** At 360 and 320 a ✓ icon did not fit beside "WAR GOLD" / "ЗОЛОТО ВОЙНЫ", and MButton drops an icon before it shrinks a label. That left selection by fill alone. The kit's P7 switch marks the choice with a lit block and a bronze rim at every width.
2. **Expired listings stay visible, disabled.** M-12 allows hiding or disabling them. Hiding would empty the demo Browse, since the demo data is dated 2026-10-07. A player also learns that a listing ended. The price stays in the row.
3. **Filters keep their value as the label plus an icon, with no "▾".** No down-chevron icon exists, and the text atlas can't be trusted with ▾. The sheet title names the filter. Each button's tip also says what it filters.
4. **Cancel and List always share one row.** Their labels shrink before the row wraps. A second action row made the form too tall for 320x568 in Telegram.
5. **The deep link still passes `back: { scene: 'Menu' }`.** `src/online/deeplink.ts` is not this story's file. Back from a bot-link Market therefore goes to the Campaign hub, not the Shop hub. See the follow-ups.
6. **Old strings left in place.** `market.cancel`, `market.cancelTitle`, `market.cancelled` and `market.feeNote` are in `en.army.ts`/`ru.army.ts`, which are not this story's files. They are now unused. The new strings are in `market.en.ts`/`market.ru.ts`.

## Follow-ups for other owners

| Item | Owner |
| --- | --- |
| `sceneForRoute('market')` should pass no origin (`data: {}`), so Back lands on the Shop hub (N4) | deeplink owner (F / HUB) |
| Shop page "Market" card door → `Market { back: { scene: 'Shop' } }` (MKT-4, NAV D5) | SHP-01 |
| Unused `market.cancel`, `market.cancelTitle`, `market.cancelled`, `market.feeNote` in en.army.ts / ru.army.ts | i18n cleanup (DLG-02) |
| Demo listings are all expired against today's clock (fixed `now` 2026-10-07): the Browse demo shows every row as Expired | econ demo owner (SHP-01) |
| Item card notes (`sheet.ts openItemCard`) are cut with "…" rather than wrapped; Market now wraps them first | sheet.ts owner |

## Gates

Production build via `vite preview` (2026-10-11):

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 97 files, 1209 tests passed.
- `npx vite build`: OK.
- `node scripts/layout-check.mjs --no-shots`: 24 configurations x 158 screens, **passed**, 0 new. `market-browse|text-size|*` and `market-mine|text-size|*` were removed from the allowlist. `market-goods-form`, `market-filter` and `market-price` were added to the check.
- `smoke.mjs`: ALL PASS.
- A scratch Market walk at 360x780 en (demo source) checked these and found no page errors:
  - sort sheet → Cheapest sorts ascending;
  - goods card → Buy → confirm → bought;
  - sell form → price entry "40" → OK → fee 4, you get 36 → List;
  - Mine shows the 40 gold listing → the Cancel listing confirm;
  - Back with a War army origin goes to War army; Back with no origin goes to the Shop hub.

  One check did not pass: after a buy, the demo Browse still listed the bought listing. That is the demo source's data, not the scene: the buy call succeeded and the toast showed.

## Shots

Here in `docs/v5/stories/MKT-01/`: before and after shots. For the shots the demo listings were set live. The `*-expired-*` shots use the real demo clock.

The full set was looked at for 390x844, 360x780 and 320x640 in en and ru: browse, mine, item card, goods card, item form, goods form, price entry, option sheet, buy confirm and cancel confirm. A handful is committed.
