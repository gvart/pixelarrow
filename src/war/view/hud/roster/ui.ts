/**
 * Shared bits of the roster views (M5g) in the red-figure kit (../kit.ts): the item icon atlas (public/icons/items.png,
 * the campaign's painted icons) as CSS sprites, gear and stat texts, skill and attribute notes, a delegated tooltip
 * (any `data-tip` under a root), and the extra CSS of the panel, card and toasts.
 */
import { itemDef, itemMods, RARITY_LABEL, type Item, type StatMods } from '../../../../data/items';
import { AFFIXES, itemAffixes, itemDisplayName, itemPower, powerText } from '../../../../data/affixes';
import { CIV_TOOLS } from '../../../../data/classes';
import { toolMods } from '../../../../data/recipes';
import { RARITY_COLOR } from '../../../../ui/theme';
import type { WarStats } from '../../../sim/classes';
import { SKILLS } from '../../../sim/skills';
import type { WarSkillId } from '../../../types';
import { placeTip } from '../kit';
import { tipChain } from '../tooltip';
import { card, fx, term, val, type CardOpts } from '../codex';

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
  const mk = item.mk ? `made by ${esc(item.mk)} · ` : '';
  const c = item.cond / (item.mc ?? 100);
  return `<div class="rf-dim" style="margin-top:4px;font-size:11px">${q}${mk}condition <span style="color:${c < 0.35 ? 'var(--rf-bad)' : 'var(--rf-ink)'}">${Math.round(item.cond)}/${item.mc ?? 100}</span></div>`;
}

const sgn = (v: number, t: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${t}`;
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
/** An item's stats as effect lines: icon, value (green up, red down; times and fixed values plain), the term. */
const MOD_FX: Partial<Record<keyof StatMods, (v: number) => string>> = {
  hp: (v) => fx('ui:heart', `${val(sgn(v, String(Math.round(Math.abs(v)))), v < 0 ? 'neg' : 'pos')} ${term('health')}`),
  dmg: (v) => fx('ui:sword', `${val(v.toFixed(1), '')} ${term('melee')}`),
  rangedDmg: (v) => fx('ui:throw', `${val(v.toFixed(1), '')} ${term('missile')}`),
  range: (v) => fx('ui:aimed', `${val(String(v), '')} ${term('range')}`),
  ammo: (v) => fx('item:gorytos_bow', `${val(String(Math.round(v)), '')} ${term('ammo')}`),
  reach: (v) => fx('ui:spear', `${val(v.toFixed(1), '')} ${term('reach')}`),
  atkTime: (v) => fx('ui:hourglass', `${val(`${v.toFixed(1)} s`, '')} ${term('blow')}`),
  shotTime: (v) => fx('ui:hourglass', `${val(`${v.toFixed(1)} s`, '')} a shot`),
  armor: (v) => fx('ui:armor', `${val(sgn(v, String(Math.round(Math.abs(v) * 10) / 10)), v < 0 ? 'neg' : 'pos')} ${term('armour')}`),
  block: (v) => fx('ui:shield', `${val(sgn(v, pct(v)), v < 0 ? 'neg' : 'pos')} ${term('block')}`),
  accuracy: (v) => fx('ui:eye', `${val(sgn(v, pct(v)), v < 0 ? 'neg' : 'pos')} ${term('accuracy')}`),
  blockPierce: (v) => fx('ui:sunder', `ignores ${val(pct(v))} of the target's ${term('block')}`),
  armorPierce: (v) => fx('ui:sunder', `ignores ${val(pct(v))} of the target's ${term('armour')}`),
  speed: (v) => fx('ui:fast', `${val(sgn(v, pct(v)), v < 0 ? 'neg' : 'pos')} speed`),
  atkSpeed: (v) => fx('ui:hourglass', `${val('+' + pct(v))} attack speed`),
  koChance: (v) => fx('power:second_wind', `${val('+' + pct(v))} to ${term('survive')}`),
};
const SLOT_NAME: Record<string, string> = { weapon: 'weapon', armor: 'armour', helmet: 'helmet', shield: 'shield', trinket: 'trinket' };

