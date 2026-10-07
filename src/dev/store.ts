/**
 * Dev-only Telegram store art: open /store.html?img=cover or ?img=botpic.
 * Everything is composed from the game's own procedural generators (iso ground,
 * paper-doll soldiers, blood decals, aura rings, parchment scroll, pixel font)
 * at a small base resolution and scaled up with nearest-neighbour.
 * Captured by scripts/store-images.mjs into docs/store/.
 */
import { renderFrame, dollGeom, type DollSpec } from '../art/paperdoll';
import { renderGround, renderBlood, renderShadow } from '../art/ground';
import { renderAuraRing, renderStar, renderPip } from '../art/fx';
import { renderPanel, renderScrollRoll } from '../art/uiTextures';
import { renderFontAtlas, FONT_CELL_H, type GlyphInfo } from '../art/font';
import { isoToScreen } from '../art/iso';
import { P, mix } from '../art/palette';
import { BAYER4, Pix, hash2 } from '../art/pixels';

// ---------------------------------------------------------------- helpers

function scalePix(src: Pix, s: number): Pix {
  const out = new Pix(src.w * s, src.h * s);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const i = (Math.floor(y / s) * src.w + Math.floor(x / s)) * 4;
      const o = (y * out.w + x) * 4;
      out.data[o] = src.data[i];
      out.data[o + 1] = src.data[i + 1];
      out.data[o + 2] = src.data[i + 2];
      out.data[o + 3] = src.data[i + 3];
    }
  }
  return out;
}

function canvasToPix(c: HTMLCanvasElement): Pix {
  const px = new Pix(c.width, c.height);
  px.data.set(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
  return px;
}

interface Font {
  atlas: Pix;
  glyphs: Map<string, GlyphInfo>;
  shadow: boolean;
}

function makeFont(color: number, shadow?: number): Font {
  const { canvas, glyphs } = renderFontAtlas(color, shadow);
  return { atlas: canvasToPix(canvas), glyphs: new Map(glyphs.map((g) => [g.ch, g])), shadow: shadow !== undefined };
}

function textWidth(f: Font, str: string): number {
  let w = 0;
  for (const ch of str) w += f.glyphs.get(ch)!.w + 1 - (f.shadow ? 1 : 0);
  return w - 1 + (f.shadow ? 1 : 0);
}

/** Text as its own Pix (1x), so it can be scaled before blitting. */
function textPix(f: Font, str: string): Pix {
  const px = new Pix(textWidth(f, str), FONT_CELL_H);
  let x = 0;
  for (const ch of str) {
    const g = f.glyphs.get(ch)!;
    px.blit(f.atlas, x, 0, false, g.x, g.y, g.w, FONT_CELL_H);
    x += g.w + 1 - (f.shadow ? 1 : 0);
  }
  return px;
}

/** Draw a 1px line with a colour, used for projectiles. */
function missile(px: Pix, x: number, y: number, vx: number, vy: number, kind: 'javelin' | 'arrow'): void {
  const l = Math.hypot(vx, vy);
  vx /= l;
  vy /= l;
  const len = kind === 'javelin' ? 13 : 8;
  const tail = { x: Math.round(x - vx * len), y: Math.round(y - vy * len) };
  // dark under-stroke so it reads against grass
  px.line(tail.x, tail.y + 1, Math.round(x), Math.round(y) + 1, P.outline);
  px.line(tail.x, tail.y, Math.round(x), Math.round(y), kind === 'javelin' ? P.wood[0] : 0xd8c8a0);
  // speed streak behind the tail
  for (let i = 2; i < 9; i += 2) px.set(Math.round(tail.x - vx * i), Math.round(tail.y - vy * i), 0xf6ecd8, 150 - i * 14);
  px.set(Math.round(x), Math.round(y), P.iron[0]);
  px.set(Math.round(x - vx), Math.round(y - vy), P.iron[1]);
  if (kind === 'arrow') {
    px.set(tail.x, tail.y, P.cream);
    px.set(tail.x + Math.round(-vy), tail.y + Math.round(vx), P.red);
  }
}

function stuck(px: Pix, x: number, y: number, dir: number): void {
  px.line(x, y, x - dir * 3, y - 6, P.wood[1]);
  px.set(x - dir * 3, y - 6, P.wood[0]);
}

/** Darken the edges with an ordered-dither vignette. */
function vignette(px: Pix, strength: number, color = 0x1d140f): void {
  const cx = (px.w - 1) / 2;
  const cy = (px.h - 1) / 2;
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const dx = (x - cx) / (px.w / 2);
      const dy = (y - cy) / (px.h / 2);
      const d = Math.max(0, Math.sqrt(dx * dx * 0.8 + dy * dy * 1.1) - 0.55) * strength;
      if (d <= 0) continue;
      const t = BAYER4[y & 3][x & 3];
      const steps = Math.floor(d * 3 + t);
      if (steps > 0) px.set(x, y, mix(px.get(x, y), color, Math.min(0.5, steps * 0.12)));
    }
  }
}

