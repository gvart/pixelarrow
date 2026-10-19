/** The sandbox dev panel (HTML overlay, F1 / the DEV button of ./hud/hud.ts): scenarios, spawning, time, overlays, perf, the fight score, +500 resources, claim. */
import type Phaser from 'phaser';
import { SCENARIOS, type Scenario } from '../scenarios';
import type { ResourceKind } from '../types';
import type { SandboxScene, Overlay } from './SandboxScene';
import { SIEGE_HELP } from './siege/siegeControls';

const CLASSES = ['militia', 'hoplite', 'celt_sword', 'archer', 'slinger', 'javelineer'];

const TEAMS = ['you', 'enemy', 'gold', 'violet'];

export function devPanel(game: Phaser.Game, s: SandboxScene, sc: Scenario | null): void {
  const el = document.createElement('div');
  el.id = 'dev';
  el.innerHTML = `
    <b>${s.region.name}</b> <span class="dim">${s.region.w}x${s.region.h}</span>
    ${sc ? `<div class="row">scenario <select id="scn">${SCENARIOS.map((q) => `<option value="${q.id}" ${q.id === sc.id ? 'selected' : ''}>${q.name}</option>`).join('')}</select></div>
    <div class="row" id="goal">${sc.goal}</div>` : ''}
    <div class="row">team <select id="team"><option value="0">0 you</option><option value="1">1 red</option><option value="2">2 gold</option><option value="3">3 violet</option></select>
    <select id="cls">${CLASSES.map((c) => `<option>${c}</option>`).join('')}</select>
    <input id="count" type="number" min="1" max="20" value="20"></div>
    <div class="row"><button id="place">Place squad (click map)</button></div>
    <div class="row"><button id="bots">+4 bot squads at cursor</button></div>
    <div class="row"><button id="brawl">600 brawl</button> <button id="clear">Restart</button></div>
    ${s.region.id === 'test-ridge' ? `<div class="row">go to <select id="spot">${Object.keys(s.spots).map((k) => `<option>${k}</option>`).join('')}</select></div>` : ''}
    <div class="row"><button id="pause">Pause</button> speed <select id="speed"><option>0.5</option><option selected>1</option><option>2</option><option>4</option></select></div>
    <div class="row"><button id="cut">Walls: full (V)</button></div>
    <div class="row"><button id="b500">+500 resources</button> <button id="bclaim">Claim here</button></div>
    <div class="row">${(['height', 'cost', 'grid', 'zones', 'mobs'] as Overlay[]).map((k) => `<label><input type="checkbox" data-ov="${k}" ${k === 'zones' ? 'checked' : ''}>${k}</label>`).join(' ')}</div>
    <pre id="score"></pre>
    <pre id="perf"></pre>
    <div class="dim">L click/box select, shift add · E or R click: the context action shown at the cursor<br>H hold · 1-4 line/column/wedge/loose<br>${SIEGE_HELP}<br>WASD, edge, middle or space+drag pan · wheel zoom</div>`;
  document.body.appendChild(el);
  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>('#' + id)!;
  const val = (id: string) => $<HTMLInputElement>(id).value;

  $('place').onclick = () => (s.placing = { team: Number(val('team')), cls: val('cls'), count: Number(val('count')) });
  const bots = () => {
    const team = Number(val('team')) || 1, { x, y } = s.pointerTile;
    for (let i = 0; i < 4; i++) s.sim.spawn('bot', team, CLASSES[i % CLASSES.length], 20, x + (i % 2) * 8, y + Math.floor(i / 2) * 6);
  };
  $('bots').onclick = bots;
  $('brawl').onclick = () => brawl(s);
  $('clear').onclick = () => location.reload();
  const scn = el.querySelector<HTMLSelectElement>('#scn');
  if (scn) scn.onchange = () => { const q = new URLSearchParams(location.search); q.set('scenario', scn.value); location.search = q.toString(); };
  const spot = el.querySelector<HTMLSelectElement>('#spot');
  if (spot) spot.onchange = () => { const [x, y] = s.spots[spot.value as keyof typeof s.spots]; s.focus(x, y); };
  let paused = false;
  $('pause').onclick = () => {
    paused = !paused;
    $('pause').textContent = paused ? 'Resume' : 'Pause';
    s.sim.speed(paused ? 0 : Number(val('speed')));
  };
  $('cut').onclick = () => (s.build.layer.cutaway = !s.build.layer.cutaway);
  $('b500').onclick = () => s.build.addResources();
  $('bclaim').onclick = () => s.build.armClaim();
  $('speed').onchange = () => { if (!paused) s.sim.speed(Number(val('speed'))); };
  el.querySelectorAll<HTMLInputElement>('[data-ov]').forEach((c) => (c.onchange = () => s.setOverlay(c.dataset.ov as Overlay, c.checked)));
  // panel clicks never reach the map
  el.addEventListener('pointerdown', (e) => e.stopPropagation());

  const perf = $('perf'), score = $('score'), t0 = s.sim.cur?.tick ?? 0;
  let end: number | null = null;
  setInterval(() => {
    $('cut').textContent = `Walls: ${s.build.layer.cutaway ? 'cut away' : 'full'} (V)`;
    const r = tally(s);
    if (r.rows.length) {
      const live = r.rows.filter((q) => q.alive);
      if (end === null && r.rows.length > 1 && live.length <= 1) end = r.tick;
      const sec = Math.max(0, (end ?? r.tick) - t0) / 10;
      const head = end === null ? '' : live.length ? `  ${TEAMS[live[0].team] ?? live[0].team} won` : '  all down';
      score.textContent = `team     alive wnd kill\n${r.rows.map((q) => `${(TEAMS[q.team] ?? String(q.team)).padEnd(8)} ${String(q.alive).padStart(5)} ${String(q.wounded).padStart(3)} ${String(q.killed).padStart(4)}`).join('\n')}\ntime   ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}${head}`;
    }

    const st = s.sim.stats;
    perf.textContent = `fps    ${game.loop.actualFps.toFixed(0)}\nsim    ${st.stepMs.toFixed(2)} ms/step\nunits  ${st.units}  squads ${s.sim.squads.size}\ntick   ${s.sim.cur?.tick ?? 0}  zoom ${s.cameras.main.zoom.toFixed(2)}\nsel    ${s.selected.size}`;
  }, 250);
}

