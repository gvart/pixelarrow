# V6-GATE-01 notes: the ten-size layout-check matrix

## Decisions

| Decision | Alternative | Why |
| --- | --- | --- |
| Groups: `phone` (390x844, 360x780, 320x693), `landscape` (844x390, 1024x768, 1280x800, 1440x900, 1920x1080), `tablet` (768x1024, 820x1180), `all` (the ten, default). 844x390 sits in `landscape`. | 844x390 in `phone` | landscape-v6.md calls it compact landscape; its problems are landscape problems. |
| A `v5` group (320x568, 375x667, 430x932, 320x640) outside the default, run by CI. | Drop them | V5-014 and QA-02 require 320x640 and 320x568; landscape-v6.md §5 says "plus its existing phone sizes". The default stays the ten (AC1). |
| Telegram insets only at phone sizes; at 844x390 landscape insets (sides 59, top 46, bottom 21; fakeTelegram learned left and right). Tablets and laptops run plain. | Portrait insets everywhere | §5 names the Telegram variant at 390x844 and 844x390; portrait insets on a sideways phone are not a real device. |
| Allowlist: `scripts/layout-allowlist/<story>.json` `{ _doc, entries }`, the story is the file name; entries may end in `@WxH`. Owner = V6-RSCR family (`STORY_OF` in `scripts/lib/layoutMatrix.mjs`). An entry in two files is an error. | One file with groups | V6-021: parallel stories never edit the same file. |
| Seeding scopes every new entry to its size; existing unscoped entries stay unscoped. Foundation screens are never seeded at the phone portrait sizes (text-size floor apart); their 844x390 findings go to RSCR-01, -10, -11. | Unscoped seeding | Allowing a key at 844x390 must not hide it at 390x844: lists only shrink. |
| An unscoped entry counts as fixed only after a run of every matrix size. | Any run | A one-size CI job must not report every unscoped entry as stale. |
| `KNOWN_CRASHES` (screen@WxH/insets → owner) skips a crashing screen in one configuration and prints it. | Exclude the Telegram 844x390 variant | A page error cannot be allowlisted and breaks every later screen in its context; skipping one owned screen keeps the rest of the variant enforced. |
| CI: one job per size and language (28 jobs, 1–2 configurations each, `--split 2 --jobs 4`, 20 min). | `--shard i/n` | Per-size jobs give per-size artifacts and timings, and keep each job at the old two-configuration load. |
| The pending mechanism and the nine new checks are not here. | Build them now | V6-RFND-03's card owns "pending support" and the thresholds table. |

## Proof that a new violation fails at any size (AC3)

A temporary screen `menu-gate01-fixture` (two overlapping 40-px interactive rectangles over the Menu), removed afterwards:

1. No allowlist entries: `--sizes 390x844,1280x800` → 6 new (overlap, spacing, touch-size at both sizes), `LAYOUT CHECK FAILED`.
2. With a temporary `V6-RSCR-01.json` listing the three keys `@390x844` only: 390x844 counted as known, 1280x800 reported 3 new, exit 1, `LAYOUT CHECK FAILED`.

## Run (local, 2026-10-13, `vite preview` on :6150, load average 35–95 on 10 cores)

Seeding: `--matrix all --update-allowlist` (28 configurations, 3637 s), then `--sizes 844x390 --update-allowlist` again after the crash skip (492 s). 998 entries: 995 at 844x390, 3 unscoped v5 text-size entries.

Verification: `node scripts/layout-check.mjs http://localhost:6150/ --matrix all,v5 --no-shots --jobs 6 --split 2`: 44 configurations x 196 screens in 5737 s wall, **0 new, LAYOUT CHECK PASSED**.

| Size | Group | Configs | Clean | Known (allowlisted) | Failed | Context s |
| --- | --- | --- | --- | --- | --- | --- |
| 390x844 | phone | 4 | 775 | 9 | 0 | 3276 |
| 360x780 | phone | 4 | 775 | 9 | 0 | 2950 |
| 320x693 | phone | 4 | 776 | 8 | 0 | 2637 |
| 844x390 | landscape | 4 | 312 | 470 | 0 | 2791 |
| 768x1024 | tablet | 2 | 388 | 4 | 0 | 1732 |
| 820x1180 | tablet | 2 | 388 | 4 | 0 | 2180 |
| 1024x768 | landscape | 2 | 388 | 4 | 0 | 2232 |
| 1280x800 | landscape | 2 | 388 | 4 | 0 | 2103 |
| 1440x900 | landscape | 2 | 388 | 4 | 0 | 1682 |
| 1920x1080 | landscape | 2 | 388 | 4 | 0 | 1606 |
| 320x568 | v5 | 4 | 760 | 24 | 0 | 2792 |
| 375x667 | v5 | 4 | 775 | 9 | 0 | 2459 |
| 430x932 | v5 | 4 | 775 | 9 | 0 | 2497 |
| 320x640 | v5 | 4 | 778 | 6 | 0 | 2331 |

"Context s" is browser-context time summed over the size's configurations (two contexts per configuration); on an unloaded machine one configuration took 391 s in one context. CI's 28 jobs each carry one or two configurations, as the old 10 shards did.

Wide sizes are green only because the interim column (V6-021) still letterboxes them: the existing checks pass inside a 390-wide column. The wide-screen rules (`letterbox`, `wasted-width`, …) are V6-RFND-03.

## Open issues

- **Crash (V6-RSCR-09):** `codex-beast` at 844x390 in Telegram (safe area 323 px tall) throws `Invalid typed array length: -888`; later screens in the same context then fail (`Cannot destructure property 'VW' of 'e.m'`). Repro: `node scripts/layout-check.mjs <url> --screens codex-beast --sizes 844x390 --insets tg --langs en`. Skipped via `KNOWN_CRASHES`.
- **Flaky seeds:** 14 seeded 844x390 entries did not show on the verification run (timing-dependent ids such as truncated texts); they are reported as "fixed but still allowlisted". 75 one-off violations (mostly `online-army-recruit` text overlaps in Telegram at phone sizes) showed once and not on the retry. Not hidden: both lists print every run.
- **Runtime:** the full matrix plus v5 is 44 configurations, about 95 minutes on this loaded machine. CI parallelises it across 28 jobs; locally use `--matrix` or `--sizes` and `--jobs`.
- Stale references to `scripts/layout-allowlist.json` remain in README.md, design/accessibility-requirements.md and docs/playbook/PROMPTS_AGENTS.md (not owned by this story).
