/** Top-down preview of a built region (scripts/war/regions/build.ts --png). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeImage } from '../../art/lib/png.mjs';
import { expandRegion } from '../../../src/war/region/compact.ts';

export function preview(json: Record<string, unknown>, spots: Record<string, [number, number]>, path: string) {
  const r = expandRegion(json) as { w: number; h: number; height: number[]; terrain: string[]; water: number[]; objects: { id: string; x: number; y: number }[]; lairs: { x: number; y: number }[]; claimPoints: { x: number; y: number }[]; entries: { x: number; y: number; w: number; h: number }[]; biomes: { names: string[] } };
  const { w, h } = r, S = 2, data = new Uint8Array(w * S * h * S * 4);
  const COL: Record<string, number[]> = { grass: [96, 128, 64], forest: [40, 82, 40], sand: [214, 196, 140], marsh: [80, 104, 80], rock: [120, 116, 112], road: [176, 150, 110], snow: [236, 240, 244], dirt: [140, 112, 80] };
  const set = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= w * S || y >= h * S) return;
    const j = (y * w * S + x) * 4;
    data[j] = c[0]; data[j + 1] = c[1]; data[j + 2] = c[2]; data[j + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, hh = r.height[i];
    let c = r.water[i] === 2 ? [36, 64, 110] : r.water[i] === 1 ? [90, 140, 170] : COL[r.terrain[i]];
    const f = 0.55 + 0.11 * hh;
    c = c.map((v) => Math.min(255, v * f));
    const cliff = (x + 1 < w && Math.abs(r.height[i + 1] - hh) >= 2) || (y + 1 < h && Math.abs(r.height[i + w] - hh) >= 2);
    if (cliff && r.terrain[i] !== 'rock' && !r.water[i]) c = [30, 24, 20];
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) set(x * S + dx, y * S + dy, c);
  }
  for (const e of r.entries) for (let y = e.y; y < e.y + e.h; y += 2) for (let x = e.x; x < e.x + e.w; x += 2) if ((x + y) % 8 === 0) set(x * S, y * S, [220, 60, 220]);
  for (const o of r.objects) {
    const big = o.id.startsWith('mountains/') && !/fir|pine|juniper|grass|rhodo/.test(o.id);
    if (big) continue;
    const tree = /pine|oak|fir|olive|cypress|palm|acacia|beech|tamarisk|thorn/.test(o.id);
    set(Math.floor(o.x * S), Math.floor(o.y * S), tree ? [16, 48, 16] : [70, 70, 50]);
  }
  // pre-built structures: walls and gates stone-grey, landmark pieces dark, ruins brown
  for (const e of (json.prebuilt ?? []) as { type: string; tiles?: number[]; state?: string; landmark?: boolean }[]) {
    const c = e.state === 'ruined' ? [120, 84, 60] : /Wall|Gate|Tower/.test(e.type) ? [200, 196, 186] : e.landmark ? [60, 40, 36] : [150, 60, 50];
    const t = e.tiles ?? [];
    for (let n = 0; n < t.length; n += 2) for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) set(t[n] * S + dx, t[n + 1] * S + dy, c);
  }
  const dot = (x: number, y: number, c: number[], rr: number) => { for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) set(Math.floor(x * S) + dx, Math.floor(y * S) + dy, c); };
  for (const l of r.lairs) dot(l.x, l.y, [220, 30, 30], 4);
  for (const c of r.claimPoints) dot(c.x, c.y, [250, 220, 40], 5);
  for (const [, [x, y]] of Object.entries(spots)) dot((x + 0.5) * 2 - 0.5, (y + 0.5) * 2 - 0.5, [255, 255, 255], 2);
  mkdirSync(join(path, '..'), { recursive: true });
  writeImage(path, { w: w * S, h: h * S, data });
}
