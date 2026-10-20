/**
 * The red-figure UI kit (W-32, public/war/ui/ui.json): its CSS (9-slice frames as border-image, buttons with their
 * states, bars, the hover label, the tooltip) and the scale. 1 art px = `zoom` CSS px: the UI scale
 * setting (auto by viewport, 0.75x / 1x / 1.25x / 1.5x / 2x; W-34) snapped to quarter device pixels and drawn nearest-neighbour
 * (image-rendering: pixelated, the @1x / @2x asset by device pixel ratio), so the pixel art stays sharp.
 */
import type { BuildingType, SiegeType } from '../../types';

export const UI = 'war/ui/';
const url = (f: string) => `url(${UI}${f})`;
/** Image-set of a kit PNG and its @2x twin. */
const set = (f: string) => `image-set(${url(f)} 1x, ${url(f.replace('.png', '@2x.png'))} 2x)`;

/** UI scale steps a player can pick (W-34); 'auto' picks by viewport. Persisted in localStorage. */
export type UiScale = 'auto' | 0.75 | 1 | 1.25 | 1.5 | 2;
export const UI_SCALES: UiScale[] = ['auto', 0.75, 1, 1.25, 1.5, 2];
const SCALE_KEY = 'war.uiScale';
export function uiScale(): UiScale {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    if ((UI_SCALES as number[]).includes(v)) return v as UiScale;
  } catch { /* storage blocked: auto */ }
  return 'auto';
}
export function setUiScale(v: UiScale): void {
  try { localStorage.setItem(SCALE_KEY, String(v)); } catch { /* storage blocked: this session only */ }
}
/** Auto: the largest step whose 900 x 560 art-px layout fits the viewport (1440 x 900: 1.5, 1280 x 720: 1.25, 1920 x 1080: 1.75). */
export const autoStep = (w = innerWidth, h = innerHeight) => [2.5, 2, 1.75, 1.5, 1.25, 1].find((k) => w >= 900 * k && h >= 560 * k) ?? 0.75;

/** CSS px per art px: the step snapped to quarter device pixels; nearest-neighbour keeps the art sharp at the fractional steps. */
export function uiZoom(): number {
  const set = uiScale(), step = set === 'auto' ? autoStep() : set, dpr = devicePixelRatio || 1;
  return Math.max(0.5, Math.round(step * dpr * 4) / 4) / dpr;
}

/** Meander frames tile with this period: the width minus the side slices must be a multiple of it. */
export const PERIOD = 6;
export const SIDE = 6;
export const snapW = (w: number) => SIDE * 2 + Math.ceil((w - SIDE * 2) / PERIOD) * PERIOD;

export const UNIT_ICON: Record<string, string> = {
  militia: 'unit-militia', hoplite: 'unit-hoplite', celt_sword: 'unit-swordsman', archer: 'unit-archer', slinger: 'unit-slinger', javelineer: 'unit-javelineer',
};
/** Keyed loosely: sim branches add building types (brazier, pitch kiln) ahead of their icons. */
export const BUILDING_ICON: Record<BuildingType, string> & Record<string, string> = {
  camp: 'bld-camp', storehouse: 'bld-storehouse', outpost: 'bld-outpost', fort: 'bld-fort', barracks: 'bld-barracks', farm: 'bld-farm', olivePress: 'bld-olive-press',
  palisade: 'bld-palisade', rampart: 'bld-rampart', stoneWall: 'bld-stone-wall', woodStairs: 'bld-stairs-wood', stoneStairs: 'bld-stairs-stone', ladder: 'bld-ladder',
  woodTower: 'bld-tower-wood', stoneTower: 'bld-tower-stone', woodGate: 'bld-gate', stoneGate: 'bld-gate', woodBridge: 'bld-bridge-wood', stoneBridge: 'bld-bridge-stone',
  brazier: 'bld-brazier', pitchKiln: 'bld-pitch-kiln', chest: 'bld-storehouse',
  // M5h workplaces (ART-C has no kit icon for them): the level's own done art, shrunk (icon() 'art:')
  forge: 'art:forge-done', forge2: 'art:forge2-done', forge3: 'art:forge3-done', cookhouse: 'art:cookhouse-done', cookhouse2: 'art:cookhouse2-done', cookhouse3: 'art:cookhouse3-done',
  infirmary: 'art:infirmary-done', infirmary2: 'art:infirmary2-done', infirmary3: 'art:infirmary3-done', workshop: 'art:workshop-done', workshop2: 'art:workshop2-done', workshop3: 'art:workshop3-done',
  stall: 'art:market-stall-done', stall2: 'art:market-stall2-done', stall3: 'art:market-stall3-done', sortingFloor: 'art:sorting-floor-done', sortingFloor2: 'art:sorting-floor2-done',
  // M5h3: placeholders until ART-C draws them
  stakes: 'art:stakes-done', ditch: 'bld-palisade', towerBridge: 'bld-ladder',
};
export const SIEGE_ICON: Record<SiegeType, string> = { ram: 'bld-ram', stoneThrower: 'bld-stone-thrower', siegeLadder: 'bld-siege-ladder', mantlet: 'art:../siege/mantlet-s-done-front', coveredRam: 'art:../siege/covered-ram-s-done-front', oxybeles: 'art:../siege/oxybeles-s-done', siegeTower: 'art:../siege/siege-tower-s-done-front', handcart: 'bld-siege-ladder', wagon: 'bld-siege-ladder' }; // M5h3 designs: their engine art until kit icons exist

