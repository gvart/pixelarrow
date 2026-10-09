/**
 * "Mosaic & Parchment" surfaces (docs/redesign/V4_SPEC.md): procedural Canvas 2D
 * renderers for the v4 chrome, drawn at the screen's density like
 * src/art/smoothUi.ts (K atlas px per UI px). Every texture is deterministic
 * (seeded by size and style) so a size is drawn once and cached
 * (src/ui/mosaic/surface.ts). Colours come from `MOSAIC` (src/ui/tokens.ts);
 * the few shading alphas below are light and shade, not palette.
 *
 * Sizes are UI px (w x h), lengths inside a renderer are multiples of `U`
 * (= K atlas px = one UI px).
 */
import { ACCENT, MOSAIC as M, css } from '../ui/tokens';

export type MosaicStyle =
  | 'page' | 'topBar' | 'frame'
  | 'paper' | 'parchment' | 'parchmentSel' | 'parchmentWell' | 'sheet'
  | 'plaque'
  | 'btnPrimary' | 'btnPrimaryDown' | 'btnHero' | 'btnHeroDown' | 'btnBronze' | 'btnBronzeDown' | 'btnNeutral' | 'btnNeutralDown' | 'btnStone' | 'btnBuy' | 'btnBuyDown'
  | 'tileStone' | 'tileTerra' | 'tileGlaze' | 'tileBronze' | 'tileOff'
  | 'fresco' | 'track' | 'trackSel' | 'segDone' | 'segOpen' | 'questTrack'
  | 'tabBar' | 'tabSel' | 'medallion' | 'medallionSel'
  | 'chipParch' | 'chipStone';

/** Frame band thickness in UI px (the stone band round the content, V4_SPEC "Screen frame"). */
export const FRAME_T = 7;
/** Fresco frame thickness in UI px. */
export const FRESCO_T = 4;
/** Extra room round a lit medallion for its glow, as a fraction of its diameter. */
export const MEDALLION_GLOW = 0.14;

type Ctx = CanvasRenderingContext2D;

function make(W: number, H: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(W));
  canvas.height = Math.max(2, Math.round(H));
  return { canvas, ctx: canvas.getContext('2d')! };
}

function seeded(w: number, h: number, style: string): () => number {
  let seed = (Math.round(w) * 73856093) ^ (Math.round(h) * 19349663) ^ (style.length * 83492791 + style.charCodeAt(0) * 2654435761);
  seed &= 0x7fffffff;
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function rrPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function vgrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, c] of stops) g.addColorStop(at, c);
  return g;
}

/** A rounded rectangle whose straight edges wander by up to `amp` px: hand-cut parchment. */
function wobblyPath(ctx: Ctx, w: number, h: number, r: number, amp: number, step: number, rnd: () => number): void {
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const o = rnd() * amp;
      pts.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]);
    }
  };
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i / 3) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  edge(r, 0, w - r, 0, 0, 1);
  arc(w - r, r, -Math.PI / 2);
  edge(w, r, w, h - r, -1, 0);
  arc(w - r, h - r, 0);
  edge(w - r, h, r, h, 0, -1);
  arc(r, h - r, Math.PI / 2);
  edge(0, h - r, 0, r, 1, 0);
  arc(r, r, Math.PI);
  ctx.beginPath();
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[pts.length - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < pts.length; i++) {
    const m = mid(pts[i], pts[(i + 1) % pts.length]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

// ================================================================== page, bars

function renderPage(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'page');
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.page)], [1, css(M.stone0)]]);
  ctx.fillRect(0, 0, W, H);
  // basalt: very low-contrast speckle and a few cloudy patches
  const n = Math.min(2600, Math.round((W * H) / (60 * K * K)));
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() < 0.5 ? css(M.pageSpeck, 0.5) : 'rgba(0,0,0,0.22)';
    const s = K * (0.5 + rnd() * 0.9);
    ctx.fillRect(rnd() * W, rnd() * H, s, s);
  }
  for (let i = 0; i < 14; i++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const rad = (20 + rnd() * 50) * K;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, rnd() < 0.5 ? 'rgba(255,230,190,0.03)' : 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  return canvas;
}

/** Dark stone strip under the title plaque. */
function renderTopBar(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'topBar');
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.stone2)], [0.5, css(M.stone1)], [1, css(M.stone0)]]);
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < Math.min(400, W / K); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,230,190,0.04)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.6 + rnd()), K * (0.6 + rnd()));
  }
  ctx.fillStyle = 'rgba(255,230,190,0.12)';
  ctx.fillRect(0, 0, W, Math.max(1, K * 0.5));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - K, W, K);
  ctx.fillStyle = css(M.meanderLo, 0.7);
  ctx.fillRect(0, H - K * 1.6, W, Math.max(1, K * 0.5));
  return canvas;
}

// ================================================================== frame