/** An item's tooltip, as a description card: its icon and name in its rarity colour, rarity, tier and slot, its flavour,
 * its stats, rolled affixes and power, quality, maker and condition; `state` the last line (what a click does). */
export function itemTip(item: Item, attrs?: Parameters<typeof itemMods>[1], state?: CardOpts['state']): string {
  const tool = CIV_TOOLS[item.def], r = rolled(item);
  const ic = itemIcon(item, 26);
  if (tool) {
    const m = toolMods(item);
    return card({
      icon: ic, rawIcon: true, name: tool.name.replace(/^./, (c) => c.toUpperCase()), color: rarityHex(item.rarity), kind: `${RARITY_LABEL[item.rarity]} · tier ${tool.tier} · tool`,
      fx: [...(m.deft ? [fx('ui:repair', `${val('+' + pct(m.deft))} work rate`)] : []), ...(m.bountiful ? [fx('goods:food', `${val('+' + pct(m.bountiful))} output`)] : [])],
      more: (r.length ? `<div class="rf-dim">${r.join(' · ')}</div>` : '') + made(item), state,
    });
  }
  const def = itemDef(item.def), mods = itemMods(item, attrs) as Record<string, number>;
  const lines = Object.entries(mods).flatMap(([k, v]) => { const f = MOD_FX[k as keyof StatMods]; return f && v ? [f(v)] : []; });
  const pow = itemPower(item);
  return card({
    icon: ic, rawIcon: true, name: itemDisplayName(item), color: rarityHex(item.rarity), kind: `${RARITY_LABEL[item.rarity]} · tier ${def.tier} · ${SLOT_NAME[def.slot] ?? def.slot}`,
    flavour: def.desc, fx: lines,
    more: (r.length ? `<div class="rf-dim" style="font-size:11px">rolled: ${r.join(' · ')}</div>` : '') + (pow ? `<div style="margin-top:3px;color:var(--rf-accent)">${powerText(pow)}</div>` : '') + made(item),
    state,
  });
}

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
  const show = (el: HTMLElement) => {
    at = el;
    tip.innerHTML = el.dataset.tip!;
    tip.style.display = '';
    placeTip(tip, el);
    chain.shown(el);
  };
  const hide = () => { tip.style.display = 'none'; at = null; };
  // the chain closed a held tip: show the one under the pointer now, if any
  const chain = tipChain(tip, () => {
    hide();
    const el = [...root.querySelectorAll<HTMLElement>('[data-tip]:hover')].pop();
    if (el && el.offsetParent) show(el);
  });
  root.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el || el === at || chain.isHeld()) return;
    show(el);
  });
  root.addEventListener('pointerout', (e) => {
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]');
    if (to !== at && !chain.holds(e.relatedTarget) && !chain.isHeld()) { hide(); chain.hidden(); }
  });
  // a re-render removes the hovered element
  return () => { if (at && !at.isConnected && !chain.isHeld()) { hide(); chain.hidden(); } };
}

