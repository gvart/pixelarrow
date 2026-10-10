// The asset manifest (docs/v5/art/asset-manifest.json): one entry per menu-art asset, the
// machine-readable twin of docs/v5/art/ASSET_LIST.md.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MANIFEST = join(ROOT, 'docs/v5/art/asset-manifest.json');
export const STAGING = join(ROOT, 'docs/v5/art/staging');
export const RAW = join(ROOT, 'docs/v5/gemini');

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

export function findAsset(id) {
  const m = loadManifest();
  const a = m.assets.find((x) => x.id === id || x.file === id);
  if (!a) throw new Error(`no asset ${id} in docs/v5/art/asset-manifest.json`);
  return a;
}

/** The staged PNG of an asset (processed, not yet shipped). */
export const stagedPath = (a) => join(STAGING, a.file.replace(/\.(jpg|jpeg|webp)$/i, '.png'));

/** Where the shipped file goes. Atlas frames ship inside their atlas, not as files. */
export const shippedPath = (a) => (a.atlas ? null : join(ROOT, a.dest, a.file));

/** Naming rule (art bible section 8): lowercase snake case, category prefix, no spaces. */
export const NAME_RE = /^(fresco|portrait|bust|vignette|plate|icon|frame|btn|plaque|tile|chest|laurel|medal|crest|splash|logo|reward|ui)_[a-z0-9]+(_[a-z0-9]+)*\.(png|jpg)$/;
