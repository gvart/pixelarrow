/**
 * Where the battle HUD goes in each size class (design/ux/landscape-v6.md §7.2, §7.3; V6-RSCR-02).
 * Pure geometry, UI px, no Phaser: BattleScene draws what this places, and the tests check it.
 *
 *  - portrait (compact portrait, phones): the v5 HUD, untouched (BattleScene's own code path).
 *  - medium (tablets upright): the v5 HUD with three cards a row, the orders at most 360 wide and
 *    Fight at most 300, both centred; the bottom sheet stays under 36% of the height.
 *  - land (compact landscape, 844x390): a one-row top bar; the group cards in a left column; the
 *    orders in a right thumb rail (numeral badge, five keys, Formation at its foot); the medallions
 *    beside the rail with Zoom and Follow over them; the chip row at the field's foot.
 *  - wide (expanded, and medium landscape): a one-row top bar; the cards in a left column; the
 *    orders in one bottom-centre bar under the selected line; the medallions down the right edge;
 *    Zoom and Follow in the bottom-right corner; the chip row directly above the orders.
 *
 * Every layout publishes its **framing rect**, the field the HUD leaves (§3.5): the camera opens,
 * centres, follows and recentres inside it, never under a rail (camera-systems: frame the view,
 * not the canvas). Left-hand mode (A11Y-16) mirrors the side layouts left for right.
 */
import type { SizeClass } from './sizeClass';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HudMode = 'portrait' | 'medium' | 'land' | 'wide';

/** The HUD layout for a size class and orientation (§7.2): medium landscape takes the wide layout. */
export function hudMode(m: { cls: SizeClass; land: boolean }): HudMode {
  if (m.cls === 'compact') return m.land ? 'land' : 'portrait';
  if (m.cls === 'medium' && !m.land) return 'medium';
  return 'wide';
}

/** Minimum touch target (44 pt = 22 UI px at S = 2, A11Y-06) and the space between targets (≥ 4 pt). */
export const HUD_TAP = 22;
const GAP = 3;
const RAIL_GAP = 2;

/** Medallion column width and height (battleHud.ts MED_W, MED_H; kept here so the geometry stays Phaser-free). */
export const MEDAL_W = 50;

/** Compact landscape (422 × 195 at 844x390; 363 × 161 inside Telegram's insets). */
export const LAND = { top: 22, pad: 4, vpad: 2, cardW: 100, cardH: 28, railW: 66, keyMax: 24, badgeH: 14, chipH: 22, fightH: 44 } as const;
/** Expanded (640 × 400 at 1280x800; 512–720 wide, 360–450 tall). */
export const WIDE = { top: 26, pad: 6, cardW: 132, cardH: 30, keyW: 56, keyH: 30, headH: 22, fightW: 200 } as const;
/** Medium portrait (384 × 512 at 768x1024): the v5 sheet with these limits. */
export const MEDIUM = { cols: 3, ordersMax: 360, fightMax: 300, sheetShare: 0.36 } as const;

/** The orders: a key per order, a column (land) or a row (wide). */
export interface OrdersLayout {
  /** The selected group's numeral badge (land: the rail's head; wide: the head line's start). */
  badge: Rect | null;
  /** The five order keys' box. */
  keys: Rect;
  /** Each key's height (land, stacked) or the bar's height (wide). */
  keyH: number;
  vertical: boolean;
  /** Where the Formation chip goes; null: it moves into the chip row (a short landscape screen). */
  formation: Rect | null;
}

