/**
 * Previews of the shop's cosmetics (server/src/economy/catalog.ts): shield
 * emblems on a shield, banners, cloaks, clan flags, army skins and war-table
 * themes, each a 28 x 28 pixel picture. Unknown ids fall back to a look by
 * their slot, so new catalogue entries still get a preview.
 */
import { Pix } from './pixels';
import { P } from './palette';
import { EMBLEM_BITMAPS } from './emblems';
import { ANIM, applyCosmetics, renderFrame, renderGearIcon, type DollSpec } from './paperdoll';
import { AURA_COLORS } from '../game/cosmetics';

export const COSMETIC_PREVIEW = 28;

interface Look {
  main: number;
  dark: number;
  light: number;
  motif?: string;
  ink?: number;
}

const LOOKS: Record<string, Look> = {
  emblem_owl: { main: 0xc89a48, dark: 0x8a6128, light: 0xe8c26a, motif: 'owl', ink: 0x2e2220 },
  emblem_lambda: { main: 0x9e3426, dark: 0x6e2219, light: 0xc85a45, motif: 'lambda', ink: 0xeee4cc },
  emblem_pegasus: { main: 0x46607a, dark: 0x2c4060, light: 0x6d8fae, motif: 'horse', ink: 0xeee4cc },
  emblem_gorgon: { main: 0x2e2220, dark: 0x1d140f, light: 0x4a3a30, motif: 'eye', ink: 0xe0b040 },
  emblem_pass_s: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0, motif: 'star', ink: 0x6e2219 },
  banner_crimson: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048, motif: 'lambda', ink: 0xf6ecd8 },
  banner_laurel: { main: 0x5f8a45, dark: 0x3e5a2c, light: 0x9ad87a, motif: 'sunwheel', ink: 0xe0b040 },
  supporter_banner: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0, motif: 'star', ink: 0x8c2f25 },
  banner_pass_s: { main: 0x9a58c0, dark: 0x5e3478, light: 0xd09aff, motif: 'star', ink: 0xe0b040 },
  // duel season rewards by peak league (src/duel/season.ts SEASON.rewards)
  duel_emblem_bronze: { main: 0x8a5a2b, dark: 0x5a3a1b, light: 0xb8834a, motif: 'lambda', ink: 0xeee4cc },
  duel_emblem_silver: { main: 0x8f9aa3, dark: 0x5e6870, light: 0xc8d0d8, motif: 'lambda', ink: 0x2e2220 },
  duel_emblem_gold: { main: 0xc89a30, dark: 0x8a6a28, light: 0xf0d070, motif: 'star', ink: 0x6e2219 },
  duel_banner_hoplite: { main: 0x8c2f25, dark: 0x5e1e17, light: 0xc0503f, motif: 'lambda', ink: 0xe0b040 },
  duel_banner_strategos: { main: 0x4a3a8c, dark: 0x2e2460, light: 0x7a68c0, motif: 'star', ink: 0xe0b040 },
  duel_banner_legend: { main: 0x2a7a6a, dark: 0x1a5046, light: 0x5ab0a0, motif: 'sunwheel', ink: 0xfff0a0 },
  cloak_crimson: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048 },
  cloak_purple: { main: 0x7a3a9a, dark: 0x4a2260, light: 0xa868c8 },
  cloak_pass_s: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0 },
  flag_trireme: { main: 0x3e6b94, dark: 0x274a6a, light: 0x6d9ac0, motif: 'trident', ink: 0xf6ecd8 },
  flag_lion: { main: 0xb8863b, dark: 0x6e4f22, light: 0xe8c26a, motif: 'lion', ink: 0x6e2219 },
  skin_bronze: { main: 0xe8c26a, dark: 0x8a6128, light: 0xfff0b0 },
  skin_macedon: { main: 0x7a3a9a, dark: 0x4a2260, light: 0xc8a050 },
  table_marble: { main: 0xe4e0d8, dark: 0xa8a49c, light: 0xffffff },
  table_tent: { main: 0xc8a878, dark: 0x8a6a48, light: 0xe8d0a0 },
};

