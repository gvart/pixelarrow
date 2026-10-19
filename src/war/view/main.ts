/**
 * War region sandbox: open /sandbox.html?region=<id>&sim=<real|fake>&scenario=<id> on the dev server
 * (scenarios: src/war/scenarios, test-ridge only; default free). Loads and
 * validates src/war/regions/<id>.json (default test-ridge); ?region=fake is the built-in fake valley
 * (src/war/fake/region.ts). ?sim=fake runs the straight-line fake sim instead of src/war/sim.
 * `window.__sandbox` is the scene, for scripts/war/sandbox-shots.mjs.
 */
import Phaser from 'phaser';
import { fakeRegion } from '../fake/region';
import { loadRegion } from '../region/loader';
import { scenarioById, SCENARIOS } from '../scenarios';
import { applyScenario, devPanel } from './devPanel';
import { SandboxScene } from './SandboxScene';

const q = new URLSearchParams(location.search);
const id = q.get('region') ?? 'test-ridge';

// no top-level await: the build targets es2020
void (id === 'fake' ? Promise.resolve(fakeRegion()) : loadRegion(id)).then((region) => {
  const scene = new SandboxScene();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    backgroundColor: '#1b1e22',
    scale: { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight },
    render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  });
  const sc = id === 'test-ridge' ? (scenarioById(q.get('scenario')) ?? SCENARIOS.find((s) => s.id === 'free')!) : null;
  game.scene.add('Sandbox', scene, true, { region });
  // once create() ran (the sheets load first, so the sim client exists only then)
  const ready = () => {
    if (!scene.sim) return;
    game.events.off('poststep', ready);
    if (sc) applyScenario(scene, sc);
    devPanel(game, scene, sc);
  };
  game.events.on('poststep', ready);
  (window as unknown as { __sandbox: SandboxScene }).__sandbox = scene;
});
