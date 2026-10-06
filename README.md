# Pixelarrow

A mobile-first pixel-art formation tactics game set in the ancient
Mediterranean — locked shields, thrown javelins, flanks wheeling to meet
threats and lines that break when morale breaks. Lead a band of three heroes
across a procedurally generated coast in the manner of Mount & Blade: march
between towns and villages, hire men, buy gear, dodge or hunt bandits and
raiders, and raise your heroes through attributes, perk trees, battle
abilities and auras. Built with Phaser 3,
TypeScript and Vite, and designed to run as a **Telegram Mini App**
(it also runs in any browser).

**Play:** https://pixelarrow.app (sprite sheets:
https://pixelarrow.app/preview.html)

All art (soldiers, shields and emblems, grass, the world map, towns, UI,
font, icons, effects) is generated procedurally in code at startup.

| | | |
| --- | --- | --- |
| ![World map](docs/screenshots/13-world-map.png) | ![Encounter](docs/screenshots/14-encounter.png) | ![Abilities](docs/screenshots/18-battle-abilities.png) |
| ![Hero perks](docs/screenshots/17-hero-perks.png) | ![Town market](docs/screenshots/16-town-market.png) | ![Level up](docs/screenshots/19-level-up.png) |
| ![Deployment](docs/screenshots/04-deploy.png) | ![Battle](docs/screenshots/06-battle-contact.png) | ![Village](docs/screenshots/15-village.png) |
| ![Menu](docs/screenshots/01-menu.png) | ![Army](docs/screenshots/03-army-stash-compare.png) | ![Retreat](docs/screenshots/12-retreat-confirm.png) |

Game design and mechanics: [docs/DESIGN.md](docs/DESIGN.md). Where it is
going (online multiplayer, clans, Telegram Stars) and the invariants the code
keeps for that: [docs/ROADMAP.md](docs/ROADMAP.md).

## Run, build, test

Requires Node 22+ (vitest 5 needs 22.12+).

```bash
npm install
npm run dev        # dev server on http://localhost:5173 (also on your LAN)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ on http://localhost:4173
npm test           # vitest: determinism, combat rules, abilities/auras/cooldowns, world map, campaign, saves
npm run balance    # headless: 200 seeded bot-vs-bot battles, rule scenarios, ability/aura mirror tests
npx tsc --noEmit   # type-check only
```

Open the dev server on a phone (same Wi-Fi) or use the browser's device
toolbar in portrait mode. `http://localhost:5173/preview.html` shows the
procedural sprite sheets (it is also part of the production build).

### Deployment (Cloudflare)

`.github/workflows/deploy.yml` runs on every push to `main` (and manually via
*Run workflow*): `npm ci`, type-check, tests, `npm run build`, then
`wrangler deploy` publishes `dist/` as static assets of a Cloudflare Worker
(`wrangler.jsonc`) on the custom domain https://pixelarrow.app. It needs the
repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The
build uses a relative `base` (`./`), so it also works under a sub-path and
inside Telegram.

### Screenshots and smoke test

With a dev or preview server running and Playwright's Chromium available
(set `PLAYWRIGHT_BROWSERS_PATH` if your browsers live outside the default cache):

```bash
node scripts/screenshots.mjs http://localhost:5173/ docs/screenshots   # tour of every screen
node scripts/smoke.mjs http://localhost:5173/                         # real taps through the campaign loop
```

## Project layout

```
src/
  sim/        pure TS battle simulation (no Phaser): battle.ts, ai.ts, formation.ts, stats.ts, rng.ts, types.ts
  world/      pure TS overland campaign: map.ts (seeded map generator), path.ts (A*), world.ts (travel, bands, settlements), noise.ts
  data/       items.ts (all gear), traits.ts, perks.ts (attributes, perk trees, abilities, auras), units.ts (hero model), names.ts
  game/       campaign.ts, heroes.ts (factories, development), enemy.ts (bot and band armies), loot.ts, save.ts, armySpec.ts
  art/        procedural pixel art: paperdoll.ts, emblems.ts, ground.ts (iso tiles), iso.ts (projection), worldArt.ts (map, towns, bands), fx.ts (aura rings, stars, pips), font.ts, icons.ts, itemIcons.ts, uiTextures.ts
  ui/         Phaser UI kit (buttons, panels, meters, scroll lists), battleFx.ts (pooled battle effects), texture registration
  scenes/     Boot, Menu, World (map + encounters), Settlement, Army, Hero (skills), Battle (deployment + battle), Results
  platform/   telegram.ts (WebApp SDK wrapper), storage.ts (CloudStorage / localStorage)
  dev/        preview.ts (sprite sheet page), balance.ts (headless balance harness for `npm run balance`)
  state.ts    shared campaign state and persistence
tests/        vitest suites
scripts/      screenshot tour and touch smoke test (Playwright), balance runner
docs/         DESIGN.md, ROADMAP.md and screenshots
```

## Telegram Mini App setup

1. **Deploy the build.** The Cloudflare workflow above publishes it to
   **https://pixelarrow.app** — that is the URL to give BotFather.
   (Any other HTTPS static host works too: upload `dist/`; the build uses
   relative paths, so a sub-folder is fine. For local testing expose the dev
   server with a tunnel, e.g. `cloudflared tunnel --url http://localhost:5173`.)
2. **Create a bot** with [@BotFather](https://t.me/BotFather): `/newbot`,
   choose a name and username, keep the token.
3. **Create the Mini App:** in BotFather send `/newapp`, pick your bot, give a
   title, description and a 640×360 image, then enter the URL
   `https://pixelarrow.app`. BotFather
   returns a direct link like `https://t.me/<bot>/<app>`.
4. Optionally set the bot's **menu button** to open the game:
   `/mybots` → your bot → *Bot Settings* → *Menu Button* →
   `https://pixelarrow.app`.
5. Open the link in Telegram (mobile recommended).

What the game does inside Telegram (all optional, no-ops in a browser):

- Loads `telegram-web-app.js` only when launched from Telegram, then calls
  `ready()`, `expand()`, `disableVerticalSwipes()` (so drags don't close the
  app) and sets the header/background colour.
- Saves to **Telegram CloudStorage** (synced across the user's devices,
  chunked under the 4 KB value limit) and mirrors to localStorage.
- **Haptics** on orders, hits, deaths and routs (toggle in Settings).
- The native **BackButton** navigates back (Army → map or town, Hero → Army,
  map → Menu, deployment → map) and pauses/resumes during battle.

## Status

Milestone 2: an offline single-player campaign on a procedural overland map
(towns, villages, lairs, roaming bands, wounds), hero progression (attributes,
perk trees, battle abilities, auras) and the real-time formation battles of
milestone 1. See "Known gaps" in [docs/DESIGN.md](docs/DESIGN.md) and the
online plan in [docs/ROADMAP.md](docs/ROADMAP.md).
