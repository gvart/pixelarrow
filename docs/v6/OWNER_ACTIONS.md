# Owner actions for v6

Steps only the owner can do. Each one has exact instructions.

1. Point the Telegram Mini App URL (BotFather) at https://play.pixelarrow.app after review. (The exact steps are added in Phase 8.)
2. Hosting cutover: follow the four cutover steps in design/adr/ADR-0007-hosting-two-workers.md (DNS and routes for play.pixelarrow.app and pixelarrow.app, the www→apex zone redirect rule, HSTS). The apex is unserved for about one CI job during cutover. (Final exact steps go in REPORT.md, Phase 8.)
3. Authorise Context7 (/mcp) if you want later runs to check library and Cloudflare docs live.
4. Accounts (ADR-0008): upgrade to Workers Paid if the Rate Limiting binding or the CPU limits need it. Onboard pixelarrow.app in Cloudflare Email Service (beta) and check SPF, DKIM and DMARC. Create a Turnstile widget for play.pixelarrow.app and set TURNSTILE_SITE_KEY and TURNSTILE_SECRET. Set PASSWORD_PEPPER and PASSWORD_PEPPER_ID as Worker secrets.
5. Legal: sign off the privacy notice text and the retention periods for purchase records and backups (ADR-0009).
6. Privacy: decide the minimum player age and how long purchase records are kept (accounts UX Q8, ADR-0009).
7. PBKDF2 production check (V6-ACCT-01, before the first real sign-up; needs Workers Paid). This run measured locally only (docs/v6/qa/PBKDF2_SPIKE.md). On a machine logged in to the Cloudflare account, from `server/`:
   1. `npx wrangler deploy --config scripts/pbkdf2-probe/wrangler.jsonc` (creates the throwaway Worker `pixelarrow-pbkdf2-probe` on workers.dev; it has no bindings or secrets).
   2. Open `https://pixelarrow-pbkdf2-probe.<your-subdomain>.workers.dev/hash?iter=100000`, then `?iter=100001`, then `?iter=310000`, about 10 times each. Each must answer `{"ok":true,...}`. An `{"ok":false,...}` answer means production has a cap: note the error text.
   3. Dashboard → Workers & Pages → `pixelarrow-pbkdf2-probe` → Logs (Workers Logs are on): read the CPU time of the `iter=310000` requests. It must be under 60 ms.
   4. `npx wrangler delete --config scripts/pbkdf2-probe/wrangler.jsonc` to remove the Worker.
   5. If step 2 refused 310,000 or step 3 exceeded 60 ms, tell the next run: it lowers `PBKDF2_ITERATIONS` and `PBKDF2_SAFE_MAX` (server/scripts/pbkdf2-probe/limits.ts) to the highest passing count, at least 100,000, and updates ADR-0008 §2 and M-PW-1.
