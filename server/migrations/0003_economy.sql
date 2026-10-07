-- Economy: Drachmae (premium currency), the shop (cosmetics, consumables,
-- season pass), consumable inventories, the season pass and the town
-- marketplace. See server/README.md "Economy".
--
-- Account-wide (survive seasons): wallets, drachmae_ledger, shop_orders,
-- cosmetic loadout (cosmetics themselves are rows in `entitlements`),
-- consumable_daily. Season-scoped (keyed by season_id): online_consumables,
-- pass_progress, pass_claims, market_listings.

-- Drachmae balance per player. Only a refund may push it below zero; spending
-- always requires balance >= price, so a negative balance blocks spending.
CREATE TABLE wallets (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  drachmae    INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- Every Drachmae movement. (player_id, kind, ref) is unique, which makes
-- credits idempotent (kind 'pack' + the Telegram charge id, 'refund' + charge id,
-- 'pass' + season:tier:track, 'spend' + request id, 'market_buy'/'market_sale'
-- + listing id). `nonce` guards the statements of the batch that wrote the row.
CREATE TABLE drachmae_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  delta       INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  ref         TEXT NOT NULL,
  nonce       TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (player_id, kind, ref)
);
CREATE INDEX idx_ledger_player ON drachmae_ledger(player_id, created_at);

-- Shop purchases paid with Drachmae or gold, keyed by a client-supplied
-- request id (a retry with the same id is answered from here, never charged twice).
CREATE TABLE shop_orders (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  request_id  TEXT NOT NULL,
  item        TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  currency    TEXT NOT NULL,                       -- drachmae | gold
  price       INTEGER NOT NULL,
  season_id   INTEGER,                             -- season of season-scoped goods
  nonce       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, request_id)
);

-- Which owned cosmetic is shown in each slot.
CREATE TABLE cosmetic_loadout (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  slot        TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot)
);

-- Consumables held in a season (they vanish with the season).
CREATE TABLE online_consumables (
  season_id     INTEGER NOT NULL,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  consumable_id TEXT NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, player_id, consumable_id)
);

-- Consumables bought from the shop per UTC day (daily caps).
CREATE TABLE consumable_daily (
  player_id     INTEGER NOT NULL REFERENCES players(id),
  day           TEXT NOT NULL,                     -- YYYY-MM-DD (UTC, server time)
  consumable_id TEXT NOT NULL,
  bought        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, day, consumable_id)
);

-- The consumable an attacker brought into an attack (at most one per battle).
ALTER TABLE battle_tickets ADD COLUMN consumable TEXT;

-- Season pass.
CREATE TABLE pass_progress (
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  xp          INTEGER NOT NULL DEFAULT 0,
  premium     INTEGER NOT NULL DEFAULT 0,
  premium_at  INTEGER,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id)
);

CREATE TABLE pass_claims (
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  tier        INTEGER NOT NULL,
  track       TEXT NOT NULL,                       -- free | premium
  nonce       TEXT NOT NULL,
  claimed_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id, tier, track)
);

-- Town marketplace. The listed goods are held in escrow in the row
-- (removed from the seller's stash/purse when listed).
CREATE TABLE market_listings (
  id          TEXT PRIMARY KEY,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  seller_id   INTEGER NOT NULL REFERENCES players(id),
  town_q      INTEGER NOT NULL,
  town_r      INTEGER NOT NULL,
  kind        TEXT NOT NULL,                       -- item | resource | consumable
  ref         TEXT NOT NULL,                       -- item def id | resource key | consumable id
  item        TEXT,                                -- JSON Item for kind = item
  qty         INTEGER NOT NULL,
  rarity      TEXT NOT NULL,
  currency    TEXT NOT NULL,                       -- gold | drachmae
  price       INTEGER NOT NULL,                    -- total price of the listing
  status      TEXT NOT NULL DEFAULT 'open',        -- open | sold | cancelled | expired
  buyer_id    INTEGER,
  fee         INTEGER,
  nonce       TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  closed_at   INTEGER
);
CREATE INDEX idx_market_open ON market_listings(season_id, shard_id, status, kind, price);
CREATE INDEX idx_market_seller ON market_listings(seller_id, status, expires_at);

CREATE TABLE market_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  TEXT NOT NULL,
  season_id   INTEGER NOT NULL,
  actor_id    INTEGER NOT NULL,
  action      TEXT NOT NULL,                       -- list | buy | cancel | expire
  currency    TEXT,
  price       INTEGER,
  fee         INTEGER,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_market_audit_listing ON market_audit(listing_id);
CREATE INDEX idx_market_audit_actor ON market_audit(actor_id, created_at);