/** A horizontal strip of Greek key (len x T UI px) in gold-ochre on dark stone. */
function meanderStrip(len: number, T: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(len * K, T * K);
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.stone2)], [1, css(M.stone0)]]);
  ctx.fillRect(0, 0, W, H);
  // the dark inset the key is cut into
  const pad = H * 0.09;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, pad, W, H - pad * 2);
  const u = (H - pad * 2 - pad * 1.2) / 5;
  const top = pad + pad * 0.6;
  ctx.lineWidth = Math.max(1, u * 0.9);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const draw = (color: string, dy: number) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = u * 0.5; x < W + u * 6; x += u * 6) {
      const y0 = top + dy;
      const yb = y0 + u * 4.4;
      ctx.moveTo(x, yb);
      ctx.lineTo(x, y0);
      ctx.lineTo(x + u * 4, y0);
      ctx.lineTo(x + u * 4, y0 + u * 3);
      ctx.lineTo(x + u * 2, y0 + u * 3);
      ctx.lineTo(x + u * 2, y0 + u * 1.7);
      ctx.moveTo(x, yb);
      ctx.lineTo(x + u * 6, yb);
    }
    ctx.stroke();
  };
  draw('rgba(0,0,0,0.6)', Math.max(1, K * 0.45));
  draw(css(M.meander), 0);
  // a lit upper edge on the key
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.meanderHi, 0.5)], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.25)']]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  return canvas;
}

function rosette(ctx: Ctx, cx: number, cy: number, r: number, K: number): void {
  ctx.beginPath();
  ctx.arc(cx + K * 0.3, cy + K * 0.5, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, css(M.bronzeHi));
  g.addColorStop(0.7, css(M.bronze));
  g.addColorStop(1, css(M.bronzeLo));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, K * 0.4);
  ctx.strokeStyle = 'rgba(20,10,2,0.8)';
  ctx.stroke();
  // petals
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(r * 0.58, 0, r * 0.24, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,226,170,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,22,6,0.55)';
    ctx.lineWidth = Math.max(1, K * 0.3);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  const c = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, 0, cx, cy, r * 0.3);
  c.addColorStop(0, css(M.bronzeHi));
  c.addColorStop(1, css(M.bronzeLo));
  ctx.fillStyle = c;
  ctx.fill();
}

/** The stone band round the content (centre transparent): a meander along the four sides, a rosette at each corner. */
function renderFrame(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const T = FRAME_T * K;
  const rnd = seeded(w, h, 'frame');
  rrPath(ctx, 0, 0, W, H, K * 1.5);
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.stone3)], [1, css(M.stone1)]]);
  ctx.fill();
  const hor = meanderStrip(Math.max(8, w - FRAME_T * 2), FRAME_T, K);
  ctx.drawImage(hor, T, 0);
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);
  ctx.drawImage(hor, T, 0);
  ctx.restore();
  const ver = meanderStrip(Math.max(8, h - FRAME_T * 2), FRAME_T, K);
  ctx.save();
  ctx.translate(T, T);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(ver, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(W, T);
  ctx.rotate(Math.PI / 2);
  ctx.scale(1, 1);
  ctx.drawImage(ver, 0, 0);
  ctx.restore();
  // stone grain on the corner blocks
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,230,190,0.05)' : 'rgba(0,0,0,0.2)';
    const cx = rnd() < 0.5 ? rnd() * T : W - rnd() * T;
    const cy = rnd() < 0.5 ? rnd() * T : H - rnd() * T;
    ctx.fillRect(cx, cy, K * 0.8, K * 0.8);
  }
  // bevel: lit outer top-left, shaded inner edge
  ctx.strokeStyle = 'rgba(255,230,190,0.22)';
  ctx.lineWidth = Math.max(1, K * 0.6);
  ctx.beginPath();
  ctx.moveTo(K * 0.4, H - K * 1.5);
  ctx.lineTo(K * 0.4, K * 1.5);
  ctx.quadraticCurveTo(K * 0.4, K * 0.4, K * 1.5, K * 0.4);
  ctx.lineTo(W - K * 1.5, K * 0.4);
  ctx.stroke();
  // the hole
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  rrPath(ctx, T, T, W - T * 2, H - T * 2, K * 0.8);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = Math.max(1, K * 0.7);
  rrPath(ctx, T - K * 0.2, T - K * 0.2, W - T * 2 + K * 0.4, H - T * 2 + K * 0.4, K * 0.8);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  const rr = K * 5.2;
  const o = T / 2;
  for (const [x, y] of [[o, o], [W - o, o], [o, H - o], [W - o, H - o]]) rosette(ctx, x, y, rr, K);
  return canvas;
}

// ================================================================== parchment

interface ParchOpts {
  /** The screen's parchment ground: no card edge, shadow or radius. */
  flat?: boolean;
  sel?: boolean;
  well?: boolean;
  sheet?: boolean;
}

