-- Pixelarrow backend v1 schema (D1 / SQLite).
-- Session tokens are stateless (HMAC-signed), so there is no sessions table.

CREATE TABLE players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   INTEGER NOT NULL UNIQUE,
  username      TEXT,
  first_name    TEXT,
  language_code TEXT,
  is_premium    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,          -- unix ms
  last_seen_at  INTEGER NOT NULL
);

-- One campaign save blob per player; revision drives optimistic concurrency.
CREATE TABLE saves (
  player_id     INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  revision      INTEGER NOT NULL,
  version       INTEGER NOT NULL,          -- SaveData.v of the stored blob
  data          TEXT NOT NULL,             -- JSON
  size          INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Telegram Stars payments, recorded idempotently by the charge id.
CREATE TABLE purchases (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_payment_charge_id  TEXT NOT NULL UNIQUE,
  player_id                   INTEGER NOT NULL REFERENCES players(id),
  product_id                  TEXT NOT NULL,
  currency                    TEXT NOT NULL,
  stars_amount                INTEGER NOT NULL,
  payload                     TEXT NOT NULL,
  created_at                  INTEGER NOT NULL,
  refunded                    INTEGER NOT NULL DEFAULT 0,
  refunded_at                 INTEGER
);
CREATE INDEX idx_purchases_player ON purchases(player_id, created_at);

-- What a player owns. One row per (player, product); revoked on refund.
CREATE TABLE entitlements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  product_id    TEXT NOT NULL,
  purchase_id   INTEGER REFERENCES purchases(id),
  granted_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  UNIQUE (player_id, product_id)
);
CREATE INDEX idx_entitlements_player ON entitlements(player_id);
