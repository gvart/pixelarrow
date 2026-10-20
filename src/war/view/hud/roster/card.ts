/**
 * The soldier card (M5g, docs/WAR.md "UI touchpoints"): name, class, level and rank, the XP bar; a paper doll (portrait
 * between the gear slots, item icons with their stats on hover); the four attributes and the baked combat numbers;
 * the two skill slots; honours and traits; the record. A pending level-up shows its offers on top, each with the
 * numbers it changes (before -> after), one click takes it. Pure HTML; ./index.ts mounts it, fills the portrait
 * canvas (#rrPort) and routes data-act / data-offer clicks.
 */
import { ATTR_IDS } from '../../../../data/perks';
import { TRAITS, type TraitId } from '../../../../data/traits';
import { xpToNext } from '../../../../data/units';
import type { Slot } from '../../../../data/items';
import { warStatsOf } from '../../../sim/classes';
import { applyOffer, type LevelOffer } from '../../../sim/roster';
import { activeCooldown, SKILL_LEVELS } from '../../../sim/skills';
import { bar, snapW } from '../kit';
import { rankOf } from './markers';
import { SandboxRoster, type Row } from './state';
import { ATTR_NAME, ATTR_NOTE, esc, itemBadges, itemIcon, itemTip, KIND_NAME, SKILL_NAME, SKILL_NOTE, skillKind, statRows } from './ui';
import { isCivClass } from '../../../../data/classes';
import { pointsAt, profOf, PROF_NODES } from '../../../../data/professions';
import type { SandboxCraft } from '../craft/state';
import type { WarPerson } from '../../../types';

export const CARD_W = snapW(258);
const SLOT_LABEL: Record<Slot, string> = { weapon: 'weapon', armor: 'armour', helmet: 'helmet', shield: 'shield', trinket: 'trinket' };
const STATE: Record<Row['where'], string> = { field: 'in the field', reserve: 'in reserve', wounded: 'wounded', captive: 'captive', dead: 'fallen' };

function slot(p: WarPerson, s: Slot): string {
  const it = p.hero.equip[s];
  const tip = it ? itemTip(it, p.hero.attrs) : `<span class="rf-dim">no ${SLOT_LABEL[s]}</span>`;
  return `<div class="rr-slot"${it ? ` data-unequip="${s}" style="cursor:pointer"` : ''} data-tip="${esc(tip + (it ? '<div class="rf-dim" style="margin-top:3px">click: back to the stash</div>' : ''))}">${it ? itemIcon(it, 24) + itemBadges(it) : ''}<span class="rr-lab">${SLOT_LABEL[s]}</span></div>`;
}

/** The stash under the paper doll (M5h): items he may put on first (click), the rest dimmed with why not. */
function stashRow(C: SandboxCraft, p: WarPerson): string {
  const items = C.stash().filter((x) => !x.away);
  if (!items.length) return '<span class="rf-dim">the stash is empty: craft at a forge</span>';
  const rows = items.map((x) => ({ x, why: C.equipBlock(p, x.item) })).sort((a, b) => Number(!!a.why) - Number(!!b.why));
  return rows.map(({ x, why }) => `<div class="rr-slot" ${why ? 'style="opacity:.4"' : `data-equip="${esc(x.item.uid)}" style="cursor:pointer"`} data-tip="${esc(itemTip(x.item, p.hero.attrs) + `<div style="margin-top:3px;color:${why ? 'var(--rf-bad)' : 'var(--rf-good)'}">${why ?? 'click: put it on'}</div>`)}">${itemIcon(x.item, 24)}${itemBadges(x.item)}</div>`).join('');
}

/** A civilian's trade instead of skills (M5h): nodes taken, points left, the tree button. */
function trade(p: WarPerson): string {
  const prof = profOf(p.hero.cls ?? ''), perks = p.hero.perks as unknown as string[];
  if (!prof) return '';
  const taken = perks.filter((n) => PROF_NODES[n]?.prof === prof && !PROF_NODES[n].capstone).length, left = Math.max(0, pointsAt(p.hero.level) - taken);
  const chips = perks.filter((n) => PROF_NODES[n]?.prof === prof).map((n) => `<span class="rr-chip" data-tip="${esc(PROF_NODES[n].desc)}">${PROF_NODES[n].name}</span>`).join(' ');
  return `<div class="rf-cap" style="margin-top:6px">Profession${left ? ` <span style="color:#e0b867">+${left} point${left > 1 ? 's' : ''}</span>` : ''}</div>
    <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">${chips || '<span class="rf-dim">root node only</span>'}<span style="flex:1"></span><button class="rf-tbtn" data-act="tree" data-tip="the profession tree: nodes by level, what each unlocks">Tree</button></div>`;
}

