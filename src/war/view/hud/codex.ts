/**
 * The war HUD's descriptions (W-55), written the Crusader Kings way: a name with its icon and kind, one flavour line,
 * then the effects as coloured values with icons, where every game term (Block, Squad active, Smith...) is a nested
 * tooltip of its own (./tooltip.ts). Skills, attributes, battle stats, buildings and engines. Every number comes from
 * the sim's data (src/war/sim, src/data); only the flavour and the plain words are written here.
 */
import { ATTR_BASE, ATTR_EFFECT, ATTR_MAX, POINTS_PER_LEVEL, type AttrId } from '../../../data/perks';
import { CIV_CLASSES, type CivClassId } from '../../../data/classes';
import { RECIPES } from '../../../data/recipes';
import { BUILDINGS, CHEST } from '../../sim/economy';
import { COMBAT } from '../../sim/combat';
import { ACTIVE, ACTIVES, FLAG_FX, SKILLS, SKILL_LEVELS, type SkillDef } from '../../sim/skills';
import { FALL } from '../../sim/soldiers';
import { COVERED, LADDER, MANTLET, RAM, SIEGE, THROWER } from '../../sim/siege';
import type { BuildingType, SiegeType, WarSkillId } from '../../types';
import { glyph } from './glyph';

const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;
const num = (v: number) => String(Math.round(v * 100) / 100);
const sec = (ticks: number) => `${Math.round(ticks) / 10} s`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ terms (nested tooltips)

/** A game term: hover it in a held tooltip for its own card. */
export const term = (id: string, label?: string) => `<span class="tt" data-term="${id}">${label ?? TERMS[id]?.name ?? id}</span>`;

const CIV_ICON: Record<CivClassId, string> = { civ_cook: 'goods:march_rations', civ_smith: 'ui:anvil', civ_merchant: 'ui:scales', civ_engineer: 'ui:works', civ_physician: 'ui:cross', civ_forager: 'goods:food' };