export interface SideHud {
  mode: 'land' | 'wide';
  /** The top row (one row: Menu, clock, strength bars, Pause, Speed). */
  top: Rect;
  /** The card column: x, y, w; `cardH` and `cardGap` place each card under the last. */
  cards: Rect;
  cardH: number;
  cardGap: number;
  /** land: the order rail's stone plate (orders in battle, Formation, Groups and Fight in deployment). */
  rail: Rect | null;
  /** wide: the stone plate under the head line and the orders bar (or Fight). */
  plate: Rect | null;
  /** wide: the head line ("I ORDERS · PHALANX" and the Formation chip; Groups in deployment). */
  head: Rect | null;
  orders: OrdersLayout;
  /** land, deployment: Formation, Groups, Works and Undo at the rail's head. */
  deployChips: Rect[];
  /** The deployment's Fight / Ready. */
  fight: Rect;
  /** The ability medallions' column: its left edge and the band it may fill. */
  medals: { x: number; top: number; bottom: number };
  zoom: Rect;
  follow: Rect;
  /** The chip row (Undo, Then…, Works…): laid right after `x0`, wrapping upward from `bottom`, never past `x1`. */
  chips: { x0: number; x1: number; bottom: number };
  /** The hint pill and banners: centred at `cx` from `top`, at most `maxW` wide. */
  hint: { cx: number; top: number; maxW: number };
  /** A beast battle's boss bar (under the top row, centred). */
  boss: Rect;
  /** The field the HUD leaves: where the camera frames (§7.3). */
  framing: Rect;
  /** A task sheet (the shape sheet) as a right side panel (§3.4). */
  panel: Rect;
}

