-- W-60: recruiting is gone (souls replace it: a man joins only by a soul claimed in a region, src/war/sim/souls.ts),
-- so the recruit pools go. No backward compatibility (no live users).
DROP TABLE IF EXISTS war_pools;
