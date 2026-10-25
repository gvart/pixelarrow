# War playtest (local)

```bash
npm run play:war            # migrate local D1, start wrangler dev (DEV_AUTH=1) + vite, seed, print URLs
npm run play:war -- --reset # wipe local state first: a fresh world, season and roster
npm run play:war -- --bots  # + 3 bot players (Skythia, Kyrene, Elaia), 12 militia each standing at home
npm run play:war -- --fast  # world travel x0.05 (WAR_TRAVEL_SCALE, dev only): transits take seconds
node scripts/war/play-smoke.mjs   # headless run of the whole loop below (servers up with --reset --fast; ~15 min)
```

The smoke drives one page as dev player 1 and a raw socket as a second dev player (Skythia, the buyer and the
palisade's owner). It runs in Playwright's bundled Chromium in the new headless mode (`channel: 'chromium'`; `--chrome`
for the system Chrome). The old headless shell (Playwright's default) runs the page far too slowly under software GL
to start a region.

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

## Dev panel (F1)

Region and scenario pickers, place a squad of any class and team (click the map), +4 bot squads at the cursor,
600 brawl, pause and speed (0.5-4x), skip 1 min, walls cut-away (V), **+500 resources**, **claim here**, tile grid,
fog off, the fight score and perf. In a live region squads, resources, claim and skip go to the region server as dev
messages (refused unless it runs with DEV_AUTH=1, as `play:war` does); pause and speed do nothing there. The world map
has no dev panel; `npm run play:war -- --reset` gives a fresh world.

## Sandbox scenarios (offline, `sandbox.html?scenario=<id>`)

| id | one line |
| --- | --- |
| free | empty test-ridge: place squads and bots from the panel |
| pass-ambush | hold the switchback pass against an enemy column |
| ford-crossing | force the ford against the far bank |
| hill-assault | take the plateau: storm the ramp or flank |
| bridge-vs-ford | two enemy columns, bridge and ford: pick where to block |
| brawl-600 | 300 v 300 across the ford |
| build-test | militia raise a camp, gather, place buildings and walls |
| wall-defense | hold the walled camp against ladders |
| siege | take the stone fort: ram, ladder, stone thrower, fire |
| siege-defend | hold the fort against ram, ladders and fire arrows |
| bridge-test | cross the river over bridges or build your own |
| neutral-clear | kill the lair round the banner, then claim it |
| village | a claimed camp at work; a wolf pack raids |
| crafting | forge, cookhouse, infirmary: queue an item, watch the odds |
| market | rent a stall, offers, buy orders, contracts, hand-off |
| loot | pick up loot, salvage, capture a foe handcart |
| caravan | escort a loaded wagon through an ambush |
| landmark-citadel | 4-squad raid on Drakon's Citadel (Krios) |
| landmark-deadcity | storm the Dead City against the Bandit King (Ammon) |

## Known gaps

- The smoke loop passes from the world map through the caravan's arrival in Kleisoura (gather, camp, storehouse,
  recruit / train, a sword forged into a chest, a handcart made, loaded, crewed and hauled over two borders). The cart
  rolls into the market court, wood is stowed into a rented stall and a sell offer listed. The buyer carries 60 coin
  from his strongroom in his men's packs (skythia -> skythia-w -> kleisoura), stows it into his warehouse and fills the
  offer. Then kleisoura -> dodona-e -> moors: the bear lair and the moors' guardian (the Great Bear, which keeps every
  claim point shut) raided, claim point 2 claimed, a ram built and crewed against the buyer's palisade gate, and a
  last transfer out. Lairs, guardians and claims are read from the region's dev `/api/war/:region/stats` (`wild`):
  fog hides the beasts from the page.
- No squad transfers out with a foe within 20 tiles. A squad lingering at Kleisoura's court with a cart meets the
  bandits' cart raid outside the court (12 men don't fit in it; those outside are taken), and then cannot leave: the
  smoke's seller hauls on right after listing his offer.
- The smoke's buyer socket sends its own `cf-connecting-ip`: accounts seen on one address are linked and may not
  trade (M6i).
- Right after the start the home recruit pool is empty (the start's 12 militia took it; it refills 6 an hour).
- A crafted item lands in the maker's chest by the workplace; with no chest it rides in the maker's pack (the stash
  lists it under packs).
- Entering a region again with men at home brings them as a fresh squad beside the ones standing there; the dev
  roster is seeded only for a dev id with no one alive.
- The world map follows your roster every 5 s: men show in a region a few seconds after you enter it.
- Bots are passive: they stand at home and give the map other alliances' presence; nobody attacks you.
- Under software GL (headless, VMs) a region renders at 2-3 frames per second; play in a normal browser. Melee blows
  struck between rendered frames still sound.
