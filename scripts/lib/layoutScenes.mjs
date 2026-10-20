// Which screens a layout-check run visits (scripts/layout-check.mjs, docs/UI_KIT.md "Layout check",
// V6-030): `--scenes` globs, `--changed` (changed files mapped to the screens they can affect) and
// the `--quick` preset. Plain functions, unit-tested in tests/layoutScenes.test.ts.

const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

/**
 * The screen ids (in `ids` then `optIn` order) matching a comma-separated list of globs (`*`, `?`). A glob
 * reaches the opt-in screens only when it matches no default one; a glob matching nothing throws.
 */
export function matchScreens(ids, globs, optIn = []) {
  const hit = new Set();
  for (const g of globs.split(',').map((x) => x.trim()).filter(Boolean)) {
    const re = globRe(g);
    const own = ids.filter((id) => re.test(id));
    const found = own.length ? own : optIn.filter((id) => re.test(id));
    if (!found.length) throw new Error(`--scenes "${g}" matches no screen`);
    found.forEach((id) => hit.add(id));
  }
  return [...ids, ...optIn].filter((id) => hit.has(id));
}

/**
 * `--quick`: the screens a change touches at every matrix size, plus this smoke subset (key screens of
 * each family) at the design phone and a laptop size.
 */
export const QUICK = {
  smoke: ['menu', 'menu-settings', 'kit-overlay-sheet', 'world', 'army', 'hero', 'battle-deploy', 'results', 'shop-shop', 'duel-ladder', 'online-clan'],
  sizes: ['390x844', '1280x800'],
};

/**
 * The scene keys (of `known`, in that order) a screen's staging source names, following the helper
 * functions it calls (`helpers`: name -> source).
 */
export function sceneKeysOf(source, helpers, known) {
  const text = [];
  const todo = [source];
  const seen = new Set();
  while (todo.length) {
    const s = todo.pop();
    text.push(s);
    for (const m of s.matchAll(/\b(\w+)\(/g)) if (helpers[m[1]] && !seen.has(m[1])) (seen.add(m[1]), todo.push(helpers[m[1]]));
  }
  const all = text.join('\n');
  return known.filter((k) => new RegExp(`['"\`]${k}['"\`]`).test(all));
}

// ------------------------------------------------------------------ --changed

/** Changes that can move every screen: the check itself and the build's inputs outside src/. */
const EVERYTHING = [/^scripts\/layout-check\.mjs$/, /^scripts\/lib\/(layoutMatrix|layoutScenes|harness|fakeTelegram)\.mjs$/, /^public\//, /^index\.html$/, /^package(-lock)?\.json$/, /^vite\.config\./, /^tsconfig/];
/** Files that register scenes: a scene's walk up the importers stops there. */
const REGISTRY = new Set(['src/main.ts', 'src/scenes/lazy.ts', 'src/scenes/lazyScenes.ts']);
/** What every screen passes through: the entry point, the Boot scene (textures, fonts, the first route) and every scene's base class. */
const ROOTS = new Set(['src/main.ts', 'src/scenes/BootScene.ts', 'src/scenes/BaseScene.ts']);
/**
 * Imports of the roots that draw nothing on the checked screens: state, cloud saves, navigation,
 * monitoring, audio, routing (lazy scenes, deep links, the duel resume), Boot's retry button, the
 * settings sheet BaseScene opens on demand (the screens that show it import it themselves), and an
 * installer whose hooks never fire in the check (installWidgets: the long-press tooltip and toast).
 * Reaching one is not "every screen": the scenes importing the change still count. Every other root import (the kit, layout,
 * language, safe area, render scale, icon atlases...) acts on every screen, and so does a new one.
 */
const SERVICES = new Set([
  'src/state.ts',
  'src/platform/cloud.ts',
  'src/platform/nav.ts',
  'src/platform/monitoring.ts',
  'src/platform/telemetry.ts',
  'src/platform/telegram.ts',
  'src/audio/index.ts',
  'src/scenes/lazy.ts',
  'src/scenes/bootRoute.ts',
  'src/online/deeplink.ts',
  'src/online/client.ts',
  'src/duel/match.ts',
  'src/ui/mosaic/index.ts',
  'src/ui/settings.ts',
  'src/ui/widgets.ts',
]);

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g;
const SCENE_KEY = /\bsuper\(\s*'([A-Z]\w*)'\s*\)/;
const DICT_KEY = /^\s*'([a-zA-Z][\w-]*)\.[\w.-]+'\s*:/gm;

const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));
function norm(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}
/** The src file an import specifier names (.ts, .tsx, /index.ts, or as written). */
function resolveImport(from, spec, sources) {
  const base = norm(`${dirOf(from)}/${spec}`);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base.replace(/\.js$/, '.ts')]) if (sources.has(c)) return c;
  return base;
}