interface Term { name: string; icon: string; text: () => string }
/** The glossary behind the highlighted words. */
export const TERMS: Record<string, Term> = {
  health: { name: 'Health', icon: 'ui:heart', text: () => `How much harm he takes before he falls. At none left he is wounded or killed: see ${term('survive')}. Raised by ${term('str')} and ${term('end')}.` },
  melee: { name: 'Melee damage', icon: 'ui:sword', text: () => `The force of one landed blow, before the target's ${term('armour')}. Raised by ${term('str')} and the weapon.` },
  missile: { name: 'Missile damage', icon: 'ui:throw', text: () => `The force of one arrow, stone or javelin that lands, before ${term('armour')}. Missiles hit ×${COMBAT.missileDmg} as hard as in the open field battles, and harder from higher ground.` },
  armour: { name: 'Armour', icon: 'ui:armor', text: () => `Softens every blow and missile that lands: damage × ${COMBAT.armorK} ÷ (${COMBAT.armorK} + armour). At ${COMBAT.armorK} armour a blow does half.` },
  block: { name: 'Block', icon: 'ui:shield', text: () => `The chance to catch a blow on the shield: it does no harm. Full from the front, ${pc(COMBAT.sideBlock)} of it from the side, none from behind; missiles are caught ×${COMBAT.missileBlock} as often. At most ${pc(COMBAT.maxBlock)}. A ${term('shieldBreaker', 'Shield Breaker')} ignores part of it.` },
  accuracy: { name: 'Accuracy', icon: 'ui:eye', text: () => `The chance a blow or missile hits. Missiles lose up to ${pc(COMBAT.falloff)} of it at full range and hit men in forest less. Raised by ${term('agi')}.` },
  blow: { name: 'Blow', icon: 'ui:hourglass', text: () => `Seconds between two blows (or shots). ${term('agi')} shortens it.` },
  survive: { name: 'Survive', icon: 'power:second_wind', text: () => `When he falls, the chance he is only ${term('wounded', 'wounded')} and not killed: ${pc(FALL.wounded)}, +${pc(FALL.perEnd)} for each point of ${term('end')} above ${ATTR_BASE}, more with a ${term('civ_physician', 'Physician')} near; at most ${pc(FALL.cap)}.` },
  reach: { name: 'Reach', icon: 'ui:spear', text: () => 'How far his weapon strikes, in tiles. A long spear hits first.' },
  range: { name: 'Range', icon: 'ui:aimed', text: () => 'How far his missiles fly, in tiles; farther from higher ground.' },
  ammo: { name: 'Ammunition', icon: 'item:gorytos_bow', text: () => 'Missiles he carries into a fight. Once spent he fights hand to hand.' },
  str: { name: 'Strength', icon: 'ui:bond', text: () => attrText('str') },
  agi: { name: 'Agility', icon: 'ui:fast', text: () => attrText('agi') },
  end: { name: 'Endurance', icon: 'ui:stamina', text: () => attrText('end') },
  wil: { name: 'Will', icon: 'power:unshaken', text: () => attrText('wil') },
  passive: { name: 'Passive', icon: 'ui:check', text: () => 'Always on: it is part of his numbers.' },
  fight: { name: 'In the fight', icon: 'ui:swords', text: () => 'Works by itself when its moment comes in a fight. A man carries at most three such marks.' },
  active: { name: 'Squad active', icon: 'ui:horn', text: () => `One per squad, from its best-ranked man who knows one: press F (or the button on the command card) and the whole squad has it for ${sec(ACTIVE.buff)}. Back after ${sec(ACTIVE.cooldown)}, sooner with the leader's ${term('wil')}.` },
  slot: { name: 'Skill slot', icon: 'ui:plus', text: () => `A man learns two skills in his life, at levels ${SKILL_LEVELS.join(' and ')}, from his family's four. The choice is for good.` },
  points: { name: 'Attribute points', icon: 'ui:tgstar', text: () => `+${POINTS_PER_LEVEL} every level, put into one attribute; ${ATTR_MAX} is the most.` },
  elite: { name: 'Elite', icon: 'ui:captain', text: () => 'At level 6 a man of proven worth wears gold pips; with the rare kit of his family, at a fortress, he becomes its elite class. An elite eats twice in the field.' },
  xp: { name: 'Experience', icon: 'ui:xp', text: () => 'From damage dealt, kills, fights survived and objectives taken. A wounded man keeps half.' },
  honour: { name: 'Honour', icon: 'ui:laurel', text: () => 'A name won in battle ("Held the Ford"): +2% to one number. At most three.' },
  wounded: { name: 'Wounded', icon: 'power:blood_price', text: () => 'Out of the fight until he heals: in the field, at a camp, in a town or, fastest, in a physician\'s house.' },
  reserve: { name: 'Reserve', icon: 'ui:tent', text: () => 'Fit and waiting at camp: not in a squad in the field.' },
  captive: { name: 'Captive', icon: 'ui:lock', text: () => 'Held in an enemy fort: ransom him, raid the fort, or he walks home after a day.' },
  fallen: { name: 'Fallen', icon: 'ui:skull', text: () => 'Dead. His gear lies where he fell.' },
  influence: { name: 'Influence', icon: 'ui:flag', text: () => 'The ground a building claims for its owner: you build, gather and work inside it.' },
  store: { name: 'Store', icon: 'ui:chest', text: () => 'Holds your goods; all your stores in a region share one stock. Builders and crafters draw from it.' },
  labour: { name: 'Labour', icon: 'ui:repair', text: () => 'Work to raise it: more builders finish it sooner, an engineer half again as fast.' },
  burns: { name: 'Burns', icon: 'ui:fire', text: () => 'Wood: fire arrows and torches set it alight; wet hides or a well near help.' },
  walkway: { name: 'Walkway', icon: 'ui:ladder', text: () => 'Men on it stand above the attackers: they strike harder, shoot farther and are reached only by stairs, ladders or a tower\'s door.' },
  recipe: { name: 'Recipe', icon: 'ui:log', text: () => 'One thing a workplace makes from goods, by a crafter who holds the node it needs.' },
  ...Object.fromEntries(Object.entries(CIV_CLASSES).map(([id, c]) => [id, { name: c.name, icon: CIV_ICON[id as CivClassId], text: () => c.desc }])),
  shieldBreaker: { name: 'Shield Breaker', icon: 'ui:sunder', text: () => skillEffects('shieldBreaker').join(' ') },
};

