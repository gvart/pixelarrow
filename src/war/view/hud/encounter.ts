/**
 * W-65 random encounters on the page (the runner: ../../sim/encounters.ts; the kinds: src/data/warEncounters.ts).
 *
 *  - one springs: a start banner with its lore, and it takes the tracked card (./quest.ts) for a while: its lore, goal,
 *    where and pay, a marker over the spot (or the town, the lair, the giver), buttons for a choice; when it ends or the
 *    moment passes the card goes back to what was tracked before;
 *  - who waits at the spot (a deserter, a merchant, pilgrims) is painted there from the existing sheets (no sim unit);
 *    a guided merchant walks behind your men; a place to reach (a mark of a trail, a captive) glows as a gold ring;
 *  - each step, choice, risk gone wrong and the end are banners with their rewards.
 *
 * Offline (a world entry, or ?encounter; ?encounter=<kind> springs that one at once, for tools) the page runs the
 * encounters and keeps the save in localStorage. Online the region server runs them (server/src/war/encounters.ts);
 * the page shows its `encounter` messages and sends a choice up.
 */
import { itemDef } from '../../../data/items';
import { ENCOUNTERS } from '../../../data/warEncounters';
import { storyOf } from '../../../data/warStories';
import { NEUTRAL_TEAM } from '../../sim/economy';
import { encSaveOk, encStepOf, EncounterRun, type EncNote, type EncSave, type EncStep } from '../../sim/encounters';
import type { StoryReward } from '../../sim/stories';
import type { ServerMsg } from '../../net/protocol';
import type { WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { ownCentre } from '../entry';
import { SPRITE_ZOOM } from '../units';
import { myTeam } from '../side';
import { questBanner, track, trackedNow, type Tracked, type TrackView } from './quest';

const KEY = (region: string) => `pa.war.enc.${region}`;
function load(key: string): EncSave | null {
  try {
    const o = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
    return encSaveOk(o, ENCOUNTERS) ? o : null;
  } catch { return null; }
}
const keep = (key: string, s: EncSave) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* storage blocked: forgotten */ } };

function rewardParts(r: StoryReward | undefined): { goods: Record<string, number>; more: string } {
  const more = [r?.item ? `${itemDef(r.item.def).name} (${r.item.rarity})` : '', r?.soul ? `${r.soul.name} joins: claim his soul` : ''].filter(Boolean).join(' · ');
  return { goods: { ...(r?.goods as Record<string, number> | undefined) }, more };
}
const WHERE: Record<string, string> = { here: 'Close by, where the marker points.', town: 'The nearest town.', lair: 'Where the eagles circle: a den still held.', giver: 'The village well.' };

