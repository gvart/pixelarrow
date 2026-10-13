# A1-PLAT: Telegram touchpoints and the platform seam

Audit of `v6` at 768e9f5 (= v5 release 6201095 + v6 setup docs). Read-only; no source changed.

## Summary

- **One adapter already exists in practice.** Every Telegram WebApp SDK call lives in
  `src/platform/telegram.ts` (358 lines, a module-level singleton `app`). No game file touches
  `window.Telegram` directly.
- **But the seam is leaky.** 41 files import from it (40 static, 1 dynamic import), with about
  **203 call sites** outside the module. 178 of them are haptics (`haptic` 84, `hapticNotify` 90,
  `hapticSelect` 4) spread over 33 files. The other 25 call sites are concentrated in 12 files.
- **Implicit platform checks.** "Telegram or not" also leaks through `online.available`
  (`!!initData() || devAuth`, `src/platform/online.ts:70-72`), read at 17 call sites in 4 files,
  plus `inTelegram()` in `ClanScene`. These are `if (telegram)` checks by another name and must
  become "is there a session / an auth method" (V5-076).
- **Telegram-specific copy:** 13 English keys (and their Russian twins) say "inside Telegram"
  (list below). The web adapter needs neutral or platform-supplied wording.
- **Existing test seams worth keeping:** `NavHost` (`src/platform/nav.ts:28-33`) is already an
  interface with a Telegram host and a mock in `tests/nav.test.ts`. `OnlineDeps`
  (`src/platform/online.ts:20-38`) already injects `initData` and `openInvoice`. `KV`
  (`src/game/save.ts:261`) is already the storage interface. `attachWebApp(wa)`
  (`telegram.ts:102`) takes a fake WebApp in tests.

## The module itself: `src/platform/telegram.ts`

| Lines | Export | SDK surface |
| --- | --- | --- |
| 63-66 | `launchedFromTelegram` (private) | `location.hash/search` `tgWebApp*`, `TelegramWebviewProxy`, `Telegram.WebApp.initData` |
| 86-95 | `initTelegram()` | lazy-loads `https://telegram.org/js/telegram-web-app.js` (4 s timeout) |
| 102-141 | `attachWebApp(wa)` | `ready`, `expand`, `disableVerticalSwipes` (7.7), `setHeaderColor`/`setBackgroundColor` `#14100c` (6.1), `requestFullscreen` on phones (8.0), `lockOrientation` (8.0, portrait only), events `safeAreaChanged`, `contentSafeAreaChanged`, `viewportChanged`, `fullscreenChanged`, `fullscreenFailed`, `activated`, `deactivated` |
| 146-149 | `onAppActive(cb)` | `activated` / `deactivated` |
| 161-190 | `deviceInsets`, `contentInsets`, `onInsetsChanged`, `isFullscreen` | `safeAreaInset`, `contentSafeAreaInset`, `isFullscreen` |
| 193-207 | `setSettingsButton(cb)` | `SettingsButton` (7.0) |
| 210-219 | `setClosingConfirmation(on)` | `enable/disableClosingConfirmation` (6.2) |
| 221-237 | `inTelegram`, `telegramClient`, `telegramUserName`, `telegramLanguage` | `platform`, `version`, `initDataUnsafe.user` |
| 239-241 | `themeColor(name)` | `themeParams` (**unused**, the game keeps its own dark identity) |
| 243-272 | `setHaptics`, `haptic`, `hapticNotify`, `hapticSelect` | `HapticFeedback.*` |
| 275-294 | `hasNativeBack`, `setBackButton` | `BackButton` (6.1) |
| 296-299 | `cloudStorage()` | `CloudStorage` (6.9) |
| 302-305 | `telegramInitData()` | `initData` |
| 308-317 | `openInvoice(link)` | `openInvoice` (6.1) |
| 323-332 | `startParam()` | `initDataUnsafe.start_param`, else `?startapp=` / `?tgWebAppStartParam=` |
| 335-345 | `openTelegramLink(url)` | `openTelegramLink` (6.1), else `window.open` |
| 348-357 | `openExternalLink(url)` | `openLink`, else `window.open(..., 'noopener')` |

Unused exports today: `themeColor`, `telegramUserName`, `deviceInsets`, `contentInsets`, `isFullscreen`
(only used inside the module). The `theme` interface is therefore not needed (see below).

## Touchpoints grouped by future interface

