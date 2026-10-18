# Telegram bot images

Made from the app mark (a bronze Corinthian helmet with a red crest on a red-figure disc with a Greek-key ring;
prompt in [docs/playbook/PROMPTS_ART.md](../playbook/PROMPTS_ART.md) › App icon and mark). Rebuild with
`node scripts/art/appicons.mjs <raw mark>`; the raw is `docs/v5/gemini/AS-08/app_mark_1.jpg` in the main checkout.

Uploading is the owner's job, in a chat with @BotFather; no script uploads anything.

| File | Size | Where it goes |
| --- | --- | --- |
| `bot_userpic_640.png` | 640x640 PNG | Bot profile picture (`/setuserpic`), sent **as a photo**. Shown as a circle; the disc sits inside it with a margin on the backdrop colour `#14100c`, so nothing is cut. |
| `miniapp_cover_640x360.jpg` | 640x360 JPEG | The photo `/newapp` asks for, and the bot's description picture. The campaign fresco with the mark in the sky; no text. |

## Steps for the owner

1. `/setuserpic` › choose the bot › send `bot_userpic_640.png` as a photo.
2. `/mybots` › the bot › Edit Bot › Edit Description Picture › send `miniapp_cover_640x360.jpg` as a photo.
3. Only if you (re)create the Mini App with `/newapp`: send `miniapp_cover_640x360.jpg` for the 640x360 photo; skip
   the optional GIF.
4. Optional, not made here: the Mini App loading-screen icon (`/mybots` › the bot › Bot Settings › Configure Mini
   App › Configure Splash Screen). If BotFather asks for a vector (SVG) icon, the painted mark cannot be used and the
   default loading screen stays.

## What the sizes rest on

- core.telegram.org/bots/features and /bots/webapps document the commands above but give no pixel sizes.
- 640x360: BotFather's prompt for the description picture and `/newapp` (a GIF may be 320x180, 640x360 or 960x540),
  as quoted by third-party guides; BotFather's prompt wins if it differs.
- 640x640: Telegram keeps profile photos at up to 640x640 and draws them as a circle (common practice, not
  documented). Any square photo works.

## The web icons (for reference)

In `public/`, linked from `index.html` and `public/manifest.webmanifest`: `favicon.ico` (16, 32, 48),
`favicon-32.png`, `apple-touch-icon.png` (180, on `#14100c`), `icon-192.png` and `icon-512.png` (transparent),
`icon-maskable-512.png` (the disc inside the centred 80% safe circle, on `#14100c`). The favicons use the inner disc
only (no Greek-key ring) so the helmet reads at 16 px.
