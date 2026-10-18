# V6-RSCR-10 notes: Settings and dialogs (landscape and tablet)

Spec: design/ux/landscape-v6.md §2.3, §3.4, §13.3, §16.7. Decisions: V6-055, V6-059, V6-062, V6-063, V6-065, V6-066, V6-067, V6-068 (open item: Settings as a centred panel at expanded), V6-069, V6-078, V6-083, V6-086, V6-088, V6-089.

## Real elements before any change (from the code, next to the spec's list)

Taken from `src/ui/settings.ts`, `src/ui/notifySettings.ts`, `src/ui/settings/controls.ts`, `src/ui/shortcutsSheet.ts`, `src/ui/account/{accountPage,devices,twoCampaigns}.ts` (layout only), `confirmDialog` in `src/ui/widgets.ts` and `src/scenes/kit/overlaysPage.ts` at v6 d8b0384a. Spec §13.3 lists: Audio (Sound, Music, Effects); Language; Battle (damage numbers, 4 pauses, speed); Haptics, left-hand, analytics; Motion, shake, flash; Sync; tutorial; New campaign with its confirm; Notifications; About; Controls (keyboard only); Account. The code has exactly these. "v5" is compact portrait (390x844, 360x780, 320x693), unchanged by this story.

Columns: where the element is after this story. CL = compact landscape (844x390), MD = medium (768x1024, 820x1180), EX = expanded (1024x768 … 1920x1080).

### Settings (`menu-settings`, `menu-settings-controls`)

| Element (code) | uiId | Spec §13.3 | v5 | CL | MD | EX |
| --- | --- | --- | --- | --- | --- | --- |
| Sheet, title "Settings", X | `sheet`, `sheet.close` | Settings | bottom sheet 240 | right side panel, 60% VW, full height | bottom sheet 280 | centred panel 320, 80% VH |
| Section titles with icons (Audio, Language, Battle, Accessibility, Controls, Account) | — | sections | yes | yes | yes | yes |
| Sound toggle | `settings.toggle.sound` | Audio | yes | yes | yes | yes |
| Music, Effects steppers | `settings.musicVol.down/up`, `settings.sfxVol.down/up` | Audio | yes | yes | yes | yes |
| Language Auto / English / Русский | `settings.lang.auto/en/ru` | Language | yes | yes | yes | yes |
| Damage numbers, 4 pause toggles | `settings.toggle.dmgNumbers`, `…pauseContact/Flank/Rout/Death` | Battle | yes | yes | yes | yes |
| Battle speed stepper | `settings.battleSpeed.down/up` | Battle | yes | yes | yes | yes |
| Reduce motion, shake, flash | `settings.toggle.reduceMotion/reduceShake/reduceFlash` | Motion | yes | yes | yes | yes |
| Haptics, left-hand | `settings.toggle.haptics/leftHand` | — | yes | yes | yes | yes |
| Controls: Keyboard shortcuts (Open), Show key hints (keyboard only) | `settings.open.controls`, `settings.toggle.keyHints` | Controls | keyboard only | keyboard only | keyboard only | keyboard only |
| Account row (name / guest Log in / pending / offline) | `settings.open.account` or `settings.account.login` | Account | yes | yes | yes | yes |
| Cloud save state + sync badge | `legend.sync` | Sync | yes | yes | yes | yes |
| Tutorial replay / resume (disabled in battle) | `settings.tutorial` | tutorial | yes | yes | yes | yes |
| Notifications (Open), About (Open) | `settings.open.notify`, `settings.open.about` | pages | yes | yes | yes | yes |
| Analytics toggle | `settings.toggle.analytics` | — | yes | yes | yes | yes |
| New campaign (destructive, with its confirm) | `settings.newCampaign` | newCampaign | yes | yes | yes | yes |
| Scroll of the list | — | — | yes | yes | yes | yes (fewer rows hidden) |

### Pages (replace the sheet; the same box as Settings)

| Page | Elements (code) | uiIds | v5 | CL | MD | EX |
| --- | --- | --- | --- | --- | --- | --- |
| Notifications (`menu-settings-notify`) | back chevron, title, note (loading / offline / blocked / failed), 8 type toggles, Quiet at night | `notify.back`, `notify.<type>`, `notify.quiet` | yes | yes | yes | yes |
| About (`menu-settings-about`) | back, title, note, Terms, Privacy, Refunds | `about.back`, `about.terms/privacy/refunds` | yes | yes | yes | yes |
| Controls (`menu-settings-controls`) | back, title, one row per action with two key chips, reset on changed rows, Reset all, capture sheet (Swap / Replace / Clear / Cancel) | `controls.back`, `controls.<id>.<slot>`, `controls.<id>.reset`, `controls.resetAll` | yes | yes | yes | yes |
| Account (`menu-settings-account*`, layout only) | back, title, Profile (name, public boards), Sign-in methods and their actions, Devices (Open), Log out, Privacy (Open) | `account.back`, `account.boards`, `account.email.*`, `account.tg.remove`, `account.devices`, `account.logout`, `account.privacy` | yes | yes | yes | yes |
| Devices (`menu-settings-devices`) | back, title, a row per device with Log out, Log out everywhere, retry | `devices.back`, `devices.logout.<h>`, `devices.logoutAll`, `devices.retry` | yes | yes | yes | yes |

### Dialogs and the shortcuts sheet

