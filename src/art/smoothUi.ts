/**
 * "Bronze & Stone" UI surfaces: smooth panels and buttons drawn with Canvas
 * 2D at the screen's density (K atlas px per UI px), replacing the dithered
 * parchment of uiTextures.ts renderPanel for every kit style. Colours and
 * bevels follow the D2 mock (docs/UI_KIT.md "Surfaces"): charcoal stone panels with a
 * fine bronze rim, bevelled bronze buttons, one terracotta primary action, a
 * lit bronze "selected" state.
 */
import type { PanelStyle } from './uiTextures';

/**
 * v3 materials (docs/UI_KIT.md "Surfaces"): riveted bronze-stone cards, sunken wells, the
 * segmented control's track and thumb, the real-money purchase button (its own
 * blue), the ghost button, and the neutral locked card.
 */
export type V3Style = 'card' | 'cardRaised' | 'cardSel' | 'cardLocked' | 'well' | 'track' | 'thumb' | 'buttonBuy' | 'buttonBuyDown' | 'buttonGhost' | 'buttonGhostDown' | 'chip' | 'header' | 'bar' | 'stage';
export type SmoothStyle = PanelStyle | 'buttonOn' | 'buttonOnDown' | V3Style;

export const STONE = { s0: 0x120e0b, s1: 0x1a1511, s2: 0x241d17, s3: 0x2f261e, s4: 0x3b3027 } as const;
export const BRONZE_D2 = { hi: 0xe2c48c, main: 0xb48a52, mid: 0x8c6a3c, lo: 0x5c4325, dk: 0x3a2915 } as const;
export const TEXT_D2 = { tx: 0xf1e8d8, tx2: 0xc2b49c, tx3: 0x8f826d, onBtn: 0xfbf1dd } as const;
export const TERRA = { hi: 0xc2563a, main: 0xa3402a, lo: 0x76291a } as const;
export const STATUS_D2 = { hp: 0xb4483a, morale: 0x7a93a6, good: 0xa8bf7a, gold: 0xd8b36a } as const;

type Stops = [number, string][];
interface Look {
  fill: Stops;
  border: string;
  /** Inner ring just inside the border. */
  ring?: string;
  /** 1 px highlight along the top edge. */
  top?: string;
  /** Raised: a dark lip under the face (pressed styles drop onto it). */
  lip?: boolean;
  pressed?: boolean;
  radius: number;
  borderW?: number;
  /** Bronze rivets in the corners (cards big enough to carry them). */
  rivets?: boolean;
  /** A faint hammered grain over the face. */
  grain?: boolean;
  /** An inner shadow along the top edge (sunken wells). */
  sunken?: boolean;
  // ---- iteration 2 materials (docs/UI_ITERATION_2.md "Game feel")
  /** Low-frequency stone mottling (cloudy light and dark patches), alpha. */
  mottle?: number;
  /** A bevel: light along the top-left inner edge, shade along the bottom-right (strength 0..1). */
  bevel?: number;
  /** Brushed metal: fine horizontal streaks (bronze buttons). */
  brushed?: boolean;
  /** Lacquer: a glossy sheen across the top and a soft specular spot (the primary shield). */
  gloss?: boolean;
  /** Wood planks with grain (the header band). */
  planks?: boolean;
  /** A Greek-key (meander) trim along the bottom edge (`meanderTop`: along the top). */
  meander?: boolean;
  meanderTop?: boolean;
  /** Patina: small verdigris flecks (aged bronze). */
  patina?: boolean;
}

