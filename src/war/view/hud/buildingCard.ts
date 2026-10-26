/**
 * M7g building card (docs/WAR.md "Pre-built structures"; src/war/sim/prebuilt.ts, economy.ts REPAIR and RUIN): the
 * card at the bottom centre (over the command card) for the selected building, else a pre-built piece under the
 * pointer. It names the piece, what it does, its owner, its hp and state (intact, damaged, ruined, a fouled well, under repair, burning), what
 * mending it costs (every REPAIR.step of hp REPAIR.cost of its build cost and REPAIR.labour of its labour) and, for a ruin,
 * what rebuilding it costs (RUIN.rebuild of both; a landmark piece only by the landmark's restore). A landmark piece adds
 * the landmark's restore bill and the engineer who leads it (src/data/warLandmarks.ts). The orders sit on the command
 * card (./hud.ts: repair, rebuild) and the E menu (../interact.ts).
 */
import type { BuildingSnap, BuildingType, ResourceKind } from '../../types';
import { BUILD_TEXT } from './codex';
import type { SandboxScene } from '../SandboxScene';
import { BUILDINGS, NEUTRAL_TEAM, REPAIR, RUIN } from '../../sim/economy';
import { MOB_TEAM } from '../../sim/mobs';
import { PREBUILT, WELL } from '../../sim/prebuilt';
import { ALLIANCES } from '../../world/alliances';
import { landmarkOfRegion, type Landmark } from '../../../data/warLandmarks';
import { labourText } from '../build/buildMode';
import { bar } from './kit';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
type Bill = Partial<Record<ResourceKind, number>>;

/** What each pre-built type does for its owner (WAR.md "Pre-built structures", function). */
export const PRE_FUNCTION: Record<string, string> = {
  house: `population: +${PREBUILT.house!.pop} recruits an hour and +${PREBUILT.house!.cap} cap to the town's pool`,
  cottage: `population: +${PREBUILT.cottage!.pop} recruits an hour, +${PREBUILT.cottage!.cap} cap`,
  tent: `population: +${PREBUILT.tent!.pop} recruits an hour, +${PREBUILT.tent!.cap} cap`,
  temple: `blessing: a squad 30 s in its precinct is blessed 15 min (wounded share +0.05, heal x1.15); favour +${PREBUILT.temple!.favour} score an hour`,
  shrine: `blessing within ${PREBUILT.shrine!.bless} tiles; favour +${PREBUILT.shrine!.favour} score an hour`,
  stoa: 'covered market hall: 2 stall sites under its roof and a store of its owner\'s network',
  statue: `prestige +${PREBUILT.statue!.prestige} score an hour; a retired soldier's honour engraved on it`,
  well: `water: own squads resting within ${WELL.rest} tiles pay upkeep x${WELL.upkeep}; fires near beaten out x${WELL.douse} faster; a foe beside it 30 s fouls it 30 min`,
  jetty: 'fishing: a food node (40, regrows 0.2/s); a landing site',
  warehouse: 'rented warehouse (20 loads) in a trade town; elsewhere a store',
  board: 'the price board: razed, the town shows no prices until rebuilt',
  cache: '2 loads of the region\'s goods, lootable by anyone; gone once empty',
  stall: 'a rented site in a trade court', stall2: 'a rented site in a trade court', stall3: 'a rented site in a trade court',
  workshop: 'the town\'s working quarter: engines, carts and tools', forge: 'the town\'s working quarter: arms and armour',
  storehouse: 'a store of its owner\'s network', cookhouse: 'the town\'s working quarter: dishes and rations',
  olivePress: 'presses olives into oil', farm: 'a food field',
  stoneTower: 'platform for 9 men, a door', woodTower: 'platform for 6 men over the road',
  stoneWall: 'walkway wall', stoneGate: 'opens for its owner (neutral: open; bandit-held: shut)',
};
const ALLIANCE_SIDE = (team: number) => (team === 0 ? 'yours' : ALLIANCES[team]?.name ?? `team ${team}`);
export const nice = (t: string) => t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
export const billText = (c: Bill) => Object.entries(c).filter(([, v]) => (v ?? 0) > 0).map(([r, v]) => `${Math.ceil(v!)} ${r.replace(/[A-Z]/g, (x) => ' ' + x.toLowerCase())}`).join(', ') || 'nothing';

