# Control Manifest: platform and hosting

> **Engine**: Phaser 3.90 + TypeScript + Vite (ADR-0003); Cloudflare Workers, wrangler ^4.148
> **Last Updated**: 2026-10-13
> **Manifest Version**: 2026-10-13
> **ADRs Covered**: ADR-0006 (platform layer), ADR-0007 (hosting)
> **ADRs Excluded**: ADR-0001..0005 (v5, covered by their own docs; not in this platform slice). ADR-0008..0011 (not written yet).
> **Status**: Active. Built from **Proposed** ADRs (autonomous run: logged, not asked). Regenerate when ADR-0006 or 0007 changes, or when ADR-0008..0011 are written; the full v6 manifest goes to `docs/v6/CONTROL_MANIFEST.md`.

Stories embed the `Manifest Version` above. Each rule names its source; the reasons are in the ADR. TD-MANIFEST was skipped (review mode `lean`).

## Foundation layer (engine init, platform services, save storage)

### Must
- Choose the platform once, in `selectPlatform()` called from `main.ts` before `new Phaser.Game`. — ADR-0006
- Call `platform.init()` once, from `BootScene.route()`, where `initTelegram()` was. — ADR-0006
- Put every platform capability in a `src/platform/core/` interface and implement it in **every** adapter in the same commit, with a test in each adapter's test file. — ADR-0006
- Give each adapter factory its globals as an injected `env`, so its tests run in vitest without a DOM. — ADR-0006
- Keep `KV` in `src/platform/core/storage.ts` (re-exported by `src/game/save.ts`). Save data goes through `platform.storage.save()`, device-only data through `platform.storage.device()`. — ADR-0006
- Install `FakePlatform` with `setPlatformForTests()` in any test that touches platform behaviour. — ADR-0006
- Keep `tests/platformBoundary.test.ts` green. Its migration allowlist may only shrink, and it is deleted at M10. — ADR-0006
- Land migration steps M1 to M10 in order, one commit each, each passing tsc, vitest and the smoke scripts in Telegram emulation. — ADR-0006

### Never
- Never import `src/platform/{telegram,web,steam,mobile}/**` or `src/platform/detect.ts` from outside `src/platform/`. — ADR-0006
- Never touch `window.Telegram`, `Telegram.WebApp`, `TelegramWebviewProxy` or load `telegram-web-app.js` outside `src/platform/telegram/`. — ADR-0006
- Never re-detect the platform or swap the adapter after startup. — ADR-0006
- Never let an adapter import from `src/scenes`, `src/ui`, `src/online`, `src/duel`, or (except `import type`) `src/game`. — ADR-0006
- Never put platform branches inside a shared module (the "grow telegram.ts with web fallbacks" approach). — ADR-0006
- Never thread the platform through scene `init` data or constructors; use the `platform` facade. — ADR-0006
- Never load the Telegram SDK script on the plain web. — ADR-0006

## Feature layer (online, duels, war, clans, shop, accounts)

### Must
- Gate online features on session state (`online.signedIn`, `online.canSignIn()`), not on the platform. — ADR-0006
- Pick the API transport from `platform.auth.transport`: bearer header with `credentials: 'omit'` (Telegram), or same-origin cookies (web). — ADR-0006, ADR-0007
- Pay only through `platform.payments`: show Stars copy only for `provider: 'telegram_stars'`, and the `reason` when `available` is false. — ADR-0006
- Build invite links with `platform.share.inviteUrl()` and pick "sent" or "copied" copy from `share.invite()`'s result. — ADR-0006
- Read the launch route from `platform.launchParam()`, parsed by `src/online/deeplink.ts`. — ADR-0006

### Never
- Never read `platform.id` or compare platform names in game code (only `src/platform/analytics.ts` and `monitoring.ts` may, for telemetry). — ADR-0006
- Never reintroduce `online.available`, `inTelegram()`, `initTelegram()` or `telegramInitData()` outside the Telegram adapter. — ADR-0006
- Never change the server's invoice or grant logic for a new payment provider; add an adapter. — ADR-0006

## Presentation layer (UI, copy, input, audio)

### Must
- Call haptics through `src/platform/haptics.ts` (`haptic`, `hapticNotify`, `hapticSelect`, `setHaptics`). — ADR-0006
- Draw the in-game back arrow when `platform.back.native` is false. — ADR-0006
- Offer keyboard bindings and hints only when `platform.input.keyboard()` is true. — ADR-0006
- Write signed-out copy ("Sign in to play online"), not "inside Telegram" copy, and add EN and RU for every new string. — ADR-0006
- Take safe-area insets from `platform.safeArea`. — ADR-0006