export interface SideHudOpts {
  /** Group cards (1..4). */
  cards: number;
  /** Mirror for left-hand mode. */
  leftHand?: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A rect mirrored across the screen's vertical axis. */
export function mirror(r: Rect, VW: number): Rect {
  return { ...r, x: VW - r.x - r.w };
}

/**
 * The land order rail's keys: the numeral badge at its head, five keys as tall as fit (22–24), and the
 * Formation chip at its foot when it still fits (else it goes into the chip row; landscape-v6 §18 risks).
 */
export function railOrders(rail: Rect): OrdersLayout {
  const inner = { x: rail.x + 3, w: rail.w - 6 };
  const gaps = 4 * RAIL_GAP;
  // the roomy rail: a 14-tall badge, 2 px clear of the rail's ends; the tight one (Telegram's insets) packs them to 1
  const tight = rail.h - 2 * 2 - LAND.badgeH - RAIL_GAP - gaps < 5 * HUD_TAP;
  const edge = tight ? 1 : 2;
  const badge: Rect = { x: inner.x, y: rail.y + edge, w: inner.w, h: tight ? 12 : LAND.badgeH };
  const keysTop = badge.y + badge.h + (tight ? 1 : RAIL_GAP);
  const bottom = rail.y + rail.h - edge;
  const withChip = Math.floor((bottom - keysTop - gaps - (LAND.chipH + RAIL_GAP)) / 5);
  const fits = withChip >= HUD_TAP;
  const keyH = Math.min(LAND.keyMax, fits ? withChip : Math.floor((bottom - keysTop - gaps) / 5));
  const keys: Rect = { x: inner.x, y: keysTop, w: inner.w, h: keyH * 5 + gaps };
  const formation = fits ? { x: inner.x, y: bottom - LAND.chipH, w: inner.w, h: LAND.chipH } : null;
  return { badge, keys, keyH, vertical: true, formation };
}

/** The side layouts: compact landscape and expanded (§7.2). Right-handed, then mirrored for left-hand mode. */
export function sideHud(mode: 'land' | 'wide', VW: number, VH: number, o: SideHudOpts): SideHud {
  const n = clamp(o.cards, 1, 4);
  const out = mode === 'land' ? landHud(VW, VH, n) : wideHud(VW, VH, n);
  if (!o.leftHand) return out;
  const m = (r: Rect): Rect => mirror(r, VW);
  return {
    ...out,
    cards: m(out.cards),
    rail: out.rail && m(out.rail),
    plate: out.plate && m(out.plate),
    head: out.head && m(out.head),
    orders: { ...out.orders, badge: out.orders.badge && m(out.orders.badge), keys: m(out.orders.keys), formation: out.orders.formation && m(out.orders.formation) },
    deployChips: out.deployChips.map(m),
    fight: m(out.fight),
    medals: { ...out.medals, x: VW - out.medals.x - MEDAL_W },
    zoom: m(out.zoom),
    follow: m(out.follow),
    chips: { ...out.chips, x0: VW - out.chips.x1, x1: VW - out.chips.x0 },
    hint: { ...out.hint, cx: VW - out.hint.cx },
    boss: m(out.boss),
    framing: m(out.framing),
    panel: m(out.panel),
  };
}

function landHud(VW: number, VH: number, n: number): SideHud {
  const { pad, vpad } = LAND;
  const top: Rect = { x: 0, y: 0, w: VW, h: LAND.top };
  const cards: Rect = { x: pad, y: top.h + GAP, w: LAND.cardW, h: n * (LAND.cardH + GAP) - GAP };
  const rail: Rect = { x: VW - pad - LAND.railW, y: top.h + vpad, w: LAND.railW, h: VH - top.h - 2 * vpad };
  const orders = railOrders(rail);
  const inner = { x: rail.x + 3, w: rail.w - 6 };
  // deployment: Formation, Groups, Works and Undo at the rail's head (§7.2: "the rail above holds Shape, Groups, Works"), Fight at its foot
  const deployChips = [0, 1, 2, 3].map((i) => ({ x: inner.x, y: rail.y + 3 + i * (LAND.chipH + GAP), w: inner.w, h: LAND.chipH }));
  const fightTop = deployChips[3].y + LAND.chipH + GAP;
  const fightH = Math.max(HUD_TAP, Math.min(LAND.fightH, rail.y + rail.h - 3 - fightTop));
  const fight: Rect = { x: inner.x, y: rail.y + rail.h - 3 - fightH, w: inner.w, h: fightH };
  const medalX = rail.x - GAP - MEDAL_W;
  const keysY = top.h + GAP;
  const zoom: Rect = { x: medalX, y: keysY, w: HUD_TAP, h: HUD_TAP };
  const follow: Rect = { x: medalX + MEDAL_W - HUD_TAP, y: keysY, w: HUD_TAP, h: HUD_TAP };
  const fx0 = cards.x + cards.w;
  const x0 = fx0 + GAP;
  const x1 = medalX - GAP;
  const bossW = Math.min(200, x1 - x0);
  return {
    mode: 'land',
    top,
    cards,
    cardH: LAND.cardH,
    cardGap: GAP,
    rail,
    plate: null,
    head: null,
    orders,
    deployChips,
    fight,
    medals: { x: medalX, top: keysY + HUD_TAP + GAP, bottom: VH - GAP },
    zoom,
    follow,
    chips: { x0, x1, bottom: VH - GAP },
    hint: { cx: Math.round((x0 + x1) / 2), top: top.h + GAP, maxW: Math.min(220, x1 - x0) },
    boss: { x: Math.round((x0 + x1 - bossW) / 2), y: top.h, w: bossW, h: 20 },
    framing: { x: fx0, y: top.h, w: medalX - fx0, h: VH - top.h },
    panel: sidePanel('land', VW, VH, top.h),
  };
}

function wideHud(VW: number, VH: number, n: number): SideHud {
  const { pad } = WIDE;
  const top: Rect = { x: 0, y: 0, w: VW, h: WIDE.top };
  const cards: Rect = { x: pad, y: top.h + pad, w: WIDE.cardW, h: n * (WIDE.cardH + 4) - 4 };
  const medalX = VW - pad - MEDAL_W;
  const corner = VH - pad - HUD_TAP;
  const zoom: Rect = { x: VW - pad - HUD_TAP, y: corner, w: HUD_TAP, h: HUD_TAP };
  const follow: Rect = { x: zoom.x - pad - HUD_TAP, y: corner, w: HUD_TAP, h: HUD_TAP };
  // the bar sits centred between the card column and the medallions, clear of the corner keys
  const bx0 = cards.x + cards.w + pad;
  const bx1 = Math.min(medalX, follow.x) - pad;
  const ordersW = Math.min(5 * WIDE.keyW + 4 * GAP, bx1 - bx0);
  const ordersX = Math.round((bx0 + bx1 - ordersW) / 2);
  const ordersY = VH - pad - WIDE.keyH;
  const head: Rect = { x: ordersX, y: ordersY - GAP - WIDE.headH, w: ordersW, h: WIDE.headH };
  const plate: Rect = { x: ordersX - 4, y: head.y - 4, w: ordersW + 8, h: VH - (head.y - 4) };
  const fightW = Math.min(WIDE.fightW, ordersW);
  const fight: Rect = { x: Math.round(ordersX + (ordersW - fightW) / 2), y: ordersY, w: fightW, h: WIDE.keyH };
  const fx0 = cards.x + cards.w;
  // the chip row starts over the bar's left end ("directly above the orders bar", §7.2) and may run on to the medallions
  const x0 = plate.x;
  const x1 = medalX - pad;
  const bossW = Math.min(300, x1 - bx0);
  const midX = Math.round((fx0 + medalX) / 2);
  return {
    mode: 'wide',
    top,
    cards,
    cardH: WIDE.cardH,
    cardGap: 4,
    rail: null,
    plate,
    head,
    orders: { badge: null, keys: { x: ordersX, y: ordersY, w: ordersW, h: WIDE.keyH }, keyH: WIDE.keyH, vertical: false, formation: null },
    deployChips: [],
    fight,
    medals: { x: medalX, top: top.h + pad, bottom: corner - pad },
    zoom,
    follow,
    chips: { x0, x1, bottom: plate.y - GAP },
    hint: { cx: midX, top: top.h + pad, maxW: Math.min(300, medalX - fx0 - 2 * pad) },
    boss: { x: Math.round(midX - bossW / 2), y: top.h, w: bossW, h: 20 },
    framing: { x: fx0, y: top.h, w: medalX - fx0, h: plate.y - top.h },
    panel: sidePanel('wide', VW, VH, top.h),
  };
}

/** The shape sheet as a right side panel (§3.4 task sheet widths): full height at compact landscape, under the top row at expanded. */
export function sidePanel(mode: 'land' | 'wide', VW: number, VH: number, topH: number): Rect {
  if (mode === 'land') {
    const w = Math.round(clamp(0.6 * VW, 220, 280));
    return { x: VW - w, y: 0, w, h: VH };
  }
  const w = Math.round(clamp(0.36 * VW, 240, 320));
  return { x: VW - w, y: topH, w, h: VH - topH };
}

/** Medium portrait: the v5 sheet's card width for `cols` cards a row in `VW` (4 px margins, SIZE.gap between). */
export function sheetCardW(VW: number, cols: number, gap: number): number {
  return Math.floor((VW - 8 - gap * (cols - 1)) / cols);
}

/** Medium portrait: a row `w` wide at most `max`, centred in VW with 4 px margins: its x and width. */
export function centredRow(VW: number, max: number): { x: number; w: number } {
  const w = Math.min(VW - 8, max);
  return { x: Math.round((VW - w) / 2), w };
}

/** A keycap's slot (input-v6.md §6.1): the control's top-right corner, overlapping its rim, so it takes no width. */
export const KEYCAP = { w: 12, h: 9, inset: 3 } as const;
export function keycapSlot(r: Rect): Rect {
  return { x: r.x + r.w - KEYCAP.w + KEYCAP.inset, y: r.y - KEYCAP.inset, w: KEYCAP.w, h: KEYCAP.h };
}

/** Share of the screen the opaque rects leave uncovered (field-coverage, landscape-v6 §5): a 1-px grid. */
export function fieldCoverage(VW: number, VH: number, opaque: readonly Rect[]): number {
  let free = 0;
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      if (!opaque.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) free++;
    }
  }
  return free / (VW * VH);
}
