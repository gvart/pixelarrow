# Owner actions for v6

Steps only the owner can do. Each one has exact instructions.

1. Point the Telegram Mini App URL (BotFather) at https://play.pixelarrow.app after review. (The exact steps are added in Phase 8.)
2. Hosting cutover: follow the four cutover steps in design/adr/ADR-0007-hosting-two-workers.md (DNS and routes for play.pixelarrow.app and pixelarrow.app, the www→apex zone redirect rule, HSTS). The apex is unserved for about one CI job during cutover. (Final exact steps go in REPORT.md, Phase 8.)
3. Authorise Context7 (/mcp) if you want later runs to check library and Cloudflare docs live.
