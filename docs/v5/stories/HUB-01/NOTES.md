# HUB-01: tab bar and the Back contract, notes

The contract is [ia.md](../../../../design/ux/ia.md) §1, §2 and §6 and [screen-flow.md](../../../../design/ux/screen-flow.md) §3 and §5. This file records what changed and the calls made while the user was asleep.

## What changed

- **Hubs are roots (AC1, NAV D12).** `BaseScene.screen()` passes its options through `screenOpts()` (`src/platform/nav.ts`). A tab hub (Menu, Duel, Online, Codex, Shop: `TAB_ROOTS`) always registers with no Back, whatever it asks for. Before this:
  - War hub Back went to the Campaign hub.
  - Duels hub Back went to the Campaign hub.
  - Shop opened through a door (War army Shop, the `wallet` deep link) had a Back to that door.

  Telegram now shows Close on every hub, also when a door switched to it. What is open on a hub still closes with Back first, because those things are layers.
- **Hub sub-views declare their Back (AC2).** The Duels scene draws Team, Armoury, Board and Raid picks in place. `hubView()` lets the shells say which kind of view is on screen:
  - `addSubShell({ back })` sets Back (Telegram's button) to the view's own arrow.
  - A hub's `TabBar` makes the view a root again.

  Only a tab-root scene is affected, so the Kit gallery's demo tab bar and sub-shell change nothing. Duels Back during a search is now the sub-view's `up()`, which refuses with "Cancel the search first". Before, it left for the Menu and dropped the search.
- **BottomPanel is a nav layer.** The War hex panel and the beast info sheet now close with Back and Telegram's BackButton, the same as their X (ia.md §6, optional sheet). This keeps "a modal or selection closes first" on the War hub (screen-flow S18) now that the hub has no Back of its own.
- **The contract as data (AC2, AC3).** `BACK_RULES` gives every screen's Back by scene key:
  - `root`: a tab hub.
  - `parent`: a single-parent screen.
  - `origin`: a multi-door screen, with a fallback.
  - `battle`: the battle menu.
  - `none`: Boot.

  `resolveBack(scene, origin)` resolves a target. `tests/nav.test.ts` parses screen-flow.md and checks two things. All 24 screens of the register have a rule, and each rule matches the screen's Back column. It also checks that Back reaches a tab root from every screen without a loop (no dead ends, §5).
- **Tab labels (F-02 decision 2, P7, MENU-3).** `fitTabLabels` tries the i18n short forms in Cinzel before it falls back to Inter. English reads **MARCH** for CAMPAIGN at 360 and 320 px, and CAMPAIGN at 390. Russian has no shorter word than "Поход", so it keeps F-02's behaviour: Cinzel down to 360, Inter at 320. New i18n namespace `nav.*` (`src/i18n/nav.en.ts`, `nav.ru.ts`).

## Decisions

1. **Enforced centrally, not per scene.** Scene files belong to other stories: OnlineScene is F-06's this wave, and Duel, Shop and Market belong to DUE-01, SHP-01 and MKT-01. So the hub rule lives where every scene passes through, in `BaseScene.screen()` and the shells. The scenes' own `back()` code for hubs is now unreachable through Back. Their owners can delete it: `ShopScene.leave`/`backTo`, the Menu branch of `OnlineScene.back` and of `DuelScene.back`.
2. **The War hex selection closes through the panel's layer**, not through a scene callback. The panel's close already clears the selection (`onClose`). No path is lost: the X, a second tap on the hex and Back all still deselect.
3. **"March" is the short English label.** Russian already calls the tab "Поход" (a march). The hub's main action is "Begin / Continue the march", so the word points at the same thing. It is used only where CAMPAIGN does not fit in Cinzel. A phone never shows both.
4. **Merchant is single-parent (War hub).** ia.md §1.3 says so. The scene passes the hex focus as data. screen-flow S21 writes "War hub {focus, select}".
5. **The Company row (V5-047) is HUB-02's.** V5-047 names HUB-01, but the row lives in the Campaign hub (`MenuScene.ts`), which HUB-02 owns. HUB-01's files do not include it.
6. **Toast placement (F-03 decision 5): not moved.** P14 puts toasts at the bottom. On hubs that would put them over the tab bar's medallion, and on Battle over the command strip. This needs one decision covering both. Left for BTL-01 or FL-01.
7. **No text-size allowlist entries to clear.** None is owned by HUB-01 (V5-060). `kit-mosaic` (F-05) and `menu` (HUB-02) stay.

## Not in this story's files: follow-ups for their owners

These Back gaps remain. The contract records the target each one should have.

| Gap | Today | Contract | Owner |
| --- | --- | --- | --- |
| Market with no origin (bot deep link) | Back → War hub | Shop hub (N4) | MKT-01 |
| War army opened from War camp Loot | Back → War hub | War camp (origin) | WAR-01 |
| Army footer back "MAP" (N3, D8) | a second back with a wrong label | removed | ARM-01 |
| Results system Back (N8) | takes the spoils and leaves | Spoils tab first, then Onward | RES-01 |
| Duels search back arrow (N5) | an arrow that refuses | Cancel only, no arrow | DUE-01 |
| Duels Team ↔ Shop cross-links (D11) | the Team header has SHOP | from the hub only | DUE-01 |
| Battle order "Back" (D8) | `battle.ring.back`, `battle.cmd.fallback` say Back | Withdraw (ia.md §5) | BTL-01 / CT |
| War hub "Back to menu" in the unavailable state (N7) | a button to the Campaign hub | "Open in Telegram"; tabs stay | WAR-01 |

## Shots

Fake Telegram (Bot API 8.0, iOS, overlays on, so the left pill reads "Close" or "‹ Back"), production build.

- `en-360-menu.jpg`: the Campaign hub at 360 px. Close in the header. The tab labels are Cinzel, with MARCH.
- `en-390-duel-team.jpg`: Duels › Team, a hub sub-view. "‹ Back" in the header, no tab bar.
- `ru-360-war-panel.jpg`: the War hub with a hex panel open. "‹ Back" closes the panel, and the hub is a root again.

## Gates (2026-10-11, production build via `vite preview`)

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 82 files, 955 tests passed. `tests/nav.test.ts` has 13 new tests, and `tests/tabLabels.test.ts` (new) has 3.
- `npx vite build`: OK.
- `node scripts/layout-check.mjs --no-shots`: 24 configurations x 150 screens, **passed**, 1771 distinct violations, 0 new. The check reports `online-coach-clan|text-size|*` as fixed but still allowlisted. That entry is F-group and not HUB-01's (`scripts/layout-allowlist.json` is not in this story's files), so it was left in place for its owner.
- Smokes:
  - `smoke.mjs`: ALL PASS.
  - `tutorial-smoke.mjs`: PASSED.
  - `duel-smoke.mjs`: ALL PASS.
  - `online-smoke.mjs`: ALL PASS.
  - `fullscreen-smoke.mjs` (the Telegram BackButton): ALL PASS.
- The HUB-01 touch walk (a scratch Playwright script with the fake Telegram, the BackButton pressed through `__tg.pressBack()`): 165 checks, all passed, at 390x844 and 360x780 in en and ru. It covers:
  - every tab from every hub;
  - the Shop door;
  - Settings on a hub;
  - Duels Team → Back → Ladder;
  - the War hex panel closed by Back;
  - World, Army (from the hub and from World) and Settlement Back targets.
