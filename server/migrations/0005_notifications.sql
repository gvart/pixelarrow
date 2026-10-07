-- Bot notifications and payment support (server/src/notify, server/src/bot).

-- Per-player notification settings. No row = everything on, no quiet hours known.
CREATE TABLE notify_settings (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  disabled    TEXT NOT NULL DEFAULT '',   -- comma-separated notification types switched off (attack, march, ...)
  quiet       INTEGER NOT NULL DEFAULT 1, -- quiet hours (23:00-08:00 local) on; only used when tz_offset is known
  tz_offset   INTEGER,                    -- minutes east of UTC, reported by the Mini App; NULL = unknown
  blocked_at  INTEGER,                    -- Telegram answered 403 (bot blocked / never started): send nothing until /start
  updated_at  INTEGER NOT NULL
);

-- Outbox: one row per game event, unique per (player, dedupe key), so a
-- replayed request never notifies twice. Rows wait here while the player is
-- rate limited, in quiet hours or inside a coalescing window; one message can
-- cover several rows ("3 attacks on your land in the last hour").
CREATE TABLE notify_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL,
  type        TEXT NOT NULL,              -- opt-out group
  event       TEXT NOT NULL,              -- template id, e.g. attack_captured
  dedupe      TEXT NOT NULL,
  data        TEXT NOT NULL,              -- JSON template parameters
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | sent | skipped
  sent_at     INTEGER,
  UNIQUE (player_id, dedupe)
);
CREATE INDEX idx_notify_outbox_pending ON notify_outbox(status, player_id);
CREATE INDEX idx_notify_outbox_created ON notify_outbox(created_at);

-- Messages actually sent (rate limit and coalescing windows).
CREATE TABLE notify_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL,
  type        TEXT NOT NULL,
  events      INTEGER NOT NULL,           -- outbox rows the message covered
  sent_at     INTEGER NOT NULL
);
CREATE INDEX idx_notify_log_player ON notify_log(player_id, sent_at);

-- /paysupport and /delete_my_data requests, for the operator (admin panel or
-- `wrangler d1 execute pixelarrow --remote --command "SELECT * FROM support_requests WHERE status = 'open'"`).
CREATE TABLE support_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,              -- payment | deletion
  telegram_id INTEGER NOT NULL,
  player_id   INTEGER,
  username    TEXT,
  language    TEXT,
  text        TEXT NOT NULL,
  purchases   TEXT,                       -- JSON: the player's last Stars purchases (charge id, product, stars, date, refunded)
  status      TEXT NOT NULL DEFAULT 'open', -- open | answered | closed
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  note        TEXT                        -- operator note
);
CREATE INDEX idx_support_requests_status ON support_requests(status, created_at);

-- Small per-chat bot conversation state (e.g. waiting for the /paysupport description).
CREATE TABLE bot_state (
  telegram_id INTEGER PRIMARY KEY,
  state       TEXT NOT NULL,
  until       INTEGER NOT NULL
);

-- Key/value bookkeeping of the bot and the scheduled jobs (commands version, season notices sent).
CREATE TABLE bot_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
