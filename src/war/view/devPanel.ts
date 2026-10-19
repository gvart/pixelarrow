/** The sandbox dev panel (HTML overlay): spawning, time, overlays, perf. */
import type Phaser from 'phaser';
import type { SandboxScene, Overlay } from './SandboxScene';

const CLASSES = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer'];

export function devPanel(game: Phaser.Game, s: SandboxScene): void {
  const el = document.createElement('div');
  el.id = 'dev';
  el.innerHTML = `
    <b>${s.region.name}</b> <span class="dim">${s.region.w}x${s.region.h}</span>
    <div class="row">team <select id="team"><option value="0">0 you</option><option value="1">1 red</option><option value="2">2 gold</option><option value="3">3 violet</option></select>
    <select id="cls">${CLASSES.map((c) => `<option>${c}</option>`).join('')}</select>
    <input id="count" type="number" min="1" max="20" value="20"></div>
    <div class="row"><button id="place">Place squad (click map)</button></div>
    <div class="row"><button id="bots">+4 bot squads at cursor (E)</button></div>
    <div class="row"><button id="brawl">600 brawl</button> <button id="clear">Reload</button></div>
    ${s.region.id === 'test-ridge' ? `<div class="row">go to <select id="spot">${Object.keys(s.spots).map((k) => `<option>${k}</option>`).join('')}</select></div>` : ''}
    <div class="row"><button id="pause">Pause</button> speed <select id="speed"><option>0.5</option><option selected>1</option><option>2</option><option>4</option></select></div>
    <div class="row">${(['height', 'cost', 'grid', 'zones'] as Overlay[]).map((k) => `<label><input type="checkbox" data-ov="${k}" ${k === 'zones' ? 'checked' : ''}>${k}</label>`).join(' ')}</div>
    <pre id="perf"></pre>
    <div class="dim">L click/box select, shift add · R click move / attack<br>H hold · 1-4 line/column/wedge/loose<br>WASD, edge, middle or space+drag pan · wheel zoom</div>`;
  document.body.appendChild(el);
  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>('#' + id)!;
  const val = (id: string) => $<HTMLInputElement>(id).value;

  $('place').onclick = () => (s.placing = { team: Number(val('team')), cls: val('cls'), count: Number(val('count')) });
  const bots = () => {
    const team = Number(val('team')) || 1, { x, y } = s.pointerTile;
    for (let i = 0; i < 4; i++) s.sim.spawn('bot', team, CLASSES[i % CLASSES.length], 20, x + (i % 2) * 8, y + Math.floor(i / 2) * 6);
  };
  $('bots').onclick = bots;
  window.addEventListener('keydown', (e) => { if (e.key === 'e' || e.key === 'E') bots(); });
  $('brawl').onclick = () => brawl(s);
  $('clear').onclick = () => location.reload();
  const spot = el.querySelector<HTMLSelectElement>('#spot');
  if (spot) spot.onchange = () => { const [x, y] = s.spots[spot.value as keyof typeof s.spots]; s.focus(x, y); };
  let paused = false;
  $('pause').onclick = () => {
    paused = !paused;
    $('pause').textContent = paused ? 'Resume' : 'Pause';
    s.sim.speed(paused ? 0 : Number(val('speed')));
  };
  $('speed').onchange = () => { if (!paused) s.sim.speed(Number(val('speed'))); };
  el.querySelectorAll<HTMLInputElement>('[data-ov]').forEach((c) => (c.onchange = () => s.setOverlay(c.dataset.ov as Overlay, c.checked)));
  // panel clicks never reach the map
  el.addEventListener('pointerdown', (e) => e.stopPropagation());

  const perf = $('perf');
  setInterval(() => {
    const st = s.sim.stats;
    perf.textContent = `fps    ${game.loop.actualFps.toFixed(0)}\nsim    ${st.stepMs.toFixed(2)} ms/step\nunits  ${st.units}  squads ${s.sim.squads.size}\ntick   ${s.sim.cur?.tick ?? 0}  zoom ${s.cameras.main.zoom.toFixed(2)}\nsel    ${s.selected.size}`;
  }, 250);
}

/**
 * 15 own squads against 15 bot squads: 600 units. On test-ridge they stand in 5 x 3 blocks on
 * either bank of the ford (SPOTS fordW / fordE), so the fight goes through the ford; elsewhere
 * west and east of the map centre.
 */
export function brawl(s: SandboxScene): void {
  const { w, h, id } = s.region;
  const ridge = id === 'test-ridge';
  // block centres and the step away from the river, in tiles
  const [wx, wy] = ridge ? [s.spots.fordW[0] - 8, s.spots.fordW[1]] : [w * 0.38, h * 0.5];
  const [ex, ey] = ridge ? [s.spots.fordE[0] + 8, s.spots.fordE[1]] : [w * 0.62, h * 0.5];
  for (let i = 0; i < 15; i++) {
    const dy = ((i % 5) - 2) * 9, dx = Math.floor(i / 5) * 8;
    s.sim.spawn('you', 0, CLASSES[i % CLASSES.length], 20, wx - dx, wy + dy);
    s.sim.spawn('bot', 1, CLASSES[(i + 2) % CLASSES.length], 20, ex + dx, ey + dy);
  }
}
