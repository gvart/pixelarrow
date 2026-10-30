-- Telegram is gone from the schema: dev sign-ins become the 'dev' identity kind and session method,
-- players lose telegram_id and is_premium, purchases lose telegram_payment_charge_id, client_errors
-- loses tg_version, and the link, bot, notification and support tables go. No live users.
--
-- players and purchases are rebuilt (SQLite cannot drop a UNIQUE column), the same way as 0017:
-- D1 always enforces foreign keys, so checks are deferred, and the rows go back in only after the
-- new table is renamed into place, which cancels the deferred violations of their children. DROP
-- TABLE players also fires ON DELETE CASCADE, so the cascading children are parked and put back
-- (saves, email_tokens) or rebuilt from a copy (auth_identities, password_hashes, sessions).
PRAGMA defer_foreign_keys = on;

DROP TABLE IF EXISTS link_codes;
DROP TABLE IF EXISTS link_conflicts;
DROP TABLE IF EXISTS bot_state;
DROP TABLE IF EXISTS notify_settings;
DROP TABLE IF EXISTS notify_outbox;
DROP TABLE IF EXISTS support_requests;

ALTER TABLE client_errors DROP COLUMN tg_version;

-- Park the cascading children of players.
CREATE TABLE saves_0051 AS SELECT * FROM saves;
CREATE TABLE email_tokens_0051 AS SELECT * FROM email_tokens;
CREATE TABLE auth_identities_0051 AS SELECT * FROM auth_identities;
CREATE TABLE password_hashes_0051 AS SELECT * FROM password_hashes;
CREATE TABLE sessions_0051 AS SELECT * FROM sessions;
DROP TABLE password_hashes;
DROP TABLE auth_identities;
DROP TABLE sessions;

-- players
CREATE TABLE players_0051_rows AS
SELECT id, username, first_name, language_code, display_name, display_name_key, created_at, last_seen_at,
       banned_at, ban_reason, analytics_opt_out, deleted_at, public_boards, name_changed_at, name_locked_until
FROM players;

CREATE TABLE players_0051 (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  username          TEXT,                    -- profile fields (the dev sign-in sets them),
  first_name        TEXT,                    -- never shown to other players (ADR-0009)
  language_code     TEXT,
  display_name      TEXT NOT NULL,           -- the public name (ADR-0009)
  display_name_key  TEXT NOT NULL UNIQUE,    -- folded for uniqueness (server/src/names/generate.ts nameKey)
  created_at        INTEGER NOT NULL,        -- unix ms
  last_seen_at      INTEGER NOT NULL,
  banned_at         INTEGER,
  ban_reason        TEXT,
  analytics_opt_out INTEGER NOT NULL DEFAULT 0,
  deleted_at        INTEGER,                 -- ADR-0009 tombstone
  public_boards     INTEGER NOT NULL DEFAULT 1,
  name_changed_at   INTEGER,
  name_locked_until INTEGER
);

DROP TABLE players;
ALTER TABLE players_0051 RENAME TO players;
INSERT INTO players (id, username, first_name, language_code, display_name, display_name_key, created_at, last_seen_at,
                     banned_at, ban_reason, analytics_opt_out, deleted_at, public_boards, name_changed_at, name_locked_until)
SELECT id, username, first_name, language_code, display_name, display_name_key, created_at, last_seen_at,
       banned_at, ban_reason, analytics_opt_out, deleted_at, public_boards, name_changed_at, name_locked_until
FROM players_0051_rows;
DROP TABLE players_0051_rows;
CREATE INDEX idx_players_banned ON players(banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX idx_players_username ON players(username COLLATE NOCASE);

INSERT OR IGNORE INTO saves SELECT * FROM saves_0051;
DROP TABLE saves_0051;
INSERT OR IGNORE INTO email_tokens SELECT * FROM email_tokens_0051;
DROP TABLE email_tokens_0051;

-- Log-in methods: 'dev' is the local DEV_AUTH sign-in.
CREATE TABLE auth_identities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('dev', 'password')),
  subject       TEXT NOT NULL,       -- dev: decimal dev id; password: normalised email
  email         TEXT,                -- password only: the address as typed
  verified_at   INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE (kind, subject),
  UNIQUE (player_id, kind)
);
INSERT INTO auth_identities (id, player_id, kind, subject, email, verified_at, created_at, last_login_at)
SELECT id, player_id, CASE kind WHEN 'telegram' THEN 'dev' ELSE kind END, subject, email, verified_at, created_at, last_login_at
FROM auth_identities_0051;
DROP TABLE auth_identities_0051;

CREATE TABLE password_hashes (
  identity_id   INTEGER PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  hash          TEXT NOT NULL,       -- 'pbkdf2-sha256$<iter>$<pepperId>$<salt b64url>$<dk b64url>'
  updated_at    INTEGER NOT NULL
);
INSERT INTO password_hashes (identity_id, hash, updated_at) SELECT identity_id, hash, updated_at FROM password_hashes_0051;
DROP TABLE password_hashes_0051;

CREATE TABLE sessions (
  id_hash         TEXT PRIMARY KEY,  -- b64url(SHA-256(token))
  player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  transport       TEXT NOT NULL CHECK (transport IN ('cookie', 'bearer')),
  method          TEXT NOT NULL CHECK (method IN ('dev', 'password', 'email_link')),
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,  -- written at most once per hour per session
  idle_expires_at INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,  -- absolute
  reauth_at       INTEGER,           -- last fresh proof (ADR-0009 sensitive actions)
  device          TEXT               -- e.g. 'Chrome on macOS'; no IP is stored
);
INSERT INTO sessions (id_hash, player_id, transport, method, created_at, last_seen_at, idle_expires_at, expires_at, reauth_at, device)
SELECT id_hash, player_id, transport, CASE method WHEN 'telegram' THEN 'dev' ELSE method END, created_at, last_seen_at,
       idle_expires_at, expires_at, reauth_at, device
FROM sessions_0051;
DROP TABLE sessions_0051;
CREATE INDEX sessions_player ON sessions (player_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- purchases (entitlements.purchase_id points at it)
CREATE TABLE purchases_0051_rows AS
SELECT id, player_id, product_id, currency, stars_amount, payload, created_at, refunded, refunded_at FROM purchases;

CREATE TABLE purchases_0051 (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  product_id    TEXT NOT NULL,
  currency      TEXT NOT NULL,
  stars_amount  INTEGER NOT NULL,
  payload       TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  refunded      INTEGER NOT NULL DEFAULT 0,
  refunded_at   INTEGER
);

DROP TABLE purchases;
ALTER TABLE purchases_0051 RENAME TO purchases;
INSERT INTO purchases (id, player_id, product_id, currency, stars_amount, payload, created_at, refunded, refunded_at)
SELECT id, player_id, product_id, currency, stars_amount, payload, created_at, refunded, refunded_at FROM purchases_0051_rows;
DROP TABLE purchases_0051_rows;
CREATE INDEX idx_purchases_player ON purchases(player_id, created_at);
