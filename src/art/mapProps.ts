/**
 * Map props for the parchment maps (docs/ART_STYLE.md §12 "World map"): the
 * shared palette, trees, ships, and hand-composed settlement miniatures
 * drawn with the Pix pipeline. Independent of Phaser and of any map, so the
 * online war map (src/art/parchmentMap.ts) and the offline campaign map can
 * both use them.
 *
 * Everything is top-down 3/4 like the reference: roofs seen from above, the
 * south facade showing, sel-out rims, lavender shadows cast to the south-east.
 *
 * - `settlementProp(kind, name, arch, seed)`: the 7 capitals of the western
 *   Mediterranean have unique layouts (Massalia's acropolis and agora,
 *   Syracuse's theatre and great altar, Rome's hills, forum and circus,
 *   Carthage's Byrsa and circular cothon, New Carthage's hills and Barcid
 *   palace, Gades' temple of Melqart with its pillars, Caralis' citadel and
 *   salt pans); towns follow regional archetypes (Greek colony, Punic port,
 *   Roman town, Etruscan hill town, Iberian oppidum, Celtic/Ligurian
 *   hillfort, Numidian settlement); forts, trading posts, beast lairs
 *   (Etna, the Pillars of Hercules, the Garden of the Hesperides, ...) and
 *   farms. Sprites carry anchor points for animation: chimney smoke, flags,
 *   fires (lighthouses, Etna's crater).
 * - `harbourProp`: quays, piers, moored ships and (for capitals) a lighthouse.
 * - `shipPix`, `merchantPix`, `gullPix`: sailing things.
 */
import { Pix, hash2 } from './pixels';

// ------------------------------------------------------------------ palette

export const MP = {
  // parchment clouds (fog of war)
  parch: 0xfbdfc3,
  parchHi: 0xfff0dc,
  parchLo: 0xf1d5bb,
  parchDot: 0xe8cab3,
  parchRim: 0xe0c0ae,
  fogShadow: 0x7e5d8c,
  fogShadow2: 0x9a7ca4,
  // sea (lavender)
  seaNear: 0xbaa0b8,
  sea1: 0xb197b2,
  sea2: 0xa98fac,
  sea3: 0xa187a6,
  sea4: 0x997fa0,
  seaHi: 0xc4abc2,
  seaLo: 0x9c84a2,
  sparkle: 0xf4e6ee,
  ring: 0x9c7f98,
  shelf: 0xcaafc0,
  shelfLight: 0xe6cbc8,
  foam: 0xf8ebe4,
  // shore
  sand: 0xf7dac3,
  sandHi: 0xfee6cf,
  sandDot: 0xd9b9a2,
  coastInk: 0x7f6270,
  cliff: 0xb89a8c,
  cliffLo: 0x8e7078,
  // grass (sage-straw)
  grass: 0xd3ca8a,
  grassLo: 0xbab271,
  grassDk: 0xa19c5e,
  grassHi: 0xe2d99e,
  grassTop: 0xece3b2,
  lush: 0xc6c37f,
  pale: 0xf4e0c0,
  paleDot: 0xdcc6a2,
  hill: 0xc2b878,
  hillLo: 0xaca266,
  rock: 0xd2bea6,
  rockDot: 0xb9a28c,
  marsh: 0xbcbc8c,
  marshWater: 0xab95b2,
  marshHi: 0xcab8cc,
  reed: 0x7b874c,
  forestFloor: 0xa9aa6a,
  // trees
  leafHi: 0xd2d690,
  leaf: 0xaeb86e,
  leafMid: 0x9aa75e,
  leafDk: 0x818f4e,
  leafRim: 0x5c6a3c,
  pine: 0x7f9458,
  pineDk: 0x5e7246,
  olive: 0xa8b08a,
  oliveDk: 0x7e8a6a,
  shadow: 0x7a6488,
  // mountains
  peakHi: 0xe4cfb8,
  peak: 0xc4aa92,
  peakShade: 0x9a8090,
  peakDeep: 0x7a6474,
  peakRim: 0x5a4652,
  snow: 0xf8eee6,
  snowShade: 0xd8c8d4,
  // mounds
  moundHi: 0xd8cf8e,
  mound: 0xbbb070,
  moundLo: 0x9b9160,
  moundRim: 0x726a44,
  // roads, routes
  road: 0xb39a7a,
  roadDk: 0x957c62,
  naval: 0xc9b0c6,
  route: 0x7fa9a8,
  routeDk: 0x3e5e60,
  plan: 0xfde0ae,
  planDk: 0x7a4a2a,
  // borders, camp
  border: 0x7d7448,
  campBorder: 0xb06030,
  campA: 0xfde0ae,
  campB: 0xaf8370,
  campActive: 0xf2b4a6,
  // buildings
  stone: 0xefd4c6,
  stoneHi: 0xfbe8dc,
  stoneLo: 0xd5b5af,
  stoneDk: 0xa88a88,
  stoneRim: 0x6e5054,
  pave: 0xe9d3c2,
  paveDot: 0xd6bcae,
  teal: 0x86b6ae,
  tealHi: 0xbed4cc,
  tealLo: 0x5e8a86,
  gold: 0xd8b060,
  goldLo: 0xa07a38,
  wood: 0xa07858,
  woodDk: 0x6e4e38,
  ink: 0x4a3622,
  water: 0xb197b2,
  waterHi: 0xcdb6cc,
  ember: 0xe86a3a,
  // plates
  plate: 0xf0dcc4,
  plateHi: 0xfdeedc,
  plateLo: 0xd8bea6,
  plateRim: 0x8e725c,
  plateCap: 0xc8a890,
};

export const mix = (a: number, b: number, t: number): number => {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A tiny seeded generator for sprite layouts. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ vegetation

/** A blob tree: round canopy with a dotted dark rim, lit top-left, dark under-band, SE shadow. */
export function drawTree(p: Pix, cx: number, cy: number, r: number, seed: number, tone = 0): void {
  const hi = tone ? MP.olive : MP.leafHi;
  const base = tone ? mix(MP.olive, MP.oliveDk, 0.4) : MP.leaf;
  const mid = tone ? MP.oliveDk : MP.leafMid;
  const dk = tone ? mix(MP.oliveDk, MP.leafRim, 0.4) : MP.leafDk;
  const r2 = r * r + r * 0.6;
  for (let j = -r; j <= r + 1; j++)
    for (let i = -r; i <= r + 1; i++) if ((i - 1.5) ** 2 + (j - 1.5) ** 2 <= r2) p.set(cx + i + 1, cy + j + 2, MP.shadow, 70);
  for (let j = -r - 1; j <= r + 1; j++)
    for (let i = -r - 1; i <= r + 1; i++) {
      const d2 = i * i + j * j;
      if (d2 > r2 + 2 * r) continue;
      const x = cx + i;
      const y = cy + j;
      if (d2 > r2) {
        if (((x + y) & 1) === 0 || j > r * 0.3) p.set(x, y, MP.leafRim);
        continue;
      }
      const u = (i + j * 1.1) / r;
      let c = base;
      if (j > r * 0.45) c = dk;
      else if (u < -0.75) c = hi;
      else if (u > 0.55) c = mid;
      if (c === base && hash2(x, y, seed) < 0.12) c = mid;
      if (c === hi && hash2(x, y, seed + 1) < 0.2) c = base;
      p.set(x, y, c);
    }
}

/** A tall dark cypress / pine. */
export function drawCypress(p: Pix, cx: number, by: number, h: number): void {
  for (let j = 0; j < 3; j++) p.set(cx + 1 + j, by + 1, MP.shadow, 70);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const half = Math.round(Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) * 1.6);
    for (let x = -half; x <= half; x++) p.set(cx + x, by - h + y, x < 0 ? MP.pine : x > 0 ? MP.pineDk : mix(MP.pine, MP.pineDk, 0.5));
  }
  p.set(cx, by - h - 1, MP.leafRim);
}

/** A date palm (Punic and African towns). */
export function drawPalm(p: Pix, cx: number, by: number, h: number): void {
  for (let y = by - h; y <= by; y++) p.set(cx + ((y - by) % 3 === 0 ? 0 : 0), y, y % 2 ? MP.woodDk : MP.wood);
  const top = by - h;
  const fronds: [number, number][] = [
    [-4, 1], [-3, 0], [-2, -1], [-1, -1], [1, -1], [2, -1], [3, 0], [4, 1], [-3, 2], [3, 2], [0, -2], [-1, 1], [1, 1],
  ];
  for (const [dx, dy] of fronds) p.set(cx + dx, top + dy, dy < 0 ? MP.leafHi : dy > 1 ? MP.leafDk : MP.leaf);
  p.set(cx + 2, by + 1, MP.shadow, 70);
}

// ------------------------------------------------------------------ ships and birds

/** A galley: hull, oars and a sail with a team stripe (faces right; flip for left). */
export function shipPix(team: number, oars = true): Pix {
  const p = new Pix(20, 14);
  for (let i = 1; i < 19; i++) p.set(i, 12, MP.shadow, 80), p.set(i + 1, 13, MP.shadow, 50);
  for (let i = 2; i < 18; i++) {
    const top = i < 4 ? 10 : 9;
    for (let y = top; y <= 11; y++) p.set(i, y, y === 11 ? 0x5e2c22 : y === top ? 0xa8603e : 0x863c2e);
  }
  p.set(18, 9, 0x863c2e), p.set(19, 8, 0x863c2e), p.set(1, 10, 0x863c2e);
  if (oars) for (let i = 4; i < 16; i += 2) p.set(i, 12, 0xc8a070), p.set(i - 1, 13, 0xc8a070);
  p.vline(10, 1, 9, 0x6e4e38);
  for (let y = 2; y <= 7; y++) for (let x = 6; x <= 14; x++) p.set(x, y, y === 4 || y === 5 ? team : x < 9 ? 0xf2ece0 : 0xdfd6c8);
  p.hline(6, 14, 2, 0xfaf4ea);
  p.outline(0x442618);
  return p;
}

