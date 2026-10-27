/**
 * The world map's region card (./main.ts): what a player needs to decide at a glance, in game-card order. A header (the
 * owner's banner, the region's name, what it is in plain words, its tags), one short lore line, three tiles (who holds
 * it, how dangerous it is, whose troops stand there), its goods as icons, the market's prices (or how to see them) and
 * the primary action with its key. Pure: the screen passes what it knows (fog, squads, boards) in `CardCtx`.
 */
import type { BoardSeen } from './geo';
import { FRONTIER_TOWNS, isChokepoint, MARKET_TOWNS, PURPOSE } from './geo';
import type { RegionState } from '../net/world';
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import type { BiomeKey, ResourceKey } from '../world/types';
import { EVENT_INFO, type WorldEvent } from '../world/events';
import { REGION_DEPTH } from '../sim/depth';
import { REGION_LORE } from '../../data/warLore';
import { landmarkOfRegion } from '../../data/warLandmarks';
import { EVENT_LOOK, eventIcon } from './eventLook';

/** What the card shows for, besides the region's own data. */
export interface CardCtx {
  /** The player's alliance (null: none yet). */
  you: number | null;
  /** The region's live state (undefined: no report yet). */
  region?: RegionState;
  /** Troops there are in sight (fog of war). */
  seen: boolean;
  /** The player's own men standing there. */
  mine: number;
  /** Live soldier cap per alliance in a region. */
  quota: number;
  /** The world event running there. */
  event?: WorldEvent;
  /** A market town's price board as the player's men last saw it (undefined: never). */
  board?: BoardSeen;
  /** What a click does here: enter (default), march (a lit neighbour of the selected squad), haul (the planner is open);
   * squad: the player's selected squad stands here. */
  mode: 'enter' | 'march' | 'haul' | 'squad';
  /** Docked (clicked) rather than the hover card: real buttons and a close. */
  pinned?: boolean;
  /** An alliance's map colour. */
  color: (a: number) => string;
  now: number;
}

/** Plain words for the biome ids. */
export const BIOME_NAME: Record<BiomeKey, string> = {
  dodona: 'Oak forest', skythia: 'Steppe', kyrene: 'Desert', elaia: 'Terraced coast', mountains: 'Mountains', marsh: 'Marsh', coast: 'Coast', plateau: 'Plateau',
};
const GOOD_NAME: Record<string, string> = { food: 'Food', wood: 'Wood', stone: 'Stone', iron: 'Iron', copper: 'Copper', tin: 'Tin', silver: 'Silver', horses: 'Horses', marble: 'Marble', salt: 'Salt' };
/** Goods with a kit icon (public/war/ui/icons/24/res-*.png); the rest show as words. */
const GOOD_ICON = new Set(['food', 'wood', 'stone', 'iron', 'copper', 'tin', 'silver', 'marble', 'salt', 'oil', 'pitch', 'herbs', 'hides', 'olives', 'flax', 'charcoal', 'bronze', 'leather', 'linen', 'coin']);
const AMOUNT = ['', 'some', 'plenty', 'rich'];
/** Danger by depth 0..4 (src/war/sim/depth.ts): the word and what it means. */
export const DANGER = ['Safe', 'Low', 'Moderate', 'High', 'Deadly'] as const;
const DANGER_TIP = 'How far from the living halls. Deeper: tougher beasts and lairs, slower claims, richer resource nodes.';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const aName = (a: number) => (a >= 0 ? ALLIANCES[a]?.name ?? '?' : 'Nobody');
export const resIcon = (good: string, px = 20) => `<img src="war/ui/icons/24/res-${good}.png" srcset="war/ui/icons/24/res-${good}@2x.png 2x" width="${px}" height="${px}" alt="">`;
const tip = (t: string) => ` data-tip="${esc(t)}"`;

/** What the region is, in a few plain words: "Home of Kyrene", "Dodona borderland", "Wild land", "Heart of the world". */
export function regionKind(id: string): string {
  const w = worldRegion(id);
  if (!w) return '';
  if (w.role === 'home') return `Home of ${aName(w.alliance ?? -1)}`;
  if (w.role === 'entry') return `${aName(w.alliance ?? -1)} borderland`;
  if (w.role === 'center') return 'Heart of the world';
  return 'Wild land';
}