/** Owner of a piece as words: yours, an alliance, neutral, its guardian or the bandit host. */
export function ownerText(b: BuildingSnap): string {
  if (b.team === NEUTRAL_TEAM) return 'neutral (nobody uses it)';
  if (b.team === MOB_TEAM) return b.landmark ? 'its guardian' : 'the bandit host';
  return ALLIANCE_SIDE(b.team);
}

/** Its state as words: ruined, burning, fouled, under repair, damaged (under half), worn or intact. */
export function stateText(b: BuildingSnap): string {
  if (b.ruin) return 'ruined: rubble, no function';
  const out: string[] = [];
  const share = b.hp / Math.max(1, b.maxHp);
  out.push(share >= 0.999 ? 'intact' : b.state === 'damaged' ? `damaged (${Math.round(share * 100)}%)` : `worn (${Math.round(share * 100)}%)`);
  if (b.burning) out.push('burning');
  if (b.fouled) out.push('fouled: no water for 30 min');
  if (b.mend) out.push('under repair');
  return out.join(' · ');
}

const scaled = (b: BuildingSnap, k: number): Bill => {
  const d = BUILDINGS[b.type], n = d.perTile ? b.tiles.length / 2 : 1, out: Bill = {};
  for (const [r, v] of Object.entries(d.cost) as [ResourceKind, number][]) out[r] = v * n * k;
  return out;
};
const labourOf = (b: BuildingSnap) => BUILDINGS[b.type].labour * (BUILDINGS[b.type].perTile ? b.tiles.length / 2 : 1);

/** Mending b to full: steps of REPAIR.step hp, each REPAIR.cost of its cost and REPAIR.labour of its labour. */
export function repairBill(b: BuildingSnap): { steps: number; step: Bill; all: Bill; labour: number } {
  const steps = b.ruin ? 0 : Math.max(0, Math.ceil((1 - b.hp / Math.max(1, b.maxHp)) / REPAIR.step - 1e-6));
  const step = scaled(b, REPAIR.cost), all: Bill = {};
  for (const [r, v] of Object.entries(step) as [ResourceKind, number][]) all[r] = v * steps;
  return { steps, step, all, labour: labourOf(b) * REPAIR.labour * steps };
}
/** Rebuilding ruin b: RUIN.rebuild of its cost and labour. */
export const rebuildBill = (b: BuildingSnap) => ({ cost: scaled(b, RUIN.rebuild), labour: labourOf(b) * RUIN.rebuild });

/** Why the own team cannot repair b now (undefined: it can). */
export function repairWhy(b: BuildingSnap, squad: number | null): string | undefined {
  if (b.ruin) return 'a ruin: rebuild it';
  if (b.team !== 0) return 'not yours';
  if (b.hp >= b.maxHp - 1e-6) return 'at full hp';
  if (b.mend) return 'already under repair';
  if (squad === null) return 'select a squad first';
  return undefined;
}
/** Why the own team cannot rebuild ruin b now. */
export function rebuildWhy(b: BuildingSnap): string | undefined {
  if (!b.ruin) return 'not a ruin';
  if (b.landmark) return 'a landmark piece: restore the landmark';
  if (b.team !== 0) return 'only the owner of its ground rebuilds it';
  return undefined;
}

/** The landmark restore lead: an engineer of its level with Fortifier and Master Builder (level 10: Poliorcetes or Archimedes too). */
export const leadText = (lm: Landmark) => lm.engineer === 10
  ? 'an engineer of level 10 with Fortifier, Master Builder and Poliorcetes or Archimedes'
  : 'an engineer of level 8 with Fortifier and Master Builder';

