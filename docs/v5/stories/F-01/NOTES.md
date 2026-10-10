# F-01: tokens and type, notes

## The Cinzel word split (OI-1, audit G1)

**Root cause.** `renderVectorAtlas` (src/art/vectorFont.ts) placed every glyph at its
advance from the metric table of the *bundled* font. When the bundled face was not
loaded at the moment the atlas was drawn, the canvas drew a fallback serif instead
(true lower case, much narrower than Cinzel's small caps), and each narrow letter sat
in a Cinzel-wide slot: "St rat egos", "Duel s". `loadUiFonts` swallowed load errors and
never checked the result, so nothing noticed. Caps looked fine only because fallback
capitals are about as wide as Cinzel's.

When does the face fail to load?
- Every dev server in an agent worktree whose `node_modules` is a symlink to the main
  checkout: Vite refuses the `/@fs/` font requests outside its root, every face errors.
  This reproduces the audit's shots exactly (`before-*.jpg`), so they were most likely taken
  that way.
- In production: a slow or failed font fetch (offline-ish Telegram webview).
- With the bundled fonts loaded (a `vite build` + preview), the old atlas was already
  correct: the metrics match `measureText` to 1/1000 em.

**Fix.**
1. `loadUiFonts` loads every bundled family and subset, waits at most 6 s, checks each face
   (`faceReady`: a loaded @font-face of that family and weight **and**
   `document.fonts.check`) and returns the faces that are not ready, with a console warning.
2. The atlas advances by the face it actually draws: with the bundled face loaded, the metric
   advance (identical to the layout's measure); with a fallback, each letter's own drawn width,
   capped at the metric advance (text never grows past the box the layout gave it). A fallback
   glyph wider than its advance is narrowed to fit, so letters never overlap. Word spaces and
   tabular digits keep their metric advance.
3. `tests/vectorFont.test.ts` reproduces the split (0.28 em gap in "Strategos" before the fix)
   and holds the art bible's 0.15 em rule for Strategos, First steps, Duels, Available, Cyclops,
   Spoils, Titan.

## Shots

`before-*`: the old code with the faces unavailable (dev server in a worktree, as the audit saw
it). `after-fallback-*`: the new code in the same conditions. `after-*`: the new code from a
production build (`vite preview`) with Cinzel, Inter and Cormorant SC loaded. Menu hub, duels hub
(ladder) and `Kit` (controls tab) at 390x844, 360x780 and 320x640, en and ru, DPR 2.

## Decisions

- **Edited `src/art/vectorFont.ts`**, which the story's file list does not name: the bug lives
  there (`renderVectorAtlas`, `loadUiFonts`), and no other story owns it. `src/art/font.ts` is
  the old pixel font of the store-image generator and was not involved.
- **Never block the boot on fonts.** The art bible says block or retry; an offline Telegram
  webview would then never start. The boot waits up to 6 s, then draws the fallback with the
  fallback's own widths (no split, no overlap).
- **No new font files or dependencies.** Inter, Cinzel and Cormorant SC were already bundled from
  `@fontsource` (OFL-1.1) by Vite into `dist/assets`; nothing loads from a CDN. Inter 600 (the
  art bible's proposal for names) is not added: no screen uses it yet.
- **Type tokens.** `TYPE` was unused by any screen, so its values moved to the art bible scale
  (displayL 10, displayM 8, displayS 7, body 7, caption 6.5) and the old names stay as aliases
  (`title` 10, `heading` 8, `display` 12, `micro` 5.5 for decorative plates only).
- **AC4, the layout-check half, is not done here.** `TEXT_MIN` (6.5) is a token and tested, but a
  layout-check rule for text size needs `src/ui/layout.ts` / `layoutCheck.ts` /
  `scripts/layout-check.mjs` (not F-01's files), and today's screens still have text under 6.5
  units (tab bar, battle HUD: audit G10) owned by F-02, RD-01 and the screen stories. A failing
  rule would break every run; it should land with F-02.
- **`offText` lifted to #e4ddd0** (art bible 4.3): the disabled label pair is now held at 4.5:1.
