/**
 * Dev skin of the build UI (HTML, the dev panel's style; W-25: the PixelLab UI kit replaces this file): a toolbar at
 * the bottom (build mode toggle, building tools with cost and labour, wall tools, wall gate / tower / order buttons,
 * status line) and a HUD at the top left: own stockpile, the selected squad with its Build hint, the site panel of a
 * selected site (W-26: state, progress, workers, materials; assign N of the selected squad, stop work, cancel with its
 * refund) or the selected building, dev +500 resources and claim. It only calls BuildMode and reads its state.
 */
import { BUILDINGS } from '../../sim/economy';
import type { BuildingType } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { costText, isSite, labourText, RESOURCES, TOOLBAR, type BuildMode, type Tool } from './buildMode';

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
  hud.innerHTML = `<pre id="stock"></pre><div id="bsq"></div>
    <div id="site"><b id="stitle"></b><pre id="sinfo"></pre>
      <div class="row">Assign <input id="sn" type="number" min="1" value="5"> <button id="sassign">Assign</button></div>
      <div class="row"><button id="sstop">Stop work</button> <button id="scancel">Cancel site</button></div>
      <div class="dim" id="srefund"></div><div class="dim">right click with a squad: build · Esc closes</div></div>
    <pre id="bsel"></pre>
    <div class="row"><button id="b500">+500 resources</button> <button id="bclaim">Claim here</button></div>`;
  document.body.append(bar, hud);
  for (const el of [bar, hud]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const $ = (id: string) => document.getElementById(id)!;
  const btn = (id: string) => $(id) as HTMLButtonElement;

  $('bmode').onclick = () => m.toggle();
  bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => m.setTool(tools[Number(b.dataset.tool)][1])));
  $('bgate').onclick = () => (m.wall.insert = 'gate');
  $('btower').onclick = () => (m.wall.insert = 'tower');
  $('bok').onclick = () => m.confirmWall();
  $('b500').onclick = () => m.addResources();
  $('bclaim').onclick = () => m.armClaim();
  $('sassign').onclick = () => m.assign(Number(($('sn') as HTMLInputElement).value));
  $('sstop').onclick = () => m.stopWork();
  $('scancel').onclick = () => m.cancelSite();

  const tick = () => {
    bar.classList.toggle('on', m.active);
    $('btools').style.display = m.active ? '' : 'none';
    $('bwall').style.display = m.tool?.kind === 'wall' ? '' : 'none';
    bar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('sel', JSON.stringify(tools[Number(b.dataset.tool)][1]) === JSON.stringify(m.tool)));
    $('bstatus').textContent = m.claimArmed ? 'click the map to claim (influence r 20)' : m.active ? m.status || 'pick a building' : '';
    const st = s.sim.cur?.stock?.[0] ?? {};
    $('stock').textContent = 'stock\n' + RESOURCES.map((r) => `${r.padEnd(7)}${String(Math.floor(st[r] ?? 0)).padStart(6)}`).join('\n');
    // the selected squad and its build hint
    const sq = m.squad(), q = sq === null ? undefined : s.sim.squads.get(sq);
    const men = q ? s.drawn.filter((d) => d.u.squad === sq && d.u.state !== 'dead') : [];
    $('bsq').innerHTML = q ? `squad #${q.id} ${men[0]?.u.cls ?? ''} · ${men.length} men · ${q.order}<br><span class="hint">Build (B): place a site, this squad builds it</span>` : '';
    const b = m.selectedBuilding(), site = !!b && isSite(b);
    $('site').style.display = site ? '' : 'none';
    $('bsel').style.display = b && !site ? '' : 'none';
    if (b && site) {
      const need = Object.entries(m.need(b));
      const mats = need.map(([r, v]) => `${r.padEnd(8)}${String(Math.floor(v! * b.delivered)).padStart(4)}/${Math.ceil(v!)}`).join('\n') || 'materials none';
      const planned = b.progress === 0 && b.delivered === 0 && b.workers === 0;
      $('stitle').textContent = `${b.type} site #${b.id}`;
      $('sinfo').textContent = `state   ${planned ? 'planned' : b.state}\nbuilt   ${Math.round(b.progress * 100)}%\nworkers ${b.workers}/${b.maxWorkers}\n${mats}`;
      btn('sassign').disabled = sq === null;
      btn('sassign').title = sq === null ? 'select a squad first' : `detach from squad #${sq} and send`;
      btn('sstop').disabled = !m.squadsAt(b).length;
      const refund = m.refund(b);
      $('srefund').textContent = `cancel refunds ${Object.keys(refund).length ? costText(refund) : 'nothing'} (+ loads on the way)`;
    } else if (b) {
      $('bsel').textContent = `${b.type} #${b.id} team ${b.team}\nstate   ${b.state}\nhp      ${Math.ceil(b.hp)}/${b.maxHp}`;
    }
  };
  setInterval(tick, 200);
  tick();
}