/** A round-hulled merchant ship with a big square sail (faces right). */
export function merchantPix(sail = 0xe8dcc8): Pix {
  const p = new Pix(18, 15);
  for (let i = 2; i < 17; i++) p.set(i, 13, MP.shadow, 80);
  for (let i = 2; i < 16; i++) {
    const top = i < 4 || i > 13 ? 10 : 9;
    for (let y = top; y <= 12; y++) p.set(i, y, y === 12 ? 0x5a3a28 : y === top ? 0xb88a5a : 0x946644);
  }
  p.set(16, 8, 0x946644), p.set(16, 9, 0x946644), p.set(1, 9, 0x946644);
  p.vline(9, 0, 9, 0x6e4e38);
  for (let y = 1; y <= 7; y++) for (let x = 5; x <= 13; x++) p.set(x, y, x < 8 ? mix(sail, 0xffffff, 0.3) : x > 11 ? mix(sail, 0x8a6a6a, 0.25) : sail);
  p.hline(5, 13, 1, 0xa0705a);
  p.outline(0x442618);
  return p;
}

/** A gull, two wing frames (0 up, 1 down). */
export function gullPix(frame: number): Pix {
  const p = new Pix(7, 4);
  const c = 0xf8f2ee;
  const d = 0x8a7a88;
  if (frame === 0) {
    p.set(0, 0, d), p.set(1, 1, c), p.set(2, 2, c), p.set(3, 2, d), p.set(4, 2, c), p.set(5, 1, c), p.set(6, 0, d);
  } else {
    p.set(0, 2, d), p.set(1, 1, c), p.set(2, 1, c), p.set(3, 2, d), p.set(4, 1, c), p.set(5, 1, c), p.set(6, 2, d);
  }
  p.set(3, 3, MP.shadow, 60);
  return p;
}

// ------------------------------------------------------------------ fields

/** Crop colours by field kind: wheat, green, ploughed, vineyard, olives. */
export const FIELD_KINDS: [number, number][] = [
  [0xe4cc84, 0xcbae68],
  [0xc8c27a, 0xadaa64],
  [0xc4a07c, 0xa8845e],
  [0xdccca0, 0x8a9a58],
  [0xd8cc98, 0xc0b47c],
];

/** A cultivated field (furrows, a dotted hedge on the south / east edge): wheat / green / ploughed / vineyard / olives. */
export function drawField(p: Pix, x: number, y: number, w: number, h: number, kind: number): void {
  const K = FIELD_KINDS[kind % 5];
  for (let i = -1; i <= w; i++) p.set(x + i, y + h, ((x + i) & 1) === 0 ? 0x9a8656 : K[1]);
  for (let j = -1; j <= h; j++) p.set(x + w, y + j, ((y + j) & 1) === 0 ? 0x9a8656 : K[1]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = j % 2 === 0 ? K[0] : K[1];
      if (kind % 5 === 3) c = j % 3 === 1 && i % 2 === 0 ? K[1] : K[0];
      if (kind % 5 === 4) c = K[0];
      p.set(x + i, y + j, c);
    }
  if (kind % 5 === 4) for (let j = 1; j < h; j += 4) for (let i = 1; i < w; i += 4) drawTree(p, x + i + 1, y + j + 1, 1, x + i, 1);
}

// ------------------------------------------------------------------ settlement art

export type Arch = 'greek' | 'punic' | 'roman' | 'etruscan' | 'iberian' | 'celtic' | 'numidian';

const GREEK = new Set([
  'Massalia', 'Syracusae', 'Emporion', 'Akra Leuke', 'Antipolis', 'Nikaia', 'Alalia', 'Cumae', 'Neapolis', 'Poseidonia', 'Rhegion', 'Messana',
  'Tauromenion', 'Katane', 'Gela', 'Akragas', 'Selinous', 'Agathe', 'Athenopolis', 'Rhode', 'Hemeroskopeion', 'Laos', 'Olbia', 'Henna', 'Mainake',
]);
const PUNIC = new Set([
  'Gades', 'Carthago', 'Carthago Nova', 'Caralis', 'Nora', 'Sulci', 'Tharros', 'Ebusus', 'Mago', 'Palma', 'Pollentia', 'Lilybaeum', 'Panormus', 'Eryx',
  'Segesta', 'Melite', 'Kerkouane', 'Malaca', 'Sexi', 'Baria', 'Utica', 'Hippo Regius', 'Hippo Diarrhytus', 'Hadrumetum', 'Thapsus', 'Rusaddir', 'Siga',
  'Iol', 'Icosium', 'Saldae', 'Rusicade', 'Thabraca', 'Carteia', 'Tingis', 'Kerkouane',
]);
const ETRUSCAN = new Set(['Volaterrae', 'Arretium', 'Perusia', 'Faesulae', 'Tarquinii', 'Caere', 'Populonia', 'Pisae', 'Volsinii', 'Clusium', 'Veii']);

/** Building culture of a place: Greek colonies, Punic ports, Rome and Etruria, native peoples elsewhere. */
export function archOf(name: string, x: number, y: number, coast: boolean): Arch {
  if (GREEK.has(name)) return 'greek';
  if (PUNIC.has(name)) return 'punic';
  if (ETRUSCAN.has(name)) return 'etruscan';
  if ((x > 7300 && y < 1000) || (x > 7900 && y < 3700)) return 'roman';
  if (y > 4300 && x > 4000) return coast ? 'punic' : 'numidian';
  if (y > 5000) return 'numidian';
  if (y > 3900 && x < 3000 && coast) return 'punic';
  if (x > 6800 && y > 1000 && y < 3500) return 'celtic'; // Corsica, Sardinia's interior
  if (y < 1050 && x > 3000) return 'celtic'; // Gaul, Liguria
  return 'iberian';
}

interface Pal {
  wall: number;
  wallLo: number;
  roof: number;
  roofHi: number;
  roofLo: number;
  rim: number;
  cap: number;
  capHi: number;
  capLo: number;
  flat: boolean;
}

const PAL: Record<Arch, Pal> = {
  greek: { wall: MP.stone, wallLo: MP.stoneLo, roof: 0xa88078, roofHi: 0xc8a296, roofLo: 0x84605c, rim: 0x6e4a4a, cap: MP.teal, capHi: MP.tealHi, capLo: MP.tealLo, flat: false },
  roman: { wall: 0xf0dccb, wallLo: 0xd6bcae, roof: 0xc06a50, roofHi: 0xe0906e, roofLo: 0x924838, rim: 0x6a3430, cap: 0xc06a50, capHi: 0xe0906e, capLo: 0x924838, flat: false },
  etruscan: { wall: 0xe4c8a4, wallLo: 0xc4a684, roof: 0xb86848, roofHi: 0xd8906a, roofLo: 0x8a4632, rim: 0x5e3428, cap: 0xb86848, capHi: 0xd8906a, capLo: 0x8a4632, flat: false },
  punic: { wall: 0xe8cdb0, wallLo: 0xcdae94, roof: 0xf4e6d8, roofHi: 0xfff4e8, roofLo: 0xd8c2b0, rim: 0x7a5a4c, cap: 0x9a5a7a, capHi: 0xc088a4, capLo: 0x6e3a58, flat: true },
  iberian: { wall: 0xd4b08a, wallLo: 0xb08e6c, roof: 0xc8a47c, roofHi: 0xe0c49c, roofLo: 0x9e7c5a, rim: 0x5e4430, cap: 0xb07a50, capHi: 0xd09a6a, capLo: 0x8a5a38, flat: true },
  celtic: { wall: 0xb08a62, wallLo: 0x8e6a48, roof: 0xc8a062, roofHi: 0xe0c084, roofLo: 0x9c7642, rim: 0x5e4426, cap: 0xc8a062, capHi: 0xe0c084, capLo: 0x9c7642, flat: false },
  numidian: { wall: 0xdcc09c, wallLo: 0xbca07c, roof: 0xd4b482, roofHi: 0xead09e, roofLo: 0xa88a5e, rim: 0x6a4e34, cap: 0xb07a50, capHi: 0xd09a6a, capLo: 0x8a5a38, flat: false },
};

export interface Pt {
  x: number;
  y: number;
}

export interface PropSprite {
  pix: Pix;
  /** The region's label point inside the sprite. */
  ax: number;
  ay: number;
  /** Chimney / altar smoke sources (sprite px). */
  smoke: Pt[];
  /** Flag poles (top of pole, sprite px) with the cloth colour. */
  flags: (Pt & { c: number })[];
  /** Fires that flicker (lighthouse beacons, Etna's crater). */
  fires: Pt[];
}

/** Drawing context for one prop: the Pix plus animation anchors. */
class Cv {
  readonly p: Pix;
  readonly smoke: Pt[] = [];
  readonly flags: (Pt & { c: number })[] = [];
  readonly fires: Pt[] = [];
  readonly r: () => number;

  constructor(w: number, h: number, seed: number) {
    this.p = new Pix(w, h);
    this.r = rng(seed * 2654435761 + 17);
  }

  done(ax: number, ay: number): PropSprite {
    return { pix: this.p, ax, ay, smoke: this.smoke, flags: this.flags, fires: this.fires };
  }

