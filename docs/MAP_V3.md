# Map v3 — hand-authored season maps (replaces hex war table)

Decisions (owner, 2026-10):
- **No backwards compatibility** (pre-prod). Delete hex code paths outright; no dual q/r + loc storage. Rewrite migrations/tables as needed.
- Shard ≈ **150 players**, map ≈ **300 regions**. One hand-authored map per season.
- First map: **Western Mediterranean** (Massalia, Iberia, Balearics, Sardinia/Corsica, Sicily, Carthage/Africa coast, Etruria/Latium).
- Look: parchment ancient map per `docs/ART_STYLE.md` §World map — cream parchment, lavender sea, sage land, parchment-cloud fog of war, dotted animated routes, city reveal with camera pan.
- Camp: **online camp plots** (home plot + up to 2 coastal forward bases; buildings palisade/granary/forge/barracks/watchtower tied to income/rules) **and** an **offline campaign camp** (make camp on overland map: rest, repair, build, supplies).
- Offline campaign overland map also gets the parchment look.

## Data model
- `src/online/maps/<mapId>.json`, imported by client and Worker. Validated by `src/online/mapSchema.ts`.
- `{id, version, cell, w, h, mask (RLE region ids on hidden square grid), terrain (RLE: sea|shelf|sand|land|forest|hills|mountain|marsh), regions[], edges[]}`
- region: `{id:int, name, kind: plot|town|fort|capital|sea|lair|post, tier, site, spawn?, campPlot?, label:[x,y], revealPan?}`
- edge: `{a, b, minutes, naval?, waypoints:[[x,y]...]}` (dotted routes)
- Authoring source lives in `maps-src/` and is compiled by `scripts/buildMap.ts`; validator checks connectivity, spawn count/fairness, edges touch both regions.

## Engine
- `src/online/world.ts`: `WorldGraph` (`info(id)`, `adjacent`, `neighbours`, `within(id,hops)`, `path(from,to,ok)`, `pos(id)`, `all()`), single implementation from map JSON. All former hex call sites use it (attack adjacency, bosses, fog/sight, live visibility, march pathing, spawns, scoring/income, merchants, lairs, defenders, demoShard, coach).
- Locations are integer `loc` (region id). DB keyed by `(season, shard, loc)`.
- Shard rows record `map_id`.

## Rendering
- Procedural `Pix` pipeline (no image assets): terrain baked from mask into chunked RenderTextures; fog RenderTexture erased per revealed region with dissolve; routes as animated dotted polylines; armies/ships move smoothly along waypoints.
