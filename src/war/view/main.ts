/**
 * War region sandbox: open /sandbox.html?region=<id>&sim=<real|fake>&scenario=<id> on the dev server
 * (scenarios: src/war/scenarios, on test-ridge or their own region; default free). Loads and
 * validates src/war/regions/<id>.json (default test-ridge); ?region=fake is the built-in fake valley
 * (src/war/fake/region.ts). ?sim=fake runs the straight-line fake sim instead of src/war/sim.
 * ?art=grey draws the greybox terrain instead of the PixelLab art (public/war/).
 * ?world=1: opened from the world map (world.html); with ?net it takes over the squads standing in the region (?team=
 * alliance). The HUD's World button (Shift+W) goes back.
 * `window.__sandbox` is the scene, for scripts/war/sandbox-shots.mjs.
 */
import Phaser from 'phaser';
import { fakeRegion } from '../fake/region';
import { loadRegion } from '../region/loader';
import { scenarioById, SCENARIOS } from '../scenarios';
import { loadArt } from './art';
import { entrySpot, ownCentre } from './entry';
import { applyScenario, devPanel } from './devPanel';
import { hud } from './hud/hud';
import { sandboxRoster } from './hud/roster/state';
import { SandboxScene } from './SandboxScene';
import { loadSheetImages } from './units';
import { WarAudio } from './sound/warAudio';
import { mountSoundPanel } from './hud/soundPanel';

const q = new URLSearchParams(location.search);
// M7d: a scenario may name its own region (the landmark raids)
const want = scenarioById(q.get('scenario'));
const id = q.get('region') ?? want?.region ?? 'test-ridge';

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
  const sc = want && (want.region ?? 'test-ridge') === id ? want : id === 'test-ridge' ? SCENARIOS.find((s) => s.id === 'free')! : null;
  // M6k: a scenario's safe, yard and ambush rects join the region's before the sim starts
  if (sc?.zones) for (const k of ['safe', 'yard', 'ambush'] as const) if (sc.zones[k]) region[k] = [...(region[k] ?? []), ...sc.zones[k]!];
  game.scene.add('Sandbox', scene, true, { region, art, sheets });
  // once create() ran (the sim client exists only then)
  const ready = () => {
    if (!scene.sim) return;
    game.events.off('poststep', ready);
    sandboxRoster(scene); // before the scenario spawns: the player's squads take its persons
    if (sc) applyScenario(scene, sc);
    // M4c, opened from the world map: in net mode take over the squads standing here (a rejoin; else a squad from home,
    // the server places it on the team's entry); offline the player's one squad of 12 walks in at the same entry
    else if (q.has('world')) {
      const team = q.has('net') ? Number(q.get('team')) || 0 : 0, at = entrySpot(region, team);
      scene.sim.spawn('you', team, 'hoplite', 12, at.x, at.y);
      game.events.on('poststep', toSquad);
    }
    devPanel(game, scene, sc);
    hud(scene);
    // the war's sound (./sound): settings card in the HUD corner, then the hooks (after the HUD's own event taps)
    const audio = new WarAudio(scene);
    mountSoundPanel(audio);
    audio.install();
  };
  // world entry: the camera opens on the player's men once they stand in the region (not the map's middle)
  const toSquad = () => {
    const own = ownCentre(scene.sim.cur);
    if (!own) return;
    game.events.off('poststep', toSquad);
    scene.focus(own.x, own.y, 1 / 2);
  };
  game.events.on('poststep', ready);
  (window as unknown as { __sandbox: SandboxScene }).__sandbox = scene;
});
