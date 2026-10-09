# UI v3: what changed, the bugs found and fixed

Companion to docs/UI_V3.md (the plan and rules) and docs/UI_KIT.md ("v3
components"). Before / after screenshots at 390 × 844 inside a full-screen
Telegram (safe-area insets top 59 + 46, bottom 34) are in
`docs/screenshots/v3/` (before on the left).

## Render approach and icon approach

- Menus are drawn **inside Phaser on the canvas** (Container-based kit,
  Canvas 2D surfaces cached as textures, BitmapText from Inter / Cormorant SC
  at device density). v3 keeps that: no DOM layer, no new framework, no plugin.
- Icons: **approach (a)**, the existing smooth "material" family of
  `src/art/iconStyle.ts` (24-unit box, ink outline, top-left light, full /
  light / dim looks). 24 new icons in `src/art/uiIcons.ts`.

## Bugs (audit section B and the ones found on the way)

| # | Symptom | Root cause | Fix | Test |
| --- | --- | --- | --- | --- |
| 1 | The wallet showed the red "Balance below zero after a refund" at exactly 0 Drachmae. | The screen read `WalletInfo.canSpend` as "overdrawn", but the server sets `canSpend = drachmae > 0`, so it is also false at 0 (a normal empty wallet). | `walletOverdrawn()` (`src/game/economy.ts`): the warning only when `drachmae < 0`. | `tests/economy.test.ts` "wallet warning" |
| 2 | Home showed 57 gold, the Shop header 120 gold. | Two different balances under one name and icon: the offline campaign's `SaveData.gold` (Home) and the online war season's `online_profiles.gold` (the Shop header; the season pass pays into it). The Shop spends neither. | The Shop header shows only Drachmae (the one currency it spends); pass rewards say "war gold"; the Home chip explains "Campaign gold", and the resource tips tell the two apart. No game data changed. | Display only (no test infra for scene text); covered by the layout check's screen staging. |
| 3 | Home "0 won", Duels "3 won of 4", first steps "Win a battle". | Three counters with one word: campaign battles won (`SaveData.won`, only campaign battles count), a duel record string (`duels.record`, no longer shown), and the campaign first-steps check. | Labels say what they count: "N won" with the tip "Campaign battles won / fought: x of y", "Win a campaign battle"; Duels shows the duel level and its XP instead of a record. | Copy only. |
| 4 | The Duels tile said "ranked · fight other players" while ranked is locked until duel level 5. | Static copy. | "ladder now · PvP from duel level 5" (from `DUEL_RULES.rankedLevel`), on the tile's long-press. | Copy only. |
| 5 | Shop: "Gear comes from battles"; hero stash: "buy gear in a town"; the Duels shop sells gear for Glory. | Copy written per screen. | One story everywhere: the main shop sells looks and the pass only; gear comes from battles, town markets, war merchants and the Duels shop. Wallet copy no longer promises consumables there. | Copy only. |
| 6 | Arena "68/150 pts", Ladder "68/72 pts", unexplained. | Both right: the Arena (and defence) cap is 150, each floor has its own. | "Your team 68 pts · this floor allows 72" / "the Arena allows 150", the floor sheet shows your team, the enemy and the cap side by side, and the Team view says which cap is which. | Copy only. |
| 7 | The duel level could disagree with itself on one screen. | `DuelScene` read the server's `profile.level` in some places and `levelProgress(profile.xp).level` in others; the demo's `setXp` did not update `level`. | One source (the XP) everywhere; `setXp` keeps `level` in step. | `tests/duel.test.ts` "the duel level has one source" |
| 8 | Perks of a later level said "No perk point" instead of when they open. | `perkBlocker` checked the free point before the level requirement. | Reordered: level, then the previous perk, then the free point (callers only test for null, so rules are unchanged). The tab shows "Unlocks at Lv 8". | `tests/abilities.test.ts` |
| 9 | Shop deltas "Blow time 1.3 ▼ +0.2": a down arrow with a plus. | The arrow encoded the verdict (better / worse), not the direction. | `deltaParts()` (`src/duel/rules.ts`): arrow = the number's direction, colour = the verdict, units and "slower" / "faster" for times ("▲ +0.2 s slower" in red). | `tests/duel.test.ts` "shop delta display" |
| 10 | "Aim +5% ▲ +5%" repeated itself. | Against an item without that stat the delta equals the value. | Such lines say "new" (`OfferStatLine.isNew`). Deltas now name what they compare with ("vs Timon's composite bow") and a picker compares with any hero. | `tests/duel.test.ts` "compares against one picked hero" |
| 11 | (found) The Pass page froze the game on a 320 px phone. | `wrapText` looped forever when the width was narrower than one glyph. | It always takes at least one character per line. | `tests/ui.test.ts` "wrapText on tiny widths" |
| 12 | (found) Every scrolling list redrew its scrollbar and chevrons every frame. | `addScrollHint` drew on the scene's update. | Edge fades and a thumb that change only on scroll (a 250 ms timer fades the thumb). | Behavioural (no frame-time test). |
| 13 | (found) A disabled button's reason toasted with the error style. | The kit routed every disabled tap to `toast(..., 'bad')`. | Reasons are information (`'info'`); red is kept for real problems. | Visual. |

No gameplay or economy numbers were changed. Fix 8 only changes which reason
is shown; every rule that decides whether a perk may be learned is the same.

## Acceptance criteria

| Criterion | Where |
| --- | --- |
| A unique icon per resource; real money distinct and confirmed | `RESOURCES` + `tests/tokens.test.ts`; `purchaseButton` (blue, Telegram star, "N Stars") + `confirmPurchase` on every pack |
| No contradictory numbers | bugs 2, 3, 6, 7 |
| Every disabled / locked element says why | kit buttons (tap or long-press), `addLocked`, "Need 12 more Glory", "Unlocks at Lv 8", lock reasons in neutral text |
| One primary per screen | Home (Continue), Ladder (Fight floor), Arena (Play unranked / Find match), Team (Recruit), Hero (Confirm while points wait), Shop pages (Claim all / none) |
| No truncated critical text at 360 px; nothing under scroll hints | layout check (`text-overflow`, `clipped`); wrapping instead of "…" for hints, defence rows, perk states, cosmetic names; edge fades instead of chevrons |
| Two tab levels max, obvious selection | segmented `Tabs` (sliding lit thumb) + `UnderlineTabs` (sliding gold bar) |
| WCAG AA | `tests/tokens.test.ts` over every text / surface pair |
| Tap targets ≥ 44 pt | layout check `touch-size` |
| No duplicate Back | the strip drops Back inside Telegram; `ScreenHeader` draws an arrow only outside it; fullscreen smoke |
| Smooth, off under reduced motion | `src/ui/motion.ts`; Settings → Reduce motion (default from the system) |
| Gameplay, saves, purchases keep working | unit tests, smoke, online smoke (Stars flow), fullscreen smoke |

## Before / after (390 × 844, Telegram full screen)

| Screen | Before / after |
| --- | --- |
| menu | ![menu](screenshots/v3/menu.png) |
| menu-settings | ![menu-settings](screenshots/v3/menu-settings.png) |
| duel-ladder | ![duel-ladder](screenshots/v3/duel-ladder.png) |
| duel-floor | ![duel-floor](screenshots/v3/duel-floor.png) |
| duel-ranked-locked | ![duel-ranked-locked](screenshots/v3/duel-ranked-locked.png) |
| duel-ranked | ![duel-ranked](screenshots/v3/duel-ranked.png) |
| duel-raid | ![duel-raid](screenshots/v3/duel-raid.png) |
| duel-board-live | ![duel-board-live](screenshots/v3/duel-board-live.png) |
| duel-team | ![duel-team](screenshots/v3/duel-team.png) |
| duel-shop-gear | ![duel-shop-gear](screenshots/v3/duel-shop-gear.png) |
| duel-shop-offers | ![duel-shop-offers](screenshots/v3/duel-shop-offers.png) |
| hero | ![hero](screenshots/v3/hero.png) |
| hero-perks | ![hero-perks](screenshots/v3/hero-perks.png) |
| hero-skills | ![hero-skills](screenshots/v3/hero-skills.png) |
| shop-shop | ![shop-shop](screenshots/v3/shop-shop.png) |
| shop-pass | ![shop-pass](screenshots/v3/shop-pass.png) |
| shop-wallet | ![shop-wallet](screenshots/v3/shop-wallet.png) |
| trial | ![trial](screenshots/v3/trial.png) |
| army | ![army](screenshots/v3/army.png) |

## Screens

Home, Duels (Ladder, floor sheet, chests, Arena, raids, defence, raid log,
leaderboards, Team, recruit, Shop Today / Gear / Sell, level sheet), Hero sheet
(Stats, Gear, Perks, Skills), Army roster, Shop / Pass / Wallet, Settings and
Notifications, Beasts, Online and economy states, all modals. The battle HUD is
unchanged (out of scope); it gets the kit's press feedback for free.

## Not done / follow-ups

- World map, settlements, camp and the online war map keep the Strategos
  situation bar (they were out of this pass's screen list); they already get
  the new buttons, tabs, fades, modals and no duplicate Back.
- Item cards (`openItemCard`) keep their layout ("1.3 > 1.5  +0.2 s slower";
  they never had the arrow contradiction).
- Verified here: typecheck, 419 unit tests, the build, the layout check on all
  140 screens at 390 × 844 (EN, plain and Telegram), 320 × 568 (RU, Telegram),
  360 × 780 (RU, plain and Telegram) with zero violations, and the smoke suites
  (campaign, full-screen Telegram navigation, online + Stars flow, tutorial,
  audio, duels) all passing. CI's full 5 sizes × 2 languages × 2 insets matrix
  was not run here (about 3.5 h on this machine); the server tests were not
  run either (no server code changed).
