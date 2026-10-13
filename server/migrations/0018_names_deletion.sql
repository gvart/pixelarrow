-- v6 display names, linking and deletion (ADR-0009 §3, §5, §6, §7). 0017 already
-- added players.display_name, display_name_key and deleted_at. No live users
-- (V5-074). The linking and deletion tables are created here, as the ADR's
-- migration plan says; their code comes with V6-LINK-03 and V6-LINK-04.

-- Names (§6): the public-boards opt-out, the rename cooldown and the moderation lock.
ALTER TABLE players ADD COLUMN public_boards INTEGER NOT NULL DEFAULT 1;  -- 0: hidden from pixelarrow.app boards (ADR-0010)
ALTER TABLE players ADD COLUMN name_changed_at INTEGER;                   -- last rename by the player (NULL: the first one is free)
ALTER TABLE players ADD COLUMN name_locked_until INTEGER;                 -- set by an admin rename: no rename before it

-- names/validate.ts nameKey now folds i, 1 and l together; 0017's keys (generated
-- Latin names, digits already folded) only lack the i -> l step.
UPDATE players SET display_name_key = replace(display_name_key, 'i', 'l') WHERE deleted_at IS NULL;

-- Every rename, by the player or an admin. old_key holds a freed name for 30 days.
CREATE TABLE display_name_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  old         TEXT NOT NULL,
  new         TEXT NOT NULL,
  old_key     TEXT NOT NULL,
  changed_at  INTEGER NOT NULL,
  by_admin    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX display_name_history_key ON display_name_history (old_key, changed_at);
CREATE INDEX display_name_history_player ON display_name_history (player_id, changed_at);

-- Web -> Telegram link codes (§3): 16 random bytes, only the hash stored, 10 minutes,
-- single use, bound to the player and the web session that created them.
CREATE TABLE link_codes (
  code_hash     TEXT PRIMARY KEY,    -- b64url(SHA-256(code))
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_hash  TEXT NOT NULL,       -- sessions.id_hash of the creating web session
  telegram_id   INTEGER,             -- set by the Mini App's complete step
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_web', 'used')),
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX link_codes_player ON link_codes (player_id);

-- Link conflicts waiting for the player's choice (§5): 15 minutes, pruned daily.
CREATE TABLE link_conflicts (
  id               TEXT PRIMARY KEY,
  player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- the side that asked
  other_player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL
);

-- Resumable account deletion (§7): the daily cron finishes interrupted runs.
CREATE TABLE deletion_jobs (
  player_id    INTEGER PRIMARY KEY REFERENCES players(id),
  reason       TEXT NOT NULL CHECK (reason IN ('self', 'conflict', 'admin')),
  step         INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER
);

-- A deleted banned player's identities, as SHA-256(pepper || kind || subject) only, for 180 days (§7).
CREATE TABLE ban_tombstones (
  identity_hash  TEXT PRIMARY KEY,
  banned_at      INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL
);
