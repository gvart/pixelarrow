# ADR-0007: Hosting: two Workers for pixelarrow.app and play.pixelarrow.app

## Status
Proposed

## Date
2026-10-13

## Last Verified
2026-10-13

## Decision Makers
Autonomous v6 run, story P2-ARCH-PLAT, written in the `technical-director` role. The owner chose the two hosts (v6 brief Goal 1) and delegated the hosting design. This ADR confirms V6-009 with five amendments (listed under "Amendments to V6-009"). The Director moves it to Accepted by logging it in `docs/v6/DECISIONS.md`.

## Summary
v6 splits one domain into a landing site (pixelarrow.app, plus www) and the game (play.pixelarrow.app, web and Telegram). This ADR keeps the existing game Worker, with its API, Durable Objects and D1, and moves it to play.pixelarrow.app on the same origin as its API. It adds a separate assets-first landing Worker that serves the apex and www, the legal pages, an old-link redirect and an edge-cached `/api/public/*` proxy reached through a service binding. Each site builds and deploys on its own.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 + TypeScript + Vite (ADR-0003) for the game; Cloudflare Workers with static assets, wrangler ^4.148 (`server/package.json`) |
| **Domain** | Networking / deployment |
| **Knowledge Risk** | MEDIUM. Phaser is unaffected. The Cloudflare features used (Workers static assets with `run_worker_first` as a route list, custom domains, service bindings, the Cache API, the Workers rate-limiting binding, multi-config `wrangler dev`) exist in wrangler 4, but this run could not check current docs: Context7 was not reachable (the MCP server needs authorisation). |
| **References Consulted** | `docs/v6/audit/HOSTING.md`, `docs/v6/audit/PLATFORM.md`, `docs/v6/DECISIONS.md` V6-002, V6-009, V6-011, `wrangler.jsonc`, `.github/workflows/deploy.yml`, `server/src/index.ts` (CORS), `server/src/middleware.ts` (Bearer), `server/package.json`, `public/` (legal pages) |
| **Post-Cutoff APIs Used** | None knowingly. To verify: `assets.run_worker_first` accepting `"/"` as an exact route alongside globs; `services` bindings between two Workers deployed from one repo; `ratelimits` binding syntax. |
| **Verification Required** | `npx wrangler deploy --dry-run` on both configs (no deploy); `wrangler dev` with both configs locally, on free ports in the story's 61n0 to 61n9 range (V6-002), proving: the landing proxy answers `/api/public/*` through the binding, `/?startapp=x` gets a 302 to play, the play session cookie never reaches the landing host, and the game in a Telegram-emulated iframe still signs in with a bearer token. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0006 (the platform layer: `Auth.transport` picks bearer or cookie) |
| **Enables** | ADR-0008 (auth and sessions: cookie attributes, CSRF), ADR-0010 (public stats API: the proxy and cache it sits behind), ADR-0011 (landing stack and performance budget: what the landing build outputs) |
| **Blocks** | The hosting split story, the landing build and deploy job, every change to `deploy.yml`, `wrangler.jsonc` and bot links |
| **Ordering Note** | The config and CI changes can merge before the landing page exists (an empty landing build is valid). The live cutover is an owner action in a fixed order (see "Cutover"). |

## Context

### Problem Statement
Today one Worker, `pixelarrow`, serves the game's static build and the API on `pixelarrow.app`. The owner wants the apex to become a marketing landing page and the game to move to `play.pixelarrow.app`, reachable from a browser and as the Telegram Mini App URL. Hosting, the API location, cookies, CORS and deploys must be decided before the landing, accounts and stats stories start.

### Constraints
- Never deploy, push, run remote migrations or change DNS in this run; describe the changes and list owner actions.
- A game deploy restarts Durable Objects and ends live duels (`docs/OPS.md`); a landing edit must not do that.
- Telegram Web shows the Mini App in an iframe on `web.telegram.org`, where a cookie from play.pixelarrow.app is third-party (Safari blocks it, Chrome needs `Partitioned`). Telegram therefore keeps bearer tokens.
- No live users (V5-074): old URLs need only a cheap redirect, not long-term compatibility.
- One Cloudflare account and zone; stay on one product (Workers).

### Requirements
- Game and API on one origin (no CORS for the game, cookies first-party).
- Landing English-only, static, fast, separate from the game bundle.
- Live public stats on the landing without credentials, cached, rate-limited.
- Each site built, tested and deployed independently.