/** The banner of an alliance (or an empty grey one for nobody), `h` px tall. */
export function crest(a: number, h = 34, color?: string): string {
  const key = a >= 0 ? ALLIANCES[a]?.key : null;
  return key
    ? `<span class="rc-crest" style="--c:${color ?? '#e0b867'}"><img src="war/world/banners/${key}.png" width="${Math.round(h * 0.7)}" height="${h}" alt=""></span>`
    : `<span class="rc-crest none" style="height:${h + 6}px;width:${Math.round(h * 0.7) + 6}px"></span>`;
}

/** The danger scale: four pips lit to the depth, and its word. */
export function dangerHtml(depth: number): string {
  return `<span class="rc-pips d${depth}">${[1, 2, 3, 4].map((k) => `<i class="${k <= depth ? 'on' : ''}"></i>`).join('')}</span><b class="rc-dw d${depth}">${DANGER[depth]}</b>`;
}

/** The region's tags: home, market, chokepoint, fighting, siege, landmark (each with what it means). */
export function regionTags(id: string, r: RegionState | undefined): { text: string; cls: string; tip: string }[] {
  const w = worldRegion(id), out: { text: string; cls: string; tip: string }[] = [];
  if (w?.role === 'home') out.push({ text: 'Home', cls: 'gold', tip: `${aName(w.alliance ?? -1)}'s home: it can never fall. Men wake here again.` });
  if (MARKET_TOWNS.has(id)) out.push({ text: 'Market town', cls: 'gold', tip: `A market: buy and sell goods here${FRONTIER_TOWNS.includes(id) ? '. No fighting inside its market court' : ''}.` });
  if (isChokepoint(id)) {
    const where = (PURPOSE[id] ?? []).find((p) => p.startsWith('chokepoint'))?.match(/\(([^)]+)\)/)?.[1];
    out.push({ text: 'Chokepoint', cls: '', tip: `The only road through${where ? ` (${where})` : ''}: easy to block, ambush spots above it.` });
  }
  if (r?.besieged) out.push({ text: 'Under siege', cls: 'bad', tip: 'Siege engines are at its walls.' });
  else if (r?.contested) out.push({ text: 'Fighting', cls: 'bad', tip: 'More than one alliance has troops here.' });
  const lm = r?.landmark && landmarkOfRegion(id);
  if (lm) out.push({ text: 'Landmark', cls: '', tip: `${lm.name}: a guarded wonder; hold and restore it for its power.` });
  return out;
}

/** The lore line, without its "Landmark: X." lead. */
export const loreLine = (id: string) => (REGION_LORE[id]?.lore ?? '').replace(/^Landmark: [^.]+\. /, '');

/** The primary action and its key for the card's mode. */
export function regionAction(mode: CardCtx['mode']): { label: string; act: string; key: string; hint: string } {
  if (mode === 'haul') return { label: 'Haul here', act: 'haul', key: 'Click', hint: 'Shift-click: haul from here' };
  if (mode === 'march') return { label: 'March here', act: 'march', key: 'Click', hint: 'Sends your selected squad' };
  if (mode === 'squad') return { label: 'Enter region', act: 'enter', key: '⏎', hint: 'Click a glowing neighbour to march there' };
  return { label: 'Enter region', act: 'enter', key: '⏎', hint: 'or double-click it' };
}

function troopsHtml(c: CardCtx): string {
  const r = c.region;
  if (!r) return `<span class="rc-v dim">No report</span>`;
  if (!c.seen) return `<span class="rc-v dim"${tip('You see troops only in your land and the regions next to it, or where your men stand.')}>Hidden</span>`;
  const live = r.live.flatMap((n, a) => (n > 0 ? [`<span class="rc-tc"><i class="wv-sw" style="background:${c.color(a)}"></i>${n}</span>`] : []));
  return live.length ? `<span class="rc-v">${live.join('')}</span>` : '<span class="rc-v dim">Empty</span>';
}

