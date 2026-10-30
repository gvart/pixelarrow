/**
 * Shared drawing of the tile-space maps (W-36: ./minimap.ts and ./fullMap.ts): the region painted in the current view mode
 * (../mapModes.ts, one px per 1 m cell, repainted when the mode or its live data change), turned 45 degrees so north matches
 * the iso camera (tile +x runs down-right, +y down-left), and the markers over it: buildings by owner (footprints; the
 * main ones as an icon badge on the full map), lairs by beast, claim banners, own squads, enemy squads only where own men
 * or buildings see them, and the camera's view (a rectangle: the screen in tile space, turned back upright).
 * Fog of war (W-39, ../fog.ts): the player's team's fog grid shades the map in the black glaze (unexplored at about a third of its light, explored
 * at about two thirds, soft edges), rebuilt only when the grid's version changes; the sim client already hides foes out of
 * sight and keeps foe buildings as last seen; lairs, claim points and resource badges show once their ground is explored
 * (claim points always while the player holds no ground in the region).
 * On the minimap the player's own ground (his team's influence), buildings, claim points and squads are lit over it all,
 * so his holdings read at a glance whatever the fog.
 */
import { MOB_TEAM } from '../../sim/mobs';
import type { BuildingSnap, FogGrid, RoamSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { hex, TEAM_RGB } from '../mapModes';
import { BUILDING_ICON, UI } from './kit';
import { myTeam, slot } from '../side';
import { drawPins } from './pins';
import { groundless } from './claimCard';

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
/** The fog's shade: the black glaze; alpha over unexplored and explored cells (visible: clear). */
const GLAZE = [14, 9, 7], FOG_DARK = 170, FOG_DIM = 80;

/** The player's team's fog, one px per vision cell (cached per version); null with fog off or none yet. */
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
      im.data[c * 4] = GLAZE[0]; im.data[c * 4 + 1] = GLAZE[1]; im.data[c * 4 + 2] = GLAZE[2];
      im.data[c * 4 + 3] = g.state[c] === 2 ? 0 : g.state[c] === 1 ? FOG_DIM : FOG_DARK;
    }
    ctx.putImageData(im, 0, 0);
  }
  return { cv: p.cv, g };
}

