/**
 * The world map's hover and docked cards, shared by the world screen (./main.ts) and the world overlay over a region
 * (./overlay.ts): a region (./regionCard.ts), a landmark, a warlord, a mastered region, a settlement. Pure HTML from
 * what the screen knows (`CardsCtx`); the pick under the pointer comes from WorldMap.pick (./map.ts).
 */
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import { REGION_DEPTH } from '../sim/depth';
import { LANDMARK_FUNCTION } from '../../data/warLore';
import { landmarkOfRegion } from '../../data/warLandmarks';
import { domainOf, warlord } from '../../data/warWarlords';
import { bossesOfRegion } from '../../data/warBosses';
import { levelName } from '../net/settlements';
import { inSight } from './geo';
import { lordInfo, roughMen } from './lords';
import { clock, type MapPick, type MapState } from './map';
import { dangerHtml, loreLine, regionCardHtml, resIcon, type CardCtx } from './regionCard';
import type { WorldView } from './source';

export interface CardsCtx {
  st: MapState;
  view: WorldView | null;
  /** An alliance's map colour. */
  color: (a: number) => string;
  /** What a click on this region does (the card's action). */
  mode: (id: string) => CardCtx['mode'];
}

const name = (id: string) => worldRegion(id)?.name ?? id;
const aName = (a: number) => (a >= 0 ? ALLIANCES[a].name : 'nobody');
export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LM_STATE: Record<string, string> = { guarded: 'Guarded: gates shut', unclaimed: 'Guardian slain, free to claim', damaged: 'Damaged: power asleep', restored: 'Restored: power awake' };
const RARE_NAME: Record<string, string> = { dragonbone: 'Dragonbone', nereidPearl: 'Nereid pearl', starIron: 'Star iron', asphodel: 'Asphodel', titanBronze: 'Titan bronze', obsidian: 'Obsidian' };
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
/** A card's header: an emblem, the name and a plain-words line under it. */
const cardHead = (emblem: string, title: string, sub: string) => `<div class="rc-hd">${emblem}<div class="rc-tt"><div class="rf-name rc-name">${title}</div><div class="rc-sub">${sub}</div></div></div>`;
const tile = (k: string, v: string, tipText = '') => `<div class="rc-tile"${tipText ? ` data-tip="${tipText}"` : ''}><span class="rc-k">${k}</span><span class="rc-v">${v}</span></div>`;
/** A span of time from afar: days and hours, else the clock. */
const span = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 86_400 ? `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h` : clock(s); };

/** The region card with what the screen knows; `pinned`: the docked copy with real buttons; `compact`: the hover card. */
export function regionCardFor(c: CardsCtx, id: string, pinned = false, compact = false): string {
  const { st, view } = c, you = st.you;
  return regionCardHtml(id, {
    you, region: st.regions.get(id), seen: inSight(id, you as 0 | null, st.regions, new Set(st.squads.keys())), mine: st.squads.get(id) ?? 0, quota: view?.quota[you ?? 0] ?? 150,
    event: view?.snap.events?.active.find((x) => x.region === id && x.endAt > Date.now()), board: view?.boards?.[id],
    mode: c.mode(id), pinned, compact, color: c.color, now: Date.now(),
  });
}

