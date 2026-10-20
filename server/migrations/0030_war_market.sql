-- M6f (docs/WAR.md "Trade towns", "Stalls, offers and the board"): rented stalls and warehouses are war_holders rows
-- (`st:<town>:<player>`, `wh:<town>:<player>`; level, rent paid up to `paid_to`), their goods war_goods. Rules in
-- server/src/war/market.ts.
--   war_offers: a sell offer (goods or one item escrowed out of the seller's stall into `of:<id>`) or a buy order (coin
--               escrowed out of the buyer's stall into `of:<id>`); `left` counts down with fills (CHECK: never below 0).
--   war_fills:  one row per fill, keyed by the taker's idempotency key: the whole fill is one batch led by this row.
--               `ally` is the town holder's alliance that took the tax (NULL: unheld, no tax); score: trade score (M6h).
CREATE TABLE war_offers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  town        TEXT NOT NULL,
  player_id   INTEGER NOT NULL REFERENCES players(id),
  side        TEXT NOT NULL CHECK (side IN ('sell', 'buy')),
  res         TEXT,
  item_uid    TEXT,
  n           REAL NOT NULL,
  left        REAL NOT NULL CHECK (left >= 0),
  price       INTEGER NOT NULL CHECK (price > 0),
  standing    INTEGER NOT NULL DEFAULT 0,
  state       TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'cancelled')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX war_offers_town ON war_offers (town, state, res);
CREATE INDEX war_offers_player ON war_offers (player_id, state);

CREATE TABLE war_fills (
  id          TEXT PRIMARY KEY,
  offer_id    INTEGER NOT NULL,
  town        TEXT NOT NULL,
  res         TEXT,
  item_uid    TEXT,
  n           REAL NOT NULL,
  price       INTEGER NOT NULL,
  tax         REAL NOT NULL DEFAULT 0,
  seller      INTEGER NOT NULL REFERENCES players(id),
  buyer       INTEGER NOT NULL REFERENCES players(id),
  ally        INTEGER,
  score       REAL NOT NULL DEFAULT 0,
  at          INTEGER NOT NULL
);
CREATE INDEX war_fills_town ON war_fills (town, res, at);
