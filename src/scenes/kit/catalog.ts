/**
 * What the Kit gallery shows (story F-05, KIT-2), as pure data: its pages, the colour tokens in
 * groups, the type roles and the whole icon set. No Phaser, so tests/kitCatalog.test.ts can hold
 * that nothing in the design system is left out of the Kit.
 */
import { ICONS } from '../../art/icons';
import type { MosaicStyle } from '../../art/mosaicUi';
import { V5_ICON_FALLBACK } from '../../art/iconBitmaps';
import { UI_ICONS } from '../../art/uiIcons';
import { VECTOR_CAMP_ICONS, VECTOR_GLYPHS, VECTOR_ICONS } from '../../art/vectorIcons';
import { ACCENT, COLOR_ROLE, GROUP_COLOR, MOSAIC, RARITY_FRAME, RARITY_INK, RARITY_TEXT, RESOURCES, ROLE, SURFACE, TEXT, TYPE } from '../../ui/tokens';

/**
 * One page of the Kit. `tab` is the number `scene.start('Kit', { tab })` takes (the old pages keep
 * theirs, so scripts that open them still do); `id` is what `?scene=Kit&kit=<id>` and
 * `scene.start('Kit', { page: id })` take.
 */
interface KitPage {
  id: string;
  tab: number;
  name: string;
}

/** The pages in the pager's order: the v5 design system first, then the v4 and legacy galleries. */
export const KIT_PAGES: readonly KitPage[] = [
  { id: 'tokens', tab: 7, name: 'Tokens' },
  { id: 'type', tab: 8, name: 'Type' },
  { id: 'states', tab: 9, name: 'States' },
  { id: 'overlays', tab: 10, name: 'Overlays' },
  { id: 'forms', tab: 14, name: 'Forms' },
  { id: 'icons', tab: 11, name: 'Icons' },
  { id: 'army', tab: 12, name: 'Army' },
  { id: 'layouts', tab: 13, name: 'Layouts' },
  { id: 'mosaic', tab: 4, name: 'Mosaic' },
  { id: 'parts', tab: 5, name: 'Parts' },
  { id: 'controls', tab: 0, name: 'Controls' },
  { id: 'items', tab: 1, name: 'Items' },
  { id: 'lists', tab: 2, name: 'Lists' },
];

/** The sub-screen shell demo: a whole screen of its own (no pager), opened from the Parts page. */
export const SHELL_TAB = 6;

/**
 * The tab to open: `data.tab` (scripts), else `data.page` or the `kit` query parameter by page id,
 * else the first page. An unknown id or number opens the first page.
 */
export function kitTab(data: { tab?: number; page?: string } | undefined, search = ''): number {
  if (data?.tab === SHELL_TAB || KIT_PAGES.some((p) => p.tab === data?.tab)) return data!.tab!;
  const id = data?.page ?? new URLSearchParams(search).get('kit') ?? '';
  return (KIT_PAGES.find((p) => p.id === id) ?? KIT_PAGES[0]).tab;
}

/** The page shown before / after `tab` in the pager (wrapping round). */
export function stepPage(tab: number, dir: 1 | -1): number {
  const i = Math.max(0, KIT_PAGES.findIndex((p) => p.tab === tab));
  return KIT_PAGES[(i + dir + KIT_PAGES.length) % KIT_PAGES.length].tab;
}

interface Swatch {
  name: string;
  color: number;
}

interface TokenGroup {
  title: string;
  /** Where the tokens live, for the reader: `tokens.ts` export name. */
  source: string;
  swatches: Swatch[];
}

const swatches = (o: Record<string, number>): Swatch[] => Object.entries(o).map(([name, color]) => ({ name, color }));

