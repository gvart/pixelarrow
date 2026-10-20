# War playtest (local)

```bash
npm run play:war            # migrate local D1, start wrangler dev (DEV_AUTH=1) + vite, seed, print URLs
npm run play:war -- --reset # wipe local state first: a fresh world, season and roster
npm run play:war -- --bots  # + 3 bot players (Skythia, Kyrene, Elaia), 12 militia each standing at home
node scripts/war/play-smoke.mjs   # headless check of the loop below (servers running; system Chrome)
```

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

- Entering a region again with fewer than 12 fit men at home makes the client seed the **dev roster** (veterans,
  archers, 500 coin; src/war/net/client.ts), or refuses the join when your men are all in the field. `--reset` restores
  the design start.
- The world map follows your roster every 5 s: men show in a region a few seconds after you enter it.
- Bots are passive: they stand at home and give the map other alliances' presence; nobody attacks you.
- Under software GL (headless, VMs) a region renders at 2-3 frames per second; play in a normal browser.