function renderParchment(w: number, h: number, K: number, style: string, o: ParchOpts): HTMLCanvasElement {
  const pad = K * 1.5;
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, style);
  const r = o.flat ? 0 : (o.sheet ? 3.5 : 2.2) * K;
  const bx = pad * 0.5;
  const bh = H - pad * (o.well ? 0.5 : 1.2);
  ctx.save();
  ctx.translate(bx, bx);
  const cw = W - bx * 2;
  const ch = bh - bx;
  if (!o.well && !o.flat) {
    // contact shadow below the card
    ctx.save();
    ctx.translate(0, K * 0.9);
    wobblyPath(ctx, cw, ch, r, K * 0.5, K * 7, seeded(w, h, style));
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
    ctx.restore();
  }
  const edgeRnd = seeded(w, h, style);
  wobblyPath(ctx, cw, ch, r, o.well || o.flat ? 0 : K * 0.5, K * 7, edgeRnd);
  const top = o.well ? M.well : o.flat ? M.parch : M.parchHi;
  const mid = o.well ? M.well : o.sel ? M.parchHi : o.flat ? M.parchLo : M.parch;
  const bot = o.well ? M.wellLo : o.sel ? M.parch : M.parchLo;
  ctx.fillStyle = vgrad(ctx, 0, ch, [[0, css(top)], [0.5, css(mid)], [1, css(bot)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // edge vignette
  const v = Math.min(7 * K, ch / 3, cw / 3);
  const edges: [number, number, number, number][] = [[0, 0, 0, v], [0, ch, 0, ch - v], [0, 0, v, 0], [cw, 0, cw - v, 0]];
  edges.forEach(([x0, y0, x1, y1], i) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(110,72,34,${o.well ? 0.34 : 0.26})`);
    g.addColorStop(1, 'rgba(110,72,34,0)');
    ctx.fillStyle = g;
    if (i < 2) ctx.fillRect(0, i ? ch - v : 0, cw, v);
    else ctx.fillRect(i === 2 ? 0 : cw - v, 0, v, ch);
  });
  // stains
  const stains = Math.max(2, Math.min(14, Math.round((cw * ch) / (2400 * K * K))));
  for (let i = 0; i < stains; i++) {
    const cx = rnd() * cw;
    const cy = rnd() * ch;
    const rad = (8 + rnd() * 26) * K;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(140,98,48,${0.07 + rnd() * 0.08})`);
    g.addColorStop(1, 'rgba(140,98,48,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // fibres: short curved hairs, dark and light
  const fibres = Math.min(520, Math.round((cw * ch) / (90 * K * K)));
  ctx.lineWidth = Math.max(1, K * 0.35);
  for (let i = 0; i < fibres; i++) {
    const x = rnd() * cw;
    const y = rnd() * ch;
    const len = (2 + rnd() * 7) * K;
    const a = rnd() * Math.PI;
    ctx.strokeStyle = rnd() < 0.62 ? `rgba(120,80,36,${0.05 + rnd() * 0.07})` : `rgba(255,248,224,${0.1 + rnd() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * K, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * K, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // specks
  const specks = Math.min(160, Math.round((cw * ch) / (400 * K * K)));
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = `rgba(90,58,26,${0.1 + rnd() * 0.18})`;
    const s = K * (0.35 + rnd() * 0.5);
    ctx.fillRect(rnd() * cw, rnd() * ch, s, s);
  }
  if (o.well) {
    const g = ctx.createLinearGradient(0, 0, 0, K * 4);
    g.addColorStop(0, 'rgba(60,34,12,0.5)');
    g.addColorStop(1, 'rgba(60,34,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, K * 4);
  }
  ctx.restore();
  if (o.flat) {
    ctx.restore();
    return canvas;
  }
  // inked edge (the same wobble again), then a light line just inside
  wobblyPath(ctx, cw, ch, r, o.well ? 0 : K * 0.5, K * 7, seeded(w, h, style));
  ctx.lineWidth = Math.max(1, K * (o.sel ? 1.6 : 0.8));
  ctx.strokeStyle = o.sel ? css(M.bronze) : css(M.parchEdge, 0.9);
  ctx.stroke();
  if (!o.well) {
    ctx.save();
    ctx.translate(K * 0.9, K * 0.9);
    rrPath(ctx, 0, 0, cw - K * 1.8, ch - K * 1.8, Math.max(0, r - K));
    ctx.lineWidth = Math.max(1, K * 0.4);
    ctx.strokeStyle = 'rgba(255,250,228,0.35)';
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  return canvas;
}

// ================================================================== plaque

function renderPlaque(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'plaque');
  const lip = K * 1.2;
  rrPath(ctx, 0, lip, W, H - lip, K * 1.8);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  rrPath(ctx, 0, 0, W, H - lip, K * 1.8);
  ctx.fillStyle = vgrad(ctx, 0, H - lip, [[0, css(M.tealHi)], [0.5, css(M.teal)], [1, css(M.tealLo)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(200,255,240,0.06)' : 'rgba(0,0,0,0.16)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  ctx.fillStyle = vgrad(ctx, 0, (H - lip) * 0.5, [[0, 'rgba(200,255,240,0.2)'], [1, 'rgba(200,255,240,0)']]);
  ctx.fillRect(0, 0, W, (H - lip) * 0.5);
  ctx.restore();
  // gold rim and a fine inner line
  rrPath(ctx, K * 0.5, K * 0.5, W - K, H - lip - K, K * 1.6);
  ctx.lineWidth = Math.max(1, K * 1.1);
  ctx.strokeStyle = vgrad(ctx, 0, H, [[0, css(M.goldHi)], [0.5, css(M.meander)], [1, css(M.meanderLo)]]);
  ctx.stroke();
  rrPath(ctx, K * 1.8, K * 1.8, W - K * 3.6, H - lip - K * 3.6, K * 0.8);
  ctx.lineWidth = Math.max(1, K * 0.4);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  return canvas;
}

// ================================================================== buttons

interface BtnLook {
  hi: number;
  mid: number;
  lo: number;
  rimHi: number;
  rimLo: number;
  gloss?: boolean;
  brushed?: boolean;
  pressed?: boolean;
  hero?: boolean;
}

const BTN: Record<string, BtnLook> = {
  btnPrimary: { hi: M.terraHi, mid: M.terra, lo: M.terraLo, rimHi: M.goldHi, rimLo: M.meanderLo, gloss: true },
  btnPrimaryDown: { hi: M.terra, mid: M.terraLo, lo: M.terraLo, rimHi: M.meander, rimLo: M.meanderLo, gloss: true, pressed: true },
  btnHero: { hi: M.terraHi, mid: M.terra, lo: M.terraLo, rimHi: M.goldHi, rimLo: M.meanderLo, gloss: true, hero: true },
  btnHeroDown: { hi: M.terra, mid: M.terraLo, lo: M.terraLo, rimHi: M.meander, rimLo: M.meanderLo, gloss: true, pressed: true, hero: true },
  btnBronze: { hi: M.bronzeHi, mid: M.bronze, lo: M.bronzeLo, rimHi: M.meanderHi, rimLo: 0x2a1c0c, brushed: true },
  btnBronzeDown: { hi: M.bronze, mid: M.bronzeLo, lo: M.bronzeLo, rimHi: M.meander, rimLo: 0x2a1c0c, brushed: true, pressed: true },
  btnNeutral: { hi: M.slabHi, mid: M.slab, lo: M.slabLo, rimHi: M.bronzeHi, rimLo: 0x2a1c0c },
  btnNeutralDown: { hi: M.slab, mid: M.slabLo, lo: M.slabLo, rimHi: M.bronze, rimLo: 0x2a1c0c, pressed: true },
  btnBuy: { hi: ACCENT.purchaseHi, mid: ACCENT.purchase, lo: ACCENT.purchaseLo, rimHi: 0xc8e8ff, rimLo: 0x0a2436, gloss: true },
  btnBuyDown: { hi: ACCENT.purchase, mid: ACCENT.purchaseLo, lo: ACCENT.purchaseLo, rimHi: 0x9cd0f0, rimLo: 0x0a2436, gloss: true, pressed: true },
};

function renderButton(w: number, h: number, K: number, style: string): HTMLCanvasElement {
  const look = BTN[style];
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, style);
  const lip = Math.min(1.6 * K, H * 0.1);
  const fy = look.pressed ? lip * 0.8 : 0;
  const fh = H - lip;
  const tip = look.hero ? Math.min(fh * 0.42, W * 0.12) : 0;
  const path = (inset: number): void => {
    const x0 = inset;
    const y0 = fy + inset;
    const x1 = W - inset;
    const y1 = fy + fh - inset;
    if (!look.hero) return rrPath(ctx, x0, y0, x1 - x0, y1 - y0, Math.min(K * 3.2, (y1 - y0) / 2));
    const ym = (y0 + y1) / 2;
    const k = tip;
    ctx.beginPath();
    ctx.moveTo(x0 + k, y0);
    ctx.lineTo(x1 - k, y0);
    ctx.lineTo(x1, ym);
    ctx.lineTo(x1 - k, y1);
    ctx.lineTo(x0 + k, y1);
    ctx.lineTo(x0, ym);
    ctx.closePath();
  };
  if (!look.pressed) {
    ctx.save();
    ctx.translate(0, lip);
    path(0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.restore();
  }
  const rim = K * 1.1;
  path(0);
  ctx.fillStyle = vgrad(ctx, fy, fy + fh, [[0, css(look.rimHi)], [1, css(look.rimLo)]]);
  ctx.fill();
  path(rim);
  ctx.fillStyle = vgrad(ctx, fy, fy + fh, [[0, css(look.hi)], [0.5, css(look.mid)], [1, css(look.lo)]]);
  ctx.fill();
  ctx.save();
  path(rim);
  ctx.clip();
  // stone grain
  for (let i = 0; i < Math.min(300, (W * H) / (70 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,230,190,0.05)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(rnd() * W, fy + rnd() * fh, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  if (look.brushed) {
    for (let i = 0; i < Math.round(fh / (0.9 * K)); i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(255,236,196,${0.04 + rnd() * 0.06})` : `rgba(40,24,8,${0.05 + rnd() * 0.07})`;
      ctx.fillRect(rnd() * W * 0.5, fy + rnd() * fh, W * (0.3 + rnd() * 0.7), Math.max(1, 0.35 * K));
    }
  }
  if (look.gloss) {
    ctx.fillStyle = vgrad(ctx, fy, fy + fh * 0.55, [[0, 'rgba(255,235,215,0.30)'], [1, 'rgba(255,235,215,0)']]);
    ctx.fillRect(0, fy, W, fh * 0.55);
    ctx.fillStyle = vgrad(ctx, fy + fh * 0.6, fy + fh, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(30,6,2,0.3)']]);
    ctx.fillRect(0, fy + fh * 0.6, W, fh * 0.4);
  }
  ctx.restore();
  // dark ring and a lit top edge
  path(rim);
  ctx.lineWidth = Math.max(1, K * 0.5);
  ctx.strokeStyle = 'rgba(30,10,4,0.55)';
  ctx.stroke();
  if (!look.pressed) {
    ctx.save();
    path(rim * 1.6);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,240,220,0.35)';
    ctx.fillRect(0, fy + rim * 1.4, W, Math.max(1, K * 0.5));
    ctx.restore();
  }
  if (look.hero) {
    // a gold-rimmed diamond at each pointed end
    const d = Math.min(fh * 0.3, K * 6);
    for (const cx of [tip * 0.62, W - tip * 0.62]) {
      const cy = fy + fh / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, cy - d, cy + d, [[0, css(M.terraHi)], [1, css(M.terraLo)]]);
      ctx.fill();
      ctx.lineWidth = Math.max(1, K * 0.9);
      ctx.strokeStyle = css(M.goldHi);
      ctx.stroke();
    }
  }
  return canvas;
}

function renderButtonOff(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'btnStone');
  rrPath(ctx, 0, 0, W, H - K * 0.6, Math.min(K * 3.2, H / 2));
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.offHi)], [1, css(M.off)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < Math.min(240, (W * H) / (80 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  ctx.restore();
  rrPath(ctx, K * 0.5, K * 0.5, W - K, H - K * 1.6, Math.min(K * 2.8, H / 2));
  ctx.lineWidth = Math.max(1, K * 0.8);
  ctx.strokeStyle = 'rgba(30,26,22,0.7)';
  ctx.stroke();
  return canvas;
}

// ================================================================== tiles

interface TileLook {
  hi: number;
  mid: number;
  lo: number;
  edge: number;
}
const TILE: Record<string, TileLook> = {
  tileStone: { hi: 0x8a8378, mid: 0x6c665d, lo: 0x4e4943, edge: 0xc9c2b4 },
  tileTerra: { hi: M.terraHi, mid: M.terra, lo: M.terraLo, edge: 0xe9a98e },
  tileGlaze: { hi: M.tealHi, mid: M.teal, lo: M.tealLo, edge: 0x8ec9c0 },
  tileBronze: { hi: 0x8f6c3c, mid: 0x6e5129, lo: 0x4a3419, edge: 0xc9a066 },
  tileOff: { hi: M.offHi, mid: M.off, lo: M.slabLo, edge: 0x8f8a83 },
};

function renderTile(w: number, h: number, K: number, style: string): HTMLCanvasElement {
  const look = TILE[style];
  const off = style === 'tileOff';
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, style);
  const lip = K * 1.4;
  const fh = H - lip;
  const r = K * 3.2;
  rrPath(ctx, 0, lip, W, fh, r);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  rrPath(ctx, 0, 0, W, fh, r);
  ctx.fillStyle = vgrad(ctx, 0, fh, [[0, css(look.hi)], [0.5, css(look.mid)], [1, css(look.lo)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // cloudy mottle
  for (let i = 0; i < (off ? 3 : 9); i++) {
    const cx = rnd() * W;
    const cy = rnd() * fh;
    const rad = (8 + rnd() * 20) * K;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, rnd() < 0.45 ? 'rgba(255,236,200,0.09)' : 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < Math.min(500, (W * fh) / (40 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,240,215,0.07)' : 'rgba(0,0,0,0.13)';
    ctx.fillRect(rnd() * W, rnd() * fh, K * (0.5 + rnd() * 0.8), K * (0.5 + rnd() * 0.8));
  }
  if (!off) {
    // chipped, lit rim along the top-left and a shaded bottom-right
    ctx.lineWidth = K * 1.6;
    ctx.strokeStyle = css(look.edge, 0.55);
    ctx.beginPath();
    ctx.moveTo(0, fh - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.lineTo(W - r, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.moveTo(W, r);
    ctx.lineTo(W, fh - r);
    ctx.quadraticCurveTo(W, fh, W - r, fh);
    ctx.lineTo(r, fh);
    ctx.stroke();
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = css(look.edge, 0.3 + rnd() * 0.3);
      const onTop = rnd() < 0.5;
      ctx.fillRect(onTop ? rnd() * W * 0.9 : 0, onTop ? 0 : rnd() * fh * 0.9, onTop ? K * (1 + rnd() * 3) : K * 1.4, onTop ? K * 1.4 : K * (1 + rnd() * 3));
    }
  }
  ctx.restore();
  rrPath(ctx, K * 0.4, K * 0.4, W - K * 0.8, fh - K * 0.8, r);
  ctx.lineWidth = Math.max(1, K * 0.8);
  ctx.strokeStyle = 'rgba(14,10,6,0.75)';
  ctx.stroke();
  // inner engraved line
  rrPath(ctx, K * 2.2, K * 2.2, W - K * 4.4, fh - K * 4.4, r * 0.6);
  ctx.lineWidth = Math.max(1, K * 0.4);
  ctx.strokeStyle = off ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.28)';
  ctx.stroke();
  return canvas;
}

// ================================================================== fresco frame, tracks, segments

function renderFresco(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const T = FRESCO_T * K;
  const rnd = seeded(w, h, 'fresco');
  rrPath(ctx, 0, 0, W, H, K * 1.2);
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(0x5a4326)], [0.5, css(0x3b2a15)], [1, css(0x2a1c0e)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < Math.min(300, (W * H) / (50 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,220,160,0.07)' : 'rgba(0,0,0,0.2)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  // brushed bands
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,220,160,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (3 + rnd() * 18), Math.max(1, K * 0.4));
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,224,170,0.3)';
  ctx.lineWidth = Math.max(1, K * 0.6);
  rrPath(ctx, K * 0.4, K * 0.4, W - K * 0.8, H - K * 0.8, K);
  ctx.stroke();
  // rivets along the band
  const step = K * 14;
  const rv = K * 0.9;
  const dot = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x + K * 0.25, y + K * 0.35, rv, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    const g = ctx.createRadialGradient(x - rv * 0.4, y - rv * 0.4, 0, x, y, rv);
    g.addColorStop(0, '#f4dcaa');
    g.addColorStop(0.6, css(M.bronzeHi));
    g.addColorStop(1, css(M.bronzeLo));
    ctx.beginPath();
    ctx.arc(x, y, rv, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  };
  const nx = Math.max(2, Math.round((W - T * 2) / step));
  for (let i = 0; i <= nx; i++) {
    const x = T / 2 + (i / nx) * (W - T);
    dot(x, T / 2);
    dot(x, H - T / 2);
  }
  const ny = Math.max(1, Math.round((H - T * 2) / step));
  for (let i = 1; i < ny; i++) {
    const y = T / 2 + (i / ny) * (H - T);
    dot(T / 2, y);
    dot(W - T / 2, y);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  rrPath(ctx, T, T, W - T * 2, H - T * 2, K * 0.4);
  ctx.fill();
  ctx.restore();
  // inner shadow on the opening
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = Math.max(1, K * 0.9);
  rrPath(ctx, T, T, W - T * 2, H - T * 2, K * 0.4);
  ctx.stroke();
  ctx.restore();
  return canvas;
}

/** The dark stone track of the segmented switch (selected segment: parchment with a bronze rim). */
function renderTrack(w: number, h: number, K: number, sel: boolean): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, sel ? 'trackSel' : 'track');
  const r = K * 2.6;
  rrPath(ctx, 0, 0, W, H, r);
  if (sel) {
    ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.parchHi)], [1, css(M.parch)]]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let i = 0; i < Math.min(160, (W * H) / (90 * K * K)); i++) {
      ctx.fillStyle = rnd() < 0.6 ? 'rgba(120,80,36,0.07)' : 'rgba(255,250,230,0.18)';
      ctx.fillRect(rnd() * W, rnd() * H, K * (1 + rnd() * 4), Math.max(1, K * 0.35));
    }
    ctx.restore();
    rrPath(ctx, K * 0.6, K * 0.6, W - K * 1.2, H - K * 1.2, r);
    ctx.lineWidth = Math.max(1, K * 1.2);
    ctx.strokeStyle = css(M.bronze);
    ctx.stroke();
    return canvas;
  }
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.stone2)], [1, css(M.stone1)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < Math.min(240, (W * H) / (60 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,230,190,0.05)' : 'rgba(0,0,0,0.2)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  ctx.fillStyle = vgrad(ctx, 0, K * 4, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, K * 4);
  ctx.restore();
  rrPath(ctx, K * 0.4, K * 0.4, W - K * 0.8, H - K * 0.8, r);
  ctx.lineWidth = Math.max(1, K * 0.8);
  ctx.strokeStyle = css(M.meanderLo);
  ctx.stroke();
  return canvas;
}

function renderSegment(w: number, h: number, K: number, done: boolean): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const r = K * 1.4;
  rrPath(ctx, 0, 0, W, H, r);
  if (done) {
    ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(0xffe08a)], [0.5, css(M.segDone)], [1, css(0xb77f1e)]]);
    ctx.fill();
    ctx.lineWidth = Math.max(1, K * 0.7);
    ctx.strokeStyle = css(0x7a4f10);
    rrPath(ctx, K * 0.35, K * 0.35, W - K * 0.7, H - K * 0.7, r);
    ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 0, H * 0.5, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    rrPath(ctx, K, K, W - K * 2, H * 0.45, r);
    ctx.fill();
  } else {
    ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(0x3a2c1d)], [1, css(M.segOpen)]]);
    ctx.fill();
    ctx.lineWidth = Math.max(1, K * 0.7);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    rrPath(ctx, K * 0.35, K * 0.35, W - K * 0.7, H - K * 0.7, r);
    ctx.stroke();
  }
  return canvas;
}