/** Alive / wounded / killed per team (teams with units only), and the current tick. */
export function tally(s: SandboxScene): { tick: number; rows: { team: number; alive: number; wounded: number; killed: number }[] } {
  const by = new Map<number, { team: number; alive: number; wounded: number; killed: number }>();
  for (const u of s.sim.cur?.units ?? []) {
    const team = s.sim.squads.get(u.squad)?.team ?? 0;
    let r = by.get(team);
    if (!r) by.set(team, (r = { team, alive: 0, wounded: 0, killed: 0 }));
    if (u.state !== 'dead') r.alive++;
    else if (u.wounded) r.wounded++;
    else r.killed++;
  }
  return { tick: s.sim.cur?.tick ?? 0, rows: [...by.values()].sort((a, b) => a.team - b.team) };
}

/** Place a scenario's squads (with their bot behaviours) and set its camera. */
export function applyScenario(s: SandboxScene, sc: Scenario): void {
  if (sc.id === 'brawl-600') brawl(s);
  const e = sc.economy;
  if (sc.neutral) s.sim.spawnMobs();
  for (const c of e?.claims ?? []) s.sim.claim(c.team, c.x, c.y, c.r);
  for (const [r, n] of Object.entries(e?.stock ?? {})) s.sim.addStock(0, r as ResourceKind, n);
  for (const [r, n] of Object.entries(e?.foeStock ?? {})) s.sim.addStock(1, r as ResourceKind, n);
  for (const q of sc.squads) s.sim.spawn(q.owner ?? (q.team === 0 ? 'you' : 'bot'), q.team, q.cls, q.count, q.x, q.y, q.bot);
  // each team that lays out walls or sites builds its own before play
  const teams = [...new Set([...(e?.walls ?? []), ...(e?.sites ?? [])].map((q) => sc.squads[q.squad]?.team ?? 0))];
  // squad ids follow the spawn order; walls before the sites (stairs and ladders lean on them)
  const phases = [...new Set([...(e?.walls ?? []), ...(e?.sites ?? [])].map((q) => q.phase ?? 0))].sort((a, b) => a - b);
  for (const p of phases) {
    for (const { squad, phase, ...w } of e?.walls ?? []) if ((phase ?? 0) === p) s.sim.order({ kind: 'placeWall', squad, ...w });
    for (const t of e?.sites ?? []) if ((t.phase ?? 0) === p) s.sim.order({ kind: 'placeBuilding', squad: t.squad, type: t.type, x: t.x, y: t.y, rot: t.rot });
    if (e?.prebuild) for (const t of teams) s.sim.prebuild(t, e.prebuild);
  }
  if (e?.bridges?.length) {
    for (const { team, ...b } of e.bridges) s.sim.order({ kind: 'placeBridge', team, ...b });
    s.sim.skip(1); // orders apply on the next step
    for (const t of new Set(e.bridges.map((b) => b.team))) s.sim.finishBridges(t);
  }
  for (const o of sc.after?.orders ?? []) s.sim.order(o);
  if (sc.after?.settle) s.sim.skip(sc.after.settle);
  for (const q of sc.after?.squads ?? []) s.sim.spawn(q.team === 0 ? 'you' : q.bot ? 'bot' : 'raiders', q.team, q.cls, q.count, q.x, q.y, q.bot);
  for (const o of sc.after?.then ?? []) s.sim.order(o);
  if (sc.after?.later) s.sim.skip(sc.after.later.settle);
  for (const o of sc.after?.later?.orders ?? []) s.sim.order(o);
  s.focus(sc.camera.x, sc.camera.y, sc.camera.zoom);
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
