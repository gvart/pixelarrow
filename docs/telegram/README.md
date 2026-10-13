# Telegram bot images

Made in AS-08 from the app mark (a bronze Corinthian helmet with a red crest on a red-figure disc with a Greek-key
ring; prompt in [docs/playbook/PROMPTS_ART.md](../playbook/PROMPTS_ART.md) › App icon and mark). Rebuild them with
`node scripts/art/appicons.mjs <raw mark>`; the raw is `docs/v5/gemini/AS-08/app_mark_1.jpg` in the main checkout.

Uploading is the owner's job, in a chat with @BotFather. Nothing here is uploaded by a script.

| File | Size | Where it goes |
| --- | --- | --- |
| `bot_userpic_640.png` | 640x640 PNG | The bot's profile picture: `/setuserpic`, pick the bot, send the file **as a photo** (not as a file). Telegram shows it as a circle; the disc sits inside that circle with a margin, on the game's backdrop colour `#14100c`, so nothing is cut. |
| `miniapp_cover_640x360.jpg` | 640x360 JPEG | The photo BotFather asks for when you create a Mini App with `/newapp` ("a photo, 640x360 pixels"); the same file also serves as the bot's description picture: `/mybots` › the bot › Edit Bot › Edit Description Picture. It is the campaign fresco with the mark in the sky; no text. |

## Steps for the owner

1. `/setuserpic` › choose the bot › send `bot_userpic_640.png` as a photo.
2. `/mybots` › the bot › Edit Bot › Edit Description Picture › send `miniapp_cover_640x360.jpg` as a photo.
3. Only if you (re)create the Mini App with `/newapp`: send `miniapp_cover_640x360.jpg` when BotFather asks for the
   640x360 photo; skip the optional GIF.
4. Optional, not made here: the Mini App loading-screen icon (`/mybots` › the bot › Bot Settings › Configure Mini
   App › Configure Splash Screen). BotFather's own prompt states the format it takes; if it asks for a vector (SVG)
   icon, the painted mark cannot be used as is, and the default loading screen stays.

## What the sizes rest on

- core.telegram.org/bots/features (read 2026-10-13): `/setuserpic` changes the profile picture; a photo or video
  can be added to the description with "Edit Description Picture"; the splash screen path above. It gives no pixel
  sizes.
- core.telegram.org/bots/webapps (read 2026-10-13): the Main Mini App and its preview media are set up in
  BotFather; no pixel sizes either.
- 640x360: BotFather's prompt for the description picture and for `/newapp` asks for a 640x360 photo (a GIF may be
  320x180, 640x360 or 960x540), as quoted by third-party bot guides (for example help.zenedu.io). Not on an
  official page; BotFather's prompt wins if it differs.
- 640x640: Telegram keeps profile photos at up to 640x640 and draws them as a circle; this is common practice, not
  a documented requirement. Any square photo works.
- Context7 (library docs) was not available in this session.

## The web icons (for reference)

In `public/`, linked from `index.html` and `public/manifest.webmanifest`: `favicon.ico` (16, 32, 48),
`favicon-32.png`, `apple-touch-icon.png` (180, on `#14100c`), `icon-192.png` and `icon-512.png` (transparent),
`icon-maskable-512.png` (the disc inside the centred 80% safe circle, on `#14100c`). The three favicon sizes use the
inner disc only (the helmet without the Greek-key ring) so the helmet still reads at 16 px.