/** One sprite frame. */
function dollFrame(spec: DollSpec, frame: number, dir: number): Pix {
  return renderFrame(spec, frame, dir);
}

// ---------------------------------------------------------------- soldiers

const HOPLITES: DollSpec[] = [
  { look: { skin: 1, hair: 0, hairStyle: 0, beard: 1, tunic: 'tunicBlue' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } }, helmet: { art: 'corinthian', paint: { field: 'red' } }, armor: 'linothorax', cloak: 'cloakRed' },
  { look: { skin: 2, hair: 1, hairStyle: 1, beard: 2, tunic: 'tunicBlue' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'owl', field: 'red', ink: 'cream' } }, helmet: { art: 'corinthian', paint: { field: 'cream' } }, armor: 'cuirass', cloak: 'cloakRed' },
  { look: { skin: 0, hair: 2, hairStyle: 0, beard: 1, tunic: 'tunicWhite' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } }, helmet: { art: 'chalcidian', paint: { field: 'red' } }, armor: 'linothorax' },
  { look: { skin: 1, hair: 1, hairStyle: 0, beard: 2, tunic: 'tunicBlue' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'trident', field: 'red', ink: 'ink' } }, helmet: { art: 'pilos' }, armor: 'linothorax' },
  { look: { skin: 3, hair: 0, hairStyle: 2, beard: 1, tunic: 'tunicWhite' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'sunwheel', field: 'bronze', ink: 'red' } }, helmet: { art: 'corinthian', paint: { field: 'ink' } }, armor: 'cuirass' },
  { look: { skin: 2, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicBlue' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } }, helmet: { art: 'corinthian', paint: { field: 'red' } }, armor: 'scale' },
];

const FOES: DollSpec[] = [
  { look: { skin: 0, hair: 3, hairStyle: 1, beard: 1, tunic: 'tunicOchre' }, weapon: 'longsword', shield: { art: 'oval', paint: { emblem: 'boar', field: 'cream', ink: 'ink' } }, helmet: { art: 'montefortino', paint: { field: 'ink' } }, armor: 'mail' },
  { look: { skin: 1, hair: 2, hairStyle: 1, beard: 2, tunic: 'tunicRed' }, weapon: 'spear', shield: { art: 'oval', paint: { emblem: 'boar', field: 'ink', ink: 'cream' } }, helmet: { art: 'montefortino', paint: { field: 'red' } }, armor: 'mail' },
  { look: { skin: 2, hair: 1, hairStyle: 1, beard: 1, tunic: 'tunicGreen' }, weapon: 'axe', shield: { art: 'oval', paint: { emblem: 'star', field: 'cream', ink: 'ink' } }, armor: 'leather' },
  { look: { skin: 1, hair: 3, hairStyle: 1, beard: 2, tunic: 'tunicRed' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'scorpion', field: 'cream', ink: 'ink' } }, helmet: { art: 'chalcidian', paint: { field: 'ink' } }, armor: 'scale' },
  { look: { skin: 0, hair: 2, hairStyle: 1, beard: 0, tunic: 'tunicOchre' }, weapon: 'longsword', shield: { art: 'oval', paint: { emblem: 'horse', field: 'ink', ink: 'cream' } }, armor: 'mail' },
];

