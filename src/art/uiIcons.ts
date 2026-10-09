/**
 * UI icons added by the v3 redesign (docs/UI_KIT.md "Icons"), in the exact
 * family of src/art/vectorIcons.ts: a 24 x 24 box, filled parts in one
 * material each, details on top, painted by src/art/iconStyle.ts (ink outline,
 * light from the top left, full / light / dim looks). Some shapes are built
 * by the small path helpers below (leaves, stars, chevrons) so they stay exact.
 *
 * One meaning per icon: the resource icons (laurel, tgstar, power, trophy, xp)
 * are used for nothing else (src/ui/tokens.ts RESOURCES).
 */
import type { IconPart } from './iconStyle';

const f = (n: number) => +n.toFixed(2);

/** A pointed leaf: base (x, y), pointing at `deg` (0 = up, clockwise), length `len`, half width `w`. */
function leaf(x: number, y: number, deg: number, len: number, w: number): string {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const tx = x + dx * len;
  const ty = y + dy * len;
  // control points either side of the midline
  const mx = x + dx * len * 0.5;
  const my = y + dy * len * 0.5;
  const nx = -dy * w * 1.4;
  const ny = dx * w * 1.4;
  return `M${f(x)} ${f(y)}Q${f(mx + nx)} ${f(my + ny)} ${f(tx)} ${f(ty)}Q${f(mx - nx)} ${f(my - ny)} ${f(x)} ${f(y)}Z`;
}

/** A five-point star centred on (cx, cy): outer radius `r`, inner `ri`, tips rounded by `round` (0..1). */
function star(cx: number, cy: number, r: number, ri: number, round = 0): string {
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 ? ri : r;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  if (!round) return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
  // rounded tips: stop short of each outer point and curve through it
  let d = '';
  for (let k = 0; k < 10; k++) {
    const [x, y] = pts[k];
    if (k % 2) {
      d += `L${f(x)} ${f(y)}`;
      continue;
    }
    const [px, py] = pts[(k + 9) % 10];
    const [nx, ny] = pts[(k + 1) % 10];
    const ax = x + (px - x) * round * 0.35;
    const ay = y + (py - y) * round * 0.35;
    const bx = x + (nx - x) * round * 0.35;
    const by = y + (ny - y) * round * 0.35;
    d += `${k === 0 ? 'M' : 'L'}${f(ax)} ${f(ay)}Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
  }
  return d + 'Z';
}

/** A circle as a path. */
function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx - r)} ${f(cy)}Z`;
}

/** A rounded rectangle as a path. */
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}

/** A thick chevron pointing left (dir -1) or right (dir 1), centred in the box. */
function chevron(dir: 1 | -1): string {
  const x0 = 12 - dir * 4.5;
  const x1 = 12 + dir * 4.5;
  const t = 4.6;
  return `M${f(x0)} ${f(3)}L${f(x1)} 12L${f(x0)} ${f(21)}L${f(x0 + dir * t)} 21L${f(x1 + dir * t)} 12L${f(x0 + dir * t)} 3Z`;
}

/** The laurel wreath (Glory): two branches of leaves round an open top, tied with a ribbon. */
function laurel(): IconPart[] {
  const parts: IconPart[] = [];
  // the two stems
  parts.push({ d: 'M11.2 20.6C5.2 18.6 3 13.2 4.6 6.2', tone: 'ink', detail: true, w: 1.1 });
  parts.push({ d: 'M12.8 20.6C18.8 18.6 21 13.2 19.4 6.2', tone: 'ink', detail: true, w: 1.1 });
  // leaves along each stem: [x, y, angle of the outer leaf]
  const L: [number, number, number][] = [
    [9.6, 19.6, -70],
    [7.2, 17.4, -55],
    [5.5, 14.4, -40],
    [4.6, 11, -25],
    [4.6, 7.6, -8],
  ];
  for (const [x, y, a] of L) {
    parts.push({ d: leaf(x, y, a, 5.2, 1.5), tone: 'green' });
    parts.push({ d: leaf(x, y, a + 62, 4.2, 1.3), tone: 'green' });
    const mx = 24 - x;
    parts.push({ d: leaf(mx, y, -a, 5.2, 1.5), tone: 'green' });
    parts.push({ d: leaf(mx, y, -a - 62, 4.2, 1.3), tone: 'green' });
  }
  // the ribbon at the foot
  parts.push({ d: 'M9.4 19.2L12 21L14.6 19.2L15.6 22.6L12 21.8L8.4 22.6Z', tone: 'red' });
  parts.push({ d: circle(12, 20.6, 1.4), tone: 'red' });
  return parts;
}

