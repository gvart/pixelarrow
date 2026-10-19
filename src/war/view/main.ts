/**
 * War region sandbox: open /sandbox.html?region=<id>&sim=<real|fake>&scenario=<id> on the dev server
 * (scenarios: src/war/scenarios, test-ridge only; default free). Loads and
 * validates src/war/regions/<id>.json (default test-ridge); ?region=fake is the built-in fake valley
 * (src/war/fake/region.ts). ?sim=fake runs the straight-line fake sim instead of src/war/sim.
 * ?art=grey draws the greybox terrain instead of the PixelLab art (public/war/).
 * `window.__sandbox` is the scene, for scripts/war/sandbox-shots.mjs.
 */
import Phaser from 'phaser';
import { fakeRegion } from '../fake/region';
import { loadRegion } from '../region/loader';
import { scenarioById, SCENARIOS } from '../scenarios';
import { loadArt } from './art';
import { applyScenario, devPanel } from './devPanel';
import { SandboxScene } from './SandboxScene';
import { loadSheetImages } from './units';

const q = new URLSearchParams(location.search);
const id = q.get('region') ?? 'test-ridge';

// no top-level await: the build targets es2020
void Promise.all([id === 'fake' ? Promise.resolve(fakeRegion()) : loadRegion(id), q.get('art') === 'grey' ? null : loadArt(), loadSheetImages()]).then(([region, art, sheets]) => {
  const scene = new SandboxScene();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    backgroundColor: '#1b1e22',
    scale: { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight },
    render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  });
  const sc = id === 'test-ridge' ? (scenarioById(q.get('scenario')) ?? SCENARIOS.find((s) => s.id === 'free')!) : null;
  game.scene.add('Sandbox', scene, true, { region, art, sheets });
  // once create() ran (the sim client exists only then)
  const ready = () => {
    if (!scene.sim) return;
    game.events.off('poststep', ready);
    if (sc) applyScenario(scene, sc);
    devPanel(game, scene, sc);
  };
  game.events.on('poststep', ready);
  (window as unknown as { __sandbox: SandboxScene }).__sandbox = scene;
});
