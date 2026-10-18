// The layout check's screen matrix and its allowlist (scripts/layout-check.mjs,
// docs/UI_KIT.md "Layout check"). Plain functions, unit-tested in
// tests/layoutMatrix.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The v6 screen matrix (brief "Hard constraints: screen matrix"), by group.
 * `v5` holds the v5 phone sizes outside the matrix, still run by CI so the
 * portrait phones keep the coverage they had (V5-014: 320x640).
 */
export const MATRIX = {
  phone: ['390x844', '360x780', '320x693'],
  tablet: ['768x1024', '820x1180'],
  landscape: ['844x390', '1024x768', '1280x800', '1440x900', '1920x1080'],
  v5: ['320x568', '375x667', '430x932', '320x640'],
};
MATRIX.all = [MATRIX.phone[0], MATRIX.phone[1], MATRIX.phone[2], MATRIX.landscape[0], ...MATRIX.tablet, ...MATRIX.landscape.slice(1)];

/**
 * The thresholds of the landscape checks (design/ux/landscape-v6.md §5, src/ui/layoutCheck.ts checkWide),
 * one table next to the sizes. Keys of the per-class rows are variants: compact-port, compact-land,
 * medium, expanded. Widths in `stretched` are UI px and match src/ui/sizeClass.ts (§2.3).
 */
export const WIDE_RULES = {
  letterbox: 2, // CSS px #game may fall short of the safe box, and the canvas of #game
  wastedWidth: { medium: 0.8, expanded: 0.7 }, // least share of contentW the content spans (menu screens)
  emptyColumn: { width: 0.25, height: 0.6, variants: ['compact-land', 'medium', 'expanded'] }, // an empty strip this wide x tall fails
  stretched: { row: 360, button: 240, cta: 300, line: 300, dialog: 320 },
  // a docked side panel's width (§3.4, §2.3), UI px; `share` of VW lowers the least width (Settings: 60% of VW
  // in compact landscape); compact portrait and medium show sheets instead (V6-063)
  sidePanel: { 'compact-land': { min: 220, max: 280, share: 0.6 }, expanded: { min: 240, max: 320 } },
  fieldCoverage: { expanded: 0.6, 'compact-land': 0.5, medium: 0.5, 'compact-port': 0.4 }, // least share of the box the field shows
};
/** The landscape checks (src/ui/layoutCheck.ts WIDE_CHECKS): a pending family's findings of these are reported, not failed. */
export const WIDE_CHECKS = new Set(['letterbox', 'class-match', 'wasted-width', 'empty-column', 'stretched', 'field-coverage', 'above-fold', 'element-parity', 'nav-labels']);
/** The size whose `uiId`s every other size must show (element-parity). */
export const PARITY_BASE = '390x844';

/**
 * element-parity, the one landscape check that compares sizes (so it runs here, across browser contexts;
 * the other eight are src/ui/layoutCheck.ts checkWide): every `uiId` shown at PARITY_BASE (`base`) shows
 * here too, or is registered collapsed (`uiCollapsed(scene, id, intoId)`) into a control shown here.
 * `transient`: ids registered transient by design (`uiTransient`, e.g. the battle Undo chip's 3 s window)
 * at either size, left out (PARITY-STABLE, V6-076); they are still checked for overlap and size when shown.
 */
export function checkParity(base, here, collapsed, transient = []) {
  const out = [];
  const passing = new Set(transient);
  for (const id of base) {
    if (here.has(id) || passing.has(id)) continue;
    const into = collapsed[id];
    if (into && here.has(into)) continue;
    out.push({ check: 'element-parity', ids: [id], detail: into ? `collapsed into ${into}, which is not shown` : `shown at ${PARITY_BASE}, missing here (uiCollapsed registers a dropped element)` });
  }
  return out;
}

