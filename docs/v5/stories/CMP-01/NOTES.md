# CMP-01: Field camp and War camp on the v5 chrome, notes

Spec: design/ux/screens-campaign.md C-5. Audit: docs/v5/audit/UI.md §9 (CMP-1..7), G7, G12, G13. Done while the user was asleep; the calls made are under Decisions.

## What changed

- **Chrome (AC1, G7, CMP-7).** The camp uses the World map's v5 shell: top bar (back, "Field camp" / "War camp", gear), the parchment situation line with the purse as chips, a zoom key, and a stone action strip. The dark chip band, the dark rail column, the dark muster bands and the red-on-dark muster header are gone.
- **Chips (P17, WLD-5).** Field camp: gold, men, food (days), supplies, the World's order. War camp: war gold, food, wood, bronze (recruits as before only from VW 200). In Telegram at 320x568 the War camp's chips take a second parchment strip so no number is cut.
- **Action strip (CMP-2, CMP-6).** Two rows of labelled buttons. Field: Strike, Muster, Loot over Build and End day. Strike keeps its label at 320, and it never sits next to End day. War camp: Muster, Loot, Rest over Buildings and Build/Upgrade. A parchment line over the strip says why the off buttons are off.
- **Build drawer (CMP-1, AC3).** It lists all five structures: name, supplies, time, built n/max, and why not (all built, needs n supplies, no room). A row starts the placement. The War camp's Buildings list shows the level, the next level's cost as icons and numbers, the time and why not. A row picks the building, and Build/Upgrade commits it.
- **Supplies for works (AC2, field-works R4).** The last drawer row, "Supplies and field works", opens a page. It shows the supplies on hand, says what supplies pay for (structures here, works when the battle starts, only the works placed, at most 3), and gives each work's cost and how many the supplies buy (`worksAllowance`). It also says where to buy more.
- **Muster (CMP-3, AC3).** Ink on parchment. A legend explains "marching / all (resting)". Each kind's name sits over its count, with bronze steppers (grey only when they can't act, with a reason). Every man appears in a Formation or Reserve column, and a tap moves him across.
- **Temper (CMP-4, AC3).** Each row shows the item, the rarity step in words, the owner, one cost line (supplies and gold icons) and a Temper button.
- **Placing (CMP-5).** The ghost is centred in view, with a check or cross glyph over it. Place is off with a reason where it can't go.
- **Strike confirm (AC3)** is unchanged: the kit's destructive confirm.
- **EV-03** is unchanged: the pending event's card opens over the camp at night and comes back until it's answered.
- **G12.** Structure names, reasons, the region and the hours are localized. New strings are in `camp.v5.en.ts` / `camp.v5.ru.ts`.

## Element map (E104-E122, N22, N65)

All rows are kept:

- E104 and E105: titles "Field camp" / "War camp". Day, hour and place, or kind and place, move into the situation line.
- E106: Back.
- E107 and E108: chips.
- E109 and E110: rail → Build drawer / Buildings list.
- E111: zoom key.
- E112 to E115: Muster, Loot, End day, Strike, all labelled.
- E116: Cancel / Place.
- E117: Muster, Loot, Rest, Build/Upgrade, Make camp, with reasons.
- E118: the info line is the situation sentence (the cost on its own row).
- E119 Temper, E120 Muster, E121 Strike confirm, E122 drag pan and tap.
- N22: the labelled drawer. N65: the zoom key.

## Decisions

1. **The two-line title.** The plaque holds one line, "Field camp" / "War camp". The second line goes first in the situation sentence ("Day 1, 10:00 · Forest." / "Home camp · {place}."), as WLD-01 did for the World map.
2. **Build is a labelled strip button,** not a rail icon. Building is the camp's core verb (CMP-1 major). The only map key is the zoom key.
3. **The War camp's narrow-screen sentence** keeps the effect and drops the cost when both don't fit. The Buildings list and the reason line still carry the cost.
4. **Supplies for works lives in the camp** as a page reached from the Build drawer. Supplies are bought in towns (SET-01's Services), and the page says so. No purchase button was added here, since that would be a new economy path.
5. **Wiring.** `en.ts` and `ru.ts` got one import and one spread each. Structure names reuse WLD-01's `wld.struct.*`, and the region reuses `wld.region.*`.
6. **Orphaned strings left in place.** Some `cs.*` keys in `campscene.*.ts` are no longer used (`cs.title`, `cs.day`, `cs.hint`, `cs.campLine`, `cs.placeHint`, `cs.formation`, `cs.inCamp`, `cs.menHint`, `cs.temperNone`, `cs.suppliesWord`, `cs.noRoom`, `cs.built`, `cs.zoom`, `cs.temper`, `cs.muster`, `cs.loot`). That file is not CMP-01's, so they stay for its owner or F-07.
7. **ChipRow** shrinks the number to 6.5 without passing the size to MChip (`SituationLine.ts`, not ours). The War camp avoids that path. It's flagged for the kit's owner.
8. **Skills** followed: ux-design, game-ui-ux, phaser-core, dev-story, story-done. The agents ui-programmer, ux-designer and accessibility-specialist were read and used as checklists. No sub-agents were used.

## Layout check

New fixtures: `camp-build`, `camp-supplies`, `camp-war-build`. The `camp-temper|text-size|*` allowlist entry is cleared.