// ------------------------------------------------------------------ card building blocks

/** A coloured value: good (green), bad (red) or plain. */
export const val = (t: string, tone: 'pos' | 'neg' | '' = 'pos') => `<b class="cx-v${tone ? ' ' + tone : ''}">${t}</b>`;
/** One effect line: an icon, then the words. */
export const fx = (icon: string, html: string) => `<div class="cx-fx">${glyph(icon, 14)}<span>${html}</span></div>`;

export interface CardOpts {
  icon: string;
  name: string;
  /** Small caps under the name (kind, slot, level). */
  kind?: string;
  /** A name colour (rarity). */
  color?: string;
  flavour?: string;
  /** Effect lines (HTML, ./fx). */
  fx?: string[];
  /** Below the effects, before the state (a before/after, notes). */
  more?: string;
  /** The last line: what he can do with it now. */
  state?: { tone: 'good' | 'bad' | 'gold' | 'dim'; icon: string; text: string };
  /** Width in art px. */
  w?: number;
  /** The icon is HTML already (an item or kit icon), not an atlas key. */
  rawIcon?: boolean;
}

/** A description card: icon, name and kind, the flavour line, the effects, the state. */
export function card(o: CardOpts): string {
  const ic = o.rawIcon ? o.icon : glyph(o.icon, 26);
  return `<div class="cx" style="width:${o.w ?? 236}px">
    <div class="cx-head"><span class="cx-ic">${ic}</span><div style="min-width:0"><div class="cx-name"${o.color ? ` style="color:${o.color}"` : ''}>${o.name}</div>${o.kind ? `<div class="cx-kind">${o.kind}</div>` : ''}</div></div>
    ${o.flavour ? `<div class="cx-flav">${esc(o.flavour)}</div>` : ''}
    ${o.fx?.length ? `<div class="cx-rule"></div>${o.fx.join('')}` : ''}
    ${o.more ? `<div class="cx-rule"></div>${o.more}` : ''}
    ${o.state ? `<div class="cx-state ${o.state.tone}">${glyph(o.state.icon, 13)}<span>${o.state.text}</span></div>` : ''}
  </div>`;
}

/** The nested card of a term. */
export function termCard(id: string): string {
  const t = TERMS[id];
  if (!t) return '';
  return `<div class="cx" style="width:210px"><div class="cx-head"><span class="cx-ic sm">${glyph(t.icon, 20)}</span><div class="cx-name">${t.name}</div></div><div class="cx-body">${t.text()}</div></div>`;
}

// ------------------------------------------------------------------ attributes

export const ATTR_ICON: Record<AttrId, string> = { str: 'ui:bond', agi: 'ui:fast', end: 'ui:stamina', wil: 'power:unshaken' };
export const ATTR_FLAVOUR: Record<AttrId, string> = {
  str: 'Bronze is heavy. So is the arm that swings it well.',
  agi: 'Quick feet keep a man alive; quick hands end the fight.',
  end: 'The march, the heat, the third hour of the fight: he is still standing.',
  wil: 'When the line wavers, the squad looks to the steadiest man.',
};
/** What one point above ATTR_BASE does, as effect lines. */
export function attrEffects(a: AttrId): string[] {
  switch (a) {
    case 'str': return [fx('ui:sword', `${val('+' + num(ATTR_EFFECT.strDmg))} ${term('melee')}`), fx('ui:heart', `${val('+' + num(ATTR_EFFECT.strHp))} ${term('health')}`)];
    case 'agi': return [fx('ui:hourglass', `${val('−' + pc(ATTR_EFFECT.agiTempo))} ${term('blow')} time, blows and shots`), fx('ui:eye', `${val('+' + pc(ATTR_EFFECT.agiAccuracy))} ${term('accuracy')}`)];
    case 'end': return [fx('ui:heart', `${val('+' + num(ATTR_EFFECT.endHp))} ${term('health')}`), fx('power:second_wind', `${val('+' + pc(FALL.perEnd))} to ${term('survive')} a fall`)];
    case 'wil': return [fx('ui:clock', `${term('active')} back ${val(pc(ACTIVE.perWil))} sooner, as the squad's leader`)];
  }
}
function attrText(a: AttrId): string {
  const per = {
    str: `+${num(ATTR_EFFECT.strDmg)} ${term('melee')} and +${num(ATTR_EFFECT.strHp)} ${term('health')}`,
    agi: `blows and shots ${pc(ATTR_EFFECT.agiTempo)} quicker and +${pc(ATTR_EFFECT.agiAccuracy)} ${term('accuracy')}`,
    end: `+${num(ATTR_EFFECT.endHp)} ${term('health')} and +${pc(FALL.perEnd)} to ${term('survive')} a fall`,
    wil: `the ${term('active')} back ${pc(ACTIVE.perWil)} sooner when he leads the squad`,
  }[a];
  return `<i>${ATTR_FLAVOUR[a]}</i><br>Each point above ${ATTR_BASE}: ${per}.`;
}

