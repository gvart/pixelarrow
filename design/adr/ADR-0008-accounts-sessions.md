# ADR-0008: Accounts and sessions

## Status
Accepted (Director, 2026-10-13, V6-014)

## Date
2026-10-13

## Last Verified
2026-10-13

## Decision Makers
Autonomous v6 run, story P2-ARCH-ACCT (roles: security-engineer with network-programmer). The owner delegated the call in the v6 brief; the Director accepts or sends back.

## Summary
Today a player is a Telegram user: `players.telegram_id` is `NOT NULL UNIQUE`, and the session is a stateless 7-day HMAC token that nothing can revoke (`docs/v6/audit/SERVER.md`). This ADR adds email and password accounts (sign-up, email verification, password reset), hashes passwords with PBKDF2-SHA256 at the workerd ceiling plus a server pepper, and replaces the stateless tokens with server-side sessions stored in D1. The web gets `__Host-` cookies and Telegram gets bearer tokens. Rate limits become durable: the Workers Rate Limiting binding per IP, plus D1 counters per account and per email address. Turnstile guards the anonymous auth forms. An email login method exists only after its address is verified, so every account that can play online is verified.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cloudflare Workers (workerd), compatibility date 2026-10-01, Hono, D1. The game client (Phaser 3.90, ADR-0003) is touched only through the `Auth` platform interface (ADR-0006). |
| **Domain** | Networking / Core (server identity) |
| **Knowledge Risk** | MEDIUM. Cloudflare Email Service sending is **Beta** and needs Workers Paid. The Rate Limiting binding needs Wrangler 4.36 or later. The PBKDF2 iteration ceiling in workerd is community-reported, not documented by Cloudflare. |
| **References Consulted** | developers.cloudflare.com: Email Service overview and "Send emails" (the `send_email` binding, `"remote": true`, onboarding the domain adds SPF, DKIM and DMARC on `cf-bounce`); Turnstile "Server-side validation" (siteverify, 300 s single-use tokens, `hostname` and `action` checks, `idempotency_key`) and "Testing" (test keys, dummy token); Workers "Rate Limiting binding" (`ratelimits`, `simple.limit`, `period` 10 or 60, per location, eventually consistent). Repo: `server/src/session.ts`, `middleware.ts`, `players.ts`, `routes/auth.ts`, `rateLimit.ts`, `telegramAuth.ts`, migrations 0001–0016, `docs/v6/audit/SERVER.md`, `HOSTING.md`, `PLATFORM.md`. |
| **Post-Cutoff APIs Used** | `send_email` binding `env.EMAIL.send({ to, from, subject, html, text })` (Email Service, Beta). `ratelimits` binding `env.X.limit({ key })`. |
| **Verification Required** | (1) PBKDF2-SHA256 cost and ceiling. Done locally (V6-ACCT-01, `docs/v6/qa/PBKDF2_SPIKE.md`): 310,000 iterations takes about 25 ms CPU, and local workerd refuses no count up to 1,000,000. Still pending: the production check on a deployed throwaway Worker (`docs/v6/OWNER_ACTIONS.md` item 7) that 310,000 runs under 60 ms CPU and is not capped; otherwise fall back toward the 100,000 floor. Needs Workers Paid. (2) `env.EMAIL.send` delivers to an outside mailbox from `noreply@pixelarrow.app` and passes SPF, DKIM and DMARC. (3) Turnstile's test secret `2x…AA` and `3x…AA` paths are rejected in the workerd tests. (4) `__Host-pa_sid` is never sent to `pixelarrow.app` (ADR-0007). |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0006 (platform layer: the `Auth` interface and its `readonly transport: 'bearer' \| 'cookie'`). ADR-0007 (hosting: game and API same-origin on `play.pixelarrow.app`; the landing has no cookies). Both Accepted (V6-012). |
| **Enables** | ADR-0009 (linked accounts, display names, deletion), ADR-0010 (public stats need `display_name`). The stories for accounts, verification, reset, Turnstile, rate limits and sessions. |
| **Blocks** | Every v6 account, linking and deletion story; the web adapter's `Auth` implementation. |
| **Ordering Note** | Migration 0017 (this ADR) and 0018 (ADR-0009) can ship in one story. The session swap (`pa1` → `pa2`) is one atomic change for server and client; there are no old clients (V5-074). |

## Context

### Problem Statement
v6 puts the game on the open web (`play.pixelarrow.app`). Web players have no Telegram identity, so the server needs its own accounts. The current session can't be revoked: a leaked token stays valid for 7 days, and the only kill switch is rotating `SESSION_SECRET` for everyone. Rate limits live in isolate memory, so a distributed credential-stuffing attack is not limited at all. Password log-in turns both gaps from theoretical into blocking.