function renderQuestTrack(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  rrPath(ctx, 0, 0, W, H, K * 2);
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(0x2a1e12)], [1, css(0x3b2b1a)]]);
  ctx.fill();
  rrPath(ctx, K * 0.4, K * 0.4, W - K * 0.8, H - K * 0.8, K * 2);
  ctx.lineWidth = Math.max(1, K * 0.9);
  ctx.strokeStyle = css(M.bronze);
  ctx.stroke();
  return canvas;
}

// ================================================================== tab bar, medallion

function renderTabBar(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'tabBar');
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(0x1d414a)], [1, css(M.tabBar)]]);
  ctx.fillRect(0, 0, W, H);
  // cut stone blocks
  const bh = K * 13;
  let row = 0;
  for (let y = K * 3; y < H; y += bh, row++) {
    let x = row % 2 ? -K * 14 : 0;
    while (x < W) {
      const bw = K * (22 + rnd() * 26);
      ctx.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.03})` : `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, y, bw, Math.max(1, K * 0.5));
      ctx.fillRect(x, y, Math.max(1, K * 0.5), bh);
      ctx.fillStyle = 'rgba(160,220,215,0.06)';
      ctx.fillRect(x + K * 0.5, y + K * 0.5, bw - K * 0.5, Math.max(1, K * 0.4));
      x += bw;
    }
  }
  for (let i = 0; i < Math.min(900, (W * H) / (50 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(180,230,225,0.05)' : 'rgba(0,0,0,0.16)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  // gold top rim
  ctx.fillStyle = vgrad(ctx, 0, K * 2.2, [[0, css(M.goldHi)], [0.5, css(M.meander)], [1, css(M.meanderLo)]]);
  ctx.fillRect(0, 0, W, K * 1.8);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, K * 1.8, W, K * 0.8);
  return canvas;
}

/** The selected tab: a block of parchment with a lit centre. */
function renderTabSel(w: number, h: number, K: number): HTMLCanvasElement {
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'tabSel');
  wobblyPath(ctx, W, H + K * 4, K * 1.4, K * 0.6, K * 6, rnd);
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.parchLo)], [0.5, css(M.parchHi)], [1, css(M.parch)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.6);
  g.addColorStop(0, 'rgba(255,248,220,0.55)');
  g.addColorStop(1, 'rgba(255,248,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < Math.min(260, (W * H) / (70 * K * K)); i++) {
    ctx.strokeStyle = rnd() < 0.6 ? `rgba(120,80,36,${0.05 + rnd() * 0.06})` : 'rgba(255,250,230,0.15)';
    ctx.lineWidth = Math.max(1, K * 0.35);
    const x = rnd() * W;
    const y = rnd() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * K * 8, y + (rnd() - 0.5) * K * 3);
    ctx.stroke();
  }
  ctx.restore();
  wobblyPath(ctx, W, H + K * 4, K * 1.4, K * 0.6, K * 6, seeded(w, h, 'tabSel'));
  ctx.lineWidth = Math.max(1, K * 0.8);
  ctx.strokeStyle = css(M.parchEdge, 0.8);
  ctx.stroke();
  return canvas;
}

