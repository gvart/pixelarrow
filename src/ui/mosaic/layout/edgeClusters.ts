/**
 * Edge rails and anchored clusters for field scenes (design/ux/landscape-v6.md §3.5): the HUD as a
 * set of clusters over a full-bleed field, each anchored to its edge or corner with the 6 UI px
 * frame padding inside the safe area, and the **framing rect** they leave: the safe area minus the
 * clusters' insets. Cameras frame, centre and follow inside the framing rect, never the canvas
 * (camera-systems: the view, not the centre, must stay clear of what covers it; §7.3).
 *
 *  TL ─────── top strip ─────── TR
 *  left column    FIELD    right rail
 *  BL ────── bottom-centre bar ─ BR
 *
 * Left-hand mode (A11Y-16) mirrors the whole set: the left column goes right, the right rail left.
 */
import { EDGE_PAD, type Box } from './variant';

export type ClusterId = 'tl' | 'tr' | 'top' | 'left' | 'right' | 'bottom' | 'bl' | 'br';

/** The size each cluster asks for, UI px. A cluster left out is not drawn and takes no room. */
export type ClusterSizes = Partial<Record<ClusterId, { w: number; h: number }>>;

export interface EdgeLayout {
  rects: Partial<Record<ClusterId, Box>>;
  /** The safe area minus the clusters' insets: where the camera frames the field. */
  framing: Box;
}

const right = (b: Box): number => b.x + b.w;

export function edgeClusters(safe: Box, sizes: ClusterSizes, o: { leftHand?: boolean; pad?: number } = {}): EdgeLayout {
  const pad = o.pad ?? EDGE_PAD;
  const X0 = safe.x;
  const X1 = safe.x + safe.w;
  const Y0 = safe.y;
  const Y1 = safe.y + safe.h;
  const rects: Partial<Record<ClusterId, Box>> = {};
  const size = (id: ClusterId) => {
    const s = sizes[id];
    return s && { w: Math.min(s.w, safe.w - pad * 2), h: Math.min(s.h, safe.h - pad * 2) };
  };
  const tl = size('tl');
  const tr = size('tr');
  const bl = size('bl');
  const br = size('br');
  if (tl) rects.tl = { x: X0 + pad, y: Y0 + pad, ...tl };
  if (tr) rects.tr = { x: X1 - pad - tr.w, y: Y0 + pad, ...tr };
  if (bl) rects.bl = { x: X0 + pad, y: Y1 - pad - bl.h, ...bl };
  if (br) rects.br = { x: X1 - pad - br.w, y: Y1 - pad - br.h, ...br };
  // the strips are centred between the corners; where the corners leave no room, a strip moves off them
  const cornerRow = (a?: Box, b?: Box) => ({ l: a ? right(a) + pad : X0 + pad, r: b ? b.x - pad : X1 - pad, h: Math.max(a?.h ?? 0, b?.h ?? 0) });
  const top = size('top');
  if (top) {
    const row = cornerRow(rects.tl, rects.tr);
    const x = X0 + Math.round((safe.w - top.w) / 2);
    const fits = x >= row.l && x + top.w <= row.r;
    rects.top = { x, y: Y0 + pad + (fits || !row.h ? 0 : row.h + pad), ...top };
  }
  const bottom = size('bottom');
  if (bottom) {
    const row = cornerRow(rects.bl, rects.br);
    const x = X0 + Math.round((safe.w - bottom.w) / 2);
    const fits = x >= row.l && x + bottom.w <= row.r;
    rects.bottom = { x, y: Y1 - pad - bottom.h - (fits || !row.h ? 0 : row.h + pad), ...bottom };
  }
  const tops = [rects.tl, rects.tr, rects.top].filter((r): r is Box => !!r);
  const bottoms = [rects.bl, rects.br, rects.bottom].filter((r): r is Box => !!r);
  const topEdge = tops.length ? Math.max(...tops.map((r) => r.y + r.h)) : Y0;
  const bottomEdge = bottoms.length ? Math.min(...bottoms.map((r) => r.y)) : Y1;
  // the side columns run between the top row and the bottom row
  const bandY = topEdge + pad;
  const bandH = Math.max(0, bottomEdge - pad - bandY);
  const left = size('left');
  const rail = size('right');
  if (left) rects.left = { x: X0 + pad, y: bandY, w: left.w, h: Math.min(left.h, bandH) };
  if (rail) rects.right = { x: X1 - pad - rail.w, y: bandY, w: rail.w, h: Math.min(rail.h, bandH) };
  const fx0 = rects.left ? right(rects.left) : X0;
  const fx1 = rects.right ? rects.right.x : X1;
  let framing: Box = { x: fx0, y: topEdge, w: fx1 - fx0, h: bottomEdge - topEdge };
  if (o.leftHand) {
    const mirror = (b: Box): Box => ({ ...b, x: X0 + X1 - b.x - b.w });
    for (const id of Object.keys(rects) as ClusterId[]) rects[id] = mirror(rects[id]!);
    framing = mirror(framing);
  }
  return { rects, framing };
}
