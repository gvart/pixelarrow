# ADR-0006: The platform layer

## Status
Accepted (Director, 2026-10-13, V6-012)

## Date
2026-10-13

## Last Verified
2026-10-13

## Decision Makers
Autonomous v6 run, story P2-ARCH-PLAT, written in the `technical-director` role. The owner set the rule (V5-076, v6 brief Goal 4) and delegated the design. The Director moves this ADR to Accepted by logging it in `docs/v6/DECISIONS.md`.

## Summary
Every Telegram call already lives in one file, `src/platform/telegram.ts`, but 41 files import it directly (about 203 call sites, 178 of them haptics), and "is this Telegram?" leaks into game code through `online.available` and `inTelegram()`. This ADR puts ten small interfaces in `src/platform/core/`, one adapter per platform (`src/platform/telegram/`, `src/platform/web/`, with room for `steam/` and `mobile/`), picks the adapter once at startup, and enforces "no platform checks in game code" with a boundary test.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 + TypeScript + Vite (ADR-0003) |
| **Domain** | Core (platform services: identity, storage, payments, device integration) |
| **Knowledge Risk** | LOW for Phaser (the layer imports no Phaser). MEDIUM for the Telegram WebApp SDK: version-gated calls (`requestFullscreen` and `lockOrientation` need Bot API 8.0, `SettingsButton` 7.0, `CloudStorage` 6.9, `disableVerticalSwipes` 7.7) keep the guards they have in `telegram.ts` today. |
| **References Consulted** | `docs/v6/audit/PLATFORM.md`, `docs/v6/audit/HOSTING.md`, `src/platform/telegram.ts`, `src/platform/nav.ts` (`NavHost`), `src/platform/online.ts` (`OnlineDeps`, `available`), `src/platform/storage.ts`, `src/scenes/BootScene.ts` (`route()`), `tests/nav.test.ts`, ADR-0002 (save KV), ADR-0004 (input layer). Context7 was not reachable in this run (the MCP server needs authorisation). |
| **Post-Cutoff APIs Used** | None new. Web adapter: `navigator.share`, `navigator.clipboard`, `matchMedia('(hover: hover) and (pointer: fine)')`, `popstate`, `beforeunload`, all long-standing browser APIs. |
| **Verification Required** | Per-adapter test files (see "Testing"); `tests/platformBoundary.test.ts` green with an empty allowlist; `scripts/smoke.mjs` and `scripts/tutorial-smoke.mjs` in Telegram emulation and in a plain browser; layout-check across the v6 matrix (the safe-area wiring moves). |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0002 (the `KV` storage contract), ADR-0003 (engine) |
| **Enables** | ADR-0007 (hosting: the transport split), ADR-0008 (auth and sessions: the web `Auth` adapter), ADR-0009 (account linking), the ADR-0004 keyboard amendment (`InputHints`), the web payments placeholder (brief Goal 7) |
| **Blocks** | The v6 Foundation platform epic, every accounts, payments and share story, and the web "Sign in to play online" UI |
| **Ordering Note** | Migration steps M1 to M10 below are behaviour-preserving in Telegram and land in order, one commit each. M6 (auth) needs the server session probe from ADR-0008 only for the web to sign in; until then the web adapter offers no method, which is today's behaviour. |

## Context

### Problem Statement
v6 makes the game run in a browser at play.pixelarrow.app as well as inside Telegram, and V5-076 says no `if (telegram)` in game code. Today the Telegram module is the only implementation and game files call it by name. A second platform built the same way would add a branch at each of the 203 call sites. The seam exists in spirit (one file owns the SDK) but has a single adapter, so it is hypothetical; the web makes it real.