// ------------------------------------------------------------------ skills

export const SKILL_ICON: Record<WarSkillId, string> = {
  shieldDrill: 'power:aegis', phalangite: 'ui:spear', holdFast: 'ui:hold', shieldWall: 'ui:f_wall',
  brawler: 'power:frenzy', shieldBreaker: 'ui:sunder', finisher: 'power:executioner', berserk: 'ui:berserk',
  deepQuiver: 'item:gorytos_bow', eagleEye: 'power:eagle_eye', fireArcher: 'ui:raid', volley: 'ui:volley',
  horsemanship: 'item:bucephalus_bit', lanceCharge: 'ui:push', rideDown: 'power:momentum', wheel: 'ui:recharge',
};
export const SKILL_NAME: Record<WarSkillId, string> = {
  shieldDrill: 'Shield Drill', phalangite: 'Phalangite', holdFast: 'Hold Fast', shieldWall: 'Shield Wall',
  brawler: 'Brawler', shieldBreaker: 'Shield Breaker', finisher: 'Finisher', berserk: 'Berserk',
  deepQuiver: 'Deep Quiver', eagleEye: 'Eagle Eye', fireArcher: 'Fire Archer', volley: 'Volley',
  horsemanship: 'Horsemanship', lanceCharge: 'Lance Charge', rideDown: 'Ride Down', wheel: 'Wheel and Re-charge',
};
export const SKILL_FLAVOUR: Record<WarSkillId, string> = {
  shieldDrill: 'A thousand mornings in the yard, until the hoplon is part of the arm.',
  phalangite: 'Eight cubits of ash and iron. The front rank sees the enemy; the fifth rank kills him.',
  holdFast: 'Told to hold, he becomes a stone in the river.',
  shieldWall: 'Rims locked, heads down. Let them break their spears on bronze.',
  brawler: 'He learned to fight in tavern yards and never unlearned it.',
  shieldBreaker: 'Strike the rim, not the man. The man comes after.',
  finisher: 'A wounded foe is still a foe, until he is not.',
  berserk: 'The war-cry rises, and caution stays behind with the baggage.',
  deepQuiver: 'A second quiver at the hip, and the patience to empty both.',
  eagleEye: 'He picks out the man without a helmet at two hundred paces.',
  fireArcher: 'Pitch, flax and a brazier: wooden walls fear him more than men do.',
  volley: 'One command, one breath, one dark cloud over the enemy line.',
  horsemanship: 'Born on horseback on the Thessalian plain.',
  lanceCharge: 'The weight of the horse behind the point of the lance.',
  rideDown: 'Men who run from horsemen only die tired.',
  wheel: 'Strike, turn away, re-form, and strike again.',
};
export const KIND_TERM = { P: 'passive', F: 'fight', A: 'active' } as const;