  shadow(x: number, y: number, w: number, h: number, a = 70): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p.set(x + i, y + j, MP.shadow, a);
  }

  pave(x: number, y: number, w: number, h: number, c = MP.pave, dot = MP.paveDot): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p.set(x + i, y + j, hash2(x + i, y + j, 911) < 0.1 ? dot : c);
  }

  /** Ground texture under a town (beaten earth with grass tufts). */
  ground(x: number, y: number, w: number, h: number, c: number, round = true): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const u = (x + i - cx) / (w / 2);
        const v = (y + j - cy) / (h / 2);
        const d = round ? u * u + v * v : Math.max(Math.abs(u), Math.abs(v)) ** 4;
        const edge = 0.75 + hash2(x + i, y + j, 913) * 0.3;
        if (d > edge) continue;
        const h2 = hash2(x + i, y + j, 912);
        this.p.set(x + i, y + j, h2 < 0.08 ? mix(c, MP.grassDk, 0.4) : h2 > 0.95 ? MP.paveDot : c);
      }
  }

  /** A building: roof (w x d) over a south facade fh high. kind: pitched / flat / court(yard). */
  block(x: number, y: number, w: number, d: number, pal: Pal, kind: 'pitch' | 'flat' | 'court' = pal.flat ? 'flat' : 'pitch', fh = 2, chimney = 0.25): void {
    const p = this.p;
    this.shadow(x + 1, y + 2, w + 2, d + fh + 1);
    p.rect(x - 1, y - 1, w + 2, d + fh + 2, pal.rim);
    if (kind === 'flat') {
      p.rect(x, y, w, d, pal.roof);
      p.hline(x, x + w - 1, y, pal.roofHi);
      p.vline(x, y, y + d - 1, pal.roofHi);
      p.hline(x, x + w - 1, y + d - 1, pal.roofLo);
      p.vline(x + w - 1, y, y + d - 1, pal.roofLo);
      if (w >= 6 && d >= 5 && this.r() < 0.45) p.rect(x + 2, y + 2, w - 4, d - 4, pal.wallLo);
      else if (this.r() < 0.4) p.set(x + 1 + Math.floor(this.r() * (w - 2)), y + 1, pal.rim);
      if (pal === PAL.punic && this.r() < 0.35) p.rect(x + w - 3, y + 1, 2, 2, pal.cap);
    } else if (kind === 'court') {
      p.rect(x, y, w, d, pal.roof);
      p.hline(x, x + w - 1, y, pal.roofHi);
      p.hline(x, x + w - 1, y + 1, pal.roofHi);
      for (let j = y + 2; j < y + d; j += 2) p.hline(x, x + w - 1, j, mix(pal.roof, pal.roofLo, 0.5));
      p.vline(x + w - 1, y, y + d - 1, pal.roofLo);
      if (w >= 7 && d >= 6) {
        p.rect(x + 2, y + 2, w - 4, d - 4, MP.pave);
        p.hline(x + 2, x + w - 3, y + 2, pal.wallLo);
        p.hline(x + 2, x + w - 3, y + 3, pal.wall);
        if (this.r() < 0.4) p.set(x + Math.floor(w / 2), y + d - 3, MP.leafMid);
      }
    } else {
      const vertical = d > w + 2;
      for (let j = y; j < y + d; j++)
        for (let i = x; i < x + w; i++) {
          let c: number;
          if (vertical) c = i < x + w / 2 ? pal.roofHi : pal.roof;
          else {
            const ridge = y + Math.floor(d / 2);
            c = j < ridge ? pal.roofHi : j === ridge ? mix(pal.roofHi, 0xffffff, 0.15) : (i - x) % 2 ? pal.roofLo : pal.roof;
          }
          if (i === x + w - 1) c = pal.roofLo;
          p.set(i, j, c);
        }
    }
    for (let j = 0; j < fh; j++) p.hline(x, x + w - 1, y + d + j, j === fh - 1 ? pal.wallLo : pal.wall);
    for (let i = x + 1; i < x + w - 1; i += 2) if (this.r() < 0.55) p.set(i, y + d, pal.rim);
    p.set(x + Math.floor(w / 2), y + d + fh - 1, pal.rim);
    if (this.r() < chimney) this.smoke.push({ x: x + 1 + Math.floor(this.r() * Math.max(1, w - 2)), y });
  }

  /** A round hut (thatch). */
  hut(cx: number, cy: number, rr: number, pal: Pal, oval = 1): void {
    const p = this.p;
    const rx = rr * oval;
    for (let j = -rr; j <= rr + 2; j++) for (let i = -rx; i <= rx + 2; i++) if ((i / (rx + 1)) ** 2 + (j / (rr + 1)) ** 2 <= 1) p.set(cx + i + 1, cy + j + 2, MP.shadow, 70);
    for (let j = -rr - 1; j <= rr + 1; j++)
      for (let i = -Math.ceil(rx) - 1; i <= Math.ceil(rx) + 1; i++) {
        const d = (i / (rx + 1)) ** 2 + (j / (rr + 1)) ** 2;
        if (d > 1) continue;
        if ((i / Math.max(0.5, rx)) ** 2 + (j / Math.max(0.5, rr)) ** 2 > 1) p.set(cx + i, cy + j, pal.rim);
        else p.set(cx + i, cy + j, i + j < -rr * 0.4 ? pal.roofHi : i + j > rr * 0.6 ? pal.roofLo : (i * 3 + j * 5) % 4 === 0 ? pal.roofLo : pal.roof);
      }
    p.set(cx, cy, pal.roofLo);
    p.set(cx, cy + rr, 0x3e2a20);
    if (this.r() < 0.3) this.smoke.push({ x: cx, y: cy - 1 });
  }

  /** A columned temple on a stepped base; roof colour from `roof`. */
  temple(x: number, y: number, w: number, d: number, roof: [number, number, number], altar = true): void {
    const p = this.p;
    const [base, hi, lo] = roof;
    this.shadow(x, y + 2, w + 5, d + 9);
    // stylobate (steps)
    p.rect(x - 3, y - 3, w + 6, d + 10, MP.stoneRim);
    p.rect(x - 2, y - 2, w + 4, d + 8, MP.stoneLo);
    p.hline(x - 2, x + w + 1, y - 2, MP.stoneHi);
    p.hline(x - 2, x + w + 1, y + d + 5, MP.stone);
    p.hline(x - 2, x + w + 1, y + d + 6, MP.stoneLo);
    p.hline(x - 1, x + w, y + d + 4, MP.stone);
    // side columns (peristyle)
    for (let j = y; j < y + d + 4; j += 2) p.set(x - 1, j, MP.stoneHi), p.set(x + w, j, MP.stone);
    // roof
    for (let j = 0; j < d; j++)
      for (let i = 0; i < w; i++) {
        let c = j < d / 2 ? hi : base;
        if (j === Math.floor(d / 2)) c = mix(hi, 0xffffff, 0.2);
        if (j > d / 2 && i % 3 === 2) c = lo;
        if (i === w - 1 || i === 0) c = j < d / 2 ? base : lo;
        p.set(x + i, y + j, c);
      }
    // south front: entablature + columns
    p.hline(x, x + w - 1, y + d, MP.stoneHi);
    for (let j = 1; j < 4; j++) for (let i = 0; i < w; i++) p.set(x + i, y + d + j, i % 2 === 0 ? MP.stone : mix(MP.stoneDk, MP.shadow, 0.3));
    if (altar) {
      p.rect(x + Math.floor(w / 2) - 1, y + d + 8, 3, 2, MP.stoneLo);
      this.smoke.push({ x: x + Math.floor(w / 2), y: y + d + 8 });
    }
  }

  /** A long colonnade (stoa) facing south. */
  stoa(x: number, y: number, w: number, pal: Pal): void {
    const p = this.p;
    this.shadow(x, y + 2, w + 2, 9);
    p.rect(x - 1, y - 1, w + 2, 9, MP.stoneRim);
    for (let j = 0; j < 4; j++) p.hline(x, x + w - 1, y + j, j < 2 ? pal.roofHi : pal.roof);
    p.hline(x, x + w - 1, y + 4, MP.stoneHi);
    for (let j = 5; j < 7; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, i % 2 === 0 ? MP.stone : MP.stoneDk);
  }

  /** A Greek/Roman theatre: semicircular cavea opening south, orchestra, stage. */
  theatre(cx: number, cy: number, r: number): void {
    const p = this.p;
    for (let j = -r - 1; j <= 1; j++)
      for (let i = -r - 1; i <= r + 1; i++) {
        const d = Math.hypot(i, j);
        if (d > r + 1) continue;
        let c: number;
        if (d > r) c = MP.stoneRim;
        else if (d < r * 0.32) c = MP.pave;
        else if (d < r * 0.38) c = MP.stoneDk;
        else c = Math.floor(d / 2) % 2 ? MP.stone : MP.stoneLo;
        if (d >= r * 0.38 && d <= r && Math.abs(i) < 1) c = MP.stoneDk; // stair
        p.set(cx + i, cy + j, c);
      }
    p.rect(cx - Math.round(r * 0.8), cy + 2, Math.round(r * 1.6), 3, MP.stoneLo);
    p.hline(cx - Math.round(r * 0.8), cx + Math.round(r * 0.8) - 1, cy + 2, MP.stoneHi);
    this.shadow(cx - Math.round(r * 0.8) + 1, cy + 5, Math.round(r * 1.6), 2);
  }

  /** A rocky or grassy hill (acropolis, Roman hills). */
  hill(cx: number, cy: number, rx: number, ry: number, grassy: boolean): void {
    const p = this.p;
    for (let j = -ry; j <= ry + 3; j++) for (let i = -rx; i <= rx + 4; i++) if (((i - 3) / rx) ** 2 + ((j - 3) / ry) ** 2 <= 1) p.set(cx + i, cy + j, MP.shadow, 60);
    for (let j = -ry; j <= ry; j++)
      for (let i = -rx; i <= rx; i++) {
        const u = i / rx;
        const v = j / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        const lit = u + v * 1.2;
        let c: number;
        if (grassy) c = d > 0.8 ? (lit > 0.3 ? MP.moundLo : MP.mound) : lit < -0.5 ? MP.moundHi : lit > 0.5 ? MP.mound : mix(MP.mound, MP.moundHi, 0.4);
        else c = d > 0.75 ? (lit > 0.2 ? MP.peakShade : MP.peak) : lit < -0.5 ? MP.peakHi : lit > 0.6 ? MP.peak : mix(MP.peak, MP.peakHi, 0.5);
        if (d > 0.93) c = lit > 0 ? (grassy ? MP.moundRim : MP.peakRim) : grassy ? MP.moundLo : MP.peakShade;
        if (hash2(cx + i, cy + j, 77) < 0.06) c = mix(c, grassy ? MP.grassDk : MP.peakDeep, 0.5);
        p.set(cx + i, cy + j, c);
      }
  }

  /** A thick wall along a polyline (top + south face + rim), with towers at the corners. */
  wall(pts: [number, number][], closed: boolean, towerCap: Pal | null, round = false, wallPal: [number, number, number] = [MP.stone, MP.stoneLo, MP.stoneRim]): void {
    const p = this.p;
    const [top, face, rim] = wallPal;
    const segs: [number, number, number, number][] = [];
    for (let i = 1; i < pts.length; i++) segs.push([...pts[i - 1], ...pts[i]]);
    if (closed) segs.push([...pts[pts.length - 1], ...pts[0]]);
    const stamp = (x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let k = 0; k <= n; k++) fn(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n));
    };
    for (const s of segs) stamp(...s, (x, y) => this.shadow(x + 1, y + 3, 3, 2, 50));
    for (const s of segs) stamp(...s, (x, y) => p.rect(x - 2, y - 2, 5, 6, rim));
    for (const s of segs) stamp(...s, (x, y) => p.rect(x - 1, y + 1, 3, 2, face));
    for (const s of segs)
      stamp(...s, (x, y) => {
        p.rect(x - 1, y - 1, 3, 2, top);
        if ((x + y) % 3 === 0) p.set(x, y - 2, top); // crenels
      });
    if (towerCap) for (const [x, y] of pts) (round ? this.roundTower(x, y - 3, towerCap) : this.tower(x - 3, y - 6, towerCap));
  }

  /** A square tower with a capped roof (and sometimes a flag). */
  tower(x: number, y: number, pal: Pal, flag = 0): void {
    const p = this.p;
    this.shadow(x + 1, y + 2, 8, 10);
    p.rect(x - 1, y - 1, 8, 12, MP.stoneRim);
    const pointed = !pal.flat;
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 6; i++) {
        let c = pal.cap;
        if (pointed) c = i + j < 4 ? pal.capHi : i > 3 || j > 3 ? pal.capLo : pal.cap;
        else c = j === 0 || i === 0 ? pal.capHi : j === 4 || i === 5 ? pal.capLo : pal.cap;
        p.set(x + i, y + j, c);
      }
    p.rect(x, y + 5, 6, 5, pal === PAL.celtic || pal === PAL.numidian ? pal.wall : MP.stone);
    p.vline(x + 5, y + 5, y + 9, MP.stoneLo);
    p.set(x + 2, y + 7, MP.stoneRim);
    p.set(x + 3, y + 7, MP.stoneRim);
    if (flag) this.flags.push({ x: x + 3, y: y - 6, c: flag }), p.vline(x + 3, y - 6, y - 1, MP.woodDk);
  }

  roundTower(cx: number, cy: number, pal: Pal): void {
    const p = this.p;
    this.shadow(cx - 1, cy + 2, 8, 8);
    for (let j = -4; j <= 4; j++)
      for (let i = -4; i <= 4; i++) {
        const d = i * i + j * j;
        if (d > 17) continue;
        p.set(cx + i, cy + j, d > 12 ? MP.stoneRim : i + j < -2 ? pal.capHi : i + j > 2 ? pal.capLo : pal.cap);
      }
    p.rect(cx - 3, cy + 4, 7, 3, pal.wall);
    p.hline(cx - 3, cx + 3, cy + 6, pal.wallLo);
    p.hline(cx - 4, cx + 4, cy + 7, MP.stoneRim);
  }

  /** A gate in a south wall at x. */
  gate(x: number, y: number): void {
    const p = this.p;
    p.rect(x - 3, y - 2, 7, 6, MP.stoneRim);
    p.rect(x - 2, y - 1, 5, 5, 0x4a3438);
    p.rect(x - 1, y, 3, 4, 0x2e2026);
  }

  /** A cultivated field: wheat / green / ploughed / vineyard / olives. */
  field(x: number, y: number, w: number, h: number, kind: number): void {
    drawField(this.p, x, y, w, h, kind);
  }

  /** A pier from (x, y) along (dx, dy). */
  pier(x: number, y: number, dx: number, dy: number, len: number): void {
    const p = this.p;
    const nx = -dy;
    const ny = dx;
    for (let k = 0; k < len; k++) {
      const px = Math.round(x + dx * k);
      const py = Math.round(y + dy * k);
      p.set(px + 1, py + 2, MP.shadow, 80);
      p.set(px, py, MP.wood);
      p.set(Math.round(px + nx), Math.round(py + ny), k % 3 === 0 ? MP.woodDk : mix(MP.wood, MP.woodDk, 0.4));
    }
  }

  /** A stone quay along a horizontal / vertical line. */
  quay(x: number, y: number, w: number, h: number): void {
    const p = this.p;
    p.rect(x, y, w, h, MP.stoneLo);
    p.hline(x, x + w - 1, y, MP.stoneHi);
    p.hline(x, x + w - 1, y + h - 1, MP.stoneRim);
    for (let i = x; i < x + w; i += 4) p.set(i, y + 1, MP.stoneDk);
  }

  /** A lighthouse with a beacon. */
  lighthouse(x: number, y: number): void {
    const p = this.p;
    this.shadow(x + 2, y + 4, 10, 12);
    p.rect(x - 1, y + 6, 10, 9, MP.stoneRim);
    p.rect(x, y + 7, 8, 7, MP.stone);
    p.vline(x + 7, y + 7, y + 13, MP.stoneLo);
    p.rect(x + 1, y - 2, 6, 9, MP.stoneRim);
    p.rect(x + 2, y - 1, 4, 8, MP.stoneHi);
    p.vline(x + 5, y - 1, y + 6, MP.stoneLo);
    p.rect(x + 2, y - 4, 4, 2, MP.ember);
    this.fires.push({ x: x + 3, y: y - 5 });
  }

  /** A moored ship sprite. */
  ship(x: number, y: number, flip: boolean, kind: 'galley' | 'merchant', col = 0xa12735): void {
    const s = kind === 'galley' ? shipPix(col) : merchantPix();
    this.p.blit(s, x, y, flip);
  }

  /** A pond / harbour water area (ellipse), with a stone rim. */
  water(cx: number, cy: number, rx: number, ry: number, rim = true): void {
    const p = this.p;
    for (let j = -ry - 1; j <= ry + 1; j++)
      for (let i = -rx - 1; i <= rx + 1; i++) {
        const d = (i / (rx + 0.5)) ** 2 + (j / (ry + 0.5)) ** 2;
        if (d > 1.12) continue;
        if (d > 1) {
          if (rim) p.set(cx + i, cy + j, j < 0 ? MP.stoneLo : MP.stone);
        } else p.set(cx + i, cy + j, j < -ry * 0.6 ? MP.seaLo : hash2(cx + i, cy + j, 31) < 0.05 ? MP.waterHi : MP.water);
      }
  }

  /** A grid quarter of houses between streets, skipping reserved boxes. */
  quarter(x0: number, y0: number, x1: number, y1: number, pal: Pal, opts: { bw?: number; bh?: number; court?: number; skip?: [number, number, number, number][]; trees?: number } = {}): void {
    const bw = opts.bw ?? 14;
    const bh = opts.bh ?? 12;
    const court = opts.court ?? 0.3;
    const skip = opts.skip ?? [];
    const hit = (x: number, y: number, w: number, h: number) => skip.some(([sx, sy, sw, sh]) => x < sx + sw && x + w > sx && y < sy + sh && y + h > sy);
    let row = 0;
    for (let y = y0; y + 6 <= y1; y += bh, row++)
      for (let x = x0 + (row % 2 ? Math.floor(bw / 3) : 0); x + 5 <= x1; ) {
        // irregular plots: some double width, some narrow, a lane now and then
        const span = this.r() < 0.18 ? 2 : 1;
        const bwx = bw * span - (this.r() < 0.3 ? 2 : 0);
        const w = Math.min(bwx - 3, x1 - x - 1);
        const d = bh - 5 - (this.r() < 0.3 ? 1 : 0);
        const xx = x;
        x += bwx + (this.r() < 0.12 ? 3 : 0);
        if (w < 4 || hit(xx - 1, y - 1, w + 2, d + 4)) continue;
        const roll = this.r();
        if (roll < (opts.trees ?? 0.06)) {
          // a garden plot
          this.pave(xx, y, w, d + 1, mix(MP.grass, MP.pave, 0.3), MP.grassDk);
          drawTree(this.p, xx + Math.floor(w / 2), y + 3, 2 + Math.floor(this.r() * 2), xx * 7 + y);
          continue;
        }
        if (roll < court + 0.06 && w >= 8 && d >= 6) this.block(xx, y, w, d, pal, 'court');
        else if (w >= 9 && this.r() < 0.6) {
          // two houses side by side
          const a = Math.floor(w / 2) - 1;
          this.block(xx, y + 1, a, d - 1 - Math.floor(this.r() * 2), pal);
          this.block(xx + a + 2, y + Math.floor(this.r() * 2), w - a - 2, d - 1, pal);
        } else this.block(xx, y + (this.r() < 0.3 ? 1 : 0), w, d - (this.r() < 0.3 ? 1 : 0), pal);
      }
  }
}