### Constraints
- Workers runtime: no native bcrypt, scrypt or argon2. WebCrypto PBKDF2 is native but capped (see Decision). CPU time per request is billed and limited, and the Workers Paid plan is required for Email Service anyway.
- Telegram Web runs the Mini App in a third-party iframe, where cookies are blocked or partitioned (HOSTING.md constraint 1). Telegram keeps bearer tokens.
- D1 is the only durable store the API uses for player data. Durable Objects exist (`RegionDO`, `MatchmakerDO`, `DuelDO`).
- No live users (V5-074): migrations may rebuild tables, and there are no old tokens or clients to honour.
- Secrets never go in the repo. Local development uses `.dev.vars` and Turnstile's published test keys.

### Requirements
- Email and password sign-up, log-in, log-out, log-out everywhere, password change, password reset, email verification.
- Sessions that can be revoked one at a time or all together, with a server-side list of devices.
- Per-IP and per-account rate limits that hold across isolates and data centres.
- Turnstile on sign-up, log-in and reset.
- Email accounts verified before they can play online.
- No account enumeration through sign-up, log-in, reset or resend.

## Decision

### 1. Identity model (D1 migration `0017_accounts.sql`)

The player id (`players.id`) stays the one key for all game data. Log-in methods move to their own table.

```sql
-- players is rebuilt (SQLite cannot drop NOT NULL). Run with PRAGMA defer_foreign_keys = on.
CREATE TABLE players (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id       INTEGER UNIQUE,          -- now NULLABLE; a mirror of the telegram identity, for the bot only
  username          TEXT,                    -- Telegram profile fields: NULL for email-only players,
  first_name        TEXT,                    -- never shown publicly (ADR-0009)
  language_code     TEXT,
  is_premium        INTEGER NOT NULL DEFAULT 0,
  display_name      TEXT NOT NULL,           -- ADR-0009
  display_name_key  TEXT NOT NULL UNIQUE,    -- ADR-0009
  created_at        INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  banned_at INTEGER, ban_reason TEXT, analytics_opt_out INTEGER NOT NULL DEFAULT 0,
  deleted_at        INTEGER                  -- ADR-0009 tombstone
);

CREATE TABLE auth_identities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('telegram', 'password')),
  subject       TEXT NOT NULL,       -- telegram: decimal user id; password: normalised email
  email         TEXT,                -- password only: the address as typed (for display and sending)
  verified_at   INTEGER NOT NULL,    -- every row is verified (rows are created only after proof)
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE (kind, subject),
  UNIQUE (player_id, kind)           -- at most one Telegram and one email per player
);

CREATE TABLE password_hashes (
  identity_id   INTEGER PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  hash          TEXT NOT NULL,       -- 'pbkdf2-sha256$<iter>$<pepperId>$<salt b64url>$<dk b64url>'
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id_hash       TEXT PRIMARY KEY,    -- b64url(SHA-256(token)); the token itself is never stored
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  transport     TEXT NOT NULL CHECK (transport IN ('cookie', 'bearer')),
  method        TEXT NOT NULL CHECK (method IN ('telegram', 'password', 'email_link')),
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,    -- written at most once per hour per session
  idle_expires_at INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,    -- absolute
  reauth_at     INTEGER,             -- last fresh proof (ADR-0009 sensitive actions)
  device        TEXT                 -- clipped User-Agent family, e.g. 'Chrome on macOS'; no IP is stored
);
CREATE INDEX sessions_player ON sessions (player_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

CREATE TABLE email_tokens (
  token_hash    TEXT PRIMARY KEY,    -- b64url(SHA-256(token))
  purpose       TEXT NOT NULL CHECK (purpose IN ('signup', 'add_email', 'change_email', 'reset')),
  email_norm    TEXT NOT NULL,
  email         TEXT NOT NULL,
  player_id     INTEGER REFERENCES players(id) ON DELETE CASCADE,  -- NULL for signup
  pending_hash  TEXT,                -- signup/add_email: the password hash to install on success
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER
);
CREATE INDEX email_tokens_email ON email_tokens (email_norm, purpose);

CREATE TABLE auth_throttle (
  key           TEXT PRIMARY KEY,    -- e.g. 'login:' || b64url(SHA-256(email_norm)), 'mail:' || …
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER
);
```

- The Telegram log-in writes `auth_identities (kind='telegram', subject=<tg id>)` and the `players.telegram_id` mirror in the **same D1 batch**. Only the identity module writes either one. The mirror exists so the bot, notifications and admin code keep a cheap `telegram_id` lookup. `auth_identities` is the source of truth for log-in.
- Email normalisation: trim, NFKC, lower-case the whole address. No dot or plus folding: it is not universal, and getting it wrong locks people out. Maximum 254 characters, one `@`, and a domain with a dot. No MX lookup.
- **No unverified identity rows exist.** A sign-up or an added email lives only in `email_tokens` (with its pending password hash) until the link is clicked. The identity is inserted at verification, and that is when `UNIQUE(kind, subject)` is checked. Nobody can squat an address they don't control, and "verified before online play" holds by construction.