/** The sizes to run: `--sizes` (a list of WxH) wins; else the `--matrix` groups (default all). */
export function sizesFor(matrix = 'all', sizes = '') {
  if (sizes) return sizes.split(',');
  const out = [];
  for (const g of matrix.split(',')) {
    if (!MATRIX[g]) throw new Error(`unknown --matrix group "${g}" (${Object.keys(MATRIX).join(', ')})`);
    for (const s of MATRIX[g]) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** A full-screen Telegram's insets (CSS px): status bar + Telegram's pills at the top, the home indicator. */
export const TG = { safeTop: 59, contentTop: 46, safeBottom: 34 };
/** The same phone held sideways: the notch and the rounded corners at the sides, the pills still on top. */
export const TG_LANDSCAPE = { safeTop: 0, contentTop: 46, safeBottom: 21, safeLeft: 59, safeRight: 59 };

/** Telegram's insets at a size, or null where the check skips the Telegram variant (tablets, laptops). */
export function tgInsets([w, h]) {
  if (Math.min(w, h) >= 480) return null;
  return w > h ? TG_LANDSCAPE : TG;
}

/**
 * Screens that crash the game in one configuration (`screen@WxH/insets` -> owner story and the error).
 * A crash cannot be allowlisted and breaks every later screen in its browser context, so the run
 * skips these and prints them; the owner fixes the crash and deletes the line (the list only shrinks).
 */
export const KNOWN_CRASHES = {};

/** Every configuration (language x size x safe-area variant) to visit; the Telegram variant only where tgInsets has one. */
export function configsFor(sizes, langs, insets) {
  const out = [];
  for (const lang of langs)
    for (const s of sizes) {
      const size = s.split('x').map(Number);
      for (const ins of insets) {
        const tg = ins === 'tg' ? tgInsets(size) : null;
        if (ins === 'tg' && !tg) continue;
        out.push({ lang, insets: ins, size, tg });
      }
    }
  return out;
}

// ------------------------------------------------------------------ allowlist
// scripts/layout-allowlist/<story>.json, one file per owner story (V6-021), each
// { "_doc": "...", "entries": [...] }. An entry is `screen|check|element ids`, or
// `screen|check|*` for the whole screen, optionally scoped to one size with `@WxH`.

const AT = /@(\d+x\d+)$/;
/** An entry's key and size (null when it holds at every size). */
export const splitEntry = (e) => {
  const m = AT.exec(e);
  return m ? { key: e.slice(0, m.index), size: m[1] } : { key: e, size: null };
};
/** `screen|check|*` of a key. */
export const wildOf = (key) => key.split('|').slice(0, 2).join('|') + '|*';

/** Story files merged: [story, entries][] -> Map entry -> story. An entry may sit in one file only. */
export function mergeAllowlist(files) {
  const allowed = new Map();
  for (const [story, entries] of files)
    for (const e of entries) {
      if (allowed.has(e)) throw new Error(`allowlist entry ${e} is in both ${allowed.get(e)}.json and ${story}.json`);
      allowed.set(e, story);
    }
  return allowed;
}

/** Every story file in `dir` (scripts/layout-allowlist), merged; empty when the folder is missing. */
export function loadAllowlist(dir) {
  let names = [];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return new Map();
  }
  return mergeAllowlist(names.map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8')).entries ?? []]));
}

/** Whether a violation `key` seen at `size` is allowlisted. */
export function allows(allowed, key, size) {
  const w = wildOf(key);
  return allowed.has(key) || allowed.has(w) || allowed.has(`${key}@${size}`) || allowed.has(`${w}@${size}`);
}

/**
 * The V6-RSCR story that owns each screen family's layout fixes
 * (production/epics/v6-responsive-screens/EPIC.md): first matching prefix.
 */
const STORY_OF = [
  ['menu-settings', 'V6-RSCR-10'],
  ['menu-reset', 'V6-RSCR-10'],
  ['kit-overlay', 'V6-RSCR-10'],
  ['kit-', 'V6-RSCR-11'],
  ['menu-shop', 'V6-RSCR-06'],
  ['menu', 'V6-RSCR-01'],
  ['battle-', 'V6-RSCR-02'],
  ['results', 'V6-RSCR-02'],
  ['inspect', 'V6-RSCR-02'],
  ['online-coach', 'V6-RSCR-03'], // the coach marks sit on the online war map (OnlineScene, RSCR-03's family)
  ['online', 'V6-RSCR-03'],
  ['merchant-', 'V6-RSCR-03'],
  ['duel-', 'V6-RSCR-04'],
  ['army', 'V6-RSCR-05'],
  ['stash-', 'V6-RSCR-05'],
  ['hero', 'V6-RSCR-05'],
  ['shop', 'V6-RSCR-06'],
  ['consumable-picker', 'V6-RSCR-06'],
  ['market-', 'V6-RSCR-06'],
  ['village', 'V6-RSCR-06'],
  ['town-', 'V6-RSCR-06'],
  ['recruits', 'V6-RSCR-06'],
  ['world', 'V6-RSCR-07'],
  ['camp', 'V6-RSCR-07'],
  ['fire', 'V6-RSCR-07'],
  ['first-run', 'V6-RSCR-08'],
  ['tutorial-', 'V6-RSCR-08'],
  ['codex', 'V6-RSCR-09'],
];
/** The owner story of a screen id, or undefined. */
export const storyOf = (screen) => STORY_OF.find(([p]) => screen.startsWith(p))?.[1];

/** Checks allowlisted per screen (`screen|check|*`) rather than per element. */
export const PER_SCREEN = new Set(['text-size']);
/** Sizes where the foundation screens (owner F) stay clean: the phone portrait sizes, v5's reference. */
const FOUNDATION_CLEAN = new Set([...MATRIX.phone, ...MATRIX.v5]);

/** Whether `key` (maybe `screen|check|*`) showed in `found`, at `size` or (null) at any size. */
function shows(found, key, size) {
  const hit = (f) => !size || f.sizes.has(size);
  if (!key.endsWith('|*')) return found.has(key) && hit(found.get(key));
  for (const [k, f] of found) if (wildOf(k) === key && hit(f)) return true;
  return false;
}

/**
 * Whether this run visited what an entry covers: its screen, at its size (scoped) or at every matrix size
 * (unscoped). `ran.pairs` (screen@size), when given, is what ran where (--quick runs screens at some sizes only).
 */
const covered = (ran, key, size) => {
  const screen = key.split('|')[0];
  const at = ran.pairs ? (s) => ran.pairs.has(`${screen}@${s}`) : (s) => ran.screens.has(screen) && ran.sizes.has(s);
  return size ? at(size) : MATRIX.all.every(at);
};

/**
 * The allowlist rewritten from a run (`--update-allowlist`), as story -> sorted entries.
 * `found`: violation key -> { screen, sizes }; `ran`: { screens, sizes } visited;
 * `owners`: screen -> owner group (F = foundation). Entries the run did not cover
 * are kept; covered ones only while they still show; new violations are added
 * scoped to each size they showed at, in their screen's story file.
 */
export function rewriteAllowlist(allowed, found, ran, owners) {
  const kept = new Map();
  for (const [e, story] of allowed) {
    const { key, size } = splitEntry(e);
    if (!covered(ran, key, size) || shows(found, key, size)) kept.set(e, story);
  }
  for (const [k, f] of found) {
    const per = PER_SCREEN.has(k.split('|')[1]);
    for (const size of f.sizes) {
      if (allows(kept, k, size)) continue;
      if (owners[f.screen] === 'F' && !per && FOUNDATION_CLEAN.has(size)) continue;
      const story = storyOf(f.screen);
      if (!story) throw new Error(`no owner story for screen ${f.screen} (scripts/lib/layoutMatrix.mjs STORY_OF)`);
      kept.set(`${per ? wildOf(k) : k}@${size}`, story);
    }
  }
  const out = {};
  for (const [e, story] of kept) (out[story] ??= []).push(e);
  for (const s of Object.keys(out)) out[s].sort();
  return out;
}

/** Entries the run covered that no longer show: fixed, to be removed. */
export function staleEntries(allowed, found, ran) {
  return [...allowed.keys()]
    .filter((e) => {
      const { key, size } = splitEntry(e);
      return covered(ran, key, size) && !shows(found, key, size);
    })
    .sort();
}

// ------------------------------------------------------------------ pending families (V6-021, V6-RFND-03)
// A family that has not migrated has `"pending": true` in its scripts/layout-allowlist/V6-RSCR-NN.json:
// its findings of the landscape checks are reported, not failed. Its story drops the flag when it opts
// the family in (`responsive = true` on its scenes); V6-RSCR-11 deletes the mechanism.

/** The story files in `dir` flagged `"pending": true`. */
export function loadPending(dir) {
  let names = [];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return new Set();
  }
  return new Set(names.filter((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).pending === true).map((f) => f.slice(0, -5)).sort());
}

/** Whether a screen's family (its owner story) is still pending. */
export const isPending = (screen, pending) => pending.has(storyOf(screen));

/** The foundation screens (Menu, Settings, Kit): the landscape checks can never be allowlisted for them (§5). */
export const isFoundationScreen = (screen, owner) => owner === 'F' && (screen === 'menu' || screen.startsWith('menu-') || screen.startsWith('kit-'));

/**
 * Splits one screen's violations: the landscape-check findings of a screen that has not opted in
 * (`responsive` false: the canvas is the legacy column) in a pending family are `pending` (reported);
 * the rest are `enforced` (failed unless allowlisted). An opted-in screen is enforced even inside a
 * pending family: opting in is migrating.
 */
export function triageWide({ screen, responsive, violations }, pending) {
  const held = !responsive && isPending(screen, pending);
  const out = { enforced: [], pending: [] };
  for (const v of violations) (held && WIDE_CHECKS.has(v.check) ? out.pending : out.enforced).push(v);
  return out;
}

/**
 * `--update-allowlist` made stable (V6-057: one run under timing flakes added 35 one-off hits and dropped
 * 131 live entries). The rewrite of rewriteAllowlist is only proposed: an entry is added when the previous
 * update run proposed it too, and dropped when the previous run also missed it; entries of pending
 * families are never dropped, and the landscape checks of the foundation screens are never added.
 * `prev` is the previous run's `candidates` ({ add, drop }); returns the allowlist (story -> entries)
 * and this run's candidates.
 */
export function stableRewrite(allowed, found, ran, owners, pending, prev = { add: [], drop: [] }) {
  const proposed = new Map();
  for (const [story, entries] of Object.entries(rewriteAllowlist(allowed, found, ran, owners))) for (const e of entries) proposed.set(e, story);
  const foundationWide = (e) => {
    const [screen, check] = splitEntry(e).key.split('|');
    return WIDE_CHECKS.has(check) && isFoundationScreen(screen, owners[screen]);
  };
  const add = [...proposed.keys()].filter((e) => !allowed.has(e) && !foundationWide(e)).sort();
  const drop = [...allowed.keys()].filter((e) => !proposed.has(e) && !pending.has(allowed.get(e))).sort();
  const kept = new Map(allowed);
  const before = { add: new Set(prev.add), drop: new Set(prev.drop) };
  for (const e of add) if (before.add.has(e)) kept.set(e, proposed.get(e));
  for (const e of drop) if (before.drop.has(e)) kept.delete(e);
  const out = {};
  for (const [e, story] of kept) (out[story] ??= []).push(e);
  for (const s of Object.keys(out)) out[s].sort();
  return { out, candidates: { add, drop } };
}
