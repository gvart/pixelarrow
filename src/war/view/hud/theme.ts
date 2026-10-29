/**
 * The HUD's design system (the Dota 2 hybrid): every colour, border, font, shadow and timing as a CSS token, and the
 * shared pieces drawn from them in CSS (no frame art): dark stone panels with a bronze edge, an inner bevel and a gold
 * trim along the top, square ability slots with the hotkey on the corner, keycaps, tooltips, tabs and bars.
 *
 * The `--rf-*` names are the old red-figure kit's (every panel's own CSS reads them), now mapped onto the stone and
 * bronze palette; new pieces read the `--hud-*` tokens. ./kit.ts joins this onto its CSS, so the region view, the
 * world map and the menu all draw from here. Sizes are art px (the HUD's UI scale zooms them).
 *
 * Contrast (WCAG AA) on --hud-panel #16181c: ink 14.6, title 11.3, muted 7.2, gold 9.6, good 9.5, bad 5.6, disabled 3.4
 * (disabled is for greyed controls only).
 */

/** A faint stone grain (SVG noise, tiled) under the panels' gradient. */
const GRAIN = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .93  0 0 0 0 .8  0 0 0 .06 0"/></filter><rect width="96" height="96" filter="url(#n)"/></svg>')}`;

/** The top bar's height in art px; panels anchored at the top sit below it (`--hud-top`). */
export const TOP_BAR_H = 30;

export const TOKENS = `:root{
  --hud-panel:#16181c;--hud-panel-hi:#20232a;--hud-panel-lo:#101215;--hud-sunk:#0a0b0d;--hud-raised:#1e2127;--hud-hover:#272b33;
  --hud-sel:#2e2a1d;--hud-glass:rgba(13,15,18,.84);--hud-glass-hi:rgba(28,31,37,.9);
  --hud-ink:#ece6d8;--hud-title:#efcf86;--hud-muted:#a8a194;--hud-disabled:#6f6a62;
  --hud-gold:#e2bd68;--hud-gold-hi:#f6dc98;--hud-gold-lo:#9b7a3c;--hud-bronze:#5f4b2a;--hud-bronze-hi:#8a6c3a;--hud-bronze-lo:#33291a;
  --hud-edge:#030304;--hud-rule:#2b2c2f;--hud-good:#8ccf5e;--hud-bad:#ec6a50;--hud-warn:#e8b54a;--hud-link:#8fc4e8;
  --hud-hp-a:#86d66c;--hud-hp-b:#3f9a32;--hud-hp-c:#25621d;--hud-build-a:#f0cf7c;--hud-build-b:#b8892f;--hud-burn-a:#ffb257;--hud-burn-b:#c6461f;
  --hud-ok-a:#e8c776;--hud-ok-b:#a57a2a;
  --hud-display:700 14px/1.1 Cinzel,serif;--hud-body:600 12px/1.3 Inter,system-ui,sans-serif;--hud-small:600 10.5px/1.2 Inter,system-ui,sans-serif;
  --hud-key-font:700 8.5px/1 Inter,system-ui,sans-serif;
  --hud-bevel:inset 0 1px 0 rgba(255,236,190,.07),inset 0 -1px 0 rgba(0,0,0,.5);
  --hud-frame:inset 0 1px 0 rgba(226,189,104,.55),inset 0 0 0 1px var(--hud-bronze),inset 0 0 0 2px rgba(0,0,0,.55),inset 0 2px 0 1px rgba(255,236,190,.05),0 0 0 1px var(--hud-edge),0 8px 22px rgba(0,0,0,.5);
  --hud-frame-hi:inset 0 1px 0 rgba(246,220,152,.8),inset 0 0 0 1px var(--hud-gold-lo),inset 0 0 0 2px rgba(0,0,0,.55),0 0 0 1px var(--hud-edge),0 0 14px rgba(226,189,104,.18),0 8px 22px rgba(0,0,0,.5);
  --hud-slot:inset 0 0 0 1px var(--hud-bronze),inset 0 0 0 2px rgba(0,0,0,.7),inset 0 3px 6px rgba(0,0,0,.55),0 0 0 1px var(--hud-edge),0 1px 0 rgba(255,236,190,.06);
  --hud-glow:0 0 0 1px var(--hud-edge),inset 0 0 0 1px var(--hud-gold),inset 0 0 0 2px rgba(0,0,0,.6),0 0 10px rgba(226,189,104,.45);
  --hud-grain:url("${GRAIN}");
  --hud-stone:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 38%),var(--hud-grain),linear-gradient(180deg,var(--hud-panel-hi),var(--hud-panel) 46%,var(--hud-panel-lo));
  --hud-slot-bg:radial-gradient(circle at 50% 32%,#2b2f37,#121419 70%,#0b0c0f);
  --hud-fast:120ms;--hud-med:160ms;--hud-ease:cubic-bezier(.2,.7,.3,1);
  --hud-top:${TOP_BAR_H + 2}px;
  --rf-panel:var(--hud-panel);--rf-raised:var(--hud-raised);--rf-sunk:var(--hud-sunk);--rf-hover:var(--hud-hover);--rf-sel:var(--hud-sel);
  --rf-ink:var(--hud-ink);--rf-title:var(--hud-title);--rf-muted:var(--hud-muted);--rf-disabled:var(--hud-disabled);
  --rf-accent:#cfa25a;--rf-line:var(--hud-bronze);--rf-rule:var(--hud-rule);--rf-good:var(--hud-good);--rf-bad:var(--hud-bad);--rf-gold:var(--hud-gold);
  --rf-title-font:var(--hud-display);--rf-body:var(--hud-body)}`;

/** A tooltip's head: title, the hotkey as a keycap on the right, then the description (plain words). */
export const tipHtml = (title: string, what: string, key = '') =>
  `<div class="hud-tt-h"><span class="rf-name">${title}</span>${key ? `<kbd class="hud-kbd">${key}</kbd>` : ''}</div>${what ? `<div class="hud-tt-d">${what}</div>` : ''}`;

/**
 * The shared pieces. Frames keep the old kit's outer sizes (border widths), so every panel's inner layout stands; the
 * border is transparent and the stone fills it.
 */
export const THEME_CSS = `
.rf{font:var(--hud-body);color:var(--hud-ink);-webkit-font-smoothing:antialiased}
@keyframes hudIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@keyframes hudFade{from{opacity:0}to{opacity:1}}
.rf-band,.rf-card{border:solid transparent;border-width:6px 6px 4px;border-image:none;background:var(--hud-stone);background-clip:border-box;background-origin:border-box;box-shadow:var(--hud-frame);border-radius:3px}
.rf-band{border-width:5px 6px}
.rf-card.on,#rfTown.on{box-shadow:var(--hud-frame-hi)}
.rf-tip{border:1px solid transparent;border-image:none;padding:6px 9px 7px;border-radius:3px;background:linear-gradient(180deg,rgba(32,35,42,.98),rgba(14,16,19,.98));box-shadow:inset 0 1px 0 rgba(226,189,104,.5),inset 0 0 0 1px var(--hud-bronze),0 0 0 1px var(--hud-edge),0 10px 26px rgba(0,0,0,.6);animation:hudFade var(--hud-fast) ease-out;line-height:1.4;max-width:300px}
.rf-tip .rf-name{font-size:13.5px;color:var(--hud-title)}
.rf-tip b.k,.rf-label b{color:var(--hud-gold-hi)}
.hud-kbd{display:inline-block;min-width:15px;padding:2px 4px 1px;margin:0 1px;border-radius:2px;font:700 10px/1.1 Inter,system-ui,sans-serif;color:var(--hud-gold-hi);text-align:center;background:linear-gradient(180deg,#2a2d34,#15171b);box-shadow:inset 0 0 0 1px var(--hud-bronze),0 1px 0 var(--hud-edge);vertical-align:1px;white-space:nowrap}
.hud-tt-h{display:flex;align-items:center;gap:10px;margin:-6px -9px 5px;padding:5px 9px 5px;background:linear-gradient(180deg,rgba(226,189,104,.12),rgba(226,189,104,0));border-bottom:1px solid rgba(95,75,42,.7)}
.hud-tt-h .rf-name{flex:1}
.hud-tt-h .hud-kbd{margin-left:auto}
.hud-tt-d{color:var(--hud-ink);white-space:normal;max-width:260px;min-width:120px}
.rf-label{border:1px solid transparent;border-image:none;border-radius:2px;background:var(--hud-glass);box-shadow:inset 0 0 0 1px var(--hud-bronze),0 0 0 1px var(--hud-edge),0 3px 10px rgba(0,0,0,.45);padding:3px 7px}
.rf-name{font:var(--hud-display);color:var(--hud-title);letter-spacing:.03em;text-shadow:0 1px 0 rgba(0,0,0,.6)}
/* ability and icon slots: a dark square well, bronze rim, gold on hover, hotkey on the top-left corner */
.rf-btn{width:30px;height:30px;padding:0;border:0;border-radius:3px;background:var(--hud-slot-bg);box-shadow:var(--hud-slot);display:flex;align-items:center;justify-content:center;position:relative;transition:box-shadow var(--hud-fast) var(--hud-ease),filter var(--hud-fast),transform var(--hud-fast)}
.rf-btn .ic{transition:transform var(--hud-fast),filter var(--hud-fast);filter:drop-shadow(0 1px 0 rgba(0,0,0,.7))}
.rf-btn:hover{background:var(--hud-slot-bg);box-shadow:var(--hud-glow)}
.rf-btn:hover .ic{filter:brightness(1.18) drop-shadow(0 1px 0 rgba(0,0,0,.7))}
.rf-btn:active,.rf-btn.press{background:var(--hud-slot-bg);transform:translateY(1px);box-shadow:inset 0 0 0 1px var(--hud-gold-lo),inset 0 3px 8px rgba(0,0,0,.8),0 0 0 1px var(--hud-edge)}
.rf-btn:active .ic,.rf-btn.press .ic{transform:none}
.rf-btn.on{background:radial-gradient(circle at 50% 35%,#3d3522,#17140d 72%);box-shadow:inset 0 0 0 1px var(--hud-gold-hi),inset 0 0 0 2px rgba(0,0,0,.55),inset 0 0 10px rgba(226,189,104,.35),0 0 0 1px var(--hud-edge),0 0 8px rgba(226,189,104,.4)}
.rf-btn:disabled{background:radial-gradient(circle at 50% 35%,#1b1d21,#0c0d0f 72%);box-shadow:inset 0 0 0 1px #2c2b28,0 0 0 1px var(--hud-edge)}
.rf-btn:disabled .ic{opacity:.38;filter:grayscale(.85)}
.rf button:focus-visible{outline:1px solid var(--hud-gold-hi);outline-offset:1px}
.rf-seg{display:flex;gap:2px}
.rf-seg button{width:28px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;position:relative;border:0;border-image:none;border-radius:3px;background:var(--hud-slot-bg);box-shadow:var(--hud-slot);transition:box-shadow var(--hud-fast) var(--hud-ease)}
.rf-seg button:hover{border-image:none;box-shadow:var(--hud-glow)}
.rf-seg button.on{border-image:none;background:radial-gradient(circle at 50% 35%,#3d3522,#17140d 72%);box-shadow:inset 0 0 0 1px var(--hud-gold-hi),inset 0 0 8px rgba(226,189,104,.35),0 0 0 1px var(--hud-edge)}
.rf-seg button .key,.rf-btn .key{position:absolute;left:1px;top:1px;right:auto;bottom:auto;padding:1px 2px 0;border-radius:2px;font:var(--hud-key-font);color:var(--hud-gold-hi);background:rgba(4,5,6,.82);box-shadow:0 0 0 1px rgba(95,75,42,.6);text-shadow:none;pointer-events:none}
.rf-btn .rf-badge{top:-5px;left:auto;right:-5px;background:var(--hud-bad);color:#1a0d08;box-shadow:0 0 0 1px var(--hud-edge),0 1px 3px rgba(0,0,0,.6)}
.rf-btn .rf-badge.gold{background:linear-gradient(180deg,var(--hud-gold-hi),var(--hud-gold))}
.rf-btn .badge{left:auto;right:1px;top:auto;bottom:1px}
/* text buttons: stone with a bronze rim; .pri is the gilded one */
.rf-tbtn{height:23px;padding:0 9px;border:0;border-image:none;border-radius:3px;color:var(--hud-ink);font:600 12px/1 Inter,system-ui,sans-serif;background:linear-gradient(180deg,#2a2e35,#181a1f);box-shadow:inset 0 0 0 1px var(--hud-bronze),inset 0 1px 0 1px rgba(255,236,190,.05),0 0 0 1px var(--hud-edge);transition:box-shadow var(--hud-fast) var(--hud-ease),color var(--hud-fast),filter var(--hud-fast)}
.rf-tbtn:hover{border-image:none;color:var(--hud-gold-hi);box-shadow:inset 0 0 0 1px var(--hud-gold),0 0 0 1px var(--hud-edge),0 0 8px rgba(226,189,104,.3)}
.rf-tbtn:active{border-image:none;padding-top:1px;background:linear-gradient(180deg,#15171b,#22252b)}
.rf-tbtn.on,.rf-tbtn.pri{border-image:none;color:#fff3d6;background:linear-gradient(180deg,#7a6234,#4a3a1e 55%,#33281a);box-shadow:inset 0 0 0 1px var(--hud-gold),inset 0 1px 0 1px rgba(255,236,190,.2),0 0 0 1px var(--hud-edge)}
.rf-tbtn.pri:hover{filter:brightness(1.12)}
.rf-tbtn:disabled{border-image:none;color:var(--hud-disabled);background:linear-gradient(180deg,#1c1e22,#141518);box-shadow:inset 0 0 0 1px #2c2b28,0 0 0 1px var(--hud-edge)}
.rf-tab{height:22px;padding:0 10px;margin-right:2px;border:0;border-image:none;border-radius:3px 3px 0 0;color:var(--hud-muted);font:600 12px/1 Inter,system-ui,sans-serif;background:linear-gradient(180deg,#202329,#14161a);box-shadow:inset 0 1px 0 rgba(255,236,190,.05),inset 1px 0 0 var(--hud-bronze-lo),inset -1px 0 0 var(--hud-bronze-lo),inset 0 1px 0 1px var(--hud-bronze-lo);transition:color var(--hud-fast),background var(--hud-fast)}
.rf-tab:hover{border-image:none;color:var(--hud-ink);background:linear-gradient(180deg,#2a2e35,#181a1f)}
.rf-tab.on{border-image:none;color:var(--hud-title);height:23px;margin-bottom:-1px;background:linear-gradient(180deg,#2c2a22,var(--hud-panel-hi));box-shadow:inset 0 2px 0 var(--hud-gold),inset 1px 0 0 var(--hud-bronze),inset -1px 0 0 var(--hud-bronze)}
/* bars: a sunk track, a glossy fill; the fill's width is the value (./kit.ts bar) */
.rf-bar{height:6px;border:1px solid var(--hud-edge);border-image:none;border-radius:1px;background:linear-gradient(180deg,#07080a,#121417);box-shadow:0 1px 0 rgba(255,236,190,.06)}
.rf-bar i{left:0;top:0;height:100%;background-size:auto;border-radius:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.28);transition:width var(--hud-med) var(--hud-ease)}
.rf-bar i.hp{background:linear-gradient(180deg,var(--hud-hp-a),var(--hud-hp-b) 60%,var(--hud-hp-c))}
.rf-bar i.construction{background:linear-gradient(180deg,var(--hud-build-a),var(--hud-build-b))}
.rf-bar i.burn{background:linear-gradient(180deg,var(--hud-burn-a),var(--hud-burn-b))}
.rf-bar i.ok{background:linear-gradient(180deg,var(--hud-ok-a),var(--hud-ok-b))}
.rf-bar.big{height:12px}.rf-bar.big i{top:0;height:100%}
.rf-sep{width:1px;background:linear-gradient(180deg,transparent,var(--hud-bronze) 20%,var(--hud-bronze) 80%,transparent);box-shadow:1px 0 0 rgba(0,0,0,.6);margin:0 6px}
.rf-cap,.rf-sec{color:var(--rf-accent)}
.rf-ph{border-bottom:1px solid var(--hud-bronze);box-shadow:0 1px 0 rgba(0,0,0,.6)}
.rf-ph .rf-name{font-size:16px}
.rf-sec::after{background:linear-gradient(90deg,var(--hud-bronze),transparent)}
.rf-well{background:var(--hud-sunk);border:1px solid var(--hud-edge);box-shadow:inset 0 0 0 1px var(--hud-rule),inset 0 2px 5px rgba(0,0,0,.7);border-radius:2px}
.rf-scroll,.rf-card{scrollbar-color:var(--hud-bronze) var(--hud-sunk)}
.rf-row{transition:background var(--hud-fast)}
.rf-row.on{box-shadow:inset 3px 0 0 var(--hud-gold)}
.rf-need{background:var(--hud-raised);border-color:var(--hud-rule);border-radius:2px}
.rf-need.short{border-color:#7a2f22;background:#2a1411}
.rf-pill{border-radius:2px;border-color:var(--hud-rule)}
.rf-pill.good{border-color:#3d5a2a}.rf-pill.gold{border-color:var(--hud-gold-lo)}.rf-pill.bad{border-color:#6e2c20}
.rf-cell{border-radius:2px;background:var(--hud-slot-bg);border-color:#2c2b28;box-shadow:inset 0 0 0 1px #050506,inset 0 2px 5px rgba(0,0,0,.6);transition:border-color var(--hud-fast)}
.rf-cell:hover{border-color:var(--hud-gold);background:var(--hud-slot-bg)}
.rf-cell.empty{background:#0b0c0e;border-color:#1c1d20}.rf-cell.empty:hover{border-color:#1c1d20}
.rf-lv{border-color:var(--hud-gold-lo);border-radius:2px}
.rf-chip{border-color:#6e2c20;border-radius:2px}
.rf-ring{background:conic-gradient(var(--hud-gold) calc(var(--p) * 1turn),#262a31 0);box-shadow:0 0 0 1px var(--hud-edge)}
.rf-ring::before{background:radial-gradient(circle at 50% 35%,#2b2f37,#0e1013);box-shadow:0 0 0 1px var(--hud-gold-lo)}
.rf-ichip{background:var(--hud-raised);border-color:var(--hud-rule);border-radius:2px}
.rf-ichip.gold{border-color:var(--hud-gold-lo)}
.rf-medal{background:radial-gradient(circle at 50% 35%,#3a3426,#121317)}
.rf input,.rf select{background:var(--hud-sunk);border:1px solid var(--hud-bronze);border-radius:2px;color:var(--hud-ink);transition:border-color var(--hud-fast)}
.rf input:focus,.rf select:focus{border-color:var(--hud-gold);outline:none}
.rf .rf-esc,.rf-esc{animation:hudIn var(--hud-med) var(--hud-ease)}

/* ---- the top bar: resources left, region and clock centre, favour and the menus right ---- */
#rfTop{left:0;right:0;top:0;height:${TOP_BAR_H}px;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 6px;pointer-events:none;
  background:linear-gradient(180deg,rgba(30,33,39,.94),rgba(13,15,18,.9));box-shadow:inset 0 -1px 0 var(--hud-gold-lo),inset 0 -2px 0 rgba(0,0,0,.6),0 1px 0 var(--hud-edge),0 4px 14px rgba(0,0,0,.45);backdrop-filter:blur(3px)}
#rfTop>*{pointer-events:auto}
#rfTop .tb-l,#rfTop .tb-r{display:flex;align-items:center;gap:3px;flex:1;min-width:0}
#rfTop .tb-r{justify-content:flex-end;gap:6px}
#rfTop .tb-res{display:flex;align-items:center;gap:3px;height:22px;padding:0 7px 0 3px;border-radius:2px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px rgba(95,75,42,.55);font:700 12px/1 Inter,system-ui,sans-serif;color:var(--hud-ink);transition:box-shadow var(--hud-fast)}
#rfTop .tb-res:hover{box-shadow:inset 0 0 0 1px var(--hud-gold)}
#rfTop .tb-res .ic{width:18px;height:18px}
#rfTop .tb-res.none b{color:var(--hud-disabled)}
#rfTop .tb-res.men b{color:var(--hud-title)}
#rfTop .tb-plaque{position:absolute;left:50%;top:0;transform:translateX(-50%);min-width:190px;height:${TOP_BAR_H + 10}px;padding:3px 22px 0;text-align:center;
  background:linear-gradient(180deg,#262a31,#121418);clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,14px 100%);box-shadow:none}
#rfTop .tb-plaque::before{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent calc(100% - 2px),var(--hud-gold) calc(100% - 2px));clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,14px 100%)}
#rfTop .tb-plaque::after{content:'';position:absolute;left:14px;right:14px;bottom:2px;height:1px;background:rgba(0,0,0,.7)}
#rfTop .tb-region::before,#rfTop .tb-region::after{content:'';display:inline-block;width:5px;height:5px;margin:0 9px;vertical-align:4px;background:var(--hud-gold);transform:rotate(45deg);box-shadow:0 0 4px rgba(226,189,104,.6)}
#rfTop .tb-region{font:700 15px/1.1 Cinzel,serif;color:var(--hud-title);letter-spacing:.08em;white-space:nowrap;text-shadow:0 1px 0 #000,0 0 8px rgba(226,189,104,.25)}
#rfTop .tb-sub{margin-top:3px;font:var(--hud-small);color:var(--hud-muted);white-space:nowrap;letter-spacing:.02em}
#rfTop .tb-sub b{color:var(--hud-ink);font-variant-numeric:tabular-nums}
#rfTop .tb-fav{display:flex;align-items:center;gap:5px;height:24px;padding:0 8px 0 3px;border:0;border-radius:2px;cursor:pointer;background:linear-gradient(180deg,#2c2a22,#17150f);box-shadow:inset 0 0 0 1px var(--hud-gold-lo),0 0 0 1px var(--hud-edge);color:var(--hud-ink);transition:box-shadow var(--hud-fast)}
#rfTop .tb-fav:hover,#rfTop .tb-fav.on{box-shadow:inset 0 0 0 1px var(--hud-gold-hi),0 0 0 1px var(--hud-edge),0 0 8px rgba(226,189,104,.35)}
#rfTop .tb-fav .n{font:700 13px/1 Cinzel,serif;color:var(--hud-gold-hi)}
#rfTop .tb-fav .t{font:var(--hud-small);color:var(--hud-muted);max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#rfTop .tb-fav .bar{width:34px;height:3px;background:#07080a;box-shadow:0 0 0 1px var(--hud-edge)}
#rfTop .tb-fav .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--hud-gold-lo),var(--hud-gold-hi))}
#rfTop .tb-rule{width:1px;height:20px;background:linear-gradient(180deg,transparent,var(--hud-bronze),transparent)}
#rfMenus{position:static;display:flex;gap:3px}
#rfMenus .rf-btn,#rfTop .tb-gear{width:26px;height:26px}
#rfMenus .rf-btn .ic,#rfTop .tb-gear .ic{width:20px;height:20px}
#rfMenus .rf-btn .key{display:none}
/* favour has its chip in the bar; its menu button stays (its key, its window's place) but out of sight */
#rfMenus #rfFavourBtn{display:none}

/* ---- panels anchored at the top sit below the top bar (the zoned ones: ./layout.ts) ---- */
#rfSettleNote,#rfPlotBar{margin-top:var(--hud-top)}
#rfPlotBar{margin-top:calc(var(--hud-top) + 10px)}

/* ---- the command panel, bottom centre ---- */
#rfCard .hud-cmd{position:relative;display:flex;align-items:stretch;padding:5px 6px 5px 5px;border-width:4px 5px 4px;box-shadow:var(--hud-frame)}
#rfCard .hud-cmd::before,#rfCard .hud-cmd::after,#rfDock::before{content:'';position:absolute;top:-3px;width:12px;height:12px;pointer-events:none;border-top:2px solid var(--hud-gold);opacity:.9}
#rfCard .hud-cmd::before,#rfDock::before{left:-3px;border-left:2px solid var(--hud-gold)}#rfCard .hud-cmd::after{right:-3px;border-right:2px solid var(--hud-gold)}
#rfCard .hud-port{position:relative;flex:none;width:58px;align-self:stretch;min-height:64px;margin-right:7px;border-radius:2px;overflow:hidden;
  background:radial-gradient(ellipse at 50% 30%,#3a3f49,#16181d 70%,#0b0c0e);box-shadow:inset 0 0 0 1px var(--hud-gold-lo),inset 0 0 0 2px rgba(0,0,0,.7),inset 0 -12px 18px rgba(0,0,0,.55),0 0 0 1px var(--hud-edge)}
#rfCard .hud-port #cIcon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(1.5);width:32px;height:32px;image-rendering:pixelated}
#rfCard .hud-port canvas{position:absolute;left:50%;bottom:-6px;height:118%;width:auto;transform:translateX(-50%);image-rendering:pixelated;display:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))}
#rfCard .hud-port.sprite canvas{display:block}#rfCard .hud-port.sprite #cIcon{display:none}
#rfCard .hud-port .lv{position:absolute;left:50%;bottom:2px;transform:translateX(-50%);padding:1px 5px;border-radius:2px;font:700 9.5px/1.2 Inter,system-ui,sans-serif;color:var(--hud-gold-hi);background:rgba(4,5,6,.85);box-shadow:0 0 0 1px var(--hud-gold-lo);white-space:nowrap}
#rfCard .hud-port .lv:empty{display:none}
#rfCard .hud-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px;min-width:0}
#rfCard #cName{font:700 14px/1.15 Cinzel,serif;min-width:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rfCard #cCount{margin-left:auto;font:var(--hud-small);color:var(--hud-muted);white-space:nowrap}
#rfCard #cCount:empty{display:none}
#rfCard #cCount b{color:var(--hud-ink)}
#rfCard .hud-fed.good{color:var(--hud-good)}#rfCard .hud-fed.warn{color:var(--hud-warn)}#rfCard .hud-fed.bad{color:var(--hud-bad)}
#rfCard .hud-hp{position:relative;height:13px;border:1px solid var(--hud-edge);border-radius:1px;background:linear-gradient(180deg,#07080a,#131518);box-shadow:0 1px 0 rgba(255,236,190,.06);overflow:hidden}
#rfCard .hud-hp i{position:absolute;left:0;top:0;bottom:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 -2px 3px rgba(0,0,0,.25);transition:width var(--hud-med) var(--hud-ease)}
#rfCard .hud-hp i.hp{background:linear-gradient(180deg,var(--hud-hp-a),var(--hud-hp-b) 55%,var(--hud-hp-c))}
#rfCard .hud-hp i.construction{background:linear-gradient(180deg,var(--hud-build-a),var(--hud-build-b))}
#rfCard .hud-hp i.burn{background:linear-gradient(180deg,var(--hud-burn-a),var(--hud-burn-b))}
#rfCard .hud-hp span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 10px/1 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 1px 1px #000,0 0 2px #000;letter-spacing:.02em}
#rfCard .hud-chips{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap}
#rfCard .hud-chips:empty{display:none}
#rfCard .hud-chip{display:inline-flex;align-items:center;gap:3px;height:15px;padding:0 5px;border-radius:2px;font:700 9.5px/1 Inter,system-ui,sans-serif;letter-spacing:.03em;color:var(--hud-ink);background:rgba(0,0,0,.4);box-shadow:inset 0 0 0 1px var(--hud-rule)}
#rfCard .hud-chip.gold{color:var(--hud-gold-hi);box-shadow:inset 0 0 0 1px var(--hud-gold-lo)}
#rfCard .hud-chip.good{color:var(--hud-good);box-shadow:inset 0 0 0 1px #3d5a2a}
#rfCard .hud-chip.warn{color:var(--hud-warn);box-shadow:inset 0 0 0 1px #6a5326}
#rfCard .hud-chip.bad{color:var(--hud-bad);box-shadow:inset 0 0 0 1px #6e2c20}
#rfCard .hud-pips{display:flex;flex-wrap:wrap;gap:2px;margin-top:5px;max-width:100%}
#rfCard .hud-pips:empty{display:none}
#rfCard .hud-pip{position:relative;width:11px;height:15px;padding:0;border:0;border-radius:1px;background:#0b0c0e;box-shadow:inset 0 0 0 1px #34322c,0 0 0 1px var(--hud-edge);overflow:hidden;transition:box-shadow var(--hud-fast),transform var(--hud-fast)}
#rfCard .hud-pip i{position:absolute;left:1px;right:1px;bottom:1px;height:calc((100% - 2px) * var(--hp,1));background:linear-gradient(90deg,var(--hud-hp-b),var(--hud-hp-a));transition:height var(--hud-med) var(--hud-ease)}
#rfCard .hud-pip.mid i{background:linear-gradient(90deg,#b8892f,#f0cf7c)}
#rfCard .hud-pip.low i{background:linear-gradient(90deg,#9a2e1c,#ec6a50)}
#rfCard .hud-pip:hover{box-shadow:inset 0 0 0 1px var(--hud-gold-hi),0 0 0 1px var(--hud-edge),0 0 6px rgba(226,189,104,.5);transform:translateY(-1px)}
#rfCard .hud-pip.on{box-shadow:inset 0 0 0 1px var(--hud-gold-hi),0 0 0 1px var(--hud-edge)}
#rfCard .hud-more{font:var(--hud-small);color:var(--hud-muted);align-self:center;margin-left:2px}
#rfCard #cInfo{color:var(--hud-muted)}
#rfCard .hud-pip.pick{box-shadow:inset 0 0 0 1px var(--hud-gold-hi),0 0 0 1px var(--hud-gold),0 0 7px rgba(246,220,152,.75);transform:translateY(-2px)}
#rfCard .hud-mancard{display:flex;align-items:stretch;margin-left:6px}
#rfCard .hud-mancard:empty{display:none}
/* the picked man's card (./manCard.ts), docked between the selection and the orders */
#rfCard .hud-man{display:flex;flex-direction:column;justify-content:center;gap:4px;width:182px;padding:0 1px 0 8px;box-shadow:inset 1px 0 0 var(--hud-bronze),inset 2px 0 0 rgba(0,0,0,.6);animation:hudFade var(--hud-fast) ease-out}
#rfCard .hud-man-body{display:flex;flex-direction:column;gap:3px;min-width:0}
#rfCard .hud-man-head{display:flex;align-items:baseline;gap:6px;min-width:0}
#rfCard .hud-man-head .rf-name{font-size:13px;flex:none;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rfCard .hud-man-cls{margin-left:auto;min-width:0;font:var(--hud-small);color:var(--hud-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rfCard .hud-man .hud-hp{height:11px}
#rfCard .hud-man-kit{display:flex;align-items:center;gap:4px;min-width:0;font:var(--hud-small);color:var(--hud-muted)}
#rfCard .hud-man-kit:empty{display:none}
#rfCard .hud-man-kit>span:last-child:not(.hud-chip){min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* the orders: text buttons, the hotkey on the top-right corner as on the ability slots */
#rfCard .hud-man-acts{display:flex;gap:4px;margin-top:3px}
#rfCard .hud-man-acts .rf-tbtn{position:relative;flex:1 1 auto;height:22px;padding:0 5px;font-size:11px;white-space:nowrap}
#rfCard .hud-man-acts .hud-kbd{position:absolute;right:-3px;top:-6px;min-width:0;margin:0;padding:1px 2px 0;font:var(--hud-key-font);background:rgba(4,5,6,.9);box-shadow:0 0 0 1px rgba(95,75,42,.8);pointer-events:none}
#rfCard .hud-man-acts .rf-tbtn.off{color:var(--hud-disabled);background:linear-gradient(180deg,#1c1e22,#141518);box-shadow:inset 0 0 0 1px #2c2b28,0 0 0 1px var(--hud-edge);cursor:default}
#rfCard .hud-man-acts .rf-tbtn.off .hud-kbd{opacity:.5}
#rfCard #cOrders{gap:3px}
#rfCard #cOrders>div{gap:3px!important}
#rfCard #cSlots{gap:3px;flex-wrap:wrap;max-width:132px;align-content:center}

/* ---- the minimap: a square well in a bronze frame ---- */
#minimap{border-radius:3px;background:var(--hud-stone);box-shadow:var(--hud-frame)}
#minimap canvas{border-radius:2px;box-shadow:inset 0 0 0 1px var(--hud-edge),0 0 0 1px var(--hud-gold-lo),0 0 0 2px var(--hud-edge)}
#minimap .mm-corner{position:absolute;width:9px;height:9px;pointer-events:none;border:2px solid var(--hud-gold);opacity:.85}
#minimap .mm-corner.a{left:2px;top:2px;border-right:0;border-bottom:0}#minimap .mm-corner.b{right:2px;top:2px;border-left:0;border-bottom:0}
#minimap .mm-corner.c{left:2px;bottom:2px;border-right:0;border-top:0}#minimap .mm-corner.d{right:2px;bottom:2px;border-left:0;border-top:0}

/* ---- the dock bottom right (chest, roster, build) ---- */
#rfDock{right:1px;bottom:1px;width:106px;height:36px;z-index:3;pointer-events:none;border-radius:3px;background:var(--hud-stone);box-shadow:var(--hud-frame)}
`;
