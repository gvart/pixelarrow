/**
 * I1 hoplite bake-off (docs/v5/DECISIONS.md V5-083): the PixelLab hoplite variants next to today's
 * procedural hoplite, on the iso ground at the battle's scale and zoom, and in 5x3 formations.
 * Dev only: open /hoplite-bakeoff.html on the dev server (`npm run dev`). The strips are read from
 * docs/v5/pixellab/I1/processed/ (scripts/art/pixellab/build.mjs); nothing here ships.
 *
 *   ?z=1          battle zoom (zoom units; the fight opens at 1, the pinch reaches 3)
 *   ?rs=2         device pixels per CSS pixel (RS: 2 on phones); 1 canvas px is drawn as 1 CSS px,
 *                 so a screenshot shows the device pixels a phone would light
 *   ?anim=walk    idle | walk | attack: what every figure plays
 *   ?snap=1       the PA-WORLD-snapped strips instead of PixelLab's raw colours
 *   ?h=N          crest-to-feet height (world px) every variant is scaled to; default: measured on the
 *                 procedural hoplite (its red crest's top row to its feet in the south-west idle frame)
 */
import { renderFrame, dollGeom, dollFromHero, ANIM, BATTLE_SCALE, BATTLE_RES, type DollSpec } from '../art/paperdoll';
import { makeHero } from '../game/heroes';
import { Rng } from '../sim/rng';
import { isoToScreen, ISO_HW, ISO_HH } from '../art/iso';
import { SPACING } from '../sim/formation';

const q = new URLSearchParams(location.search);
const Z = Number(q.get('z') ?? 1);
const RS = Number(q.get('rs') ?? 2);
const ANIM_NAME = (q.get('anim') ?? 'walk') as 'idle' | 'walk' | 'attack';
const SNAP = q.get('snap') === '1';
let TARGET_H = Number(q.get('h') ?? 0);
/** Device px per world px. */
const F = Z * RS;
const BASE = '/docs/v5/pixellab/I1/processed/';
/** PixelLab directions of the game's 4 true facings (paperdoll DIRS rows 0..3). */
const GAME_DIRS = ['south-east', 'north-east', 'south-west', 'north-west'] as const;
const DIRS8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
type Dir = (typeof GAME_DIRS)[number];

interface VariantDef { id: string; label: string; size: number; view: string; body: number }
interface ModeDef { id: string; variant: string; label: string; anim: string; dir: Dir }
interface Manifest { variants: VariantDef[]; modes: ModeDef[] }
interface Info { canvas: { width: number; height: number }; rot: Record<string, { box: { y: number; h: number } | null }>; anims: Record<string, Record<string, { frames: number; w: number; h: number; feetY: [number, number] }>> }

/** One figure kind: frames per facing per animation, its frame size, feet line and world scale. */
interface Figure {
  label: string;
  /** World px per sprite px. */
  k: number;
  frames(anim: string, dir: Dir): Strip;
}
/** Frames of one animation in one facing; v3 clips come on a bigger canvas than the rotations, so each strip has its own size and feet line. */
interface Strip { imgs: CanvasImageSource[]; fw: number; fh: number; feetY: number }

document.body.style.cssText = 'margin:0;padding:12px;background:#2b2620;color:#f0e6d0;font:12px/1.4 monospace';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error(`missing ${url}`));
    i.src = url;
  });
}

/** Cuts a left-to-right strip into frames. */
function cut(img: HTMLImageElement, fw: number, fh: number): HTMLCanvasElement[] {
  const n = Math.round(img.width / fw);
  return Array.from({ length: n }, (_, i) => {
    const c = el('canvas');
    c.width = fw;
    c.height = fh;
    c.getContext('2d')!.drawImage(img, i * fw, 0, fw, fh, 0, 0, fw, fh);
    return c;
  });
}

async function pixellabFigure(v: VariantDef): Promise<Figure> {
  const dir = `${BASE}${v.id}/${SNAP ? 'snap/' : ''}`;
  const info = (await (await fetch(`${BASE}${v.id}/info.json`)).json()) as Info;
  const fw = info.canvas.width, fh = info.canvas.height;
  const rot = cut(await loadImg(`${dir}rot.png`), fw, fh);
  const sw = info.rot['south-west'].box!;
  const strips = new Map<string, Strip>();
  for (const [anim, byDir] of Object.entries(info.anims)) {
    for (const d of Object.keys(byDir)) {
      const a = byDir[d];
      strips.set(`${anim}:${d}`, { imgs: cut(await loadImg(`${dir}${anim}_${d}.png`), a.w, a.h), fw: a.w, fh: a.h, feetY: a.feetY[1] });
    }
  }
  const idle = (d: Dir): Strip => ({ imgs: [rot[DIRS8.indexOf(d)]], fw, fh, feetY: sw.y + sw.h - 1 });
  return {
    label: `${v.id} ${v.label}`,
    k: TARGET_H / v.body,
    frames: (anim, d) => (anim === 'idle' ? idle(d) : strips.get(`${anim}:${d}`) ?? idle(d)),
  };
}