### Constraints
- No live users (V5-074): no save migration or old-client compatibility, but the Telegram game must behave exactly as in v5 after every migration step.
- Surgical: the 178 haptic call sites must not be hand-edited.
- No new npm dependency; no lint toolchain exists (no ESLint in `package.json`), so enforcement must use vitest, which CI already runs.
- The Telegram SDK script (`telegram-web-app.js`) must not load on the plain web (it costs up to 4 s of timeout today when it fails).
- Steam (Electron or Tauri) and mobile (Capacitor) are later builds, not runtime-sniffed browsers.

### Requirements
- Interfaces for auth, payments, storage, haptics, back button, share and invite, safe area, input hints and notifications, plus a `Platform` that holds them.
- One detection, once, at startup. Nothing re-detects later.
- Each adapter tested on its own; game code tested against a fake.
- A check that fails CI when game code imports an adapter or tests the platform.

## Decision

### Layout

```
src/platform/
  core/                 interfaces and shared types only, no runtime code, no globals
    platform.ts         Platform, PlatformId, ClientInfo
    auth.ts payments.ts storage.ts haptics.ts back.ts share.ts
    safeArea.ts input.ts notifications.ts
    index.ts            re-exports the types
  telegram/             the Telegram adapter (today's telegram.ts, split by concern)
    index.ts            createTelegramPlatform(env): Platform
    sdk.ts              script loader, TgWebApp type, version gates
    auth.ts payments.ts storage.ts haptics.ts back.ts share.ts safeArea.ts input.ts
  web/                  the browser adapter
    index.ts            createWebPlatform(env): Platform
    auth.ts payments.ts storage.ts haptics.ts back.ts share.ts safeArea.ts input.ts
  steam/  mobile/       (later; same shape)
  detect.ts             detectPlatformId(hints) (pure) and createPlatform(id, env)
  index.ts              the facade: `platform`, initPlatform(), setPlatformForTests()
  haptics.ts            haptic(), hapticNotify(), hapticSelect(), setHaptics(): one-line
                        delegates to platform.haptics, so the 178 call sites keep their names
```

The other files already in `src/platform/` (`api.ts`, `online.ts`, `cloud.ts`, `nav.ts`, `storage.ts`, `safeArea.ts`, `analytics.ts`, `monitoring.ts`, ...) are platform-neutral services. They stay, and they reach the platform only through `platform` from `src/platform/index.ts`.

### Detection, once

