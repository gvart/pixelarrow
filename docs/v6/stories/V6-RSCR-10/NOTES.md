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
| New-campaign confirm (`menu-reset`): title, what is lost and kept, Cancel (focused first), Start over (destructive) | `confirm` | bottom-centred dialog 200 | centred dialog ≤ 320 | centred dialog | centred dialog |
| Two campaigns (`menu-two-campaigns`): body, two cards, note, Play | `sync.two`, `sync.two.play` | yes | centred dialog ≤ 320 | same | same |
| Keyboard shortcuts sheet (`menu-shortcuts`, `?`/F1): sections, action rows with keys, tip, Edit in Settings | `shortcuts`, `shortcuts.edit` | — (no keyboard) | side panel | bottom sheet ≤ 280 | centred panel ≤ 320 |

### Kit overlay samples (`kit-overlay-*`)

Sheet, Docked sheet (Later / March), Decision (Coast / Hills, no X), Footer Close, Sheet over a sheet, Confirm over a sheet (Scrap), Confirm, Destructive confirm, Purchase confirm, Item card, Legacy modal, toasts, tooltip: all present at every size. The Overlays page is a v5 Kit page in the legacy column (KitScene, RSCR-11); the samples use the same sheet and dialog code as the game.

Nothing is removed.