function goodsHtml(id: string): string {
  const res = Object.entries(worldRegion(id)?.res ?? {}) as [ResourceKey, number][];
  if (!res.length) return '';
  const chip = ([k, n]: [ResourceKey, number]) => `<span class="rc-good"${tip(`${GOOD_NAME[k] ?? k}: ${AMOUNT[n] ?? n}`)}>${GOOD_ICON.has(k) ? resIcon(k) : `<b>${GOOD_NAME[k] ?? k}</b>`}<span class="rc-amt">${'<i></i>'.repeat(n)}</span></span>`;
  return `<div class="rc-sec">Goods</div><div class="rc-goods">${res.sort((a, b) => b[1] - a[1]).map(chip).join('')}</div>`;
}

/** A market town's prices as last seen, or the empty state saying how to see them. */
export function pricesHtml(id: string, b: BoardSeen | undefined, now: number): string {
  if (!MARKET_TOWNS.has(id)) return '';
  if (!b) return `<div class="rc-sec">Market prices</div><div class="rc-empty">${resIcon('coin', 18)}<span><b>Prices unknown</b><br>Visit with any of your men to see them.</span></div>`;
  const ago = Math.max(0, Math.round((now - b.at) / 60000)), n = (v: number | null) => (v === null ? '<span class="dim">—</span>' : String(v));
  const rows = b.rows.slice(0, 6);
  return `<div class="rc-sec">Market prices <span class="dim">seen ${ago < 1 ? 'just now' : ago < 120 ? `${ago} min ago` : `${Math.round(ago / 60)} h ago`}</span></div>
    <table class="rc-px"><thead><tr><th>Good</th><th${tip('What sellers there ask: you buy at this')}>Buy</th><th${tip('What buyers there pay: you sell at this')}>Sell</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${GOOD_ICON.has(r.good) ? resIcon(r.good, 16) : ''}${GOOD_NAME[r.good] ?? r.good[0].toUpperCase() + r.good.slice(1)}</td><td>${n(r.ask)}</td><td>${n(r.bid)}</td></tr>`).join('')}
    </tbody></table>${b.rows.length > rows.length ? `<div class="dim rc-note">+${b.rows.length - rows.length} more goods</div>` : ''}`;
}

/** The world event running there: its icon, name, time left and rule. */
function eventHtml(c: CardCtx): string {
  const e = c.event;
  if (!e) return '';
  const s = Math.max(0, Math.ceil((e.endAt - c.now) / 1000)), t = `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `<div class="rc-ev" style="--we-c:${EVENT_LOOK[e.kind].color}">${eventIcon(e.kind, 22)}<div><div class="rc-evh"><b>${EVENT_INFO[e.kind].name}</b><span>${t} left</span></div><div class="dim">${EVENT_INFO[e.kind].rule}</div></div></div>`;
}

/** The primary action: a real button when docked, its look and key on the hover card. */
export function actionHtml(mode: CardCtx['mode'], pinned = false): string {
  const a = regionAction(mode), tag = pinned ? 'button' : 'div';
  return `<div class="rc-act"><${tag} class="rf-tbtn pri big rc-go" data-act="${a.act}">${a.label}<kbd>${a.key}</kbd></${tag}><span class="dim">${a.hint}</span></div>`;
}

