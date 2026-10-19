/**
 * Shared drawing of the tile-space maps (W-36: ./minimap.ts and ./fullMap.ts): the region painted in the current view mode
 * (../mapModes.ts, one px per 1 m cell, repainted when the mode or its live data change) and the markers over it: buildings
 * by owner, lairs, claim points, own squads (blue), enemy squads only where own men or buildings see them (red), and the
 * camera's view (a diamond: the screen rect in tile space).
 */
import { MOB_TEAM } from '../../sim/mobs';
import type { SandboxScene } from '../SandboxScene';
import { hex, TEAM_RGB } from '../mapModes';

/** How far own men and buildings see, in tiles (enemies beyond are not marked). */
export const VISION = 24;
export const TEAM = TEAM_RGB.map(hex);
export const DEN: Record<string, string> = { wolf: '#9aa0a8', boar: '#a07a52', bear: '#6a4a36', bandit: '#d0a040', jackal: '#c8a868', ibex: '#d8d0b8' };

/** Map px per tile and the tile at map px (0, 0). */
export interface MapXf { k: number; x0: number; y0: number }

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
    if (q.team === 0 || sees(q.x, q.y)) out.push(q);
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

/** Draw the map and its markers; `m` px per art px for marker sizes. */
export function drawMap(g: CanvasRenderingContext2D, s: SandboxScene, f: MapXf, m: number, units = false): void {
  const P = (x: number, y: number): [number, number] => [(x - f.x0) * f.k, (y - f.y0) * f.k];
  const src = mapCanvas(s);
  g.imageSmoothingEnabled = f.k < 4; // tiles stay sharp zoomed in
  g.imageSmoothingQuality = 'high';
  const [ax, ay] = P(0, 0);
  g.drawImage(src, ax, ay, s.map.w * f.k, s.map.h * f.k);
  const cur = s.sim.cur;
  g.lineJoin = 'round';
  // buildings: their footprint, at least a dot
  for (const b of cur?.buildings ?? []) {
    if (b.state === 'destroyed') continue;
    const bw = Math.max(2.5 * m, b.w * f.k), bh = Math.max(2.5 * m, b.h * f.k), [x, y] = P(b.x, b.y);
    g.fillStyle = '#0e0907';
    g.fillRect(x - bw / 2 - m, y - bh / 2 - m, bw + 2 * m, bh + 2 * m);
    g.fillStyle = TEAM[b.team] ?? '#ccc';
    g.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  }
  // claim points: a pennant in the owner's colour (white open, grey locked)
  for (const c of cur?.claims ?? []) {
    const [x, y] = P(c.x, c.y);
    g.fillStyle = '#0e0907';
    g.fillRect(x - 0.5 * m, y - 7 * m, 1.5 * m, 8 * m);
    g.fillStyle = c.state === 'claimed' ? TEAM[c.team] ?? '#ccc' : c.state === 'locked' ? '#8a8a8a' : '#f0ead8';
    g.beginPath(); g.moveTo(x + m, y - 7 * m); g.lineTo(x + 6 * m, y - 5 * m); g.lineTo(x + m, y - 3 * m); g.closePath(); g.fill();
    g.strokeStyle = '#0e0907'; g.lineWidth = 0.75 * m; g.stroke();
  }
  // lairs: a den ring in the beast's colour, struck through once cleared
  for (const l of cur?.lairs ?? []) {
    const [x, y] = P(l.x, l.y), r = 3 * m, gone = l.state === 'cleared';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = gone ? '#5d4c42' : DEN[l.kind] ?? '#ccc'; g.fill();
    g.lineWidth = m; g.strokeStyle = gone ? '#2a1a12' : '#6e1712'; g.stroke();
    if (gone) { g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x - r, y + r); g.lineTo(x + r, y - r); g.stroke(); }
  }
  // men (zoomed in), then the squads
  if (units) for (const d of s.drawn) {
    if (d.u.state === 'dead' || d.team === MOB_TEAM) continue;
    const [x, y] = P(d.x, d.y);
    g.fillStyle = TEAM[d.team] ?? '#ccc';
    g.fillRect(x - 0.5 * m, y - 0.5 * m, m, m);
  }
  for (const q of squads(s)) {
    const [x, y] = P(q.x, q.y), r = (q.team === MOB_TEAM ? 1.5 : 2.5) * m;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = q.team === MOB_TEAM ? '#c08a48' : TEAM[q.team] ?? '#ccc'; g.fill();
    g.lineWidth = m; g.strokeStyle = s.selected.has(q.id) ? '#ffffff' : '#0e0907'; g.stroke();
  }
  // the camera's view
  const fr = frustum(s).map((p) => P(p.x, p.y));
  g.beginPath(); fr.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.lineWidth = 2.5 * m; g.strokeStyle = 'rgba(14,9,7,0.8)'; g.stroke();
  g.lineWidth = 1.2 * m; g.strokeStyle = '#f0d9b5'; g.stroke();
}
