/**
 * The tutorial's narrator, Nikias the old strategos: a 32 x 32 bust (grey
 * beard, weathered face, a bronze Corinthian helm pushed up on the brow with a
 * red horsehair crest, a red cloak pinned with a bronze brooch). Frames: 0
 * mouth shut, 1 mouth open (talking), 2 blinking. Plus the ghost hand that
 * demonstrates gestures (a pointing finger, 14 x 18) and its touch ring.
 */
import { Pix } from './pixels';
import { P } from './palette';

export const NARRATOR_SIZE = 32;

const SKIN = [0xe8b88c, 0xcf9a6c, 0xa8764e, 0x7c5436];
const GREY = [0xf0ece2, 0xd2cbbd, 0xa59e90, 0x77706a];
const BRONZE = P.bronze;
const CREST = [0xd0503c, 0xa83224, 0x7a2018, 0x521410];
const CLOAK = [0xb84a38, 0x963426, 0x6e241a, 0x4a160f];

/** Light from the upper left: pick a ramp step from the normalised position in a shape. */
function shade(ramp: readonly number[], u: number, v: number, edge: boolean, bias = 0): number {
  const l = -u * 0.55 - v * 0.75 + bias;
  if (edge && l < 0.1) return ramp[Math.min(ramp.length - 1, 3)];
  return l > 0.45 ? ramp[0] : l > -0.15 ? ramp[1] : l > -0.6 ? ramp[2] : ramp[Math.min(ramp.length - 1, 3)];
}

export function renderNarrator(frame: 0 | 1 | 2): Pix {
  const p = new Pix(NARRATOR_SIZE, NARRATOR_SIZE);
  // ---- cloak and shoulders
  p.ellipse(1, 22, 30, 18, (_x, _y, e, u, v) => shade(CLOAK, u, v, e, 0.1));
  // folds
  for (const fx of [7, 12, 20, 25]) for (let y = 26; y < 32; y++) if (p.alpha(fx, y)) p.set(fx, y, CLOAK[2]);
  // tunic at the throat
  p.ellipse(11, 22, 10, 8, (_x, _y, e, u, v) => shade([0xf0e8d4, 0xd9cdb2, 0xb3a68a, 0x8a7e66], u, v, e));
  // ---- neck
  p.rect(13, 19, 6, 5, SKIN[2]);
  // ---- face
  p.ellipse(9, 8, 14, 16, (_x, _y, e, u, v) => shade(SKIN, u, v, e, 0.15));
  // ears
  p.set(8, 15, SKIN[2]);
  p.set(8, 16, SKIN[2]);
  p.set(23, 15, SKIN[3]);
  p.set(23, 16, SKIN[3]);
  // wrinkles across the brow
  p.hline(12, 15, 11, SKIN[2]);
  p.hline(17, 20, 11, SKIN[2]);
  // ---- beard and moustache (full, grey)
  p.ellipse(9, 16, 14, 12, (_x, y, e, u, v) => (y < 18 && Math.abs(u) < 0.55 ? null : shade(GREY, u, v, e, 0.2)));
  p.ellipse(10, 17, 12, 5, (_x, _y, e, u, v) => shade(GREY, u, v, e, 0.35));
  // beard texture
  for (const [x, y] of [[11, 22], [14, 24], [18, 23], [20, 21], [13, 26], [17, 26], [12, 20], [19, 25]]) p.set(x, y, GREY[2]);
  // ---- eyes and brows
  const blink = frame === 2;
  for (const ex of [12, 18]) {
    if (blink) {
      p.hline(ex, ex + 1, 14, SKIN[3]);
    } else {
      p.set(ex, 14, 0xf6f0e4);
      p.set(ex + 1, 14, 0x2a1a16);
      p.set(ex, 15, SKIN[2]);
      p.set(ex + 1, 15, SKIN[2]);
    }
    // bushy grey brows
    p.hline(ex - 1, ex + 2, 12, GREY[1]);
    p.set(ex + (ex < 16 ? -1 : 2), 13, GREY[2]);
  }
  // nose
  p.vline(16, 13, 17, SKIN[1]);
  p.set(17, 17, SKIN[3]);
  p.set(15, 18, SKIN[2]);
  p.set(16, 18, SKIN[2]);
  // ---- mouth in the beard
  if (frame === 1) {
    p.rect(15, 20, 3, 2, 0x3a1a14);
    p.set(16, 20, 0x6e2a22);
  } else p.hline(15, 17, 20, GREY[3]);
  // ---- Corinthian helm pushed up on the brow
  p.ellipse(8, 0, 16, 12, (_x, y, e, u, v) => (y > 9 ? null : shade(BRONZE, u, v, e, 0.2)));
  // the helm's rim and the cheek guards pointing up
  p.hline(8, 23, 9, BRONZE[3]);
  p.hline(9, 22, 8, BRONZE[2]);
  for (const [x0, flip] of [[8, false], [21, true]] as const) {
    p.rect(x0, 5, 3, 4, BRONZE[flip ? 2 : 1]);
    p.set(x0 + (flip ? 0 : 2), 4, BRONZE[2]);
  }
  // eye slits of the raised helm
  p.hline(11, 14, 6, BRONZE[3]);
  p.hline(17, 20, 6, BRONZE[3]);
  // glint
  p.set(12, 2, 0xfff0b8);
  p.set(13, 2, 0xfff0b8);
  // ---- crest: a sweep of red horsehair over the helm
  p.ellipse(5, 0, 22, 6, (_x, y, e, u, v) => (y > 3 ? null : shade(CREST, u, v, e, 0.3)));
  for (let x = 6; x < 26; x += 2) p.set(x, 3, CREST[2]);
  p.rect(14, 3, 4, 1, BRONZE[2]);
  // ---- bronze brooch on the cloak
  p.rect(23, 24, 3, 3, BRONZE[1]);
  p.set(23, 24, 0xfff0b8);
  p.outline(P.outline);
  return p;
}

/** A pointing hand (index finger up), for gesture demonstrations. The fingertip is at (5, 0). */
export const HAND_TIP = { x: 5, y: 1 };

export function renderHand(): Pix {
  const rows = [
    '.....##.......',
    '....#ww#......',
    '....#ww#......',
    '....#ww#......',
    '....#ww#......',
    '....#ww###....',
    '....#ww#ww##..',
    '.####ww#ww#w#.',
    '#wwwlww#ww#ww#',
    '#wwwwwwlwwlww#',
    '#wwwwwwwwwwww#',
    '.#wwwwwwwwwww#',
    '..#wwwwwwwwww#',
    '..#wwwwwwwwws#',
    '...#wwwwwwws#.',
    '...#wwwwwwss#.',
    '....#ssssss#..',
    '.....######...',
  ];
  const p = new Pix(14, 18);
  p.bitmap(0, 0, rows, { '#': P.outline, w: 0xfaf4e8, l: 0xd8cbb4, s: 0xc0b298 });
  return p;
}

/** The ring a ghost finger leaves where it presses. */
export function renderTouchRing(): Pix {
  const p = new Pix(15, 15);
  p.ellipse(0, 0, 15, 15, (_x, _y, e) => (e ? 0xfaf4e8 : null));
  p.ellipse(3, 3, 9, 9, (_x, _y, e) => (e ? 0xe0b860 : null));
  return p;
}