### 2. Password hashing

- **Algorithm:** PBKDF2-HMAC-SHA256 through `crypto.subtle.deriveBits`, **310,000 iterations**, a 16-byte random salt and a 32-byte output. The accounts code exports the count as `PBKDF2_ITERATIONS` from `server/src/auth/password.ts`; `server/test/pbkdf2-spike.test.ts` holds it to the measured range [100,000, 310,000] (`server/scripts/pbkdf2-probe/limits.ts`).
- **Spike result (V6-ACCT-01, V6-014 condition met; evidence in `docs/v6/qa/PBKDF2_SPIKE.md`):** local workerd 1.20261006.1 (`wrangler dev` on port 6140 and vitest-pool-workers, Apple M2 Pro) accepts every count tried from 100,000 to 1,000,000. **100,001 is not refused locally**, so the reported 100,000 cap is not in open-source workerd and stays unconfirmed for production. CPU per hash (pepper step included, 20 runs, median of two runs): 100k ≈ 8 ms, 200k ≈ 16 ms, 310k ≈ 24–26 ms, 400k ≈ 31–32 ms, 600k ≈ 46–50 ms. Cloudflare documents a CPU limit per request of 10 ms on Workers Free (fixed) and 30 s by default on Workers Paid, configurable up to 5 minutes ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **Why 310,000:** it is the highest measured count that stays under this section's 60 ms CPU ceiling per hash even if production CPUs are twice as slow as the local machine (about 26 ms × 2 = 52 ms; 400k would be about 64 ms). It meets the V6-014 target and OWASP's 2021 figure for PBKDF2-HMAC-SHA256, but is below OWASP's current 600,000. The pepper, the durable per-account lockout and Turnstile make up the gap. **Workers Paid is required:** no count at or above the 100,000 floor fits Free's 10 ms (100k alone is about 8 ms before the rest of the request). Paid is already required for Email Service.
- **Production confirmation (owner action, before the first real sign-up):** deploy the probe Worker to a throwaway Worker, read `cpu_ms` at 100,000 and 310,000, and delete it (`docs/v6/OWNER_ACTIONS.md`). If production refuses counts above 100,000, or 310,000 costs more than 60 ms CPU, lower `PBKDF2_ITERATIONS` and `PBKDF2_SAFE_MAX` to the highest count that passes (floor 100,000) and update this section. No live users exist (V5-074), so no stored hash is stranded.
- **Pepper:** the PBKDF2 input key is `HMAC-SHA256(PASSWORD_PEPPER, utf8(password))`, not the raw password. `PASSWORD_PEPPER` is a Worker secret (32 random bytes, base64) and is never in D1. A D1 dump or backup alone can't be cracked offline. The pepper id is stored in the hash string, so the pepper can be rotated (rehash on next log-in, then force a reset for the rest).
- **Hash string:** `pbkdf2-sha256$<iter>$<pepperId>$<salt>$<dk>`. Verification always uses the parameters stored in the string, never the current ones.
- **Rehash on log-in:** after a successful verification, recompute and replace the hash when the algorithm tag is not `pbkdf2-sha256`, when `<iter>` differs from `PBKDF2_ITERATIONS` (in either direction, so a lowering after the owner check also converges), or when `<pepperId>` differs from `PASSWORD_PEPPER_ID`. The new hash uses a fresh 16-byte salt and the current pepper. It costs one more hash (about 25 ms at 310,000) on that log-in only, and a failed write never fails the log-in. Raising the count later (a new spike, or a native memory-hard KDF) is a one-line change to `PBKDF2_ITERATIONS` and `PBKDF2_SAFE_MAX`.
- **Password policy (NIST SP 800-63B):** 10 to 128 characters (after NFKC), any characters, no composition rules. Reject a password equal to the email or its local part, and reject one of the 10,000 most common passwords (a bundled list, checked after normalisation). Never truncate the password.
- **Verification** uses a constant-time comparison. If the email is unknown, verify against a fixed dummy hash at the current parameters, so the timing does not reveal whether an account exists.
- CPU budget: at most 60 ms of CPU per hash (about 25 ms measured locally at 310,000; production to be confirmed by the owner). A log-in that rehashes costs two hashes. Hashing runs only after the rate limit and Turnstile checks pass, so an anonymous flood can't buy CPU.

### 3. Sessions (replacing `pa1` stateless tokens)