/** Every colour token of src/ui/tokens.ts, grouped as the file groups them (roles first: screens pick a role). */
export function tokenGroups(): TokenGroup[] {
  return [
    { title: 'Colour roles', source: 'COLOR_ROLE', swatches: swatches(COLOR_ROLE) },
    { title: 'Mosaic palette', source: 'MOSAIC', swatches: swatches(MOSAIC) },
    { title: 'Battle groups', source: 'GROUP_COLOR', swatches: GROUP_COLOR.map((color, i) => ({ name: `group ${['I', 'II', 'III', 'IV'][i]}`, color })) },
    { title: 'Resources', source: 'RESOURCES', swatches: Object.entries(RESOURCES).map(([name, r]) => ({ name, color: r.color })) },
    { title: 'Rarity ink', source: 'RARITY_INK', swatches: swatches(RARITY_INK) },
    { title: 'Rarity frame', source: 'RARITY_FRAME', swatches: swatches(RARITY_FRAME) },
    { title: 'Rarity text', source: 'RARITY_TEXT', swatches: swatches(RARITY_TEXT) },
    { title: 'Unit roles', source: 'ROLE', swatches: swatches(ROLE) },
    { title: 'Surfaces (v3)', source: 'SURFACE', swatches: swatches(SURFACE) },
    { title: 'Text (v3)', source: 'TEXT', swatches: swatches(TEXT) },
    { title: 'Accents (v3)', source: 'ACCENT', swatches: swatches(ACCENT) },
  ];
}

/** Every procedural surface of the chrome (src/art/mosaicUi.ts), framed and filled ones alike. */
export const SURFACES: readonly MosaicStyle[] = [
  'page', 'topBar', 'frame', 'paper', 'parchment', 'parchmentSel', 'parchmentWell', 'sheet', 'plaque',
  'btnPrimary', 'btnPrimaryDown', 'btnHero', 'btnHeroDown', 'btnBronze', 'btnBronzeDown', 'btnNeutral', 'btnNeutralDown', 'btnStone',
  'btnBuy', 'btnBuyDown', 'btnLit', 'btnLitDown', 'btnDanger', 'btnDangerDown', 'btnBronzeOn',
  'tileStone', 'tileTerra', 'tileGlaze', 'tileBronze', 'tileOff',
  'fresco', 'track', 'trackSel', 'segDone', 'segOpen', 'questTrack', 'tabBar', 'tabSel', 'medallion', 'medallionSel', 'chipParch', 'chipStone',
];

/** "#a8432c" */
export const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

interface TypeRole {
  name: string;
  size: number;
  /** Cinzel caps (display) or Inter (text); `micro` is decoration only and exempt from the text floor. */
  face: 'display' | 'text' | 'micro';
}

/** The type scale (TYPE in tokens.ts, art bible 7.2) in the order a screen uses it, largest first. */
export function typeRoles(): TypeRole[] {
  const display = new Set(['displayL', 'displayM', 'displayS', 'title', 'heading']);
  return (Object.entries(TYPE) as [string, number][])
    .map(([name, size]): TypeRole => ({ name, size, face: name === 'micro' ? 'micro' : display.has(name) ? 'display' : 'text' }))
    .sort((a, b) => b.size - a.size);
}

/**
 * Every icon a screen can name (`addIcon(scene, x, y, name)`): the smooth vector icons, the v3 UI
 * icons with the v5 keys, the camp icons (`camp_*`) and the old pixel icons that have no smooth form,
 * sorted and once each. The morale glyphs and markers (VECTOR_GLYPHS) are among them.
 */
export function kitIconNames(): string[] {
  const names = new Set<string>([...Object.keys(VECTOR_ICONS), ...Object.keys(UI_ICONS), ...Object.keys(VECTOR_CAMP_ICONS).map((k) => `camp_${k}`), ...Object.keys(ICONS)]);
  return [...names].sort();
}

/** The v5 atlas keys (art bible 7.4) and the stand-in each draws while staged. */
export function v5IconKeys(): { key: string; standIn: string }[] {
  return Object.entries(V5_ICON_FALLBACK).map(([key, standIn]) => ({ key, standIn }));
}

export { VECTOR_GLYPHS };

/** Columns of `cell` UI px (with `gap` between) that fit `w`; at least 1. */
export function columns(w: number, cell: number, gap: number): number {
  return Math.max(1, Math.floor((w + gap) / (cell + gap)));
}
