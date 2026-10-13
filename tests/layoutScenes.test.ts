import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs module without types
import { QUICK, matchScreens, sceneKeysOf, screensForChanges } from '../scripts/lib/layoutScenes.mjs';
// Which screens a layout-check run visits (V6-GATE-01b, V6-030): --scenes globs, --changed, --quick.
const IDS = ['menu', 'menu-settings', 'menu-shop', 'kit-tokens', 'kit-overlay-sheet', 'duel-ladder', 'duel-raid-result'];

describe('--scenes globs', () => {
  it('matches exact ids and * wildcards, comma-separated, in screen order', () => {
    expect(matchScreens(IDS, 'kit-*,menu')).toEqual(['menu', 'kit-tokens', 'kit-overlay-sheet']);
    expect(matchScreens(IDS, 'menu*')).toEqual(['menu', 'menu-settings', 'menu-shop']);
    expect(matchScreens(IDS, '*-result')).toEqual(['duel-raid-result']);
  });

  it('takes opt-in screens (art previews) only for a glob that names no default screen', () => {
    const optIn = ['army-bust-hoplite', 'army-bust-wolf'];
    expect(matchScreens(['army', 'army-stash'], 'army*', optIn)).toEqual(['army', 'army-stash']);
    expect(matchScreens(['army', 'army-stash'], 'army,army-bust-*', optIn)).toEqual(['army', 'army-bust-hoplite', 'army-bust-wolf']);
    expect(matchScreens(['army', 'army-stash'], 'army-bust-wolf', optIn)).toEqual(['army-bust-wolf']);
  });

  it('rejects a glob that matches no screen (a typo would silently check nothing)', () => {
    expect(() => matchScreens(IDS, 'menu,dule-*')).toThrow(/dule-\*/);
  });
});

// A tiny game: main.ts registers the scenes; ShopScene alone imports econ/demo.ts; kit.ts is shared.
const SRC = new Map(
  Object.entries({
    'src/main.ts': "import { BootScene } from './scenes/BootScene';\nimport { MenuScene } from './scenes/MenuScene';\nimport { loadLazyScenes } from './scenes/lazy';\nimport { scrollAllAreas } from './ui/kit';",
    'src/scenes/lazy.ts': "export const f = () => import('./lazyScenes');",
    'src/scenes/lazyScenes.ts': "import { ShopScene } from './ShopScene';\nimport { DuelScene } from './duel/DuelScene';\nimport { BeastTrialScene } from './BeastTrialScene';",
    'src/scenes/BootScene.ts': "import Phaser from 'phaser';\nexport class BootScene extends Phaser.Scene { constructor() { super('Boot'); } }",
    'src/scenes/BaseScene.ts': "import { Button } from '../ui/kit';",
    'src/scenes/MenuScene.ts': "import { BaseScene } from './BaseScene';\nexport class MenuScene extends BaseScene { constructor() { super('Menu'); } }",
    'src/scenes/ShopScene.ts': "import { BaseScene } from './BaseScene';\nimport { demo } from '../ui/econ/demo';\nexport class ShopScene extends BaseScene { constructor() { super('Shop'); } }",
    'src/scenes/duel/DuelScene.ts': "import { BaseScene } from '../BaseScene';\nimport { Row } from './duelParts';\nimport { shopTab } from '../ShopScene';\nexport class DuelScene extends BaseScene { constructor() { super('Duel'); } }",
    'src/scenes/duel/duelParts.ts': "import { t } from '../../i18n';\nexport const label = t('duel.ladder');",
    'src/scenes/BeastTrialScene.ts': "import { BaseScene } from './BaseScene';\nexport class BeastTrialScene extends BaseScene { constructor() { super('BeastTrial'); } }",
    'src/ui/kit.ts': 'export class Button {}',
    'src/ui/econ/demo.ts': "export const demo = { shop: 'shop.offers' };",
    'src/i18n/index.ts': "import { EN } from './en';",
    'src/i18n/en.ts': "import { DUELS_EN } from './duels.en';",
    'src/i18n/duels.en.ts': "export const DUELS_EN = {\n  'duel.ladder': 'Ladder',\n  'duel.floor': 'Floor {n}',\n};",
    'src/dev/balance.ts': "import { demo } from '../ui/econ/demo';",
  }),
);
const SCREENS = [
  { id: 'menu', keys: ['Menu'] },
  { id: 'shop-shop', keys: ['Shop'] },
  { id: 'duel-ladder', keys: ['Duel'] },
  { id: 'duel-raid-result', keys: ['Duel', 'Results'] },
  { id: 'mystery', keys: [] },
];
const ALL = SCREENS.map((s) => s.id);
const affected = (paths: string[], diffs: Record<string, string> = {}) => screensForChanges(paths.map((path) => ({ path, diff: diffs[path] ?? '' })), SRC, SCREENS);

