/**
 * The soldier card (M5g, W-55; docs/WAR.md "UI touchpoints"), laid out after the RPG character sheets (Battle Brothers'
 * paper doll, Darkest Dungeon's icon-led stats, Bannerlord's attribute pips):
 *
 *   head      name, rank crest (veteran / elite), close; class, where he is (squad, reserve, wounded...) as icons
 *   level     the level disc, the XP bar; HP in the field; a pending level-up as a gold banner that opens the tree
 *   doll      portrait between the gear slots (empty slots show a faint outline of what goes there), beside it the four
 *             attributes with their value and 15 pips
 *   battle    the baked numbers, two columns, an icon each
 *   skills    the two slots as medallions (a free one glows, a closed one shows the level it opens at); civilians: trade
 *   honours, stash, the record (kills, battles) and the Skill tree button
 *
 * Every icon, number and skill has a description card (../codex.ts) with nested terms (../tooltip.ts). Dev buttons show
 * only while the dev panel is open. Pure HTML; ./index.ts mounts it, fills the portrait canvas (#rrPort) and routes
 * data-act clicks.
 */
import { ATTR_IDS, ATTR_MAX, ATTR_BASE } from '../../../../data/perks';
import { TRAITS, type TraitId } from '../../../../data/traits';
import { xpToNext } from '../../../../data/units';
import type { Slot } from '../../../../data/items';
import { warStatsOf } from '../../../sim/classes';
import { SKILLS, SKILL_LEVELS } from '../../../sim/skills';
import { snapW, UNIT_ICON } from '../kit';
import { rankOf } from './markers';
import { SandboxRoster, type Row } from './state';
import { esc, itemBadges, itemIcon, itemTip, statRows } from './ui';
import { isCivClass } from '../../../../data/classes';
import { pointsAt, profOf, PROF_NODES } from '../../../../data/professions';
import type { SandboxCraft } from '../craft/state';
import type { WarPerson } from '../../../types';
import { glyph } from '../glyph';
import { ATTR_ICON, ATTR_NAME, attrCard, card, KIND_TERM, SKILL_ICON, SKILL_NAME, skillCard, STAT_TERM, statCard, TERMS, termCard } from '../codex';
import { nodeIcon } from '../craft/tree';

export const CARD_W = snapW(296);
const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', armor: 'Armour', helmet: 'Helmet', shield: 'Shield', trinket: 'Trinket' };
/** The faint outline an empty slot shows. */
const SLOT_GHOST: Record<Slot, string> = { weapon: 'ui:sword', armor: 'ui:armor', helmet: 'ui:helmet', shield: 'ui:shield', trinket: 'ui:ring' };
const ROMAN = ['I', 'II'];

/** A kit unit icon (24 art px art) drawn at px. */
const unitIcon = (cls: string, px = 16) => `<img src="war/ui/icons/24/${UNIT_ICON[cls] ?? 'unit-militia'}.png" srcset="war/ui/icons/24/${UNIT_ICON[cls] ?? 'unit-militia'}@2x.png 2x" width="${px}" height="${px}" alt="">`;
const tip = (html: string) => `data-tip="${esc(html)}"`;

function slot(p: WarPerson, s: Slot): string {
  const it = p.hero.equip[s];
  if (!it) return `<div class="rr-slot empty" ${tip(card({ icon: SLOT_GHOST[s], name: SLOT_LABEL[s], kind: 'empty slot', w: 190, more: '<div class="rf-dim">Put on one from the stash below.</div>' }))}>${glyph(SLOT_GHOST[s], 20)}</div>`;
  return `<div class="rr-slot" data-unequip="${s}" ${tip(itemTip(it, p.hero.attrs, { tone: 'dim', icon: 'ui:chest', text: 'Click: back to the stash' }))}>${itemIcon(it, 26)}${itemBadges(it)}</div>`;
}

