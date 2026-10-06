/** Muted earthy palette. Colours are 0xRRGGBB. */
export const P = {
  outline: 0x2a1a16,
  shadow: 0x1d140f,

  // skin ramps [light, base, shade]
  skin: [
    [0xf0c9a0, 0xdcab80, 0xb5825b],
    [0xe2b07e, 0xc98e5a, 0xa06a3e],
    [0xc99566, 0xae7646, 0x84552f],
    [0x9a6a42, 0x7d5233, 0x5c3a23],
  ],
  hair: [0x2a1e18, 0x5a3a22, 0x8a3e1e, 0xc9a25a],
  hairShade: [0x1a120e, 0x3e2716, 0x5e2a14, 0x9a7a3e],

  tunicBlue: [0x6d8fae, 0x4a6b8a, 0x344d66],
  tunicGreen: [0x7f9a5e, 0x5f7a45, 0x465a33],
  tunicWhite: [0xf0e8d4, 0xd9cdb2, 0xb3a68a],
  tunicRed: [0xb85a45, 0x9a3b2f, 0x712a22],
  tunicOchre: [0xd4a55a, 0xb98a3f, 0x8f6629],

  bronze: [0xe8c26a, 0xb8863b, 0x8a6128, 0x5e401b],
  iron: [0xc4c8c8, 0x8f9496, 0x63686b, 0x41464a],
  wood: [0x9a7048, 0x7a5532, 0x57391f],
  leather: [0xa87850, 0x83593a, 0x5e3e26],
  linen: [0xf2ead6, 0xdcd0b4, 0xb9a98a],
  crest: { red: 0xa83224, ink: 0x2b1d1a, cream: 0xe8e0cc },
  shieldField: { bronze: 0xc89a48, cream: 0xe6d8b8, red: 0x9e3426, ink: 0x2e2220, blue: 0x46607a } as Record<string, number>,
  shieldInk: { bronze: 0xb8863b, cream: 0xeee4cc, red: 0xa83224, ink: 0x241815 } as Record<string, number>,
  blood: [0x8a1c1c, 0x6a1414, 0x4a0e0e],

  grass: [0x8b9f5a, 0x7e9450, 0x718748, 0x637a40, 0x566b38],
  dirt: [0xb09a68, 0x9a845a, 0x7e6a48],

  // parchment UI
  parch: 0xecd8c8,
  parchLight: 0xf6e8dc,
  parchShade: 0xd8bca8,
  parchDark: 0xbf9a86,
  ink: 0x4a2420,
  inkRed: 0x8c2f25,
  red: 0xa83a2c,
  redDark: 0x6e2219,
  gold: 0xe0b860,
  goldDark: 0xa07a30,
  cream: 0xf6ecd8,
  bg: 0x2b1d1a,
  sky: 0x3a2a22,
  good: 0x5f7a45,
  bad: 0x9a3b2f,
  blue: 0x4a6b8a,
};

export const SIDE_COLOR = [0x4a6b8a, 0x9a3b2f];

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export function tunicRamp(key: string): number[] {
  const r = (P as unknown as Record<string, number[]>)[key];
  return Array.isArray(r) ? r : P.tunicBlue;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
