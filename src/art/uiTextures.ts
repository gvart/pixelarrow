/** Procedural parchment UI pieces: panels, buttons, scroll rolls. */
import { P } from './palette';
import { Pix, hash2 } from './pixels';

export type PanelStyle = 'parch' | 'inset' | 'button' | 'buttonDown' | 'buttonSel' | 'buttonOff' | 'scroll' | 'dark' | 'slot' | 'slotSel';

export function renderPanel(w: number, h: number, style: PanelStyle): Pix {
  const px = new Pix(w, h);
  const isBtn = style.startsWith('button');
  let fill: number = P.parch;
  let light: number = P.parchLight;
  let shade: number = P.parchShade;
  let border: number = P.inkRed;
  if (style === 'inset' || style === 'slot') {
    fill = P.parchShade;
    light = P.parch;
    shade = P.parchDark;
  } else if (style === 'buttonSel' || style === 'slotSel') {
    fill = P.red;
    light = 0xc4604c;
    shade = P.redDark;
    border = P.redDark;
  } else if (style === 'buttonOff') {
    fill = 0xcdb8a8;
    light = 0xd8c6b8;
    shade = 0xb8a090;
    border = 0x8c7466;
  } else if (style === 'dark') {
    fill = 0x3a2a24;
    light = 0x4e3a30;
    shade = 0x2a1d18;
    border = 0x1d140f;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = fill;
      const r = hash2(x, y, w * 31 + h);
      if (style === 'parch' || style === 'scroll') {
        if (r < 0.05) c = shade;
        else if (r > 0.965) c = light;
      }
      px.set(x, y, c);
    }
  }
  // bevel
  const down = style === 'buttonDown';
  px.hline(1, w - 2, 1, down ? shade : light);
  px.vline(1, 1, h - 2, down ? shade : light);
  px.hline(1, w - 2, h - 2, down ? light : shade);
  px.vline(w - 2, 1, h - 2, down ? light : shade);
  if (isBtn && !down) px.hline(1, w - 2, h - 3, shade);
  // border with clipped corners
  px.hline(1, w - 2, 0, border);
  px.hline(1, w - 2, h - 1, border);
  px.vline(0, 1, h - 2, border);
  px.vline(w - 1, 1, h - 2, border);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px.clear(x, y);
  if (style === 'parch' || style === 'scroll') {
    // inner decorative line + corner studs
    if (w > 24 && h > 24) {
      for (let x = 4; x < w - 4; x += 2) {
        px.set(x, 3, P.parchDark);
        px.set(x, h - 4, P.parchDark);
      }
      for (let y = 4; y < h - 4; y += 2) {
        px.set(3, y, P.parchDark);
        px.set(w - 4, y, P.parchDark);
      }
      for (const [x, y] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]]) px.rect(x, y, 2, 2, P.inkRed);
    }
  }
  return px;
}

/** A rolled scroll end (horizontal cylinder) of width w. */
export function renderScrollRoll(w: number): Pix {
  const h = 8;
  const px = new Pix(w, h);
  const rows = [P.inkRed, P.parchShade, P.parchLight, P.parch, P.parch, P.parchShade, P.parchDark, P.inkRed];
  for (let y = 0; y < h; y++) px.hline(3, w - 4, y, rows[y]);
  // rod knobs
  for (const x0 of [0, w - 3]) {
    px.rect(x0, 2, 3, 4, P.wood[1]);
    px.set(x0 + 1, 2, P.wood[0]);
    px.hline(x0, x0 + 2, 5, P.wood[2]);
  }
  // shadow lines to suggest rolled paper
  for (let x = 6; x < w - 6; x += 9) px.set(x, 4, P.parchShade);
  return px;
}

export function renderIcon(rows: string[], ink: number, hi: number): Pix {
  const px = new Pix(rows[0].length, rows.length);
  px.bitmap(0, 0, rows, { '#': ink, '+': hi });
  return px;
}

/** Simple horizontal bar background (for HP/morale meters). */
export function renderBar(w: number, h: number, color: number, back: number): Pix {
  const px = new Pix(w, h);
  px.rect(0, 0, w, h, back);
  px.rect(1, 1, w - 2, h - 2, color);
  return px;
}