## Decision

### Two Workers

| | Game Worker (existing) | Landing Worker (new) |
| --- | --- | --- |
| Name | `pixelarrow` | `pixelarrow-landing` |
| Config | `wrangler.jsonc` (repo root) | `landing/wrangler.jsonc` |
| Hosts | `play.pixelarrow.app` (custom domain) | `pixelarrow.app`, `www.pixelarrow.app` (custom domains) |
| Code | `server/src/index.ts` (unchanged role) | `landing/worker/index.ts` (about 80 lines) |
| Assets | `./dist` (the game build), SPA fallback | `landing/dist` (the landing build: pages, media, legal pages, `robots.txt`, `sitemap.xml`), `404-page` handling |
| Worker runs first for | `/api/*`, `/ws/*`, `/admin`, `/admin/*` (unchanged) | `/api/public/*` and `/` only |
| Bindings | D1, Durable Objects, Analytics Engine, crons, secrets (unchanged) | `GAME` service binding to `pixelarrow`; a rate-limit binding; no D1, no DO, no secrets |

### Routes and DNS
- Each host is a Workers **custom domain**, which creates its proxied DNS record and certificate. No manual A or CNAME records.
- `www.pixelarrow.app` → `https://pixelarrow.app/$path` with a 301 by a zone **Single Redirect rule** (owner action), so that no Worker runs for it. The www custom domain stays on the landing Worker as the fallback if the rule is missing.
- The apex moves from the game Worker to the landing Worker (see "Cutover").
- The Telegram bot webhook moves to `https://play.pixelarrow.app/api/telegram/webhook` (owner re-runs `setWebhook`; `server/scripts/bot-setup.mjs` gets the new URL).

### Where things live

| Path | Host |
| --- | --- |
| The game (`/`, assets, `?scene=Kit`) | play |
| `/api/*`, `/ws/*`, `/admin*`, the Telegram webhook | play only |
| `/api/public/*` (read-only stats, ADR-0010) | served by play; reached by the landing through its proxy |
| Landing pages, media, SEO files | apex |
| `/terms`, `/privacy`, `/refunds`, `/ru/*` | apex. They move from `public/` to the landing build at the same paths, so `LEGAL_BASE` (`src/ui/legal.ts`) and the bot's legal links (`server/src/notify/templates.ts`) stay valid. |

### Sessions: cookies for the web, tokens for Telegram
- **Telegram** (`Auth.transport = 'bearer'`, ADR-0006): initData → `POST /api/auth/telegram` → a token kept in memory, sent as `Authorization: Bearer`, `credentials: 'omit'`, and in `Sec-WebSocket-Protocol` for sockets. Exactly as today.
- **Web** (`Auth.transport = 'cookie'`): the session is a cookie set by play.pixelarrow.app, named `__Host-pa_session`, with `Secure; HttpOnly; Path=/; SameSite=Lax` and **no `Domain`** attribute (the `__Host-` prefix makes the browser enforce that). It is first-party on play and never sent to the apex. Lifetime, rotation and storage belong to ADR-0008.
- The server accepts either: an `Authorization: Bearer` header first, then the cookie. Both resolve to the same player id (linking, ADR-0009).
- **CSRF**: a cookie-authenticated request that changes state (anything but GET, HEAD, OPTIONS), and every WebSocket upgrade that relies on the cookie, must carry `Origin: https://play.pixelarrow.app` (or a dev origin from `.dev.vars`), else 403. Bearer requests are exempt because the header is not ambient.
- **Framing**: play must stay embeddable by Telegram Web. Its responses send `Content-Security-Policy: frame-ancestors 'self' https://web.telegram.org` and no `X-Frame-Options`. The landing sends `frame-ancestors 'none'`.

### CORS
- The game and its API are same-origin, so the game needs no CORS.
- The game Worker's allow-list (`server/src/index.ts`) becomes `https://play.pixelarrow.app` and `https://web.telegram.org`; `https://pixelarrow.app` is removed. It never sends `access-control-allow-credentials: true`. Dev origins come from an env var set only in `.dev.vars`.
- The landing reads stats from its own origin (the proxy), so `/api/public/*` needs no CORS either.