1. `main.ts` calls `selectPlatform()` from `src/platform/index.ts` before `new Phaser.Game`. It is synchronous: `detectPlatformId()` reads launch hints only and the matching factory builds the adapter. From then on `platform` is fixed for the session.
   - Telegram when the URL hash or query carries `tgWebApp*`, `window.TelegramWebviewProxy` exists, or `window.Telegram.WebApp.initData` is non-empty (today's `launchedFromTelegram()`; Telegram puts the launch data in the hash, which a plain web visit never has).
   - Web otherwise.
   - A build-time `import.meta.env.VITE_PLATFORM` (`steam`, `mobile`) wins over the hints for those future builds.
   - In dev builds only, `?platform=web|telegram` overrides the hints so scripts can test both.
2. `BootScene.route()` calls `await platform.init()` exactly where it calls `initTelegram()` today (the boot screen covers the wait). Telegram's `init()` loads the SDK (4 s timeout), then `ready`, `expand`, fullscreen on phones, portrait lock, colours and its event wiring. The web `init()` resolves at once.
3. If the Telegram SDK fails to load, the Telegram adapter stays selected and degrades: `auth.silentProof()` returns null, haptics and Back are no-ops, `back.native` is false. The game does not switch to the web adapter mid-session.
4. `platform.id` exists for analytics, crash reports and the boundary allowlist only. Game code never reads it.

### Key Interfaces

```ts
// core/platform.ts
export type PlatformId = 'telegram' | 'web' | 'steam' | 'mobile';
export interface Platform {
  readonly id: PlatformId;                         // telemetry only
  init(): Promise<void>;                           // once, from BootScene
  readonly auth: Auth;
  readonly payments: Payments;
  readonly storage: Storage;
  readonly haptics: Haptics;
  readonly back: BackButton;
  readonly share: Share;
  readonly safeArea: SafeArea;
  readonly input: InputHints;
  readonly notifications: Notifications;
  onActive(cb: (active: boolean) => void): () => void;  // Telegram activated/deactivated; web visibilitychange
  launchParam(): string | null;                    // startapp; parsed by the shared src/online/deeplink.ts
  client(): { platform: string; version?: string; language?: string };  // crash reports, language hint
}

// core/auth.ts: the adapter supplies platform facts; Online (src/platform/online.ts) does the network
export type AuthMethod = 'telegram' | 'password';
export type AuthProof = { kind: 'telegram'; initData: string };
export interface Auth {
  readonly transport: 'bearer' | 'cookie';         // ApiClient and the sockets follow it (ADR-0007)
  methods(): AuthMethod[];                         // Telegram: ['telegram']; web: ['password'] once ADR-0008 lands, [] before
  silentProof(): AuthProof | null;                 // Telegram: initData; web: null (a cookie session may already exist)
}

// core/payments.ts: the server's invoice and grant logic do not change
export type PaymentStatus =
  | { available: true; provider: 'telegram_stars' }
  | { available: false; reason: 'coming_soon' | 'signed_out' | 'offline' };
export interface Payments {
  status(): PaymentStatus;
  pay(invoice: { provider: 'telegram_stars'; link: string }): Promise<'paid' | 'pending' | 'cancelled' | 'failed'>;
}

// core/storage.ts: KV moves here from src/game/save.ts (save.ts re-exports it)
export interface Storage {
  save(): KV;                                      // Telegram: CloudStorage + localStorage mirror; web: localStorage
  device(): KV;                                    // this device only (bindings, map view, monitoring)
  readonly roams: boolean;                         // the save follows the account to other devices
}

// core/haptics.ts: the cue set is already neutral (src/audio/haptics.ts)
export interface Haptics {
  impact(s: 'light' | 'medium' | 'heavy'): void;
  notify(t: 'error' | 'success' | 'warning'): void;
  select(): void;
  setEnabled(on: boolean): void;
}

// core/back.ts: replaces NavHost's three platform methods (feedback moves to haptics.select)
export interface BackButton {
  readonly native: boolean;                        // false: the game draws its own back arrow
  setBack(cb: (() => void) | null): void;
  setSettings(cb: (() => void) | null): void;      // Telegram's ⋯ menu item; web no-op
  setClosingConfirmation(on: boolean): void;       // Telegram API; web beforeunload
}

// core/share.ts
export interface Share {
  inviteUrl(param: string): string;                // Telegram: t.me/<bot>/<app>?startapp=; web: https://play.pixelarrow.app/?startapp=
  invite(url: string, text: string): Promise<'shared' | 'copied' | 'failed'>;  // copy follows the result
  openExternal(url: string): boolean;
}

// core/safeArea.ts
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface SafeArea {
  current(): { device: Insets; content: Insets };
  onChange(cb: (device: Insets, content: Insets) => void): () => void;
}

// core/input.ts: new; consumed by the keyboard and mouse work (ADR-0004 amendment)
export interface InputHints {
  keyboard(): boolean;                             // a physical keyboard is likely or has been used
  finePointer(): boolean;
  onChange(cb: () => void): () => void;
}

// core/notifications.ts
export type NotificationChannel = 'telegram_bot';
export interface Notifications { channels(): NotificationChannel[] }   // web: [] until a channel exists
```

Behaviour per adapter:

| Interface | Telegram adapter | Web adapter |
| --- | --- | --- |
| Auth | bearer; `['telegram']`; initData | cookie; `['password']` after ADR-0008, `[]` before; no proof |
| Payments | Stars: `openInvoice`, exactly as today | `coming_soon`; the shop shows the reason (brief Goal 7) |
| Storage | CloudStorage primary + localStorage mirror (today's `gameKV()`); `roams: true` | localStorage (`safeLocalStorage()`); `roams: false` until the account save sync covers it |
| Haptics | `HapticFeedback.*` behind the Settings toggle | no-op (optionally `navigator.vibrate` on Android, behind the same toggle) |
| BackButton | native `BackButton`, `SettingsButton`, closing confirmation | `native: false`; `popstate` (browser and Android back) calls the back callback; `beforeunload` guards battles; Escape belongs to the input layer, which calls `nav.back()` |
| Share | `openTelegramLink(t.me/share/url…)` | `navigator.share`, else clipboard |
| SafeArea | `safeAreaInset` / `contentSafeAreaInset` + events | `env(safe-area-inset-*)` read through CSS, content insets zero |
| InputHints | `telegramClient().platform` in `tdesktop`, `macos`, `weba` hints a keyboard; plus first `keydown` | `matchMedia('(hover: hover) and (pointer: fine)')` plus first `keydown` |
| Notifications | `['telegram_bot']` | `[]`; Settings explains there is no channel yet |

### Architecture Diagram

```
                 main.ts ── selectPlatform() (sync, once) ──┐
                                                            ▼
 game code (scenes, ui, game, online, duel, audio)   src/platform/index.ts  `platform`
   │  imports only: src/platform (facade),                  │ holds one Platform
   │  src/platform/core (types), neutral services           ▼
   │                                          ┌──────────────┴──────────────┐
   ▼                                          ▼                             ▼
 haptic(), nav, online, api,         platform/telegram/*            platform/web/*
 gameKV(), safeArea ... ──────▶      (Telegram SDK, the only        (DOM, navigator,
 (neutral services read              place that touches             localStorage)
  `platform`, never `.id`)           window.Telegram)
```

### Implementation Guidelines
- Game code must import platform behaviour only from `src/platform` (the facade `index.ts`), `src/platform/core/*` (types), `src/platform/haptics.ts` and the existing neutral services. It must never import `src/platform/{telegram,web,steam,mobile}/**` or `src/platform/detect.ts`.
- Game code must never read `platform.id` and never compare platform names. Branch on a capability instead: `auth.methods()`, `payments.status()`, `back.native`, `share.invite()`'s result, `input.keyboard()`, `notifications.channels()`, or `online.signedIn`.
- Only `src/platform/telegram/` may touch `window.Telegram`, `TelegramWebviewProxy` or load `telegram-web-app.js`.
- Adapters must not import from `src/scenes`, `src/ui`, `src/game` (apart from `import type`), `src/online` or `src/duel`. Dependencies point inward: game code → facade → core ← adapters.
- Each adapter factory must take its globals as an injected `env` (window-like object, navigator, storage, timers) so its tests run in vitest's Node environment without a DOM.
- Detection must happen once, in `selectPlatform()`. Nothing else may re-detect or swap the adapter at runtime (tests use `setPlatformForTests()`).
- A new platform capability must be added to a `core/` interface and implemented by every adapter in the same commit, with a test in each adapter's file.
- Platform-specific copy must not hard-code a platform in the i18n key or text when a capability can say it: "outside Telegram" becomes "signed out" ("Sign in to play online"), Stars legal copy is keyed to `provider: 'telegram_stars'`. Every new string needs EN and RU.

### Enforcement: `tests/platformBoundary.test.ts`
A vitest file, so CI enforces it with no new tooling. It walks `src/**/*.ts` with `fs` and fails with the file and line when:

1. A file outside `src/platform/` imports a path matching `platform/(telegram|web|steam|mobile)(/|')` or `platform/detect`.
2. A file outside `src/platform/telegram/` mentions `window.Telegram`, `Telegram.WebApp`, `TelegramWebviewProxy` or `telegram-web-app.js`.
3. A file outside `src/platform/` (other than the telemetry allowlist `src/platform/analytics.ts`, `src/platform/monitoring.ts`) contains `platform.id` or `=== 'telegram'` / `=== 'web'` comparisons on a platform value.
4. Any file outside `src/platform/telegram/` uses the retired names `inTelegram`, `initTelegram`, `telegramInitData`, or `online.available`.
5. An adapter imports from `src/scenes`, `src/ui`, `src/online`, `src/duel`, or `src/game` (non-type imports).

During migration the test carries an explicit `ALLOWLIST` of files not yet moved. It also fails when a listed file no longer violates, so the list can only shrink. M10 ends with the allowlist empty and deleted. A story review rejects any change that adds to it (brief: "the platform rule is a review gate").

### Testing

| Module | Test file | How |
| --- | --- | --- |
| Interfaces (contract) | `tests/platform/contract.ts` (shared suite) | one `describe` per adapter runs the same cases: haptics never throw when disabled, `back.setBack(null)` clears, `share.invite` returns one of its three results, `payments.status()` is well-formed, `storage.save()` round-trips a value, `safeArea.onChange` unsubscribes. |
| Telegram adapter | `tests/platform/telegram.test.ts` | a fake `TgWebApp` (today's `attachWebApp(wa)` seam) with recorded calls: version gates (6.0 vs 8.0 client), fullscreen only on phones, CloudStorage timeout fallback to the mirror, Back and Settings button wiring, `openInvoice` status mapping, `inviteUrl` format, `silentProof()` with and without initData. |
| Web adapter | `tests/platform/web.test.ts` | a fake `env`: `matchMedia`, `navigator.share` present and absent, a clipboard that rejects, an in-memory `localStorage`, a `history` that fires `popstate`, `beforeunload` registration while closing confirmation is on. |
| Detection | `tests/platform/detect.test.ts` | `detectPlatformId()` on hash `#tgWebAppData=…`, query `?tgWebAppStartParam=`, a webview proxy, plain `https://play.pixelarrow.app/`, `VITE_PLATFORM`, and the dev override. |
| Game code | existing tests | a `FakePlatform` (`tests/fakes/platform.ts`) installed with `setPlatformForTests()`, recording haptic cues, back callbacks, shares and payments. `tests/nav.test.ts` keeps its mock, now typed as `BackButton`. `Online` tests inject an `Auth` fake instead of `initData`. |
| Boundary | `tests/platformBoundary.test.ts` | as above. |

End to end, the smoke scripts run twice: once with Telegram emulation (the hash launch data they use today) and once as a plain browser (`?platform=web` in dev, or no hints).

## Alternatives Considered

### Alternative 1: Keep `telegram.ts` and add `if (inTelegram())` branches for the web
- **Description**: Grow the existing module with web fallbacks in each export.
- **Pros**: Fewest files; it already falls back to `window.open` in places.
- **Cons**: One shallow module per concern with a global singleton; every platform adds a branch to every function; untestable per platform; Steam and mobile multiply it.
- **Rejection Reason**: It is the `if (telegram)` the owner banned, moved one file down. Never put platform branches inside a shared module.

### Alternative 2: Dependency injection of the platform into each scene
- **Description**: Pass a `Platform` through scene `init` data or a Phaser plugin, no module-level `platform`.
- **Pros**: No global; scenes are explicit about what they use.
- **Cons**: Touches every scene constructor, every `scene.start()` call and the 178 haptic call sites in widgets that have no scene handle; a large diff for no behaviour gain.
- **Rejection Reason**: The facade plus `setPlatformForTests()` gives the same test seam at a fraction of the change. Never thread the platform through scene data.

### Alternative 3: Build-time platform selection (two bundles)
- **Description**: `VITE_PLATFORM=telegram` and `=web` builds served from different paths.
- **Pros**: Dead code for the other platform is stripped.
- **Cons**: play.pixelarrow.app is one URL for both (the owner points the Mini App at it); two builds double CI and the layout matrix; the Telegram adapter is small.
- **Rejection Reason**: Runtime detection is required for the shared URL. Build-time selection is kept only for future non-browser shells (Steam, mobile), where it is the natural fit.

### Alternative 4: Re-detect lazily wherever needed
- **Description**: Each service checks `window.Telegram` when it first needs it.
- **Rejection Reason**: Many detection points disagree at edge cases (SDK still loading); the brief requires one detection at startup.

## Consequences

### Positive
- The web game becomes a second adapter, not 203 edits; Steam and mobile are a third and fourth folder.
- Every platform behaviour has a test with a fake, and game code tests stop depending on Telegram globals.
- The hidden check (`online.available`) becomes a real state (`signedIn`), which the web sign-in UI needs anyway.
- `src/ui/econ/source.ts`'s dynamic import of Telegram (the one place that bypassed the injected seam) goes away.

### Negative
- A module-level `platform` is a global; tests must reset it (`setPlatformForTests()` in a shared setup).
- More files: ten small interface files and two adapter folders replace one 358-line module.
- The Telegram adapter still ships in the web bundle (a few KB). Accepted; the SDK script itself is never loaded on the web.

## Risks
- **Behaviour drift in Telegram during the move.** Mitigation: M1 to M10 are each behaviour-preserving, each runs the smoke scripts in Telegram emulation, and the old `telegram.ts` stays as a shim until M10.
- **Launch hints miss a Telegram client** (a client that passes launch data differently). Mitigation: the hints are today's proven `launchedFromTelegram()`; the detect test pins them; a miss degrades to the web adapter, where the game still works signed out.
- **The boundary test is evaded** (an alias import, a string built at runtime). Mitigation: it is a review aid, not a proof; story review still checks diffs for platform branching.
- **Web `popstate` and Phaser history.** The game does not use the History API today; the web adapter pushes one guard entry per open layer. Verify with the smoke run that browser Back closes sheets and never leaves the page mid-battle without the `beforeunload` prompt.
- **Copy regressions** when 13 "outside Telegram" keys (and RU twins) become "signed out" copy. Mitigation: `tests/gaps.test.ts`-style key checks and a screenshot pass in both languages.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| systems-index #12 Platform layer | V5-076: neutral interfaces, one adapter per platform, detection once, no platform checks in game code | The layout, detection, interfaces and boundary test above |
| v6 brief Goal 7 (payments) | Telegram keeps Stars; web shows "coming soon" with a reason, ready for a provider without touching the shop or the server grant logic | `Payments.status()` and `pay()`; a provider is a new adapter implementation |
| v6 brief Goal 3 (keyboard) | Bindings offered only where a keyboard is present | `InputHints.keyboard()` |

GDD sync: NOT ASSESSED. System #12 has no GDD (`docs/v6/ADOPT.md` §3); the brief and V5-076 are the requirements.

## Performance Implications
- **CPU**: One extra property read per haptic call (`platform.haptics.impact`). Negligible.
- **Memory**: Two small adapter objects; the unused one is never constructed.
- **Load Time**: Web: faster, since the Telegram SDK script is never requested. Telegram: unchanged (same 4 s timeout).
- **Network**: None added.

## Migration Plan
Each step is one commit on its own, keeps the Telegram game identical, and passes `npx tsc --noEmit`, `npx vitest run` and the smoke scripts.

| Step | Change | Files | Check |
| --- | --- | --- | --- |
| M1 | Add `core/` interfaces, `telegram/` adapter (code moved from `telegram.ts` and `storage.ts`), `web/` adapter, `detect.ts`, the facade and `FakePlatform`. `telegram.ts` becomes a shim that re-exports its old names delegating to `platform`. Add `platformBoundary.test.ts` with the allowlist of today's 41 importing files. | new files + `telegram.ts`, `main.ts` (`selectPlatform()`), `BootScene.ts` (`platform.init()`) | adapter, contract and detect tests |
| M2 | Haptics codemod: in the 33 files that import `haptic`, `hapticNotify`, `hapticSelect` or `setHaptics` from `platform/telegram`, rewrite the import line to `platform/haptics`. The 178 call sites are untouched. | 33 files, import lines only | `grep` shows 0 haptic imports from `platform/telegram`; tests |
| M3 | Back: `NavHost` is built from `platform.back` plus `platform.haptics.select`; `showInGameBack()` = `!platform.back.native`. | `nav.ts`, `tests/nav.test.ts` | nav tests; smoke Back |
| M4 | Storage: `gameKV()` returns `platform.storage.save()`; `regionMapView.ts` and `monitoring.ts` use `platform.storage.device()`. `KV` moves to `core/storage.ts`, re-exported by `save.ts`. | `storage.ts`, `state.ts`, `cloud.ts`, 2 files | save tests |
| M5 | Safe area, lifecycle, client: `safeArea.ts` uses `platform.safeArea`; `audio/index.ts` uses `platform.onActive`; `monitoring.ts` and `lang.ts` use `platform.client()`. | 4 files | layout-check; audio tests |
| M6 | Auth: `OnlineDeps.initData` becomes `auth: Auth`; `ApiClient` follows `auth.transport` (`Authorization: Bearer` + `credentials: 'omit'`, or `credentials: 'same-origin'` cookies). `online.available` is deleted. Its 17 call sites in 4 files (`online/client.ts`, `duel/client.ts`, `ui/econ/source.ts`, `BootScene.ts`) read `online.signedIn` or call `online.canSignIn()` (= `auth.methods().length > 0`). The web has no method until ADR-0008, so the web game stays offline, as today. | `online.ts`, `cloud.ts`, `api.ts`, `online/client.ts` (socket token), 4 gate files | online and api tests |
| M7 | Payments: `OnlineDeps.openInvoice` becomes `platform.payments`; the dynamic `import('../../platform/telegram')` in `econ/source.ts` goes; `ShopScene` shows Stars legal copy only for `provider: 'telegram_stars'` and the reason otherwise. | `online.ts`, `econ/source.ts`, `ShopScene.ts` | payments tests |
| M8 | Share and launch: `ClanScene` uses `platform.share.inviteUrl()` and `invite()` and chooses "sent" or "copied" by the result (`inTelegram()` removed); `BootScene` reads `platform.launchParam()`; `openExternalLink` → `platform.share.openExternal`. | `ClanScene.ts`, `BootScene.ts`, `notifySettings.ts`, `ShopScene.ts` | deeplink and clan tests |
| M9 | Copy: the 13 "inside Telegram" keys and their RU twins become signed-out copy (PLATFORM.md list). | i18n files | i18n key tests; screenshots EN and RU |
| M10 | Delete the `telegram.ts` shim and the boundary allowlist. | 2 files | boundary test strict |

M1 to M5 and M8 are mechanical and can be one story. M6 and M7 change behaviour on the web only and pair with the accounts and payments stories. M9 goes with the sign-in UI.

## Validation Criteria
- `tests/platformBoundary.test.ts` passes with no allowlist.
- `grep -rn "platform/telegram" src --include='*.ts'` finds nothing outside `src/platform/`.
- The Telegram smoke and tutorial smoke pass unchanged after every step.
- The web game at `?platform=web` boots with no request to `telegram.org`, plays campaign offline, and shows "Sign in to play online" where Telegram showed "inside Telegram".
- Adding a third adapter (a test-only `steam` stub that satisfies the contract suite) needs no change outside `src/platform/`.

## Related
- `docs/v5/DECISIONS.md` V5-076; `docs/v6/DECISIONS.md` V6-009
- `docs/v6/audit/PLATFORM.md` (touchpoints), `docs/v6/audit/HOSTING.md`
- ADR-0002 (save KV), ADR-0004 (input layer; its keyboard amendment consumes `InputHints`), ADR-0007 (hosting: transport and cookies), ADR-0008 (auth and sessions, planned), ADR-0009 (account linking, planned)
- `docs/v6/plan/CONTROL_MANIFEST_PLATFORM.md`
