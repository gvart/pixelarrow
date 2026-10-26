/**
 * M7g building texts (docs/WAR.md "Pre-built structures"; src/war/sim/prebuilt.ts, economy.ts REPAIR and RUIN) for the
 * one building panel on the command card (./hud.ts): its purpose in a line, its status in plain words, and the long
 * CK3-style card behind them (role, flavour, what it is for, owner, state, what mending, rebuilding or restoring costs:
 * every REPAIR.step of hp REPAIR.cost of its build cost and REPAIR.labour of its labour; a ruin RUIN.rebuild of both; a
 * landmark piece only by the landmark's restore, led by its engineer). An unselected pre-built piece under the pointer
 * shows the same card at the cursor. The orders sit on the command card and the E menu (../interact.ts).
 */
import type { BuildingSnap, BuildingType, ResourceKind } from '../../types';
import { BUILD_LINE, BUILD_TEXT, buildingFacts, card } from './codex';
import type { SandboxScene } from '../SandboxScene';
import { BUILDINGS, NEUTRAL_TEAM, REPAIR, RUIN } from '../../sim/economy';
import { MOB_TEAM } from '../../sim/mobs';
import { PREBUILT, WELL } from '../../sim/prebuilt';
import { ALLIANCES } from '../../world/alliances';
import { landmarkOfRegion, type Landmark } from '../../../data/warLandmarks';
import { labourText } from '../build/buildMode';
import { BUILDING_ICON, icon } from './kit';
import { nameOf } from './craft/state';
import { myTeam } from '../side';

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
const ALLIANCE_SIDE = (team: number) => (team === myTeam() ? 'yours' : ALLIANCES[team]?.name ?? `team ${team}`);
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
  if (b.team !== myTeam()) return 'not yours';
  if (b.hp >= b.maxHp - 1e-6) return 'at full hp';
  if (b.mend) return 'already under repair';
  if (squad === null) return 'select a squad first';
  return undefined;
}
/** Why the own team cannot rebuild ruin b now. */
export function rebuildWhy(b: BuildingSnap): string | undefined {
  if (!b.ruin) return 'not a ruin';
  if (b.landmark) return 'a landmark piece: restore the landmark';
  if (b.team !== myTeam()) return 'only the owner of its ground rebuilds it';
  return undefined;
}

/** The landmark restore lead: an engineer of its level with Fortifier and Master Builder (level 10: Poliorcetes or Archimedes too). */
export const leadText = (lm: Landmark) => lm.engineer === 10
  ? 'an engineer of level 10 with Fortifier, Master Builder and Poliorcetes or Archimedes'
  : 'an engineer of level 8 with Fortifier and Master Builder';

/** The level of a building type: forge2 -> 2 (1 when it has none). */
export const levelOf = (t: BuildingType) => BUILDINGS[t]?.workplace?.level ?? (/\d$/.test(t) ? Number(t.slice(-1)) : 1);
/** A building's name without its level: forge2 -> Forge, a landmark piece by its art. */
export const nameOfBuilding = (b: BuildingSnap) => (b.landmark && b.art ? nice(b.art.replace(/-/g, ' ')) : nice(b.type.replace(/\d$/, '')));

