/**
 * Shared drawing of the tile-space maps (W-36: ./minimap.ts and ./fullMap.ts): the region painted in the current view mode
 * (../mapModes.ts, one px per 1 m cell, repainted when the mode or its live data change), turned 45 degrees so north matches
 * the iso camera (tile +x runs down-right, +y down-left), and the markers over it: buildings by owner (footprints; the
 * main ones as an icon badge on the full map), lairs by beast, claim banners, own squads, enemy squads only where own men
 * or buildings see them, and the camera's view (a rectangle: the screen in tile space, turned back upright).
 * Fog of war (W-39, ../fog.ts): team 0's fog grid shades the map (dark unexplored, dimmed explored); the sim client
 * already hides foes out of sight and keeps foe buildings as last seen; lairs show once their ground is explored.
 */
import { MOB_TEAM } from '../../sim/mobs';
import type { BuildingSnap, FogGrid } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { hex, TEAM_RGB } from '../mapModes';
import { BUILDING_ICON, UI } from './kit';

/** How far own men and buildings see, in tiles (enemies beyond are not marked). */
export const VISION = 24;
export const TEAM = TEAM_RGB.map(hex);
const INK = '#0e0907', CREAM = '#f0d9b5';

/**
 * The map's view: canvas px per tile k, turned by rot (radians), tile (cx, cy) at canvas px (ox, oy).
 * Canvas = o + R(rot) * (tile - c) * k.
 */
export interface MapXf { k: number; rot: number; cx: number; cy: number; ox: number; oy: number }
/** The iso turn: tile +x points down-right, +y down-left, as in the world view. */
export const ISO_ROT = Math.PI / 4;

export const toPx = (f: MapXf, x: number, y: number): [number, number] => {
  const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = (x - f.cx) * f.k, dy = (y - f.cy) * f.k;
  return [f.ox + dx * c - dy * s, f.oy + dx * s + dy * c];
};
export const toTile = (f: MapXf, px: number, py: number): { x: number; y: number } => {
  const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = px - f.ox, dy = py - f.oy;
  return { x: f.cx + (dx * c + dy * s) / f.k, y: f.cy + (-dx * s + dy * c) / f.k };
};

const painted = new WeakMap<SandboxScene, { key: string; cv: HTMLCanvasElement }>();

/** The region in the scene's view mode, one px per cell (cached per mode and live key). */
export function mapCanvas(s: SandboxScene): HTMLCanvasElement {
  const l = s.live(), key = s.mode + '|' + s.map.key(s.mode, l);
  let p = painted.get(s);
  if (!p) {
    const cv = document.createElement('canvas');
    cv.width = s.map.fw;
    cv.height = s.map.fh;
    p = { key: '', cv };
    painted.set(s, p);
  }
  if (p.key !== key) {
    p.key = key;
    p.cv.getContext('2d')!.putImageData(s.map.paint(s.map.tint(s.mode, l)), 0, 0);
  }
  return p.cv;
}

const fogged = new WeakMap<SandboxScene, { ver: number; cv: HTMLCanvasElement }>();

/** Team 0's fog, one px per vision cell (cached per version); null with fog off or none yet. */
function fogCanvas(s: SandboxScene): { cv: HTMLCanvasElement; g: FogGrid } | null {
  const g = s.sim.fog;
  if (!g || !s.sim.fogOn) return null;
  let p = fogged.get(s);
  if (!p) {
    const cv = document.createElement('canvas');
    p = { ver: -1, cv };
    fogged.set(s, p);
  }
  if (p.ver !== g.version) {
    p.ver = g.version;
    p.cv.width = g.w;
    p.cv.height = g.h;
    const ctx = p.cv.getContext('2d')!, im = ctx.createImageData(g.w, g.h);
    for (let c = 0; c < g.state.length; c++) {
      im.data[c * 4] = 8; im.data[c * 4 + 1] = 10; im.data[c * 4 + 2] = 16;
      im.data[c * 4 + 3] = g.state[c] === 2 ? 0 : g.state[c] === 1 ? 110 : 225;
    }
    ctx.putImageData(im, 0, 0);
  }
  return { cv: p.cv, g };
}

/** Team 0 has explored tile point (x, y) (always with fog off). */
function explored(s: SandboxScene, x: number, y: number): boolean {
  const g = s.sim.fog;
  if (!g || !s.sim.fogOn) return true;
  const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
  return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h && g.state[cy * g.w + cx] !== 0;
}

