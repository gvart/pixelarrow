/**
 * War region sandbox: open /sandbox.html?region=<id> on the dev server. Loads
 * src/war/regions/<id>.json when it exists, else the built-in fake valley (src/war/fake/region.ts).
 * `window.__sandbox` is the scene, for scripts/war/sandbox-shots.mjs.
 */
import Phaser from 'phaser';
import { fakeRegion } from '../fake/region';
import type { RegionData } from '../types';
import { devPanel } from './devPanel';
import { SandboxScene } from './SandboxScene';

const regions = import.meta.glob<{ default: RegionData }>('../regions/*.json');

async function loadRegion(id: string | null): Promise<RegionData> {
  const load = id && regions[`../regions/${id}.json`];
  return load ? (await load()).default : fakeRegion();
}

// no top-level await: the build targets es2020
void loadRegion(new URLSearchParams(location.search).get('region')).then((region) => {
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
