/**
 * The player HUD in the red-figure kit (W-32; art: public/war/ui/, ./kit.ts). HTML over the canvas, anchored:
 *
 *   top centre     resource band: the 11 resources (icon + own stock), runner and horse at its ends
 *   bottom left    round minimap (./minimap.ts), the view mode switcher in its corner (F2-F7) and the mode's legend over it (./modes.ts)
 *   centre         the full map on M (./fullMap.ts)
 *   bottom centre  command card, shown with a selection (a selected building or site wins over men), in groups:
 *                  selection (class icon, name, men, hp) | orders (move, attack, attack-move: Ctrl + right click or the button then a click, hold H, stop X) over the
 *                  formation segments (Alt+1-4) | squad-specific slots only while relevant (the squad active F with its
 *                  cooldown ring, ./cardActive.ts; deploy / pack Y, let go while crewing). The orders go to the selected
 *                  men (W-53, ../select.ts); the control group bar 1-9 sits over the card (./groups.ts).
 *                  site: progress, workers, materials | stop work, cancel (refund); send men by selecting them and E on it
 *                  building: hp (and burning) | upgrade with its cost
 *                  Situational orders (ladders, ignite, extinguish, crew, fire arrows) are context only: E / right
 *                  click, or hold either for the radial menu (../interact.ts).
 *   bottom right   the Build (hammer, B) button; the build bar (tabs Camp / Walls / Siege, a tool per building, a
 *                  tooltip with cost and labour; wall tools add gate / tower / order / undo / flip, the status line
 *                  above) opens bottom centre, over the card, only in build mode: B / Esc close it
 *   top right      World, Market (K: ./market.ts), DEV (F1) and the UI scale (auto by window / 0.75x / 1x / 1.25x / 1.5x / 2x, kept in localStorage; ./kit.ts)
 *   at the cursor  the E context label (../interact.ts) and the kit's cursors
 *
 * The dev panel (../devPanel.ts) hides behind F1 and the DEV corner button. It only calls BuildMode, SiegeControls and
 * the scene, and reads their state at 5 Hz.
 */
import { draggable } from './drag';
import '@fontsource/inter/600.css';
import '@fontsource/cinzel/700.css';
import { BUILDINGS, NEUTRAL_TEAM } from '../../sim/economy';
import { SIEGE } from '../../sim/siege';
import { FORT } from '../../sim/works';
import type { BuildingType, FortKind, ResourceKind, SiegeType } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { costText, isSite, labourText, TOOLBAR, WALL_NAME, type BuildMode, type Cost, type Tool } from '../build/buildMode';
import { SIEGE_NAME } from '../siege/siegeControls';
import { bar, BUILDING_ICON, cursor, CSS, icon, placeTip, setUiScale, SIEGE_ICON, snapW, UI, UI_SCALES, uiScale, uiZoom, UNIT_ICON } from './kit';
import { Minimap } from './minimap';
import { ModeBar } from './modes';
import { FullMap } from './fullMap';
import { ACTIVE_CSS, ACTIVE_KEY, ACTIVE_UI, activesOf, activeTip, fireActives } from './cardActive';
import { mountRoster } from './roster';
import { mountCraft } from './craft';
import { sandboxCraft } from './craft/state';
import { sandboxRoster } from './roster/state';
import { PROF_NODES } from '../../../data/professions';
import { WP_NAME } from './craft/workplace';
import { mountTrade } from './holder';
import { mountMarket } from './market';
import { mountGuardians } from './guardianBar';
import { billText, mountBuildingCard, rebuildBill, rebuildWhy, repairBill, repairWhy } from './buildingCard';
import { RECIPES } from '../../../data/recipes';
import { allCivilians, civBuild, civGather, civInfo, civName, civTips, civWork } from './cardCiv';
import { buildCard, term } from './codex';
import { loadGlyphs } from './glyph';
import { TIP_CSS, tipChain } from './tooltip';
import { GROUPS_CSS, mountGroups } from './groups';
import { keys } from '../../input/keys';
import type { ActionId } from '../../input/actions';
import { myTeam } from '../side';

const RES: string[] = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'olives', 'coin'];
/** M5h: the band's second page (its toggle under the right end): crafting goods, pitch, and the remedies in the team supplies (p:). */
const CRAFT_RES: string[] = ['hides', 'flax', 'herbs', 'charcoal', 'leather', 'linen', 'oil', 'pitch', 'p:bandage', 'p:salve', 'p:theriac'];
const RES_ICON: Record<string, string> = { 'p:bandage': 'res-bandages', 'p:salve': 'res-salves', 'p:theriac': 'res-theriac' };
const SHAPES = ['line', 'column', 'wedge', 'loose'] as const;
const CLASS_NAME: Record<string, string> = { militia: 'Militia', hoplite: 'Hoplites', celt_sword: 'Swordsmen', archer: 'Archers', slinger: 'Slingers', javelineer: 'Javelineers' };
const nice = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

interface ToolDef { name: string; icon: string; tool: Tool; cost: Cost; labour: number; note: string;
  /** M5h3: the engineer node it needs (an engine design, a Fortifier field tile). */
  node?: string;
  /** M6k carts: a workshop recipe queued at your workshop of its level (not laid out on the map). */
  craft?: string;
  /** The building type it places (its description, ./codex.ts BUILD_TEXT). */
  type?: BuildingType }
