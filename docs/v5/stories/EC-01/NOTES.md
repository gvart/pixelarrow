# EC-01: forge reroll (the town Smith)

Story EC-01 (W19), `design/gdd/forge-reroll.md`. The user was asleep: every
decision below was taken autonomously and is logged here for review.

## What shipped

- **GDD first** (`/quick-design` format, Addition): `design/gdd/forge-reroll.md`,
  with the options table, rules, formulas, knobs, balance and ACs. A lean
  self-run `/design-review` is recorded at its foot.
- **Rules** (`src/game/gear.ts`): `forgeable`, `forgeDefaultLine`, `forgePool`,
  `forgeReroll`, `forgeCandidates`, `affixLineText`. Prices
  (`src/game/economy.ts`): `FORGE`, `forgeCost`, and `groupDigits` (Russian
  thousands with a no-break space, English with a comma).
- **UI**: a Smith row in every town's Services tab (`SettlementScene`), and
  two kit parchment sheets (`src/ui/sheets/forge.ts`): the item list (worn and
  stashed, finest first, price per row) and the item sheet (lines as
  selectable rows, the power that stays, gold in hand, Reforge under the
  thumb). After a reforge the new line carries "New" and "Was: ..." under it.
  Short of gold, the reason is printed on the sheet in red and on the grey
  button's tap.
- **i18n**: `src/i18n/forge.en.ts`, `src/i18n/forge.ru.ts`.
- **Tests**: `tests/forge.test.ts` (16): the price table, eligibility, the
  draw over 200 and 600 seeds, other lines and power unchanged, determinism
  and RNG advance, refusals leave the RNG untouched, the campaign save round
  trip (world RNG and `aff`), the sink row, line text and digit grouping.
- **Layout fixtures**: `town-forge`, `town-forge-item`, `town-forge-poor` in
  `scripts/layout-check.mjs`.
- **Docs**: `docs/ITEMS.md` "Reforging at the Smith", Open question 1 closed;
  `docs/v5/balance/EC-01.md` (the sink row and the power ceiling).

## Decisions

1. **One chosen line, not the whole item** (GDD option A). More agency than a
   full reroll, and no lock rule (which would need a per-item save field).
2. **The line's own stat stays in the pool**, so a reforge can raise a good
   stat from 1 to 2 steps; the other lines are excluded (never a stat twice).
3. **Steps stay in the natural 1–2.** The forge can only reach what a drop can
   roll. Measured ceiling (scratch rarity mirror, 100 seeds): +3.5 points an
   item at most, under the 10-point cap (V5-071).
4. **Flat price by tier × rarity** (20–240 g), no escalation: escalation needs
   a counter on the item. Long chases are slowed by the odds instead.
5. **The world RNG draws** (as the AC says), and the scene saves at once. A
   refusal draws nothing, so a failed tap cannot shift the world.
6. **Towns only**, and the Smith stays open when the market is shut or sacked
   (Services stay open, SET-01).
7. **Named legendaries are not offered**; set pieces are (their stats are
   rolled, and they are the endgame chase).
8. **Name "Smith" / "Кузнец", action "Reforge" / "Перековать"**, so the town
   service is not confused with the field camp's forge (temper).
9. **No preview, no undo**: the price buys a draw. The old line is shown once.
10. **Stat labels wrap, never cut** (Director): labels get the row's width
    minus the value; a long one takes a second line. At 320 "Темп атаки",
    "Прочность" and "Пробой щита" show whole.
11. **Gold is grouped** on the forge sheets ("12 450"). The town's gold chip
    is the kit's `MChip` (not this story's file) and still prints "12450".

## Balance (anchors)

`npm run balance` after the change: see `docs/v5/balance/EC-01.md`. The forge
touches no battle code, so every anchor row is unchanged.

## Not this story

- The item card (`src/ui/sheet.ts`) still shortens "Темп атаки" and
  "Прочность" in its two-column stat grid at 320. It is not an EC-01 file; the
  forge sheets do not use that grid.
- A war-map / duel (Glory) reroll stays open (ITEMS.md Open question 1): it
  needs the server.
- The town gold chip's thousands separator (the kit's MChip).

## Skills applied

quick-design (spec format, options, knobs, ACs), design-review (lean,
self-run), economy-designer (faucets and sinks, sink capacity, odds as a
formula with worked values), balance-check (inputs named, targets judged,
the ceiling measured), rpg (affixes as a modifier layer, reroll on stored
data), tdd (red, then green, per rule), dev-story, story-done (ACs checked
below), gameplay-programmer (pure rules in `src/game`, the scene owns the save).
