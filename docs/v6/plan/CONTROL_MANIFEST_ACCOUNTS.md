# Control manifest: accounts, linking, deletion, public stats

Flat rules, taken from ADR-0008 (accounts and sessions), ADR-0009 (linked accounts, display names, deletion) and ADR-0010 (public stats API). The ADRs explain why; this sheet is what reviewers check. Any story touching `server/src/auth/`, `account/`, `names/`, `public/`, `session*`, `middleware.ts`, or migrations 0017–0019 must pass every rule here, have workerd tests, and get a `/security-audit` before merge.

Status: derived from **Proposed** ADRs. If an ADR changes when it is accepted, update this sheet in the same commit.

## Identity and schema

**Must**
- M-ID-1: keep `players.id` the only key for game data. Log-in methods live in `auth_identities` (at most one `telegram` and one `password` per player; `UNIQUE(kind, subject)`).
- M-ID-2: insert an identity row only after proof: a verified email link, or valid Telegram `initData`.
- M-ID-3: write the telegram identity and the `players.telegram_id` mirror in the same D1 batch, and clear both together on unlink and deletion.
- M-ID-4: normalise emails as trim + NFKC + lower-case only, at most 254 characters.
- M-ID-5: add every new player-keyed table to `DELETION_MAP` (ADR-0009 §7).

**Never**
- N-ID-1: never create a player or identity at sign-up before the email is verified.
- N-ID-2: never read `players.telegram_id` for log-in decisions. Use `auth_identities`.

## Passwords

**Must**
- M-PW-1: hash with PBKDF2-HMAC-SHA256 at 100,000 iterations (the workerd ceiling), a 16-byte salt and a 32-byte output, over `HMAC-SHA256(PASSWORD_PEPPER, password)`. Store it as `pbkdf2-sha256$<iter>$<pepperId>$<salt>$<dk>`.
- M-PW-2: rehash on successful log-in when the stored parameters or pepper id are out of date.
- M-PW-3: enforce 10–128 characters, no composition rules, and reject the bundled common-password list and passwords equal to the email or its local part.
- M-PW-4: compare in constant time, and verify against a dummy hash when the email is unknown.

**Never**
- N-PW-1: never truncate, log or return a password or a hash. Never put the pepper in D1, the repo or a log.
- N-PW-2: never hash before the IP limit, Turnstile and account throttle have passed.

## Sessions

**Must**
- M-SE-1: tokens are `pa2_` + 32 random bytes. Store only `SHA-256(token)`.
- M-SE-2: web sessions use the cookie `__Host-pa_sid` with `Path=/; Secure; HttpOnly; SameSite=Lax` (30 days absolute, 7 days idle). Telegram uses bearer tokens (24 h).
- M-SE-3: check `Origin == GAME_URL` on every cookie-authenticated `POST`, `PUT`, `PATCH`, `DELETE` and WebSocket upgrade. A missing `Origin` is refused.
- M-SE-4: rotate on log-in. Revoke all sessions on reset, and all others on password change.
- M-SE-5: look up the session joined with `players` (ban, deletion, display name) on every request. The per-isolate cache lasts at most 30 s.
- M-SE-6: offer log-out, log-out-all, a session list and per-session revoke. Expose only a 12-character handle, never the hash.

**Never**
- N-SE-1: never accept a token in a URL query (`?token=` is removed). Sockets use the cookie or `Sec-WebSocket-Protocol`.
- N-SE-2: never accept a cookie token as bearer or the other way round, nor both on one request.
- N-SE-3: never set `Domain=` on a cookie, and never send a session cookie to `pixelarrow.app`.
- N-SE-4: never ship `DEV_AUTH` or `DEV_EMAIL` to production. `deploy-config.mjs` must fail if either is present.

## Anonymous auth forms (sign-up, log-in, reset, resend)

**Must**
- M-AF-1: run the gates in this order: Rate Limiting binding per IP → Turnstile → D1 `auth_throttle` → work.
- M-AF-2: Turnstile siteverify must check `success`, the exact `action`, a `hostname` in the allow-list and `challenge_ts` ≤ 300 s, and send an `idempotency_key`. A siteverify error fails closed.
- M-AF-3: give uniform responses. Sign-up, reset and resend always return `202 check_email`. Log-in always returns `401 invalid_credentials` on any failure, including a lockout.
- M-AF-4: lock log-in per `sha256(email_norm)` after 5 failures, doubling from 1 minute up to 1 hour. Success resets it.
- M-AF-5: cap mail at 3 per address per hour and 10 per day, all purposes together, and send nothing silently over the cap.
- M-AF-6: email tokens are 32 random bytes, stored hashed and single use. Verify links last 24 h, reset links 30 min. Links carry the token in the URL fragment (`#t=`).

**Never**
- N-AF-1: never use the in-isolate `rateLimit.ts` for `/api/auth/*`.
- N-AF-2: never reveal whether an email is registered, whether by status, body, timing or session creation.
- N-AF-3: never run Turnstile on the Telegram `initData` route or inside the Mini App.

## Online gate

**Must**
- M-OG-1: guard every online route and socket (`/api/online/*`, `/api/duel/*`, economy writes, `/api/battle/verify`, `/ws/*`) with `requirePlayable`: the session has an identity, and the player is not banned and not deleted.

## Linking, unlinking, conflicts

