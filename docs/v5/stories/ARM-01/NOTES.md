# ARM-01: the Army template and the campaign Army screen, notes

Spec: [screens-campaign.md](../../../../design/ux/screens-campaign.md) C-7, screen-flow S07, interaction patterns P4, P11, P18, P21. Audit: UI.md §11 ARM-1..ARM-8.

## What changed

- **The template (AC1).** `src/ui/army/`: `ArmySource` (campaign source `campaignArmy`; the duel team and the war army implement it in DUE-01 and WAR-01), the hero card, its one-line collapsed form, the roster row, the group disc, the footer, the option sheet, `SLOT_ORDER`, `armyBack`. `ArmyScene` is the campaign screen on it.
- **Back (AC2, ARM-1, N3).** The footer "Map/Town/Camp" button is gone. Back (top bar or Telegram) goes to the origin through `resolveBack('Army', …)` (BACK_RULES `origin`, fallback World), with the town id or the field-camp mode. Item card, compare, sell/scrap/repair/equip/take off and the dismiss confirm are unchanged.
- **Busts (AC3, V5-045).** The selected man's class bust is a 20 UI px medallion in the niche's stone corner; the niche figure stays the integer-scaled pixel Stage, and every row keeps the man's own portrait. Promoted after an in-game preview: hoplite, militia, slinger, peltast (ASSET_LOG › AS-02).
- **Audit fixes.** One page scroll with the card collapsing to a one-line header (P21, ARM-3); full class names, Lv moving under them when both do not fit (ARM-4); group discs in the four group colours with numerals, count badges instead of "!" (ARM-2, G3, G11, P18); Dismiss bronze, 24 pt from Sheet (ARM-7, P4); unselected group, filter and sort buttons bronze, the selected group lit with a check (G2, G13); filter and sort open option sheets (ELEMENT_MAP E146, E147).
- **New states.** Pick mode (`{ pick: 'retrain' }`, N18): "Retrain whom?", roster only, one tap opens Hero › Perks with `retrain: true`. Empty army: "No men left. Volunteers wait in {nearest town}."
- **Text size (V5-060).** All Army text is 6.5 UI px or more; `army|text-size|*` and `army-stash|text-size|*` are removed from the allowlist.

## Element map (ELEMENT_MAP §1.11)

E139-E153 and E155-E156 are all present (`tests/armyTemplate.test.ts` checks their ids and actions). E154 (footer back) is removed as the map says (N3, D8). E143's group name, hidden at 320 before, now goes under the buttons when it does not fit beside them.

## Decisions (the user was asleep)

1. **Busts only in the hero card.** It is the one place the Army names a class apart from a man. Rows keep each man's face (V5-045); a bust beside a portrait would be two faces per row.
2. **One page scroll + a sticky one-line header** rather than a fixed card that shrinks: no rebuild under a dragging finger. The layout check's viewport for the page shrinks under the header (a clip proxy), so rows under it are not counted.
3. **Slot order** helmet, armour, trinket, weapon, shield (Hero's left column, then right), exported as `SLOT_ORDER` for HERO-01.
4. **Roster tab badge only on the Stash tab** (on the Roster tab the rows carry the counts: one badge per destination).
5. **i18n registered in en.ts/ru.ts** (one import and one spread each), the way every namespace is; the "index.ts" line in STORIES Conventions does not match how tables are built.
6. **Four new layout fixtures** (army-full, army-wounded, army-pick, army-empty) so each promoted bust is seen in the game; each puts the staged army back when the Army closes.
7. **smoke.mjs**: the step that tapped the removed "Town" footer button now taps the top-bar back. Not ARM-01's file, but the step tested a removed control.

## Follow-ups for other owners

| Item | Owner |
| --- | --- |
| Stash filter labels "Any rarity" / "By rarity" read alike; "Sort: rarity" and the rarity gem (ARM-5) live in `MStashGrid` | F-kit / mosaic owner |
| Item card verdict line and the warn Equip (ARM-6) live in `openItemCard` (`src/ui/sheet.ts`) | HERO-01 / sheet owner |
| Hero should adopt `SLOT_ORDER` and read `retrain: true` from Army pick mode | HERO-01 |
| The Drillmaster opens `Army { from: 'Settlement', id, pick: 'retrain' }` | SET-01 |
| 17 busts stay staged until a screen shows their class | recruit / Codex stories |

## Shots

`docs/v5/shots/ARM-01/`: before and after at 390 (8 men), 320 ru (full roster), 360 (empty slots), and 360 ru scrolled (the collapsed header). Bust contact sheets were read in `docs/v5/art/staging/preview/` (ignored).