### 1. Auth (`Auth`)
| Where | What |
| --- | --- |
| `src/platform/cloud.ts:5,13` | wires `telegramInitData` into `Online` |
| `src/platform/online.ts:26,70-72,108-117` | `available` = has initData or dev auth; `signIn()` picks `authTelegram(initData)` or `authDev` |
| `src/platform/api.ts:376-386` | `POST /api/auth/telegram` with `{ initData }` or `{ dev }`; token kept in memory, sent as `Authorization: Bearer` (`api.ts:316-317`), `credentials: 'omit'` (`api.ts:338`) |
| `src/online/client.ts:458` | WebSocket token in `Sec-WebSocket-Protocol: pixelarrow.v1, <token>` |
| `src/online/client.ts:299`, `src/duel/client.ts:325,450`, `src/ui/econ/source.ts:66,70,129`, `src/scenes/BootScene.ts:111` (+ 10 more `online.available` reads) | "online only inside Telegram" gates |
| `src/ui/lang.ts:4,23` | `telegramLanguage()` feeds language detection (profile hint, belongs with auth/identity) |

### 2. Payments (`Payments`)
| Where | What |
| --- | --- |
| `src/platform/cloud.ts:17` | `openInvoice` injected into `Online` |
| `src/platform/online.ts:11,31,366-391` | `buy()`: server invoice link, Telegram sheet, poll entitlements |
| `src/ui/econ/source.ts:129-161` | Drachmae packs: dynamic `import('../../platform/telegram')` then `openInvoice` (bypasses the injected seam) |
| `src/scenes/ShopScene.ts:806-812` | Stars legal copy and Terms / Refunds links |
| i18n `res.tip.stars`, `v3.buyConfirmTitle`, `v3.buyConfirmBody`, `wallet.paying` | Stars-specific copy |

### 3. Storage (`Storage`)
| Where | What |
| --- | --- |
| `src/platform/storage.ts:3,42-65` | `telegramKV()` over CloudStorage (5 s timeout), `gameKV()` = CloudStorage primary + localStorage mirror inside Telegram, localStorage elsewhere |
| `src/state.ts:60,108,143`, `src/platform/cloud.ts:11` | callers of `gameKV()` |
| direct `localStorage` (no seam): `src/scenes/online/regionMapView.ts:338-350`, `src/platform/monitoring.ts:24,38` | should go through `safeLocalStorage()` / device KV |

### 4. Haptics (`Haptics`)
`haptic` 84, `hapticNotify` 90, `hapticSelect` 4 call sites; `setHaptics` at `src/state.ts:82,99,136`,
`src/ui/settings.ts:176`. Files (line of import): `ui/kit.ts:17`, `ui/widgets.ts:27`, `ui/battlePanel.ts:23`,
`ui/settings.ts:16`, `ui/notifySettings.ts:25`, `ui/duelInvites.ts:15`, `ui/mosaic/Pager.ts:8`,
`ui/mosaic/StatTile.ts:10`, `ui/tutorial/battleTutorial.ts:68`, `ui/tutorial/onlineCoach.ts:23`,
`ui/sheets/eventCard.ts:26`, `ui/sheets/encounter.ts:26`, `ui/results/arcVictory.ts:21`, `ui/results/tile.ts:13`,
`ui/econ/consumablePicker.ts:33`, `audio/hooks.ts:11`, `platform/nav.ts:15`, and the scenes `BattleScene:47` (37 calls),
`HeroScene:20`, `CampScene:29`, `WorldScene:23`, `SettlementScene:17`, `ArmyScene:14`, `ResultsScene:51`,
`ShopScene:24`, `MarketScene:25`, `FirstRunScene:30`, `online/OnlineScene:26`, `online/OnlineArmyScene:28`,
`online/MerchantScene:28`, `online/ClanScene:21`, `duel/DuelScene:51`. The cue table is already neutral:
`src/audio/haptics.ts` (`Cue` = impact light/medium/heavy or notify error/success/warning).

### 5. Back button (`BackButton`, with the closing guard and the ⋯ Settings item)
| Where | What |
| --- | --- |
| `src/platform/nav.ts:15,157-163` | `nav = new NavStack({ setBack: setBackButton, setSettings: setSettingsButton, setClosingConfirmation, feedback: hapticSelect })` |
| `src/platform/nav.ts:195-197` | `showInGameBack()` = `!hasNativeBack()` |
| `src/ui/mosaic/subShell.ts:76,99,121`, `src/scenes/BaseScene.ts:119`, `src/ui/mosaic/TopBar.ts:24` | draw the in-game arrow only without a native Back |
| `src/scenes/online/textInput.ts:110` | Escape cancels (the only keyboard Back today) |

