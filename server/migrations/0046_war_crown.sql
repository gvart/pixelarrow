-- W-64 crown and council (rules: server/src/war/crown.ts; constants and views: src/war/net/crown.ts).
--   war_crowns:        one per alliance and season: the monarch (kept as regent while an election runs after his term),
--                      when he was crowned, when his term ends, the alliance tax the Treasurer set (0-10 %) and what it
--                      brought in. The treasury's goods are war_goods at place `cr:<season>:<alliance>`.
--   war_crown_offices: the council the monarch appointed: marshal, treasurer, envoy, quartermaster (one each).
--   war_crown_votes:   elections (candidates and their power, the winner) and no-confidence petitions (`petition`
--                      while signatures gather, then `open` for the vote; target the monarch).
--   war_crown_ballots: signatures ('sign') and votes ('ballot': the candidate's id, or 1 yes / 0 no), weighted.
--   war_crown_orders:  the council's bounties: attack, defend and rally marks (marshal), supply quests (quartermaster),
--                      the bounty held from the treasury and what of it was paid.
--   war_crown_shares:  who took part in a war goal (fights in its region: 1 + kills each) or delivered to a quest.
--   war_crown_pacts:   pacts and truces between two alliances' envoys; broken by an attack while active.
--   war_crown_log:     the crown's chronicle (crowned, deposed, appointed, tax, funds, payouts, pacts).
CREATE TABLE war_crowns (
  season          INTEGER NOT NULL,
  alliance        INTEGER NOT NULL,
  monarch_pid     INTEGER REFERENCES players(id),
  crowned_at      INTEGER,
  term_ends       INTEGER NOT NULL DEFAULT 0,
  tax_pct         INTEGER NOT NULL DEFAULT 0 CHECK (tax_pct BETWEEN 0 AND 10),
  taxed           REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (season, alliance)
);

CREATE TABLE war_crown_offices (
  season          INTEGER NOT NULL,
  alliance        INTEGER NOT NULL,
  office          TEXT NOT NULL CHECK (office IN ('marshal', 'treasurer', 'envoy', 'quartermaster')),
  player_id       INTEGER NOT NULL REFERENCES players(id),
  since           INTEGER NOT NULL,
  PRIMARY KEY (season, alliance, office)
);
CREATE INDEX war_crown_offices_player ON war_crown_offices (player_id);

CREATE TABLE war_crown_votes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  season          INTEGER NOT NULL,
  alliance        INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('election', 'confidence')),
  state           TEXT NOT NULL CHECK (state IN ('petition', 'open', 'closed')),
  target_pid      INTEGER REFERENCES players(id),
  candidates      TEXT NOT NULL DEFAULT '[]',
  opens_at        INTEGER NOT NULL,
  closes_at       INTEGER NOT NULL,
  result          TEXT NOT NULL DEFAULT '{}',
  winner_pid      INTEGER REFERENCES players(id),
  created_at      INTEGER NOT NULL
);
CREATE INDEX war_crown_votes_alliance ON war_crown_votes (season, alliance, state);

CREATE TABLE war_crown_ballots (
  vote_id         INTEGER NOT NULL,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  stage           TEXT NOT NULL CHECK (stage IN ('sign', 'ballot')),
  choice          INTEGER NOT NULL,
  weight          REAL NOT NULL DEFAULT 1,
  at              INTEGER NOT NULL,
  PRIMARY KEY (vote_id, player_id, stage)
);
CREATE INDEX war_crown_ballots_player ON war_crown_ballots (player_id);

CREATE TABLE war_crown_orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  season          INTEGER NOT NULL,
  alliance        INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('attack', 'defend', 'rally', 'supply')),
  posted_by       INTEGER NOT NULL REFERENCES players(id),
  region          TEXT NOT NULL,
  target          TEXT,
  x               INTEGER,
  y               INTEGER,
  res             TEXT,
  n               REAL NOT NULL DEFAULT 0,
  delivered       REAL NOT NULL DEFAULT 0,
  bounty          REAL NOT NULL DEFAULT 0 CHECK (bounty >= 0),
  paid            REAL NOT NULL DEFAULT 0,
  state           TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done', 'expired', 'cancelled')),
  expires_at      INTEGER NOT NULL,
  closed_at       INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX war_crown_orders_alliance ON war_crown_orders (season, alliance, state);
CREATE INDEX war_crown_orders_region ON war_crown_orders (region, state);

CREATE TABLE war_crown_shares (
  order_id        INTEGER NOT NULL,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  share           REAL NOT NULL DEFAULT 0,
  paid            REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, player_id)
);
CREATE INDEX war_crown_shares_player ON war_crown_shares (player_id);

CREATE TABLE war_crown_pacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  season          INTEGER NOT NULL,
  alliance_a      INTEGER NOT NULL,
  alliance_b      INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('pact', 'truce')),
  state           TEXT NOT NULL DEFAULT 'offered' CHECK (state IN ('offered', 'active', 'refused', 'cancelled', 'expired', 'ended', 'broken')),
  offered_by      INTEGER NOT NULL REFERENCES players(id),
  answered_by     INTEGER REFERENCES players(id),
  broken_by       INTEGER REFERENCES players(id),
  expires_at      INTEGER NOT NULL,
  ends_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX war_crown_pacts_pair ON war_crown_pacts (season, alliance_a, alliance_b, state);

CREATE TABLE war_crown_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  season          INTEGER NOT NULL,
  alliance        INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  actor_id        INTEGER,
  detail          TEXT NOT NULL DEFAULT '{}',
  at              INTEGER NOT NULL
);
CREATE INDEX war_crown_log_alliance ON war_crown_log (season, alliance, at);