/** The stash under the paper doll (M5h): items he may put on first (click), the rest dimmed with why not. */
function stashRow(C: SandboxCraft, p: WarPerson): string {
  const items = C.stash().filter((x) => !x.away);
  if (!items.length) return `<span class="rf-dim">${glyph('ui:anvil', 14)} empty: a smith makes gear at a forge</span>`;
  const rows = items.map((x) => ({ x, why: C.equipBlock(p, x.item) })).sort((a, b) => Number(!!a.why) - Number(!!b.why));
  return rows.map(({ x, why }) => `<div class="rr-slot${why ? ' no' : ''}" ${why ? '' : `data-equip="${esc(x.item.uid)}"`} ${tip(itemTip(x.item, p.hero.attrs, why ? { tone: 'bad', icon: 'ui:lock', text: why } : { tone: 'good', icon: 'ui:plus', text: 'Click: put it on' }))}>${itemIcon(x.item, 26)}${itemBadges(x.item)}</div>`).join('');
}

/** A civilian's trade instead of skills (M5h): nodes taken as icons, points left, the tree button. */
function trade(p: WarPerson): string {
  const prof = profOf(p.hero.cls ?? ''), perks = p.hero.perks as unknown as string[];
  if (!prof) return '';
  const taken = perks.filter((n) => PROF_NODES[n]?.prof === prof && !PROF_NODES[n].capstone).length, left = Math.max(0, pointsAt(p.hero.level) - taken);
  const nodes = perks.filter((n) => PROF_NODES[n]?.prof === prof).map((n) => `<span class="rr-node" ${tip(card({ icon: nodeIcon(PROF_NODES[n], 24), rawIcon: true, name: PROF_NODES[n].name, kind: `level ${PROF_NODES[n].level}`, more: `<div>${esc(PROF_NODES[n].desc)}</div>` }))}>${nodeIcon(PROF_NODES[n], 24)}</span>`).join('');
  return `<div class="rf-cap rr-cap">Profession${left ? ` <span class="rr-pts">${glyph('ui:tgstar', 12)}+${left}</span>` : ''}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${nodes || '<span class="rf-dim">the root node only</span>'}</div>`;
}

/** A pending level-up: a gold banner that opens his tree, where the choice is made. */
function offers(R: SandboxRoster, p: WarPerson): string {
  const os = R.offers(p.id);
  if (!os.length) return '';
  const head = os[0].kind === 'skill' ? `Level ${p.hero.level}: choose a skill` : `Level ${p.hero.level}: +${(os[0] as { n: number }).n} to an attribute`;
  return `<button class="rr-pending" data-act="tree" ${tip(card({ icon: 'ui:tgstar', name: 'Level up', w: 200, more: '<div>Open his tree: what he may take now glows.</div>' }))}>${glyph('ui:tgstar', 16)}<span>${head}</span><span class="go">Open tree ›</span></button>`;
}

/** Where he is: squad, reserve, wounded, captive, fallen; an icon with its term. */
function whereHtml(R: SandboxRoster, r: Row): string {
  const h = r.p.hero;
  if (r.where === 'field') return `${glyph('ui:banner', 14)}<span>Squad #${r.squad}, in the field</span>`;
  const t = { reserve: 'reserve', wounded: 'wounded', captive: 'captive', dead: 'fallen' }[r.where];
  const extra = r.where === 'captive' ? `, held by team ${R.captorOf(r.p.id) ?? '?'} · ransom ${30 * h.level} silver` : '';
  return `<span class="rr-where" ${tip(termCard(t))}>${glyph(TERMS[t].icon, 14)}<span>${TERMS[t].name}${extra}</span></span>`;
}

const pips = (v: number) => `<div class="rr-pips">${Array.from({ length: ATTR_MAX }, (_, i) => `<i class="${i < Math.min(v, ATTR_BASE) ? 'b' : i < v ? 'on' : ''}"></i>`).join('')}</div>`;

