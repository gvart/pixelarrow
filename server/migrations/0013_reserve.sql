-- The muster (src/game/muster.ts): heroes kept in camp, out of the field
-- army. The server's fieldReady skips them (server/src/online/store.ts);
-- POST /api/online/army sets the flag.
ALTER TABLE online_heroes ADD COLUMN reserve INTEGER NOT NULL DEFAULT 0;