/** An icon from the first kit (full colour), 24 or 32 art px; `art:<file>` is a building sprite (public/war/buildings) fitted into the box. */
export const icon = (id: string, size: 24 | 32 = 24) => id.startsWith('art:')
  ? `<img class="ic" src="war/buildings/${id.slice(4)}.png" width="${size}" height="${size}" alt="" style="object-fit:contain;image-rendering:auto">`
  : `<img class="ic" src="${UI}icons/${size}/${id}.png" srcset="${UI}icons/${size}/${id}@2x.png 2x" width="${size}" height="${size}" alt="">`;

/** A CSS cursor from the kit. */
export const CURSOR_HOT: Record<string, [number, number]> = { default: [2, 2], move: [16, 16], attack: [3, 3], build: [24, 6], gather: [27, 15], interact: [2, 2], invalid: [16, 16] };
export const cursor = (id: string, fallback = 'auto') => `${set(`cursors/${id}.png`)} ${CURSOR_HOT[id][0]} ${CURSOR_HOT[id][1]}, ${fallback}`;
/** What can be clicked in a HUD panel (it takes the kit's interact cursor). */
const CLICKABLE = ['button', '[data-node]', '[data-pid]', '[data-act]', '[data-tab]', '[data-recipe]', '[data-queue]', '[data-civ]', '[data-mode]', '.rf-row', '.rr-row', '.wp-cr', '.wp-r', '.opt', '[style*="cursor:pointer"]', '[style*="cursor: pointer"]'];
/** What cannot be clicked now (the invalid cursor). */
const BLOCKED = ['button:disabled', '.tg-n.locked', '.wp-cr.empty'];
/** The kit's cursors over the HUD (the canvas gets them from ./hud.ts): default, interact on what clicks, invalid when it is disabled; text fields keep a text cursor. */
const CURSORS = `.rf{cursor:${cursor('default', 'default')}}.rf *{cursor:inherit}
${CLICKABLE.map((x) => `.rf ${x}`).join(',')}{cursor:${cursor('interact', 'pointer')}!important}
${BLOCKED.map((x) => `.rf ${x},.rf ${x} *`).join(',')}{cursor:${cursor('invalid', 'not-allowed')}!important}
.rf input,.rf textarea{cursor:text!important}`;

const nine = (f: string, l: number, t: number, r: number, b: number, rep = 'stretch', fill = ' fill') =>
  `border-style:solid;border-width:${t}px ${r}px ${b}px ${l}px;border-image:${set(f)} ${t} ${r} ${b} ${l}${fill} / ${t}px ${r}px ${b}px ${l}px ${rep};`;
/** A frame as ornament only: the sprite's edges around a solid surface. The frames' centre slices hold the meander's inner
 * lines, which stretch into stripes and terracotta blocks at some scales, so text never sits on them. */
const frame = (f: string, l: number, t: number, r: number, b: number, rep = 'stretch') =>
  nine(f, l, t, r, b, rep, '') + 'background:var(--rf-panel);background-clip:padding-box;';

