# War playtest (local)

```bash
npm run play:war            # migrate local D1, start wrangler dev (DEV_AUTH=1) + vite, seed, print URLs
npm run play:war -- --reset # wipe local state first: a fresh world, season and roster
npm run play:war -- --bots  # + 3 bot players (Skythia, Kyrene, Elaia), 12 militia each standing at home
npm run play:war -- --fast  # world travel x0.05 (WAR_TRAVEL_SCALE, dev only): transits take seconds
node scripts/war/play-smoke.mjs   # live wiring check (servers up with --reset --fast; 12 min on a loaded machine, 6 of it the page starting a region)
```

The smoke only checks wiring: the page (dev player 1, Dodona) opens the world map, enters home and gives a move order;
raw sockets (dev 1, and dev 2 as Skythia, each with its own `cf-connecting-ip`, else the accounts are linked and may not
trade) carry food and coin from the strongrooms in packs, one chained transfer each into Kleisoura, stow them into a
stall and a warehouse in the court, and the buyer fills the seller's offer. The loop's game logic is in seeded vitest
scenarios run in CI: tests/war/loop.test.ts (moors: bear lair, the Great Bear, claim point 2 flipped, a ram crewed, moved
and breaching a palisade gate) and server/test/war/tradeLoop.test.ts (the buyer's coin strongroom -> packs -> transfer ->
warehouse in the court -> a fill). It runs in Playwright's bundled Chromium in the new headless mode
(`channel: 'chromium'`; `--chrome` for the system Chrome). The old headless shell (Playwright's default) runs the page far
too slowly under software GL to start a region.

The first start packs the sprite sheets (a few minutes). You play dev player 1 in Dodona with the design's start:
12 militia recruited at home for food, the rest of the start food (120) in the strongroom, no coin. Open
**http://localhost:5173/world.html?dev=1**. Ctrl-C stops both servers. Other ports: `PLAY_API_PORT`, `PLAY_WEB_PORT`.

## What to try, in order

1. **World map.** Hover regions (card: owner, purpose, prices seen), T trade routes, F fit. Your men show once they
   stand in a region.
2. **Enter home.** Double-click Dodona (or select it, Enter). Your squad joins the live region at the north entry
   (pan there: the camera opens on the middle). Shift+W goes back.
3. **Build your camp at home first.** A home is its alliance's from the season's start: influence (radius 64) round the
   home town (Dodona: the agora south-east of the map's middle; the town's storehouses are yours). March your squad
   there, right click a wood or stone node to gather (the men carry it to the nearest store of yours), then B opens the
   build bar: a **camp**, then a **storehouse** inside your influence.
4. **March out.** On the world map select Dodona (your men) and click a lit neighbour: **dodona-e** (then Kleisoura).
5. **Raid a neutral lair.** Kleisoura or a dodona ring region: clear the wolves, boars, bears, bandits round the banner.
6. **Claim.** Right-click the banner with a squad (30 s, no foes near): its radius becomes your influence; build there
   as at home.
7. **Recruit and craft.** R roster (recruit at home for food, squad, gear, levels). Click a forge to queue an item.
8. **Caravan.** Build or capture a **handcart**, load it, escort it to a frontier town (H on the world map plans a haul).
9. **Trade.** In a frontier town (Kleisoura, Stymphalia, Achelous, Ammos) press K: rent a stall, stow goods, list an offer.
10. **Siege a palisade.** Build a ram or ladders (build bar, Siege tab), crew with E, batter the gate.
11. **Landmark raid.** Krios (Drakon's Citadel) or Ammon (Dead City); far easier from the sandbox scenarios below.

Steps 7-11 are the parts the live server has least coverage for (see Known gaps); each has a sandbox scenario to try
the same mechanics offline.

## Controls

| Where | Keys |
| --- | --- |
| World | drag pan, wheel zoom, click select, click a lit neighbour to transfer, double-click / Enter enter, Esc clear, T routes, H haul planner, F fit, +/- zoom |
| Region | L click / box select (shift adds), right click move, Ctrl+right click attack-move, E or R the action at the cursor, H hold, X stop, F squad active, 1-4 line / column / wedge / loose |
| Region panels | B build bar, R roster, K market, M full map, G boss camera, F2-F7 view modes, Shift+W world |
| Siege | E / right click crews, raises or pushes ladders, ignites, attacks; Y deploy / pack; Q fire arrows; P push a ladder off, I sally to burn, O beat out fire |
| Camera | WASD, screen edge, middle or space+drag pan, wheel zoom |

## Dev console (F1)

Dev builds only (`npm run dev`, then `/sandbox.html`). **F1** or the **DEV** corner button shows it; `&dev` in the URL
opens it at once. It drags by its title (double-click the title: back to its place) and remembers where it was put,
which sections are open, the spawn and grant choices, whether it was open and each scenario's ticked checks. Hover any
control for what it does. Sections:

- **Scenario**: the running scenario's goal and a **what to check** list to tick off; a picker grouped by feature with a
  search box (name, id, group or goal; Enter loads the first match, arrows move, a click previews, double-click loads);
  **Restart** on the seed shown or **New seed**; another region (empty).
- **Spawn & units**: class (soldiers, civilians, mobs), team, men; **Place** (next click), **At cursor** (**F9**),
  +4 bot squads, 600 brawl. For the selected men: **Strike down** (they fall wounded or dead by their END), **Wound**
  (to a quarter of their hp), **Heal**.
- **World & time**: pause, 1x / 2x / 4x / 8x, **Step** one tick, skip 1 min, walls cut-away (V), claim here.
- **Economy**: grant any good (negative takes it), +500 of every basic good, **Finish site** for the selected site.
- **Overlays**: height, movement cost, influence, mobs (the F2-F7 view modes), fog, unit **paths** (8 s trails), grid.
- **Perf**: fps, sim ms per step, units, squads, tick, zoom; the fight score per team (alive, wounded, killed).
- **Camera**: the region's named spots, guardians, claim points, lairs and entries; zoom steps; back to the scenario's view.

Deep links: `sandbox.html?scenario=<id>&seed=<n>` (default seed 1; a scenario may set its own and its side, `?team=`
wins). In a live region squads, goods, claim and skip go to the region server as dev messages (refused unless it runs
with DEV_AUTH=1, as `play:war` does); time, unit and site cheats do nothing there. The world map has no dev console;
`npm run play:war -- --reset` gives a fresh world.

## Sandbox scenarios (offline, `sandbox.html?scenario=<id>`)

Each is seeded and isolates one feature; the console shows its checklist. Defined in `src/war/scenarios/` (one file per
group, the classic presets in `index.ts`, played by `run.ts`); `tests/war/scenarioCatalogue.*.test.ts` loads every one,
steps it 50 ticks and checks a seed plays the same. Region test-ridge unless named.

| id | region | one line |
| --- | --- | --- |
| **Sandbox** (1) | | |
| free |  | Empty map: place squads and bots from the panel. |
| **Movement** (7) | | |
| bridge-vs-ford |  | Two enemy columns head for fieldW, one over the bridge, one through the ford. |
| move-woods |  | Three squads leave the clearing for the forest spot through thick woods; a fourth is sent onto the rock band north of the camp. |
| move-formations |  | Four hoplite squads on open grass, each in another formation: line, column, wedge, loose. |
| move-groups |  | Eight squads of every class on open grass: box-select, shift-add, make control groups (Ctrl+1-9) and recall them. |
| move-ford |  | Two squads wade the ford from the west bank to the east, no foes about. |
| move-pass |  | A column of three squads climbs the switchback pass from passS to passN. |
| move-cliffs |  | One squad at the cliff foot is sent to the ridge crest above it; another climbs the ramp to the plateau. |
| **Combat** (9) | | |
| pass-ambush |  | Hold the switchback pass: the enemy column marches from passN to passS. |
| ford-crossing |  | Force the ford: the enemy holds the far (east) bank. |
| hill-assault |  | Take the plateau: the enemy holds the top. |
| brawl-600 |  | 300 v 300 across the ford: the bots attack the nearest squad. |
| combat-lines |  | Three hoplite squads of yours against three of theirs on open grass; theirs advance. |
| combat-high-ground |  | Your archers hold the ridge crest; enemy archers shoot back from the foot of the slope. |
| combat-skirmish |  | Your javelineers and slingers face a militia charge. |
| combat-flank |  | Their two squads hold a line facing south; your hoplites pin them from the front while your swordsmen wait off their east flank. |
| combat-wounded |  | A short melee with a physician behind your line. |
| **Economy** (12) | | |
| crafting |  | A claimed camp with a forge, a cookhouse and an infirmary, stock and a civilian of every trade. |
| market |  | Open the market (K): rent a stall, stow goods in, list an offer or a buy order, take from the board, post or take a contract, offer a letter; Hand-off trades with a trader here. |
| loot |  | After the skirmish: pick up the loot piles (E on a pile), let the smith salvage gear, and capture the foe trader's handcart (stand beside it 5 s with none of theirs near), then load it. |
| caravan |  | Get the loaded wagon down the east road to the entry. |
| eco-wood |  | A camp stands in the clearing; the militia fell the pine beside it and carry the wood home. |
| eco-stone |  | The militia quarry the stone outcrop north of the camp; the long walk home shows why stores go near the work. |
| eco-ore | krios | On the Krios glacier the militia mine the iron by the old workings and carry it to a camp beside them. |
| eco-hunt | kimmeria | Archers below the ibex herd of the Kimmerian hills (lair squad 3) loose on it; the herd bolts, the fallen beasts leave hides. |
| eco-farm |  | A camp and a farm stand; foragers pick the berries west of the camp. |
| eco-stores |  | Two towns down the east road, a camp and a storehouse each. |
| eco-handcart |  | A crew of three takes up the handcart by the first camp and loads it there; then pull it to the second town and unload into its store. |
| eco-trade |  | A loaded wagon leaves the first town for the trading post down the road, an escort with it. |
| **Building** (8) | | |
| build-test |  | Build up a base: your militia raise a camp on the claimed ground; gather wood and stone, place buildings and walls (B). |
| bridge-test |  | Cross the river: the old road crossing is walled off, but a stone road bridge spans the wide reach to the north and a wood footbridge the narrow one. |
| build-each |  | A claimed camp with stock of everything, three militia squads and an engineer holding every design. |
| build-wall-rock |  | The militia lay a palisade line north from the clearing straight across the rock band. |
| build-wall-tower |  | A wood tower stands; the militia lay a palisade from the tower east. |
| build-wall-gate |  | A palisade line stands; a wood gate is dropped on it. |
| build-stalled |  | The militia lay a palisade with 6 wood in stock (it needs 24). |
| build-no-workers |  | A storehouse is planned with no squad on it. |
| **Siege** (7) | | |
| wall-defense |  | Hold the walled camp: your archers man the south wall-walk, spears wait inside the gate. |
| siege |  | Take the stone fort: batter the gate with the ram (E on the ram to crew it, then E on the gate), raise the ladder on the wall (E on the wall face), shell the towers with the stone thrower, burn the palisade (E with torches, or fire arrows: Q), then storm the breach. |
| siege-defend |  | Hold the stone fort: the enemy builds a ram and ladders, shoots fire arrows and storms when a breach or a ladder opens. |
| siege-ram-gate |  | A palisade with a wood gate. |
| siege-ladders |  | A timber rampart with a walkway, an archer squad on it. |
| siege-fire |  | A palisade and a wood tower. |
| siege-thrower |  | A palisade with a wood tower behind it. |
| **Mobs** (7) | | |
| neutral-clear |  | Clear the region: kill the wolves, boars, bears and bandits round the claim banner (the mobs overlay shows aggro and leash), then right-click the banner with a squad to claim it (30 s, no foes near). |
| mob-wolf |  | A wolf pack runs in fast and bites. |
| mob-boar |  | Boars charge. |
| mob-bear |  | Two bears: few, hard to kill. |
| mob-bandit |  | A bandit band attacks like soldiers. |
| mob-jackal |  | Jackals: many, weak, quick. |
| mob-ibex |  | An ibex herd grazes: hunt it (right-click it with the archers). |
| **Bosses** (15) | | |
| landmark-citadel | krios | A 4-squad raid at the barbican of Drakon's Citadel on the Krios glacier, up the switchbacks from the ruined village. |
| landmark-deadcity | ammon | A 3-squad raid storms the Dead City up the butte from the salt flats, toward the palace street where the Bandit King and his guard stand (the host's lairs hold the quarters, its captain's men the towers). |
| boss-moor-bear | moors | A 3-squad raid on the Great Bear in its den on the moors. |
| boss-griffin | kimmeria | A 3-squad raid on the Griffin at its eyrie in the Kimmerian hills. |
| boss-savanna-lion | savanna | A 3-squad raid on the Lion of the Savanna. |
| boss-maenad-queen | bacchae | A 3-squad raid on the Maenad Queen and her thiasos. |
| boss-brontes | saddle | A 4-squad raid at the Cyclopean gatehouse: Brontes hurls rocks from the gate top, then comes down. |
| boss-grove-queen | erymanthos | A 4-squad raid into the Oracle Grove on the Maenad Queen. |
| boss-river-god | delta | A 5-squad raid at the sunken temple on Achelous: giant, serpent in the channels, bull. |
| boss-minotaur | omphalos | A 5-squad raid on the Minotaur in the Temple City (the Titan holds the arena to the south). |
| boss-drakon-late | krios | Drakon the White starts at 55%: past the roof phase, crashing down enraged, the drakes coming from the bone pit. |
| landmark-forge | gorge | A 4-squad raid comes up from the narrows on Gyges, chained at the anvil of the forge. |
| landmark-hold | canyons | A 4-squad raid climbs from the mesa on the Chimera at the Obsidian Hold. |
| landmark-watchtower | siren | A 4-squad raid crosses the tidal flats to Scylla's sea cave below the Rim Watchtower. |
| landmark-temple | omphalos | A 5-squad raid comes out of the ruined temple streets into the arena, where the Titan hurls boulders. |
| **Civilians** (3) | | |
| village |  | A claimed camp at work: cooks, a smith, merchants and a physician at the camp, engineers raise a storehouse, foragers fell wood. |
| civ-household |  | A camp with a forge and a cookhouse. |
| civ-flee |  | The household is at work when bandits come out of the woods to the south; no guard this time. |
| **Fog & vision** (2) | | |
| fog-team2 |  | You are team 2 (gold). |
| fog-high-ground |  | An enemy archer squad waits on the ridge crest above your scouts. |
| **Limits** (2) | | |
| limit-army |  | Your whole army, 12 men, stands in one squad, with two cooks of the household beside it. |
| limit-entry | dodona-e | Your squad has just come in at the west entry of the Teeth Foothills and marches in; a bandit squad lurks near the entry. |
| **Clips & trailer** (6) | | |
| clip-caravan |  | A loaded wagon takes the east road from the camp past the trading post, hoplites and archers escorting it. |
| clip-build |  | Militia raise a palisade round their camp, timber by timber. |
| clip-battle |  | Two hosts of 252 clash on the ridge: one charges down from the crest, the other up from the foot. |
| trailer-elaia | elaia | Elaia at peace: hoplites meet at the well by a brazier, merchants at their stall, foragers fell, quarry and pick olives; a column waits on the ridge above. |
| trailer-elaia-raid | elaia | The column comes down through the olive terraces on the agora: swordsmen and javelineers attack-move, the foragers run; archers by a brazier loose fire arrows on a cottage. |
| trailer-hunt | kimmeria | Eight archers below the north-east ibex herd of the Kimmerian hills loose on it; the herd bolts. |

## Known gaps

- The live smoke covers only wiring (see above); the caravan, crafting, lairs, guardian, claims and siege are covered
  headless (tests/war, server/test/war) and by hand in the steps above. Lairs, guardians and claims of a live region are
  in its dev `/api/war/:region/stats` (`wild`): fog hides the beasts from the page.
- No squad transfers out with a foe within 20 tiles. A squad lingering at Kleisoura's court with a cart meets the
  bandits' cart raid outside the court (12 men don't fit in it; those outside are taken), and then cannot leave.
- Right after the start the home recruit pool is empty (the start's 12 militia took it; it refills 6 an hour).
- A crafted item lands in the maker's chest by the workplace; with no chest it rides in the maker's pack (the stash
  lists it under packs).
- Entering a region again with men at home brings them as a fresh squad beside the ones standing there; the dev
  roster is seeded only for a dev id with no one alive.
- The world map follows your roster every 5 s: men show in a region a few seconds after you enter it.
- Bots are passive: they stand at home and give the map other alliances' presence; nobody attacks you.
- Under software GL (headless, VMs) a region renders at 2-3 frames per second; play in a normal browser. Melee blows
  struck between rendered frames still sound.