/** The reverse import graph of `sources` (path -> text): path -> the files importing it. */
function importers(sources) {
  const rev = new Map();
  for (const [file, text] of sources)
    for (const m of text.matchAll(IMPORT)) {
      const dep = resolveImport(file, m[1], sources);
      if (!rev.has(dep)) rev.set(dep, new Set());
      rev.get(dep).add(file);
    }
  return rev;
}

/** An i18n dictionary's stand-ins: the files outside src/i18n using its key prefixes; null when that is unknowable. */
function dictionaryUsers(path, sources) {
  const prefixes = [...new Set([...sources.get(path).matchAll(DICT_KEY)].map((m) => m[1]))];
  if (!prefixes.length) return null;
  const users = new Set();
  for (const pre of prefixes) {
    const re = new RegExp(`['"\`]${pre}\\.`);
    const hit = [...sources].filter(([f, text]) => !f.startsWith('src/i18n/') && re.test(text)).map(([f]) => f);
    if (!hit.length) return { why: `${path}: no file names its "${pre}." keys (built at run time?)` };
    hit.forEach((f) => users.add(f));
  }
  return { users: [...users] };
}

/**
 * The screens (ids, in `screens` order) a set of changed files can affect. Conservative: when unsure it
 * takes more, and every screen when a change reaches the game other than through a scene.
 *   changed  [{ path, diff }] (repository-relative; diff: the file's unified diff, read for allowlists)
 *   sources  Map path -> text of every src/ file
 *   screens  [{ id, keys }]: the scene keys each screen's staging names (sceneKeysOf); a screen naming
 *            none is taken whenever src/ changed
 * Returns { ids, all, why }: `why` says what forced every screen.
 */
export function screensForChanges(changed, sources, screens) {
  const everything = (why) => ({ ids: screens.map((s) => s.id), all: true, why });
  const rev = importers(sources);
  const sceneOf = new Map();
  for (const [file, text] of sources) {
    const m = SCENE_KEY.exec(text);
    if (m && /\bextends\b/.test(text)) sceneOf.set(file, m[1]);
  }
  // the roots' own imports act on every screen (canvas size, safe area, the kit, textures), bar the services
  const globals = new Set();
  for (const [f, by] of rev) if ([...ROOTS].some((r) => by.has(r)) && !sceneOf.has(f) && !SERVICES.has(f)) globals.add(f);
  const staged = new Set(screens.flatMap((s) => s.keys));
  const keys = new Set();
  const named = new Set();
  let src = false;
  for (const { path, diff = '' } of changed) {
    if (EVERYTHING.some((re) => re.test(path))) return everything(`${path} changed (the check itself or a build input)`);
    if (/^scripts\/layout-allowlist\/.+\.json$/.test(path)) {
      for (const line of diff.split('\n')) if (/^[+-]\s*"[^"|]+\|/.test(line)) named.add(/"([^"|]+)\|/.exec(line)[1]);
      continue;
    }
    if (!path.startsWith('src/')) continue;
    src = true;
    let starts = [path];
    if (/^src\/i18n\/[^/]+\.ts$/.test(path) && path !== 'src/i18n/index.ts' && sources.has(path)) {
      const d = dictionaryUsers(path, sources);
      if (d?.why) return everything(d.why);
      if (d) starts = d.users;
    }
    // walk up the importers: a scene adds its key (and goes on: scenes import scenes); a global module means every screen
    const seen = new Set(starts);
    const todo = [...starts];
    let root = null;
    let scene = false;
    while (todo.length) {
      const f = todo.pop();
      if (globals.has(f)) return everything(f === path ? `${f} acts on every screen` : `${path} reaches ${f}, which acts on every screen`);
      if (ROOTS.has(f)) {
        root = f;
        continue;
      }
      const key = sceneOf.get(f);
      // a scene no screen stages (BeastTrial) is not checked by the full matrix either: it adds no screen
      if (key) {
        if (staged.has(key)) keys.add(key);
        scene = true;
      }
      const up = [...(rev.get(f) ?? [])].filter((i) => !(key && REGISTRY.has(i)));
      if (!up.length && !key) {
        if (!sources.has(f)) return everything(`${f} is not in src/ (deleted or renamed)`);
        // a changed file the game never loads cannot be placed; an importer the game never loads (a dev tool) is a dead end
        if (starts.includes(f)) return everything(`${f}: nothing imports it`);
      }
      for (const i of up) if (!seen.has(i)) (seen.add(i), todo.push(i));
    }
    // a root loads it but no scene does: it acts on the whole game
    if (root && !scene) return everything(`${path} reaches ${root} but no scene`);
  }
  const ids = screens.filter((s) => named.has(s.id) || s.keys.some((k) => keys.has(k)) || (src && !s.keys.length)).map((s) => s.id);
  return { ids, all: false, why: '' };
}