export function mountEncounters(s: SandboxScene): void {
  const q = new URLSearchParams(location.search), online = s.sim.net;
  if (!online && !q.has('world') && !q.has('encounter')) return;
  const region = s.sim.region, team = myTeam(), key = KEY(region.id), story = storyOf(region.id);
  const payTo = online ? 'your home strongroom' : 'your stores';
  const trackKey = 'encounter';
  let save: EncSave | null = null, run: EncounterRun | null = null, prev: Tracked | null = null;
  const evs: WarEvent[] = [];

  // ---------------------------------------------------------------- banners and the card
  const pay = (r: StoryReward | undefined) => {
    const p = rewardParts(r), has = Object.keys(p.goods).length > 0;
    return { reward: p.goods, ...(p.more || has ? { pay: [p.more, has ? `Paid into ${payTo}` : ''].filter(Boolean).join(' · ') } : {}) };
  };
  const release = () => {
    if (trackedNow()?.key === trackKey) track(prev && prev.key !== trackKey ? prev : null);
    prev = null;
  };
  const tell = (notes: readonly EncNote[]) => {
    for (const n of notes) {
      const d = ENCOUNTERS[n.enc];
      if (!d) continue;
      if (n.kind === 'start') {
        questBanner({ kind: 'start', head: 'Encounter', title: d.title, text: d.lore });
        const t = trackedNow();
        if (t?.key !== trackKey) prev = t;
        track(tracker);
      } else if (n.kind === 'step') {
        if (n.step.includes('#')) {
          if (d.steps.find((x) => x.id === n.step.split('#')[0])?.trigger.kind === 'track') continue; // a mark: the card counts it
          questBanner({ kind: 'done', head: d.title, title: 'He follows your men', text: 'Lead him to the nearest town.' });
          continue;
        }
        const st = d.steps.find((x) => x.id === n.step)!;
        if (n.option && st.trigger.kind === 'choice') {
          const o = st.trigger.options.find((x) => x.id === n.option)!;
          if (n.risk) questBanner({ kind: 'start', head: 'It goes wrong', title: o.label, text: o.risk!.text });
          else questBanner({ kind: 'done', head: 'Your choice', title: o.label, text: o.text, ...pay(n.reward) });
        } else if (n.reward) questBanner({ kind: 'done', head: d.title, title: st.goal, ...pay(n.reward) });
      } else if (n.kind === 'end') {
        questBanner({ kind: 'done', head: 'Encounter over', title: d.title, text: d.end });
        release();
      } else {
        questBanner({ kind: 'done', head: 'The moment passes', title: d.title, text: 'You left it behind on the road.' });
        release();
      }
    }
  };

  const where = (st: EncStep): string => {
    const t = st.trigger;
    if (t.kind === 'choice') return 'Choose on this card.';
    if (t.kind === 'guide') return save?.open?.with ? 'The nearest town. He follows your men.' : 'Close by, where the marker points.';
    if (t.kind === 'clear') return 'Right here. Fight them off.';
    if (t.kind === 'track') return `Follow the marks where the marker points (${save?.open?.n ?? 0}/${t.marks} found).`;
    if (t.kind === 'rescue') return `Free ${t.name}: send a squad to claim his soul where the marker points.`;
    return WHERE[t.at ?? 'here'];
  };
  const tracker: Tracked = {
    key: trackKey,
    view: (): TrackView | null => {
      const sv = save, o = sv?.open, d = o && ENCOUNTERS[o.id], st = encStepOf(ENCOUNTERS, sv ?? null);
      if (!o || !d || !st) return null;
      const i = d.steps.indexOf(st), t = st.trigger, r = rewardParts(st.reward);
      return {
        kind: `Encounter · ${region.name}`, title: d.title, giver: d.figure ? d.figure.name : 'On the road',
        goal: st.goal, progress: `${i + 1}/${d.steps.length}`, frac: -1, where: where(st), reward: r.goods,
        pay: t.kind === 'choice' ? 'Each choice pays its own way' : [r.more, Object.keys(r.goods).length ? `Paid when done, into ${payTo}` : r.more ? '' : 'The road goes on'].filter(Boolean).join(' · '),
        at: t.kind === 'choice' ? { x: o.x, y: o.y } : { x: o.tx, y: o.ty }, label: st.label,
        story: i === 0 ? [d.lore, st.text] : [st.text],
        ...(t.kind === 'choice' ? { choices: t.options.map((x) => { const p = rewardParts(x.reward); return { id: x.id, label: x.label, text: [x.text, p.more, Object.entries(p.goods).map(([k, n]) => `+${n} ${k}`).join(', '), x.risk ? 'A risk' : ''].filter(Boolean).join(' · ') }; }) } : {}),
      };
    },
    act: (id) => {
      if (online) return s.sim.encounterChoose(id);
      const cur = s.sim.cur, notes = cur && run?.choose(cur, id);
      if (!notes) return;
      save = run!.save;
      keep(key, save);
      tell(notes);
    },
  };

  if (online) {
    s.sim.serverTaps.add((m: ServerMsg) => {
      if (m.t !== 'encounter' || !encSaveOk(m.save, ENCOUNTERS)) return;
      save = m.save;
      if (m.notes) tell(m.notes);
      else if (save.open && trackedNow()?.key !== trackKey) {
        prev = trackedNow();
        track(tracker); // an encounter still open when he came back
      }
    });
  } else {
    run = new EncounterRun(region, ENCOUNTERS, load(key), { team, seed: Number(q.get('seed')) || 1 }, {
      addLair: (d) => s.sim.addLair(d.kind, d.x, d.y, d.count),
      spawnSoul: (x, y, cls, level) => s.sim.spawnSoul(x, y, cls, level, 'lair'),
      give: (r, at, item) => {
        for (const [k, n] of Object.entries(r.goods ?? {})) s.sim.addStock(team, k as never, n!);
        if (item) s.sim.dropPile(at.x, at.y, [item]);
        if (r.soul) s.sim.spawnSoul(at.x + 1, at.y, r.soul.cls, r.soul.level, 'lair');
      },
    }, story);
    save = run.save;
    const prevEv = s.sim.onEvents;
    s.sim.onEvents = (ev: WarEvent[]) => { prevEv?.(ev); evs.push(...ev); }; // a rescue waits on a soul claimed
    if (save.open) {
      prev = trackedNow();
      track(tracker);
    }
  }

  // ---------------------------------------------------------------- who waits there, and the ground ring
  const imgs: Phaser.GameObjects.Image[] = [];
  const ring = s.add.graphics().setDepth(9.5);
  const draw = () => {
    const o = save?.open, d = o && ENCOUNTERS[o.id], st = encStepOf(ENCOUNTERS, save ?? null), cam = s.cameras.main;
    ring.clear();
    let shown = 0;
    if (o && d && st && d.figure && cam.zoom >= SPRITE_ZOOM && st.trigger.kind !== 'clear') {
      // at the spot; a guided man walks a little behind your men
      const me = o.with ? ownCentre(s.sim.cur, team) : null, base = me ? { x: me.x - 2, y: me.y + 2 } : { x: o.x, y: o.y };
      for (let i = 0; i < d.figure.count; i++) {
        const a = (i / Math.max(1, d.figure.count)) * Math.PI * 2, k = d.figure.count > 1 ? 1.2 : 0, x = base.x + Math.cos(a) * k, y = base.y + Math.sin(a) * k;
        const img = imgs[i] ?? (imgs[i] = s.add.image(0, 0, '__WHITE').setVisible(false));
        const fx = s.iso.sx(x, y), fy = s.iso.sy(x, y, s.iso.zDraw(x, y));
        const paint = (clip: string) => s.paintMan(img, d.figure!.cls, clip, s.time.now + i * 170, i % 2 ? 1 : -1, 1, fx, fy, 10 + s.depthAt(x, y) / 4096 + 0.25, NEUTRAL_TEAM);
        if ((o.with && paint('walk')) || paint('idle')) shown++;
        else img.setVisible(false);
      }
    }
    for (let i = shown; i < imgs.length; i++) imgs[i].setVisible(false);
    // a place to reach: a slow gold ring on the ground
    const k0 = st?.trigger.kind;
    if (!o || !st || (k0 !== 'reach' && k0 !== 'track' && k0 !== 'rescue' && !(k0 === 'guide' && !o.with))) return;
    const p = st.trigger.kind === 'guide' ? { x: o.x, y: o.y } : { x: o.tx, y: o.ty }, r = 4;
    const k = 0.55 + 0.35 * Math.sin(s.time.now / 380), cx = s.iso.sx(p.x, p.y), cy = s.iso.sy(p.x, p.y, s.iso.zDraw(p.x, p.y));
    ring.lineStyle(3, 0xffd257, k).strokeEllipse(cx, cy, r * 2 * 32 * 1.41, r * 2 * 16 * 1.41);
    ring.lineStyle(1, 0xfff1c2, k * 0.8).strokeEllipse(cx, cy, r * 1.2 * 32 * 1.41, r * 1.2 * 16 * 1.41);
  };
  s.events.on('update', draw);

  // ---------------------------------------------------------------- each tick (offline)
  if (!run) return;
  const force = q.get('encounter');
  let lastTick = -1, forced = !force || !ENCOUNTERS[force];
  const frame = () => {
    requestAnimationFrame(frame);
    const cur = s.sim.cur;
    if (!cur || cur.tick === lastTick) return;
    lastTick = cur.tick;
    let notes: EncNote[];
    if (!forced && ownCentre(cur, team) && !document.getElementById('rfLoad')) {
      forced = true;
      notes = run!.save.open ? [] : run!.fire(cur, ENCOUNTERS[force!]);
    } else notes = run!.tick(cur, evs.splice(0));
    save = run!.save;
    if (notes.length || run!.due) {
      run!.due = false;
      keep(key, save);
      tell(notes);
    }
  };
  requestAnimationFrame(frame);
}
