/**
 * W-62 the quest tracker of the guided first hour, one chain per path (W-170; rules and spots: ../../net/guide.ts; giver
 * and stories: ../../net/questLore.ts). Top left: the chain in a card, the open step in full (its goal, the key that does it,
 * reward and how far its target is), − folds it to the open step's one line (kept in localStorage; click the header to
 * unfold), × hides the guide for good. It gives way to a left panel (forge, market, roster, memorial). In the world a gold
 * marker floats over the open step's target, or sits on the screen's edge pointing at it when it is off screen; until the
 * build step a quieter one points at the home town. A step done pays its reward and tells it as a banner (./quest.ts), as
 * does the quest's start. The first fight points only at the guide's own small camp (W-171), never at a full lair.
 *
 * Offline the page runs the done checks, pays into his stores and keeps progress in localStorage (wrapped: a blocked
 * store just forgets). Online the region server does all three (server/src/war/guide.ts: the reward into his home
 * strongroom, the save in the region's storage); the tracker shows its `guide` messages and × sends `guide hide`.
 * ../main.ts arms the guide (setGuide) for a world entry into a home region before the HUD mounts.
 */
import type { ServerMsg } from '../../net/protocol';
import type { WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { doneNow, guideAbroad, guideExit, guideHand, guideOpen, guideSteps, watchEvents, watchFor, type GuideSave, type GuideSpots, type GuideStep, type GuideStepId, type GuideWatch } from '../../net/guide';
import { npcSpot } from '../../net/npcMarket';
import { storyOf } from '../../../data/warStories';
import { worldRegion } from '../../world/graph';
import { FAMILIES, mayHold } from '../../world/start';
import { ownCentre } from '../entry';
import { setGuideMark } from '../mapMarks';
import { myTeam } from '../side';
import { icon } from './kit';
import { chip, details, qcard } from './qcard';
import { ghostIcon } from './souls';
import { glyph } from './glyph';
import { sandboxRoster } from './roster/state';
import { fill, GUIDE_INTRO, GUIDE_LORE, guideGiver } from '../../net/questLore';
import { metres, placeMarker, questBanner, questMarker } from './quest';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

export interface GuideSetup {
  spots: GuideSpots;
  /** The home town's name (the edge marker). */
  town: string;
  /** Offline: the page runs the guide (checks, rewards, save); online the region server does. */
  offline: boolean;
}

let setup: GuideSetup | null = null;
/** The chain's last word: what comes after the first hour. */
const END = { warrior: 'Your men know their way now. Next, beyond your home: clear the lair guarding a claim banner, right-click the banner with your men and hold it, and you build there too.', builder: 'Your town has a roof and a trade. Now raise what your alliance needs: its works, its walls, its forts.', trader: 'You know the road now. Keep moving: buy where it is cheap, sell where it is scarce, and supply the war.' };
/** ../main.ts: the guide for this page (null: none, e.g. a scenario). */
export const setGuide = (g: GuideSetup | null) => void (setup = g);

const KEY = 'pa.war.guide';
export const guideKey = (pid: number | null) => (pid === null ? `${KEY}.offline` : `${KEY}.p${pid}`);
export function loadGuide(key: string): GuideSave | null {
  try {
    const o = JSON.parse(localStorage.getItem(key) ?? 'null') as GuideSave | null;
    return o?.v === 1 && Array.isArray(o.done) ? o : null;
  } catch { return null; }
}
const saveGuide = (key: string, g: GuideSave) => { try { localStorage.setItem(key, JSON.stringify(g)); } catch { /* storage blocked: progress is forgotten */ } };
export { guideOpen };

/** Each step's verb icon, and what its key chip acts on. */
const STEP_ICON: Record<GuideStepId, () => string> = {
  soul: () => icon('mk-claim'),
  gather: () => icon('act-gather'),
  lair: () => icon('act-attack'),
  build: () => icon('act-build'),
  house: () => icon('act-build'),
  access: () => icon('act-assign'),
  work: () => icon('act-build'),
  load: () => icon('act-load'),
  carry: () => icon('trade-wagon'),
  sell: () => icon('act-unload'),
  hire: () => icon('act-handoff'),
  next: () => icon('mk-claim'),
};
const STEP_ON: Record<GuideStepId, (fam: string) => string> = {
  soul: (cls) => ghostIcon(cls, 16),
  gather: () => icon('res-wood'),
  lair: () => icon('lair-bandit'),
  build: () => icon('bld-camp'),
  house: () => icon('bld-storehouse'),
  access: () => icon('bld-storehouse'),
  work: () => icon('node-engineer-master-builder'),
  load: () => icon('res-wood'),
  carry: () => icon('act-move'),
  sell: () => icon('res-coin'),
  hire: () => icon('res-coin'),
  next: () => icon('act-move'),
};
const TARGET: Record<GuideStepId, string> = { soul: 'Soul', gather: 'Wood', lair: 'Bandits', build: 'Camp', house: 'House', access: 'Your house', work: 'Workplace', load: 'Wood', carry: 'Road', sell: 'Town', hire: 'Town', next: 'Road' };

const CSS = `
#rfGuide{left:4px;top:4px;width:262px;pointer-events:auto;padding:5px 8px 7px}
#rfGuide .gd-h{display:flex;align-items:center;gap:6px;padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid var(--rf-rule);cursor:pointer}
#rfGuide .gd-h .rf-name{font-size:13px}
#rfGuide .gd-n{margin-left:auto;font:700 12px/1 Inter,sans-serif;color:var(--rf-gold)}
#rfGuide .gd-x,#rfGuide .gd-fold{width:18px;height:18px;min-width:18px;padding:0;font-size:12px}
#rfGuide .gd-cur{margin:0 -4px;padding:5px 4px;background:var(--rf-sunk);box-shadow:inset 2px 0 0 var(--rf-gold)}
#rfGuide .gd-next{display:flex;align-items:center;gap:6px;margin-top:5px;font:600 13px/1.3 Inter,sans-serif;color:var(--rf-muted)}
#rfGuide .gd-next .ic{width:18px;height:18px;opacity:.8}
#rfGuide.flash .gd-cur{animation:gdFlash .9s ease-out}
@keyframes gdFlash{0%{background:#3d2a12}100%{background:var(--rf-sunk)}}
`;

export function mountGuide(s: SandboxScene, mk: Mk): void {
  const g = setup;
  if (!g) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = mk('rfGuide', 'display:none');
  el.classList.add('rf-card');
  const mStep = questMarker('on'), mHome = questMarker('home');

  // who he is comes with his roster (online, a moment after the welcome); until then the tracker waits
  const R = sandboxRoster(s), team = myTeam(), giver = guideGiver(team), from = `${giver.name}, ${giver.title}`, payLine = 'Paid when done, sent home to your strongroom';
  const path = () => R.way.path, homeId = () => R.homeId ?? s.region.id;
  let watch: GuideWatch | null = null, steps: readonly GuideStep[] = [], town: Record<string, string> = {}, handAt: { x: number; y: number } | null = null, road: { x: number; y: number } | null = null;
  const lore = (id: GuideStepId) => ({ goal: fill(GUIDE_LORE[id].goal, town), key: GUIDE_LORE[id].key, story: fill(GUIDE_LORE[id].story, town), where: fill(GUIDE_LORE[id].where, town) });
  /** The chain, its words and its places, for his path, here. */
  const prepare = () => {
    const p = path(), here = s.region, abroad = p === 'trader' && here.id !== homeId();
    const hand = abroad ? null : guideHand(here.id, here, p), out = abroad ? null : p === 'trader' ? guideAbroad(here.id, here) : null;
    handAt = abroad ? guideExit(here.id, homeId(), here) : hand?.at ?? null;
    road = out?.exit ?? null;
    steps = handAt ? guideSteps(p) : guideSteps(p).filter((x) => x.id !== 'next');
    const home = worldRegion(homeId())?.name ?? g.town;
    town = { town: g.town, giver: (abroad ? storyOf(homeId(), p)?.giver.name : hand?.giver) ?? 'the storyteller', region: abroad ? home : hand?.region ?? 'the next region', abroad: abroad ? here.name : out?.name ?? 'the next land' };
    watch = watchFor(p, here, team, undefined, homeId(), g.spots.lair);
  };
  // offline: the save in localStorage (key set on the first snapshot); online: the server's latest `guide` message
  let key: string | null = null, save: GuideSave | null = null;

  /** A step done: told as a banner (its reward, how it was paid, the next step), the tracker flashes. */
  const told = (id: GuideStepId, paid: boolean) => {
    const st = steps.find((x) => x.id === id), nx = steps.find((x) => x.id !== id && !save?.done.includes(x.id));
    if (!st) return;
    questBanner({
      kind: 'done', head: nx ? 'Step done' : 'The First Hour is done', title: lore(id).goal, giver: from,
      ...(paid ? { reward: st.reward as Record<string, number>, pay: 'Sent home to your strongroom' } : { pay: 'Your army is full: no soul to claim, nothing paid' }),
      text: nx ? `Next: ${lore(nx.id).goal}.` : END[path() ?? 'warrior'],
    });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };
  const finish = (id: GuideStepId, paid: boolean) => {
    const st = steps.find((x) => x.id === id);
    if (!save || !st || save.done.includes(id)) return;
    save.done.push(id);
    saveGuide(key!, save);
    if (paid) for (const [r, n] of Object.entries(st.reward)) s.sim.addStock(team, r as never, n!);
    told(id, paid);
  };

  if (g.offline) {
    const prevEv = s.sim.onEvents;
    s.sim.onEvents = (ev: WarEvent[]) => { prevEv?.(ev); if (watch) watchEvents(watch, s.sim.cur, ev); };
  } else {
    // online the server keeps the guide: its message is the save; `step` just done (paid into his strongroom, unless
    // it closed unpaid: a soul step with a full army)
    const prevSrv = s.sim.onServer;
    s.sim.onServer = (m: ServerMsg) => {
      prevSrv?.(m);
      if (m.t !== 'guide') return;
      save = { v: 1, done: m.done as GuideStepId[], ...(m.hidden ? { hidden: true } : {}) };
      if (m.step) told(m.step as GuideStepId, !!m.paid);
    };
  }
  // folded: the header and the open step's line only (this browser's choice, online and offline)
  const MIN_KEY = `${KEY}.min`;
  let folded = (() => { try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; } })();
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.gd-x')) {
      if (!save) return;
      save.hidden = true;
      if (g.offline) saveGuide(key!, save);
      else s.sim.guideHide();
      return;
    }
    if (!t.closest('.gd-h')) return;
    folded = !folded;
    try { localStorage.setItem(MIN_KEY, folded ? '1' : '0'); } catch { /* storage blocked: folded for this visit */ }
    last = '';
  });

  /** The open step's target now (tile point), null: nothing to point at. */
  const target = (id: GuideStepId, me: { x: number; y: number }): { x: number; y: number } | null => {
    const cur = s.sim.cur;
    const near = <T extends { x: number; y: number }>(xs: readonly T[]) => xs.reduce<T | null>((a, p) => (!a || Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? p : a), null);
    const abroad = path() === 'trader' && s.region.id !== homeId();
    const stores = () => (cur?.buildings ?? []).filter((b) => b.team === team && b.state === 'done' && ['camp', 'storehouse', 'fort', 'warehouse'].includes(b.type));
    const nodes = () => s.sim.nodes.filter((n) => (n.res === 'wood' || n.res === 'stone') && n.amount > 0 && !n.guarded);
    const mine = (b: { owner?: string; pre?: true; team: number }) => b.team === team && !b.pre;
    switch (id) {
      // only a soul he may take (W-101: a stranger would refuse him); out of sight online, where the guide's own waits
      case 'soul': return near((cur?.souls ?? []).filter((q) => mayHold(R.way, q.cls))) ?? g.spots.soul;
      case 'gather': return near(nodes());
      // W-171 the guide's own small camp, where it stands; never the nearest lair, which is a full one
      case 'lair': return g.spots.lair;
      case 'build': case 'house': return g.spots.home;
      case 'access': return near((cur?.buildings ?? []).filter((b) => mine(b) && b.state === 'done')) ?? g.spots.home;
      case 'work': return near((cur?.buildings ?? []).filter((b) => mine(b) && b.state !== 'done')) ?? g.spots.home;
      // no goods yet: where to cut them; his men carrying: the store they load from
      case 'load': return (cur?.units ?? []).some((u) => u.carry && (u.load ?? 0) > 0) ? near(stores()) ?? near(nodes()) : near(nodes());
      case 'carry': case 'sell': case 'hire': return abroad ? npcSpot(s.region) : road;
      case 'next': return handAt;
    }
    return null;
  };

  const place = (m: HTMLElement, p: { x: number; y: number } | null, label: string) => placeMarker(s, m, p, label);

  /**
   * The bandit step's fight, once it starts (his men in combat): a notice with "Go there", so a fight that begins
   * off screen (the bandits came to his men, or his men walked into them) is found and watched.
   */
  let fought = false;
  const fightCue = (cur: NonNullable<typeof s.sim.cur>) => {
    if (fought) return;
    const own = new Set(cur.squads.filter((q) => q.team === team && !q.civ).map((q) => q.id));
    const men = cur.units.filter((u) => own.has(u.squad) && u.state !== 'dead' && (u.tag ?? 0) > 0);
    if (!men.length) return;
    fought = true;
    const x = men.reduce((a, u) => a + u.x, 0) / men.length, y = men.reduce((a, u) => a + u.y, 0) / men.length;
    sandboxRoster(s).onNote?.({ kind: 'info', icon: glyph('ui:swords', 18), text: 'Your men fight the bandits', act: { label: 'Go there', run: () => s.focus(x, y) } });
  };

  let last = '', shown = false, closing = false, announced = false;
  const frame = () => {
    requestAnimationFrame(frame);
    const cur = s.sim.cur;
    if (!cur) return;
    if (g.offline && !key) {
      key = guideKey(null);
      save = loadGuide(key) ?? { v: 1, done: [] };
    }
    if (!save || !R.known) return; // online: no word from the server yet (or no guide for him here)
    if (!watch) prepare();
    const list = steps, open = list.filter((st) => !save!.done.includes(st.id));
    if (g.offline) for (const id of doneNow(watch!, cur)) if (id !== 'hire' || save.done.includes('sell')) finish(id, true);
    const on = !save!.hidden && (open.length > 0 || shown);
    if (!on) {
      el.style.display = mStep.style.display = mHome.style.display = 'none';
      setGuideMark(null);
      return;
    }
    shown = true;
    el.style.display = '';
    const now = list.find((st) => !save!.done.includes(st.id)), me = ownCentre(cur, team) ?? g.spots.entry;
    const t = now ? target(now.id, me) : null, far = t ? Math.hypot(t.x - me.x, t.y - me.y) : 0;
    setGuideMark(t); // the minimap and the region map mark it too (../mapMarks.ts)
    // the label names what the step's goal names (the last step: its giver, met over the border)
    place(mStep, t, now ? `${now.id === 'build' ? g.town : now.id === 'next' ? town.giver : now.id === 'carry' ? town.abroad : TARGET[now.id]} · ${metres(far)}` : '');
    if (now?.id === 'lair') fightCue(cur);
    const towards = now && (now.id === 'soul' || now.id === 'gather' || now.id === 'lair') && path() !== 'trader';
    place(mHome, towards ? g.spots.home : null, `${g.town} · ${metres(Math.hypot(g.spots.home.x - me.x, g.spots.home.y - me.y))}`);
    // on screen the town speaks for itself; on the edge beside the step's marker it gives way
    const near = Math.hypot(parseFloat(mHome.style.left) - parseFloat(mStep.style.left), parseFloat(mHome.style.top) - parseFloat(mStep.style.top)) < 140;
    if (!mHome.classList.contains('edge') || (mStep.style.display !== 'none' && near)) mHome.style.display = 'none';
    const head = `<div class="gd-h" title="${folded ? 'Show the reward and the next step' : 'Fold to one line'}">${icon('mk-claim')}<span class="rf-name">The First Hour</span><span class="gd-n">${list.length - open.length}/${list.length}</span><button class="rf-tbtn gd-fold">${folded ? '+' : '−'}</button><button class="rf-tbtn x gd-x" title="Hide the guide for good">×</button></div>`;
    // the open step as a compact card (./qcard.ts): its verb, goal, the key that does it, the reward and the way; the
    // story, where in full, the giver and the pay behind (i) / hover. Folded: no reward and no next step.
    const card = (st: (typeof list)[number]) => {
      const l = lore(st.id);
      return qcard({
        key: `guide:${st.id}`, icon: STEP_ICON[st.id](), goal: l.goal,
        chips: chip.key(l.key, STEP_ON[st.id](R.way.family ? FAMILIES[R.way.family].start[0] : 'hoplite')) + (folded ? '' : chip.reward(st.reward as Record<string, number>)) + (t ? chip.dist(metres(far)) : ''),
        more: details({ story: l.story, lines: [['Where', l.where], ['Pay', payLine]], from: `Given by ${from}` }),
      });
    };
    const after = now ? list.filter((st) => st !== now && !save!.done.includes(st.id)) : [];
    const html = now
      ? `${head}<div class="gd-cur">${card(now)}</div>${folded || !after.length ? '' : `<div class="gd-next" title="${after.map((st) => lore(st.id).goal).join(', ')}">${STEP_ICON[after[0].id]()}<span>Then: ${lore(after[0].id).goal}</span></div>`}`
      : `${head}<div class="gd-cur">${qcard({ key: 'guide:end', icon: icon('mk-claim'), goal: path() === 'warrior' || !path() ? 'Claim ground beyond home' : path() === 'builder' ? 'Build what your alliance needs' : 'Keep your goods moving', more: details({ story: END[path() ?? 'warrior'] }) })}</div>`;
    if (!announced && now) {
      // the quest starts (or picks up again): who gives it and why
      announced = true;
      const fresh = save!.done.length === 0;
      questBanner({ kind: 'start', head: fresh ? 'New quest' : 'Quest continues', title: fresh ? 'The First Hour' : lore(now.id).goal, giver: from, text: fresh ? GUIDE_INTRO[path() ?? 'warrior'] : undefined, ...(fresh ? {} : { reward: now.reward as Record<string, number>, pay: payLine }) });
    }
    // the HUD layout stops it above the chat and the minimap (./layout.ts): a long step scrolls inside
    if (html !== last) el.innerHTML = last = html;
    if (!now && !closing && (closing = true)) setTimeout(() => { if (save) { save.hidden = true; if (key) saveGuide(key, save); } }, 12000);
  };
  requestAnimationFrame(frame);
}