/** The region card. */
export function regionCardHtml(id: string, c: CardCtx): string {
  const w = worldRegion(id);
  if (!w) return '';
  const r = c.region, owner = r?.owner ?? -1, depth = REGION_DEPTH[id] ?? 1, lore = loreLine(id);
  const tags = regionTags(id, r).map((t) => `<span class="rc-tag ${t.cls}"${tip(t.tip)}>${t.text}</span>`).join('');
  const ours = c.you !== null && r ? r.live[c.you] ?? 0 : 0;
  const room = c.you !== null && c.seen && r ? `<div class="rc-room"${tip(`Each alliance may have ${c.quota} men alive in a region at once; more wait in line.`)}>
      <span>${aName(c.you)} men here</span><span class="rc-bar"><i style="width:${Math.min(100, Math.round((ours / c.quota) * 100))}%"></i></span><b>${ours}<span class="dim">/${c.quota}</span></b></div>` : '';
  return `<div class="rc-hd">${crest(owner, 34, owner >= 0 ? c.color(owner) : undefined)}
      <div class="rc-tt"><div class="rf-name rc-name">${w.name}</div><div class="rc-sub">${regionKind(id)} · ${BIOME_NAME[w.biome] ?? ''}</div></div>
      ${c.pinned ? '<button class="rf-tbtn x" data-act="close" title="close (Esc)">×</button>' : ''}</div>
    ${tags ? `<div class="rc-tags">${tags}</div>` : ''}
    ${lore ? `<div class="rc-lore">${lore}</div>` : ''}
    <div class="rc-tiles">
      <div class="rc-tile"><span class="rc-k">Held by</span><span class="rc-v">${owner >= 0 ? `<i class="wv-sw" style="background:${c.color(owner)}"></i>` : ''}${owner === c.you && owner >= 0 ? `<span style="color:var(--rf-gold)">${aName(owner)}</span>` : aName(owner)}</span></div>
      <div class="rc-tile"${tip(`Danger ${depth} of 4. ${DANGER_TIP}`)}><span class="rc-k">Danger</span><span class="rc-v">${dangerHtml(depth)}</span></div>
      <div class="rc-tile"><span class="rc-k">Troops</span>${troopsHtml(c)}</div>
    </div>
    ${r && !c.seen ? '<div class="rc-note">Troops show only in and next to your land, or where your men stand.</div>' : ''}
    ${room}
    ${eventHtml(c)}
    ${c.mine ? `<div class="rc-mine">${c.mine} of your men stand here</div>` : ''}
    ${goodsHtml(id)}
    ${pricesHtml(id, c.board, c.now)}
    ${actionHtml(c.mode, c.pinned)}`;
}

