# ADR-0010: The public stats API for the landing page

## Status
Accepted (Director, 2026-10-13, V6-014)

## Date
2026-10-13

## Last Verified
2026-10-13

## Decision Makers
Autonomous v6 run, story P2-ARCH-ACCT (roles: security-engineer with network-programmer). The Director accepts or sends back.

## Summary
The landing page (pixelarrow.app) must show live stats and leaderboards from real data, with no personal data beyond display names, cached and rate-limited (brief Goal 2). This ADR adds one read-only endpoint on the game Worker, `GET /api/public/v1/summary`. It serves a snapshot that the existing 5-minute cron precomputes into D1, so the request path does one primary-key read and never writes. The landing Worker reaches it through a service binding, caches it at the edge, and serves the last good copy if the game Worker is down (ADR-0007).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cloudflare Workers (workerd) + D1 + Cache API + Rate Limiting binding; service binding from the landing Worker (ADR-0007) |
| **Domain** | Networking |
| **Knowledge Risk** | LOW. The Cache API and service bindings (including RPC to a named `WorkerEntrypoint`) are stable. The Rate Limiting binding is as verified in ADR-0008. |
| **References Consulted** | `docs/v6/audit/SERVER.md` "Public stats and leaderboards: what exists"; `server/src/online/store.ts` `standings()`; `server/src/duel/season.ts` `leaderboard()` (calls `rollRatings`, a write); migrations 0002, 0008, 0010, 0012 (`battle_log`, `duel_matches`, `duel_attacks`, `world_bosses`, `season_rewards`, `duel_season_rewards`); Cloudflare Rate Limiting binding docs. |
| **Post-Cutoff APIs Used** | `ratelimits` binding (see ADR-0008) |
| **Verification Required** | Workerd tests: the response holds no keys outside the schema and no player ids; banned, deleted and opted-out players are absent; the endpoint performs no writes (a D1 spy). A landing proxy test serves the stale copy when the binding fails. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0009 (`display_name`, `public_boards`, `deleted_at`), ADR-0007 (landing Worker, service binding), ADR-0008 (rate limit binding `RL_PUBLIC_IP`) |
| **Enables** | The landing page's stats and leaderboard sections |
| **Blocks** | The public stats API story; the landing stats section (it can build against a fixture first) |
| **Ordering Note** | Ships after the display-name migration (ADR-0009). Before that, no public board may be served. |

## Context

### Problem Statement
The landing page needs trustworthy numbers and tops. The data exists in D1, but the existing reads are:
- **heavy:** `standings()` reads every held region
- **write-on-read:** `leaderboard()` rolls ratings for the caller
- **unsafe:** names are Telegram data, and rows carry `pid`

A public, unauthenticated endpoint must be cheap under any load, unable to change state, and limited to what is safe to publish.

### Constraints
- No invented numbers (brief hard constraint). Campaign (offline) battles are not on the server, so the "battles" figure must say "online battles".
- No personal data beyond display names (brief). No player ids, Telegram data, or exact last-seen times.
- D1 reads are billed per row read, so aggregate queries must not run per request.

### Requirements
- Players, battles and other headline counts; top duelists; war standings (players and clans); other tops that exist (world boss kills, past season champions).
- Cached at the edge, rate-limited, and resilient to the game Worker being down.
- An empty state for small numbers, decided by the landing page from real values.

## Decision

### 1. One endpoint, one snapshot
- **`GET /api/public/v1/summary`** (also `HEAD`) on the game Worker (`play.pixelarrow.app`). It takes no parameters; any query string is ignored, so the cache can't be busted with random URLs. Other methods return `405`.
- It does **not** run session middleware, reads no cookies or `Authorization`, and never sets cookies.
- The handler reads `SELECT body, generated_at FROM public_snapshot WHERE id = 1` and returns `body` as is. **No other query runs on the request path.**
- Before the first snapshot exists, it returns `503 {status:'warming'}` with `Retry-After: 60`.

### 2. The snapshot (computed by the cron)
- The `*/5 * * * *` cron gets a step, `buildPublicSnapshot(env, now)` (`server/src/public/snapshot.ts`). It is read-only against game tables and writes only `public_snapshot` and `stats_counters`.
- **Migration `0019_public_stats.sql`:**
  - `public_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL, generated_at INTEGER NOT NULL)`
  - `stats_counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL, high_water INTEGER NOT NULL)` for incremental battle counts
