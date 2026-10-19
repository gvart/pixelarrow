/**
 * The player HUD in the red-figure kit (W-32; art: public/war/ui/, ./kit.ts). HTML over the canvas, anchored:
 *
 *   top centre     resource band: the 11 resources (icon + own stock), runner and horse at its ends
 *   bottom left    round minimap (./minimap.ts)
 *   bottom centre  command card, shown with a selection: a selected building or site wins over squads.
 *                  squad: class icon, name, men, hp; move, attack (arm a click), hold, 4 formations, build; crew / let go,
 *                  deploy, raise / push ladder, ignite, extinguish (arm a click), fire arrows
 *                  site: progress, workers, materials; assign N of the selected squad, stop work, cancel (refund)
 *                  building: hp (and burning), upgrade with its cost
 *   bottom right   build bar: tabs Camp / Walls / Siege, a tool per building, a tooltip with cost and labour; wall
 *                  tools add gate / tower / order / undo / flip, and the build status line above
 *   at the cursor  the E context label (../interact.ts) and the kit's cursors
 *
 * The dev panel (../devPanel.ts) hides behind F1 and the DEV corner button. It only calls BuildMode, SiegeControls and
 * the scene, and reads their state at 5 Hz.
 */
import '@fontsource/inter/600.css';
import '@fontsource/cormorant-sc/700.css';
import { BUILDINGS } from '../../sim/economy';
import { SIEGE } from '../../sim/siege';
import type { BuildingType, ResourceKind, SiegeType } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { costText, isSite, labourText, TOOLBAR, WALL_NAME, type BuildMode, type Cost, type Tool } from '../build/buildMode';
import { SIEGE_NAME } from '../siege/siegeControls';
import { bar, BUILDING_ICON, cursor, CSS, icon, SIEGE_ICON, snapW, UI, uiZoom, UNIT_ICON } from './kit';
import { Minimap } from './minimap';

const RES: string[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'olives'];
const SHAPES = ['line', 'column', 'wedge', 'loose'] as const;
const CLASS_NAME: Record<string, string> = { militia: 'Militia', hoplite: 'Hoplites', celt_sword: 'Swordsmen', archer: 'Archers', slinger: 'Slingers', javelineer: 'Javelineers' };
const nice = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

interface ToolDef { name: string; icon: string; tool: Tool; cost: Cost; labour: number; note: string }
const bTool = (t: BuildingType, note = '', name = nice(t)): ToolDef => ({ name, icon: BUILDING_ICON[t], tool: { kind: 'building', type: t }, cost: BUILDINGS[t].cost, labour: BUILDINGS[t].labour, note });
const TABS: Record<'Camp' | 'Walls' | 'Siege', ToolDef[]> = {
  Camp: TOOLBAR.map((t) => bTool(t)),
  Walls: [
    { ...bTool('palisade', 'per tile · G gate, T tower, Enter orders', nice(WALL_NAME.wood)), tool: { kind: 'wall', material: 'wood' } },
    { ...bTool('rampart', 'per tile · 2 deep, walkway', nice(WALL_NAME.timber)), tool: { kind: 'wall', material: 'timber' } },
    { ...bTool('stoneWall', 'per tile · 2 deep, walkway', nice(WALL_NAME.stone)), tool: { kind: 'wall', material: 'stone' } },
    { ...bTool('woodStairs', 'up an own walkway wall\'s inside'), tool: { kind: 'access', type: 'woodStairs' } },
    { ...bTool('stoneStairs', 'up an own walkway wall\'s inside'), tool: { kind: 'access', type: 'stoneStairs' } },
    { ...bTool('ladder', 'beside any walkway wall or tower'), tool: { kind: 'access', type: 'ladder' } },
    { ...bTool('woodBridge', 'per tile · drag bank to bank, burns'), tool: { kind: 'bridge', material: 'wood' } },
    { ...bTool('stoneBridge', 'per tile · drag bank to bank, fireproof'), tool: { kind: 'bridge', material: 'stone' } },
  ],
  Siege: (Object.keys(SIEGE) as SiegeType[]).map((t) => ({ name: nice(SIEGE_NAME[t]), icon: SIEGE_ICON[t], tool: { kind: 'siege', type: t }, cost: SIEGE[t].cost, labour: SIEGE[t].labour, note: `crew ${SIEGE[t].crew} · a squad builds it` })),
};
type Tab = keyof typeof TABS;
const SLOT = 32; // 30 px button + 2 gap

