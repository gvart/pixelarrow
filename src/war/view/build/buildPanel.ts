/**
 * Dev skin of the build UI (HTML, the dev panel's style; W-25: the PixelLab UI kit replaces this file): a toolbar at
 * the bottom (build mode toggle, building tools with cost and labour, wall tools, wall gate / tower / order buttons,
 * status line) and a HUD at the top left (own stockpile, the selected building, dev +500 resources and claim). It only
 * calls BuildMode and reads its state.
 */
import { BUILDINGS } from '../../sim/economy';
import type { BuildingType } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { labourText, RESOURCES, TOOLBAR, type BuildMode, type Tool } from './buildMode';

const cost = (t: BuildingType) => Object.entries(BUILDINGS[t].cost).map(([r, v]) => `${v} ${r}`).join(', ') || 'free';

export function buildPanel(s: SandboxScene): void {
  const m: BuildMode = s.build;
  const bar = document.createElement('div');
  bar.id = 'build';
  const tools: [string, Tool, string][] = [
    ...TOOLBAR.map((t): [string, Tool, string] => [t, { kind: 'building', type: t }, `${cost(t)} · ${labourText(BUILDINGS[t].labour)}`]),
    ['palisade', { kind: 'wall', material: 'wood' }, `${cost('palisade')}/tile · gate ${cost('woodGate')} · tower ${cost('woodTower')}`],
    ['stone wall', { kind: 'wall', material: 'stone' }, `${cost('stoneWall')}/tile · gate ${cost('stoneGate')} · tower ${cost('stoneTower')}`],
  ];
  bar.innerHTML = `
    <div class="row"><button id="bmode">Build (B)</button>
    <span id="btools">${tools.map(([name, , tip], i) => `<button data-tool="${i}" title="${tip}">${name}<br><span class="dim">${tip.split(' · ')[0]}</span></button>`).join('')}</span></div>
    <div class="row" id="bwall"><button id="bgate">+ gate (G)</button> <button id="btower">+ tower (T)</button> <button id="bok">Order wall (Enter)</button> <span class="dim">R rotate · Esc cancel · shift-click keeps the tool</span></div>
    <div id="bstatus"></div>`;
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `<pre id="stock"></pre><pre id="bsel"></pre>
    <div class="row"><button id="b500">+500 resources</button> <button id="bclaim">Claim here</button></div>`;
  document.body.append(bar, hud);
  for (const el of [bar, hud]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const $ = (id: string) => document.getElementById(id)!;

  $('bmode').onclick = () => m.toggle();
  bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => m.setTool(tools[Number(b.dataset.tool)][1])));
  $('bgate').onclick = () => (m.wall.insert = 'gate');
  $('btower').onclick = () => (m.wall.insert = 'tower');
  $('bok').onclick = () => m.confirmWall();
  $('b500').onclick = () => m.addResources();
  $('bclaim').onclick = () => m.armClaim();

  const tick = () => {
    bar.classList.toggle('on', m.active);
    $('btools').style.display = m.active ? '' : 'none';
    $('bwall').style.display = m.tool?.kind === 'wall' ? '' : 'none';
    bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('sel', JSON.stringify(tools[Number(b.dataset.tool)][1]) === JSON.stringify(m.tool)));
    $('bstatus').textContent = m.claimArmed ? 'click the map to claim (influence r 20)' : m.active ? m.status || 'pick a building' : '';
    const st = s.sim.cur?.stock?.[0] ?? {};
    $('stock').textContent = 'stock\n' + RESOURCES.map((r) => `${r.padEnd(7)}${String(Math.floor(st[r] ?? 0)).padStart(6)}`).join('\n');
    const b = m.selectedBuilding();
    $('bsel').textContent = b
      ? `${b.type} #${b.id} team ${b.team}\nstate  ${b.state}\nhp     ${Math.ceil(b.hp)}/${b.maxHp}\nbuilt  ${Math.round(b.progress * 100)}%\nmats   ${Math.round(b.delivered * 100)}%\nworkers ${m.workers(b)}`
      : 'no building selected';
  };
  setInterval(tick, 200);
  tick();
}