/** A skill's effects as lines, from its SKILLS / ACTIVES / FLAG_FX numbers. */
export function skillEffects(id: WarSkillId): string[] {
  const d: SkillDef = SKILLS[id], out: string[] = [];
  if (d.family === 'rider') return [fx('ui:lock', 'Waits for horses: the war has no mounts yet.')];
  if (d.block) out.push(fx('ui:shield', `${val('+' + pc(d.block))} ${term('block')}`));
  if (d.armor) out.push(fx('ui:armor', `${val('+' + num(d.armor))} ${term('armour')}`));
  if (d.reach) out.push(fx('ui:spear', `${val('+' + num(d.reach))} ${term('reach')}`));
  if (d.dmg) out.push(fx('ui:sword', `${val('+' + num(d.dmg))} ${term('melee')}`));
  if (d.accuracy) out.push(fx('ui:eye', `${val('+' + pc(d.accuracy))} ${term('accuracy')}`));
  if (d.ammo) out.push(fx('item:gorytos_bow', `${val('+' + pc(d.ammo - 1))} ${term('ammo')}`));
  if (d.range) out.push(fx('ui:aimed', `${val('+' + num(d.range))} ${term('range')}`));
  if (d.bp) out.push(fx('ui:sunder', `ignores ${val(pc(d.bp))} of the target's ${term('block')}`));
  if (id === 'holdFast') out.push(fx('ui:hold', `${val('+' + pc(FLAG_FX.holdBlock - 1))} ${term('block')} while his squad holds (H)`));
  if (id === 'finisher') out.push(fx('power:executioner', `${val('+' + pc(FLAG_FX.finishDmg - 1))} damage to men below ${pc(FLAG_FX.finishHp)} ${term('health')}`));
  if (id === 'fireArcher') out.push(fx('ui:fire', `lights fire arrows from a brazier ${val('×' + FLAG_FX.fireReach)} as far away`), fx('ui:amphora', `${val(pc(FLAG_FX.firePitch))} of the pitch per fire arrow`));
  const a = ACTIVES[id];
  if (a) {
    if (a.out !== 1) out.push(fx('ui:sword', `${val(`${a.out > 1 ? '+' : '−'}${pc(Math.abs(a.out - 1))}`, a.out > 1 ? 'pos' : 'neg')} damage dealt by the squad`));
    if (a.in !== 1) out.push(fx('ui:armor', `${val(`${a.in > 1 ? '+' : '−'}${pc(Math.abs(a.in - 1))}`, a.in < 1 ? 'pos' : 'neg')} damage taken by the squad`));
    out.push(fx('ui:clock', `for ${sec(ACTIVE.buff)}, back after ${sec(ACTIVE.cooldown)}`));
  }
  return out;
}

// ------------------------------------------------------------------ battle stats

/** The card numbers: atlas icon and the term behind each label of ./roster/ui.ts statRows. */
export const STAT_TERM: Record<string, { icon: string; term: string }> = {
  HP: { icon: 'ui:heart', term: 'health' }, Melee: { icon: 'ui:sword', term: 'melee' }, Missile: { icon: 'ui:throw', term: 'missile' },
  Armour: { icon: 'ui:armor', term: 'armour' }, Block: { icon: 'ui:shield', term: 'block' }, Accuracy: { icon: 'ui:eye', term: 'accuracy' },
  Blow: { icon: 'ui:hourglass', term: 'blow' }, Survive: { icon: 'power:second_wind', term: 'survive' },
};

// ------------------------------------------------------------------ buildings and engines

