# WAR-01: the War hub and the War army, notes

Spec: [screens-modes.md](../../../../design/ux/screens-modes.md) M-8, M-9. Audit: UI.md §17-18 (WAR-1..WAR-10, OAR-1..OAR-5), PLAY.md C8. Done while the user was asleep; the calls made are under Decisions.

## What changed

- **War army on the Army template (AC1, M-9).** `OnlineArmyScene` uses `src/ui/army` with a war `ArmySource` (`warArmySource`): the hero card (niche, bust, groups on their own row, slots), the collapsing one-line header, the template's roster rows, one page scroll. Renamed "War army". Chips war gold, food (wheat, OAR-3), energy, compact numbers. A hero on a hex or in battle wears a teal or bronze pill, a wound the red one (OAR-4). Garrison mode (Station) keeps its head and pick rows; `!== null` everywhere (OAR-5, hex 0).
- **Footer (OAR-2, C8).** Recruit, Market, Shop at one label size (widths follow the labels); the empty Map button is gone (Back exists). The buttons never swap.
- **Recruit undo (N21).** Hire shows "X hired · Undo" for 4 s; nothing is sent or spent until the window ends or the screen closes.
- **War hub rail (WAR-2).** Army, Clan, Lobby (badge), Centre and Zoom are labelled keys on a stone rail (Inter at 6.5, never cut). Short windows: icon-only keys (labels as long-press, V5-068), then one row; a full-height hex panel hides it until it closes. Zoom key cycles overview / normal / close (WCAG 2.5.1).
- **Collect in the situation strip (WAR-4).** Only while income waits; never over the map or a plate.
- **Hex panel (C8).** Actions in one fixed order (March, Attack, Collect, Garrison); March stays, disabled "Your army is here", after a march. "Codex" on lair and boss hexes when it costs no extra row; March drops its time (kept in the tip) when that saves a row.
- **States (WAR-5, D12).** Loading, unavailable and join fill the whole content (no empty band). Unavailable has Retry; outside Telegram it says where the war runs. Join is the only button; the tab bar is the exit. Back on the hub closes a sheet, then the selection, and never leaves for the Campaign hub (the old Menu branch is gone).
- **Beast sheet (WAR-7).** A docked kit sheet: thumb, kind and level, HP and arms; the top damage as a table with clan chips; clans, your damage, chest, segment; lair: when it returns and what beats it. The reason sits under a disabled Raid it / Attack. "Codex" switches to the Codex tab with the beast's sheet (ia.md L4).
- **Results tiles (WAR-9).** The attack result opens with Slain, Gold and Loot/Wounded tiles (each tile's (i) gives the sentence), then the lines.
- **Lobby (WAR-8).** Each player has a crest (a shield in his land's colour with his initial); the X closes it (no footer Close, G5).
- **Map (WAR-2, WAR-3, G13).** Region plates in ink on the parchment; your land and your clan's carry a small shield crest; the unexplored margin is toned.
- **Coach (WAR-6).** The card is placed opposite the rail; for a rail key it sits beside the rail, the arrow pointing right. Rail keys are found by id.
- **Text size (V5-060).** `online-army`, `online-army-stash`, `online-army-recruit` text-size entries cleared.

## Element map (ELEMENT_MAP §1.17, §1.18)

All rows present. E249-E269: kept (E251 changed, see decision 1; E256-E259 moved to the rail, E260 to the strip, E269 Back stays on the hub). E270 (`campPanel.ts` dead code) is unchanged: only `demoCampSource`/`liveCampSource` are still imported. E271-E282: kept; E280 removed as mapped. `tests/war01.test.ts` checks the ids and handlers.

## Decisions

1. **No "Open in Telegram" button.** The client knows no bot link (the bot name is server-side only), so a button would go nowhere. Outside Telegram the card says the war runs in Telegram, as the Duels hub does; offline states get Retry.
2. **Lobby level not shown.** Presence (`PresencePlayer`) carries no level; adding one is a protocol change outside WAR-01. The crest is shown.
3. **Rail label "Centre"** for the old "Region map" key (it centres on your army; "Карта региона" does not fit a rail key at 6.5). The tip is unchanged.
4. **"Codex" without "›":** the Cinzel face has no ›; the sheet button carries the Codex paw instead.
5. **How it fights lives in the Codex** (ia.md L4); the War sheet keeps what beats a lair, the raid table and the action.
6. **War heroes show no points badge:** there is no sheet to spend them from the War army.
7. **i18n:** `src/i18n/war.v5.{en,ru}.ts`, one import and one spread each in en.ts/ru.ts (as WAR-02, ARM-01).
8. **The hex panel keeps 12 px under the top bar** so its X stays 4 pt from the gear at Telegram 320x568.

## Follow-ups (other owners)

| Item | Owner |
| --- | --- |
| War camp Loot should open `OnlineArmy` with `back: { scene: 'Camp', data }` (the War army supports it now; HUB-01 gap) | CMP-01 / camp owner |
| A bot link on the client for "Open in Telegram" (N32) | platform |
| Player level in presence for the lobby | server / protocol |
| `campPanel.ts` dead `openCampPanel` (WAR-10) | cleanup |

## Shots

`before-*` (v5 at 3f82725) and `after-*` (this branch), production build, DPR 2: the war map (en 390), a hex panel (ru 320), the War army (en 360), the boss sheet (ru 320). The full set (map, hex panel, War army, beast sheet, lobby, result, garrison, recruit, march, lair) at 390x844, 360x780 and 320x640 in en and ru was looked at during the work.

## Gates (2026-10-11, production build via `vite preview`)

- `npx tsc --noEmit`: clean. `npx vite build`: OK.
- `npx vitest run`: 103 files, 1293 tests passed (`tests/war01.test.ts`: 17 new).
- `node scripts/layout-check.mjs --no-shots`: full run 24 configs x 170 screens, 0 new outside the War screens; the 31 War screens (hub, panels, sheets, army, coach) re-run at all 24 configs after the last fixes: 0 violations. `online-army`, `online-army-stash`, `online-army-recruit` text-size entries cleared.
- `node scripts/online-smoke.mjs`: ALL PASS (25). `node scripts/smoke.mjs`: ALL PASS. `node scripts/tutorial-smoke.mjs`: coach marks PASS.
- `node scripts/online-e2e.mjs` (wrangler dev on :8811 with DEV_AUTH, local D1, vite dev with API_PROXY): ALL PASS (34/34), recruit through the undo window included.
