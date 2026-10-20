/**
 * A soldier's progression as a tree (docs/WAR.md "Soldiers": +2 attribute points a level, 2 skill slots from his
 * family pool at levels 3 and 7, the elite class at level 6), drawn by the same graph as the profession trees
 * (../tree/graph.ts). His class is the root; the four attributes branch at L2 (repeatable, the value under each);
 * slot I at L3 and slot II at L7 each fork into his family's four skills (the squad active marked); elite at L6.
 * A pending level-up lights what it offers (the skill pair fixed by his id and the slot, or the attributes); click
 * takes it (a skill asks first: it is for good).
 */
import { CLASSES } from '../../../../data/classes';
import { ATTR_IDS, ATTR_MAX } from '../../../../data/perks';
import { warStatsOf } from '../../../sim/classes';
import { applyOffer, type LevelOffer } from '../../../sim/roster';
import { activeCooldown, FAMILY_OF, legalSkills, SKILL_LEVELS, SKILL_POOL, type Family } from '../../../sim/skills';
import type { WarPerson, WarSkillId } from '../../../types';
import { UNIT_ICON, icon } from '../kit';
import type { GNode, TreeView } from '../tree/graph';
import { rankOf } from './markers';
import { SandboxRoster } from './state';
import { ATTR_NAME, ATTR_NOTE, esc, KIND_NAME, SKILL_NAME, SKILL_NOTE, skillKind, statRows } from './ui';

const SKILL_ICON: Record<WarSkillId, string> = {
  shieldDrill: 'act-hold', phalangite: 'act-line', holdFast: 'act-stop', shieldWall: 'act-column',
  brawler: 'act-attack', shieldBreaker: 'act-cancel', finisher: 'unit-swordsman', berserk: 'act-wedge',
  deepQuiver: 'act-loose', eagleEye: 'unit-archer', fireArcher: 'act-fire-arrows', volley: 'unit-slinger',
  horsemanship: 'act-move', lanceCharge: 'act-attack', rideDown: 'act-wedge', wheel: 'act-column',
};
const ELITE: Record<Family, string[]> = { line: ['royal_guard', 'sacred_band'], shock: ['rhomphaia', 'gallic'], missile: [], rider: ['chariot'] };
const ROMAN = ['I', 'II'];

/** Before -> after of one offer: the baked numbers it moves, else what it does. */
export function offerPreview(p: WarPerson, o: LevelOffer): string {
  const after = applyOffer(p, o), a = statRows(warStatsOf(p)), b = statRows(warStatsOf(after));
  const moved = a.flatMap(([l, t, v], i) => (b[i] && b[i][2] !== v ? [`${l} <span class="rf-dim">${t}</span> → <span class="${b[i][2] > v ? 'rr-up' : 'rr-down'}">${b[i][1]}</span>`] : []));
  if (o.kind === 'attr' && o.attr === 'wil') {
    const c0 = activeCooldown(p.hero.attrs.wil) / 10, c1 = activeCooldown(after.hero.attrs.wil) / 10;
    if (c1 !== c0) moved.push(`Active <span class="rf-dim">${c0} s</span> → <span class="rr-up">${c1} s</span>`);
  }
  return moved.join('<br>');
}

