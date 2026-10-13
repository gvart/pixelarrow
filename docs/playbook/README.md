# The pixelarrow playbook

How v5 was built, written down so the next feature, the next piece of art and the v6 platform work can be
built the same way. It is for someone who was not there: every rule points at the file or decision it came
from.

v5 was run by one coordinating session (the "Director") that wrote no code. It wrote design docs, planned
stories and dispatched agents. Agents did all the work in their own git worktrees, and short-lived
"integrator" agents merged them into the local branch `v5` and ran every gate. Gemini (in Chrome) made the
painted art. This playbook keeps that method and drops the parts that were only true for one night.

## Read in this order

| # | File | What it gives you | When |
| --- | --- | --- | --- |
| 1 | [NEW_FEATURE.md](NEW_FEATURE.md) | Idea → GDD → decisions → story card → agent → review → merge → balance → regression → localization, with a checklist | Every new feature |
| 2 | [LESSONS.md](LESSONS.md) | The hard rules learned the expensive way (disk, flakes, taps, fonts, servers) | Before you dispatch anything |
| 3 | [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md) | Fill-in prompts for the implementation agent, integrator, flake fixer, QA playthrough and the Director's review loop; the skills and agents list | When you write an agent prompt |
| 4 | [ART.md](ART.md) | The image pipeline: art bible essentials, Gemini workflow, process → check → preview → promote, sizes and budgets | Before any art job |
| 5 | [PROMPTS_ART.md](PROMPTS_ART.md) | Every Gemini prompt used in v5, grouped by asset type, with results and reusable templates | When you write an image prompt |
| 6 | [SCENARIOS.md](SCENARIOS.md) | How game content was authored: event cards, campaign events, lairs and the host, ladder floors, doctrines, names | When you add content |
| — | [director-brief-v5.md](director-brief-v5.md) | The v5 Director brief, word for word | When you start a new multi-agent run |

## The sources this is built from

Read these when the playbook is not enough. They stay the ground truth.

| Topic | File |
| --- | --- |
| Decisions, with alternatives and reasons | [docs/v5/DECISIONS.md](../v5/DECISIONS.md) |
| What was merged, gate results, follow-ups | [docs/v5/PROGRESS.md](../v5/PROGRESS.md) |
| Story list and gate codes | [docs/v5/plan/STORIES.md](../v5/plan/STORIES.md) |
| Waves, file ownership, dispatch cards | [docs/v5/plan/SPRINTS.md](../v5/plan/SPRINTS.md) |
| Which skills each story used | [docs/v5/SKILLS_LOG.md](../v5/SKILLS_LOG.md) |
| Gemini prompts and verdicts | [docs/v5/ASSET_LOG.md](../v5/ASSET_LOG.md) |
| Art rules | [design/art/art-bible.md](../../design/art/art-bible.md), [docs/v5/art/ASSET_PIPELINE.md](../v5/art/ASSET_PIPELINE.md), [docs/v5/art/ASSET_LIST.md](../v5/art/ASSET_LIST.md) |
| Design docs | [design/gdd/](../../design/gdd/), [design/adr/](../../design/adr/), [design/ux/](../../design/ux/) |
| Balance | [docs/v5/balance/FINAL.md](../v5/balance/FINAL.md) and one file per mechanic story in [docs/v5/balance/](../v5/balance/) |
| QA | [docs/v5/qa/PLAYTHROUGH.md](../v5/qa/PLAYTHROUGH.md), [tests/regression/SUITE.md](../../tests/regression/SUITE.md) |
| Release and ops | [docs/OPS.md](../OPS.md) |
| What comes next | [docs/ROADMAP.md](../ROADMAP.md) "Next: v6" |

## Things that are not in git

- `.claude/` (skills, agents, the Director brief) is untracked (V5-002). In v5 it lived at
  `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`. Agent prompts point at
  `$F/.claude/skills/<name>/SKILL.md` and `$F/.claude/agents/<name>.md`. If that worktree is removed, copy
  `.claude/` somewhere stable first and update the paths.
- Raw Gemini downloads are gitignored (V5-049). They are in `$F/docs/v5/gemini/AS-0N/`. The processed
  files and contact sheets are in git.