/** Its purpose in one line (BUILD_LINE, else the pre-built function, else its description without the term marks). */
export function purposeOf(b: BuildingSnap): string {
  const base = b.type.replace(/\d$/, '') as BuildingType;
  const p = BUILD_LINE[base] ?? PRE_FUNCTION[b.type] ?? BUILD_TEXT[base]?.for.replace(/<[^>]+>/g, '') ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export interface Status { tone: 'good' | 'bad' | 'gold' | 'dim'; text: string }
/** What it is doing now, in plain words: burning, ruined, being mended, damaged, a workplace's work, or standing. */
export function statusOf(b: BuildingSnap): Status {
  if (b.burning) return { tone: 'bad', text: 'On fire: send men to beat it out (E on it)' };
  if (b.ruin) return { tone: 'bad', text: 'Ruined: does nothing until rebuilt' };
  if (b.fouled) return { tone: 'bad', text: 'Fouled: no water for 30 min' };
  if (b.mend) return { tone: 'gold', text: 'Being repaired' };
  const share = b.hp / Math.max(1, b.maxHp);
  if (b.state === 'damaged') return { tone: 'bad', text: `Damaged (${Math.round(share * 100)}%): repair it` };
  const wp = BUILDINGS[b.type]?.workplace;
  if (wp && b.team === myTeam()) {
    const q = b.queue ?? [], on = q.find((o) => o.by >= 0);
    if (on) return { tone: 'good', text: `Working: ${on.kind === 'craft' ? '' : on.kind + ' '}${nameOf(on.recipe).toLowerCase()} ${Math.round(on.progress * 100)}%${q.length > 1 ? ` · ${q.length - 1} waiting` : ''}` };
    if (q.length) return { tone: 'gold', text: `${q.length} queued, nobody at work: send a crafter` };
    return { tone: 'dim', text: 'Idle: nothing queued' };
  }
  if (share < 0.999) return { tone: 'gold', text: `Worn (${Math.round(share * 100)}%)` };
  if (BUILDINGS[b.type]?.store && b.team === myTeam()) return { tone: 'good', text: 'Standing · stores your goods' };
  return { tone: b.team === myTeam() ? 'good' : 'dim', text: b.team === myTeam() ? 'Standing' : ownerText(b).replace(/^./, (c) => c.toUpperCase()) };
}

/** The long description (the CK3 card): role, flavour, what it is for, its facts, owner and state, repair, rebuild, restore. */
export function buildingTip(b: BuildingSnap, region: string): string {
  const base = b.type.replace(/\d$/, '') as BuildingType, text = BUILD_TEXT[base], fn = PRE_FUNCTION[b.type];
  const lm = b.landmark ? landmarkOfRegion(region) : undefined;
  const rows: string[] = [`<span>Owner</span><span>${ownerText(b)}</span>`, `<span>State</span><span>${stateText(b)}</span>`];
  if (!b.ruin && b.hp < b.maxHp - 1e-6) {
    const r = repairBill(b);
    rows.push(`<span>Repair</span><span>${billText(r.step)} per ${Math.round(REPAIR.step * 100)}%; ${billText(r.all)} to full, labour ${labourText(r.labour)}</span>`);
  }
  if (b.ruin) {
    const r = rebuildBill(b);
    rows.push(`<span>Rebuild</span><span>${b.landmark ? 'restore only (the landmark\'s rule)' : `${billText(r.cost)}, labour ${labourText(r.labour)} · ${Math.round(RUIN.rebuild * 100)}% of new`}</span>`);
  }
  if (lm) rows.push(`<span>Restore</span><span>${billText(lm.restore.bulk)} + ${billText(lm.restore.rare)}; led by ${leadText(lm)}</span>`);
  const lv = levelOf(b.type);
  return card({
    icon: icon(BUILDING_ICON[b.type] ?? 'bld-storehouse', 32), rawIcon: true, name: nameOfBuilding(b) + (lv > 1 ? ` ${'I'.repeat(lv)}` : ''),
    kind: [text?.role, b.pre ? (b.landmark ? 'landmark' : 'pre-built') : ''].filter(Boolean).join(' · ') || undefined, flavour: text?.flavour, w: 270,
    fx: [...(text ? [`<div><span class="cx-tag">For</span>${text.for}</div>`] : fn ? [`<div>${fn}</div>`] : []), ...(BUILDINGS[b.type] ? buildingFacts(b.type) : [])],
    more: `<div class="cx-tab">${rows.join('')}</div>`,
  });
}

/**
 * Mount the hover card of an unselected pre-built piece (its codex card at the cursor). A selected building shows on the
 * command card (./hud.ts): one panel. Pieces that hold goods leave the hover to the holder card (./holder.ts).
 */
export function mountBuildingCard(s: SandboxScene, mk: Mk): void {
  const el = mk('rfBld', 'display:none;z-index:6;pointer-events:none');
  el.className = 'rf rf-tip';
  let shown = '';
  s.events.on('postupdate', () => {
    const p = s.input.activePointer;
    const hov = s.build.selectedBuilding() || s.build.active || !s.input.isOver || s.interact.open ? undefined : s.build.pieceAt(s.pointerTile);
    const b = hov?.pre && hov.goods === undefined ? hov : undefined;
    if (!b) { if (shown) { el.style.display = 'none'; shown = ''; } return; }
    const st = statusOf(b), html = buildingTip(b, s.region.id) + `<div class="cx-state ${st.tone}"><span>${st.text}</span></div>`;
    if (html !== shown) el.innerHTML = shown = html;
    el.style.display = '';
    const r = s.game.canvas.getBoundingClientRect(), z = Number(el.style.zoom) || 1, t = el.getBoundingClientRect();
    el.style.left = `${Math.round(Math.max(4, Math.min(r.left + p.x + 18, innerWidth - t.width - 4)) / z)}px`;
    el.style.top = `${Math.round(Math.max(4, Math.min(r.top + p.y + 22, innerHeight - t.height - 4)) / z)}px`;
  });
}
