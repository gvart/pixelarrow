-- W-150..W-159 feudal hierarchy (rules: server/src/war/oaths.ts; numbers: src/data/warFeudal.ts).
--   war_oaths:        who is sworn to whom this season, inside one alliance. `asked` until the lord answers, then `sworn`.
--                     One a player. war_settlements.overlord_id and tribute_pct follow it (./oaths.ts syncTies).
--   war_oath_rates:   the rate each lord or king set on those sworn to him (no row: FEUDAL.rateDefault).
--   war_tribute_held: what the region rooms report is set aside in buildings (the goods themselves are in the sim), so both
--                     sides see it from anywhere. Tribute on sales is real goods at war_goods place `tr:<town>:<payer>`.
--   war_crowns.heir_pid: whom the king named; he rules at once when the crown falls.
CREATE TABLE war_oaths (
  season          INTEGER NOT NULL,
  vassal_pid      INTEGER NOT NULL REFERENCES players(id),
  lord_pid        INTEGER NOT NULL REFERENCES players(id),
  alliance        INTEGER NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('asked', 'sworn')),
  asked_at        INTEGER NOT NULL,
  since           INTEGER,
  PRIMARY KEY (season, vassal_pid)
);
CREATE INDEX war_oaths_lord ON war_oaths (season, lord_pid, state);

CREATE TABLE war_oath_rates (
  season          INTEGER NOT NULL,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  pct             INTEGER NOT NULL CHECK (pct BETWEEN 0 AND 20),
  PRIMARY KEY (season, player_id)
);
CREATE INDEX war_oath_rates_player ON war_oath_rates (player_id);

CREATE TABLE war_tribute_held (
  region          TEXT NOT NULL,
  building        INTEGER NOT NULL,
  type            TEXT NOT NULL,
  payer_pid       INTEGER NOT NULL REFERENCES players(id),
  receiver_pid    INTEGER NOT NULL REFERENCES players(id),
  goods           TEXT NOT NULL,
  PRIMARY KEY (region, building)
);
CREATE INDEX war_tribute_held_payer ON war_tribute_held (payer_pid);
CREATE INDEX war_tribute_held_receiver ON war_tribute_held (receiver_pid);

ALTER TABLE war_crowns ADD COLUMN heir_pid INTEGER REFERENCES players(id);

-- W-155 a call to guard is a guard contract with no fee: the fee may be 0 (SQLite cannot alter a CHECK: rebuilt, not a
-- column changed, so the table's own columns stay as in 0039).
ALTER TABLE war_contracts RENAME TO war_contracts_old;
CREATE TABLE war_contracts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('carry', 'supply', 'escort', 'build', 'guard')),
  town        TEXT NOT NULL,
  to_town     TEXT NOT NULL,
  poster      INTEGER NOT NULL REFERENCES players(id),
  taker       INTEGER REFERENCES players(id),
  reward      INTEGER NOT NULL CHECK (reward >= 0 AND (reward > 0 OR kind = 'guard')),
  res         TEXT,
  n           REAL NOT NULL DEFAULT 0,
  delivered   REAL NOT NULL DEFAULT 0,
  value       INTEGER NOT NULL DEFAULT 0,
  deposit     INTEGER NOT NULL DEFAULT 0,
  region      TEXT,
  site        INTEGER,
  men         INTEGER NOT NULL DEFAULT 0,
  paid        REAL NOT NULL DEFAULT 0,
  away        REAL NOT NULL DEFAULT 0,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'taken', 'done', 'expired', 'cancelled', 'broken')),
  deadline    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
INSERT INTO war_contracts SELECT * FROM war_contracts_old;
DROP TABLE war_contracts_old;
CREATE INDEX war_contracts_town ON war_contracts (town, state);
CREATE INDEX war_contracts_poster ON war_contracts (poster, state);
CREATE INDEX war_contracts_region ON war_contracts (region, state);
