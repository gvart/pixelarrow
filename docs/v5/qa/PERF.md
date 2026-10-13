# QA-05: performance profile (v5)

- **Date:** 2026-10-13
- **Build:** `v5` @ e3a5132 ("before") and this branch ("after"); the P4 baseline build is `v5` @ b829290, the 3.90 build P4 measured (its main chunk is 3,102,072 B, as P4 recorded).
- **Skills:** perf-profile, performance-optimization; agent definition performance-analyst.
- **Verdict:** **COMPLETE.** Sheet open and battle FPS are no worse than the P4 baseline on the phone proxy (GPU, 4x and 6x CPU throttle) after the fixes below. Software GL battle FPS is still below P4: see "Risks that remain", item 1.

## Budgets

`project.yaml` sets no `performance.*` keys, so `performance.enforce` is the default `warn` and there is no frame, memory or draw-call budget. The story's bar is relative: **no worse than the P4 baseline**. Absolute headroom is **NOT ASSESSED — no budget set**.

| Metric | Budget | After | Status |
| --- | --- | --- | --- |
| First sheet open | ≤ P4 (333 ms GPU 4x, 353 ms GPU 6x) | 264 ms / 269 ms | OK |
| Battle FPS, 20 men | ≥ P4 (59.9 GPU 4x, 57.7 GPU 6x) | 59.9 / 60.0 | OK |
| Bundle | delta recorded | main −799 kB | recorded |
| Frame time, memory, draw calls | none set | see tables | NOT ASSESSED (no budget) |

## Method

All three builds were built from source on this machine and served with `vite preview`: P4 baseline on :8317, before on :8316, after on :8315. The bench was run for the three builds back to back for each configuration, so load drift hits all three alike. The machine was not idle: other agents ran, and the load average was 3.5–10 during the runs.

- **Bench:** `node scripts/dev/perf-bench.mjs <url> [--gpu] --rate N --runs 3 [--battles 10] [--men 20]`. It follows P4's `docs/v5/spike/p4/bench.mjs` (same hub, sheet and battle steps) and adds the following:
  - boot time (the Boot scene running);
  - frame-time percentiles and long frames;
  - the JS heap after a forced GC once the 1st and the 10th battle end;
  - a 20-man army.
- **Device profiles:**
  - Phone viewport 390x844 CSS at DPR 2 (canvas 780x1688), touch, mobile, `/api` answering 503 (offline).
  - **GPU** is Chromium with Metal ANGLE plus DevTools CPU throttling, the phone proxy P4 used. The throttle reaches the main thread only.
  - **SW** is SwiftShader (software GL). It runs in the GPU process, which is not throttled, so it measures raster and upload cost more than script cost.
- **Throttles:** GPU 4x, GPU 6x, SW 4x. P4's own protocol (a fresh campaign with no recruits) was also run at GPU 4x.
- **Hub open:** from navigation until the Menu scene is active and two frames have drawn. Network is local, so this is parse, boot and texture work.
- **Sheet open:** `openSettings()` until the close button holds still for 2 frames. "Cold" is the first open in the session; "warm" is the second.
- **Battle:** the army is recruited up to 20 men, the field takes 12, and the enemy fields 19–20. A fresh skirmish starts, "advance" is ordered, and frames are counted for 6 s after a 1.5 s settle.
  - Offline battles now pause themselves on events (RD-02). The bench unpauses every frame so that a fight is measured, not a paused screen. A first run without this measured a paused battle.
  - p50 FPS = 1000 / median frame time. p5 FPS = 1000 / 95th-percentile frame time. A long frame is longer than 50 ms.
- **Leak check:** in one session, 10 battles, each 3 s of fighting and then back to the menu. The heap is read after a forced GC (`HeapProfiler.collectGarbage`, `Runtime.getHeapUsage`).
- **Profiles:** CDP `Profiler` on unminified builds of the after and P4 builds. Battle: 5 s at 6x. Boot: navigation to the hub at 4x.

Values are medians of 3 runs; raw samples are in the bench output (not committed).

## Results against the P4 baseline

### GPU, 4x CPU throttle (phone proxy), 20 men

