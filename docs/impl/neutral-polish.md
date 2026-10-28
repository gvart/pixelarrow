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

- [x] 1 boss-voice — wake banner, phase lines, epitaph; lines in src/data/warBosses.ts; src/war/view/hud/bossBanner.ts; one beat per skipped phase. verify: tests/war/bosses.test.ts, Playwright shots of wake / phase / death.
- [x] 2a boss-art — 7 sheets in src/assets/sheets/mob_<kind>/, GUARDIANS cls + SIZE, prompts in PROMPTS_ART.md. verify: guardians-preview shots, sandbox draws each.
- [ ] 2b boss-moves — griffin dive, lion pounce, bear maul, minotaur charge, river-god surge with telegraphs. verify: bosses tests, balance:war, FX shots. depends on: 1, 2a.
- [x] 3 beasts-lairs — lion + serpent mob kinds, lair art per kind with cleared state, mob FX from new events (charge, howl, flee), server mirror. verify: mob scenarios, lair shots.
- [x] 4 stories — all 18 hooks written; 13 first, then 5 after 3 with existing beasts now, the 6 lion/serpent ones after 3; named leads as captains with a name tag; STORY_HOOKS removed. verify: tests/war/stories.test.ts, story card shot.
- [x] 5 encounters — rescue and track triggers, biome/region filter, ~8 new kinds incl. lion and serpent. verify: encounter tests. depends on: 3.

## Risks

- river_god changes body per phase today; one sheet must carry all three phases.
- New clear spots must stay > 24 tiles from lairs (stories test).
- Sim events and snapshot fields must be mirrored in server/src/war/*.

## Notes from landed work

- 1 boss-voice: lines live in the HUD banner under the guardian bar (not over the boss); a guardian already fighting when first seen never wakes; skipped phases play 1.8 s apart. Beasts are `mute` (narrated lines). Rough edge: the replay "guardian is slain" toast overlaps the guardian bar title above the epitaph.
- 4 stories (part A): 13 chains merged; waiting on beasts-lairs: kyrene-n, kyrene-w, elaia-n, savanna, kimmeria (griffin: needs a mob or reuse the boss). Bandit leads (story and host) wear mob_bandit_captain with a name tag under the feet. Rough edges: the quest marker label and the name tag both name the lead; Kleisoura steps skirt the bandit fort; the Chalk Coast chain is a long walk.
- 3 beasts-lairs: lion (pride 2-4, pounce) and serpent (1-3, venom, lunge) kinds in kyrene-n, savanna, kyrene-w, elaia-n; events mobDash / mobCry / mobScatter sent as `mobFx` to the players who see them; 8 dens live and cleared; fixed hud/roster/state.ts dropping the sim's event listener (sound and FX were deaf to sim events). Rough edges: serpent back-view strike turns to camera for 2 frames; the cleared bandit tent stands; ammos, kyrene-s, achelous lore names lions/serpents but their lairs are jackal/boar. Prompts: PROMPTS_ART.md §45.
- 5 encounters: 19 kinds; track and rescue steps; `biomes` / `beasts` filters; fauna fights use the region's own beasts; shared `rescued()` in sim/stories.ts. Rough edge: the unburied shade is drawn as a plain hoplite (should wear the W-60 soul look).
- 4 stories (part B): kyrene-n, kyrene-w, elaia-n, savanna, kimmeria (ends by sending the player at the Griffin); ammos and kyrene-s lairs now lions, achelous serpents; STORY_HOOKS removed.
- 2a boss-art: 7 own sheets (152 gens; account 670.5 → 472.5 with beasts-lairs); river_god one cls in all phases; mob_great_boar alias gone; corpse clock fix in units.ts drawCorpses; prompts PROMPTS_ART.md §46; tools guard/clean.mjs, ground.mjs --down. Rough edges: jumpy strikes (boar NW, lion), pale stripe on the bear's back, pebbles in the Titan's stomp, griffin leap rough; Minotaur hidden by labyrinth walls; two guardian bars + landmark panel crowd the centre; empty phase note "phase 1/1: ·"; claim label over the bear.
- [x] 6 fixes — the rough edges above (toast overlap, double lead label, serpent back strike, cleared bandit tent, shade look, Minotaur visibility, crowded bars, empty phase note, claim label over a boss, bear stripe and jumpy strikes with free tools).
