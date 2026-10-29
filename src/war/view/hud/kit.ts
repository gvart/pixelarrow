/**
 * The UI kit (W-32; icons and cursors: public/war/ui/): its CSS (the frames, buttons, bars, label and tooltip are drawn
 * in CSS from the tokens of ./theme.ts, the Dota 2 hybrid look) and the scale. 1 art px = `zoom` CSS px: the UI scale
 * setting (auto by viewport, 0.75x / 1x / 1.25x / 1.5x / 2x; W-34) snapped to quarter device pixels and drawn nearest-neighbour
 * (image-rendering: pixelated, the @1x / @2x asset by device pixel ratio), so the pixel art stays sharp.
 */
import type { BuildingType, SiegeType } from '../../types';
import type { ActionId } from '../../input/actions';
import { keys } from '../../input/keys';
import { THEME_CSS, tipHtml, TOKENS } from './theme';

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
  brazier: 'bld-brazier', pitchKiln: 'bld-pitch-kiln', chest: 'trade-chest',
  // M5h workplaces (ART-C has no kit icon for them): the level's own done art, shrunk (icon() 'art:')
  forge: 'art:forge-done', forge2: 'art:forge2-done', forge3: 'art:forge3-done', cookhouse: 'art:cookhouse-done', cookhouse2: 'art:cookhouse2-done', cookhouse3: 'art:cookhouse3-done',
  infirmary: 'art:infirmary-done', infirmary2: 'art:infirmary2-done', infirmary3: 'art:infirmary3-done', workshop: 'art:workshop-done', workshop2: 'art:workshop2-done', workshop3: 'art:workshop3-done',
  stall: 'art:market-stall-done', stall2: 'art:market-stall2-done', stall3: 'art:market-stall3-done', sortingFloor: 'art:sorting-floor-done', sortingFloor2: 'art:sorting-floor2-done',
  // M5h3: placeholders until ART-C draws them
  stakes: 'art:stakes-done', ditch: 'bld-palisade', towerBridge: 'bld-ladder',
  // M7a pre-built pieces: stand-ins until their kit icons exist
  house: 'bld-storehouse', cottage: 'bld-storehouse', tent: 'bld-camp', temple: 'bld-fort', shrine: 'bld-outpost', stoa: 'art:market-stall2-done', statue: 'bld-outpost',
  well: 'bld-outpost', jetty: 'bld-bridge-wood', warehouse: 'bld-storehouse', board: 'trade-chest', cache: 'trade-chest', tunnel: 'bld-fort',
};
export const SIEGE_ICON: Record<SiegeType, string> = { ram: 'bld-ram', stoneThrower: 'bld-stone-thrower', siegeLadder: 'bld-siege-ladder', mantlet: 'art:../siege/mantlet-s-done-front', coveredRam: 'art:../siege/covered-ram-s-done-front', oxybeles: 'art:../siege/oxybeles-s-done', siegeTower: 'art:../siege/siege-tower-s-done-front', handcart: 'trade-cart', wagon: 'trade-wagon' }; // M5h3 designs: their engine art until kit icons exist

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

/** The design tokens and the shared pieces live in ./theme.ts (one file for colours, borders, fonts, shadows, timing). */
export { TOKENS };

