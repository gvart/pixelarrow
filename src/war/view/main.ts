/**
 * War region sandbox: open /sandbox.html?region=<id>&sim=<real|fake> on the dev server. Loads and
 * validates src/war/regions/<id>.json (default test-ridge); ?region=fake is the built-in fake valley
 * (src/war/fake/region.ts). ?sim=fake runs the straight-line fake sim instead of src/war/sim.
 * `window.__sandbox` is the scene, for scripts/war/sandbox-shots.mjs.
 */
import Phaser from 'phaser';
import { fakeRegion } from '../fake/region';
import { loadRegion } from '../region/loader';
import { devPanel } from './devPanel';
import { SandboxScene } from './SandboxScene';

const id = new URLSearchParams(location.search).get('region') ?? 'test-ridge';

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
  game.scene.add('Sandbox', scene, true, { region });
  game.events.once('poststep', () => devPanel(game, scene));
  (window as unknown as { __sandbox: SandboxScene }).__sandbox = scene;
});