const TEAL: [number, number, number] = [MP.teal, MP.tealHi, MP.tealLo];
const TERRA: [number, number, number] = [0xc06a50, 0xe0906e, 0x924838];
const PURPLE: [number, number, number] = [0x9a5a7a, 0xc088a4, 0x6e3a58];
const GOLDR: [number, number, number] = [MP.gold, 0xf0d088, MP.goldLo];

// ------------------------------------------------------------------ capitals

function massalia(seed: number): PropSprite {
  const c = new Cv(176, 150, seed);
  const pal = PAL.greek;
  c.ground(4, 6, 168, 140, MP.pave, false);
  // acropolis with the temples of Artemis and Apollo
  c.hill(42, 40, 36, 26, false);
  c.temple(22, 24, 30, 11, TEAL);
  c.temple(58, 34, 16, 7, TEAL, false);
  drawCypress(c.p, 16, 52, 7);
  drawCypress(c.p, 72, 52, 6);
  // the walls
  c.wall(
    [
      [8, 14],
      [92, 6],
      [166, 14],
      [170, 76],
      [160, 138],
      [96, 142],
      [24, 136],
      [6, 84],
    ],
    true,
    pal,
  );
  c.gate(96, 142);
  // agora with a stoa, a theatre, the town
  c.pave(92, 70, 40, 26);
  c.stoa(92, 62, 40, pal);
  c.p.rect(110, 80, 3, 3, MP.stoneDk), c.p.set(111, 79, MP.stoneHi);
  c.flags.push({ x: 111, y: 72, c: 0xa12735 });
  c.theatre(40, 112, 18);
  c.quarter(90, 16, 164, 60, pal, { court: 0.45 });
  c.quarter(136, 66, 166, 136, pal, { court: 0.4 });
  c.quarter(64, 100, 134, 138, pal, { court: 0.4 });
  c.quarter(12, 70, 86, 92, pal, { skip: [[0, 0, 80, 70]] });
  drawTree(c.p, 100, 92, 3, 5);
  drawTree(c.p, 126, 92, 3, 6);
  c.tower(160, 6, pal, 0xa12735);
  return c.done(96, 84);
}