/**
 * Tokens (W-32 palette). Every text / surface pair passes WCAG AA (4.5:1 body, 3:1 large): on --rf-panel cream 13.7, title
 * 10.2, muted 8.0, accent 7.0, good 10.9, bad 7.7, gold 10.0, disabled 4.5; on --rf-sel cream 10.5, title 7.8, muted 6.1.
 * Terracotta (--rf-line, --rf-accent) is for borders and ornament: no text sits on a terracotta fill.
 */
export const TOKENS = `:root{
  --rf-panel:#17100d;--rf-raised:#251812;--rf-sunk:#0e0907;--rf-hover:#2c1c15;--rf-sel:#3d2414;
  --rf-ink:#f0d9b5;--rf-title:#f2b27a;--rf-muted:#bba58c;--rf-disabled:#8a786a;
  --rf-accent:#de8a4e;--rf-line:#7a3418;--rf-rule:#3a2418;--rf-good:#9fd47a;--rf-bad:#f08a70;--rf-gold:#e0b867;
  --rf-title-font:700 14px/1.1 Cinzel,serif;--rf-body:600 12px/1.3 Inter,system-ui,sans-serif}`;

export const CSS = TOKENS + CURSORS + `
.rf{position:fixed;z-index:4;color:var(--rf-ink);font:var(--rf-body);user-select:none;image-rendering:pixelated;box-sizing:border-box;font-variant-numeric:tabular-nums}
.rf *{box-sizing:border-box}
.rf img{image-rendering:pixelated;display:block}
.rf-band{${frame('frames/band.png', SIDE, 10, SIDE, 10, 'repeat stretch')}}
.rf-card{${frame('frames/card.png', SIDE, 10, SIDE, 4, 'repeat stretch')}}
.rf-tip{${frame('frames/tooltip.png', 4, 4, 4, 4)}padding:4px 7px;pointer-events:none;white-space:nowrap;line-height:1.4}
.rf-label{${frame('frames/label.png', 3, 3, 3, 3)}padding:3px 6px;pointer-events:none;white-space:nowrap;font-size:12px;line-height:15px}
.rf-label b,.rf-tip b.k{color:var(--rf-accent)}
.rf-name{font:var(--rf-title-font);color:var(--rf-title);letter-spacing:.02em}
.rf-head{display:flex;align-items:center;gap:6px;padding-bottom:4px;border-bottom:1px solid var(--rf-rule)}
.rf-dim{color:var(--rf-muted)}
.rf-num{font-variant-numeric:tabular-nums}
.rf-btn{width:30px;height:30px;padding:0;border:0;background:${set('buttons/button-icon-normal.png')} 0 0/30px 30px;display:flex;align-items:center;justify-content:center;position:relative}
.rf-btn:hover{background-image:${set('buttons/button-icon-hover.png')}}
.rf-btn:active,.rf-btn.press{background-image:${set('buttons/button-icon-pressed.png')}}
.rf-btn:active .ic,.rf-btn.press .ic{transform:translateY(1px)}
.rf-btn.on{background-image:${set('buttons/button-icon-active.png')}}
.rf-btn:disabled{background-image:${set('buttons/button-icon-disabled.png')}}
.rf-btn:disabled .ic{opacity:.4;filter:grayscale(.7)}
.rf button:focus{outline:none}
.rf button:focus-visible{outline:1px solid var(--rf-title);outline-offset:1px}
.rf-tbtn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:23px;min-width:23px;padding:0 8px;color:var(--rf-ink);font:600 12px/1 Inter,sans-serif;white-space:nowrap;background:none;${nine('buttons/button-normal.png', 3, 3, 3, 3)}}
.rf-tbtn:hover{border-image-source:${set('buttons/button-hover.png')};color:#fff0d8}
.rf-tbtn:active{border-image-source:${set('buttons/button-pressed.png')};padding-top:1px}
.rf-tbtn.on,.rf-tbtn.pri{border-image-source:${set('buttons/button-active.png')};color:#fff0d8}
.rf-tbtn.pri:hover{filter:brightness(1.12)}
.rf-tbtn:disabled{border-image-source:${set('buttons/button-disabled.png')};color:var(--rf-disabled);filter:none;padding-top:0}
.rf-tbtn.x{width:23px;padding:0;font-size:13px}
.rf-tab{height:22px;padding:0 9px;margin-right:2px;color:var(--rf-muted);font:600 12px/1 Inter,sans-serif;background:none;white-space:nowrap;${nine('buttons/tab-inactive.png', 3, 3, 3, 2)}}
.rf-tab:hover{border-image-source:${set('buttons/tab-hover.png')};color:var(--rf-ink)}
.rf-tab.on{border-image-source:${set('buttons/tab-active.png')};color:var(--rf-title);height:23px;margin-bottom:-1px}
.rf-segs{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}
.rf-segs .rf-tbtn{width:100%}
.rf-bar{height:6px;${nine('bars/track.png', 2, 0, 2, 0)}position:relative}
.rf-bar i{position:absolute;left:-1px;top:1px;height:4px;background-size:2px 4px;background-repeat:repeat-x}
.rf-bar i.hp{background-image:${url('bars/fill-hp.png')}} .rf-bar i.construction{background-image:${url('bars/fill-construction.png')}}
.rf-bar i.burn{background-image:${url('bars/fill-burn.png')}} .rf-bar i.ok{background-image:${url('bars/fill-ok.png')}}
.rf-sep{width:1px;align-self:stretch;background:var(--rf-line);box-shadow:1px 0 0 var(--rf-sunk);margin:0 4px}
.rf-cap{font:700 11.5px/1.2 Cinzel,serif;color:var(--rf-accent);letter-spacing:.04em;margin:0 0 3px 1px}
.rf-cap .rf-dim{font:600 11.5px/1 Inter,sans-serif}
.rf-row{box-shadow:inset 3px 0 0 transparent}
.rf-row:hover{background:var(--rf-hover)}
.rf-row.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.rf-seg{display:flex}
.rf-seg button{width:28px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;position:relative;background:none;${nine('buttons/button-icon-normal.png', 3, 3, 3, 3)}}
.rf-seg button:hover{border-image-source:${set('buttons/button-icon-hover.png')}}
.rf-seg button.on{border-image-source:${set('buttons/button-icon-active.png')}}
.rf-seg button .key,.rf-btn .key{position:absolute;right:2px;bottom:1px;font:700 9px/1 Inter,sans-serif;color:var(--rf-ink);text-shadow:0 1px 0 #0e0907,0 0 2px #0e0907}
.rf input{font:600 12px/1 Inter,sans-serif;width:30px;height:23px;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);padding:0 3px}
`;