describe('--changed: changed files to screens', () => {
  it('maps a module to the scenes that import it, through other modules and scenes that import scenes', () => {
    expect(affected(['src/ui/econ/demo.ts']).ids).toEqual(['shop-shop', 'duel-ladder', 'duel-raid-result', 'mystery']);
    expect(affected(['src/scenes/duel/duelParts.ts']).ids).toEqual(['duel-ladder', 'duel-raid-result', 'mystery']);
  });

  it('takes every screen when a change reaches the game without passing a scene (main.ts), or a shared scene base', () => {
    expect(affected(['src/ui/kit.ts']).ids).toEqual(ALL);
    expect(affected(['src/scenes/BaseScene.ts']).ids).toEqual(ALL);
    expect(affected(['src/scenes/BootScene.ts']).ids).toEqual(ALL);
  });

  it('takes every screen when a changed scene is staged by no screen, or a src file is not in the import graph', () => {
    expect(affected(['src/scenes/BeastTrialScene.ts']).ids).toEqual(ALL);
    expect(affected(['src/dev/balance.ts']).ids).toEqual(ALL);
    expect(affected(['src/ui/deleted.ts']).ids).toEqual(ALL);
  });

  it('maps an i18n dictionary to the files that use its key prefixes, not to every screen', () => {
    expect(affected(['src/i18n/duels.en.ts']).ids).toEqual(['duel-ladder', 'duel-raid-result', 'mystery']);
  });

  it('ignores files outside the game, runs everything for the check itself and the build inputs', () => {
    expect(affected(['docs/UI_KIT.md', 'server/src/index.ts', 'tests/duel.test.ts', 'landing/index.html']).ids).toEqual([]);
    for (const f of ['scripts/layout-check.mjs', 'scripts/lib/layoutMatrix.mjs', 'scripts/lib/harness.mjs', 'public/art/ui.png', 'index.html', 'package.json', 'vite.config.ts'])
      expect(affected([f]).ids, f).toEqual(ALL);
  });

  it('takes the screens named on the changed lines of an allowlist file', () => {
    const diff = '-    "duel-ladder|touch-size|duel.tab@844x390",\n+    "menu|text-size|*@320x693",\n     "shop-shop|overlap|a|b"';
    expect(affected(['scripts/layout-allowlist/V6-RSCR-04.json'], { 'scripts/layout-allowlist/V6-RSCR-04.json': diff }).ids).toEqual(['menu', 'duel-ladder']);
  });

  it('says why it took every screen', () => {
    expect(affected(['src/ui/kit.ts']).why).toMatch(/src\/ui\/kit\.ts/);
  });
});

describe('the scenes a screen stages', () => {
  const KNOWN = ['Menu', 'Battle', 'Results', 'Duel'];
  it('reads the scene keys its staging names, through the helpers it calls', () => {
    const helpers = { battle: "async function battle(p) { s.scene.start('Battle', { fresh: true }); }", results: "async function results(p) { await battle(p); isActive('Results'); }" };
    expect(sceneKeysOf("async (p) => (await start(p, 'Menu'), await call(p, 'Menu', 's.openSettings(); return 1;'))", helpers, KNOWN)).toEqual(['Menu']);
    expect(sceneKeysOf('async (p) => (await results(p), wait(p, 300))', helpers, KNOWN)).toEqual(['Battle', 'Results']);
    // quoted words that are not scene keys ('Hektor', 'Contact!') are not scenes
    expect(sceneKeysOf("async (p) => { await start(p, 'Duel', { opponent: 'Hektor' }); s.showBanner('Contact!'); }", helpers, KNOWN)).toEqual(['Duel']);
  });
});

describe('--quick', () => {
  it('has a smoke subset of about ten screens, at the design phone and a laptop size', () => {
    expect(QUICK.smoke.length).toBeGreaterThanOrEqual(8);
    expect(QUICK.smoke.length).toBeLessThanOrEqual(12);
    expect(QUICK.sizes).toEqual(['390x844', '1280x800']);
  });
});