const bTool = (t: BuildingType, note = '', name = nice(t)): ToolDef => ({ name, icon: BUILDING_ICON[t], tool: { kind: 'building', type: t }, cost: BUILDINGS[t].cost, labour: BUILDINGS[t].labour, note, type: t });
/** M5h workplaces: level 1 placed here, L2 / L3 by Upgrade on the building's card (what each is for: ./codex.ts). */
const WORKPLACES: [BuildingType, string][] = [['forge', 'Forge'], ['cookhouse', 'Cookhouse'], ['infirmary', 'Infirmary'], ['workshop', 'Workshop'], ['stall', 'Market stall'], ['sortingFloor', 'Sorting floor']];
/** M6k carts (docs/WAR.md "Carts"): made at a workshop, rolled out beside it for you. */
const cartTool = (t: 'handcart' | 'wagon'): ToolDef => {
  const r = RECIPES[t], lvl = r.lv;
  return { name: nice(t), icon: SIEGE_ICON[t], tool: { kind: 'siege', type: t }, cost: r.inputs as Cost, labour: r.secs, note: `${t === 'handcart' ? '6 loads, 2 pull it' : '12 loads, a driver and two mules'} · queued at your workshop L${lvl}`, craft: t };
};
const TABS: Record<'Camp' | 'Walls' | 'Craft' | 'Siege' | 'Trade', ToolDef[]> = {
  Camp: TOOLBAR.map((t) => bTool(t)),
  Craft: WORKPLACES.map(([t, name]) => bTool(t, '', name)),
  Walls: [
    { ...bTool('palisade', 'per tile · G gate, T tower, Enter orders', nice(WALL_NAME.wood)), tool: { kind: 'wall', material: 'wood' } },
    { ...bTool('rampart', 'per tile · 2 deep, walkway', nice(WALL_NAME.timber)), tool: { kind: 'wall', material: 'timber' } },
    { ...bTool('stoneWall', 'per tile · 2 deep, walkway', nice(WALL_NAME.stone)), tool: { kind: 'wall', material: 'stone' } },
    { ...bTool('woodStairs', 'up an own walkway wall\'s inside'), tool: { kind: 'access', type: 'woodStairs' } },
    { ...bTool('stoneStairs', 'up an own walkway wall\'s inside'), tool: { kind: 'access', type: 'stoneStairs' } },
    { ...bTool('ladder', 'beside any walkway wall or tower'), tool: { kind: 'access', type: 'ladder' } },
    { ...bTool('woodBridge', 'per tile · drag bank to bank, burns'), tool: { kind: 'bridge', material: 'wood' } },
    { ...bTool('stoneBridge', 'per tile · drag bank to bank, fireproof'), tool: { kind: 'bridge', material: 'stone' } },
    // M5h3 field works (Fortifier): a tile each, shift keeps the tool for a line
    { ...bTool('stakes', 'a tile · slows and hurts foes crossing; burns', 'Stakes'), node: 'fortifier' },
    { ...bTool('ditch', 'a tile · foes slow to cross it; labour only', 'Ditch'), node: 'fortifier' },
  ],
  // M6k: a chest (8 loads, yours only) and the carts (crafted at a workshop)
  Trade: [bTool('chest', '8 loads · yours only · 4 a region', 'Chest'), cartTool('handcart'), cartTool('wagon')],
  Siege: (Object.keys(SIEGE) as SiegeType[]).filter((t) => t !== 'handcart' && t !== 'wagon').map((t) => ({ name: nice(SIEGE_NAME[t]), icon: SIEGE_ICON[t], tool: { kind: 'siege', type: t }, cost: SIEGE[t].cost, labour: SIEGE[t].labour, note: `crew ${SIEGE[t].crew} · a squad builds it`, node: SIEGE[t].node })),
};
type Tab = keyof typeof TABS;
const SLOT = 32; // 30 px button + 2 gap

/** A cost as resource icons with numbers. */
const ceilBill = (c: Cost): Cost => Object.fromEntries(Object.entries(c).map(([r, v]) => [r, Math.ceil(v ?? 0)]));
const costHtml = (c: Cost) => Object.entries(c).map(([r, v]) => `<span style="display:inline-flex;align-items:center;gap:2px;margin-right:6px">${icon('res-' + r)}<span class="rf-num">${v}</span></span>`).join('') || '<span class="rf-dim">free</span>';