/** Before -> after of one offer: the baked numbers it moves, else what it does. */
export function offerPreview(p: WarPerson, o: LevelOffer): string {
  const after = applyOffer(p, o), a = statRows(warStatsOf(p)), b = statRows(warStatsOf(after));
  const moved = a.flatMap(([l, t, v], i) => (b[i] && b[i][2] !== v ? [`${l} <span class="rf-dim">${t}</span> → <span class="${b[i][2] > v ? 'rr-up' : 'rr-down'}">${b[i][1]}</span>`] : []));
  if (o.kind === 'attr' && o.attr === 'wil') {
    const c0 = activeCooldown(p.hero.attrs.wil) / 10, c1 = activeCooldown(after.hero.attrs.wil) / 10;
    if (c1 !== c0) moved.push(`Active <span class="rf-dim">${c0} s</span> → <span class="rr-up">${c1} s</span>`);
  }
  const what = o.kind === 'skill' ? `${KIND_NAME[skillKind(o.skill)]}: ${SKILL_NOTE[o.skill]}` : '';
  return [what ? `<span class="rf-dim">${what}</span>` : '', ...moved].filter(Boolean).join('<br>');
}

function offers(R: SandboxRoster, p: WarPerson): string {
  const os = R.offers(p.id);
  if (!os.length) return '';
  const skill = os[0].kind === 'skill';
  const head = skill ? `Level ${p.hero.level}: choose a skill` : `Level ${p.hero.level}: +${(os[0] as { n: number }).n} to one attribute`;
  return `<div style="margin:4px 0 2px;padding:4px;border:1px solid #c9a24a;background:rgba(201,162,74,.08)">
    <div class="rf-cap" style="color:var(--rf-gold);margin-bottom:4px">▲ ${head}</div>
    <div style="display:grid;grid-template-columns:${skill ? '1fr 1fr' : '1fr 1fr'};gap:3px">
    ${os.map((o, i) => {
      const name = o.kind === 'skill' ? SKILL_NAME[o.skill] : `+${o.n} ${ATTR_NAME[o.attr]}`;
      return `<button class="rf-tbtn rr-offer" data-offer="${i}"><span style="font:700 12.5px/1.1 Cinzel,serif;color:var(--rf-title)">${name}</span><span style="font-size:11px;line-height:14px;color:var(--rf-ink)">${offerPreview(p, o) || '<span class="rf-dim">no change to the baked numbers</span>'}</span></button>`;
    }).join('')}</div></div>`;
}

