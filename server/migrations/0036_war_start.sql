-- A new player's start (docs/WAR.md "Starting a game", server/src/war/start.ts): after the alliance he picks a home
-- region of it, then his squad; started_at marks the start done (one start per player and season).
ALTER TABLE war_alliance_members ADD COLUMN home TEXT;
ALTER TABLE war_alliance_members ADD COLUMN started_at INTEGER;