/** The round bronze shield of the War tab (`d` UI px across, plus a glow margin when lit). */
function renderMedallion(size: number, K: number, lit: boolean): HTMLCanvasElement {
  const { canvas, ctx } = make(size * K, size * K);
  const W = canvas.width;
  const margin = lit ? size * MEDALLION_GLOW * K : size * 0.04 * K;
  const c = W / 2;
  const r = c - margin;
  if (lit) {
    const g = ctx.createRadialGradient(c, c, r * 0.85, c, c, c);
    g.addColorStop(0, 'rgba(255,210,120,0.75)');
    g.addColorStop(0.5, 'rgba(255,190,90,0.28)');
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
  }
  ctx.beginPath();
  ctx.arc(c + K * 0.4, c + K * 1.4, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  const rim = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
  rim.addColorStop(0, '#e9b684');
  rim.addColorStop(0.45, '#b56f3f');
  rim.addColorStop(1, '#5e3319');
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.lineWidth = Math.max(1, K * 0.6);
  ctx.strokeStyle = 'rgba(30,14,4,0.8)';
  ctx.stroke();
  // rivets on the rim
  const rn = 16;
  for (let i = 0; i < rn; i++) {
    const a = (i / rn) * Math.PI * 2;
    const px = c + Math.cos(a) * r * 0.9;
    const py = c + Math.sin(a) * r * 0.9;
    const rv = Math.max(K * 0.8, r * 0.03);
    const g = ctx.createRadialGradient(px - rv * 0.3, py - rv * 0.3, 0, px, py, rv);
    g.addColorStop(0, '#ffe2b4');
    g.addColorStop(1, '#6a3c1c');
    ctx.beginPath();
    ctx.arc(px, py, rv, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
  // the dished face
  const fr = r * 0.8;
  const face = ctx.createRadialGradient(c - fr * 0.3, c - fr * 0.35, fr * 0.05, c, c, fr);
  face.addColorStop(0, '#e0a272');
  face.addColorStop(0.6, '#b46c3e');
  face.addColorStop(1, '#8a4c28');
  ctx.beginPath();
  ctx.arc(c, c, fr, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = Math.max(1, K * 0.7);
  ctx.strokeStyle = 'rgba(60,28,10,0.7)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, fr * 0.56, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,214,170,0.45)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, fr * 0.57 + K * 0.8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(60,28,10,0.45)';
  ctx.stroke();
  // the boss
  const br = fr * 0.3;
  const boss = ctx.createRadialGradient(c - br * 0.35, c - br * 0.4, 0, c, c, br);
  boss.addColorStop(0, '#ffe4bc');
  boss.addColorStop(0.5, '#c88150');
  boss.addColorStop(1, '#6e3a1c');
  ctx.beginPath();
  ctx.arc(c, c, br, 0, Math.PI * 2);
  ctx.fillStyle = boss;
  ctx.fill();
  ctx.lineWidth = Math.max(1, K * 0.5);
  ctx.strokeStyle = 'rgba(50,22,8,0.7)';
  ctx.stroke();
  // sheen
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  const sh = ctx.createLinearGradient(c - r, c - r, c + r * 0.2, c + r * 0.2);
  sh.addColorStop(0, 'rgba(255,240,210,0.38)');
  sh.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, W);
  ctx.restore();
  return canvas;
}

// ================================================================== chips, sheet

function renderChip(w: number, h: number, K: number, parch: boolean): HTMLCanvasElement {
  if (parch) return renderParchment(w, h, K, 'chipParch', {});
  const { canvas, ctx } = make(w * K, h * K);
  const W = canvas.width;
  const H = canvas.height;
  const rnd = seeded(w, h, 'chipStone');
  const lip = K * 1;
  const r = Math.min(K * 3, H / 2);
  rrPath(ctx, 0, lip, W, H - lip, r);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  rrPath(ctx, 0, 0, W, H - lip, r);
  ctx.fillStyle = vgrad(ctx, 0, H, [[0, css(M.stone3)], [1, css(M.stone1)]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < Math.min(160, (W * H) / (60 * K * K)); i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,230,190,0.06)' : 'rgba(0,0,0,0.2)';
    ctx.fillRect(rnd() * W, rnd() * H, K * (0.5 + rnd()), K * (0.5 + rnd()));
  }
  ctx.fillStyle = 'rgba(255,230,190,0.16)';
  ctx.fillRect(0, 0, W, Math.max(1, K * 0.6));
  ctx.restore();
  rrPath(ctx, K * 0.4, K * 0.4, W - K * 0.8, H - lip - K * 0.8, r);
  ctx.lineWidth = Math.max(1, K * 0.7);
  ctx.strokeStyle = css(M.meanderLo);
  ctx.stroke();
  return canvas;
}

/** Draw one surface: `w` x `h` UI px at `K` atlas px per UI px. */
export function renderMosaic(style: MosaicStyle, w: number, h: number, K: number): HTMLCanvasElement {
  switch (style) {
    case 'page': return renderPage(w, h, K);
    case 'topBar': return renderTopBar(w, h, K);
    case 'frame': return renderFrame(w, h, K);
    case 'paper': return renderParchment(w, h, K, style, { flat: true });
    case 'parchment': return renderParchment(w, h, K, style, {});
    case 'parchmentSel': return renderParchment(w, h, K, style, { sel: true });
    case 'parchmentWell': return renderParchment(w, h, K, style, { well: true });
    case 'sheet': return renderParchment(w, h, K, style, { sheet: true });
    case 'plaque': return renderPlaque(w, h, K);
    case 'btnPrimary': case 'btnPrimaryDown': case 'btnHero': case 'btnHeroDown':
    case 'btnBronze': case 'btnBronzeDown': case 'btnNeutral': case 'btnNeutralDown': case 'btnBuy': case 'btnBuyDown':
      return renderButton(w, h, K, style);
    case 'btnStone': return renderButtonOff(w, h, K);
    case 'tileStone': case 'tileTerra': case 'tileGlaze': case 'tileBronze': case 'tileOff':
      return renderTile(w, h, K, style);
    case 'fresco': return renderFresco(w, h, K);
    case 'track': return renderTrack(w, h, K, false);
    case 'trackSel': return renderTrack(w, h, K, true);
    case 'segDone': return renderSegment(w, h, K, true);
    case 'segOpen': return renderSegment(w, h, K, false);
    case 'questTrack': return renderQuestTrack(w, h, K);
    case 'tabBar': return renderTabBar(w, h, K);
    case 'tabSel': return renderTabSel(w, h, K);
    case 'medallion': return renderMedallion(Math.min(w, h), K, false);
    case 'medallionSel': return renderMedallion(Math.min(w, h), K, true);
    case 'chipParch': return renderChip(w, h, K, true);
    case 'chipStone': return renderChip(w, h, K, false);
  }
}
