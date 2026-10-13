# Owner actions for v6

Steps only the owner can do. Each one has exact instructions.

1. Point the Telegram Mini App URL (BotFather) at https://play.pixelarrow.app after review. (The exact steps are added in Phase 8.)
2. Hosting cutover: follow the four cutover steps in design/adr/ADR-0007-hosting-two-workers.md (DNS and routes for play.pixelarrow.app and pixelarrow.app, the www→apex zone redirect rule, HSTS). The apex is unserved for about one CI job during cutover. (Final exact steps go in REPORT.md, Phase 8.)
3. Authorise Context7 (/mcp) if you want later runs to check library and Cloudflare docs live.
4. Accounts (ADR-0008): upgrade to Workers Paid if the Rate Limiting binding or the CPU limits need it. Onboard pixelarrow.app in Cloudflare Email Service (beta) and check SPF, DKIM and DMARC. Create a Turnstile widget for play.pixelarrow.app and set TURNSTILE_SITE_KEY and TURNSTILE_SECRET. Set PASSWORD_PEPPER and PASSWORD_PEPPER_ID as Worker secrets.
5. Legal: sign off the privacy notice text and the retention periods for purchase records and backups (ADR-0009).
