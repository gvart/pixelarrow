# pixelarrow v6: the report

For the owner. Written by the producer on 2026-10-18, on the local branch `v6`. Nothing was pushed, merged to `main` or deployed.

**In one paragraph.** v6 takes pixelarrow out of Telegram-only. The game moves to **play.pixelarrow.app**, and a new landing page goes on **pixelarrow.app**. Every screen now has proper layouts for phone landscape, tablet and desktop, and the game can be played with a mouse and keyboard. Players on the web get real accounts (email and password). They can link them to their Telegram account, pick a public nickname, delete the account, and read a privacy notice. The landing page shows live public stats and leaderboards. **Verdict: built, but not finally checked.** 57 of the 64 planned stories are merged (the last was PLAT-06); this report is the documentation part of QA-05. You cancelled final QA and RSCR-11, and GATE-03 and PLAT-07 were not done (section 5). So no whole-branch playthrough, code review or performance pass ran at the end: each story passed its own gates at merge, and one final gate pass ran after the last batch of merges, but nobody has checked the branch as a whole. Before go-live, sign off the privacy notice and run the cutover in [OWNER_ACTIONS.md](OWNER_ACTIONS.md).

**Size of the work.** About 514 commits on `v6` since `main` (86 merges), from 2026-10-13 to 2026-10-18. `src/`, `server/src/`, `landing/src/` and `auth/` changed by about +28.6k / −2.0k lines. The client has about 2,180 vitest tests and the server about 560.

## 1. What v6 delivers

| Area | What the player gets | Main stories and decisions |
| --- | --- | --- |
| **Two hosts** | The game and its API on play.pixelarrow.app; the landing page, the legal pages and www on pixelarrow.app. Old `?startapp=` links and Telegram launches on the apex go to play. | HOST-01..03, ADR-0007, V6-023/024/043 |
| **Landing page** | An English-only "Night Tabletop" page. A living battle in the hero, drawn with the game's own sprites. Then the features, 12 classes and 3 beasts, the modes, 10 clips recorded from the real game, live stats, the FAQ and a closing call to action. Lighthouse scores 100 in all four categories on mobile and desktop. | LAND-01..06, P5-VIDEO, ADR-0011, V6-015/025/029/036/060 |
| **Public stats and leaderboards** | Counters and two ledgers on the landing page (Top duelists, War standings), from a 5-minute snapshot. It shows ranks and nicknames, never Telegram names or ids, behind a cached proxy. | STATS-01..03, LAND-04, V6-011/031/047/050/056 |
| **Responsive layouts** | Size classes: compact (phone; portrait unchanged from v5, landscape has its own layout), medium (tablet) and expanded (laptop and desktop). The 0.64 portrait cap is gone. Every screen family is migrated: the hub and nav rail, battle and results, war, online, clans and the merchant, duels, army and hero, settlements, the market and the shop, world and camp, first run and the tutorial, the Codex, and the settings sheets. Wide screens use list-and-detail panes and side panels. | RFND-01..04, RSCR-01..10, ADR-0013, V6-018/020/055/059/068–096 |
| **Mouse and keyboard** | Hotkeys follow key position, with labels for the keyboard layout. Rebinding is in Settings, under Controls. There is a `?` shortcuts sheet, and controls show keycaps. Right-click or right-drag gives orders, middle-drag pans and the wheel zooms. Tab focus has a visible ring, and Esc goes back one step. Every key calls the same code as its button, so replays and lockstep are unaffected. | INP-01..06, ADR-0012, V6-016/038/052/064/065/069/088 |
| **Web accounts** | No account wall for the campaign, the Codex or Settings. Email and password sign-up and log-in, with a verification email, password reset, a Turnstile bot check, rate limits and lockouts. Sessions are revocable (cookies on the web, 24-hour tokens in Telegram). Signed-in web players play online, and their save syncs; signed-out web players see "Sign in to play online" (PLAT-06). | ACCT-01..07, PLAT-06, ADR-0008/0010, V6-014/017/022/034/042/045/079/086/087 |
| **Telegram linking** | Link Telegram from the web with a QR code or a link, or add an email to a Telegram account. If both accounts have progress, the player keeps one and types its name to confirm; a save with only day-1 progress counts as empty. Sign-in methods can be added, changed or removed, and sensitive steps ask "Confirm it's you". The Mini App switches to the linked account on its own. | LINK-02/03/05/06/07, ADR-0009, V6-049/053/054/089/092 |
| **Nicknames** | A player-chosen public name, used everywhere public. It is checked against look-alike characters, reserved names and a blocklist, and changes have a cooldown. First run offers a name, and a moderation notice shows at launch if a name was reset. | LINK-01, LINK-07b, V6-011/041 |
| **Delete account and privacy** | Delete account in the game, mapped across all 72 tables; purchase records are kept for the retention period. In Telegram, /delete_my_data opens the same screen, and Close after a delete closes the Mini App. A full privacy notice in EN and RU, **still a draft until you sign it off**. | LINK-04, LINK-07/07b, V6-048 |
| **Payments** | The shop goes through the platform layer. Telegram Stars are unchanged; the web shows "Coming soon" with no price. | PAY-01/02, V6-077/084, [PROPOSALS.md](PROPOSALS.md) |
| **Platform layer** | Telegram-specific code sits behind one `platform` entry point with Telegram and web adapters: storage, auth, back, share, payments, haptics, launch params and closeApp. | PLAT-01..06, ADR-0006, V6-033/040/061/071/073 |