function proceduralFigure(): Figure {
  const h = makeHero(new Rng(77), { nextId: 900 }, 'greek', 'hoplite', 1, 1);
  const spec: DollSpec = { ...dollFromHero(h), scale: BATTLE_SCALE, res: BATTLE_RES };
  const g = dollGeom(spec);
  const cache = new Map<string, Strip>();
  const cols = { idle: [ANIM.idle[0]], walk: ANIM.walk, attack: ANIM.attack } as Record<string, readonly number[]>;
  return {
    label: 'today: procedural hoplite (BATTLE_SCALE 0.74, BATTLE_RES 2)',
    k: 1 / BATTLE_RES,
    frames(anim, d) {
      const key = `${anim}:${d}`;
      if (!cache.has(key)) cache.set(key, { imgs: (cols[anim] ?? cols.idle).map((f) => renderFrame(spec, f, GAME_DIRS.indexOf(d)).toCanvas()), fw: g.fw, fh: g.fh, feetY: g.footY });
      return cache.get(key)!;
    },
  };
}

/** A world-space stage: iso ground, figures sorted by feet, drawn in device px. */
interface Placed { fig: Figure; x: number; y: number; dir: Dir; anim: string; phase: number }

function stage(title: string, wW: number, wH: number, placed: Placed[], labels: { x: number; y: number; t: string }[] = []): void {
  const box = el('div', 'margin:0 0 18px');
  box.appendChild(el('div', 'font-weight:bold;margin:4px 0', title));
  const wrap = el('div', 'position:relative;display:inline-block');
  const cv = el('canvas');
  cv.width = Math.round(wW * F);
  cv.height = Math.round(wH * F);
  cv.style.cssText = `width:${cv.width}px;height:${cv.height}px;image-rendering:pixelated;display:block`;
  wrap.appendChild(cv);
  for (const l of labels) {
    wrap.appendChild(el('div', `position:absolute;left:${Math.round(l.x * F)}px;top:${Math.round(l.y * F)}px;transform:translateX(-50%);white-space:nowrap;font-size:11px;color:#f8f0d8;text-shadow:0 1px 0 #000,0 0 3px #000`, l.t));
  }
  box.appendChild(wrap);
  document.body.appendChild(box);
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const ground = groundCanvas(cv.width, cv.height);
  const sorted = [...placed].sort((a, b) => a.y - b.y);
  const draw = (t: number) => {
    ctx.drawImage(ground, 0, 0);
    for (const p of sorted) {
      const st = p.fig.frames(p.anim, p.dir);
      const img = st.imgs[Math.floor(t / 100 + p.phase) % st.imgs.length];
      const k = p.fig.k;
      // Phaser pixelArt + roundPixels: nearest filtering, whole device pixels
      const dx = Math.round((p.x - (st.fw * k) / 2) * F);
      const dy = Math.round((p.y - st.feetY * k) * F);
      ctx.drawImage(img, dx, dy, Math.round(st.fw * k * F), Math.round(st.fh * k * F));
    }
  };
  frames.push(draw);
}

/** Two-tone 2:1 diamond grass like the battle's 36 x 18 field tiles. */
function groundCanvas(w: number, h: number): HTMLCanvasElement {
  const c = el('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = '#857f3e';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#8d8843';
  const tw = ISO_HW * F, th = ISO_HH * F;
  for (let j = -1; j * th < h + th; j++) for (let i = -1; i * tw * 2 < w + tw * 2; i++) {
    if ((i + j) % 2) continue;
    const cx = i * tw * 2 + (j % 2 ? tw : 0), cy = j * th;
    x.beginPath();
    x.moveTo(cx, cy - th);
    x.lineTo(cx + tw, cy);
    x.lineTo(cx, cy + th);
    x.lineTo(cx - tw, cy);
    x.fill();
  }
  return c;
}

const frames: ((t: number) => void)[] = [];
const loop = (t: number) => {
  for (const f of frames) f(t);
  requestAnimationFrame(loop);
};

function header(m: Manifest): void {
  document.body.appendChild(el('h2', 'margin:0 0 4px;font-size:15px', 'I1 hoplite bake-off'));
  const p = el('div', 'margin-bottom:8px;color:#d6c0a8');
  p.textContent = `zoom ${Z}x, RS ${RS} (1 canvas px = 1 device px), anim ${ANIM_NAME}, ${SNAP ? 'snapped to PA-WORLD' : 'raw PixelLab colours'}, every variant scaled so its crest-to-feet height is ${TARGET_H.toFixed(1)} world px, the procedural man's (nearest, whole device px, as Phaser pixelArt + roundPixels). Variants: ${m.variants.map((v) => `${v.id} = size ${v.size}, ${v.view}`).join('; ')}.`;
  document.body.appendChild(p);
  const links = el('div', 'margin-bottom:10px');
  const mk = (t: string, over: Record<string, string>) => {
    const u = new URLSearchParams(q);
    for (const [k, v] of Object.entries(over)) u.set(k, v);
    const a = el('a', 'color:#e0c070;margin-right:10px', t);
    a.href = `?${u}`;
    links.appendChild(a);
  };
  for (const z of ['1', '2', '3']) mk(`zoom ${z}x`, { z });
  for (const a of ['idle', 'walk', 'attack']) mk(a, { anim: a });
  mk(SNAP ? 'raw colours' : 'snapped', { snap: SNAP ? '0' : '1' });
  document.body.appendChild(links);
}

/** Crest-to-feet height in sprite px: the first row with a crest-red pixel down to the last opaque row. */
function crestHeight(img: HTMLCanvasElement): number {
  const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
  let top = -1, feet = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4;
    if (d[i + 3] <= 8) continue;
    feet = y;
    if (top < 0 && d[i] > 130 && d[i + 1] < 70 && d[i + 2] < 80) top = y;
  }
  return top < 0 ? 0 : feet - top + 1;
}