function syracusae(seed: number): PropSprite {
  const c = new Cv(180, 146, seed);
  const pal = PAL.greek;
  c.ground(4, 6, 172, 136, MP.pave, false);
  // Euryalus fortress to the west
  c.wall(
    [
      [6, 30],
      [36, 18],
      [44, 46],
      [16, 56],
    ],
    true,
    pal,
  );
  c.block(18, 30, 16, 10, pal, 'court', 3);
  c.flags.push({ x: 28, y: 22, c: 0x3d5a78 });
  // the great theatre cut into the hill, the altar of Hieron
  c.hill(70, 52, 30, 20, true);
  c.theatre(70, 56, 22);
  c.p.rect(42, 84, 60, 6, MP.stoneRim);
  c.p.rect(43, 85, 58, 4, MP.stone);
  c.p.hline(43, 100, 85, MP.stoneHi);
  for (let i = 46; i < 100; i += 6) c.smoke.length < 2 && c.smoke.push({ x: i + 20, y: 85 });
  // Ortygia: the temple of Athena by the sea
  c.temple(118, 96, 36, 13, TEAL);
  c.temple(126, 70, 18, 7, TEAL, false);
  c.quarter(100, 14, 172, 64, pal, { court: 0.5 });
  c.quarter(10, 96, 110, 140, pal, { court: 0.45, skip: [[40, 80, 64, 12]] });
  c.wall(
    [
      [48, 10],
      [174, 12],
      [176, 140],
      [8, 142],
      [6, 64],
    ],
    false,
    pal,
  );
  c.gate(92, 142);
  drawCypress(c.p, 112, 108, 7);
  c.tower(168, 4, pal, 0x3d5a78);
  return c.done(96, 80);
}

function roma(seed: number): PropSprite {
  const c = new Cv(184, 156, seed);
  const pal = PAL.roman;
  c.ground(4, 6, 176, 146, mix(MP.pave, MP.grass, 0.25), true);
  // the Tiber along the west, with a bridge
  for (let y = 0; y < 156; y++) {
    const x = Math.round(16 + Math.sin(y / 22) * 8);
    for (let i = -4; i <= 4; i++) c.p.set(x + i, y, Math.abs(i) === 4 ? MP.sandDot : i < -1 ? MP.seaLo : MP.water);
  }
  c.p.rect(8, 92, 22, 4, MP.stoneLo), c.p.hline(8, 29, 92, MP.stoneHi);
  // hills: Capitoline, Palatine, Aventine, Esquiline, Quirinal
  c.hill(56, 46, 18, 13, true);
  c.hill(84, 98, 24, 15, true);
  c.hill(58, 130, 18, 12, true);
  c.hill(150, 64, 24, 16, true);
  c.hill(132, 28, 22, 12, true);
  // Capitoline temple of Jupiter
  c.temple(44, 34, 24, 10, TERRA);
  // Palatine palace (courtyards)
  c.block(70, 90, 28, 12, pal, 'court', 3);
  // Circus Maximus between Palatine and Aventine
  const cx0 = 70;
  const cy0 = 120;
  c.p.rect(cx0 - 2, cy0 - 2, 76, 18, MP.stoneRim);
  for (let j = 0; j < 14; j++) for (let i = 0; i < 72; i++) c.p.set(cx0 + i, cy0 + j, j < 3 || j > 10 || i < 3 || i > 68 ? (j % 2 ? MP.stone : MP.stoneLo) : MP.sand);
  c.p.hline(cx0 + 10, cx0 + 62, cy0 + 7, MP.stoneDk);
  c.p.set(cx0 + 36, cy0 + 6, MP.gold);
  // the Forum: paved, a basilica, a temple
  c.pave(76, 54, 46, 26);
  c.block(78, 56, 24, 6, pal, 'pitch', 3);
  c.temple(106, 60, 12, 6, TERRA);
  c.stoa(78, 70, 40, pal);
  // insulae
  c.quarter(36, 64, 72, 88, pal, { court: 0.3 });
  c.quarter(110, 88, 176, 116, pal, { court: 0.35 });
  c.quarter(80, 6, 176, 48, pal, { court: 0.35, skip: [[110, 14, 46, 28]] });
  c.quarter(126, 40, 176, 86, pal, { court: 0.35 });
  // Servian wall
  c.wall(
    [
      [30, 22],
      [92, 4],
      [172, 10],
      [180, 92],
      [158, 150],
      [36, 152],
      [30, 100],
    ],
    false,
    pal,
  );
  c.gate(100, 152);
  c.tower(172, 2, pal, 0xa12735);
  c.flags.push({ x: 56, y: 26, c: 0xa12735 });
  drawCypress(c.p, 40, 50, 7);
  drawCypress(c.p, 98, 112, 6);
  return c.done(100, 80);
}

function carthago(seed: number): PropSprite {
  const c = new Cv(180, 156, seed);
  const pal = PAL.punic;
  c.ground(4, 6, 172, 146, mix(MP.pave, MP.sand, 0.4), true);
  // Byrsa hill with the temple of Eshmun
  c.hill(62, 52, 34, 24, false);
  c.temple(46, 36, 30, 10, PURPLE);
  c.p.rect(58, 62, 6, 10, MP.stone);
  for (let j = 62; j < 72; j += 2) c.p.hline(58, 63, j, MP.stoneLo);
  // dense white town
  c.quarter(110, 8, 172, 70, pal, { bw: 11, bh: 10, trees: 0.06 });
  c.quarter(10, 8, 30, 76, pal, { bw: 11, bh: 10 });
  c.quarter(116, 80, 174, 150, pal, { bw: 11, bh: 10, trees: 0.06 });
  c.quarter(10, 82, 40, 150, pal, { bw: 11, bh: 10 });
  // the cothon: rectangular merchant harbour then the circular war harbour with its island
  const hx = 78;
  const hy = 118;
  c.water(hx, hy - 30, 20, 6);
  c.water(hx, hy, 28, 24);
  for (let a = 0; a < 56; a++) {
    const t = (a / 56) * Math.PI * 2;
    const x = Math.round(hx + Math.cos(t) * 25);
    const y = Math.round(hy + Math.sin(t) * 21);
    c.p.rect(x - 1, y - 1, 2, 2, a % 2 ? MP.stone : MP.stoneLo);
  }
  c.water(hx, hy, 11, 9, false);
  c.p.rect(hx - 8, hy - 6, 17, 12, MP.stoneRim);
  c.p.rect(hx - 7, hy - 5, 15, 10, MP.stone);
  c.block(hx - 4, hy - 4, 9, 4, pal, 'flat', 2, 0);
  c.flags.push({ x: hx, y: hy - 12, c: 0x9a5a7a });
  c.ship(hx - 26, hy, false, 'galley', 0x9a5a7a);
  c.ship(hx + 6, hy + 8, true, 'galley', 0x9a5a7a);
  c.ship(hx - 16, hy - 36, false, 'merchant');
  // the tophet with its stelae
  for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) c.p.set(156 + i * 2, 54 + j * 2, MP.stoneDk);
  c.smoke.push({ x: 160, y: 52 });
  // the triple land wall on the west
  c.wall(
    [
      [6, 10],
      [6, 150],
    ],
    false,
    pal,
    true,
  );
  c.wall(
    [
      [12, 8],
      [100, 4],
      [174, 10],
    ],
    false,
    pal,
    true,
  );
  for (const [x, y] of [
    [36, 84],
    [92, 76],
    [100, 140],
  ])
    drawPalm(c.p, x, y, 9);
  return c.done(90, 84);
}

function carthagoNova(seed: number): PropSprite {
  const c = new Cv(168, 140, seed);
  const pal = PAL.punic;
  c.ground(4, 6, 160, 130, mix(MP.pave, MP.sand, 0.4), true);
  // a lagoon to the north, five hills
  c.water(90, 18, 40, 10, false);
  c.hill(36, 50, 22, 16, false);
  c.hill(130, 54, 22, 16, false);
  c.hill(84, 92, 28, 18, false);
  // the Barcid palace on the highest hill
  c.block(68, 80, 32, 14, pal, 'court', 3);
  c.flags.push({ x: 84, y: 72, c: 0x9a5a7a });
  c.temple(26, 38, 20, 8, PURPLE);
  c.temple(120, 42, 18, 8, GOLDR);
  c.quarter(8, 70, 60, 132, pal, { bw: 11, bh: 10 });
  c.quarter(106, 74, 162, 132, pal, { bw: 11, bh: 10 });
  c.quarter(52, 34, 106, 66, pal, { bw: 11, bh: 10 });
  c.wall(
    [
      [6, 34],
      [40, 24],
      [140, 26],
      [164, 40],
      [162, 134],
      [8, 134],
    ],
    true,
    pal,
    true,
  );
  c.gate(84, 134);
  drawPalm(c.p, 64, 120, 9);
  drawPalm(c.p, 104, 70, 8);
  return c.done(84, 86);
}

function gades(seed: number): PropSprite {
  const c = new Cv(176, 110, seed);
  const pal = PAL.punic;
  c.ground(4, 10, 168, 96, mix(MP.pave, MP.sand, 0.5), true);
  // temple of Melqart at the eastern tip, with its two bronze pillars
  c.temple(128, 34, 30, 12, GOLDR);
  for (const x of [134, 152]) {
    c.shadow(x + 1, 68, 3, 6);
    c.p.rect(x - 1, 52, 4, 16, MP.goldLo);
    c.p.rect(x, 53, 2, 14, MP.gold);
    c.p.set(x, 53, 0xf8e0a0);
    c.fires.push({ x: x + 1, y: 50 });
  }
  c.quarter(12, 20, 120, 98, pal, { bw: 11, bh: 10, trees: 0.03 });
  c.temple(30, 26, 18, 7, PURPLE);
  c.wall(
    [
      [6, 18],
      [120, 10],
      [170, 26],
      [172, 90],
      [120, 104],
      [8, 100],
    ],
    true,
    pal,
    true,
  );
  drawPalm(c.p, 124, 84, 9);
  drawPalm(c.p, 162, 70, 8);
  return c.done(74, 60);
}

function caralis(seed: number): PropSprite {
  const c = new Cv(170, 136, seed);
  const pal = PAL.punic;
  c.ground(4, 6, 162, 126, mix(MP.pave, MP.sand, 0.4), true);
  // the citadel on its limestone hill
  c.hill(56, 44, 40, 28, false);
  c.wall(
    [
      [30, 26],
      [80, 22],
      [86, 54],
      [32, 60],
    ],
    true,
    pal,
    true,
  );
  c.temple(44, 32, 22, 8, PURPLE);
  c.flags.push({ x: 82, y: 14, c: 0x9a5a7a });
  // the town down to the lagoon
  c.quarter(10, 76, 112, 128, pal, { bw: 11, bh: 10 });
  c.quarter(96, 10, 162, 70, pal, { bw: 11, bh: 10 });
  // salt pans
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 4; i++) {
      const x = 118 + i * 11;
      const y = 82 + j * 14;
      c.p.rect(x - 1, y - 1, 11, 12, MP.stoneLo);
      c.p.rect(x, y, 9, 10, (i + j) % 3 === 0 ? 0xf8f0ee : (i + j) % 3 === 1 ? 0xe8c8d0 : MP.waterHi);
    }
  drawPalm(c.p, 18, 70, 8);
  drawPalm(c.p, 104, 74, 8);
  return c.done(70, 80);
}

