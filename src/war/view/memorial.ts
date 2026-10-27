/**
 * E3 the home memorial on the map: in the player's home region the town's first statue is his memorial. A grave stele
 * stands in rows before it for each of his fallen (newest first, at most GRAVES), and the trophies of the guardians his
 * men slew stand on posts by the town's second statue (or beside the memorial). Clicking the statue opens the list of
 * the fallen (./hud/memorial.ts). The steles and trophy posts are small pixel sprites painted here (no sheet art).
 */
import Phaser from 'phaser';
import type { BuildingSnap } from '../types';
import type { SandboxScene } from './SandboxScene';
import { ALLIANCES } from '../world/alliances';
import { myTeam } from './side';

/** Graves drawn at most (the list keeps every one). */
export const GRAVES = 18;
const COLS = 4;

// pixel art, 2 world px a pixel: '.' clear; the palette by letter
const STELE = [
  '....oooo....',
  '...olllmo...',
  '..ollmmmdo..',
  '..olmmmmdo..',
  '..oleeemdo..',
  '..olmmmmdo..',
  '..oleemmdo..',
  '..olmmmmdo..',
  '..olmmmmdo..',
  '..olmmmmdo..',
  '..olmmmmdo..',
  '..olmmmmdo..',
  '.oolmmmmdoo.',
  '.ommmmmmmdo.',
  '.oooooooooo.',
  'ghhhhhhhhhhg',
  '.gggggggggg.',
];
// a pediment-topped variant
const STELE_B = [
  '.....oo.....',
  '....ollo....',
  '...ollmdo...',
  '..oooooooo..',
  '..olmmmmdo..',
  '..oleeemdo..',
  '..olmmmmdo..',
  '..oleemmdo..',
  '..olmmmmdo..',
  '..olmmmmdo..',
  '..olmmmmdo..',
  '.oolmmmmdoo.',
  '.ommmmmmmdo.',
  '.oooooooooo.',
  'ghhhhhhhhhhg',
  '.gggggggggg.',
];
const TROPHY = [
  '................',
  '.w............w.',
  '.ww..........ww.',
  '..ww........ww..',
  '..iww......wwi..',
  '...iww....wwi...',
  '....iwwoowwi....',
  '.....obbbbo.....',
  '....obbbbbbo....',
  '....obrbbrbo....',
  '....obbbbbbo....',
  '.....onnnno.....',
  '......oppo......',
  '......opqo......',
  '......opqo......',
  '......opqo......',
  '......opqo......',
  '......opqo......',
  '......opqo......',
  '....oopppqoo....',
  '...oqqqqqqqqo...',
  '...oooooooooo...',
];
const PAL: Record<string, Record<string, string>> = {
  stele: { o: '#241e1a', l: '#d9d1c0', m: '#b3aa98', d: '#857c6c', e: '#6e665a', g: '#2e2216', h: '#4a3a26' },
  // the Erymanthian Boar's tusks over its bristled head
  tusks: { o: '#1a120c', w: '#f1e8d0', i: '#b9aa86', b: '#4a3326', r: '#c23a22', n: '#7a5a46', p: '#7a5232', q: '#4e3220' },
  // any other guardian: its horned skull
  head: { o: '#1a120c', w: '#a89c84', i: '#6e6452', b: '#ddd4be', r: '#1c1410', n: '#b8ae96', p: '#7a5232', q: '#4e3220' },
};

function paint(scene: Phaser.Scene, key: string, art: string[], pal: Record<string, string>, k = 2): void {
  if (scene.textures.exists(key)) return;
  const w = art[0].length, h = art.length, c = document.createElement('canvas');
  c.width = w * k;
  c.height = h * k;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = pal[art[y][x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * k, y * k, k, k);
    }
  scene.textures.addCanvas(key, c)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** The memorial statue of the home town shown (null: not the player's home region, or no statue). */
export function memorialStatue(s: SandboxScene): BuildingSnap | null {
  if (s.region.id !== ALLIANCES[myTeam()]?.home) return null;
  return statues(s)[0] ?? null;
}
const statues = (s: SandboxScene) => (s.sim.cur?.buildings ?? []).filter((b) => b.type === 'statue' && !b.ruin).sort((a, b) => a.id - b.id);

export interface MemorialSource { graves(): number; trophies(): readonly { boss: string }[] }

/** Mount the map layer: graves and trophy posts redrawn when their count or the statue changes. */
export function mountMemorialLayer(s: SandboxScene, src: MemorialSource): void {
  paint(s, 'mem-stele', STELE, PAL.stele);
  paint(s, 'mem-stele-b', STELE_B, PAL.stele);
  paint(s, 'mem-tusks', TROPHY, PAL.tusks);
  paint(s, 'mem-head', TROPHY, PAL.head);
  const pool: Phaser.GameObjects.Image[] = [];
  let key = '';
  s.events.on('postupdate', () => {
    const m = memorialStatue(s), n = Math.min(GRAVES, src.graves()), tr = src.trophies();
    const k = m ? `${m.id}:${n}:${tr.map((t) => t.boss).join(',')}` : '';
    if (k === key) return;
    key = k;
    for (const im of pool) im.setVisible(false);
    if (!m) return;
    const taken = new Set<number>();
    for (const b of s.sim.cur?.buildings ?? []) for (let k = 0; k < b.tiles.length; k += 2) taken.add(b.tiles[k + 1] * s.region.w + b.tiles[k]);
    const free = (x: number, y: number) => !taken.has(Math.floor(y) * s.region.w + Math.floor(x));
    let i = 0;
    const put = (tex: string, x: number, y: number) => {
      const im = pool[i] ?? pool[pool.push(s.add.image(0, 0, tex)) - 1];
      i++;
      im.setTexture(tex).setOrigin(0.5, 0.92).setPosition(Math.round(s.iso.sx(x, y)), Math.round(s.iso.sy(x, y, s.iso.zAt(x, y)))).setDepth(10 + (x + y) / 4096 + 0.2).setVisible(true);
    };
    // the graves in rows before the statue (south-east, toward the viewer), skipping building tiles
    const cx = Math.floor(m.x) + 0.5, cy = Math.floor(m.y) + 0.5;
    for (let g = 0, row = 0; g < n && row < 10; row++)
      for (let c = 0; c < COLS && g < n; c++) {
        const x = cx + 1.7 + c * 0.9, y = cy + 1.5 + row * 0.9;
        if (!free(x, y)) continue;
        put(g % 3 === 1 ? 'mem-stele-b' : 'mem-stele', x, y);
        g++;
      }
    // the trophies on posts in a row to the left of the second statue (else of the memorial), skipping building tiles
    const t = statues(s)[1] ?? m, tx = Math.floor(t.x) + 0.5, ty = Math.floor(t.y) + 0.5;
    for (let j = 0, k = 0; j < Math.min(6, tr.length) && k < 16; k++) {
      const x = tx - 1.1 - (k % 4) * 0.8 + Math.floor(k / 4), y = ty + 1.1 + (k % 4) * 0.8 + Math.floor(k / 4);
      if (!free(x, y)) continue;
      put(tr[j].boss === 'erymanthian_boar' ? 'mem-tusks' : 'mem-head', x, y);
      j++;
    }
  });
}