### The landing Worker
1. **`/api/public/*`, GET only** (other methods 405):
   - Rate limit per `CF-Connecting-IP` with the rate-limit binding (limits in ADR-0010); over the limit: 429.
   - Look up `caches.default` by the URL. On a hit, return it.
   - On a miss, call `env.GAME.fetch('https://play.pixelarrow.app' + path + search)` with a fresh `GET` and **no** forwarded cookies, auth or client headers. Store the response if it is 200 and `Cache-Control` allows it (TTL set by the game Worker, ADR-0010; default `s-maxage=60`). Also store a long-lived stale copy under a second key.
   - On an upstream error or timeout, serve the stale copy with `x-pa-stale: 1`, else `503` with `{"state":"unavailable"}`, which the landing renders as its empty state.
2. **`/`**: if the query has `startapp` or `tgWebAppStartParam`, 302 to `https://play.pixelarrow.app/` with the query kept. Otherwise `env.ASSETS.fetch(request)`.
3. Telegram passes launch data in the URL **hash**, which never reaches a server. So the landing `index.html` also carries a tiny inline script in `<head>`: if `location.hash` contains `tgWebApp`, `location.replace('https://play.pixelarrow.app/' + location.search + location.hash)`. This keeps a Mini App that still points at the apex (before the BotFather change) working.

### Build and deploy each site on its own
- **Repo layout**: the landing is a separate package in `landing/` with its own `package.json`, lockfile, build (tech chosen in ADR-0011), `worker/` and `wrangler.jsonc`. It shares no code with the game bundle. Gameplay videos and key art live under `landing/`.
- **Local dev**: `wrangler dev -c wrangler.jsonc -c landing/wrangler.jsonc` runs both Workers with the service binding working, on ports from the story's range with `--port` and an explicit inspector port (V6-002).
- **`.github/workflows/deploy.yml`** (described, not run):
  - A `changes` job computes `game` (any of `src/`, `server/`, `public/`, `index.html`, `scripts/`, `package*.json`, `vite.config.*`, `wrangler.jsonc`, `tsconfig*.json`) and `landing` (`landing/**`). `workflow_dispatch` gets an input `target: game | landing | both` that overrides it.
  - The existing `build`, `server`, `layout`, `smoke` and `deploy` jobs run only when `game` is true. `deploy` uses environment `production`, URL `https://play.pixelarrow.app`.
  - New `landing-build`: `npm ci` and the build in `landing/`, the landing checks (layout widths, Lighthouse budget from ADR-0011), and a `landing-dist` artifact.
  - New `landing-deploy`: `needs: [changes, landing-build, deploy]` with `if: always() && needs.landing-build.result == 'success' && needs.deploy.result != 'failure'`, so when both changed the game goes first, and a landing-only change never waits on or triggers a game deploy. Environment `production-landing`, URL `https://pixelarrow.app`. Command: `npx wrangler deploy --config landing/wrangler.jsonc` with the wrangler pinned in `server/`. No D1 step and no `deploy-config.mjs` (the landing config has no placeholders).
  - The workflow keeps one `concurrency: deploy` group.
- **`wrangler.jsonc`** (game): `routes` becomes `[{ "pattern": "play.pixelarrow.app", "custom_domain": true }]`; `vars.GAME_URL` becomes `https://play.pixelarrow.app`; add `vars.LANDING_URL = https://pixelarrow.app` for legal links in bot texts; update the header comment. Assets, bindings, crons and DO migrations do not change.
- **`landing/wrangler.jsonc`** (new): `name: pixelarrow-landing`, `main: worker/index.ts`, the same `compatibility_date`, `assets: { directory: ./dist, binding: ASSETS, not_found_handling: "404-page", run_worker_first: ["/api/public/*", "/"] }`, `routes` with the apex and www as custom domains, `services: [{ binding: "GAME", service: "pixelarrow" }]`, a rate-limit binding, `observability` on.
- **Other link updates**: the game's fallback invite URL (`src/online/rules.ts`, `server/src/online/clans.ts`) and the notification fallback (`server/src/notify/outbox.ts`) use play; legal links stay on the apex; `README.md`, `server/README.md`, `docs/OPS.md` and the matching tests (`server/test/notify.test.ts`, `online-social.test.ts`, `payments.test.ts`, `tests/deeplink.test.ts`) are updated.

