# The pixelarrow playbook

How v5 and v6 were built, written down so the next feature, piece of art or multi-agent run can be built the
same way. v5 and v6 were each run by one coordinating session (the "Director") that wrote no code: it planned
stories and dispatched agents, agents worked in their own git worktrees, short-lived "integrator" agents merged
them and ran every gate, Gemini (in Chrome) made the painted art and PixelLab the soldier sprites. The run logs,
GDDs and ADRs of those runs are no longer in the repo; this playbook keeps the method, the prompts and the lessons.

## Read in this order

| # | File | What it gives you | When |
| --- | --- | --- | --- |
| 1 | [NEW_FEATURE.md](NEW_FEATURE.md) | Idea → GDD → decisions → story card → agent → review → merge → balance → regression → localization, with a checklist | Every new feature |
| 2 | [LESSONS.md](LESSONS.md) | The hard rules learned the expensive way (disk, flakes, taps, fonts, servers) | Before you dispatch anything |
| 3 | [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md) | Fill-in prompts for the implementation agent, integrator, flake fixer, QA playthrough and the Director's review loop | When you write an agent prompt |
| 4 | [ART.md](ART.md) | The image pipeline: art bible essentials, Gemini workflow, process → check → preview → promote, sizes and budgets | Before any art job |
| 5 | [PROMPTS_ART.md](PROMPTS_ART.md) | The Gemini and PixelLab prompt templates and the prompts behind shipped art | When you write an image prompt |
| 6 | [SCENARIOS.md](SCENARIOS.md) | How game content is authored: event cards, the campaign arc, ladder floors, doctrines, names | When you add content |
| — | [director-brief.md](director-brief.md) | The Director brief as a fill-in template (v5 + v6) | When you start a new multi-agent run |

## Ground truth that is still in the repo

| Topic | File |
| --- | --- |
| Art pipeline scripts, asset list, sheet format, PixelLab style lock | [docs/v5/art/](../v5/art/) (`ASSET_PIPELINE.md`, `ASSET_LIST.md`, `SHEET_FORMAT.md`, `STYLE_LOCK.md`, `asset-manifest.json`, `palette.json`) |
| PixelLab job ids, picks and the I5c / polish prompts by id | [docs/v5/pixellab/](../v5/pixellab/) |
| Player-facing rules | [docs/WAR.md](../WAR.md), [ITEMS.md](../ITEMS.md) |
| Flaky checks | [docs/FLAKY.md](../FLAKY.md) |
| Release and ops | [docs/OPS.md](../OPS.md) |
| What comes next | [docs/ROADMAP.md](../ROADMAP.md) |

Decision ids quoted in these files (V5-0xx, V6-0xx) point at the decision logs of those runs, which are in git
history, not in the tree.

## Things that are not in git

- `.claude/` (skills, agents, Director briefs) is untracked (V5-002). Agent prompts point at
  `{F}/skills/<name>/SKILL.md` and `{F}/agents/<name>.md` with `{F}` an absolute path; keep `.claude/` somewhere
  stable (v6 used `{ROOT}/.claude`) and update the paths if it moves.
- Raw Gemini downloads are gitignored (V5-049). The processed files and contact sheets are in git.
