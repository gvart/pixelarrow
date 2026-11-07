// View data for the Godot region view (docs/impl/godot-port.md P9) into godot/view/ (generated, not committed):
//   <region>/meta.json, <region>/cells.bin (gzip), <region>/atlas<k>.png   src/dev/godotView.ts exportRegion
//   objects/<def id>.png, objects.json                                     the objects' art (trees relit)
//   stones/<stone>.png                                                     the rock wall textures
//   objects/<def id>-idle.png                                              the animals' idle strips, copied
//   sheets/<class>/<class>.png, manifest.json                              the unit sheets (src/assets/sheets), copied
//   look.json, look.bin (gzip RGBA)                                        the per-man look palette (src/dev/godotLook.ts)
//   buildings.json, buildings/<file>                                       the building and town art (src/dev/godotBuild.ts)
//   ui/icons/<24|32>/<id>.png, ui/fonts/<name>.woff2                        the HUD's kit icons (public/war/ui) and fonts, copied
// The ground and object art code needs canvases, so it runs in headless Chromium against a Vite server this script
// starts; the looks and the building art are pure and run under node.
// Usage: npm run view:godot [region ...]   (default: the Elaia slice)
import { createServer, runnerImport } from 'vite';
import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = `${ROOT}godot/view`;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['elaia', 'elaia-n', 'elaia-e', 'elaia-s', 'elaia-w'];
const t0 = Date.now();

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, hmr: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}war/tiles/tiles.json`);
  rmSync(OUT, { recursive: true, force: true });
  const write = (rel, data) => { const p = `${OUT}/${rel}`; mkdirSync(p.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(p, data); };
  const dataUrl = (s) => Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
  const used = new Set();
  for (const id of ids) {
    const r = await page.evaluate(async (id) => (await import('/src/dev/godotView.ts')).exportRegion(id), id);
    write(`${id}/meta.json`, JSON.stringify(r.meta) + '\n');
    write(`${id}/cells.bin`, gzipSync(Buffer.from(r.cells, 'base64'), { level: 6 }));
    r.pages.forEach((p, k) => write(`${id}/atlas${k}.png`, dataUrl(p)));
    for (const o of await page.evaluate(async (id) => (await import('/src/dev/godotView.ts')).objectIds(id), id)) used.add(o);
    console.log(`${id}: ${r.meta.fw}x${r.meta.fh} cells, ${r.meta.frames} frames on ${r.pages.length} atlas page(s), peaks ${r.meta.peaks}`);
  }
  const o = await page.evaluate(async (ids) => (await import('/src/dev/godotView.ts')).exportObjects(ids), [...used]);
  for (const [id, p] of Object.entries(o.images)) write(`objects/${id}.png`, dataUrl(p));
  write('objects.json', JSON.stringify(o.defs) + '\n');
  const stones = await page.evaluate(async () => (await import('/src/dev/godotView.ts')).exportStones());
  for (const [s, p] of Object.entries(stones)) write(`stones/${s}.png`, dataUrl(p));
  write('anims.json', JSON.stringify(await page.evaluate(async () => (await import('/src/dev/godotView.ts')).animFallback())) + '\n');
  for (const d of o.defs) if (d.idle) cpSync(`${ROOT}public/war/biomes/${d.id.split('/')[0]}/${d.idle.file}`, `${OUT}/objects/${d.id}-idle.png`);
  cpSync(`${ROOT}src/assets/sheets`, `${OUT}/sheets`, { recursive: true });
  const opts = { root: ROOT, configFile: false, logLevel: 'error', server: { hmr: false } };
  const sheets = `${ROOT}src/assets/sheets`, manifests = {};
  for (const c of readdirSync(sheets)) if (existsSync(`${sheets}/${c}/manifest.json`)) manifests[c] = JSON.parse(readFileSync(`${sheets}/${c}/manifest.json`, 'utf8'));
  const look = (await runnerImport('/src/dev/godotLook.ts', opts)).module.lookData(manifests);
  write('look.json', JSON.stringify(look.json) + '\n');
  write('look.bin', gzipSync(Buffer.from(look.rgba.buffer, look.rgba.byteOffset, look.rgba.byteLength), { level: 6 }));
  const bld = (await runnerImport('/src/dev/godotBuild.ts', opts)).module.buildingArt((p) => readFileSync(`${ROOT}${p}`, 'utf8'));
  write('buildings.json', JSON.stringify(bld.json) + '\n');
  for (const [from, to] of bld.files) { mkdirSync(`${OUT}/buildings/${to}`.replace(/\/[^/]*$/, ''), { recursive: true }); cpSync(`${ROOT}${from}`, `${OUT}/buildings/${to}`); }
  // the HUD (godot/src/hud): the kit's icons and the two faces of the DOM HUD (Cinzel titles, Inter body)
  cpSync(`${ROOT}public/war/ui/icons`, `${OUT}/ui/icons`, { recursive: true });
  for (const [pkg, file] of [['cinzel', 'cinzel-latin-700-normal'], ['inter', 'inter-latin-600-normal'], ['inter', 'inter-latin-700-normal']])
    cpSync(`${ROOT}node_modules/@fontsource/${pkg}/files/${file}.woff2`, `${OUT}/ui/fonts/${file}.woff2`);
  // plain files read at run time (Image.load_from_file), not Godot resources
  write('.gdignore', '');
  console.log(`${ids.length} regions, ${o.defs.length} object defs in godot/view (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} finally {
  await browser.close();
  await server.close();
}