export function cardHtml(R: SandboxRoster, r: Row, C?: SandboxCraft, dev = false): string {
  const p = r.p, civ = isCivClass(p.hero.cls), h = p.hero, need = xpToNext(h.level), rank = rankOf(h.cls, h.level), st = warStatsOf(p);
  const held = p.skills ?? [];
  const skills = SKILL_LEVELS.map((lv, i) => {
    const id = held[i];
    if (id) return `<div class="rr-skill" data-skill="${id}" ${tip(skillCard(id, `slot ${ROMAN[i]}`, { tone: 'gold', icon: 'ui:check', text: 'His for good' }))}><span class="rr-med">${glyph(SKILL_ICON[id], 22)}</span><div><div class="nm">${SKILL_NAME[id]}</div><div class="kd">${TERMS[KIND_TERM[SKILLS[id].kind]].name}</div></div></div>`;
    const open = h.level >= lv;
    return `<div class="rr-skill ${open ? 'free' : 'shut'}" ${open ? 'data-act="tree"' : ''} ${tip(card({ icon: open ? 'ui:plus' : 'ui:lock', name: `Skill slot ${ROMAN[i]}`, kind: `opens at level ${lv}`, w: 200, more: `<div>${TERMS.slot.text()}</div>`, state: open ? { tone: 'good', icon: 'ui:plus', text: 'Open: pick it in his tree' } : { tone: 'dim', icon: 'ui:lock', text: `He is level ${h.level}` } }))}><span class="rr-med">${glyph(open ? 'ui:plus' : 'ui:lock', open ? 16 : 14)}</span><div><div class="nm">${open ? 'Choose a skill' : `Slot ${ROMAN[i]}`}</div><div class="kd">${open ? 'in his tree' : `opens at level ${lv}`}</div></div></div>`;
  }).join('');
  const attrs = ATTR_IDS.map((a) => `<div class="rr-attr" data-attr="${a}" ${tip(attrCard(a, h.attrs[a]))}>${glyph(ATTR_ICON[a], 16)}<span class="nm">${ATTR_NAME[a]}</span><b>${h.attrs[a]}</b>${pips(h.attrs[a])}</div>`).join('');
  const stats = statRows(st).map(([l, t]) => `<div class="rr-stat" data-stat="${l}" ${tip(statCard(l, t))}>${glyph(STAT_TERM[l]?.icon ?? 'ui:info', 15)}<span class="rf-dim">${l === 'HP' ? 'Health' : l}</span><b>${t}</b></div>`).join('');
  const honours = [
    ...(p.honours ?? []).map((x) => `<span class="rr-hon" ${tip(card({ icon: 'ui:laurel', name: esc(x.name), kind: 'battle honour', w: 200, more: `<div>+2% ${esc(x.stat)}</div>` }))}>${glyph('ui:laurel', 15)}${esc(x.name)}</span>`),
    ...h.traits.map((t) => TRAITS[t as TraitId]).filter(Boolean).map((t) => `<span class="rr-hon trait" ${tip(card({ icon: 'ui:star', name: t.name, kind: 'trait', w: 200, more: `<div>${esc(t.desc)}</div>` }))}>${glyph('ui:star', 13)}${t.name}</span>`),
  ].join('');
  const crest = rank === 'recruit' ? '' : `<span class="rr-rank ${rank}" ${tip(rank === 'elite' ? termCard('elite') : card({ icon: 'ui:star', name: 'Veteran', w: 200, more: '<div>Level 3 or more: a terracotta pip under him on the map.</div>' }))}>${glyph(rank === 'elite' ? 'ui:captain' : 'ui:star', 13)}${rank === 'elite' ? 'Elite' : 'Veteran'}</span>`;
  const hp = r.unit && r.where === 'field' ? `<div class="rr-line" ${tip(statCard('HP', `${Math.ceil(r.unit.hp)} / ${r.unit.maxHp}`))}>${glyph('ui:heart', 16)}<div class="rr-bar hp"><i style="width:${Math.round(100 * Math.max(0, Math.min(1, r.unit.hp / Math.max(1, r.unit.maxHp))))}%"></i></div><span class="rf-dim">${Math.ceil(r.unit.hp)} / ${r.unit.maxHp}</span></div>` : '';
  return `<div class="rf-card rr-card">
    <div class="rf-head"><span class="rf-name" style="font-size:16px">${esc(h.name)}</span>${crest}<span style="flex:1"></span><button class="rf-tbtn x" data-act="closeCard" data-tip="close (Esc)">✕</button></div>
    <div class="rr-sub">${unitIcon(h.cls ?? 'militia', 16)}<span>${SandboxRoster.className(h.cls)}</span><span class="dot">·</span>${whereHtml(R, r)}</div>
    <div class="rr-line" ${tip(card({ icon: 'ui:xp', name: `Level ${h.level}`, kind: `${h.xp} of ${need} XP to level ${h.level + 1}`, w: 210, more: `<div>${TERMS.xp.text()}</div>` }))}><span class="rr-lv">${h.level}</span><div class="rr-bar xp"><i style="width:${Math.round(100 * Math.min(1, h.xp / need))}%"></i></div><span class="rf-dim">${h.xp} / ${need} XP</span></div>
    ${hp}
    ${offers(R, p)}
    <div class="rr-top">
      <div class="rr-doll">
        <div style="grid-column:1;grid-row:1">${slot(p, 'weapon')}</div>
        <div style="grid-column:1;grid-row:2">${slot(p, 'armor')}</div>
        <div class="rr-port" style="grid-column:2;grid-row:1/3"><canvas id="rrPort" width="128" height="160"></canvas></div>
        <div style="grid-column:3;grid-row:1">${slot(p, 'helmet')}</div>
        <div style="grid-column:3;grid-row:2">${slot(p, 'shield')}</div>
        <div style="grid-column:2;grid-row:3;justify-self:center">${slot(p, 'trinket')}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="rf-cap rr-cap" style="margin-top:0">Attributes${h.points > 0 ? ` <span class="rr-pts" ${tip(termCard('points'))}>${glyph('ui:tgstar', 12)}+${h.points}</span>` : ''}</div>
        ${attrs}
      </div>
    </div>
    <div class="rf-cap rr-cap">In battle</div>
    <div class="rr-stats">${stats}</div>
    ${civ ? trade(p) : `<div class="rf-cap rr-cap">Skills</div><div class="rr-skills">${skills}</div>`}
    ${honours ? `<div class="rf-cap rr-cap">Honours</div><div style="display:flex;flex-wrap:wrap;gap:4px">${honours}</div>` : ''}
    ${C && r.where !== 'dead' && r.where !== 'captive' ? `<div class="rf-cap rr-cap">Stash</div><div style="display:flex;flex-wrap:wrap;gap:4px">${stashRow(C, p)}</div>` : ''}
    <div class="rr-rec">
      <span ${tip(card({ icon: 'ui:skull', name: 'Kills', w: 170, more: '<div>Foes he struck down.</div>' }))}>${glyph('ui:skull', 15)}<b>${h.kills}</b><span class="rf-dim">kills</span></span>
      <span ${tip(card({ icon: 'ui:swords', name: 'Battles', w: 170, more: '<div>Fights he lived through.</div>' }))}>${glyph('ui:swords', 15)}<b>${h.battles}</b><span class="rf-dim">battles</span></span>
      <span style="flex:1"></span>
      ${dev && r.where !== 'dead' ? '<button class="rf-tbtn" data-act="xp" data-tip="dev: one level of XP">+XP</button>' : ''}
      <button class="rf-tbtn" data-act="tree" data-tip="${esc(card({ icon: 'ui:tgstar', name: civ ? 'Profession tree' : 'Skill tree', w: 210, more: civ ? '<div>His trade: the nodes by level, what each opens.</div>' : '<div>His attributes, his two skill slots and the elite rank, by level.</div>' }))}">${glyph('ui:tgstar', 13)} ${civ ? 'Profession' : 'Skill tree'}</button>
    </div>
  </div>`;
}