**Also merged at the end:** main's five v5 hotfixes (tutorial and battle clock on real frame time, render scale capped at 2x on phones, the war map margin, smokes waiting on real state), and QA-SPEED, which cut the regression suite from about 86 minutes (with tutorial rows killed at the cap) to about 19 minutes with all rows passing, with the same assertions (V6-095).

## 2. How it was verified

Each story ran its own gates, and an integrator re-ran them on `v6` after merging (V6-010). The last batch (RSCR-06+06b, LINK-07+07b, the Army empty-state fix, PLAT-06) was merged back to back and checked with one gate pass (V6-096, V6-097). On the finished branch (a3d4bc34) that pass gave: tsc, vitest, vite build, server vitest (563), landing build and tests (21/21) and layout `--quick` all pass; regression `--all` passes in both modes (smoke in Telegram failed once on a `worldDiag` read of `scrollX` and passed alone; not yet in FLAKY.md); online-e2e 38/38, link-telegram-e2e 42/42 (after a test-only fix: the script now watches for the 4 s switch toast inside the page, and its countdown regex accepts a fresh "10:00"), and account, account-manage and account-privacy e2e all pass.

- **Code:** tsc reports 0 errors; the full client vitest suite passes; the vite build passes; the server tests pass.
- **Layout check:** the scenes each story touched were checked at all **10 sizes** (phones, tablets, 844x390 landscape, laptops up to 1920x1080), in EN and RU, in a plain browser and in Telegram: 28 configurations. It covers the wide rules (letterbox, wasted width, empty column, stretched controls) and **element parity**, which proves that nothing a v5 portrait screen had was dropped.
- **Browser scripts:** the regression suite (both platform modes), the smokes, online e2e, `link-telegram-e2e`, the account e2e and the privacy e2e.
- **Real input:** each story played its screens with a mouse and keyboard at 1280x800, by touch on a tablet, and in Telegram at 844x390.
- **Landing:** Lighthouse 100/100/100/100. `test:hero`, `test:sections`, `test:stats`, `test:proxy` and a Worker dry run pass. After the FAQ rewrite, the landing build passed, `npm test` passed 21/21 and `test:sections` passed every check.

**Not verified (final QA was cancelled):** a whole-branch playthrough and the account flows end to end (QA-02), a final performance pass in landscape (QA-03), a whole-branch code review and security audit (QA-04), and a final full layout matrix on the finished branch.

## 3. Decisions worth knowing

The full log is in [DECISIONS.md](DECISIONS.md). The ones that change how you work or what you must do:

- **Two Workers, one cutover (ADR-0007, V6-023).** The legal pages live only in the landing build. Deploy the game and the landing in **one** workflow run: a game-only deploy makes `/terms`, `/privacy` and `/refunds` answer 404.
- **Workers Paid is required (V6-022).** PBKDF2 at 310,000 iterations takes about 25 ms of CPU locally, and the Free plan allows 10 ms. Production CPU is not measured yet; OWNER_ACTIONS has a probe for it.
- **No account wall for guests (V6-017).** Only online play asks you to sign in. A guest save uploads to the account at sign-up.
- **A security fix in linking (V6-053).** The original design let a single tap by a victim attach an attacker's account. Now the link must start on the web, and the Mini App can only complete a code whose signed start parameter matches. The day-1 rule (LINK-07) widens the one-tap case only for saves with day-1 progress, so at most day-1 progress can be lost.
- **Nicknames replace Telegram names in public (V6-011).** Public boards never carry ids.
- **Compact portrait is still v5 (V6-020, V6-066).** Phones in portrait look as they did in v5; only landscape, tablet and desktop changed.
- **Web payments show "Coming soon" (V6-084).** No provider has been chosen; the provider, prices, taxes and refunds are your decision.
- **Process rules that stay:** ports 6100–6199 for v6 work (V6-002); screenshots stay outside git (V6-076/078 capped them; the v6 cleanup removed the committed ones); never bypass the edit hook (V6-080).