/** Escape text for attributes and HTML. */
export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ROSTER_CSS = `
.rr-list{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#7a3418 #140c08;border-top:1px solid var(--rf-line)}
.rr-row{display:flex;align-items:center;gap:6px;height:31px;padding:0 4px 0 6px;cursor:pointer;box-shadow:inset 3px 0 0 transparent;border-bottom:1px solid #1e140e}
.rr-row:hover{background:var(--rf-hover)}
.rr-row.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.rr-row.dead{opacity:.5}
.rr-row.picked{box-shadow:inset 3px 0 0 var(--rf-gold)}
.rr-row.picked.on{box-shadow:inset 3px 0 0 var(--rf-gold),inset 0 0 0 1px var(--rf-title)}
.rr-nm{font:600 12.5px/1 Inter,sans-serif;color:var(--rf-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rr-xp{height:2px;background:#2a1a12;margin-top:4px;position:relative}
.rr-xp i{position:absolute;left:0;top:0;height:2px;background:linear-gradient(90deg,#a8802f,#e0b867)}
.rr-lvup{display:flex;animation:rr-glow 1.8s ease-in-out infinite}
@keyframes rr-glow{0%,100%{filter:drop-shadow(0 0 1px rgba(224,184,103,.5))}50%{filter:drop-shadow(0 0 4px rgba(224,184,103,1))}}
.rr-st{width:40px;display:flex;justify-content:center;align-items:center}
.rr-mark{display:flex;align-items:center;justify-content:center;width:24px;height:22px}
.rr-cap{display:flex;align-items:center;gap:5px;margin:9px 0 5px 1px}
.rr-cap::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--rf-line),transparent)}
.rr-cap .rf-dim{font:600 11px/1 Inter,sans-serif}
.rr-grp{margin:7px 4px 3px 4px}
.rr-lv{flex:none;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px/1 Cinzel,serif;color:#1e1208;background:radial-gradient(circle at 35% 30%,#f6dc9c,#c9a24a 60%,#7a5a28);box-shadow:0 0 0 1px #0e0907,0 0 0 2px #7a5a28}
.rr-lv.sm{width:19px;height:19px;font-size:10.5px;color:var(--rf-ink);background:#251812;box-shadow:0 0 0 1px #7a5a28}
.rr-bar{flex:1;height:6px;background:#140c08;border:1px solid #3a2418;position:relative}
.rr-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#e8c87a,#a8802f)}
.rr-bar.hp i{background:linear-gradient(#e0644a,#9a2a1a)}
.rr-bar.sm{flex:none;width:36px;height:6px}
.rr-card{padding:4px 8px 8px}
.rr-sub{display:flex;align-items:center;gap:5px;margin-top:5px;color:var(--rf-muted);white-space:nowrap}
.rr-sub .dot{opacity:.5}
.rr-where{display:inline-flex;align-items:center;gap:4px}
.rr-line{display:flex;align-items:center;gap:7px;margin-top:6px}
.rr-line>.rf-dim{font-size:11px;min-width:62px;text-align:right}
.rr-rank{display:inline-flex;align-items:center;gap:3px;padding:1px 6px 1px 2px;font:700 11px/14px Inter,sans-serif;border:1px solid #8a6a2a;color:var(--rf-gold);background:rgba(224,184,103,.08)}
.rr-rank.veteran{border-color:#7a3418;color:var(--rf-accent);background:rgba(222,138,78,.07)}
.rr-pending{display:flex;align-items:center;gap:6px;width:100%;margin:7px 0 1px;padding:5px 7px;border:1px solid #c9a24a;background:linear-gradient(90deg,rgba(224,184,103,.24),rgba(224,184,103,.04));color:var(--rf-gold);font:700 12px/1 Cinzel,serif;box-shadow:0 0 8px rgba(224,184,103,.22);animation:rr-pend 2.4s ease-in-out infinite}
.rr-pending .go{margin-left:auto;font:600 11px/1 Inter,sans-serif;color:var(--rf-ink)}
.rr-pending:hover{background:linear-gradient(90deg,rgba(224,184,103,.34),rgba(224,184,103,.08))}
@keyframes rr-pend{0%,100%{box-shadow:0 0 6px rgba(224,184,103,.18)}50%{box-shadow:0 0 11px rgba(224,184,103,.45)}}
.rr-top{display:flex;gap:9px;margin-top:9px}
.rr-doll{display:grid;grid-template-columns:30px 64px 30px;grid-template-rows:38px 38px 32px;gap:2px 5px;align-items:start;justify-items:center;padding:6px 6px 4px;background:radial-gradient(ellipse at 50% 55%,#2a1a12,#120b08 75%);border:1px solid var(--rf-rule);box-shadow:inset 0 0 0 1px #0e0907}
.rr-slot{width:30px;height:30px;background:#140c08;border:1px solid #7a3418;box-shadow:inset 0 0 0 1px #0e0907;display:flex;align-items:center;justify-content:center;position:relative}
.rr-slot[data-unequip],.rr-slot[data-equip]{cursor:pointer}
.rr-slot[data-unequip]:hover,.rr-slot[data-equip]:hover{border-color:var(--rf-title)}
.rr-slot.empty{border-color:#3a2418;background:#100a07}
.rr-slot.empty .gl{opacity:.2;filter:grayscale(1)}
.rr-slot.no{opacity:.4}
.rr-badge{position:absolute;bottom:-2px;line-height:0;pointer-events:none}
.rr-port{width:64px;height:80px;background:radial-gradient(ellipse at 50% 85%,#3a2216 0,#140c08 70%);border:1px solid #7a3418;box-shadow:inset 0 0 0 1px #0e0907}
.rr-port canvas{display:block;width:64px;height:80px;image-rendering:pixelated}
.rr-attr{display:grid;grid-template-columns:16px 1fr auto;column-gap:6px;align-items:center;padding:2px 2px 3px;margin-bottom:2px}
.rr-attr:hover,.rr-stat:hover{background:var(--rf-hover)}
.rr-attr .nm{color:var(--rf-ink)}
.rr-attr b{font:700 13px/1 Cinzel,serif;color:var(--rf-ink)}
.rr-pips{grid-column:2/4;display:flex;gap:1px;margin-top:3px}
.rr-pips i{flex:1;height:3px;background:#2a1b13}.rr-pips i.b{background:#6a4630}.rr-pips i.on{background:#de8a4e}
.rr-pts{display:inline-flex;align-items:center;gap:2px;padding:0 4px 0 1px;border:1px solid #c9a24a;font:700 10.5px/13px Inter,sans-serif;color:var(--rf-gold);background:rgba(224,184,103,.1);box-shadow:0 0 5px rgba(224,184,103,.3);letter-spacing:0}
.rr-stats{display:grid;grid-template-columns:1fr 1fr;column-gap:12px}
.rr-stat{display:flex;align-items:center;gap:6px;padding:3px 2px;border-bottom:1px solid #22160f}
.rr-stat b{margin-left:auto;color:var(--rf-ink);font-variant-numeric:tabular-nums}
.rr-skills{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.rr-skill{display:flex;align-items:center;gap:6px;padding:4px;min-width:0;background:var(--rf-raised);border:1px solid var(--rf-line)}
.rr-skill .nm{font:600 12px/1.15 Inter,sans-serif;color:var(--rf-ink)}
.rr-skill .kd{font:700 9px/1.2 Inter,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--rf-gold);margin-top:2px}
.rr-med{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #e0b867;background:radial-gradient(circle at 50% 40%,#6a4c18,#3a2808);box-shadow:inset 0 0 0 1px #0e0907,0 0 6px rgba(224,184,103,.4)}
.rr-skill.free{cursor:pointer;border-color:#c9a24a;background:rgba(224,184,103,.07)}
.rr-skill.free .rr-med{border-color:#de8a4e;background:#2e160c;animation:rr-pend 1.8s ease-in-out infinite}
.rr-skill.free .kd{color:var(--rf-good)}
.rr-skill.shut{background:none;border-style:dashed;border-color:#4a3428}
.rr-skill.shut .rr-med{border-color:#3a2a20;background:#120b08;box-shadow:none}
.rr-skill.shut .nm{color:var(--rf-muted)}.rr-skill.shut .kd{color:var(--rf-disabled)}
.rr-hon{display:inline-flex;align-items:center;gap:3px;padding:2px 6px 2px 2px;border:1px solid #8a6a2a;color:var(--rf-gold);background:rgba(224,184,103,.07);font:600 11.5px/1 Inter,sans-serif}
.rr-hon.trait{border-color:var(--rf-line);color:var(--rf-ink);background:var(--rf-raised)}
.rr-node{display:flex;padding:1px;border:1px solid #7a5a28;background:#1c120d}
.rr-rec{display:flex;align-items:center;gap:10px;margin-top:9px;padding-top:6px;border-top:1px solid var(--rf-rule)}
.rr-rec>span{display:inline-flex;align-items:center;gap:4px}
.rr-up{color:var(--rf-good)}.rr-down{color:var(--rf-bad)}
.rr-toast{transition:opacity .4s, transform .4s;display:flex;align-items:center;gap:4px}
@media (prefers-reduced-motion:reduce){.rr-pending,.rr-lvup,.rr-skill.free .rr-med{animation:none!important}}
`;