/** A kit icon as an image (24 / 32 art px and their @2x), loaded once. */
const imgs = new Map<string, HTMLImageElement>();
export function iconImg(id: string, size: 24 | 32 | 48 | 64): HTMLImageElement {
  const f = size === 48 ? `24/${id}@2x` : size === 64 ? `32/${id}@2x` : `${size}/${id}`;
  let im = imgs.get(f);
  if (!im) { im = new Image(); im.src = `${UI}icons/${f}.png`; imgs.set(f, im); }
  return im;
}
/** Draw a kit icon centred at (x, y), `px` canvas px wide: the nearest stored size, sharp when it matches. */
export function drawIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, px: number): boolean {
  const size = ([24, 32, 48, 64] as const).reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a));
  const im = iconImg(id, size);
  if (!im.complete || !im.naturalWidth) return false;
  const w = Math.round(px);
  g.imageSmoothingEnabled = w !== size;
  g.drawImage(im, Math.round(x - w / 2), Math.round(y - w / 2), w, w);
  return true;
}

/** Squads by team with their centre and men, enemies only where seen. */
export function squads(s: SandboxScene): { team: number; x: number; y: number; n: number; id: number }[] {
  const by = new Map<number, { team: number; x: number; y: number; n: number; id: number }>(), seen = new Set<number>();
  const cell = (x: number, y: number) => ((y / VISION) | 0) * 4096 + ((x / VISION) | 0);
  const eye = (x: number, y: number) => seen.add(cell(x, y));
  for (const d of s.drawn) {
    if (d.u.state === 'dead') continue;
    if (d.team === 0) eye(d.x, d.y);
    let q = by.get(d.u.squad);
    if (!q) by.set(d.u.squad, (q = { team: d.team, x: 0, y: 0, n: 0, id: d.u.squad }));
    q.x += d.x; q.y += d.y; q.n++;
  }
  for (const b of s.sim.cur?.buildings ?? []) if (b.team === 0 && b.state !== 'destroyed') eye(b.x, b.y);
  const sees = (x: number, y: number) => {
    const cx = (x / VISION) | 0, cy = (y / VISION) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (seen.has((cy + dy) * 4096 + cx + dx)) return true;
    return false;
  };
  const out = [];
  for (const q of by.values()) {
    q.x /= q.n; q.y /= q.n;
    if (q.team === 0 || s.sim.fog || sees(q.x, q.y)) out.push(q); // with a fog grid the client already hid the unseen
  }
  return out;
}

/** The camera's view in tiles: the screen corners on the ground (at the level under the screen centre). */
export function frustum(s: SandboxScene): { x: number; y: number }[] {
  const v = s.viewRect(), iso = s.iso, c = iso.pick((v.x + v.right) / 2, (v.y + v.bottom) / 2), z = iso.zAt(c.x, c.y);
  return [[v.x, v.y], [v.right, v.y], [v.right, v.bottom], [v.x, v.bottom]].map(([wx, wy]) => {
    const u = (wx - iso.OX) / 32, w = (wy - iso.OY + z * 16) / 16;
    return { x: (u + w) / 2, y: (w - u) / 2 };
  });
}

/** Buildings shown as an icon badge on the full map (walls, stairs and bridges stay footprints). */
const BADGE = new Set(['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress', 'woodTower', 'stoneTower', 'brazier', 'pitchKiln']);

/** A round marker disc: dark fill, a ring in `ring`, an icon inside. */
function badge(g: CanvasRenderingContext2D, x: number, y: number, r: number, ring: string, m: number, fill = 'rgba(14,9,7,0.82)'): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 1.5 * m; g.strokeStyle = ring; g.stroke();
  g.beginPath(); g.arc(x, y, r + 1.1 * m, 0, Math.PI * 2);
  g.lineWidth = 0.8 * m; g.strokeStyle = INK; g.stroke();
}

