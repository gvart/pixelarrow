/**
 * The red-figure UI kit (W-32, public/war/ui/ui.json): its CSS (9-slice frames as border-image, buttons with their
 * states, bars, the hover label, the tooltip) and the scale. 1 art px = `zoom` CSS px: whole device pixels per art pixel
 * (round(devicePixelRatio), doubled on very large viewports), so the pixel art stays crisp at 1x and 2x.
 */
import type { BuildingType, SiegeType } from '../../types';

export const UI = 'war/ui/';
const url = (f: string) => `url(${UI}${f})`;
/** Image-set of a kit PNG and its @2x twin. */
const set = (f: string) => `image-set(${url(f)} 1x, ${url(f.replace('.png', '@2x.png'))} 2x)`;

/** CSS px per art px. */
export function uiZoom(): number {
  const dpr = devicePixelRatio || 1, dev = Math.max(1, Math.round(dpr)), big = innerWidth >= 2400 && innerHeight >= 1350 ? 2 : 1;
  return (dev * big) / dpr;
}

/** Meander frames tile with this period: the width minus the side slices must be a multiple of it. */
export const PERIOD = 6;
export const SIDE = 6;
export const snapW = (w: number) => SIDE * 2 + Math.ceil((w - SIDE * 2) / PERIOD) * PERIOD;

export const UNIT_ICON: Record<string, string> = {
  militia: 'unit-militia', hoplite: 'unit-hoplite', celt_sword: 'unit-swordsman', archer: 'unit-archer', slinger: 'unit-slinger', javelineer: 'unit-javelineer',
};
export const BUILDING_ICON: Record<BuildingType, string> = {
  camp: 'bld-camp', storehouse: 'bld-storehouse', outpost: 'bld-outpost', fort: 'bld-fort', barracks: 'bld-barracks', farm: 'bld-farm', olivePress: 'bld-olive-press',
  palisade: 'bld-palisade', rampart: 'bld-rampart', stoneWall: 'bld-stone-wall', woodStairs: 'bld-stairs-wood', stoneStairs: 'bld-stairs-stone', ladder: 'bld-ladder',
  woodTower: 'bld-tower-wood', stoneTower: 'bld-tower-stone', woodGate: 'bld-gate', stoneGate: 'bld-gate', woodBridge: 'bld-bridge-wood', stoneBridge: 'bld-bridge-stone',
};
export const SIEGE_ICON: Record<SiegeType, string> = { ram: 'bld-ram', stoneThrower: 'bld-stone-thrower', siegeLadder: 'bld-siege-ladder' };

/** An icon from the first kit (full colour), 24 or 32 art px. */
export const icon = (id: string, size: 24 | 32 = 24) => `<img class="ic" src="${UI}icons/${size}/${id}.png" srcset="${UI}icons/${size}/${id}@2x.png 2x" width="${size}" height="${size}" alt="">`;

/** A CSS cursor from the kit. */
export const CURSOR_HOT: Record<string, [number, number]> = { default: [2, 2], move: [16, 16], attack: [3, 3], build: [24, 6], gather: [27, 15], interact: [2, 2], invalid: [16, 16] };
export const cursor = (id: string) => `${set(`cursors/${id}.png`)} ${CURSOR_HOT[id][0]} ${CURSOR_HOT[id][1]}, auto`;

const nine = (f: string, l: number, t: number, r: number, b: number, rep = 'stretch') =>
  `border-style:solid;border-width:${t}px ${r}px ${b}px ${l}px;border-image:${set(f)} ${t} ${r} ${b} ${l} fill / ${t}px ${r}px ${b}px ${l}px ${rep};`;

