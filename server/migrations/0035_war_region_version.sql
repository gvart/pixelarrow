-- Per-region maps on the server (server/src/war/regions.ts): a region's memory is kept with the version of the authored
-- region it was made on; a memory of another version (the map changed) is ignored and the region starts as authored.
ALTER TABLE war_region_state ADD COLUMN ver TEXT NOT NULL DEFAULT '';
