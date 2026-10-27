-- W-66 the Tunnel of Shades (rules: src/war/sim/tunnel.ts; server: server/src/war/raise.ts).
--   war_tunnel: per player, when the next man rises from his home town's tunnel while he has fewer than the floor (6)
--               living men; NULL: nothing pending. Settled lazily on read (GET /api/war/tunnel, the roster, region join).
CREATE TABLE war_tunnel (
  player_id INTEGER PRIMARY KEY REFERENCES players(id),
  next_at   INTEGER
);
