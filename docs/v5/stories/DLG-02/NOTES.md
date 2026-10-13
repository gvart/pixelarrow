# DLG-02: the remaining sheets on the kit, and the i18n gaps (G12)

Spec: design/ux/screen-flow.md §1 (sheet register). Audit: docs/v5/audit/UI.md G12. Kit rules: F-03 (`src/ui/mosaic/overlays.ts`, `openParchmentSheet`). I did this while the user was asleep. The calls I made are listed under Decisions.

## What changed

- **Challenge popup [S18] (`src/ui/duelInvites.ts`).** It's now a kit decision sheet: `openParchmentSheet` without the legacy `skin`/inkify path, with MButton actions and parchment ink text. Decline sits on the left (bronze) and Fight on the right (primary). There's no X and no shade tap, because it pops up unasked and a stray tap must not answer it. Decline and Back (Telegram or browser) are the way out, and both send the decline. The body text wraps, so the challenger's name is never cut.
- **Battle-consumable picker (`src/ui/econ/consumablePicker.ts`).** It's now a kit sheet built from parchment rows. Each row shows the goods icon with the held count under it (`×` plus DUE-01's `fmtCount`), the name, and the full effect text. Name and effect both wrap and are never cut.
  - **Way out.** The X (or Back) resolves `undefined`, so no battle starts. Before, the only buttons were "None" (which fights) and "Take it".
  - **Disabled reason.** "Take it" is disabled when nothing is selected, and tapping it then says why (`gap.cons.pickOne`).
  - **Short canvases.** The rows scroll when the canvas is too short (TG 320x568), so they never run under the action row.
  - **Title.** When the title can't keep its whole words beside the X, a short title is used ("Consumable" / "Припас").
  - **Empty state.** It now says where consumables are actually sold (merchants on the war map). The old hint said "the shop", but the server refuses those purchases there (`merchant_only`). The only action in the empty state is "Fight without", plus the X.
- **G12 strings (`src/i18n/gaps.en.ts`, `gaps.ru.ts`, registered in `en.ts` and `ru.ts`).**
  - **Online availability.** `checkOnline` and `explain` messages: outside Telegram, offline, realm not open.
  - **Error text.** Every player-facing message from a failed call now comes from i18n. `apiErrorText(status, code)` looks up the server's error code first, then the HTTP status, then a generic message. The server's English text is never shown; it only goes to `console.debug`. This covers 87 server codes; admin and internal codes fall back to the status.
  - **Duels queue.** Its two client-side errors (`src/duel/client.ts`) are localized too.

## Scope extension (Director-approved during the run)

The Director approved edits beyond the owned files:

- **`src/online/client.ts`.** `checkOnline`, `explain`, `errorText`, plus the new `apiErrorText`.
- **`src/duel/client.ts`.** The queue's `outside`/`network` error lines. The approval named one line, 450. I also changed line 449 next to it (`'Available in Telegram'`), because it's the same G12 gap.
- **`src/i18n/en.ts` and `ru.ts`.** One import and one spread each.
- **`tests/simVersion.test.ts`.** One expectation changed: it had asserted that the server's English text is shown, which is the bug this story fixes.
- **New test.** `tests/gaps.test.ts` checks the mapping in en and ru, the status fallback, the generic fallback for an unknown code, that the server's text never shows, and that ru has every key with the same placeholders and no Latin words.

## Acceptance criteria

1. **Kit overlays.** Within this story's files, every sheet is a kit overlay (no `skin: true`, no v3 `Button`, no `openModal`). The F-03 overlay stack applies, so at most one sheet plus one confirm are on screen.
   - **Still on the `skin`/inkify path elsewhere**, in other stories' files: `ui/settings.ts`, `ui/notifySettings.ts`, `ui/sheet.ts`, `ui/beastInfo.ts`, `scenes/BattleScene.ts`, `scenes/ResultsScene.ts`, and the Kit pages.
   - **No audit script exists.** The "audit script lists 68/68" check in the story was never written, so I couldn't produce that count. I recorded this list instead, for F-07.
2. **G12 strings.** The online error strings are done. The rest of G12 was already moved by earlier stories: Clan (WAR-02), Boot (FR), structures (CMP-01), the World dialogs, and the band and camp reasons (WLD-01).
   - **Still open, in files outside this story:**
     - `scenes/duel/DuelScene.ts:1771` shows a queue socket error's `message`. The server sends English there; it should map `code` through `apiErrorText`.
     - `scenes/online/MerchantScene.ts:341` shows `e.message`.
     - `ui/econ/demo.ts` has English failure texts, but only on the demo path.
3. **No v3 imports.** None of this story's files imports v3 or inkSkin. Remaining v3 imports: `ui/settings.ts`, `ui/notifySettings.ts`, `ui/mosaic/tips.ts`, `scenes/HeroScene.ts`, `scenes/ShopScene.ts`, and the Kit pages. All of these are for F-07, which deletes v3.

## Decisions

1. **Decision sheet, not X, for the challenge.** It arrives unasked, so an outside tap or an X in the corner must not answer it by accident. Decline is the explicit cancel and Back declines too.
2. **The picker gets the X.** "None" means "fight without one", so it isn't a cancel. Without the X, the only way out was Back, which isn't visible on screen.
3. **Count under the icon.** At TG 320x568 a right-aligned count overlapped "SHARPENING" (one word, so it can't wrap). Putting the count under the icon gives the name the full row width.
4. **I left `src/ui/online.ts` unchanged.** It has no sheet and no literal strings. The sync badge already shows only on error (Menu and World add it only on `offline`, MENU-4), and its tap tip is the kit tooltip (`showTooltip`, the same one `makePressable` uses) with i18n text.
5. **Error words by code.** Some server messages carry numbers, such as "At most N heroes". The localized lines leave the number out rather than parse English. The client screens that need numbers already show them (DUE and WAR stories).
6. **DLG-01 has no NOTES.md** in `docs/v5/stories/`. I used its merge commit (299313b) as the reference instead.

## Shots

Production build (`vite preview`), DPR 2, plain insets, JPEG ≤ 150 KB:

- `consumable-picker-{en,ru}-{390,320}.jpg`
- `online-challenge-{en,ru}-{390,320}.jpg`

## Gates (2026-10-12)

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 115 files, 1406 tests passed.
- `npx vite build`: OK.
- **Layout check**, `--no-shots`, all 24 configs. Screens: consumable-picker, online-challenge, online, online-map, duel-closed, online-army-closed, online-clan, online-clan-none, menu-settings, menu. Result: **0 new violations**.
- **Smokes:** `smoke.mjs`, `duel-smoke.mjs` and `online-smoke.mjs` all ALL PASS.