| Metric | P4 baseline | Before | After | After vs P4 |
| --- | --- | --- | --- | --- |
| Boot (Boot scene up), ms | 744 | 794 | 774 | +4% |
| Hub open, ms | 2304 | 2483 | **1948** | −15% |
| First sheet open (cold), ms | 333 | 288 | **264** | −21% |
| Second sheet open (warm), ms | 297 | 263 | 246 | −17% |
| Battle FPS (mean) | 59.9 | 58.4 | **59.9** | = (vsync cap) |
| Battle FPS p50 / p5 | 59.9 / 59.9 | 59.9 / 59.5 | 59.9 / 59.9 | = |
| Long frames (> 50 ms) in 6 s | 0 | 0 | 0 | = |
| Heap after battle 1 → 10, MB | 13.4 → 16.2 | 14.8 → 17.0 | 15.2 → 17.1 | same growth |

### GPU, 6x CPU throttle, 20 men

| Metric | P4 baseline | Before | After | After vs P4 |
| --- | --- | --- | --- | --- |
| Boot, ms | 1065 | 1090 | 1073 | +1% |
| Hub open, ms | 3245 | 3433 | **2802** | −14% |
| First sheet open, ms | 353 | 308 | **269** | −24% |
| Second sheet open, ms | 326 | 281 | 246 | −25% |
| Battle FPS (mean) | 57.7 | **41.3** | **60.0** | +4% |
| Battle FPS p50 / p5 | 59.9 / 59.5 | 59.9 / **29.9** | 59.9 / 59.5 | = |
| Long frames in 6 s | 1 | 1 | 0 | better |

### SwiftShader (software GL), 4x CPU throttle, 20 men

| Metric | P4 baseline | Before | After | After vs P4 |
| --- | --- | --- | --- | --- |
| Hub open, ms | 2170 | 2380 | 2227 | +3% |
| First sheet open, ms | 538 | 482 | 463 | −14% |
| Second sheet open, ms | 473 | 469 | 417 | −12% |
| Battle FPS (mean) | 23.8 | 15.4 | 18.0 | **−24%** |
| Battle FPS p50 / p5 | 20 / 15 | 15 / 12 | 20 / 12 | p50 =, p5 −3 |
| Long frames in 6 s | 15 | 73 | 51 | worse |

### P4's own protocol (fresh campaign, GPU 4x)

| Metric | P4 baseline | Before | After |
| --- | --- | --- | --- |
| Men on the field | 3 + 4 | 8 + 7 | 8 + 8 |
| Hub open, ms | 2184 | 2462 | 1910 |
| First / second sheet open, ms | 334 / 310 | 287 / 262 | 250 / 245 |
| Battle FPS (mean, p5) | 60.1, 59.9 | 59.8, 59.5 | 60.1, 59.5 |

The P4 numbers in `docs/v5/spike/P4.md` were taken under a parallel layout check: hub 914 ms, sheet 473 ms, battle 25.6 fps at GPU 4x. They are not comparable with today's machine, which is why the baseline build was rebuilt and measured again here.

## Bundle and asset sizes

| Item | P4 baseline | Before | After |
| --- | --- | --- | --- |
| `main` chunk | 3,102,072 B (938.6 kB gzip) | 3,541,702 B (1,087.0 kB gzip) | **2,742,800 B (830.8 kB gzip)** |
| `lazyScenes` chunk (new) | – | – | 807,793 B (261.6 kB gzip) |
| `parchmentWorker` | – | 476,673 B | 476,673 B |
| `paperdoll` | – | 176,159 B | 176,159 B |
| `public/icons/ui.*` loaded at boot | ui.png 623 KB (pre-AS-07) | ui.png 1,123,009 B | **ui.webp 594,796 B** (PNG kept as fallback) |
| `public/icons/items.*` loaded at boot | – | items.png 642,263 B | **items.webp 554,396 B** |
| `dist/` total | 5,363,169 B | 8,898,616 B | 10,056,998 B (the WebP twins; the PNGs stay as fallback) |

- What a normal start downloads: JS 3,541,702 → 3,550,593 B (main plus lazyScenes; +0.3%), and icon atlases 1,765,272 → 1,149,192 B (−35%). Net about −607 KB.
- What is in the chunks: `node scripts/dev/bundle-stats.mjs`. After the split, Phaser is 55% of `main` (2,548 KiB of the rendered code before minification). The biggest app modules are BattleScene (154 KiB), sim/battle (96), itemIconsHD (94) and WorldScene (56). In `lazyScenes`, westmed.json is 41% (513 KiB), and DuelScene is 117 KiB.

## Findings and fixes