On the web the adapter must map Back to Escape and (optionally) `history.popstate`, and
`setClosingConfirmation` to `beforeunload`. Settings item: no-op on web.

### 6. Share and invite (`Share`)
| Where | What |
| --- | --- |
| `src/scenes/online/ClanScene.ts:335-341` | builds `https://t.me/share/url?...`; `inTelegram()` ? `openTelegramLink` : clipboard |
| `src/scenes/online/ClanScene.ts:375-377` | copy text "sent" vs "copied" by `inTelegram()`; Share button always opens the t.me URL |
| `src/online/rules.ts:167-169` | `clanInviteLink`: `t.me/<bot>/<app>?startapp=clan_<code>` or `https://pixelarrow.app/?startapp=...` |
| `src/scenes/BootScene.ts:6,100` + `src/online/deeplink.ts` | `startParam()` launch route (clan invite, notification buttons) |
| `src/ui/notifySettings.ts:185`, `src/scenes/ShopScene.ts:811-812` | `openExternalLink(legalUrl(...))` |
| `src/ui/legal.ts:4` | `LEGAL_BASE = 'https://pixelarrow.app'` (hard-coded) |

Web adapter: `navigator.share` where present, else clipboard; launch route from `?startapp=` (already
supported in `startParam`), so the deep-link parser stays shared.

### 7. Safe area (`SafeArea`, plus viewport and fullscreen)
| Where | What |
| --- | --- |
| `src/platform/safeArea.ts:15,36-47` | `trackSafeArea` subscribes to `onInsetsChanged`, writes `--pa-safe-*`/`--pa-content-*` |
| `src/main.ts:15,61-70` | installs it with `game.scale.refresh()` |
| `index.html:17-22` | CSS takes `max(env(safe-area-inset-*), --pa-safe-*, --tg-safe-area-inset-*)`; note `#game` width is capped at `0.64 × height` (the portrait column the landscape work removes) |
| `telegram.ts:126-131` | fullscreen on phones and portrait lock: Telegram-only lifecycle, belongs in the Telegram adapter's `init()` |

### 8. Input hints (`InputHints`)
Nothing Telegram-specific today. Pointer kind is read per event (`src/ui/hover.ts:15-24`, `wasTouch`),
there is no "keyboard present" detection, and the kit states it has no focus (`src/scenes/kit/statesPage.ts:7`).
`telegramClient().platform` (`tdesktop`, `macos`, `weba` vs `ios`/`android`) is the best Telegram
hint for "a keyboard is likely"; the web adapter uses `matchMedia('(hover: hover) and (pointer: fine)')`
plus first `keydown`. This interface is new, not extracted.

### 9. Notifications (`Notifications`)
| Where | What |
| --- | --- |
| `src/ui/notifySettings.ts` | bot notification settings (`/api/notify/settings`), copy `notify.note`, `notify.blocked`, `notify.offline` |
| `src/ui/duelInvites.ts:82` | in-app duel invite toasts (not platform) |
| server: `server/src/notify/*` | delivery through the Telegram bot only (`notify_outbox`) |

On the web there is no channel yet (email digests or Web Push are later choices); the adapter reports
`channels: []` and the settings page explains why.

### 10. Lifecycle and diagnostics (fold into the platform object, not separate interfaces)
- `src/audio/index.ts:11,50` `onAppActive` (Telegram `activated`/`deactivated`); `visibilitychange` already covers the web.
- `src/platform/monitoring.ts:10,58` `telegramClient()` for crash reports; analytics `platform` blob (`docs/OPS.md`).
- `src/scenes/BootScene.ts:86` `initTelegram()` is the single detection point today: it becomes `detectPlatform()`.