export const CSS = TOKENS + CURSORS + `
.rf{position:fixed;z-index:4;color:var(--rf-ink);font:var(--rf-body);user-select:none;image-rendering:pixelated;box-sizing:border-box;font-variant-numeric:tabular-nums}
.rf *{box-sizing:border-box}
.rf img{image-rendering:pixelated;display:block}
.rf-tip{pointer-events:none;white-space:nowrap;line-height:1.4}
.rf-label{pointer-events:none;white-space:nowrap;font-size:12px;line-height:15px}
.rf-label b,.rf-tip b.k{color:var(--rf-accent)}
.rf-name{font:var(--rf-title-font);color:var(--rf-title);letter-spacing:.02em}
.rf-head{display:flex;align-items:center;gap:6px;padding-bottom:4px;border-bottom:1px solid var(--rf-rule)}
.rf-dim{color:var(--rf-muted)}
.rf-num{font-variant-numeric:tabular-nums}
.rf button:focus{outline:none}
.rf button:focus-visible{outline:1px solid var(--rf-title);outline-offset:1px}
.rf-tbtn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:23px;white-space:nowrap}
.rf-tbtn:disabled{filter:none;padding-top:0}
.rf-tbtn.x{width:23px;padding:0;font-size:13px}
.rf-tab{white-space:nowrap}
.rf-segs{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}
.rf-segs .rf-tbtn{width:100%}
.rf-bar{position:relative}
.rf-bar i{position:absolute}
.rf-sep{align-self:stretch}
.rf-cap{font:700 11.5px/1.2 Cinzel,serif;color:var(--rf-accent);letter-spacing:.04em;margin:0 0 3px 1px}
.rf-cap .rf-dim{font:600 11.5px/1 Inter,sans-serif}
.rf-row{box-shadow:inset 3px 0 0 transparent}
.rf-row:hover{background:var(--rf-hover)}
.rf-row.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.rf-btn .rf-badge{position:absolute;display:flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 3px;border-radius:8px;font:700 10px/1 Inter,sans-serif;pointer-events:none}
.rf-chip{display:inline-block;margin-top:3px;padding:1px 5px;font:700 10.5px/14px Inter,sans-serif;color:var(--rf-bad);background:var(--rf-sunk);border:1px solid var(--rf-line);white-space:nowrap}
.rf input{font:600 12px/1 Inter,sans-serif;width:30px;height:23px;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);padding:0 3px}
.rf select{font:600 12px/1 Inter,sans-serif;height:23px;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);padding:0 2px}
/* panels: a title bar (icon, title and subtitle, close), section captions with a rule, a sunk well */
.rf-ph{display:flex;align-items:center;gap:7px;padding:2px 0 6px;margin-bottom:6px;border-bottom:1px solid var(--rf-line);box-shadow:0 1px 0 var(--rf-sunk)}
.rf-ph .rf-name{font-size:16px}
.rf-ph .sub{font:600 11px/1.2 Inter,sans-serif;color:var(--rf-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rf-sec{display:flex;align-items:center;gap:6px;font:700 11px/1 Cinzel,serif;color:var(--rf-accent);letter-spacing:.06em;text-transform:uppercase;margin:8px 0 4px}
.rf-sec::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--rf-line),transparent)}
.rf-sec .rf-dim{font:600 11px/1 Inter,sans-serif;text-transform:none;letter-spacing:0}
.rf-well{background:var(--rf-sunk);border:1px solid var(--rf-rule);box-shadow:inset 0 1px 3px rgba(0,0,0,.6)}
.rf-scroll{overflow-y:auto;scrollbar-width:thin;scrollbar-color:#5f4b2a #050506}
/* a cost chip against what the player has: red with "/have" when short */
.rf-need{display:inline-flex;align-items:center;gap:2px;height:22px;padding:0 5px 0 2px;margin:0 3px 3px 0;background:var(--rf-raised);border:1px solid var(--rf-rule);font:700 12px/1 Inter,sans-serif;white-space:nowrap}
.rf-need b{color:var(--rf-ink)}.rf-need i{font-style:normal;font-weight:600;color:var(--rf-bad)}
.rf-need.short{border-color:#8a3a26;background:#2a120c}.rf-need.short b{color:var(--rf-bad)}
.rf-hint{font:600 11.5px/1.3 Inter,sans-serif;color:var(--rf-bad)}
/* a small pill: a status or a tag (good, gold, bad, dim) */
.rf-pill{display:inline-flex;align-items:center;gap:3px;height:16px;padding:0 5px;font:700 9.5px/1 Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--rf-rule);background:var(--rf-sunk);color:var(--rf-muted);white-space:nowrap}
.rf-pill.good{color:var(--rf-good);border-color:#3f5a2c}.rf-pill.gold{color:var(--rf-gold);border-color:#6a5326}.rf-pill.bad{color:var(--rf-bad);border-color:#6a2c1c}
/* an inventory slot: icon, count in the corner, rarity edge */
.rf-cell{position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#1e2127,#0d0f12);border:1px solid #2b2c2f;box-shadow:inset 0 0 0 1px #050506}
.rf-cell:hover{border-color:var(--rf-accent);background:radial-gradient(circle at 50% 40%,#2b2f37,#160d09)}
.rf-cell .n{position:absolute;right:2px;bottom:1px;font:700 10.5px/1 Inter,sans-serif;color:var(--rf-ink);text-shadow:0 1px 0 #050506,0 0 2px #050506,0 0 2px #050506}
.rf-cell .w{position:absolute;left:2px;top:2px;width:5px;height:5px;background:var(--rf-bad);box-shadow:0 0 0 1px #050506}
.rf-cell.empty{background:#0f0907;border-color:#1a1c20}
.rf-cell.empty:hover{border-color:#1a1c20}
/* a quantity stepper: − n + */
.rf-step{display:inline-flex;align-items:center}
.rf-step button{width:22px;padding:0}.rf-step input{width:46px;text-align:center;border-left:0;border-right:0}
.rf-lv{display:inline-block;vertical-align:2px;margin-left:3px;padding:2px 4px 1px;font:700 9.5px/1 Inter,sans-serif;letter-spacing:.04em;color:var(--rf-gold);border:1px solid #6a5326;background:var(--rf-sunk)}
.bk-stat{display:flex;align-items:center;gap:5px;margin-top:4px;font:600 11.5px/14px Inter,sans-serif;color:var(--rf-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-stat::before{content:'';flex:none;width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 4px currentColor}
.bk-stat.good{color:var(--rf-good)}.bk-stat.bad{color:var(--rf-bad)}.bk-stat.gold{color:var(--rf-gold)}
.rf-tbtn.big{height:30px;padding:0 16px;font:700 14px/1 Cinzel,serif;letter-spacing:.04em}
/* W-61: a level ring (gold fill to the next level), an icon chip with a number, a checklist row, a big bar, a medallion */
.rf-ring{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:conic-gradient(var(--rf-gold) calc(var(--p) * 1turn),#2c1c15 0);box-shadow:0 0 0 1px #050506}
.rf-ring::before{content:'';position:absolute;inset:3px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#2b2f37,#0d0f12);box-shadow:0 0 0 1px #6a5326}
.rf-ring b{position:relative;font:700 13px/1 Cinzel,serif;color:var(--rf-title)}
.rf-ichip{display:inline-flex;align-items:center;gap:2px;height:26px;padding:0 6px 0 1px;background:var(--rf-raised);border:1px solid var(--rf-rule);font:700 12px/1 Inter,sans-serif;color:var(--rf-ink);white-space:nowrap}
.rf-ichip.good{color:var(--rf-good);border-color:#3f5a2c}.rf-ichip.gold{color:var(--rf-gold);border-color:#6a5326}
.rf-ichip.dim{color:var(--rf-disabled);background:var(--rf-sunk);border-style:dashed}.rf-ichip.dim .ic,.rf-ichip.dim .gl{opacity:.45;filter:grayscale(1)}
.rf-ichip .up{color:var(--rf-gold);font-size:9px;margin-left:1px}
.rf-check{display:grid;grid-template-columns:24px 1fr 46px 16px;align-items:center;gap:0 6px;min-height:30px;padding:1px 4px 1px 2px;border-bottom:1px solid #1a1c20}
.rf-check .l{font:600 11.5px/1.2 Inter,sans-serif;color:var(--rf-ink)}.rf-check .rf-bar{margin-top:3px}
.rf-check .v{text-align:right;font:700 12px/1 Inter,sans-serif}
.rf-check.ok .v{color:var(--rf-good)}.rf-check.no .v{color:var(--rf-bad)}
.rf-medal{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:radial-gradient(circle at 50% 35%,#4a3018,#1a100a);box-shadow:0 0 0 1px #050506,inset 0 0 0 1.5px var(--rf-gold)}
.rf-tip .tip-w{display:block;white-space:normal;width:max-content;max-width:240px}
.rf-medal.me{box-shadow:0 0 0 1px #050506,inset 0 0 0 1.5px var(--rf-gold),0 0 6px rgba(224,184,103,.7)}
` + THEME_CSS;