### Cutover (owner, in this order; recorded in `docs/v6/OWNER_ACTIONS.md`)
1. Deploy the game Worker with **both** `play.pixelarrow.app` and `pixelarrow.app` as custom domains (a temporary config) so the apex keeps serving the game.
2. Set BotFather's Mini App URL and menu button to `https://play.pixelarrow.app`; re-run `setWebhook` to `https://play.pixelarrow.app/api/telegram/webhook`; if web linking uses the Telegram Login Widget (ADR-0009), set `/setdomain` to play.
3. Deploy the game Worker with only `play.pixelarrow.app` (the committed config), then deploy the landing Worker, which takes the apex and www. The gap between them is the length of one CI job.
4. Add the www Single Redirect rule and turn on HSTS for the zone.

### Architecture Diagram

```
 browser ─────────▶ pixelarrow.app / www ──▶ pixelarrow-landing Worker
                     │  static assets (pages, media, /terms, /privacy, ...)
                     │  "/"  ?startapp=  ──302──▶ play.pixelarrow.app
                     │  /api/public/*  ── rate limit ─ Cache API ─┐
                     │                                            │ service binding GAME
                     ▼                                            ▼   (no cookies, GET only)
 browser / Telegram ─▶ play.pixelarrow.app ──▶ pixelarrow Worker (game assets, /api, /ws, /admin,
   web: cookie __Host-pa_session (host-only)        webhook, /api/public/*, D1, DOs, crons)
   Telegram: Authorization: Bearer (iframe-safe)
```

### Amendments to V6-009
1. Legal pages move into the landing build at unchanged paths (V6-009 listed them only as served by the landing).
2. `www` is redirected by a zone rule, not by Worker code.
3. The landing Worker also runs first for `/` to redirect `?startapp=`, and the landing page carries the hash redirect for Telegram launches.
4. The web session cookie is `__Host-pa_session`, host-only on play, with an `Origin` check for CSRF and WebSocket upgrades.
5. Play sends `frame-ancestors 'self' https://web.telegram.org` so Telegram Web can keep embedding it.

## Alternatives Considered

### Alternative 1: One Worker, both hostnames, routed by `Host` in code
- **Description**: Add play as a second custom domain of `pixelarrow`, and choose landing or game assets by host.
- **Pros**: One config, one deploy, no service binding.
- **Cons**: Every landing edit redeploys the game Worker and restarts Durable Objects (live duels end). Running the Worker first for every asset request costs CPU and invocations. One artifact mixes two products, and auth routes must be refused on the landing host by hand.
- **Rejection Reason**: The coupling. Never serve the landing from the game Worker.

### Alternative 2: Cloudflare Pages for the landing
- **Description**: Landing as a Pages project on the apex; stats fetched cross-origin from play with an `access-control-allow-origin: https://pixelarrow.app` rule.
- **Pros**: Pages previews per branch.
- **Cons**: A second deployment product with its own config. The cross-origin stats call is uncached unless more code is added. Cloudflare now steers new static sites to Workers static assets.
- **Rejection Reason**: Same decoupling as the chosen option, at the cost of a second product and a CORS rule. Never add a cross-origin call from the landing to the API.

### Alternative 3: The API on its own host (api.pixelarrow.app)
- **Description**: Game on play, API on api, landing on apex.
- **Cons**: Every game request becomes cross-origin (preflights, CORS with credentials). The web cookie would need `SameSite=None` or a shared `Domain`. Telegram Web would be third-party for both.
- **Rejection Reason**: Same-origin API is simpler and safer. Never split the API from the game's origin.

### Alternative 4: A shared `Domain=.pixelarrow.app` cookie
- **Description**: One cookie for apex and play, so the landing could show "signed in as".
- **Cons**: Sends the session to the landing Worker and to anything else on the zone; widens the blast radius; the landing needs no identity.
- **Rejection Reason**: Never scope the session cookie beyond play.

### Alternative 5: Cookies for Telegram too
- **Rejection Reason**: Third-party in Telegram Web's iframe (blocked by Safari, `Partitioned` needed on Chrome). Telegram keeps bearer tokens.

## Consequences

### Positive
- A landing-only change deploys in one small job without touching the game, Durable Objects or D1.
- The game's security model is unchanged by the landing: same-origin API, host-only cookies, bearer tokens for Telegram.
- No CORS anywhere for normal use; one cache absorbs landing traffic for stats.
- Easy to undo: folding back into one Worker means moving an assets directory and a route.