const SKIRMISHER: DollSpec = { look: { skin: 2, hair: 0, hairStyle: 2, beard: 0, tunic: 'tunicWhite' }, weapon: 'javelins', shield: { art: 'buckler', paint: { field: 'bronze' } } };
const ARCHER: DollSpec = { look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicGreen' }, weapon: 'bow', helmet: { art: 'cap' }, armor: 'leather' };

interface Placed {
  spec: DollSpec;
  frame: number;
  dir: number;
  flip: boolean;
  x: number; // feet position in base pixels
  y: number;
  tint?: number;
}

// ---------------------------------------------------------------- cover

function renderCover(): Pix {
  const W = 320; // 320 x 180 at 2x = 640 x 360
  const H = 180;
  const px = renderGround(W, H, { originX: -100, originY: 200, fieldW: 300, fieldH: 300, seed: 20261006 });

  // battle line through (cx, cy), running along field x (down-right on screen)
  const cx = 196;
  const cy = 116;
  const at = (k: number, rank: number): { x: number; y: number } => {
    const a = isoToScreen(k, rank);
    return { x: Math.round(cx + a.x), y: Math.round(cy + a.y) };
  };
  // the title scroll covers the top-left corner; keep heads out from under it
  const TITLE = { x0: 0, y0: 0, x1: 150, y1: 60 };
  const underTitle = (x: number, y: number) => x - 14 < TITLE.x1 && y - 40 < TITLE.y1;

  // trampled, bloody contact zone
  for (let k = -6; k <= 7; k++) {
    if (hash2(k, 5, 3) < 0.5) {
      const p = at(k * 1.3 + 0.3, hash2(k, 6, 3) * 0.8 - 0.4);
      px.blit(renderBlood(Math.floor(hash2(k, 7, 3) * 4)), p.x - 6, p.y - 3);
    }
  }

  // aura rings: Steady Presence under the phalanx, Warlord under the foe
  const ringPos = at(-0.6, 2.4);
  const ring = renderAuraRing(2.4, 0xe8c860, 2, 8);
  px.blit(ring, Math.round(ringPos.x - ring.w / 2), Math.round(ringPos.y - ring.h / 2));
  const ring2Pos = at(1.8, -3.0);
  const ring2 = renderAuraRing(2.0, 0xe86048, 5, 8);
  px.blit(ring2, Math.round(ring2Pos.x - ring2.w / 2), Math.round(ring2Pos.y - ring2.h / 2));

  const units: Placed[] = [];
  const jit = (k: number, r: number, s: number) => Math.round((hash2(k, r, s) - 0.5) * 2);
  const STEP = 1.45;
  // player hoplites: bottom-left, seen from behind, facing up-right
  for (let rank = 0; rank < 3; rank++) {
    for (let k = -5; k <= 5; k++) {
      if (rank === 2 && hash2(k, 9, 1) < 0.5) continue;
      const p = at(k * STEP + (rank % 2) * 0.7, 0.95 + rank * 1.5);
      const spec = HOPLITES[(k + 20 + rank * 2) % HOPLITES.length];
      const fr = rank === 0 ? [7, 6, 8, 7, 9][(k + 10) % 5] : rank === 1 ? [6, 0, 1][(k + 10) % 3] : (k + rank + 20) % 2;
      units.push({ spec, frame: fr, dir: 1, flip: false, x: p.x + jit(k, rank, 1), y: p.y + jit(k, rank, 2) });
    }
  }
  // skirmishers behind the phalanx, throwing
  for (const k of [-2, 1.5]) {
    const p = at(k * STEP, 5.6);
    units.push({ spec: SKIRMISHER, frame: 7, dir: 1, flip: false, x: p.x, y: p.y });
  }
  // the foe: top-right, seen from the front, facing down-left (mirrored)
  for (let rank = 0; rank < 3; rank++) {
    for (let k = -5; k <= 6; k++) {
      if (rank === 2 && hash2(k, 9, 2) < 0.5) continue;
      const p = at(k * STEP + (rank % 2) * 0.7 - 0.2, -0.95 - rank * 1.5);
      if (underTitle(p.x, p.y)) continue;
      const spec = FOES[(k + 30 + rank * 2) % FOES.length];
      const fr = rank === 0 ? [7, 9, 6, 8, 7, 9][(k + 12) % 6] : rank === 1 ? [6, 0, 1][(k + 11) % 3] : (k + rank + 21) % 2;
      units.push({ spec, frame: fr, dir: 2, flip: false, x: p.x + jit(k, rank, 3), y: p.y + jit(k, rank, 4) });
    }
  }
  for (const k of [0.5, 3.5]) {
    const p = at(k * STEP, -5.6);
    if (!underTitle(p.x, p.y)) units.push({ spec: ARCHER, frame: 7, dir: 2, flip: false, x: p.x, y: p.y });
  }
  // the fallen, lying in the gap
  const fallen: Placed[] = [
    { spec: FOES[0], frame: 12, dir: 2, flip: false, ...at(-1.9, 0.05) },
    { spec: HOPLITES[3], frame: 12, dir: 1, flip: false, ...at(4.5, 0.2) },
  ];
  for (const f of fallen) {
    px.blit(renderBlood(1), f.x - 7, f.y - 4);
    px.blit(renderBlood(3), f.x - 2, f.y - 2);
  }

  const shadow = renderShadow();
  const all = [...fallen.map((f) => ({ ...f, y: f.y - 6 })), ...units].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const u of all) {
    if (u.frame !== 12) {
      for (let y = 0; y < shadow.h; y++) for (let x = 0; x < shadow.w; x++) if (shadow.alpha(x, y)) px.set(u.x - 9 + x, u.y - 3 + y, 0x1d140f, 80);
    }
    const fr = dollFrame(u.spec, u.frame, u.dir);
    if (u.tint !== undefined) {
      for (let i = 0; i < fr.data.length; i += 4) {
        if (!fr.data[i + 3]) continue;
        fr.data[i] = (fr.data[i] * ((u.tint >> 16) & 255)) / 255;
        fr.data[i + 1] = (fr.data[i + 1] * ((u.tint >> 8) & 255)) / 255;
        fr.data[i + 2] = (fr.data[i + 2] * (u.tint & 255)) / 255;
      }
    }
    const g = dollGeom(u.spec);
    px.blit(fr, u.x - g.fw / 2, u.y - g.footY + (u.frame === 12 ? 6 : 0), u.flip);
  }

  // clash sparks along the line
  const spark = new Pix(5, 5);
  for (const [x, y] of [[2, 0], [2, 4], [0, 2], [4, 2]]) spark.set(x, y, 0xfff4c0);
  spark.set(2, 2, 0xffffff);
  for (const k of [-3, -1, 1, 3]) {
    const p = at(k * STEP + 0.5, 0);
    px.blit(spark, p.x - 2, p.y - 30 + (k & 1) * 3);
  }
  // a stunned foe and a rallied hoplite
  const st = at(1 * STEP - 0.2, -0.6);
  px.blit(renderStar(), st.x - 6, st.y - 44);
  px.blit(renderStar(), st.x + 1, st.y - 47);
  for (const k of [-1, 0]) {
    const p = at(k * STEP + 0.5, 2.15);
    px.blit(renderPip('up', 0xe0b860), p.x - 3, p.y - 52);
  }

  // missiles in flight: javelins up-right from the skirmishers, arrows down-left from the archers
  const fly = (k: number, r: number, lift: number, vx: number, vy: number, kind: 'javelin' | 'arrow') => {
    const p = at(k, r);
    missile(px, p.x, p.y - lift, vx, vy, kind);
  };
  fly(-0.5, -2.2, 44, 6, -1, 'javelin');
  fly(2.5, -2.8, 50, 7, 0, 'javelin');
  fly(5.5, -1.8, 40, 6, 2, 'javelin');
  fly(-3, 2.2, 46, -5, 3, 'arrow');
  fly(-1.2, 3.0, 40, -5, 4, 'arrow');
  fly(1.6, 2.6, 48, -6, 3, 'arrow');
  fly(-5.5, 3.4, 36, -5, 3, 'arrow');
  for (const [k, r, d] of [[-4, 5.4, -1], [2.2, 6.4, -1], [-1, 6.0, -1], [6, -5.2, 1]]) {
    const p = at(k, r);
    stuck(px, p.x, p.y, d);
  }

  vignette(px, 1.4);

  // ---- title scroll (top-left, over the empty field behind the foe)
  const title = scalePix(textPix(makeFont(P.inkRed, P.parchDark), 'PIXELARROW'), 3);
  const tag = textPix(makeFont(P.ink), 'COMMAND THE LINE');
  const bw = title.w + 16;
  const bh = 52;
  const bx = 7;
  const by = 6;
  // drop shadow
  for (let y = 0; y < bh - 2; y++) for (let x = 0; x < bw + 4; x++) px.set(bx - 2 + x + 2, by + 3 + y + 2, 0x1d140f, 90);
  px.blit(renderPanel(bw, bh - 6, 'parch'), bx, by + 3);
  const roll = renderScrollRoll(bw + 8);
  px.blit(roll, bx - 4, by - 2);
  px.blit(roll, bx - 4, by + bh - 6);
  px.blit(title, bx + Math.round((bw - title.w) / 2), by + 8);
  // red divider between title and tagline
  const dy = by + 32;
  for (let x = bx + 10; x < bx + bw - 10; x++) if ((x & 1) === 0) px.set(x, dy, P.parchDark);
  px.blit(tag, bx + Math.round((bw - tag.w) / 2), by + 35);

  return px;
}

