/**
 * Illustrated mode banners (docs/UI_ITERATION_2.md "Game feel"): a short
 * strip of pixel art under a screen's header that says where you are before
 * any word does. Ladder: a stepped stone tower with torches; Arena: a
 * colosseum silhouette with pennants; Shop: a market stall under a striped
 * awning. A dusk sky over the sea, cypresses and a distant temple behind.
 *
 * Drawn once per size into a canvas (1 art px = 1 UI px, nearest filtering,
 * the same pixel art as the battle sprites); torches flicker and pennants
 * flutter through `idleFrames` (still under Reduce motion). Pure drawing in
 * `paintBanner` (no Phaser), so it is cheap to test.
 */
import Phaser from 'phaser';
import { BAYER4 } from '../art/pixels';
import { PENNANT, TORCH, gridTexture } from '../art/menuSprites';
import { idleFrames } from './motion';
import { uiIgnore } from './layout';

export type BannerMode = 'ladder' | 'arena' | 'shop' | 'beasts' | 'online';

type Put = (x: number, y: number, c: number) => void;

const SKY = [0x1b1720, 0x2a2029, 0x3d2a2c, 0x5c3a2e, 0x86553a];
const SEA = 0x223646;
const SEA_HI = 0x46667a;
const GROUND = 0x2b231c;
const GROUND_HI = 0x3d3127;
const STONE = 0x6e6252;
const STONE_HI = 0x9a8c76;
const STONE_LO = 0x463d33;
const INK = 0x140e0a;
const CYPRESS = 0x1f2e1c;
const CYPRESS_HI = 0x2f4428;
const WOOD = 0x6a4524;
const WOOD_HI = 0x8a5a2b;
const CLOTH = 0xb8402e;
const CLOTH_HI = 0xd8634a;
const CREAM = 0xe6d5b0;
const BRONZE = 0xb48a52;
const GOLD = 0xe0b23a;

