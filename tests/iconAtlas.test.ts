import { describe, expect, it } from 'vitest';
import { readText, removeDir, runNode, sameFile, sourceFiles, tempDir } from './support/nodeIo.js';
import manifestJson from '../docs/v5/art/asset-manifest.json?raw';
import uiJson from '../public/icons/ui.json?raw';
import itemsJson from '../public/icons/items.json?raw';
import { VECTOR_ICONS, VECTOR_CAMP_ICONS, VECTOR_GLYPHS } from '../src/art/vectorIcons';
import { UI_ICONS } from '../src/art/uiIcons';
import { ICONS } from '../src/art/icons';
import { ITEM_LIST } from '../src/data/items';
import { POWER_IDS } from '../src/data/affixes';
import { CONSUMABLE_ICON_IDS, RESOURCE_ICON_IDS } from '../src/art/goodsIcons';
import { ICON_BACKING, STAGED_ICONS, V5_ICON_FALLBACK, downscaleSteps, iconBackingDisc, registerIconFrames, resolveIconId } from '../src/art/iconBitmaps';

/** The art bible's icon outline (section 7.4) and the dark stone of the top and tab bars (palette.json stone2). */
const ICON_OUTLINE = '#2a1a12';
const STONE2 = '#342d25';
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

interface Atlas {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { size: { w: number; h: number } };
}
const ATLAS: Record<'ui' | 'items', Atlas> = { ui: JSON.parse(uiJson), items: JSON.parse(itemsJson) };

/** Icons with no drawing yet: they show their vector form. An icon added to the game goes here until its art is in the atlases. */
const WAITING_FOR_ART: string[] = [];

const MANIFEST: { assets: { id: string; file: string; atlas?: string; frame?: string }[] } = JSON.parse(manifestJson);
const UI_FRAMES = MANIFEST.assets.filter((a) => a.atlas === 'icons_ui');
/** Where the AS-03 160 px masters are kept in git (scripts/art/atlas.mjs --src). */
const MASTERS = 'docs/v5/gemini/AS-03/processed';

/** Every icon name the game code asks for: `icon: 'x'` options, addIcon(..., 'x'), `icon_x` texture keys, and *_ICON maps. */
function iconNamesInCode(): Map<string, string> {
  const names = new Map<string, string>();
  for (const { path: at, text: s } of sourceFiles('src')) {
    for (const m of s.matchAll(/\b(?:icon|\w+Icon|iconName)\??\s*:\s*'([A-Za-z_]+)'/g)) names.set(m[1], at);
    for (const m of s.matchAll(/addIcon\(([^;\n]*)/g)) for (const q of m[1].matchAll(/(?<![=!]==\s*)'([A-Za-z_]+)'/g)) if (q[1] !== 'L' && q[1] !== 'D') names.set(q[1], at);
    for (const m of s.matchAll(/'icon[LD]?_([A-Za-z_]+)'/g)) if (!m[1].startsWith('camp_')) names.set(m[1], at);
    for (const m of s.matchAll(/\b[A-Z_]*ICON\b[^=\n]*=\s*\{([^}]*)\}/g)) for (const q of m[1].matchAll(/:\s*'([A-Za-z_]+)'/g)) names.set(q[1], at);
  }
  return names;
}

