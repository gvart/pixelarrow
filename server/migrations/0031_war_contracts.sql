-- M6g (docs/WAR.md "Hand-offs, contracts, letters"): rules in server/src/war/contracts.ts. Escrows are war_goods
-- holders: `dl:<id>:a` / `dl:<id>:b` (a deal's halves), `ct:<id>` (a contract's reward), `ct:<id>:g` (a carry's sealed
-- goods), `ct:<id>:d` (the carrier's deposit), `lc:<id>` (a letter's coin at its town).
--   war_deals:     a Broker's escrowed hand-off between parties a and b at his stall: each drops its half, both in:
--                  swapped; not both in by expires_at: refunded.
--   war_contracts: carry / supply / escort, posted at the poster's stall in `town` with its reward escrowed; to_town
--                  is B (where a carry or supply is delivered, where an escort's cart must arrive).
--   war_letters:   a Banker's letter of credit: coin escrowed at to_town, sold at town to one buyer, redeemed once by
--                  him at to_town.
CREATE TABLE war_deals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  town        TEXT NOT NULL,
  broker      INTEGER NOT NULL REFERENCES players(id),
  player_a    INTEGER NOT NULL REFERENCES players(id),
  player_b    INTEGER NOT NULL REFERENCES players(id),
  give_a      TEXT NOT NULL DEFAULT '{}',
  give_b      TEXT NOT NULL DEFAULT '{}',
  in_a        INTEGER NOT NULL DEFAULT 0,
  in_b        INTEGER NOT NULL DEFAULT 0,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'refunded')),
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX war_deals_a ON war_deals (player_a, state);
CREATE INDEX war_deals_b ON war_deals (player_b, state);

CREATE TABLE war_contracts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('carry', 'supply', 'escort')),
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
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'taken', 'done', 'expired', 'cancelled')),
  deadline    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX war_contracts_town ON war_contracts (town, state);
CREATE INDEX war_contracts_poster ON war_contracts (poster, state);

CREATE TABLE war_letters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  banker      INTEGER NOT NULL REFERENCES players(id),
  buyer       INTEGER REFERENCES players(id),
  town        TEXT NOT NULL,
  to_town     TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  fee         INTEGER NOT NULL CHECK (fee >= 0),
  state       TEXT NOT NULL DEFAULT 'offered' CHECK (state IN ('offered', 'sold', 'redeemed', 'cancelled')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX war_letters_buyer ON war_letters (buyer, state);