/** The card's html for building b in region `region`. */
export function buildingHtml(b: BuildingSnap, region: string): string {
  const text = BUILD_TEXT[b.type.replace(/\d$/, '') as BuildingType];
  const fn = PRE_FUNCTION[b.type] ?? (text ? `${text.for.charAt(0).toUpperCase()}${text.for.slice(1)}` : '');
  const share = b.ruin ? 0 : b.hp / Math.max(1, b.maxHp);
  const lm = b.landmark ? landmarkOfRegion(region) : undefined;
  const name = b.landmark && b.art ? nice(b.art.replace(/-/g, ' ')) : nice(b.type);
  const rows: string[] = [];
  rows.push(`<span>Owner</span><span>${ownerText(b)}</span>`);
  rows.push(`<span>State</span><span>${stateText(b)}</span>`);
  if (!b.ruin && b.hp < b.maxHp - 1e-6) {
    const r = repairBill(b);
    rows.push(`<span>Repair</span><span>${billText(r.step)} <span class="rf-dim">per ${Math.round(REPAIR.step * 100)}%</span><br>${billText(r.all)} <span class="rf-dim">to full (${r.steps} steps), labour ${labourText(r.labour)}</span></span>`);
  }
  if (b.ruin) {
    if (b.landmark) rows.push('<span>Rebuild</span><span class="rf-dim">restore only (the landmark\'s rule)</span>');
    else {
      const r = rebuildBill(b);
      rows.push(`<span>Rebuild</span><span>${billText(r.cost)} <span class="rf-dim">labour ${labourText(r.labour)} · ${Math.round(RUIN.rebuild * 100)}% of new</span></span>`);
    }
  }
  if (lm) rows.push(`<span>Restore</span><span>${billText(lm.restore.bulk)} + ${billText(lm.restore.rare)}<br><span class="rf-dim">${lm.name}: led by ${leadText(lm)}</span></span>`);
  return `<div class="rf-head"><span class="rf-name">${name}</span><span class="rf-dim" style="margin-left:auto">${b.pre ? (b.landmark ? 'landmark' : 'pre-built') : ''}</span></div>
${text?.flavour ? `<div class="cx-flav" style="margin:4px 0 0">${text.flavour}</div>` : ''}${fn ? `<div style="margin-top:3px">${fn}</div>` : ''}
<div style="display:flex;align-items:center;gap:6px;margin-top:5px">${bar(b.burning ? 'burn' : 'hp', share, 150)}<span class="rf-num rf-dim">${b.ruin ? 'ruin' : `${Math.ceil(b.hp)}/${b.maxHp}`}</span></div>
<div class="bc-kv">${rows.join('')}</div>`;
}

const CSS = `
#rfBld{width:300px;padding:6px 9px 8px;font-size:11.5px;line-height:1.35;pointer-events:none}
#rfBld .bc-kv{display:grid;grid-template-columns:52px 1fr;gap:2px 6px;margin-top:5px}
#rfBld .bc-kv>:nth-child(odd){color:var(--rf-muted)}
`;

/** Mount the card; it follows the selected building (a ruin too), else the pre-built piece under the pointer, at 5 Hz. */
export function mountBuildingCard(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  // bottom centre, over the command card (the landmark panel holds the right edge)
  const el = mk('rfBld', 'left:50%;bottom:4px;transform:translateX(-50%);display:none');
  el.className = 'rf rf-card';
  let shown = '';
  setInterval(() => {
    const sel = s.build.selectedBuilding();
    const hov = sel ? undefined : s.build.pieceAt(s.pointerTile);
    const b = sel && (sel.pre || sel.state !== 'destroyed') ? sel : hov?.pre ? hov : undefined;
    if (!b || s.build.active) { if (shown) { el.style.display = 'none'; shown = ''; } return; }
    const html = buildingHtml(b, s.region.id);
    if (html !== shown) el.innerHTML = shown = html;
    const cc = document.getElementById('rfCard');
    el.style.bottom = cc && cc.style.display !== 'none' ? `${cc.offsetHeight + 8}px` : '4px';
    el.style.display = '';
  }, 200);
}
