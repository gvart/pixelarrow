/**
 * The per-man looks for the Godot region view (godot/src/region/look.gd), as src/war/view/look.ts makes them: the
 * palette texture of every sheet with colour groups (buildPalette, raw RGBA), each class's block in it, the tables
 * lookOf draws from, and seeded samples of lookOf for the Godot tests. Pure (no canvas): scripts/godot/view.mjs runs it
 * under node, with each sheet's manifest by class.
 */
import { CLASSES, type ClassId } from '../data/classes';
import type { SheetManifest } from '../art/sheetManifest';
import { CLOAK_STEPS, CREST_STEPS, HAIR_W, PAL_ROWS, PAL_VARIANTS, SKIN_W, THRACIAN, TRIM_STEPS, buildPalette, lookOf } from '../war/view/look';

export function lookData(manifests: Record<string, SheetManifest>): { json: unknown; rgba: Uint8Array } {
  const sheets = Object.keys(manifests).sort().map((cls): [string, SheetManifest] => [cls, manifests[cls]]);
  const pal = buildPalette(sheets);
  const cultures: Record<string, string[]> = {};
  for (const [id, c] of Object.entries(CLASSES)) cultures[id] = [...(c.cultures ?? [])];
  // lookOf for a spread of seeds, classes and levels (a class spawn's seed is `unit:<id>`)
  const samples: unknown[] = [];
  const classes = sheets.map(([c]) => c).filter((c) => c in CLASSES);
  for (let k = 0; k < 300; k++) {
    const cls = classes[k % classes.length], seed = k % 3 ? `unit:${k * 7}` : `p-${k}-x${k * 31}`, level = k % 4 ? (k % 11) : undefined;
    const l = lookOf(seed, cls as ClassId, { level });
    samples.push([seed, cls, level ?? 0, l.tier, l.skin, l.cloak, l.crest, l.trim, l.hair]);
  }
  const json = {
    w: pal.w, h: pal.h, rows: PAL_ROWS, variants: PAL_VARIANTS, index: Object.fromEntries(pal.index),
    steps: [CLOAK_STEPS.length, CREST_STEPS.length, TRIM_STEPS.length], skinW: SKIN_W, hairW: HAIR_W, thracian: [...THRACIAN], cultures, samples,
  };
  return { json, rgba: new Uint8Array(pal.data.buffer) };
}