async function main(): Promise<void> {
  const m = (await (await fetch(`${BASE}manifest.json`)).json()) as Manifest;
  const proc = proceduralFigure();
  if (!TARGET_H) TARGET_H = crestHeight(proc.frames('idle', 'south-west').imgs[0] as HTMLCanvasElement) * proc.k || 29;
  header(m);
  const figs = [proc, ...(await Promise.all(m.variants.map((v) => pixellabFigure(v))))];

  // 1. line-up: each figure in the 4 game facings, side by side
  const colW = 76, wH = 84;
  const placed: Placed[] = [];
  const labels: { x: number; y: number; t: string }[] = [];
  figs.forEach((fig, i) => {
    const cx = 26 + i * colW;
    labels.push({ x: cx + 16, y: 2, t: i ? fig.label.split(' ')[0] : 'today' });
    GAME_DIRS.forEach((d, j) => placed.push({ fig, x: cx + (j % 2) * 32, y: 44 + Math.floor(j / 2) * 38, dir: d, anim: ANIM_NAME, phase: 0 }));
  });
  stage('Line-up: today vs A..D, the 4 game facings (top: SE, NE; bottom: SW, NW)', figs.length * colW + 10, wH + 10, placed, labels);

  // 2. formations: 5 files x 3 ranks per figure, enemy side (facing SW, seen from the front) and player side (NE, from behind)
  for (const [dir, side] of [['south-west', 'enemy side, facing down-left (front view)'], ['north-east', 'player side, facing up-right (back view)']] as const) {
    const fp: Placed[] = [];
    const fl: { x: number; y: number; t: string }[] = [];
    const blockW = 160;
    figs.forEach((fig, b) => {
      const ox = 70 + b * blockW, oy = 30;
      fl.push({ x: ox + 10, y: 2, t: b ? fig.label.split(' ')[0] : 'today' });
      for (let r = 0; r < 3; r++) for (let f = 0; f < 5; f++) {
        // a line formation: files along field x, ranks along field y (SPACING.line), seen through the iso projection
        const p = isoToScreen(f * SPACING.line.file, (dir === 'south-west' ? -r : r) * SPACING.line.rank);
        fp.push({ fig, x: ox + p.x - 30, y: oy + p.y + (dir === 'south-west' ? 30 : 0), dir, anim: ANIM_NAME, phase: (f * 3 + r * 5) % 8 });
      }
    });
    stage(`Formation 5x3, ${side}`, figs.length * blockW + 60, 112, fp, fl);
  }

  // 3. animation-mode comparison (template / v3 custom / skeleton-v3) on one variant and facing
  if (m.modes.length) {
    const mp: Placed[] = [];
    const ml: { x: number; y: number; t: string }[] = [];
    const base = m.variants.find((v) => v.id === m.modes[0].variant)!;
    const fig = await pixellabFigure(base);
    m.modes.forEach((md, i) => {
      ml.push({ x: 40 + i * 70, y: 2, t: md.label });
      mp.push({ fig, x: 40 + i * 70, y: 60, dir: md.dir, anim: md.anim, phase: 0 });
    });
    stage(`Attack modes on ${base.id}: ${m.modes.map((x) => `${x.label} ${x.dir}`).join(" | ")}`, m.modes.length * 70 + 20, 72, mp, ml);
  }
  requestAnimationFrame(loop);
}

main().catch((e) => document.body.appendChild(el('pre', 'color:#f88', String(e))));