- **Battle counts are incremental:** for each source table, `SELECT COUNT(*), MAX(rowid) FROM <t> WHERE rowid > :high_water` adds to `value` and moves `high_water`. Totals never go down, even if the prune cron removes old rows, and each run reads only the new rows.
- **The JSON (schema v1).** Every name is `display_name`. Rows carry a rank, not an id.

```jsonc
{
  "v": 1,
  "generatedAt": 1760352000000,            // ms
  "totals": {
    "players": 1234,                       // players WHERE deleted_at IS NULL AND banned_at IS NULL
    "activePlayers7d": 210,                // last_seen_at within 7 days (same filter)
    "onlineBattles": 56789,                // stats_counters: battle_log + duel_matches + duel_attacks(status='used')
    "duelsFought": 3456,                   // duel_matches + used duel_attacks (subset of onlineBattles)
    "warBattles": 2222,                    // battle_log
    "bossesSlain": 12,                     // world_bosses WHERE status = 'dead'
    "clans": 40                            // clans with ≥ 1 member in the current war season
  },
  "duels": {
    "season": { "id": 7, "endsAt": 1761000000000 },
    "live":  [{ "rank": 1, "name": "SwiftArcher4821", "league": "legend", "rating": 2140, "games": 88 }],
    "async": [{ "rank": 1, "name": "…", "league": "gold", "rating": null, "games": 40 }]
  },
  "war": {
    "season": { "id": 3, "endsAt": 1761000000000 },
    "players": [{ "rank": 1, "name": "…", "clan": "Iron Wolves", "score": 240 }],
    "clans":   [{ "rank": 1, "name": "Iron Wolves", "score": 910, "members": 12 }]
  },
  "champions": {
    "war":  [{ "season": 2, "name": "…", "title": "…" }],
    "duel": [{ "season": 6, "ladder": "live", "name": "…" }]
  },
  "bossSlayers": [{ "rank": 1, "name": "…", "kills": 3 }]   // world_bosses.killed_by, counted
}
```

- **Sizes:** at most 10 rows per board and 5 past champions per kind. The body is capped at 32 KB, checked in the builder.
- **Who appears:** a player is on a public board only if `deleted_at IS NULL AND banned_at IS NULL AND public_boards = 1`. Opted-out players still count in the totals. A clan appears only if its name passes the ADR-0009 validator, which also rejects older bad names.
- **Rating shown:** as in the game, only the Legend league shows a number (`rating`, rounded); the others show `null` and their league. Ratings and RD are never shown as exact floats.
- **Small boards:** a board with fewer than 3 eligible rows is returned as `[]`, and a past season with no eligible champion is left out. This avoids singling out the only player, and gives the landing page a natural empty state. Totals are always real numbers. The landing page decides its own empty-state threshold for display (for example, it hides `players` below 50) and **never** shows padded or invented values.
- **Read-only duel query:** a new `publicDuelTop(db, ladder, season, limit)` without `rollRatings`. War standings reuse `standings()` once per cron run, never per request.
- **Cost:** one cron run is a handful of indexed aggregate queries, plus `standings()` for the current season, every 5 minutes. That is bounded and independent of traffic.

### 3. Caching
- **Game Worker response headers:** `Content-Type: application/json; charset=utf-8`, `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`, an `ETag` (a hash of `generated_at`) with `304` on `If-None-Match`, and `X-Content-Type-Options: nosniff`. No `Set-Cookie`, no `Vary: Cookie`. This route is the one exception to the `no-store` default on `/api/*`.
- **Landing Worker** (`/api/public/v1/summary` on `pixelarrow.app`, which runs first for this path only, ADR-0007):
  1. Look up `caches.default` with a fixed cache key (the URL without its query).
  2. On a miss, call `env.GAME.summary()` (the RPC entrypoint, §4) with a 3 s timeout. On success, `cache.put` with `s-maxage=300`, and also store it under a second "last good" key with a 24 h TTL.
  3. On an error or timeout, serve the "last good" copy with `X-Stale: 1`. If there is none, return `503`, and the landing page shows its empty state.
