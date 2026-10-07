# Handoff for the next session

Start here. This file summarises the state of Pixelarrow as of 2026-10-07 and
where to look for everything else.

## What it is

Pixelarrow is a Telegram Mini App at https://pixelarrow.app: a pixel-art
formation tactics game set in the ancient Mediterranean.

- **Client:** Phaser 3 + TypeScript (`src/`).
- **Backend:** a Cloudflare Worker (`server/`) with Hono, D1 and Durable
  Objects. It serves both the game files and the API.
- **Deploys:** every push to `main` runs the CI gates in
  `.github/workflows/deploy.yml` (typecheck, unit tests, server tests, layout
  check shards, smoke scripts), then deploys to Cloudflare and applies D1
  migrations.

## Read first

| Doc | What it covers |
|---|---|
| `docs/DESIGN_V2.md` | The authoritative design: seasonal hex war, beasts, classes, UI and UX rules, economy decisions, online battle rules |
| `docs/DESIGN.md` | How the systems work (sim, terrain, classes, beasts, economy, online) |
| `docs/ROADMAP.md` | What's done, the "Next session" backlog, and later ideas |
| `docs/UI_KIT.md` | UI components, patterns, colours, the layout-check rules, i18n |
| `docs/OPS.md` | Monitoring, analytics, admin panel, backups, operator secrets (if the ops work landed) |
| `server/README.md` | API, WebSocket protocol, economy, notifications, setup |

## Invariants (never break)

- `src/sim` stays pure and deterministic: a fixed 20 Hz tick, seeded RNG, and
  orders logged with their tick. The server re-runs battles to verify them,
  and old setups must replay identically (`tests/legacy.test.ts`).
- The online economy is server-owned.
- Every screen passes the layout check (`scripts/layout-check.mjs`): 5 phone
  sizes, with and without Telegram insets, EN and RU. The allowlist stays
  empty.
- Never edit existing D1 migrations; add a new file.
- All UI text goes through i18n (EN and RU).

## Built so far

- **Battles:** the deterministic sim with terrain, 18 classes, cavalry and
  chariots, animals, and 8 mythical beasts (6 lair beasts plus the Kraken and
  Titan world bosses).
- **Controls:** the slingshot formation gesture, the colour-coded battle
  panel, and the battle report.
- **Offline:** the campaign, the Beast trial, and a guided tutorial with a
  narrator.
- **Online seasonal hex war:** shards, neutral defenders, server-verified
  attacks, garrisons, clans with Telegram invites, live lockstep duels with a
  15 s deployment and no pause, beast lairs, world-boss raids with shared HP,
  and live army movement.
- **Economy:** Drachmae (Stars only buy Drachmae), shop, season pass, town
  marketplace with a 10% fee, and consumables.
- **UI:** the war-table hex map, the hero sheet, and the stash grid with
  5 rarity tiers.
- **Bot:** notifications, `/paysupport`, `/terms`, `/delete_my_data`, and the
  legal pages.
- **Other:** audio (procedural sound effects and music), Telegram full screen,
  safe areas and native Back.

## Needs the operator (human)

- Fill in the placeholders on the legal pages under `public/` (`grep -rn
  '\[[A-Z]' public/`) and review the texts.
- Set the ops secrets and variables listed in `docs/OPS.md`.
- Test on a real phone:
  - sound;
  - the feel of the slingshot gesture;
  - iPhone layout;
  - war-table frame rate;
  - a real 100-Star Drachmae purchase.
- Answer support and deletion requests, which land in the D1
  `support_requests` table and show in the admin panel.

## Lessons from this session

- **Usage limits:** running 3 or more agents in parallel hit the account
  usage limit twice. Keep it to 2 at a time.
- **Container restarts and usage limits stop agents.** Their worktrees under
  `.claude/worktrees/` survive, so resume rather than restart.
- **CI was slow:** the full layout check took about 45 minutes. It is now
  split into parallel shards; check the run times.
- **Flaky tests:** fix them at the root (two were real bugs). Never skip or
  loosen them.