describe('drawn icon atlases (public/icons)', () => {
  const ui = ATLAS.ui.frames;
  const items = ATLAS.items.frames;

  it('hold every icon the game draws (staged v5 keys draw their stand-in; vector glyphs have no frame)', () => {
    const want = [
      ...Object.keys(VECTOR_ICONS).filter((k) => !VECTOR_GLYPHS.includes(k)).map((k) => `ui:${k}`),
      ...Object.keys(UI_ICONS).filter((k) => !STAGED_ICONS.includes(k)).map((k) => `ui:${k}`),
      ...Object.keys(VECTOR_CAMP_ICONS).map((k) => `camp:${k}`),
      ...POWER_IDS.map((k) => `power:${k}`),
      'chrome:sync_synced', 'chrome:sync_syncing', 'chrome:sync_offline', 'chrome:supporter_banner',
    ];
    expect(want.filter((id) => !ui[id]).sort()).toEqual([...WAITING_FOR_ART].sort());
    // base trinkets are trinket:<id>, set and named trinkets item:<id> (src/art/iconBitmaps.ts itemIconId)
    for (const d of ITEM_LIST) expect(items[`trinket:${d.id}`] ?? items[`item:${d.id}`], d.id).toBeDefined();
    for (const id of [...CONSUMABLE_ICON_IDS, ...RESOURCE_ICON_IDS]) expect(items[`goods:${id}`], id).toBeDefined();
  });

  it('keep every frame inside its sheet', () => {
    for (const a of Object.values(ATLAS)) {
      for (const [id, { frame }] of Object.entries(a.frames)) {
        expect(frame.x >= 0 && frame.y >= 0 && frame.x + frame.w <= a.meta.size.w && frame.y + frame.h <= a.meta.size.h, id).toBe(true);
      }
    }
  });

  it('resolve every icon key the code references to a texture and to art (its frame, its stand-in, or a vector glyph)', () => {
    const names = iconNamesInCode();
    expect(names.size).toBeGreaterThan(60);
    for (const [name, at] of names) {
      const texture = name in VECTOR_ICONS || name in UI_ICONS || name in ICONS;
      expect(texture, `${name} (${at}) has no icon_${name} texture`).toBe(true);
      const art = !!ui[`ui:${name}`] || VECTOR_GLYPHS.includes(name) || (STAGED_ICONS.includes(name) && !!ui[`ui:${V5_ICON_FALLBACK[name]}`]);
      expect(art, `${name} (${at}) has no drawn or vector art`).toBe(true);
    }
  });

  it('resolve the 8 replaced icons, the Codex book and the v5 icons by key', () => {
    const keys = UI_FRAMES.map((a) => a.frame!.replace(/^ui:/, ''));
    expect(keys).toEqual(expect.arrayContaining(['book', 'banner', 'war', 'season', 'arena', 'helmet', 'chest', 'tent', 'standard', 'works', 'captain', 'push', 'doctrine_steady']));
    for (const k of keys) {
      expect(k in UI_ICONS || k in VECTOR_ICONS, `${k}: no icon_${k} texture`).toBe(true);
      // shipped: its own 160 px frame; staged: not in the shipped atlas yet, its stand-in is
      if (STAGED_ICONS.includes(k)) {
        expect(ui[`ui:${k}`], `${k} is staged but shipped: remove it from STAGED_ICONS`).toBeUndefined();
        expect(ui[`ui:${V5_ICON_FALLBACK[k]}`], `${k}: stand-in ${V5_ICON_FALLBACK[k]} has no frame`).toBeDefined();
      } else {
        expect(ui[`ui:${k}`]?.frame.w, `${k} shipped without its 160 px frame`).toBe(160);
      }
    }
    // a staged key is a manifest frame, nothing else
    for (const k of STAGED_ICONS) expect(keys, k).toContain(k);
  });

  it('never give a simple geometric glyph an atlas frame', () => {
    expect(VECTOR_GLYPHS).toEqual(expect.arrayContaining(['morale_steady', 'morale_wavering', 'morale_routing']));
    for (const g of VECTOR_GLYPHS) {
      expect(VECTOR_ICONS[g], g).toBeDefined();
      expect(ui[`ui:${g}`], g).toBeUndefined();
      expect(UI_FRAMES.map((a) => a.frame), g).not.toContain(`ui:${g}`);
    }
  });
});

describe('scripts/art/atlas.mjs', () => {
  const run = (out: string, ...extra: string[]) => runNode('scripts/art/atlas.mjs', ['icons_ui', '--src', MASTERS, '--out', out, ...extra]);

  it('rebuilds the shipped ui atlas from its masters byte for byte (same input, same bytes)', () => {
    const out = tempDir();
    try {
      expect(run(out).status).toBe(0);
      expect(sameFile(`${out}/ui.png`, 'public/icons/ui.png')).toBe(true);
      expect(readText(`${out}/ui.json`)).toBe(uiJson);
    } finally {
      removeDir(out);
    }
  });

  it('adds every staged frame with --all, at 160 px, inside the 2048 px width', () => {
    const out = tempDir();
    try {
      expect(run(out, '--all').status).toBe(0);
      const j: Atlas = JSON.parse(readText(`${out}/ui.json`));
      for (const a of UI_FRAMES) expect(j.frames[a.frame!]?.frame.w, a.frame).toBe(160);
      for (const id of Object.keys(ATLAS.ui.frames)) expect(j.frames[id], id).toBeDefined();
      expect(j.meta.size.w).toBeLessThanOrEqual(2048);
    } finally {
      removeDir(out);
    }
  });

  it('refuses to write public/icons without --looked (D-9)', () => {
    const r = run('public/icons');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/REFUSED/);
  });
});

describe('icon bitmap lookup (src/art/iconBitmaps.ts)', () => {
  it('halves a big downscale in steps of at most 2x before the last draw', () => {
    expect(downscaleSteps(160, 24)).toEqual([80, 40, 24]);
    expect(downscaleSteps(160, 72)).toEqual([80, 72]);
    expect(downscaleSteps(160, 96)).toEqual([96]);
    expect(downscaleSteps(64, 72)).toEqual([72]);
    expect(downscaleSteps(96, 12)).toEqual([48, 24, 12]);
  });

  it('resolves a shipped v5 key to its own frame, never to its stand-in (nothing is staged since AS-07)', () => {
    expect(STAGED_ICONS).toEqual([]);
    registerIconFrames({} as CanvasImageSource, { 'ui:log': { x: 0, y: 0, w: 64, h: 64 } });
    expect(resolveIconId('ui:book')).toBeNull();
    registerIconFrames({} as CanvasImageSource, { 'ui:book': { x: 0, y: 0, w: 160, h: 160 } });
    expect(resolveIconId('ui:book')).toBe('ui:book');
    expect(resolveIconId('ui:no_such_icon')).toBeNull();
  });

  it('backs an icon on dark stone with a light disc that the stone and the icon outline both contrast with', () => {
    const d = iconBackingDisc(48, 48);
    expect([d.cx, d.cy]).toEqual([24, 24]);
    expect(d.r + d.rimW / 2).toBeLessThanOrEqual(24);
    expect(contrast(ICON_BACKING.fill, STONE2)).toBeGreaterThanOrEqual(3);
    expect(contrast(ICON_BACKING.fill, ICON_OUTLINE)).toBeGreaterThanOrEqual(3);
  });
});
