/**
 * The roster panel (M5g, R): the player's soldiers grouped by squad in the field, reserve, wounded, captive and fallen;
 * per row the class icon, name, level, HP or state, the XP bar, honour pips and a level-up mark; filter tabs and a sort.
 * Pure HTML from the rows; ./index.ts mounts it and routes the clicks (data-pid, data-filter, data-sort, data-act).
 */
import { xpToNext } from '../../../../data/units';
import { icon, snapW, UNIT_ICON } from '../kit';
import { rankOf } from './markers';
import { SandboxRoster, type Row, type Where } from './state';
import { esc } from './ui';

export type Filter = 'all' | 'field' | 'reserve' | 'hurt';
export type Sort = 'level' | 'name' | 'class' | 'hp';
export const FILTERS: [Filter, string][] = [['all', 'All'], ['field', 'Field'], ['reserve', 'Reserve'], ['hurt', 'Hurt']];
export const SORTS: Sort[] = ['level', 'name', 'class', 'hp'];
export const PANEL_W = snapW(232);

const GROUP: Record<Exclude<Where, 'field'>, string> = { reserve: 'Reserve', wounded: 'Wounded', captive: 'Captive', dead: 'Fallen' };
const ORDER: Where[] = ['field', 'reserve', 'wounded', 'captive', 'dead'];
const hpOf = (r: Row) => (r.unit ? r.unit.hp / Math.max(1, r.unit.maxHp) : r.where === 'reserve' ? 1 : 0);
const CMP: Record<Sort, (a: Row, b: Row) => number> = {
  level: (a, b) => b.p.hero.level - a.p.hero.level || b.p.hero.xp - a.p.hero.xp,
  name: (a, b) => a.p.hero.name.localeCompare(b.p.hero.name),
  class: (a, b) => (a.p.hero.cls ?? '').localeCompare(b.p.hero.cls ?? '') || b.p.hero.level - a.p.hero.level,
  hp: (a, b) => hpOf(a) - hpOf(b),
};

function stateCell(r: Row, captor: number | undefined): string {
  if (r.where === 'field' && r.unit) {
    const v = hpOf(r), w = 34;
    return `<div class="rf-bar" style="width:${w}px" data-tip="HP ${Math.ceil(r.unit.hp)}/${r.unit.maxHp}"><i class="hp" style="width:${Math.round((w - 2) * v)}px"></i></div>`;
  }
  if (r.where === 'reserve') return '<span class="rr-chip" data-tip="fit, not in the field">fit</span>';
  if (r.where === 'wounded') return `<span class="rr-chip bad" data-tip="wounded: heals in camp (M5e timers)">wounded</span>`;
  if (r.where === 'captive') return `<span class="rr-chip bad" data-tip="held by team ${captor ?? '?'}: ransom ${30 * r.p.hero.level} silver">captive</span>`;
  return '<span class="rr-chip" style="color:#7d6a5a">fallen</span>';
}

function row(r: Row, sel: string | null, pending: boolean, captor: number | undefined): string {
  const h = r.p.hero, need = xpToNext(h.level), rank = rankOf(h.cls, h.level);
  const pips = (r.p.honours ?? []).slice(0, 3).map((x) => `<span class="rr-pip gold" data-tip="${esc(x.name)}"></span>`).join('');
  const crest = rank === 'elite' ? '<span class="rr-pip gold" data-tip="elite"></span><span class="rr-pip gold" data-tip="elite"></span>' : rank === 'veteran' ? '<span class="rr-pip" data-tip="veteran"></span>' : '';
  const dim = r.where === 'dead' ? 'opacity:.45;' : '';
  return `<div class="rr-row${sel === r.p.id ? ' on' : ''}" data-pid="${r.p.id}" style="${dim}">
    <div style="width:24px;height:24px;flex:none">${icon(UNIT_ICON[h.cls ?? ''] ?? 'unit-militia')}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:3px"><span style="font:700 12px/1 'Cormorant SC',serif;color:#f2b27a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.name)}</span>${crest}</div>
      <div class="rr-xp" data-tip="XP ${h.xp}/${need}"><i style="width:${Math.round(100 * Math.min(1, h.xp / need))}%"></i></div>
    </div>
    ${pending ? '<span class="rr-chip up" data-tip="level-up: a choice waits">▲</span>' : ''}
    <span class="rf-num" style="width:20px;text-align:right;color:#f0d9b5" data-tip="level ${h.level}">L${h.level}</span>
    <div style="width:44px;display:flex;justify-content:flex-end">${stateCell(r, captor)}</div>
    <div style="width:17px;display:flex;justify-content:flex-end">${pips}</div>
  </div>`;
}

/** listH: the list's height in art px (the panel stops above the minimap). */
export function panelHtml(R: SandboxRoster, filter: Filter, sort: Sort, sel: string | null, listH = 380): string {
  const rows = R.rows().filter((r) => filter === 'all' || (filter === 'field' ? r.where === 'field' : filter === 'reserve' ? r.where === 'reserve' : r.where === 'wounded' || r.where === 'captive' || r.where === 'dead'));
  const groups = new Map<string, Row[]>();
  const bySquad = (a: Row, b: Row) => (a.squad ?? 0) - (b.squad ?? 0);
  for (const w of ORDER)
    for (const r of rows.filter((x) => x.where === w).sort((a, b) => bySquad(a, b) || CMP[sort](a, b))) {
      const k = w === 'field' ? `Squad #${r.squad} · ${SandboxRoster.className(r.p.hero.cls)}` : GROUP[w];
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
  const all = R.rows(), fit = all.filter((r) => r.where === 'field' || r.where === 'reserve').length;
  const body = [...groups].map(([k, rs]) => `<div class="rf-cap" style="margin:5px 0 1px 3px">${esc(k)} <span class="rf-dim">${rs.length}</span></div>${rs.map((r) => row(r, sel, R.offers(r.p.id).length > 0, R.captorOf(r.p.id))).join('')}`).join('');
  return `<div class="rf-card" style="padding:4px 4px 5px">
    <div style="display:flex;align-items:center;gap:4px;padding:0 2px">
      <span class="rf-name">Roster</span><span class="rf-dim rf-num" data-tip="fit / all soldiers">${fit}/${all.length}</span>
      <span style="flex:1"></span>
      <button class="rf-tbtn" data-sort="1" data-tip="sort by: level, name, class, HP">${sort}</button>
      <button class="rf-tbtn" data-act="close" data-tip="close (R)">✕</button>
    </div>
    <div style="display:flex;align-items:flex-end;height:17px;margin:3px 0 0 2px">${FILTERS.map(([f, n]) => `<button class="rf-tab${f === filter ? ' on' : ''}" data-filter="${f}">${n}</button>`).join('')}</div>
    <div style="border-top:1px solid #7a3418;max-height:${listH}px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#7a3418 #140c08">${body || '<div class="rf-dim" style="padding:8px 4px">nobody here</div>'}</div>
    <div style="display:flex;gap:3px;margin-top:4px;padding:0 2px">
      <button class="rf-tbtn" data-act="xpAll" data-tip="dev: one level of XP to every fit soldier">dev +XP all</button>
      <button class="rf-tbtn" data-act="endFight" data-tip="end the fight now: XP, wounds and captives are written back (auto 5 s after the last blow)">End fight</button>
    </div>
  </div>`;
}
