-- Map v3 reset: the online war map moved from a hex grid (q, r) to
-- hand-authored region maps (loc). 0002/0003/0004/0009 were edited in place
-- to the new schema; a database that already applied their old versions
-- (production) gets the new schema here. On a fresh database this migration
-- runs after the edited ones and simply recreates the same tables (empty).
--
-- Online-season state is wiped (owner-approved): the running season carries
-- on, shards reopen on the new map and players rejoin from scratch. Nothing
-- outside the online war map is touched: players, wallets/ledger, shop
-- orders, cosmetics, the season pass, consumables, duels, notifications and
-- ops tables keep their rows. battle_log (also holds duel results) and
-- merchant_orders (purchase records) keep their rows; their old hex
-- coordinates are dropped (loc NULL / -1).

-- 1. Season state whose schema changed: drop (old and new names) and recreate.
DROP TABLE IF EXISTS online_garrisons;
DROP TABLE IF EXISTS online_hexes;
DROP TABLE IF EXISTS online_regions;
DROP TABLE IF EXISTS online_profiles;
DROP TABLE IF EXISTS online_shards;
DROP TABLE IF EXISTS battle_tickets;
DROP TABLE IF EXISTS market_listings;
DROP TABLE IF EXISTS world_bosses;

-- 2. Season state without schema changes that would be inconsistent with the
-- wiped profiles (hero/item ids restart from next_id = 1, clans hold no land,
-- boss tallies/loot belong to the dropped bosses).
DELETE FROM online_items;
DELETE FROM online_heroes;
DELETE FROM clan_invites;
DELETE FROM clan_members;
DELETE FROM clans;
DELETE FROM world_boss_damage;
DELETE FROM world_boss_loot;
DELETE FROM online_camp_buildings;
DELETE FROM online_camps;

CREATE TABLE online_shards (
  season_id   INTEGER NOT NULL,
  id          INTEGER NOT NULL,
  map_id      TEXT NOT NULL,                      -- src/online/maps/<map_id>.json
  seed        INTEGER NOT NULL,                   -- neutrals, lair beasts, boss sites
  players     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, id)
);

