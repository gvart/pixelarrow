/**
 * "Bronze & Stone" UI surfaces: smooth panels and buttons drawn with Canvas
 * 2D at the screen's density (K atlas px per UI px), replacing the dithered
 * parchment of uiTextures.ts renderPanel for every kit style. Colours and
 * bevels follow the D2 mock (docs/UI_D2.md): charcoal stone panels with a
 * fine bronze rim, bevelled bronze buttons, one terracotta primary action, a
 * lit bronze "selected" state.
 */
import type { PanelStyle } from './uiTextures';

export type SmoothStyle = PanelStyle | 'buttonOn' | 'buttonOnDown';

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
}

const BTN_R = 7;
const LOOKS: Record<SmoothStyle, Look> = {
  parch: { fill: [[0, '#2f261e'], [0.4, '#241d17'], [1, '#1a1511']], border: '#8c6a3c', ring: 'rgba(0,0,0,0.55)', top: 'rgba(255,235,200,0.08)', radius: 8 },
  scroll: { fill: [[0, '#2f261e'], [0.4, '#241d17'], [1, '#1a1511']], border: '#8c6a3c', ring: 'rgba(0,0,0,0.55)', top: 'rgba(255,235,200,0.08)', radius: 8 },
  dark: { fill: [[0, '#1a1511'], [1, '#120e0b']], border: '#5c4325', ring: 'rgba(0,0,0,0.5)', radius: 8 },
  tooltip: { fill: [[0, 'rgba(26,21,17,0.97)'], [1, 'rgba(18,14,11,0.97)']], border: '#b48a52', top: 'rgba(255,235,200,0.08)', radius: 8 },
  inset: { fill: [[0, '#120e0b'], [1, '#17120e']], border: 'rgba(180,138,82,0.35)', radius: 6 },
  slot: { fill: [[0, '#120e0b'], [1, '#1a1511']], border: 'rgba(180,138,82,0.45)', radius: 6 },
  slotSel: { fill: [[0, '#2a2118'], [1, '#1f1812']], border: '#e2c48c', borderW: 1.5, radius: 6 },
  tab: { fill: [[0, '#1d1713'], [1, '#17120e']], border: 'rgba(180,138,82,0.3)', radius: 6 },
  tabSel: { fill: [[0, '#a7834f'], [0.55, '#7d5f36'], [1, '#634a29']], border: '#e2c48c', top: 'rgba(255,236,196,0.6)', radius: 6 },
  button: { fill: [[0, '#8a6a40'], [0.45, '#6c5031'], [1, '#503a21']], border: '#2a1d0e', ring: 'rgba(226,196,140,0.22)', top: 'rgba(255,228,178,0.45)', lip: true, radius: BTN_R },
  buttonDown: { fill: [[0, '#6c5031'], [1, '#4a361f']], border: '#2a1d0e', ring: 'rgba(226,196,140,0.18)', lip: true, pressed: true, radius: BTN_R },
  buttonSel: { fill: [[0, '#c2563a'], [0.5, '#a3402a'], [1, '#76291a']], border: '#2a0f08', ring: 'rgba(226,196,140,0.55)', top: 'rgba(255,200,170,0.4)', lip: true, radius: BTN_R },
  buttonSelDown: { fill: [[0, '#a3402a'], [1, '#6a2416']], border: '#2a0f08', ring: 'rgba(226,196,140,0.45)', lip: true, pressed: true, radius: BTN_R },
  buttonOn: { fill: [[0, '#a7834f'], [0.55, '#7d5f36'], [1, '#634a29']], border: '#e2c48c', ring: 'rgba(242,214,160,0.55)', top: 'rgba(255,236,196,0.6)', lip: true, radius: BTN_R },
  buttonOnDown: { fill: [[0, '#7d5f36'], [1, '#5a4225']], border: '#e2c48c', ring: 'rgba(242,214,160,0.45)', lip: true, pressed: true, radius: BTN_R },
  buttonDanger: { fill: [[0, '#3d332a'], [1, '#2b231c']], border: '#1a120c', ring: 'rgba(180,138,82,0.35)', top: 'rgba(255,235,200,0.1)', lip: true, radius: BTN_R },
  buttonDangerDown: { fill: [[0, '#2b231c'], [1, '#221b15']], border: '#1a120c', ring: 'rgba(180,138,82,0.3)', lip: true, pressed: true, radius: BTN_R },
  buttonOff: { fill: [[0, '#2b241e'], [1, '#221c17']], border: '#1a140f', ring: 'rgba(143,130,109,0.22)', radius: BTN_R },
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
  if (look.ring) {
    roundRect(ctx, bw * 1.5, fy + bw * 1.5, W - bw * 3, fh - bw * 3, Math.max(0, r - bw));
    ctx.lineWidth = css;
    ctx.strokeStyle = look.ring;
    ctx.stroke();
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
