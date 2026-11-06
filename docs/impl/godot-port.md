# Godot singleplayer port (temporary implementation doc)

Delete this file in the change that completes the port; fold lasting rules into `docs/ROADMAP.md` and `docs/WAR.md`.

## Goal

pixelarrow as a native Godot 4 game (GDScript), released **offline singleplayer first** on Steam desktop and the
mobile stores: the player leads one alliance, bots and warlords run the other three. Multiplayer comes back later as an
"online" toggle on the same world and message protocol.

## Decisions (owner, 2026-11-06)

- G-01 No web version any more. The Phaser client and the browser HUD get no new work; they stay as the reference until parity, then go.
- G-02 Godot 4, GDScript (best supported on iOS/Android). Hot loops may move to a C++ GDExtension later, only if a bench shows the need.
- G-03 Singleplayer = offline vs AI alliances: no server, no account, local saves.
- G-04 Multiplayer later: same world, same protocol (`src/war/net/protocol.ts`), the Cloudflare server as the online backend. Frozen until then.
- G-05 Vertical slice first: the Elaia home plus 2–3 neighbouring regions with every system, then grow region by region to all 37.
- G-06 The project lives in `godot/` in this repo; assets, region JSON and data tables are read from the existing files.
- G-07 The TS sim is the spec. The GDScript sim is checked against golden traces of the TS sim (seeded scenarios).
- G-08 No new mechanics during the port. Rule changes wait until parity, or land in TS first with a new trace.
- G-09 Platform rule (from v6): Steam, mobile and saves sit behind neutral interfaces, with one adapter folder per platform.

## Work items

- [x] **P1 golden traces**: `npm run traces:godot` runs the scenario catalogue headless (`src/war/scenarios/run.ts` headlessHost) and writes one JSON per scenario: digests of units, squads, buildings and stock every 10 ticks. They are generated in CI, not committed. verify: two runs give the same bytes. depends on: —
- [ ] **P2 Godot skeleton**: done: `godot/project.godot` (Godot 4.7.2, GL Compatibility), a small headless runner instead of GUT (`godot/tests/run.gd`, `TestCase`; tests are `res://tests/**/test_*.gd`), the `.github/workflows/godot.yml` CI job (traces, then the Godot tests), and macOS/Windows/Linux/Android presets in `godot/export_presets.cfg`. Left: install export templates and the Android SDK, then boot a build on macOS and an Android device. verify: CI green; a build boots on both. depends on: —
- [ ] **P3 data import**: done: `npm run data:godot` (scripts/godot/data.mjs, src/dev/godotData.ts) writes every JSON-safe export of src/data, src/war/sim and src/war/world to `godot/data/tables/` (63 tables; the only dropped values are the four `make` functions of `HIDDEN` in src/data/warStories, which get ported as code), and each parsed region as JSON plus `.cells` (one u16 per tile) with a manifest; `GameData` and `Region` load them, and `godot/tests/test_data.gd` checks every table key, every region sha256 and a decoded tile. Generated, not committed; the export presets ship `data/*`. Left: sprite PNGs and their frame metadata move to P9 (the view needs them, and importing `public/war` in place would put `.import` files there). verify: done for tables and regions. depends on: P2
- [ ] **P4 sim core**: rng (mulberry32 with 32-bit masking), grid, movement and formation, combat, vision. Each module is first checked alone against TS vectors (`src/dev/godotVectors.ts` into `godot/tests/golden/vectors/`), because whole-scenario traces only match once `src/war/sim/index.ts` (4.2k lines) is ported. Done: rng and hashString (`godot/src/sim/rng.gd`, bit-exact over 7 seeds and non-BMP strings). verify: each module's vectors match; then movement and combat traces match P1 within tolerance. depends on: P1, P3
- [ ] **P5 sim economy**: economy, works, holders, food, crafting, trade, siege. verify: economy, building and siege traces match. depends on: P4
- [ ] **P6 sim world life**: mobs, roam, bosses, souls, civilians, captives, encounters, stories, secrets, deeds, honours, townLevel. verify: the remaining scenario traces match. depends on: P5
- [ ] **P7 AI**: bots and warlords; an "alliance AI" that plays a whole alliance. verify: a seeded AI-vs-AI season runs headless to its end without stalling. depends on: P6
- [ ] **P8 local room**: port the room layer (`server/src/war`: economy feed, cargo, bosses, crafting, placement, world events, season) behind the same messages as `src/war/net/protocol.ts`, so the online server can stand in later. verify: client ↔ local room round-trip tests. depends on: P7
- [ ] **P9 iso region view**: true-iso terrain with height (W-16/W-20 autotile), objects, units with sheets, fog, LOD for 600 units. verify: whole-screen shots of Elaia match the Phaser sandbox; 600 units hold 60 fps on desktop and 30 on a mid phone. depends on: P3 (P4 for live units)
- [ ] **P10 input and HUD**: mouse and keyboard plus touch (select, orders, formations, camera); the HUD rebuilt in Godot Control nodes, phone and desktop layouts. verify: hud-reviewer style shots at desktop and phone sizes; the 3-second "what do I do" test. depends on: P8, P9
- [ ] **P11 world map and season**: strategic map, transfers between regions, alliances, season score. verify: a played season in the slice. depends on: P8
- [ ] **P12 saves and platforms**: local save and load, Steam adapter (GodotSteam), mobile adapter, settings, audio. verify: save round-trip test; export builds run. depends on: P10, P11
- [ ] **P13 vertical slice release candidate**: Elaia and its neighbours playable start to finish, owner playtest. depends on: P12
- [ ] **P14 grow to 37 regions**, then delete the Phaser client and the web-only code. depends on: P13

## Open risks

- **Float drift.** JS and GDScript are both 64-bit, but `sin`/`cos`/`atan2`/`pow` (54 uses in `src/war/sim`) can differ in the last bits, and chaotic fights amplify that. Traces are compared with a tolerance over short windows; if that's not enough, replace those calls in both sims with shared table or polynomial versions.
- **Integer semantics.** `Math.imul`, `>>>` and `| 0` need explicit 32-bit masking in GDScript (64-bit ints).
- **GDScript speed** for a 600-unit sim at 10 Hz on phones: bench after P4; the fallback is G-02's GDExtension.
- **Size.** About 90k lines of TS. The sim (15.7k) and the room (11.6k) port one module at a time, and P1 traces keep each step checkable.
- **Godot's JSON float parsing is not correctly rounded** (4.7.2: exact to 13 significant digits, then off by an ulp more and more often; 2 table constants were). Exporters write longer floats as `{"f64": hex}` (`src/dev/godotJson.ts`), `GameData.read_exact` restores them, and `test_table_floats_are_exact` checks every table float against the TS bits. Read every exported file through `read_exact`.
- **JSON numbers are floats in Godot.** `int()` them wherever the TS sim relies on integers (ids, counts, bit ops), or traces drift.
- **Region data size**: 61 MB as exported, mostly the expanded object lists (about 2 MB a region). Pack objects in binary at P12 if the mobile package is too big.
- **Big sprite sheets** (7–16 MB per class) on mobile: watch memory at P9; atlas or downscale only if a device fails.