- **Token:** `pa2_` + 32 random bytes in base64url (`crypto.getRandomValues`). The server stores only `SHA-256(token)` as `sessions.id_hash`. There is no HMAC and no payload: everything is looked up in D1.
- **Lookup per request:** `SELECT s.*, p.banned_at, p.deleted_at, p.display_name FROM sessions s JOIN players p …` by `id_hash`, then check the expiry, idle expiry, ban and deletion. This replaces both `verifySession` and the separate ban cache. A per-isolate cache of positive lookups lasts **at most 30 s** and is keyed by `id_hash`. Log-out, revoke and delete clear the entry in their own isolate. Other isolates can serve a revoked session for at most 30 s; this is accepted and documented.
- **Lifetimes:**

  | Transport | Used by | Absolute | Idle |
  | --- | --- | --- | --- |
  | `cookie` | web (`play.pixelarrow.app`) | 30 days | 7 days (sliding; `last_seen_at` written at most hourly) |
  | `bearer` | Telegram Mini App (from `initData`), future native clients | 24 h | 24 h |

  Telegram re-auth is silent: the client resends `initData` on a 401. A 24-hour bearer token limits the damage from a token leaked in a log.
- **Cookie:** `Set-Cookie: __Host-pa_sid=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`. The `__Host-` prefix forbids `Domain=`, so the cookie can never reach `pixelarrow.app` (ADR-0007). Log-out sends the same cookie with `Max-Age=0`.
- **One transport per request.** A request carrying both a cookie and an `Authorization` header is rejected with 400. A cookie session is never accepted as a bearer token (the `transport` column must match how the token arrived), and the other way round.
- **CSRF:** for cookie-authenticated requests with an unsafe method (`POST`, `PUT`, `PATCH`, `DELETE`), `Origin` must equal the game origin (`GAME_URL`), and requests without `Origin` are refused. Bearer requests are exempt: a browser can't add the header cross-site. `SameSite=Lax` is the second layer.
- **WebSockets:** the web sends the cookie automatically on the same-origin upgrade, and the server checks `Origin == GAME_URL` (this stops cross-site WebSocket hijacking). Telegram sends the bearer token in `Sec-WebSocket-Protocol` only. **The `?token=` query fallback is removed**, because tokens in URLs end up in logs. The session is checked at upgrade time. Revocation closes live sockets on the player's next reconnect, and deletion closes them through the existing DO kick path (ADR-0009).
- **Rotation:** a new session on every log-in. Password change and reset revoke all of the player's other sessions (reset revokes all, then issues one). Verification by link issues a fresh session.
- **Endpoints:** `POST /api/auth/logout` (this session), `POST /api/auth/logout-all`, `GET /api/auth/sessions` (device, created, last seen, current flag; never the token or its hash), `DELETE /api/auth/sessions/:handle`. The handle is the first 12 characters of `id_hash`, scoped to the player.
- **Pruning:** the existing daily cron (`17 3 * * *`) deletes expired sessions, used or expired `email_tokens`, and `auth_throttle` rows idle for over 7 days.
- `Session` in code becomes `{ pid, sid, transport, method, name }`, with `tg` removed. Durable Objects still get `x-player-name` from the Worker, read from `players.display_name` at lookup time.

### 4. Flows and endpoints

All bodies are validated with zod and capped by `body.ts`. Every response to an anonymous auth form that could reveal whether an account exists is **uniform**: the same status, body and roughly the same timing.

| Endpoint | Auth | Turnstile `action` | Behaviour |
| --- | --- | --- | --- |
| `POST /api/auth/signup` `{email, password, turnstile}` | none | `signup` | Validate the password policy, hash it, store an `email_tokens(purpose='signup', pending_hash)` with a 24 h TTL, and send the verify email. If the email is already registered, send a "you already have an account: log in or reset" email instead. Always `202 {status:'check_email'}`. No session yet. |
| `POST /api/auth/verify` `{token}` | none | none | Single use. For `signup`: in one batch, create the player (with a generated display name, ADR-0009), the identity and the password hash, then issue a cookie session (`method='email_link'`). If the email was verified by someone else in the meantime: `409 email_taken`. For `add_email` and `change_email`: see ADR-0009. |
| `POST /api/auth/verify/resend` `{email, turnstile}` | none | `resend` | Re-sends a pending sign-up link (new token; old ones are invalidated). Always `202`. |
| `POST /api/auth/login` `{email, password, turnstile}` | none | `login` | Order: IP limit → Turnstile → account lockout → hash check. On success: a cookie session, rehash if the parameters are old, reset the failures. On failure: `401 invalid_credentials` (one message for unknown email and wrong password) and count a failure. |
| `POST /api/auth/reset/request` `{email, turnstile}` | none | `reset` | If a password identity exists, send a reset link (30 min TTL; an earlier unused reset token is invalidated). Always `202`. |
| `POST /api/auth/reset/confirm` `{token, password}` | none | none | Single use, within the TTL. Set the new hash, revoke **all** sessions, issue a new cookie session, and send a "your password was changed" email. |
| `POST /api/auth/password` `{current, next}` | session | none | Re-check `current` (counts toward the lockout), set the new hash, revoke all other sessions, send the notice email. |
| `POST /api/auth/telegram` `{initData}` | none | none (`initData` is unforgeable and Turnstile breaks in the iframe) | As today (HMAC check, 24 h `auth_date`), then upsert the identity and the mirror, and return `{token}` as a **bearer** session. |