export const CSS = `
.rf{position:fixed;z-index:4;color:#f0d9b5;font:600 11px/1 Inter,system-ui,sans-serif;user-select:none;image-rendering:pixelated;box-sizing:border-box}
.rf *{box-sizing:border-box}
.rf img{image-rendering:pixelated;display:block}
.rf-band{${nine('frames/band.png', SIDE, 10, SIDE, 10, 'repeat stretch')}}
.rf-card{${nine('frames/card.png', SIDE, 10, SIDE, 4, 'repeat stretch')}}
.rf-tip{${nine('frames/tooltip.png', 4, 4, 4, 4)}padding:3px 5px;pointer-events:none;white-space:nowrap}
.rf-label{${nine('frames/label.png', 3, 3, 3, 3)}padding:2px 4px;pointer-events:none;white-space:nowrap;font-size:11px;line-height:13px}
.rf-label b,.rf-tip b.k{color:#de8a4e}
.rf-name{font:700 14px/1 'Cormorant SC',serif;color:#f2b27a;letter-spacing:.02em}
.rf-dim{color:#a8907a}
.rf-num{font-variant-numeric:tabular-nums}
.rf-btn{width:30px;height:30px;padding:0;border:0;background:${set('buttons/button-icon-normal.png')} 0 0/30px 30px;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative}
.rf-btn:hover{background-image:${set('buttons/button-icon-hover.png')}}
.rf-btn:active,.rf-btn.press{background-image:${set('buttons/button-icon-pressed.png')}}
.rf-btn:active .ic,.rf-btn.press .ic{transform:translateY(1px)}
.rf-btn.on{background-image:${set('buttons/button-icon-active.png')}}
.rf-btn:disabled{background-image:${set('buttons/button-icon-disabled.png')};cursor:default}
.rf-btn:disabled .ic{opacity:.4;filter:grayscale(.7)}
.rf-btn .key{position:absolute;right:2px;bottom:1px;font-size:8px;color:#f0d9b5;text-shadow:0 1px 0 #0e0907}
.rf-tbtn{height:18px;padding:0 6px;color:#f0d9b5;font:600 10px/1 Inter,sans-serif;cursor:pointer;background:none;${nine('buttons/button-normal.png', 3, 3, 3, 3)}}
.rf-tbtn:hover{border-image-source:${set('buttons/button-hover.png')}}
.rf-tbtn:active{border-image-source:${set('buttons/button-pressed.png')}}
.rf-tbtn:disabled{border-image-source:${set('buttons/button-disabled.png')};color:#8a786a;cursor:default}
.rf-tab{height:16px;padding:0 8px;margin-right:2px;color:#a8907a;font:700 11px/1 'Cormorant SC',serif;cursor:pointer;background:none;${nine('buttons/tab-inactive.png', 3, 3, 3, 2)}}
.rf-tab:hover{border-image-source:${set('buttons/tab-hover.png')};color:#f0d9b5}
.rf-tab.on{border-image-source:${set('buttons/tab-active.png')};color:#f2b27a;height:17px;margin-bottom:-1px}
.rf-bar{height:6px;${nine('bars/track.png', 2, 0, 2, 0)}position:relative}
.rf-bar i{position:absolute;left:-1px;top:1px;height:4px;background-size:2px 4px;background-repeat:repeat-x}
.rf-bar i.hp{background-image:${url('bars/fill-hp.png')}} .rf-bar i.construction{background-image:${url('bars/fill-construction.png')}}
.rf-bar i.burn{background-image:${url('bars/fill-burn.png')}} .rf-bar i.ok{background-image:${url('bars/fill-ok.png')}}
.rf input{font:600 10px/1 Inter,sans-serif;width:26px;height:18px;background:#0e0907;color:#f0d9b5;border:1px solid #7a3418;padding:0 2px}
`;

/** A bar: kind hp / construction / burn / ok, value 0..1, width in art px. */
export const bar = (kind: string, v: number, w: number) => `<div class="rf-bar" style="width:${w}px"><i class="${kind}" style="width:${Math.round((w - 2) * Math.max(0, Math.min(1, v)))}px"></i></div>`;
