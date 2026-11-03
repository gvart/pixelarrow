-- W-160..W-169 (docs/WAR.md "Season score and victory", "Paths" › "Ladders"): land alone decides the alliance win, so the
-- trade and peace score tables and a fill's score go. The roll of honour keeps each path's top places instead of the
-- title holders (server/src/war/world/seasonWar.ts).
DROP TABLE war_trade_score;
DROP TABLE war_peace_score;
ALTER TABLE war_fills DROP COLUMN score;
ALTER TABLE war_season_results DROP COLUMN titles;
ALTER TABLE war_season_results ADD COLUMN ladders TEXT NOT NULL DEFAULT '{}';
