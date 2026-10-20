-- M6h (docs/WAR.md "Season score and anti-abuse", "Stalls, offers and the board"); rules in server/src/war/tradeScore.ts.
--   war_trade_score: trade score per season, alliance and UTC day (capped a day); the world adds it to the season.
--   war_board_seen:  the last price board an alliance's men saw in a market town (the world hover card, fog).
CREATE TABLE war_trade_score (
  season      INTEGER NOT NULL,
  alliance    INTEGER NOT NULL,
  day         INTEGER NOT NULL,
  points      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (season, alliance, day)
);

CREATE TABLE war_board_seen (
  alliance    INTEGER NOT NULL,
  town        TEXT NOT NULL,
  board       TEXT NOT NULL DEFAULT '{}',
  at          INTEGER NOT NULL,
  PRIMARY KEY (alliance, town)
);