- The landing page fetches the summary client-side after first paint, or at build time for the static fallback numbers (owner's choice in the landing ADR). Either way it is one request per page view, at most.

### 4. Rate limits
- **Landing Worker:** a Rate Limiting binding `RL_LANDING_PUBLIC` (`namespace_id` `"6004"`, 60 requests per 60 s per `cf-connecting-ip`), checked **only on a cache miss**. Cache hits are free, so a flood mostly hits the cache.
- **Game Worker:** `RL_PUBLIC_IP` (ADR-0008, 60 per 60 s per IP) applies to every HTTP call to `/api/public/v1/summary` on `play.pixelarrow.app`. The landing does not use that HTTP route. It calls a named RPC entrypoint, `PublicApi extends WorkerEntrypoint` with a method `summary(): Promise<{ body: string; generatedAt: number }>`, through the service binding (`"entrypoint": "PublicApi"`). That entrypoint can't be reached from the internet, so it needs no IP limit, and no header has to be trusted to tell the two callers apart. **The game Worker never trusts a client-IP header from the internet.**
- Over the limit: `429` with `Retry-After: 60` and a JSON body.

### 5. CORS and exposure
- **No CORS headers.** The landing calls its own origin (the proxy). The endpoint on `play.pixelarrow.app` is not offered to third-party sites, and browsers will block cross-origin reads from it. Non-browser clients can read the same public data anyway, and the cache and limits protect it.
- **Never in the response:** player ids, Telegram ids, usernames, first names, emails, language, Premium flag, last-seen times per player, purchase or revenue data, wallet balances, ladder RD and volatility, clan ids or invite codes.
- `/api/public/*` must have no routes other than those listed here. Adding one needs an amendment to this ADR.

## Architecture Diagram

```
 browser ──► pixelarrow.app/api/public/v1/summary
              landing Worker: Cache API hit? ──yes──► 200 (cached)
                    │ no → RL_LANDING_PUBLIC → GAME.summary() via service binding RPC (3 s)
                    ▼                                   │ fail → last-good (24 h) or 503
 game Worker  /api/public/v1/summary → SELECT body FROM public_snapshot WHERE id=1
                    ▲
 cron */5  buildPublicSnapshot: counters (rowid high-water), duel tops (read-only),
           standings(), champions, boss slayers → filter (public_boards, banned, deleted, <3 rows)
           → public_snapshot
```

## Key Interfaces

```ts
// server/src/public/snapshot.ts
export interface PublicSummaryV1 { v: 1; generatedAt: number; totals: Totals; duels: DuelBoards; war: WarBoards; champions: Champions; bossSlayers: SlayerRow[] }
export function buildPublicSnapshot(env: Env, now: number): Promise<PublicSummaryV1>; // reads game tables, writes only public_snapshot + stats_counters
export function publicDuelTop(db: D1Database, ladder: 'live' | 'async', season: number, limit: number): Promise<DuelRow[]>; // no writes

// server/src/public/routes.ts
GET|HEAD /api/public/v1/summary  → 200 PublicSummaryV1 | 304 | 429 | 503
// server/src/index.ts
export class PublicApi extends WorkerEntrypoint<Env> { summary(): Promise<{ body: string; generatedAt: number } | null> } // same snapshot row

// landing/src/worker.ts (ADR-0007)
GET /api/public/v1/summary → cache → GAME.summary() (RPC entrypoint PublicApi) → last-good
```

## Implementation Guidelines
- Must serve only the precomputed snapshot. Must run no aggregate query, no game read and no write on the request path.
- Must build the snapshot only from `display_name`, and must filter out `deleted_at`, `banned_at` and `public_boards = 0`.
- Must return `[]` for any board with fewer than 3 eligible rows.
- Must validate the snapshot against the `PublicSummaryV1` zod schema before writing, with strict keys (unknown keys rejected), so a leaked field fails the build.
- Must never read cookies, `Authorization` or sessions in `/api/public/*`, and must never set cookies there.
- Must never add CORS headers to `/api/public/*`.
- Must never trust an internet-supplied IP header. Use `cf-connecting-ip` only.
- Must serve the landing through the `PublicApi` RPC entrypoint, which returns the same snapshot row as the HTTP route.
- Must label battle counts as online battles. Campaign battles are not counted.

## Alternatives Considered

### Alternative 1: Compute on request, cached with the Cache API only
- **Pros:** no snapshot table or cron step.
- **Cons:** every cache miss in each of hundreds of Cloudflare locations runs `standings()` and several aggregates against D1. The cost and latency grow with traffic, and a cache-busting flood reaches D1.
- **Rejection Reason:** the snapshot makes cost independent of traffic.

### Alternative 2: Several endpoints (`/stats`, `/leaderboards/:board`)
- **Pros:** finer caching, and "see more" pages are possible.
- **Cons:** more routes to secure and cache. The landing page needs everything on one page view anyway.
- **Rejection Reason:** one summary is simpler. A second endpoint can be added through an amendment if the landing grows a full leaderboard page.

### Alternative 3: Cross-origin call from the landing page to play with CORS
- **Rejection Reason:** ADR-0007 chose the service-binding proxy: same-origin, edge-cached, no CORS.

### Alternative 4: Workers KV for the snapshot
- **Pros:** reads cached at the edge.
- **Cons:** another binding and product. The Cache API in front of a single D1 row read already gives edge caching.
- **Rejection Reason:** not needed.

## Consequences

### Positive
- Constant cost, regardless of traffic; no write path; no personal data.
- The landing page keeps working (stale or empty) when the game Worker is down or redeploying.

### Negative
- Data is up to about 10 minutes old (5 min cron + 5 min edge cache). That is fine for a landing page.
- Campaign battles are invisible to the server and so can't be shown.
- One more cron step and two small tables.

## Risks
- **Offensive clan names on the landing page.** Mitigation: the validator is applied at snapshot time, and admin rename and disband are available. The snapshot rebuilds every 5 minutes.
- **Snapshot schema drift leaks a field.** Mitigation: the strict zod schema, plus a test asserting the exact key set.
- **Tiny populations identify people.** Mitigation: the fewer-than-3 rule, and the landing empty-state threshold.
- **The landing cache poisoned by an error body.** Mitigation: only `200`s with a valid `v: 1` body are cached.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Brief Goal 2 | Live stats and leaderboards from a public, read-only, cached API (players, battles, top duelists, war standings, other tops); no personal data beyond display names; rate-limited | §1–§5 |
| Brief hard constraint | Stats from real data, never invented; tasteful empty state while there are few players | §2 small boards, totals always real |
| V6-011 | Display names on public boards | §2, ADR-0009 |

GDD sync: NOT ASSESSED. There is no landing GDD or page spec yet; the landing story must consume `PublicSummaryV1`.

## Performance Implications
- **CPU:** a request reads one row and returns a string, under 1 ms. The cron step takes tens of milliseconds every 5 minutes.
- **Memory:** a snapshot of at most 32 KB.
- **Load Time:** the landing page gets one cached request of at most 32 KB, uncompressed.
- **Network:** a service-binding call only on a cache miss, about once per 5 minutes per Cloudflare location with traffic.

## Migration Plan
New tables only (`0019_public_stats.sql`) and new routes. No existing behaviour changes, except that names on the in-game boards move to `display_name` (ADR-0009).

## Validation Criteria
- Workerd tests:
  - the exact key set
  - no `pid` anywhere in the body (a recursive key and value scan for seeded ids, Telegram ids and emails)
  - opted-out, banned and deleted players are absent
  - boards with fewer than 3 rows are empty
  - counters are monotonic across a prune
  - a D1 spy shows only the single `SELECT` on the request path
  - `405`, `304` and `429` cases
- Landing Worker tests: cache hit, miss, stale fallback, and `503` (with a stub `GAME` binding).
- `/security-audit` (data exposure) shows no open finding on `/api/public/*`.

## Related
- ADR-0007 (hosting, landing Worker, service binding), ADR-0008 (rate limits), ADR-0009 (display names, opt-out, deletion)
- `docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md`
- `server/src/online/store.ts` `standings()`, `server/src/duel/season.ts` `leaderboard()`