**Must**
- M-LK-1: require re-auth (`reauth_at` ≤ 10 min) for link, unlink, email change, conflict resolution and deletion.
- M-LK-2: web → Telegram linking uses a single-use, 10-minute, hashed link code; the Mini App `initData` with `start_param = link_<code>`; **and** confirmation from the same web session that created the code.
- M-LK-3: Telegram → email linking completes only through the emailed `add_email` link.
- M-LK-4: notify by email and bot on every identity change. Email changes notify the old address.
- M-LK-5: on a conflict with an empty other account, delete it automatically. With both accounts holding progress, the player chooses, after proving both accounts and typing the loser's name.
- M-LK-6: an account with purchases or entitlements is always the survivor. If both have them, refuse with `contact_support`.
- M-LK-7: refuse with `busy_try_later` when the losing account is in a live duel, the queue, an open ticket or a boss attempt.

**Never**
- N-LK-1: never merge game state between two players.
- N-LK-2: never remove a player's last identity.
- N-LK-3: never link on a code alone (one side's proof) without the web confirmation.

## Display names

**Must**
- M-DN-1: every public surface (boards, standings, opponent cards, rosters, presence, the public API) shows `display_name` only.
- M-DN-2: new players get a generated `<Adjective><Unit><4 digits>` name.
- M-DN-3: validate on the server with `names/validate.ts`: 3–16 characters; Latin or Cyrillic (never mixed), digits, single space, `_` and `-`; at least one letter; reserved words and the blocklist checked on the folded key; `display_name_key UNIQUE`.
- M-DN-4: allow one free rename, then one every 30 days, and none while `name_locked_until` is in the future. Log every change to `display_name_history`, and hold freed names for 30 days.
- M-DN-5: run clan names through the same validator (3–20 characters).

**Never**
- N-DN-1: never send another player's `first_name`, `username` or `telegram_id` to any client.
- N-DN-2: never use the Telegram name as a default display name.

## Deletion

**Must**
- M-DL-1: `DELETE /api/account` with re-auth and `confirm: 'DELETE'`. It is immediate and irreversible, warns about purchases, and offers unlink as the alternative when two identities exist.
- M-DL-2: in this order: mark `deleted_at` → revoke sessions and delete identities, tokens and throttle keys → leave the market, regions, clan, queue and sockets → hard-delete personal and gameplay rows → anonymise the kept rows → tombstone the `players` row.
- M-DL-3: keep `purchases`, `entitlements`, `drachmae_ledger`, `market_audit` and `admin_audit` pointing only at the tombstone id, with no personal data. Other players' histories show "Deleted player".
- M-DL-4: make deletion resumable through `deletion_jobs`, and have the daily cron finish interrupted runs.
- M-DL-5: for a banned player, keep only `SHA-256(pepper ‖ kind ‖ subject)` in `ban_tombstones` for 180 days.
- M-DL-6: keep the schema-driven test that fails when any player-keyed table is missing from `DELETION_MAP`.

**Never**
- N-DL-1: never leave a personal field on the tombstone (`username`, `first_name`, `telegram_id`, `language_code` are NULL).
- N-DL-2: never show a deleted, banned or opted-out (`public_boards = 0`) player on a public board.

## Public stats API

**Must**
- M-PS-1: `/api/public/*` serves only `GET`/`HEAD /api/public/v1/summary` from the `public_snapshot` row. The cron builds the snapshot every 5 minutes.
- M-PS-2: validate the snapshot against the strict `PublicSummaryV1` zod schema before writing it: at most 10 rows per board, at most 32 KB.
- M-PS-3: a board with fewer than 3 eligible rows is `[]`. Totals are always real values. Battles are labelled online battles.
- M-PS-4: `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`, plus `ETag` and `nosniff`.
- M-PS-5: the landing reaches it through the `PublicApi` RPC entrypoint over the service binding. It caches the result and serves a 24 h last-good copy on failure.
- M-PS-6: rate-limit HTTP calls per `cf-connecting-ip` (`RL_PUBLIC_IP` on the game Worker; `RL_LANDING_PUBLIC` on the landing, on cache miss only).

**Never**
- N-PS-1: never run aggregates, game reads or writes on the request path (`leaderboard()` calls `rollRatings`; use `publicDuelTop`).
- N-PS-2: never include ids, Telegram data, emails, last-seen times per player, wallet, purchase or revenue data, rating RD or volatility, or clan ids or codes.
- N-PS-3: never add CORS headers, read cookies or sessions, or set cookies on `/api/public/*`.
- N-PS-4: never trust a client-IP header from the internet.

## Secrets and config

**Must**
- M-SC-1: secrets `PASSWORD_PEPPER`, `PASSWORD_PEPPER_ID` and `TURNSTILE_SECRET` are set with `wrangler secret put`. Local values live in `.dev.vars` (gitignored), with `.dev.vars.example` using Turnstile test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`).
- M-SC-2: bindings in `wrangler.jsonc`: `send_email` `EMAIL` (`"remote": true`); `ratelimits` `RL_AUTH_IP` (6001), `RL_TG_AUTH_IP` (6002), `RL_PUBLIC_IP` (6003); landing `RL_LANDING_PUBLIC` (6004).
- M-SC-3: tests use a fake `EmailSender`, an injected `fetch` for siteverify, the dummy token `XXXX.DUMMY.TOKEN.XXXX` and the `2x`/`3x` test secrets.

**Never**
- N-SC-1: never commit a real secret, site key secret or pepper. Never deploy, run remote migrations or change the dashboard from a story (the owner does it, via `OWNER_ACTIONS.md`).
