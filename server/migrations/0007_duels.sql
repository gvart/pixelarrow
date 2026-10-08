-- Duels (docs/DUELS.md): a persistent duel army per account, separate from
-- the seasonal war-map army and never reset with a season. Glory is the
-- duel-only currency. The PvE ladder pays through verified battle tickets.
--
-- Writes follow the online convention (server/src/online/store.ts): the first
-- statement of a batch bumps duel_profiles.rev from the value read and the
-- others are guarded by EXISTS (... rev = <new rev>).

CREATE TABLE duel_profiles (
  player_id      INTEGER PRIMARY KEY REFERENCES players(id),
  glory          INTEGER NOT NULL,
  xp             INTEGER NOT NULL DEFAULT 0,           -- duel account XP (level: src/duel/rules.ts accountLevel)
  ladder_cleared INTEGER NOT NULL DEFAULT 0,           -- highest ladder floor won
  farm_day       INTEGER NOT NULL DEFAULT 0,           -- UTC day of farm_glory
  farm_glory     INTEGER NOT NULL DEFAULT 0,           -- farm Glory earned on farm_day (daily cap)
  next_id        INTEGER NOT NULL,                     -- id counter for heroes and items
  team           TEXT NOT NULL,                        -- JSON hero ids of the team
  formations     TEXT NOT NULL,                        -- JSON FormationType[4]
  battles        INTEGER NOT NULL DEFAULT 0,
  wins           INTEGER NOT NULL DEFAULT 0,
  rev            INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- Duel heroes (JSON Hero with its equipment). base_attrs: the attributes the
-- hero was recruited with (a respec returns to them).
CREATE TABLE duel_heroes (
  id          TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  data        TEXT NOT NULL,
  base_attrs  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_duel_heroes_player ON duel_heroes(player_id);

-- Unequipped duel items.
CREATE TABLE duel_items (
  uid         TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_duel_items_player ON duel_items(player_id);

-- Ladder battles: the server fixes the seed and both armies; the client
-- submits its order log and the server replays it before paying out.
CREATE TABLE duel_tickets (
  id          TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  kind        TEXT NOT NULL DEFAULT 'ladder',
  floor       INTEGER NOT NULL,
  seed        INTEGER NOT NULL,
  setup       TEXT NOT NULL,
  team        TEXT NOT NULL,                           -- JSON Hero[] as they went into battle
  status      TEXT NOT NULL DEFAULT 'open',            -- open | used | rejected | abandoned
  claim       TEXT,
  result      TEXT,
  apply_nonce TEXT,
  won         INTEGER,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX idx_duel_tickets_player ON duel_tickets(player_id, created_at);

-- Glory spends and gains by client request id (recruit, shop, respec, sell):
-- a retried request answers with the stored result instead of paying twice.
-- Daily offers are bought once per player (offer ids carry the day).
CREATE TABLE duel_orders (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  request_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,                           -- recruit | buy | respec | sell
  ref         TEXT NOT NULL,                           -- class, offer id, hero id or item uid
  glory       INTEGER NOT NULL,                        -- signed: negative for spends
  result      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (player_id, request_id)
);
CREATE INDEX idx_duel_orders_ref ON duel_orders(player_id, kind, ref);