/** The player's team's fog at tile point (x, y): 0 unexplored, 1 explored, 2 visible (always 2 with fog off or no grid yet). */
export function fogAt(s: SandboxScene, x: number, y: number): 0 | 1 | 2 {
  const g = s.sim.fog;
  if (!g || !s.sim.fogOn) return 2;
  const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell);
  return cx >= 0 && cy >= 0 && cx < g.w && cy < g.h ? (g.state[cy * g.w + cx] as 0 | 1 | 2) : 0;
}
/** The player's team has explored tile point (x, y) (always with fog off). */
export const explored = (s: SandboxScene, x: number, y: number): boolean => fogAt(s, x, y) !== 0;
/** The fog key's swatches (CSS colours of the shade over a mid ground). */
export const FOG_SWATCH = { dark: `rgba(${GLAZE},${FOG_DARK / 255})`, dim: `rgba(${GLAZE},${FOG_DIM / 255})` };

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
    if (d.team === myTeam()) eye(d.x, d.y);
    let q = by.get(d.u.squad);
    if (!q) by.set(d.u.squad, (q = { team: d.team, x: 0, y: 0, n: 0, id: d.u.squad }));
    q.x += d.x; q.y += d.y; q.n++;
  }
  for (const b of s.sim.cur?.buildings ?? []) if (b.team === myTeam() && b.state !== 'destroyed') eye(b.x, b.y);
  const sees = (x: number, y: number) => {
    const cx = (x / VISION) | 0, cy = (y / VISION) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (seen.has((cy + dy) * 4096 + cx + dx)) return true;
    return false;
  };
  const out = [];
  for (const q of by.values()) {
    q.x /= q.n; q.y /= q.n;
    if (q.team === myTeam() || s.sim.fog || sees(q.x, q.y)) out.push(q); // with a fog grid the client already hid the unseen
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

/** W-65: map dot colours of the roaming groups by kind (the full map's key shows them too). */
export const ROAM_DOT: Record<RoamSnap['kind'], string> = { pack: '#d9a441', patrol: '#d0503c', caravan: '#f3dc8a', traveller: '#b9c7d6' };

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
  const ground = full ? null : groundCanvas(s);
  if (ground) {
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.34;
    g.drawImage(ground, 0, 0, s.map.w, s.map.h);
    g.globalAlpha = 1;
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
    g.fillStyle = TEAM[slot(b.team)] ?? '#ccc'; g.fill();
    if (full && BADGE.has(b.type)) { const [x, y] = P(b.x, b.y); badges.push({ x, y, b }); }
  }
  for (const { x, y, b } of badges) {
    const r = 8 * m;
    badge(g, x, y, r, TEAM[slot(b.team)] ?? '#ccc', m);
    drawIcon(g, BUILDING_ICON[b.type] ?? 'bld-camp', x, y, 13 * m);
  }
  // claim points: the banner icon on a disc ringed in the owner's colour (cream open, grey locked). While the player
  // holds no ground in the region every banner shows, fog or not, those he could take under a pulsing gold glow: where
  // to claim is the first thing a newcomer has to find (./claimCard.ts)
  const lost = groundless(s), beat = 0.6 + 0.4 * Math.sin(performance.now() / 260);
  for (const cl of cur?.claims ?? []) {
    if (!lost && !explored(s, cl.x, cl.y)) continue;
    const [x, y] = P(cl.x, cl.y), r = (full ? 8 : 5.5) * m;
    if (lost && !(cl.state === 'claimed' && cl.team === myTeam())) {
      const glow = g.createRadialGradient(x, y, 0, x, y, r * 3);
      glow.addColorStop(0, `rgba(246,212,138,${0.7 * beat})`); glow.addColorStop(1, 'rgba(246,212,138,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
    }
    const ring = cl.state === 'claimed' ? TEAM[slot(cl.team)] ?? '#ccc' : cl.state === 'locked' ? '#8a786a' : '#f6d48a';
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
  // W-60 souls: a pale ghost glow, its ring gold while one of ours claims him, red when contested; fading ones dimmer
  const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);
  for (const so of cur?.souls ?? []) {
    const [x, y] = P(so.x, so.y), r = (full ? 6 : 4.2) * m;
    g.globalAlpha = so.left < 600 ? 0.35 + 0.65 * (so.left / 600) : 1;
    const glow = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, `rgba(205,235,255,${0.55 * pulse})`); glow.addColorStop(1, 'rgba(205,235,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, r * 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = 'rgba(14,9,7,0.7)'; g.fill();
    g.lineWidth = 1.4 * m; g.strokeStyle = so.contested ? '#e05a4a' : so.claim && so.team === myTeam() ? '#f6d48a' : '#cfe8ff'; g.stroke();
    // a little ghost: head and a tapering robe
    g.fillStyle = '#e6f3ff';
    g.beginPath(); g.arc(x, y - r * 0.28, r * 0.32, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - r * 0.42, y + r * 0.55); g.quadraticCurveTo(x, y - r * 0.4, x + r * 0.42, y + r * 0.55); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  drawPins(g, P, m, full); // personal markers (./pins.ts)
  // W-65: roaming groups (src/war/sim/roam.ts) by squad: a small dot by kind where seen (the fog already hid the rest)
  const roam = new Map<number, string>();
  for (const r of s.sim.cur?.roam ?? []) for (const id of r.squads) roam.set(id, ROAM_DOT[r.kind]);
  // men (zoomed in), then the squads
  if (full && f.k >= 2 * m) for (const d of s.drawn) {
    if (d.u.state === 'dead' || d.team === MOB_TEAM || roam.has(d.u.squad)) continue;
    const [x, y] = P(d.x, d.y);
    g.fillStyle = TEAM[slot(d.team)] ?? '#ccc';
    g.fillRect(x - 0.6 * m, y - 0.6 * m, 1.2 * m, 1.2 * m);
  }
  const seen = squads(s);
  for (const q of seen) {
    if (q.team === MOB_TEAM || roam.has(q.id)) continue; // the lair marks the wild's packs; roaming groups below
    const [x, y] = P(q.x, q.y);
    shield(g, x, y, (full ? 4.5 : 3.4) * m, TEAM[slot(q.team)] ?? '#ccc', s.selected.has(q.id), m);
  }
  // roaming groups over the squads: a small dot in the kind's colour
  for (const q of seen) {
    const dot = roam.get(q.id);
    if (!dot) continue;
    const [x, y] = P(q.x, q.y), r = (full ? 3.4 : 2.4) * m;
    g.beginPath(); g.arc(x, y, r + 1 * m, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = dot; g.fill();
  }
  // the camera's view
  poly(frustum(s).map((p) => P(p.x, p.y)));
  g.lineWidth = 3 * m; g.strokeStyle = 'rgba(14,9,7,0.75)'; g.stroke();
  g.lineWidth = 1.3 * m; g.strokeStyle = CREAM; g.stroke();
  if (!full) ownOnTop(g, s, f, m, seen);
}

const grounds = new WeakMap<SandboxScene, { key: string; cv: HTMLCanvasElement }>();
/** The player's team's ground (its influence bit), one px per tile in the team's colour (cached per version); null: none. */
function groundCanvas(s: SandboxScene): HTMLCanvasElement | null {
  const inf = s.sim.influence, team = myTeam();
  if (!inf) return null;
  const key = `${inf.version}|${team}|${inf.w}x${inf.h}`;
  let p = grounds.get(s);
  if (p?.key !== key) {
    const cv = p?.cv ?? document.createElement('canvas'), bit = 1 << team, [r, gr, b] = TEAM_RGB[slot(team)] ?? [200, 200, 200];
    cv.width = inf.w;
    cv.height = inf.h;
    const ctx = cv.getContext('2d')!, im = ctx.createImageData(inf.w, inf.h);
    for (let i = 0; i < inf.mask.length; i++) {
      if (!(inf.mask[i] & bit)) continue;
      im.data[i * 4] = r; im.data[i * 4 + 1] = gr; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    grounds.set(s, (p = { key, cv }));
  }
  return p.cv;
}

/** The minimap's own layer over everything (fog, the view): the player's buildings, claim points and squads, lit. */
function ownOnTop(g: CanvasRenderingContext2D, s: SandboxScene, f: MapXf, m: number, seen: ReturnType<typeof squads>): void {
  const me = myTeam(), cur = s.sim.cur, rgb = TEAM_RGB[slot(me)] ?? [200, 200, 200];
  const lit = hex(rgb.map((v) => v + (255 - v) * 0.5) as typeof rgb), team = TEAM[slot(me)] ?? '#ccc';
  const P = (x: number, y: number) => toPx(f, x, y);
  // buildings: the footprint, at least a few px, in the team's colour lifted halfway to white, a dark rim
  for (const b of cur?.buildings ?? []) {
    if (b.team !== me || b.state === 'destroyed') continue;
    const hw = Math.max(b.w / 2, 1.7 * m / f.k), hh = Math.max(b.h / 2, 1.7 * m / f.k);
    g.beginPath();
    [P(b.x - hw, b.y - hh), P(b.x + hw, b.y - hh), P(b.x + hw, b.y + hh), P(b.x - hw, b.y + hh)].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.lineWidth = 1.6 * m; g.strokeStyle = INK; g.stroke();
    g.fillStyle = lit; g.fill();
  }
  // claim points held: a soft glow, the badge again on top
  for (const cl of cur?.claims ?? []) {
    if (cl.state !== 'claimed' || cl.team !== me) continue;
    const [x, y] = P(cl.x, cl.y), r = 5.5 * m;
    halo(g, x, y, r * 2.2, rgb);
    badge(g, x, y, r, lit, m);
    if (!drawIcon(g, 'mk-claim', x, y, r * 1.7)) { g.fillStyle = lit; g.fillRect(x - m, y - r * 0.6, 2 * m, r * 1.2); }
  }
  // squads: a glow under the shield, drawn last so nothing covers them
  for (const q of seen) {
    if (q.team !== me) continue;
    const [x, y] = P(q.x, q.y);
    halo(g, x, y, 7 * m, [255, 236, 190]);
    shield(g, x, y, 3.8 * m, team, s.selected.has(q.id), m);
  }
}

/** A soft round glow of colour c, radius r. */
function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: readonly number[]): void {
  const glow = g.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, `rgba(${c.join(',')},0.55)`); glow.addColorStop(1, `rgba(${c.join(',')},0)`);
  g.fillStyle = glow; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