/** A level ring: `p` 0..1 of the way to the next level in gold round `inner` (the level numeral), `px` across. */
export const ring = (p: number, px: number, inner: string) => `<span class="rf-ring" style="--p:${Math.max(0, Math.min(1, p)).toFixed(3)};width:${px}px;height:${px}px">${inner}</span>`;

/** Keep a top-anchored panel inside the window: it scrolls past the bottom edge (`bottom` art px margin, 4 by default). */
export function fitHeight(el: HTMLElement, bottom = 4): void {
  const z = Number(el.style.zoom) || 1;
  // the top bar's offset (./theme.ts: panels anchored at the top take it as margin) counts as top
  const below = parseFloat(getComputedStyle(el).marginTop) || 0;
  el.style.maxHeight = `${Math.floor(innerHeight / z - (parseFloat(el.style.top) || 0) - below - bottom)}px`;
  el.style.overflowY = 'auto';
  el.style.scrollbarWidth = 'thin';
  el.style.scrollbarColor = '#5f4b2a #050506';
}

/** The panels that open at the top left (forge, market, roster, soldier card, memorial): the quest tracker and events card give way. */
export const LEFT_PANELS = ['cfWp', 'cfTree', 'rfMarket', 'rfHandoff', 'rrPanel', 'rrCard', 'mmPanel'];
export const leftPanelOpen = () => LEFT_PANELS.some((id) => { const p = document.getElementById(id); return !!p && p.style.display !== 'none'; });