// ------------------------------------------------------------------ towns

function greekTown(c: Cv, pal: Pal, W: number, H: number): void {
  c.ground(2, 4, W - 4, H - 6, MP.pave, false);
  const tx = 6 + Math.floor(c.r() * 20);
  c.temple(tx, 10, 20, 8, TEAL);
  c.pave(W / 2 - 4, H / 2, 22, 12);
  c.stoa(W / 2 - 4, H / 2 - 7, 22, pal);
  c.quarter(4, H / 2 + 14, W - 6, H - 6, pal, { court: 0.45, bw: 12, bh: 11 });
  c.quarter(tx + 26, 8, W - 6, H / 2 - 10, pal, { court: 0.45, bw: 12, bh: 11 });
  c.quarter(4, 30, W / 2 - 8, H / 2 + 12, pal, { court: 0.35, bw: 12, bh: 11 });
  if (c.r() < 0.5) c.theatre(W - 18, H / 2 + 6, 10);
  c.wall(
    [
      [2, 6],
      [W - 3, 4],
      [W - 2, H - 4],
      [3, H - 3],
    ],
    true,
    pal,
  );
}

function punicTown(c: Cv, pal: Pal, W: number, H: number): void {
  c.ground(2, 4, W - 4, H - 6, mix(MP.pave, MP.sand, 0.5), true);
  c.temple(W / 2 - 9, 8, 18, 7, PURPLE);
  c.quarter(6, 30, W - 6, H - 4, pal, { bw: 10, bh: 9, trees: 0.03 });
  c.quarter(6, 8, W / 2 - 12, 30, pal, { bw: 10, bh: 9 });
  c.quarter(W / 2 + 12, 8, W - 6, 30, pal, { bw: 10, bh: 9 });
  for (let i = 0; i < 3; i++) drawPalm(c.p, 8 + Math.floor(c.r() * (W - 16)), 20 + Math.floor(c.r() * (H - 24)), 7 + Math.floor(c.r() * 3));
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) c.p.set(W - 14 + i * 2, H - 12 + j * 2, MP.stoneDk);
}

function romanTown(c: Cv, pal: Pal, W: number, H: number): void {
  c.ground(2, 4, W - 4, H - 6, mix(MP.pave, MP.grass, 0.2), false);
  // forum with a podium temple
  c.pave(W / 2 - 14, H / 2 - 10, 28, 18);
  c.temple(W / 2 - 6, H / 2 - 22, 12, 6, TERRA);
  c.block(W / 2 - 14, H / 2 + 2, 28, 4, pal, 'pitch', 2, 0);
  c.quarter(5, 8, W / 2 - 18, H - 6, pal, { court: 0.4, bw: 12, bh: 11 });
  c.quarter(W / 2 + 16, 8, W - 6, H - 6, pal, { court: 0.4, bw: 12, bh: 11 });
  c.quarter(W / 2 - 14, H / 2 + 12, W / 2 + 14, H - 6, pal, { court: 0.4, bw: 12, bh: 11 });
  c.wall(
    [
      [3, 5],
      [W - 3, 5],
      [W - 3, H - 3],
      [3, H - 3],
    ],
    true,
    pal,
  );
  c.gate(W / 2, H - 3);
}

function etruscanTown(c: Cv, pal: Pal, W: number, H: number): void {
  c.hill(W / 2, H / 2, W / 2 - 3, H / 2 - 4, false);
  c.temple(W / 2 - 8, 12, 16, 8, TERRA);
  c.quarter(10, 30, W - 10, H - 10, pal, { court: 0.25, bw: 11, bh: 10, trees: 0.1 });
  const pts: [number, number][] = [];
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    pts.push([Math.round(W / 2 + Math.cos(t) * (W / 2 - 5)), Math.round(H / 2 + Math.sin(t) * (H / 2 - 6))]);
  }
  c.wall(pts, true, null, false, [0xe4c8a4, 0xc4a684, 0x5e3428]);
  // tumulus tombs outside
  for (const [x, y] of [
    [6, H - 6],
    [W - 8, H - 8],
  ])
    c.hill(x, y, 5, 4, true);
}

function iberianTown(c: Cv, pal: Pal, W: number, H: number): void {
  c.hill(W / 2, H / 2 + 2, W / 2 - 4, H / 2 - 5, true);
  for (let y = 12; y < H - 10; y += 9) {
    for (let x = 10; x < W - 12; ) {
      const w = 6 + Math.floor(c.r() * 6);
      c.block(x, y, w, 4, pal, 'flat', 2);
      x += w + 2;
    }
  }
  const pts: [number, number][] = [];
  for (let a = 0; a < 9; a++) {
    const t = (a / 9) * Math.PI * 2 + 0.3;
    pts.push([Math.round(W / 2 + Math.cos(t) * (W / 2 - 4)), Math.round(H / 2 + 2 + Math.sin(t) * (H / 2 - 5))]);
  }
  c.wall(pts, true, null, false, [0xd8bc98, 0xb8987a, 0x5e4430]);
  c.roundTower(W - 10, 10, pal);
  c.flags.push({ x: W - 10, y: 2, c: 0xc8762a });
}

function celticTown(c: Cv, pal: Pal, W: number, H: number): void {
  const cx = W / 2;
  const cy = H / 2;
  // earth ramparts with a palisade
  for (const [rx, ry] of [
    [W / 2 - 2, H / 2 - 2],
    [W / 2 - 7, H / 2 - 7],
  ])
    for (let a = 0; a < 260; a++) {
      const t = (a / 260) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(t) * rx);
      const y = Math.round(cy + Math.sin(t) * ry);
      if (y > cy + ry - 3 && Math.abs(x - cx) < 4) continue;
      c.p.set(x, y, 0x9a7e56);
      c.p.set(x, y + 1, 0x7a6040);
      if (a % 3 === 0) c.p.set(x, y - 1, pal.rim);
    }
  for (let i = 0; i < 9; i++) {
    const t = c.r() * Math.PI * 2;
    const d = c.r() * 0.7;
    c.hut(Math.round(cx + Math.cos(t) * (W / 2 - 12) * d), Math.round(cy + Math.sin(t) * (H / 2 - 12) * d), 3 + Math.floor(c.r() * 2), pal);
  }
  c.hut(Math.round(cx), Math.round(cy) - 2, 5, pal);
  c.flags.push({ x: Math.round(cx) + 6, y: Math.round(cy) - 12, c: 0x3d5a78 });
  c.p.vline(Math.round(cx) + 6, Math.round(cy) - 12, Math.round(cy) - 4, MP.woodDk);
}

function numidianTown(c: Cv, pal: Pal, W: number, H: number): void {
  c.ground(2, 4, W - 4, H - 6, mix(MP.sand, MP.grass, 0.3), true);
  for (let i = 0; i < 9; i++) {
    const x = 8 + Math.floor(c.r() * (W - 16));
    const y = 8 + Math.floor(c.r() * (H - 16));
    c.hut(x, y, 3 + Math.floor(c.r() * 2), pal, 1.4);
  }
  // a stepped royal mausoleum
  const mx = W - 16;
  const my = 12;
  for (let k = 0; k < 4; k++) {
    c.p.rect(mx - 7 + k * 2, my - 3 + k, 14 - k * 4, 2, k % 2 ? MP.stoneLo : MP.stone);
  }
  // thorn hedge
  for (let a = 0; a < 140; a++) {
    const t = (a / 140) * Math.PI * 2;
    if (a % 2) continue;
    c.p.set(Math.round(W / 2 + Math.cos(t) * (W / 2 - 2)), Math.round(H / 2 + Math.sin(t) * (H / 2 - 2)), MP.leafDk);
  }
  drawPalm(c.p, 10, H - 8, 8);
}

// ------------------------------------------------------------------ props by kind

const CAPITALS: Record<string, (seed: number) => PropSprite> = {
  Massalia: massalia,
  Syracusae: syracusae,
  Roma: roma,
  Carthago: carthago,
  'Carthago Nova': carthagoNova,
  Gades: gades,
  Caralis: caralis,
};

/** A capital's generic layout when the map has one we did not compose by hand. */
function genericCapital(seed: number, arch: Arch): PropSprite {
  const c = new Cv(130, 110, seed);
  const pal = PAL[arch];
  if (arch === 'punic') punicTown(c, pal, 130, 110);
  else if (arch === 'roman') romanTown(c, pal, 130, 110);
  else greekTown(c, pal, 130, 110);
  return c.done(65, 60);
}