/** A cost as resource icons with numbers. */
const costHtml = (c: Cost) => Object.entries(c).map(([r, v]) => `<span style="display:inline-flex;align-items:center;gap:2px;margin-right:6px">${icon('res-' + r)}<span class="rf-num">${v}</span></span>`).join('') || '<span class="rf-dim">free</span>';

export function hud(s: SandboxScene): void {
  const m: BuildMode = s.build, sc = s.siege;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const els: HTMLElement[] = [];
  const mk = (id: string, css: string, html = '') => {
    const el = document.createElement('div');
    el.className = 'rf';
    el.id = id;
    el.style.cssText = css;
    el.innerHTML = html;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    els.push(el);
    return el;
  };

  // ---------- top resource band ----------
  const cells = RES.map((r) => `<div style="display:flex;align-items:center;gap:2px;width:52px" title="${r}">${icon('res-' + r)}<span class="rf-num" data-r="${r}">0</span></div>`).join('');
  const topW = snapW(23 + 6 + RES.length * 52 + 26 + 8);
  const top = mk('rfTop', `top:0;left:50%;transform:translateX(-50%);width:${topW}px;height:46px;pointer-events:auto`,
    `<div class="rf-band" style="position:absolute;inset:0;display:flex;align-items:center;padding:0 1px"><img src="${UI}accents/runner.png" srcset="${UI}accents/runner@2x.png 2x" width="23" height="26" alt="" style="margin-right:6px">${cells}<img src="${UI}accents/horse.png" srcset="${UI}accents/horse@2x.png 2x" width="26" height="26" alt="" style="margin-left:auto"></div>`);
  const counts = [...top.querySelectorAll<HTMLElement>('[data-r]')];

  // ---------- minimap ----------
  const mini = new Minimap(s);
  document.body.appendChild(mini.el);
  els.push(mini.el);
  mini.el.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---------- tooltip ----------
  const tip = mk('rfTip', 'display:none;z-index:6');
  tip.className = 'rf rf-tip';
  const showTip = (el: HTMLElement, html: string) => {
    tip.innerHTML = html;
    tip.style.display = '';
    const r = el.getBoundingClientRect(), top = (el.closest('.rf') ?? el).getBoundingClientRect().top, z = Number(tip.style.zoom) || 1, t = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(4, Math.min(innerWidth - t.width - 4, r.left + r.width / 2 - t.width / 2)) / z}px`;
    tip.style.top = `${(Math.min(r.top, top) - t.height - 4) / z}px`;
  };
  const hideTip = () => (tip.style.display = 'none');
  const tipOn = (el: HTMLElement, html: () => string) => { el.addEventListener('pointerenter', () => showTip(el, html())); el.addEventListener('pointerleave', hideTip); };

  // ---------- command card ----------
  const card = mk('rfCard', 'left:50%;bottom:4px;transform:translateX(-50%);display:none;pointer-events:auto');
  const cardW = snapW(8 * SLOT - 2 + 16);
  card.innerHTML = `<div class="rf-card" style="width:${cardW}px;padding:2px 4px 4px">
    <div style="display:flex;gap:6px;align-items:center;height:36px">
      <div id="cIcon" style="width:32px;height:32px"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:6px"><span class="rf-name" id="cName"></span><span class="rf-num" id="cCount" style="margin-left:auto"></span></div>
        <div id="cBars" style="margin-top:4px;display:flex;flex-direction:column;gap:2px"></div>
        <div class="rf-dim" id="cInfo" style="margin-top:3px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      </div>
    </div>
    <div id="cRows" style="margin-top:4px;display:flex;flex-direction:column;gap:2px"></div></div>`;
  const $ = (id: string) => card.querySelector<HTMLElement>('#' + id)!;
  /** An icon button: id, icon, tooltip, key hint, click. */
  const btn = (id: string, ic: string, tipText: string | (() => string), key: string, run: () => void) => {
    const b = document.createElement('button');
    b.className = 'rf-btn';
    b.id = id;
    b.innerHTML = icon(ic) + (key ? `<span class="key">${key}</span>` : '');
    b.onclick = () => { run(); refresh(); };
    tipOn(b, () => (typeof tipText === 'function' ? tipText() : b.dataset.tip ?? tipText));
    return b;
  };
  const row = (...bs: HTMLElement[]) => { const r = document.createElement('div'); r.style.cssText = 'display:flex;gap:2px;align-items:center'; r.append(...bs); return r; };

  // squad rows
  let lastShape: string | null = null;
  const sqMove = btn('cMove', 'act-move', 'Move: click the map <b class="k">right click</b>', '', () => sc.arm('move'));
  const sqAtk = btn('cAttack', 'act-attack', 'Attack: click an enemy <b class="k">E</b>', '', () => sc.arm('attack'));
  const sqHold = btn('cHold', 'act-hold', 'Hold position <b class="k">H</b>', 'H', () => s.orderSelected((squad) => ({ kind: 'hold', squad })));
  const shapes = SHAPES.map((sh, i) => btn('cF' + sh, 'act-' + sh, `Formation: ${sh} <b class="k">${i + 1}</b>`, String(i + 1), () => { s.orderSelected((squad) => ({ kind: 'formation', squad, shape: sh })); lastShape = sh; }));
  const sqBuild = btn('cBuild', 'act-build', 'Build: place a site, this squad builds it <b class="k">B</b>', 'B', () => { m.toggle(true); tab = 'Camp'; renderTools(); });
  const gCrew = btn('cCrew', 'act-crew', 'Crew the nearest own engine / let go', '', () => sc.crew());
  const gDeploy = btn('cDeploy', 'act-deploy', 'Deploy / pack the stone thrower <b class="k">Y</b>', 'Y', () => sc.deploy());
  const gRaise = btn('cRaise', 'act-raise-ladder', 'Raise ladder: click an enemy wall face', '', () => sc.arm('raise'));
  const gPush = btn('cPush', 'act-push-ladder', 'Push ladder: click an enemy ladder', '', () => sc.arm('push'));
  const gIgnite = btn('cIgnite', 'act-ignite', 'Ignite: click enemy wood', '', () => sc.arm('ignite'));
  const gDouse = btn('cDouse', 'act-extinguish', 'Extinguish: click an own fire', '', () => sc.arm('extinguish'));
  const gFire = btn('cFire', 'act-fire-arrows', 'Fire arrows on / off <b class="k">Q</b>', 'Q', () => sc.fireArrows());
  const squadRows = [row(sqMove, sqAtk, sqHold, ...shapes, sqBuild), row(gCrew, gDeploy, gRaise, gPush, gIgnite, gDouse, gFire)];
  // site row
  const sN = document.createElement('input');
  sN.id = 'sn';
  sN.type = 'number';
  sN.min = '1';
  sN.value = '5';
  sN.title = 'men to assign';
  const sAssign = btn('sassign', 'act-assign', '', '', () => m.assign(Number(sN.value)));
  const sStop = btn('sstop', 'act-stop', 'Stop work: the builders leave', '', () => m.stopWork());
  const sCancel = btn('scancel', 'act-cancel', '', '', () => m.cancelSite());
  const siteRows = [row(sAssign, sN, sStop, sCancel)];
  // building row
  const bUp = btn('bup', 'act-upgrade', '', '', () => m.upgrade());
  const bldRows = [row(bUp)];
  let shown: HTMLElement[] = [];
  const setRows = (rows: HTMLElement[]) => { if (rows === shown) return; shown = rows; $('cRows').replaceChildren(...rows); };
  const setHead = (ic: string, name: string, count: string, bars: string, info: string) => {
    if ($('cIcon').dataset.ic !== ic) { $('cIcon').dataset.ic = ic; $('cIcon').innerHTML = icon(ic, 32); }
    $('cName').textContent = name;
    $('cCount').textContent = count;
    $('cBars').innerHTML = bars;
    $('cInfo').textContent = info;
  };
  const BAR_W = cardW - 12 - 8 - 38;

  // ---------- build bar ----------
  let tab: Tab = 'Camp';
  const barW = snapW(9 * SLOT - 2 + 12);
  const build = mk('rfBuild', `right:4px;bottom:4px;width:${barW}px;pointer-events:auto`,
    `<div style="position:absolute;right:0;bottom:100%;margin-bottom:2px;display:flex;flex-direction:column;align-items:flex-end;gap:2px"><div id="bStatus" class="rf-label" style="display:none;white-space:normal;max-width:${barW}px"></div>
    <div id="bWall" style="display:none;gap:2px"></div></div>
    <div id="bTabs" style="display:flex;padding-left:6px;align-items:flex-end;height:17px"></div>
    <div class="rf-card" style="padding:2px 0 3px"><div id="bTools" style="display:flex;gap:2px;height:30px"></div></div>`);
  const bTabs = build.querySelector<HTMLElement>('#bTabs')!, bTools = build.querySelector<HTMLElement>('#bTools')!;
  const bStatus = build.querySelector<HTMLElement>('#bStatus')!, bWall = build.querySelector<HTMLElement>('#bWall')!;
  for (const t of Object.keys(TABS) as Tab[]) {
    const b = document.createElement('button');
    b.className = 'rf-tab';
    b.textContent = t;
    b.dataset.tab = t;
    b.onclick = () => { tab = t; renderTools(); };
    bTabs.appendChild(b);
  }
  const toolBtns: [HTMLButtonElement, ToolDef][] = [];
  const renderTools = () => {
    toolBtns.length = 0;
    bTools.replaceChildren(...TABS[tab].map((d, i) => {
      const b = btn('bt-' + tab + i, d.icon, () => `<div class="rf-name" style="margin-bottom:4px">${d.name}</div><div style="display:flex;align-items:center">${costHtml(d.cost)}</div><div class="rf-dim" style="margin-top:3px">labour ${labourText(d.labour)}${d.note ? ' · ' + d.note : ''}</div>`, '', () => m.setTool(JSON.stringify(m.tool) === JSON.stringify(d.tool) ? null : d.tool));
      b.dataset.tool = String(i);
      toolBtns.push([b, d]);
      return b;
    }));
    bTabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  };
  renderTools();
  const tb = (label: string, tipText: string, run: () => void) => { const b = document.createElement('button'); b.className = 'rf-tbtn'; b.textContent = label; b.title = tipText; b.onclick = run; return b; };
  bWall.append(tb('+ gate G', 'insert a gate on the line', () => (m.insert = 'gate')), tb('+ tower T', 'insert a tower on the line', () => (m.insert = 'tower')), tb('Order ⏎', 'order the walls built', () => m.confirmWall()), tb('Undo ⌫', 'remove the last line', () => m.removeLine(m.lines.length - 1)), tb('Flip F', 'flip the inside', () => m.flipInside()));

  // ---------- dev toggle ----------
  const devBtn = mk('rfDev', 'top:4px;right:4px;pointer-events:auto', '');
  const dbtn = document.createElement('button');
  dbtn.className = 'rf-tbtn';
  dbtn.textContent = 'DEV';
  dbtn.title = 'dev panel (F1)';
  devBtn.appendChild(dbtn);
  const dev = document.getElementById('dev');
  const setDev = (on: boolean) => { if (dev) dev.style.display = on ? '' : 'none'; dbtn.classList.toggle('on', on); };
  setDev(new URLSearchParams(location.search).has('dev'));
  dbtn.onclick = () => setDev(dev?.style.display === 'none');
  addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); setDev(dev?.style.display === 'none'); } });

  // ---------- scale ----------
  const scale = () => {
    const z = String(uiZoom());
    for (const el of [...els, document.getElementById('hoverAct')]) if (el) el.style.zoom = z;
  };
  scale();
  addEventListener('resize', scale);

  // ---------- cursors ----------
  const CUR: Record<string, string> = Object.fromEntries(['default', 'move', 'attack', 'build', 'gather', 'interact'].map((k) => [k, cursor(k)]));
  const cursorFor = (): string => {
    if (m.tool || m.claimArmed) return 'build';
    if (sc.armed) return sc.armed === 'move' ? 'move' : sc.armed === 'attack' ? 'attack' : 'interact';
    const a = s.interact.shown;
    if (!a) return 'default';
    if (a.startsWith('move')) return 'move';
    if (a.startsWith('attack')) return 'attack';
    if (/^(build|resume|repair)/.test(a)) return 'build';
    if (a.startsWith('gather')) return 'gather';
    return 'interact';
  };
  let curNow = '';
  s.events.on('postupdate', () => {
    const c = cursorFor();
    if (c !== curNow) { curNow = c; s.game.canvas.style.cursor = CUR[c]; }
  });

  // ---------- refresh ----------
  const refresh = () => {
    const st = s.sim.cur?.stock?.[0] ?? {};
    counts.forEach((el) => { const v = Math.floor(st[el.dataset.r as ResourceKind] ?? 0); el.textContent = String(v); el.classList.toggle('rf-dim', !v); });

    const sq = m.squad(), q = sq === null ? undefined : s.sim.squads.get(sq), own = sc.own();
    const b = m.selectedBuilding();
    if (b && b.state !== 'destroyed') {
      card.style.display = '';
      const site = isSite(b), name = nice(b.type) + (site ? (b.upgradeFrom ? ' upgrade' : ' site') : '');
      if (site) {
        const need = Object.entries(m.need(b)), planned = b.progress === 0 && b.delivered === 0 && b.workers === 0;
        const mats = need.map(([r, v]) => `${r} ${Math.floor(v! * b.delivered)}/${Math.ceil(v!)}`).join(' · ');
        setHead(BUILDING_ICON[b.type], name, `${Math.round(b.progress * 100)}%`, bar('construction', b.progress, BAR_W),
          `${planned ? 'planned' : b.state} · workers ${b.workers}/${b.maxWorkers}${mats ? ' · ' + mats : ''}`);
        setRows(siteRows);
        sAssign.disabled = sq === null;
        sAssign.dataset.tip = sq === null ? 'Assign: select a squad first' : `Assign: detach ${sN.value} from squad #${sq} and send them`;
        sStop.disabled = !m.squadsAt(b).length;
        const refund = m.refund(b);
        sCancel.dataset.tip = `Cancel site: refunds ${Object.keys(refund).length ? costText(refund) : 'nothing'}`;
      } else {
        setHead(BUILDING_ICON[b.type], name, `${Math.ceil(b.hp)}/${b.maxHp}`, bar('hp', b.hp / b.maxHp, BAR_W) + (b.burning ? bar('burn', 1, BAR_W) : ''),
          `${b.team === 0 ? 'yours' : 'enemy'} · ${b.state}${b.burning ? ' · burning' : ''}`);
        const up = b.team === 0 ? m.upgradeOf(b) : null;
        setRows(up ? bldRows : []);
        if (up) bUp.dataset.tip = `<div class="rf-name" style="margin-bottom:4px">Upgrade to ${nice(up.to)}</div><div style="display:flex;align-items:center">${costHtml(up.cost)}</div><div class="rf-dim" style="margin-top:3px">labour ${labourText(up.labour)} · ${sq === null ? 'planned: send a squad' : `squad #${sq} builds it`}</div>`;
      }
    } else if (q && own.length) {
      card.style.display = '';
      const men = s.drawn.filter((d) => own.includes(d.u.squad) && d.u.state !== 'dead');
      const cls = men[0]?.u.cls ?? '';
      const hp = men.reduce((a, d) => a + d.u.hp, 0), max = men.reduce((a, d) => a + d.u.maxHp, 0) || 1;
      const e = sc.engineOf(own[0]);
      setHead(UNIT_ICON[cls] ?? 'unit-militia', (CLASS_NAME[cls] ?? nice(cls)) + (own.length > 1 ? ` +${own.length - 1}` : ''), `${men.length} men`, bar('hp', hp / max, BAR_W),
        e ? `crews ${SIEGE_NAME[e.type]} · ${e.state} · crew ${e.crewHere}/${e.crewNeed}${e.burning ? ' · burning' : ''}` : `${q.order}${sc.status ? ' · ' + sc.status : ''}`);
      setRows(squadRows);
      sqHold.classList.toggle('on', q.order === 'hold');
      shapes.forEach((x, i) => x.classList.toggle('on', lastShape === SHAPES[i]));
      sqMove.classList.toggle('on', sc.armed === 'move');
      sqAtk.classList.toggle('on', sc.armed === 'attack');
      for (const [x, a] of [[gRaise, 'raise'], [gPush, 'push'], [gIgnite, 'ignite'], [gDouse, 'extinguish']] as const) x.classList.toggle('on', sc.armed === a);
      gCrew.classList.toggle('on', !!e);
      gCrew.dataset.tip = e ? `Let go of the ${SIEGE_NAME[e.type]}` : 'Crew the nearest own engine';
      gDeploy.disabled = e?.type !== 'stoneThrower';
      gFire.classList.toggle('on', own.every((x) => sc.fire.has(x)));
      sqBuild.classList.toggle('on', m.active);
    } else {
      card.style.display = 'none';
      setRows([]);
    }

    // build bar
    for (const [x, d] of toolBtns) x.classList.toggle('on', JSON.stringify(d.tool) === JSON.stringify(m.tool));
    bWall.style.display = m.tool?.kind === 'wall' ? 'flex' : 'none';
    const status = m.claimArmed ? 'click the map to claim (influence r 20)' : m.tool ? m.status || 'R rotate · Esc cancel · shift keeps the tool' : '';
    bStatus.textContent = status;
    bStatus.style.display = status ? '' : 'none';
  };
  setInterval(refresh, 200);
  refresh();
}
