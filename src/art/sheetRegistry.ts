/**
 * Where sprite sheets come from (src/art/sheetDoll.ts draws them):
 *
 *  - Shipped art: every src/assets/sheets/<class>/manifest.json with its tier
 *    images next to it. Manifests are bundled (small); the images are plain
 *    asset URLs, fetched only when a figure of that class and tier is first
 *    drawn.
 *  - Dev builds only, with ?sheets=dev: the placeholder sheets in
 *    src/dev/sheets/ (made by scripts/dev/placeholder-sheet.mjs) on top.
 *  - ?sheets=off draws every figure procedurally (the fallback check).
 */
import { installSheetDolls, registerSheet, setSheetLoader, setSheetsEnabled, type SheetPixels } from './sheetDoll';
import type { SheetManifest } from './sheetManifest';

const shipped = import.meta.glob('../assets/sheets/*/manifest.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const shippedImages = import.meta.glob('../assets/sheets/*/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Decode an image once; frames are cut from it with a scratch canvas when asked for. */
async function loadImage(url: string, m: SheetManifest): Promise<SheetPixels> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = m.frame.w;
  c.height = m.frame.h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return {
    w: img.naturalWidth,
    h: img.naturalHeight,
    read(x, y, w, h) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    },
  };
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

let done = false;

/** Install the sheet renderer and register the sheets (once; src/ui/sprites.ts calls it). */
export function initSheets(): void {
  if (done) return;
  done = true;
  installSheetDolls();
  const flag = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('sheets');
  if (flag === 'off') setSheetsEnabled(false);
  if (typeof Image !== 'undefined') setSheetLoader(loadImage);
  for (const [path, raw] of Object.entries(shipped)) {
    try {
      registerSheet(raw, (file) => shippedImages[dirOf(path) + file] ?? null);
    } catch (err) {
      console.warn(err);
    }
  }
  if (import.meta.env.DEV && flag === 'dev') {
    // the dev server serves source files as they are: /src/dev/sheets/<class>/<file>
    const dev = import.meta.glob('../dev/sheets/*/manifest.json', { import: 'default' });
    for (const [path, get] of Object.entries(dev)) {
      const base = `/src/dev/sheets/${path.split('/').slice(-2, -1)[0]}/`;
      get().then((raw) => registerSheet(raw, (file) => base + file)).catch((err) => console.warn(err));
    }
  }
}