export const UI_ICONS: Record<string, IconPart[]> = {
  laurel: laurel(),
  // Telegram Stars: Telegram's own star, fat and rounded, yellow into orange (never the ladder's flat gold star)
  tgstar: [
    { d: star(12, 12.6, 10.8, 5.6, 1), tone: 'ember' },
    { d: star(12, 12.4, 5.6, 2.9, 1), tone: 'gold' },
    { d: 'M7.6 9.2L10.4 8.6', tone: 'gleam', detail: true, w: 1 },
  ],
  // power: Herakles' club
  power: [
    { d: 'M3.1 19.6L11.9 10.8L13.6 12.5L4.8 21.3A1.2 1.2 0 0 1 3.1 19.6Z', tone: 'wood' },
    { d: 'M10.6 9.4C11.8 5.4 14.6 2.4 18 2.4C20.4 2.4 21.6 3.6 21.6 6C21.6 9.4 18.6 12.2 14.6 13.4Z', tone: 'wood' },
    { d: circle(16.2, 5.6, 1.1), tone: 'ink', detail: true, fill: true },
    { d: circle(19, 8.4, 1.1), tone: 'ink', detail: true, fill: true },
    { d: circle(14.4, 9.6, 1), tone: 'ink', detail: true, fill: true },
    { d: 'M9.6 11.2L12.8 14.4L11.6 15.6L8.4 12.4Z', tone: 'gold' },
    { d: 'M13.2 5.6Q15 3.6 17.6 3.4', tone: 'gleam', detail: true, w: 1 },
  ],
  // wins: the victor's cup
  trophy: [
    { d: 'M6.2 5H3.4V7.6C3.4 9.9 5 11.4 7.3 11.6L7 9.8C5.9 9.6 5.2 8.8 5.2 7.6V6.8H6.2Z', tone: 'gold' },
    { d: 'M17.8 5H20.6V7.6C20.6 9.9 19 11.4 16.7 11.6L17 9.8C18.1 9.6 18.8 8.8 18.8 7.6V6.8H17.8Z', tone: 'gold' },
    { d: 'M6 2.8H18V8.4C18 11.9 15.4 14.4 12 14.4C8.6 14.4 6 11.9 6 8.4Z', tone: 'gold' },
    { d: 'M10.7 14H13.3V17.6H10.7Z', tone: 'gold' },
    { d: 'M7.4 17.4H16.6V21.2H7.4Z', tone: 'wood' },
    { d: 'M8.4 4.6L8.4 9', tone: 'gleam', detail: true, w: 1 },
  ],
  // leaderboards: the podium, first place in gold
  podium: [
    { d: rrect(1.8, 12.4, 6.8, 9.2, 0.8), tone: 'stone' },
    { d: rrect(15.4, 14.6, 6.8, 7, 0.8), tone: 'stone' },
    { d: rrect(8.6, 7.6, 6.8, 14, 0.8), tone: 'gold' },
    { d: star(12, 4.2, 2.8, 1.3), tone: 'gold' },
    { d: 'M11.2 11.2L12.4 10.4V15.6', tone: 'ink', detail: true, w: 1.1 },
  ],
  // XP: two rising chevrons
  xp: [
    { d: 'M12 2.6L21 11.2V16L12 7.4L3 16V11.2Z', tone: 'blue' },
    { d: 'M12 10.2L21 18.8V22.2L12 15.2L3 22.2V18.8Z', tone: 'blue' },
    { d: 'M4.4 11.4L12 4.4', tone: 'gleam', detail: true, w: 1 },
  ],
  // the season pass: a ticket of parchment with a wax seal
  // war gold (the online season's purse; campaign gold is `coin`): a bronze stater stamped with crossed spears
  wargold: [
    { d: 'M2.4 12A9.6 9.6 0 1 1 21.6 12A9.6 9.6 0 1 1 2.4 12Z', tone: 'bronze' },
    { d: 'M4.6 12A7.4 7.4 0 1 1 19.4 12A7.4 7.4 0 1 1 4.6 12Z', tone: 'clay' },
    { d: 'M7.2 16.8L16.8 7.2M7.2 7.2L16.8 16.8', tone: 'ink', detail: true, w: 1.3 },
    { d: 'M15.4 6.2L17.8 6.2L17.8 8.6Z', tone: 'ink', detail: true, fill: true },
    { d: 'M8.6 6.2L6.2 6.2L6.2 8.6Z', tone: 'ink', detail: true, fill: true },
    { d: 'M5.2 9.4A7 7 0 0 1 9.4 5.2', tone: 'gleam', detail: true, w: 1 },
  ],
  pass: [
    { d: 'M3 6.2H21V9.4A2.6 2.6 0 0 0 21 14.6V17.8H3V14.6A2.6 2.6 0 0 0 3 9.4Z', tone: 'linen' },
    { d: 'M7 10H14M7 13H12.4', tone: 'ink', detail: true, w: 1 },
    { d: circle(17.4, 15.6, 3.4), tone: 'red' },
    { d: 'M16 19L15.2 22.6L17.4 21.4L19.6 22.6L18.8 19Z', tone: 'red' },
    { d: star(17.4, 15.6, 1.8, 0.8), tone: 'gleam', detail: true, fill: true },
  ],
  lock: [
    { d: 'M7.2 11V7.6A4.8 4.8 0 0 1 16.8 7.6V11H14.6V7.6A2.6 2.6 0 0 0 9.4 7.6V11Z', tone: 'steel' },
    { d: 'M4.8 10.4H19.2V21.2H4.8Z', tone: 'bronze' },
    { d: 'M12 13.8L12 17.6', tone: 'ink', detail: true, w: 1.8 },
  ],
  // a market stall: striped awning over a counter
  shop: [
    { d: 'M4.4 11H5.8V21.4H4.4ZM18.2 11H19.6V21.4H18.2Z', tone: 'wood' },
    { d: 'M3 15.6H21V19.4H3Z', tone: 'wood' },
    { d: 'M2.2 4.4H21.8L22.6 9.6Q21.4 11.8 19.4 9.6Q17.8 11.8 15.8 9.6Q14 11.8 12 9.6Q10 11.8 8.2 9.6Q6.2 11.8 4.6 9.6Q2.6 11.8 1.4 9.6Z', tone: 'linen' },
    { d: 'M5.4 4.4H8.6L8.2 9.6Q6.4 11 4.6 9.6ZM12 4.4H15.2L15.8 9.6Q14 11 12 9.6ZM18.6 4.4H21.8L22.6 9.6Q21 11 19.4 9.6Z', tone: 'red', detail: true, fill: true },
    { d: circle(9, 14.4, 1.4), tone: 'clay' },
    { d: circle(13.6, 14.2, 1.6), tone: 'gold' },
  ],
  // the ladder mode: a stepped tower with a pennant
  ladder: [
    { d: 'M2.4 17.4H21.6V21.6H2.4Z', tone: 'stone' },
    { d: 'M5.4 13.2H18.6V17.4H5.4Z', tone: 'stone' },
    { d: 'M8.4 9H15.6V13.2H8.4Z', tone: 'stone' },
    { d: 'M11.4 2.4H12.6V9H11.4Z', tone: 'wood' },
    { d: 'M12.6 2.6L18 4.4L12.6 6.2Z', tone: 'red' },
    { d: 'M5 19.6H19M8 15.4H16M10.8 11.2H13.2', tone: 'ink', detail: true, w: 0.7 },
  ],
  // the arena: an amphitheatre's arches
  arena: [
    { d: 'M1.8 21.6V9.8Q12 3.4 22.2 9.8V21.6Z', tone: 'stone' },
    { d: 'M4.2 21.6V17.4A1.6 1.6 0 0 1 7.4 17.4V21.6ZM10.4 21.6V16.4A1.6 1.6 0 0 1 13.6 16.4V21.6ZM16.6 21.6V17.4A1.6 1.6 0 0 1 19.8 17.4V21.6Z', tone: 'dark', detail: true, fill: true },
    { d: 'M5 13.4A1.3 1.3 0 0 1 7.6 13.4V14.8H5ZM10.7 11.8A1.3 1.3 0 0 1 13.3 11.8V13.2H10.7ZM16.4 13.4A1.3 1.3 0 0 1 19 13.4V14.8H16.4Z', tone: 'dark', detail: true, fill: true },
    { d: 'M2 15.6Q12 11 22 15.6', tone: 'ink', detail: true, w: 0.8 },
    { d: 'M11.4 3.2H12.6V6.4H11.4Z', tone: 'wood' },
    { d: 'M12.6 3.2L16.2 4.4L12.6 5.6Z', tone: 'red' },
  ],
  // raids: a torch
  raid: [
    { d: 'M10.6 11.4H13.4L12.8 21.8A0.8 0.8 0 0 1 11.2 21.8Z', tone: 'wood' },
    { d: 'M9.2 10H14.8V12.2H9.2Z', tone: 'bronze' },
    { d: 'M12 1.6C14.8 4.2 16.6 6.2 15.6 8.6C15 10 13.6 10.4 12 10.4C10.4 10.4 9 10 8.4 8.6C7.6 6.6 9.2 5.4 10 3.8C10.6 5 11.2 5.4 11.6 5.6C11.8 4.2 11.6 3 12 1.6Z', tone: 'ember' },
    { d: 'M12 5.4C13.4 6.8 14 8 13.4 9C13 9.6 12.4 9.8 12 9.8C11.4 9.8 10.8 9.6 10.6 9C10.4 8.2 11.2 7.4 12 5.4Z', tone: 'gold' },
  ],
  // the campaign: a signpost on the road
  march: [
    { d: 'M11 3.2H13V21.8H11Z', tone: 'wood' },
    { d: 'M5 5H17.4L19.8 7.4L17.4 9.8H5Z', tone: 'wood' },
    { d: 'M19 11.2H6.6L4.2 13.6L6.6 16H19Z', tone: 'wood' },
    { d: 'M7.4 7.4H15M9 13.6H16.6', tone: 'ink', detail: true, w: 0.9 },
    { d: 'M7.4 21.8Q12 19.6 16.6 21.8Z', tone: 'stone' },
  ],
  chevL: [{ d: chevron(-1), tone: 'bronze' }],
  chevR: [{ d: chevron(1), tone: 'bronze' }],
  info: [
    { d: circle(12, 12, 9.8), tone: 'bronze' },
    { d: circle(12, 7.4, 1.6), tone: 'ivory', detail: true, fill: true },
    { d: 'M10.4 10.4H13.4V16.8H14.6V18.4H9.4V16.8H10.6V12H10.4Z', tone: 'ivory', detail: true, fill: true },
  ],
  // a point budget: the balance
  scales: [
    { d: 'M11.2 4.2H12.8V20H11.2Z', tone: 'bronze' },
    { d: 'M7.6 19.4H16.4V21.6H7.6Z', tone: 'bronze' },
    { d: 'M3 6.2H21V7.8H3Z', tone: 'bronze' },
    { d: 'M5.2 7.6L2 13.4H8.4Z', tone: 'ink', detail: true, w: 0.7 },
    { d: 'M18.8 7.6L15.6 13.4H22Z', tone: 'ink', detail: true, w: 0.7 },
    { d: 'M1.4 13.2H9A3.8 3.8 0 0 1 1.4 13.2Z', tone: 'gold' },
    { d: 'M15 13.2H22.6A3.8 3.8 0 0 1 15 13.2Z', tone: 'gold' },
    { d: circle(12, 4, 1.6), tone: 'gold' },
  ],
  // the raid log: a papyrus scroll
  log: [
    { d: 'M5.4 3.4H17.4V20.6H5.4Z', tone: 'linen' },
    { d: rrect(3.4, 2, 16, 3.2, 1.6), tone: 'wood' },
    { d: rrect(4.6, 18.8, 16, 3.2, 1.6), tone: 'wood' },
    { d: 'M8 8H15M8 11H15M8 14H13', tone: 'ink', detail: true, w: 0.9 },
  ],
  // abilities and auras that had no picture of their own
  aura_steady: [
    { d: 'M5 2.6H19V5H5Z', tone: 'stone' },
    { d: 'M7 5H17V6.6H7Z', tone: 'stone' },
    { d: 'M7.8 6.6H16.2V18.4H7.8Z', tone: 'ivory' },
    { d: 'M10.2 7.8V17.2M12 7.8V17.2M13.8 7.8V17.2', tone: 'ink', detail: true, w: 0.7 },
    { d: 'M6.4 18.4H17.6V20H6.4Z', tone: 'stone' },
    { d: 'M4.6 20H19.4V21.8H4.6Z', tone: 'stone' },
  ],
  aura_eagle: [
    { d: 'M3.4 14.6C3.4 8.6 7.4 3.4 13.4 3.4C17.8 3.4 20.6 6.2 20.6 9.6L22.2 11.6L18 12C17.6 15 15.6 17 13 18.4L14.4 21.6H6.6C4.6 19.8 3.4 17.4 3.4 14.6Z', tone: 'wood' },
    { d: 'M17.6 8.6L22.2 11.6L18 12.6Z', tone: 'gold' },
    { d: circle(15.6, 8.4, 1.5), tone: 'gold' },
    { d: circle(15.8, 8.4, 0.6), tone: 'ink', detail: true, fill: true },
    { d: 'M6.6 15.4Q9 13.6 11.6 14.4M6.2 18.2Q8.6 16.4 11.2 17.2', tone: 'ivory', detail: true, w: 0.9 },
  ],
  aura_warlord: [
    { d: 'M3.4 10C3.4 4 7.4 1.4 12 1.4C16.6 1.4 20.6 4 20.6 10H18.4C18.4 5.6 15.6 3.6 12 3.6C8.4 3.6 5.6 5.6 5.6 10Z', tone: 'red' },
    { d: 'M5 13.4C5 8 8 5.2 12 5.2C16 5.2 19 8 19 13.4V21.2H15.4L14.2 17H9.8L8.6 21.2H5Z', tone: 'bronze' },
    { d: 'M7.2 11.2H16.8V13.2H13.1V17H10.9V13.2H7.2Z', tone: 'dark', detail: true, fill: true },
    { d: 'M7.4 9.2L8.8 7.2', tone: 'gleam', detail: true, w: 1 },
  ],

  // the duel hub's tools (moved from src/scenes/duel/duelIcons.ts)
  chest: [
    { d: 'M2.8 10.2H21.2V20.8H2.8Z', tone: 'wood' },
    { d: 'M2.8 10.2V7.6C2.8 5.4 4.4 3.8 6.6 3.8H17.4C19.6 3.8 21.2 5.4 21.2 7.6V10.2Z', tone: 'wood' },
    { d: 'M2.8 9.4H21.2V11.2H2.8Z', tone: 'bronze' },
    { d: 'M6.2 3.9H8.2V20.8H6.2Z', tone: 'bronze' },
    { d: 'M15.8 3.9H17.8V20.8H15.8Z', tone: 'bronze' },
    { d: 'M10.4 8.6H13.6V14.2H10.4Z', tone: 'gold' },
    { d: 'M12 11.2L12 12.8', tone: 'ink', detail: true, w: 1 },
  ],
  pen: [
    { d: 'M3.6 20.4L4.8 15.4L15.6 4.6L19.4 8.4L8.6 19.2Z', tone: 'wood' },
    { d: 'M3.6 20.4L4.8 15.4L8.6 19.2Z', tone: 'ivory' },
    { d: 'M15.6 4.6L17.6 2.6L21.4 6.4L19.4 8.4Z', tone: 'red' },
    { d: 'M6.6 15.6L15.8 6.4', tone: 'gleam', detail: true, w: 0.9 },
  ],
  copy: [
    { d: 'M8.4 2.6H19.6V15.8H8.4Z', tone: 'stone' },
    { d: 'M4.4 8.2H15.6V21.4H4.4Z', tone: 'ivory' },
    { d: 'M7 12H13M7 15H13M7 18H11', tone: 'ink', detail: true, w: 0.9 },
  ],
  bin: [
    { d: 'M9.4 2.6H14.6V5H9.4Z', tone: 'iron' },
    { d: 'M3.8 4.8H20.2V7.6H3.8Z', tone: 'iron' },
    { d: 'M5.4 8.6H18.6L17.2 21.4H6.8Z', tone: 'iron' },
    { d: 'M9.4 11V18.8M12 11V18.8M14.6 11V18.8', tone: 'ink', detail: true, w: 1 },
  ],
};