/** Panels that Esc closes (class `rf-esc`): while one shows, Esc is theirs, not the game menu's. */
export const escPanelOpen = () => [...document.querySelectorAll<HTMLElement>('.rf-esc')].some((p) => p.style.display !== 'none');

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

/** The windows of the menu bar's buttons share one place at the top right: opening one closes the others (by their buttons). */
const CORNER_WINDOWS = ['rfWorksBtn', 'rfTasksBtn', 'rfCrownBtn', 'rfHoldingsBtn', 'rfFavourBtn'];
export function closeCornerWindows(except: string): void {
  for (const id of CORNER_WINDOWS) if (id !== except) { const b = document.getElementById(id); if (b?.classList.contains('on')) b.click(); }
}

/** The menu bar, bottom right, left of the chest, roster and build buttons (made by ./hud.ts); its buttons sort by `order`. */
export const MENU_BAR = 'rfMenus';
const shortKey = (id: ActionId) => keys.label(id).replace('Shift+', '⇧');

/**
 * A menu bar button: the kit's icon frame, its key in the corner, a tooltip (name, what, key) and a count badge
 * (`setBadge`). Its key (src/war/input/actions.ts) clicks it while the button shows.
 */
export function menuBtn(id: string, ic: string, name: string, what: string, action: ActionId, order: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'rf-btn';
  b.id = id;
  b.style.order = String(order);
  const paint = () => {
    const badge = b.querySelector('.rf-badge');
    b.innerHTML = icon(ic) + `<span class="key">${shortKey(action)}</span>`;
    if (badge) b.appendChild(badge);
    b.dataset.tip = tipHtml(name, what, keys.label(action));
  };
  paint();
  keys.onChange(paint);
  document.getElementById(MENU_BAR)?.appendChild(b);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (keys.act(e) !== action || b.style.display === 'none' || !b.isConnected) return;
    e.preventDefault();
    b.click();
  });
  return b;
}

/** A count on a menu bar button (0 hides it); `gold` for something to collect rather than to answer. */
export function setBadge(b: HTMLElement, n: number, gold = false): void {
  let el = b.querySelector<HTMLElement>('.rf-badge');
  if (!n) return void el?.remove();
  if (!el) { el = document.createElement('b'); el.className = 'rf-badge'; b.appendChild(el); }
  el.classList.toggle('gold', gold);
  el.textContent = String(n);
}

/** A bar: kind hp / construction / burn / ok, value 0..1, width in art px. */
export const bar = (kind: string, v: number, w: number) => `<div class="rf-bar" style="width:${w}px"><i class="${kind}" style="width:${Math.round((w - 2) * Math.max(0, Math.min(1, v)))}px"></i></div>`;
