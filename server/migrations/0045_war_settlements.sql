-- W-63 shared settlements (rules: server/src/war/settlements.ts). D1 is their source of truth; rooms report into it.
--   war_settlements:        one per founded settlement in a region: its centre piece (the camp's building id) at x,y,
--                           radius r, its lord, town level (W-61), overlord settlement and tribute share when a vassal,
--                           the season it was founded, when its people last tended it, when tribute was last levied,
--                           and what persists over a season's end (buildings, as the room reports them; JSON).
--   war_settlement_members: lord, citizens (with a plot rect inside r) and the overlord's garrison.
--   war_settlement_offers:  requests and offers between a player and a settlement: settle (ask for a plot), vassal or
--                           join (terms from a force on its ground), garrison (the overlord's men), truce (between two
--                           lords, each escrowing `bond` coin; active until ends_at, broken by an attack).
--   war_settlement_log:     attacks, tribute paid, rebellions, truce breaks (detail JSON).
CREATE TABLE war_settlements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  region          TEXT NOT NULL,
  centre_piece    INTEGER NOT NULL,
  x               INTEGER NOT NULL,
  y               INTEGER NOT NULL,
  r               INTEGER NOT NULL,
  name            TEXT NOT NULL,
  lord_pid        INTEGER NOT NULL REFERENCES players(id),
  level           INTEGER NOT NULL DEFAULT 1,
  overlord_id     INTEGER,
  tribute_pct     INTEGER NOT NULL DEFAULT 0 CHECK (tribute_pct BETWEEN 0 AND 30),
  founded_season  INTEGER NOT NULL,
  tended_at       INTEGER NOT NULL,
  levied_at       INTEGER NOT NULL,
  persist         TEXT NOT NULL DEFAULT '{}',
  UNIQUE (region, centre_piece)
);
CREATE INDEX war_settlements_overlord ON war_settlements (overlord_id);

CREATE TABLE war_settlement_members (
  settlement_id   INTEGER NOT NULL,
  player_id       INTEGER NOT NULL REFERENCES players(id),
  role            TEXT NOT NULL CHECK (role IN ('lord', 'citizen', 'garrison')),
  x0              INTEGER,
  y0              INTEGER,
  x1              INTEGER,
  y1              INTEGER,
  since           INTEGER NOT NULL,
  PRIMARY KEY (settlement_id, player_id)
);
CREATE INDEX war_settlement_members_player ON war_settlement_members (player_id);

CREATE TABLE war_settlement_offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL CHECK (kind IN ('settle', 'vassal', 'join', 'garrison', 'truce')),
  from_pid        INTEGER NOT NULL REFERENCES players(id),
  from_settlement INTEGER,
  to_settlement   INTEGER NOT NULL,
  tribute_pct     INTEGER NOT NULL DEFAULT 0 CHECK (tribute_pct BETWEEN 0 AND 30),
  bond            INTEGER NOT NULL DEFAULT 0 CHECK (bond >= 0),
  state           TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'accepted', 'refused', 'cancelled', 'expired', 'active', 'ended', 'broken')),
  expires_at      INTEGER NOT NULL,
  ends_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX war_settlement_offers_to ON war_settlement_offers (to_settlement, state);
CREATE INDEX war_settlement_offers_from ON war_settlement_offers (from_pid, state);

CREATE TABLE war_settlement_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id   INTEGER NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('attack', 'tribute', 'rebellion', 'truce_break')),
  other_id        INTEGER,
  actor_id        INTEGER,
  detail          TEXT NOT NULL DEFAULT '{}',
  at              INTEGER NOT NULL
);
CREATE INDEX war_settlement_log_settlement ON war_settlement_log (settlement_id, at);
