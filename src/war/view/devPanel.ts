/**
 * The sandbox dev console (HTML overlay, dev builds only; F1 or the DEV button of ./hud/hud.ts show and hide it), in the
 * HUD kit's style (./hud/kit.ts). Collapsible sections: Scenario (a searchable picker grouped by feature, each with its
 * goal and a "what to check" list; restart on the same or a new seed), Spawn (class, team, count at the cursor; strike
 * down, hurt or heal the selected men), World & time (pause, 1-8x, one tick), Economy (grant goods, finish the selected
 * site), Overlays (height, cost, influence, fog, paths, grid), Perf (and the fight score) and Camera (named spots,
 * landmarks, lairs, entries). Every control has a tooltip. It drags by its title and remembers where it was put, which
 * sections are open, its spawn and grant choices and whether it was open (localStorage; blocked storage: this session).
 * Deep links keep working: `sandbox.html?scenario=<id>&seed=<n>`.
 *
 * In a live region (net mode) squads, goods, claim and skip go to the server as dev messages (DEV_AUTH only); time
 * controls, unit and site cheats do nothing there (the server keeps time).
 */
import type Phaser from 'phaser';
import { GROUP_NAME, GROUPS, SCENARIOS, type Scenario, type ScenarioGroup } from '../scenarios';
import { applyScenario as applyTo } from '../scenarios/run';
import { brawlSquads } from '../scenarios/kit';
import type { ResourceKind } from '../types';
import type { SandboxScene } from './SandboxScene';
import type { MapMode } from './mapModes';
import { SIEGE_HELP } from './siege/siegeControls';
import { SQUAD_MAX } from '../sim/soldiers';
import { sandboxRoster } from './hud/roster/state';
import { WORLD_REGIONS } from '../regions';
import { draggable } from './hud/drag';
import { placeTip } from './hud/kit';
import { myTeam, slot } from './side';
import { TEAM_RGB, hex } from './mapModes';