- **Email links** point to `https://play.pixelarrow.app/auth/<purpose>#t=<token>`. The token is in the fragment, so it never reaches server logs, the Referer header or analytics. The page reads it and POSTs it. Tokens are 32 random bytes and stored hashed.
- **Email sending:** an `EmailSender` interface in `server/src/email/`. The production implementation uses the `send_email` binding `EMAIL` (`"remote": true`) from `noreply@pixelarrow.app`, with plain text and minimal HTML, English and Russian picked by `language_code` or the request's `Accept-Language`. In local dev and tests a `LogEmailSender` writes the message to `dev_outbox` (only when `DEV_EMAIL=1`, which the deploy config refuses, like `DEV_AUTH`). Sending is awaited with a 5 s timeout. A failure returns `503 email_unavailable` on verify-type flows. Sign-up stays uniform: the pending token is kept, and the user can resend.
- **Mail caps** stop the service being used to spam a victim's inbox: at most 3 emails per address per hour and 10 per day, all purposes together (an `auth_throttle` key `mail:<sha256(email_norm)>`). Over the cap, the request still returns its uniform `202` and sends nothing.

### 5. Rate limits (durable, not per isolate)

Two layers. The old in-memory `rateLimit.ts` stays for gameplay buckets only and is never used on `/api/auth/*` again.

1. **Per IP: Workers Rate Limiting binding** (`ratelimits` in `wrangler.jsonc`, enforced per Cloudflare location, eventually consistent, no network wait):

   | Binding | `namespace_id` | Limit | Key |
   | --- | --- | --- | --- |
   | `RL_AUTH_IP` | `"6001"` | 10 / 60 s | `<route>:<cf-connecting-ip>` for signup, login, reset, resend, verify |
   | `RL_TG_AUTH_IP` | `"6002"` | 30 / 60 s | `tg:<ip>` for `/api/auth/telegram` |
   | `RL_PUBLIC_IP` | `"6003"` | 60 / 60 s | ADR-0010 |

   Cloudflare advises against IP keys because people share IPs (NAT, carrier networks). The limits are set loose enough for a shared IP. The account layer and Turnstile do the precise work. The binding is the cheap first gate that keeps floods away from the hash and D1.
2. **Per account and per email address: D1 `auth_throttle`** (global and strongly consistent, written only on auth attempts):
   - **Log-in:** key `login:<sha256(email_norm)>`, so it works for unknown emails too and reveals nothing. After 5 consecutive failures, lock for 1 minute, then double on each further failure up to 1 hour. Success resets the counter. While locked, return the same `401 invalid_credentials` without hashing, and the client shows a generic "too many attempts, try later". A lockout never blocks the owner's reset path.
   - **Password change** shares the log-in key of the player's email.
   - **Mail caps** as in §4.
   - The updates use one `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement, so there is no read-then-write race.
3. **Telegram `initData`** gets only the IP layer: it is HMAC-signed by Telegram and can't be guessed.

A Durable Object rate limiter was considered (see Alternatives). D1 is enough at auth-attempt volume and adds no class or migration.

### 6. Turnstile

- **Widget:** on the sign-up, log-in, reset-request and resend forms in the **web** adapter only. Use the managed mode, with the `action` names set as in the table above. Site key: `TURNSTILE_SITE_KEY`, a public build-time var.
- **Server:** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret=TURNSTILE_SECRET`, `response`, `remoteip=cf-connecting-ip`, and an `idempotency_key` (a UUID per attempt, reused on retry). Accept only when all of these hold:
  - `success` is true
  - `action` equals the endpoint's action
  - `hostname` is in the allow-list (`play.pixelarrow.app`, plus `localhost` only when `DEV_AUTH=1`)
  - `challenge_ts` is at most 300 s old
- **Failure:** `400 turnstile_failed`, which the client answers with `turnstile.reset()`. A siteverify network error fails **closed** (`503`) for sign-up and reset, and also for log-in. The account lockout bounds the damage either way, and failing open would let an attacker get around Turnstile by flooding siteverify.
- **Local and CI:** site key `1x00000000000000000000AA` and secret `1x0000000000000000000000000000000AA` (always passes) in `.dev.vars.example` and `.env.example`. Tests use the dummy token `XXXX.DUMMY.TOKEN.XXXX`, the secret `2x0000000000000000000000000000000AA` (always fails) and `3x0000000000000000000000000000000AA` (`timeout-or-duplicate`). siteverify is reached through an injectable `fetch`, so the workerd tests never hit the network.

### 7. Online play gate

