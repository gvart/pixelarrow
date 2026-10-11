# RD-02: flank arcs, field banners, auto-pause merge, damage numbers

design/gdd/battle-readability.md R4 (and GDD review N15). Presentation only: no sim rule, event or hash changes.

## What shipped

- **Flank arcs** (`src/ui/flankArc.ts`, new and pure; drawn by `drawFlankArc` in `src/ui/battleFx.ts`):
  - On our `flanked` event, a **solid alert-red arc with two inward chevrons** sits round the group's field badge, +-60 degrees around the direction of the blow. The direction is taken from the striker of the side or rear `hit` just before the event. It lasts `FLANK_ARC_S` = 2 s of battle time, so it stays while paused, and a new event refreshes it rather than stacking.
  - **Before contact (N15)**, a **dashed cream arc** points at each enemy group (nearest 2 at most) that is heading into the group's flank or rear sector within 8 paces (man to man) and is not yet in melee. Orbs (no flanks), routed and lone-hero groups get none. It is recomputed every 200 ms.
  - Both arcs sit on an ink outline and differ by shape (solid with chevrons against dashed), so they read without colour (A11Y-04).
  - `flankSide()` uses the sim's own split (`hitDirection`: dot > 0.45 is front, < -0.35 is rear) and tells left from right.
- **Field banners** (`BannerLife` in `battleHud.ts`): a field-event banner hides after 6 s at most, or as soon as its condition is false:
  - a rout banner, once the group rallies;
  - the disordered banner, once the 3 s disorder ends;
  - a flank pause, once the group is gone or routed.
- **Auto-pause merge** (`AutoPauseMerge`): auto-pause reasons within 5 s of battle time make one pause and one banner listing the reasons (the newest 3, one per line). It replaces the old 4 s real-time rule, in which "contact" always paused again.
- **Readouts for the FO-03 events**:
  - **`cohesion`**: an amber ripple ring over each shaken neighbour group. Our rout banner gains a line, "The rout shakes II, III".
  - **`disordered`**: a banner, ours ("II is disordered!") or theirs ("Enemy Hoplites is disordered: strike now!"). It lives while the sim says the group is disordered. RD-01's badge marker stays.
  - **`armyBreak`**: the army-wide banner, "Our army breaks!" or "Their army breaks!". Once a side is broken, its per-group rout banners are dropped, because the army banner tells it.
- **Damage numbers** (`damageNumberHits`): only the blow of a charge impact (its `impact` and `hit` share the unit and the striker) and a killing blow get a number. They show at 9 px for 600 ms. The settings toggle still turns them off.
- i18n: 5 new keys in `readout.en.ts` / `readout.ru.ts`.

## Decisions

1. **The arc goes round the badge, not on the ground.** The GDD says "on the threatened side of the badge". A screen-space arc keeps one size at every zoom and never covers the men. A ground arc round a 20-man line would cross the neighbouring groups.
2. **Arcs only for our own groups.** Enemy groups get none. A red arc is an alert (G3) for the player, and arcs on enemy badges would double the marks on the field.
3. **The threat arc is cream and dashed, not amber.** Amber already means "wavering" on the same badge.
4. **Battle time for the merge window and the arc, real time for the banner's 6 s.** A pause must not make the arc vanish. A banner's 6 s is a reading time.
5. **The merged banner shows every reason, even after resume.** Within the window, a new reason doesn't pause again. It re-shows the merged list for 6 s.
6. **Shake, hit-stop, the dust puff and audio are not in this story.** The R4 table's shake and hit-stop columns depend on the Reduce shake and Reduce flash settings (FL-01, V5-072), so they go to FL-01. RD-02's acceptance criteria don't list them.
7. **The feinting and queued-step badge markers (RD-01's hand-off) are still open.** They are not in RD-02's acceptance criteria, so they go to BTL-01, which owns the badge row next.

## Findings

- The `flanked` event carries no direction. The arc reads it from the `hit` before it in the same batch. Every `flanked` follows a side or rear `hit` on the same tick (`applyDamage`).
- The sim throttles `flanked` to one per group per 12 s, so a long flank attack shows the red arc for 2 s in every 12 s. The card's "Flanked!" (RD-01) behaves the same way.
