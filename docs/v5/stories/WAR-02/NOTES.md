# WAR-02: Clan and Merchant on the kit, notes

Spec: design/ux/screens-modes.md M-10, M-11. Audit: docs/v5/audit/UI.md §19-20 (CLN-1..4, MER-1, MER-2), G12. Done while the user was asleep; the calls made are listed under Decisions.

## What changed

- **Clan in i18n (AC1, G12, CLN-1).** `src/i18n/clan.en.ts` / `clan.ru.ts` hold every string of the Clan screen: states, the no-clan card, the banner, ranks, the manage sheet, confirms, toasts, the invite and join sheets, the found-a-clan form and the server's clan errors by code. `tests/clan.test.ts` checks that ru has every key with the same placeholders, that every key the scene asks for exists, and that the scene has no English literal left.
- **Kit overlays (AC2).** Member manage, Invite link and the Join offer are `openParchmentSheet` sheets (manage has the X only, CLN "X only"); Leave, Kick and Hand over lead go through `confirmDialog`. The flash messages are kit toasts. The Merchant's item card (`openItemCard`) and buy confirm (`confirmDialog`) were already kit overlays and are kept.
- **Found-a-clan form (AC2, CLN-3).** Still an HTML form (Phaser has no text input) but dressed as the kit sheet: 45% basalt scrim, parchment card, Cinzel title over a rule, Inter labels at 13 px, 44 px buttons (Cancel bronze, Found terracotta), localized defaults. It sits high so the phone keyboard does not cover it. Back (Telegram's or ours) and Escape cancel it; a tap outside does not (a form). A bad name or tag is caught before it is sent, with the reason, and the form comes back filled in.
- **Leave away from the primary (AC3, A11Y-08).** Leave moved into the clan banner at the top; Invite is alone at the foot. Leave and Kick open a destructive confirm (wine OK, bronze Cancel). Kick is last in the manage sheet, set apart; Hand over lead confirms too.
- **Clan banner and members (CLN-2).** A banner card: crest well with the flag, "[TAG] Name", men, land and your rank. Members under a section title: name, land, and a rank chip (leader bronze, officer teal, member dark bronze; no grey, no red). A chevron where your rank can act.
- **No clan (CLN-4).** The war fresco, "No clan", three icon bullets (garrison, income, size and who invites), the hint and Found a clan as the primary.
- **States (E284).** Loading pulses; offline, closed, outside Telegram and error use the kit's econ state card with Retry.
- **Invite reason (CLN-3).** A disabled Invite says why under it and on tap.
- **Merchant (MER-1, MER-2).** The discount is said once, in the info card; buttons show only the price; the list price is struck through over its button. A capped row says "Daily limit reached" under its buttons.
- **Allowlist (V5-060).** `online-clan|text-size|*` cleared; Clan and Merchant have no violations at any size, language or inset.

## Element map (E283-E296)

All 14 rows kept: E283 sub-shell + Back → War hub; E284 states (+ Retry); E285 no-clan card + form; E286 banner; E287 member rows → manage (Make officer, Demote, Hand over lead, Kick; Close is the X); E288 Invite (share or copied link, code, 7 days; reason when disabled); E289 Leave (confirm); E290 Join offer; E291 flash messages (toasts); E292 Merchant sub-shell; E293 chips; E294 info card; E295 sections; E296 offer rows (icon → card, name, Today n/cap, description, buy gold / Drachmae with reasons → confirm), plus the cap reason line.

## Decisions

1. **Clan header plural (Director's call):** "1 region / N regions" (ru plural forms), " · " separators. `scripts/online-e2e.mjs` now matches a case-insensitive regex on region(s) ... leader instead of the old literal.
2. **Server error messages are English**, so the screen shows `clan.err.<code>` and a generic line for unknown codes. The form checks the server's own rules first (name 3-24 letters, digits, spaces, `'`, `-`; tag 2-5 Latin letters or digits).
3. **The form stays HTML** and joins the Back stack through `navLayer` with a stand-in for the container. Its signature is unchanged, so DuelScene's rename prompt gets the new look too (and localized defaults).
4. **Leave lives in the banner**, not in the footer or at the end of the list: at the list's end it would sit right above Invite on a full clan.
5. **Hand over lead confirms** (not destructive-coloured): you lose the lead and cannot take it back yourself.
6. **No-clan art reuses `ui/fresco_war.jpg`** (FirstRun's key); no new asset.
7. **Wiring**: `en.ts` and `ru.ts` got one import and one spread each, needed for the new tables. No new merchant strings were needed (`econ.dailyCap` reused).
8. **The struck list price is drawn over the button**, centred on it: MButton has one label and no strike style.
9. **`showJoin()`** is split from `offerJoin()` so the sheet can be staged without the API (screenshots).
10. **Skills**: game-ui-ux, localize, phaser-core, dev-story, story-done followed; agents ui-programmer, ux-designer, accessibility-specialist, localization-lead read and applied as checklists (no sub-agents: the user was asleep and the orchestrator asked for decisions to be noted).
11. **The fresco loads after the screen is up**, not in `preload()`: a preload held `create()` back under load and the layout check's staging hit an unbuilt scene. It never redraws over an open sheet (the join offer). On the smallest canvas (320x568 in Telegram) the hint, then the lead line, give way so Found a clan stays on the card.

## Shots

`before-*` (v5 at f752a6f) and `after-*` (this branch), production build, DPR 2, JPEG under 150 KB: Clan (en 390), no clan (ru 360), manage sheet (ru 320), Merchant (en 390, scrolled to the capped War horn after), Merchant (ru 320), and the found-a-clan form (en 320). The full set (13 states x 3 sizes x en/ru) was looked at during the work.

## Gates (2026-10-11, production build via `vite preview`)

- `npx tsc --noEmit`: clean. `npx vite build`: OK.
- `npx vitest run`: 101 files, 1292 tests; 1291 pass in the full run and `tests/simTypes.test.ts` timed out under machine load (load average 65), then passed alone (8/8). `tests/clan.test.ts`: 8 new.
- `node scripts/layout-check.mjs --no-shots`: full run 24 configs x 158 screens, 0 new apart from two on `online-clan-none` at ru-tg-320x568, fixed (decision 11); the Clan and Merchant screens re-run at all 24 configs: 0 violations. `online-clan|text-size|*` cleared.
- `node scripts/online-smoke.mjs`: ALL PASS. `node scripts/online-e2e.mjs` (wrangler dev + DEV_AUTH, vite dev): ALL PASS (clan founded, invite, join, duel).