### Never
- Never handle Escape in the web adapter; Escape belongs to the input layer, which calls `nav.back()`. — ADR-0006
- Never name a platform in an i18n key or text when a capability can say it. — ADR-0006

## Hosting and server (both Workers, CI)

### Must
- Serve the game, `/api/*`, `/ws/*`, `/admin*` and the Telegram webhook only from `play.pixelarrow.app` (Worker `pixelarrow`, `wrangler.jsonc`). — ADR-0007
- Serve the landing, its media, SEO files and the legal pages (`/terms`, `/privacy`, `/refunds`, `/ru/*`, same paths as today) from `pixelarrow.app` (Worker `pixelarrow-landing`, `landing/wrangler.jsonc`, `landing/dist`). — ADR-0007
- Keep the landing a separate package in `landing/` that shares no code with the game bundle. — ADR-0007
- Reach the stats from the landing only through its `/api/public/*` proxy: GET only, rate-limited per `CF-Connecting-IP`, `caches.default` first, the `GAME` service binding on a miss with no forwarded cookies or auth, a stale copy or `503 {"state":"unavailable"}` on failure. — ADR-0007
- Redirect `/?startapp=` and `/?tgWebAppStartParam=` on the apex with a 302 to play (query kept), and keep the inline hash redirect for `tgWebApp` launches in the landing `index.html`. — ADR-0007
- Name the web session cookie `__Host-pa_session`: `Secure; HttpOnly; Path=/; SameSite=Lax`, no `Domain`. — ADR-0007
- Accept `Authorization: Bearer` first, then the cookie, both resolving to the same player id. — ADR-0007
- Require `Origin: https://play.pixelarrow.app` (or a `.dev.vars` dev origin) on cookie-authenticated state-changing requests and on cookie-authenticated WebSocket upgrades; answer 403 otherwise. — ADR-0007
- Send `Content-Security-Policy: frame-ancestors 'self' https://web.telegram.org` on play's responses, with a server test; send `frame-ancestors 'none'` on the landing. — ADR-0007
- Keep the game's CORS allow-list to `https://play.pixelarrow.app` and `https://web.telegram.org`; dev origins only from `.dev.vars`. — ADR-0007
- In `deploy.yml`, run game jobs only on game paths and landing jobs only on `landing/**` (or the `target` input); when both run, deploy the game first. — ADR-0007
- Pass `wrangler deploy --dry-run` on both configs as a gate of the hosting story. — ADR-0007
- Put every dashboard step (custom domains, www redirect rule, HSTS, BotFather URL, `setWebhook`, `/setdomain`, deploy order) in `docs/v6/OWNER_ACTIONS.md`. — ADR-0007, brief

### Never
- Never deploy, push, apply remote D1 migrations or change DNS from this run. — brief, ADR-0007
- Never serve the landing from the game Worker or route by `Host` in one Worker. — ADR-0007
- Never use cookies for the Telegram adapter; it keeps bearer tokens (Telegram Web's iframe makes cookies third-party). — ADR-0007
- Never set `Domain=.pixelarrow.app` (or any `Domain`) on the session cookie. — ADR-0007
- Never send `access-control-allow-credentials: true`, and never add the apex to the game's CORS allow-list. — ADR-0007
- Never put the API on its own host, and never call the API cross-origin from the landing. — ADR-0007
- Never send `X-Frame-Options` from play. — ADR-0007
- Never give the landing Worker D1, Durable Object bindings or secrets. — ADR-0007
- Never commit secrets; use `.dev.vars` examples and published test keys. — brief

## Performance guardrails
- The landing Worker runs only for `/` and `/api/public/*`; all other landing paths are static. — ADR-0007
- Stats responses are edge-cached (default `s-maxage=60`, final TTL in ADR-0010). — ADR-0007
- The web game never requests `telegram.org`. — ADR-0006

## Cross-cutting
- Story review rejects any change that adds a platform check to game code or grows the boundary allowlist (brief: "the platform rule is a review gate"). — ADR-0006, brief
- Local servers use the story's port range from V6-002 with `--strictPort` (or `--port` plus a fixed inspector port for wrangler). — V6-002, ADR-0007