/** Keep a top-anchored panel inside the window: it scrolls past the bottom edge (4 art px margin). */
export function fitHeight(el: HTMLElement): void {
  const z = Number(el.style.zoom) || 1;
  el.style.maxHeight = `${Math.floor(innerHeight / z - (parseFloat(el.style.top) || 0) - 4)}px`;
  el.style.overflowY = 'auto';
  el.style.scrollbarWidth = 'thin';
  el.style.scrollbarColor = '#7a3418 #0e0907';
}

/**
 * Place a tooltip away from its anchor's panel, so it never covers the panel's own title: a side panel's tip sits beside the
 * panel (on the side with room, level with the anchor), a bottom bar's above it; flipped and clamped at the window edges.
 */
export function placeTip(tip: HTMLElement, el: HTMLElement): void {
  const z = Number(tip.style.zoom) || 1, r = el.getBoundingClientRect(), p = (el.closest('.rf') ?? el).getBoundingClientRect(), t = tip.getBoundingClientRect(), g = 6;
  const left = p.left - t.width - g, right = p.right + g, fitsL = left >= 4, fitsR = right + t.width <= innerWidth - 4;
  let x: number, y: number;
  if (!(p.bottom > innerHeight * 0.7 && p.height < innerHeight * 0.45) && (fitsL || fitsR)) {
    x = fitsL && (!fitsR || p.left > innerWidth - p.right) ? left : right;
    y = r.top + r.height / 2 - t.height / 2;
  } else {
    x = r.left + r.width / 2 - t.width / 2;
    y = Math.min(r.top, p.top) - t.height - g;
    if (y < 4) y = Math.max(r.bottom, p.bottom) + g;
  }
  tip.style.left = `${Math.max(4, Math.min(innerWidth - t.width - 4, x)) / z}px`;
  tip.style.top = `${Math.max(4, Math.min(innerHeight - t.height - 4, y)) / z}px`;
}

/** A bar: kind hp / construction / burn / ok, value 0..1, width in art px. */
export const bar = (kind: string, v: number, w: number) => `<div class="rf-bar" style="width:${w}px"><i class="${kind}" style="width:${Math.round((w - 2) * Math.max(0, Math.min(1, v)))}px"></i></div>`;
