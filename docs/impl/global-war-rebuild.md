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
- W-15 Git: each work item on its own worktree branch, merged `--no-ff` into local `main`. No push or PR unless the owner asks.

## Technical assumptions (desk decisions, revisit if they hurt)

- New code lives in `src/war/` (client + shared sim) and later `server/src/war/`. The sim is pure TS, deterministic, fixed **10 Hz** tick, runs in a Web Worker in the sandbox and in a Durable Object later.
- Region map = tile grid, 1 tile = 16 px. Layers: `height` (0–7 int), `terrain` (enum), `water` (none/shallow/deep). Height step of 1 is a slope (slow uphill), step ≥2 is a cliff (impassable). Deep water and `rock` impassable; shallow water, sand, marsh, forest slow; `road` fast. Higher ground: + range and + damage vs lower.
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
- [ ] **M1a sim-core** — types, region schema + loader, hand-made greybox `test-ridge` region (ridge, plateau, narrow pass, ford, deep river, forest, sand), pathfinding with terrain costs, squad movement + formations + separation, bench for 600 units. verify: vitest + `npm run bench:war` ≤ 8 ms/step. depends on: —
- [ ] **M1b sandbox-view** — `sandbox.html` + `src/war/view/`: Phaser greybox renderer (height shading, contours, water, terrain tint), camera pan/zoom, RTS selection box, right-click orders, formation keys, dev panel (spawn squad/bots, time scale, overlays: height/cost, perf). Runs against a fake `WarSim` until M1a merges, then wired to the real sim in a Worker. verify: Playwright screenshots. depends on: — (integration after M1a)
- [ ] **M1c combat-bots** — melee/ranged combat reusing class stats from `src/sim`, high-ground bonuses, slope/ford penalties, death/wounded flag, simple bot AI (attack-move, hold a point, flank via pass). verify: vitest scenarios (high ground wins equal fight). depends on: M1a
- [ ] **M1d scenarios** — `?scenario=` presets (pass ambush, ford crossing, hill assault, 600-unit brawl) + owner checklist. depends on: M1b, M1c
- [ ] **ART-1 world design + prototypes** — `docs/WAR.md` world section: ~35 regions with biome, altitude features, fauna (mobs), resources, adjacency; Gemini prototypes of the world map + 4 sample regions in `shots/war/gemini/`; prompts logged in `docs/playbook/PROMPTS_ART.md`. depends on: —

### M2 Region gameplay — resources, gather orders, building placement, mobs, claiming, entry no-build band
### M3 Server — RegionDO live sim, quotas, offline hold AI, interest management, 600-soldier load test
### M4 World map — strategic view, alliances, transfers, borders, home-can't-fall; delete old war code
### M5 Soldiers — recruits, wounded/heal, veteran XP, prisoners
### M6 Trade — caravans, market towns, hand-off
### ART-2.. — PixelLab tilesets and region art per approved prototype, region editor for tweaks

## Open risks
- 600 units with the large PixelLab soldier sheets in the browser: may need LOD (dots/impostors when zoomed out).
- Hand-authoring 35 regions: needs a prototype → grid conversion step plus an editor; measure cost on the first 4.
- DO CPU for live 10 Hz sim at 600 units: measured in M3 before committing to the cap.