| # | Finding (measured) | Fix | Commit |
| --- | --- | --- | --- |
| 1 | **Battle FPS regression.** GPU 6x: 41–51 fps with p5 29.9 (P4: 57.7, p5 59.5). The battle profile put 56% of the main thread in earcut; P4 had 31%. Phaser 3's WebGL Graphics turns every `arc` into 101 points whatever its radius, and re-triangulates filled paths every frame. The group cards (two bars of three 1.2 UI px rounded rects, redrawn per frame), the numeral plates and the top bar cost about 4 ms a frame at 1x. | `src/platform/fastArcs.ts`: `Graphics#arc` records as many chords as the radius needs (sagitta ≤ 0.25 device px at 12 device px per unit, at most 100). The battle HUD's Graphics fell to about 0.4 ms a frame; the main thread is 70% idle at 6x. DPR 3 shots before and after look the same: `docs/v5/qa/perf/*-battle-hud-dpr3.jpg`. | 168dfbb |
| 2 | **Hub open +8% vs P4.** The boot profile (4x): `registerUiAssets` took 1.28 s against 0.96 s. Phaser's `CanvasTexture` constructor reads every canvas back (`getImageData`), which cost 730 ms self time. v5 registers 433 canvas textures by the hub. | `src/platform/staticCanvas.ts`: `addCanvas` registers a plain Texture over the canvas. Canvases from Phaser's CanvasPool (`createCanvas` live atlases, Text, TileSprite) keep the CanvasTexture. | 168dfbb |
| 3 | The light and dim icon looks recoloured every pixel through `Math.pow` and a new array per pixel, on a GPU canvas read back (`recolour`, 435 ms self after fix 2). | A 4096-step table per look, within one colour level (tested), on a `willReadFrequently` canvas. `recolour` dropped to 189 ms. | 5bdab67 |
| 4 | **ui.png 1,123 KB** (AS-07's 14 painted 160 px cells). The cells are needed at that size: a hub tile is 26.4 UI px, 158 device px on a 3x phone. A separate on-demand atlas would not help either, because the hub tab bar and hub tiles show 6 of them on the first screen. Re-encoding the PNG with adaptive filters made it bigger (1,290 KB). | WebP twins: ui.webp is near-lossless 60 (every channel within 2/255; measured max diff 2), and items.webp is pixel-identical. BootScene loads the WebP and reloads an atlas from its PNG when the WebP fails to load or decode. That was checked with the WebP routed to 404 and to garbage: both atlases present, no page error. `scripts/art/webp.mjs` plus `webp-lock.json` and a test keep the twins in step; `atlas.mjs` runs it when shipping, and `preview.mjs` overrides both URLs. Art check: 47 PASS, 0 FAIL, 31 NOT ASSESSED (atlas frames have no own file), 0 warnings. In-game look at DPR 3: tab bar and hub tiles are identical to before (`docs/v5/qa/perf/*-hub-*-dpr3.jpg`). | 5bdab67, 4f02383 |
| 5 | **Main chunk 3,541 kB.** | 11 scenes the app never opens first on a normal start, and what only they import, go to a second chunk: Online, OnlineArmy, OnlineClan, Merchant, Duel, Kit, Shop, Market, BeastTrial, Camp, Codex, with westmed.json. `main.ts` starts the download with the game, and `BootScene.route` awaits it before the first screen. Every scene key therefore exists before anything can start one: deep links, a rejoined duel, the tests. A failed load shows Boot's Retry. | fe85831 |
| 6 | **Art check warning:** `public/ui/busts` and `public/ui/beasts` reported as orphans. Their 29 files already had entries (ART-012..032, 036..043) and PASS; the scan listed folders as files. | The orphan scan walks subfolders. A stray copied bust is flagged (watched fail). | 8572316 |
| 7 | **replay-hash** asked for webkit-2215, which is not installed, so WebKit was NOT RUN by default. | Order: `PW_WEBKIT_PATH`, then the expected revision if present, then the newest installed `webkit-*` (`pw_run.sh`). Now chromium 13/13 and webkit (26.0) 13/13 with no env var. | 1419446 |
| 8 | **Smoke flake "shield basher in contact".** Root cause: the staging ran the AI for up to 90 s, waiting for a foe to enter the basher's bash range and front arc. Run off the browser over 120 raider bands, the same staging failed 37 times, two ways:<br>• 15 times the band's men routed one by one on their own morale and the field emptied. 6eafb43's `retreatAt: 0` stops only the bot's withdrawal.<br>• 22 times the basher stood behind his own front rank for the whole run. | Contact is staged, not waited for. Nobody falls, breaks or withdraws, and the nearest standing foe is put one pace ahead of the basher. The same staging off the browser fails 0 of 120. Smoke ALL PASS 3 of 3 runs. | d5c6961 |

### WebGL context loss

`node scripts/dev/context-loss.mjs <url>` uses `WEBGL_lose_context` to lose the context for 1 s and restore it, in four places:

- on the hub, then opens a sheet;
- mid-battle, unpaused;
- while the World map is built with no context;
- while the Army screen is built with no context.

It checks four things: no page error, the loop kept running, the battle went on (tick 51 → 137), and the hub draws the same screen after the restore (100.0% equal pixels).

Result: **ALL PASS on both the before and the after build. Nothing broke, so there was nothing to fix.** Phaser 3.90 re-creates every texture from its canvas or image source on restore. That includes the plain Textures of fix 2 and the live `createCanvas` atlases.

The "glTexture null" page errors seen under load were the hit-stop frame case FIXER-7 fixed (f9063cd). A real context loss does not reproduce them.

### Opt-in army-bust screens

`layout-check --screens army-bust-<21 classes> --no-shots`, run by name at all 24 configurations (6 sizes, en and ru, plain and Telegram insets): **0 violations, 0 new, no page errors** (191 s).

## Risks that remain

1. **Software-GL battle FPS is below P4: 18.0 against 23.8 at SW 4x, with 51 long frames against 15.** It is a GPU-side cost, not a script cost:
   - The CPU throttle does not reach SwiftShader.
   - Draw calls are the same (6 against P4's 5 per frame), and vertices are lower (10.8k against 35.9k).
   - Texture uploads are higher: 0.18 a frame against 0.04. These are lazy doll-atlas `refresh()` calls, each re-uploading a whole atlas canvas.
   - v5's HUD and battle art also cover more pixels than P4's did.

   Phones render on a GPU, where the phone proxy is at P4 or better, so this matters only for devices that fall back to software GL. Next steps, about 1 d:
   - pre-draw the doll columns a battle will need before the fight starts, or upload only the dirty rectangle (`texSubImage2D`);
   - then measure on a mid-range Android phone inside Telegram. No phone measurement exists yet; that was also P4's open item.
2. **The second chunk is awaited at boot.** The total JS a normal start downloads is the same (+0.3%). The win is a smaller parse before Boot can run, not fewer bytes. True on-demand loading would need placeholder scenes. Every `scene.start('Online')` caller and test would have to wait for a load, which is a larger change than this story.
3. **Engine patches.** `fastArcs` and `staticCanvas` patch Phaser 3.90 prototypes. Both are unit-tested and covered by every smoke and layout run. An engine upgrade must re-check them: Phaser 4 has its own Graphics path (ADR-0003).
4. **The WebP pipeline needs cwebp** (libwebp) to ship an atlas. Without it `atlas.mjs` fails loudly, and the lock test fails if a PNG ships alone.
5. **Bigger wins not taken:**
   - a Phaser build without Arcade/Matter physics, which the game does not use (about 180 kB minified);
   - loading only the active language's i18n (about 170 kB of the rendered code).

   Both are possible, but Phaser's npm `module` entry is the prebuilt ESM bundle, so either needs a custom entry or a build alias.
6. **Heap:** about +2 MB from battle 1 to battle 10 in all three builds, P4 included. There is no new leak, but the growth was not traced.

## Gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 129 files, 1538 passed |
| `npx vite build` | OK (main 2,742.80 kB, lazyScenes 807.79 kB) |
| server `tsc --noEmit`, `vitest run` | 0 errors; 38 files, 303 passed |
| `npm run balance` | identical to `v5` @ e3a5132, line for line apart from the run time |
| `node scripts/replay-hash.mjs` | chromium 13/13, webkit 13/13, no env vars |
| layout-check (full, `--no-shots`, :8315) | PASSED: 24 configs x 196 screens, 48 known (allowlisted) distinct violations, **0 new** (2671 s) |
| army-bust opt-in screens (21, by name) | 24 configs, 0 violations |
| smoke | ALL PASS, 3 of 3 runs ("shield basher in contact" ready at t 0.2-0.25 s) |
| tutorial-smoke, duel-smoke, fullscreen-smoke, audio-smoke, online-smoke | all PASS |
| `npm run regression -- http://localhost:8315/` | hub-flows, battle-kinds, sheet-layout, controls, replay-hash: PASS (223 s) |
| online-e2e (vite dev :8325 with VITE_DEV_AUTH=1, wrangler dev :8797 with DEV_AUTH) | ALL PASS (34 checks), twice |
| `scripts/dev/context-loss.mjs` | ALL PASS on before and after |