/** A squad: a round shield in the team colour with a cream rim; selected ones get a halo. */
function shield(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, sel: boolean, m: number): void {
  if (sel) { g.beginPath(); g.arc(x, y, r + 2.4 * m, 0, Math.PI * 2); g.fillStyle = 'rgba(255,240,200,0.55)'; g.fill(); }
  g.beginPath(); g.arc(x, y, r + m, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = sel ? '#fff4dc' : CREAM; g.fill();
  g.beginPath(); g.arc(x, y, r * 0.68, 0, Math.PI * 2); g.fillStyle = colour; g.fill();
  g.beginPath(); g.arc(x - r * 0.18, y - r * 0.18, r * 0.22, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
}

/**
 * Draw the map and its markers; `m` canvas px per art px for marker sizes; `full`: the full map (men when zoomed in,
 * icon badges for buildings, lairs and claims at full size).
 */
export function drawMap(g: CanvasRenderingContext2D, s: SandboxScene, f: MapXf, m: number, full = false): void {
  const P = (x: number, y: number) => toPx(f, x, y);
  const src = mapCanvas(s), c = Math.cos(f.rot), sn = Math.sin(f.rot);
  const [ax, ay] = P(0, 0);
  g.save();
  g.setTransform(c * f.k, sn * f.k, -sn * f.k, c * f.k, ax, ay);
  g.imageSmoothingEnabled = f.k < 4 * m; // cells stay sharp zoomed in
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, s.map.w, s.map.h);
  const fog = fogCanvas(s);
  if (fog) {
    g.imageSmoothingEnabled = true; // soft edges
    g.drawImage(fog.cv, 0, 0, fog.g.w * fog.g.cell, fog.g.h * fog.g.cell);
  }
  g.restore();
  const cur = s.sim.cur;
  g.lineJoin = 'round';
  const poly = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // buildings: their footprint in the owner's colour (walls read as lines), the main ones a badge on the full map
  const badges: { x: number; y: number; b: BuildingSnap }[] = [];
  for (const b of cur?.buildings ?? []) {
    if (b.state === 'destroyed') continue;
    const hw = Math.max(b.w / 2, 1.2 * m / f.k), hh = Math.max(b.h / 2, 1.2 * m / f.k);
    poly([P(b.x - hw, b.y - hh), P(b.x + hw, b.y - hh), P(b.x + hw, b.y + hh), P(b.x - hw, b.y + hh)]);
    g.lineWidth = 2 * m; g.strokeStyle = INK; g.stroke();
    g.fillStyle = TEAM[b.team] ?? '#ccc'; g.fill();
    if (full && BADGE.has(b.type)) { const [x, y] = P(b.x, b.y); badges.push({ x, y, b }); }
  }
  for (const { x, y, b } of badges) {
    const r = 8 * m;
    badge(g, x, y, r, TEAM[b.team] ?? '#ccc', m);
    drawIcon(g, BUILDING_ICON[b.type] ?? 'bld-camp', x, y, 13 * m);
  }
  // claim points: the banner icon on a disc ringed in the owner's colour (cream open, grey locked)
  for (const cl of cur?.claims ?? []) {
    const [x, y] = P(cl.x, cl.y), r = (full ? 8 : 5.5) * m;
    const ring = cl.state === 'claimed' ? TEAM[cl.team] ?? '#ccc' : cl.state === 'locked' ? '#8a786a' : '#f6d48a';
    badge(g, x, y, r, ring, m);
    if (!drawIcon(g, 'mk-claim', x, y, r * 1.7)) { g.fillStyle = ring; g.fillRect(x - m, y - r * 0.6, 2 * m, r * 1.2); }
  }
  // lairs: the beast's head on a dark disc, terracotta ring; cleared ones greyed and struck through
  for (const l of cur?.lairs ?? []) {
    if (!explored(s, l.x, l.y)) continue;
    const [x, y] = P(l.x, l.y), r = (full ? 8 : 5.5) * m, gone = l.state === 'cleared';
    badge(g, x, y, r, gone ? '#5d4c42' : '#de8a4e', m, gone ? 'rgba(40,30,24,0.85)' : 'rgba(110,23,18,0.88)');
    g.globalAlpha = gone ? 0.45 : 1;
    if (!drawIcon(g, 'lair-' + l.kind, x, y, r * 1.7)) { g.beginPath(); g.arc(x, y, r * 0.4, 0, Math.PI * 2); g.fillStyle = '#c8a868'; g.fill(); }
    g.globalAlpha = 1;
    if (gone) { g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.7); g.lineTo(x + r * 0.7, y - r * 0.7); g.lineWidth = 1.5 * m; g.strokeStyle = '#a8907a'; g.stroke(); }
  }
  // men (zoomed in), then the squads
  if (full && f.k >= 2 * m) for (const d of s.drawn) {
    if (d.u.state === 'dead' || d.team === MOB_TEAM) continue;
    const [x, y] = P(d.x, d.y);
    g.fillStyle = TEAM[d.team] ?? '#ccc';
    g.fillRect(x - 0.6 * m, y - 0.6 * m, 1.2 * m, 1.2 * m);
  }
  for (const q of squads(s)) {
    if (q.team === MOB_TEAM) continue; // the lair marks them
    const [x, y] = P(q.x, q.y);
    shield(g, x, y, (full ? 4.5 : 3.4) * m, TEAM[q.team] ?? '#ccc', s.selected.has(q.id), m);
  }
  // the camera's view
  poly(frustum(s).map((p) => P(p.x, p.y)));
  g.lineWidth = 3 * m; g.strokeStyle = 'rgba(14,9,7,0.75)'; g.stroke();
  g.lineWidth = 1.3 * m; g.strokeStyle = CREAM; g.stroke();
}