/** The settlement miniature of a region (null for the sea). */
export function settlementProp(kind: string, name: string, arch: Arch, seed: number): PropSprite | null {
  const pal = PAL[arch];
  if (kind === 'capital') return (CAPITALS[name] ?? ((s: number) => genericCapital(s, arch)))(seed);
  if (kind === 'town') {
    const big = arch === 'greek' || arch === 'roman' || arch === 'punic';
    const W = big ? 84 + Math.floor(hash2(seed, 1, 5) * 16) : 64 + Math.floor(hash2(seed, 1, 5) * 12);
    const H = big ? 66 + Math.floor(hash2(seed, 2, 5) * 12) : 52 + Math.floor(hash2(seed, 2, 5) * 10);
    const c = new Cv(W, H, seed);
    ({ greek: greekTown, punic: punicTown, roman: romanTown, etruscan: etruscanTown, iberian: iberianTown, celtic: celticTown, numidian: numidianTown })[arch](c, pal, W, H);
    return c.done(Math.round(W / 2), Math.round(H / 2));
  }
  if (kind === 'fort') {
    if (arch === 'roman' || arch === 'numidian') {
      // a Roman castrum: rounded square, four gates, barrack rows, principia
      const c = new Cv(58, 52, seed);
      c.pave(6, 6, 46, 40, mix(MP.pave, MP.grass, 0.3));
      for (let y = 10; y < 44; y += 7) {
        if (y > 20 && y < 32) continue;
        c.block(9, y, 15, 3, PAL.roman, 'pitch', 2, 0.1);
        c.block(34, y, 15, 3, PAL.roman, 'pitch', 2, 0.1);
      }
      c.block(22, 22, 14, 7, PAL.roman, 'court', 2);
      c.flags.push({ x: 29, y: 14, c: 0xa12735 });
      c.wall(
        [
          [4, 6],
          [54, 6],
          [54, 46],
          [4, 46],
        ],
        true,
        PAL.roman,
      );
      c.gate(29, 46);
      return c.done(29, 26);
    }
    if (arch === 'celtic' || arch === 'iberian') {
      const c = new Cv(56, 48, seed);
      iberianTown(c, PAL.iberian, 56, 48);
      return c.done(28, 24);
    }
    const c = new Cv(52, 46, seed);
    c.pave(6, 8, 40, 32);
    c.block(18, 16, 16, 9, pal, pal.flat ? 'flat' : 'court', 3);
    c.wall(
      [
        [4, 8],
        [48, 8],
        [48, 40],
        [4, 40],
      ],
      true,
      pal,
    );
    c.tower(23, 4, pal, arch === 'punic' ? 0x9a5a7a : 0xa12735);
    c.gate(26, 40);
    return c.done(26, 24);
  }
  if (kind === 'post') {
    // an emporion: warehouses, amphorae, awnings, a crane
    const c = new Cv(52, 36, seed);
    const wp = pal.flat || arch === 'celtic' || arch === 'numidian' ? PAL.greek : pal;
    c.ground(2, 4, 48, 30, MP.pave, false);
    c.block(4, 6, 18, 6, wp, 'pitch', 3);
    c.block(26, 8, 14, 5, wp, 'pitch', 3);
    for (let k = 0; k < 4; k++) {
      const x = 6 + k * 4;
      c.p.rect(x, 22, 3, 4, k % 2 ? 0xc07a50 : 0xd89a68), c.p.set(x + 1, 25, 0x8a4a30);
    }
    for (let k = 0; k < 3; k++) {
      c.p.rect(26 + k * 7, 22, 6, 3, [0xb12d3c, 0x3d5a78, 0xc8762a][k]);
      c.p.hline(26 + k * 7, 31 + k * 7, 24, MP.ink);
    }
    c.p.line(45, 30, 45, 8, MP.woodDk);
    c.p.line(45, 8, 38, 14, MP.woodDk);
    c.flags.push({ x: 45, y: 4, c: 0xc8762a });
    return c.done(26, 18);
  }
  if (kind === 'lair') return lairProp(name, seed);
  if (kind === 'plot') return farmProp(arch, seed);
  return null;
}

function lairProp(name: string, seed: number): PropSprite {
  if (/Etna/.test(name)) {
    const c = new Cv(72, 54, seed);
    // a smoking volcano with a glowing crater and lava runnels
    for (let j = 0; j < 44; j++) {
      const half = Math.round(6 + j * 0.75);
      for (let i = -half; i <= half; i++) {
        const lit = i < -half * 0.2;
        let col = lit ? MP.peak : MP.peakShade;
        if (Math.abs(i) === half) col = MP.peakRim;
        else if (j < 6) col = lit ? MP.snow : MP.snowShade;
        if (hash2(i, j, 41) < 0.08) col = MP.peakDeep;
        c.p.set(36 + i, 8 + j, col);
      }
    }
    c.p.rect(31, 7, 10, 3, 0x5a3438);
    c.p.rect(33, 8, 6, 2, MP.ember);
    for (let j = 10; j < 34; j++) c.p.set(36 + Math.round(Math.sin(j / 4) * 2) + (j > 20 ? 2 : 0), j, j % 3 ? MP.ember : 0xb84a2a);
    c.smoke.push({ x: 36, y: 6 }, { x: 34, y: 6 });
    c.fires.push({ x: 36, y: 8 });
    return c.done(36, 40);
  }
  if (/Pillars/.test(name)) {
    const c = new Cv(52, 50, seed);
    for (const [x, h] of [
      [12, 40],
      [36, 34],
    ]) {
      c.shadow(x + 2, 46, 14, 3);
      for (let j = 0; j < h; j++) {
        const half = Math.round(5 + Math.sin(j / 5) * 1.5 + (j > h - 8 ? (j - (h - 8)) * 0.6 : 0));
        for (let i = -half; i <= half; i++) c.p.set(x + i, 46 - h + j, Math.abs(i) === half ? MP.peakRim : i < 0 ? MP.peakHi : MP.peakShade);
      }
    }
    c.flags.push({ x: 12, y: 2, c: 0xd8b060 });
    return c.done(24, 34);
  }
  if (/Hesperides/.test(name)) {
    const c = new Cv(56, 44, seed);
    c.ground(2, 4, 52, 38, MP.lush, true);
    c.wall(
      [
        [6, 8],
        [50, 8],
        [50, 38],
        [6, 38],
      ],
      true,
      null,
      false,
      [0xe0d0b0, 0xc0a888, 0x6a5040],
    );
    for (let k = 0; k < 6; k++) drawTree(c.p, 14 + (k % 3) * 14, 16 + Math.floor(k / 3) * 12, 4, k);
    for (let k = 0; k < 14; k++) c.p.set(12 + Math.floor(hash2(k, 1, seed) * 34), 12 + Math.floor(hash2(k, 2, seed) * 22), MP.gold);
    // the dragon's coil
    for (let a = 0; a < 30; a++) c.p.set(28 + Math.round(Math.cos(a / 4) * (6 - a / 8)), 26 + Math.round(Math.sin(a / 4) * (4 - a / 10)), a % 2 ? 0x5e8a56 : 0x3e6a3e);
    return c.done(28, 24);
  }
  const c = new Cv(40, 32, seed);
  const dark = /Wood|Maquis|Grove/.test(name);
  for (let j = 0; j < 22; j++)
    for (let i = 0; i < 38; i++) {
      const u = (i - 19) / 18;
      const v = (j - 16) / 14;
      if (u * u + v * v > 1 || j > 21) continue;
      c.p.set(i, j + 4, u * u + v * v > 0.86 ? MP.peakRim : u + v < -0.5 ? MP.peakHi : u + v > 0.5 ? MP.peakShade : hash2(i, j, 5) < 0.2 ? MP.peakShade : MP.peak);
    }
  for (let j = 0; j < 9; j++) for (let i = -5 + Math.floor(j / 3); i <= 5 - Math.floor(j / 3); i++) c.p.set(19 + i, 25 - j, j < 2 ? 0x2e1e28 : 0x3e2a36);
  for (const [x, y] of [
    [10, 28],
    [11, 28],
    [27, 29],
    [28, 28],
    [30, 30],
  ])
    c.p.set(x, y, 0xf0e4d0);
  if (dark) for (let k = 0; k < 5; k++) drawTree(c.p, 4 + k * 8, 6 + (k % 2) * 3, 4, k + seed);
  else {
    c.p.vline(32, 2, 12, MP.woodDk);
    c.p.line(32, 5, 36, 1, MP.woodDk);
    c.p.line(32, 8, 28, 4, MP.woodDk);
  }
  return c.done(19, 20);
}

function farmProp(arch: Arch, seed: number): PropSprite {
  const c = new Cv(64, 46, seed);
  const pal = PAL[arch];
  const r = c.r;
  // patchwork of fields around a farmstead
  const kinds = [0, 1, 2, 3, 4].sort(() => r() - 0.5);
  c.field(3, 4, 18 + Math.floor(r() * 6), 12, kinds[0]);
  c.field(3, 22, 22, 10 + Math.floor(r() * 6), kinds[1]);
  c.field(42, 26, 18, 14, kinds[2]);
  if (r() < 0.6) c.field(44, 4, 16, 10, kinds[3]);
  // farmstead
  if (arch === 'celtic' || arch === 'numidian') {
    c.hut(32, 14, 4, pal);
    c.hut(38, 22, 3, pal);
  } else {
    c.block(26, 8, 12, 7, pal, pal.flat ? 'flat' : 'court', 2, 0.6);
    c.block(31, 21, 7, 4, pal);
  }
  // haystack, threshing floor, a tree
  c.hut(24, 36, 2, PAL.celtic);
  c.p.rect(30, 32, 8, 6, MP.paveDot);
  c.p.rect(31, 33, 6, 4, MP.pave);
  drawTree(c.p, 45 + Math.floor(r() * 6), 17, 3, seed);
  return c.done(32, 20);
}

/**
 * A harbour at the coast (local origin = the coast point): a quay, piers out
 * to sea along (dx, dy), moored ships; capitals also get a lighthouse.
 */
export function harbourProp(kind: string, dx: number, dy: number, arch: Arch, seed: number): { pix: Pix; ox: number; oy: number; fires: Pt[] } {
  const W = 84;
  const c = new Cv(W, W, seed);
  const o = W / 2;
  const big = kind === 'capital';
  const n = big ? 3 : kind === 'town' ? 2 : 1;
  const nx = -dy;
  const ny = dx;
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * 12;
    const len = 14 + (k % 2) * 6;
    c.pier(o + nx * off, o + ny * off, dx, dy, len);
    const flip = dx < 0;
    const sx = Math.round(o + nx * (off + 5) + dx * (len * 0.6)) - 9;
    const sy = Math.round(o + ny * (off + 5) + dy * (len * 0.6)) - 9;
    c.ship(sx, sy, flip, k % 2 || arch !== 'punic' ? 'merchant' : 'galley', arch === 'punic' ? 0x9a5a7a : 0xa12735);
  }
  if (big) {
    // a mole with a lighthouse at its end
    const mx = o - nx * 22;
    const my = o - ny * 22;
    for (let k = 0; k < 26; k++) {
      const x = Math.round(mx + dx * k);
      const y = Math.round(my + dy * k);
      c.p.rect(x - 1, y - 1, 3, 3, k % 4 === 0 ? MP.stoneLo : MP.stone);
      c.p.set(x + 1, y + 2, MP.shadow, 70);
    }
    c.lighthouse(Math.round(mx + dx * 26) - 4, Math.round(my + dy * 26) - 10);
  }
  return { pix: c.p, ox: o, oy: o, fires: c.fires };
}

// ------------------------------------------------------------------ overland (offline campaign) props

/** A town of a culture at an explicit size (the offline map's towns are smaller than the war map's). */
export function townProp(arch: Arch, seed: number, W: number, H: number): PropSprite {
  const c = new Cv(W, H, seed);
  ({ greek: greekTown, punic: punicTown, roman: romanTown, etruscan: etruscanTown, iberian: iberianTown, celtic: celticTown, numidian: numidianTown })[arch](c, PAL[arch], W, H);
  return c.done(Math.round(W / 2), Math.round(H / 2));
}

