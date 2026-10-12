# BTL-01: battle HUD chrome (hud.md §C, §E)

Presentation only. No sim rule, event or hash change (replay-hash 13/13, balance reference 53%).

## What shipped

- **Z1 top bar** (`TopBar` in `src/ui/battleHud.ts`): the ⋯ **Menu** key at one end, **Pause/Play** and **speed** at the other (offline only), the clock between them, the strength row under them. Every word is at 6.5 UI px or more. A clock word that doesn't fit is left out, never cut. Flee is gone from the bar.
- **The battle menu** (`src/ui/sheets/battleMenu.ts`, new): a bottom sheet with these items:
  - deployment: Leave, Reset all (offline only), Sound, Settings;
  - the offline fight: Retreat, Sound, Settings;
  - the tutorial: Skip tutorial, Sound, Settings;
  - `realtimeLocked`: Retreat and Sound only, under "The battle continues while this is open." (A11Y-18).

  Opening the menu pauses an offline fight, and closing it without a pick lets the fight run on. Leave, Retreat and Reset all open their existing confirms (A11Y-08). Sound toggles in place. The pure rules are `battleMenuItems` and `battleMenuNote`.
- **Retreat rename**: "Flee" became "Retreat" (ELEMENT_MAP E183) and lives only in the menu. The 5th order key "Back" became **Withdraw / Отход** (E198).
- **Z2 and Z2b, the Paused pill vs the boss bar (BTL-1)**: the boss bar runs between the zoom key and the eye. Banners, the Paused banner and the hint pill start under it (`bannerTop()`), and the bar no longer hides when a banner shows. It is drawn over the field badges.
- **Hint pill glyphs (BTL-4)**: an hourglass while paused, an info glyph for hints, and the red "!" only for an alert (losing). The pill wraps to 3 lines and is never cut. The paused sub-line of a banner is at 6.5.
- **Z8 order bar**: full words when they fit at 6.5. Otherwise it uses hud.md §I's short words (Adv., Back off; Впер., Атака, Стой, Огонь, Отход). On a canvas too narrow even for those, it shows icons alone (see decision 4).
- **Deployment header**: Reset all moved to the menu (A11Y-08, away from FIGHT!). **Groups** took its place (E180). The orphan "Shape" title is gone (BTL-8). The shape chip drops "Formation:" before anything would shrink.
- **Medallion rail ≤ 3 (Z5)**: `railLayout` shows at most 3 (2 when the field is under 420 pt), and only as many as fit together with a **More** key. More opens a sheet with the rest (`openAbilitySheet`), which pauses offline.
- **Badge markers** (RD-02's hand-off): **feinting** is a U-turn arrow and a **queued Then… step** is a dotted arrow (code-drawn vector glyphs `marker_feint` and `marker_queued`). `badgeMarkers` keeps at most 2 markers in hud.md §G priority: reticle, crest/Standard, disordered, feint, queued.
- **Text floor for trays**: the works tray and the shape sheet use `PanelRow` (battlePanel.ts), which puts the kit row's 6 px second line at 6.5. The works tray title keeps its whole word: it steps down a size, or falls back to the Works key's name.
- **Left-hand**: a Settings row, "Left-handed battle controls" (V5-072 assigned it to BTL-01). It mirrors the rail, the eye and the zoom key, and swaps the top bar's ends. It applies as soon as Settings closes over a battle.
- **drainEvents hook**: RD-03's `Battle.prototype.drainEvents` monkey-patch is replaced by an explicit `drainLogged(sim)` in `src/game/report.ts`, which BattleScene calls. A plain `sim.drainEvents()` (balance runs, fixtures) now logs nothing. A test pins this.
- **Layout check**: all 14 `battle-*|text-size|*` allowlist entries were removed (the battle screens are clean at 6.5). New fixtures: `battle-menu-deploy`, `battle-menu`, `battle-menu-locked`, `battle-beast-paused` and `battle-lefthand`.
- New icons are code-drawn vector glyphs: `menu`, `sound`, `more`, `marker_feint` and `marker_queued` (VECTOR_GLYPHS, with no atlas frames).

## Decisions

1. **Settings closes the menu, then opens the Settings sheet.** hud.md asks for a nested page in the same sheet. Settings is the shared v3 sheet (`openSettings`), so a nested copy would fork it. The fight stays paused while Settings is open (E208).
2. **The eye is in the corner in every fight, online too.** It used to take the top bar's left slot online (E184: Online Follow → Z2 eye).
3. **The boss bar sits between the zoom key and the eye** (Z2 and Z2b merged into one row). It is not a separate 20 pt row under them. This keeps the field as tall as before, and the banners go under it.
4. **Icon-only order keys below the short-word width.** Telegram full screen at 320x568 is about 137 UI px wide, where even the short words can't fit at 6.5. The keys then show icons with the word as the tip, as the tab bar does there (V5-068). It's never a word under the floor and never an ellipsis.
5. **Russian short words** "Атака" and "Стой" replace hud.md's proposals "Натиск" and "Стоять", which don't fit at 320. The Russian Withdraw is "Отход" in full too, because "Отступить" is the menu's Retreat.
6. **The rail obeys its room before its cap.** At 320x568 the field holds 1 medallion and More (each is 47 UI px), not the 2 hud.md planned. Every ability stays reachable through More.
7. **The captain's crest and the Standard count as one marker**, as RD-01 drew them (the captain carries the standard).
8. **Feint and queued markers only on our badges.** They are our own plans.

## Not done / follow-ups

- Compact group cards under 360 (hud.md: drop the portrait and name, keep the numeral, glyph, men and bars). The cards still abbreviate the name ("PHAL."), and their text is at the floor, so it's not blocking.
- The doctrine chip and the ladder timer chip in Z2 are not built here. The ladder countdown still runs in the clock (CT-06).
- The pre-existing RD-03, CT-06 and CT-07 NOTES files the brief named don't exist in `docs/v5/stories/`. I worked from PROGRESS.md item 29 (the drainEvents hand-off) and the commit history.
- Dev servers in a worktree with a symlinked `node_modules` return 403 on the @fontsource fonts (outside Vite's allow list). Smokes and layout ran with `server.fs.allow` extended in a scratch config. CI is unaffected.

## Screenshots

`390-en-hud`, `390-ru-menu`, `390-ru-works`, `390-en-badges`, `320-ru-hud`, `320-en-menu`, `320-ru-works`, `320-en-badges` (`scripts/dev/btl01-shots.mjs`).
