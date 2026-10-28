# Neutral polish (temporary implementation doc)

Decision: W-67 in docs/impl/global-war-rebuild.md. Delete this file in the change that completes the work.

## Goal

Bosses read as set pieces (own art, an entrance, lines, signature moves); neutral regions feel alive (real lairs, lion and serpent beasts, mob FX, all 24 stories, more encounters).

## Decisions (owner 2026-10-28)

- Wake: a title banner (name, title) and a taunt over the boss with a roar shake; the camera stays the player's. The sim never pauses.
- Lines: one per phase change and an epitaph at death, written per boss. No kill or low-hp barks.
- Own sheets for all 7 bosses without art: griffin, savanna_lion, moor_bear, minotaur, titan, river_god, erymanthian_boar (pipeline: PROMPTS_ART.md §40c).
- New mob kinds lion and serpent (the hooks of kyrene-n, savanna, kyrene-w, elaia-n name them).
- PixelLab cap: 450 generations in all (boss-art ≤ 350, beasts-lairs ≤ 90). Over the cap: stop and report.
- Lair art from existing props first; PixelLab only for what is missing.

## Work items

- [ ] 1 boss-voice — wake banner, phase lines, epitaph; lines in src/data/warBosses.ts; src/war/view/hud/bossBanner.ts; one beat per skipped phase. verify: tests/war/bosses.test.ts, Playwright shots of wake / phase / death.
- [ ] 2a boss-art — 7 sheets in src/assets/sheets/mob_<kind>/, GUARDIANS cls + SIZE, prompts in PROMPTS_ART.md. verify: guardians-preview shots, sandbox draws each.
- [ ] 2b boss-moves — griffin dive, lion pounce, bear maul, minotaur charge, river-god surge with telegraphs. verify: bosses tests, balance:war, FX shots. depends on: 1, 2a.
- [ ] 3 beasts-lairs — lion + serpent mob kinds, lair art per kind with cleared state, mob FX from new events (charge, howl, flee), server mirror. verify: mob scenarios, lair shots.
- [ ] 4 stories — 12 hooks with existing beasts now, the 6 lion/serpent ones after 3; named leads as captains with a name tag; STORY_HOOKS removed. verify: tests/war/stories.test.ts, story card shot.
- [ ] 5 encounters — rescue and track triggers, biome/region filter, ~8 new kinds incl. lion and serpent. verify: encounter tests. depends on: 3.

## Risks

- river_god changes body per phase today; one sheet must carry all three phases.
- New clear spots must stay > 24 tiles from lairs (stories test).
- Sim events and snapshot fields must be mirrored in server/src/war/*.
