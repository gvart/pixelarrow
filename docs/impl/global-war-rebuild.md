# Global war rebuild (temporary implementation doc)

Source brief: owner's Obsidian note `Projects/PixelArrow/Redesign.md`. Delete this file in the change that completes the rebuild; fold lasting rules into `docs/ROADMAP.md` "Binding decisions" and a living `docs/WAR.md`.

## Goal

A Foxhole-style browser war. A strategic **world map** of ~35 hand-made regions; all play happens **live inside a region's detailed map** with RTS squad control, real terrain height, and a cap of 600 live soldiers per region. Mix of Mount & Blade / Total War / Age of Empires.

## Decisions (owner-approved 2026-10-19)

- W-01 Scope: browser only, global war only. Mini App, duels, campaign, payments untouched and ignored. No backward compatibility; old shard/route-graph war code is deleted once M4 lands.
- W-02 World map is strategic only: you cannot walk on it. Armies **transfer** between adjacent regions. ~30–40 regions (Medium).
- W-03 4 starting alliances (clans exist inside an alliance), each with a home region. Every home has a neutral **entry region** on N/E/S/W. Entry regions are big and have a no-build band so owners can't wall them off.
- W-04 Every region is hand-authored (shape, landscape, altitude, rivers, passes, fauna, resources). Nothing procedural at runtime. Variety is organic, not tiled-looking.
- W-05 Inside a region: live server-authoritative sim of every army; anyone nearby can join a fight.
- W-06 Troop cap 600 live soldiers per region, as a per-alliance quota. Load-test and raise if it holds.
- W-07 Offline armies stay in place and hold with AI; they count against the cap.
- W-08 Control: RTS squad orders (select, move, attack, formation, hold, gather), squad = one player's army of ≤20.
- W-09 Home region can be besieged and razed but never taken.
- W-10 Soldiers: recruit in owned towns (population rate), most fallen are wounded and heal, veterans keep XP, prisoners can be held and freed.
- W-11 Trade: caravans move on the map and can be raided, market towns, direct hand-off between players on the region map. No menu market.
- W-12 Neutral regions hold mobs (fauna) and resource nodes; clear mobs to claim; soldiers are assigned to gather.
- W-13 Greybox first: gameplay on coded tiles + height shading; Gemini prototypes → owner approval → PixelLab assets swapped in, in parallel.
- W-14 Testing is owner-in-the-loop: every milestone ends with a local URL (`sandbox.html?region=…&scenario=…`) and a short checklist.
- W-16 Regions render in true isometric (2:1 diamonds) with raised height: cliffs/plateaus/banks visible as walls; sim stays in tile coords (owner 2026-10-19).
- W-17 ~~Region size 256×256~~ superseded by W-18.
- W-18 Real scale: soldier sprite 58 px = 1.76 m (≈33 px/m). 1 tile = 2 m; region 512×512 tiles ≈ 1 km. Trees, forts, rivers, roads sized true to the soldiers; mountains may be compressed. Zoomed-out LOD (dots/banners) for 600 units (owner 2026-10-19).
- W-19 Gemini images are prototypes only. Real region art is built with PixelLab: map generation, tile generation (iso tilesets/transitions), map objects (trees, rocks, buildings) and FX (owner 2026-10-19).
- W-20 Art pipeline (ART-3 spike): iso tiles 64×32 px, 16 px per height level. Terrain = one PixelLab create_tiles_pro iso Wang set (16 tiles, 64×48) per terrain pair, remapped to one dark palette, rim stripped; our renderer autotiles (corner mask NW<<3|NE<<2|SW<<1|SE) and stacks height. Objects = create_map_object (high top-down, 33 px/m, ≤400 px, no ground base) as trimmed PNGs with foot anchor; objects must have NO ground patch (owner: tree bases clashed with the terrain) — key out any base before promoting. Look approved by owner 2026-10-19. FX = vfx_workbench. create_map is not used (no autotile/export). Details: docs/playbook/PROMPTS_ART.md §22.
- W-21 Art library grows per biome (~8 biomes from docs/WAR.md), ~100 generations each, one biome at a time with owner approval before the next. Every asset passes an automated QA gate (no ground patch, shared palette, no seams/grid, true-scale metadata, roofs/closed shapes) before promotion (owner 2026-10-19).
- W-25 Game UI (HUD, build-mode toolbar, panels, icons, buttons, frames) is generated with PixelLab (create_ui_asset etc.) as one consistent pixel-art kit in the dark-epic style; the current HTML dev panel stays dev-only (owner 2026-10-19).
- W-26 Build UX (owner play-test 2026-10-19, desk decision): B / Build button works with nothing selected; placing creates a planned site; workers are assigned afterwards — right-click a site with a squad, or the site panel's "assign N" which detaches N soldiers from the selected squad. Selected squads show a Build hint. Ghost = the real building sprite tinted green/red; footprint grid drawn under objects, only in build mode; construction art by progress (foundation → rising → scaffold → done); workers spread over perimeter work slots with a per-building cap; cancelled/stopped sites can be resumed.
- W-27 Wall tiers + wall-walks (owner 2026-10-19): 3 tiers upgradable in place — palisade (no walkway, burnable) → timber rampart (walkway, burnable) → Greek stone wall (tall, wide walkway, fireproof). Wood and stone towers with top platforms. Walkways are real elevated walkable tiles reached by stair tiles on the inside; defenders fight from them with the existing high-ground rules; attackers need ladders or a breach. Item M2e (after m2c).
- W-28 Wall-walk fixes (owner play-test 2026-10-19): walkway walls are 2 tiles thick so soldiers can pass each other; art splits walls into back + walkway + FRONT parapet layer drawn over defenders' lower bodies (no floating); stairs and ladders are player-placed pieces attached to a wall/tower (no auto stairs, no access without one); towers placed freely (standalone or joined to a walkway at the same height); stone tower = door + internal stair, wood tower = attached ladder.
- W-29 Siege scope (M2c, owner 2026-10-19): rams (crewed, vs gates/walls, crew exposed), siege ladders (carried, raised on walls, defenders can push off), fire (torches/fire arrows ignite wood; stone fireproof; spreads slowly, can be put out?), stone throwers (expensive, slow, ranged vs walls/towers), destroyed segments become walkable rubble breaches, siege-aware bots, `siege` scenario.
- W-30 Controls (owner 2026-10-19): E and right-click do the same context action on the hovered target (crew/uncrew engine, raise ladder on enemy wall face, push enemy ladder, ignite enemy wood if torches else attack, extinguish own fire, build/resume site, gather node, attack enemy, move on ground), with a hover label showing the action first. Only toggles keep own keys: Q fire arrows, Y deploy/pack, H hold.
- W-31 Next (owner 2026-10-19): PixelLab UI kit (art then integration), bridges (M2d), neutral regions (mobs guard nodes, clear to claim, first anchor, influence) — sim work sequenced bridges → neutral; art in parallel (UI kit cap 60, mob creatures cap 120).
- W-32 UI style (owner 2026-10-20): B1 red-figure black bands (compact, ~14% of screen) + the round meander minimap from B2; keep it colourful — ornament/borders in terracotta with full-colour icons, not monochrome. References: shots/war/ui/proto/B/B1_black_bands.png, B2_vase_frieze.png. Replaces the first kit (public/war/ui/) in look and size.
- W-33 Bridges v2 (owner 2026-10-20): span limit wood 12 tiles, stone 24 tiles (supersedes W-24's 10); widths 1/2/3 tiles; 4 directions — the 2 grid axes plus the 2 grid diagonals (screen-horizontal/vertical), tool picks the direction closest to the drag; diagonal decks need new art.
- W-34 HUD v2 (owner 2026-10-20): HUD much bigger and readable (default ~2× current, user UI-scale setting); command card regrouped (orders | formations | squad-specific), short; build bar hidden until B / Build button; situational actions (raise/push ladder, ignite, extinguish, crew…) are not permanent buttons — E/right-click does the recommended one shown at the cursor, holding E (or right-mouse) opens a radial menu of all valid actions for the hovered target.
- W-35 Fire arrows (owner 2026-10-20): archers can shoot fire arrows only within a few metres of a lit brazier (cheap placeable on ground, walkway or tower); each volley consumes pitch (new resource, made from pine wood at a pitch kiln or gathered from pines). Torches still ignite up close.
- W-36 Map views (owner 2026-10-20): switchable view modes (normal, altitude, movement cost/terrain, ownership/influence, biomes, resources), a readable minimap, a zoom-out limit, and M opens a full-map view to investigate. Queued after hud-v2.
- W-37 Soldier progression (owner 2026-10-20): deep, progressive per-soldier development — attributes, skills, equipment (reuse/adapt the existing single-player hero systems: src/data items/classes/computeStats, docs/ITEMS.md, GAMEPLAY.md) so players care about individual soldiers; keep the live sim light for 600 units: progression is baked into a few derived combat stats per unit at spawn/level-up, no per-tick skill logic beyond a small set of passive modifiers; skills are few and impactful. Part of M5.
- W-38 Non-combat classes (owner 2026-10-20): cook, smelter/smith, trader, and a few more (≤ 6) so players can follow different playstyles; same progression model as soldiers; they are vulnerable units in the region and feed economy/trade. Designed in M5.
- W-15 Git: each work item on its own worktree branch, merged `--no-ff` into local `main`. No push or PR unless the owner asks.

## Technical assumptions (desk decisions, revisit if they hurt)

- New code lives in `src/war/` (client + shared sim) and later `server/src/war/`. The sim is pure TS, deterministic, fixed **10 Hz** tick, runs in a Web Worker in the sandbox and in a Durable Object later.
- Region map = tile grid, 1 tile = 2 m, drawn as 64×32 iso (W-18, W-20). Layers: `height` (0–7 int), `terrain` (enum), `water` (none/shallow/deep). Height step of 1 is a slope (slow uphill), step ≥2 is a cliff (impassable). Deep water and `rock` impassable; shallow water, sand, marsh, forest slow; `road` fast. Higher ground: + range and + damage vs lower.
- Pathfinding: grid A* with terrain costs on a coarse sector graph + per-squad flow/A* (agent picks), spatial hash for neighbours. Budget: 600 units, sim step ≤ 8 ms on a laptop.
- Region data JSON: `src/war/regions/<id>.json`, schema in `src/war/region/schema.ts` (zod).

### Shared contract (`src/war/types.ts`, create exactly this; extend only additively)

```ts
export type TerrainKind = 'grass' | 'forest' | 'sand' | 'marsh' | 'rock' | 'road' | 'snow' | 'dirt';
export type WaterKind = 0 | 1 | 2; // 0 none, 1 shallow (ford), 2 deep (impassable)
export interface RegionData {
  id: string; name: string; w: number; h: number; // tiles
  height: number[]; terrain: TerrainKind[]; water: WaterKind[]; // row-major, length w*h
  entries: { side: 'N' | 'E' | 'S' | 'W'; x: number; y: number; w: number; h: number }[];
  noBuild: { x: number; y: number; w: number; h: number }[];
}
export type SquadId = number; export type UnitId = number;
export type Order =
  | { kind: 'move'; squad: SquadId; x: number; y: number }
  | { kind: 'attack'; squad: SquadId; target: SquadId }
  | { kind: 'hold'; squad: SquadId }
  | { kind: 'formation'; squad: SquadId; shape: 'line' | 'column' | 'wedge' | 'loose' };
export interface UnitSnap { id: UnitId; squad: SquadId; x: number; y: number; facing: number; hp: number; maxHp: number; cls: string; state: 'idle' | 'move' | 'attack' | 'dead' }
export interface SquadSnap { id: SquadId; owner: string; team: number; units: UnitId[]; order: Order['kind'] }
export interface Snapshot { tick: number; units: UnitSnap[]; squads: SquadSnap[] }
export interface WarSim {
  readonly region: RegionData;
  spawnSquad(owner: string, team: number, cls: string, count: number, x: number, y: number): SquadId;
  order(o: Order): void;
  step(): void;               // advance one 10 Hz tick
  snapshot(): Snapshot;
  stats(): { stepMs: number; units: number };
}
export declare function createSim(region: RegionData, seed: number): WarSim; // implemented in src/war/sim/index.ts
```

## Work items

### M1 Region sandbox
- [x] **M1a sim-core** — types, region schema + loader, hand-made greybox `test-ridge` region (ridge, plateau, narrow pass, ford, deep river, forest, sand), pathfinding with terrain costs, squad movement + formations + separation, bench for 600 units. verify: vitest + `npm run bench:war` ≤ 8 ms/step. depends on: —
- [x] **M1b sandbox-view** — `sandbox.html` + `src/war/view/`: Phaser greybox renderer (height shading, contours, water, terrain tint), camera pan/zoom, RTS selection box, right-click orders, formation keys, dev panel (spawn squad/bots, time scale, overlays: height/cost, perf). Runs against a fake `WarSim` until M1a merges, then wired to the real sim in a Worker. verify: Playwright screenshots. depends on: — (integration after M1a)
- [x] **M1c combat-bots** — melee/ranged combat reusing class stats from `src/sim`, high-ground bonuses, slope/ford penalties, death/wounded flag, simple bot AI (attack-move, hold a point, flank via pass). verify: vitest scenarios (high ground wins equal fight). depends on: M1a
- [x] **M1e iso-view** — true-iso renderer with height walls, iso picking for select/orders, occlusion fade/outline; same dev panel. depends on: sandbox-wire
- [x] **M1f region-256** — test-ridge regenerated at 256×256, pathing perf re-checked (hierarchical if needed). depends on: M1c
- [x] **M1d scenarios** — `sandbox.html?scenario=pass-ambush|ford-crossing|hill-assault|bridge-vs-ford|brawl-600|free` (src/war/scenarios), picker + goal + alive/wounded/killed score in the panel; team 0 drawn blue. Owner checklist: each scenario reads at a glance (blue you, red enemy); bots do their job (march / hold / split); orders feel responsive; the score ends with a winner.
- [x] **ART-1 world design + prototypes** — `docs/WAR.md` world section: ~35 regions with biome, altitude features, fauna (mobs), resources, adjacency; Gemini prototypes of the world map + 4 sample regions in `shots/war/gemini/`; prompts logged in `docs/playbook/PROMPTS_ART.md`. depends on: —

- [x] **ART-5 asset fixes + QA gate** — roofed watchtower, true umbrella pine, variant tiles so marsh/forest floor don't repeat, sand/water + sand/shallow sets, automated asset QA script. depends on: ART-4
- [ ] **ART-6.. biome libraries** — one biome per item (tile sets + variants + 15–25 objects/props), owner approves each. depends on: ART-5
- [x] **ART-R render integration** — renderer draws PixelLab tiles (autotile by corner mask), cliff strips, objects from region data. depends on: M1d, ART-4

### M2 Region gameplay — resources, gather orders, building, mobs, claiming, entry no-build band
- W-22 Building (owner 2026-10-19): a separate **build mode** (own UI and camera/placement overlay). Buildable: home base/camp, castle/fortress, walls + gates + towers, basic economy buildings (to expand territory), bridges across rivers. Soldiers do the construction with new **build/carry animations** on the existing soldier sheets. Every structure has **intermediate construction states** (foundation → scaffold → done) and can be damaged/razed. No building in entry no-build bands.
- W-23 Building answers (owner 2026-10-19): any soldier builds (a building squad drops weapons and is vulnerable); footprints snap to 2 m tiles, walls drawn as a dragged line with towers/gates inside; territory grows by influence radius from forts/outposts (claiming a region gives the first anchor; build only inside own influence); siege: rams vs gates, ladders on walls, fire vs wooden palisades/buildings, stone throwers.
- W-24 Costs: resources delivered to the site + labour time scaling with workers (palisade ≈1–2 min for one squad, stone fort ≈15–30 min). Bridges only where deep water ≤ ~10 tiles (20 m) bank to bank; wooden (fast, burnable) or stone (slow, permanent) (owner 2026-10-19).
- Plan: M2a sim economy+building core (resources, gather, stockpile, sites, construction, walls/gates, influence) → M2b build mode UI + view → M2c siege (rams, ladders, fire, stone throwers) → M2d bridges; ART-B building art in parallel; mobs/claiming after M2b.
- Open questions to settle at M2 kickoff (superseded by W-23 where answered): who builds (any soldier vs dedicated builders); placement (free with footprint vs grid snap; walls drawn as a line/path); costs and build time; does territory grow from buildings (influence radius) or only from claiming; bridge rules (span length, shallow vs deep water); siege interaction (rams/ladders vs walls).
- Items (draft): M2a build mode + placement + footprints in sim; M2b construction states + worker orders; M2c walls/gates/towers (line placement, pathing blocks, gates open for owners); M2d bridges (change water passability); ART-B building art (PixelLab objects per state, per biome style) and soldier build/carry clips.
### M3 Server — RegionDO live sim, quotas, offline hold AI, interest management, 600-soldier load test
### M4 World map — strategic view, alliances, transfers, borders, home-can't-fall; delete old war code
### M5 Soldiers — recruits, wounded/heal, veteran XP, prisoners
### M6 Trade — caravans, market towns, hand-off
### ART-2.. — PixelLab tilesets and region art per approved prototype, region editor for tweaks

## Open risks
- 600 units with the large PixelLab soldier sheets in the browser: may need LOD (dots/impostors when zoomed out).
- Hand-authoring 35 regions: needs a prototype → grid conversion step plus an editor; measure cost on the first 4.
- DO CPU for live 10 Hz sim at 600 units: measured in M3 before committing to the cap.