export function soldierTree(R: SandboxRoster, p: WarPerson): TreeView {
  const h = p.hero, cls = h.cls ?? 'militia', fam = FAMILY_OF[cls as keyof typeof FAMILY_OF] ?? 'line';
  const held = legalSkills(cls, h.level, p.skills ?? []), offers = R.offers(p.id);
  const skillOffers = offers.flatMap((o) => (o.kind === 'skill' ? [o.skill] : [])), attrOffer = offers.find((o) => o.kind === 'attr');
  const rootId = 'root', elite = ELITE[fam], isElite = rankOf(cls, h.level) === 'elite';
  const nodes: GNode[] = [{
    id: rootId, level: 1, lane: 2, parents: [], state: 'taken', shape: 'root', face: icon(UNIT_ICON[cls] ?? 'unit-militia'),
    name: SandboxRoster.className(cls), tip: `<div class="rf-name" style="font-size:13px">${SandboxRoster.className(cls)}</div><div class="rf-dim" style="margin-top:2px">${fam} family, level ${h.level}</div>`,
  }];
  // attributes: +2 points a level from L2, repeatable
  ATTR_IDS.forEach((a, i) => {
    const v = h.attrs[a], o = attrOffer && v < ATTR_MAX ? ({ ...attrOffer, attr: a } as LevelOffer) : undefined;
    const state = o ? 'open' : h.level < 2 ? 'locked' : 'taken';
    const pre = o ? offerPreview(p, o) : '';
    nodes.push({
      id: `a:${a}`, level: 2, lane: i < 2 ? i : i + 1, parents: [rootId], state, face: `<span>${a.toUpperCase()}</span>`, name: ATTR_NAME[a], sub: `${v} / ${ATTR_MAX}`,
      tip: `<div style="width:200px;white-space:normal"><div class="rf-name" style="font-size:13px">${ATTR_NAME[a]} <span class="rf-dim" style="font:600 11px Inter">${v} of ${ATTR_MAX}</span></div><div style="margin-top:3px">${ATTR_NOTE[a]}</div>
        <div class="rf-dim" style="margin-top:3px">+2 points every level, into one attribute</div>
        ${o ? `<div style="margin-top:3px;color:var(--rf-good)">open: click for +${(o as { n: number }).n}</div>${pre ? `<div style="margin-top:2px">${pre}</div>` : ''}` : v >= ATTR_MAX ? '<div style="margin-top:3px;color:var(--rf-gold)">at the cap</div>' : h.level < 2 ? '<div style="margin-top:3px;color:var(--rf-bad)">locked: points come with level 2</div>' : ''}</div>`,
    });
  });
  // the two skill slots, each a fork into the family pool
  const pool = SKILL_POOL[fam];
  SKILL_LEVELS.forEach((lv, si) => {
    pool.forEach((id, i) => {
      const mine = held[si] === id;
      let why = '';
      if (!mine) {
        if (held[si]) why = `slot ${ROMAN[si]} holds ${SKILL_NAME[held[si]]}`;
        else if (held.includes(id)) why = `already his, in slot ${ROMAN[held.indexOf(id)]}`;
        else if (h.level < lv) why = `slot ${ROMAN[si]} opens at level ${lv} (he is ${h.level})`;
        else if (si > 0 && !held[0]) why = 'fill slot I first';
        else if (!skillOffers.includes(id)) why = `not offered: this level-up offers ${skillOffers.map((x) => SKILL_NAME[x]).join(' or ')}`;
      }
      const state = mine ? 'taken' : why ? 'locked' : 'open', k = skillKind(id);
      const pre = state === 'open' ? offerPreview(p, { kind: 'skill', skill: id }) : '';
      nodes.push({
        id: `s${si}:${id}`, level: lv, lane: i < 2 ? i : i + 1, parents: si ? pool.map((x) => `s0:${x}`) : [rootId], state,
        face: icon(SKILL_ICON[id]), name: SKILL_NAME[id], sub: k === 'A' ? 'squad active' : undefined,
        tip: `<div style="width:210px;white-space:normal"><div class="rf-name" style="font-size:13px">${SKILL_NAME[id]} <span class="rf-dim" style="font:600 11px Inter">slot ${ROMAN[si]}, L${lv}</span></div>
          <div class="rf-dim" style="margin-top:2px">${KIND_NAME[k]}${k === 'A' ? ': one per squad, from its best-ranked man' : ''}</div><div style="margin-top:3px">${SKILL_NOTE[id]}</div>
          ${pre ? `<div style="margin-top:3px">${pre}</div>` : ''}
          <div style="margin-top:3px;color:${mine ? 'var(--rf-gold)' : why ? 'var(--rf-bad)' : 'var(--rf-good)'}">${mine ? 'taken' : why ? 'locked: ' + why : 'open: click to take (for good)'}</div></div>`,
      });
    });
  });
  nodes.push({
    id: 'elite', level: 6, lane: 2, parents: [rootId], state: isElite ? 'taken' : 'locked', face: icon('act-upgrade'), name: 'Elite',
    sub: elite.length ? elite.map((x) => CLASSES[x as keyof typeof CLASSES]?.short ?? x).join(' / ') : undefined,
    tip: `<div style="width:200px;white-space:normal"><div class="rf-name" style="font-size:13px">Elite <span class="rf-dim" style="font:600 11px Inter">L6</span></div>
      <div style="margin-top:3px">elite rank at level 6: gold pips on the map, upkeep 2 food an hour</div>
      <div class="rf-dim" style="margin-top:3px">the elite class (${elite.length ? elite.map((x) => CLASSES[x as keyof typeof CLASSES]?.name ?? x).join(' or ') : 'the Cretan-set archer, not in the war yet'}): the elite rare kit at a fortress, 30 min</div>
      <div style="margin-top:3px;color:${isElite ? 'var(--rf-gold)' : 'var(--rf-bad)'}">${isElite ? 'his rank' : `locked: level 6 (he is ${h.level})`}</div></div>`,
  });
  const slots = SKILL_LEVELS.filter((l) => h.level >= l).length;
  const pending = skillOffers.length ? `Level ${h.level}: choose a skill for slot ${ROMAN[held.length]}` : attrOffer ? `Level ${h.level}: +${(attrOffer as { n: number }).n} to one attribute` : '';
  return {
    graph: { key: `sol:${p.id}`, nodes, lanes: 5, level: h.level },
    name: h.name,
    sub: `${SandboxRoster.className(cls)}, level ${h.level}`,
    points: `<span class="tg-pts${pending ? ' on' : ''}" data-tip="skill slots open at levels 3 and 7; +2 attribute points every level"><b>${held.length}/${slots}</b> slots${h.points ? `, <b>+${h.points}</b> pts` : ''}</span>`,
    foot: pending ? `<span style="color:var(--rf-gold)">▲ ${esc(pending)}: a lit node</span>` : '<span class="rf-dim">nothing pending: the next level brings points</span>',
    ask: (id) => (id.startsWith('s') ? `Take ${SKILL_NAME[id.slice(3) as WarSkillId]} for slot ${ROMAN[Number(id[1])]}? A skill is for good.` : null),
  };
}

/** Take the pending offer node id stands for (an attribute or a skill). */
export function takeSoldier(R: SandboxRoster, pid: string, id: string): void {
  const os = R.offers(pid);
  const o = id.startsWith('a:') ? os.find((x) => x.kind === 'attr' && x.attr === id.slice(2)) : os.find((x) => x.kind === 'skill' && x.skill === id.slice(3));
  if (o) R.choose(pid, o);
}
