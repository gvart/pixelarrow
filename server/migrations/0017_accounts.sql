-- v6 accounts and sessions (ADR-0008 §1, §3). No live users (V5-074): dev and
-- staging rows are copied, nothing is kept for old clients.
--
-- players is rebuilt because SQLite cannot drop NOT NULL from telegram_id.
-- D1 always enforces foreign keys, so the rebuild runs with deferred checks.
-- DROP TABLE performs an implicit DELETE: every child row of the ~40 tables
-- that reference players(id) counts as a deferred violation, and a RENAME does
-- not clear that count, so the commit would fail. The rows are therefore
-- inserted only after the new table is renamed into place: each inserted
-- parent row cancels the violations of its children, which point at the same
-- ids again. The implicit DELETE also fires ON DELETE CASCADE: saves is the one
-- cascading child, so its rows are parked in a copy and put back.
PRAGMA defer_foreign_keys = on;

CREATE TABLE saves_0017 AS SELECT * FROM saves;

CREATE TABLE players_0017 (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id       INTEGER UNIQUE,          -- nullable mirror of the telegram identity (bot, notifications, admin)
  username          TEXT,                    -- Telegram profile fields: NULL for email-only players,
  first_name        TEXT,                    -- never shown to other players (ADR-0009)
  language_code     TEXT,
  is_premium        INTEGER NOT NULL DEFAULT 0,
  display_name      TEXT NOT NULL,           -- the public name (ADR-0009)
  display_name_key  TEXT NOT NULL UNIQUE,    -- folded for uniqueness (server/src/names/generate.ts nameKey)
  created_at        INTEGER NOT NULL,        -- unix ms
  last_seen_at      INTEGER NOT NULL,
  banned_at         INTEGER,
  ban_reason        TEXT,
  analytics_opt_out INTEGER NOT NULL DEFAULT 0,
  deleted_at        INTEGER                  -- ADR-0009 tombstone
);

-- Existing rows get generated names, <Adjective><Unit><4 digits> (injective in id
-- below 160,000 ids; the key folds the digits as nameKey does). They wait in a
-- plain table (no keys) until players_0017 is renamed into place.
CREATE TABLE players_0017_rows AS
SELECT id, telegram_id, username, first_name, language_code, is_premium, name AS display_name,
       replace(replace(replace(replace(replace(replace(lower(name), '0', 'o'), '1', 'l'), '3', 'e'), '4', 'a'), '5', 's'), '7', 't') AS display_name_key,
       created_at, last_seen_at, banned_at, ban_reason, analytics_opt_out
FROM (
  SELECT p.*,
         (CASE p.id % 4 WHEN 0 THEN 'Swift' WHEN 1 THEN 'Bold' WHEN 2 THEN 'Iron' ELSE 'Grim' END)
         || (CASE (p.id / 4) % 4 WHEN 0 THEN 'Archer' WHEN 1 THEN 'Spear' WHEN 2 THEN 'Hoplite' ELSE 'Rider' END)
         || printf('%04d', (p.id / 16) % 10000) AS name
  FROM players p
);

DROP TABLE players;
ALTER TABLE players_0017 RENAME TO players;
INSERT INTO players (id, telegram_id, username, first_name, language_code, is_premium, display_name, display_name_key,
                     created_at, last_seen_at, banned_at, ban_reason, analytics_opt_out)
SELECT id, telegram_id, username, first_name, language_code, is_premium, display_name, display_name_key,
       created_at, last_seen_at, banned_at, ban_reason, analytics_opt_out
FROM players_0017_rows;
DROP TABLE players_0017_rows;
CREATE INDEX idx_players_banned ON players(banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX idx_players_username ON players(username COLLATE NOCASE);

INSERT INTO saves SELECT * FROM saves_0017 WHERE player_id NOT IN (SELECT player_id FROM saves);
DROP TABLE saves_0017;

-- Log-in methods. Rows exist only after proof (valid initData, a clicked email link).
CREATE TABLE auth_identities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('telegram', 'password')),
  subject       TEXT NOT NULL,       -- telegram: decimal user id; password: normalised email
  email         TEXT,                -- password only: the address as typed
  verified_at   INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE (kind, subject),
  UNIQUE (player_id, kind)
);

INSERT INTO auth_identities (player_id, kind, subject, verified_at, created_at, last_login_at)
SELECT id, 'telegram', CAST(telegram_id AS TEXT), created_at, created_at, last_seen_at FROM players WHERE telegram_id IS NOT NULL;

CREATE TABLE password_hashes (
  identity_id   INTEGER PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  hash          TEXT NOT NULL,       -- 'pbkdf2-sha256$<iter>$<pepperId>$<salt b64url>$<dk b64url>'
  updated_at    INTEGER NOT NULL
);

-- Server-side sessions; the token itself is never stored.
CREATE TABLE sessions (
  id_hash         TEXT PRIMARY KEY,  -- b64url(SHA-256(token))
  player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  transport       TEXT NOT NULL CHECK (transport IN ('cookie', 'bearer')),
  method          TEXT NOT NULL CHECK (method IN ('telegram', 'password', 'email_link')),
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,  -- written at most once per hour per session
  idle_expires_at INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,  -- absolute
  reauth_at       INTEGER,           -- last fresh proof (ADR-0009 sensitive actions)
  device          TEXT               -- e.g. 'Chrome on macOS'; no IP is stored
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
  key           TEXT PRIMARY KEY,    -- e.g. 'login:' || b64url(SHA-256(email_norm)), 'mail:' || ...
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER
);

-- Local dev and tests only: LogEmailSender writes here when DEV_EMAIL=1
-- (ADR-0008 §4); the deploy config refuses DEV_EMAIL, so production never does.
CREATE TABLE dev_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr     TEXT NOT NULL,
  subject     TEXT NOT NULL,
  text        TEXT NOT NULL,
  html        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