| Element (code) | uiId | v5 | CL | MD | EX |
| --- | --- | --- | --- | --- | --- |
| New-campaign confirm (`menu-reset`): title, what is lost and kept, Cancel (focused first), Begin (destructive) | — | centred dialog 200 (v5) | centred dialog 200 (≤ 320) | same | same |
| Two campaigns (`menu-two-campaigns`): body, two cards, note, Play | `sync.two`, `sync.two.play` | yes | centred dialog ≤ 320 | same | same |
| Keyboard shortcuts sheet (`menu-shortcuts`, `?`/F1): sections, action rows with keys, tip, Edit in Settings | `shortcuts`, `shortcuts.edit` | — (no keyboard) | side panel | bottom sheet ≤ 280 | centred panel ≤ 320 |

### Kit overlay samples (`kit-overlay-*`)

Sheet, Docked sheet (Later / March), Decision (Coast / Hills, no X), Footer Close, Sheet over a sheet, Confirm over a sheet (Scrap), Confirm, Destructive confirm, Purchase confirm, Item card, Legacy modal, toasts, tooltip: all present at every size. The Overlays page is a v5 Kit page in the legacy column (KitScene, RSCR-11); the samples use the same sheet and dialog code as the game.

Nothing is removed.

## What changed

- **`ParchmentSheet.ts` (placeSheet)**: a sheet of the `settings` kind outside compact portrait takes exactly the §3.4 box from `panelLayout`: the 60% side panel at compact landscape (not widened to the caller's width), the 280 bottom sheet on tablets, and the centred 320 panel at most 80% of the height on laptops (closes V6-068's open item). Every other kind is unchanged.
- **`notifySettings.ts`**: `settingsSheetOpts(scene)` (docked like v5, kind `settings`), `settingsSheetW(scene)` (the width of that panel; a bare VW still gives v5's 240) and `settingsSheetH(scene, want)` (a side panel stays under the top bar, since the content scrolls; About, whose words and buttons do not scroll, passes `rise` and may rise over it on a short screen as before). `openSettingsPage` uses them, so Notifications, About, Controls, Account and Devices take the Settings box. The About legal buttons are at most 240 (§2.3), centred.
- **`settings.ts`**: opens with `settingsSheetOpts` and `settingsSheetH`. One column, as §13.3 decides.
- **`settings/controls.ts`**: Reset all is at most 240, centred; width from `settingsSheetW(scene)`.
- **`shortcutsSheet.ts`**: the `?` sheet opens as the settings kind (§13.3: side panel, 280 sheet, centred 320 panel).
- **`account/accountPage.ts`, `account/devices.ts`**: one layout line each, `settingsSheetW(scene)` (layout hook only; their content belongs to the ACCT/LINK stories; link-06 told).
- **Kit Overlays page** (`KitScene.ts` two lines, `kit/common.ts` Cursor `into`, `kit/overlaysPage.ts`): the page opts in to the size classes (uiLayout), so its samples show the real §3.4 presentations; from 300 UI of content it lays out in two panes (Sheets | Confirms, Toasts and tips), each row at most 360; the Footer Close sample's button is at most 240. Compact portrait keeps the v5 single column.
- `scripts/layout-allowlist/V6-RSCR-10.json` deleted (all 8 entries were fixed; nothing pending).
- `tests/settingsPanel.test.ts` (8): the Settings box per class, the pages' width, the side panel under the top bar, v5 unchanged in compact portrait.

## Deviations

- **Confirms stay 200 wide** in every class (the v5 confirmDialog width), inside the ≤ 320 cap: wider would only stretch two short buttons.
- **About rises over the top bar at 844x390** (as before this story), because its words and three buttons do not scroll; the other pages stay under it.
- The Kit Overlays page is moved out of the legacy column by this story, not RSCR-11, because its allowlist entries were RSCR-10's; RSCR-11 still owns the rest of the Kit.

## Verification (on v6 d8b0384a + this branch)

- **Layout check**, `--scenes 'menu-settings*,menu-reset,menu-two-campaigns,menu-shortcuts,kit-overlay*'` (21 screens), all ten sizes, en and ru, plain and tg: 28 configs, 588 screens, 0 violations, 0 new, 0 pending: PASSED. Re-run at 844x390, 390x844 and 1280x800 after the last fix (side panel under the top bar): 210 screens, 0. Before (v6): 33 pending landscape findings (class-match, letterbox, empty-column, wasted-width and stretched, all on the Kit Overlays page in the legacy column) and 8 allowlisted entries.
- **Element parity**: the check's `element-parity` rule passed on every screen above; the table at the top lists each element per class.
- **Portrait** (390x844, 360x780, 320x693 × en, ru × plain, tg): 252 layout-check shots compared pixel by pixel against v6: 222 identical (0 px). The other 30 are three screens (`kit-overlay-item`, `menu-shortcuts`, `menu-settings-controls`) that also differ between two runs of v6 itself by the same amounts (the item card's animated rarity frame and the scroll cue), so no change from this story.
- **Keyboard only** (`docs/v6/shots/V6-RSCR-10/keyboard.txt`, 96 PASS at 1280x800, 844x390 and 768x1024 in en and ru): Tab reaches the gear, Enter opens Settings with focus inside and trapped; Notifications, About, Controls and Account (Log in form for a guest) open on Enter, and Esc returns focus to their row; Controls → Reset all opens its destructive confirm on Cancel (left of the OK); Esc and Enter on Cancel both close it with focus back on Reset all; Esc closes Settings with focus back on the gear.
- **Gates**: tsc 0 errors; vitest 173 files, 2128 tests passed; vite build OK; `regression/run.mjs --all` (telegram and web): 23 of 23 rows PASS, suite 1869 s.
- **Screenshots**: `docs/v6/shots/V6-RSCR-10/` has 9 key shots (JPEG q82, V6-078) and the keyboard transcript; every family screen was opened from the layout check's shots in each class in en and ru.