- `requireAuth` is replaced by `requireSession` (any valid session) and `requirePlayable` (a valid session whose player has at least one identity, is not banned and is not deleted).
- `requirePlayable` guards every online route and socket: `/api/online/*`, `/api/duel/*`, `/api/economy/*` writes, `/api/battle/verify`, and `/ws/*`.
- `/api/me`, `/api/save`, `/api/account/*` and `/api/auth/*` need only `requireSession`.
- Because identities are created only after proof (§1), "a session exists" already implies "verified". `requirePlayable` keeps the rule explicit and is the place to add future gates.

### Architecture Diagram

```
 Web (play.pixelarrow.app)                 Telegram Mini App (iframe / app)
  Auth adapter: cookie                       Auth adapter: bearer
   │ signup/login/reset + Turnstile token     │ initData
   ▼                                          ▼
 ┌──────────────────────── game Worker (ADR-0007) ─────────────────────────┐
 │ /api/auth/*  →  RL binding (per IP, per location)                       │
 │              →  Turnstile siteverify (anonymous forms only)              │
 │              →  auth_throttle (D1, per email/account)                    │
 │              →  PBKDF2(HMAC(pepper, pw)) / initData HMAC                 │
 │              →  auth_identities ─┬─ players (one id)                     │
 │                                  └─ sessions (hash of token)            │
 │ email: EmailSender → send_email binding EMAIL (noreply@pixelarrow.app)  │
 │ every request: token → SHA-256 → sessions JOIN players (30 s cache)     │
 │ cookie + unsafe method → Origin == GAME_URL                             │
 └─────────────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```ts
// server/src/auth/sessions.ts
export interface Session { pid: number; sid: string; transport: 'cookie' | 'bearer'; method: 'telegram' | 'password' | 'email_link'; name: string; reauthAt: number | null }
export function createSession(db: D1Database, pid: number, t: Session['transport'], m: Session['method'], device: string | null, now?: number): Promise<{ token: string; session: Session }>;
export function lookupSession(db: D1Database, token: string, transport: Session['transport'], now?: number): Promise<Session | null>;
export function revokeSession(db: D1Database, pid: number, sidHashPrefix: string): Promise<void>;
export function revokeAll(db: D1Database, pid: number, exceptIdHash?: string): Promise<void>;

// server/src/auth/password.ts
export function hashPassword(pw: string, pepper: Pepper): Promise<string>;
export function verifyPassword(pw: string, stored: string | null, peppers: PepperSet): Promise<{ ok: boolean; needsRehash: boolean }>;
export function checkPasswordPolicy(pw: string, email: string): 'ok' | 'too_short' | 'too_long' | 'common' | 'matches_email';

// server/src/auth/turnstile.ts
export function verifyTurnstile(env: Env, token: string, action: TurnstileAction, ip: string, fetchFn?: typeof fetch): Promise<boolean>;

// server/src/auth/throttle.ts
export function hitThrottle(db: D1Database, key: string, rule: ThrottleRule, now?: number): Promise<{ allowed: boolean; retryAfterSec: number }>;
export function recordLoginFailure(db: D1Database, emailNorm: string, now?: number): Promise<void>;

// server/src/email/sender.ts
export interface EmailSender { send(msg: { to: string; subject: string; text: string; html: string }): Promise<void> }