### Telegram copy to neutralise (EN keys; RU twins exist)
`econ.outside`, `econ.outsideHint` (`src/i18n/en.army.ts:310-311`), `wallet.paying` (`en.army.ts:399`),
`notify.note`, `notify.blocked`, `notify.offline` (`en.ts:304-306`), `duels.outsideHint`
(`duels.en.ts:259`), `gap.net.outside`, `gap.err.outside` (`gaps.en.ts:10,25`), `clan.link.sent`
(`clan.en.ts:49`), `res.tip.stars`, `v3.buyConfirmTitle`, `v3.buyConfirmBody` (`v3.en.ts:17,23-24`),
`war5.outsideHint` (`war.v5.en.ts:16`). "Outside" now means "not signed in", so the copy becomes
"Sign in to play online" with a sign-in action on the web.

## Proposed `src/platform/core/` interfaces

Deletion test applied: `telegram.ts` earns its keep (deleting it would spread version checks and
try/catch into 41 files), but it is one shallow module per concern with a global singleton and no
second adapter, so the seam is hypothetical. Two adapters (Telegram, web) make it real. Keep the
interfaces small and the behaviour behind them deep.

```ts
// src/platform/core/platform.ts — chosen once in BootScene, exported as `platform`
export interface Platform {
  readonly id: 'telegram' | 'web';              // for analytics/crash reports only, never for branching in game code
  init(): Promise<void>;                        // Telegram: ready/expand/fullscreen/lock/colours; web: nothing
  readonly auth: Auth;
  readonly payments: Payments;
  readonly storage: Storage;
  readonly haptics: Haptics;
  readonly back: BackButton;                    // replaces NavHost (same four methods)
  readonly share: Share;
  readonly safeArea: SafeArea;
  readonly input: InputHints;
  readonly notifications: Notifications;
  onActive(cb: (active: boolean) => void): () => void;
  launchRoute(): string | null;                 // startapp param, shared parser in src/online/deeplink.ts
  client(): { platform: string; version?: string; language?: string };
}

export interface Auth {
  methods(): ('telegram' | 'password')[];       // what this platform can offer
  signIn(): Promise<SignInResult>;              // Telegram: initData; web: existing cookie session, else 'needs_ui'
  signOut(): Promise<void>;
  transport(): 'bearer' | 'cookie';             // ApiClient and sockets follow it
}
export interface Payments {
  status(): { available: true } | { available: false; reason: 'coming_soon' | 'offline' | 'signed_out' };
  pay(invoice: { kind: 'stars_link'; link: string }): Promise<'paid' | 'pending' | 'cancelled' | 'failed'>;
}
export interface Storage { save(): KV; device(): KV; readonly cloud: boolean }   // KV from src/game/save.ts
export interface Haptics { impact(s: 'light' | 'medium' | 'heavy'): void; notify(t: 'error' | 'success' | 'warning'): void; select(): void; setEnabled(on: boolean): void }
export interface BackButton { readonly native: boolean; setBack(cb: (() => void) | null): void; setSettings(cb: (() => void) | null): void; setClosingConfirmation(on: boolean): void }
export interface Share { invite(link: string, text: string): Promise<'shared' | 'copied' | 'failed'>; openExternal(url: string): boolean }
export interface SafeArea { onChange(cb: (device: Insets, content: Insets) => void): () => void }
export interface InputHints { keyboard(): boolean; finePointer(): boolean; onChange(cb: () => void): () => void }
export interface Notifications { channels(): ('telegram_bot')[]; }
```

Notes for the ADR:
- **Haptics keeps its 178 call sites cheap:** re-export `haptic`/`hapticNotify`/`hapticSelect` from
  `src/platform/haptics.ts` delegating to `platform.haptics`, so the migration is an import rewrite
  (one codemod), not 178 edits. The web adapter is a no-op (optionally `navigator.vibrate` on Android).
- **`online.available` becomes `auth.methods().length > 0` / "has a session",** and every
  "outside" gate becomes "signed out" with a sign-in action. This is the largest behavioural change.
- **`econ/source.ts:160` dynamic import** must go through `platform.payments`; today it bypasses the seam.
- **`ApiClient` gains a transport switch** (bearer for Telegram, `credentials: 'include'` cookie for web);
  see `HOSTING.md` for why Telegram keeps bearer tokens.
- **Each adapter gets its own test file** with a fake `TgWebApp` (exists: `attachWebApp`) and fake
  browser globals; game code is tested against a `FakePlatform`.
- A lint/grep gate (`scripts/`): no import of `src/platform/telegram/**` or `src/platform/web/**`
  outside `src/platform/`, and no `platform.id` comparisons outside `src/platform/` and telemetry.
