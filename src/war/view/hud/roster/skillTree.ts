/**
 * A soldier's progression as a tree (docs/WAR.md "Soldiers": +2 attribute points a level, 2 skill slots from his
 * family pool at levels 3 and 7, the elite class at level 6), drawn by the same graph as the profession trees
 * (../tree/graph.ts). His class is the root; the four attributes branch at L2 (repeatable, the value under each);
 * slot I at L3 and slot II at L7 each fork into his family's four skills (the squad active marked); elite at L6.
 * A pending level-up lights what it offers (the skill pair fixed by his id and the slot, or the attributes); click
 * takes it (a skill asks first: it is for good). Every node has its icon and a description card (../codex.ts); the
 * header says what is to spend, so the tree needs no legend or hint line (W-55).
 */
import { CLASSES } from '../../../../data/classes';
import { ATTR_IDS, ATTR_MAX } from '../../../../data/perks';
import { warStatsOf } from '../../../sim/classes';
import { applyOffer, type LevelOffer } from '../../../sim/roster';
import { activeCooldown, FAMILY_OF, legalSkills, SKILL_LEVELS, SKILL_POOL, SKILLS, type Family } from '../../../sim/skills';
import type { WarPerson, WarSkillId } from '../../../types';
import { UNIT_ICON, icon } from '../kit';
import type { GNode, TreeView } from '../tree/graph';
import { rankOf } from './markers';
import { SandboxRoster } from './state';
import { esc, statRows } from './ui';
import { glyph } from '../glyph';
import { ATTR_ICON, ATTR_NAME, attrCard, card, SKILL_ICON, SKILL_NAME, skillCard, TERMS, termCard } from '../codex';

const ELITE: Record<Family, string[]> = { line: ['royal_guard', 'sacred_band'], shock: ['rhomphaia', 'gallic'], missile: [], rider: ['chariot'] };
const ROMAN = ['I', 'II'];

/** Before -> after of one offer: the baked numbers it moves. */
export function offerPreview(p: WarPerson, o: LevelOffer): string {
  const after = applyOffer(p, o), a = statRows(warStatsOf(p)), b = statRows(warStatsOf(after));
  const moved = a.flatMap(([l, t, v], i) => (b[i] && b[i][2] !== v ? [`<div class="cx-fx">${l === 'HP' ? 'Health' : l} <span class="rf-dim">${t}</span> → <b class="${b[i][2] > v ? 'rr-up' : 'rr-down'}">${b[i][1]}</b></div>`] : []));
  if (o.kind === 'attr' && o.attr === 'wil') {
    const c0 = activeCooldown(p.hero.attrs.wil) / 10, c1 = activeCooldown(after.hero.attrs.wil) / 10;
    if (c1 !== c0) moved.push(`<div class="cx-fx">Squad active <span class="rf-dim">${c0} s</span> → <b class="rr-up">${c1} s</b></div>`);
  }
  return moved.length ? `<div class="cx-tag" style="margin-bottom:2px">if he takes it</div>${moved.join('')}` : '';
}

/** The tree header's counters: attribute points and skill slots to fill (gold while something waits). */
function counters(points: number, open: number, held: number, slots: number): string {
  const pts = `<span class="tg-chip${points ? ' on' : ''}" data-tip="${esc(termCard('points'))}">${glyph('ui:tgstar', 14)}${points ? `+${points} point${points > 1 ? 's' : ''}` : 'no points'}</span>`;
  const sk = `<span class="tg-chip${open ? ' on' : ''}" data-tip="${esc(termCard('slot'))}">${glyph(open ? 'ui:plus' : 'ui:f_wall', 14)}${open ? `${open} skill to pick` : `skills ${held} / ${slots || SKILL_LEVELS.length}`}</span>`;
  return pts + sk;
}

