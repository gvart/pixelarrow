# F-05: the Kit scene, notes

`?scene=Kit` now shows the whole v5 design system. Builds on [ADR-0005](../../../../design/adr/ADR-0005-ui-kit.md) (F-02) and F-03's overlay rules. The user was asleep; the calls made are below.

## Pages

A pager at the top (‹ page n/12 ›; the middle button lists every page in a sheet). Open a page directly with `?scene=Kit&kit=<id>` or `scene.start('Kit', { page: '<id>' })`; the old `{ tab }` numbers still work.

| Page | What it shows |
| --- | --- |
| `tokens` | Every colour token of `tokens.ts` as a swatch with its name and hex (roles, mosaic, groups, resources, rarity, unit roles, v3 surfaces/text/accents), all 42 procedural surfaces, spacing, radius, motion |
| `type` | Every `TYPE` role in its face (Cinzel caps / Inter, with Cyrillic), the font colours on parchment and on stone, wrap and the button label step-down |
| `states` | Variant x state grids: MButton, v3 Button, MIconButton, KeyButton, StoneTile (default, pressed, selected/lit, disabled with reason); segmented switch with an off segment; rows; badges (0, 1, 12, 120, "!"); chips (parchment, stone, tappable, pressed, long number, long word); error and alert |
| `overlays` | Each overlay opens from a row: sheet, docked sheet with actions, decision sheet, footer Close, sheet over sheet, confirm over sheet, confirm, destructive confirm, purchase confirm, item card, legacy modal and bottom sheet, four toasts, tooltip |
| `icons` | Morale glyphs (steady, wavering, routing) on parchment and stone, the badge markers, the three icon looks, the v5 atlas keys with their stand-ins, and every icon by name |
| `army` | The Army template on a fixed sample company (no save touched): hero card, collapsed card, roster rows (fit, selected, points badge, wounded, long name), group discs, footer |
| `mosaic`, `parts`, `controls`, `items`, `lists`, `v3` | The v4 and legacy galleries, unchanged apart from sitting under the pager |

`src/scenes/kit/catalog.ts` holds the page list and what the pages draw from as pure data; `tests/kitCatalog.test.ts` holds that every colour role, mosaic token, group, resource, type role, morale glyph, marker, v5 key, resource and mode icon is on a page, and that the layout check visits every page.

## Decisions

1. **A pager instead of the tab row.** Twelve pages do not fit a tab row at 320 px (the old row already hid three pages there). The pager works at any width and keeps 44 pt targets; its middle button opens the page list, which doubles as a live sheet sample.
2. **"Focused" is the selected / lit state.** The Mini App is touch-first and the kit has no keyboard focus (IN-01). The state a control shows for "this one" is its selected look (lit bronze, the parchment block with a bronze rim), so that is the grid's selected column. MButton's toggle in force is its own `lit` row.
3. **"Error" is its own section** (warn tips, error ink, the alert badge, a used-up bar): no kit control has an error variant; errors are text and the alert red (A11Y-04).
4. **Pressed is shown held.** `holdDown` sends the control's own `pointerdown` (with the long-press tip off), so the grid shows the real surface swap and 1 px sink. It uses the Reduce-motion press (no 0.97 shrink): a shrunk 6.5 label reads as under the text floor in the layout check.
5. **The hero chevron gets its own row** (default and pressed side by side): it needs width, and its disabled face is the same flat grey as any MButton's.
6. **Row subtitles are left off** on the Kit's ParchmentRows: the subtitle line still draws under 6.5 (F-02 note 4, owned by the rows' story). The overlay rows carry their explanation as the long-press tip instead.
7. **Kit labels stay English.** The Kit is a dev and review scene, not player-facing, and the i18n files are not this story's. Russian is exercised by the Type page's Cyrillic samples and by the kit's own i18n strings (Close, confirm buttons).
8. **Players cannot reach it.** Nothing links to the Kit; only `?scene=Kit` (BootScene) or a script opens it. Back goes to the menu.
9. **The design-system skill** listed for the story is about writing GDDs; nothing in it applied (as in F-03).

## Findings for other owners

- MButton drops the lock on a disabled button when label plus lock do not fit at 6.5 (the States grid's FIGHT / COLLECT / CLOSE cells at 390): the state is then grey and flat only. F-02 / kit owner.
- ParchmentRow subtitles draw under 6.5 (F-02 note 4).

## Gates

Production build via `vite preview`, 2026-10-12.

- `npx tsc --noEmit`: clean for `src` and `tests`; `server/src` cannot resolve `zod` in this checkout (server deps not installed; not this story's files).
- `npx vitest run`: 106 of 107 files, 1301 tests passed (`tests/kitCatalog.test.ts`: 9 new). `tests/ladderPause.test.ts` fails to load for the same missing `zod`.
- `npx vite build`: OK.
- `node scripts/layout-check.mjs --no-shots`: 24 configurations x 184 screens, **passed, 0 new**. 14 new Kit fixtures (`kit-tokens`, `kit-type`, `kit-states`, `kit-overlays`, `kit-icons`, `kit-army`, seven `kit-overlay-*` samples, `kit-pages`). `kit-mosaic|text-size|*` (owned by F-05) is cleared and removed; `kit-overlay-purchase|text-size|*` is new in the allowlist for SHP-01: the v3 purchase confirm's title drops under 6.5 in ru at 320x568 (Telegram insets), `src/ui/v3.ts`.
- `node scripts/smoke.mjs`: ALL PASS (46).

Shots (`kit-*.jpg`): DPR 2, 390x844 and 320x640, en and ru, each page looked at in both sizes and languages.
