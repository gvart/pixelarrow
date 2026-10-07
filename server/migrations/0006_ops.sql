-- Operations: bans, analytics consent and milestones, client error reports,
-- the admin audit log. See docs/OPS.md.

-- A banned player cannot sign in, and their existing session tokens stop
-- working within a minute (server/src/ban.ts caches the banned ids).
ALTER TABLE players ADD COLUMN banned_at INTEGER;
ALTER TABLE players ADD COLUMN ban_reason TEXT;
-- 1 when the player switched analytics off in Settings (server-side events
-- that have no request to read the opt-out header from honour this).
ALTER TABLE players ADD COLUMN analytics_opt_out INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_players_banned ON players(banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX idx_players_username ON players(username COLLATE NOCASE);

-- "First X" analytics events fire once per player: the row is the guard.
CREATE TABLE analytics_milestones (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  milestone   TEXT NOT NULL,                       -- first_battle | first_capture | first_purchase
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, milestone)
);

-- Client crash reports, deduplicated: one row per fingerprint (kind, message,
-- top stack frame, app version), with a count. Pruned 30 days after last_seen
-- by the daily cron (server/src/index.ts scheduled).
CREATE TABLE client_errors (
  fingerprint   TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,                     -- error | rejection | scene | console
  message       TEXT NOT NULL,
  stack         TEXT,
  scene         TEXT,
  app_version   TEXT,
  platform      TEXT,
  tg_version    TEXT,
  breadcrumbs   TEXT,                              -- JSON of the latest sample
  device        TEXT,                              -- JSON of the latest sample (viewport, dpr, ua family)
  count         INTEGER NOT NULL DEFAULT 0,
  last_player   INTEGER,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);
CREATE INDEX idx_client_errors_seen ON client_errors(last_seen);

-- Every admin panel action (server/src/admin). request_id makes a retried
-- action a no-op that answers the first result.
CREATE TABLE admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL UNIQUE,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,                       -- ban | unban | adjust | refund | season_end | season_start
  player_id   INTEGER,
  detail      TEXT,                                -- JSON: the request (reason, amounts)
  result      TEXT,                                -- JSON: what happened
  ip          TEXT,
  nonce       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_admin_audit_player ON admin_audit(player_id, created_at);
CREATE INDEX idx_admin_audit_time ON admin_audit(created_at);