/** Paints the banner into `put` (w x h art px). Deterministic. */
export function paintBanner(put: Put, w: number, h: number, mode: BannerMode): { torches: [number, number][]; pennants: [number, number][] } {
  const horizon = Math.round(h * 0.62);
  // sky: dusk bands, ordered-dithered into each other
  for (let y = 0; y < horizon; y++) {
    const f = (y / Math.max(1, horizon - 1)) * (SKY.length - 1);
    const i = Math.min(SKY.length - 2, Math.floor(f));
    const k = f - i;
    for (let x = 0; x < w; x++) put(x, y, k * 16 > BAYER4[y & 3][x & 3] ? SKY[i + 1] : SKY[i]);
  }
  // a low sun behind the haze
  const sx = Math.round(w * 0.18);
  for (let y = horizon - 5; y < horizon; y++) for (let x = sx - 5; x <= sx + 5; x++) if ((x - sx) ** 2 + (y - horizon) ** 2 <= 26) put(x, y, (x + y) & 1 ? 0xd88a4a : 0xe8a05a);
  // the sea with a few glints, then the shore
  for (let y = horizon; y < horizon + 2; y++) for (let x = 0; x < w; x++) put(x, y, SEA);
  for (let x = 3; x < w; x += 11) put(x + ((x * 7) % 5), horizon, SEA_HI);
  for (let y = horizon + 2; y < h; y++) for (let x = 0; x < w; x++) put(x, y, (x * 13 + y * 7) % 17 === 0 ? GROUND_HI : GROUND);
  // a distant temple on a headland (left) and cypresses
  const tx = Math.round(w * 0.06);
  for (let x = tx - 2; x < tx + 16; x++) put(x, horizon - 1, STONE_LO);
  for (let x = tx; x < tx + 14; x++) put(x, horizon - 7, STONE_LO);
  for (let k = 0; k < 4; k++) for (let y = horizon - 6; y < horizon - 1; y++) put(tx + 1 + k * 4, y, STONE_LO);
  for (let x = tx + 1; x < tx + 13; x++) put(x, horizon - 8 - (x - tx < 7 ? Math.floor((x - tx) / 3) : Math.floor((tx + 13 - x) / 3)), STONE_LO);
  const cypress = (cx: number, base: number, ht: number) => {
    for (let y = 0; y < ht; y++) {
      const half = Math.max(0, Math.round(((y + 1) / ht) * 2));
      for (let x = -half; x <= half; x++) put(cx + x, base - ht + y, x < 0 ? CYPRESS_HI : CYPRESS);
    }
    put(cx, base, WOOD);
  };
  cypress(Math.round(w * 0.32), h - 3, 9);
  cypress(Math.round(w * 0.36), h - 3, 7);
  cypress(Math.round(w * 0.95), h - 3, 8);
  const torches: [number, number][] = [];
  const pennants: [number, number][] = [];
  const cx = Math.round(w * 0.64);
  if (mode === 'ladder') {
    // a stepped tower: five courses of blocks, each narrower, a stair climbing its face
    const base = h - 2;
    const courses = 5;
    const ch = Math.max(3, Math.floor((h - 6) / courses));
    for (let c = 0; c < courses; c++) {
      const half = 22 - c * 4;
      const y1 = base - c * ch;
      for (let y = y1 - ch + 1; y <= y1; y++)
        for (let x = cx - half; x <= cx + half; x++) {
          const edge = x === cx - half || x === cx + half || y === y1 - ch + 1;
          const joint = (x - cx + c * 3) % 6 === 0 && y !== y1 - ch + 1;
          put(x, y, edge ? INK : joint ? STONE_LO : y === y1 - ch + 2 ? STONE_HI : STONE);
        }
      // the stair: a notch per course, rising left to right
      const sx2 = cx - half + 3 + c * 3;
      for (let y = y1 - ch + 2; y <= y1; y++) put(sx2, y, STONE_LO);
    }
    // a door and a banner on top
    for (let y = base - ch + 2; y <= base; y++) for (let x = cx - 2; x <= cx + 2; x++) put(x, y, x === cx - 2 || x === cx + 2 ? INK : 0x1a120c);
    const top = base - courses * ch;
    for (let y = top - 5; y <= top; y++) put(cx, y, WOOD);
    for (let y = top - 5; y < top - 2; y++) for (let x = cx + 1; x < cx + 5; x++) put(x, y, CLOTH);
    torches.push([cx - 28, h - 15], [cx + 22, h - 15]);
  } else if (mode === 'arena') {
    // the colosseum: a curved wall of two arcades under a cornice
    const half = Math.round(w * 0.2);
    const wallTop = Math.max(12, h - 16);
    for (let x = cx - half; x <= cx + half; x++) {
      const t = (x - cx) / half;
      const sag = Math.round((1 - t * t) * 2); // nearer in the middle
      const y0 = wallTop + 2 - sag;
      for (let y = y0; y < h - 1; y++) {
        const row = y - y0;
        const arch = (x - cx + 200) % 6;
        const inArch = (row >= 3 && row <= 6 && arch >= 2 && arch <= 4) || (row >= 9 && row <= 13 && arch >= 2 && arch <= 4);
        const cornice = row === 0 || row === 7 || row === 8;
        put(x, y, inArch ? 0x1a120c : cornice ? STONE_HI : x === cx - half || x === cx + half ? INK : STONE);
      }
      put(x, y0 - 1, INK);
    }
    pennants.push([cx - half + 4, wallTop - 11], [cx - 2, wallTop - 12], [cx + half - 8, wallTop - 11]);
  } else if (mode === 'shop') {
    // a market stall: posts, a striped awning with a scalloped edge, a counter of amphorae and bolts of cloth
    const half = 24;
    const top = Math.max(2, h - 20);
    for (let y = top + 4; y < h - 1; y++) {
      put(cx - half + 1, y, WOOD);
      put(cx + half - 1, y, WOOD);
    }
    for (let y = top; y < top + 6; y++)
      for (let x = cx - half - 2 + (top + 5 - y); x <= cx + half + 2 - (top + 5 - y); x++) put(x, y, Math.floor((x - cx + 60) / 5) % 2 ? CREAM : CLOTH);
    for (let x = cx - half; x <= cx + half; x++) if ((x - cx + 60) % 5 < 3) put(x, top + 6, Math.floor((x - cx + 60) / 5) % 2 ? CREAM : CLOTH_HI);
    // the counter
    const cy = h - 7;
    for (let y = cy; y < h - 1; y++) for (let x = cx - half + 2; x <= cx + half - 2; x++) put(x, y, y === cy ? WOOD_HI : WOOD);
    // amphorae and goods on it
    const amphora = (ax: number) => {
      put(ax, cy - 6, INK);
      put(ax - 1, cy - 5, 0xa8583a);
      put(ax + 1, cy - 5, 0xa8583a);
      for (let y = cy - 4; y < cy; y++) for (let x = ax - 2; x <= ax + 2; x++) put(x, y, x === ax - 2 ? 0x8a4430 : 0xb86a44);
      put(ax, cy - 3, 0xe0a070);
    };
    amphora(cx - 16);
    amphora(cx - 10);
    for (let y = cy - 3; y < cy; y++) for (let x = cx - 4; x < cx + 3; x++) put(x, y, (y + x) % 3 ? 0x3f5f86 : 0x5a80a8);
    for (let y = cy - 2; y < cy; y++) for (let x = cx + 6; x < cx + 12; x++) put(x, y, GOLD);
    put(cx + 8, cy - 3, 0xfff2a8);
    for (let y = cy - 4; y < cy; y++) for (let x = cx + 14; x < cx + 19; x++) put(x, y, x === cx + 14 ? BRONZE : 0xd2a564);
    torches.push([cx + half + 5, h - 15]);
  } else if (mode === 'beasts') {
    // a dark cave mouth in a rocky hill
    for (let y = h - 18; y < h - 1; y++) for (let x = cx - 26; x <= cx + 26; x++) if (Math.abs(x - cx) < 26 - (h - 1 - y) * 0.2 + 8 - Math.abs(y - (h - 10))) put(x, y, (x + y) % 5 ? STONE : STONE_LO);
    for (let y = h - 11; y < h - 1; y++) for (let x = cx - 7; x <= cx + 7; x++) if ((x - cx) ** 2 / 49 + (y - (h - 1)) ** 2 / 100 < 1) put(x, y, 0x0c0806);
    torches.push([cx - 12, h - 15], [cx + 9, h - 15]);
  } else {
    // the war map: a camp of tents under a banner
    for (const [tx2, s] of [[cx - 16, 7], [cx, 9], [cx + 15, 6]] as const)
      for (let y = 0; y < s; y++) for (let x = -y; x <= y; x++) put(tx2 + x, h - 2 - s + y, x < 0 ? CREAM : 0xc8b48c);
    pennants.push([cx - 1, h - 25]);
  }
  return { torches, pennants };
}