interface BuildText { flavour: string; role: string; for: string }
/** What each building a player places is for (the facts come from BUILDINGS below). */
export const BUILD_TEXT: Partial<Record<BuildingType, BuildText>> = {
  camp: { role: 'Holding', flavour: 'A ditch, a fire and a flag: here begins a claim.', for: `the first foothold in a region: it claims ground around it, is a ${term('store')} for your goods and heals the hurt nearby. Lose your last one and the region slips away.` },
  storehouse: { role: 'Store', flavour: 'Amphorae in rows, counted twice a day.', for: `a ${term('store')} near the work, so gatherers and builders walk less. Upgrade it into a sorting floor for charcoal, linen and leather.` },
  outpost: { role: 'Holding', flavour: 'Four men and a watch-fire see a long way.', for: `claims ground far from camp and keeps a lookout: it sees over the fog around it.` },
  fort: { role: 'Holding', flavour: 'Stone on stone, until the hill itself is a wall.', for: `the strongpoint of a region: a big claim, a ${term('store')}, healing for the hurt, a lookout, and the place where captives are kept.` },
  barracks: { role: 'Training', flavour: 'Here a farmer learns which end of the spear is which.', for: 'trains fit men at home into line and shock soldiers (hoplites, swordsmen): ten minutes and a kit each.' },
  farm: { role: 'Food', flavour: 'Barley, beans and a patient ox.', for: 'a field that grows food for gatherers to bring in; it regrows over time.' },
  olivePress: { role: 'Food · workplace', flavour: 'The tree of Athena gives twice: fruit, then oil.', for: `a grove that yields food, and a press where a ${term('civ_forager', 'Forager')} makes oil.` },
  woodTower: { role: 'Defence', flavour: 'Timber legs and a good view of the road.', for: `a platform over the wall line: archers on it shoot farther and are hard to reach.` },
  stoneTower: { role: 'Defence', flavour: 'Its door opens only from the inside.', for: `a stone platform with an inner stair: archers on it shoot farther; only your own men use its door.` },
  forge: { role: 'Workplace', flavour: 'Bronze is copper, tin and patience.', for: `arms for your men: a ${term('civ_smith', 'Smith')} here smelts bronze, makes weapons and armour and mends worn gear.` },
  cookhouse: { role: 'Workplace', flavour: 'An army marches on barley bread and onions.', for: `a ${term('civ_cook', 'Cook')} turns food and salt into rations and dishes: a fed squad takes less harm and heals faster.` },
  infirmary: { role: 'Workplace', flavour: 'Vinegar, linen and a steady hand.', for: `a ${term('civ_physician', 'Physician')} heals the wounded here and makes bandages, salves and theriac.` },
  workshop: { role: 'Workplace', flavour: 'Saws, adzes and the smell of fresh pine.', for: `an ${term('civ_engineer', 'Engineer')} makes tools, carts and siege engines here.` },
  stall: { role: 'Workplace', flavour: 'Everything has a price; the trick is to know it first.', for: `a ${term('civ_merchant', 'Merchant')} sells your surplus for silver, posts offers and takes contracts.` },
  sortingFloor: { role: 'Workplace · store', flavour: 'Nothing the land gives is wasted.', for: `still a ${term('store')}; a ${term('civ_forager', 'Forager')} burns charcoal and spins linen here (leather at level 2).` },
  palisade: { role: 'Wall', flavour: 'Sharpened stakes, shoulder to shoulder.', for: 'a cheap, quick line that stops men and carts until it is cut or burned.' },
  rampart: { role: 'Wall', flavour: 'Earth and timber, with a walk on top.', for: `a thick wall with a ${term('walkway')}: your men fight from above.` },
  stoneWall: { role: 'Wall', flavour: 'Fire does not take it; only stone breaks stone.', for: `the strongest wall, with a high ${term('walkway')}; only a stone thrower brings it down.` },
  woodStairs: { role: 'Access', flavour: 'Up, and quickly.', for: `lets your men climb onto a ${term('walkway')} from the inside.` },
  stoneStairs: { role: 'Access', flavour: 'Worn smooth by a hundred sentries.', for: `a lasting way up onto a ${term('walkway')} from the inside.` },
  ladder: { role: 'Access', flavour: 'Lean it, hold it, climb.', for: 'one man at a time onto any wall or tower.' },
  woodBridge: { role: 'Crossing', flavour: 'Planks over the water, and a prayer.', for: 'a quick way across a river; it burns.' },
  stoneBridge: { role: 'Crossing', flavour: 'Arches that will outlast their builders.', for: 'a lasting way across a river that fire cannot take.' },
  stakes: { role: 'Field work', flavour: 'A horse will not run onto a point.', for: 'slows and hurts foes crossing it; engines cannot pass.' },
  ditch: { role: 'Field work', flavour: 'Dig, and let the ground fight for you.', for: 'foes cross it slowly and engines not at all; it costs only work.' },
  chest: { role: 'Store', flavour: 'Oak, iron bands and a lock.', for: `holds ${BUILDINGS.chest.chest} loads of your goods, yours alone; up to ${CHEST.cap} in a region. A foe loots it only with none of your men within ${CHEST.guard} tiles.` },
};
export const SIEGE_TEXT: Partial<Record<SiegeType, BuildText>> = {
  ram: { role: 'Engine', flavour: 'A tree trunk, an iron head and six strong backs.', for: `breaks gates and walls: ${RAM.dmg} damage a stroke against wood.` },
  stoneThrower: { role: 'Engine', flavour: 'Torsion, timber and a stone the size of a man\'s chest.', for: `hurls stones up to ${THROWER.range} tiles at walls and towers; deploy it first (Y).` },
  siegeLadder: { role: 'Engine', flavour: 'Up and over, before they push it down.', for: `raised against a wall, men climb to its ${term('walkway')}; defenders may push it off (a fall costs ${pc(LADDER.fall)} of a man's health).` },
  mantlet: { role: 'Engine', flavour: 'A wicker wall on wheels.', for: `men behind it dodge ${pc(MANTLET.cover)} of missiles as it rolls forward.` },
  coveredRam: { role: 'Engine', flavour: 'A roof of wet hides over the ram\'s crew.', for: `a ram whose crew dodges ${pc(COVERED.cover)} of missiles; it burns slower.` },
  oxybeles: { role: 'Engine', flavour: 'A great bow that shoots a bolt through two shields.', for: 'a bolt-thrower that picks men off from far away.' },
  handcart: { role: 'Cart', flavour: 'Two wheels, two men and whatever they can carry.', for: 'moves goods between your stores, chests and the market towns; a foe can stop it and take its load.' },
  wagon: { role: 'Cart', flavour: 'A mule team and a driver who never hurries.', for: 'moves twice the loads of a handcart, slower; a foe can stop it and take its load.' },
  siegeTower: { role: 'Engine', flavour: 'A wooden keep that walks.', for: `rolls up to a wall and drops a bridge onto its ${term('walkway')}: ${SIEGE.siegeTower.crew} crew push it.` },
};

