# UI iteration 2: plan and report

Iteration 1 (PR #26) gave the menus a hierarchy, one primary action per
screen and one icon per meaning. This iteration fixes what was still wrong,
closes UX gaps, adds game feel and brings the remaining screens to the same
level. Rules unchanged: Phaser + TypeScript, the v3 component layer
(`src/ui/v3.ts`), Telegram BackButton as the only Back, motion through
`src/ui/motion.ts`, no change to game rules or economy numbers.

## Plan

Phases, each leaving the game playable (typecheck, unit tests, layout check):

1. **P0 bugs.** Root cause first, a unit test where the logic is pure
   (`tests/`), then the screen. Gear compare by slot *and* weapon class on a
   hero who would use it; mode-specific search copy taken from the
   matchmaking windows; `wrapText` never splits a word; campaign gold vs war
   gold named and drawn apart; reward copy as "Win +15 · Loss +5 Glory";
   the two rosters labelled; scroll regions start below fixed content with
   edge fades in the page colour.
2. **P1 UX.** Component-level changes first, so every screen gets them:
   compact `ScreenHeader` with resource chips on the right and an active
   state for its actions; one `MODE_ICON` table; neutral dismiss ×;
   `ToggleChip` (filled + check vs outline); `addLegend` / tap tips for
   symbols; documented tab hierarchy. Then the screens: Home, Ladder and
   floor sheet, Arena and search, Team, Shop / Pass / Wallet, Hero sheet.
3. **P2 game feel.** Materials in `src/art/smoothUi.ts` (grain, bevel,
   inner shadow, highlight edge; lacquered shield primary), pixel unit
   sprites in roster rows, chest sprites with states, short illustrated mode
   headers with idle animation, filled empty space, motion checklist.
4. **Untouched screens.** Settings, hero Gear / Perks / Skills, Duels shop
   Gear / Sell, leaderboards, Online, Beasts, results, campaign map, town
   market and merchant, on the same components.
5. **Report.** Bug list (issue, root cause, fix, test), before / after
   screenshots at 390 × 844.

## Bug report

Every P0 item, plus the bugs found on the way. "Test" is the automated
check that fails on the old code.

| # | Issue | Root cause | Fix | Test |
| --- | --- | --- | --- | --- |
| 1 | Duels shop compared the Dory spear "vs Sakarbaal's Composite bow" | `offerSummary` took the highest-value item in the same *slot* across the whole team, and every weapon class shares the `weapon` slot | `heroUses` / `compareCandidates` (src/game/gear.ts): weapons only against heroes whose class kit or hand uses that weapon kind (same kind first), shields only beside a one-handed weapon; the line names hero, item and rarity ("vs Doros's Dory spear (Common)"); "Compare with" is a sheet (best user, or one hero; a hero who would not use an item says "Not for X" and falls back) | `tests/duel.test.ts` "shop compare: same slot and weapon class" (5 cases) |
| 2 | Unranked search said "A close rating first; the range widens" | One string for both queues | Copy per mode, numbers from `RANKED.window`. Note: unranked *does* pair by hidden rating, with a wider window that opens to anyone after 30 s, so "matching by team strength" would also have been wrong; the copy says "no rating at stake: a wide range of players, anyone after 0:30" | `tests/ui.test.ts` (every key in both languages with the same params); copy only, no logic changed |
| 3 | "15 Drachm / ae" in the pass | `wrapText` broke any word wider than the line character by character | `wrapText` never splits a word (a lone word too wide ends in "…" and sets `truncated`); pass cards show a big quantity and a short noun on up to two lines | `tests/ui.test.ts` "never breaks inside a word" |
| 4 | "war gold" in the pass, "gold" on Home | Not one currency: campaign gold (`SaveData.gold`) and the war season's gold (`profile.resources.gold`) are separate balances that shared the coin icon and, in most online screens, the bare word "gold" | War gold is its own resource: icon (a bronze stater stamped with a helmet), colour, font, and the name "war gold" on every online screen (merchants, market, war map, army, pass); the campaign keeps "gold" | `tests/tokens.test.ts` (no two resources share an icon or a colour) |
| 5 | "a win pays 15 Glory, a loss 5" | Unsigned numbers in a sentence; verified in `matchPay`: a loss *pays* +5 (ranked +10) | `fmtSigned` and "Win +15 · Loss +5 Glory" everywhere (Live card, Unranked tip, ranked pay line) | `tests/format.test.ts` fmtSigned |
| 6 | Home "4 men" vs Duels "9 heroes" | Not a bug: the campaign warband and the Duels army are separate rosters | Labelled: Home "Warband N" (tip: Duels have their own heroes), Team "Duel heroes: N · Your duel army, separate from the campaign warband" | none (copy) |
| 7a | Arena: the season timer looked cut under the Ladder / Arena switch | `scrollPage` (and the hero sheet) called `addScrollHint` without a colour, so the edge fades used the legacy page stone, invisible on the v3 background: scrolled content met the switch with a hard cut | Fades in `SURFACE.bg` | layout check (CI) |
| 7b | Floor sheet: the first enemy row cut under the stars rule | The list height assumed 28 px rows while the list laid them at 26 + 3 gap: every list overflowed by a few px and scrolled with no boundary | The list is sized to its real pitch, starts under an "Enemy army · N" heading and hairline, fades in the sheet's colour | layout check (CI) |
| 8 | New: "New campaign" reset every setting, analytics back on for players who had opted out | `state.reset()` rebuilt settings from defaults and kept only the tutorial and coach marks | `carrySettings`: every player preference carries over | `tests/settings.test.ts` |
| 9 | New: the pass XP numbers were not shown anywhere | — | The XP bar opens "How pass XP is earned"; the client mirror `PASS_XP` is pinned to the server catalogue | `tests/economy.test.ts` "matches the server catalogue" |
| 10 | New: "Searching…" blocked navigation with an error toast | Toast tone `bad` for a normal state | `info` tone, with the reason | none (tone) |

Delete team was already confirmed (`confirmDialog`, destructive); New
campaign and Dismiss now are too (Dismiss moved to the hero sheet, bench
heroes only, never the last).

## Decisions

- **War gold vs gold.** Two balances, two names and icons (see bug 4), not one
  name for both.
- **Search navigation** stays locked inside Duels while queued: Cancel is
  always on the strip, the header and tabs say why on tap (an info toast). A
  pill that follows the player across scenes would need the queue to outlive
  the Duels scene (it lives there today); left for a later change.
- **New campaign** moved from Home to Settings → Account (a quiet destructive
  row). Without a save, Home's primary reads "Begin the march".
- **Unranked copy** describes the real matchmaking (bug 2).
- **Raids and their defence** are one mode: one icon (the torch).
- **The `--dpr` option** of the layout check is for screenshots only; the
  rules are calibrated at 1× (CI unchanged).

## What changed, by screen

- **Global:** compact header with chips in the band, "you are here" on header
  actions, `MODE_ICON`, neutral × on tips, `ToggleChip`, legends, the tab
  rule (docs/UI_KIT.md "Navigation"), lacquer / brushed bronze / mottled
  stone / planks materials, mode banners, pixel chests and portraits.
- **Home:** Warband chip, New campaign in Settings, Begin the march.
- **Ladder:** compact next-floor card, star slots, replay Glory, chest states
  with previews and opening, floor sheet with cap tick / cross and portraits.
- **Arena:** merged locked card, signed pay lines, search page, leaderboard
  medals and crests.
- **Team:** roster label, Symbols legend, toggle chips, cap note never cut,
  Dismiss on the hero sheet.
- **Duels shop:** comparison fix and picker, Sell prices on cells, quiet
  filters.
- **Shop / Pass / Wallet:** owned / equipped / earn-only states with routes,
  "Need N Dr" to a wallet sheet, you / next tier markers, premium vs tier
  locks, short reward cards, Nothing to claim, pass XP explainer, Best value.
- **Hero sheet:** power in the header, pager on the stage, compact attribute
  cards, "Next point at Lv N", Skills and Perks as medallions with learned /
  available / locked states.
- **Settings:** section icons, grouped rows, New campaign.
- **Town market, merchant, market:** action icons that are not resources,
  stats on their own line, the merchant on v3 with the market banner.
- **Results:** a bronze plaque between laurel branches for a victory
  (terracotta stays for the next action), Spoils with the chest icon.
- **Beasts:** the cave banner, hints on up to three lines.

## Motion checklist

All through `src/ui/motion.ts` (instant under Settings → Reduce motion, which
defaults to the system's `prefers-reduced-motion`); tweens on existing
objects and timers, no object created per frame, textures drawn once and
cached.

| Motion | Where |
| --- | --- |
| Press-down | `Button`, `Tile`, `ToggleChip` (scale 0.97, face drop, haptic) |
| Sliding tab indicator | `Tabs`, `UnderlineTabs` |
| Sheet slide-up | `openSheet` |
| Count-up | `InfoChip.setValue` (Glory, Drachmae), chest Glory |
| Reward fly-to-chip | pass Drachmae, chest Glory (held until the popup closes) |
| Chest open | shake, open on gold, sparks (`openChestReward`) |
| Ready chest | hop (`hop`) and glow |
| Current floor | pulsing glow |
| Idle | torches flicker, pennants flutter (`idleFrames`) |
| Search | widening rings, breathing arena icon |
