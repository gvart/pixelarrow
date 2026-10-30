---
name: pixelarrow-playbook
description: Index of pixelarrow's playbook and house rules. Use before ANY change to this game's art, sprites, animations, fights, mechanics, sim or server rules, HUD/UI, quests, story or lore, or region maps (src/war/**, server/src/war/**, src/data/war*.ts, public/war/**, scripts/war/**). Tells which doc and section to read, which commands verify the change, and the commit/merge rules.
---

# pixelarrow playbook index

The know-how lives in `docs/playbook/` and the living docs. Read the section named here, not the whole file.
Project agents in `.claude/agents/`: `art-director`, `pixel-animator`, `game-designer`, `hud-reviewer`, `lore-writer`.

## Which doc for which change

| Change | Read first |
| --- | --- |
| Any feature, start to merge | `docs/playbook/NEW_FEATURE.md` §1 pillars, §3 decisions, §7 gates; `docs/playbook/LESSONS.md` (all, short) |
| Mechanic / rule / economy | `docs/WAR.md` (the section of the system), `docs/impl/global-war-rebuild.md` "Decisions" (W-01..W-71; next is W-72), `docs/ROADMAP.md` "Binding decisions" (ADR-0001 sim version) |
| Neutral world: lairs, chiefs, roaming, encounters, hidden quests | `docs/WAR.md` "Living regions" → "Region lore and depth", "Roaming life", "Wild fill, chiefs and hidden quests", "Random encounters" |
| Story, quests, givers, chief names | `docs/WAR.md` "Lore", "Region stories (W-65)"; `docs/playbook/SCENARIOS.md` "The general recipe"; template at the end of `src/data/warStories.ts` |
| HUD / UI | W-70 in the impl doc; `src/war/view/hud/qcard.ts` header; `docs/playbook/ART.md` §1 (contrast, one job per colour); `docs/playbook/LESSONS.md` "Taps and controls", "Text and fonts" |
| Painted art (Gemini) | `docs/playbook/ART.md` §2 workflow, §3 verify renders, §4 process/check/promote, §5 budgets; `docs/playbook/PROMPTS_ART.md` §1 building blocks |
| Region look | `docs/playbook/PROMPTS_ART.md` §40i, §40l (Gemini region refs), §40m–§40o (art-director critiques of in-game shots); biome kits §25, §28, §29, §34 |
| PixelLab sprites / animation | `docs/playbook/PROMPTS_ART.md` §13 rules, §33 mobs, §45–§47 beasts and bosses; `docs/v5/art/STYLE_LOCK.md`, `docs/v5/art/SHEET_FORMAT.md`; job records `docs/v5/pixellab/MOBS/` |
| Releases, sim train | `docs/OPS.md` "Sim train releases (SIM_VERSION)" |

## Verify (light local load)

The owner games on this machine. Run targeted tests, niced, one worker; CI runs the full suite.

```bash
nice -n 19 npx tsc --noEmit
nice -n 19 npx vitest run tests/war/<file>.test.ts --maxWorkers=1
(cd server && nice -n 19 npx vitest run test/war/<file>.test.ts --maxWorkers=1)   # when server/ changed
nice -n 19 npm run bench:war        # sim changes: 600 units, ≤ 8 ms/step
nice -n 19 npm run balance:war      # mechanic or economy changes, before and after
npm run dev -- --port <free port> --strictPort   # check with lsof -nP -iTCP:<port> -sTCP:LISTEN first
```

Never use `scripts/war/play-smoke.mjs` as a logic loop: logic goes into seeded vitest scenarios (`tests/war/*`,
`src/war/scenarios/*`). Stop only the servers you started. Shots go to the git-ignored `shots/`.

## House rules

- **Commits:** semantic with the house scopes (`feat(war-sim):`, `feat(war-hud):`, `fix(war-view):`, `feat(war-art):`,
  `feat(war-data):`, `feat(war-server):`, `docs(war):`, `test(war):`). No
  `Co-Authored-By` trailer, no "Generated with" line, no AI attribution anywhere.
- **Branches:** work in your own worktree branch; the desk merges it into `main` with `git merge --no-ff`. Never
  push, never deploy (`deploy.yml` ships `main`).
- **Light local load:** `nice -n 19`, targeted files, `--maxWorkers=1`; no full suite, no long headless runs.
- **No live users:** no backward compatibility, migrations or old-client support. Bump `SIM_VERSION`
  (`src/sim/version.ts`) for sim rule/data changes and `NET_VERSION` (`src/war/net/protocol.ts`) for wire changes.
- **Repo docs lean:** no run logs, progress files, per-story notes or review images in git. Lasting rules go into
  `docs/WAR.md`, a W-xx line in the impl doc, or the playbook. Every art/agent prompt is logged in
  `docs/playbook/PROMPTS_ART.md` / `PROMPTS_AGENTS.md`.
- **Clean UI first:** whole-screen shots, no overlapping panels, no jargon, before any UI merge.
- **Regions from Gemini refs:** prototype a region or landmark in Gemini first, then build to match.
- **Tests derive from data:** never hardcode lists of mob kinds, regions or stories in tests; derive from
  `MOB_KINDS` (`src/war/sim/mobs.ts`), `WORLD_REGIONS` (`src/war/world/regions.ts`), `STORIES`
  (`src/data/warStories.ts`), `WAR_CHIEFS` (`src/data/warWild.ts`), `ENCOUNTERS` (`src/data/warEncounters.ts`).
