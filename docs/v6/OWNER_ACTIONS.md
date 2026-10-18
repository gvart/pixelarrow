# Owner actions for v6

Steps only the owner can do, as one go-live checklist. Do them in order: each
part assumes the parts above it are done. Nothing here was run by the v6 agents
(no deploy, no workflow run, no Cloudflare or BotFather change).

The two hosts (ADR-0007): the game and its API on `https://play.pixelarrow.app`
(Worker `pixelarrow`, `wrangler.jsonc`); the landing page and the legal pages on
`https://pixelarrow.app` and `www` (Worker `pixelarrow-landing`,
`landing/wrangler.jsonc`).

## A. Before go-live (any time; nothing goes offline)

1. **Legal and privacy sign-off** (was items 5 and 6; ADR-0009 §8; V6-LINK-07).
   The privacy notice draft is `landing/public/privacy.html` and
   `landing/public/ru/privacy.html` (sections 1–11, marked "Draft — pending
   owner sign-off"). Every value only you can decide is a visible `[…]`
   placeholder there.
   1. Fill in the operator name and address/country, the privacy contact email
      and the effective date (both languages).
   2. Confirm how long purchase records are kept after an account is deleted
      (proposed **5 years**; accounts UX Q8). The game says the same number on
      the Delete account screen: if it changes, change
      `PURCHASE_RETENTION_YEARS` in `src/ui/account/deletion.ts` too.
   3. Confirm how long D1 backups are kept (proposed **30 days**) and how long
      support requests are kept after they are resolved (`[N months]`).
   4. Decide the **minimum player age** (13 or 16; it must also respect
      Telegram's terms) and put it in section 9 of both pages. The sign-up form
      has a key for an age line (`auth.signup.age`) if you want it shown there
      too.
   5. Decide which language prevails if the English and Russian texts differ
      (section 11).
   6. Read the whole notice in both languages and remove the draft line once it
      is signed off.
   7. Sign off the other legal pages' wording (`landing/public/terms.html`,
      `refunds.html` and their `landing/public/ru/` copies), including the URL
      fix to "Mini App at play.pixelarrow.app" (V6-024).
2. **Cloudflare plan** (was item 4). Upgrade to Workers Paid if the Rate Limiting
   binding (`RL_LANDING_PUBLIC` and the account limits) or the CPU limits need
   it. Step 3 needs it.
3. **PBKDF2 production check** (was item 7; V6-ACCT-01, before the first real
   sign-up; needs Workers Paid). This run measured locally only
   (docs/v6/qa/PBKDF2_SPIKE.md). On a machine logged in to the Cloudflare
   account, from `server/`:
   1. `npx wrangler deploy --config scripts/pbkdf2-probe/wrangler.jsonc` (creates
      the throwaway Worker `pixelarrow-pbkdf2-probe` on workers.dev; it has no
      bindings or secrets).
   2. Open `https://pixelarrow-pbkdf2-probe.<your-subdomain>.workers.dev/hash?iter=100000`,
      then `?iter=100001`, then `?iter=310000`, about 10 times each. Each must
      answer `{"ok":true,...}`. An `{"ok":false,...}` answer means production has
      a cap: note the error text.
   3. Dashboard → Workers & Pages → `pixelarrow-pbkdf2-probe` → Logs (Workers
      Logs are on): read the CPU time of the `iter=310000` requests. It must be
      under 60 ms.
   4. `npx wrangler delete --config scripts/pbkdf2-probe/wrangler.jsonc` to
      remove the Worker.
   5. If step 2 refused 310,000 or step 3 exceeded 60 ms, tell the next run: it
      lowers `PBKDF2_ITERATIONS` and `PBKDF2_SAFE_MAX`
      (server/scripts/pbkdf2-probe/limits.ts) to the highest passing count, at
      least 100,000, and updates ADR-0008 §2 and M-PW-1.
4. **Accounts setup** (was item 4; ADR-0008).
   1. Onboard pixelarrow.app in Cloudflare Email Service (beta) with the sender
      `noreply@pixelarrow.app` (the `EMAIL` binding only allows that address;
      V6-045), and check SPF, DKIM and DMARC.
   2. Create a Turnstile widget for `play.pixelarrow.app` (mode Managed). Its
      secret key goes to the Worker in step 4.4. Its site key is public: set it
      as the GitHub Actions repository variable `TURNSTILE_SITE_KEY` (Settings →
      Secrets and variables → Actions → Variables). The deploy workflow passes it
      to the client build as `VITE_TURNSTILE_SITE_KEY` (V6-ACCT-05). Without it a
      production build shows "The security check didn't load" on the web forms.
   3. Confirm the Rate Limiting namespace ids `6001` (`RL_AUTH_IP`), `6002`
      (`RL_TG_AUTH_IP`) and `6003` (`RL_PUBLIC_IP`) in `wrangler.jsonc` are not
      used by another Worker in the account. If one is taken, tell the next run to pick free ids.
   4. Set the game Worker secrets, from `server/`:
      `npx wrangler secret put <NAME> --config ../wrangler.jsonc` for
      `TURNSTILE_SECRET` (that is,
      `npx wrangler secret put TURNSTILE_SECRET --config ../wrangler.jsonc`),
      `PASSWORD_PEPPER` and `PASSWORD_PEPPER_ID`.
5. **GitHub setup: the landing deploy and Telegram links** (was item 10 and a C item; V6-025).
   1. Settings → Environments → **New environment** `production-landing` (the
      `landing-deploy` job uses it; add the same protection rules as
      `production` if it has any).
   2. Settings → Secrets and variables → Actions → **Variables** →
      `PUBLIC_TELEGRAM_URL` = `https://t.me/<bot>/<app>` (from BotFather
      `/myapps`). Until it is set, "Open in Telegram" on the landing opens
      telegram.org. Or give the bot username to the next run.
   3. Check the `CLOUDFLARE_API_TOKEN` covers the `pixelarrow.app` zone for
      Workers custom domains (it already deploys the game's custom domain; the
      landing adds `pixelarrow.app` and `www.pixelarrow.app` on the same zone).
   4. Settings → Secrets and variables → Actions → **Variables** →
      `TELEGRAM_BOT_USERNAME` (and `TELEGRAM_APP_NAME` if the Mini App short
      name isn't `play`), so Telegram invites use t.me deep links (V6-PLAT-05;
      the deploy workflow passes it to the client build as `VITE_TELEGRAM_BOT`).
      Until then, invites fall back to the `https://play.pixelarrow.app` link.
   5. **Dev bot username** (V6-LINK-06/07). Web "Link Telegram" builds its
      t.me link and QR code from the server's bot username: the
      `TELEGRAM_BOT_USERNAME` Worker var, else `getMe` with the bot token. A
      local or dev server with neither (for example `wrangler dev` without a
      bot token) shows only the `link_<code>` start code and Copy. To test
      linking end to end, put your dev bot's username in
      `TELEGRAM_BOT_USERNAME` in `server/.dev.vars`; never point it at the
      production bot.
6. **Local dry runs** (no deploy). From `landing/`: `npm ci && npm run build &&
   npm run dry-run`. From `server/`: `npx wrangler deploy --dry-run --config
   ../wrangler.jsonc`. Both must pass.

## B. Cutover (one sitting, in this order)

The apex is unserved for about the length of one CI job in step 7. There are
no live users (V5-074), so this is accepted.

7. **Deploy both sites in one workflow run** (was items 2 and 8; ADR-0007
   cutover step 3; V6-023). Merge `v6` into `main` and push, or run
   *Actions → Deploy → Run workflow* on `main` with `target: both`. In one run:
   the game and landing checks pass, `deploy` moves the game Worker to
   `play.pixelarrow.app` (the committed config), then `landing-deploy` puts the
   landing Worker on `pixelarrow.app` and `www`.
   - **Do not deploy the game alone first**, and skip ADR-0007's temporary
     "game on both domains" step: the legal pages now live only in the landing
     build, so a game-only deploy that still held the apex would answer 404
     for `/terms`, `/privacy` and `/refunds` (V6-023). The old Mini App URL on
     the apex keeps working without it: the landing redirects `?startapp=` to
     play, and its page sends Telegram launches (`#tgWebApp...`) to play.
   - If `landing-deploy` fails because `pixelarrow.app` is still attached to the
     game Worker: Dashboard → Workers & Pages → `pixelarrow` → Settings →
     Domains & Routes → remove `pixelarrow.app`, then *Run workflow* with
     `target: landing`.
   - If anything else fails, the landing waits; fix and re-run. Rollback is in
     docs/OPS.md "Rollback".
8. **Check the hosts**:
   - `curl https://play.pixelarrow.app/api/health` answers ok;
   - `curl -sI https://pixelarrow.app/` is 200, and `/terms`, `/privacy`,
     `/refunds`, `/ru/terms` are 200;
   - `curl -sI "https://pixelarrow.app/?startapp=test"` is a 302 to
     `https://play.pixelarrow.app/?startapp=test`;
   - `curl -s https://pixelarrow.app/api/public/v1/summary` answers JSON (or
     `503` with `{"state":"unavailable"}` if the public API has no data yet).
9. **Telegram: point the bot at play** (was items 1 and 9; ADR-0007 cutover
   step 2; V6-024). Do it right after step 7: until then Telegram sends bot
   updates to the apex, which no longer runs the game Worker (Telegram retries
   them for a while).
   1. @BotFather → `/myapps` → the app → **Edit Web App URL** →
      `https://play.pixelarrow.app`.
   2. @BotFather → `/mybots` → the bot → *Bot Settings* → **Menu Button** → URL
      `https://play.pixelarrow.app`.
   3. Re-register the webhook on play (the command menu is set too):
      `TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node server/scripts/bot-setup.mjs`
      (or the `setWebhook` curl in server/README.md "One-time setup checklist"
      step 5). Then
      `curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"`
      must show `https://play.pixelarrow.app/api/telegram/webhook` and no
      `last_error_message`.
   4. If web linking uses the Telegram Login Widget (ADR-0009): @BotFather →
      `/setdomain` → `play.pixelarrow.app`.
   5. Open the Mini App from Telegram (phone and Telegram Web) and check it
      loads the game and signs in.
10. **Zone rules** (was item 2; ADR-0007 cutover step 4). Cloudflare dashboard →
    the `pixelarrow.app` zone:
    1. Rules → Redirect Rules → **Create rule** (Single Redirect): when
       *Hostname equals* `www.pixelarrow.app`, *Dynamic* URL
       `concat("https://pixelarrow.app", http.request.uri.path)`, status 301,
       *Preserve query string* on. Check:
       `curl -sI https://www.pixelarrow.app/terms` is a 301 to
       `https://pixelarrow.app/terms`.
    2. SSL/TLS → Edge Certificates → **HTTP Strict Transport Security** →
       enable with max-age 6 months, *Include subdomains* on (play is HTTPS
       too), *Preload* off until the setup has run a few weeks.

## C. Later

11. **Authorise Context7** (`/mcp`) if you want later runs to check library and
    Cloudflare docs live (was item 3).