export function hud(s: SandboxScene): void {
  const m: BuildMode = s.build, sc = s.siege, C = sandboxCraft(s, sandboxRoster(s));
  /** M5h3: why a tool is greyed (its node held by no living engineer of yours), '' when usable. */
  let held = new Set<string>();
  const nodeWhy = (d: ToolDef) => (d.node && !held.has(d.node) ? `needs an engineer with ${PROF_NODES[d.node]?.name ?? d.node}` : '');
  const style = document.createElement('style');
  style.textContent = CSS + ACTIVE_CSS + TIP_CSS + GROUPS_CSS;
  void loadGlyphs();
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
  const cell = (r: string) => `<div style="display:flex;align-items:center;gap:2px;width:50px" title="${r.replace('p:', '')}">${icon(RES_ICON[r] ?? 'res-' + r)}<span class="rf-num" data-r="${r}">0</span></div>`;
  const cells = `<div id="rfRes" style="display:flex">${RES.map(cell).join('')}</div><div id="rfResCraft" style="display:none">${CRAFT_RES.map(cell).join('')}</div>`;
  const topW = snapW(23 + 6 + RES.length * 50 + 26 + 8);
  const top = mk('rfTop', `top:0;left:50%;transform:translateX(-50%);width:${topW}px;height:46px;pointer-events:auto`,
    `<div class="rf-band" style="position:absolute;inset:0;display:flex;align-items:center;padding:0 1px"><img src="${UI}accents/runner.png" srcset="${UI}accents/runner@2x.png 2x" width="23" height="26" alt="" style="margin-right:6px">${cells}<img src="${UI}accents/horse.png" srcset="${UI}accents/horse@2x.png 2x" width="26" height="26" alt="" style="margin-left:auto"></div>`);
  const counts = [...top.querySelectorAll<HTMLElement>('[data-r]')];
  // the second page swaps in place, so the band keeps its width; the tab hangs under its right end
  const resTab = document.createElement('button');
  resTab.className = 'rf-tbtn';
  resTab.id = 'rfResTab';
  resTab.style.cssText = 'position:absolute;right:30px;top:100%;margin-top:-1px;height:20px;font-size:11.5px';
  resTab.textContent = 'crafting ▾';
  resTab.title = 'show the crafting goods and remedies (again: the base resources)';
  let craftPage = false;
  resTab.onclick = () => {
    craftPage = !craftPage;
    top.querySelector<HTMLElement>('#rfRes')!.style.display = craftPage ? 'none' : 'flex';
    top.querySelector<HTMLElement>('#rfResCraft')!.style.display = craftPage ? 'flex' : 'none';
    resTab.textContent = craftPage ? 'resources ▾' : 'crafting ▾';
    resTab.classList.toggle('on', craftPage);
  };
  top.appendChild(resTab);

  // ---------- minimap ----------
  const mini = new Minimap(s);
  document.body.appendChild(mini.el);
  els.push(mini.el);
  mini.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const modes = new ModeBar(s);
  document.body.append(modes.el, modes.legend);
  els.push(modes.el, modes.legend);
  new FullMap(s); // M

  // ---------- tooltip ----------
  const tip = mk('rfTip', 'display:none;z-index:6');
  tip.className = 'rf rf-tip';
  let tipAt: HTMLElement | null = null;
  const showTip = (el: HTMLElement, html: string) => {
    tipAt = el;
    tip.innerHTML = html;
    tip.style.display = '';
    placeTip(tip, el);
    chain.shown(el);
  };
  const hideTip = () => { tip.style.display = 'none'; chain.hidden(); };
  // W-55: a held tooltip (its terms open nested cards) closes when the pointer leaves the chain
  const chain = tipChain(tip, () => { tip.style.display = 'none'; tipAt = null; });
  const tipOn = (el: HTMLElement, html: () => string) => {
    el.addEventListener('pointerenter', () => { if (!chain.isHeld()) showTip(el, html()); });
    el.addEventListener('pointerleave', (e) => { if (!chain.isHeld() && !chain.holds(e.relatedTarget)) hideTip(); });
  };

  // ---------- command card: selection | orders + formation | squad-specific ----------
  const card = mk('rfCard', 'left:50%;bottom:4px;transform:translateX(-50%);display:none;pointer-events:auto');
  card.innerHTML = `<div class="rf-card" id="cFrame" style="padding:3px 4px 4px;display:flex;align-items:stretch">
    <div id="cSel" style="display:flex;flex-direction:column;justify-content:center">
      <div style="display:flex;gap:5px;align-items:center">
        <div id="cIcon" style="width:32px;height:32px;flex:none"></div>
        <div style="min-width:0;flex:1"><div class="rf-name" id="cName" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div><div class="rf-num" id="cCount" style="margin-top:4px"></div><div class="rf-chip" id="cTag" style="display:none" title="combat tag: no entry to a safe court until it runs out"></div></div>
      </div>
      <div id="cBars" style="margin-top:5px;display:flex;flex-direction:column;gap:2px"></div>
      <div class="rf-dim" id="cInfo" style="margin-top:4px;font-size:11.5px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
    </div>
    <div class="rf-sep" id="cSep1"></div>
    <div id="cOrders" style="display:flex;flex-direction:column;justify-content:center;gap:3px"></div>
    <div class="rf-sep" id="cSep2"></div>
    <div id="cSlots" style="display:flex;gap:2px;align-items:center"></div></div>`;
  draggable(card, '#cSel'); // the selection's name plate moves the command card
  const $ = (id: string) => card.querySelector<HTMLElement>('#' + id)!;
  /** An icon button: id, icon, tooltip, key hint, click. */
  const btn = (id: string, ic: string, tipText: string | (() => string), key: string, run: () => void, cls = 'rf-btn') => {
    const b = document.createElement('button');
    b.className = cls;
    b.id = id;
    b.innerHTML = icon(ic) + (key ? `<span class="key">${key}</span>` : '');
    b.onclick = () => { run(); refresh(); };
    tipOn(b, () => (typeof tipText === 'function' ? tipText() : b.dataset.tip ?? tipText));
    return b;
  };
  const row = (cls: string, ...bs: HTMLElement[]) => { const r = document.createElement('div'); r.className = cls; r.style.cssText = 'display:flex;gap:2px;align-items:center'; r.append(...bs); return r; };
  const tipK = (name: string, what: string, key: string) => `<div class="rf-name" style="margin-bottom:3px">${name}</div>${what}${key ? ` <b class="k">${key}</b>` : ''}`;

  // orders and formation (squads)
  let lastShape: string | null = null;
  /** Stop: the selected men halt where it stands, forms up there and holds (the sim's stop). */
  const stop = () => { for (const q of sc.own()) s.sim.order({ kind: 'stop', squad: q }); };
  const sqMove = btn('cMove', 'act-move', tipK('Move', 'click the map, or', 'right click'), '', () => sc.arm('move'));
  const sqAtk = btn('cAttack', 'act-attack', tipK('Attack', 'click an enemy, or hover it and', 'E'), '', () => sc.arm('attack'));
  const sqAtkMove = btn('cAttackMove', 'act-attack', tipK('Attack-move', 'march to a point, fighting any foe met on the way: click it, or', 'Ctrl + right click'), '', () => sc.arm('attackMove'));
  sqAtkMove.insertAdjacentHTML('beforeend', `<span class="badge">${icon('act-move')}</span>`);
  const sqHold = btn('cHold', 'act-hold', tipK('Hold', 'stand and fight here', 'H'), 'H', () => s.orderSelected((squad) => ({ kind: 'hold', squad })));
  const sqStop = btn('cStop', 'act-stop', tipK('Stop', 'halt and form up where they stand', 'X'), 'X', stop);
  // the key hints are the formation actions' current bindings (src/war/input; Alt+1-4 by default, rebindable); the
  // corner badge writes the Mac modifiers as symbols to fit
  const formKey = (sh: string) => keys.label(`form.${sh}` as ActionId);
  const badge = (sh: string) => formKey(sh).replace(/Option\+/g, '⌥').replace(/Cmd\+/g, '⌘').replace(/Shift\+/g, '⇧');
  const shapes = SHAPES.map((sh) => btn('cF' + sh, 'act-' + sh, () => tipK('Formation: ' + sh, 'the selected men form up as one', formKey(sh)), badge(sh), () => { s.orderSelected((squad) => ({ kind: 'formation', squad, shape: sh })); lastShape = sh; }, ''));
  keys.onChange(() => shapes.forEach((b, i) => {
    const k = b.querySelector('.key'), label = badge(SHAPES[i]);
    if (k) k.textContent = label;
    else if (label) b.insertAdjacentHTML('beforeend', `<span class="key">${label}</span>`);
  }));
  const orders = [row('', sqMove, sqAtk, sqAtkMove, sqHold, sqStop), row('rf-seg', ...shapes)];
  orders[1].style.gap = '0';
  // civilian squads (M5f): work orders only, their jobs instead of the attack orders
  const cvMove = btn('cvMove', 'act-move', tipK('Move', 'click the map, or', 'right click'), '', () => sc.arm('move'));
  const cvHold = btn('cvHold', 'act-hold', tipK('Hold', 'stand here', 'H'), 'H', () => s.orderSelected((squad) => ({ kind: 'hold', squad })));
  const cvStop = btn('cvStop', 'act-stop', tipK('Stop', 'halt where they stand', 'X'), 'X', stop);
  const cvWork = btn('cvWork', 'act-assign', () => tipK('Work', civTips(s).work, ''), '', () => civWork(s, sc.own()));
  const cvGather = btn('cvGather', 'act-gather', () => tipK('Gather', civTips(s).gather, ''), '', () => civGather(s, sc.own()));
  const cvBuild = btn('cvBuild', 'act-build', () => tipK('Build', civTips(s).build, ''), '', () => civBuild(s, sc.own()));
  const civOrders = [row('', cvMove, cvHold, cvStop), row('', cvWork, cvGather, cvBuild)];
  // squad-specific: only while relevant
  const gActive = btn('cActive', 'act-hold', () => { const x = activesOf(s, sc.own())[0]; return x ? activeTip(x.a) : ''; }, ACTIVE_KEY, () => fireActives(s, sc.own()));
  gActive.insertAdjacentHTML('beforeend', '<i class="cd"></i><span class="cdn"></span>');
  const cdMax = new Map<number, number>(); // per squad: the cooldown it started from, for the ring
  const gDeploy = btn('cDeploy', 'act-deploy', () => tipK(sc.own().some((q) => sc.engineOf(q)?.state === 'deployed') ? 'Pack up' : 'Deploy', 'the stone thrower', 'Y'), 'Y', () => sc.deploy());
  const gLetGo = btn('cLetGo', 'act-crew', () => tipK('Let go', 'leave the engine', 'E on it'), '', () => sc.uncrew());
  // site
  const sStop = btn('sstop', 'act-stop', tipK('Stop work', 'the builders leave', ''), '', () => m.stopWork());
  const sCancel = btn('scancel', 'act-cancel', '', '', () => m.cancelSite());
  const siteSlots = [sStop, sCancel];
  // building
  const bUp = btn('bup', 'act-upgrade', '', '', () => m.upgrade());
  // M5h3 fortify (Fortifier, paid at once): iron-bind a gate, hang wet hides on a wood piece
  const fortify = (fort: FortKind) => { const b = m.selectedBuilding(); if (b) s.sim.order({ kind: 'fortify', team: myTeam(), building: b.id, fort }); };
  const bIron = btn('biron', 'bld-gate', '', '', () => fortify('ironGate'));
  const bWet = btn('bwet', 'act-extinguish', '', '', () => fortify('wetHides'));
  // M7g: repair a damaged building with the selected squads; rebuild an own ruin (the selected squad builds it, else planned)
  const bRepair = btn('brepair', 'act-build', '', '', () => {
    const b = m.selectedBuilding();
    if (!b) return;
    for (const q of sc.own()) s.sim.order({ kind: 'repairBuilding', squad: q, building: b.id });
    s.mark(b.x, b.y, 0x60d060);
  });
  const bRebuild = btn('brebuild', 'act-upgrade', '', '', () => {
    const b = m.selectedBuilding(), q = m.squad();
    if (!b) return;
    s.sim.order(q === null ? { kind: 'rebuild', building: b.id, team: myTeam() } : { kind: 'rebuild', building: b.id, squad: q });
    s.mark(b.x, b.y, 0x60d060);
  });
  let shownSlots: HTMLElement[] = [], shownOrders: HTMLElement[] | null = null;
  const setCard = (ord: boolean, slots: HTMLElement[], selW: number, list = orders) => {
    const want = ord ? list : null;
    if (want !== shownOrders) { shownOrders = want; $('cOrders').replaceChildren(...(want ?? [])); }
    if (slots.length !== shownSlots.length || slots.some((x, i) => x !== shownSlots[i])) { shownSlots = slots; $('cSlots').replaceChildren(...slots); }
    $('cSep1').style.display = ord ? '' : 'none';
    $('cOrders').style.display = ord ? 'flex' : 'none';
    $('cSep2').style.display = slots.length ? '' : 'none';
    $('cSel').style.width = `${selW}px`;
  };
  const setHead = (ic: string, name: string, count: string, bars: string, info: string) => {
    if ($('cIcon').dataset.ic !== ic) { $('cIcon').dataset.ic = ic; $('cIcon').innerHTML = icon(ic, 32); }
    $('cName').textContent = name;
    $('cCount').textContent = count;
    $('cBars').innerHTML = bars;
    $('cInfo').textContent = info;
    $('cInfo').title = info;
  };
  const SEL_SQUAD = 112, SEL_BLD = 156;

  // ---------- build: hammer button (B) opens the tabbed bar; B / Esc close it ----------
  const hammer = mk('rfHammer', 'right:4px;bottom:4px;pointer-events:auto');
  const hBtn = btn('cBuild', 'act-build', tipK('Build', 'open the build bar; Esc closes', 'B'), 'B', () => { m.toggle(); if (m.active) { tab = 'Camp'; renderTools(); } });
  hammer.appendChild(hBtn);
  let tab: Tab = 'Camp';
  const barW = snapW(Math.max(...Object.values(TABS).map((t) => t.length)) * SLOT - 2 + 12); // the longest tab
  const build = mk('rfBuild', `left:50%;bottom:4px;transform:translateX(-50%);width:${barW}px;pointer-events:auto;display:none`,
    `<div style="position:absolute;left:0;bottom:100%;margin-bottom:2px;display:flex;flex-direction:column;align-items:flex-start;gap:2px"><div id="bStatus" class="rf-label" style="display:none;white-space:normal;max-width:${barW}px"></div>
    <div id="bWall" style="display:none;gap:2px"></div></div>
    <div id="bTabs" style="display:flex;padding-left:6px;align-items:flex-end;height:23px"></div>
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
  /** M6k: queue a cart at your finished workshop of its level (the nearest to the camera's centre). */
  const craftCart = (id: string) => {
    const lvl = RECIPES[id].lv, cam = s.cameras.main, c = s.tileAt({ x: cam.width / 2, y: cam.height / 2 });
    const shops = (s.sim.cur?.buildings ?? []).filter((b) => b.team === myTeam() && (b.state === 'done' || b.state === 'damaged') && BUILDINGS[b.type].workplace?.kind === 'workshop' && BUILDINGS[b.type].workplace!.level >= lvl);
    const w = shops.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    if (!w) { m.status = `${id}: needs a finished workshop L${lvl} of yours`; return; }
    s.sim.order({ kind: 'craft', team: myTeam(), building: w.id, recipe: id });
    s.mark(w.x, w.y, 0x60d060);
    m.status = `${id} queued at the workshop (an engineer makes it)`;
  };
  const renderTools = () => {
    toolBtns.length = 0;
    bTools.replaceChildren(...TABS[tab].map((d, i) => {
      const b = btn('bt-' + tab + i, d.icon, () => buildCard(d.tool?.kind === 'siege' ? 'siege' : 'building', d.tool?.kind === 'siege' ? d.tool.type : d.type ?? '', d.name, icon(d.icon, 32), `<div style="display:flex;align-items:center;flex-wrap:wrap;row-gap:2px">${costHtml(d.cost)}</div><div class="rf-dim" style="margin-top:3px;font-size:11px">${d.craft ? `${d.labour} s an engineer` : `${term('labour')} ${labourText(d.labour)}`}${d.note ? ' · ' + d.note : ''}</div>`, nodeWhy(d)), '', () => { if (d.craft) return craftCart(d.craft); if (!nodeWhy(d)) m.setTool(JSON.stringify(m.tool) === JSON.stringify(d.tool) ? null : d.tool); });
      b.dataset.tool = String(i);
      toolBtns.push([b, d]);
      return b;
    }));
    bTabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  };
  renderTools();
  const tb = (label: string, tipText: string, run: () => void) => { const b = document.createElement('button'); b.className = 'rf-tbtn'; b.textContent = label; b.title = tipText; b.onclick = run; return b; };
  bWall.append(tb('+ gate G', 'insert a gate on the line', () => (m.insert = 'gate')), tb('+ tower T', 'insert a tower on the line', () => (m.insert = 'tower')), tb('Order ⏎', 'order the walls built', () => m.confirmWall()), tb('Undo ⌫', 'remove the last line', () => m.removeLine(m.lines.length - 1)), tb('Flip F', 'flip the inside', () => m.flipInside()));

  // ---------- top right: World; in dev also the dev panel (F1) and the UI scale (players set it in Settings, F10) ----------
  const corner = mk('rfDev', 'top:4px;right:4px;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-end;gap:2px', '');
  const dbtn = tb('DEV', 'dev panel (F1)', () => setDev(dev?.style.display === 'none'));
  const sbtn = tb('', 'UI scale: auto (by window) / 0.75x / 1x / 1.25x / 1.5x / 2x', () => { const v = UI_SCALES[(UI_SCALES.indexOf(uiScale()) + 1) % UI_SCALES.length]; setUiScale(v); scale(); });
  sbtn.id = 'uiScale';
  // M4c: back to the world map (world.html); a live region opens the live world as the same dev player, else the mock
  const goWorld = () => { const q = new URLSearchParams(location.search), w = new URLSearchParams(); if (q.has('net')) { if (q.get('dev')) w.set('dev', q.get('dev')!); } else w.set('offline', '1'); location.href = `world.html?${w}`; };
  const wbtn = tb('World', 'world map (Shift+W; plain W pans the camera)', goWorld);
  wbtn.id = 'rfWorld';
  corner.append(wbtn, ...(import.meta.env.DEV ? [dbtn, sbtn] : []));
  const dev = document.getElementById('dev');
  const setDev = (on: boolean) => { if (dev) dev.style.display = on ? '' : 'none'; dbtn.classList.toggle('on', on); };
  setDev(import.meta.env.DEV && new URLSearchParams(location.search).has('dev'));
  addEventListener('keydown', (e: KeyboardEvent) => {
    const a = keys.act(e);
    if (a === 'dev.panel') { if (import.meta.env.DEV) { e.preventDefault(); setDev(dev?.style.display === 'none'); } }
    else if (a === 'go.world') goWorld();
    else if (m.active || m.tool) return;
    else if (a === 'order.stop') stop();
    else if (a === 'order.active') fireActives(s, sc.own());
  });

  // ---------- trade: holder panel, hover card, command card slots (./holder.ts, M6k) ----------
  const trade = mountTrade(s, mk, btn, tipK);
  mountMarket(s, mk); // M6k: market, offers, board, contracts, letters, hand-off (./market.ts; K)
  mountGuardians(s, mk); // M7d: the guardian bar and the landmark panel (./guardianBar.ts; L)
  mountBuildingCard(s, mk); // M7g: the building card over the command card (./buildingCard.ts)

  // ---------- soldiers: roster panel (R), soldier card, toasts, veteran pips (./roster, M5g) ----------
  mountCraft(s, mk, mountRoster(s, mk)); // M5h5: workplace panel, profession trees, stash (./craft)
  const groups = mountGroups(s, mk, tipOn); // W-53: the control group bar over the card, numbers on the map

  // ---------- scale ----------
  const scale = () => {
    const z = String(uiZoom()), v = uiScale();
    sbtn.textContent = v === 'auto' ? 'Auto' : `${v}×`;
    for (const el of [...els, document.getElementById('hoverAct'), document.getElementById('rfRadial')]) if (el) el.style.zoom = z;
  };
  scale();
  addEventListener('resize', scale);

  // ---------- no browser context menu anywhere (canvas and HUD): right click is the game's (orders, the radial) ----------
  addEventListener('contextmenu', (e) => e.preventDefault(), true);

  // ---------- cursors ----------
  const CUR: Record<string, string> = Object.fromEntries(['default', 'move', 'attack', 'build', 'gather', 'interact'].map((k) => [k, cursor(k)]));
  const cursorFor = (): string => {
    if (m.tool || m.claimArmed) return 'build';
    if (sc.armed) return sc.armed === 'move' ? 'move' : sc.armed === 'attack' || sc.armed === 'attackMove' ? 'attack' : 'interact';
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
    // a button removed or hidden under the pointer never sends pointerleave
    if (tipAt && (!tipAt.isConnected || !tipAt.offsetParent) && !chain.isHeld()) { tipAt = null; hideTip(); }
    modes.refresh();
    trade.refresh();
    const st = s.sim.cur?.stock?.[myTeam()] ?? {}, sup = (s.sim.cur?.supplies?.[myTeam()] ?? {}) as Record<string, number>;
    counts.forEach((el) => { const r = el.dataset.r!, v = Math.floor(r.startsWith('p:') ? sup[r.slice(2)] ?? 0 : st[r as ResourceKind] ?? 0); el.textContent = String(v); el.classList.toggle('rf-dim', !v); });

    const sq = m.squad(), q = sq === null ? undefined : s.sim.squads.get(sq), own = sc.own();
    const b = m.selectedBuilding();
    if (b && (b.state !== 'destroyed' || b.ruin)) {
      card.style.display = '';
      $('cTag').style.display = 'none';
      const wpd = BUILDINGS[b.type].workplace, site = isSite(b), name = (wpd ? `${WP_NAME[wpd.kind]} L${wpd.level}` : nice(b.type)) + (site ? (b.upgradeFrom ? ' upgrade' : ' site') : '');
      const BAR_W = SEL_BLD;
      if (site) {
        const need = Object.entries(m.need(b)), planned = b.progress === 0 && b.delivered === 0 && b.workers === 0;
        const mats = need.map(([r, v]) => `${r} ${Math.floor(v! * b.delivered)}/${Math.ceil(v!)}`).join(' · ');
        setHead(BUILDING_ICON[b.type], name, `${Math.round(b.progress * 100)}% · ${b.workers}/${b.maxWorkers} at work`, bar('construction', b.progress, BAR_W),
          `${planned ? 'planned' : b.state}${mats ? ' · ' + mats : ''}`);
        setCard(false, siteSlots, SEL_BLD);
        sStop.disabled = !m.squadsAt(b).length;
        const refund = m.refund(b);
        sCancel.dataset.tip = tipK('Cancel site', `refunds ${Object.keys(refund).length ? costText(refund) : 'nothing'}`, '');
      } else {
        setHead(BUILDING_ICON[b.type], name + (b.ruin ? ' (ruin)' : ''), b.ruin ? 'ruin' : `${Math.ceil(b.hp)}/${b.maxHp}`, bar('hp', b.ruin ? 0 : b.hp / b.maxHp, BAR_W) + (b.burning ? bar('burn', 1, BAR_W) : ''),
          `${b.team === myTeam() ? 'yours' : b.team === NEUTRAL_TEAM ? 'neutral' : 'enemy'} · ${b.ruin ? 'ruined' : b.state}${b.burning ? ' · burning' : ''}${b.mend ? ' · under repair' : ''}`);
        const up = b.team === myTeam() && !b.ruin ? m.upgradeOf(b) : null, def = BUILDINGS[b.type], own = b.team === myTeam() && b.state === 'done';
        const iron = own && def.wall === 'gate', wet = own && !!def.burnable && !def.field;
        // M7g: repair (a hurt standing building), rebuild (a pre-built ruin)
        const hurt = !b.ruin && b.hp < b.maxHp - 1e-6 && b.state !== 'foundation' && b.state !== 'scaffold' && !def.brazier, ruin = !!b.ruin;
        setCard(false, [...(up ? [bUp] : []), ...(iron ? [bIron] : []), ...(wet ? [bWet] : []), ...(hurt ? [bRepair] : []), ...(ruin ? [bRebuild] : [])], SEL_BLD);
        if (hurt) {
          const r = repairBill(b), why = repairWhy(b, sq);
          bRepair.disabled = !!why;
          bRepair.dataset.tip = `<div class="rf-name" style="margin-bottom:4px">Repair</div><div style="display:flex;align-items:center">${costHtml(ceilBill(r.all))}</div><div class="rf-dim" style="margin-top:3px">${billText(r.step)} per 10% · labour ${labourText(r.labour)} · any squad, engineers x1.5</div>${why ? `<div class="rf-dim" style="margin-top:3px;color:#ff7a5c">${why}</div>` : ''}`;
        }
        if (ruin) {
          const r = rebuildBill(b), why = rebuildWhy(b);
          bRebuild.disabled = !!why;
          bRebuild.dataset.tip = `<div class="rf-name" style="margin-bottom:4px">Rebuild</div>${b.landmark ? '' : `<div style="display:flex;align-items:center">${costHtml(ceilBill(r.cost))}</div><div class="rf-dim" style="margin-top:3px">labour ${labourText(r.labour)} · ${sq === null ? 'planned: send a squad' : `squad #${sq} builds it`}</div>`}${why ? `<div class="rf-dim" style="margin-top:3px;color:#ff7a5c">${why}</div>` : ''}`;
        }
        const tiles = b.tiles.length / 2, stock = s.sim.cur?.stock?.[myTeam()] ?? {};
        if (iron) { bIron.dataset.tip = `<div class="rf-name" style="margin-bottom:4px">Iron-bind the gate</div><div style="display:flex;align-items:center">${costHtml(FORT.ironCost)}</div><div class="rf-dim" style="margin-top:3px">hp ×${FORT.iron}, once · Fortifier engineer's work, paid at once</div>`; bIron.disabled = (stock.iron ?? 0) < FORT.ironCost.iron || (stock.charcoal ?? 0) < FORT.ironCost.charcoal; }
        if (wet) { bWet.dataset.tip = `<div class="rf-name" style="margin-bottom:4px">Wet hides</div><div style="display:flex;align-items:center">${costHtml({ hides: FORT.wetCost * tiles })}</div><div class="rf-dim" style="margin-top:3px">catches fire at ×${FORT.wet} the chance for ${FORT.wetTicks / 600} min</div>`; bWet.disabled = (stock.hides ?? 0) < FORT.wetCost * tiles; }
        if (up) bUp.dataset.tip = `<div class="rf-name" style="margin-bottom:4px">Upgrade to ${nice(up.to)}</div><div style="display:flex;align-items:center">${costHtml(up.cost)}</div><div class="rf-dim" style="margin-top:3px">labour ${labourText(up.labour)} · ${sq === null ? 'planned: send a squad' : `squad #${sq} builds it`}</div>`;
      }
    } else if (q && own.length) {
      card.style.display = '';
      // W-53: the selected men, named by their class (several classes: mixed; the icon is the class most are)
      const men = s.sel.men(), byCls = new Map<string, number>();
      for (const d of men) byCls.set(d.u.cls, (byCls.get(d.u.cls) ?? 0) + 1);
      const cls = [...byCls].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const hp = men.reduce((a, d) => a + d.u.hp, 0), max = men.reduce((a, d) => a + d.u.maxHp, 0) || 1;
      const engines = own.map((x) => sc.engineOf(x)), e = engines.find((x) => x);
      const civ = allCivilians(s, [...s.selected]);
      // M6d combat tag: the longest left among the selected men (they hit or were hit), no safe court until it runs out
      const tag = men.reduce((a, d) => Math.max(a, d.u.tag ?? 0), 0);
      $('cTag').style.display = tag ? '' : 'none';
      if (tag) $('cTag').textContent = `⚔ tagged ${Math.ceil(tag / 10)} s`;
      setHead(UNIT_ICON[cls] ?? 'unit-militia', byCls.size > 1 ? 'Mixed' : CLASS_NAME[cls] ?? civName(cls) ?? nice(cls), `${men.length} ${men.length === 1 ? 'man' : 'men'}${byCls.size > 1 ? `, ${byCls.size} classes` : ''}`, bar('hp', hp / max, SEL_SQUAD),
        civ ? civInfo(s, own[0]) : e ? `crews ${SIEGE_NAME[e.type]} · ${e.state}${e.burning ? ' · burning' : ''}` : `${q.order}${q.fed ? ' · fed' : ''}${sc.status ? ' · ' + sc.status : ''}`);
      const slots: HTMLElement[] = [];
      const act = activesOf(s, own)[0];
      if (act) {
        const { q: aq, a } = act, ui = ACTIVE_UI[a.skill];
        if (a.ready > (cdMax.get(aq) ?? 0) || !a.ready) cdMax.set(aq, a.ready);
        const ic = ui?.icon ?? 'act-hold';
        if (gActive.dataset.ic !== ic) { gActive.dataset.ic = ic; gActive.querySelector('.ic')!.outerHTML = icon(ic); }
        const left = a.on ? 0 : a.ready, full = cdMax.get(aq) || 1;
        gActive.style.setProperty('--cd', `${Math.round((left / full) * 100)}%`);
        gActive.querySelector<HTMLElement>('.cdn')!.textContent = left ? String(Math.ceil(left / 10)) : '';
        gActive.classList.toggle('buff', a.on > 0);
        gActive.classList.toggle('cool', left > 0);
        if (tipAt === gActive && tip.style.display !== 'none') showTip(gActive, activeTip(a));
        slots.push(gActive);
      }
      if (engines.some((x) => x?.type === 'stoneThrower')) slots.push(gDeploy);
      if (e) slots.push(gLetGo);
      slots.push(...trade.slots(own));
      setCard(true, slots, SEL_SQUAD, civ ? civOrders : orders);
      cvHold.classList.toggle('on', q.order === 'hold');
      cvMove.classList.toggle('on', sc.armed === 'move');
      cvWork.classList.toggle('on', q.order === 'civWork');
      cvGather.classList.toggle('on', q.order === 'gather');
      cvBuild.classList.toggle('on', q.order === 'build');
      sqHold.classList.toggle('on', q.order === 'hold');
      shapes.forEach((x, i) => x.classList.toggle('on', lastShape === SHAPES[i]));
      sqMove.classList.toggle('on', sc.armed === 'move');
      sqAtk.classList.toggle('on', sc.armed === 'attack');
      sqAtkMove.classList.toggle('on', sc.armed === 'attackMove');
      gDeploy.classList.toggle('on', engines.some((x) => x?.type === 'stoneThrower' && (x.state === 'deployed' || x.state === 'deploying')));
    } else {
      card.style.display = 'none';
    }

    // build bar
    build.style.display = m.active ? '' : 'none';
    hBtn.classList.toggle('on', m.active);
    // the bar sits above the card when both show
    build.style.bottom = card.style.display === 'none' ? '4px' : `${card.offsetHeight + 8}px`;
    groups.refresh(card.style.display === 'none' ? 4 : card.offsetHeight + 8, !m.active);
    if (m.active) held = C.engineerNodes();
    for (const [x, d] of toolBtns) {
      x.classList.toggle('on', JSON.stringify(d.tool) === JSON.stringify(m.tool));
      x.disabled = !!nodeWhy(d);
    }
    bWall.style.display = m.tool?.kind === 'wall' ? 'flex' : 'none';
    const status = m.claimArmed ? 'click the map to claim (influence r 20)' : m.tool ? m.status || 'R rotate · Esc cancel · shift keeps the tool' : '';
    bStatus.textContent = status;
    bStatus.style.display = status ? '' : 'none';
  };
  setInterval(refresh, 200);
  s.input.keyboard!.on('keydown', () => queueMicrotask(refresh));
  refresh();
}
