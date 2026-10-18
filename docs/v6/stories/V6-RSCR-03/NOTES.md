# V6-RSCR-03 notes: War and the online hub (landscape and tablet)

Spec: design/ux/landscape-v6.md §3.4, §3.5, §4, §8 (8.1–8.4), §15, §16.4. Decisions: V6-055, V6-058, V6-059, V6-062, V6-063, V6-064, V6-065, V6-066, V6-067, V6-068, V6-074, V6-078, V6-081, V6-083, V6-086.

## Real elements before any change (from the scene code, next to the spec's list)

Taken from `src/scenes/online/OnlineScene.ts`, `beastPanel.ts`, `OnlineArmyScene.ts`, `ClanScene.ts` and `MerchantScene.ts` at v6 52430fc8, before any change. "Spec" is the §8.1 checklist line the element answers. The four right-hand columns say where each element goes after this story; "v5" is compact portrait (390x844, 360x780, 320x693), unchanged. Nothing is removed: every element is present at every size, or one deliberate step away and registered with `uiCollapsed` (named in the row).

### War map (`OnlineScene`)

| Element (code) | uiId | Spec §8.1 | v5 | 844x390 (compact landscape) | 768x1024, 820x1180 (medium) | 1024–1920 (expanded) |
| --- | --- | --- | --- | --- | --- | --- |
| Frame, top bar: plaque "Pixelarrow", gear | `hub.topbar`, `hub.topbar.gear` | ScreenFrame, TopBar | framed page | top bar strip over the map, right of the nav rail | framed page | top bar strip over the map, right of the nav rail |
| Mode navigation (five modes, War lit) | `tab.campaign`, `tab.duels`, `tab.war`, `tab.codex`, `tab.shop` | TabBar | tab bar | nav rail, 84 (RSCR-01) | tab bar | nav rail, 72 |
| Situation sentence (1–3 lines, never cut), its long-press zone when longer | `online.situation` | situation strip | strip, `SIT_H` 28 | top-left card, one line (whole sentence on tap when cut) | strip, as v5 | top-left card ≤ 320, up to two lines |
| Collect (only while income waits; secondary while a hex is selected) | `online.bar.collect` | Collect | right end of the strip | right end of the card's sentence row | as v5 | as 844x390 |
| Chips: war gold, food, wood, bronze, recruits, energy (tap: the exact number) | `online.chip.wargold`, `.food`, `.wood`, `.bronze`, `.people`, `.bolt` | chip grid | grid, 1–2 rows | the card's chip row, one row of 6 (two rows of 3 when narrower) | one row of 6 | one row of 6 |
| Map window with its carved edge | — | map window | in the frame | **full bleed** right of the nav rail, under the top bar | window, taller | **full bleed** |
| Hex map: regions, place labels, the party marker, routes, live armies, boss bars, camp plots | — (world objects) | hex map | yes | yes | yes | yes |
| March bar (while marching): clock, countdown, Halt | `online.halt` | march bar | under the top of the window | bottom-centre over the map | as v5 | bottom-centre over the map |
| Key rail: Army, Clan, Lobby (badge: players online), Centre, Zoom (lit when zoomed in) | `online.bar.army`, `online.bar.clan`, `online.bar.duels`, `online.centre`, `online.zoom` | key rail | right edge of the window; **hid entirely when it did not fit** (UI.md §3.10) | right edge, full height, keys 30 tall, **always shown** | right edge | right edge, full height, keys 44 tall, labels under icons |
| Hex panel: title (place · tier), close X | `online.panel`, `online.panel.close` | hex panel | bottom panel | **inspector side panel**, right, 220 wide, left of the key rail; no shade, the map stays live | bottom panel, ≤ 360 | **inspector side panel**, 280 (240 at 1024) |
| Hex panel lines: owner (or home, under attack), scouting…, per-hour yields with icons, defenders, siege waves with a meter, boss status, lair returns, garrison, waiting income, post kind; one tap zone with the whole text | `online.hexInfo` | owner, yields | as many lines as fit (**the rest dropped** on short screens, UI.md §3.10) | all lines; the panel's body scrolls instead | as v5 | all lines; scrolls |
| Hex actions, in fixed places: Merchant, Camp, Beast, Codex (when it costs no row), March (with ETA), Attack, Collect, Garrison; disabled ones say why | `online.act.merchant`, `.camp`, `.beast`, `.codex`, `.march`, `.attack`, `.collect`, `.garrison` | action rows | packed rows | packed rows at the panel's foot | packed rows | packed rows at the panel's foot |
| State card: loading, "Online unavailable" with Retry (or where the war runs), Join the season | `online.retry`, `online.join` | server-down card | parchment card over the content | card in the map's pane over the stone map backdrop (§15) | card over the content | card in the map's pane over the stone backdrop |
| AU-01 sign-in card (web without a session) | `auth.gate.create`, `auth.gate.login` | "Sign in to play online" | in the content | in the map's pane | in the content | in the map's pane |
| Result sheet: tiles (slain, gold, loot or wounded), lines, Close | `online.result`, `online.result.slain`, `.gold`, `.loot`, `.wounded`, `online.result.close` | result sheet | centred sheet | right side panel | centred sheet | right side panel |
| Duel lobby: players with crests, Challenge / Cancel / Busy, the note, X | `online.lobby`, `online.lobby.<id>`, `online.lobby.close` | lobby | centred sheet | right side panel | centred sheet | right side panel |
| Challenge (duelInvites.ts): Decline, Fight | `duel.challenge`, `duel.challenge.decline`, `.fight` | challenge | centred sheet | centred dialog (a decision) | dialog | dialog |
| Beast sheet (lair or world boss): beast, level, HP and the damage table, clans, lines, Codex, Attack / Raid with its reason | `online.beast`, `beast.codex`, `beast.action`, `online.beast.close` | beast sheet | bottom sheet, `VW - 8` | right side panel, laid out at the panel's width | bottom sheet ≤ 320 | right side panel |
| Join card (season join) | `online.join` | join | card | card in the map's pane | card | card in the map's pane |
| Camp (opens the Camp scene, RSCR-07) | — | camp | scene | scene | scene | scene |
| Coach bubbles (home, neighbour, defenders, march, attack, collect, clan) with Next | `coach.bubble`, `coach.next` | coach bubbles | yes | yes, pointing at the moved anchors | yes | yes |
| Toasts, the first-visit hint | — | — | yes | yes | yes | yes |
| Gestures: drag pan, pinch, wheel zoom at the cursor (V6-058), middle-drag pan, tap a region; keys Centre and Zoom | — | — | yes | yes | yes | yes |

