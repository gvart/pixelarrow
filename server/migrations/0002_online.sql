-- Online mode: seasonal shards on a hand-authored region map, server-owned
-- armies, garrisons, clans, attack tickets, the battle log and season rewards.
--
-- Everything world- or army-scoped carries season_id (a season ends with a
-- full reset: a new season id starts from nothing). Locations are region ids
-- (`loc`) of the shard's map (src/online/maps/<map_id>.json, read through
-- src/online/world.ts). Static region data is never stored; only regions
-- whose state changed get a row in online_regions, keyed by (season, shard, loc).

CREATE TABLE online_seasons (
  id          INTEGER PRIMARY KEY,
  started_at  INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',     -- active | ended
  ended_at    INTEGER
);

-- About 150 players per shard; a new shard opens when the last one is full.
CREATE TABLE online_shards (
  season_id   INTEGER NOT NULL,
  id          INTEGER NOT NULL,
  map_id      TEXT NOT NULL,                      -- src/online/maps/<map_id>.json
  seed        INTEGER NOT NULL,                   -- neutrals, lair beasts, boss sites
  players     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, id)
);

-- A player's state in a season: purse, energy, home, army position and march.
-- rev bumps on every write; dependent statements in a batch check it.
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

-- Heroes (JSON Hero with its equipment). busy_* marks heroes in an open attack.
CREATE TABLE online_heroes (
  id            TEXT PRIMARY KEY,
  season_id     INTEGER NOT NULL,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  data          TEXT NOT NULL,
  wounded_until INTEGER NOT NULL DEFAULT 0,
  busy_ticket   TEXT,
  busy_until    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_heroes_player ON online_heroes(season_id, player_id);

-- Unequipped items.
CREATE TABLE online_items (
  uid         TEXT PRIMARY KEY,
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_items_player ON online_items(season_id, player_id);

-- Regions whose state differs from the map's default.
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

-- Which heroes hold which region. A hero not listed here marches with the field army.
CREATE TABLE online_garrisons (
  hero_id     TEXT PRIMARY KEY REFERENCES online_heroes(id) ON DELETE CASCADE,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  loc         INTEGER NOT NULL,
  player_id   INTEGER NOT NULL,
  placed_at   INTEGER NOT NULL
);
CREATE INDEX idx_garrisons_loc ON online_garrisons(season_id, shard_id, loc);

-- Clans live in one shard for one season.
CREATE TABLE clans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id   INTEGER NOT NULL,
  shard_id    INTEGER NOT NULL,
  name        TEXT NOT NULL COLLATE NOCASE,
  tag         TEXT NOT NULL COLLATE NOCASE,
  created_by  INTEGER NOT NULL REFERENCES players(id),
  created_at  INTEGER NOT NULL,
  UNIQUE (season_id, name),
  UNIQUE (season_id, tag)
);

CREATE TABLE clan_members (
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  clan_id     INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                      -- leader | officer | member
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX idx_clan_members_clan ON clan_members(clan_id);

CREATE TABLE clan_invites (
  code        TEXT PRIMARY KEY,
  clan_id     INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  created_by  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  max_uses    INTEGER NOT NULL,
  uses        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_clan_invites_clan ON clan_invites(clan_id);

-- An attack: the server fixed the seed and both armies; the client returns the order log.
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
  finished_at   INTEGER
);
CREATE INDEX idx_tickets_player ON battle_tickets(player_id, loc, created_at);

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

-- Kept across seasons: final ranks, titles and rewards.
CREATE TABLE season_rewards (
  season_id   INTEGER NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  shard_id    INTEGER NOT NULL,
  rank        INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  clan_name   TEXT,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id)
);
