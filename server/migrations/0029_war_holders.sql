-- M6e (docs/WAR.md "Trade", "Goods live in places"; W-44): every good and item lives in a place. Rules in
-- server/src/war/holders.ts.
--   war_holders: the places D1 keeps: a player's home strongroom (`sr:<player>`, never lootable), an alliance's
--                strongbox at home (`sb:<clan>`, the old treasury), a town holder's tax strongbox (`tx:<town>:<alliance>`),
--                rented stalls and warehouses (M6f) and escrows (offers, deals, contracts, letters).
--   war_goods:   their goods by lot: good, origin (the region it was gathered, made or minted in), seal (a carry
--                contract's id, 0 none), amount. The CHECK makes an overdrawn batch fail whole (atomic fills).
--   war_items.place: the holder an item lies in (NULL while it waits at a workplace: `region`); worn items are in
--                war_persons.gear and items in a region room (chests, carts, packs, piles) live in its state.
--   war_region_holds: what each room's holders held at its last save (the stash screen: where your things are).
-- The old war_stock (food, silver) becomes strongroom goods (silver as coin 1:1) and war_treasury strongbox coin.
CREATE TABLE war_holders (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('strongroom', 'strongbox', 'stall', 'warehouse', 'escrow')),
  player_id   INTEGER REFERENCES players(id),
  clan_id     INTEGER,
  town        TEXT,
  level       INTEGER NOT NULL DEFAULT 1,
  paid_to     INTEGER,
  created_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX war_holders_player ON war_holders (player_id, kind);
CREATE INDEX war_holders_town ON war_holders (town, kind);

CREATE TABLE war_goods (
  place       TEXT NOT NULL,
  res         TEXT NOT NULL,
  origin      TEXT NOT NULL DEFAULT '',
  seal        INTEGER NOT NULL DEFAULT 0,
  amount      REAL NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (place, res, origin, seal)
);

ALTER TABLE war_items ADD COLUMN place TEXT;
UPDATE war_items SET place = 'sr:' || player_id WHERE region IS NULL;
CREATE INDEX war_items_place ON war_items (place);

INSERT OR IGNORE INTO war_holders (id, kind, player_id, created_at) SELECT DISTINCT 'sr:' || player_id, 'strongroom', player_id, 0 FROM war_stock;
INSERT INTO war_goods (place, res, origin, amount)
  SELECT 'sr:' || player_id, CASE res WHEN 'silver' THEN 'coin' ELSE res END, 'home', amount FROM war_stock WHERE amount > 0;
INSERT OR IGNORE INTO war_holders (id, kind, clan_id, created_at) SELECT 'sb:' || clan_id, 'strongbox', clan_id, 0 FROM war_treasury;
INSERT INTO war_goods (place, res, origin, amount) SELECT 'sb:' || clan_id, 'coin', 'home', silver FROM war_treasury WHERE silver > 0;
DROP TABLE war_stock;
DROP TABLE war_treasury;

CREATE TABLE war_region_holds (
  region      TEXT NOT NULL,
  ref         TEXT NOT NULL,
  kind        TEXT NOT NULL,
  player_id   INTEGER,
  team        INTEGER,
  goods       TEXT NOT NULL DEFAULT '{}',
  items       TEXT NOT NULL DEFAULT '[]',
  at          INTEGER NOT NULL,
  PRIMARY KEY (region, ref)
);
CREATE INDEX war_region_holds_player ON war_region_holds (player_id);