const SLOT_DEFAULT: Record<string, Look> = {
  emblem: { main: 0xc89a48, dark: 0x8a6128, light: 0xe8c26a, motif: 'star', ink: 0x2e2220 },
  banner: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048, motif: 'star', ink: 0xf6ecd8 },
  cloak: { main: 0x4a6b9a, dark: 0x2c4060, light: 0x6d8fae },
  clan_flag: { main: 0x5f8a45, dark: 0x3e5a2c, light: 0x9ad87a, motif: 'boar', ink: 0xf6ecd8 },
  army_skin: { main: 0xb8863b, dark: 0x6e4f22, light: 0xe8c26a },
  table_theme: { main: 0x9a7048, dark: 0x57391f, light: 0xc89a68 },
  crest: { main: 0xa83224, dark: 0x6e2219, light: 0xd06048 },
  aura: { main: 0xe0b040, dark: 0x8a6a28, light: 0xfff0a0 },
  pose: { main: 0xb8863b, dark: 0x6e4f22, light: 0xe8c26a },
};

/** A hoplite in the cosmetic, small enough for the 28 px tile (crests, auras, victory poses). */
const MODEL: DollSpec = {
  look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicWhite' },
  weapon: 'spear',
  shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } },
  helmet: { art: 'attic', paint: { field: 'red' } },
  armor: 'linothorax',
  seed: 2,
  scale: 0.5,
};

function soldier(px: Pix, id: string, slot: string): void {
  const spec = applyCosmetics(MODEL, { [slot]: id });
  const fr = renderFrame(spec, slot === 'pose' ? ANIM.win[1] : 0, 0);
  // the figure's feet on the tile's bottom edge
  px.blit(fr, Math.round((px.w - fr.w) / 2), px.h - 2 - Math.round(fr.h * (64 / 72)));
  if (slot === 'aura') {
    const cols = AURA_COLORS[id] ?? [0xfff0a0];
    const spots = [[5, 20], [22, 8], [7, 9], [21, 18], [12, 4], [18, 24], [4, 14], [24, 13]];
    spots.forEach(([x, y], i) => px.set(x, y, cols[i % cols.length]));
  }
}

function motif(px: Pix, x: number, y: number, name: string | undefined, ink: number, scale = 1): void {
  const rows = EMBLEM_BITMAPS[name ?? ''] ?? EMBLEM_BITMAPS.star;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') px.rect(x + c * scale, y + r * scale, scale, scale, ink);
}

function banner(px: Pix, l: Look): void {
  // pole with a gold finial, a swallow-tailed cloth
  px.vline(6, 2, 26, P.wood[1]);
  px.vline(7, 3, 26, P.wood[2]);
  px.rect(5, 1, 3, 2, 0xe0b040);
  px.rect(8, 4, 16, 14, l.main);
  px.hline(8, 23, 4, l.light);
  px.hline(8, 23, 17, l.dark);
  for (let i = 0; i < 5; i++) {
    px.clear(23 - i, 13 + i);
    px.clear(23 - i + 1, 13 + i);
  }
  px.rect(8, 18, 16, 2, l.dark);
  for (let i = 0; i < 4; i++) px.clear(14 + i, 19 - (i % 2));
  motif(px, 12, 7, l.motif, l.ink ?? 0xffffff);
}

function flag(px: Pix, l: Look): void {
  px.vline(4, 2, 26, P.wood[1]);
  px.vline(5, 2, 26, P.wood[2]);
  px.rect(3, 1, 4, 2, 0xb8863b);
  // waving cloth
  for (let x = 0; x < 19; x++) {
    const dy = Math.round(Math.sin(x / 3) * 1.2);
    for (let y = 0; y < 15; y++) px.set(6 + x, 4 + y + dy, y === 0 ? l.light : y === 14 ? l.dark : l.main);
  }
  motif(px, 12, 7, l.motif, l.ink ?? 0xffffff);
}

