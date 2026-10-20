-- M5e lifecycle (docs/WAR.md "Lifecycle", "Anti-oversaturation"): training, ransom, upkeep and retirement. Rules live in
-- server/src/war/persons.ts. war_persons is rebuilt for the new states (SQLite cannot widen a CHECK in place); nothing
-- references it, so the copy keeps every row as it is.
--   training: at home, becomes `train_to` at `until_at` (the class's tier-1 kit put on then)
--   retired:  left the roster for good (half his gear's value paid back, one honour on the memorial)
--   captor_pid: the player who holds a captive (pays his upkeep, takes his ransom)

CREATE TABLE war_persons_next (
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
  state       TEXT NOT NULL DEFAULT 'reserve' CHECK (state IN ('active', 'reserve', 'wounded', 'captive', 'dead', 'training', 'retired')),
  until_at    INTEGER,
  captor      INTEGER,
  held_at     TEXT,
  slot        INTEGER,
  region      TEXT,
  created_at  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0,
  train_to    TEXT,
  captor_pid  INTEGER
);
INSERT INTO war_persons_next (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region, created_at, updated_at)
  SELECT id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, until_at, captor, held_at, slot, region, created_at, updated_at FROM war_persons;
DROP TABLE war_persons;
ALTER TABLE war_persons_next RENAME TO war_persons;
CREATE INDEX war_persons_player ON war_persons (player_id, state);
CREATE INDEX war_persons_region ON war_persons (region);
CREATE INDEX war_persons_captor ON war_persons (captor_pid, state);

-- Field upkeep per player, settled lazily: `owed` food accrues from `at` at the player's rate (1 a soldier in the field
-- an hour, 2 an elite, 1 a civilian, 1 a captive he holds); whole units are paid from war_stock. `unpaid` = 1 while the
-- stock could not cover it: his wounded do not heal and his men earn no XP.
CREATE TABLE war_upkeep (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  at          INTEGER NOT NULL,
  owed        REAL NOT NULL DEFAULT 0,
  unpaid      INTEGER NOT NULL DEFAULT 0
);

-- The alliance memorial (M4 brings alliances: kept by player for now): one honour of each retired soldier who had one.
CREATE TABLE war_memorial (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  person_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  level       INTEGER NOT NULL,
  honour      TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX war_memorial_player ON war_memorial (player_id);