/** M7g: a landmark's hover card: name, lore, guardian alive or slain (back in), holder and state, danger, rare good, power. */
export function landmarkCard(c: CardsCtx, id: string): string {
  const lm = landmarkOfRegion(id), w = c.st.regions.get(id)?.landmark;
  if (!lm || !w) return regionCardFor(c, id, false, true);
  const bosses = bossesOfRegion(id).map((b) => b.name.replace(/^the /, 'The ')).join(' and ');
  const back = w.backAt ? Math.max(0, Math.round((w.backAt - Date.now()) / 1000)) : 0;
  const guard = w.guardian === 'alive' ? '<span style="color:var(--rf-bad)">Alive</span>' : `${w.guardian === 'slain' ? 'Slain' : 'Escaped'}${back ? ` <span class="dim">· back in ${clock(back)}</span>` : ''}`;
  const rare = lm.rare ? `<span class="rc-good">${resIcon(kebab(lm.rare))}${RARE_NAME[lm.rare]}</span>` : '';
  const emblem = `<span class="rc-crest" style="--c:${w.holder >= 0 ? c.color(w.holder) : '#e0b867'}"><img src="war/ui/icons/24/bld-fort.png" width="28" height="28" alt=""></span>`;
  return `${cardHead(emblem, lm.name, `Landmark in ${name(id)}`)}
    <div class="rc-tags"><span class="rc-tag ${w.state === 'restored' ? 'good' : w.state === 'damaged' ? 'bad' : 'gold'}">${LM_STATE[w.state]}${w.holder >= 0 ? ` · ${Math.round(w.hp * 100)}%` : ''}</span></div>
    <div class="rc-lore">${loreLine(id)}</div>
    <div class="rc-tiles">${tile('Held by', `${w.holder >= 0 ? `<i class="wv-sw" style="background:${c.color(w.holder)}"></i>${aName(w.holder)}` : w.guardian === 'alive' ? 'Its guardian' : 'Nobody'}`)}
      ${tile('Danger', dangerHtml(REGION_DEPTH[id] ?? 1))}
      ${tile('Guardian', guard)}</div>
    <div class="rc-note">${w.guardian === 'alive' ? 'Guarded by' : 'Its guardian:'} <b style="color:var(--rf-ink)">${bosses}</b></div>
    <div class="rc-sec">Its power once held</div><div style="line-height:1.4">${LANDMARK_FUNCTION[lm.id] ?? ''}</div>
    ${rare ? `<div class="rc-sec">Rare good</div><div class="rc-goods">${rare}</div>` : ''}
    <div class="rc-mine" style="margin-top:8px">+2 score an hour while restored and garrisoned${w.garrisoned ? ' · <b style="color:var(--rf-good)">earning now</b>' : ''}</div>`;
}

/** W-72: a warlord's hover card; W-76: live, a fall or a raid as a tag, his places and rough men, the lands held. */
export function lordCard(c: CardsCtx, id: string): string {
  const w = warlord(id);
  if (!w) return '';
  const [seat, ...lands] = domainOf(w), col = `#${w.tint.toString(16).padStart(6, '0')}`, now = Date.now(), v = lordInfo(id, [...c.st.regions.values()], now);
  const emblem = `<span class="rc-crest" style="--c:${v.backAt ? '#5a524c' : col}"><img src="war/ui/icons/24/act-attack.png" width="28" height="28" alt=""></span>`;
  const tags = v.backAt ? `<span class="rc-tag good">Fallen · back in ${span(v.backAt - now)}</span>`
    : v.raid ? `<span class="rc-tag bad">${v.raid.at > now ? `Raid on ${name(v.raid.region)} · ${span(v.raid.at - now)}` : `Raiding ${name(v.raid.region)}`}</span>` : '';
  const held = v.known ? (v.lands.length ? `Holds ${v.lands.map(name).join(', ')}.` : 'Holds nothing now.') : `Raids from ${lands.map(name).join(' and ')}.`;
  return `${cardHead(emblem, esc(w.name), `${esc(w.title.charAt(0).toUpperCase() + w.title.slice(1))} · a rival warlord`)}
    ${tags ? `<div class="rc-tags">${tags}</div>` : ''}
    <div class="rc-tiles">${tile('Hall', name(seat))}${v.backAt ? tile('Band', esc(w.band.replace(/^the /, 'The '))) : tile('Places', v.known ? String(v.holds) : '?', 'Claim points and lairs his men hold')}${v.backAt ? '' : tile('Men', v.known ? roughMen(v.men) : '?', 'His garrisons, as last seen')}</div>
    ${v.backAt ? '' : `<div class="rc-note">${held}</div>`}`;
}

/** W-73: a mastered region's hover card. */
export function masteredCard(id: string): string {
  const emblem = `<span class="rc-crest" style="--c:#e0b867"><span style="font:700 22px/1 serif;color:#f2d48a">★</span></span>`;
  return `${cardHead(emblem, `${name(id)} mastered`, 'by you, this season')}<div class="rc-note">Every lair, chief and hidden quest done.</div>`;
}

