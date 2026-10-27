/**
 * W-61 peaceful play's HUD views as HTML (./peace.ts mounts them; docs/WAR.md "Peaceful play"): the town badge and card,
 * the alliance works' project cards, the season's title standings and the roster's title strip. Pure: data in, HTML out.
 */
import { WONDER, WORKS, workDef, type WorkStage, type WorkView } from '../../net/works';
import { TOWN_LEVELS, TOWN_MAX, TOWN_PERKS, type TownPerk } from '../../sim/townLevel';
import type { TownLevelSnap } from '../../types';
import { glyph } from './glyph';
import { bar, icon, ring } from './kit';
import { medal, TITLE_ORDER, titleTip, TITLES } from './titles';

export interface TitleRow { id: string; name: string; pid: number; player: string; alliance: number; home: string | null; value: number }
export interface PeaceStats { sold: number; contracts: number; labourHours: number; guardHours: number }
const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'pitch', 'coin', 'iron', 'bronze', 'silver', 'salt', 'hides', 'charcoal']);
const gi = (r: string) => (ICONED.has(r) ? icon('res-' + r) : `<span class="rf-dim">${r}</span>`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = esc;

// ------------------------------------------------------------------ the town

/** One need of the next level: its icon, words, have / need, fill 0..1 and whether it is met. */
export interface TownReq { id: string; icon: string; label: string; have: string; v: number; ok: boolean; tip: string }

/** What the next level needs, as checklist items (empty at the top). */
export function townReqs(t: TownLevelSnap): TownReq[] {
  if (t.level >= TOWN_MAX) return [];
  const n = TOWN_LEVELS[t.level + 1], out: TownReq[] = [];
  if (n.variety) out.push({ id: 'variety', icon: icon('act-build'), label: 'Kinds of building', have: `${t.variety}/${n.variety}`, v: t.variety / n.variety, ok: t.variety >= n.variety,
    tip: `<b class="k">Kinds of building</b> · ${t.variety} of ${n.variety}<br><span class="rf-dim tip-w">every kind counts once: a forge of any level, each wall part, a store...</span>` });
  if (n.stone) out.push({ id: 'stone', icon: icon('res-stone'), label: `Stone ${pct(n.stone)}`, have: pct(t.stone), v: t.stone / n.stone, ok: t.stone >= n.stone - 1e-9,
    tip: `<b class="k">Stone</b> · ${pct(t.stone)} of the built ground, ${pct(n.stone)} needed<br><span class="rf-dim tip-w">build in stone, or rebuild wood in stone</span>` });
  if (n.closed) out.push({ id: 'closed', icon: icon('bld-palisade'), label: 'Walls closed', have: '', v: t.closed ? 1 : 0, ok: t.closed,
    tip: `<b class="k">Walls closed all round</b> · ${t.closed ? 'yes' : 'not yet'}<br><span class="rf-dim tip-w">no way out from the centre but through your own gates</span>` });
  if (n.stoneWalls) out.push({ id: 'stoneWalls', icon: icon('bld-tower-stone'), label: 'All walls stone', have: '', v: t.stoneWalls ? 1 : 0, ok: t.stoneWalls,
    tip: `<b class="k">Every wall, gate and tower stone</b> · ${t.stoneWalls ? 'yes' : 'not yet'}` });
  return out;
}

/** How far the town is towards its next level, 0..1 (1 at the top). */
export const townProgress = (t: TownLevelSnap): number => {
  const r = townReqs(t);
  return r.length ? r.reduce((a, x) => a + Math.min(1, x.v), 0) / r.length : 1;
};

/** The four perks: icon, the chip's number and the tooltip's words. */
const PERKS: { id: keyof TownPerk; icon: () => string; on: (p: TownPerk) => boolean; n: (p: TownPerk) => string; tip: (p: TownPerk) => string }[] = [
  { id: 'store', icon: () => icon('trade-chest'), on: (p) => p.store > 0, n: (p) => `+${p.store}`, tip: (p) => `<b class="k">Storage</b> · chests hold ${p.store} more loads` },
  { id: 'hunger', icon: () => icon('res-food'), on: (p) => p.hunger < 1, n: (p) => `−${pct(1 - p.hunger)}`, tip: (p) => `<b class="k">Food keeps</b> · hunger runs ${pct(1 - p.hunger)} slower` },
  { id: 'souls', icon: () => icon('res-asphodel'), on: (p) => p.souls > 1, n: (p) => `+${pct(p.souls - 1)}`, tip: (p) => `<b class="k">Souls</b> · wake ${pct(p.souls - 1)} more often near your sites` },
  { id: 'repair', icon: () => icon('node-engineer-toolmaker'), on: (p) => p.repair > 1, n: (p) => `+${pct(p.repair - 1)}`, tip: (p) => `<b class="k">Repairs</b> · ${pct(p.repair - 1)} faster` },
];
const perkChips = (lv: number, cls = '', prev?: TownPerk) => {
  const p = TOWN_PERKS[Math.max(0, Math.min(TOWN_MAX, lv))];
  return PERKS.filter((k) => k.on(p)).map((k) => `<span class="rf-ichip ${cls}" data-tip="${attr(k.tip(p))}">${k.icon()}${k.n(p)}${prev && p[k.id] !== prev[k.id] ? '<span class="up">▲</span>' : ''}</span>`).join('');
};

/** The level ladder: five diamonds, the reached ones lit, each with its name and needs as a tooltip. */
const ladder = (lv: number) => `<span class="tw-ladder">${[1, 2, 3, 4, 5].map((k) => {
  const n = TOWN_LEVELS[k], needs = [n.variety && `${n.variety} kinds`, n.stone && `${pct(n.stone)} stone`, n.closed && 'walls closed', n.stoneWalls && 'stone walls'].filter(Boolean).join(' · ');
  return `<i class="${k <= lv ? 'on' : ''}${k === lv ? ' cur' : ''}" data-tip="${attr(`<b class="k">${k} ${n.name}</b>${needs ? `<br><span class="rf-dim tip-w">${needs}</span>` : ''}`)}"></i>`;
}).join('')}</span>`;

/** The town card. */
export function townCard(t: TownLevelSnap | null): string {
  if (!t || t.level < 1) return `<div class="tw-top">${ring(0, 44, '<b>0</b>')}<div><div class="rf-name">No town here</div><div class="rf-dim">build a camp or a store</div></div></div>`;
  const reqs = townReqs(t), next = t.level < TOWN_MAX ? TOWN_LEVELS[t.level + 1] : null, met = reqs.filter((r) => r.ok).length;
  const check = (r: TownReq) => `<div class="rf-check ${r.ok ? 'ok' : 'no'}" data-tip="${attr(r.tip)}">${r.icon}<div><div class="l">${r.label}</div>${bar(r.ok ? 'ok' : 'construction', r.v, 128)}</div><span class="v">${r.have}</span>${glyph(r.ok ? 'ui:check' : 'ui:xmark', 14)}</div>`;
  const now = perkChips(t.level, 'good');
  return `<div class="tw-top">${ring(townProgress(t), 44, `<b>${t.level}</b>`)}<div style="flex:1;min-width:0"><div class="rf-name">${esc(t.name)}</div>${ladder(t.level)}</div>
      <span class="rf-ichip" data-tip="${attr(`<b class="k">Town ground</b> · ${t.r * 2} m across<br><span class="rf-dim tip-w">round your first camp or fort</span>`)}">${glyph('ui:map', 18)}${t.r * 2} m</span></div>
    ${next ? `<div class="rf-sec">To ${esc(next.name)} <span class="rf-dim">${met} / ${reqs.length}</span></div>${reqs.map(check).join('')}` : `<div class="rf-sec">Highest level</div>`}
    <div class="rf-sec">Perks <span class="rf-dim">your men inside</span></div>
    <div class="tw-chips">${now || '<span class="rf-dim">none yet</span>'}</div>
    ${next ? `<div class="tw-next"><div class="tw-nl rf-dim">${glyph('ui:lock', 12)}At ${esc(next.name)} <span>▲ grows</span></div><div class="tw-chips">${perkChips(t.level + 1, 'dim', TOWN_PERKS[t.level])}</div></div>` : ''}`;
}

/** The badge: the ring round the level numeral, the town's name. */
export function townBadge(t: TownLevelSnap): string {
  const reqs = townReqs(t), next = t.level < TOWN_MAX ? TOWN_LEVELS[t.level + 1].name : null;
  const tip = `<b class="k">${esc(t.name)}</b> · level ${t.level} of ${TOWN_MAX}${next ? `<br>${reqs.filter((r) => r.ok).length} of ${reqs.length} needs met for ${next}` : ''}<br><span class="rf-dim tip-w">click: the town card</span>`;
  return `<span class="tw-badge" data-tip="${attr(tip)}">${ring(townProgress(t), 26, `<b style="font-size:12px">${t.level}</b>`)}<b class="rf-name" style="font-size:14px">${esc(t.name)}</b></span>`;
}

// ------------------------------------------------------------------ the works

/** The offline view of the works: needs only. */
export const offlineWorks = (): WorkView[] => [
  ...WORKS.map((w): WorkView => ({ id: w.id, name: w.name, text: w.text, region: 'home', x: 0, y: 0, goods: {}, need: w.goods, labour: 0, needLabour: w.labour, done: false, by: [] })),
  { id: WONDER.id, name: WONDER.name, text: WONDER.stages[0].text, region: 'home', x: 0, y: 0, goods: {}, need: WONDER.stages[0].goods, labour: 0, needLabour: WONDER.stages[0].labour, done: false, by: [], stage: 0,
    stages: WONDER.stages.map((s) => ({ name: s.name, text: s.text, need: s.goods, needLabour: s.labour, done: false })) },
];
const WORK_ART: Record<string, () => string> = { temple: () => '<img src="war/landmarks/navel-temple-intact.png" alt="">', road: () => icon('bld-bridge-stone', 32), beacons: () => '<img src="war/buildings/stone-tower-done.png" alt="">' };
/** The reward chip: the bonus a work grants, short. */
const reward = (id: string): { icon: string; n: string } => {
  const b = workDef(id)?.bonus ?? {};
  if (b.repairCost !== undefined) return { icon: icon('node-engineer-toolmaker'), n: `−${pct(1 - b.repairCost)} repairs` };
  if (b.travel !== undefined) return { icon: icon('trade-wagon'), n: `+${pct(1 - b.travel)} speed` };
  if (b.sight !== undefined) return { icon: glyph('ui:eye', 18), n: `+${b.sight} sight` };
  return { icon: glyph('ui:star', 18), n: '' };
};
/** A work's progress, 0..1: its goods and labour, each part filled to its need, averaged. */
export const workProgress = (w: WorkView): number => {
  if (w.done) return 1;
  const parts = [...Object.entries(w.need).map(([r, n]) => Math.min(1, (w.goods[r] ?? 0) / n)), Math.min(1, w.labour / w.needLabour)];
  return parts.reduce((a, x) => a + x, 0) / parts.length;
};
const RANK = ['#e0b867', '#c9c3b8', '#c07a45'];

export interface GiveForm { work: string; res: string; n: number }

/** The wonder's art by stages done: its ruin, then rising, standing, finished. */
const WONDER_ART = ['ruined', 'damaged', 'intact', 'restored'];
/** A wonder stage's perks as chips. */
const stagePerk = (s: WorkStage) => {
  const b = s.bonus, out: { icon: string; n: string }[] = [];
  if (b.travel !== undefined) out.push({ icon: icon('trade-wagon'), n: `+${pct(1 - b.travel)}` });
  if (b.sight !== undefined) out.push({ icon: glyph('ui:eye', 18), n: `+${b.sight}` });
  if (b.repairCost !== undefined) out.push({ icon: icon('node-engineer-toolmaker'), n: `−${pct(1 - b.repairCost)}` });
  if (b.tasks !== undefined) out.push({ icon: icon('trade-contract'), n: `+${pct(b.tasks - 1)}` });
  return out;
};

/** The works tab: the alliance's wonder first (its stages), then a project card per work; the picked one with its contribute row. */
export function worksHtml(list: WorkView[], online: boolean, form: GiveForm, home: Record<string, number> = {}): string {
  /** The current needs as have/need chips. */
  const needs = (w: WorkView) => {
    const chip = (ic: string, have: number, need: number, unit: string, tip: string) => {
      const f = Math.min(1, have / need), ok = w.done || f >= 1;
      return `<span class="rf-ichip wk-need${ok ? ' good' : ''}" style="--f:${Math.round(f * 100)}%" data-tip="${attr(tip)}">${ic}<span class="rf-num">${fmt(have)}<span class="rf-dim">/${need}${unit}</span></span></span>`;
    };
    const goods = Object.entries(w.need).map(([r, n]) => chip(gi(r), w.goods[r] ?? 0, n, '', `<b class="k">${r}</b> · ${fmt(w.goods[r] ?? 0)} of ${n} in<br><span class="rf-dim tip-w">you have ${fmt(Math.floor(home[r] ?? 0))} at home</span>`)).join('');
    const labour = chip(glyph('ui:people', 18), w.labour, w.needLabour, ' h', `<b class="k">Labour</b> · ${fmt(w.labour)} of ${w.needLabour} man-hours<br><span class="rf-dim tip-w">every man of your alliance standing at the site works it</span>`);
    return `<div class="wk-needs">${goods}${labour}</div>`;
  };
  /** The picked work's contribute row. */
  const giveRow = (w: WorkView) => {
    const goodsOf = Object.keys(w.need).filter((r) => (w.goods[r] ?? 0) < w.need[r]);
    const left = Math.max(0, Math.ceil(w.need[form.res] - (w.goods[form.res] ?? 0))), have = Math.floor(home[form.res] ?? 0), max = Math.max(1, Math.min(left, have) || 1);
    return `<div class="wk-give">
        <span class="rf-seg">${goodsOf.map((r) => `<button class="${r === form.res ? 'on' : ''}" data-act="res" data-r="${r}" data-tip="${attr(`<b class="k">${r}</b> · ${fmt(w.need[r] - (w.goods[r] ?? 0))} still needed<br><span class="rf-dim tip-w">${fmt(Math.floor(home[r] ?? 0))} in your home strongroom</span>`)}">${gi(r)}</button>`).join('')}</span>
        <span class="rf-step"><button class="rf-tbtn" data-act="step" data-d="-10">−</button><input type="number" data-f="n" min="1" value="${form.n}"><button class="rf-tbtn" data-act="step" data-d="10">+</button></span>
        <button class="rf-tbtn" data-act="max" data-n="${max}" data-tip="${attr(`as much as you have, up to what is still needed (${max})`)}">Max</button>
        <button class="rf-tbtn pri wk-go" data-act="give"${online ? '' : ' disabled'} data-tip="${attr(online ? `from your home strongroom (${have} ${form.res})` : 'online only: works are raised on the server')}">Contribute</button></div>`;
  };
  const loc = (w: WorkView, site: string) => `<div class="wk-loc" data-tip="${attr(`<b class="k">Site</b> · ${esc(w.region)}${w.x ? ` (${Math.round(w.x)}, ${Math.round(w.y)})` : ''}<br><span class="rf-dim tip-w">${esc(site)}</span>`)}">${glyph('ui:map', 14)}${esc(w.region)}</div>`;
  const one = (w: WorkView) => {
    const p = workProgress(w), rw = reward(w.id), picked = !w.done && w.id === form.work;
    const top = w.by.slice(0, 3).map((b, k) => `<span class="wk-av" style="--c:${RANK[k]}" data-tip="${attr(`<b class="k">${k + 1}. ${esc(b.name)}</b><br>${b.goods} goods · ${fmt(b.labour)} man-hours`)}">${esc(b.name.slice(0, 1).toUpperCase())}<i>${k + 1}</i></span>`).join('');
    const more = w.by.length > 3 ? `<span class="rf-dim">+${w.by.length - 3}</span>` : '';
    return `<div class="wk-card rf-well${picked ? ' on' : ''}${w.done ? ' done' : ''}">
      <div class="wk-top"><div class="wk-art">${WORK_ART[w.id]?.() ?? ''}</div>
        <div class="wk-tt"><div class="wk-name">${esc(w.name)}</div>${loc(w, workDef(w.id)?.site ?? '')}</div>
        <span class="rf-ichip gold wk-rw" data-tip="${attr(`<b class="k">Reward</b> · ${esc(w.text)}<br><span class="rf-dim tip-w">for the whole alliance, the rest of the season</span>`)}">${rw.icon}${rw.n}</span></div>
      <div class="wk-prog"><div class="rf-bar big"><i class="${w.done ? 'ok' : 'construction'}" style="width:${(p * 100).toFixed(1)}%"></i></div><b>${w.done ? 'Stands' : pct(p)}</b></div>
      ${w.done ? '' : needs(w)}
      <div class="wk-foot"><span class="wk-top3">${top ? `${top}${more}` : '<span class="rf-dim">nobody has given yet</span>'}</span>
        ${w.done || picked ? '' : `<button class="rf-tbtn" data-act="pick" data-w="${w.id}">Contribute</button>`}</div>
      ${picked ? giveRow(w) : ''}</div>`;
  };
  /** The wonder: its art by stage, the stage track (each stage's progress and perk), the current needs, the top five givers. */
  const wonder = (w: WorkView) => {
    const stages = w.stages ?? [], n = w.stage ?? 0, p = workProgress(w), picked = !w.done && w.id === form.work;
    const cur = stages[Math.min(n, stages.length - 1)];
    const track = stages.map((s, k) => {
      const v = s.done ? 1 : k === n ? p : 0, st = WONDER.stages[k];
      const perks = stagePerk(st).map((x) => `<span class="rf-ichip ${s.done ? 'good' : 'dim'}">${x.icon}${x.n}</span>`).join('');
      return `<div class="wd-st${s.done ? ' done' : k === n ? ' cur' : ''}" data-tip="${attr(`<b class="k">${k + 1}. ${esc(s.name)}</b> · ${s.done ? 'stands' : k === n ? `${pct(p)} raised` : 'not begun'}<br>${Object.entries(s.need).map(([r, q]) => `${q} ${r}`).join(', ')}, ${s.needLabour} man-hours<br><span class="rf-dim tip-w">${esc(s.text)} · +${st.score} score</span>`)}">
        <div class="wd-sn"><span class="wd-k">${s.done ? glyph('ui:check', 12) : k + 1}</span>${esc(s.name)}</div>
        <div class="rf-bar"><i class="${s.done ? 'ok' : 'construction'}" style="width:${(v * 100).toFixed(1)}%"></i></div><div class="wd-pk">${perks}</div></div>`;
    }).join('');
    const top = w.by.slice(0, 5).map((b, k) => `<div class="wd-giver"><span class="wk-av" style="--c:${RANK[k] ?? '#6b5a48'}">${esc(b.name.slice(0, 1).toUpperCase())}<i>${k + 1}</i></span><span class="wd-gn">${esc(b.name)}</span><span class="rf-dim">${b.goods} · ${fmt(b.labour)} h</span></div>`).join('');
    return `<div class="wk-card wd-card rf-well${picked ? ' on' : ''}${w.done ? ' done' : ''}">
      <div class="wk-top"><div class="wd-art"><img src="war/landmarks/sunken-temple-${WONDER_ART[Math.min(n, 3)]}.png" alt=""></div>
        <div class="wk-tt"><div class="wd-tier">Great wonder</div><div class="wk-name wd-name">${esc(w.name)}</div>${loc(w, WONDER.site)}
          <div class="wd-stage">${w.done ? 'Stands: every perk is yours this season' : `Stage ${n + 1} of ${stages.length} · <b>${esc(cur?.name ?? '')}</b>`}</div></div></div>
      <div class="wd-track">${track}</div>
      ${w.done ? '' : `<div class="wk-prog"><div class="rf-bar big"><i class="construction" style="width:${(p * 100).toFixed(1)}%"></i></div><b>${pct(p)}</b></div>${needs(w)}`}
      <div class="rf-sec">Top contributors <span class="rf-dim">${w.by.length} in all</span></div>
      ${top ? `<div class="wd-givers">${top}</div>` : '<div class="rf-dim">nobody has given yet: the first stone is yours</div>'}
      ${w.done || picked ? '' : `<div class="wk-foot"><span class="rf-dim wd-hint">every member's goods and men raise it</span><button class="rf-tbtn" data-act="pick" data-w="${w.id}">Contribute</button></div>`}
      ${picked ? giveRow(w) : ''}</div>`;
  };
  const won = list.filter((w) => w.stages), works = list.filter((w) => !w.stages);
  return `${won.map(wonder).join('')}${won.length ? `<div class="rf-sec">Works <span class="rf-dim">${works.filter((w) => w.done).length} of ${works.length} raised</span></div>` : ''}${works.map(one).join('')}`;
}

// ------------------------------------------------------------------ the titles

/** What the player's own stats say for each title (Warlord: not in the peace stats). */
const MINE: Record<string, keyof PeaceStats> = { merchantPrince: 'sold', masterBuilder: 'labourHours', warden: 'guardHours' };

/** The season standings: each title's emblem, holder and lead, and the player's own run at it. */
export function titlesHtml(t: TitleRow[], mine: PeaceStats | null, me: number | null): string {
  const row = (id: string) => {
    const d = TITLES[id], x = t.find((y) => y.id === id), mineV = mine && MINE[id] ? mine[MINE[id]] : null, held = !!x && x.pid === me;
    const you = mineV !== null && x && !held ? `<div class="ti-you">${bar('construction', mineV / Math.max(1e-9, x.value), 150)}<span class="rf-dim">you ${fmt(mineV)}</span></div>` : '';
    return `<div class="ti-row${held ? ' me' : ''}" data-tip="${attr(x ? titleTip(x) : `<b class="k">${d.name}</b> · unclaimed<br><span class="rf-dim tip-w">${d.how}</span>`)}">${medal(id, 34, held)}
      <div style="flex:1;min-width:0"><div class="ti-name">${d.name}</div><div class="ti-who">${x ? (held ? '<b style="color:var(--rf-gold)">You</b>' : esc(x.player)) : '<span class="rf-dim">unclaimed</span>'}</div>${you}</div>
      <div class="ti-v"><b class="rf-num">${x ? fmt(x.value) : '–'}</b><span class="rf-dim">${d.metric}</span></div></div>`;
  };
  const s = mine;
  return `${TITLE_ORDER.map(row).join('')}
    ${s ? `<div class="rf-sec">Your season</div><div class="tw-chips">
      <span class="rf-ichip" data-tip="coin sold at your stalls">${icon('res-coin')}${fmt(s.sold)}</span>
      <span class="rf-ichip" data-tip="contracts filled">${icon('trade-contract')}${s.contracts}</span>
      <span class="rf-ichip" data-tip="man-hours of labour">${glyph('ui:people', 18)}${fmt(s.labourHours)}</span>
      <span class="rf-ichip" data-tip="hours held on guard">${glyph('ui:shield', 18)}${fmt(s.guardHours)}</span></div>` : ''}`;
}

/** The roster's strip: one emblem and holder per title, the words in the tooltip. */
export const titlesStrip = (t: TitleRow[], me: number | null) => t.length
  ? `<div class="ti-strip">${t.map((x) => `<span class="ti-s${x.pid === me ? ' me' : ''}" data-tip="${attr(titleTip(x))}">${medal(x.id, 18, x.pid === me)}${esc(x.player)}</span>`).join('')}</div>` : '';