export function soldierTree(R: SandboxRoster, p: WarPerson): TreeView {
  const h = p.hero, cls = h.cls ?? 'militia', fam = FAMILY_OF[cls as keyof typeof FAMILY_OF] ?? 'line';
  const held = legalSkills(cls, h.level, p.skills ?? []), offers = R.offers(p.id);
  const skillOffers = offers.flatMap((o) => (o.kind === 'skill' ? [o.skill] : [])), attrOffer = offers.find((o) => o.kind === 'attr');
  const rootId = 'root', elite = ELITE[fam], isElite = rankOf(cls, h.level) === 'elite';
  const nodes: GNode[] = [{
    id: rootId, level: 1, lane: 2, parents: [], state: 'taken', shape: 'root', face: icon(UNIT_ICON[cls] ?? 'unit-militia'),
    name: SandboxRoster.className(cls), tip: card({ icon: icon(UNIT_ICON[cls] ?? 'unit-militia'), rawIcon: true, name: SandboxRoster.className(cls), kind: `${fam} family · level ${h.level}`, w: 210, more: `<div>His class. Its family gives the four skills he may learn.</div>` }),
  }];
  // attributes: +2 points a level from L2, repeatable
  ATTR_IDS.forEach((a, i) => {
    const v = h.attrs[a], o = attrOffer && v < ATTR_MAX ? ({ ...attrOffer, attr: a } as LevelOffer) : undefined, n = o ? (o as { n: number }).n : 0;
    const state = o ? 'open' : h.level < 2 ? 'locked' : 'taken';
    nodes.push({
      id: `a:${a}`, level: 2, lane: i < 2 ? i : i + 1, parents: [rootId], state, face: glyph(ATTR_ICON[a], 24), name: ATTR_NAME[a], sub: `${v} / ${ATTR_MAX}`,
      badge: n ? `+${n}` : undefined, opens: 2,
      tip: attrCard(a, v, o ? { tone: 'good', icon: 'ui:plus', text: `Click: +${n} ${ATTR_NAME[a]}` } : v >= ATTR_MAX ? { tone: 'gold', icon: 'ui:check', text: 'At the most' } : h.level < 2 ? { tone: 'bad', icon: 'ui:lock', text: 'Points come with level 2' } : { tone: 'dim', icon: 'ui:tgstar', text: 'More points at the next level' }, o ? offerPreview(p, o) : ''),
    });
  });
  // the two skill slots, each a fork into the family pool
  const pool = SKILL_POOL[fam];
  SKILL_LEVELS.forEach((lv, si) => {
    pool.forEach((id, i) => {
      const mine = held[si] === id;
      let why = '';
      if (!mine) {
        if (held[si]) why = `Slot ${ROMAN[si]} holds ${SKILL_NAME[held[si]]}`;
        else if (held.includes(id)) why = `Already his, in slot ${ROMAN[held.indexOf(id)]}`;
        else if (h.level < lv) why = `Slot ${ROMAN[si]} opens at level ${lv} (he is ${h.level})`;
        else if (si > 0 && !held[0]) why = 'Fill slot I first';
        else if (!skillOffers.includes(id)) why = `Not offered: this level offers ${skillOffers.map((x) => SKILL_NAME[x]).join(' or ')}`;
      }
      const state = mine ? 'taken' : why ? 'locked' : 'open';
      const pre = state === 'open' ? offerPreview(p, { kind: 'skill', skill: id }) : '';
      nodes.push({
        id: `s${si}:${id}`, level: lv, lane: i < 2 ? i : i + 1, parents: si ? pool.map((x) => `s0:${x}`) : [rootId], state,
        face: glyph(SKILL_ICON[id], 24), name: SKILL_NAME[id], sub: SKILLS[id].kind === 'A' ? 'squad active' : undefined, opens: h.level < lv ? lv : undefined,
        tip: skillCard(id, `slot ${ROMAN[si]} · level ${lv}`, mine ? { tone: 'gold', icon: 'ui:check', text: 'His for good' } : why ? { tone: 'bad', icon: 'ui:lock', text: why } : { tone: 'good', icon: 'ui:plus', text: 'Click to take: a skill is for good' }, pre),
      });
    });
  });
  const eliteNames = elite.map((x) => CLASSES[x as keyof typeof CLASSES]?.name ?? x);
  nodes.push({
    id: 'elite', level: 6, lane: 2, parents: [rootId], state: isElite ? 'taken' : 'locked', face: glyph('ui:captain', 24), name: 'Elite', opens: isElite ? undefined : 6,
    tip: card({
      icon: 'ui:captain', name: 'Elite', kind: 'rank · level 6', w: 230, flavour: 'Men follow the gold crest into the worst of it.',
      fx: [`<div>${TERMS.elite.text()}</div>`, `<div class="cx-fx">${glyph('ui:advance', 14)}<span>becomes ${eliteNames.length ? eliteNames.join(' or ') : 'the Cretan-set archer (not in the war yet)'}</span></div>`],
      state: isElite ? { tone: 'gold', icon: 'ui:check', text: 'His rank' } : { tone: 'bad', icon: 'ui:lock', text: `Level 6 (he is ${h.level})` },
    }),
  });
  const slots = SKILL_LEVELS.filter((l) => h.level >= l).length;
  return {
    graph: { key: `sol:${p.id}`, nodes, lanes: 5, level: h.level },
    name: h.name,
    sub: `${SandboxRoster.className(cls)} · level ${h.level}`,
    points: counters(h.points, skillOffers.length ? 1 : 0, held.length, slots),
    foot: '',
    ask: (id) => (id.startsWith('s') ? `Take ${SKILL_NAME[id.slice(3) as WarSkillId]} for slot ${ROMAN[Number(id[1])]}? A skill is for good.` : null),
  };
}

/** Take the pending offer node id stands for (an attribute or a skill). */
export function takeSoldier(R: SandboxRoster, pid: string, id: string): void {
  const os = R.offers(pid);
  const o = id.startsWith('a:') ? os.find((x) => x.kind === 'attr' && x.attr === id.slice(2)) : os.find((x) => x.kind === 'skill' && x.skill === id.slice(3));
  if (o) R.choose(pid, o);
}
