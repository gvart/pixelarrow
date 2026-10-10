# F-03: kit overlays, notes

Builds on [ADR-0005](../../../../design/adr/ADR-0005-ui-kit.md) (F-02). The rules are pure functions in `src/ui/mosaic/overlays.ts`, tested in `tests/overlays.test.ts` (16 tests). This file records what changed and the calls made while the user was asleep.

## What changed

- **One sheet plus one confirm (AC2, V5-029).** Every sheet and confirm goes through `openParchmentSheet`, which now keeps a per-scene overlay stack (`visibleOverlays`). A sheet opened over another hides it; a confirm stays over the sheet that asked; a second confirm replaces the first. Back, the X or a close takes the top one off and brings back what it covered. Nothing is destroyed early, so no content or action is lost (Notifications over Settings, MENU-8, now replaces it instead of stacking parchment on parchment). `confirmDialog` opens as `kind: 'confirm'`.
- **Scrim (AC1, P25, G6).** 45% basalt (`MOSAIC.page`) under every sheet and confirm. Before, the shade's fill alpha (0.55) was multiplied by its fade-in alpha, so it ended near 30% when animated and 55% under Reduce motion. It is now 45% either way.
- **One close affordance (AC1, G5).** The X is drawn as before; just before the first frame, if the content holds its own live "Close" button, the X is removed (`closeAffordance`). Decision sheets (`shadeCloses: false`) still have no X. The recruit card (`openClassCard`, F-03's `sheet.ts`) drops its footer Close and keeps the X, so Hire is full width.
- **Destructive actions (AC3, A11Y-08, P4).** The item card lays its actions out with `arrangeActions`: destructive on the left, primary on the right, the others between, and 8 UI px (16 pt) between a destructive action and the primary when they are the only two. The confirm itself has no primary next to its destructive OK (Cancel is bronze).
- **Toasts (AC4, P14).** `toast()` finds the screen's top bar (`topbar`, `header`, `battle.top` ids), its bottom bar (`tabbar`, `strip`) and every visible primary CTA (MButton `primary`/`primaryHero`/`purchase`, v3 Button `primary`/`purchase`, KeyButton `primary`), then `toastY` places it under the top bar (or above the bottom bar for `at: 'bottom'`), stepping past any CTA in its way. With no room it sits under the top bar, never over it.
- **Motion (AC5, A11Y-12).** `sheetMotion`: sheets rise 8 UI px and fade in over 200 ms, a docked sheet slides out in 150 ms ease-in; all instant under Reduce motion. A leaving sheet stops taking input at once, so a second tap cannot hit it during its exit.
- **Tab rows, one style (F-02 note 5).** `Tabs` and `UnderlineTabs` (the Kit's own top tabs and the Settings language switch) pick one label style per row with F-02's `switchLabelStyle`: Cinzel 7, 6.5, then without icons, then Inter. No row mixes faces any more, and nothing goes under 6.5 (it went to 5.5). Labels get the segment's width less 2 UI px a side, so "Русский" still fits in Cinzel at 320 px. The rows are `ownSkin`, so a parchment sheet no longer re-inks their gold labels on the dark track.
- **Legacy `Badge` (G11).** Follows `badgeText`: counts, "99+" at most, nothing for 0, and a dot instead of "!".

## Decisions

1. **Hide, don't destroy, a covered sheet.** "A second sheet replaces the first" could mean closing the first. Closing it would lose its state (scroll, a half-made choice) and break Back, which should return to it (P13). Hiding it until the top one closes does both jobs with no screen changes. A hidden sheet takes no input (Phaser skips invisible parents) and the layout check skips it.
2. **Keep a screen's footer Close and drop the X, not the other way round.** P11 says "a footer CLOSE only when the sheet has no other action". The footers that break that (cosmetic dialog, perk sheet, market card, Results inspect) belong to screen stories. Removing their Close from the kit would leave a hole in their layout. Dropping the X gives one close affordance today with nothing moved; the screen stories can then switch to X-only.
3. **Detecting "Close"** compares a control's `opts.label` with `common.close` and `mosaic.close`, the same field the scripts use to find buttons. A footer Close with another label would keep both; none exists today.
4. **Scrim colour and strength from the spec** (P25: 45% basalt), not the old 55% black. In practice it is about as dark as before, because the old one ended near 30% when animated.
5. **Toast placement by layout ids**, not by new registration calls on screens (screens are other stories' files). Battle (`battle.top`, `strip`), v4 (`topbar`, `tabbar`) and v3 (`header`) are covered. The default stays `'top'` (now under the top bar); moving every toast to the bottom as P14 says would put them over the battle command strip and the action bars. That move is for HUB-01 / BTL-01.
6. **Motion values** from interaction-patterns "Animation Standards" (in 200 / out 150 ms), not `MOTION.sheet` (240, F-01's token, still used elsewhere). A centred sheet's close stays instant, as before: an exit animation there would block taps for 150 ms, which the smoke scripts and quick players would hit.
7. **MButton has no destructive variant**, so `openParchmentSheet` action rows cannot hold one. The rule is applied where destructive actions exist in F-03's files (the item card). Screens that put Dismiss or Leave next to a primary (Hero, Army footers) are in their own stories.
8. **The design-system skill listed for this story** is about writing GDDs, not UI systems, so nothing in it applied. The other listed skills and both agents were followed.

## Shots

`before-*` show v5 at 5821511 and `after-*` show this branch. Both come from production builds (`vite preview`), DPR 2, plain insets, JPEG at or under 150 KB. The screens: Settings, the shop's cosmetic dialog with its buy confirm on top (`shop-confirm`), the Army stash item card (`army-item`), the Hero perk sheet (`hero-perk`), the recruit card (`recruit-card`) and the Kit's own top tabs (`kit-tabs`), each at 390x844, 360x780 and 320x640, in en and ru.

What to look for: the X is gone where a footer Close exists (shop, perk sheet) and the footer Close is gone from the recruit card; the Settings language row is all Cinzel at a readable size in ru; the Kit tabs are one style; the Army SHEET badge is a dot, not "!".

## Gates (2026-10-10, production build via `vite preview`)

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 77 files, 871 tests passed (`tests/overlays.test.ts`: 16 new; two of its rules were mutated and the tests failed, then restored).
- `npx vite build`: OK.
- `node scripts/layout-check.mjs`: 24 configurations x 150 screens: 6 distinct violations, all already allowlisted, **0 new**. One screen (ru plain 390x844 `online-hex-own`) failed to stage because the disk was full (ENOSPC, other agents' files); re-run alone it passed with 0 violations.
- `node scripts/smoke.mjs`: ALL PASS (45).
- `node scripts/tutorial-smoke.mjs`: PASSED (48).
