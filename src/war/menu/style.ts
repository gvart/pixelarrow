/**
 * The menu's look: the war HUD's red-figure kit (../view/hud/kit.ts CSS, tokens, frames, buttons; the codex cards'
 * CSS for class descriptions) on the painted Metaxy map, plus the few pieces the HUD has no need of (title, big
 * buttons, form fields, the key capture). Sizes are in art px; the root takes the kit's UI scale as CSS zoom, and the
 * layout fits the kit's 900 x 560 art-px box (kit.ts autoStep).
 */
import '@fontsource/inter/600.css';
import '@fontsource/cinzel/700.css';
import { CSS, UI } from '../view/hud/kit';
import { TIP_CSS } from '../view/hud/tooltip';

const set = (f: string) => `image-set(url(${UI}${f}) 1x, url(${UI}${f.replace('.png', '@2x.png')}) 2x)`;
const nine = (f: string) => `border-style:solid;border-width:3px;border-image:${set(f)} 3 fill / 3px stretch;`;

export const MENU_CSS = CSS + TIP_CSS + `
html,body{margin:0;height:100%;overflow:hidden;background:#0e0907}
.mn-bg{position:fixed;inset:0;background:#0e0907 url(war/world/base.jpg) center/cover no-repeat;transform-origin:50% 45%;animation:mn-drift 90s ease-in-out infinite alternate}
.mn-bg::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,rgba(14,9,7,.25) 0%,rgba(14,9,7,.72) 62%,rgba(14,9,7,.94) 100%),linear-gradient(180deg,rgba(14,9,7,.55),rgba(14,9,7,0) 30%,rgba(14,9,7,0) 70%,rgba(14,9,7,.8))}
.mn-bg.dim::after{background:rgba(14,9,7,.82)}
@keyframes mn-drift{from{transform:scale(1.04) translate(0,0)}to{transform:scale(1.12) translate(-1.5%,1%)}}
.mn-root{position:fixed;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;overflow:auto}
.mn-root[hidden]{display:none}
.mn-root.compact .mn-title{display:none}
.mn-title{margin:26px 0 0;text-align:center;pointer-events:none}
.mn-title h1{margin:0;font:700 46px/1 Cinzel,serif;letter-spacing:.14em;color:#f2b27a;text-shadow:0 2px 0 #3d1a0b,0 0 18px rgba(222,138,78,.35),0 0 2px #0e0907}
.mn-title p{margin:6px 0 0;font:italic 500 13px/1.3 Georgia,serif;color:#d2bc9e;letter-spacing:.06em}
.mn-title .rule{width:240px;height:7px;margin:9px auto 0;background:${set('frames/label.png')} center/100% 100%;opacity:.0}
.mn-orn{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;color:var(--rf-line)}
.mn-orn i{display:block;width:90px;height:1px;background:linear-gradient(90deg,transparent,var(--rf-accent),transparent)}
.mn-orn b{width:6px;height:6px;transform:rotate(45deg);background:var(--rf-accent)}
.mn-stage{flex:1;display:flex;align-items:center;justify-content:center;width:100%;padding:12px 16px 18px;box-sizing:border-box}
.mn-card{position:relative;padding:10px 14px 14px}
.mn-h{display:flex;align-items:baseline;gap:8px;padding-bottom:6px;margin-bottom:8px;border-bottom:1px solid var(--rf-rule)}
.mn-h .rf-name{font-size:17px}
.mn-sub{color:var(--rf-muted);font-size:12px;margin:-4px 0 10px}
.mn-big{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:6px 12px;margin:0 0 6px;color:var(--rf-ink);background:none;text-align:left;${nine('buttons/button-normal.png')}}
.mn-big:hover,.mn-big:focus-visible{border-image-source:${set('buttons/button-hover.png')};color:#fff0d8}
.mn-big:active{border-image-source:${set('buttons/button-pressed.png')}}
.mn-big.pri{border-image-source:${set('buttons/button-active.png')};color:#fff0d8}
.mn-big.pri:hover{filter:brightness(1.12)}
.mn-big:disabled{border-image-source:${set('buttons/button-disabled.png')};color:var(--rf-disabled)}
.mn-big .t{font:700 15px/1.1 Cinzel,serif;letter-spacing:.04em}
.mn-big .d{font:600 11px/1.3 Inter,sans-serif;color:var(--rf-muted);margin-top:2px}
.mn-big .ic{flex:none}
.mn-big kbd,.mn-k{margin-left:auto;font:700 10px/1 Inter,sans-serif;color:var(--rf-muted);padding:3px 5px;border:1px solid var(--rf-rule);background:var(--rf-sunk)}
.rf .mn-in{display:block;width:100%;height:28px;margin:3px 0 9px;padding:0 8px;font:600 13px/1 Inter,sans-serif;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);outline:none}
.rf .mn-in:focus{border-color:var(--rf-title);box-shadow:0 0 0 1px rgba(242,178,122,.25)}
.mn-lab{font:700 10px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-muted)}
.mn-msg{min-height:16px;font-size:12px;margin:2px 0 6px}
.mn-msg.bad{color:var(--rf-bad)}.mn-msg.good{color:var(--rf-good)}
.mn-link{background:none;border:0;padding:0;color:#9cc9e4;font:600 12px/1.3 Inter,sans-serif;border-bottom:1px dotted rgba(156,201,228,.55)}
.mn-link:hover{color:#c6e2f2}
.mn-row{display:flex;align-items:center;gap:8px}
.mn-foot{position:fixed;left:0;right:0;bottom:6px;text-align:center;font-size:11px;color:var(--rf-muted);pointer-events:none}
.mn-back{position:absolute;top:10px;left:12px}
.mn-cards{display:flex;gap:10px}
.mn-ally{width:196px;padding:10px 12px 12px;display:flex;flex-direction:column;align-items:center;text-align:center;outline:none;transition:transform .12s}
.mn-ally img.banner{width:58px;height:94px;image-rendering:pixelated;margin:2px 0 6px;filter:drop-shadow(0 3px 0 rgba(0,0,0,.5))}
.mn-ally .rf-name{font-size:18px}
.mn-ally .q{font:700 9.5px/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--rf-muted);margin:4px 0 6px}
.mn-ally .fl{font:italic 500 12px/1.35 Georgia,serif;color:#d2bc9e;min-height:66px}
.mn-ally .facts{width:100%;margin:8px 0;padding-top:6px;border-top:1px solid var(--rf-rule);display:grid;grid-template-columns:auto 1fr;gap:3px 8px;text-align:left;font-size:11.5px}
.mn-ally .facts span:nth-child(odd){color:var(--rf-muted)}
.mn-ally.on,.mn-ally:focus-visible{transform:translateY(-4px);box-shadow:0 0 0 1px var(--rf-title),0 8px 24px rgba(0,0,0,.6)}
.mn-ally .rf-tbtn{width:100%;height:26px}
.mn-swatch{display:inline-block;width:9px;height:9px;margin-right:4px;border:1px solid #0e0907;vertical-align:-1px}
.mn-fav{margin-left:6px;padding:1px 5px;font:700 10px/1.3 Inter,sans-serif;letter-spacing:.03em;color:var(--rf-gold);border:1px solid #6a5326;background:#1c130a;vertical-align:2px;white-space:nowrap}
.mn-map{position:fixed;inset:0;width:100%;height:100%;display:block}
.mn-side{position:fixed;top:12px;left:12px;bottom:12px;width:432px;padding:10px 14px 12px;display:flex;flex-direction:column}
.mn-side .mn-h{margin-bottom:6px;padding-bottom:5px}
.mn-side .mn-h .rf-name{font-size:20px}
.mn-side .mn-sub{margin:0 0 8px;font-size:13px;color:#d2bc9e}
.mn-ally-tag{margin-left:auto;display:inline-flex;align-items:center;font:700 13px/1 Cinzel,serif;color:var(--rf-ink)}
.mn-step{display:block;font:700 11px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--rf-accent);margin-bottom:4px}
.mn-homes{display:flex;flex-direction:column;gap:1px;margin-bottom:6px}
.mn-home{display:flex;align-items:center;gap:10px;width:100%;min-height:25px;padding:2px 8px;background:none;border:0;color:var(--rf-ink);text-align:left;box-shadow:inset 3px 0 0 transparent}
.mn-home:hover,.mn-home:focus-visible{background:var(--rf-hover)}
.mn-home.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.mn-home:disabled{opacity:.6}
.mn-home .nm{font:700 15px/1.15 Cinzel,serif;color:var(--rf-title)}
.mn-home .meta{font-size:12px;color:var(--rf-muted);white-space:nowrap}
.mn-home .meta.why{white-space:normal;margin-top:2px}
.mn-home .why{color:var(--rf-bad)}
.mn-diff{display:inline-flex;align-items:center;gap:3px;font:700 11px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.mn-home .mn-diff{width:62px;justify-content:center;padding:3px 0;border:1px solid currentColor}
.mn-diff.d1{color:var(--rf-good)}.mn-diff.d2{color:var(--rf-gold)}.mn-diff.d3{color:var(--rf-bad)}
.mn-diff i{display:block;width:8px;height:8px;background:currentColor;transform:rotate(45deg);margin-right:2px}
.mn-diff i.o{background:none;border:1px solid currentColor;opacity:.5}
.mn-diff i:last-of-type{margin-right:6px}
.mn-hd{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#7a3418 #0e0907;padding:7px 2px 0;border-top:1px solid var(--rf-rule)}
.hd-top{display:flex;align-items:center;gap:8px}
.hd-top .mn-diff{margin-left:auto}
.hd-top .nm{font:700 20px/1.1 Cinzel,serif;color:var(--rf-title)}
.hd-top .tag{font:700 10.5px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-muted)}
.hd-lore{margin:5px 0 6px;font:italic 500 13.5px/1.34 Georgia,serif;color:#e2cdb0}
.hd-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center;font-size:13px;line-height:1.3;padding:6px 0;border-top:1px solid var(--rf-rule)}
.hd-facts>span:nth-child(odd){font:700 10.5px/1.2 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-muted);align-self:start;padding-top:2px}
.hd-res{display:flex;flex-wrap:wrap;gap:3px 9px}
.mn-res{display:inline-flex;align-items:center;gap:3px}
.mn-res img{width:16px;height:16px}
.mn-res b{color:var(--rf-title)}
.hd-play{margin:0 0 6px;padding:5px 9px;font-size:13px;line-height:1.36;color:var(--rf-ink);background:var(--rf-sunk);border-left:2px solid var(--rf-accent)}
.mn-side .mn-msg:empty{min-height:0;margin:0}
.mn-cta{display:flex;align-items:center;gap:12px;margin-top:8px}
.mn-cta .mn-big{flex:1;margin:0}
.mn-quiet{font-size:13px;color:var(--rf-muted);border-bottom:0}
.mn-quiet:hover,.mn-quiet:focus-visible{color:var(--rf-ink)}
.mn-pa{width:900px;max-width:calc(100vw - 32px);display:flex;flex-direction:column}
.mn-paths{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.mn-path{padding:10px 14px 12px;outline:none;cursor:pointer;display:flex;flex-direction:column;transition:transform .1s}
.mn-path:hover{filter:brightness(1.1)}
.mn-path:focus-visible{box-shadow:0 0 0 1px var(--rf-muted)}
.mn-path.on{box-shadow:0 0 0 2px var(--rf-title),0 6px 18px rgba(0,0,0,.55);transform:translateY(-2px)}
.mn-path .top{display:flex;align-items:center;gap:10px}
.mn-path .cx-ic.big{width:46px;height:46px}
.mn-path .cx-ic.big img{width:40px;height:40px}
.mn-path .nm{font:700 22px/1.1 Cinzel,serif;color:var(--rf-title)}
.mn-path .does{margin:8px 0;font-size:14px;line-height:1.4;color:var(--rf-ink);flex:1}
.mn-path .facts{display:flex;flex-direction:column;gap:3px;padding-top:7px;border-top:1px solid var(--rf-rule);font-size:13px;line-height:1.3;color:var(--rf-ink)}
.mn-path .facts span{color:var(--rf-muted)}
.mn-fams{margin-top:10px;padding:10px 14px 12px}
.mn-fams .rf-name{font-size:18px}
.mn-fams .mn-sub{margin:2px 0 8px;font-size:13px;color:#d2bc9e}
.mn-fams .list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.mn-fam{display:flex;flex-direction:column;gap:4px;padding:8px 10px;text-align:left;background:var(--rf-sunk);border:1px solid var(--rf-rule);color:var(--rf-ink);outline:none}
.mn-fam:hover{border-color:var(--rf-line)}
.mn-fam:focus-visible{border-color:var(--rf-muted)}
.mn-fam.on{border-color:var(--rf-title);box-shadow:0 0 0 1px var(--rf-title)}
.mn-fam .nm{font:700 15px/1.15 Cinzel,serif;color:var(--rf-title)}
.mn-fam .does{font-size:13px;line-height:1.3}
.mn-fam .men{font-size:12.5px;line-height:1.3;color:var(--rf-muted)}
.mn-pa .mn-msg:empty{min-height:0;margin:0}
.mn-pa .mn-cta{margin-top:10px}
.mn-pa .mn-big{min-height:50px}
.mn-mu-h{margin-bottom:8px}
.mn-mu-h .rf-name{font-size:26px}
.mn-mu-h .mn-sub{margin:4px 0 0;font-size:13.5px;color:#d2bc9e}
.mn-cta .mn-big.pri:not(:disabled){box-shadow:0 0 0 1px #f2b27a,0 0 16px rgba(222,138,78,.4)}
.mn-cta .mn-big .t{font-size:17px;color:#ffe2b8}
.mn-cta .mn-big .d{font-size:12px;color:#e2cdb0}
.mn-set{width:680px;max-width:calc(100vw - 32px);max-height:540px;display:flex;flex-direction:column}
.mn-set .body{overflow:auto;scrollbar-width:thin;scrollbar-color:#7a3418 #0e0907;padding-right:4px;flex:1;min-height:0}
.mn-tabs{display:flex;border-bottom:1px solid var(--rf-line);margin:0 0 8px}
.mn-kb{display:grid;grid-template-columns:1fr 110px 110px 26px;gap:3px 6px;align-items:center}
.mn-kb .sec{grid-column:1/-1;margin:10px 0 2px;font:700 11.5px/1.2 Cinzel,serif;color:var(--rf-accent);letter-spacing:.04em;border-bottom:1px solid var(--rf-rule);padding-bottom:3px}
.mn-kb .lb{font-size:12px;padding:3px 0}
.mn-kb .lb.fixed{color:var(--rf-muted)}
.mn-key{height:23px;width:100%;padding:0 6px;font:700 11px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-sunk);border:1px solid var(--rf-rule);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mn-key:hover,.mn-key:focus-visible{border-color:var(--rf-title);outline:none}
.mn-key.empty{color:var(--rf-disabled);font-weight:600}
.mn-key.cap{border-color:var(--rf-gold);color:var(--rf-gold);animation:mn-pulse 1s ease-in-out infinite}
.mn-key:disabled{opacity:.6}
@keyframes mn-pulse{50%{box-shadow:0 0 6px rgba(224,184,103,.55)}}
.mn-modal{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(8,5,4,.62)}
.mn-scale{display:flex;gap:4px;flex-wrap:wrap}
.mn-sl{display:grid;grid-template-columns:90px 1fr 26px;align-items:center;gap:8px;height:28px}
.rf .mn-sl input[type=range]{width:100%;height:16px;padding:0;border:0;background:none;accent-color:var(--rf-title)}
.rf input[type=checkbox]{width:14px;height:14px;accent-color:var(--rf-title)}
.mn-spin{display:inline-block;width:14px;height:14px;border:2px solid var(--rf-line);border-top-color:var(--rf-title);border-radius:50%;animation:mn-rot .8s linear infinite;vertical-align:-3px}
@keyframes mn-rot{to{transform:rotate(360deg)}}
.mn-ts{min-height:0}
`;

let injected = false;
export function injectMenuCss(): void {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = MENU_CSS;
  document.head.appendChild(s);
}
