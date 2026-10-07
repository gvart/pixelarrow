-- Map merchants (docs/DUELS.md "War-map shops on the map"): every town and a
-- the map's trading posts sell consumables and gear. The stock is generated
-- from (shard seed, region, UTC day) by src/online/merchants.ts and never stored;
-- only purchases and per-player daily counters are written here.
--
-- Consumable purchases count against consumable_daily (0003_economy.sql), the
-- same daily caps the menu shop used; gear counts here.

-- Gear bought from merchants per UTC day (daily caps, all merchants together).
CREATE TABLE merchant_daily (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  day         TEXT NOT NULL,                       -- YYYY-MM-DD (UTC, server time)
  ref         TEXT NOT NULL,                       -- item def id ':' rarity
  bought      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, day, ref)
);

-- Every merchant sale, keyed by the buyer's client request id (a retry with the
-- same id is answered from here, never charged twice). holder_id/holder_cut:
-- who held the region and the gold the merchant paid them (in the same batch).
CREATE TABLE merchant_orders (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  request_id  TEXT NOT NULL,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  loc         INTEGER NOT NULL,                    -- the merchant's region
  day         TEXT NOT NULL,
  offer       TEXT NOT NULL,                       -- offer id (c:<consumable> | i:<item>:<rarity>)
  currency    TEXT NOT NULL,                       -- gold | drachmae
  price       INTEGER NOT NULL,
  discount    INTEGER NOT NULL DEFAULT 0,          -- 1 when the holder discount applied
  item_uid    TEXT,                                -- the gear instance granted
  holder_id   INTEGER,
  holder_cut  INTEGER NOT NULL DEFAULT 0,
  nonce       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, request_id)
);
CREATE INDEX idx_merchant_orders_holder ON merchant_orders(season_id, holder_id, loc);
