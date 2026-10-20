/**
 * Shared bits of the roster views (M5g) in the red-figure kit (../kit.ts): the item icon atlas (public/icons/items.png,
 * the campaign's painted icons) as CSS sprites, gear and stat texts, skill and attribute notes, a delegated tooltip
 * (any `data-tip` under a root), and the extra CSS of the panel, card and toasts.
 */
import { ATTR_EFFECT } from '../../../../data/perks';
import { itemDef, itemMods, RARITY_LABEL, type Item, type StatMods } from '../../../../data/items';
import { AFFIXES, itemAffixes, itemDisplayName, itemPower, powerText } from '../../../../data/affixes';
import { CIV_TOOLS } from '../../../../data/classes';
import { toolMods } from '../../../../data/recipes';
import { RARITY_COLOR } from '../../../../ui/theme';
import type { WarStats } from '../../../sim/classes';
import { SKILLS } from '../../../sim/skills';
import type { WarSkillId } from '../../../types';
import { placeTip } from '../kit';

type Frame = { x: number; y: number; w: number; h: number };
let atlas: { frames: Record<string, Frame>; w: number } | null = null;
let loading: Promise<void> | null = null;
/** Load the item icon atlas once; views re-render when it is in. */
export function loadItemAtlas(): Promise<void> {
  loading ??= fetch('icons/items.json')
    .then((r) => r.json())
    .then((j: { frames: Record<string, { frame: Frame }>; meta: { size: { w: number } } }) => {
      atlas = { frames: Object.fromEntries(Object.entries(j.frames).map(([k, v]) => [k, v.frame])), w: j.meta.size.w };
    })
    .catch(() => undefined);
  return loading;
}

export const rarityHex = (r: string) => '#' + (RARITY_COLOR[r as keyof typeof RARITY_COLOR] ?? 0x9a948a).toString(16).padStart(6, '0');

/** An item's icon at `px` art px (blank until the atlas is in; a civilian tool: its class's mark). */
export function itemIcon(item: Item, px = 24): string {
  const f = atlas?.frames['item:' + item.def];
  if (!f) {
    const t = CIV_TOOLS[item.def];
    return t ? `<span style="display:flex;width:${px}px;height:${px}px;align-items:center;justify-content:center;font:700 ${Math.round(px / 2.4)}px/1 'Cormorant SC',serif;color:${rarityHex(item.rarity)}">T${t.tier}</span>` : `<span style="display:block;width:${px}px;height:${px}px"></span>`;
  }
  const k = px / f.w;
  return `<span style="display:block;width:${px}px;height:${px}px;background:url(icons/items.png) ${-f.x * k}px ${-f.y * k}px/${atlas!.w * k}px auto no-repeat"></span>`;
}

export const QUALITY = ['crude', 'fine', 'masterwork'] as const;
const badge = (id: string, px: number) => `<img src="war/ui/icons/24/${id}.png" srcset="war/ui/icons/24/${id}@2x.png 2x" width="${px}" height="${px}" alt="">`;
/** Crafted items (M5h, ART-C badges): the quality mark bottom left and the rarity gem bottom right of an icon box. */
export function itemBadges(item: Item, px = 10): string {
  if (item.q === undefined) return '';
  return `<span class="rr-badge" style="left:-2px">${badge(`badge-quality-${QUALITY[item.q]}`, px)}</span><span class="rr-badge" style="right:-2px">${badge(`badge-rarity-${item.rarity}`, px)}</span>`;
}

/** Rolled stats of an item as "Keen +1.0 damage"-style rows. */
function rolled(item: Item): string[] {
  const aff = CIV_TOOLS[item.def] ? (item.aff ? item.aff.split(',').map((x) => x.split(':')).map(([k, v]) => [k, Number(v)] as const) : []) : itemAffixes(item);
  return aff.map(([k, n]) => { const a = AFFIXES[k as keyof typeof AFFIXES]; return a ? `${a.word} <span class="rf-num" style="color:#f0d9b5">${n}</span>` : ''; }).filter(Boolean);
}

/** Quality, maker and condition of an item (crafted ones; else condition alone). */
function made(item: Item): string {
  const q = item.q === undefined ? '' : `<span style="color:${item.q === 2 ? '#e0b867' : item.q === 0 ? '#a8907a' : '#f0d9b5'}">${QUALITY[item.q]}</span> · `;
  const mk = item.mk ? `made by ${item.mk} · ` : '';
  return `<div class="rf-dim" style="margin-top:3px">${q}${mk}condition ${Math.round(item.cond)}/${item.mc ?? 100}</div>`;
}