/** A building type as words, its level as a numeral: forge2 -> Forge II, stoneWall -> Stone wall. */
const nice = (t: BuildingType) => {
  const w = t.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase()).replace(/\d$/, '').trim(), lv = BUILDINGS[t].workplace?.level ?? 1;
  return w.charAt(0).toUpperCase() + w.slice(1) + (lv > 1 ? ' ' + 'I'.repeat(lv) : '');
};

/** The facts of building type t as effect lines: claim, store, workplace, yields, walls, upgrade, fire. */
export function buildingFacts(t: BuildingType): string[] {
  const d = BUILDINGS[t], out: string[] = [];
  if (d.influence) out.push(fx('ui:flag', `claims ${val(String(d.influence), '')} tiles around it (${term('influence')})`));
  if (d.store) out.push(fx('ui:chest', `a ${term('store')} of your goods`));
  if (d.workplace && d.workplace.kind !== 'press') {
    const rs = Object.values(RECIPES).filter((r) => r.at === d.workplace!.kind && r.lv <= d.workplace!.level);
    out.push(fx('ui:log', `opens ${val(String(rs.length), '')} ${term('recipe', rs.length === 1 ? 'recipe' : 'recipes')} · ${d.workplace.level} crafter${d.workplace.level > 1 ? 's' : ''} at once`));
  }
  if (d.yields) out.push(fx('goods:food', `${val(String(d.yields.max), '')} ${d.yields.res} to gather, regrows ${d.yields.regrow}/s`));
  if (d.walk) out.push(fx('ui:ladder', `${term('walkway')} ${d.walk} levels up${d.cap ? `, room for ${d.cap}` : ''}`));
  if (d.upgrade) out.push(fx('ui:advance', `upgrades in place to ${val(nice(d.upgrade.to), '')}${BUILDINGS[d.upgrade.to].workplace ? ': more recipes, one more crafter' : ''}`));
  if (d.burnable) out.push(fx('ui:fire', `${term('burns', 'burns')}`));
  return out;
}

