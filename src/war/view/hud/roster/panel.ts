/**
 * The roster panel (M5g, R; W-55): the player's soldiers grouped by squad in the field, reserve, wounded, captive and
 * fallen. A row: class icon, name with his rank crest and a gold star when a level-up waits, the XP line under it, his
 * level as a disc, and his state as one mark: the HP bar in the field, a tent in reserve, a bleeding heart when wounded,
 * a lock when captive, a skull when fallen (each with its card). Filter tabs and a sort. Dev buttons show only while the
 * dev panel is open. Pure HTML from the rows; ./index.ts mounts it and routes the clicks (data-pid, data-filter,
 * data-sort, data-act).
 */
import { xpToNext } from '../../../../data/units';
import { snapW, UNIT_ICON } from '../kit';
import { rankOf } from './markers';
import { SandboxRoster, type Row, type Where } from './state';
import { esc } from './ui';
import { glyph } from '../glyph';
import { card, termCard } from '../codex';

export type Filter = 'all' | 'field' | 'reserve' | 'hurt';
export type Sort = 'level' | 'name' | 'class' | 'hp';
export const FILTERS: [Filter, string][] = [['all', 'All'], ['field', 'Field'], ['reserve', 'Reserve'], ['hurt', 'Hurt']];
export const SORTS: Sort[] = ['level', 'name', 'class', 'hp'];
const SORT_NAME: Record<Sort, string> = { level: 'Level', name: 'Name', class: 'Class', hp: 'Health' };
export const PANEL_W = snapW(236);

const GROUP: Record<Exclude<Where, 'field'>, [string, string]> = { reserve: ['Reserve', 'ui:tent'], wounded: ['Wounded', 'power:blood_price'], captive: ['Captive', 'ui:lock'], dead: ['Fallen', 'ui:skull'] };
const ORDER: Where[] = ['field', 'reserve', 'wounded', 'captive', 'dead'];
const hpOf = (r: Row) => (r.unit ? r.unit.hp / Math.max(1, r.unit.maxHp) : r.where === 'reserve' ? 1 : 0);
const CMP: Record<Sort, (a: Row, b: Row) => number> = {
  level: (a, b) => b.p.hero.level - a.p.hero.level || b.p.hero.xp - a.p.hero.xp,
  name: (a, b) => a.p.hero.name.localeCompare(b.p.hero.name),
  class: (a, b) => (a.p.hero.cls ?? '').localeCompare(b.p.hero.cls ?? '') || b.p.hero.level - a.p.hero.level,
  hp: (a, b) => hpOf(a) - hpOf(b),
};
const tip = (html: string) => `data-tip="${esc(html)}"`;

function stateCell(r: Row, captor: number | undefined): string {
  if (r.where === 'field' && r.unit) {
    const v = hpOf(r);
    return `<div class="rr-bar hp sm" ${tip(card({ icon: 'ui:heart', name: `Health ${Math.ceil(r.unit.hp)} / ${r.unit.maxHp}`, w: 180, kind: 'in the field' }))}><i style="width:${Math.round(100 * v)}%"></i></div>`;
  }
  if (r.where === 'reserve') return `<span class="rr-mark" ${tip(termCard('reserve'))}>${glyph('ui:tent', 18)}</span>`;
  if (r.where === 'wounded') return `<span class="rr-mark" ${tip(termCard('wounded'))}>${glyph('power:blood_price', 18)}</span>`;
  if (r.where === 'captive') return `<span class="rr-mark" ${tip(card({ icon: 'ui:lock', name: 'Captive', kind: `held by team ${captor ?? '?'}`, w: 200, more: `<div>Ransom ${30 * r.p.hero.level} silver, a raid on the fort, or he walks home after a day.</div>` }))}>${glyph('ui:lock', 17)}</span>`;
  return `<span class="rr-mark" ${tip(termCard('fallen'))}>${glyph('ui:skull', 17)}</span>`;
}

