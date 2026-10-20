-- M5e (docs/WAR.md "Soldiers", docs/impl/global-war-rebuild.md): every war soldier is a persistent person. The rules
-- (caps, recruit pools, heal and captive timers) live in server/src/war/persons.ts; the region rooms
-- (server/src/war/regionDO.ts) load persons on join and write each fight back. No live users: no data to carry over.

-- One row per person. The hero record (src/data/units.ts Hero) is rebuilt from these columns on top of the class's
-- fresh hero (src/war/sim/classes.ts freshHero). state: active (in the field squad, `slot` 0..SQUAD_MAX-1), reserve,
-- wounded (heals at `until_at`), captive (held by alliance `captor` in region `held_at`, walks home at `until_at`),
-- dead. `region`: the war region whose room holds him now (deployed); NULL when he is home.
CREATE TABLE war_persons (
  id          TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  cls         TEXT NOT NULL DEFAULT 'militia',
  name        TEXT NOT NULL DEFAULT '',
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  points      INTEGER NOT NULL DEFAULT 0,
  kills       INTEGER NOT NULL DEFAULT 0,
  battles     INTEGER NOT NULL DEFAULT 0,
  attrs       TEXT NOT NULL DEFAULT '{}',
  skills      TEXT NOT NULL DEFAULT '[]',
  gear        TEXT NOT NULL DEFAULT '{}',
  honours     TEXT NOT NULL DEFAULT '[]',
  state       TEXT NOT NULL DEFAULT 'reserve' CHECK (state IN ('active', 'reserve', 'wounded', 'captive', 'dead')),
  until_at    INTEGER,
  captor      INTEGER,
  held_at     TEXT,
  slot        INTEGER,
  region      TEXT,
  created_at  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX war_persons_player ON war_persons (player_id, state);
CREATE INDEX war_persons_region ON war_persons (region);

-- Recruit pools: one per town the player holds (M4 stub: the home camp). `stored` recruits at `at`; it grows at the
-- town's rate up to its cap, read lazily.
CREATE TABLE war_pools (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  town        TEXT NOT NULL,
  stored      REAL NOT NULL DEFAULT 0,
  at          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, town)
);

-- The player's home stock of war resources (recruits cost food). M6 brings the real economy.
CREATE TABLE war_stock (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  res         TEXT NOT NULL,
  amount      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, res)
);

-- Loose gear of the player (unequipped, or picked up in a fight): an Item JSON (src/data/items.ts) keyed by its uid.
CREATE TABLE war_items (
  uid         TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  item        TEXT NOT NULL DEFAULT '{}',
  fight_id    TEXT,
  created_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX war_items_player ON war_items (player_id);

-- Fight reports written back by a region room: the id makes the write idempotent (a retried batch hits the key).
CREATE TABLE war_fights (
  id          TEXT PRIMARY KEY,
  region      TEXT NOT NULL,
  tick        INTEGER NOT NULL,
  persons     INTEGER NOT NULL,
  at          INTEGER NOT NULL
);
