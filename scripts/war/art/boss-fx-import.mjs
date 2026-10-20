// Boss FX strips (ART-L, PROMPTS_ART.md 40d): effects built in PixelLab's vfx_workbench (free; saved to My effects, the
// ids below re-open them with their sliders) are fetched as grid sheets + JSON, laid out as horizontal strips in
// public/war/fx/fx-boss-<id>.png (binary alpha) and registered in public/war/fx/objects.json (anchor from the export's
// pivot; colours the strip adds to the shared palette are appended to its `palette`). src/war/view/bossFx.ts plays them.
// Usage: node scripts/war/art/boss-fx-import.mjs [id,id...]   (ends with the fx QA gate)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, hardAlpha, rgbToHex } from '../../art/lib/ops.mjs';
import { runFxQa } from './qa.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..'), OUT = join(ROOT, 'public/war/fx');
const API = 'https://api.pixellab.ai/mcp/pixel-tools';
const only = process.argv[2]?.split(',');
const TMP = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'boss-fx-'));

/** id: [download id, file stem, My effects id, loop, blend, use]. */
const FX = {
  'boss-breath-jet': ['115389c6-3491-4b7f-ab6b-426ec3195cf7', 'drakon-breath-jet', 'e3955252-9ae5-4fb6-ae20-967b0d971cc5', true, 'normal', "a roaring jet of flame pointing +x from the anchor (the mouth), widening into billows: Drakon's breath (rotated along the cone, scaled to its length; the Chimera's goat at a third)"],
  'boss-ground-fire': ['28c24760-fe4a-4d61-bdda-21b9d10de83c', 'breath-ground-fire', '7f345c1c-7fc2-406f-803e-03d8dd9f9811', true, 'normal', 'a low burning patch the breath leaves on the ground (several along the cone, ~6 s, then smoke)'],
  'boss-smoke': ['d05f31b3-ccc3-4452-a391-1f6a8394c9dc', 'burn-smoke-column', '1f5dabe1-22f0-4cb6-90a1-e7799bc47601', true, 'normal', 'a smoke column rising off burnt ground after the breath'],
  'boss-impact': ['7b9ad381-6b3d-4238-a146-05449642a754', 'boss-heavy-impact', '1a948ee9-e5ad-4fb1-8156-6c59d0eefedb', false, 'normal', "a heavy slam: ground cracks, a crater dust ring, thrown stones: Drakon's crash, Brontes' rock and smash, a stomp, a guardian's collapse"],
  'boss-wingbeat': ['8ef8a7bf-53eb-45a7-bb77-2f56355d0e03', 'drakon-wingbeat-dust', '06c73b73-0243-41d1-a879-d22e11ebabb9', false, 'normal', 'dust blown out flat by a wing-beat: Drakon taking off and landing on a perch'],
  'boss-sparks': ['ea671d37-8640-4431-851b-fbf71b57810b', 'chain-break-sparks', '1d37f5ff-7dab-48a9-8d11-84e494c6de3d', false, 'normal', "a white flash and a shower of sparks: Gyges breaking his chains, his triple blows landing"],
  'boss-splash': ['77875cbf-5bf2-4e69-b281-7cc440652559', 'scylla-burst-splash', '79df7423-f6fe-421a-b35c-a90af3bbc4af', false, 'normal', 'a crown of water thrown up with rings spreading: a Scylla head bursting from the sea, her drag onto the flats'],
  'boss-beam': ['40a4d1c3-9651-4c21-b9fa-0968396bf463', 'boss-loot-beam', 'c38a5cab-ce69-4e27-9043-299dd3ab5771', true, 'add', "a golden column of light on a slain guardian's loot pile"],
  'boss-venom': ['126c90ea-eda0-4b57-8a22-c366348512bf', 'chimera-venom-puff', 'f9e34cae-d52a-4e04-9246-00edca86a305', false, 'normal', "a green venom cloud: the Chimera's serpent biting"],
  'boss-frenzy': ['7a532d23-68f3-49aa-bf3b-6d492da987eb', 'frenzy-aura', 'cda1d145-b3e5-4d3a-990f-f59658d48e56', true, 'add', "flames of frenzy rising round a guardian (the Maenad Queen's P2 in wine; tinted red: Drakon enraged)"],
  'boss-horn': ['f6d88d6b-1c87-4afc-95f8-c5abe763f306', 'war-horn-rally', 'ed054fb4-66b8-473f-aa4d-0127336934ca', false, 'normal', "a golden ring racing out with rising arrows: the Bandit King's war horn rallying the host"],
  'boss-slash': ['c622131b-7968-4d41-9be4-89de698df25b', 'giant-sweep-slash', '051513dc-fb18-4902-977a-0fe002882511', false, 'normal', 'a pale crescent and a hit star: a claw or tail sweep, a giant blow'],
};

const X = JSON.parse(readFileSync(join(OUT, 'objects.json'), 'utf8'));
const pal = new Set(X.palette);
const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'), 'utf8'));
for (const h of G.palette) pal.add(h);
mkdirSync(OUT, { recursive: true });
for (const [id, [dl, stem, effect, loop, blend, use]] of Object.entries(FX)) {
  if (only && !only.includes(id)) continue;
  const get = (f) => (execFileSync('curl', ['-sf', '-o', join(TMP, f), `${API}/${dl}/${f}`]), readFileSync(join(TMP, f)));
  const meta = JSON.parse(get(`${stem}.json`).toString());
  const sheet = decodePng(get(`${stem}.png`));
  // a one-shot's blank tail frames are dropped (the strip ends when the effect has gone)
  const fr = meta.frames.map((f) => f.frame), w = fr[0].w, h = fr[0].h;
  const empty = (f) => { const c = crop(sheet, f); for (let i = 3; i < c.data.length; i += 4) if (c.data[i] >= 128) return false; return true; };
  while (fr.length > 1 && empty(fr[fr.length - 1])) fr.pop();
  const raw = blank(w * fr.length, h);
  fr.forEach((f, n) => paste(raw, crop(sheet, f), n * w, 0));
  const out = hardAlpha(raw, 128);
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3]) pal.add(rgbToHex([out.data[i], out.data[i + 1], out.data[i + 2]]));
  const file = `fx-${id}.png`;
  writeImage(join(OUT, file), out);
  const p = meta.frames[0].pivot, ms = meta.frames[0].duration;
  const entry = {
    id, file, frames: fr.length, fps: Math.round(1000 / ms), loop, frame: { w, h },
    anchor: { x: Math.min(w - 1, Math.round(p.x * w)), y: Math.min(h - 1, Math.round(p.y * h)) }, blend, use,
    source: `PixelLab vfx_workbench, My effects ${effect}`,
  };
  const i = X.fx.findIndex((f) => f.id === id);
  if (i >= 0) X.fx[i] = entry;
  else X.fx.push(entry);
  console.log(`${id}: ${fr.length} frames ${w}x${h} @ ${entry.fps} fps`);
}
X.palette = [...new Set([...X.palette, ...[...pal].filter((h) => !G.palette.includes(h))])].sort();
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(X, null, 1) + '\n');
process.exit(runFxQa().length ? 1 : 0);