// ------------------------------------------------------------------ ready cards

export const ATTR_NAME: Record<AttrId, string> = { str: 'Strength', agi: 'Agility', end: 'Endurance', wil: 'Will' };

/** What his value v of attribute a gives him now (against ATTR_BASE). */
export function attrNow(a: AttrId, v: number): string {
  const d = v - ATTR_BASE, s = (x: number, t: string) => `${x >= 0 ? '+' : '−'}${t}`;
  if (!d) return `at ${ATTR_BASE}: no bonus yet`;
  switch (a) {
    case 'str': return `${s(d, num(Math.abs(d * ATTR_EFFECT.strDmg)))} melee, ${s(d, num(Math.abs(d * ATTR_EFFECT.strHp)))} health`;
    case 'agi': return `${s(-d, pc(Math.abs(d * ATTR_EFFECT.agiTempo)))} blow time, ${s(d, pc(Math.abs(d * ATTR_EFFECT.agiAccuracy)))} accuracy`;
    case 'end': return `${s(d, num(Math.abs(d * ATTR_EFFECT.endHp)))} health, ${s(d, pc(Math.abs(d * FALL.perEnd)))} survive`;
    case 'wil': return `squad active every ${sec(Math.round(ACTIVE.cooldown * Math.max(0.5, 1 - ACTIVE.perWil * Math.max(0, d))))}`;
  }
}

/** An attribute's card: per-point effects, what his value gives now, and an optional state line. */
export const attrCard = (a: AttrId, v: number, state?: CardOpts['state'], more = '') => card({
  icon: ATTR_ICON[a], name: ATTR_NAME[a], kind: `Attribute · ${v} of ${ATTR_MAX}`, flavour: ATTR_FLAVOUR[a],
  fx: [`<div class="cx-tag" style="margin:1px 0 2px">each point above ${ATTR_BASE}</div>`, ...attrEffects(a)],
  more: `<div class="cx-fx">${glyph('ui:check', 14)}<span>at ${v}: ${val(attrNow(a, v), '')}</span></div>${more}`, state,
});

/** A skill's card: kind and slot, flavour, effects, an optional before/after and state line. */
export function skillCard(id: WarSkillId, where: string, state?: CardOpts['state'], more = ''): string {
  const k = SKILLS[id].kind;
  return card({
    icon: SKILL_ICON[id], name: SKILL_NAME[id], kind: `${TERMS[KIND_TERM[k]].name}${where ? ' · ' + where : ''}`,
    flavour: SKILL_FLAVOUR[id], fx: [...skillEffects(id), ...(k === 'A' ? [fx('ui:horn', `one per squad, from its best-ranked man (${term('active', 'how it works')})`)] : [])], more, state,
  });
}

/** A battle number's card: its value and what it means. */
export const statCard = (label: string, value: string) => {
  const s = STAT_TERM[label], t = s && TERMS[s.term];
  return t ? card({ icon: s.icon, name: `${t.name} <span style="color:var(--rf-ink)">${value}</span>`, w: 220, more: `<div>${t.text()}</div>` }) : label;
};

/** A building's or engine's card for the build bar: role, flavour, what it is for, its facts, then `foot` (cost). */
export function buildCard(kind: 'building' | 'siege', t: string, name: string, icon: string, foot: string, why = ''): string {
  const text = kind === 'building' ? BUILD_TEXT[t as BuildingType] : SIEGE_TEXT[t as SiegeType];
  return card({
    icon, rawIcon: true, name, kind: text?.role, flavour: text?.flavour, w: 250,
    fx: [...(text ? [`<div><span class="cx-tag">For</span>${text.for}</div>`] : []), ...(kind === 'building' ? buildingFacts(t as BuildingType) : [])],
    more: foot, state: why ? { tone: 'bad', icon: 'ui:lock', text: why } : undefined,
  });
}