## 4. Known open issues

**Flaky checks** ([qa/FLAKY.md](qa/FLAKY.md)). None of these is hidden with retries.

- **F5:** a layout text-overlap at 844x390 in battle; the check's own second run usually clears it.
- **F6:** smoke timeouts under heavy machine load. QA-SPEED fixed the main cause; the duel smokes still need watching.
- **F7:** a vitest settlement tap-area test runs close to its 30 s limit under load.
- **F11:** the server vitest suite sometimes hangs at 0% CPU, suspected to be an open workerd handle.
- **F12:** the account e2e's "a taken address gets the same Check your email" check fails at random under load; the cause is not found. The same script bursts the log-in rate limit, so wait 65 s between runs.

**Polish left for the cancelled final QA:**

- At 1920x1080 the battle hint reads "Tap a group…" even with a mouse, and the J keycap is clipped at the largest UI scale (V6-090).
- Camp's side-panel inspector probably traps keyboard focus, as the war panel used to (V6-091).
- About at 844x390 rises over the top bar because its content doesn't scroll, and confirm dialogs stay 200 wide (V6-093).
- After a rebuild, the arrow keys on the Duels mode switch move focus to the gear (V6-094).

**From the last stories:**

- **RSCR-06b:** in Telegram at 844x390 the Pass keeps vertical tier rows because the track doesn't fit. 1024x768 keeps two panes, and the market's sell form stays a side panel.
- **LINK-07:** the privacy notice is a **draft with `[…]` placeholders** (operator, contact, dates, retention, minimum age) and must not go live unsigned. The purchase retention number also appears in the game (`PURCHASE_RETENTION_YEARS`).
- **Bot username:** without one, web Link Telegram shows only a start code and a Copy button, with no QR code (OWNER_ACTIONS).

**Never run against production:** the PBKDF2 CPU probe, Cloudflare Email Service sending, Turnstile with real keys, and moving the bot in BotFather and the webhook. All are in OWNER_ACTIONS.

## 5. What was deliberately not done

- **Final QA (QA-01..04), cancelled by you.** No QA plan, whole-branch playthrough, performance pass, code review or security audit. This report is the documentation part of QA-05, with no milestone review or changelog.
- **RSCR-11, cancelled by you.** The Kit pages, Boot and BeastTrial get no landscape or tablet pass. The **legacy column** (the old portrait column some screens still fall back to) and the layout check's **pending allowlist** both stay.
- **GATE-03, not done.** The landing's width, reduced-motion and Lighthouse-budget gates are not wired into CI. The hero and sections checks do run in CI.
- **PLAT-07, not done.** The `src/platform/telegram.ts` shim stays, and so does its one remaining entry in the platform boundary allowlist.
- **Web payments** wait for your choice of provider.

## 6. Where things are

- **Code:** the local branch `v6` in the worktree `.claude/worktrees/v6`. It has **never been pushed**, merged to `main` or deployed. Going live means merging `v6` into `main` and running OWNER_ACTIONS part B.
- **What you must do:** [OWNER_ACTIONS.md](OWNER_ACTIONS.md), one ordered checklist.
- **Docs:** [DECISIONS.md](DECISIONS.md), [PROGRESS.md](PROGRESS.md), [qa/](qa/), story notes in [stories/](stories/) (the per-story screenshots that lived in `docs/v6/shots/` were removed in the v6 cleanup; they stay in git history and in the full sets below), the plan in [plan/SPRINTS.md](plan/SPRINTS.md), ADRs 0006–0013 in `design/adr/`, and the UX specs in `design/ux/`.
- **Full screenshot sets** (outside git): `.claude/worktrees/v6-shots/`, about 850 MB. Prune them when you no longer need them.