function row(r: Row, sel: string | null, pending: boolean, captor: number | undefined): string {
  const h = r.p.hero, need = xpToNext(h.level), rank = rankOf(h.cls, h.level);
  const crest = rank === 'elite' ? `<span ${tip(termCard('elite'))}>${glyph('ui:captain', 13)}</span>` : rank === 'veteran' ? `<span ${tip(card({ icon: 'ui:star', name: 'Veteran', w: 170, more: '<div>Level 3 or more.</div>' }))}>${glyph('ui:star', 11)}</span>` : '';
  const hon = (r.p.honours ?? []).length ? `<span ${tip(card({ icon: 'ui:laurel', name: 'Honours', w: 190, more: (r.p.honours ?? []).map((x) => `<div>${esc(x.name)}</div>`).join('') }))}>${glyph('ui:laurel', 13)}</span>` : '';
  const up = pending ? `<span class="rr-lvup" ${tip(card({ icon: 'ui:tgstar', name: 'Level up', w: 190, more: '<div>A choice waits: open his card, then his tree.</div>' }))}>${glyph('ui:tgstar', 15)}</span>` : '';
  return `<div class="rr-row${sel === r.p.id ? ' on' : ''}${r.where === 'dead' ? ' dead' : ''}" data-pid="${r.p.id}">
    <div style="width:24px;height:24px;flex:none"><img src="war/ui/icons/24/${UNIT_ICON[h.cls ?? ''] ?? 'unit-militia'}.png" srcset="war/ui/icons/24/${UNIT_ICON[h.cls ?? ''] ?? 'unit-militia'}@2x.png 2x" width="24" height="24" alt=""></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:3px"><span class="rr-nm">${esc(h.name)}</span>${crest}${hon}<span style="flex:1"></span>${up}</div>
      <div class="rr-xp" ${tip(card({ icon: 'ui:xp', name: `${h.xp} / ${need} XP`, kind: `to level ${h.level + 1}`, w: 170 }))}><i style="width:${Math.round(100 * Math.min(1, h.xp / need))}%"></i></div>
    </div>
    <span class="rr-lv sm" ${tip(card({ icon: 'ui:xp', name: `Level ${h.level}`, w: 150 }))}>${h.level}</span>
    <div class="rr-st">${stateCell(r, captor)}</div>
  </div>`;
}

/** listH: the list's height in art px (the panel stops above the minimap). */
export function panelHtml(R: SandboxRoster, filter: Filter, sort: Sort, sel: string | null, listH = 380, dev = false): string {
  const rows = R.rows().filter((r) => filter === 'all' || (filter === 'field' ? r.where === 'field' : filter === 'reserve' ? r.where === 'reserve' : r.where === 'wounded' || r.where === 'captive' || r.where === 'dead'));
  const groups = new Map<string, { icon: string; rs: Row[] }>();
  const bySquad = (a: Row, b: Row) => (a.squad ?? 0) - (b.squad ?? 0);
  for (const w of ORDER)
    for (const r of rows.filter((x) => x.where === w).sort((a, b) => bySquad(a, b) || CMP[sort](a, b))) {
      const k = w === 'field' ? `Squad #${r.squad} · ${SandboxRoster.className(r.p.hero.cls)}` : GROUP[w][0];
      const g = groups.get(k) ?? { icon: w === 'field' ? 'ui:banner' : GROUP[w][1], rs: [] };
      g.rs.push(r);
      groups.set(k, g);
    }
  const all = R.rows(), fit = all.filter((r) => r.where === 'field' || r.where === 'reserve').length;
  const body = [...groups].map(([k, g]) => `<div class="rf-cap rr-cap rr-grp">${glyph(g.icon, 13)}${esc(k)} <span class="rf-dim">${g.rs.length}</span></div>${g.rs.map((r) => row(r, sel, R.offers(r.p.id).length > 0, R.captorOf(r.p.id))).join('')}`).join('');
  return `<div class="rf-card" style="padding:4px 4px 5px">
    <div class="rf-head" style="padding:0 2px 4px">
      <span class="rf-name" style="font-size:16px">Roster</span><span class="rf-dim rf-num" ${tip(card({ icon: 'ui:people', name: `${fit} fit of ${all.length}`, w: 190, more: '<div>Fit: in the field or in reserve. The rest are wounded, captive or fallen.</div>' }))}>${fit} / ${all.length}</span>
      <span style="flex:1"></span>
      <button class="rf-tbtn" data-sort="1" data-tip="sort by: level, name, class, health (click to change)">${glyph('ui:scales', 13)} ${SORT_NAME[sort]}</button>
      <button class="rf-tbtn x" data-act="close" data-tip="close (R)">✕</button>
    </div>
    <div style="display:flex;align-items:flex-end;height:23px;margin:5px 0 0 2px">${FILTERS.map(([f, n]) => `<button class="rf-tab${f === filter ? ' on' : ''}" data-filter="${f}">${n}</button>`).join('')}</div>
    <div class="rr-list" style="max-height:${listH}px">${body || '<div class="rf-dim" style="padding:8px 4px">nobody here</div>'}</div>
    <div style="display:flex;gap:3px;margin-top:5px;padding:0 2px">
      ${dev ? '<button class="rf-tbtn" data-act="xpAll" data-tip="dev: one level of XP to every fit soldier">+XP all</button>' : ''}
      <span style="flex:1"></span>
      <button class="rf-tbtn" data-act="endFight" data-tip="${esc(card({ icon: 'ui:flag', name: 'End the fight', w: 220, more: '<div>Write the fight back now: XP, wounds and captives. It ends by itself a few seconds after the last blow.</div>' }))}">${glyph('ui:flag', 13)} End fight</button>
    </div>
  </div>`;
}
