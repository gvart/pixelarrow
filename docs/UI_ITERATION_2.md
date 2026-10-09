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