const MOD_LABEL: Partial<Record<keyof StatMods, [string, (v: number) => string]>> = {
  hp: ['HP', (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`],
  dmg: ['damage', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`],
  rangedDmg: ['missile dmg', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`],
  range: ['range', (v) => `${v}`],
  ammo: ['ammo', (v) => `${Math.round(v)}`],
  reach: ['reach', (v) => v.toFixed(1)],
  atkTime: ['attack', (v) => `${v.toFixed(1)} s`],
  shotTime: ['shot', (v) => `${v.toFixed(1)} s`],
  armor: ['armour', (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`],
  block: ['block', (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`],
  accuracy: ['accuracy', (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`],
  blockPierce: ['block pierce', (v) => `${Math.round(v * 100)}%`],
  armorPierce: ['armour pierce', (v) => `${Math.round(v * 100)}%`],
  speed: ['speed', (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`],
  atkSpeed: ['attack speed', (v) => `+${Math.round(v * 100)}%`],
  koChance: ['survive', (v) => `+${Math.round(v * 100)}%`],
};

/** An item's tooltip: name in its rarity colour, rarity and tier, its stats, power, condition. */
export function itemTip(item: Item, attrs?: Parameters<typeof itemMods>[1]): string {
  const tool = CIV_TOOLS[item.def];
  if (tool) {
    const m = toolMods(item), r = rolled(item);
    return `<div class="rf-name" style="font-size:13px;color:${rarityHex(item.rarity)}">${tool.name.replace(/^./, (c) => c.toUpperCase())}</div>
    <div class="rf-dim" style="margin:2px 0 3px">${RARITY_LABEL[item.rarity]} · tier ${tool.tier} · tool</div>
    ${m.deft ? `<div class="rf-dim">work rate <span class="rf-num" style="color:#f0d9b5">+${Math.round(m.deft * 100)}%</span></div>` : ''}${m.bountiful ? `<div class="rf-dim">output <span class="rf-num" style="color:#f0d9b5">+${Math.round(m.bountiful * 100)}%</span></div>` : ''}
    ${r.length ? `<div class="rf-dim">${r.join(' · ')}</div>` : ''}${made(item)}`;
  }
  const def = itemDef(item.def), mods = itemMods(item, attrs) as Record<string, number>;
  const lines = Object.entries(mods).flatMap(([k, v]) => {
    const l = MOD_LABEL[k as keyof StatMods];
    return l && v ? [`<div>${l[0]} <span class="rf-num" style="color:#f0d9b5">${l[1](v)}</span></div>`] : [];
  });
  const pow = itemPower(item);
  return `<div class="rf-name" style="font-size:13px;color:${rarityHex(item.rarity)}">${itemDisplayName(item)}</div>
    <div class="rf-dim" style="margin:2px 0 3px">${RARITY_LABEL[item.rarity]} · tier ${def.tier} · ${def.slot}</div>
    <div class="rf-dim" style="display:grid;grid-template-columns:auto auto;gap:1px 8px">${lines.join('')}</div>
    ${item.aff ? `<div class="rf-dim" style="margin-top:2px">rolled: ${rolled(item).join(' · ')}</div>` : ''}
    ${pow ? `<div style="margin-top:3px;color:#de8a4e;white-space:normal;width:170px">${powerText(pow)}</div>` : ''}
    ${made(item)}`;
}

export const ATTR_NAME = { str: 'Strength', agi: 'Agility', end: 'Endurance', wil: 'Will' } as const;
export const ATTR_NOTE = {
  str: `+${ATTR_EFFECT.strDmg} melee damage and +${ATTR_EFFECT.strHp} HP per point above 5`,
  agi: `faster blows and shots (${ATTR_EFFECT.agiTempo * 100}%), +${ATTR_EFFECT.agiAccuracy * 100}% accuracy per point`,
  end: `+${ATTR_EFFECT.endHp} HP per point; +3% to be wounded, not killed, when he falls`,
  wil: 'the squad active comes back 2.5% sooner per point (as its leader)',
} as const;

export const SKILL_NAME: Record<WarSkillId, string> = {
  shieldDrill: 'Shield Drill', phalangite: 'Phalangite', holdFast: 'Hold Fast', shieldWall: 'Shield Wall',
  brawler: 'Brawler', shieldBreaker: 'Shield Breaker', finisher: 'Finisher', berserk: 'Berserk',
  deepQuiver: 'Deep Quiver', eagleEye: 'Eagle Eye', fireArcher: 'Fire Archer', volley: 'Volley',
  horsemanship: 'Horsemanship', lanceCharge: 'Lance Charge', rideDown: 'Ride Down', wheel: 'Wheel and Re-charge',
};
export const SKILL_NOTE: Record<WarSkillId, string> = {
  shieldDrill: '+6% block, +1 armour', phalangite: '+0.15 reach, +1 damage', holdFast: '+30% block while the squad holds', shieldWall: 'squad active: half damage taken for 8 s',
  brawler: '+1.2 melee damage', shieldBreaker: 'ignores 10% of the target\'s block', finisher: '+30% damage to men below 40% HP', berserk: 'squad active: +40% damage dealt, +20% taken for 8 s',
  deepQuiver: '+40% ammo, +1 range', eagleEye: '+6% accuracy', fireArcher: 'brazier reach x2, half the pitch per fire arrow', volley: 'squad active: +25% missile damage for 8 s',
  horsemanship: 'mounted (waits for horses)', lanceCharge: 'mounted (waits for horses)', rideDown: 'mounted (waits for horses)', wheel: 'mounted (waits for horses)',
};
export const KIND_NAME = { P: 'passive', F: 'in the fight', A: 'squad active' } as const;
export const skillKind = (id: WarSkillId) => SKILLS[id].kind;

/** The baked numbers a card shows and a level-up previews: label, value text, number to compare. */
export function statRows(s: WarStats): [string, string, number][] {
  const rows: [string, string, number][] = [
    ['HP', String(Math.round(s.maxHp)), Math.round(s.maxHp)],
    ['Melee', s.dmg.toFixed(1), Math.round(s.dmg * 10) / 10],
  ];
  if (s.range > 0) rows.push(['Missile', s.rangedDmg.toFixed(1), Math.round(s.rangedDmg * 10) / 10]);
  rows.push(
    ['Armour', (Math.round(s.armor * 10) / 10).toString(), Math.round(s.armor * 10) / 10],
    ['Block', `${Math.round(s.block * 100)}%`, Math.round(s.block * 100)],
    ['Accuracy', `${Math.round(s.accuracy * 100)}%`, Math.round(s.accuracy * 100)],
    ['Blow', `${(s.atkTicks / 10).toFixed(1)} s`, -s.atkTicks],
    ['Survive', `${Math.round(s.ws * 100)}%`, Math.round(s.ws * 100)],
  );
  return rows;
}

/** A delegated tooltip: any element under `root` with data-tip shows it in the kit's tooltip frame above it. */
export function tipper(root: HTMLElement, tip: HTMLElement): () => void {
  let at: HTMLElement | null = null;
  const hide = () => ((tip.style.display = 'none'), (at = null));
  root.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el || el === at) return;
    at = el;
    tip.innerHTML = el.dataset.tip!;
    tip.style.display = '';
    placeTip(tip, el);
  });
  root.addEventListener('pointerout', (e) => {
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]');
    if (to !== at) hide();
  });
  // a re-render removes the hovered element
  return () => { if (at && !at.isConnected) hide(); };
}

/** Escape text for attributes and HTML. */
export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ROSTER_CSS = `
.rr-row{display:flex;align-items:center;gap:4px;height:28px;padding:0 3px 0 6px;cursor:pointer;box-shadow:inset 3px 0 0 transparent}
.rr-row:hover{background:var(--rf-hover)}
.rr-row.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.rr-xp{height:2px;background:#2a1a12;margin-top:2px;position:relative}
.rr-xp i{position:absolute;left:0;top:0;height:2px;background:#c9a24a}
.rr-pip{display:inline-block;width:5px;height:5px;transform:rotate(45deg);background:#de8a4e;box-shadow:0 0 0 1px #0e0907;margin:0 1px}
.rr-pip.gold{background:#e0b867}
.rr-chip{font:600 11px/1 Inter,sans-serif;padding:3px 5px;border:1px solid var(--rf-line);color:var(--rf-ink);background:var(--rf-raised);white-space:nowrap}
.rr-chip.up{border-color:#c9a24a;color:var(--rf-gold)}
.rr-chip.bad{border-color:#8a2a1c;color:var(--rf-bad)}
.rr-slot{width:28px;height:28px;background:#140c08;border:1px solid #7a3418;box-shadow:inset 0 0 0 1px #0e0907;display:flex;align-items:center;justify-content:center;position:relative}
.rr-slot .rr-lab{position:absolute;left:-6px;right:-6px;bottom:-11px;text-align:center;font:600 9px/1 Inter,sans-serif;color:var(--rf-muted)}
.rr-badge{position:absolute;bottom:-2px;line-height:0;pointer-events:none}
.rr-port{width:64px;height:80px;background:radial-gradient(ellipse at 50% 85%,#3a2216 0,#140c08 70%);border:1px solid #7a3418;box-shadow:inset 0 0 0 1px #0e0907}
.rr-port canvas{display:block;width:64px;height:80px;image-rendering:pixelated}
.rr-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 6px;align-items:center}
.rf-tbtn.rr-offer{display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;height:auto;padding:5px 7px;text-align:left;white-space:normal;line-height:1.3}
.rr-up{color:var(--rf-good)}.rr-down{color:var(--rf-bad)}
.rr-toast{transition:opacity .4s, transform .4s;display:flex;align-items:center;gap:4px}
`;