/**
 * A farming village: houses (or round huts) around a little square with a
 * well, fenced kitchen gardens, haystacks, a threshing floor, olive trees
 * and a cypress. Chimney smoke anchors are always present.
 */
export function villageProp(arch: Arch, seed: number): PropSprite {
  const W = 56;
  const H = 44;
  const c = new Cv(W, H, seed);
  const pal = PAL[arch];
  const r = c.r;
  const huts = arch === 'celtic' || arch === 'numidian';
  c.ground(5, 5, W - 10, H - 9, mix(MP.pave, MP.grass, 0.5), true);
  // fenced kitchen gardens in the south corners
  const left = r() < 0.5;
  const gx = left ? 2 : W - 17;
  const fence = (x: number, y: number, w: number, h: number) => {
    for (let i = 0; i <= w; i += 2) c.p.set(x + i, y - 1, MP.woodDk), c.p.set(x + i, y + h, MP.woodDk);
    for (let j = 0; j <= h; j += 2) c.p.set(x - 1, y + j, MP.woodDk), c.p.set(x + w, y + j, MP.woodDk);
  };
  c.field(gx, 30, 14, 8, Math.floor(r() * 4));
  fence(gx, 30, 14, 8);
  const g2 = left ? W - 15 : 3;
  c.field(g2, 33, 11, 6, 3);
  fence(g2, 33, 11, 6);
  // the square and its well
  const sx = Math.round(W / 2) - 6;
  const sy = 18;
  c.pave(sx, sy, 12, 9);
  c.p.rect(sx + 4, sy + 3, 4, 4, MP.stoneRim);
  c.p.rect(sx + 5, sy + 3, 2, 3, MP.stone);
  c.p.set(sx + 5, sy + 4, MP.water);
  c.p.set(sx + 6, sy + 4, MP.seaLo);
  c.shadow(sx + 7, sy + 5, 2, 2);
  // houses around the square, drawn north to south
  const spots: [number, number][] = [
    [6, 7],
    [19, 3],
    [33, 5],
    [43, 14],
    [6, 18],
    [36, 21],
    [21, 30],
  ];
  const keep = spots.filter((_, i) => i < 4 || r() < 0.7);
  keep.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of keep) {
    if (huts) c.hut(x + 4, y + 4, 3 + Math.floor(r() * 2), pal, 1 + r() * 0.3);
    else {
      const w = 7 + Math.floor(r() * 4);
      const d = 4 + Math.floor(r() * 2);
      c.block(x, y, Math.min(w, W - 3 - x), d, pal, r() < 0.2 && w >= 9 ? 'court' : pal.flat ? 'flat' : 'pitch', 2, 0.45);
    }
  }
  if (!c.smoke.length) c.smoke.push({ x: keep[0][0] + 3, y: keep[0][1] });
  // haystacks and a threshing floor
  c.hut(left ? W - 8 : 8, 27, 2, PAL.celtic);
  c.hut(left ? W - 5 : 5, 29, 2, PAL.celtic);
  const tx = left ? 40 : 12;
  for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) if ((i / 4.5) ** 2 + (j / 3.5) ** 2 <= 1) c.p.set(tx + i, 41 + j - 2, (i + j) & 1 ? MP.paveDot : MP.pave);
  // olive trees and a cypress
  drawTree(c.p, left ? 50 : 6, 9, 3, seed, 1);
  drawTree(c.p, left ? 47 : 9, 16, 2, seed + 3, 1);
  drawCypress(c.p, left ? 3 : 52, 30, 9);
  return c.done(Math.round(W / 2), Math.round(H / 2));
}

export type LandmarkKind = 'ruin' | 'stones' | 'shrine' | 'tower' | 'tumulus' | 'statue';
export const LANDMARKS: LandmarkKind[] = ['ruin', 'stones', 'shrine', 'tower', 'tumulus', 'statue'];

/** Small landmarks dotting the countryside: a ruined temple, a stone circle, a roadside shrine, a watchtower, a burial mound, a statue. */
export function landmarkProp(kind: LandmarkKind, seed: number): PropSprite {
  if (kind === 'ruin') {
    const c = new Cv(38, 28, seed);
    c.shadow(7, 12, 28, 11, 60);
    c.p.rect(5, 9, 28, 12, MP.stoneRim);
    c.p.rect(6, 10, 26, 10, MP.stoneLo);
    c.p.hline(6, 31, 10, MP.stoneHi);
    c.p.hline(6, 31, 19, MP.stoneDk);
    for (let j = 11; j < 19; j++) for (let i = 7; i < 31; i++) if (hash2(i, j, seed) < 0.18) c.p.set(i, j, hash2(i, j, seed + 1) < 0.5 ? MP.grassLo : MP.stone);
    // column stubs of different heights (front row) and fallen drums
    for (let k = 0; k < 6; k++) {
      const x = 8 + k * 4;
      const h = [7, 3, 9, 2, 5, 8][(k + seed) % 6];
      c.p.set(x + 2, 18, MP.shadow, 80);
      c.p.vline(x, 18 - h, 18, MP.stoneHi);
      c.p.vline(x + 1, 18 - h, 18, MP.stoneDk);
      c.p.set(x, 18 - h - 1, MP.stoneRim);
      c.p.set(x + 1, 18 - h - 1, MP.stoneRim);
    }
    for (const [x, y] of [
      [3, 23],
      [12, 24],
      [33, 22],
    ]) {
      c.p.rect(x, y, 4, 2, MP.stone);
      c.p.hline(x, x + 3, y + 2, MP.stoneDk);
      c.p.set(x, y, MP.stoneHi);
    }
    drawCypress(c.p, 35, 13, 10);
    return c.done(19, 16);
  }
  if (kind === 'stones') {
    const c = new Cv(32, 24, seed);
    for (let j = -5; j <= 5; j++) for (let i = -10; i <= 10; i++) if ((i / 10) ** 2 + (j / 5.5) ** 2 <= 1) c.p.set(16 + i, 13 + j, (i + j) & 1 ? MP.grassLo : MP.grass);
    for (let k = 0; k < 9; k++) {
      const t = (k / 9) * Math.PI * 2;
      const x = Math.round(16 + Math.cos(t) * 11);
      const y = Math.round(13 + Math.sin(t) * 6);
      const h = 4 + (k % 3 === 0 ? 1 : 0);
      c.p.set(x + 2, y + 1, MP.shadow, 80);
      c.p.set(x + 3, y + 1, MP.shadow, 50);
      for (let j = 0; j < h; j++) {
        c.p.set(x, y - j, j === h - 1 ? MP.peakHi : MP.peak);
        c.p.set(x + 1, y - j, MP.peakShade);
      }
      c.p.set(x, y - h, MP.peakRim);
      c.p.set(x + 1, y - h, MP.peakRim);
    }
    c.p.rect(14, 12, 5, 2, MP.peakHi);
    c.p.hline(14, 18, 14, MP.peakShade);
    return c.done(16, 13);
  }
  if (kind === 'shrine') {
    const c = new Cv(34, 30, seed);
    c.ground(4, 8, 26, 20, MP.pave, true);
    c.temple(12, 9, 10, 4, TEAL);
    drawCypress(c.p, 7, 22, 11);
    drawCypress(c.p, 28, 21, 10);
    return c.done(17, 15);
  }
  if (kind === 'tower') {
    const c = new Cv(26, 30, seed);
    c.hill(13, 22, 11, 6, true);
    c.tower(10, 9, PAL.greek, 0xa12735);
    c.smoke.push({ x: 12, y: 9 });
    return c.done(13, 18);
  }
  if (kind === 'tumulus') {
    const c = new Cv(30, 22, seed);
    c.hill(15, 11, 11, 7, true);
    c.p.rect(13, 16, 5, 3, MP.stoneRim);
    c.p.rect(14, 17, 3, 2, 0x3e2a36);
    c.p.hline(12, 18, 19, MP.stone);
    for (let k = 0; k < 5; k++) c.p.set(9 + k * 3, 19 + (k & 1), MP.stoneLo);
    return c.done(15, 12);
  }
  // an honorific column with a gilded statue on top
  const c = new Cv(16, 34, seed);
  c.shadow(6, 29, 9, 3);
  c.p.rect(2, 26, 12, 6, MP.stoneRim);
  c.p.rect(3, 26, 10, 3, MP.stone);
  c.p.hline(3, 12, 26, MP.stoneHi);
  c.p.rect(3, 29, 10, 2, MP.stoneLo);
  for (let k = 0; k < 12; k++) c.p.set(8 + Math.round(k * 0.5), 25 - Math.round(k * 0.3), MP.shadow, 60);
  c.p.rect(6, 7, 4, 19, MP.stoneRim);
  for (let y = 8; y < 26; y++) {
    c.p.set(7, y, MP.stoneHi);
    c.p.set(8, y, y % 3 === 0 ? MP.stoneLo : MP.stone);
  }
  c.p.rect(5, 6, 6, 2, MP.stoneRim);
  c.p.hline(6, 9, 6, MP.stoneHi);
  // the figure: head, body, a raised spear
  c.p.rect(7, 2, 2, 4, MP.gold);
  c.p.set(8, 3, MP.goldLo);
  c.p.set(7, 1, 0xf0d088);
  c.p.set(8, 1, MP.goldLo);
  c.p.vline(10, 0, 5, MP.goldLo);
  c.p.set(9, 3, MP.gold);
  c.p.outline(MP.stoneRim, { x: 5, y: 0, w: 7, h: 6 });
  return c.done(8, 28);
}

/** A small fishing boat (faces right): a hull with a furled sail and a fisherman. */
export function boatPix(): Pix {
  const p = new Pix(12, 8);
  for (let i = 2; i < 11; i++) p.set(i, 7, MP.shadow, 70);
  for (let i = 1; i < 11; i++) for (let y = 4; y <= 6; y++) p.set(i, y, y === 6 ? 0x5e3a28 : y === 4 ? 0xb88a5a : 0x946644);
  p.set(0, 3, 0x946644), p.set(11, 3, 0x946644);
  p.vline(6, 0, 4, 0x6e4e38);
  p.hline(4, 8, 1, 0xe8dcc8);
  p.set(3, 3, 0xd47a6a), p.set(3, 2, 0xdcab80);
  p.outline(0x442618);
  return p;
}
