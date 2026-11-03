-- W-140..W-146 (docs/WAR.md "NPC towns"; rules in src/war/net/npcMarket.ts, server/src/war/npcMarket.ts):
--   war_npc_towns:  a town's purse, the last UTC day it minted and all it has minted this season (the coin it ever made).
--   war_npc_stock:  a town's stock of a good when it was last dealt in (it drifts back to par from `at`).
--   war_alliance_members.start_cart: a trader's first handcart, owed until his first join.
--   war_contracts:  one more kind. hunt: a warrior of the poster's alliance takes it, paid when his men bring down the
--                   named `target` ('lair:<id>' or 'chief:<id>') in `region`. No live users: the table is made anew.
CREATE TABLE war_npc_towns (
  town        TEXT PRIMARY KEY,
  purse       REAL NOT NULL,
  minted_day  INTEGER NOT NULL,
  minted      REAL NOT NULL DEFAULT 0
);

CREATE TABLE war_npc_stock (
  town   TEXT NOT NULL,
  res    TEXT NOT NULL,
  stock  REAL NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (town, res)
);

ALTER TABLE war_alliance_members ADD COLUMN start_cart INTEGER NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS war_contracts;
CREATE TABLE war_contracts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('carry', 'supply', 'escort', 'build', 'guard', 'hunt')),
  town        TEXT NOT NULL,
  to_town     TEXT NOT NULL,
  poster      INTEGER NOT NULL REFERENCES players(id),
  taker       INTEGER REFERENCES players(id),
  reward      INTEGER NOT NULL CHECK (reward > 0),
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
  target      TEXT,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'taken', 'done', 'expired', 'cancelled', 'broken')),
  deadline    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX war_contracts_town ON war_contracts (town, state);
CREATE INDEX war_contracts_poster ON war_contracts (poster, state);
CREATE INDEX war_contracts_region ON war_contracts (region, state);