function cloak(px: Pix, l: Look): void {
  // shoulders, a pin and folds falling to the hem
  for (let y = 0; y < 22; y++) {
    const half = 6 + Math.floor(y / 3);
    for (let x = -half; x <= half; x++) {
      const fold = (x + 40) % 4 === 0;
      const edge = Math.abs(x) === half;
      px.set(14 + x, 4 + y, edge ? l.dark : fold ? l.dark : y < 2 ? l.light : l.main);
    }
  }
  px.rect(10, 3, 9, 2, l.light);
  px.rect(13, 4, 3, 3, 0xe0b040);
  px.set(14, 5, 0xfff0a0);
  px.outline(P.outline);
}

function skin(px: Pix, l: Look, id: string): void {
  // a helmet and a shield in the army's finish
  const helm = renderGearIcon('helmet', id === 'skin_macedon' ? 'thracian' : 'corinthian', { field: 'bronze' }, 20, 20);
  const sh = renderGearIcon('shield', 'hoplon', { emblem: id === 'skin_macedon' ? 'sunwheel' : 'lambda', field: id === 'skin_macedon' ? 'blue' : 'bronze' }, 22, 22);
  px.blit(sh, 0, 6);
  px.blit(helm, 9, 0);
  // tint towards the skin colour
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) === 0) continue;
      const c = px.get(x, y);
      const r = (c >> 16) & 255;
      const g = (c >> 8) & 255;
      const b = c & 255;
      const lum = (r * 3 + g * 5 + b * 2) / 2550;
      const t = lum > 0.6 ? l.light : lum > 0.3 ? l.main : l.dark;
      const mix = (a: number, bb: number) => Math.round(a * 0.45 + bb * 0.55);
      px.set(x, y, (mix(r, (t >> 16) & 255) << 16) | (mix(g, (t >> 8) & 255) << 8) | mix(b, t & 255));
    }
}

function table(px: Pix, l: Look): void {
  // a board in perspective with a hex grid and two tiny armies
  for (let y = 0; y < 16; y++) {
    const inset = Math.floor((15 - y) / 3);
    for (let x = 2 + inset; x < 26 - inset; x++) px.set(x, 6 + y, ((x + y) % 7 === 0 ? l.dark : l.main));
  }
  px.hline(2, 25, 22, l.dark);
  px.rect(2, 23, 24, 2, P.wood[1]);
  px.rect(4, 25, 2, 3, P.wood[2]);
  px.rect(22, 25, 2, 3, P.wood[2]);
  for (let i = 0; i < 4; i++) px.set(8 + i * 4, 12 + (i % 2) * 3, l.light);
  px.rect(9, 10, 2, 3, 0xa83224);
  px.rect(17, 15, 2, 3, 0x46607a);
  px.set(9, 9, 0xe0b040);
  px.set(17, 14, 0xe0b040);
}

/** A 28 x 28 preview of a cosmetic by id and slot. */
export function renderCosmetic(id: string, slot: string): Pix {
  const px = new Pix(COSMETIC_PREVIEW, COSMETIC_PREVIEW);
  const l = LOOKS[id] ?? SLOT_DEFAULT[slot] ?? SLOT_DEFAULT.banner;
  if (slot === 'emblem') {
    const sh = renderGearIcon('shield', 'hoplon', { field: 'bronze' }, 28, 28);
    px.blit(sh, 0, 0);
    // repaint the face in the emblem's colours, then the motif, doubled
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 28; x++) {
        if (px.alpha(x, y) === 0) continue;
        const d = Math.hypot(x - 13.5, y - 13.5);
        if (d < 9) px.set(x, y, d > 8 ? l.dark : y < 9 ? l.light : l.main);
      }
    motif(px, 7, 7, l.motif, l.ink ?? 0x2e2220, 2);
  } else if (slot === 'banner') banner(px, l);
  else if (slot === 'cloak') cloak(px, l);
  else if (slot === 'clan_flag') flag(px, l);
  else if (slot === 'army_skin') skin(px, l, id);
  else if (slot === 'crest' || slot === 'aura' || slot === 'pose') soldier(px, id, slot);
  else table(px, l);
  return px;
}

export function cosmeticKey(id: string): string {
  return `cosm_${id}`;
}
