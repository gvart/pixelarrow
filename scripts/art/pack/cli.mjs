// Pack the class sprite sheets for shipping (I3c; format: docs/v5/art/SHEET_FORMAT.md, "Packed sheets").
//
//   node scripts/art/pack/cli.mjs                 shipped sheets: src/assets/sheets/<class>/ -> src/generated/sheets/<class>/
//   node scripts/art/pack/cli.mjs --dev           also the dev placeholders: src/dev/sheets/<class>/ -> src/generated/dev-sheets/<class>/
//   node scripts/art/pack/cli.mjs --force         repack even when up to date
//   node scripts/art/pack/cli.mjs --in DIR --out DIR [--no-split]   one tree of <class>/ folders to another (measurements)
//
// The vite build runs the same (vite.config.ts, sheetPackPlugin), so `vite build`
// ships only packed sheets; src/generated/ is git-ignored. A class is repacked only
// when its manifest, its image or the packer changed (source.sha1 in the output).
// Every packed frame is checked pixel for pixel against the source after the PNGs
// are decoded again; a mismatch fails the pack.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../lib/png.mjs';
import { packSheet, verifyPack } from './pack.mjs';
import { encodePngSmall } from './png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..', '..');
/** Source and output trees: shipped art and the dev placeholders. */
export const TREES = {
  shipped: { from: join(ROOT, 'src', 'assets', 'sheets'), to: join(ROOT, 'src', 'generated', 'sheets') },
  dev: { from: join(ROOT, 'src', 'dev', 'sheets'), to: join(ROOT, 'src', 'generated', 'dev-sheets') },
};

/** Bumped when the packer's output changes, so every class repacks. */
const PACKER = readFileSync(join(HERE, 'pack.mjs'), 'utf8') + readFileSync(join(HERE, 'png.mjs'), 'utf8');

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/**
 * Pack one class folder (manifest.json + its image) into `outDir`.
 * Returns stats { cls, skipped, src: { decoded, bytes }, out: { decoded, bytes, pages } }.
 */
export function packClass(srcDir, outDir, { force = false, split = true, log = () => {} } = {}) {
  const mText = readFileSync(join(srcDir, 'manifest.json'), 'utf8');
  const m = JSON.parse(mText);
  const pngBuf = readFileSync(join(srcDir, m.image));
  const hash = createHash('sha1').update(PACKER).update(String(split)).update(mText).update(pngBuf).digest('hex');
  const outManifest = join(outDir, 'manifest.json');
  if (!force && existsSync(outManifest)) {
    try {
      const prev = JSON.parse(readFileSync(outManifest, 'utf8'));
      if (prev.packed?.source?.sha1 === hash && prev.packed.pages.every((p) => existsSync(join(outDir, p.file)))) return { cls: m.class, skipped: true };
    } catch {
      // repack
    }
  }
  const img = decodePng(pngBuf);
  const { manifest, pages } = packSheet(m, img, { split, sourceHash: hash });
  const encoded = pages.map((p) => encodePngSmall(p.img));
  // the files as the browser will read them
  verifyPack(m, img, manifest, encoded.map((e) => decodePng(e.png)));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  pages.forEach((p, i) => writeFileSync(join(outDir, p.file), encoded[i].png));
  writeFileSync(outManifest, `${JSON.stringify(manifest)}\n`);
  const st = {
    cls: m.class,
    skipped: false,
    src: { decoded: img.w * img.h * 4, bytes: pngBuf.length },
    out: {
      decoded: pages.reduce((s, p) => s + p.img.w * p.img.h * 4, 0),
      core: pages.filter((p) => p.group === 'core').reduce((s, p) => s + p.img.w * p.img.h * 4, 0),
      bytes: encoded.reduce((s, e) => s + e.png.length, 0),
      pages: pages.map((p, i) => `${p.file} ${p.img.w}x${p.img.h} ${p.group}${encoded[i].indexed ? ` indexed ${encoded[i].colors}` : ' rgba'} ${(encoded[i].png.length / 1024).toFixed(1)} KB`),
      frames: manifest.packed.cells.length / 3,
      stored: manifest.packed.rects.length / 5,
    },
  };
  log(formatStats(st));
  return st;
}

const MB = (b) => `${(b / 1048576).toFixed(2)} MB`;
const KB = (b) => `${(b / 1024).toFixed(1)} KB`;
export function formatStats(st) {
  if (st.skipped) return `${st.cls}: up to date`;
  return [
    `${st.cls}: ${st.out.frames} frames, ${st.out.stored} stored after trim + dedupe`,
    `  source  decoded ${MB(st.src.decoded)}, download ${KB(st.src.bytes)}`,
    `  packed  decoded ${MB(st.out.decoded)} (core ${MB(st.out.core)}), download ${KB(st.out.bytes)}`,
    ...st.out.pages.map((p) => `    ${p}`),
  ].join('\n');
}

/** Pack every <class>/ folder of `from` into `to`; output folders without a source are removed. */
export function packTree(from, to, opts = {}) {
  const classes = isDir(from) ? readdirSync(from).filter((c) => existsSync(join(from, c, 'manifest.json'))) : [];
  if (isDir(to)) for (const c of readdirSync(to)) if (!classes.includes(c)) rmSync(join(to, c), { recursive: true, force: true });
  return classes.map((c) => packClass(join(from, c), join(to, c), opts));
}

/** What the build runs: the shipped sheets, plus the dev placeholders on the dev server. */
export function packAll({ dev = false, force = false, log = () => {} } = {}) {
  const out = packTree(TREES.shipped.from, TREES.shipped.to, { force, log });
  if (dev) out.push(...packTree(TREES.dev.from, TREES.dev.to, { force, log }));
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const force = args.includes('--force');
  const log = (s) => console.log(s);
  if (opt('--in')) packTree(resolve(opt('--in')), resolve(opt('--out') ?? 'packed'), { force, split: !args.includes('--no-split'), log });
  else packAll({ dev: args.includes('--dev'), force, log });
}