/** The card's look (13 px text and up), added to the page's sheet. */
export const CARD_CSS = `
.rc-hd{display:flex;align-items:center;gap:9px;padding-bottom:6px;border-bottom:1px solid var(--rf-line);box-shadow:0 1px 0 var(--rf-sunk)}
.rc-hd .rf-tbtn.x{align-self:flex-start;margin-left:auto}
.rc-crest{flex:none;display:flex;align-items:center;justify-content:center;padding:3px;background:radial-gradient(circle at 50% 35%,#3a2516,#120b08);box-shadow:inset 0 0 0 1.5px var(--c),0 0 0 1px #0e0907}
.rc-crest.none{background:repeating-linear-gradient(135deg,#2a2420 0 4px,#1d1814 4px 8px);box-shadow:inset 0 0 0 1.5px #6e6560,0 0 0 1px #0e0907}
.rc-tt{min-width:0;flex:1}
.rc-name{font-size:18px;line-height:1.1}
.rc-sub{font:600 13px/1.3 Inter,sans-serif;color:var(--rf-muted);margin-top:2px}
.rc-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.rc-tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;font:700 13px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-sunk);border:1px solid var(--rf-rule)}
.rc-tag.gold{color:var(--rf-gold);border-color:#6a5326}.rc-tag.good{color:var(--rf-good);border-color:#3f5a2c}.rc-tag.bad{color:var(--rf-bad);border-color:#6a2c1c}.rc-tag.ev{color:#9fd4ff;border-color:#2f4c63}
.rc-lore{margin-top:6px;font:italic 500 13px/1.4 Inter,sans-serif;color:var(--rf-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rc-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:8px}
.rc-tile{display:flex;flex-direction:column;gap:4px;padding:5px 6px;background:var(--rf-sunk);border:1px solid var(--rf-rule);min-width:0}
.rc-k{font:700 13px/1 Cinzel,serif;letter-spacing:.06em;text-transform:uppercase;color:var(--rf-accent)}
.rc-v{display:flex;align-items:center;flex-wrap:wrap;gap:4px 7px;font:700 13px/1.2 Inter,sans-serif;color:var(--rf-ink);min-height:16px}
.rc-v.dim,.rc-v .dim{color:var(--rf-muted);font-weight:600}
.rc-v .wv-sw,.rc-tc .wv-sw{width:10px;height:10px;display:inline-block;margin-right:3px}
.rc-tc{display:inline-flex;align-items:center}
.rc-pips{display:inline-flex;gap:2px}
.rc-pips i{width:6px;height:13px;background:#2c1c15;box-shadow:inset 0 0 0 1px #4a3020}
.rc-pips.d1 i.on{background:var(--rf-good)}.rc-pips.d2 i.on{background:var(--rf-gold)}.rc-pips.d3 i.on{background:var(--rf-accent)}.rc-pips.d4 i.on{background:#e0553a}
.rc-dw.d0{color:var(--rf-good)}.rc-dw.d1{color:var(--rf-good)}.rc-dw.d2{color:var(--rf-gold)}.rc-dw.d3{color:var(--rf-accent)}.rc-dw.d4{color:var(--rf-bad)}
.rc-room{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;margin-top:6px;font:600 13px/1.2 Inter,sans-serif;color:var(--rf-muted)}
.rc-room b{color:var(--rf-ink)}
.rc-bar{height:6px;background:#0e0907;box-shadow:inset 0 0 0 1px #3a2418;position:relative}
.rc-bar i{position:absolute;left:1px;top:1px;bottom:1px;max-width:calc(100% - 2px);background:var(--rf-good)}
.rc-ev{display:flex;gap:7px;align-items:flex-start;margin-top:7px;padding:5px 6px;background:var(--rf-sunk);border:1px solid var(--rf-rule);border-left:3px solid var(--we-c);font:600 13px/1.35 Inter,sans-serif}
.rc-ev>div{flex:1;min-width:0}.rc-ev .dim{color:var(--rf-muted)}
.rc-evh{display:flex;gap:6px}.rc-evh b{color:var(--we-c)}.rc-evh span{margin-left:auto;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc-mine{margin-top:4px;font:600 13px/1.2 Inter,sans-serif;color:var(--rf-gold)}
.rc-sec{display:flex;align-items:baseline;gap:6px;margin:9px 0 4px;font:700 13px/1 Cinzel,serif;color:var(--rf-accent);letter-spacing:.06em;text-transform:uppercase}
.rc-sec .dim{font:600 13px/1 Inter,sans-serif;text-transform:none;letter-spacing:0;color:var(--rf-muted);margin-left:auto}
.rc-goods{display:flex;flex-wrap:wrap;gap:4px}
.rc-good{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 6px 0 3px;background:var(--rf-raised);border:1px solid var(--rf-rule);font:700 13px/1 Inter,sans-serif}
.rc-amt{display:inline-flex;gap:2px}.rc-amt i{width:6px;height:6px;border-radius:50%;background:var(--rf-gold)}
.rc-empty{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px dashed #5a3a26;color:var(--rf-muted);font:600 13px/1.35 Inter,sans-serif}
.rc-empty b{color:var(--rf-ink)}
.rc-px{width:100%;border-collapse:collapse;font:600 13px/1 Inter,sans-serif;font-variant-numeric:tabular-nums}
.rc-px th{font:600 13px/1 Inter,sans-serif;color:var(--rf-muted);text-align:right;padding:0 4px 4px}
.rc-px th:first-child,.rc-px td:first-child{text-align:left}
.rc-px td{padding:3px 4px;text-align:right;border-top:1px solid #24160f}
.rc-px td:first-child{display:flex;align-items:center;gap:5px}
.rc-px .dim,.rc-note{color:var(--rf-muted)}.rc-note{font:600 13px/1.3 Inter,sans-serif;margin-top:5px}
.rc-act{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--rf-rule)}
.rc-act .dim{font:600 13px/1.25 Inter,sans-serif;color:var(--rf-muted)}
.rc-go{flex:none;gap:8px}
.rc-go kbd{font:700 13px/1 Inter,sans-serif;padding:2px 5px;border:1px solid rgba(255,240,216,.45);color:#fff0d8;letter-spacing:0}
`;