// ---------------------------------------------------------------- botpic

function renderBotpic(frame: number): Pix {
  const S = 64; // 64 x 64 at 10x = 640 x 640
  const px = new Pix(S, S);
  const c = (S - 1) / 2;
  // Mediterranean-blue backdrop in concentric steps; a checker dither softens each step.
  const ramp = [0x8fb0c8, P.tunicBlue[0], P.tunicBlue[1], P.tunicBlue[2], 0x24364a];
  const edges = [11, 18, 25, 30];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c - 1);
      let band = edges.findIndex((e) => d < e);
      if (band < 0) band = edges.length;
      const near = edges[band] !== undefined && edges[band] - d < 0.9;
      if (near && ((x + y) & 1) === 0) band++;
      px.set(x, y, ramp[Math.min(band, ramp.length - 1)]);
    }
  }
  // ground shadow
  px.ellipse(20, 52, 24, 6, () => P.tunicBlue[2]);
  const fr = renderFrame(HOPLITES[0], frame, 0);
  // centre the figure (spear raised overhand, shield forward)
  px.blit(fr, 8, 4);
  return px;
}

// ---------------------------------------------------------------- page

function show(px: Pix, scale: number, cropX: number, outW: number, outH: number): void {
  const big = scalePix(px, scale);
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  c.id = 'out';
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(outW, outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const i = (y * big.w + x + cropX) * 4;
      const o = (y * outW + x) * 4;
      img.data[o] = big.data[i];
      img.data[o + 1] = big.data[i + 1];
      img.data[o + 2] = big.data[i + 2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  document.body.appendChild(c);
}

const which = new URLSearchParams(location.search).get('img') ?? 'cover';
if (which === 'botpic') show(renderBotpic(Number(new URLSearchParams(location.search).get('f') ?? 6)), 10, 0, 640, 640);
else show(renderCover(), 2, 0, 640, 360);
document.body.dataset.ready = '1';