### Negative
- Two wrangler configs, two deploy jobs and two packages to keep in step.
- A deploy order (game first) whenever the public API contract changes.
- The www redirect, HSTS and the cutover live in the dashboard, outside the repo.
- The landing Worker runs on every home-page view (for the `?startapp=` check), which counts against the Workers request quota. Acceptable at landing traffic; the alternative is the inline script only.

## Risks
- **Apex gap during cutover.** Step 3 leaves the apex unserved for the length of one CI job. Accepted (no live users); the temporary dual-domain deploy in step 1 keeps the Mini App up until BotFather points at play.
- **The service binding target is missing or renamed** (`pixelarrow`). The landing deploy fails or the proxy errors. Mitigation: the deploy order, the stale cache and the 503 empty state.
- **Cache API is per data centre.** Cold colos hit the game Worker. Mitigation: short responses, the rate limit and the game Worker's own limit (ADR-0010).
- **Client IP for rate limits.** The game Worker sees the landing as the caller. Mitigation: rate-limit at the landing; the game Worker's `/api/public/*` limits the binding as one caller with a generous bucket.
- **Telegram Web framing breaks** if a later header change adds `X-Frame-Options` or tightens `frame-ancestors`. Mitigation: a server test asserts the header on the game's HTML response.
- **Old links in sent bot messages** point at the apex. Mitigation: the `?startapp=` 302 and the hash redirect; no live users.
- **wrangler feature drift** (unverified docs this run). Mitigation: `wrangler deploy --dry-run` on both configs is a gate of the hosting story.
- **Legal text** says "a Telegram Mini App at pixelarrow.app". Rewriting it is an owner sign-off.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| v6 brief Goal 1 | pixelarrow.app = landing; play.pixelarrow.app = game for web and Telegram, detected at runtime | Two Workers, routes above; detection is ADR-0006 |
| v6 brief Goal 2 | Live stats from a public, read-only, cached, rate-limited API; landing separate from the game bundle | The `/api/public/*` proxy; `landing/` package |
| v6 brief Goal 5 | Sessions as secure cookies | `__Host-pa_session`, details in ADR-0008 |
| Hard constraints | Never deploy; owner-only steps listed | Described changes; "Cutover" for `OWNER_ACTIONS.md` |

GDD sync: NOT ASSESSED. Hosting has no GDD; the brief and V6-009 are the requirements.

## Performance Implications
- **CPU**: The landing Worker runs only for `/` and `/api/public/*`; everything else is free static serving. The game Worker is unchanged.
- **Memory**: None of note.
- **Load Time**: The landing never loads the game bundle. A home-page view adds one Worker hop before the assets (a few ms).
- **Network**: Stats are served from the edge cache; the game Worker sees about one request per stats URL per colo per TTL.

## Migration Plan
1. Hosting story (code, config, CI, docs; no deploy): `landing/` skeleton with the Worker, its tests (workerd: the proxy, cache hit and miss, stale, 429, 405, `?startapp=` 302) and an empty build; move legal pages from `public/` to `landing/`; game `wrangler.jsonc` routes and vars; CORS list; `frame-ancestors` header with a test; the `Origin` check scaffold (finished in ADR-0008's story); link and test updates; `deploy.yml` jobs; `README.md`, `server/README.md`, `docs/OPS.md`; `docs/v6/OWNER_ACTIONS.md` cutover steps.
2. ADR-0010 story fills `/api/public/*` on the game Worker; ADR-0011 stories fill the landing build.
3. Owner cutover after review.

## Validation Criteria
- A commit that touches only `landing/` runs only the landing jobs.
- `wrangler deploy --dry-run` passes for both configs.
- Locally, requests to the landing host never carry `__Host-pa_session`, `/api/public/*` on the landing returns the game's JSON with a cache hit on the second call, and `/?startapp=clan_x` answers 302 to play.
- The game in a Telegram-emulated iframe signs in with a bearer token; the web game signs in with the cookie and a cross-origin POST with that cookie is refused.

## Related
- `docs/v6/DECISIONS.md` V6-009 (confirmed and amended here), V6-002 (ports), V6-011 (public names)
- `docs/v6/audit/HOSTING.md` (option analysis), `docs/v6/audit/PLATFORM.md`
- ADR-0006 (platform layer), ADR-0008 (auth and sessions, planned), ADR-0009 (linking, planned), ADR-0010 (public stats API, planned), ADR-0011 (landing stack and budget, planned)
- `docs/v6/plan/CONTROL_MANIFEST_PLATFORM.md`