/**
 * The banner of a mode at (x, y), w x h UI px, with its animated torches and
 * pennants. Decorative: ignored by the layout check, never tappable.
 */
export function addModeBanner(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, mode: BannerMode): Phaser.GameObjects.Container {
  const W = Math.max(8, Math.round(w));
  const H = Math.max(8, Math.round(h));
  const key = `mbanner_${mode}_${W}x${H}`;
  let anim: { torches: [number, number][]; pennants: [number, number][] } = { torches: [], pennants: [] };
  if (!scene.textures.exists(key)) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    anim = paintBanner(
      (px, py, c) => {
        if (px < 0 || py < 0 || px >= W || py >= H) return;
        const i = (py * W + px) * 4;
        img.data[i] = (c >> 16) & 255;
        img.data[i + 1] = (c >> 8) & 255;
        img.data[i + 2] = c & 255;
        img.data[i + 3] = 255;
      },
      W,
      H,
      mode,
    );
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, cv)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
    BANNER_ANIM.set(key, anim);
  } else anim = BANNER_ANIM.get(key) ?? anim;
  const c = scene.add.container(Math.round(x), Math.round(y));
  c.add(scene.add.image(0, 0, key).setOrigin(0, 0));
  // a dark frame line top and bottom so it sits in the page like an inlay
  c.add(scene.add.rectangle(0, 0, W, 1, 0x000000, 0.6).setOrigin(0, 0));
  c.add(scene.add.rectangle(0, H - 1, W, 1, 0x000000, 0.6).setOrigin(0, 0));
  const tk = gridTexture(scene, 'torch', TORCH);
  anim.torches.forEach(([tx, ty], i) => {
    const t = scene.add.image(tx, ty, tk, 0).setOrigin(0, 0);
    c.add(t);
    idleFrames(scene, t, TORCH.length, 140, i * 7 + 3);
  });
  const pk = gridTexture(scene, 'pennant', PENNANT);
  anim.pennants.forEach(([px, py], i) => {
    const p = scene.add.image(px, py, pk, 0).setOrigin(0, 0);
    c.add(p);
    idleFrames(scene, p, PENNANT.length, 260, i * 5 + 1);
  });
  uiIgnore(c);
  parent.add(c);
  return c;
}

/** Where each cached banner's torches and pennants go (the texture is drawn once). */
const BANNER_ANIM = new Map<string, { torches: [number, number][]; pennants: [number, number][] }>();
