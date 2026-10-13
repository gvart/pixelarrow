# RD-01: morale glyph, badges and the group card readout

design/gdd/battle-readability.md R1-R3, F2. Screenshots here come from real touch play: Fight, Charge, card taps and the Pause/Play toggle, at 390x844 and 360x780, in en and ru.

## What shipped

- **`groupState()`** (`src/ui/battleHud.ts`, pure) follows F2. It returns routing on the `routed` flag or the army's break, and wavering when at least ceil(n/3) of the men still standing are below 50% morale. Beasts and empty groups get null. **`groupReadout()`** adds the Standard, the captain crest, disordered, and "Flanked!" for 2 s after `lastFlankEvent`. Tests are in `tests/groupState.test.ts`.
- **Cards** (`src/ui/battlePanel.ts`):
  - The numeral plate sits on the portrait's corner, with the morale glyph beside the name.
  - All card text is 6.5 UI px. It was 5.5-5.6 before (A11Y-09).
  - "Flanked!" shows in the alert ink on the state line.
  - The bars are 5 px tall and run across the card's foot. They are labelled HP / MOR (ЗДР / ДУХ) for the first 3 battles, then H / M (З / Д).
  - The Standard marker sits in the top right, beside the focus reticle.
  - A long-press legend explains the glyph, the bars and the Standard.
  - The 320-wide card (75 UI px) now uses the same layout (threshold 80 → 70).
- **Field badges**:
  - Every group has a badge. Ours are bronze with the numeral and glyph, and stay tappable. The enemy's are dark stone with the glyph only, and are not tap targets.
  - Markers: the captain crest, the Standard, the disordered ragged line, and a reticle on the group our missiles focus on.
  - Badges fade to 60% at 2x zoom or more. The wavering glyph pulses at 1 Hz, and is static under Reduce motion.
- **Glyphs** (`src/art/vectorIcons.ts`, all code-drawn per V5-066): `marker_crest`, `marker_standard` and `marker_disordered`, added to `VECTOR_GLYPHS` (no atlas frame).

## Decisions

1. **BattleScene changes are hook-only.** The readout is spread into `setInfo`, and `updateTags` builds badges through `fieldBadge()` and `groupReadout()`.
2. **Glyph size is 9 UI px (18 pt), above the GDD's 10-12 pt.** At 5-6 UI px the crack in the shield did not read on a phone.
3. **Tints:** steady keeps the glyph's own cream with an ink outline; wavering is amber 0xf0a830; routing is red 0xf05a40. Both reach 3:1 or more on stone (tested).
4. **The bar-label count is per battle-screen run, stored in localStorage** (`pixelarrow:barLabelSeen`). It's a per-player convenience, not save data.
5. **The 16x44 field banner sprite (V5-066) is not in this story.** The field already carries a standard per formation (`ground.ts renderStandard`, not RD-01's file). The bearer is marked by the badge's banner glyph instead. The recoloured bearer sprite should go to RD-02 / FL with `ground.ts`.
6. **The feinting and queued-step markers (R2) are left to RD-02,** which owns `battleHud.ts` and `BattleScene.ts` next wave.

## Findings

- **There is no Raise-the-Standard control in the HUD.** AB-03 is sim-only, and the medallion list has no `standard` entry. The play script issued the sim order the medallion would send. The Standard loss was forced (the bearer was set dead) when he survived the fight.
- **A routing-only group's card reads "0 men · routing".** `activeMembers` excludes routers. This is pre-existing. The glyph now shows the state.