const CLASSES: [string, string[]][] = [
  ['Soldiers', ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer']],
  ['Civilians', ['civ_cook', 'civ_smith', 'civ_merchant', 'civ_physician', 'civ_engineer', 'civ_forager']],
  ['Mobs', ['mob_wolf', 'mob_boar', 'mob_bear', 'mob_bandit', 'mob_jackal', 'mob_ibex']],
];
const SOLDIERS = CLASSES[0][1];
const TEAMS = ['blue', 'red', 'gold', 'violet'];
const GOODS: ResourceKind[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'pitch', 'hides', 'flax', 'herbs', 'charcoal', 'leather', 'linen', 'oil', 'coin'];
const SPEEDS = [1, 2, 4, 8];
const SECTIONS = ['scenario', 'spawn', 'time', 'economy', 'overlays', 'perf', 'camera', 'keys'] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_NAME: Record<Section, string> = { scenario: 'Scenario', spawn: 'Spawn & units', time: 'World & time', economy: 'Economy', overlays: 'Overlays', perf: 'Perf', camera: 'Camera', keys: 'Keys' };

/** Named tile points of each region (src/war/regions/<id>.spots.ts). */
const SPOT_FILES = import.meta.glob<{ SPOTS?: Record<string, readonly [number, number]> }>('../regions/*.spots.ts', { eager: true });

/** What the console remembers (localStorage war.dev.console). */
interface Saved { open: boolean; shut: Section[]; cls: string; team: number; count: number; res: ResourceKind; amount: number; checks: Record<string, number[]> }
const KEY = 'war.dev.console';
function load(): Saved {
  const d: Saved = { open: false, shut: ['economy', 'perf', 'camera', 'keys'], cls: 'hoplite', team: 1, count: SQUAD_MAX, res: 'wood', amount: 500, checks: {} };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return d; }
}
function save(v: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked: this session only */ }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The first sentence of a goal (the picker's one-liner). */
const oneLine = (g: string) => (g.match(/^.*?[.:!?](\s|$)/)?.[0] ?? g).trim();
const nice = (cls: string) => cls.replace(/^(civ|mob)_/, '').replace('_', ' ');

const CSS = `
#dev{top:30px;right:4px;width:316px;z-index:7;padding:6px 10px 8px;max-height:calc(100vh - 40px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#7a3418 #0e0907}
#dev .rf-head{cursor:grab;justify-content:space-between}
#dev.rf-dragging .rf-head{cursor:grabbing}
#dev .dv-sec{border-bottom:1px solid var(--rf-rule);padding:3px 0}
#dev .dv-h{display:flex;align-items:center;gap:6px;width:100%;padding:3px 0;background:none;border:0;color:var(--rf-accent);font:700 11.5px/1.2 Cinzel,serif;letter-spacing:.04em;text-align:left}
#dev .dv-h:hover{color:var(--rf-title)}
#dev .dv-h i{font-style:normal;display:inline-block;width:9px;transition:transform .12s;color:var(--rf-muted)}
#dev .dv-sec.open .dv-h i{transform:rotate(90deg)}
#dev .dv-h .rf-dim{margin-left:auto;font:600 11px/1 Inter,sans-serif;letter-spacing:0}
#dev .dv-b{display:none;padding:2px 0 5px}
#dev .dv-sec.open .dv-b{display:block}
#dev .dv-row{display:flex;align-items:center;gap:4px;margin:4px 0;flex-wrap:wrap}
#dev .dv-row > .rf-dim:first-child{width:52px;flex:none}
#dev select,#dev input[type=search],#dev input[type=number]{height:23px;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);font:600 12px/1 Inter,sans-serif;padding:0 4px}
#dev input[type=number]{width:52px}
#dev input[type=search]{width:100%}
#dev select{max-width:100%;flex:1}
#dev .rf-tbtn{height:22px;padding:0 7px}
#dev .rf-tbtn.sm{min-width:30px;padding:0 5px}
#dev .dv-list{max-height:230px;overflow-y:auto;margin-top:4px;background:var(--rf-sunk);border:1px solid var(--rf-rule);scrollbar-width:thin;scrollbar-color:#7a3418 #0e0907}
#dev .dv-g{position:sticky;top:0;padding:3px 6px;background:var(--rf-raised);color:var(--rf-title);font:700 11px/1.2 Cinzel,serif;letter-spacing:.04em;display:flex;justify-content:space-between}
#dev .dv-it{padding:3px 6px 4px 8px;cursor:pointer}
#dev .dv-it b{display:block;font-weight:700;color:var(--rf-ink)}
#dev .dv-it span{display:block;color:var(--rf-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#dev .dv-it.cur b{color:var(--rf-good)}
#dev .dv-card{padding:5px 6px;margin-top:4px;background:var(--rf-raised);border:1px solid var(--rf-rule)}
#dev .dv-card .rf-name{font-size:13px}
#dev .dv-goal{margin:4px 0;color:var(--rf-ink);font-weight:500;line-height:1.35}
#dev .dv-check{margin:2px 0 0;padding:0;list-style:none}
#dev .dv-check li{display:flex;gap:5px;align-items:flex-start;margin:2px 0;line-height:1.3;font-weight:500}
#dev .dv-check input{margin:2px 0 0;accent-color:#de8a4e}
#dev .dv-check li.done{color:var(--rf-muted);text-decoration:line-through}
#dev .dv-chip{display:inline-block;padding:0 5px;font:700 10px/15px Inter,sans-serif;color:var(--rf-gold);background:var(--rf-sunk);border:1px solid var(--rf-line);vertical-align:2px;margin-left:4px}
#dev pre{margin:3px 0;color:var(--rf-good);font:600 11.5px/1.35 ui-monospace,Menlo,monospace;white-space:pre}
#dev .dv-sw{display:inline-block;width:9px;height:9px;margin-right:3px;border:1px solid #0e0907;vertical-align:-1px}
#dev .dv-keys{color:var(--rf-muted);font-weight:500;line-height:1.45}
#dev .dv-keys b{color:var(--rf-ink)}
#dev label{display:inline-flex;align-items:center;gap:3px;margin-right:6px}
#dev label input{accent-color:#de8a4e;margin:0}
#devTip{position:fixed;z-index:9;max-width:260px;white-space:normal}
`;

export function devPanel(game: Phaser.Game, s: SandboxScene, sc: Scenario | null): void {
  const v = load();
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed')) || 1;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'dev';
  el.className = 'rf rf-card';
  const sec = (id: Section, body: string, note = '') =>
    `<div class="dv-sec${v.shut.includes(id) ? '' : ' open'}" data-sec="${id}"><button class="dv-h" data-tip="Show or hide ${SECTION_NAME[id]}"><i>▸</i>${SECTION_NAME[id]}<span class="rf-dim">${note}</span></button><div class="dv-b">${body}</div></div>`;
  const spots = spotsOf(s);
  el.innerHTML = `
    <div class="rf-head"><span class="rf-name">Dev console</span><span class="rf-dim" style="flex:1">${esc(s.region.name)} · seed ${seed}</span><button class="rf-tbtn x" id="dvClose" data-tip="Hide the console (F1)">×</button></div>
    ${sec('scenario', `
      <div class="dv-card" id="dvCur"></div>
      <div class="dv-row" style="margin-top:6px"><input type="search" id="dvFind" placeholder="Find a scenario: name, feature, id" data-tip="Type to filter by name, id, group or goal. Enter loads the first match; ↑↓ move"></div>
      <div class="dv-list" id="dvList"></div>
      <div class="dv-row"><span class="rf-dim">seed</span><input type="number" id="dvSeed" min="1" value="${seed}" data-tip="The sim seed of the next restart (the URL's &seed=)">
        <button class="rf-tbtn" id="dvSame" data-tip="Restart this scenario on the seed shown (the same run again)">Restart</button>
        <button class="rf-tbtn" id="dvNew" data-tip="Restart this scenario on a new random seed">New seed</button></div>
      <div class="dv-row"><span class="rf-dim">region</span><select id="dvRegion" data-tip="Open another region, empty (no scenario)"><option value="test-ridge">test-ridge</option>${WORLD_REGIONS.map((r) => `<option value="${r.id}" ${r.id === s.region.id ? 'selected' : ''}>${esc(r.name)} (${r.role}${r.draft ? ', draft' : ''})</option>`).join('')}</select></div>`, sc ? esc(sc.id) : '')}
    ${sec('spawn', `
      <div class="dv-row"><span class="rf-dim">class</span><select id="dvCls" data-tip="The class to spawn">${CLASSES.map(([g, cs]) => `<optgroup label="${g}">${cs.map((c) => `<option value="${c}" ${c === v.cls ? 'selected' : ''}>${nice(c)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="dv-row"><span class="rf-dim">team</span><select id="dvTeam" data-tip="The team to spawn for: yours is played by you, the others by a bot brain (attack the nearest)">${TEAMS.map((t, i) => `<option value="${i}" ${i === v.team ? 'selected' : ''}>${i} ${t}${i === myTeam() ? ' (you)' : ''}</option>`).join('')}</select>
        <span class="rf-dim">men</span><input type="number" id="dvCount" min="1" max="${SQUAD_MAX}" value="${v.count}" data-tip="Men in the squad (at most ${SQUAD_MAX})"></div>
      <div class="dv-row"><button class="rf-tbtn pri" id="dvPlace" data-tip="Arm: the next left click on the map spawns the squad there">Place (click)</button>
        <button class="rf-tbtn" id="dvCursor" data-tip="Spawn the squad at the cursor now (F9 with the console open)">At cursor <b class="rf-dim">F9</b></button>
        <button class="rf-tbtn" id="dvBots" data-tip="Four bot squads of mixed soldiers at the cursor, for the team chosen (yours: team 1)">+4 bots</button></div>
      <div class="dv-row"><button class="rf-tbtn" id="dvBrawl" data-tip="300 v 300 across the ford (elsewhere across the map's middle). Heavy: watch Perf">600 brawl</button></div>
      <div class="rf-cap" style="margin-top:6px">Selected men <span class="rf-dim" id="dvSelN"></span></div>
      <div class="dv-row"><button class="rf-tbtn" id="dvKill" data-tip="Strike the selected men down: each falls wounded or dead by his END, as in a fight">Strike down</button>
        <button class="rf-tbtn" id="dvHurt" data-tip="Hurt the selected men to a quarter of their hp">Wound</button>
        <button class="rf-tbtn" id="dvHeal" data-tip="Heal the selected (standing) men to full hp">Heal</button></div>`)}
    ${sec('time', `
      <div class="dv-row"><button class="rf-tbtn sm" id="dvPause" data-tip="Pause or resume the sim">❚❚</button>${SPEEDS.map((k) => `<button class="rf-tbtn sm" data-speed="${k}" data-tip="Time ×${k}">${k}×</button>`).join('')}
        <button class="rf-tbtn" id="dvStep" data-tip="Step one tick (0.1 s; pauses first)">Step</button></div>
      <div class="dv-row"><button class="rf-tbtn" id="dvSkip" data-tip="Run one minute (600 ticks) at once">Skip 1 min</button>
        <button class="rf-tbtn" id="dvCut" data-tip="Walls and peaks drawn full or cut away (V)">Cut-away (V)</button>
        <button class="rf-tbtn" id="dvClaim" data-tip="Arm: the next click on the map claims ground there for you (an influence circle)">Claim here</button></div>`)}
    ${sec('economy', `
      <div class="dv-row"><span class="rf-dim">grant</span><select id="dvRes" data-tip="The good to grant">${GOODS.map((r) => `<option ${r === v.res ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <input type="number" id="dvAmt" value="${v.amount}" data-tip="How much (negative takes it out)"><button class="rf-tbtn pri" id="dvGrant" data-tip="Put it in your home stock (your team)">Grant</button></div>
      <div class="dv-row"><button class="rf-tbtn" id="dv500" data-tip="+500 of every basic good (food, wood, stone, marble, copper, tin, iron, bronze, silver, salt)">+500 all</button></div>
      <div class="rf-cap" style="margin-top:6px">Selected site <span class="rf-dim" id="dvSite">none: click a building</span></div>
      <div class="dv-row"><button class="rf-tbtn" id="dvFinish" data-tip="Finish the selected site at once: goods and labour free">Finish site</button></div>`)}
    ${sec('overlays', `
      <div class="dv-row"><span class="rf-dim">view</span>${([['normal', 'Off', 'No overlay (F2)'], ['altitude', 'Height', 'Height bands and contour lines (F3)'], ['movement', 'Cost', 'Movement cost: fast, slow, impassable; cliff edges (F4)'], ['ownership', 'Influence', 'Team influence, claim and no-build zones (F5)'], ['resources', 'Mobs', 'Resource nodes and the lairs\' aggro and leash rings (F7)']] as [MapMode, string, string][]).map(([m, n, t]) => `<button class="rf-tbtn sm" data-mode="${m}" data-tip="${t}">${n}</button>`).join('')}</div>
      <div class="dv-row"><label data-tip="Fog of war: off shows every unit"><input type="checkbox" id="dvFog" checked>fog</label>
        <label data-tip="Unit trails (the last 8 s of each man's walk), coloured by team"><input type="checkbox" id="dvPaths">paths</label>
        <label data-tip="The tile grid"><input type="checkbox" id="dvGrid">grid</label></div>`)}
    ${sec('perf', `<pre id="dvPerf"></pre><pre id="dvScore"></pre>`)}
    ${sec('camera', `
      <div class="dv-row"><select id="dvSpot" data-tip="Named spots, guardians, claim points, lairs and entries of this region">${spots.map(([g, list]) => `<optgroup label="${g}">${list.map(([n, x, y]) => `<option value="${x},${y}">${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select>
        <button class="rf-tbtn" id="dvGo" data-tip="Move the camera there">Go</button></div>
      <div class="dv-row">${[[1 / 4, 'far'], [1 / 2, 'mid'], [1, 'near'], [2, 'close']].map(([z, n]) => `<button class="rf-tbtn sm" data-zoom="${z}" data-tip="Zoom ${z}">${n}</button>`).join('')}
        ${sc ? '<button class="rf-tbtn" id="dvHome" data-tip="Back to the scenario\'s own camera">Scenario</button>' : ''}</div>`)}
    ${sec('keys', `<div class="dv-keys"><b>F1</b> this console · <b>F9</b> spawn at cursor<br>L click / box select, shift add · <b>E</b> or R click: the action at the cursor<br><b>H</b> hold · <b>X</b> stop · Ctrl + R click attack-move · <b>F</b> squad active · <b>Alt+1-4</b> line / column / wedge / loose · <b>Ctrl+1-9</b> groups<br>${SIEGE_HELP}<br>WASD, edge, middle or space+drag pan · wheel zoom · F2-F7 view modes · M full map</div>`)}`;
  document.body.appendChild(el);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>('#' + id)!;
  const num = (id: string) => Number($<HTMLInputElement>(id).value);
  // panel clicks and keys never reach the map
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('keydown', (e) => { if ((e.target as HTMLElement).matches('input,select')) e.stopPropagation(); });
  draggable(el);

  // ---------- open / shut, remembered ----------
  const devBtn = () => [...document.querySelectorAll<HTMLButtonElement>('#rfDev button')].find((b) => b.textContent === 'DEV');
  const show = (on: boolean) => { el.style.display = on ? '' : 'none'; devBtn()?.classList.toggle('on', on); };
  $('dvClose').onclick = () => show(false);
  new MutationObserver(() => { const open = el.style.display !== 'none'; if (open !== v.open) save({ ...v, open: (v.open = open) }); }).observe(el, { attributes: true, attributeFilter: ['style'] });
  // the HUD (mounted after this) hides the console unless ?dev; open it again if it was left open
  requestAnimationFrame(() => { if (v.open || q.has('dev')) show(true); });
  for (const b of el.querySelectorAll<HTMLElement>('.dv-sec')) {
    b.querySelector<HTMLButtonElement>('.dv-h')!.onclick = () => {
      const id = b.dataset.sec as Section, open = b.classList.toggle('open');
      v.shut = open ? v.shut.filter((x) => x !== id) : [...v.shut, id];
      save(v);
    };
  }

  // ---------- tooltips ----------
  const tip = document.createElement('div');
  tip.id = 'devTip';
  tip.className = 'rf rf-tip';
  tip.style.display = 'none';
  document.body.appendChild(tip);
  el.addEventListener('pointerover', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!a || !el.contains(a)) return void (tip.style.display = 'none');
    tip.textContent = a.dataset.tip!;
    tip.style.display = '';
    placeTip(tip, a);
  });
  el.addEventListener('pointerleave', () => (tip.style.display = 'none'));

  // ---------- scenario ----------
  const go = (id: string, sd: number) => { const u = new URLSearchParams(location.search); u.set('scenario', id); u.set('seed', String(sd)); u.delete('region'); location.search = u.toString(); };
  let preview: Scenario | null = sc;
  const renderCard = () => {
    const p = preview, cur = $('dvCur');
    if (!p) return void (cur.innerHTML = `<div class="rf-dim">No scenario: an empty ${esc(s.region.name)}. Pick one below.</div>`);
    const done = new Set(v.checks[p.id] ?? []), live = p.id === sc?.id;
    cur.innerHTML = `<div><span class="rf-name">${esc(p.name)}</span><span class="dv-chip">${GROUP_NAME[p.group ?? 'sandbox']}</span>${p.region ? `<span class="dv-chip">${esc(p.region)}</span>` : ''}${p.team ? `<span class="dv-chip">team ${p.team}</span>` : ''}</div>
      <div class="dv-goal">${esc(p.goal)}</div>
      ${p.check?.length ? `<div class="rf-cap">What to check</div><ul class="dv-check">${p.check.map((c, i) => `<li class="${live && done.has(i) ? 'done' : ''}"><input type="checkbox" data-ck="${i}" ${live && done.has(i) ? 'checked' : ''} ${live ? '' : 'disabled'} data-tip="${live ? 'Tick it off (kept for this scenario)' : 'Load the scenario to tick it off'}"><span>${esc(c)}</span></li>`).join('')}</ul>` : ''}
      ${live ? '' : `<div class="dv-row"><button class="rf-tbtn pri" id="dvLoad" data-tip="Load this scenario (the page reloads; seed as below)">Load ${esc(p.id)}</button>${sc ? '<button class="rf-tbtn" id="dvBack" data-tip="Show the running scenario again">Back</button>' : ''}</div>`}`;
    for (const c of cur.querySelectorAll<HTMLInputElement>('[data-ck]')) c.onchange = () => {
      const i = Number(c.dataset.ck), set = new Set(v.checks[p.id] ?? []);
      if (c.checked) set.add(i); else set.delete(i);
      v.checks[p.id] = [...set];
      save(v);
      c.parentElement!.classList.toggle('done', c.checked);
    };
    const ld = cur.querySelector<HTMLButtonElement>('#dvLoad');
    if (ld) ld.onclick = () => go(p.id, num('dvSeed') || 1);
    const bk = cur.querySelector<HTMLButtonElement>('#dvBack');
    if (bk) bk.onclick = () => { preview = sc; renderCard(); renderList(); };
  };
  let shown: Scenario[] = [];
  const renderList = () => {
    const words = $<HTMLInputElement>('dvFind').value.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (x: Scenario) => { const t = `${x.id} ${x.name} ${GROUP_NAME[x.group ?? 'sandbox']} ${x.goal} ${x.region ?? ''}`.toLowerCase(); return words.every((w) => t.includes(w)); };
    shown = [];
    const html = GROUPS.map((g: ScenarioGroup) => {
      const list = SCENARIOS.filter((x) => (x.group ?? 'sandbox') === g && hit(x));
      shown.push(...list);
      return list.length ? `<div class="dv-g"><span>${GROUP_NAME[g]}</span><span class="rf-dim">${list.length}</span></div>${list.map((x) => `<div class="dv-it rf-row${x.id === preview?.id ? ' on' : ''}${x.id === sc?.id ? ' cur' : ''}" data-id="${x.id}" title="${esc(x.id)}: double-click to load"><b>${esc(x.name)}</b><span>${esc(oneLine(x.goal))}</span></div>`).join('')}` : '';
    }).join('');
    $('dvList').innerHTML = html || '<div class="dv-it rf-dim">No scenario matches.</div>';
  };
  $('dvList').addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
    preview = SCENARIOS.find((x) => x.id === id) ?? preview;
    renderCard();
    renderList();
  });
  $('dvList').addEventListener('dblclick', (e) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id; if (id) go(id, num('dvSeed') || 1); });
  const find = $<HTMLInputElement>('dvFind');
  find.oninput = () => { renderList(); if (shown.length) { preview = shown[0]; renderCard(); renderList(); } };
  find.onkeydown = (e: KeyboardEvent) => {
    const i = shown.findIndex((x) => x.id === preview?.id);
    if (e.key === 'Enter' && preview) go(preview.id, num('dvSeed') || 1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      preview = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] ?? preview;
      renderCard();
      renderList();
      el.querySelector('.dv-it.on')?.scrollIntoView({ block: 'nearest' });
    }
  };
  renderCard();
  renderList();
  requestAnimationFrame(() => el.querySelector('.dv-it.cur')?.scrollIntoView({ block: 'center' }));
  const restart = (sd: number) => (sc ? go(sc.id, sd) : (() => { const u = new URLSearchParams(location.search); u.set('seed', String(sd)); location.search = u.toString(); })());
  $('dvSame').onclick = () => restart(num('dvSeed') || 1);
  $('dvNew').onclick = () => restart(1 + Math.floor(Math.random() * 99999));
  const reg = $<HTMLSelectElement>('dvRegion');
  reg.onchange = () => { const u = new URLSearchParams(location.search); u.set('region', reg.value); u.delete('scenario'); location.search = u.toString(); };

  // ---------- spawn and units ----------
  const remember = () => { Object.assign(v, { cls: $<HTMLSelectElement>('dvCls').value, team: num('dvTeam'), count: Math.max(1, Math.min(SQUAD_MAX, num('dvCount') || SQUAD_MAX)), res: $<HTMLSelectElement>('dvRes').value as ResourceKind, amount: num('dvAmt') || 0 }); save(v); };
  for (const id of ['dvCls', 'dvTeam', 'dvCount', 'dvRes', 'dvAmt']) $(id).addEventListener('change', remember);
  const spawnAt = (x: number, y: number) => {
    remember();
    if (s.sim.net) s.sim.devSpawn(v.team, v.cls, v.count, x, y);
    else s.sim.spawn(v.team === myTeam() ? 'you' : 'bot', v.team, v.cls, v.count, x, y);
  };
  $('dvPlace').onclick = () => { remember(); s.placing = { team: v.team, cls: v.cls, count: v.count }; };
  $('dvCursor').onclick = () => spawnAt(s.pointerTile.x, s.pointerTile.y);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'F9' || el.style.display === 'none') return;
    e.preventDefault();
    spawnAt(s.pointerTile.x, s.pointerTile.y);
  });
  $('dvBots').onclick = () => {
    const team = num('dvTeam') === myTeam() ? (myTeam() === 1 ? 0 : 1) : num('dvTeam'), { x, y } = s.pointerTile;
    for (let i = 0; i < 4; i++) {
      const cls = SOLDIERS[i % SOLDIERS.length], bx = x + (i % 2) * 8, by = y + Math.floor(i / 2) * 6;
      if (s.sim.net) s.sim.devSpawn(team, cls, SQUAD_MAX, bx, by);
      else s.sim.spawn('bot', team, cls, SQUAD_MAX, bx, by);
    }
  };
  $('dvBrawl').onclick = () => brawl(s);
  const men = () => [...(s.sel?.units ?? [])];
  $('dvKill').onclick = () => s.sim.devUnits(men(), 'kill');
  $('dvHurt').onclick = () => s.sim.devUnits(men(), 'hurt');
  $('dvHeal').onclick = () => s.sim.devUnits(men(), 'heal');

  // ---------- time ----------
  let paused = false, speed = 1;
  const setTime = (p: boolean, k = speed) => {
    paused = p;
    speed = k;
    s.sim.speed(paused ? 0 : speed);
    $('dvPause').classList.toggle('on', paused);
    $('dvPause').textContent = paused ? '▶' : '❚❚';
    for (const b of el.querySelectorAll<HTMLElement>('[data-speed]')) b.classList.toggle('on', !paused && Number(b.dataset.speed) === speed);
  };
  $('dvPause').onclick = () => setTime(!paused);
  for (const b of el.querySelectorAll<HTMLElement>('[data-speed]')) b.onclick = () => setTime(false, Number(b.dataset.speed));
  $('dvStep').onclick = () => { if (!paused) setTime(true); s.sim.skip(1); };
  $('dvSkip').onclick = () => s.sim.skip(600);
  $('dvCut').onclick = () => (s.build.layer.cutaway = !s.build.layer.cutaway);
  $('dvClaim').onclick = () => s.build.armClaim();
  setTime(false, 1);

  // ---------- economy ----------
  $('dvGrant').onclick = () => { remember(); s.sim.addStock(myTeam(), v.res, v.amount); };
  $('dv500').onclick = () => s.build.addResources();
  $('dvFinish').onclick = () => { const b = s.build.selectedBuilding(); if (b) s.sim.finishSite(b.id); };

  // ---------- overlays ----------
  for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.onclick = () => s.setMode(b.dataset.mode as MapMode);
  $<HTMLInputElement>('dvFog').onchange = (e) => s.setFog((e.target as HTMLInputElement).checked);
  $<HTMLInputElement>('dvGrid').onchange = (e) => s.setGrid((e.target as HTMLInputElement).checked);
  const paths = trails(s);
  $<HTMLInputElement>('dvPaths').onchange = (e) => paths.on((e.target as HTMLInputElement).checked);

  // ---------- camera ----------
  $('dvGo').onclick = () => { const [x, y] = $<HTMLSelectElement>('dvSpot').value.split(',').map(Number); if (Number.isFinite(x)) s.focus(x, y); };
  $<HTMLSelectElement>('dvSpot').ondblclick = () => $('dvGo').click();
  for (const b of el.querySelectorAll<HTMLElement>('[data-zoom]')) b.onclick = () => { const c = s.cameras.main, w = c.getWorldPoint(c.width / 2, c.height / 2), [x, y] = tileAt(s, w.x, w.y); s.focus(x, y, Number(b.dataset.zoom)); };
  if (sc) $('dvHome').onclick = () => s.focus(sc.camera.x, sc.camera.y, sc.camera.zoom);

  // ---------- live readouts (4 Hz) ----------
  const perf = $('dvPerf'), score = $('dvScore'), t0 = s.sim.cur?.tick ?? 0;
  let end: number | null = null;
  setInterval(() => {
    if (el.style.display === 'none') return;
    $('dvCut').classList.toggle('on', s.build.layer.cutaway);
    for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.classList.toggle('on', b.dataset.mode === s.mode);
    const n = s.sel?.units.size ?? 0;
    $('dvSelN').textContent = n ? `${n} men` : 'none: select your men';
    for (const id of ['dvKill', 'dvHurt', 'dvHeal']) $<HTMLButtonElement>(id).disabled = !n || s.sim.net;
    const b = s.build.selectedBuilding(), open = !!b && (b.state === 'foundation' || b.state === 'scaffold');
    $('dvSite').textContent = b ? `${b.type} #${b.id} · ${b.state}${open ? ` ${Math.round(b.progress * 100)}%` : ''}` : 'none: click a building';
    $<HTMLButtonElement>('dvFinish').disabled = !open || s.sim.net;
    $<HTMLButtonElement>('dvStep').disabled = s.sim.net;
    const r = tally(s);
    if (r.rows.length) {
      const live = r.rows.filter((x) => x.alive);
      if (end === null && r.rows.length > 1 && live.length <= 1) end = r.tick;
      const sec = Math.max(0, (end ?? r.tick) - t0) / 10;
      const head = end === null ? '' : live.length ? `  ${TEAMS[live[0].team] ?? live[0].team} won` : '  all down';
      score.innerHTML = `team     alive wnd kill\n${r.rows.map((x) => `<span class="dv-sw" style="background:${hex(TEAM_RGB[slot(x.team)] ?? [128, 128, 128])}"></span>${(TEAMS[x.team] ?? String(x.team)).padEnd(7)} ${String(x.alive).padStart(5)} ${String(x.wounded).padStart(3)} ${String(x.killed).padStart(4)}`).join('\n')}\ntime   ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}${head}`;
    }
    const st = s.sim.stats;
    perf.textContent = `fps    ${game.loop.actualFps.toFixed(0)}\nsim    ${st.stepMs.toFixed(2)} ms/step\nunits  ${st.units}  squads ${s.sim.squads.size}\ntick   ${s.sim.cur?.tick ?? 0}${paused ? ' (paused)' : speed > 1 ? ` (×${speed})` : ''}\nzoom   ${s.cameras.main.zoom.toFixed(2)}  sel ${n}`;
  }, 250);
}

/** The tile under a world (screen-space) point: the scene's own pick. */
function tileAt(s: SandboxScene, wx: number, wy: number): [number, number] {
  const t = s.iso.pick(wx, wy);
  return [t.x, t.y];
}

/** Camera targets of the region: its named spots, guardians, claim points, lairs and entries. */
function spotsOf(s: SandboxScene): [string, [string, number, number][]][] {
  const r = s.region, out: [string, [string, number, number][]][] = [];
  const named = r.id === 'test-ridge' ? s.spots : SPOT_FILES[`../regions/${r.id}.spots.ts`]?.SPOTS;
  if (named) out.push(['Spots', Object.entries(named).map(([k, [x, y]]) => [k, x, y])]);
  if (r.guardians?.length) out.push(['Guardians', r.guardians.map((g) => [g.boss, g.x, g.y])]);
  if (r.claimPoints?.length) out.push(['Claim points', r.claimPoints.map((c, i) => [`claim ${i}`, c.x, c.y])]);
  if (r.lairs?.length) out.push(['Lairs', r.lairs.map((l, i) => [`${l.kind} ${i}${l.captain ? ' (captain)' : ''}`, l.x, l.y])]);
  out.push(['Entries', r.entries.map((e) => [`entry ${e.side} ${Math.round(e.x)},${Math.round(e.y)}`, e.x + e.w / 2, e.y + e.h / 2])]);
  out.push(['Map', [['centre', r.w / 2, r.h / 2]]]);
  return out;
}

/** Dev overlay: every man's walk over the last 8 s as a line in his team's colour (sampled at 4 Hz). */
function trails(s: SandboxScene): { on(v: boolean): void } {
  const g = s.add.graphics().setDepth(10.5);
  const seen = new Map<number, number[]>();
  let timer = 0;
  const draw = () => {
    g.clear();
    for (const d of s.drawn) {
      let p = seen.get(d.u.id);
      if (!p) seen.set(d.u.id, (p = []));
      p.push(d.x, d.y);
      if (p.length > 64) p.splice(0, 2);
      if (p.length < 4 || d.u.state === 'dead') continue;
      g.lineStyle(2, rgbInt(TEAM_RGB[slot(d.team)] ?? [200, 200, 200]), 0.8);
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const sx = s.iso.sx(p[i], p[i + 1]), sy = s.iso.sy(p[i], p[i + 1], s.iso.zAt(p[i], p[i + 1]));
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      }
      g.strokePath();
    }
  };
  return {
    on(v: boolean) {
      clearInterval(timer);
      seen.clear();
      g.clear();
      if (v) timer = window.setInterval(draw, 250);
    },
  };
}
const rgbInt = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b;

/** Alive / wounded / killed per team (teams with units only), and the current tick. */
export function tally(s: SandboxScene): { tick: number; rows: { team: number; alive: number; wounded: number; killed: number }[] } {
  const by = new Map<number, { team: number; alive: number; wounded: number; killed: number }>();
  for (const u of s.sim.full?.units ?? []) {
    const team = s.sim.squads.get(u.squad)?.team ?? 0;
    let r = by.get(team);
    if (!r) by.set(team, (r = { team, alive: 0, wounded: 0, killed: 0 }));
    if (u.state !== 'dead') r.alive++;
    else if (u.wounded) r.wounded++;
    else r.killed++;
  }
  return { tick: s.sim.cur?.tick ?? 0, rows: [...by.values()].sort((a, b) => a.team - b.team) };
}

/** Place a scenario's squads (with their bot behaviours), build its base, set its camera (../scenarios/run.ts). */
export function applyScenario(s: SandboxScene, sc: Scenario): void {
  applyTo(s.sim, sc, (q, spawn) => {
    // M5h3: civilians with set levels and nodes: the roster's persons for the spawn take them
    const R = q.nodes ? sandboxRoster(s) : null, pf = s.sim.personsFor; // the roster sets personsFor
    if (R && pf) s.sim.personsFor = (...a) => pf(...a)?.map((p) => {
      const np = { ...p, hero: { ...p.hero, level: q.level ?? p.hero.level, perks: q.nodes as unknown as typeof p.hero.perks } };
      R.roster.update(np);
      return np;
    });
    spawn();
    s.sim.personsFor = pf;
  });
  s.focus(sc.camera.x, sc.camera.y, sc.camera.zoom);
}

/** 300 v 300: across the ford on test-ridge, elsewhere west and east of the map's middle (../scenarios/kit.ts). */
export function brawl(s: SandboxScene): void {
  const { w, h, id } = s.region;
  const qs = id === 'test-ridge' ? brawlSquads() : brawlSquads([w * 0.38 + 8, h * 0.5], [w * 0.62 - 8, h * 0.5]);
  for (const q of qs) s.sim.spawn(q.owner!, q.team, q.cls, q.count, q.x, q.y);
}