/** W-63: a settlement's hover card: its level, lord and region, its overlord with the tribute, its vassals. */
export function settlementCard(c: CardsCtx, id: number): string {
  const list = c.st.settlements ?? [], w = list.find((x) => x.id === id);
  if (!w) return '';
  const over = w.overlord_id !== null ? list.find((x) => x.id === w.overlord_id) : null, vas = list.filter((x) => x.overlord_id === w.id);
  const icon = w.level >= 5 ? 'bld-fort' : w.level >= 4 ? 'bld-tower-stone' : w.level >= 2 ? 'bld-storehouse' : 'bld-camp';
  const mine = c.st.me != null && w.lord_pid === c.st.me, lv = Math.max(1, w.level);
  const emblem = `<span class="rc-crest" style="--c:${mine ? '#e0b867' : '#7a3418'}"><img src="war/ui/icons/24/${icon}.png" width="28" height="28" alt=""></span>`;
  return `${cardHead(emblem, esc(w.name), `${levelName(w.level)} in ${name(w.region)}`)}
    <div class="rc-tiles">${tile('Lord', `${esc(w.lord ?? '?')}${mine ? ' <span class="dim">(you)</span>' : ''}`)}
      ${tile('Level', `<span class="rc-pips d2">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span>`, `${levelName(w.level)}: level ${lv} of 5`)}
      ${tile('People', String(w.people))}</div>
    <div class="rc-sec">Fealty</div>
    <div style="line-height:1.45">${over ? `Sworn to <b>${esc(over.name)}</b> <span class="rf-dim">· pays ${w.tribute_pct}% tribute</span>` : '<span class="rf-dim">Free: sworn to nobody</span>'}
      ${vas.length ? `<br>Vassals: ${vas.map((v) => `${esc(v.name)} <span class="rf-dim">${v.tribute_pct}%</span>`).join(', ')}` : ''}</div>`;
}

/** W-64: a monarch's crown: his name, his alliance. */
export function crownCard(c: CardsCtx, alliance: number): string {
  const m = c.st.crown?.monarchs.find((x) => x.alliance === alliance);
  if (!m) return '';
  const emblem = `<span class="rc-crest" style="--c:${c.color(alliance)}"><svg width="26" height="22" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 12V3l4 4 3-6 3 6 4-4v9z" fill="#e0b867" stroke="#6b4a14" stroke-width="1.2"/></svg></span>`;
  return `${cardHead(emblem, esc(m.name), `Monarch of ${aName(alliance)}`)}<div class="rc-note">The alliance's crowned ruler.</div>`;
}

/** A cluster of small markers too close to draw apart at this zoom: what is in it; a click zooms in. */
export function clusterCard(region: string, items: string[]): string {
  const emblem = `<span class="rc-crest" style="--c:#e0b867"><span style="font:700 15px/1 Inter,sans-serif;color:#f2d48a">+${items.length}</span></span>`;
  return `${cardHead(emblem, name(region), `${items.length} more on the map here`)}<div class="rc-note" style="line-height:1.45">${items.map(esc).join('<br>')}</div><div class="rc-note">Click to zoom in.</div>`;
}

/** The card for what is under the pointer (null: none) and its width. */
export function hoverCard(c: CardsCtx, p: MapPick): { html: string; width: number } | null {
  if (p.lord) return { html: lordCard(c, p.lord), width: 290 };
  if (p.cluster) return { html: clusterCard(p.cluster.region, p.cluster.items), width: 260 };
  if (p.mastered) return { html: masteredCard(p.mastered), width: 260 };
  if (p.crown != null) return { html: crownCard(c, p.crown), width: 250 };
  if (p.settle != null) return { html: settlementCard(c, p.settle), width: 290 };
  if (p.landmark) return { html: landmarkCard(c, p.landmark), width: 310 };
  if (p.region) return { html: regionCardFor(c, p.region, false, true), width: 280 };
  return null;
}
