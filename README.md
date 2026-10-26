# Pixelarrow

A pixel-art browser war set in the ancient Mediterranean: four alliances fight
a season-long war for one continent of hand-made regions, with real-time
battles of soldiers you recruit, train and equip. Built with Phaser 3,
TypeScript and Vite; the backend is a Cloudflare Worker with Durable Objects
and D1.

**Play:** https://play.pixelarrow.app · **Site:** https://pixelarrow.app

## Docs

- [docs/WAR.md](docs/WAR.md): the living rules of the global war.
- [docs/impl/global-war-rebuild.md](docs/impl/global-war-rebuild.md): the
  war rebuild plan and its status.
- [docs/ART_STYLE.md](docs/ART_STYLE.md): the art style.
- [docs/OPS.md](docs/OPS.md): monitoring, analytics, backups, restore, the
  admin panel.
- [docs/ROADMAP.md](docs/ROADMAP.md): architecture, invariants and open
  items.
- [docs/playbook/](docs/playbook/README.md): the prompts and lessons behind
  the art, scenarios and agent runs.
- [server/README.md](server/README.md): the backend and its API.

## Run, build, test

Requires Node 22.12+.

```bash
npm install
npm run dev          # dev server on http://localhost:5173 (also on your LAN)
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ on http://localhost:4173
npm test             # vitest: correctness only, no wall-clock asserts (heavy files in the 'scenario' project)
npm run perf:war     # war sim time budgets (tests/perf, median of 5 after warm-up); run on a quiet machine
npm run balance:war  # the war's crafting and landmark balance report
npx tsc --noEmit     # type-check only
```

`/sandbox.html?region=<id>` opens a war region (`src/war/view/main.ts`),
`/world.html` the world map (`src/war/world-view/main.ts`).

### The server locally

The client talks to the Worker in `server/` on the same origin (`/api/*`,
`/ws/*`).

```bash
npm run build                          # wrangler serves dist/ too
cd server && npm ci && cp .dev.vars.example ../.dev.vars && npm run migrate:local
npm run dev                            # wrangler dev on http://localhost:8787 (game + API)
cd .. && npm run dev                   # vite on :5173, proxies /api and /ws to :8787
```

With `DEV_AUTH=1` in `.dev.vars` the war pages sign in as a dev player
(`POST /api/auth/telegram { dev }`). `API_PROXY=http://host:port` changes the
proxy target.

### Deployment

Two sites, two Cloudflare Workers (ADR-0007): the game and its API on
https://play.pixelarrow.app (`wrangler.jsonc`), and the landing page with the
legal pages on https://pixelarrow.app and www (`landing/`, its own
`landing/wrangler.jsonc`).

`.github/workflows/deploy.yml` runs on every push to `main` (and by hand,
with `target`: `both`, `game` or `landing`). A `changes` job looks at the
paths a push touched, and only that site's jobs run:

- **Game:** **build** (type-check, unit tests, `vite build`) and **server**
  (type-check, tests in workerd). When both pass, **deploy** applies the D1
  migrations and `wrangler deploy` publishes `dist/` as static assets of the
  game Worker.
- **Landing:** **landing-build** (type-check, Worker tests, `astro build`)
  and **landing-test** (hero and sections checks), then **landing-deploy**
  publishes `landing/dist` with the landing Worker.

When both changed, they go live together: the game deploy also waits for the
landing checks, and the landing deploys right after it. Deploys need the
repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; the
backend setup is in server/README.md "One-time setup checklist", and the
go-live order is in docs/OPS.md "Go-live".

## Audio

All sound is synthesised at run time with the Web Audio API (`src/audio/`):
procedural effects and looping modal music. The war's sounds are mapped in
`src/war/view/sound/`.

## Project layout

```
src/
  war/        the global war: sim, region and world views, HUD, net client, regions and world data
  sim/        RNG, stats and the sim version the war shares
  data/       classes, items, perks, traits, professions, recipes, war bosses, landmarks and lore
  game/       hero generation (heroes.ts)
  art/        the sprite sheet manifest format (sheetManifest.ts)
  assets/     the PixelLab sprite sheets
  audio/      procedural Web Audio
  ui/         theme.ts (the war's colours) and legal.ts
  platform/   analyticsSchema.ts (shared with the server) and the Turnstile widget of the /auth pages
auth/         the standalone email-link pages (/auth/*)
server/       the Cloudflare Worker (API, Durable Objects, D1 migrations), see server/README.md
landing/      the landing site pixelarrow.app: Astro build, its own Worker and wrangler.jsonc (ADR-0007)
tests/        vitest suites (tests/war: the war)
scripts/      war tools (scripts/war), the art pipeline (scripts/art)
docs/         design and operations docs (see "Docs")
```

## Legal pages: operator action required

The terms, privacy and refunds pages live in the landing build
(`landing/public/`) and are **drafts, not legal advice**. Before relying on
them, review every text and fill in every placeholder (`[OPERATOR NAME]`,
`[CONTACT EMAIL]`, `[JURISDICTION]`, ...).