// Env additions
//   secrets: PASSWORD_PEPPER, PASSWORD_PEPPER_ID, TURNSTILE_SECRET
//   vars:    GAME_URL (exists), TURNSTILE_SITE_KEY (client build), MAIL_FROM = "noreply@pixelarrow.app"
//   bindings: EMAIL (send_email, remote), RL_AUTH_IP, RL_TG_AUTH_IP, RL_PUBLIC_IP (ratelimits)
```

### Implementation Guidelines
- Must store only `SHA-256(token)` for sessions and email tokens. Raw tokens must never be logged, stored or put in a URL query.
- Must run, in this order: IP limit → Turnstile → account throttle → hash. Hashing must never run before the cheap gates.
- Must use one uniform response for sign-up, reset and resend, whether the account exists or not, and one `invalid_credentials` for unknown email and wrong password, with the dummy-hash timing.
- Must create identity rows only after proof (verified email link or valid `initData`).
- Must check `Origin` on cookie-authenticated unsafe methods and WebSocket upgrades.
- Must never accept a cookie token as a bearer token or the other way round, nor both transports on one request.
- Must revoke all sessions on password reset, and all other sessions on password change.
- Must keep `DEV_AUTH` and `DEV_EMAIL` out of production: `server/scripts/deploy-config.mjs` fails the deploy if either is in vars.
- Must test every flow in `server/test/` (workerd) with a fake `EmailSender`, an injected `fetch` for Turnstile and the test secrets, plus a check that the `players.telegram_id` mirror equals the telegram identity after every identity write.
- Must never use the in-isolate `rateLimit.ts` for `/api/auth/*`.

## Alternatives Considered

### Alternative 1: argon2id in WASM
- **Description:** bundle an argon2 WASM build and hash with about 19 MiB of memory and t=2.
- **Pros:** memory-hard, the OWASP first choice.
- **Cons:** pure CPU inside WASM is hundreds of milliseconds per hash on Workers at useful parameters. It adds bundle weight and a supply-chain dependency, and the memory is taken from the 128 MB isolate that is shared with concurrent requests.
- **Rejection Reason:** the CPU and dependency cost of a WASM KDF is not justified when a native PBKDF2 plus a secret pepper and durable lockouts give an attacker with only a DB dump nothing to work with. We can switch later because the hash format carries its algorithm.

### Alternative 2: scrypt through `nodejs_compat` (`node:crypto`)
- **Description:** enable `nodejs_compat` and call `crypto.scrypt`.
- **Pros:** memory-hard and a standard API.
- **Cons:** turns on the Node compatibility layer for the whole Worker for one function. Its availability and CPU cost in workerd would need their own spike, and the bundle and behaviour change for every route.
- **Rejection Reason:** a larger surface for an uncertain gain. Revisit if PBKDF2's ceiling is ever reported as a real weakness.

### Alternative 3: Keep stateless HMAC tokens and add a deny-list
- **Description:** keep `pa1` with a `jti`, and a table of revoked ids.
- **Pros:** no D1 read on most requests.
- **Cons:** the deny-list has to be read on every request anyway to be correct. There is no device list, and "log out everywhere" needs a per-player epoch. Two mechanisms instead of one.
- **Rejection Reason:** a sessions table is simpler and complete. The D1 read is cheap, and the 30 s cache absorbs bursts.

### Alternative 4: Durable Object rate limiter per key
- **Description:** a `ThrottleDO` keyed by email hash or IP, holding counters in memory and storage.
- **Pros:** strongly consistent, fast, and can do sliding windows.
- **Cons:** a new DO class and migration, and one DO round trip per attempt. DO redeploys reset in-memory state unless it is persisted.
- **Rejection Reason:** auth-attempt volume is small, and D1 upserts are durable and global. The Rate Limiting binding already covers IP floods without a network hop.

### Alternative 5: Create the account at sign-up and gate it as "unverified"
- **Description:** insert the player and identity immediately, set `verified_at` later, and block online play until then.
- **Pros:** the player can start at once.
- **Cons:** anyone can squat any email address (the UNIQUE constraint blocks the real owner). A session at sign-up also leaks whether an address is registered.
- **Rejection Reason:** pending sign-ups in `email_tokens` avoid both problems. The player can play the offline campaign without an account while they wait.

### Alternative 6: A third-party auth provider (Auth0, Clerk, Supabase Auth)
- **Rejection Reason:** it adds a processor of personal data, a vendor and a cost, and it still needs the Telegram identity and linking built in-house. The brief asks for Cloudflare's own email service.

## Consequences

### Positive
- Any session can be revoked, and players can see and end their devices.
- A D1 leak alone does not expose passwords (pepper), tokens (hashed) or reset links (hashed).
- Credential stuffing is bounded per account globally, not per isolate.
- Every online-capable account is verified, by construction.
- Telegram keeps working in the iframe with bearer tokens. The web gets HttpOnly cookies that scripts cannot read.

### Negative
- One D1 read per authenticated request (cache: 30 s). A revocation can lag 30 s in other isolates.
- PBKDF2 at 310,000 iterations (floor 100,000) is below OWASP's current 600,000 for PBKDF2-SHA256, and needs Workers Paid because 100,000 alone takes about 8 ms of Free's 10 ms CPU. The pepper and lockout compensate, but if the pepper leaks together with D1, the margin is thinner than argon2 would give.
- Email Service is in Beta and needs Workers Paid.
- Sign-up needs a click in the mailbox before the first online session.

## Risks
- **Email Service Beta changes or deliverability is poor.** Mitigation: the `EmailSender` interface allows swapping in the REST API or another provider without touching the flows. Monitor bounces through the `cf-bounce` records.
- **Production caps PBKDF2 below 310,000 or runs it over 60 ms CPU.** Local workerd showed no cap; production is unconfirmed until owner action 7. Mitigation: lower `PBKDF2_ITERATIONS` to the highest passing count (floor 100,000); the parameter lives in the hash string, and rehash-on-login converges accounts.
- **The pepper is lost.** Every password becomes unverifiable. Mitigation: the owner stores it in a password manager. Recovery is a forced reset through email, which still works.
- **The 30 s session cache serves a revoked session.** Accepted: it is bounded and documented. Deletion and bans also check `deleted_at` and `banned_at` from the same joined row.
- **The Rate Limiting binding works per location.** A distributed attacker gets the limit at each location. Mitigation: the per-account D1 lockout is global, and Turnstile raises the cost per attempt.
- **The mail cap is used to block a victim's own sign-up or reset** by spending their quota. Mitigation: the caps are small but reset hourly, and an attacker needs Turnstile per attempt. Accepted.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `docs/playbook/director-brief-v6.md` Goal 5 | Email and password sign-up and log-in, verification and reset through Cloudflare's email service, slow server-side hash, secure cookie sessions, rate limits on log-in and reset | §1–§5 |
| Brief Goal 8 | Turnstile on sign-up and log-in, per-IP and per-account limits, verification before online play | §5, §6, §7 |
| Brief Goal 4 / ADR-0006 | The `Auth` interface hides bearer vs cookie | §3 transports |
| `docs/v6/audit/SERVER.md` "Gaps for v6 accounts" and "Security notes" | revocation, `?token=` leakage, per-isolate limits, `DEV_AUTH` guard | §3, §5, Implementation Guidelines |

GDD sync: NOT ASSESSED. No GDD exists yet for accounts (the account and linking UX spec is a separate Phase 2 story); this ADR is the source it must follow.

## Performance Implications
- **CPU:** about 25 ms per password hash at 310,000 iterations measured locally (about 52 ms if production is 2× slower; ceiling 60 ms; production pending owner action 7), only on log-in, sign-up, reset and change. Requires Workers Paid. The session lookup is a SHA-256 of 32 bytes, which is negligible.
- **Memory:** a 30 s session cache per isolate, capped at 5,000 entries.
- **Load Time:** none for the game. The web log-in screen loads the Turnstile script (about 50 KB) on the auth forms only.
- **Network:** one D1 read per uncached authenticated request; one siteverify call per anonymous form submit; one email send per mail flow.

## Migration Plan
No live users (V5-074), so this is a straight cut-over:
1. `0017_accounts.sql`: rebuild `players` with a nullable `telegram_id` and the new columns, and create the five tables. Because players is rebuilt, run it with `PRAGMA defer_foreign_keys = on` (D1 supports it) and copy the existing rows (dev and staging only). Fill `display_name` for existing rows with generated names (ADR-0009).
2. Replace `session.ts` and `requireAuth` across all route files (about 50 call sites use `requireAuth`) in one commit. Remove `pa1`, `SESSION_SECRET` and `?token=`.
3. Client: the Telegram adapter keeps "initData → bearer, re-auth on 401". The web adapter uses cookies (`credentials: 'same-origin'`).
4. Re-check V5-074 before v6 ships: once real players exist, a session-format change needs a grace period.

## Validation Criteria
- Workerd tests: every flow and endpoint in §4, including uniform responses (same status and body for a known and an unknown email), lockout escalation, mail caps, single-use and expired tokens, `Origin` rejection, the both-transports rejection, a cookie token refused as bearer, `?token=` refused, rehash-on-login, and the identity–mirror invariant.
- The Turnstile tests pass with the dummy token against the `1x`, `2x` and `3x` secrets.
- The spike results (PBKDF2 CPU, email delivery, SPF, DKIM and DMARC pass) are recorded in `docs/v6/qa/`.
- `/security-audit network` shows no open HIGH on `/api/auth/*` before merge.

## Owner actions (for `docs/v6/OWNER_ACTIONS.md`)
1. Move the account to **Workers Paid** if it isn't already (needed for Email Service sending).
2. **Email:** Dashboard → Compute → Email Service → Email Sending → Onboard Domain → `pixelarrow.app`. Accept the records it adds (MX and TXT for SPF and DKIM on `cf-bounce.pixelarrow.app`, DMARC TXT on `_dmarc.pixelarrow.app`). If a DMARC record already exists, merge rather than duplicate. Wait for it to show as verified. Then send a test to an outside mailbox and check that SPF, DKIM and DMARC pass in the headers.
3. **Turnstile:** Dashboard → Turnstile → Add widget "pixelarrow-play", hostnames `play.pixelarrow.app`, mode Managed. Put the site key in the Actions variable `TURNSTILE_SITE_KEY`, then run `wrangler secret put TURNSTILE_SECRET` on the game Worker.
4. **Secrets:** `wrangler secret put PASSWORD_PEPPER` (generate with `openssl rand -base64 32`; keep a copy in a password manager), `wrangler secret put PASSWORD_PEPPER_ID` (`1`). Delete `SESSION_SECRET` after the v6 deploy.
5. **Rate Limiting:** nothing to create. The bindings are in `wrangler.jsonc` (Wrangler 4.36 or later). Make sure the namespace ids 6001–6003 are not used by another Worker on the account.

## Related
- ADR-0006 (platform layer, `Auth`), ADR-0007 (hosting), ADR-0009 (linking, names, deletion), ADR-0010 (public stats)
- `docs/v6/plan/CONTROL_MANIFEST_ACCOUNTS.md`
- `docs/v6/audit/SERVER.md`, `docs/v6/audit/HOSTING.md`
- `server/src/session.ts`, `middleware.ts`, `routes/auth.ts`, `rateLimit.ts`, `players.ts` (to be replaced or changed)