CREATE TABLE online_profiles (
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  shard_id    INTEGER NOT NULL,
  gold        INTEGER NOT NULL,
  food        INTEGER NOT NULL,
  wood        INTEGER NOT NULL,
  bronze      INTEGER NOT NULL,
  recruits    REAL NOT NULL,
  energy      REAL NOT NULL,
  energy_at   INTEGER NOT NULL,                   -- energy refills lazily from here
  next_id     INTEGER NOT NULL,                   -- id counter for heroes/items
  formations  TEXT NOT NULL,                      -- JSON FormationType[4] of the field army
  home_loc    INTEGER NOT NULL,                   -- home region
  army_loc    INTEGER NOT NULL,                   -- where the army stands (or last stood)
  march       TEXT,                               -- JSON { path: [loc...], at: [arrival ms...] }
  battles     INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  rev         INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX idx_profiles_army ON online_profiles(season_id, shard_id, army_loc);

CREATE TABLE online_regions (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  loc         INTEGER NOT NULL,                   -- region id on the shard's map
  occupant    TEXT NOT NULL DEFAULT 'npc',        -- npc | player | beast
  owner_id    INTEGER REFERENCES players(id),
  clan_id     INTEGER,
  home        INTEGER NOT NULL DEFAULT 0,         -- a player's home region (cannot be attacked)
  captured_at INTEGER,
  accrued_at  INTEGER,                            -- income accrues lazily from here
  formations  TEXT,                               -- JSON FormationType[4] of the garrison
  npc         TEXT,                               -- JSON Hero[]: the neutral defenders after losses
  npc_gen     INTEGER NOT NULL DEFAULT 0,         -- respawn epoch / wave of the neutral defenders
  npc_at      INTEGER,
  siege_by    INTEGER,                            -- player with victories in a row against the neutrals here
  siege_wins  INTEGER NOT NULL DEFAULT 0,
  siege_at    INTEGER,
  version     INTEGER NOT NULL DEFAULT 0,
  beast_slain_at INTEGER,                         -- lair regions: when the beast was last slain (NULL: never)
  PRIMARY KEY (season_id, shard_id, loc)
);
CREATE INDEX idx_regions_owner ON online_regions(season_id, owner_id);
CREATE INDEX idx_regions_clan ON online_regions(season_id, clan_id);

CREATE TABLE online_garrisons (
  hero_id     TEXT PRIMARY KEY REFERENCES online_heroes(id) ON DELETE CASCADE,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  loc         INTEGER NOT NULL,
  player_id   INTEGER NOT NULL,
  placed_at   INTEGER NOT NULL
);
CREATE INDEX idx_garrisons_loc ON online_garrisons(season_id, shard_id, loc);

CREATE TABLE battle_tickets (
  id            TEXT PRIMARY KEY,
  season_id     INTEGER NOT NULL,
  shard_id      INTEGER NOT NULL,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  loc           INTEGER NOT NULL,                 -- the region attacked
  seed          INTEGER NOT NULL,
  setup         TEXT NOT NULL,                    -- JSON BattleSetup
  attackers     TEXT NOT NULL,                    -- JSON Hero[] snapshot
  defenders     TEXT NOT NULL,                    -- JSON Hero[] snapshot
  defender_kind TEXT NOT NULL,                    -- npc | militia | garrison
  defender_id   INTEGER,                          -- region owner when it was a player's
  region_version INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',     -- open | used | rejected | abandoned
  claim         TEXT,
  result        TEXT,
  apply_nonce   TEXT,
  won           INTEGER,                          -- 1 when the attacker won (a capture or a siege round)
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  consumable    TEXT                              -- 0003_economy.sql: the consumable brought into the attack
);
CREATE INDEX idx_tickets_player ON battle_tickets(player_id, loc, created_at);

CREATE TABLE market_listings (
  id          TEXT PRIMARY KEY,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  seller_id   INTEGER NOT NULL REFERENCES players(id),
  town_loc    INTEGER NOT NULL,                    -- the town region it is listed in
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

CREATE TABLE world_bosses (
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  boss        TEXT NOT NULL,                      -- kraken | titan
  loc         INTEGER NOT NULL,                   -- the region it stands in
  level       INTEGER NOT NULL,
  hp          INTEGER NOT NULL,
  max_hp      INTEGER NOT NULL,
  parts       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',     -- active | dead
  version     INTEGER NOT NULL DEFAULT 0,
  killed_at   INTEGER,
  killed_by   INTEGER,                            -- player whose raid struck the last blow
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, shard_id, boss)
);

-- 3. Rebuilt with their rows kept (only columns common to the old and new
-- schema are copied, so this works on either).
CREATE TABLE _keep_battle_log AS
  SELECT id, season_id, shard_id, kind, ref, attacker_id, defender_id, winner, ticks, hash, verified, summary, created_at
  FROM battle_log;
DROP TABLE battle_log;
CREATE TABLE battle_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  kind        TEXT NOT NULL,                      -- attack | duel
  ref         TEXT,                               -- ticket id / duel id
  attacker_id INTEGER,
  defender_id INTEGER,
  loc         INTEGER,
  winner      INTEGER NOT NULL,
  ticks       INTEGER NOT NULL,
  hash        TEXT,
  verified    INTEGER NOT NULL,
  summary     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_battle_log_season ON battle_log(season_id, shard_id, created_at);
INSERT INTO battle_log (id, season_id, shard_id, kind, ref, attacker_id, defender_id, loc, winner, ticks, hash, verified, summary, created_at)
  SELECT id, season_id, shard_id, kind, ref, attacker_id, defender_id, NULL, winner, ticks, hash, verified, summary, created_at
  FROM _keep_battle_log;
DROP TABLE _keep_battle_log;

CREATE TABLE _keep_merchant_orders AS
  SELECT player_id, request_id, season_id, shard_id, day, offer, currency, price, discount, item_uid, holder_id, holder_cut, nonce, created_at
  FROM merchant_orders;
DROP TABLE merchant_orders;
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
INSERT INTO merchant_orders (player_id, request_id, season_id, shard_id, loc, day, offer, currency, price, discount, item_uid, holder_id, holder_cut, nonce, created_at)
  SELECT player_id, request_id, season_id, shard_id, -1, day, offer, currency, price, discount, item_uid, holder_id, holder_cut, nonce, created_at
  FROM _keep_merchant_orders;
DROP TABLE _keep_merchant_orders;