### Online Army (`OnlineArmyScene`)

| Element (code) | uiId | v5 | 844x390 | medium | expanded |
| --- | --- | --- | --- | --- | --- |
| Sub shell: back, plaque "War army" or "Garrison", gear | `oarmy.topbar` | yes | yes | yes | yes |
| Purse chips: war gold, food, energy | `oarmy.chip.wargold`, `.food`, `.bolt` | page top | master pane, top | master pane, top | master pane, top |
| The selected hero's card (groups, slots, bust, status pill) | `slot:*`, group keys | page, under the chips | detail pane (right) | detail pane | detail pane |
| Its one-line collapsed header (scrolled) | `army.mini` (the template's) | yes | collapsed into the card's first slot (the card is a fixed pane) | collapsed | collapsed |
| Garrison head (hint, stationed count) | `oarmy.stationed` | page | detail pane | detail pane | detail pane |
| Roster \| Stash switch | `oarmy.tab` | page | master pane | master pane | master pane |
| Roster rows / garrison picks | `oroster:<i>` | rows | master pane rows | rows | rows |
| Stash grid (drag onto the card's slots) | stash ids | grid | master pane grid | grid | grid |
| Footer: Recruit (primary), Market, Shop; garrison mode Station | `oarmy.footer`, `oarmy.recruit`, `oarmy.market`, `oarmy.shop`, `oarmy.station` | across the bottom | under the card in the detail pane | under the card | under the card |
| Recruit sheet: price, purse, class rows with Hire | `oarmy.recruitSheet`, `oarmy.hire`, `recruit.card` | sheet | right side panel | bottom ≤ 320 | right side panel |
| Hire undo bar | `oarmy.hireBar`, `oarmy.hireUndo` | over the footer | over the footer, in the detail pane | over the footer | over the footer |
| Item and class cards | `stash.*`, `oarmy.sell`, `oarmy.salvage` | sheets | side panels (kit) | sheets | side panels |
| API-down state (`online-army-closed`), AU-01 card | `econ`, `auth.gate.*` | card | card centred in the content | card | card |

### Clan (`ClanScene`)

| Element (code) | uiId | v5 | 844x390 | medium | expanded |
| --- | --- | --- | --- | --- | --- |
| Sub shell: back, plaque "Clan", gear | `sub.topbar` | yes | yes | yes | yes |
| No clan: the war fresco, title, lead, three bullets, hint, Found a clan | `clan.found` | one card | one card, art left of the text | one card, art left of the text | one card, art left of the text |
| Clan banner: crest, [TAG] name, men, land, rank; Leave | `clan.leave` | card | left pane, top | left pane, top | left pane, top |
| Members: name, land, rank chip, chevron when manageable | `clan.member.<id>` | list | left pane, scrolls | left pane | left pane |
| Invite (primary) and why it is off | `clan.invite` | foot | right pane (management) | right pane | right pane |
| Manage a member: name, rank · land, Officer / Demote / Lead, Kick (confirms) | `clan.manage`, `clan.manage.close`, `clan.kick` | sheet | right pane, the chosen member (the sheet's X collapsed into the member's row) | right pane | right pane |
| Invite link sheet, join offer, leave confirm, lead and kick confirms | `clan.link`, `clan.share`, `clan.join.*`, `confirm.*` | sheets | side panel / centred dialogs | sheets / dialogs | side panel / dialogs |
| Loading, API-down state, AU-01 card | `auth.gate.*` | card | card | card | card |

### Merchant (`MerchantScene`)

| Element (code) | uiId | v5 | 844x390 | medium | expanded |
| --- | --- | --- | --- | --- | --- |
| Sub shell: back, plaque "Town market" or "Trading post", gear | `merchant.header` | yes | yes | yes | yes |
| Gold and Drachmae chips | `merchant.gold`, `merchant.drachmae` | top row | left pane, top | top row | left pane, top |
| Info parchment: kind and region, in reach or not, holder terms, reset time | — | page | left pane | page | left pane |
| Section titles: base, region, rare | — | page | right pane (offers) | grid | right pane |
| Offer cards: icon (gear opens its card), name, today's count, description, struck list price, Gold / Drachmae buy with the reason when off, the daily-cap line | `merchant.buy.<id>.gold`, `.drachmae` | rows | right pane, a grid by width | grid, 2 columns | grid, 3 columns |
| Buy confirm; item card | `confirm.*`, `merchant.cardClose` | sheets | dialog; side panel | dialog; sheet | dialog; side panel |
| Loading, API-down state, AU-01 card | `auth.gate.*` | card | card | card | card |

## What changed, per screen

- **War map** (`OnlineScene`, `warHud.ts`): `responsive = true`. Compact portrait and medium keep the v5 hub (the framed window, the strip, the chip grid, the key rail at the window's right edge, the bottom hex panel). Compact landscape and expanded (`buildHudWide`, laid out by the pure `warHudLayout`): the map full bleed right of the nav rail under a stone top-bar strip; the situation card top-left (≤ 280 / 320: the sentence, Collect, the six chips in one row); the key rail down the right edge, full height, **never hidden** (keys 30 tall at 844x390, 44 with labels under the icons at expanded); the march bar bottom-centre; the hex panel an **inspector** side panel left of the rail (220 compact, 240/280 expanded), no shade, the map stays live, its lines scroll instead of being dropped. What an open panel leaves no room for (the card, the march bar) folds under it, registered `uiCollapsed` into `online.panel.close`.
  - Camera (§8.3): the framing rect is the map minus the card, the rail, the march bar and an open panel; a selected hex under the panel eases into it (200 ms, a cut under Reduce motion) and a visible one never moves the camera (`intoFraming`); Centre centres the party in the framing rect; the zoom floor comes from the framing rect and S (`framedZoomLimits`); the clamp keeps the framing rect over the map (`clampToFraming`). Unit tests: tests/warHud.test.ts.
  - Keyboard (§3.4, §4): the inspector is a nav layer **without a focus scope** (`BottomPanel` `inspector: true`): Esc closes it first, Tab is not trapped in it. Tab reads the top bar and the card, then the march bar, the panel and the key rail as panes (before this the rail's group stop interleaved with the chips and Tab looped over half the HUD), the nav rail last.
  - v5 hub: where a tall hex panel covers the strip, the chips or the rail on a short phone (320x693 Telegram), they are registered collapsed into the panel's close key (v5 behaviour, now declared to element parity).
  - Toasts drop below the landscape card (it is named as a top bar for `toastRoom`) instead of over its sentence.
- **Online Army** (`OnlineArmyScene`): master–detail as the Army (§10) outside compact portrait: purse chips, Roster | Stash and the rows or the stash grid in the master pane; the hero card (or the garrison head) and the footer (Recruit, Market, Shop; Station) in the detail pane, centred in its height when they fit. Station keeps a button's width (≤ 240) in two panes. In two panes the card's niche opens the class card (`oarmy.class`), as the recruit sheet's figures do. The API-down state is one band across the content (title, hint, Retry at the right end, §15).
- **Clan** (`ClanScene`): two panes outside compact portrait: banner and members left, the chosen member's management (name, rank, Officer / Demote / Lead, Kick set apart) and Invite right; the v5 manage sheet and its X are collapsed into the member's row. The no-clan card spans the content (art left, the words centred in their column, Found under them). In Telegram's short landscape the words, and the member's actions, scroll above Found and Invite (they overflowed onto the buttons).
- **Merchant** (`MerchantScene`): two panes in landscape: chips and the info parchment left (as one group centred in the pane's height), offers right; medium: a 2-column grid under the info card. Expanded's 3-column grid flows as **one grid with a title tile opening each section** (base, region, rare) instead of full-width section rows: with full rows a short section left the last column empty down the pane at the scroll end (empty-column). 2-column and v5 layouts keep the section rows.
- **Shared, additive**: `addParchmentEmpty({ row: true })` and `addEconState(..., rowW)` (an empty state as one band; used by Online Army, Clan and Merchant outside compact portrait), `BottomPanel` `inspector`. No other caller changes.

## Deviations (recorded)

- §8.2 says the key rail never hides. In the **v5** hub (compact portrait, medium) a hex panel taller than the window still covers the rail on the shortest phone (320x693 Telegram); the keys are registered collapsed into the panel's close key instead of shrinking the panel, because compact portrait must stay v5 (§16.9). In landscape the rail is always shown.
- Merchant at expanded: section title tiles in the grid instead of full-width section titles (above).
- Online Army: the niche opening the class card is new in two panes (the detail pane otherwise had no control in the niche's column: empty-column in Telegram's short landscape).

## Element parity (after)

Every element in the inventory above is present at every matrix size, or one deliberate step away and registered `uiCollapsed` (the `element-parity` gate: 0 findings over 28 configs × 39 screens):

| Screen | Elements at 390x844 | Missing anywhere | Registered collapsed (into) |
| --- | --- | --- | --- |
| War map (map, hex states, march, lobby, challenge, result, join, lair, boss, market, post, camp, coach) | all of §8.1 | none | landscape: the card's sentence, Collect and chips, and Halt, under an open inspector that leaves them no room (`online.panel.close`); v5 hub on 320x693 Telegram: the strip, the chips and the five rail keys under a tall hex panel (`online.panel.close`) |
| Online Army (roster, stash, recruit, garrison, API-down) | all | none | `army.mini` into `slot:helmet` (the card is a fixed pane) |
| Clan (clan, manage, leave, no clan) | all | none | `clan.manage`, `clan.manage.close` into the chosen `clan.member.<id>` row |
| Merchant (town, post, buy, item) | all | none | none |

New ids outside compact portrait (none removed): `online.card.top` (the landscape card, named so toasts avoid it), `oarmy.class` (the niche's class card).

## Verification

- **tsc** clean; **vitest** 172 files, 2111 tests pass (one World test, tests/qafixWorld.test.ts S4, timed out once at 30 s while the regression suite ran beside it on a machine at load ~27, and passes alone: 14/14); **vite build** ok.
- **Layout**, `--scenes 'online*,merchant*'` (the 39 War, Online Army, Clan and Merchant screens, coach bubbles included), all 10 sizes, en and ru, plain and Telegram (28 configs, 1092 screen visits): **0 failed, 0 new, 0 pending**, LAYOUT CHECK PASSED. V6-RSCR-03.json is deleted. The 25 `online-coach-*` entries of V6-RSCR-08.json were reported "fixed but still allowlisted" (0 at 844x390 in all four configs, run alone too) and are removed from that file.
- **Portrait check** (390x844, 360x780, 320x693; en, ru; plain, Telegram; 39 screens: 468 screens), this branch against v6 500a5c6d, both staged by the same driver: every UI element's id, kind and rect from the layout registry is **identical on 466 of 468**; the 2 are `online-camp` (the Camp scene, RSCR-07's, untouched here) where the reason line "Rest in #h #m" is 10 px narrower, i.e. the clock's digits. Raw pixels differ on most War shots (live armies, the clock, the map's animation, toasts), as V6-074 found for World and Camp, so element parity is the portrait gate here.
- **War map, mouse and keyboard at 1280x800, touch at 768x1024** (scripted, demo shard, 15/15):
  - expanded HUD built; Army, Clan, Lobby, Centre, Zoom on the rail;
  - wheel zooms at the cursor (2 → 3), the point under the cursor drifts 0.31 map px; drag pans; hovering a rail key shows `pointer`;
  - a click selects a hex and opens the inspector (280 wide, left of the rail); the hex then sits inside the framing rect, clear of the panel;
  - Tab order: gear → the six chips → panel close → hex lines → March, Collect, Garrison → the key rail (one stop) → the nav rail → gear (before the fix it looped over the panel only, then over half the HUD);
  - Esc closes the inspector first; Tab to the rail, Down ×4 reaches Zoom, Enter zooms (3 → 4);
  - 768x1024 touch: the v5 window with its rail; a tap selects a hex and opens the bottom panel; no focus ring and no cursor.
- **online-e2e** (local Worker on :6120, dev-auth client on :6112): ALL PASS (join, attack verified, recruit, clan founded and joined by invite link, live duel 44/44 lockstep, no page errors).
- **Regression** `run.mjs --all`, both platform modes: see below.

## Key screenshots (docs/v6/shots/V6-RSCR-03/, JPEG q82)

1280x800-war-hex-inspector, tg-844x390-war-march-rail, ru-844x390-war-town-inspector, 1920x1080-war-server-down, 768x1024-war-medium-panel, 1280x800-war-keyboard-focus, 1280x800-online-army, 1280x800-online-army-api-down, ru-1280x800-clan, 1440x900-merchant-grid-end. The full sets (28 configs) were opened and checked in shots/layout/ (not committed).
