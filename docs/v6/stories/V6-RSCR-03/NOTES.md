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
