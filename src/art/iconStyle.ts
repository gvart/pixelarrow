/**
 * How the smooth UI icons (src/art/vectorIcons.ts) are painted: each shape
 * gets a soft drop shadow, a dark ink outline, a top-lit gradient in the
 * material it stands for (bronze for orders, steel for blades, gold for coin,
 * red for health...) and a gloss on its upper half. Three looks per icon:
 *  - 'full': the coloured, lit icon (on stone and bronze);
 *  - 'light': cream, lit the same way (on terracotta and lit-bronze buttons,
 *    where a red heart or gold coin would clash);
 *  - 'dim': flat muted grey (disabled).
 */

/** Gradient stops top -> bottom: highlight, body, shade. */
type Tone = [string, string, string];

const TONES = {
  bronze: ['#f6e1b4', '#d1a462', '#8a5f2c'],
  steel: ['#f2f4f6', '#b8c0c8', '#6c7680'],
  iron: ['#d9d6d0', '#8f8b84', '#4f4b46'],
  gold: ['#fff1b8', '#f2c54a', '#a8741c'],
  silver: ['#ffffff', '#d4dae0', '#8c96a0'],
  red: ['#ff9a84', '#d8483a', '#8a1e16'],
  ember: ['#ffe08a', '#f08a2a', '#a8361a'],
  blue: ['#bcd8f4', '#5f92c8', '#2c4f7c'],
  green: ['#d4f0a8', '#7fb84e', '#3f6a22'],
  ivory: ['#fffaf0', '#e6d8bc', '#a8977a'],
  wood: ['#e0b27a', '#9a6838', '#5a3818'],
  wheat: ['#fff0a8', '#e2b84a', '#9a7420'],
  clay: ['#f2a07a', '#c4603a', '#7a3420'],
  linen: ['#fffaf0', '#e8dcc4', '#a8987a'],
  cream: ['#fffaf0', '#f1e8d8', '#c8b898'],
  dim: ['#9d917c', '#8f826d', '#7a6e5c'],
} satisfies Record<string, Tone>;

export type IconLook = 'full' | 'light' | 'dim';

/** The material each icon is drawn in (anything not listed is bronze). */
const ICON_TONE: Record<string, keyof typeof TONES> = {
  heart: 'red', berserk: 'red', close: 'red', flag: 'red', cross: 'red',
  fire: 'ember', bolt: 'gold', stamina: 'green', check: 'green', plus: 'green',
  coin: 'gold', drachma: 'silver', star: 'gold', ring: 'gold', aura: 'gold',
  morale: 'blue', eye: 'blue', map: 'linen', tent: 'linen', people: 'cream',
  sword: 'steel', swords: 'steel', spear: 'steel', throw: 'steel', volley: 'steel', anvil: 'iron', repair: 'iron', gear: 'iron',
  skull: 'ivory', horn: 'ivory', beast: 'ivory', food: 'wheat', wood: 'wood', amphora: 'clay', hourglass: 'wood',
  clock: 'ivory', play: 'cream', pause: 'cream', fast: 'cream', back: 'cream',
  camp_palisade: 'wood', camp_granary: 'wheat', camp_forge: 'ember', camp_barracks: 'linen', camp_watchtower: 'wood',
};

/**
 * Paint icon `name` (path data `d`, 24 x 24 box) into a new n x n canvas.
 */
export function paintIcon(name: string, d: string, look: IconLook, n: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const k = n / 24;
  // a little inset so the outline and shadow stay inside the canvas
  ctx.translate(n * 0.04, n * 0.02);
  ctx.scale(k * 0.92, k * 0.92);
  const path = new Path2D(d);
  if (look === 'dim') {
    ctx.fillStyle = TONES.dim[1];
    ctx.fill(path, 'evenodd');
    return canvas;
  }
  const tone: Tone = look === 'light' ? TONES.cream : TONES[ICON_TONE[name] ?? 'bronze'];
  // drop shadow
  ctx.save();
  ctx.translate(0, 1.3);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill(path, 'evenodd');
  ctx.restore();
  // ink outline (stroked under the fill, so only its outer half shows)
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = look === 'light' ? 'rgba(42,15,8,0.75)' : '#1a120c';
  ctx.stroke(path);
  // body: lit from the top
  const g = ctx.createLinearGradient(0, 2, 0, 22);
  g.addColorStop(0, tone[0]);
  g.addColorStop(0.45, tone[1]);
  g.addColorStop(1, tone[2]);
  ctx.fillStyle = g;
  ctx.fill(path, 'evenodd');
  // gloss on the upper part, and a thin rim light along the top edges
  ctx.save();
  ctx.clip(path, 'evenodd');
  const gl = ctx.createLinearGradient(0, 0, 0, 13);
  gl.addColorStop(0, 'rgba(255,255,255,0.45)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, 24, 12);
  ctx.restore();
  // an inner shade along the lower edges gives the shape some thickness
  ctx.save();
  ctx.clip(path, 'evenodd');
  ctx.translate(0, 1.1);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.stroke(path);
  ctx.restore();
  return canvas;
}
