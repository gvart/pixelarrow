# F-02: kit controls, notes

The contract is [ADR-0005](../../../../design/adr/ADR-0005-ui-kit.md). This file records what changed on screen and the calls made while the user was asleep.

## What changed

- **Grey means disabled only (G2).** `neutral` (MButton, MIconButton), KeyButton `stone` and v3 Button `ghost` all drew grey cut stone. They now draw a raised **dark bronze** slab. That fixes Close (shop cosmetic), Dismiss (Army, Hero, duel hero), Flee, Undo, the pager arrows, the "−" stepper and unpicked filters on every screen at once, without touching the screens.
- **Disabled is flat and says so.** A flat grey face, no bevel, rim or shadow (a disabled StoneTile lost its drop shadow), a faded label and **a lock** in the icon's place (MButton, v3 Button with a label), in the corner (MIconButton) or on the segment (SegmentedSwitch `off`). The reason still shows on tap.
- **Toggle in force.** New MButton variant `lit` (lit bronze, ink label). `MActionBar`'s `selected` slot uses it instead of the old stone.
- **Text floor 6.5 UI px (A11Y-09).** MButton, StoneTile, SegmentedSwitch, RoundButton, badges, the icon button's count, the empty-state hint, the v3 Button and `mtext`'s Cinzel step-down stop at 6.5 (it was 5.5, and 4 in the tab bar). Below that a label is written in Inter, then cut with the full text as its long-press tip.
- **Tab bar (Director's extra, MENU-3).** One face, one case, one size for all five labels: Cinzel capitals at 7, then 6.5, else Inter in sentence case at 7, 6.5 (6 only for English at 320 px). Slots follow their labels and the two sides stay equal, so the War medallion stays centred. The selected tab gains a bronze rim. The labels went from 8-11 CSS px to 12-14 CSS px. Russian keeps Cinzel down to 360 px.
- **Segmented switch:** the same one-style rule; icons drop before a label is cut (the Russian shop's "ПРОПУСК").
- **Badges (G11):** `badgeText`: counts only, "99+" at most, nothing for 0; a "!" is now a small dot. Alert red with a cream ring.
- **Chips never cut a number (G14, WAR-1):** they shrink to 6.5, then write 12K.
- **Must-show facts wrap:** `mtext(..., { maxW, wrap: true })`; a disabled tile's reason wraps without a line limit.
- **Scroll cue (G9):** every `ScrollArea` shades an edge that hides content and puts a chevron at the bottom right while there is more below.
- **44 pt:** MButton width and a tappable MChip now hold `TAP` both ways. Tabs and segments dim while pressed.

## Decisions

1. **Neutral is dark bronze, not secondary bronze.** The art bible's role table lists Close/Flee/Dismiss as bronze. Making `neutral` identical to `secondary` would erase the state of toggles built as `on ? 'secondary' : 'neutral'` (Duels use buttons, stash filters). Dark bronze reads as live and keeps the pair apart. Those toggles should move to `lit`/`selected` in their screen stories.
2. **Tab labels may leave Cinzel on narrow phones.** Five Cinzel labels with "CAMPAIGN" do not fit a centred medallion below 390 px in English. Interaction pattern P7 asks for i18n short forms rather than a change of case. The i18n files are not F-02's, so all five switch together to Inter in sentence case (the text face's own case) and nothing mixes. Short forms (for example `tab.campaign.short`) are for HUB-01, which owns the tab bar next. At 390 the medallion is 40 UI px in English (46 before) so Cinzel 6.5 fits.
3. **Cinzel buttons go down to 6.5, not 7.** The art bible's display minimum is 7, and A11Y-09 and P1 say 6.5. Stopping at 7 would push many more button labels into Inter. The tab bar tries 7 first.
4. **The layout-check text-size rule (F-01 AC4's open half) is not in F-02.** It needs `scripts/layout-check.mjs`, `src/ui/layoutCheck.ts` and `src/ui/layout.ts`, which F-02 does not own. IN-02 owns them, and its AC1 is the same kind of rule with existing violations allowlisted by owner. F-02 instead enforces the floor in every kit control it owns and tests it (`buttonLabelSizes`). Remaining small text outside the kit: KeyButton (battle HUD, RD-01/BTL-01), StatTile labels, OfferCard status, the ParchmentRow subtitle, the StashGrid price and the v3 Button's sub line.
5. **The Kit gallery's own top tabs** ("Con… Items LISTS") are `Tabs` from `src/ui/widgets.ts` (F-03), so they still mix case. Flagged for F-03.
6. **The scroll cue is on by default** for every ScrollArea (opt out with `{ cue: false }`). Screens with their own fade (the duel hero list) now show both; the kit's shade is light.
7. **Pure rules live in `src/ui/mosaic/policy.ts`** (new, inside the story's `src/ui/mosaic/**`), so vitest can test them without Phaser. `base.ts`, `controls.ts` and `kit.ts` re-export them, and the old API is unchanged.

## Shots

`before-*` show v5 at b874988 and `after-*` show this branch. Both come from a production build (`vite preview`, fonts loaded), DPR 2, plain insets. The screens are the menu hub, the Duels hub (ladder), the Kit (`kit-controls`: tab 0; `kit-mosaic`: the hub demo with the tab bar), the shop's cosmetic dialog (Close) and the duel hero (Dismiss), each at 390x844, 360x780 and 320x640, in en and ru.