export function cardHtml(R: SandboxRoster, r: Row, C?: SandboxCraft): string {
  const p = r.p, civ = isCivClass(p.hero.cls), h = p.hero, need = xpToNext(h.level), rank = rankOf(h.cls, h.level), st = warStatsOf(p);
  const skills = SKILL_LEVELS.map((lv, i) => {
    const id = p.skills?.[i];
    if (id) return `<div class="rr-chip" style="flex:1;padding:3px 4px" data-tip="${esc(`<div class="rf-name" style="font-size:13px">${SKILL_NAME[id]}</div><div class="rf-dim" style="margin-top:2px">${KIND_NAME[skillKind(id)]}</div><div style="margin-top:2px">${SKILL_NOTE[id]}</div>`)}"><span style="color:var(--rf-accent)">${skillKind(id)}</span> ${SKILL_NAME[id]}</div>`;
    return `<div class="rr-chip" style="flex:1;padding:3px 4px;color:var(--rf-disabled);border-style:dashed;background:none" data-tip="${h.level >= lv ? 'open: pick a skill' : `opens at level ${lv}`}">${h.level >= lv ? 'open slot' : `slot · L${lv}`}</div>`;
  }).join('');
  const attrs = ATTR_IDS.map((a) => `<span class="rf-dim" data-tip="${esc(`<b style="color:#f2b27a">${ATTR_NAME[a]}</b> ${ATTR_NOTE[a]}`)}">${a.toUpperCase()}</span><span class="rf-num" style="color:var(--rf-ink)">${h.attrs[a]}</span>`).join('');
  const stats = statRows(st).map(([l, t]) => `<span class="rf-dim">${l}</span><span class="rf-num" style="color:var(--rf-ink);text-align:right">${t}</span>`).join('');
  const honours = [...(p.honours ?? []).map((x) => `<span class="rr-chip" style="border-color:#c9a24a;color:#e0b867" data-tip="honour: +2% ${x.stat}">${esc(x.name)}</span>`),
    ...h.traits.map((t) => TRAITS[t as TraitId]).filter(Boolean).map((t) => `<span class="rr-chip" data-tip="${esc(t.desc)}">${t.name}</span>`)].join(' ');
  const where = r.where === 'field' ? `squad #${r.squad}` : r.where === 'captive' ? `captive of team ${R.captorOf(p.id) ?? '?'} · ransom ${30 * h.level} silver` : STATE[r.where];
  const rankChip = rank === 'recruit' ? '' : `<span class="rr-chip" style="border-color:${rank === 'elite' ? '#c9a24a' : '#de8a4e'};color:${rank === 'elite' ? '#e0b867' : '#de8a4e'}">${rank}</span>`;
  const hp = r.unit && r.where === 'field' ? `<div style="display:flex;align-items:center;gap:4px;margin-top:2px"><span class="rf-dim" style="width:18px">HP</span>${bar('hp', r.unit.hp / Math.max(1, r.unit.maxHp), 120)}<span class="rf-num rf-dim">${Math.ceil(r.unit.hp)}/${r.unit.maxHp}</span></div>` : '';
  return `<div class="rf-card" style="padding:4px 6px 6px">
    <div class="rf-head"><span class="rf-name" style="font-size:16px">${esc(h.name)}</span>${rankChip}<span style="flex:1"></span><button class="rf-tbtn x" data-act="closeCard" data-tip="close">✕</button></div>
    <div class="rf-dim" style="margin-top:4px">${SandboxRoster.className(h.cls)} · level ${h.level} · ${where}</div>
    <div style="display:flex;align-items:center;gap:4px;margin-top:4px"><span class="rf-dim" style="width:18px">XP</span>${bar('construction', h.xp / need, 120)}<span class="rf-num rf-dim">${h.xp}/${need}</span></div>
    ${hp}
    ${offers(R, p)}
    <div style="display:flex;gap:8px;margin-top:6px">
      <div style="display:grid;grid-template-columns:28px 64px 28px;grid-template-rows:40px 40px 32px;gap:0 5px;justify-items:center">
        <div style="grid-column:1;grid-row:1">${slot(p, 'weapon')}</div>
        <div style="grid-column:1;grid-row:2">${slot(p, 'armor')}</div>
        <div class="rr-port" style="grid-column:2;grid-row:1/3"><canvas id="rrPort" width="128" height="160"></canvas></div>
        <div style="grid-column:3;grid-row:1">${slot(p, 'helmet')}</div>
        <div style="grid-column:3;grid-row:2">${slot(p, 'shield')}</div>
        <div style="grid-column:2;grid-row:3;margin-top:2px">${slot(p, 'trinket')}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="rf-cap">Attributes${h.points > 0 ? ` <span style="color:#e0b867">+${h.points}</span>` : ''}</div>
        <div class="rr-grid" style="grid-template-columns:auto 1fr auto 1fr">${attrs}</div>
        <div class="rf-cap" style="margin-top:5px">In battle</div>
        <div class="rr-grid" style="grid-template-columns:1fr auto;gap:2px 6px">${stats}</div>
      </div>
    </div>
    ${civ ? trade(p) : `<div class="rf-cap" style="margin-top:6px">Skills</div>
    <div style="display:flex;gap:3px">${skills}</div>
    <div class="rf-cap" style="margin-top:5px">Honours</div>
    <div style="display:flex;flex-wrap:wrap;gap:3px">${honours || '<span class="rf-dim">none yet</span>'}</div>`}
    ${C && r.where !== 'dead' && r.where !== 'captive' ? `<div class="rf-cap" style="margin-top:6px">Stash</div><div style="display:flex;flex-wrap:wrap;gap:3px">${stashRow(C, p)}</div>` : ''}
    <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
      <span class="rf-dim">kills <b class="rf-num" style="color:var(--rf-ink)">${h.kills}</b> · battles <b class="rf-num" style="color:var(--rf-ink)">${h.battles}</b></span>
      <span style="flex:1"></span>
      ${r.where !== 'dead' ? '<button class="rf-tbtn" data-act="xp" data-tip="dev: one level of XP">dev +XP</button>' : ''}
    </div>
  </div>`;
}