const BTN_R = 7;
const LOOKS: Record<SmoothStyle, Look> = {
  parch: { fill: [[0, '#2f261e'], [0.4, '#241d17'], [1, '#1a1511']], border: '#8c6a3c', ring: 'rgba(0,0,0,0.55)', top: 'rgba(255,235,200,0.08)', radius: 8, mottle: 0.07, bevel: 0.6, grain: true },
  scroll: { fill: [[0, '#2f261e'], [0.4, '#241d17'], [1, '#1a1511']], border: '#8c6a3c', ring: 'rgba(0,0,0,0.55)', top: 'rgba(255,235,200,0.08)', radius: 8, mottle: 0.07, bevel: 0.6, grain: true },
  dark: { fill: [[0, '#1a1511'], [1, '#120e0b']], border: '#5c4325', ring: 'rgba(0,0,0,0.5)', radius: 8 },
  tooltip: { fill: [[0, 'rgba(26,21,17,0.97)'], [1, 'rgba(18,14,11,0.97)']], border: '#b48a52', top: 'rgba(255,235,200,0.08)', radius: 8 },
  inset: { fill: [[0, '#120e0b'], [1, '#17120e']], border: 'rgba(180,138,82,0.35)', radius: 6 },
  slot: { fill: [[0, '#120e0b'], [1, '#1a1511']], border: 'rgba(180,138,82,0.45)', radius: 6 },
  slotSel: { fill: [[0, '#2a2118'], [1, '#1f1812']], border: '#e2c48c', borderW: 1.5, radius: 6 },
  tab: { fill: [[0, '#1d1713'], [1, '#17120e']], border: 'rgba(180,138,82,0.3)', radius: 6 },
  tabSel: { fill: [[0, '#a7834f'], [0.55, '#7d5f36'], [1, '#634a29']], border: '#e2c48c', top: 'rgba(255,236,196,0.6)', radius: 6 },
  button: { fill: [[0, '#8a6a40'], [0.45, '#6c5031'], [1, '#503a21']], border: '#2a1d0e', ring: 'rgba(226,196,140,0.22)', top: 'rgba(255,228,178,0.45)', lip: true, radius: BTN_R, brushed: true, bevel: 0.8, patina: true },
  buttonDown: { fill: [[0, '#6c5031'], [1, '#4a361f']], border: '#2a1d0e', ring: 'rgba(226,196,140,0.18)', lip: true, pressed: true, radius: BTN_R, brushed: true, bevel: -0.6 },
  // the one primary action: a lacquered terracotta shield face in a bronze rim
  buttonSel: { fill: [[0, '#d0603f'], [0.48, '#a3402a'], [1, '#6e2516']], border: '#2a0f08', ring: 'rgba(240,206,146,0.75)', top: 'rgba(255,214,186,0.5)', lip: true, radius: BTN_R, gloss: true, bevel: 0.7 },
  buttonSelDown: { fill: [[0, '#a3402a'], [1, '#6a2416']], border: '#2a0f08', ring: 'rgba(226,196,140,0.6)', lip: true, pressed: true, radius: BTN_R, gloss: true, bevel: -0.6 },
  buttonOn: { fill: [[0, '#a7834f'], [0.55, '#7d5f36'], [1, '#634a29']], border: '#e2c48c', ring: 'rgba(242,214,160,0.55)', top: 'rgba(255,236,196,0.6)', lip: true, radius: BTN_R, brushed: true, bevel: 0.8 },
  buttonOnDown: { fill: [[0, '#7d5f36'], [1, '#5a4225']], border: '#e2c48c', ring: 'rgba(242,214,160,0.45)', lip: true, pressed: true, radius: BTN_R, brushed: true, bevel: -0.6 },
  buttonDanger: { fill: [[0, '#3d332a'], [1, '#2b231c']], border: '#1a120c', ring: 'rgba(180,138,82,0.35)', top: 'rgba(255,235,200,0.1)', lip: true, radius: BTN_R, mottle: 0.08, bevel: 0.6 },
  buttonDangerDown: { fill: [[0, '#2b231c'], [1, '#221b15']], border: '#1a120c', ring: 'rgba(180,138,82,0.3)', lip: true, pressed: true, radius: BTN_R },
  buttonOff: { fill: [[0, '#2b241e'], [1, '#221c17']], border: '#1a140f', ring: 'rgba(143,130,109,0.22)', radius: BTN_R },
  // ---- v3
  card: { fill: [[0, '#2c231b'], [0.5, '#241c15'], [1, '#1c1611']], border: '#6e5230', ring: 'rgba(0,0,0,0.5)', top: 'rgba(255,228,178,0.12)', radius: 8, rivets: true, grain: true, mottle: 0.09, bevel: 0.7 },
  cardRaised: { fill: [[0, '#3a2e22'], [0.5, '#2e241b'], [1, '#231b14']], border: '#a07a46', ring: 'rgba(0,0,0,0.5)', top: 'rgba(255,228,178,0.18)', radius: 8, rivets: true, grain: true, mottle: 0.1, bevel: 0.9 },
  cardSel: { fill: [[0, '#3d2f20'], [0.5, '#30251a'], [1, '#251c13']], border: '#e2c48c', borderW: 1.5, ring: 'rgba(226,196,140,0.25)', top: 'rgba(255,236,196,0.22)', radius: 8, rivets: true, grain: true, mottle: 0.1, bevel: 0.9 },
  cardLocked: { fill: [[0, '#1d1814'], [1, '#17130f']], border: 'rgba(143,130,109,0.35)', radius: 8, mottle: 0.06, grain: true },
  well: { fill: [[0, '#0b0907'], [1, '#14100c']], border: 'rgba(140,106,60,0.35)', radius: 6, sunken: true, bevel: -0.7 },
  track: { fill: [[0, '#0d0a08'], [1, '#16120e']], border: 'rgba(140,106,60,0.5)', radius: 8, sunken: true },
  thumb: { fill: [[0, '#c29a5c'], [0.5, '#93703f'], [1, '#6e522c']], border: '#f0d49c', ring: 'rgba(255,240,205,0.35)', top: 'rgba(255,244,214,0.7)', lip: true, radius: 7, brushed: true, bevel: 0.8 },
  buttonBuy: { fill: [[0, '#2f8cc8'], [0.5, '#1b6fa3'], [1, '#124c70']], border: '#0a2436', ring: 'rgba(200,232,255,0.45)', top: 'rgba(220,240,255,0.55)', lip: true, radius: BTN_R, gloss: true, bevel: 0.6 },
  buttonBuyDown: { fill: [[0, '#1b6fa3'], [1, '#0f4262']], border: '#0a2436', ring: 'rgba(200,232,255,0.35)', lip: true, pressed: true, radius: BTN_R },
  buttonGhost: { fill: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']], border: 'rgba(180,138,82,0.55)', radius: BTN_R },
  buttonGhostDown: { fill: [[0, 'rgba(180,138,82,0.18)'], [1, 'rgba(180,138,82,0.12)']], border: 'rgba(226,196,140,0.8)', radius: BTN_R },
  chip: { fill: [[0, '#120e0b'], [1, '#1a1511']], border: 'rgba(180,138,82,0.55)', radius: 6 },
  header: { fill: [[0, '#2e2318'], [1, '#1d1610']], border: 'rgba(0,0,0,0)', top: 'rgba(255,228,178,0.14)', radius: 0, planks: true, meander: true },
  // the bottom command strip: the same planks, the key trim along its top edge
  bar: { fill: [[0, '#2a2016'], [1, '#1a140f']], border: 'rgba(0,0,0,0)', top: 'rgba(255,228,178,0.10)', radius: 0, planks: true, meanderTop: true },
  // the hero's stage band (no trim: the stage art carries it)
  stage: { fill: [[0, '#2e2318'], [1, '#1d1610']], border: 'rgba(0,0,0,0)', top: 'rgba(255,228,178,0.10)', radius: 0, planks: true },
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * A w x h (UI px) surface at K atlas px per UI px; `css` = atlas px per CSS
 * px (borders and radii are specified in CSS px, like the mock).
 */
export function renderSmoothPanel(w: number, h: number, style: SmoothStyle, K: number, css: number): HTMLCanvasElement {
  const look = LOOKS[style] ?? LOOKS.parch;
  const W = Math.max(2, Math.round(w * K));
  const H = Math.max(2, Math.round(h * K));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bw = (look.borderW ?? 1) * css;
  const lip = look.lip ? Math.min(2 * css, H * 0.12) : 0;
  const r = Math.min(look.radius * css, W / 2, (H - lip) / 2);
  // face: raised faces sit on their lip; pressed ones sink onto it
  const fy = look.pressed ? lip : 0;
  const fh = H - lip;
  if (lip > 0) {
    roundRect(ctx, 0, lip, W, H - lip, r);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
  }
  roundRect(ctx, bw / 2, fy + bw / 2, W - bw, fh - bw, r);
  const g = ctx.createLinearGradient(0, fy, 0, fy + fh);
  for (const [at, c] of look.fill) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = bw;
  ctx.strokeStyle = look.border;
  ctx.stroke();
  // iteration 2 materials, clipped to the face (deterministic per size: the same panel always looks the same)
  let seed = (W * 73856093) ^ (H * 19349663) ^ style.length * 83492791;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const face = () => roundRect(ctx, bw, fy + bw, W - bw * 2, fh - bw * 2, Math.max(0, r - bw));
  if (look.planks) {
    ctx.save();
    face();
    ctx.clip();
    // boards: a seam every ~9 UI px, each board a touch lighter or darker, with long grain lines
    const pw = 9 * css * (K / css);
    for (let y0 = fy, i = 0; y0 < fy + fh; y0 += pw, i++) {
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,220,170,0.035)';
      ctx.fillRect(0, y0, W, pw);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, y0, W, Math.max(1, 0.5 * css));
      for (let k = 0; k < 4; k++) {
        const gy = y0 + rnd() * pw;
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,220,170'},${0.04 + rnd() * 0.05})`;
        ctx.fillRect(rnd() * W * 0.3, gy, W * (0.4 + rnd() * 0.6), Math.max(1, 0.4 * css));
      }
    }
    ctx.restore();
  }
  if (look.mottle) {
    ctx.save();
    face();
    ctx.clip();
    // cloudy stone: big soft patches, light and dark
    const n = Math.max(4, Math.min(28, Math.round((W * H) / (2600 * css * css))));
    for (let i = 0; i < n; i++) {
      const cx = rnd() * W;
      const cy = fy + rnd() * fh;
      const rad = (10 + rnd() * 26) * css;
      const lightP = rnd() < 0.45;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, lightP ? `rgba(255,226,180,${look.mottle * 0.7})` : `rgba(0,0,0,${look.mottle * 1.6})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }
  if (look.brushed) {
    ctx.save();
    face();
    ctx.clip();
    const n = Math.round(fh / (0.9 * css));
    for (let i = 0; i < n; i++) {
      const yy = fy + rnd() * fh;
      ctx.fillStyle = rnd() < 0.5 ? `rgba(255,236,196,${0.04 + rnd() * 0.06})` : `rgba(40,24,8,${0.05 + rnd() * 0.07})`;
      ctx.fillRect(rnd() * W * 0.5, yy, W * (0.3 + rnd() * 0.7), Math.max(1, 0.35 * css));
    }
    ctx.restore();
  }
  if (look.patina && W > 30 * css) {
    ctx.save();
    face();
    ctx.clip();
    const n = Math.round(W / (14 * css));
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(92,150,120,${0.10 + rnd() * 0.12})`;
      const ps = css * (0.6 + rnd() * 1.1);
      ctx.beginPath();
      ctx.arc(rnd() < 0.5 ? rnd() * 6 * css + 2 * css : W - rnd() * 6 * css - 2 * css, fy + fh * (0.55 + rnd() * 0.4), ps, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (look.gloss) {
    ctx.save();
    face();
    ctx.clip();
    // lacquer: a bright band over the top half that fades, and a soft hot spot top-left
    const gl = ctx.createLinearGradient(0, fy, 0, fy + fh * 0.55);
    gl.addColorStop(0, 'rgba(255,235,215,0.34)');
    gl.addColorStop(0.55, 'rgba(255,235,215,0.10)');
    gl.addColorStop(1, 'rgba(255,235,215,0)');
    ctx.fillStyle = gl;
    roundRect(ctx, bw * 2, fy + bw * 2, W - bw * 4, fh * 0.5, Math.max(0, r - bw * 2));
    ctx.fill();
    const sx = W * 0.22;
    const sy = fy + fh * 0.22;
    const sp = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.min(W, fh) * 0.7);
    sp.addColorStop(0, 'rgba(255,248,236,0.22)');
    sp.addColorStop(1, 'rgba(255,248,236,0)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, fy, W, fh);
    // the bottom of the face darkens: a convex shield
    const sh = ctx.createLinearGradient(0, fy + fh * 0.6, 0, fy + fh);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(30,6,2,0.28)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, fy + fh * 0.6, W, fh * 0.4);
    ctx.restore();
  }
  if (look.bevel) {
    // light from the top left: a highlight edge there, shade bottom right (negative: sunken, the other way round)
    const k = look.bevel;
    const hiA = Math.abs(k) * 0.28;
    const loA = Math.abs(k) * 0.42;
    const hi = `rgba(255,236,200,${hiA})`;
    const lo = `rgba(0,0,0,${loA})`;
    const inset = bw * 1.5 + 0.5 * css;
    const lw = Math.max(1, 0.8 * css);
    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    const rr2 = Math.max(0, r - inset);
    const x0 = inset;
    const y0 = fy + inset;
    const x1 = W - inset;
    const y1 = fy + fh - inset;
    ctx.strokeStyle = k > 0 ? hi : lo;
    ctx.beginPath();
    ctx.moveTo(x0, y1 - rr2);
    ctx.lineTo(x0, y0 + rr2);
    ctx.arcTo(x0, y0, x0 + rr2, y0, rr2);
    ctx.lineTo(x1 - rr2, y0);
    ctx.stroke();
    ctx.strokeStyle = k > 0 ? lo : hi;
    ctx.beginPath();
    ctx.moveTo(x1, y0 + rr2);
    ctx.lineTo(x1, y1 - rr2);
    ctx.arcTo(x1, y1, x1 - rr2, y1, rr2);
    ctx.lineTo(x0 + rr2, y1);
    ctx.stroke();
    ctx.restore();
  }
  if ((look.meander || look.meanderTop) && fh > 12 * css) {
    // a Greek-key trim in bronze along the bottom (or top) edge of the band
    const u = 1.2 * css;
    const by = look.meanderTop ? fy + 2 * u : fy + fh - 5 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, by - u, W, 6 * u);
    ctx.strokeStyle = 'rgba(200,160,96,0.55)';
    ctx.lineWidth = Math.max(1, 0.55 * css);
    ctx.beginPath();
    for (let x = 0; x < W + 6 * u; x += 6 * u) {
      // one key: up, right, down, left, down... (a squared spiral)
      ctx.moveTo(x, by + 4 * u);
      ctx.lineTo(x, by);
      ctx.lineTo(x + 4 * u, by);
      ctx.lineTo(x + 4 * u, by + 3 * u);
      ctx.lineTo(x + 2 * u, by + 3 * u);
      ctx.lineTo(x + 2 * u, by + 1.5 * u);
      ctx.moveTo(x, by + 4 * u);
      ctx.lineTo(x + 6 * u, by + 4 * u);
    }
    ctx.stroke();
  }
  if (look.ring) {
    roundRect(ctx, bw * 1.5, fy + bw * 1.5, W - bw * 3, fh - bw * 3, Math.max(0, r - bw));
    ctx.lineWidth = css;
    ctx.strokeStyle = look.ring;
    ctx.stroke();
  }
  if (look.sunken) {
    ctx.save();
    roundRect(ctx, bw, fy + bw, W - bw * 2, fh - bw * 2, Math.max(0, r - bw));
    ctx.clip();
    const sh = ctx.createLinearGradient(0, fy, 0, fy + Math.min(fh, 4 * css));
    sh.addColorStop(0, 'rgba(0,0,0,0.65)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, fy, W, Math.min(fh, 4 * css));
    ctx.restore();
  }
  if (look.grain) {
    ctx.save();
    roundRect(ctx, bw, fy + bw, W - bw * 2, fh - bw * 2, Math.max(0, r - bw));
    ctx.clip();
    // deterministic speckle (same panel size, same grain)
    let seed = (W * 73856093) ^ (H * 19349663);
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const n = Math.min(400, Math.round((W * H) / (180 * css * css)));
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,230,190,0.035)' : 'rgba(0,0,0,0.08)';
      const s2 = css * (0.6 + rnd() * 0.9);
      ctx.fillRect(rnd() * W, fy + rnd() * fh, s2, s2);
    }
    ctx.restore();
  }
  if (look.rivets && W > 40 * css && fh > 22 * css) {
    const rr = 1.15 * css;
    const inset = 4.2 * css;
    for (const [px, py] of [[inset, fy + inset], [W - inset, fy + inset], [inset, fy + fh - inset], [W - inset, fy + fh - inset]]) {
      ctx.beginPath();
      ctx.arc(px + 0.3 * css, py + 0.4 * css, rr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();
      const g2 = ctx.createRadialGradient(px - rr * 0.4, py - rr * 0.4, 0, px, py, rr);
      g2.addColorStop(0, '#f4dcaa');
      g2.addColorStop(0.6, '#a87c44');
      g2.addColorStop(1, '#4e381e');
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fillStyle = g2;
      ctx.fill();
    }
  }
  if (look.top) {
    ctx.save();
    roundRect(ctx, bw, fy + bw, W - bw * 2, fh - bw * 2, Math.max(0, r - bw));
    ctx.clip();
    ctx.fillStyle = look.top;
    ctx.fillRect(0, fy + bw, W, css);
    ctx.restore();
  }
  return canvas;
}

export type MedallionState = 'idle' | 'ready' | 'cool';

/**
 * A round ability medallion: bronze ring round a dark face, `d` UI px across,
 * plus `halo` UI px of room for the ready glow on every side.
 */
export function renderMedallion(d: number, halo: number, state: MedallionState, K: number, css: number): HTMLCanvasElement {
  const size = Math.round((d + halo * 2) * K);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const r = (d / 2) * K;
  if (state === 'ready') {
    const g = ctx.createRadialGradient(c, c, r * 0.8, c, c, r + halo * K);
    g.addColorStop(0, 'rgba(240,201,119,0.55)');
    g.addColorStop(1, 'rgba(240,201,119,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // drop shadow, ring, face
  ctx.beginPath();
  ctx.arc(c, c + css, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  const ring = ctx.createLinearGradient(0, c - r, 0, c + r);
  ring.addColorStop(0, state === 'cool' ? '#7a6044' : '#e2c48c');
  ring.addColorStop(0.5, state === 'cool' ? '#5c4325' : '#b48a52');
  ring.addColorStop(1, state === 'cool' ? '#3a2915' : '#5c4325');
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  const face = ctx.createRadialGradient(c, c - r * 0.25, r * 0.1, c, c, r * 0.82);
  face.addColorStop(0, state === 'cool' ? '#241d17' : '#3a2f25');
  face.addColorStop(1, '#120e0b');
  ctx.beginPath();
  ctx.arc(c, c, r - 3 * css, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = css;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  return canvas;
}

/** A pie of the remaining cooldown (fraction f of a full turn, from 12 o'clock), dark over the face. */
export function renderSweep(d: number, f: number, K: number): HTMLCanvasElement {
  const size = Math.round(d * K);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.arc(c, c, c, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, f)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  return canvas;
}
